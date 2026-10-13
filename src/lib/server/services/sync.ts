import "server-only";
import { createHash } from "node:crypto";
import { activeHolderId, contractStatus } from "@/lib/domain/contracts";
import type { Attachment, Database, Machine, Order, Position, Settings, Task } from "@/lib/domain/schema";
import { isLate } from "@/lib/domain/lifecycle";
import { addDays, daysBetween } from "@/lib/domain/time";
import type { AlertView, AttachmentView, OrderBrief, PositionView, ProductionPayload, PublicInfo, SettingsView, SyncPayload, UserView } from "@/lib/domain/views";

/** Delivered orders stay in the live payload this long; older ones load from the archive. */
const ORDER_WINDOW_DAYS = 120;
const QUOTE_WINDOW_DAYS = 90;
import type { Principal } from "../auth/principal";
import { isDemoMode, vapidConfig } from "../env";
import { getDb } from "../store";
import { bootstrapAdminConfigs } from "./auth";
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
    "machines",
    "orders",
    "attachments",
    ...(principal.isAdmin ? (["quotes", "clients", "ipc"] as const) : []),
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
  const tasks = docs.tasks.items
    .filter((t) => {
      const visible = isAdmin || (myPositionId !== null && t.positionId === myPositionId);
      if (!visible) return false;
      return t.status !== "completada" || (t.completedAt ?? "").slice(0, 10) >= recentCutoff;
    })
    .map((t) => ({ ...t, history: t.history.slice(-10) }));

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

  const production = buildProduction(principal, docs, tasks);
  const alerts = isAdmin
    ? [
        ...buildAlerts(docs.positions.items, users ?? [], openTasksByPosition, docs.requests.items, today),
        ...productionAlerts(docs.orders.items, docs.machines.items, docs.settings.timezone, now.getTime()),
      ]
    : [];

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
    production,
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

const strip = <T extends { history: unknown }>({ history: _h, ...rest }: T): Omit<T, "history"> => {
  void _h;
  return rest;
};

/** Live production data: admins get the working set, workers only what their tasks need. */
function buildProduction(
  principal: Principal,
  docs: Pick<Database, "settings" | "orders" | "machines" | "attachments"> & Partial<Pick<Database, "quotes" | "clients" | "ipc">>,
  tasks: Task[],
): ProductionPayload {
  const { schedule, skipHolidays } = docs.settings.production;
  const sorted = [...docs.machines.items].sort((a, b) => a.order - b.order);
  // Workers only need what identifies a machine; costs (hourly rate) and change logs stay with admins.
  const machines = principal.isAdmin ? sorted : sorted.map((m) => ({ ...m, hourlyRate: 0, history: [], stops: m.stops.filter((s) => !s.to) }));
  const base = { calendar: { schedule, skipHolidays }, machines };
  const viewOf = (a: Attachment): AttachmentView => {
    const { path: _p, ref: _r, ...rest } = a;
    void _p;
    void _r;
    return rest;
  };

  if (principal.isAdmin) {
    const cutoff = addDays(principal.today, -ORDER_WINDOW_DAYS);
    const orders = docs.orders.items
      .filter(
        (o) =>
          !["entregada", "cerrada", "cancelada"].includes(o.status) ||
          o.invoice.pending ||
          (o.deliveredAt ?? o.updatedAt).slice(0, 10) >= cutoff,
      )
      .map(strip);
    const quoteCutoff = addDays(principal.today, -QUOTE_WINDOW_DAYS);
    const quotes = (docs.quotes?.items ?? [])
      .filter((q) => q.status === "borrador" || q.status === "enviada" || (q.decidedAt ?? q.updatedAt).slice(0, 10) >= quoteCutoff)
      .map(strip);
    const visible = new Set([...orders.map((o) => o.id), ...quotes.map((q) => q.id)]);
    return {
      ...base,
      settings: docs.settings.production,
      orders,
      quotes,
      clients: (docs.clients?.items ?? []).map(strip),
      ipc: docs.ipc?.items ?? [],
      attachments: docs.attachments.items.filter((a) => (a.orderId && visible.has(a.orderId)) || (a.quoteId && visible.has(a.quoteId))).map(viewOf),
    };
  }

  const orderIds = new Set(tasks.map((t) => t.orderId).filter((id): id is string => Boolean(id)));
  const briefs: OrderBrief[] = docs.orders.items
    .filter((o) => orderIds.has(o.id))
    .map((o) => ({
      id: o.id,
      folio: o.folio,
      title: o.title,
      status: o.status,
      difficulty: o.difficulty,
      due: o.due,
      quantity: o.intake.quantity,
      drawingIds: o.drawingIds,
      photoIds: [...o.intakePhotoIds, ...o.photoIds],
    }));
  return {
    ...base,
    briefs,
    attachments: docs.attachments.items.filter((a) => a.orderId && orderIds.has(a.orderId)).map(viewOf),
  };
}

function productionAlerts(orders: Order[], machines: Machine[], timezone: string, now: number): AlertView[] {
  const alerts: AlertView[] = [];
  const toInvoice = orders.filter((o) => o.invoice.pending);
  if (toInvoice.length > 0) {
    alerts.push({
      id: "invoice",
      level: "critical",
      title: `FACTURAR: ${toInvoice.length} ${toInvoice.length === 1 ? "servicio cerrado" : "servicios cerrados"}`,
      body: toInvoice.slice(0, 4).map((o) => `${o.folio} ${o.clientName}`).join(" · "),
      link: "/admin/ordenes?vista=facturar",
    });
  }
  const overdue = orders.filter((o) => ["recibida", "en_proceso", "terminada", "garantia"].includes(o.status) && isLate(o, timezone, now));
  if (overdue.length > 0) {
    alerts.push({
      id: "overdue",
      level: "critical",
      title: `${overdue.length} ${overdue.length === 1 ? "orden vencida" : "órdenes vencidas"} sin entregar`,
      body: overdue.slice(0, 4).map((o) => `${o.folio} · ${o.clientName}`).join(" · "),
      link: "/admin/ordenes?vista=vencidas",
    });
  }
  const claims = orders.filter((o) => o.status === "garantia");
  if (claims.length > 0) {
    alerts.push({
      id: "claims",
      level: "warning",
      title: `${claims.length} ${claims.length === 1 ? "orden en garantía" : "órdenes en garantía"}`,
      body: claims.slice(0, 4).map((o) => o.folio).join(" · "),
      link: "/admin/ordenes?vista=garantia",
    });
  }
  for (const m of machines) {
    if (m.state !== "mantenimiento") continue;
    const stop = m.stops.find((s) => !s.to);
    alerts.push({
      id: `machine-${m.id}`,
      level: "warning",
      title: `${m.name} en mantenimiento`,
      body: stop?.reason ? `${stop.reason} · su capacidad no cuenta en la planeación.` : "Su capacidad no cuenta en la planeación.",
      link: "/admin/cola",
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
    needsSetup: bootstrapAdminConfigs().length === 0 && !users.items.some((u) => u.kind === "admin"),
  };
}
