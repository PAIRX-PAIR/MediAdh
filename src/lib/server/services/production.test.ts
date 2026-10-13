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
  return { user, position: access.position, isAdmin: access.isAdmin, settings, today, claims: { sub: user.id, sv: 0, iat: 0, exp: 0 }, incomplete: false };
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
      workItems: [{ id: order.workItems[0]!.id, process: "torno", machineId: "wkt", description: "", plannedHours: 6 }],
    });
    const entry = edited.history.at(-1)!;
    expect(entry).toMatchObject({ actorName: "Jefe", action: "Editó la orden" });
    expect(entry.changes.map((c) => c.label)).toEqual(expect.arrayContaining(["Trabajo", "Entrega", "Ruta de procesos"]));
    const { tasks } = await db.read(["tasks"]);
    expect(tasks.items.filter((t) => t.orderId === order.id)).toHaveLength(1);
    expect(tasks.items.find((t) => t.orderId === order.id)!.positionId).toBe("tornero-2");
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
      difficulty: 3,
      marginPct: 20,
      ivaPct: null,
      validDays: null,
      notes: "",
    });
    expect(quote).toMatchObject({ folio: "COT-0001", ivaPct: 19, validDays: 15 });
    expect(quote.labor[0]!.rate).toBe(50_000);
    await quotes.setQuoteStatus(admin, quote.id, "enviada");
    const { order } = await quotes.approveQuote(admin, quote.id, { due: { date: "2099-02-01", time: "12:00" }, condition: "", machines: {} });
    // (100.000 + 200.000) × 1,25 × 1,20 = 450.000 antes de IVA.
    expect(order.price).toBe(450_000);
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
