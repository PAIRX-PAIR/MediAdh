import type { Order } from "./schema";

/* ───────── Guía del trabajo: recibida → en máquina → terminada → entregada → factura ───────── */

export type ProcessStepKey = "recibida" | "maquina" | "terminada" | "entregada" | "factura";

export interface ProcessStep {
  key: ProcessStepKey;
  label: string;
  /** Qué hacer, en una frase. */
  hint: string;
  /** Texto del botón cuando es el siguiente paso. */
  cta: string;
  done: boolean;
}

type StepOrder = Pick<Order, "id" | "folio" | "title" | "clientName" | "status" | "due" | "invoice">;

/** En qué va una orden. Una orden en garantía vuelve a pasar por la entrega. */
export function orderSteps(o: Pick<Order, "status" | "invoice">): ProcessStep[] {
  const past = (...statuses: Order["status"][]) => statuses.includes(o.status);
  // «Sin factura» cuenta como paso cumplido: el ingreso queda y no se pide factura.
  const billed = Boolean(o.invoice.invoicedAt || o.invoice.number || o.invoice.none) || (o.status === "cerrada" && !o.invoice.pending);
  return [
    { key: "recibida", label: "Recibida", hint: "La orden ya está registrada.", cta: "Ver la orden", done: true },
    { key: "maquina", label: "En máquina", hint: "Empieza el primer proceso en su máquina.", cta: "Empezar", done: past("en_proceso", "terminada", "entregada", "cerrada") },
    { key: "terminada", label: "Terminada", hint: "Termina los procesos que quedan.", cta: "Terminar", done: past("terminada", "entregada", "cerrada") },
    { key: "entregada", label: "Entregada", hint: "Entrega la pieza al cliente y deja el precio final.", cta: "Entregar", done: past("entregada", "cerrada") },
    { key: "factura", label: "Factura", hint: "Marca la factura, o deja el trabajo sin factura: el ingreso cuenta igual.", cta: "Facturar o dejar sin factura", done: billed },
  ];
}

/** El primer paso sin hacer (null = el trabajo está completo). */
export const nextStep = (steps: ProcessStep[]) => steps.find((s) => !s.done) ?? null;

/**
 * La orden que guía el inicio: primero el trabajo que sigue en la cola; si no hay,
 * lo que está listo para entregar; y por último lo que falta facturar.
 */
export function guideOrder<T extends StepOrder>(orders: T[], nextOrderId: string | null): T | null {
  const byDue = (a: T, b: T) => (a.due?.date ?? "9999-12-31").localeCompare(b.due?.date ?? "9999-12-31");
  const queued = nextOrderId ? orders.find((o) => o.id === nextOrderId) : undefined;
  return (
    queued ??
    orders.filter((o) => o.status === "terminada" || o.status === "entregada").sort(byDue)[0] ??
    orders.filter((o) => o.status === "cerrada" && o.invoice.pending).sort(byDue)[0] ??
    null
  );
}
