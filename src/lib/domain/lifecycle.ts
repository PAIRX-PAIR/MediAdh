import { dueInstant } from "./planning";
import type { Order, OrderStatus, WorkItem } from "./schema";
import { addDays, dateInZone } from "./time";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  recibida: "Recibida",
  en_proceso: "En proceso",
  terminada: "Lista para entregar",
  entregada: "Entregada",
  cerrada: "Cerrada",
  garantia: "En garantía",
  cancelada: "Cancelada",
};

/** Statuses from which the work is no longer in the workshop's hands. */
export const DELIVERED_STATUSES: OrderStatus[] = ["entregada", "cerrada"];

/** Legal next statuses (manual changes from the console). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  recibida: ["en_proceso", "terminada", "cancelada"],
  en_proceso: ["recibida", "terminada", "cancelada"],
  terminada: ["en_proceso", "entregada", "cancelada"],
  entregada: ["cerrada", "garantia"],
  cerrada: ["garantia"],
  garantia: ["en_proceso", "terminada", "entregada"],
  cancelada: ["recibida"],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return from === to || ORDER_TRANSITIONS[from].includes(to);
}

/**
 * Status implied by the work items: all done → terminada, any started → en_proceso.
 * Only moves orders that are still in production; never touches delivered ones.
 */
export function statusFromWork(order: Pick<Order, "status" | "claims">, items: WorkItem[]): OrderStatus {
  if (!["recibida", "en_proceso", "garantia"].includes(order.status) || items.length === 0) return order.status;
  const allDone = items.every((w) => w.status === "completada");
  if (order.status === "garantia") {
    // Under warranty the order is ready again only once rework done after the claim is finished.
    const claimAt = order.claims.filter((c) => !c.resolvedAt).reduce((latest, c) => (c.at > latest ? c.at : latest), "");
    const reworked = items.some((w) => w.completedAt !== null && w.completedAt > claimAt);
    return allDone && claimAt && reworked ? "terminada" : "garantia";
  }
  if (allDone) return "terminada";
  if (items.some((w) => w.status !== "pendiente")) return "en_proceso";
  return order.status;
}

/** Delivered (or still undelivered) after the agreed date and time. */
export function isLate(order: Pick<Order, "due" | "deliveredAt" | "status">, timezone: string, now: number): boolean {
  const due = dueInstant(order, timezone);
  if (due === null || order.status === "cancelada") return false;
  const doneAt = order.deliveredAt ? Date.parse(order.deliveredAt) : null;
  return doneAt !== null ? doneAt > due : now > due;
}

export type ReminderKind = "before24h" | "dayOf" | "overdue";

/**
 * Delivery reminders that are due now and were not sent yet:
 * 24 h before, on the delivery day and when the time passes without delivery.
 */
export function dueReminders(
  order: Pick<Order, "due" | "status" | "reminders" | "deliveredAt">,
  timezone: string,
  now: number,
  today: string,
): ReminderKind[] {
  if (!order.due || order.deliveredAt || ["entregada", "cerrada", "cancelada"].includes(order.status)) return [];
  const due = dueInstant(order, timezone)!;
  const out: ReminderKind[] = [];
  if (now >= due) {
    if (!order.reminders.overdue) out.push("overdue");
    return out;
  }
  // On the delivery day only "HOY" applies; "mañana" would be wrong (and a duplicate) after it.
  if (order.due.date === today) {
    if (!order.reminders.dayOf) out.push("dayOf");
  } else if (now >= due - DAY && !order.reminders.before24h) out.push("before24h");
  return out;
}

/** Delivered and no open claim during the window: the service closes and goes to invoicing. */
export function shouldAutoClose(order: Pick<Order, "status" | "deliveredAt" | "claims">, claimWindowDays: number, now: number): boolean {
  if (order.status !== "entregada" || !order.deliveredAt) return false;
  if (order.claims.some((c) => !c.resolvedAt)) return false;
  const lastEvent = Math.max(Date.parse(order.deliveredAt), ...order.claims.map((c) => Date.parse(c.resolvedAt ?? c.at)));
  return now - lastEvent >= claimWindowDays * DAY;
}

/** When the claim window ends (for the countdown shown on delivered orders). */
export function autoCloseAt(order: Pick<Order, "deliveredAt" | "claims">, claimWindowDays: number): number | null {
  if (!order.deliveredAt) return null;
  const lastEvent = Math.max(Date.parse(order.deliveredAt), ...order.claims.map((c) => Date.parse(c.resolvedAt ?? c.at)));
  return lastEvent + claimWindowDays * DAY;
}

export interface OrderMoney {
  /** Precio pactado antes de IVA. */
  price: number | null;
  /** Insumos registrados. */
  supplies: number;
  /** Horas reales × tarifa de la máquina. */
  machineCost: number;
  /** price − supplies − machineCost. */
  grossMargin: number | null;
}

export function orderMoney(order: Pick<Order, "price" | "finalPrice" | "supplies" | "workItems">, rateOf: (machineId: string | null) => number): OrderMoney {
  const price = order.finalPrice ?? order.price;
  const supplies = Math.round(order.supplies.reduce((s, l) => s + l.quantity * l.unitCost, 0));
  const machineCost = Math.round(
    order.workItems.reduce((s, w) => s + (w.actualHours ?? (w.status === "completada" ? w.plannedHours : 0)) * rateOf(w.machineId), 0),
  );
  return { price, supplies, machineCost, grossMargin: price === null ? null : price - supplies - machineCost };
}

export interface WarrantyStatus {
  /** Last day covered (AAAA-MM-DD), or null when nothing is covered or it was not delivered. */
  until: string | null;
  /** Every step is welding: no warranty at all. */
  weldingOnly: boolean;
  /** Some steps are welding (they stay out of the warranty). */
  excludesWelding: boolean;
}

/**
 * Garantía de S.M.I.: N días desde la entrega (90 por defecto); los trabajos de
 * soldadura no tienen garantía aunque se hagan con el procedimiento adecuado.
 */
export function warrantyStatus(order: Pick<Order, "deliveredAt" | "workItems">, warrantyDays: number, timezone: string): WarrantyStatus {
  const welding = order.workItems.filter((w) => w.process === "soldadura").length;
  const weldingOnly = order.workItems.length > 0 && welding === order.workItems.length;
  const delivered = order.deliveredAt ? dateInZone(new Date(order.deliveredAt), timezone) : null;
  return {
    until: delivered && !weldingOnly && warrantyDays > 0 ? addDays(delivered, warrantyDays) : null,
    weldingOnly,
    excludesWelding: welding > 0 && !weldingOnly,
  };
}
