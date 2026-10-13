import "server-only";
import { randomBytes } from "node:crypto";
import { canAssignNewContract, contractStatus, isContractActive } from "@/lib/domain/contracts";
import type { Collection, Contract, Database, Notification, Position, User } from "@/lib/domain/schema";
import { isRealDate } from "@/lib/domain/time";
import { hashPassword, passwordProblems } from "../auth/password";
import type { Principal } from "../auth/principal";
import { badRequest, conflict, forbidden, notFound } from "../http";
import { getDb } from "../store";
import { actorOf, adminUserIds, audit, newId, normalizeUsername, nowIso, pushNotification, USERNAME_PATTERN } from "./common";

interface ContractTerms {
  startDate: string;
  endDate: string | null;
  notes: string | null;
}

function validateTerms(terms: ContractTerms) {
  if (!isRealDate(terms.startDate)) throw badRequest("Fecha de inicio inválida.");
  if (terms.endDate !== null) {
    if (!isRealDate(terms.endDate)) throw badRequest("Fecha de fin inválida.");
    if (terms.endDate < terms.startDate) throw badRequest("La fecha de fin no puede ser anterior a la de inicio.");
  }
}

function findPosition(positions: Collection<Position>, id: string): Position {
  const position = positions.items.find((p) => p.id === id);
  if (!position) throw notFound("Puesto no encontrado.");
  return position;
}

function findUser(users: Collection<User>, id: string): User {
  const user = users.items.find((u) => u.id === id);
  if (!user) throw notFound("Usuario no encontrado.");
  return user;
}

/** Contract (if any) that currently binds a user or will soon. */
function liveContractOf(userId: string, positions: Position[], today: string): Position | undefined {
  return positions.find((p) => {
    if (p.contract?.userId !== userId) return false;
    const status = contractStatus(p.contract, today);
    return isContractActive(status) || status === "programado";
  });
}

/** Moves the current contract (if any) to history so a new one can be set. */
function archiveContract(position: Position, reason: string | null) {
  if (!position.contract) return;
  const ended: Contract = {
    ...position.contract,
    endedAt: position.contract.endedAt ?? nowIso(),
    endedReason: position.contract.endedReason ?? reason,
  };
  position.contractHistory.push(ended);
  position.contract = null;
}

function ensureAdminRemains(users: User[], positions: Position[], today: string) {
  if (adminUserIds(users, positions, today).length === 0) {
    throw conflict("Debe quedar al menos un administrador activo.", "last_admin");
  }
}

type TeamDocs = Pick<Database, "users" | "positions" | "notifications" | "audit">;

function installContract(
  docs: TeamDocs,
  principal: Principal,
  position: Position,
  user: User,
  terms: ContractTerms,
): Notification {
  archiveContract(position, "reemplazado por un nuevo contrato");
  position.contract = {
    id: newId(),
    userId: user.id,
    personName: user.displayName,
    startDate: terms.startDate,
    endDate: terms.endDate,
    notes: terms.notes,
    createdBy: principal.user.id,
    createdAt: nowIso(),
    endedAt: null,
    endedReason: null,
  };
  position.updatedAt = nowIso();
  if (user.requestedPositionId === position.id) user.requestedPositionId = null;
  audit(
    docs.audit,
    actorOf(principal),
    "contrato_asignado",
    position.id,
    `${user.displayName} · ${terms.startDate} → ${terms.endDate ?? "indefinido"}`,
  );
  return pushNotification(docs.notifications, actorOf(principal), {
    audience: { kind: "user", userId: user.id },
    type: "contract_changed",
    title: `Asignado a ${position.title}`,
    body: `Tu contrato en ${position.title} va del ${terms.startDate} ${terms.endDate ? `al ${terms.endDate}` : "por tiempo indefinido"}.`,
    link: "/panel",
  });
}

export async function approveRegistration(
  principal: Principal,
  userId: string,
  input: { mode: "staff" | "admin"; positionId: string | null; replaceCurrent: boolean } & ContractTerms,
) {
  if (input.mode === "staff") validateTerms(input);
  return getDb().transact(["users", "positions", "notifications", "audit"], "Aprueba solicitud de acceso", (docs) => {
    const user = findUser(docs.users, userId);
    if (user.status !== "pending" && user.status !== "rejected") throw conflict("Esta solicitud ya fue atendida.");
    const today = principal.today;
    const notifications: Notification[] = [];

    if (input.mode === "admin") {
      user.kind = "admin";
    } else {
      if (!input.positionId) throw badRequest("Elige el puesto para esta persona.");
      const position = findPosition(docs.positions, input.positionId);
      if (!canAssignNewContract(position, today)) {
        if (!input.replaceCurrent) {
          throw conflict(`${position.title} ya tiene un contrato vigente (${position.contract?.personName}). Marca "reemplazar" para terminarlo.`, "position_taken");
        }
        endContractOn(docs, principal, position, "reemplazado al aprobar una solicitud");
      }
      notifications.push(installContract(docs, principal, position, user, input));
    }

    user.status = "active";
    user.rejectionReason = null;
    user.approvedBy = principal.user.id;
    user.approvedAt = nowIso();
    user.updatedAt = user.approvedAt;
    audit(docs.audit, actorOf(principal), "acceso_aprobado", user.id, input.mode === "admin" ? "administrador" : input.positionId);
    notifications.push(
      pushNotification(docs.notifications, actorOf(principal), {
        audience: { kind: "user", userId: user.id },
        type: "account_approved",
        title: "¡Acceso aprobado!",
        body: "Ya puedes entrar a la aplicación del taller.",
        link: "/panel",
      }),
    );
    return { notifications };
  });
}

export async function rejectRegistration(principal: Principal, userId: string, reason: string | null) {
  await getDb().transact(["users", "audit"], "Rechaza solicitud de acceso", ({ users, audit: log }) => {
    const user = findUser(users, userId);
    if (user.status !== "pending") throw conflict("Solo se pueden rechazar solicitudes pendientes.");
    user.status = "rejected";
    user.rejectionReason = reason;
    user.sessionVersion += 1;
    user.updatedAt = nowIso();
    audit(log, actorOf(principal), "acceso_rechazado", user.id, reason);
  });
}

/** Readable, unique-enough username for an operario record ("ana.perez.4f2a"). */
function operatorUsername(displayName: string): string {
  const base =
    displayName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "")
      .slice(0, 22) || "operario";
  return `${base}.${randomBytes(2).toString("hex")}`;
}

export async function createAccount(
  principal: Principal,
  input: {
    displayName: string;
    username: string;
    tempPassword: string;
    adminScope?: "total" | "gestion";
    phone: string | null;
    kind: "admin" | "staff";
    positionId: string | null;
    replaceCurrent: boolean;
  } & ContractTerms,
) {
  // Operarios don't sign in at S.M.I.: without credentials they get an unusable random password.
  const noLogin = input.kind === "staff" && !input.tempPassword;
  const username = input.username.trim() ? normalizeUsername(input.username) : noLogin ? operatorUsername(input.displayName) : "";
  const tempPassword = noLogin ? randomBytes(32).toString("base64url") : input.tempPassword;
  if (!USERNAME_PATTERN.test(username)) {
    throw badRequest("Usuario inválido: 3 a 32 caracteres, letras minúsculas, números, punto, guion o guion bajo.");
  }
  const problem = noLogin ? null : passwordProblems(tempPassword, { username });
  if (problem) throw badRequest(problem, "weak_password");
  if (input.kind === "staff") {
    if (!input.positionId) throw badRequest("Elige el puesto para esta persona.");
    validateTerms(input);
  }
  const passwordHash = await hashPassword(tempPassword);

  return getDb().transact(["users", "positions", "notifications", "audit"], "Crea una cuenta", (docs) => {
    if (docs.users.items.some((u) => u.username === username)) throw conflict("Ese usuario ya existe.", "username_taken");
    const now = nowIso();
    const user: User = {
      id: newId(),
      username,
      displayName: input.displayName,
      passwordHash,
      kind: input.kind,
      status: "active",
      phone: input.phone,
      requestedPositionId: null,
      registrationNote: null,
      rejectionReason: null,
      // The person accepts the data policy themselves on first login.
      consentAt: null,
      consentVersion: null,
      mustChangePassword: true,
      sessionVersion: 0,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
      approvedBy: principal.user.id,
      approvedAt: now,
      lastLoginAt: null,
      monthlySalary: null,
      transportAllowance: false,
      adminScope: input.kind === "admin" ? (input.adminScope ?? "total") : "total",
    };
    docs.users.items.push(user);
    audit(docs.audit, actorOf(principal), "cuenta_creada", user.id, input.kind);
    const notifications: Notification[] = [];
    if (input.kind === "staff" && input.positionId) {
      const position = findPosition(docs.positions, input.positionId);
      if (!canAssignNewContract(position, principal.today)) {
        if (!input.replaceCurrent) {
          throw conflict(`${position.title} ya tiene un contrato vigente (${position.contract?.personName}).`, "position_taken");
        }
        endContractOn(docs, principal, position, "reemplazado por una cuenta nueva");
      }
      notifications.push(installContract(docs, principal, position, user, input));
    }
    return { user, notifications };
  });
}

export async function assignContract(
  principal: Principal,
  positionId: string,
  input: { userId: string; replaceCurrent: boolean } & ContractTerms,
) {
  validateTerms(input);
  return getDb().transact(["users", "positions", "notifications", "audit"], "Asigna contrato", (docs) => {
    const position = findPosition(docs.positions, positionId);
    const user = findUser(docs.users, input.userId);
    if (user.kind !== "staff") throw badRequest("Las cuentas de administrador no ocupan puestos.");
    if (user.status === "pending" || user.status === "rejected") throw badRequest("Primero aprueba la solicitud de esta persona.");
    const other = liveContractOf(user.id, docs.positions.items, principal.today);
    if (other && other.id !== position.id) throw conflict(`${user.displayName} ya tiene contrato en ${other.title}.`);
    if (!canAssignNewContract(position, principal.today)) {
      if (!input.replaceCurrent) {
        throw conflict(`${position.title} ya tiene un contrato vigente (${position.contract?.personName}).`, "position_taken");
      }
      endContractOn(docs, principal, position, "reemplazado por un nuevo contrato");
    }
    if (user.status === "disabled") user.status = "active";
    const notification = installContract(docs, principal, position, user, input);
    ensureAdminRemains(docs.users.items, docs.positions.items, principal.today);
    return { notifications: [notification] };
  });
}

export async function updateContract(principal: Principal, positionId: string, input: ContractTerms) {
  validateTerms(input);
  await getDb().transact(["positions", "users", "audit"], "Actualiza contrato", ({ positions, users, audit: log }) => {
    const position = findPosition(positions, positionId);
    if (!position.contract || position.contract.endedAt) throw notFound("Este puesto no tiene contrato.");
    position.contract.startDate = input.startDate;
    position.contract.endDate = input.endDate;
    position.contract.notes = input.notes;
    position.updatedAt = nowIso();
    ensureAdminRemains(users.items, positions.items, principal.today);
    audit(log, actorOf(principal), "contrato_actualizado", position.id, `${input.startDate} → ${input.endDate ?? "indefinido"}`);
  });
}

function endContractOn(docs: TeamDocs, principal: Principal, position: Position, reason: string) {
  const contract = position.contract;
  if (!contract) return;
  const holder = docs.users.items.find((u) => u.id === contract.userId);
  if (holder) holder.sessionVersion += 1; // immediate sign-out
  archiveContract(position, reason);
  position.updatedAt = nowIso();
  audit(docs.audit, actorOf(principal), "contrato_terminado", position.id, `${contract.personName}: ${reason}`);
}

export async function endContract(principal: Principal, positionId: string, reason: string | null) {
  await getDb().transact(["users", "positions", "notifications", "audit"], "Termina contrato", (docs) => {
    const position = findPosition(docs.positions, positionId);
    if (!position.contract) throw notFound("Este puesto ya está vacante.");
    endContractOn(docs, principal, position, reason ?? "terminado por el administrador");
    ensureAdminRemains(docs.users.items, docs.positions.items, principal.today);
  });
}

export async function createPosition(principal: Principal, input: { title: string; area: string; grantsAdmin: boolean }) {
  return getDb().transact(["positions", "audit"], "Crea un puesto", ({ positions, audit: log }) => {
    const base = slugify(input.title) || "puesto";
    let id = base;
    for (let n = 2; positions.items.some((p) => p.id === id); n++) id = `${base}-${n}`;
    const now = nowIso();
    const position: Position = {
      id,
      title: input.title,
      area: input.area,
      grantsAdmin: input.grantsAdmin,
      order: Math.max(0, ...positions.items.map((p) => p.order)) + 1,
      contract: null,
      contractHistory: [],
      createdAt: now,
      updatedAt: now,
    };
    positions.items.push(position);
    audit(log, actorOf(principal), "puesto_creado", id, input.title);
    return position;
  });
}

export async function updatePosition(
  principal: Principal,
  positionId: string,
  input: { title?: string; area?: string; grantsAdmin?: boolean; order?: number },
) {
  await getDb().transact(["positions", "users", "audit"], "Actualiza un puesto", ({ positions, users, audit: log }) => {
    const position = findPosition(positions, positionId);
    if (input.title !== undefined) position.title = input.title;
    if (input.area !== undefined) position.area = input.area;
    if (input.grantsAdmin !== undefined && input.grantsAdmin !== position.grantsAdmin) {
      position.grantsAdmin = input.grantsAdmin;
      const holder = users.items.find((u) => u.id === position.contract?.userId);
      if (holder) holder.sessionVersion += 1; // permissions changed: re-login
    }
    if (input.order !== undefined) position.order = input.order;
    position.updatedAt = nowIso();
    ensureAdminRemains(users.items, positions.items, principal.today);
    audit(log, actorOf(principal), "puesto_actualizado", position.id, JSON.stringify(input));
  });
}

export async function deletePosition(principal: Principal, positionId: string) {
  await getDb().transact(["positions", "tasks", "audit"], "Elimina un puesto", ({ positions, tasks, audit: log }) => {
    const position = findPosition(positions, positionId);
    const status = contractStatus(position.contract, principal.today);
    if (isContractActive(status) || status === "programado") {
      throw conflict("Termina el contrato del puesto antes de eliminarlo.");
    }
    if (tasks.items.some((t) => t.positionId === positionId && t.status !== "completada")) {
      throw conflict("El puesto tiene tareas abiertas. Reasígnalas antes de eliminarlo.");
    }
    positions.items = positions.items.filter((p) => p.id !== positionId);
    audit(log, actorOf(principal), "puesto_eliminado", positionId, position.title);
  });
}

export async function updateUser(
  principal: Principal,
  userId: string,
  input: { displayName?: string; phone?: string | null; status?: "active" | "disabled"; unlock?: boolean },
) {
  await getDb().transact(["users", "positions", "audit"], "Actualiza una cuenta", ({ users, positions, audit: log }) => {
    const user = findUser(users, userId);
    if (input.status && user.id === principal.user.id) throw forbidden("No puedes desactivar tu propia cuenta.");
    if (input.status && (user.status === "pending" || user.status === "rejected")) {
      throw badRequest("Usa aprobar o rechazar para las solicitudes pendientes.");
    }
    if (input.displayName !== undefined) {
      user.displayName = input.displayName;
      for (const p of positions.items) if (p.contract?.userId === user.id) p.contract.personName = input.displayName;
    }
    if (input.phone !== undefined) user.phone = input.phone;
    if (input.status && input.status !== user.status) {
      user.status = input.status;
      if (input.status === "disabled") user.sessionVersion += 1;
    }
    if (input.unlock) {
      user.failedLogins = 0;
      user.lockedUntil = null;
    }
    user.updatedAt = nowIso();
    ensureAdminRemains(users.items, positions.items, principal.today);
    audit(log, actorOf(principal), "cuenta_actualizada", user.id, JSON.stringify({ ...input }));
  });
}

export async function resetPassword(principal: Principal, userId: string, tempPassword: string) {
  if (userId === principal.user.id) throw badRequest("Para tu propia cuenta usa “Cambiar contraseña” en tu perfil.");
  const { users } = await getDb().read(["users"]);
  const target = findUser(users, userId);
  const problem = passwordProblems(tempPassword, { username: target.username });
  if (problem) throw badRequest(problem, "weak_password");
  const passwordHash = await hashPassword(tempPassword);
  await getDb().transact(["users", "audit"], "Restablece contraseña", ({ users: draft, audit: log }) => {
    const user = findUser(draft, userId);
    user.passwordHash = passwordHash;
    user.mustChangePassword = true;
    user.sessionVersion += 1;
    user.failedLogins = 0;
    user.lockedUntil = null;
    user.updatedAt = nowIso();
    audit(log, actorOf(principal), "contrasena_restablecida", user.id);
  });
}

/** Deletes an account that holds no live contract (data minimisation, habeas data). */
export async function deleteUser(principal: Principal, userId: string) {
  await getDb().transact(["users", "positions", "push", "audit"], "Elimina una cuenta", ({ users, positions, push, audit: log }) => {
    const user = findUser(users, userId);
    if (user.id === principal.user.id) throw forbidden("No puedes eliminar tu propia cuenta.");
    if (liveContractOf(user.id, positions.items, principal.today)) {
      throw conflict("Termina el contrato de esta persona antes de eliminar su cuenta.");
    }
    users.items = users.items.filter((u) => u.id !== userId);
    push.items = push.items.filter((s) => s.userId !== userId);
    ensureAdminRemains(users.items, positions.items, principal.today);
    audit(log, actorOf(principal), "cuenta_eliminada", userId, `@${user.username}`);
  });
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
