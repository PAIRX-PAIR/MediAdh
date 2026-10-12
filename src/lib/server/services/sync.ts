import "server-only";
import { createHash } from "node:crypto";
import { activeHolderId, contractStatus } from "@/lib/domain/contracts";
import type { Position, Settings } from "@/lib/domain/schema";
import { addDays, daysBetween } from "@/lib/domain/time";
import type { AlertView, PositionView, PublicInfo, SettingsView, SyncPayload, UserView } from "@/lib/domain/views";
import type { Principal } from "../auth/principal";
import { isDemoMode, vapidConfig } from "../env";
import { getDb } from "../store";
import { DEMO_CREDENTIALS } from "./demo";
import { isVisibleTo } from "./visibility";

function settingsView(settings: Settings): SettingsView {
  return {
    workshopName: settings.workshopName,
    timezone: settings.timezone,
    registrationOpen: settings.registrationOpen,
    hasRegistrationCode: Boolean(settings.registrationCodeHash),
    maxPendingRegistrations: settings.maxPendingRegistrations,
    legal: settings.legal,
  };
}

/** Everything the signed-in user may see, in one response (data is small). */
export async function buildSync(principal: Principal): Promise<SyncPayload> {
  const db = getDb();
  const docs = await db.read([
    "settings",
    "users",
    "positions",
    "tasks",
    "requests",
    "notifications",
    "announcements",
    "closures",
    "push",
  ]);
  const { today, isAdmin, user } = principal;
  const now = new Date();
  const nowIso = now.toISOString();

  const openTasksByPosition = new Map<string, number>();
  for (const t of docs.tasks.items) {
    if (t.status !== "completada" && t.positionId) {
      openTasksByPosition.set(t.positionId, (openTasksByPosition.get(t.positionId) ?? 0) + 1);
    }
  }

  const positions: PositionView[] = [...docs.positions.items]
    .sort((a, b) => a.order - b.order)
    .map((p) => {
      const status = contractStatus(p.contract, today);
      const holderId = activeHolderId(p, today);
      const view: PositionView = {
        id: p.id,
        title: p.title,
        area: p.area,
        grantsAdmin: p.grantsAdmin,
        order: p.order,
        status,
        holder: holderId && p.contract ? { userId: holderId, name: p.contract.personName } : null,
        openTasks: openTasksByPosition.get(p.id) ?? 0,
      };
      if (isAdmin) {
        view.contract = p.contract
          ? { ...p.contract, daysLeft: p.contract.endDate ? daysBetween(today, p.contract.endDate) : null }
          : null;
        view.history = p.contractHistory.slice(-20);
      }
      return view;
    });

  const myPositionId = principal.position?.id ?? null;
  const recentCutoff = addDays(today, isAdmin ? -30 : -7);
  const tasks = docs.tasks.items.filter((t) => {
    const visible = isAdmin || (myPositionId !== null && t.positionId === myPositionId);
    if (!visible) return false;
    return t.status !== "completada" || (t.completedAt ?? "").slice(0, 10) >= recentCutoff;
  });

  const requestCutoff = addDays(today, isAdmin ? -60 : -30);
  const requests = docs.requests.items.filter((r) => {
    const visible = isAdmin || r.userId === user.id;
    if (!visible) return false;
    return r.status === "pendiente" || r.status === "en_camino" || r.updatedAt.slice(0, 10) >= requestCutoff;
  });

  const visibleNotifications = docs.notifications.items.filter((n) => isVisibleTo(n, principal));
  const notifications = visibleNotifications
    .slice(-80)
    .reverse()
    .map(({ readBy, audience: _audience, ...n }) => {
      void _audience;
      return { ...n, read: readBy.includes(user.id) };
    });
  const unread = visibleNotifications.filter((n) => !n.readBy.includes(user.id)).length;

  const announcements = docs.announcements.items
    .filter((a) => !a.expiresAt || a.expiresAt >= nowIso)
    .slice(-20)
    .reverse();

  const closureCutoff = addDays(today, isAdmin ? -45 : -14);
  const closures = docs.closures.items
    .filter((c) => (isAdmin || c.userId === user.id) && c.date >= closureCutoff)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const devicesByUser = new Map<string, number>();
  for (const s of docs.push.items) devicesByUser.set(s.userId, (devicesByUser.get(s.userId) ?? 0) + 1);

  let users: UserView[] | undefined;
  if (isAdmin) {
    users = docs.users.items.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      kind: u.kind,
      status: u.status,
      phone: u.phone,
      requestedPositionId: u.requestedPositionId,
      registrationNote: u.registrationNote,
      rejectionReason: u.rejectionReason,
      consentAt: u.consentAt,
      mustChangePassword: u.mustChangePassword,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      lockedUntil: u.lockedUntil && u.lockedUntil > nowIso ? u.lockedUntil : null,
      failedLogins: u.failedLogins,
      positionId: docs.positions.items.find((p) => activeHolderId(p, today) === u.id)?.id ?? null,
      pushDevices: devicesByUser.get(u.id) ?? 0,
    }));
  }

  const alerts = isAdmin ? buildAlerts(docs.positions.items, users ?? [], openTasksByPosition, docs.requests.items, today) : [];

  const vapid = vapidConfig();
  const position = principal.position;
  const payload: Omit<SyncPayload, "version"> = {
    serverTime: nowIso,
    today,
    demo: isDemoMode(),
    backend: db.backend,
    me: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      kind: user.kind,
      isAdmin,
      phone: user.phone,
      mustChangePassword: user.mustChangePassword,
      needsConsent: user.consentVersion !== principal.settings.legal.policyVersion,
      positionId: position?.id ?? null,
      positionTitle: position?.title ?? null,
      area: position?.area ?? null,
      contractEndDate: position?.contract?.endDate ?? null,
      contractStatus: position ? contractStatus(position.contract, today) : null,
    },
    settings: settingsView(docs.settings),
    positions,
    tasks,
    requests,
    notifications,
    unread,
    announcements,
    closures,
    users,
    alerts,
    push: { configured: Boolean(vapid), publicKey: vapid?.publicKey ?? null, devices: devicesByUser.get(user.id) ?? 0 },
  };
  // Content version (ignores the clock) so unchanged polls can be answered with 304.
  const { serverTime: _t, ...stable } = payload;
  void _t;
  const version = createHash("sha256").update(JSON.stringify(stable)).digest("base64url").slice(0, 27);
  return { version, ...payload };
}

function buildAlerts(
  positions: Position[],
  users: UserView[],
  openTasks: Map<string, number>,
  requests: Array<{ status: string; urgent: boolean }>,
  today: string,
): AlertView[] {
  const alerts: AlertView[] = [];
  const pending = users.filter((u) => u.status === "pending").length;
  if (pending > 0) {
    alerts.push({
      id: "registrations",
      level: "warning",
      title: `${pending} ${pending === 1 ? "solicitud de acceso" : "solicitudes de acceso"} por revisar`,
      body: "Aprueba o rechaza a las personas que pidieron entrar.",
      link: "/admin/equipo?tab=solicitudes",
    });
  }
  for (const p of positions) {
    const status = contractStatus(p.contract, today);
    if (status === "por_vencer" && p.contract?.endDate) {
      const days = daysBetween(today, p.contract.endDate);
      alerts.push({
        id: `expiring-${p.id}`,
        level: days <= 2 ? "critical" : "warning",
        title: `Contrato de ${p.contract.personName} vence ${days === 0 ? "hoy" : `en ${days} ${days === 1 ? "día" : "días"}`}`,
        body: `${p.title} quedará vacante el ${addDays(p.contract.endDate, 1)} si no se renueva.`,
        link: `/admin/equipo?puesto=${p.id}`,
      });
    }
    if ((status === "vacante" || status === "vencido" || status === "terminado") && (openTasks.get(p.id) ?? 0) > 0) {
      alerts.push({
        id: `vacant-${p.id}`,
        level: "critical",
        title: `${p.title} sin titular con ${openTasks.get(p.id)} tareas abiertas`,
        body: "Registra un nuevo contrato o reasigna las tareas.",
        link: `/admin/equipo?puesto=${p.id}`,
      });
    }
  }
  const urgent = requests.filter((r) => r.urgent && r.status === "pendiente").length;
  if (urgent > 0) {
    alerts.push({
      id: "urgent-requests",
      level: "critical",
      title: `${urgent} ${urgent === 1 ? "solicitud urgente" : "solicitudes urgentes"} sin atender`,
      body: "Material o herramienta que detiene el trabajo.",
      link: "/admin/solicitudes",
    });
  }
  return alerts;
}

export async function buildPublicInfo(): Promise<PublicInfo> {
  const { settings, positions, users } = await getDb().read(["settings", "positions", "users"]);
  return {
    workshopName: settings.workshopName,
    registrationOpen: settings.registrationOpen,
    requiresAccessCode: Boolean(settings.registrationCodeHash),
    positions: [...positions.items].sort((a, b) => a.order - b.order).map((p) => ({ id: p.id, title: p.title, area: p.area })),
    legal: settings.legal,
    demo: isDemoMode() ? DEMO_CREDENTIALS : null,
    needsSetup: !users.items.some((u) => u.kind === "admin"),
  };
}
