import { describe, expect, it } from "vitest";
import { calendarHours, colombianHolidays, easterSunday } from "./calendar";
import { defaultMachines } from "./defaults";
import { diffFields, recordChange } from "./diff";
import { adjustForInflation, ipcVariations } from "./ipc";
import { lastMonths, managementIndex, monthlyKpis, machineKpis } from "./kpi";
import { canTransition, dueReminders, isLate, shouldAutoClose, statusFromWork } from "./lifecycle";
import { formatNit, parseNit, verificationDigit } from "./nit";
import { canCommit, machineHoursOn, nextUp, occupancy, planOrders, prioritize, type PlanContext } from "./planning";
import { quoteDisplayStatus, quoteTotals } from "./quote";
import type { Machine, Order, WorkItem } from "./schema";
import { zonedInstant } from "./time";

const TZ = "America/Bogota";
const CAL = { workdays: [1, 2, 3, 4, 5, 6], saturdayHours: 4, skipHolidays: true };

describe("NIT y dígito de verificación DIAN", () => {
  it("calcula el DV de NITs conocidos", () => {
    expect(verificationDigit("800197268")).toBe(4); // DIAN
    expect(verificationDigit("890903938")).toBe(8); // Bancolombia
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

  it("suma costo, recargo por dificultad, utilidad e IVA en ese orden", () => {
    const normal = quoteTotals({ ...base, difficulty: 1 });
    expect(normal.materials).toBe(100_000);
    expect(normal.labor).toBe(300_000);
    expect(normal.cost).toBe(400_000);
    expect(normal.surcharge).toBe(0);
    expect(normal.margin).toBe(120_000);
    expect(normal.subtotal).toBe(520_000);
    expect(normal.iva).toBe(98_800);
    expect(normal.total).toBe(618_800);
    expect(normal.unitPrice).toBe(130_000);
    expect(normal.hoursByProcess).toEqual({ torno: 3, fresadora: 1.5 });

    const complicated = quoteTotals({ ...base, difficulty: 2 });
    expect(complicated.surcharge).toBe(60_000);
    expect(complicated.subtotal).toBe(598_000);
    const urgent = quoteTotals({ ...base, difficulty: 3 });
    expect(urgent.surcharge).toBe(100_000);
    expect(urgent.total).toBe(Math.round(650_000 * 1.19));
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
    intake: { receivedAt: "2026-10-10T15:00:00.000Z", quantity: 1, condition: "" },
    intakePhotoIds: [],
    drawingIds: [],
    photoIds: [],
    due: null,
    workItems: [],
    supplies: [],
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
    expect(machineHoursOn(m, "2026-10-13", ctx(), noon)).toBe(3);
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
