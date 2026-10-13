import "server-only";
import { timingSafeEqual } from "node:crypto";
import { ACCESS_DENIAL_MESSAGES, evaluateAccess } from "@/lib/domain/contracts";
import type { Notification, User } from "@/lib/domain/schema";
import { todayIn } from "@/lib/domain/time";
import { burnPasswordCheck, hashPassword, needsRehash, passwordProblems, verifyPassword } from "../auth/password";
import type { Principal } from "../auth/principal";
import { createSessionToken } from "../auth/session";
import { badRequest, conflict, forbidden, HttpError, tooMany } from "../http";
import { consume } from "../rate-limit";
import { getDb } from "../store";
import { audit, newId, normalizeUsername, nowIso, pushNotification, USERNAME_PATTERN } from "./common";

const GENERIC_LOGIN_ERROR = "Usuario o contraseña incorrectos.";
const LOCK_STEPS = [
  { failures: 15, minutes: 24 * 60 },
  { failures: 10, minutes: 60 },
  { failures: 5, minutes: 15 },
];

function lockMinutes(failures: number): number {
  return LOCK_STEPS.find((s) => failures >= s.failures)?.minutes ?? 0;
}

const BOOTSTRAP_SLOTS = ["ADMIN_BOOTSTRAP", "ADMIN_BOOTSTRAP_2", "ADMIN_BOOTSTRAP_3", "ADMIN_BOOTSTRAP_4", "ADMIN_BOOTSTRAP_5"];

/**
 * Admin accounts declared in the environment: username + scrypt hash (never the
 * password itself). Slot 1 is ADMIN_BOOTSTRAP_*, the others ADMIN_BOOTSTRAP_2_* … _5_*.
 */
export function bootstrapAdminConfigs(): Array<{ username: string; hash: string; name: string }> {
  return BOOTSTRAP_SLOTS.flatMap((prefix) => {
    const username = normalizeUsername(process.env[`${prefix}_USERNAME`] ?? "");
    const hash = process.env[`${prefix}_PASSWORD_HASH`]?.trim() ?? "";
    if (!username || !USERNAME_PATTERN.test(username) || !/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(hash)) return [];
    return [{ username, hash, name: process.env[`${prefix}_NAME`]?.trim() || username }];
  });
}

/**
 * Creates the environment-declared admin the first time someone signs in with
 * that username. The password is verified afterwards by the normal login, and
 * the person still accepts the data policy on first use. Remove the variables
 * once the account exists (like SETUP_KEY).
 */
export async function ensureBootstrapAdmin(username: string) {
  const cfg = bootstrapAdminConfigs().find((c) => c.username === username);
  if (!cfg) return;
  const db = getDb();
  const { users, settings } = await db.read(["users", "settings"]);
  if (users.items.some((u) => u.username === cfg.username) || settings.bootstrapAdmins.includes(cfg.username)) return;
  await db.transact(["users", "settings", "audit"], "Crea el administrador declarado en el entorno", ({ users: draft, settings: conf, audit: log }) => {
    if (draft.items.some((u) => u.username === cfg.username) || conf.bootstrapAdmins.includes(cfg.username)) return;
    conf.bootstrapAdmins.push(cfg.username);
    const now = nowIso();
    const user: User = {
      id: newId(),
      username: cfg.username,
      displayName: cfg.name,
      passwordHash: cfg.hash,
      kind: "admin",
      status: "active",
      phone: null,
      requestedPositionId: null,
      registrationNote: null,
      rejectionReason: null,
      consentAt: null,
      consentVersion: null,
      mustChangePassword: false,
      sessionVersion: 0,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: now,
      lastLoginAt: null,
    };
    draft.items.push(user);
    audit(log, { id: null, name: "Sistema" }, "admin_entorno_creado", user.id, cfg.username);
  });
}

export interface LoginResult {
  token: string;
  user: User;
}

export async function login(input: { username: string; password: string }, ip: string): Promise<LoginResult> {
  const username = normalizeUsername(input.username);

  // Throttle before hashing: scrypt is deliberately expensive (DoS vector).
  const byIp = consume(`login:ip:${ip}`, 30, 15 * 60_000);
  const byPair = consume(`login:pair:${ip}:${username}`, 8, 15 * 60_000);
  if (!byIp.ok || !byPair.ok) throw tooMany(Math.max(byIp.retryAfterSeconds, byPair.retryAfterSeconds));

  await ensureBootstrapAdmin(username);
  const db = getDb();
  const { users } = await db.read(["users"]);
  const user = users.items.find((u) => u.username === username);
  if (!user) {
    await burnPasswordCheck(input.password);
    throw new HttpError(401, GENERIC_LOGIN_ERROR, "invalid_credentials");
  }

  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    const minutes = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60_000);
    throw tooMany(minutes * 60, `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} min.`);
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    await db.transact(["users", "audit"], "Registra intento de acceso fallido", ({ users: draft, audit: log }) => {
      const target = draft.items.find((u) => u.id === user.id);
      if (!target) return;
      target.failedLogins += 1;
      const minutes = lockMinutes(target.failedLogins);
      if (minutes > 0 && target.failedLogins % 5 === 0) {
        target.lockedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
        audit(log, { id: null, name: null }, "cuenta_bloqueada", target.id, `${target.failedLogins} intentos fallidos; ${minutes} min`);
      }
    });
    throw new HttpError(401, GENERIC_LOGIN_ERROR, "invalid_credentials");
  }

  // Only after proving the password do we reveal the account's status.
  const { positions, settings } = await db.read(["positions", "settings"]);
  const access = evaluateAccess(user, positions.items, todayIn(settings.timezone));
  if (!access.ok) {
    const suffix = access.startDate ? ` Inicia el ${access.startDate}.` : "";
    throw new HttpError(403, ACCESS_DENIAL_MESSAGES[access.reason] + suffix, `access_${access.reason}`);
  }

  const rehash = needsRehash(user.passwordHash) ? await hashPassword(input.password) : null;
  const updated = await db.transact(["users"], "Inicio de sesión", ({ users: draft }) => {
    const target = draft.items.find((u) => u.id === user.id);
    if (!target) throw new HttpError(401, GENERIC_LOGIN_ERROR, "invalid_credentials");
    target.failedLogins = 0;
    target.lockedUntil = null;
    target.lastLoginAt = nowIso();
    if (rehash) target.passwordHash = rehash;
    return target;
  });

  return { token: await createSessionToken(updated.id, updated.sessionVersion), user: updated };
}

export interface RegisterInput {
  displayName: string;
  username: string;
  password: string;
  phone: string | null;
  requestedPositionId: string | null;
  note: string | null;
  accessCode: string | null;
  consent: boolean;
  website: string | null;
}

export async function register(input: RegisterInput, ip: string): Promise<{ notifications: Notification[] }> {
  // Honeypot: bots fill every field. Pretend success, store nothing.
  if (input.website) return { notifications: [] };

  const perIp = consume(`register:ip:${ip}`, 4, 60 * 60_000);
  const global = consume("register:global", 30, 60 * 60_000);
  if (!perIp.ok || !global.ok) throw tooMany(Math.max(perIp.retryAfterSeconds, global.retryAfterSeconds));

  if (!input.consent) {
    throw badRequest("Debes autorizar el tratamiento de tus datos personales para solicitar acceso.", "consent_required");
  }
  const username = normalizeUsername(input.username);
  if (!USERNAME_PATTERN.test(username)) {
    throw badRequest("Usuario inválido: 3 a 32 caracteres, letras minúsculas, números, punto, guion o guion bajo.");
  }
  const problem = passwordProblems(input.password, { username, displayName: input.displayName });
  if (problem) throw badRequest(problem, "weak_password");

  const db = getDb();
  const { settings, positions } = await db.read(["settings", "positions"]);
  if (!settings.registrationOpen) throw forbidden("El registro de nuevas cuentas está cerrado. Habla con el coordinador.", "registration_closed");
  if (settings.registrationCodeHash) {
    if (!input.accessCode || !(await verifyPassword(input.accessCode.trim(), settings.registrationCodeHash))) {
      throw forbidden("El código del taller no es correcto.", "bad_access_code");
    }
  }
  if (input.requestedPositionId && !positions.items.some((p) => p.id === input.requestedPositionId)) {
    throw badRequest("El puesto elegido no existe.");
  }

  const passwordHash = await hashPassword(input.password);
  const policyVersion = settings.legal.policyVersion;
  const positionTitle = positions.items.find((p) => p.id === input.requestedPositionId)?.title;

  return db.transact(["users", "notifications", "audit"], "Nueva solicitud de acceso", ({ users, notifications, audit: log }) => {
    if (users.items.some((u) => u.username === username)) {
      throw conflict("Ese usuario ya existe. Elige otro.", "username_taken");
    }
    const pending = users.items.filter((u) => u.status === "pending").length;
    if (pending >= settings.maxPendingRegistrations) {
      throw new HttpError(503, "Hay demasiadas solicitudes pendientes. Intenta más tarde o habla con el coordinador.", "too_many_pending");
    }
    const now = nowIso();
    const user: User = {
      id: newId(),
      username,
      displayName: input.displayName,
      passwordHash,
      kind: "staff",
      status: "pending",
      phone: input.phone,
      requestedPositionId: input.requestedPositionId,
      registrationNote: input.note,
      rejectionReason: null,
      consentAt: now,
      consentVersion: policyVersion,
      mustChangePassword: false,
      sessionVersion: 0,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: null,
      lastLoginAt: null,
    };
    users.items.push(user);
    const actor = { id: user.id, name: user.displayName };
    audit(log, actor, "registro_solicitado", user.id, positionTitle ?? null);
    const notification = pushNotification(notifications, actor, {
      audience: { kind: "admins" },
      type: "registration_pending",
      title: "Nueva solicitud de acceso",
      body: `${user.displayName} (@${username})${positionTitle ? ` pide acceso como ${positionTitle}` : " pide acceso"}. Revísala y apruébala o recházala.`,
      link: "/admin/equipo?tab=solicitudes",
      urgent: true,
    });
    return { notifications: [notification] };
  });
}

export async function changePassword(principal: Principal, input: { currentPassword: string; newPassword: string }) {
  const limit = consume(`password:${principal.user.id}`, 6, 15 * 60_000);
  if (!limit.ok) throw tooMany(limit.retryAfterSeconds);

  if (!(await verifyPassword(input.currentPassword, principal.user.passwordHash))) {
    throw badRequest("La contraseña actual no es correcta.", "bad_current_password");
  }
  if (input.currentPassword === input.newPassword) throw badRequest("La nueva contraseña debe ser distinta de la actual.");
  const problem = passwordProblems(input.newPassword, { username: principal.user.username });
  if (problem) throw badRequest(problem, "weak_password");

  const passwordHash = await hashPassword(input.newPassword);
  const updated = await getDb().transact(["users", "audit"], "Cambio de contraseña", ({ users, audit: log }) => {
    const user = users.items.find((u) => u.id === principal.user.id);
    if (!user) throw forbidden();
    user.passwordHash = passwordHash;
    user.mustChangePassword = false;
    user.sessionVersion += 1; // sign out every other device
    user.updatedAt = nowIso();
    audit(log, { id: user.id, name: user.displayName }, "contrasena_cambiada", user.id);
    return user;
  });
  return createSessionToken(updated.id, updated.sessionVersion);
}

export async function acceptConsent(principal: Principal) {
  await getDb().transact(["users", "audit", "settings"], "Autorización de tratamiento de datos", ({ users, audit: log, settings }) => {
    const user = users.items.find((u) => u.id === principal.user.id);
    if (!user) throw forbidden();
    user.consentAt = nowIso();
    user.consentVersion = settings.legal.policyVersion;
    user.updatedAt = user.consentAt;
    audit(log, { id: user.id, name: user.displayName }, "autorizacion_datos", user.id, settings.legal.policyVersion);
  });
}

export async function signOutEverywhere(principal: Principal) {
  await getDb().transact(["users"], "Cierre de sesión en todos los dispositivos", ({ users }) => {
    const user = users.items.find((u) => u.id === principal.user.id);
    if (user) user.sessionVersion += 1;
  });
}

/** Creates the first admin account. Requires SETUP_KEY and only works while no admin exists. */
export async function setupFirstAdmin(
  input: { setupKey: string; displayName: string; username: string; password: string },
  ip: string,
) {
  const limit = consume(`setup:${ip}`, 5, 60 * 60_000);
  if (!limit.ok) throw tooMany(limit.retryAfterSeconds);

  const expected = process.env.SETUP_KEY?.trim();
  if (!expected || expected.length < 16) throw forbidden("La configuración inicial está deshabilitada (falta SETUP_KEY).", "setup_disabled");
  const a = Buffer.from(input.setupKey.trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw forbidden("Clave de configuración incorrecta.", "bad_setup_key");

  const username = normalizeUsername(input.username);
  if (!USERNAME_PATTERN.test(username)) throw badRequest("Usuario inválido.");
  const problem = passwordProblems(input.password, { username });
  if (problem) throw badRequest(problem, "weak_password");
  const passwordHash = await hashPassword(input.password);

  return getDb().transact(["users", "audit", "settings"], "Crea el primer administrador", ({ users, audit: log, settings }) => {
    if (users.items.some((u) => u.kind === "admin")) throw forbidden("Ya existe un administrador.", "setup_done");
    if (users.items.some((u) => u.username === username)) throw conflict("Ese usuario ya existe.");
    const now = nowIso();
    const user: User = {
      id: newId(),
      username,
      displayName: input.displayName,
      passwordHash,
      kind: "admin",
      status: "active",
      phone: null,
      requestedPositionId: null,
      registrationNote: null,
      rejectionReason: null,
      consentAt: now,
      consentVersion: settings.legal.policyVersion,
      mustChangePassword: false,
      sessionVersion: 0,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: now,
      lastLoginAt: null,
    };
    users.items.push(user);
    audit(log, { id: user.id, name: user.displayName }, "admin_inicial_creado", user.id);
    return user;
  });
}

export async function setupStatus() {
  const { users } = await getDb().read(["users"]);
  return { needsSetup: bootstrapAdminConfigs().length === 0 && !users.items.some((u) => u.kind === "admin"), setupEnabled: Boolean(process.env.SETUP_KEY) };
}
