import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { activeHolderId } from "@/lib/domain/contracts";
import type { Device } from "@/lib/domain/schema";
import { todayIn } from "@/lib/domain/time";
import type { Principal } from "../auth/principal";
import { isProduction } from "../env";
import { HttpError, badRequest, notFound } from "../http";
import { getDb } from "../store";
import { actorOf, audit, newId, nowIso } from "./common";
import { boardForOperator, type Board } from "./board";
import { createRequest } from "./work";
import type { RequestInput } from "./work";

/**
 * Acceso de operarios por QR. The phone asks for access and shows a short code
 * (as QR); a signed-in admin scans it and says who the operator is. The phone
 * keeps a random secret in an httpOnly cookie; only its hash is stored, so a
 * leaked data repository never grants access. Admins revoke a phone any time.
 */

export const DEVICE_COOKIE = isProduction ? "__Host-smi_device" : "smi_device";
const DEVICE_DAYS = 365;
const PENDING_MINUTES = 10;
/** No 0/O, 1/I/L: easy to read aloud or type. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

function newCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function shortLabel(userAgent: string | null): string {
  if (!userAgent) return "Celular";
  const os = /iPhone|iPad/.test(userAgent) ? "iPhone" : /Android/.test(userAgent) ? "Android" : /Windows/.test(userAgent) ? "Windows" : /Mac OS/.test(userAgent) ? "Mac" : "Navegador";
  const browser = /EdgA?\//.test(userAgent) ? "Edge" : /CriOS|Chrome\//.test(userAgent) ? "Chrome" : /FxiOS|Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "";
  return browser ? `${os} · ${browser}` : os;
}

async function readDeviceSecret(): Promise<string | null> {
  const store = await cookies();
  return store.get(DEVICE_COOKIE)?.value ?? null;
}

async function setDeviceCookie(secret: string) {
  const store = await cookies();
  store.set(DEVICE_COOKIE, secret, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: DEVICE_DAYS * 24 * 3600 });
}

export async function clearDeviceCookie() {
  const store = await cookies();
  store.set(DEVICE_COOKIE, "", { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/", maxAge: 0 });
}

/** Drops expired requests and long-revoked phones so the document stays small. */
function prune(items: Device[], now: number): Device[] {
  return items.filter((d) => {
    if (d.status === "pendiente") return Date.parse(d.expiresAt) > now - 86_400_000;
    if (d.status === "revocado") return Date.parse(d.revokedAt ?? d.createdAt) > now - 90 * 86_400_000;
    return true;
  });
}

export type DeviceState =
  | { status: "ninguno" }
  | { status: "pendiente"; code: string; expiresAt: string }
  | { status: "vencido" }
  | { status: "revocado" }
  | { status: "aprobado"; operator: string };

/** This phone's record and state, from one read of devices and users. */
async function resolveDevice(): Promise<{ device: Device | null; state: DeviceState }> {
  const secret = await readDeviceSecret();
  if (!secret) return { device: null, state: { status: "ninguno" } };
  const { devices, users } = await getDb().read(["devices", "users"]);
  const hash = hashSecret(secret);
  const device = devices.items.find((d) => d.secretHash === hash) ?? null;
  if (!device) return { device, state: { status: "ninguno" } };
  if (device.status === "revocado") return { device, state: { status: "revocado" } };
  if (device.status === "aprobado") {
    const user = users.items.find((u) => u.id === device.userId);
    if (!user || user.status !== "active") return { device, state: { status: "revocado" } };
    return { device, state: { status: "aprobado", operator: user.displayName } };
  }
  if (Date.parse(device.expiresAt) <= Date.now()) return { device, state: { status: "vencido" } };
  return { device, state: { status: "pendiente", code: device.code, expiresAt: device.expiresAt } };
}

export async function deviceState(): Promise<DeviceState> {
  return (await resolveDevice()).state;
}

/** The phone asks for access: a new pending request (or the current one while it is still valid). */
export async function requestDevice(userAgent: string | null): Promise<DeviceState> {
  const state = await deviceState();
  if (state.status === "aprobado" || state.status === "pendiente") return state;
  const secret = randomBytes(32).toString("base64url");
  const device = await getDb().transact(["devices"], "Un celular pide acceso", ({ devices }) => {
    const now = Date.now();
    devices.items = prune(devices.items, now);
    let code = newCode();
    while (devices.items.some((d) => d.status === "pendiente" && d.code === code)) code = newCode();
    const entry: Device = {
      id: newId(),
      code,
      secretHash: hashSecret(secret),
      status: "pendiente",
      userId: null,
      label: shortLabel(userAgent),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + PENDING_MINUTES * 60_000).toISOString(),
      approvedBy: null,
      approvedAt: null,
      revokedAt: null,
    };
    devices.items.push(entry);
    return entry;
  });
  await setDeviceCookie(secret);
  return { status: "pendiente", code: device.code, expiresAt: device.expiresAt };
}

/** Board of the operator this phone belongs to. */
export async function deviceBoard(): Promise<Board> {
  const { device, state } = await resolveDevice();
  if (state.status !== "aprobado" || !device?.userId) throw new HttpError(403, "Este celular no tiene acceso. Pide acceso de nuevo.", "device_not_approved");
  return boardForOperator(device.userId);
}

/** "Salir" on the phone: forgets the device here and revokes it. */
export async function forgetDevice() {
  const { device } = await resolveDevice();
  if (device) {
    await getDb().transact(["devices"], "Un celular deja de usar el tablero", ({ devices }) => {
      const d = devices.items.find((x) => x.id === device.id);
      if (d && d.status !== "revocado") {
        d.status = "revocado";
        d.revokedAt = nowIso();
      }
    });
  }
  await clearDeviceCookie();
}

/** Operators that can receive a phone: people holding a non-admin position today. */
function operatorsOf(docs: { users: { items: Array<{ id: string; displayName: string; status: string }> }; positions: { items: Parameters<typeof activeHolderId>[0][] } }, today: string) {
  return docs.positions.items
    .filter((p) => !p.grantsAdmin)
    .map((p) => ({ position: p, holder: activeHolderId(p, today) }))
    .filter((x): x is { position: (typeof x)["position"]; holder: string } => Boolean(x.holder))
    .map(({ position, holder }) => ({ userId: holder, name: docs.users.items.find((u) => u.id === holder)?.displayName ?? "?", positionTitle: position.title }));
}

export async function approveDevice(principal: Principal, rawCode: string, userId: string) {
  const code = normalizeCode(rawCode);
  if (code.length !== 8) throw badRequest("El código tiene 8 letras o números.");
  return getDb().transact(["devices", "users", "positions", "audit"], "Autoriza el celular de un operario", (docs) => {
    const device = docs.devices.items.find((d) => d.status === "pendiente" && d.code === code);
    if (!device) throw notFound("No hay una solicitud con ese código. Pide al operario que genere otro.");
    if (Date.parse(device.expiresAt) <= Date.now()) throw new HttpError(410, "El código venció. Pide al operario que genere otro.", "device_code_expired");
    const operator = operatorsOf(docs, principal.today).find((o) => o.userId === userId);
    if (!operator) throw badRequest("Esa persona no tiene un puesto de operario vigente.");
    device.status = "aprobado";
    device.userId = userId;
    device.approvedBy = principal.user.id;
    device.approvedAt = nowIso();
    audit(docs.audit, actorOf(principal), "celular_autorizado", userId, `${operator.name} · ${device.label}`);
    return { id: device.id, operator: operator.name };
  });
}

export async function listDevices() {
  const { devices, users, positions, settings } = await getDb().read(["devices", "users", "positions", "settings"]);
  const now = Date.now();
  const nameOf = (id: string | null) => (id ? (users.items.find((u) => u.id === id)?.displayName ?? "?") : null);
  return {
    operators: operatorsOf({ users, positions }, todayIn(settings.timezone)),
    devices: devices.items
      .filter((d) => d.status === "aprobado" || (d.status === "pendiente" && Date.parse(d.expiresAt) > now))
      .map((d) => ({
        id: d.id,
        status: d.status,
        code: d.status === "pendiente" ? d.code : null,
        label: d.label,
        operator: nameOf(d.userId),
        approvedBy: nameOf(d.approvedBy),
        approvedAt: d.approvedAt,
        createdAt: d.createdAt,
      }))
      .sort((a, b) => (a.approvedAt ?? a.createdAt).localeCompare(b.approvedAt ?? b.createdAt) * -1),
  };
}

export async function revokeDevice(principal: Principal, id: string) {
  await getDb().transact(["devices", "audit"], "Quita el acceso de un celular", ({ devices, audit: log }) => {
    const device = devices.items.find((d) => d.id === id);
    if (!device) throw notFound();
    device.status = "revocado";
    device.revokedAt = nowIso();
    audit(log, actorOf(principal), "celular_revocado", device.userId, device.label);
  });
}

/**
 * Pedido de material desde el celular autorizado: se registra a nombre de la
 * persona del celular y aparece en Pedidos, igual que los que hace en la app.
 */
export async function deviceRequest(input: RequestInput) {
  const { device, state } = await resolveDevice();
  if (state.status !== "aprobado" || !device?.userId) throw new HttpError(403, "Este celular no tiene acceso. Pide acceso de nuevo.", "device_not_approved");
  const { users, positions, settings } = await getDb().read(["users", "positions", "settings"]);
  const user = users.items.find((u) => u.id === device.userId);
  if (!user) throw notFound();
  const today = todayIn(settings.timezone);
  const position = positions.items.find((p) => activeHolderId(p, today) === user.id) ?? null;
  // Minimal principal for the shared request service: the phone acts as its operator, nothing else.
  const principal = {
    user,
    position,
    isAdmin: false,
    scope: null,
    settings,
    today,
    claims: { sub: user.id, sv: user.sessionVersion, iat: 0, exp: 0 },
    incomplete: false,
  } as unknown as Principal;
  return createRequest(principal, input);
}
