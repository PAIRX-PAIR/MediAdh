import "server-only";
import { dueReminders, shouldAutoClose, type ReminderKind } from "@/lib/domain/lifecycle";
import type { Notification, Order } from "@/lib/domain/schema";
import { todayIn } from "@/lib/domain/time";
import { getDb } from "../store";
import { audit, pushNotification, type Actor } from "./common";
import { closeService } from "./orders";

const SYSTEM: Actor = { id: null, name: "Sistema" };
/** Opportunistic runs from /api/sync happen at most this often per server instance. */
const OPPORTUNISTIC_EVERY_MS = 5 * 60_000;

const REMINDER_TEXT: Record<ReminderKind, (o: Order) => { title: string; body: string; urgent: boolean }> = {
  before24h: (o) => ({
    title: `Mañana se entrega ${o.folio}`,
    body: `${o.title} · ${o.clientName} · ${o.due!.date} a las ${o.due!.time}`,
    urgent: false,
  }),
  dayOf: (o) => ({
    title: `HOY se entrega ${o.folio}`,
    body: `${o.title} · ${o.clientName} · a las ${o.due!.time}`,
    urgent: o.status !== "terminada",
  }),
  overdue: (o) => ({
    title: `VENCIDA: ${o.folio}`,
    body: `${o.title} · ${o.clientName}. La entrega era el ${o.due!.date} a las ${o.due!.time} y no se ha registrado.`,
    urgent: true,
  }),
};

export interface SchedulerResult {
  reminders: number;
  closed: number;
  notifications: Notification[];
}

/**
 * Idempotent housekeeping, run by Vercel Cron and opportunistically by sync:
 * delivery reminders (24 h before, the day, overdue) and automatic closing of
 * delivered services after the claim window, which turns on "FACTURAR".
 */
export async function runScheduler(now = Date.now()): Promise<SchedulerResult> {
  const db = getDb();
  const peek = await db.read(["orders", "settings"]);
  const tz = peek.settings.timezone;
  const today = todayIn(tz, new Date(now));
  const window = peek.settings.production.claimWindowDays;
  const due = peek.orders.items.some(
    (o) => dueReminders(o, tz, now, today).length > 0 || shouldAutoClose(o, window, now),
  );
  if (!due) return { reminders: 0, closed: 0, notifications: [] };

  return db.transact(["orders", "notifications", "audit", "settings"], "Recordatorios y cierres automáticos", (docs) => {
    const notifications: Notification[] = [];
    let reminders = 0;
    let closed = 0;
    for (const order of docs.orders.items) {
      for (const kind of dueReminders(order, tz, now, today)) {
        order.reminders[kind] = true;
        reminders += 1;
        const text = REMINDER_TEXT[kind](order);
        notifications.push(
          pushNotification(docs.notifications, SYSTEM, {
            audience: { kind: "admins" },
            type: kind === "overdue" ? "order_overdue" : kind === "dayOf" ? "order_due_today" : "order_due_soon",
            ...text,
            link: `/admin/ordenes?o=${order.id}`,
          }),
        );
        // People with pending steps on the order hear about the day and the delay too.
        if (kind !== "before24h") {
          const positions = new Set(order.workItems.filter((w) => w.status !== "completada" && w.positionId).map((w) => w.positionId!));
          for (const positionId of positions) {
            notifications.push(
              pushNotification(docs.notifications, SYSTEM, {
                audience: { kind: "position", positionId },
                type: kind === "overdue" ? "order_overdue" : "order_due_today",
                title: text.title,
                body: `${order.title} · tu parte sigue pendiente.`,
                link: "/tareas",
                urgent: text.urgent,
              }),
            );
          }
        }
      }
      if (shouldAutoClose(order, window, now)) {
        notifications.push(closeService(docs, order, SYSTEM, true));
        order.updatedAt = new Date(now).toISOString();
        closed += 1;
        audit(docs.audit, SYSTEM, "ot_cierre_automatico", order.folio);
      }
    }
    return { reminders, closed, notifications };
  });
}

const globalForScheduler = globalThis as unknown as { __smiSchedulerAt?: number; __smiSchedulerRun?: Promise<unknown> | null };

/** Runs the scheduler at most every few minutes on this instance; never throws. */
export async function maybeRunScheduler(): Promise<Notification[]> {
  const now = Date.now();
  if (globalForScheduler.__smiSchedulerRun) return [];
  if (globalForScheduler.__smiSchedulerAt && now - globalForScheduler.__smiSchedulerAt < OPPORTUNISTIC_EVERY_MS) return [];
  globalForScheduler.__smiSchedulerAt = now;
  const run = runScheduler(now);
  globalForScheduler.__smiSchedulerRun = run;
  try {
    return (await run).notifications;
  } catch (error) {
    console.warn("[smi] scheduler", (error as Error).message);
    // Retry within ~30 s instead of silencing reminders for the whole window.
    globalForScheduler.__smiSchedulerAt = now - OPPORTUNISTIC_EVERY_MS + 30_000;
    return [];
  } finally {
    globalForScheduler.__smiSchedulerRun = null;
  }
}
