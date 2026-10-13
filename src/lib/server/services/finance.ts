import "server-only";
import { goalProgress, shiftMonth } from "@/lib/domain/finance";
import { liquidate, quincenaByKey } from "@/lib/domain/payroll";
import { dateInZone } from "@/lib/domain/time";
import type { Principal } from "../auth/principal";
import { badRequest } from "../http";
import { getDb } from "../store";
import { payrollPeopleFor } from "./payroll";

/**
 * Ganancias del mes (gerencia y administración): ventas de los trabajos
 * entregados en el mes (antes de IVA), insumos de esos trabajos y la nómina de
 * las dos quincenas, con lo que se le paga a cada persona y el avance de las metas.
 */
export async function financeReport(principal: Principal, monthParam: string | null) {
  const month = monthParam ?? principal.today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw badRequest("Mes inválido (AAAA-MM).");
  const docs = await getDb().read(["orders", "attendance", "settings", "users", "positions"]);
  const tz = docs.settings.timezone;

  const delivered = docs.orders.items
    .filter((o) => o.status !== "cancelada" && o.deliveredAt && dateInZone(new Date(o.deliveredAt), tz).startsWith(month))
    .map((o) => ({
      id: o.id,
      folio: o.folio,
      clientName: o.clientName,
      title: o.title,
      deliveredOn: dateInZone(new Date(o.deliveredAt!), tz),
      price: o.finalPrice ?? o.price ?? 0,
      supplies: Math.round(o.supplies.reduce((s, l) => s + l.quantity * l.unitCost, 0)),
      invoiced: !o.invoice.pending && Boolean(o.invoice.number || o.invoice.invoicedAt),
    }))
    .sort((a, b) => a.deliveredOn.localeCompare(b.deliveredOn));
  const sales = delivered.reduce((s, o) => s + o.price, 0);
  const supplies = delivered.reduce((s, o) => s + o.supplies, 0);
  const withoutPrice = delivered.filter((o) => o.price === 0).length;

  const calendar = { schedule: docs.settings.production.schedule, skipHolidays: docs.settings.production.skipHolidays };
  const q1 = quincenaByKey(`${month}-1`)!;
  const q2 = quincenaByKey(`${month}-2`)!;
  const entries = docs.attendance.items.filter((e) => e.date >= q1.from && e.date <= q2.to);
  const people = payrollPeopleFor(docs, entries, principal.today);
  const lines1 = liquidate({ people, entries, quincena: q1, calendar, settings: docs.settings.payroll });
  const lines2 = liquidate({ people, entries, quincena: q2, calendar, settings: docs.settings.payroll });
  const payroll = people.map((p, i) => {
    const a = lines1[i]!;
    const b = lines2[i]!;
    return {
      userId: p.id,
      name: p.displayName,
      positionTitle: p.positionTitle,
      monthlySalary: p.monthlySalary,
      q1: { net: a.net, earned: a.earned, extras: a.extrasTotal },
      q2: { net: b.net, earned: b.earned, extras: b.extrasTotal },
      /** What reaches the person's account in the month. */
      net: a.net + b.net,
      /** What the workshop pays for that person (devengado: salary, overtime, transport). */
      cost: a.earned + b.earned,
    };
  });
  const payrollQ1 = payroll.reduce((s, p) => s + p.q1.earned, 0);
  const payrollQ2 = payroll.reduce((s, p) => s + p.q2.earned, 0);
  const profit = sales - supplies - payrollQ1 - payrollQ2;
  const goals = docs.settings.finance;
  const basisValue = goals.goalBasis === "ventas" ? sales : profit;

  return {
    month,
    previous: shiftMonth(month, -1),
    next: shiftMonth(month, 1),
    current: principal.today.slice(0, 7),
    quincenas: { q1, q2 },
    sales,
    supplies,
    payrollQ1,
    payrollQ2,
    profit,
    orders: delivered,
    withoutPrice,
    missingSalaries: payroll.filter((p) => p.monthlySalary === null).map((p) => p.name),
    payroll,
    goals: { ...goals, value: basisValue, progress: goalProgress(basisValue, goals.goals) },
  };
}
