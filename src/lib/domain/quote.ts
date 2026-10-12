import type { Difficulty, Process, Quote, QuoteStatus } from "./schema";
import { addDays } from "./time";

/** Recargo por dificultad: 1 normal, 2 complicado (+15 %), 3 urgente (+25 %). */
export const DIFFICULTY_SURCHARGE: Record<Difficulty, number> = { 1: 0, 2: 0.15, 3: 0.25 };

export interface QuoteTotals {
  materials: number;
  labor: number;
  /** Hours per process (for capacity checks and the work order). */
  hoursByProcess: Partial<Record<Process, number>>;
  totalHours: number;
  /** Costo directo = materiales + mano de obra. */
  cost: number;
  surchargePct: number;
  surcharge: number;
  margin: number;
  /** Precio antes de IVA. */
  subtotal: number;
  iva: number;
  total: number;
  /** Precio por pieza antes de IVA. */
  unitPrice: number;
}

const round = (n: number) => Math.round(n);

/**
 * Order of operations (all in COP, rounded to whole pesos):
 *   costo     = Σ materiales (cantidad × costo) + Σ horas × tarifa
 *   recargo   = costo × % dificultad
 *   utilidad  = (costo + recargo) × % utilidad
 *   subtotal  = costo + recargo + utilidad          (precio antes de IVA)
 *   IVA       = subtotal × % IVA
 *   total     = subtotal + IVA
 */
export function quoteTotals(
  q: Pick<Quote, "materials" | "labor" | "difficulty" | "marginPct" | "ivaPct" | "quantity">,
): QuoteTotals {
  const materials = round(q.materials.reduce((sum, m) => sum + m.quantity * m.unitCost, 0));
  const hoursByProcess: Partial<Record<Process, number>> = {};
  let labor = 0;
  let totalHours = 0;
  for (const line of q.labor) {
    labor += line.hours * line.rate;
    totalHours += line.hours;
    hoursByProcess[line.process] = (hoursByProcess[line.process] ?? 0) + line.hours;
  }
  labor = round(labor);
  const cost = materials + labor;
  const surchargePct = DIFFICULTY_SURCHARGE[q.difficulty];
  const surcharge = round(cost * surchargePct);
  const margin = round((cost + surcharge) * (q.marginPct / 100));
  const subtotal = cost + surcharge + margin;
  const iva = round(subtotal * (q.ivaPct / 100));
  return {
    materials,
    labor,
    hoursByProcess,
    totalHours: Math.round(totalHours * 100) / 100,
    cost,
    surchargePct,
    surcharge,
    margin,
    subtotal,
    iva,
    total: subtotal + iva,
    unitPrice: round(subtotal / Math.max(1, q.quantity)),
  };
}

/** Last day the quote can be accepted (AAAA-MM-DD), or null while it is a draft. */
export function quoteValidUntil(q: Pick<Quote, "issuedAt" | "createdAt" | "validDays">): string {
  return addDays((q.issuedAt ?? q.createdAt).slice(0, 10), q.validDays);
}

export type QuoteDisplayStatus = QuoteStatus | "vencida";

/** A sent quote past its validity shows as "vencida" (derived, never stored). */
export function quoteDisplayStatus(q: Pick<Quote, "status" | "issuedAt" | "createdAt" | "validDays">, today: string): QuoteDisplayStatus {
  if (q.status === "enviada" && today > quoteValidUntil(q)) return "vencida";
  return q.status;
}

/** Warnings shown before sending a quote (never block, just inform). */
export function quoteWarnings(q: Pick<Quote, "materials" | "labor" | "marginPct">): string[] {
  const warnings: string[] = [];
  if (q.labor.some((l) => l.hours > 0 && l.rate === 0)) warnings.push("Hay horas de máquina con tarifa en $0. Configura las tarifas en Ajustes.");
  if (q.marginPct === 0) warnings.push("La utilidad está en 0 %.");
  if (q.materials.length === 0 && q.labor.length === 0) warnings.push("La cotización no tiene materiales ni horas.");
  return warnings;
}

export function formatCop(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}
