import "server-only";
import { createHash } from "node:crypto";
import type { Announcement, FinanceSettings, LegalInfo, Notification, PayrollSettings, ProductionSettings } from "@/lib/domain/schema";
import { isValidTimeZone, isRealDate } from "@/lib/domain/time";
import { hashPassword } from "../auth/password";
import type { Principal } from "../auth/principal";
import { badRequest, notFound } from "../http";
import { getDb } from "../store";
import { actorOf, audit, newId, nowIso, pushNotification } from "./common";
import { isVisibleTo } from "./visibility";

export async function markNotificationsRead(principal: Principal, ids: string[] | "all") {
  await getDb().transact(["notifications"], "Marca avisos como leídos", ({ notifications }) => {
    const wanted = ids === "all" ? null : new Set(ids);
    for (const n of notifications.items) {
      if (wanted && !wanted.has(n.id)) continue;
      if (!isVisibleTo(n, principal)) continue;
      if (!n.readBy.includes(principal.user.id)) n.readBy.push(principal.user.id);
    }
  });
}

export async function createAnnouncement(
  principal: Principal,
  input: { text: string; level: "info" | "importante"; expiresAt: string | null },
) {
  if (input.expiresAt !== null && !isRealDate(input.expiresAt)) throw badRequest("Fecha de vencimiento inválida.");
  return getDb().transact(["announcements", "notifications", "audit"], "Publica un aviso", (docs) => {
    const announcement: Announcement = {
      id: newId(),
      text: input.text,
      level: input.level,
      createdBy: principal.user.id,
      authorName: principal.user.displayName,
      createdAt: nowIso(),
      expiresAt: input.expiresAt ? `${input.expiresAt}T23:59:59.000Z` : null,
    };
    docs.announcements.items.push(announcement);
    if (docs.announcements.items.length > 60) docs.announcements.items.splice(0, docs.announcements.items.length - 60);
    const notification = pushNotification(docs.notifications, actorOf(principal), {
      audience: { kind: "all" },
      type: "announcement",
      title: input.level === "importante" ? "Aviso importante" : "Nuevo aviso",
      body: input.text,
      link: "/panel",
      urgent: input.level === "importante",
    });
    audit(docs.audit, actorOf(principal), "aviso_publicado", announcement.id, input.text.slice(0, 80));
    return { announcement, notifications: [notification] as Notification[] };
  });
}

export async function deleteAnnouncement(principal: Principal, id: string) {
  await getDb().transact(["announcements", "audit"], "Retira un aviso", ({ announcements, audit: log }) => {
    if (!announcements.items.some((a) => a.id === id)) throw notFound("Aviso no encontrado.");
    announcements.items = announcements.items.filter((a) => a.id !== id);
    audit(log, actorOf(principal), "aviso_retirado", id);
  });
}

export interface SettingsPatch {
  workshopName?: string;
  timezone?: string;
  registrationOpen?: boolean;
  staffLogin?: boolean;
  /** "" clears the code; a value sets a new one. */
  registrationCode?: string;
  maxPendingRegistrations?: number;
  legal?: Partial<Omit<LegalInfo, "policyVersion">>;
  /** Publishes a new version of the legal texts: everyone re-accepts on next use. */
  publishPolicyVersion?: string;
  /** Calendar, tariffs and commercial defaults of the production module. */
  production?: Partial<Omit<ProductionSettings, "processRates">> & { processRates?: Partial<ProductionSettings["processRates"]> };
  /** Nómina: hourly divisor, surcharges, deductions and transport allowance. */
  payroll?: Partial<PayrollSettings>;
  /** Metas mensuales. */
  finance?: Partial<FinanceSettings>;
}

export async function updateSettings(principal: Principal, patch: SettingsPatch) {
  if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) throw badRequest("Zona horaria inválida.");
  if (patch.publishPolicyVersion !== undefined && !isRealDate(patch.publishPolicyVersion)) {
    throw badRequest("Versión de política inválida (usa la fecha AAAA-MM-DD).");
  }
  const codeHash =
    patch.registrationCode === undefined
      ? undefined
      : patch.registrationCode.trim() === ""
        ? null
        : await hashPassword(patch.registrationCode.trim());

  await getDb().transact(["settings", "audit"], "Actualiza la configuración", ({ settings, audit: log }) => {
    if (patch.workshopName !== undefined) settings.workshopName = patch.workshopName;
    if (patch.timezone !== undefined) settings.timezone = patch.timezone;
    if (patch.registrationOpen !== undefined) settings.registrationOpen = patch.registrationOpen;
    if (patch.staffLogin !== undefined) settings.staffLogin = patch.staffLogin;
    if (codeHash !== undefined) settings.registrationCodeHash = codeHash;
    if (patch.maxPendingRegistrations !== undefined) settings.maxPendingRegistrations = patch.maxPendingRegistrations;
    if (patch.legal) settings.legal = { ...settings.legal, ...patch.legal };
    if (patch.publishPolicyVersion !== undefined) settings.legal.policyVersion = patch.publishPolicyVersion;
    if (patch.production) {
      const { processRates, ...rest } = patch.production;
      settings.production = { ...settings.production, ...rest, processRates: { ...settings.production.processRates, ...processRates } };
      if (settings.production.schedule.every((day) => day.length === 0)) throw badRequest("El horario debe tener al menos un turno.");
    }
    if (patch.payroll) settings.payroll = { ...settings.payroll, ...patch.payroll };
    if (patch.finance) settings.finance = { ...settings.finance, ...patch.finance };
    settings.updatedAt = nowIso();
    const changed = Object.keys(patch).filter((k) => k !== "registrationCode");
    audit(log, actorOf(principal), "configuracion_actualizada", null, [...changed, ...(codeHash !== undefined ? ["codigo_registro"] : [])].join(", "));
  });
}

/** Only real push services: the server POSTs to this URL, so arbitrary hosts would be an SSRF hole. */
const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.api\.chrome\.google\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export async function savePushSubscription(
  principal: Principal,
  input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent: string | null },
) {
  if (!isAllowedPushEndpoint(input.endpoint)) throw badRequest("Servicio de notificaciones no soportado.");
  const id = createHash("sha256").update(input.endpoint).digest("hex").slice(0, 32);
  await getDb().transact(["push"], "Registra dispositivo para avisos", ({ push }) => {
    const existing = push.items.find((s) => s.id === id);
    // Re-synced on every app start: unchanged subscriptions must not cost a commit.
    if (existing && existing.userId === principal.user.id && existing.keys.p256dh === input.keys.p256dh && existing.keys.auth === input.keys.auth) return;
    // The same device may change hands: the newest login owns the subscription.
    push.items = push.items.filter((s) => s.id !== id);
    push.items.push({
      id,
      userId: principal.user.id,
      endpoint: input.endpoint,
      keys: input.keys,
      userAgent: input.userAgent,
      createdAt: nowIso(),
    });
    const mine = push.items.filter((s) => s.userId === principal.user.id);
    if (mine.length > 8) {
      const drop = new Set(mine.slice(0, mine.length - 8).map((s) => s.id));
      push.items = push.items.filter((s) => !drop.has(s.id));
    }
  });
}

export async function removePushSubscription(principal: Principal, endpoint: string) {
  await getDb().transact(["push"], "Quita dispositivo de avisos", ({ push }) => {
    push.items = push.items.filter((s) => !(s.endpoint === endpoint && s.userId === principal.user.id));
  });
}

/** Habeas data (Ley 1581 art. 8): the person can obtain every record about them. */
export async function exportMyData(principal: Principal) {
  const db = getDb();
  const [{ users, positions, tasks, requests, closures, push, attendance }, log] = await Promise.all([
    db.read(["users", "positions", "tasks", "requests", "closures", "push", "attendance"]),
    db.readLog("audit"),
  ]);
  const me = users.items.find((u) => u.id === principal.user.id);
  if (!me) throw notFound();
  const { passwordHash: _hash, ...profile } = me;
  void _hash;
  return {
    exportedAt: nowIso(),
    profile,
    contracts: positions.items.flatMap((p) =>
      [p.contract, ...p.contractHistory]
        .filter((c) => c?.userId === me.id)
        .map((c) => ({ position: p.title, ...c })),
    ),
    taskNotes: tasks.items.flatMap((t) => t.notes.filter((n) => n.authorId === me.id).map((n) => ({ folio: t.folio, ...n }))),
    tasksCompleted: tasks.items.filter((t) => t.completedBy === me.id).map((t) => ({ folio: t.folio, title: t.title, completedAt: t.completedAt })),
    requests: requests.items.filter((r) => r.userId === me.id),
    dayClosures: closures.items.filter((c) => c.userId === me.id),
    attendance: attendance.items.filter((e) => e.userId === me.id).map(({ history: _h, ...rest }) => {
      void _h;
      return rest;
    }),
    devices: push.items.filter((s) => s.userId === me.id).map((s) => ({ userAgent: s.userAgent, createdAt: s.createdAt })),
    activity: log.items.filter((a) => a.actorId === me.id || a.target === me.id),
  };
}
