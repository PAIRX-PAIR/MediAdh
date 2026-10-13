import { isLate } from "./lifecycle";
import { dueInstant, machineHoursOn, type PlanContext } from "./planning";
import type { Machine, Order } from "./schema";
import { addDays, dateInZone } from "./time";

/**
 * Efficiency indicators to measure production management, globally and per
 * machine. Inactive machines never count; a machine counts from its
 * `activeSince` date onwards, and maintenance stops reduce its capacity.
 */

export type KpiContext = Pick<PlanContext, "machines" | "calendar" | "timezone" | "now" | "today">;

export interface MonthKpi {
  month: string;
  received: number;
  delivered: number;
  /** Deliveries that had a promised date. */
  withDue: number;
  onTime: number;
  /** On-time deliveries / deliveries with a date (0–1), null when none. */
  compliance: number | null;
  /** Late deliveries + still-undelivered orders whose date fell in the month. */
  breaches: number;
  satisfaction: number | null;
  satisfactionCount: number;
  warranties: number;
  returns: number;
  hoursWorked: number;
  capacityHours: number;
  utilization: number | null;
  /** Sum of agreed prices of deliveries (before VAT). */
  revenue: number;
}

export interface MachineMonthKpi {
  machineId: string;
  month: string;
  stepsDone: number;
  stepsOnTime: number;
  compliance: number | null;
  plannedHours: number;
  hoursWorked: number;
  /** planned / worked: > 1 means faster than estimated. */
  efficiency: number | null;
  capacityHours: number;
  utilization: number | null;
  warranties: number;
}

export function monthKey(iso: string, timezone: string): string {
  return dateInZone(new Date(iso), timezone).slice(0, 7);
}

/** The last `n` months ending with the current one, oldest first (AAAA-MM). */
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const total = y * 12 + (m - 1) - i;
    out.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Capacity hours of `m` during `month`, only up to today for the current month. */
export function monthCapacity(m: Machine, month: string, ctx: KpiContext): number {
  let total = 0;
  let date = `${month}-01`;
  while (date.startsWith(month) && date <= ctx.today) {
    total += machineHoursOn(m, date, ctx);
    date = addDays(date, 1);
  }
  return total;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Hours actually worked on a step: reported hours, or the plan when finished without a report. */
function workedHours(item: Order["workItems"][number]): number {
  return item.actualHours ?? (item.status === "completada" ? item.plannedHours : 0);
}

export function monthlyKpis(orders: Order[], ctx: KpiContext, months: string[]): MonthKpi[] {
  const active = ctx.machines.filter((m) => m.state !== "inactiva");
  return months.map((month) => {
    let received = 0;
    let delivered = 0;
    let withDue = 0;
    let onTime = 0;
    let breaches = 0;
    let satisfactionSum = 0;
    let satisfactionCount = 0;
    let warranties = 0;
    let returns = 0;
    let hoursWorked = 0;
    let revenue = 0;
    for (const o of orders) {
      if (o.status === "cancelada") continue;
      if (monthKey(o.intake.receivedAt, ctx.timezone) === month) received += 1;
      if (o.deliveredAt && monthKey(o.deliveredAt, ctx.timezone) === month) {
        delivered += 1;
        revenue += o.finalPrice ?? o.price ?? 0;
        if (o.due) {
          withDue += 1;
          if (!isLate(o, ctx.timezone, ctx.now)) onTime += 1;
          else breaches += 1;
        }
        if (o.satisfaction !== null) {
          satisfactionSum += o.satisfaction;
          satisfactionCount += 1;
        }
      } else if (!o.deliveredAt && o.due && o.due.date.startsWith(month)) {
        const due = dueInstant(o, ctx.timezone)!;
        if (ctx.now > due) breaches += 1;
      }
      for (const c of o.claims) {
        if (monthKey(c.at, ctx.timezone) !== month) continue;
        if (c.kind === "garantia") warranties += 1;
        else returns += 1;
      }
      for (const w of o.workItems) {
        if (!w.completedAt || monthKey(w.completedAt, ctx.timezone) !== month) continue;
        const machine = ctx.machines.find((m) => m.id === w.machineId);
        if (machine && machine.state === "inactiva") continue;
        hoursWorked += workedHours(w);
      }
    }
    const capacityHours = active.reduce((s, m) => s + monthCapacity(m, month, ctx), 0);
    return {
      month,
      received,
      delivered,
      withDue,
      onTime,
      compliance: ratio(onTime, withDue),
      breaches,
      satisfaction: satisfactionCount ? Math.round((satisfactionSum / satisfactionCount) * 10) / 10 : null,
      satisfactionCount,
      warranties,
      returns,
      hoursWorked: round1(hoursWorked),
      capacityHours: round1(capacityHours),
      utilization: ratio(hoursWorked, capacityHours),
      revenue,
    };
  });
}

export function machineKpis(orders: Order[], ctx: KpiContext, months: string[]): MachineMonthKpi[] {
  const out: MachineMonthKpi[] = [];
  for (const m of ctx.machines) {
    if (m.state === "inactiva") continue;
    for (const month of months) {
      let stepsDone = 0;
      let stepsOnTime = 0;
      let withDue = 0;
      let planned = 0;
      let worked = 0;
      let warranties = 0;
      for (const o of orders) {
        if (o.status === "cancelada") continue;
        const steps = o.workItems.filter((w) => w.machineId === m.id);
        if (steps.length === 0) continue;
        for (const w of steps) {
          if (!w.completedAt || monthKey(w.completedAt, ctx.timezone) !== month) continue;
          stepsDone += 1;
          planned += w.plannedHours;
          worked += workedHours(w);
          const due = dueInstant(o, ctx.timezone);
          if (due !== null) {
            withDue += 1;
            if (Date.parse(w.completedAt) <= due) stepsOnTime += 1;
          }
        }
        warranties += o.claims.filter((c) => c.kind === "garantia" && monthKey(c.at, ctx.timezone) === month).length;
      }
      const capacityHours = monthCapacity(m, month, ctx);
      out.push({
        machineId: m.id,
        month,
        stepsDone,
        stepsOnTime,
        compliance: ratio(stepsOnTime, withDue),
        plannedHours: round1(planned),
        hoursWorked: round1(worked),
        efficiency: worked > 0 ? Math.round((planned / worked) * 100) / 100 : null,
        capacityHours: round1(capacityHours),
        utilization: ratio(worked, capacityHours),
        warranties,
      });
    }
  }
  return out;
}

/** Totals of several months as one period (ratios recomputed from the sums). */
export function sumKpis(months: MonthKpi[], label: string): MonthKpi {
  const s = (f: (k: MonthKpi) => number) => months.reduce((a, k) => a + f(k), 0);
  const satisfactionCount = s((k) => k.satisfactionCount);
  const satisfactionSum = s((k) => (k.satisfaction ?? 0) * k.satisfactionCount);
  const withDue = s((k) => k.withDue);
  const onTime = s((k) => k.onTime);
  const hoursWorked = s((k) => k.hoursWorked);
  const capacityHours = s((k) => k.capacityHours);
  return {
    month: label,
    received: s((k) => k.received),
    delivered: s((k) => k.delivered),
    withDue,
    onTime,
    compliance: ratio(onTime, withDue),
    breaches: s((k) => k.breaches),
    satisfaction: satisfactionCount ? Math.round((satisfactionSum / satisfactionCount) * 10) / 10 : null,
    satisfactionCount,
    warranties: s((k) => k.warranties),
    returns: s((k) => k.returns),
    hoursWorked: round1(hoursWorked),
    capacityHours: round1(capacityHours),
    utilization: ratio(hoursWorked, capacityHours),
    revenue: s((k) => k.revenue),
  };
}

export interface IndexPart {
  label: string;
  weight: number;
  /** 0–1, null when there is no data for the period. */
  value: number | null;
  detail: string;
}

/**
 * Índice de gestión de producción (0–100): weighted blend of the indicators
 * the boss asked for. Parts without data are left out and the rest re-weighted.
 */
export function managementIndex(k: MonthKpi, utilizationTarget = 0.85): { score: number | null; parts: IndexPart[] } {
  const quality = k.delivered > 0 ? 1 - Math.min(1, (k.warranties + k.returns) / k.delivered) : null;
  const parts: IndexPart[] = [
    {
      label: "Cumplimiento de entregas",
      weight: 40,
      value: k.compliance,
      detail: k.withDue ? `${k.onTime} de ${k.withDue} a tiempo` : "Sin entregas con fecha",
    },
    {
      label: "Satisfacción del cliente",
      weight: 25,
      value: k.satisfaction === null ? null : (k.satisfaction - 1) / 4,
      detail: k.satisfaction === null ? "Sin calificaciones" : `${k.satisfaction} / 5 (${k.satisfactionCount})`,
    },
    {
      label: "Calidad (sin garantías ni devoluciones)",
      weight: 20,
      value: quality,
      detail: `${k.warranties} garantías · ${k.returns} devoluciones`,
    },
    {
      label: "Uso de la capacidad",
      weight: 15,
      value: k.utilization === null ? null : Math.min(1, k.utilization / utilizationTarget),
      detail: k.utilization === null ? "Sin capacidad activa" : `${Math.round(k.utilization * 100)} % (meta ${Math.round(utilizationTarget * 100)} %)`,
    },
  ];
  const available = parts.filter((p) => p.value !== null);
  const weight = available.reduce((s, p) => s + p.weight, 0);
  if (weight === 0) return { score: null, parts };
  const score = Math.round((available.reduce((s, p) => s + p.weight * (p.value ?? 0), 0) / weight) * 100);
  return { score, parts };
}
