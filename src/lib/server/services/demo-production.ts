import "server-only";
import { randomUUID } from "node:crypto";
import { defaultMachines } from "@/lib/domain/defaults";
import { verificationDigit } from "@/lib/domain/nit";
import type { Client, Collection, Machine, Notification, Order, Process, Quote, Settings, Task, WorkItem } from "@/lib/domain/schema";
import { addDays, zonedInstant } from "@/lib/domain/time";
import type { Actor } from "./common";
import { syncTasks } from "./orders";

/** Deterministic pseudo-random numbers so the demo looks the same on every start. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoContext {
  today: string;
  now: Date;
  adminId: string;
  settings: Settings;
  tasks: Collection<Task>;
  notifications: Collection<Notification>;
}

/**
 * Fictitious production data: clients, machines with example tariffs, work
 * orders in every state, quotes and six months of history for the indicators.
 * Every name carries "(ficticio)"; nothing here is real.
 */
export function demoProduction(ctx: DemoContext) {
  const { today, now, adminId, settings } = ctx;
  const tz = settings.timezone;
  const iso = now.toISOString();
  const actor: Actor = { id: adminId, name: "Admin Demo" };
  const random = rng(20261012);
  const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]!;
  const at = (date: string, time = "09:00") => zonedInstant(date, time, tz).toISOString();

  // Example tariffs, only for the demo (the real app starts at $0 until the admin sets them).
  settings.production.processRates = { torno: 55_000, fresadora: 65_000, cepillo: 50_000, cnc: 110_000, prensa: 45_000, soldadura: 60_000, banco: 40_000, pintura: 38_000 };

  const machines: Collection<Machine> = defaultMachines(iso);
  const rates: Record<string, number> = { cnc: 95_000, torno: 48_000, fresadora: 55_000, cepillo: 42_000, prensa: 38_000, soldadura: 50_000, banco: 32_000, pintura: 30_000 };
  for (const m of machines.items) {
    m.hourlyRate = rates[m.process] ?? 0;
    if (m.state === "activa") m.activeSince = addDays(today, -400);
  }
  // CNC² ya llegó: se activa la próxima semana para mostrar la capacidad futura.
  const cnc2 = machines.items.find((m) => m.id === "cnc-2")!;
  cnc2.state = "activa";
  cnc2.activeSince = addDays(today, 7);
  cnc2.description = "Llega la próxima semana (ficticio)";
  // La prensa está en mantenimiento desde ayer.
  const press = machines.items.find((m) => m.id === "prensa")!;
  press.state = "mantenimiento";
  press.stops.push({ id: randomUUID(), from: at(addDays(today, -1), "14:00"), to: null, reason: "Cambio de sellos del cilindro (ficticio)", createdBy: adminId });

  const clientRows: Array<[string, Client["kind"], string, number, string, string]> = [
    ["Ingenio La Esperanza S.A.S. (ficticio)", "empresa", "900000101", 3, "Ing. Marta Ríos (ficticio)", "Buga"],
    ["Agroindustrias del Valle Ltda. (ficticio)", "empresa", "900000202", 2, "Pedro Salas (ficticio)", "Tuluá"],
    ["Transportes El Cruce S.A.S. (ficticio)", "empresa", "900000303", 1, "Luisa Mora (ficticio)", "Cali"],
    ["Molinos San Pedro (ficticio)", "empresa", "900000404", 2, "Hernán Gil (ficticio)", "Buga"],
    ["Carlos Ejemplo (ficticio)", "persona", "1000000505", 1, "", "Guacarí"],
  ];
  const clients: Collection<Client> = {
    schema: 1,
    seq: 0,
    items: clientRows.map(([name, kind, nit, tier, contact, city], i) => ({
      id: `demo-cliente-${i + 1}`,
      kind,
      name,
      nit,
      dv: kind === "empresa" ? String(verificationDigit(nit)) : "",
      companyPhone: kind === "empresa" ? `602 000 00${i}0` : "",
      personalPhone: `300 000 00${i}${i}`,
      contactName: contact,
      email: "",
      city,
      address: "",
      notes: "",
      tier,
      archived: false,
      history: [],
      createdBy: adminId,
      createdAt: iso,
      updatedAt: iso,
    })),
  };
  const client = (i: number) => clients.items[i]!;

  const orders: Collection<Order> = { schema: 1, seq: 0, items: [] };
  const machine = (id: string) => machines.items.find((m) => m.id === id)!;
  const item = (machineId: string, plannedHours: number, over: Partial<WorkItem> = {}): WorkItem => {
    const m = machine(machineId);
    return {
      id: randomUUID(),
      process: m.process,
      machineId,
      positionId: m.positionId,
      description: "",
      plannedHours,
      actualHours: null,
      status: "pendiente",
      taskId: null,
      completedAt: null,
      ...over,
    };
  };

  const order = (over: Partial<Order> & Pick<Order, "title" | "clientId">): Order => {
    orders.seq += 1;
    const c = clients.items.find((x) => x.id === over.clientId);
    const created = over.createdAt ?? iso;
    return {
      id: randomUUID(),
      folio: `OT-${String(orders.seq).padStart(4, "0")}`,
      clientName: c?.name ?? "Cliente de mostrador",
      description: "",
      status: "recibida",
      difficulty: 1,
      urgent: false,
      intake: { receivedAt: created, quantity: 1, condition: "" },
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
      invoice: { pending: false, number: null, invoicedAt: null, none: false },
      claims: [],
      satisfaction: null,
      reminders: { before24h: false, dayOf: false, overdue: false },
      historical: false,
      notes: "",
      history: [{ at: created, actorId: adminId, actorName: actor.name, action: "Registró el ingreso de las piezas", changes: [] }],
      createdBy: adminId,
      createdAt: created,
      updatedAt: iso,
      updatedBy: adminId,
      ...over,
    };
  };

  /* ── Histórico: seis meses de trabajos cerrados para los indicadores ── */
  const titles = [
    "Eje de cola para trapiche", "Buje de bronce SAE 64", "Piñón recto Z24", "Rodillo de banda transportadora", "Brida ciega 6\"",
    "Acople flexible", "Polea en V doble canal", "Camisa para bomba", "Pasadores templados", "Recargue de eje de molino",
    "Soporte de chumacera", "Tornillo sinfín", "Cuchilla de picadora", "Base para motor", "Engranaje helicoidal",
  ];
  const historyMachines = ["pinacho", "wkt", "bouchi", "fresadora", "cnc-1", "soldadura", "banco"];
  for (let back = 6; back >= 1; back--) {
    const monthStart = addDays(today, -30 * back);
    const count = 5 + Math.floor(random() * 4);
    for (let k = 0; k < count; k++) {
      const received = addDays(monthStart, Math.floor(random() * 20));
      const promisedDays = 3 + Math.floor(random() * 8);
      const due = addDays(received, promisedDays);
      const late = random() < 0.2;
      const delivered = addDays(due, late ? 1 + Math.floor(random() * 3) : -Math.floor(random() * 2));
      const steps = 1 + Math.floor(random() * 3);
      const workItems: WorkItem[] = [];
      for (let s = 0; s < steps; s++) {
        const planned = 2 + Math.round(random() * 14);
        workItems.push(
          item(pick(historyMachines), planned, {
            status: "completada",
            actualHours: Math.max(1, Math.round(planned * (0.8 + random() * 0.5))),
            completedAt: at(addDays(delivered, -1), "15:00"),
          }),
        );
      }
      const price = Math.round((300_000 + random() * 3_700_000) / 10_000) * 10_000;
      const claim = random() < 0.12;
      const o = order({
        clientId: pick(clients.items).id,
        title: pick(titles),
        status: "cerrada",
        difficulty: pick([1, 1, 1, 2, 2, 3] as const),
        createdAt: at(received, "08:30"),
        intake: { receivedAt: at(received, "08:30"), quantity: 1 + Math.floor(random() * 20), condition: "" },
        due: { date: due, time: "17:00" },
        workItems,
        supplies: [{ id: randomUUID(), description: "Material (ficticio)", supplier: "Aceros del Valle (ficticio)", quantity: 1, unitCost: Math.round(price * 0.18), status: "conseguido" as const, obtainedAt: null, obtainedBy: null }],
        price,
        finalPrice: price,
        startedAt: at(received, "10:00"),
        finishedAt: at(addDays(delivered, -1), "16:00"),
        deliveredAt: at(delivered, late ? "16:00" : "11:00"),
        closedAt: at(addDays(delivered, 3), "11:00"),
        invoice: { pending: false, number: `FE-${1000 + orders.seq}`, invoicedAt: at(addDays(delivered, 4), "10:00"), none: false },
        satisfaction: late ? pick([3, 3, 4]) : pick([4, 4, 5, 5, 5]),
        reminders: { before24h: true, dayOf: true, overdue: late },
        claims: claim
          ? [{ id: randomUUID(), kind: pick(["garantia", "garantia", "devolucion"] as const), at: at(addDays(delivered, 1), "10:00"), description: "Ajuste fuera de tolerancia (ficticio)", resolvedAt: at(addDays(delivered, 2), "16:00"), resolution: "Se rectificó sin costo", createdBy: adminId }]
          : [],
      });
      orders.items.push(o);
    }
  }

  /* ── Trabajo vivo en el taller ── */
  const dueAt = (days: number, time = "17:00") => ({ date: addDays(today, days), time });
  const live: Order[] = [
    order({
      clientId: client(0).id,
      title: "Eje de transmisión para molino",
      description: "Eje SAE 4140 bonificado. Asiento de rodamiento h6. Chavetero 14×9.",
      difficulty: 2,
      status: "en_proceso",
      createdAt: at(addDays(today, -2), "08:00"),
      intake: { receivedAt: at(addDays(today, -2), "08:00"), quantity: 2, condition: "Ejes originales con desgaste en el asiento del rodamiento (ficticio)" },
      due: dueAt(1),
      price: 2_850_000,
      startedAt: at(addDays(today, -1), "07:30"),
      workItems: [item("pinacho", 10, { status: "en_proceso", actualHours: 4 }), item("fresadora", 3)],
    }),
    order({
      clientId: client(1).id,
      title: "Piñón cónico Z18 (reparación urgente)",
      description: "La cosechadora está parada. Copiar del piñón dañado.",
      difficulty: 2,
      urgent: true,
      status: "recibida",
      createdAt: at(today, "07:10"),
      intake: { receivedAt: at(today, "07:10"), quantity: 1, condition: "Piñón con dos dientes partidos (ficticio)" },
      due: dueAt(0, "16:00"),
      price: 1_900_000,
      workItems: [item("cnc-1", 6), item("banco", 2)],
    }),
    order({
      clientId: client(2).id,
      title: "Bujes de bronce ×40",
      difficulty: 1,
      status: "recibida",
      createdAt: at(addDays(today, -1), "11:00"),
      intake: { receivedAt: at(addDays(today, -1), "11:00"), quantity: 40, condition: "Material del cliente: barra de bronce SAE 64 (ficticio)" },
      due: dueAt(5),
      price: 1_600_000,
      workItems: [item("wkt", 12), item("bouchi", 8)],
    }),
    order({
      clientId: client(4).id,
      title: "Recargue de soldadura en tolva",
      difficulty: 1,
      status: "en_proceso",
      createdAt: at(addDays(today, -3), "15:00"),
      intake: { receivedAt: at(addDays(today, -3), "15:00"), quantity: 1, condition: "Tolva con desgaste por abrasión (ficticio)" },
      due: dueAt(2),
      price: 650_000,
      workItems: [item("soldadura", 5, { status: "bloqueada" })],
    }),
    order({
      clientId: client(3).id,
      title: "Bridas para bomba centrífuga",
      difficulty: 1,
      status: "terminada",
      createdAt: at(addDays(today, -6), "09:00"),
      intake: { receivedAt: at(addDays(today, -6), "09:00"), quantity: 4, condition: "" },
      due: dueAt(1, "10:00"),
      price: 980_000,
      startedAt: at(addDays(today, -5), "07:30"),
      finishedAt: at(addDays(today, -1), "16:30"),
      workItems: [item("bouchi", 7, { status: "completada", actualHours: 6, completedAt: at(addDays(today, -1), "16:30") })],
    }),
    order({
      clientId: client(0).id,
      title: "Rodillos guía ×6",
      difficulty: 1,
      status: "entregada",
      createdAt: at(addDays(today, -9), "09:00"),
      intake: { receivedAt: at(addDays(today, -9), "09:00"), quantity: 6, condition: "" },
      due: { date: addDays(today, -1), time: "17:00" },
      price: 2_200_000,
      finalPrice: 2_200_000,
      startedAt: at(addDays(today, -8), "07:30"),
      finishedAt: at(addDays(today, -2), "15:00"),
      deliveredAt: at(addDays(today, -1), "11:00"),
      satisfaction: 5,
      reminders: { before24h: true, dayOf: true, overdue: false },
      workItems: [item("pinacho", 14, { status: "completada", actualHours: 15, completedAt: at(addDays(today, -2), "15:00") })],
    }),
    order({
      clientId: client(1).id,
      title: "Camisas para cilindro hidráulico",
      difficulty: 2,
      status: "cerrada",
      createdAt: at(addDays(today, -15), "09:00"),
      intake: { receivedAt: at(addDays(today, -15), "09:00"), quantity: 2, condition: "" },
      due: { date: addDays(today, -6), time: "17:00" },
      price: 3_400_000,
      finalPrice: 3_400_000,
      deliveredAt: at(addDays(today, -6), "10:00"),
      closedAt: at(addDays(today, -3), "10:00"),
      invoice: { pending: true, number: null, invoicedAt: null, none: false },
      satisfaction: 4,
      reminders: { before24h: true, dayOf: true, overdue: false },
      workItems: [item("cnc-1", 9, { status: "completada", actualHours: 10, completedAt: at(addDays(today, -7), "16:00") })],
    }),
    order({
      clientId: client(3).id,
      title: "Tornillo sinfín para transportador",
      difficulty: 2,
      status: "en_proceso",
      createdAt: at(addDays(today, -8), "09:00"),
      intake: { receivedAt: at(addDays(today, -8), "09:00"), quantity: 1, condition: "" },
      due: { date: addDays(today, -1), time: "12:00" },
      price: 2_750_000,
      startedAt: at(addDays(today, -6), "07:30"),
      reminders: { before24h: true, dayOf: true, overdue: true },
      workItems: [item("soldadura", 6, { status: "completada", actualHours: 7, completedAt: at(addDays(today, -2), "15:00") }), item("bouchi", 5)],
    }),
    order({
      clientId: client(2).id,
      title: "Muñón de eje trasero",
      difficulty: 1,
      status: "garantia",
      createdAt: at(addDays(today, -20), "09:00"),
      intake: { receivedAt: at(addDays(today, -20), "09:00"), quantity: 1, condition: "" },
      due: { date: addDays(today, -12), time: "17:00" },
      price: 1_250_000,
      deliveredAt: at(addDays(today, -12), "11:00"),
      satisfaction: 3,
      reminders: { before24h: true, dayOf: true, overdue: false },
      claims: [{ id: randomUUID(), kind: "garantia", at: at(addDays(today, -2), "09:00"), description: "Juego excesivo en el rodamiento (ficticio)", resolvedAt: null, resolution: null, createdBy: adminId }],
      workItems: [
        item("wkt", 6, { status: "completada", actualHours: 6, completedAt: at(addDays(today, -13), "16:00") }),
        item("wkt", 2, { description: "Reproceso por garantía: rectificar asiento" }),
      ],
    }),
  ];
  orders.items.push(...live);

  const tasks = ctx.tasks;
  const docs = { tasks, machines, notifications: ctx.notifications };
  for (const o of live) {
    syncTasks(docs, o, actor, today);
    // Mirror the step status the demo shows into its task.
    for (const w of o.workItems) {
      const task = tasks.items.find((t) => t.id === w.taskId);
      if (!task) continue;
      task.status = w.status;
      task.actualHours = w.actualHours;
      if (w.status === "bloqueada") task.blockedReason = "Falta electrodo E7018 de 1/8\" (ficticio)";
      if (w.status === "en_proceso") task.startedAt = o.startedAt;
    }
  }
  // Generated tasks notify their positions; the demo starts with a clean inbox for them.
  ctx.notifications.items = ctx.notifications.items.filter((n) => n.type !== "task_assigned");

  /* ── Cotizaciones ── */
  const quotes: Collection<Quote> = { schema: 1, seq: 0, items: [] };
  const quote = (over: Partial<Quote> & Pick<Quote, "title">): Quote => {
    quotes.seq += 1;
    const c = clients.items.find((x) => x.id === over.clientId);
    return {
      id: randomUUID(),
      folio: `COT-${String(quotes.seq).padStart(4, "0")}`,
      clientId: null,
      clientName: c?.name ?? "Cliente",
      description: "",
      quantity: 1,
      materials: [],
      labor: [],
      difficulty: 1,
      urgent: false,
      marginPct: 35,
      extraMarginPct: 0,
      ivaPct: 19,
      validDays: 15,
      status: "borrador",
      issuedAt: null,
      decidedAt: null,
      orderId: null,
      drawingIds: [],
      notes: "",
      history: [],
      createdBy: adminId,
      createdAt: iso,
      updatedAt: iso,
      ...over,
    };
  };
  const labor = (process: Process, hours: number) => ({ id: randomUUID(), process, machineId: null, description: "", hours, rate: settings.production.processRates[process] });
  quotes.items.push(
    quote({
      clientId: client(0).id,
      clientName: client(0).name,
      title: "Corona dentada Z64 módulo 8",
      quantity: 1,
      difficulty: 2,
      extraMarginPct: 15,
      materials: [{ id: randomUUID(), description: "Disco acero 4140 Ø540×90", quantity: 1, unitCost: 1_350_000 }],
      labor: [labor("torno", 6), labor("cnc", 14), labor("banco", 2)],
      status: "enviada",
      issuedAt: at(addDays(today, -3), "10:00"),
    }),
    quote({
      clientId: client(3).id,
      clientName: client(3).name,
      title: "Cuchillas para picadora ×8",
      quantity: 8,
      materials: [{ id: randomUUID(), description: "Platina AISI D2", quantity: 8, unitCost: 95_000 }],
      labor: [labor("fresadora", 6), labor("banco", 3)],
    }),
    quote({
      clientId: client(2).id,
      clientName: client(2).name,
      title: "Bujes de bronce ×40",
      quantity: 40,
      labor: [labor("torno", 20)],
      status: "aprobada",
      issuedAt: at(addDays(today, -4), "10:00"),
      decidedAt: at(addDays(today, -1), "11:00"),
      orderId: live[2]!.id,
    }),
  );
  live[2]!.quoteId = quotes.items[2]!.id;

  return { machines, clients, orders, quotes };
}
