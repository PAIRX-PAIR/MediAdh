import "server-only";
import { diffFields } from "@/lib/domain/diff";
import { CLAIM_KIND_LABEL, PROCESS_LABEL } from "@/lib/domain/labels";
import { ORDER_STATUS_LABEL, canTransition, statusFromWork, warrantyStatus } from "@/lib/domain/lifecycle";
import { OPEN_ORDER_STATUSES, remainingHours } from "@/lib/domain/planning";
import type {
  Claim,
  ClaimKind,
  Collection,
  Database,
  Difficulty,
  Machine,
  Notification,
  Order,
  OrderStatus,
  Position,
  Process,
  RequiredSupply,
  SupplyLine,
  Task,
  TaskPriority,
  WorkItem,
} from "@/lib/domain/schema";
import { RETENTION } from "@/lib/domain/schema";
import { addDays, daysBetween, isRealDate, zonedInstant } from "@/lib/domain/time";
import { isOwner, type Principal } from "../auth/principal";
import { badRequest, conflict, forbidden, notFound } from "../http";
import { getDb } from "../store";
import { actorOf, audit, folio, newId, nextSeq, nowIso, pushNotification, track, type Actor } from "./common";

/* ─────────────────────────────── Entradas ─────────────────────────────── */

export interface WorkItemInput {
  id?: string;
  process: Process;
  machineId: string | null;
  /** undefined → the machine's usual position. */
  positionId?: string | null;
  description: string;
  plannedHours: number;
}

export interface SupplyInput {
  id?: string;
  description: string;
  supplier: string;
  quantity: number;
  unitCost: number;
}

export interface OrderInput {
  clientId: string | null;
  clientName: string | null;
  title: string;
  description: string;
  difficulty: Difficulty;
  urgent?: boolean;
  quantity: number;
  condition: string;
  receivedAt: string | null;
  due: { date: string; time: string } | null;
  workItems: WorkItemInput[];
  supplies: SupplyInput[];
  price: number | null;
  notes: string;
}

type OrderDocs = Pick<Database, "orders" | "tasks" | "machines" | "positions" | "clients" | "notifications" | "audit">;
const ORDER_DOCS: Array<keyof OrderDocs> = ["orders", "tasks", "machines", "positions", "clients", "notifications", "audit"];

const ORDER_LABELS = {
  clientName: "Cliente",
  title: "Trabajo",
  description: "Descripción",
  status: "Estado",
  difficulty: "Dificultad",
  urgent: "Urgente",
  due: "Entrega",
  price: "Precio",
  finalPrice: "Precio final",
  satisfaction: "Satisfacción",
  notes: "Notas",
  intake: "Ingreso",
} as const;

/* ─────────────────────────────── Utilidades ─────────────────────────────── */

function assertDue(due: OrderInput["due"]) {
  if (!due) return;
  if (!isRealDate(due.date)) throw badRequest("Fecha de entrega inválida.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(due.time)) throw badRequest("Hora de entrega inválida.");
}

function findOrder(orders: Collection<Order>, id: string): Order {
  const order = orders.items.find((o) => o.id === id);
  if (!order) throw notFound("Orden de trabajo no encontrada.");
  return order;
}

function resolveClient(docs: Pick<OrderDocs, "clients">, clientId: string | null, clientName: string | null): { clientId: string | null; clientName: string } {
  if (clientId) {
    const client = docs.clients.items.find((c) => c.id === clientId);
    if (!client) throw badRequest("El cliente elegido no existe.");
    return { clientId, clientName: client.name };
  }
  const name = clientName?.trim();
  if (!name) throw badRequest("Elige un cliente o escribe su nombre.");
  return { clientId: null, clientName: name };
}

function buildWorkItems(inputs: WorkItemInput[], previous: WorkItem[], machines: Machine[], positions: Position[]): WorkItem[] {
  return inputs.map((input) => {
    const prev = input.id ? previous.find((w) => w.id === input.id) : undefined;
    const machine = input.machineId ? machines.find((m) => m.id === input.machineId) : undefined;
    if (input.machineId && !machine) throw badRequest("Una de las máquinas no existe.");
    if (machine && machine.process !== input.process) {
      throw badRequest(`${machine.name} es de ${PROCESS_LABEL[machine.process]}, no de ${PROCESS_LABEL[input.process]}.`);
    }
    if (machine?.state === "inactiva" && prev?.machineId !== machine.id) {
      throw badRequest(`${machine.name} está inactiva (próximamente): no puede recibir trabajo.`, "machine_inactive");
    }
    // Moving a step to another machine hands it to that machine's usual position.
    const keepPosition = prev && prev.machineId === input.machineId;
    const positionId =
      input.positionId !== undefined ? input.positionId : keepPosition ? prev.positionId : (machine?.positionId ?? prev?.positionId ?? null);
    if (positionId && !positions.some((p) => p.id === positionId)) throw badRequest("Uno de los puestos no existe.");
    return {
      id: prev?.id ?? newId(),
      process: input.process,
      machineId: input.machineId,
      positionId,
      description: input.description,
      plannedHours: input.plannedHours,
      actualHours: prev?.actualHours ?? null,
      status: prev?.status ?? "pendiente",
      taskId: prev?.taskId ?? null,
      completedAt: prev?.completedAt ?? null,
    };
  });
}

function buildSupplies(inputs: SupplyInput[], previous: SupplyLine[]): SupplyLine[] {
  return inputs.map((s) => ({
    id: s.id && previous.some((p) => p.id === s.id) ? s.id : newId(),
    description: s.description,
    supplier: s.supplier,
    quantity: s.quantity,
    unitCost: s.unitCost,
  }));
}

/** Task priority shown to the worker, derived from the order. */
export function taskPriorityFor(order: Pick<Order, "difficulty" | "due" | "status" | "urgent">, today: string): TaskPriority {
  if (order.urgent || order.status === "garantia") return "urgente";
  if (order.difficulty === 3) return "alta";
  if (order.due && daysBetween(today, order.due.date) <= 1) return "alta";
  if (order.difficulty === 2) return "alta";
  return "normal";
}

function workItemSummary(items: WorkItem[], machines: Machine[]): string | null {
  if (items.length === 0) return null;
  return items
    .map((w) => `${PROCESS_LABEL[w.process]}${w.machineId ? ` (${machines.find((m) => m.id === w.machineId)?.name ?? "?"})` : ""} ${w.plannedHours} h`)
    .join(" · ");
}

/**
 * Keeps one task per pending work step, owned by the step's position, so the
 * worker sees it in their task bar. Returns notifications for new assignments.
 */
export function syncTasks(docs: Pick<OrderDocs, "tasks" | "machines" | "notifications">, order: Order, actor: Actor, today: string): Notification[] {
  const notifications: Notification[] = [];
  const open = OPEN_ORDER_STATUSES.includes(order.status);
  const keep = new Set<string>();
  const now = nowIso();

  for (const item of order.workItems) {
    let task = item.taskId ? docs.tasks.items.find((t) => t.id === item.taskId) : undefined;
    if (!open && (!task || task.status !== "completada")) {
      // Cancelled or delivered orders leave no pending work behind.
      if (task && order.status === "cancelada") {
        docs.tasks.items = docs.tasks.items.filter((t) => t.id !== task!.id);
        item.taskId = null;
      }
      if (task) keep.add(task.id);
      continue;
    }
    const machine = item.machineId ? docs.machines.items.find((m) => m.id === item.machineId) : undefined;
    const title = `${PROCESS_LABEL[item.process]} · ${order.title}`.slice(0, 140);
    const description = [item.description, order.description].filter(Boolean).join("\n\n").slice(0, 4000);
    const priority = taskPriorityFor(order, today);
    if (!task) {
      if (item.status === "completada") continue;
      task = {
        id: newId(),
        folio: folio("T", nextSeq(docs.tasks)),
        title,
        description,
        positionId: item.positionId,
        priority,
        status: "pendiente",
        dueDate: order.due?.date ?? null,
        piece: machine ? machine.name : PROCESS_LABEL[item.process],
        quantity: order.intake.quantity,
        quantityDone: 0,
        checklist: [],
        notes: [],
        blockedReason: null,
        createdBy: actor.id ?? "sistema",
        createdAt: now,
        updatedAt: now,
        updatedBy: actor.id ?? "sistema",
        startedAt: null,
        completedAt: null,
        completedBy: null,
        orderId: order.id,
        workItemId: item.id,
        machineId: item.machineId,
        plannedHours: item.plannedHours,
        actualHours: null,
        history: [],
      } satisfies Task;
      track(task, actor, `Generada desde ${order.folio}`);
      docs.tasks.items.push(task);
      item.taskId = task.id;
      if (task.positionId) notifications.push(assignmentNotice(docs, actor, task, order, priority));
    } else if (task.status !== "completada") {
      const positionChanged = task.positionId !== item.positionId;
      task.title = title;
      task.description = description;
      task.positionId = item.positionId;
      task.priority = priority;
      task.dueDate = order.due?.date ?? null;
      task.piece = machine ? machine.name : PROCESS_LABEL[item.process];
      task.quantity = order.intake.quantity;
      task.machineId = item.machineId;
      task.plannedHours = item.plannedHours;
      task.updatedAt = now;
      if (positionChanged && task.positionId) notifications.push(assignmentNotice(docs, actor, task, order, priority));
    }
    keep.add(task.id);
  }

  // Steps removed from the order take their pending tasks with them.
  docs.tasks.items = docs.tasks.items.filter((t) => t.orderId !== order.id || keep.has(t.id) || t.status === "completada");
  return notifications;
}

function assignmentNotice(docs: Pick<OrderDocs, "notifications">, actor: Actor, task: Task, order: Order, priority: TaskPriority): Notification {
  return pushNotification(docs.notifications, actor, {
    audience: { kind: "position", positionId: task.positionId! },
    type: "task_assigned",
    title: `Nuevo trabajo ${order.folio}${priority === "urgente" ? " · URGENTE" : ""}`,
    body: `${task.title}${order.due ? ` · entrega ${order.due.date} ${order.due.time}` : ""}${task.plannedHours ? ` · ${task.plannedHours} h` : ""}`,
    link: `/tareas?t=${task.id}`,
    urgent: priority === "urgente",
  });
}

/** Moves the order through its states as the work steps advance; returns a "ready" notice. */
function refreshStatus(docs: Pick<OrderDocs, "notifications">, order: Order, actor: Actor): Notification[] {
  const before = order.status;
  const next = statusFromWork(order, order.workItems);
  if (next === before) return [];
  order.status = next;
  if (next === "en_proceso" && !order.startedAt) order.startedAt = nowIso();
  if (next === "terminada") {
    order.finishedAt = nowIso();
    track(order, actor, "Todos los pasos terminados", [{ field: "status", label: "Estado", from: ORDER_STATUS_LABEL[before], to: ORDER_STATUS_LABEL[next] }]);
    return [
      pushNotification(docs.notifications, actor, {
        audience: { kind: "admins" },
        type: "order_ready",
        title: `${order.folio} lista para entregar`,
        body: `${order.title} · ${order.clientName}`,
        link: `/admin/ordenes?o=${order.id}`,
      }),
    ];
  }
  track(order, actor, "Cambio automático de estado", [{ field: "status", label: "Estado", from: ORDER_STATUS_LABEL[before], to: ORDER_STATUS_LABEL[next] }]);
  return [];
}

/**
 * Called when a worker (or admin) changes a task generated from an order: the
 * step mirrors the task's status, position and reported hours.
 */
export function applyTaskToOrder(docs: Pick<OrderDocs, "orders" | "notifications">, task: Task, actor: Actor): Notification[] {
  if (!task.orderId) return [];
  const order = docs.orders.items.find((o) => o.id === task.orderId);
  const item = order?.workItems.find((w) => w.id === task.workItemId);
  if (!order || !item) return [];
  item.status = task.status;
  item.positionId = task.positionId;
  if (task.actualHours !== null) item.actualHours = task.actualHours;
  item.completedAt = task.status === "completada" ? (task.completedAt ?? nowIso()) : null;
  order.updatedAt = nowIso();
  return refreshStatus(docs, order, actor);
}

/* ─────────────────────────────── Crear / editar ─────────────────────────────── */

export async function createOrder(principal: Principal, input: OrderInput, extra: { quoteId?: string | null } = {}) {
  assertDue(input.due);
  return getDb().transact(ORDER_DOCS, "Registra una orden de trabajo", (docs) => createOrderIn(docs, principal, input, extra));
}

export function createOrderIn(docs: OrderDocs, principal: Principal, input: OrderInput, extra: { quoteId?: string | null; drawingIds?: string[] } = {}) {
  const actor = actorOf(principal);
  const now = nowIso();
  const client = resolveClient(docs, input.clientId, input.clientName);
  const order: Order = {
    id: newId(),
    folio: folio("OT", nextSeq(docs.orders)),
    clientId: client.clientId,
    clientName: client.clientName,
    title: input.title,
    description: input.description,
    status: "recibida",
    difficulty: input.difficulty,
    urgent: input.urgent ?? false,
    intake: { receivedAt: input.receivedAt ?? now, quantity: input.quantity, condition: input.condition },
    intakePhotoIds: [],
    drawingIds: extra.drawingIds ?? [],
    photoIds: [],
    due: input.due,
    workItems: buildWorkItems(input.workItems, [], docs.machines.items, docs.positions.items),
    supplies: buildSupplies(input.supplies, []),
    requiredSupplies: [],
    quoteId: extra.quoteId ?? null,
    price: input.price,
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
    notes: input.notes,
    history: [],
    createdBy: principal.user.id,
    createdAt: now,
    updatedAt: now,
    updatedBy: principal.user.id,
  };
  track(order, actor, extra.quoteId ? "Creada desde una cotización aprobada" : "Registró el ingreso de las piezas");
  docs.orders.items.push(order);
  const notifications = syncTasks(docs, order, actor, principal.today);
  audit(docs.audit, actor, "ot_creada", order.folio, `${order.title} · ${order.clientName}`);
  return { order, notifications };
}

export async function updateOrder(principal: Principal, id: string, patch: Partial<OrderInput>) {
  if (patch.due !== undefined) assertDue(patch.due);
  return getDb().transact(ORDER_DOCS, "Actualiza una orden de trabajo", (docs) => {
    const order = findOrder(docs.orders, id);
    if (order.status === "cancelada") throw conflict("La orden está cancelada. Reábrela para editarla.");
    const actor = actorOf(principal);
    const before = structuredClone(order);

    if (patch.clientId !== undefined || patch.clientName !== undefined) {
      const client = resolveClient(docs, patch.clientId ?? null, patch.clientName ?? order.clientName);
      order.clientId = client.clientId;
      order.clientName = client.clientName;
    }
    if (patch.title !== undefined) order.title = patch.title;
    if (patch.description !== undefined) order.description = patch.description;
    if (patch.difficulty !== undefined) order.difficulty = patch.difficulty;
    if (patch.urgent !== undefined) order.urgent = patch.urgent;
    if (patch.quantity !== undefined) order.intake.quantity = patch.quantity;
    if (patch.condition !== undefined) order.intake.condition = patch.condition;
    if (patch.receivedAt) order.intake.receivedAt = patch.receivedAt;
    if (patch.due !== undefined) {
      const moved = JSON.stringify(patch.due) !== JSON.stringify(order.due);
      order.due = patch.due;
      // A new date re-arms the reminders.
      if (moved) {
        const due = order.due ? zonedInstant(order.due.date, order.due.time, principal.settings.timezone).getTime() : null;
        const future = due !== null && due > Date.now();
        // A date moved into the future re-arms every reminder; one still in the past must not repeat "VENCIDA".
        order.reminders = future ? { before24h: false, dayOf: false, overdue: false } : { ...order.reminders, before24h: true, dayOf: true };
      }
    }
    if (patch.price !== undefined) order.price = patch.price;
    if (patch.notes !== undefined) order.notes = patch.notes;
    if (patch.supplies !== undefined) order.supplies = buildSupplies(patch.supplies, order.supplies);
    if (patch.workItems !== undefined) {
      const removed = order.workItems.filter((w) => !patch.workItems!.some((p) => p.id === w.id));
      if (removed.some((w) => w.status === "completada")) {
        throw conflict("No se puede quitar un paso ya terminado (queda en el histórico).", "step_done");
      }
      order.workItems = buildWorkItems(patch.workItems, order.workItems, docs.machines.items, docs.positions.items);
    }

    const changes = diffFields(before, order, ORDER_LABELS);
    const workBefore = workItemSummary(before.workItems, docs.machines.items);
    const workAfter = workItemSummary(order.workItems, docs.machines.items);
    if (workBefore !== workAfter) changes.push({ field: "workItems", label: "Ruta de procesos", from: workBefore, to: workAfter });
    const suppliesCost = (lines: SupplyLine[]) => Math.round(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0));
    if (JSON.stringify(before.supplies) !== JSON.stringify(order.supplies)) {
      changes.push({ field: "supplies", label: "Insumos", from: `${before.supplies.length} · $${suppliesCost(before.supplies)}`, to: `${order.supplies.length} · $${suppliesCost(order.supplies)}` });
    }

    const notifications = syncTasks(docs, order, actor, principal.today);
    notifications.push(...refreshStatus(docs, order, actor));
    if (changes.length > 0) {
      order.updatedAt = nowIso();
      order.updatedBy = principal.user.id;
      track(order, actor, "Editó la orden", changes);
      audit(docs.audit, actor, "ot_actualizada", order.folio, changes.map((c) => c.label).join(", "));
      if (patch.due !== undefined && JSON.stringify(before.due) !== JSON.stringify(order.due)) {
        for (const positionId of new Set(order.workItems.filter((w) => w.status !== "completada" && w.positionId).map((w) => w.positionId!))) {
          notifications.push(
            pushNotification(docs.notifications, actor, {
              audience: { kind: "position", positionId },
              type: "task_updated",
              title: `Cambió la entrega de ${order.folio}`,
              body: order.due ? `Nueva entrega: ${order.due.date} a las ${order.due.time}` : "La orden quedó sin fecha de entrega.",
              link: "/tareas",
            }),
          );
        }
      }
    }
    return { order, notifications };
  });
}

/* ─────────────────────────────── Acciones ─────────────────────────────── */

export type OrderAction =
  | { action: "status"; to: OrderStatus }
  | { action: "deliver"; satisfaction: number | null; finalPrice: number | null }
  | { action: "close" }
  | { action: "invoice"; number: string | null }
  | { action: "claim"; kind: ClaimKind; description: string }
  | { action: "resolveClaim"; claimId: string; resolution: string }
  | { action: "satisfaction"; value: number | null }
  | { action: "cancel"; reason: string | null }
  | { action: "reopen" }
  | { action: "supplyAdd"; name: string; quantity: number; unit: string | null; note: string | null }
  | { action: "supplyRemove"; supplyId: string }
  | { action: "supplyDone"; supplyId: string; done: boolean };

/** Orders that can still ask for or receive supplies. */
const SUPPLY_STATUSES: OrderStatus[] = ["recibida", "en_proceso", "terminada", "garantia"];

export function closeService(docs: Pick<OrderDocs, "notifications">, order: Order, actor: Actor, automatic: boolean): Notification {
  order.status = "cerrada";
  order.closedAt = nowIso();
  if (!order.invoice.invoicedAt) order.invoice.pending = true;
  track(order, actor, automatic ? "Cierre automático: sin reclamos en el plazo" : "Cerró el servicio", [
    { field: "status", label: "Estado", from: ORDER_STATUS_LABEL.entregada, to: ORDER_STATUS_LABEL.cerrada },
  ]);
  return pushNotification(docs.notifications, actor, {
    audience: { kind: "admins" },
    type: "order_invoice",
    title: `FACTURAR ${order.folio}`,
    body: `${order.clientName} · ${order.title}. ${automatic ? "Pasó el plazo sin reclamos: el servicio quedó cerrado." : "Servicio cerrado."}`,
    link: `/admin/ordenes?o=${order.id}`,
    urgent: true,
  });
}


/**
 * Insumos requeridos de UNA orden. Marcar «conseguido» solo toca la línea de
 * esta orden: otra orden que pida el mismo insumo conserva su propia línea.
 */
function applySupplyAction(order: Order, actor: Actor, input: Extract<OrderAction, { action: `supply${string}` }>, now: string) {
  if (input.action === "supplyAdd") {
    const line: RequiredSupply = {
      id: newId(),
      name: input.name.trim(),
      quantity: input.quantity,
      unit: input.unit?.trim() ?? "",
      note: input.note?.trim() ?? "",
      status: "pendiente",
      requestedAt: now,
      requestedBy: actor.id,
      obtainedAt: null,
      obtainedBy: null,
    };
    order.requiredSupplies.push(line);
    track(order, actor, "Pidió un insumo", [{ field: "requiredSupplies", label: "Insumo requerido", from: null, to: `${line.name} · ${line.quantity}${line.unit ? ` ${line.unit}` : ""}` }]);
    return;
  }
  const line = order.requiredSupplies.find((l) => l.id === input.supplyId);
  if (!line) throw notFound("Ese insumo no está en esta orden.");
  if (input.action === "supplyRemove") {
    order.requiredSupplies = order.requiredSupplies.filter((l) => l.id !== line.id);
    track(order, actor, "Quitó un insumo requerido", [{ field: "requiredSupplies", label: "Insumo requerido", from: line.name, to: null }]);
    return;
  }
  if ((line.status === "conseguido") === input.done) return;
  line.status = input.done ? "conseguido" : "pendiente";
  line.obtainedAt = input.done ? now : null;
  line.obtainedBy = input.done ? actor.id : null;
  track(order, actor, input.done ? "Ya está el insumo" : "Volvió a pedir un insumo", [
    { field: "requiredSupplies", label: line.name, from: input.done ? "Pendiente" : "Conseguido", to: input.done ? "Conseguido" : "Pendiente" },
  ]);
}

/* ─────────────────── Compras sueltas (insumos sin orden) ─────────────────── */

const SUPPLY_DOCS: Array<keyof Database> = ["orders", "generalSupplies", "audit"];

export interface NewSupplyInput {
  /** null = compra suelta; con id, el insumo queda enlazado a esa orden. */
  orderId: string | null;
  name: string;
  quantity: number;
  unit: string | null;
  note: string | null;
}

export type GeneralSupplyAction = { action: "done"; done: boolean } | { action: "remove" } | { action: "link"; orderId: string };

function describeSupply(line: Pick<RequiredSupply, "name" | "quantity" | "unit">) {
  return `${line.name} · ${line.quantity}${line.unit ? ` ${line.unit}` : ""}`;
}

/** Drops old, already-obtained loose purchases so the document stays small. */
function pruneGeneralSupplies(list: Collection<RequiredSupply>, nowMs: number) {
  const cutoff = nowMs - RETENTION.generalSuppliesDoneDays * 86_400_000;
  list.items = list.items.filter((l) => l.status === "pendiente" || !l.obtainedAt || Date.parse(l.obtainedAt) >= cutoff);
}

/** A loose purchase, or — with `orderId` — the same as «Insumos requeridos» inside that order. */
export async function addSupply(principal: Principal, input: NewSupplyInput) {
  return getDb().transact(SUPPLY_DOCS, "Agrega un insumo por conseguir", (docs) => {
    const actor = actorOf(principal);
    const now = nowIso();
    if (input.orderId) {
      const order = findOrder(docs.orders, input.orderId);
      if (!SUPPLY_STATUSES.includes(order.status)) throw conflict("Esa orden ya no está en curso: no admite insumos nuevos.");
      applySupplyAction(order, actor, { action: "supplyAdd", name: input.name, quantity: input.quantity, unit: input.unit, note: input.note }, now);
      order.updatedAt = now;
      order.updatedBy = principal.user.id;
      audit(docs.audit, actor, "insumo_pedido", order.folio, describeSupply(order.requiredSupplies.at(-1)!));
      return { supply: order.requiredSupplies.at(-1)!, order };
    }
    const line: RequiredSupply = {
      id: newId(),
      name: input.name.trim(),
      quantity: input.quantity,
      unit: input.unit?.trim() ?? "",
      note: input.note?.trim() ?? "",
      status: "pendiente",
      requestedAt: now,
      requestedBy: actor.id,
      obtainedAt: null,
      obtainedBy: null,
    };
    docs.generalSupplies.items.push(line);
    pruneGeneralSupplies(docs.generalSupplies, Date.now());
    audit(docs.audit, actor, "insumo_pedido", null, describeSupply(line));
    return { supply: line, order: null };
  });
}

/** Mark, remove or link (move into an order) a loose purchase. */
export async function generalSupplyAction(principal: Principal, id: string, input: GeneralSupplyAction) {
  return getDb().transact(SUPPLY_DOCS, "Acción sobre un insumo suelto", (docs) => {
    const actor = actorOf(principal);
    const now = nowIso();
    const line = docs.generalSupplies.items.find((l) => l.id === id);
    if (!line) throw notFound("Ese insumo ya no está en la lista general.");
    if (input.action === "remove") {
      docs.generalSupplies.items = docs.generalSupplies.items.filter((l) => l.id !== id);
      audit(docs.audit, actor, "insumo_quitado", null, describeSupply(line));
      return { supply: null, order: null };
    }
    if (input.action === "done") {
      if ((line.status === "conseguido") !== input.done) {
        line.status = input.done ? "conseguido" : "pendiente";
        line.obtainedAt = input.done ? now : null;
        line.obtainedBy = input.done ? actor.id : null;
        audit(docs.audit, actor, input.done ? "insumo_conseguido" : "insumo_pendiente", null, describeSupply(line));
      }
      return { supply: line, order: null };
    }
    // link: the line moves into the order and stops being a loose purchase.
    const order = findOrder(docs.orders, input.orderId);
    if (!SUPPLY_STATUSES.includes(order.status)) throw conflict("Esa orden ya no está en curso: no admite insumos nuevos.");
    docs.generalSupplies.items = docs.generalSupplies.items.filter((l) => l.id !== id);
    order.requiredSupplies.push(line);
    order.updatedAt = now;
    order.updatedBy = principal.user.id;
    track(order, actor, "Enlazó un insumo de la lista general", [{ field: "requiredSupplies", label: "Insumo requerido", from: null, to: describeSupply(line) }]);
    audit(docs.audit, actor, "insumo_enlazado", order.folio, describeSupply(line));
    return { supply: line, order };
  });
}

export async function orderAction(principal: Principal, id: string, input: OrderAction) {
  return getDb().transact([...ORDER_DOCS, "settings"], "Acción sobre una orden de trabajo", (docs) => {
    const order = findOrder(docs.orders, id);
    const actor = actorOf(principal);
    const now = nowIso();
    const notifications: Notification[] = [];
    const from = order.status;
    const statusChange = (to: OrderStatus, action: string) => {
      track(order, actor, action, from === to ? [] : [{ field: "status", label: "Estado", from: ORDER_STATUS_LABEL[from], to: ORDER_STATUS_LABEL[to] }]);
      order.status = to;
    };

    switch (input.action) {
      case "status": {
        if (!canTransition(from, input.to)) throw conflict(`No se puede pasar de “${ORDER_STATUS_LABEL[from]}” a “${ORDER_STATUS_LABEL[input.to]}”.`);
        if (["entregada", "cerrada", "cancelada"].includes(input.to)) throw badRequest("Usa la acción correspondiente (entregar, cerrar o cancelar).");
        if (input.to === "en_proceso" && !order.startedAt) order.startedAt = now;
        if (input.to === "terminada") {
          order.finishedAt = now;
          for (const w of order.workItems) {
            if (w.status === "completada") continue;
            w.status = "completada";
            w.completedAt = now;
            const task = docs.tasks.items.find((t) => t.id === w.taskId);
            if (task && task.status !== "completada") {
              Object.assign(task, { status: "completada", completedAt: now, completedBy: principal.user.id, updatedAt: now, blockedReason: null });
            }
          }
        }
        statusChange(input.to, "Cambió el estado");
        break;
      }
      case "deliver": {
        if (!["recibida", "en_proceso", "terminada", "garantia"].includes(from)) throw conflict("Esta orden ya fue entregada o cancelada.");
        for (const w of order.workItems) {
          if (w.status === "completada") continue;
          w.status = "completada";
          w.completedAt = now;
          const task = docs.tasks.items.find((t) => t.id === w.taskId);
          if (task && task.status !== "completada") {
            Object.assign(task, { status: "completada", completedAt: now, completedBy: principal.user.id, updatedAt: now, blockedReason: null });
          }
        }
        for (const c of order.claims) {
          if (!c.resolvedAt) {
            c.resolvedAt = now;
            c.resolution = c.resolution ?? "Entregado nuevamente al cliente";
          }
        }
        order.finishedAt ??= now;
        order.deliveredAt = now;
        if (input.satisfaction !== null) order.satisfaction = input.satisfaction;
        if (input.finalPrice !== null) order.finalPrice = input.finalPrice;
        statusChange("entregada", `Entregó al cliente · cierre automático en ${docs.settings.production.claimWindowDays} día(s) sin reclamos`);
        audit(docs.audit, actor, "ot_entregada", order.folio, order.clientName);
        break;
      }
      case "close": {
        if (from !== "entregada") throw conflict("Solo se cierra un servicio entregado.");
        if (order.claims.some((c) => !c.resolvedAt)) throw conflict("Hay un reclamo abierto. Resuélvelo antes de cerrar.");
        notifications.push(closeService(docs, order, actor, false));
        audit(docs.audit, actor, "ot_cerrada", order.folio);
        break;
      }
      case "invoice": {
        if (!["entregada", "cerrada"].includes(from)) throw conflict("Se factura un servicio entregado o cerrado.");
        order.invoice = { pending: false, number: input.number, invoicedAt: now };
        track(order, actor, "Marcó como facturado", [{ field: "invoice", label: "Factura", from: "Pendiente", to: input.number ?? "Facturado" }]);
        audit(docs.audit, actor, "ot_facturada", order.folio, input.number);
        break;
      }
      case "claim": {
        if (!["entregada", "cerrada"].includes(from)) throw conflict("Los reclamos se registran sobre trabajos entregados.");
        if (input.kind === "garantia") {
          const w = warrantyStatus(order, docs.settings.production.warrantyDays, principal.settings.timezone);
          if (w.weldingOnly) throw conflict("Los trabajos de soldadura no tienen garantía. Si el cliente devuelve la pieza, regístralo como devolución.", "no_warranty");
          if (!w.until || principal.today > w.until) throw conflict(`La garantía venció${w.until ? ` el ${w.until}` : ""}. Puedes registrarlo como devolución.`, "warranty_expired");
        }
        const claim: Claim = { id: newId(), kind: input.kind, at: now, description: input.description, resolvedAt: null, resolution: null, createdBy: principal.user.id };
        order.claims.push(claim);
        order.closedAt = null;
        statusChange("garantia", `Registró ${CLAIM_KIND_LABEL[input.kind].toLowerCase()}: ${input.description}`);
        notifications.push(
          pushNotification(docs.notifications, actor, {
            audience: { kind: "admins" },
            type: "order_claim",
            title: `${CLAIM_KIND_LABEL[input.kind]} en ${order.folio}`,
            body: `${order.clientName}: ${input.description}`,
            link: `/admin/ordenes?o=${order.id}`,
            urgent: true,
          }),
        );
        audit(docs.audit, actor, "ot_reclamo", order.folio, `${input.kind}: ${input.description}`);
        break;
      }
      case "resolveClaim": {
        const claim = order.claims.find((c) => c.id === input.claimId);
        if (!claim) throw notFound("Reclamo no encontrado.");
        if (claim.resolvedAt) throw conflict("Este reclamo ya está resuelto.");
        claim.resolvedAt = now;
        claim.resolution = input.resolution;
        track(order, actor, `Resolvió ${CLAIM_KIND_LABEL[claim.kind].toLowerCase()}`, [{ field: "claim", label: "Reclamo", from: claim.description, to: input.resolution }]);
        // Solved without rework: back to delivered, and the claim window restarts.
        if (from === "garantia" && order.workItems.every((w) => w.status === "completada") && order.claims.every((c) => c.resolvedAt)) {
          statusChange("entregada", "Vuelve a entregada tras resolver el reclamo");
        }
        break;
      }
      case "satisfaction": {
        track(order, actor, "Registró la satisfacción del cliente", [
          { field: "satisfaction", label: "Satisfacción", from: order.satisfaction?.toString() ?? null, to: input.value?.toString() ?? null },
        ]);
        order.satisfaction = input.value;
        break;
      }
      case "cancel": {
        if (["entregada", "cerrada", "cancelada"].includes(from)) throw conflict("No se puede cancelar en este estado.");
        statusChange("cancelada", `Canceló la orden${input.reason ? `: ${input.reason}` : ""}`);
        audit(docs.audit, actor, "ot_cancelada", order.folio, input.reason);
        break;
      }
      case "reopen": {
        if (from !== "cancelada") throw conflict("Solo se reabre una orden cancelada.");
        statusChange("recibida", "Reabrió la orden");
        break;
      }
      case "supplyAdd":
      case "supplyRemove":
      case "supplyDone": {
        if (!SUPPLY_STATUSES.includes(from)) throw conflict("Esta orden ya no está en curso: no admite cambios en sus insumos.");
        applySupplyAction(order, actor, input, now);
        break;
      }
    }

    notifications.push(...syncTasks(docs, order, actor, principal.today));
    if (OPEN_ORDER_STATUSES.includes(order.status)) notifications.push(...refreshStatus(docs, order, actor));
    order.updatedAt = now;
    order.updatedBy = principal.user.id;
    return { order, notifications };
  });
}

/* ─────────────────────────────── Histórico ─────────────────────────────── */

export interface HistoricalInput {
  clientId: string | null;
  clientName: string | null;
  title: string;
  description: string;
  quantity: number;
  receivedAt: string;
  deliveredAt: string;
  dueDate: string | null;
  workItems: Array<{ process: Process; machineId: string | null; hours: number }>;
  supplies: SupplyInput[];
  price: number | null;
  satisfaction: number | null;
  invoiceNumber: string | null;
  notes: string;
}

/** Jobs done before the app existed, so the history and inflation-adjusted prices start complete. */
export async function createHistoricalOrder(principal: Principal, input: HistoricalInput) {
  if (!isRealDate(input.receivedAt) || !isRealDate(input.deliveredAt)) throw badRequest("Fechas inválidas.");
  if (input.deliveredAt < input.receivedAt) throw badRequest("La entrega no puede ser anterior al ingreso.");
  if (input.dueDate && !isRealDate(input.dueDate)) throw badRequest("Fecha prometida inválida.");
  if (input.deliveredAt > principal.today) throw badRequest("Un trabajo histórico ya debe estar entregado.");
  return getDb().transact(["orders", "machines", "clients", "audit"], "Agrega un trabajo al histórico", (docs) => {
    const actor = actorOf(principal);
    const client = resolveClient(docs, input.clientId, input.clientName);
    const received = `${input.receivedAt}T12:00:00.000Z`;
    const delivered = `${input.deliveredAt}T17:00:00.000Z`;
    for (const w of input.workItems) {
      if (w.machineId && !docs.machines.items.some((m) => m.id === w.machineId)) throw badRequest("Una de las máquinas no existe.");
    }
    const order: Order = {
      id: newId(),
      folio: folio("OT", nextSeq(docs.orders)),
      clientId: client.clientId,
      clientName: client.clientName,
      title: input.title,
      description: input.description,
      status: "cerrada",
      difficulty: 1,
      urgent: false,
      intake: { receivedAt: received, quantity: input.quantity, condition: "" },
      intakePhotoIds: [],
      drawingIds: [],
      photoIds: [],
      due: input.dueDate ? { date: input.dueDate, time: "17:00" } : null,
      workItems: input.workItems.map((w) => ({
        id: newId(),
        process: w.process,
        machineId: w.machineId,
        positionId: null,
        description: "",
        plannedHours: w.hours,
        actualHours: w.hours,
        status: "completada" as const,
        taskId: null,
        completedAt: delivered,
      })),
      supplies: buildSupplies(input.supplies, []),
      requiredSupplies: [],
      quoteId: null,
      price: input.price,
      finalPrice: input.price,
      startedAt: received,
      finishedAt: delivered,
      deliveredAt: delivered,
      closedAt: delivered,
      invoice: { pending: false, number: input.invoiceNumber, invoicedAt: input.invoiceNumber ? delivered : null },
      claims: [],
      satisfaction: input.satisfaction,
      reminders: { before24h: true, dayOf: true, overdue: true },
      historical: true,
      notes: input.notes,
      history: [],
      createdBy: principal.user.id,
      // Stored with the job's own month so the archive stays chronological.
      createdAt: received,
      updatedAt: nowIso(),
      updatedBy: principal.user.id,
    };
    track(order, actor, "Registró un trabajo histórico");
    docs.orders.items.push(order);
    audit(docs.audit, actor, "historico_agregado", order.folio, order.title);
    return order;
  });
}

export async function deleteOrder(principal: Principal, id: string) {
  await getDb().transact(["orders", "tasks", "attachments", "audit"], "Elimina una orden de trabajo", (docs) => {
    const order = findOrder(docs.orders, id);
    // Gerencia y administración pueden borrar cualquier orden (por ejemplo, una prueba);
    // los demás solo las canceladas o históricas.
    if (!isOwner(principal) && !order.historical && order.status !== "cancelada") {
      throw forbidden("Solo se eliminan órdenes canceladas o registros históricos. Cancela la orden primero.");
    }
    docs.orders.items = docs.orders.items.filter((o) => o.id !== id);
    docs.tasks.items = docs.tasks.items.filter((t) => t.orderId !== id || t.status === "completada");
    for (const a of docs.attachments.items) if (a.orderId === id) a.orderId = null;
    audit(docs.audit, actorOf(principal), "ot_eliminada", order.folio, order.title);
  });
}

/** Default machine for a process: the active one with the least pending hours. */
export function leastLoadedMachine(machines: Machine[], orders: Order[], process: Process): Machine | null {
  const candidates = machines.filter((m) => m.process === process && m.state === "activa");
  if (candidates.length === 0) return null;
  const load = new Map<string, number>();
  for (const o of orders) {
    if (!OPEN_ORDER_STATUSES.includes(o.status)) continue;
    for (const w of o.workItems) if (w.machineId) load.set(w.machineId, (load.get(w.machineId) ?? 0) + remainingHours(w));
  }
  return candidates.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.order - b.order)[0]!;
}

/** Due date + time is required to schedule; used by the commit simulator defaults. */
export function defaultDue(today: string) {
  return { date: addDays(today, 7), time: "17:00" };
}
