import { describe, expect, it } from "vitest";
import { DEFAULT_WEEK_SCHEDULE, calendarHours, colombianHolidays, easterSunday, format12h, formatDuration, weeklyHours, workdayStatus, type WorkCalendar } from "./calendar";
import { defaultMachines } from "./defaults";
import { diffFields, recordChange } from "./diff";
import { goalProgress, shiftMonth } from "./finance";
import { adjustForInflation, ipcVariations } from "./ipc";
import { lastMonths, managementIndex, monthlyKpis, machineKpis } from "./kpi";
import { canTransition, dueReminders, isLate, shouldAutoClose, statusFromWork } from "./lifecycle";
import { formatNit, parseNit, verificationDigit } from "./nit";
import { dayHours, liquidate, paidDaysIn, quincenaOf, shiftQuincena } from "./payroll";
import { canCommit, machineHoursOn, nextUp, occupancy, planOrders, prioritize, type PlanContext } from "./planning";
import { extraMarginPct, quoteDisplayStatus, quoteTotals } from "./quote";
import type { Machine, Order, WorkItem } from "./schema";
import { zonedInstant } from "./time";

const TZ = "America/Bogota";
/** Test calendar: 8 h from 07:00 (with a lunch hour) Monday–Friday, 4 h on Saturday. */
const WEEKDAY = [{ start: "07:00", end: "11:00" }, { start: "12:00", end: "16:00" }];
const CAL: WorkCalendar = { schedule: [WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, WEEKDAY, [{ start: "07:00", end: "11:00" }], []], skipHolidays: true };

describe("NIT y dígito de verificación DIAN", () => {
  it("calcula el DV de NITs conocidos", () => {
    expect(verificationDigit("800197268")).toBe(4); // DIAN
    expect(verificationDigit("890903938")).toBe(8); // Bancolombia
    expect(verificationDigit("901469738")).toBe(9); // S.M.I.
    expect(verificationDigit("899999068")).toBe(1); // Ecopetrol
    expect(verificationDigit("800.197.268")).toBe(4);
  });

  it("interpreta el texto escrito por la persona y detecta un DV errado", () => {
    expect(parseNit("800.197.268-4")).toEqual({ number: "800197268", dv: "4", mismatch: false });
    expect(parseNit("800197268-5")).toMatchObject({ dv: "4", mismatch: true });
    expect(parseNit("800197268")).toMatchObject({ dv: "4", mismatch: false });
    expect(parseNit("12")).toBeNull();
    expect(formatNit("800197268", "4")).toBe("800.197.268-4");
  });
});

describe("calendario laboral de Colombia", () => {
  it("calcula la Pascua y los 18 festivos de 2026", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect([...colombianHolidays(2026).keys()].sort()).toEqual([
      "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01",
      "2026-05-18", "2026-06-08", "2026-06-15", "2026-06-29", "2026-07-20", "2026-08-07",
      "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
    ]);
  });

  it("aplica jornada, sábado corto, domingo y festivos", () => {
    expect(calendarHours("2026-10-13", 8, CAL)).toBe(8); // martes
    expect(calendarHours("2026-10-17", 8, CAL)).toBe(4); // sábado
    expect(calendarHours("2026-10-18", 8, CAL)).toBe(0); // domingo
    expect(calendarHours("2026-10-12", 8, CAL)).toBe(0); // Día de la Raza
    expect(calendarHours("2026-10-12", 8, { ...CAL, skipHolidays: false })).toBe(8);
    expect(calendarHours("2026-10-13", 6, CAL)).toBe(6); // tope propio de la máquina
  });

  it("el horario de S.M.I. suma 42 horas semanales", () => {
    const smi: WorkCalendar = { schedule: DEFAULT_WEEK_SCHEDULE, skipHolidays: true };
    expect(weeklyHours(DEFAULT_WEEK_SCHEDULE)).toBe(42);
    expect(calendarHours("2026-10-16", null, smi)).toBe(7); // viernes 8–12 y 13:30–16:30
    expect(calendarHours("2026-10-14", null, smi)).toBe(8); // miércoles 7:30–12 y 13:30–17
    expect(calendarHours("2026-10-17", null, smi)).toBe(4); // sábado
  });
});

describe("nómina quincenal", () => {
  const smi: WorkCalendar = { schedule: DEFAULT_WEEK_SCHEDULE, skipHolidays: true };
  const settings = {
    monthlyHours: 210,
    extraDayPct: 25,
    extraNightPct: 75,
    sundayHolidayPct: 90,
    nightStart: "19:00",
    nightEnd: "06:00",
    roundingMinutes: 15,
    healthPct: 4,
    pensionPct: 4,
    transportAllowance: 200_000,
    autoAttendance: true,
  };
  let n = 0;
  const block = (date: string, start: string, end: string | null) => ({
    id: `a${++n}`,
    userId: "u1",
    userName: "Operario",
    date,
    start,
    end,
    note: "",
    absent: false,
    source: "operario" as const,
    createdBy: "u1",
    createdAt: "2026-10-01T12:00:00.000Z",
    updatedAt: "2026-10-01T12:00:00.000Z",
    history: [],
  });

  it("quincenas del 1 al 15 y del 16 a fin de mes, pago el 15 y el 30", () => {
    expect(quincenaOf("2026-10-12")).toEqual({ key: "2026-10-1", from: "2026-10-01", to: "2026-10-15", payDate: "2026-10-15" });
    expect(quincenaOf("2026-10-20")).toMatchObject({ to: "2026-10-31", payDate: "2026-10-30" });
    expect(quincenaOf("2026-02-20")).toMatchObject({ to: "2026-02-28", payDate: "2026-02-28" });
    expect(shiftQuincena(quincenaOf("2026-01-05"), -1).key).toBe("2025-12-2");
  });

  it("clasifica las extras: diurna, nocturna desde las 7 p. m., dominical y festiva", () => {
    const tue = dayHours("2026-10-13", [block("2026-10-13", "07:30", "12:00"), block("2026-10-13", "13:30", "18:30")], smi, settings);
    expect(tue).toMatchObject({ ordinaryMinutes: 480, minutes: { extraDay: 90, extraNight: 0 } });
    const fri = dayHours("2026-10-16", [block("2026-10-16", "13:30", "20:00")], smi, settings);
    expect(fri.minutes).toMatchObject({ extraDay: 150, extraNight: 60 });
    expect(dayHours("2026-10-18", [block("2026-10-18", "08:00", "12:00")], smi, settings).minutes.extraHolidayDay).toBe(240); // domingo
    expect(dayHours("2026-10-12", [block("2026-10-12", "08:00", "10:00")], smi, settings)).toMatchObject({ special: "Día de la Raza", minutes: { extraHolidayDay: 120 } });
    // Minutos sueltos por fuera del horario no alcanzan un bloque de 15 min.
    expect(dayHours("2026-10-14", [block("2026-10-14", "07:30", "12:07")], smi, settings).minutes.extraDay).toBe(0);
    // Un bloque sin salida no cuenta hasta que se corrija.
    expect(dayHours("2026-10-14", [block("2026-10-14", "07:30", null)], smi, settings)).toMatchObject({ workedMinutes: 0, openEntries: 1 });
  });

  it("paga por los días de contrato dentro de la quincena (15 si la cubre toda)", () => {
    const q = quincenaOf("2026-10-20"); // 16–31 oct: 16 días calendario = 15 comerciales
    expect(paidDaysIn(q, undefined)).toBe(15);
    expect(paidDaysIn(q, [["2026-01-01", null]])).toBe(15);
    expect(paidDaysIn(q, [["2026-10-27", null]])).toBe(5); // ingresó el 27
    expect(paidDaysIn(q, [["2026-01-01", "2026-10-20"]])).toBe(5); // terminó el 20
    expect(paidDaysIn(quincenaOf("2026-02-20"), [["2026-01-01", null]])).toBe(15); // febrero completo
  });

  it("suma solas las horas del horario hasta ahora; los registros y las faltas mandan", () => {
    const people = [{ id: "u1", displayName: "Operario", monthlySalary: 2_100_000, transportAllowance: false, employment: [["2026-01-10", null]] as Array<[string, string | null]> }];
    const quincena = quincenaOf("2026-10-14");
    // Jueves 15 de octubre a las 10:00: cuentan del 1 al 14 completos y nada del 15 (su primer turno acaba a las 12:00).
    const now = { date: "2026-10-15", minutes: 10 * 60 };
    const [auto] = liquidate({ people, entries: [], quincena, calendar: smi, settings, now });
        // 1 jue 8 · 2 vie 7 · 3 sáb 4 · 5 lun 7 · 6–8 8+8+8 · 9 vie 7 · 10 sáb 4 · 12 festivo · 13–14 8+8 = 77 h.
    expect(auto!.workedHours).toBe(77);
    expect(auto!.extrasTotal).toBe(0);
    expect(auto!.days.find((d) => d.date === "2026-10-05")).toMatchObject({ auto: true, workedMinutes: 7 * 60 });

    const falta = { ...block("2026-10-05", "08:00", "16:30"), absent: true };
    const morning = block("2026-10-06", "07:30", "12:00");
    const afternoon = block("2026-10-06", "13:30", "19:00");
    const [mixed] = liquidate({ people, entries: [falta, morning, afternoon], quincena, calendar: smi, settings, now });
    expect(mixed!.days.find((d) => d.date === "2026-10-05")).toMatchObject({ absent: true, workedMinutes: 0, auto: false });
    expect(mixed!.days.find((d) => d.date === "2026-10-06")).toMatchObject({ auto: false, workedMinutes: 10 * 60 });
    expect(mixed!.hours.extraDay).toBe(2);

    const [off] = liquidate({ people, entries: [], quincena, calendar: smi, settings: { ...settings, autoAttendance: false }, now });
    expect(off!.workedHours).toBe(0);
  });

  it("suma bonificaciones y resta descuentos de la quincena", () => {
    const base = { userId: "u1", quincena: "2026-10-1", createdBy: "x", createdAt: "2026-10-05T12:00:00.000Z" };
    const [line] = liquidate({
      people: [{ id: "u1", displayName: "Operario", monthlySalary: 2_100_000, transportAllowance: false }],
      entries: [],
      quincena: quincenaOf("2026-10-13"),
      calendar: smi,
      settings,
      adjustments: [
        { ...base, id: "b", kind: "bono", concept: "Meta", amount: 100_000 },
        { ...base, id: "d", kind: "descuento", concept: "Anticipo", amount: 300_000 },
        { ...base, id: "x", quincena: "2026-10-2", kind: "descuento", concept: "Otra quincena", amount: 999 },
      ],
    });
    // Salud y pensión sobre el básico (1.050.000): 84.000; el bono no entra en esa base.
    expect(line).toMatchObject({ bonuses: 100_000, otherDeductions: 300_000, earned: 1_150_000, health: 42_000, pension: 42_000, net: 766_000 });
    expect(line!.adjustments.map((a) => a.concept)).toEqual(["Meta", "Anticipo"]);
  });

  it("liquida básico, extras, auxilio y descuentos de ley", () => {
    const [line] = liquidate({
      people: [{ id: "u1", displayName: "Operario", monthlySalary: 2_100_000, transportAllowance: true }],
      entries: [block("2026-10-13", "07:30", "12:00"), block("2026-10-13", "13:30", "18:30")],
      quincena: quincenaOf("2026-10-13"),
      calendar: smi,
      settings,
    });
    expect(line).toMatchObject({ hourlyValue: 10_000, basic: 1_050_000, extrasTotal: 18_750, transport: 100_000, health: 42_750, pension: 42_750, net: 1_083_250 });
    expect(line!.scheduledHours).toBe(85); // 1–15 oct 2026 con el festivo del lunes 12
  });
});

describe("cotizador", () => {
  const base = {
    materials: [{ id: "m1", description: "Barra 1045", quantity: 2, unitCost: 50_000 }],
    labor: [
      { id: "l1", process: "torno" as const, description: "", hours: 3, rate: 60_000 },
      { id: "l2", process: "fresadora" as const, description: "", hours: 1.5, rate: 80_000 },
    ],
    marginPct: 30,
    ivaPct: 19,
    quantity: 4,
  };

  it("suma costo, utilidad (base + dificultad + urgencia) e IVA en ese orden", () => {
    const normal = quoteTotals({ ...base, marginPct: 35 });
    expect(normal.materials).toBe(100_000);
    expect(normal.labor).toBe(300_000);
    expect(normal.cost).toBe(400_000);
    expect(normal.margin).toBe(140_000);
    expect(normal.subtotal).toBe(540_000);
    expect(normal.iva).toBe(102_600);
    expect(normal.total).toBe(642_600);
    expect(normal.unitPrice).toBe(135_000);
    expect(normal.hoursByProcess).toEqual({ torno: 3, fresadora: 1.5 });

    const rules = { difficultyMarginPct: 15, highDifficultyMarginPct: 25, urgencyMarginPct: 125 };
    expect(extraMarginPct(2, false, rules)).toBe(15);
    expect(extraMarginPct(1, true, rules)).toBe(125);
    expect(extraMarginPct(2, true, rules)).toBe(140);
    const difficult = quoteTotals({ ...base, marginPct: 35, extraMarginPct: 15 });
    expect(difficult).toMatchObject({ marginPct: 50, baseMargin: 140_000, extraMargin: 60_000, subtotal: 600_000 });
    // Urgencia: se baja la pieza montada; la utilidad sube a 35 + 125 = 160 %.
    const urgent = quoteTotals({ ...base, marginPct: 35, extraMarginPct: 125 });
    expect(urgent.subtotal).toBe(1_040_000);
    expect(urgent.total).toBe(Math.round(1_040_000 * 1.19));
  });

  it("marca como vencida una cotización enviada fuera de vigencia", () => {
    const q = { status: "enviada" as const, issuedAt: "2026-09-01T15:00:00.000Z", createdAt: "2026-09-01T15:00:00.000Z", validDays: 15 };
    expect(quoteDisplayStatus(q, "2026-09-16")).toBe("enviada");
    expect(quoteDisplayStatus(q, "2026-09-17")).toBe("vencida");
  });
});

/* ───────────── fixtures de planeación ───────────── */

const NOW = zonedInstant("2026-10-13", "07:00", TZ).getTime();
const machines = (): Machine[] => defaultMachines("2026-01-01T00:00:00.000Z").items;
const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  machines: machines().filter((m) => ["pinacho", "wkt", "cnc-1", "cnc-2"].includes(m.id)),
  calendar: CAL,
  timezone: TZ,
  now: NOW,
  today: "2026-10-13",
  ...over,
});

let seq = 0;
function item(over: Partial<WorkItem> = {}): WorkItem {
  return {
    id: `w${++seq}`,
    process: "torno",
    machineId: null,
    positionId: null,
    description: "",
    plannedHours: 1,
    actualHours: null,
    status: "pendiente",
    taskId: null,
    completedAt: null,
    ...over,
  };
}

function order(over: Partial<Order> & Pick<Order, "id">): Order {
  return {
    folio: over.id.toUpperCase(),
    clientId: null,
    clientName: "Cliente",
    title: `Trabajo ${over.id}`,
    description: "",
    status: "recibida",
    difficulty: 1,
    urgent: false,
    intake: { receivedAt: "2026-10-10T15:00:00.000Z", quantity: 1, condition: "" },
    intakePhotoIds: [],
    drawingIds: [],
    photoIds: [],
    due: null,
    workItems: [],
    supplies: [],
    requiredSupplies: [],
    quoteId: null,
    price: null,
    finalPrice: null,
    startedAt: null,
    finishedAt: null,
    deliveredAt: null,
    closedAt: null,
    invoice: { pending: false, number: null, invoicedAt: null },
    claims: [],
    satisfaction: null,
    reminders: { before24h: false, dayOf: false, overdue: false },
    historical: false,
    notes: "",
    history: [],
    createdBy: null,
    createdAt: "2026-10-10T15:00:00.000Z",
    updatedAt: "2026-10-10T15:00:00.000Z",
    updatedBy: null,
    ...over,
  };
}

const orderA = () => order({ id: "a", due: { date: "2026-10-14", time: "17:00" }, workItems: [item({ plannedHours: 10 })] });
const orderB = () => order({ id: "b", due: { date: "2026-10-20", time: "17:00" }, workItems: [item({ plannedHours: 6 })] });

describe("capacidad de máquinas", () => {
  it("una máquina inactiva no suma capacidad; activada con fecha, suma desde ese día", () => {
    const [cnc2] = machines().filter((m) => m.id === "cnc-2");
    expect(machineHoursOn(cnc2!, "2026-10-13", ctx())).toBe(0);
    const activated = { ...cnc2!, state: "activa" as const, activeSince: "2026-10-15" };
    expect(machineHoursOn(activated, "2026-10-14", ctx())).toBe(0);
    expect(machineHoursOn(activated, "2026-10-15", ctx())).toBe(8);
  });

  it("un paro de mantenimiento resta horas y uno abierto deja la máquina sin capacidad", () => {
    const m = machines().find((x) => x.id === "pinacho")!;
    const stop = { id: "s", from: zonedInstant("2026-10-13", "09:00", TZ).toISOString(), to: zonedInstant("2026-10-13", "11:00", TZ).toISOString(), reason: "", createdBy: null };
    expect(machineHoursOn({ ...m, stops: [stop] }, "2026-10-13", ctx())).toBe(6);
    const open = { ...stop, to: null };
    expect(machineHoursOn({ ...m, state: "mantenimiento", stops: [open] }, "2026-10-14", ctx())).toBe(0);
  });

  it("hoy solo cuenta lo que queda del turno", () => {
    const m = machines().find((x) => x.id === "pinacho")!;
    const noon = zonedInstant("2026-10-13", "12:00", TZ).getTime();
    expect(machineHoursOn(m, "2026-10-13", ctx(), noon)).toBe(4); // turno de la tarde 12:00–16:00
    const ten = zonedInstant("2026-10-13", "10:00", TZ).getTime();
    expect(machineHoursOn(m, "2026-10-13", ctx(), ten)).toBe(5); // 10–11 y 12–16, el almuerzo no cuenta
  });
});

describe("cola de producción", () => {
  it("programa por fecha de entrega en la máquina que termina primero", () => {
    const plan = planOrders([orderB(), orderA()], ctx());
    const a = plan.jobs.find((j) => j.orderId === "a")!;
    const b = plan.jobs.find((j) => j.orderId === "b")!;
    expect(a).toMatchObject({ assignedMachineId: "pinacho", endDate: "2026-10-14", late: false });
    expect(b).toMatchObject({ assignedMachineId: "wkt", endDate: "2026-10-13" });
    const occ = occupancy(plan, ctx().machines, 2);
    expect(occ.find((o) => o.machineId === "pinacho")).toMatchObject({ loadHours: 10, capacityHours: 16, level: "libre" });
    expect(occ.find((o) => o.machineId === "cnc-2")).toMatchObject({ level: "inactiva", capacityHours: 0 });
    expect(occ.find((o) => o.machineId === "wkt")!.freeDate).toBe("2026-10-13");
  });

  it("no programa trabajo en máquinas inactivas", () => {
    const o = order({ id: "c", workItems: [item({ process: "cnc", machineId: "cnc-2", plannedHours: 3 })] });
    const plan = planOrders([o], ctx());
    expect(plan.jobs[0]).toMatchObject({ assignedMachineId: null, endDate: null });
  });

  it("recomienda con qué orden seguir y explica por qué", () => {
    const blocked = order({
      id: "d",
      difficulty: 3,
      due: { date: "2026-10-13", time: "10:00" },
      workItems: [item({ status: "bloqueada", plannedHours: 2 })],
    });
    const ranking = prioritize(
      { orders: [orderB(), orderA(), blocked], clientTier: () => 1, blockedReason: () => "Falta material" },
      ctx(),
    );
    const d = ranking.find((r) => r.orderId === "d")!;
    expect(d.actionable).toBe(false);
    expect(d.reasons.some((r) => r.label.includes("Falta material"))).toBe(true);
    const next = nextUp(ranking)!;
    expect(next.orderId).toBe("a");
    expect(next.reasons.map((r) => r.label).join(" ")).toMatch(/Holgura|No alcanza/);
  });
});

describe("¿Me puedo comprometer?", () => {
  it("responde Sí cuando cabe después de la cola", () => {
    const answer = canCommit([orderA(), orderB()], { hoursByProcess: { torno: 12 }, dueDate: "2026-10-15" }, ctx());
    expect(answer.verdict).toBe("si");
    expect(answer.feasibleDate).toBe("2026-10-15");
  });

  it("responde Sí moviendo trabajos con holgura", () => {
    const answer = canCommit([orderA(), orderB()], { hoursByProcess: { torno: 12 }, dueDate: "2026-10-14" }, ctx());
    expect(answer.verdict).toBe("si_moviendo");
    expect(answer.moved.map((m) => m.folio)).toEqual(["B"]);
    expect(answer.moved[0]!.onTime).toBe(true);
  });

  it("responde No con la fecha factible más cercana", () => {
    const answer = canCommit([orderA(), orderB()], { hoursByProcess: { torno: 30 }, dueDate: "2026-10-14" }, ctx());
    expect(answer.verdict).toBe("no");
    expect(answer.feasibleDate! > "2026-10-14").toBe(true);
  });
});

describe("ciclo de vida de la orden", () => {
  const due = { date: "2026-10-14", time: "17:00" };

  it("agenda recordatorios 24 h antes, el día y al vencer", () => {
    const o = order({ id: "r", due });
    expect(dueReminders(o, TZ, zonedInstant("2026-10-13", "12:00", TZ).getTime(), "2026-10-13")).toEqual([]);
    expect(dueReminders(o, TZ, zonedInstant("2026-10-13", "18:00", TZ).getTime(), "2026-10-13")).toEqual(["before24h"]);
    expect(dueReminders(o, TZ, zonedInstant("2026-10-14", "06:00", TZ).getTime(), "2026-10-14")).toEqual(["dayOf"]);
    expect(dueReminders(o, TZ, zonedInstant("2026-10-14", "17:01", TZ).getTime(), "2026-10-14")).toEqual(["overdue"]);
    const sent = { ...o, reminders: { before24h: true, dayOf: true, overdue: true } };
    expect(dueReminders(sent, TZ, zonedInstant("2026-10-14", "18:00", TZ).getTime(), "2026-10-14")).toEqual([]);
    expect(dueReminders({ ...o, status: "entregada", deliveredAt: "2026-10-14T10:00:00.000Z" }, TZ, Date.now(), "2026-10-20")).toEqual([]);
  });

  it("cierra el servicio tras 3 días sin reclamos; un reclamo abierto lo impide", () => {
    const delivered = order({ id: "e", status: "entregada", deliveredAt: "2026-10-10T15:00:00.000Z" });
    expect(shouldAutoClose(delivered, 3, Date.parse("2026-10-13T14:59:00.000Z"))).toBe(false);
    expect(shouldAutoClose(delivered, 3, Date.parse("2026-10-13T15:00:00.000Z"))).toBe(true);
    const claimed = { ...delivered, claims: [{ id: "c", kind: "garantia" as const, at: "2026-10-11T15:00:00.000Z", description: "Vibra", resolvedAt: null, resolution: null, createdBy: null }] };
    expect(shouldAutoClose(claimed, 3, Date.parse("2026-10-20T15:00:00.000Z"))).toBe(false);
  });

  it("deriva el estado de los pasos y valida transiciones", () => {
    const o = order({ id: "f", status: "en_proceso" });
    expect(statusFromWork(o, [item({ status: "completada" }), item({ status: "completada" })])).toBe("terminada");
    expect(statusFromWork({ status: "recibida", claims: [] }, [item({ status: "en_proceso" })])).toBe("en_proceso");
    expect(statusFromWork({ status: "entregada", claims: [] }, [item({ status: "pendiente" })])).toBe("entregada");
    expect(canTransition("entregada", "garantia")).toBe(true);
    expect(canTransition("cerrada", "recibida")).toBe(false);
    expect(isLate({ due, deliveredAt: zonedInstant("2026-10-14", "17:30", TZ).toISOString(), status: "entregada" }, TZ, NOW)).toBe(true);
  });
});

describe("indicadores de gestión", () => {
  it("mide cumplimiento, satisfacción, garantías y utilización solo de máquinas activas", () => {
    const pinacho = machines().find((m) => m.id === "pinacho")!;
    const kctx = { ...ctx(), machines: [pinacho, machines().find((m) => m.id === "cnc-2")!], now: Date.parse("2026-10-31T23:00:00.000Z"), today: "2026-10-31" };
    const onTime = order({
      id: "g",
      status: "cerrada",
      due: { date: "2026-10-05", time: "17:00" },
      deliveredAt: "2026-10-05T15:00:00.000Z",
      satisfaction: 5,
      price: 1_000_000,
      workItems: [item({ machineId: "pinacho", status: "completada", plannedHours: 10, actualHours: 8, completedAt: "2026-10-05T14:00:00.000Z" })],
    });
    const late = order({
      id: "h",
      status: "entregada",
      due: { date: "2026-10-06", time: "12:00" },
      deliveredAt: "2026-10-07T15:00:00.000Z",
      satisfaction: 3,
      claims: [{ id: "x", kind: "garantia", at: "2026-10-08T15:00:00.000Z", description: "", resolvedAt: null, resolution: null, createdBy: null }],
      workItems: [item({ machineId: "pinacho", status: "completada", plannedHours: 4, actualHours: 4, completedAt: "2026-10-07T14:00:00.000Z" })],
    });
    const [k] = monthlyKpis([onTime, late], kctx, ["2026-10"]);
    expect(k).toMatchObject({ delivered: 2, withDue: 2, onTime: 1, compliance: 0.5, breaches: 1, satisfaction: 4, warranties: 1, hoursWorked: 12, revenue: 1_000_000 });
    // October 2026: 22 weekdays − 1 holiday = 21 × 8 h + 5 Saturdays × 4 h = 188 h (CNC² inactive adds nothing).
    expect(k!.capacityHours).toBe(188);
    const index = managementIndex(k!);
    expect(index.score).toBeGreaterThan(0);
    expect(index.parts).toHaveLength(4);

    const [mk] = machineKpis([onTime, late], kctx, ["2026-10"]);
    expect(mk).toMatchObject({ machineId: "pinacho", stepsDone: 2, plannedHours: 14, hoursWorked: 12, warranties: 1 });
    expect(lastMonths("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("IPC y cambios", () => {
  it("lleva un precio a valor presente con el último IPC publicado", () => {
    const entries = [
      { id: "1", month: "2025-01", index: 140 },
      { id: "2", month: "2026-01", index: 147 },
      { id: "3", month: "2026-09", index: 150 },
    ];
    expect(adjustForInflation(100_000, "2025-01", entries, "2026-10")).toMatchObject({ value: 107_143, toMonth: "2026-09" });
    expect(adjustForInflation(100_000, "2024-05", entries, "2026-10")).toBeNull();
    expect(ipcVariations(entries).find((e) => e.month === "2026-01")!.annual).toBe(5);
  });

  it("registra solo los campos que cambiaron", () => {
    const changes = diffFields({ name: "A", phone: "1", tier: 1 }, { name: "B", phone: "1", tier: 2 }, { name: "Nombre", phone: "Teléfono", tier: "Nivel" });
    expect(changes).toEqual([
      { field: "name", label: "Nombre", from: "A", to: "B" },
      { field: "tier", label: "Nivel", from: "1", to: "2" },
    ]);
    const history = recordChange([], { actorId: "u", actorName: "U", action: "editó", changes }, 1);
    expect(recordChange(history, { actorId: "u", actorName: "U", action: "otra", changes: [] }, 1)).toHaveLength(1);
  });
});

describe("metas del mes", () => {
  const goals = [
    { label: "Meta 1", amount: 30_000_000, bonus: false },
    { label: "Meta 2", amount: 50_000_000, bonus: false },
    { label: "Meta 3", amount: 70_000_000, bonus: false },
    { label: "Meta 4", amount: 90_000_000, bonus: false },
    { label: "Bonus", amount: 100_000_000, bonus: true },
  ];
  it("dice qué metas se cumplieron y cuánto falta para la siguiente", () => {
    const p = goalProgress(42_000_000, goals);
    expect(p.reached.map((g) => g.label)).toEqual(["Meta 1"]);
    expect(p.next?.label).toBe("Meta 2");
    expect(p.missing).toBe(8_000_000);
    expect(p.ratio).toBeCloseTo(0.42);
    expect(goalProgress(120_000_000, goals)).toMatchObject({ next: null, missing: 0, ratio: 1 });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("reloj de jornada", () => {
  const tue = DEFAULT_WEEK_SCHEDULE[1]!; // 7:30–12:00 y 13:30–17:00
  const at = (time: string) => zonedInstant("2026-10-13", time, TZ).getTime();
  it("dice cuánto falta por trabajar sin contar el almuerzo, en 12 h", () => {
    expect(workdayStatus(at("07:00"), "2026-10-13", tue, TZ)).toMatchObject({ phase: "antes", start: "07:30", end: "17:00", remainingMinutes: 480 });
    expect(workdayStatus(at("10:00"), "2026-10-13", tue, TZ)).toMatchObject({ phase: "turno", remainingMinutes: 120 + 210 });
    expect(workdayStatus(at("12:30"), "2026-10-13", tue, TZ)).toMatchObject({ phase: "pausa", resumesAt: "13:30", remainingMinutes: 210 });
    expect(workdayStatus(at("17:05"), "2026-10-13", tue, TZ)).toMatchObject({ phase: "terminada", remainingMinutes: 0 });
    expect(workdayStatus(at("10:00"), "2026-10-18", [], TZ).phase).toBe("libre");
    expect(format12h("07:30")).toBe("7:30 a. m.");
    expect(format12h("13:30")).toBe("1:30 p. m.");
    expect(format12h("00:05")).toBe("12:05 a. m.");
    expect(format12h("12:00")).toBe("12:00 p. m.");
    expect(formatDuration(155)).toBe("2 h 35 min");
    expect(formatDuration(45)).toBe("45 min");
  });
});
