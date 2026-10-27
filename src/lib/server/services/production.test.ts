import { beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateAccess } from "@/lib/domain/contracts";
import { timeInZone, todayIn } from "@/lib/domain/time";
import type { Principal } from "../auth/principal";
import { Db, setDbForTests } from "../store";
import { MemoryAttachmentStore, setAttachmentStoreForTests } from "../store/attachments";
import { MemoryRawStore } from "../store/memory";

vi.mock("../auth/password", async (orig) => {
  const real = await orig<typeof import("../auth/password")>();
  return {
    ...real,
    hashPassword: async (p: string) => `test$${p}`,
    verifyPassword: async (p: string, stored: string) => stored === `test$${p}`,
    burnPasswordCheck: async () => undefined,
    needsRehash: () => false,
  };
});

const team = await import("./team");
const work = await import("./work");
const orders = await import("./orders");
const quotes = await import("./quotes");
const catalog = await import("./catalog");
const scheduler = await import("./scheduler");
const files = await import("./attachments");
const { buildSync } = await import("./sync");

let db: Db;
let raw: MemoryRawStore;

async function principalFor(username: string): Promise<Principal> {
  const { users, positions, settings } = await db.read(["users", "positions", "settings"]);
  const user = users.items.find((u) => u.username === username)!;
  const today = todayIn(settings.timezone);
  const access = evaluateAccess(user, positions.items, today);
  if (!access.ok) throw new Error(`no access: ${access.reason}`);
  return { user, position: access.position, isAdmin: access.isAdmin, scope: access.scope, settings, today, claims: { sub: user.id, sv: 0, iat: 0, exp: 0 }, incomplete: false, impersonator: null };
}

async function setup() {
  await db.transact(["users", "settings"], "seed", ({ users, settings }) => {
    const now = new Date().toISOString();
    users.items.push({
      id: "admin-1",
      username: "jefe",
      displayName: "Jefe",
      passwordHash: "test$x",
      kind: "admin",
      status: "active",
      phone: null,
      requestedPositionId: null,
      registrationNote: null,
      rejectionReason: null,
      consentAt: now,
      consentVersion: settings.legal.policyVersion,
      mustChangePassword: false,
      sessionVersion: 0,
      failedLogins: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
      approvedBy: null,
      approvedAt: now,
      lastLoginAt: null,
      monthlySalary: null,
      transportAllowance: false,
      adminScope: "total",
    });
  });
  const admin = await principalFor("jefe");
  await team.createAccount(admin, {
    displayName: "Tornero Uno",
    username: "tornero1",
    tempPassword: "frase temporal segura",
    phone: null,
    kind: "staff",
    positionId: "tornero-1",
    replaceCurrent: false,
    startDate: admin.today,
    endDate: null,
    notes: null,
  });
  await team.createAccount(admin, {
    displayName: "Fresador",
    username: "fresador",
    tempPassword: "frase temporal segura",
    phone: null,
    kind: "staff",
    positionId: "fresadora",
    replaceCurrent: false,
    startDate: admin.today,
    endDate: null,
    notes: null,
  });
  return { admin, t1: await principalFor("tornero1"), f1: await principalFor("fresador") };
}

const baseOrder = (over: Partial<Parameters<typeof orders.createOrder>[1]> = {}) => ({
  clientId: null,
  clientName: "Cliente de mostrador",
  title: "Eje de transmisión",
  description: "",
  difficulty: 1 as const,
  quantity: 2,
  condition: "Desgaste en asiento",
  receivedAt: null,
  due: { date: "2099-01-10", time: "17:00" },
  workItems: [
    { process: "torno" as const, machineId: "pinacho", description: "Desbaste y acabado", plannedHours: 6 },
    { process: "fresadora" as const, machineId: "fresadora", description: "Chavetero", plannedHours: 2 },
  ],
  supplies: [],
  price: 1_000_000,
  notes: "",
  ...over,
});

beforeEach(() => {
  raw = new MemoryRawStore();
  db = new Db(raw);
  setDbForTests(db);
  setAttachmentStoreForTests(new MemoryAttachmentStore());
});

describe("orden de trabajo → tareas por puesto", () => {
  it("genera una tarea por paso para el puesto de cada máquina y avisa", async () => {
    const { admin, t1, f1 } = await setup();
    const { order, notifications } = await orders.createOrder(admin, baseOrder());
    expect(order.folio).toBe("OT-0001");
    expect(order.workItems.map((w) => w.positionId)).toEqual(["tornero-1", "fresadora"]);
    expect(notifications.map((n) => n.audience)).toEqual([
      { kind: "position", positionId: "tornero-1" },
      { kind: "position", positionId: "fresadora" },
    ]);

    const syncT1 = await buildSync(t1);
    expect(syncT1.tasks).toHaveLength(1);
    expect(syncT1.tasks[0]).toMatchObject({ orderId: order.id, machineId: "pinacho", plannedHours: 6, positionId: "tornero-1" });
    expect(syncT1.production.briefs?.[0]).toMatchObject({ folio: "OT-0001", due: { date: "2099-01-10" } });
    expect(syncT1.production.orders).toBeUndefined();
    expect(syncT1.production.clients).toBeUndefined();
    // Costs never reach workers.
    expect(syncT1.production.settings).toBeUndefined();
    expect(syncT1.production.machines.every((m) => m.hourlyRate === 0 && m.history.length === 0)).toBe(true);
    expect((await buildSync(f1)).tasks[0]!.machineId).toBe("fresadora");
  });

  it("el trabajador reporta horas; al terminar todos los pasos la OT queda lista y avisa", async () => {
    const { admin, t1, f1 } = await setup();
    const { order } = await orders.createOrder(admin, baseOrder());
    const taskOf = async (p: Principal) => (await buildSync(p)).tasks[0]!;

    const { task } = await work.updateTask(t1, (await taskOf(t1)).id, { status: "en_proceso" });
    let { orders: list } = await db.read(["orders"]);
    expect(list.items[0]!.status).toBe("en_proceso");

    await work.updateTask(t1, task.id, { status: "completada", actualHours: 7.5 });
    const { notifications } = await work.updateTask(f1, (await taskOf(f1)).id, { status: "completada", actualHours: 2 });
    expect(notifications.some((n) => n.type === "order_ready")).toBe(true);

    ({ orders: list } = await db.read(["orders"]));
    const done = list.items.find((o) => o.id === order.id)!;
    expect(done.status).toBe("terminada");
    expect(done.workItems.map((w) => w.actualHours)).toEqual([7.5, 2]);
    expect(done.history.some((h) => h.action.includes("terminados"))).toBe(true);

    // Order-owned fields cannot be edited through the task.
    await expect(work.updateTask(admin, task.id, { title: "otro" })).rejects.toMatchObject({ code: "order_owned" });
    await expect(work.deleteTask(admin, task.id)).rejects.toMatchObject({ code: "order_owned" });
  });

  it("registra trazabilidad con diff de campos y reasigna tareas al cambiar la ruta", async () => {
    const { admin } = await setup();
    const { order } = await orders.createOrder(admin, baseOrder());
    const { order: edited } = await orders.updateOrder(admin, order.id, {
      title: "Eje de transmisión rev. B",
      due: { date: "2099-01-12", time: "10:00" },
      workItems: [{ id: order.workItems[0]!.id, process: "fresadora", machineId: "fresadora", description: "", plannedHours: 6 }],
    });
    const entry = edited.history.at(-1)!;
    expect(entry).toMatchObject({ actorName: "Jefe", action: "Editó la orden" });
    expect(entry.changes.map((c) => c.label)).toEqual(expect.arrayContaining(["Trabajo", "Entrega", "Ruta de procesos"]));
    const { tasks } = await db.read(["tasks"]);
    expect(tasks.items.filter((t) => t.orderId === order.id)).toHaveLength(1);
    expect(tasks.items.find((t) => t.orderId === order.id)!.positionId).toBe("fresadora");
  });
});

describe("entrega, cierre automático y facturación", () => {
  it("cierra el servicio tras 3 días sin reclamos y prende FACTURAR", async () => {
    const { admin } = await setup();
    const { order } = await orders.createOrder(admin, baseOrder());
    await orders.orderAction(admin, order.id, { action: "deliver", satisfaction: 5, finalPrice: null });
    let { orders: list } = await db.read(["orders"]);
    expect(list.items[0]).toMatchObject({ status: "entregada", satisfaction: 5 });
    const { tasks } = await db.read(["tasks"]);
    expect(tasks.items.every((t) => t.status === "completada")).toBe(true);

    expect((await scheduler.runScheduler(Date.now() + 2 * 86_400_000)).closed).toBe(0);
    const result = await scheduler.runScheduler(Date.now() + 3 * 86_400_000 + 60_000);
    expect(result.closed).toBe(1);
    expect(result.notifications[0]).toMatchObject({ type: "order_invoice", urgent: true, title: "FACTURAR OT-0001" });
    ({ orders: list } = await db.read(["orders"]));
    expect(list.items[0]).toMatchObject({ status: "cerrada", invoice: { pending: true } });
    expect((await buildSync(admin)).alerts.some((a) => a.id === "invoice")).toBe(true);

    await orders.orderAction(admin, order.id, { action: "invoice", number: "FE-120" });
    ({ orders: list } = await db.read(["orders"]));
    expect(list.items[0]!.invoice).toMatchObject({ pending: false, number: "FE-120" });
    // Idempotent: nothing more to do.
    expect((await scheduler.runScheduler(Date.now() + 10 * 86_400_000)).closed).toBe(0);
  });

  it("un reclamo abre garantía, frena el cierre y genera reproceso", async () => {
    const { admin } = await setup();
    const { order } = await orders.createOrder(admin, baseOrder());
    await orders.orderAction(admin, order.id, { action: "deliver", satisfaction: null, finalPrice: null });
    const { notifications } = await orders.orderAction(admin, order.id, { action: "claim", kind: "garantia", description: "Vibra" });
    expect(notifications[0]).toMatchObject({ type: "order_claim", urgent: true });
    expect((await scheduler.runScheduler(Date.now() + 10 * 86_400_000)).closed).toBe(0);

    const { order: rework } = await orders.updateOrder(admin, order.id, {
      workItems: [
        ...order.workItems.map((w) => ({ id: w.id, process: w.process, machineId: w.machineId, description: w.description, plannedHours: w.plannedHours })),
        { process: "torno", machineId: "pinacho", description: "Reproceso", plannedHours: 1 },
      ],
    });
    expect(rework.status).toBe("garantia");
    const { tasks } = await db.read(["tasks"]);
    expect(tasks.items.filter((t) => t.orderId === order.id && t.status !== "completada")).toHaveLength(1);
  });

  it("agenda recordatorios una sola vez", async () => {
    const { admin } = await setup();
    const soon = new Date(Date.now() + 10 * 3_600_000);
    await orders.createOrder(admin, baseOrder({ due: { date: todayIn("America/Bogota", soon), time: timeInZone(soon, "America/Bogota") } }));
    const first = await scheduler.runScheduler();
    expect(first.reminders).toBeGreaterThanOrEqual(1);
    expect((await scheduler.runScheduler()).reminders).toBe(0);
  });
});

describe("cotizador → orden de trabajo", () => {
  it("aprobar una cotización crea la OT con su ruta, insumos y precio", async () => {
    const { admin } = await setup();
    await db.transact(["settings"], "tarifas", ({ settings }) => {
      settings.production.processRates.torno = 50_000;
    });
    const quote = await quotes.createQuote(admin, {
      clientId: null,
      clientName: "Molinos",
      title: "Piñón",
      description: "",
      quantity: 1,
      materials: [{ description: "Acero", quantity: 1, unitCost: 100_000 }],
      labor: [{ process: "torno", description: "", hours: 4, rate: null }],
      difficulty: 2,
      urgent: true,
      marginPct: 20,
      ivaPct: null,
      validDays: null,
      notes: "",
    });
    // Dificultad mayor (+15) y urgencia (+125) se suman a la utilidad base.
    expect(quote).toMatchObject({ folio: "COT-0001", ivaPct: 19, validDays: 15, extraMarginPct: 140 });
    expect(quote.labor[0]!.rate).toBe(50_000);
    await quotes.setQuoteStatus(admin, quote.id, "enviada");
    const { order } = await quotes.approveQuote(admin, quote.id, { due: { date: "2099-02-01", time: "12:00" }, condition: "", machines: {} });
    // (100.000 + 200.000) × (1 + 0,20 + 0,15 + 1,25) = 780.000 antes de IVA.
    expect(order.price).toBe(780_000);
    expect(order.urgent).toBe(true);
    expect(order.workItems[0]).toMatchObject({ process: "torno", plannedHours: 4 });
    expect(order.workItems[0]!.machineId).not.toBeNull();
    expect(order.supplies[0]).toMatchObject({ description: "Acero", unitCost: 100_000 });
    await expect(quotes.updateQuote(admin, quote.id, { title: "x" })).rejects.toMatchObject({ code: "quote_locked" });
  });
});

describe("máquinas inactivas y mantenimiento", () => {
  it("una máquina inactiva no recibe trabajo; activada con fecha sí", async () => {
    const { admin } = await setup();
    await expect(
      orders.createOrder(admin, baseOrder({ workItems: [{ process: "cnc", machineId: "cnc-2", description: "", plannedHours: 3 }] })),
    ).rejects.toMatchObject({ code: "machine_inactive" });
    const { machine } = await catalog.updateMachine(admin, "cnc-2", { state: "activa", activeSince: "2099-01-01" });
    expect(machine).toMatchObject({ state: "activa", activeSince: "2099-01-01" });
    await orders.createOrder(admin, baseOrder({ workItems: [{ process: "cnc", machineId: "cnc-2", description: "", plannedHours: 3 }] }));
    await expect(catalog.updateMachine(admin, "cnc-2", { state: "inactiva" })).rejects.toMatchObject({ code: "machine_busy" });
  });

  it("mantenimiento abre un paro y lo cierra al volver", async () => {
    const { admin } = await setup();
    const { notifications } = await catalog.updateMachine(admin, "pinacho", { state: "mantenimiento", stopReason: "Cambio de correas" });
    expect(notifications.map((n) => n.audience)).toEqual([{ kind: "admins" }, { kind: "position", positionId: "tornero-1" }]);
    const { machine } = await catalog.updateMachine(admin, "pinacho", { state: "activa" });
    expect(machine.stops).toHaveLength(1);
    expect(machine.stops[0]!.to).not.toBeNull();
    expect(machine.history.at(-1)!.action).toContain("Activa");
  });
});

describe("clientes con NIT", () => {
  it("valida el DV, impide duplicados y guarda historial", async () => {
    const { admin } = await setup();
    const input = { kind: "empresa" as const, name: "DIAN", nit: "800.197.268-4", companyPhone: "", personalPhone: "", contactName: "", email: "", city: "", address: "", notes: "", tier: 1 };
    const client = await catalog.createClient(admin, input);
    expect(client).toMatchObject({ nit: "800197268", dv: "4" });
    await expect(catalog.createClient(admin, { ...input, nit: "800197268-5" })).rejects.toMatchObject({ code: "nit_dv" });
    await expect(catalog.createClient(admin, { ...input, nit: "800197268" })).rejects.toMatchObject({ code: "nit_taken" });
    const edited = await catalog.updateClient(admin, client.id, { tier: 3, companyPhone: "602 123" });
    expect(edited.history.at(-1)!.changes.map((c) => c.label)).toEqual(["Teléfono empresarial", "Nivel"]);
  });
});

describe("adjuntos", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

  it("valida el contenido real y solo lo sirve a quien trabaja en la OT", async () => {
    const { admin, t1 } = await setup();
    const { order } = await orders.createOrder(admin, baseOrder({ workItems: [{ process: "torno", machineId: "pinacho", description: "", plannedHours: 1 }] }));
    await expect(
      files.uploadAttachment(admin, { kind: "plano", orderId: order.id, quoteId: null, name: "x.png", declaredMime: "image/png", bytes: new TextEncoder().encode("<script>") }),
    ).rejects.toMatchObject({ status: 415 });
    await expect(
      files.uploadAttachment(admin, { kind: "plano", orderId: order.id, quoteId: null, name: "x.pdf", declaredMime: "application/pdf", bytes: PNG }),
    ).rejects.toMatchObject({ code: "mime_mismatch" });

    const attachment = await files.uploadAttachment(admin, { kind: "plano", orderId: order.id, quoteId: null, name: "../../plano eje.png", declaredMime: "image/png", bytes: PNG });
    expect(attachment.name).toBe("plano eje.png");
    expect(attachment.path).toMatch(/^data\/adjuntos\/\d{4}\/\d{2}\/[\w-]+\.png$/);
    const { orders: list } = await db.read(["orders"]);
    expect(list.items[0]!.drawingIds).toEqual([attachment.id]);

    expect((await files.readAttachment(t1, attachment.id)).bytes).toEqual(PNG);
    const outsider = await principalFor("fresador");
    await expect(files.readAttachment(outsider, attachment.id)).rejects.toMatchObject({ status: 403 });
    expect((await buildSync(t1)).production.attachments.map((a) => a.id)).toEqual([attachment.id]);
    expect(JSON.stringify((await buildSync(admin)).production.attachments)).not.toContain("data/adjuntos");
  });
});

describe("demostración", () => {
  it("siembra datos válidos con OT en todos los estados e indicadores", async () => {
    const { seedDemo } = await import("./demo");
    const { buildIndicators } = await import("./indicators");
    db = new Db(new MemoryRawStore(), seedDemo);
    setDbForTests(db);
    const docs = await db.read(["orders", "quotes", "clients", "machines", "tasks", "users"]);
    const statuses = new Set(docs.orders.items.map((o) => o.status));
    for (const s of ["recibida", "en_proceso", "terminada", "entregada", "cerrada", "garantia"]) expect(statuses.has(s as never)).toBe(true);
    expect(docs.tasks.items.some((t) => t.orderId)).toBe(true);
    expect(docs.quotes.items.length).toBeGreaterThan(0);
    const admin = await principalFor("admin.demo");
    const payload = await buildSync(admin);
    expect(payload.alerts.map((a) => a.id)).toEqual(expect.arrayContaining(["invoice", "overdue", "claims"]));
    const indicators = await buildIndicators(admin, 6);
    expect(indicators.monthly.some((m) => m.delivered > 0)).toBe(true);
    expect(indicators.period.index.score).not.toBeNull();
  });
});

describe("almacenamiento particionado", () => {
  it("guarda las OT por mes y un cambio reescribe solo su archivo", async () => {
    const { admin } = await setup();
    await orders.createHistoricalOrder(admin, {
      clientId: null,
      clientName: "Antiguo",
      title: "Trabajo 2025",
      description: "",
      quantity: 1,
      receivedAt: "2025-03-02",
      deliveredAt: "2025-03-09",
      dueDate: "2025-03-08",
      workItems: [{ process: "torno", machineId: "pinacho", hours: 5 }],
      supplies: [],
      price: 500_000,
      satisfaction: 4,
      invoiceNumber: "FE-1",
      notes: "",
    });
    await orders.createOrder(admin, baseOrder());
    const snapshot = await raw.read([], { prefixes: ["data/ordenes/"] });
    const paths = [...snapshot.files.keys()].sort();
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe("data/ordenes/2025-03.json");
    const oldText = snapshot.files.get(paths[0]!)!.text;

    await orders.createOrder(admin, baseOrder({ title: "Otra" }));
    const after = await raw.read([], { prefixes: ["data/ordenes/"] });
    expect(after.files.get(paths[0]!)!.text).toBe(oldText);
    const { orders: merged } = await db.read(["orders"]);
    expect(merged.items.map((o) => o.folio).sort()).toEqual(["OT-0001", "OT-0002", "OT-0003"]);
  });
});

describe("garantía de S.M.I.", () => {
  it("90 días desde la entrega; la soldadura no tiene garantía", async () => {
    const { admin } = await setup();
    const { order: welding } = await orders.createOrder(
      admin,
      baseOrder({ workItems: [{ process: "soldadura", machineId: "soldadura", description: "Recargue", plannedHours: 2 }] }),
    );
    await orders.orderAction(admin, welding.id, { action: "deliver", satisfaction: null, finalPrice: null });
    await expect(orders.orderAction(admin, welding.id, { action: "claim", kind: "garantia", description: "Se partió" })).rejects.toMatchObject({ code: "no_warranty" });
    // A return can still be registered.
    await orders.orderAction(admin, welding.id, { action: "claim", kind: "devolucion", description: "La devuelven" });

    const { order } = await orders.createOrder(admin, baseOrder());
    await orders.orderAction(admin, order.id, { action: "deliver", satisfaction: null, finalPrice: null });
    await db.transact(["orders"], "entregada hace 91 días", ({ orders: list }) => {
      list.items.find((o) => o.id === order.id)!.deliveredAt = new Date(Date.now() - 91 * 86_400_000).toISOString();
    });
    await expect(orders.orderAction(admin, order.id, { action: "claim", kind: "garantia", description: "Vibra" })).rejects.toMatchObject({ code: "warranty_expired" });
  });
});

describe("operarios sin sesión y tablero del taller", () => {
  it("los operarios no inician sesión; coordinación entra con acceso de gestión", async () => {
    const { admin } = await setup();
    const { users, positions } = await db.read(["users", "positions"]);
    const tornero = users.items.find((u) => u.username === "tornero1")!;
    expect(evaluateAccess(tornero, positions.items, admin.today, { staffLogin: false })).toMatchObject({ ok: false, reason: "board_only" });
    expect(evaluateAccess(tornero, positions.items, admin.today, { staffLogin: true })).toMatchObject({ ok: true, scope: null });

    await team.createAccount(admin, {
      displayName: "Coordinador",
      username: "coordinador",
      tempPassword: "frase temporal segura",
      phone: null,
      kind: "staff",
      positionId: "coordinador-produccion",
      replaceCurrent: false,
      startDate: admin.today,
      endDate: null,
      notes: null,
    });
    const after = await db.read(["users", "positions"]);
    const coord = after.users.items.find((u) => u.username === "coordinador")!;
    expect(evaluateAccess(coord, after.positions.items, admin.today, { staffLogin: false })).toMatchObject({ ok: true, isAdmin: true, scope: "gestion" });
  });

  it("registra un operario sin usuario ni contraseña", async () => {
    const { admin } = await setup();
    await team.createAccount(admin, {
      displayName: "Ana Ejemplo Pérez",
      username: "",
      tempPassword: "",
      phone: null,
      kind: "staff",
      positionId: "programador-cnc",
      replaceCurrent: false,
      startDate: admin.today,
      endDate: null,
      notes: null,
    });
    const { users } = await db.read(["users"]);
    expect(users.items.find((u) => u.displayName === "Ana Ejemplo Pérez")!.username).toMatch(/^ana\.ejemplo\.perez\.[0-9a-f]{4}$/);
  });

  it("el tablero muestra la cola por operario sin clientes ni precios y exige el enlace secreto", async () => {
    const { admin } = await setup();
    const board = await import("./board");
    await orders.createOrder(admin, baseOrder({ clientName: "Ingenio Secreto", price: 9_999_000, urgent: true }));
    await expect(board.boardFor("cualquiera")).rejects.toMatchObject({ status: 404 });
    const token = await board.boardToken(admin, false);
    expect(await board.boardToken(admin, false)).toBe(token);
    const view = await board.boardFor(token);
    const henry = view.groups.find((g) => g.id === "tornero-1")!;
    expect(henry.operator).toBe("Tornero Uno");
    const pinacho = henry.machines.find((m) => m.id === "pinacho")!;
    expect(pinacho.jobs[0]).toMatchObject({ folio: "OT-0001", urgent: true, hours: 6 });
    const json = JSON.stringify(view);
    expect(json).not.toContain("Ingenio Secreto");
    expect(json).not.toContain("9999000");
    // Rotating the link invalidates the old one.
    const fresh = await board.boardToken(admin, true);
    expect(fresh).not.toBe(token);
    await expect(board.boardFor(token)).rejects.toMatchObject({ status: 404 });
  });
});

describe("ganancias del mes", () => {
  it("ventas entregadas menos insumos y las dos quincenas, con lo que se paga a cada quien", async () => {
    const { admin } = await setup();
    const finance = await import("./finance");
    const payroll = await import("./payroll");
    const { order } = await orders.createOrder(admin, baseOrder({ price: 2_000_000, supplies: [{ description: "Acero", supplier: "", quantity: 1, unitCost: 300_000 }] }));
    await orders.orderAction(admin, order.id, { action: "deliver", satisfaction: null, finalPrice: null });
    const { users } = await db.read(["users"]);
    await payroll.setPay(admin, users.items.find((u) => u.username === "tornero1")!.id, { monthlySalary: 2_100_000 });
    // A contract that covers the whole month (setup signs it today).
    await db.transact(["positions"], "contrato desde antes", ({ positions }) => {
      positions.items.find((p) => p.id === "tornero-1")!.contract!.startDate = "2020-01-01";
    });

    const report = await finance.financeReport(admin, null);
    expect(report).toMatchObject({ sales: 2_000_000, supplies: 300_000 });
    const tornero = report.payroll.find((p) => p.name === "Tornero Uno")!;
    // Sin horas extra: 1.050.000 por quincena menos salud y pensión (8 %).
    expect(tornero.q1).toMatchObject({ earned: 1_050_000, net: 966_000 });
    expect(tornero.net).toBe(1_932_000);
    expect(report.profit).toBe(2_000_000 - 300_000 - report.payrollQ1 - report.payrollQ2);
    expect(report.goals.progress.next?.label).toBe("Meta 1");
    await expect(finance.financeReport(admin, "2026-13")).rejects.toMatchObject({ status: 400 });
  });
});

describe("eliminar órdenes", () => {
  it("gerencia puede borrar una orden entregada; gestión no", async () => {
    const { admin, t1 } = await setup();
    const { order } = await orders.createOrder(admin, baseOrder());
    await orders.orderAction(admin, order.id, { action: "deliver", satisfaction: null, finalPrice: null });
    await expect(orders.deleteOrder(t1, order.id)).rejects.toMatchObject({ status: 403 });
    const owner = { ...admin, scope: "total" as const };
    await orders.deleteOrder(owner, order.id);
    const { orders: list } = await db.read(["orders"]);
    expect(list.items.some((o) => o.id === order.id)).toBe(false);
  });
});

describe("insumos requeridos por orden", () => {
  const add = (admin: Principal, orderId: string, name: string, quantity: number, unit = "kg") =>
    orders.orderAction(admin, orderId, { action: "supplyAdd", name, quantity, unit, note: null });

  it("el mismo insumo en dos órdenes: «Ya está» solo cumple la orden donde se marcó", async () => {
    const { admin } = await setup();
    const { supplyRows, groupSupplies } = await import("@/lib/domain/supplies");
    const a = (await orders.createOrder(admin, baseOrder({ title: "Eje A" }))).order;
    const b = (await orders.createOrder(admin, baseOrder({ title: "Eje B" }))).order;
    await add(admin, a.id, "Electrodo 6013", 2);
    await add(admin, b.id, "  electrodo 6013 ", 3);

    let list = (await db.read(["orders"])).orders.items;
    const grouped = groupSupplies(supplyRows(list));
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ total: 5, unit: "kg" });
    expect(grouped[0]!.rows.map((r) => r.folio)).toEqual([a.folio, b.folio]);

    const lineA = list.find((o) => o.id === a.id)!.requiredSupplies[0]!;
    const { order } = await orders.orderAction(admin, a.id, { action: "supplyDone", supplyId: lineA.id, done: true });
    expect(order.requiredSupplies[0]).toMatchObject({ status: "conseguido", obtainedBy: "admin-1" });

    list = (await db.read(["orders"])).orders.items;
    expect(list.find((o) => o.id === b.id)!.requiredSupplies[0]).toMatchObject({ status: "pendiente", quantity: 3 });
    // Sale del listado de pendientes, pero queda registrado en su orden.
    expect(supplyRows(list).map((r) => r.folio)).toEqual([b.folio]);
    expect(supplyRows(list, [], { includeDone: true })).toHaveLength(2);
    expect(list.find((o) => o.id === a.id)!.requiredSupplies).toHaveLength(1);

    // Deshacer la devuelve a pendientes.
    await orders.orderAction(admin, a.id, { action: "supplyDone", supplyId: lineA.id, done: false });
    list = (await db.read(["orders"])).orders.items;
    expect(supplyRows(list)).toHaveLength(2);
  });

  it("no pide insumos de una orden cancelada o entregada, y valida el id", async () => {
    const { admin } = await setup();
    const { supplyRows } = await import("@/lib/domain/supplies");
    const { order } = await orders.createOrder(admin, baseOrder());
    await add(admin, order.id, "Lija", 10, "hojas");
    await expect(orders.orderAction(admin, order.id, { action: "supplyRemove", supplyId: "no-existe" })).rejects.toMatchObject({ status: 404 });
    await orders.orderAction(admin, order.id, { action: "deliver", satisfaction: null, finalPrice: null });
    await expect(add(admin, order.id, "Otro", 1)).rejects.toMatchObject({ status: 409 });
    // Una orden entregada ya no deja insumos pendientes en el listado general.
    expect(supplyRows((await db.read(["orders"])).orders.items)).toHaveLength(0);
  });
});

describe("compras sueltas", () => {
  it("se piden sin orden, se enlazan a una orden y se marcan sin tocar las de las órdenes", async () => {
    const { admin } = await setup();
    const { supplyRows, groupSupplies, shoppingListText } = await import("@/lib/domain/supplies");
    const { order } = await orders.createOrder(admin, baseOrder({ title: "Eje A" }));

    // Suelta y también directa a la orden desde el mismo servicio.
    const loose = (await orders.addSupply(admin, { orderId: null, name: "Tornillo 3/8", quantity: 20, unit: "unidades", note: null })).supply;
    await orders.addSupply(admin, { orderId: order.id, name: "tornillo 3/8", quantity: 5, unit: "unidades", note: null });
    let docs = await db.read(["orders", "generalSupplies"]);
    expect(docs.generalSupplies.items).toHaveLength(1);
    const grouped = groupSupplies(supplyRows(docs.orders.items, docs.generalSupplies.items));
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ total: 25 });
    expect(shoppingListText(grouped).toLowerCase()).toContain("tornillo 3/8: 25 unidades (ot-0001)");

    // Marcar la suelta no toca la de la orden.
    await orders.generalSupplyAction(admin, loose.id, { action: "done", done: true });
    docs = await db.read(["orders", "generalSupplies"]);
    expect(supplyRows(docs.orders.items, docs.generalSupplies.items)).toHaveLength(1);
    await orders.generalSupplyAction(admin, loose.id, { action: "done", done: false });

    // Enlazarla: sale de las sueltas y queda como insumo requerido de la orden.
    await orders.generalSupplyAction(admin, loose.id, { action: "link", orderId: order.id });
    docs = await db.read(["orders", "generalSupplies"]);
    expect(docs.generalSupplies.items).toHaveLength(0);
    expect(docs.orders.items[0]!.requiredSupplies.map((s) => s.quantity)).toEqual([5, 20]);

    await expect(orders.generalSupplyAction(admin, loose.id, { action: "remove" })).rejects.toMatchObject({ status: 404 });
    await expect(orders.addSupply(admin, { orderId: "no-existe", name: "X", quantity: 1, unit: null, note: null })).rejects.toMatchObject({ status: 404 });
  });

  it("quita una compra suelta y borra las conseguidas hace mucho", async () => {
    const { admin } = await setup();
    const a = (await orders.addSupply(admin, { orderId: null, name: "Lija", quantity: 1, unit: null, note: null })).supply;
    const old = (await orders.addSupply(admin, { orderId: null, name: "Vieja", quantity: 1, unit: null, note: null })).supply;
    await orders.generalSupplyAction(admin, old.id, { action: "done", done: true });
    await db.transact(["generalSupplies"], "envejece", ({ generalSupplies }) => {
      generalSupplies.items.find((l) => l.id === old.id)!.obtainedAt = "2020-01-01T00:00:00.000Z";
    });
    await orders.addSupply(admin, { orderId: null, name: "Nueva", quantity: 1, unit: null, note: null });
    const { generalSupplies } = await db.read(["generalSupplies"]);
    expect(generalSupplies.items.map((l) => l.name)).toEqual(["Lija", "Nueva"]);
    await orders.generalSupplyAction(admin, a.id, { action: "remove" });
    expect((await db.read(["generalSupplies"])).generalSupplies.items.map((l) => l.name)).toEqual(["Nueva"]);
  });
});

describe("insumos anotados al editar la orden", () => {
  it("salen en la lista de Insumos, se marcan «Ya está» y conservan el estado al editar", async () => {
    const { admin } = await setup();
    const { supplyRows } = await import("@/lib/domain/supplies");
    const { order } = await orders.createOrder(
      admin,
      baseOrder({ supplies: [{ description: "Bronce latón 3/4", supplier: "Metales SA", quantity: 1, unitCost: 80_000 }] }),
    );
    let list = (await db.read(["orders"])).orders.items;
    let rows = supplyRows(list);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "cost", folio: order.folio, supply: { name: "Bronce latón 3/4", status: "pendiente" } });
    expect(rows[0]!.supply.note).toContain("Metales SA");

    const lineId = order.supplies[0]!.id;
    await orders.orderAction(admin, order.id, { action: "supplyDone", supplyId: lineId, done: true });
    list = (await db.read(["orders"])).orders.items;
    expect(supplyRows(list)).toHaveLength(0);
    expect(list[0]!.supplies[0]).toMatchObject({ status: "conseguido", obtainedBy: "admin-1" });

    // Editar la orden (mismo id) no los vuelve a pendientes y el costo sigue contando.
    await orders.updateOrder(admin, order.id, { supplies: [{ id: lineId, description: "Bronce latón 3/4", supplier: "Metales SA", quantity: 2, unitCost: 80_000 }] });
    list = (await db.read(["orders"])).orders.items;
    expect(list[0]!.supplies[0]).toMatchObject({ status: "conseguido", quantity: 2 });
    expect(supplyRows(list)).toHaveLength(0);
    // Una línea nueva sí entra como pendiente.
    await orders.updateOrder(admin, order.id, {
      supplies: [
        { id: lineId, description: "Bronce latón 3/4", supplier: "Metales SA", quantity: 2, unitCost: 80_000 },
        { description: "Rodamiento 608", supplier: "", quantity: 4, unitCost: 5_000 },
      ],
    });
    rows = supplyRows((await db.read(["orders"])).orders.items);
    expect(rows.map((r) => r.supply.name)).toEqual(["Rodamiento 608"]);
  });
});
