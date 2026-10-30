import type { Process, Quote, QuoteStatus } from "./schema";
import { addDays } from "./time";

export interface QuoteTotals {
  materials: number;
  labor: number;
  /** Hours per process (for capacity checks and the work order). */
  hoursByProcess: Partial<Record<Process, number>>;
  totalHours: number;
  /** Costo directo = materiales + mano de obra. */
  cost: number;
  /** Utilidad total aplicada (%): la que se escribe en la cotización (+ el ajuste de una cotización anterior, si lo tiene). */
  marginPct: number;
  /** Utilidad en pesos (la que se escribe en la cotización). */
  baseMargin: number;
  /** Ajuste en pesos de una cotización hecha con la regla anterior (puntos por dificultad/urgencia). Las nuevas siempre en 0. */
  extraMargin: number;
  margin: number;
  /** Precio antes de IVA. */
  subtotal: number;
  iva: number;
  total: number;
  /** Precio por pieza antes de IVA. */
  unitPrice: number;
}

const round = (n: number) => Math.round(n);

/** Con la utilidad sobre el precio, 100 % sería un precio infinito: el tope es 99 %. */
export const MAX_MARGIN_ON_PRICE = 99;

/**
 * Order of operations (all in COP, rounded to whole pesos):
 *   costo     = Σ materiales (cantidad × costo) + Σ horas × tarifa de la máquina
 *   subtotal  = costo ÷ (1 − % de utilidad)         (precio antes de IVA)
 *   utilidad  = subtotal − costo                    (es ese % del precio, no un recargo sobre el costo)
 *   IVA       = subtotal × % IVA
 *   total     = subtotal + IVA
 */
type TotalsInput = Pick<Quote, "marginPct" | "ivaPct" | "quantity"> & {
  materials: Array<Pick<Quote["materials"][number], "quantity" | "unitCost">>;
  labor: Array<Pick<Quote["labor"][number], "process" | "hours" | "rate">>;
  /** Solo cotizaciones anteriores a que se quitaran los puntos automáticos; en las nuevas es 0. */
  extraMarginPct?: number;
  /** Un borrador siempre usa la regla vigente (utilidad sobre el precio, sin puntos); una cotización ya enviada conserva la suya. */
  status?: QuoteStatus;
  marginBasis?: Quote["marginBasis"];
};

export function quoteTotals(q: TotalsInput): QuoteTotals {
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
  const basis = q.status === "borrador" ? "precio" : (q.marginBasis ?? "costo");
  if (basis === "precio") {
    // La utilidad sale del precio: con 30 %, de cada $100 de precio $30 son utilidad y $70 costo.
    const pct = Math.min(Math.max(q.marginPct, 0), MAX_MARGIN_ON_PRICE);
    const subtotal = pct > 0 ? round(cost / (1 - pct / 100)) : cost;
    const margin = subtotal - cost;
    const iva = round(subtotal * (q.ivaPct / 100));
    return {
      materials,
      labor,
      hoursByProcess,
      totalHours: Math.round(totalHours * 100) / 100,
      cost,
      marginPct: pct,
      baseMargin: margin,
      extraMargin: 0,
      margin,
      subtotal,
      iva,
      total: subtotal + iva,
      unitPrice: round(subtotal / Math.max(1, q.quantity)),
    };
  }
  // Regla anterior (cotizaciones ya enviadas): recargo sobre el costo.
  const extra = q.extraMarginPct ?? 0;
  const baseMargin = round(cost * (q.marginPct / 100));
  const margin = round(cost * ((q.marginPct + extra) / 100));
  const subtotal = cost + margin;
  const iva = round(subtotal * (q.ivaPct / 100));
  return {
    materials,
    labor,
    hoursByProcess,
    totalHours: Math.round(totalHours * 100) / 100,
    cost,
    marginPct: q.marginPct + extra,
    baseMargin,
    extraMargin: margin - baseMargin,
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
export function quoteWarnings(q: Pick<TotalsInput, "materials" | "labor" | "marginPct">): string[] {
  const warnings: string[] = [];
  if (q.labor.some((l) => l.hours > 0 && l.rate === 0)) warnings.push("Hay horas de máquina con tarifa en $0. Pon la tarifa de cada máquina en Cola → máquina.");
  if (q.marginPct === 0) warnings.push("La utilidad está en 0 %.");
  if (q.materials.length === 0 && q.labor.length === 0) warnings.push("La cotización no tiene materiales ni horas.");
  return warnings;
}

/** Welding carries no warranty at S.M.I., even though it follows the proper procedure. */
export const NO_WARRANTY_PROCESSES: Process[] = ["soldadura"];

export function warrantyText(lines: Array<{ process: Process }>, warrantyDays: number): string {
  const welding = lines.some((l) => NO_WARRANTY_PROCESSES.includes(l.process));
  const onlyWelding = lines.length > 0 && lines.every((l) => NO_WARRANTY_PROCESSES.includes(l.process));
  const weldingNote =
    "Los trabajos de soldadura no tienen garantía, aunque se realizan técnicamente con el procedimiento adecuado y los materiales idóneos para cada pieza.";
  if (onlyWelding) return weldingNote;
  const base = warrantyDays > 0 ? `${warrantyDays} días a partir de la entrega sobre el trabajo realizado.` : "Sin garantía.";
  return welding ? `${base} ${weldingNote}` : base;
}

export function formatCop(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
}
