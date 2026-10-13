import "server-only";
import {
  RETENTION,
  type ChecklistItem,
  type DayClosure,
  type Notification,
  type RequestStatus,
  type RequestType,
  type SupplyRequest,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/domain/schema";
import { addDays, dateInZone, isRealDate } from "@/lib/domain/time";
import type { Principal } from "../auth/principal";
import { badRequest, conflict, forbidden, notFound } from "../http";
import { getDb } from "../store";
import { actorOf, audit, folio, newId, nextSeq, nowIso, pushNotification, track } from "./common";
import { applyTaskToOrder } from "./orders";
import { diffFields } from "@/lib/domain/diff";

const PRIORITY_LABEL: Record<TaskPriority, string> = { baja: "Baja", normal: "Normal", alta: "Alta", urgente: "URGENTE" };

export interface TaskInput {
  title: string;
  description: string;
  positionId: string | null;
  priority: TaskPriority;
  dueDate: string | null;
  piece: string | null;
  quantity: number | null;
  checklist: string[];
}

function assertDue(due: string | null) {
  if (due !== null && !isRealDate(due)) throw badRequest("Fecha límite inválida.");
}

function canWorkOn(principal: Principal, task: Task): boolean {
  return principal.isAdmin || (principal.position !== null && task.positionId === principal.position.id);
}

/** Old completed tasks leave the live document so it stays small. */
function pruneTasks(items: Task[], today: string): Task[] {
  const cutoff = addDays(today, -RETENTION.completedTaskDays);
  return items.filter((t) => t.status !== "completada" || !t.completedAt || t.completedAt.slice(0, 10) >= cutoff);
}

export async function createTask(principal: Principal, input: TaskInput) {
  assertDue(input.dueDate);
  return getDb().transact(["tasks", "positions", "notifications", "audit"], "Crea una tarea", (docs) => {
    if (input.positionId && !docs.positions.items.some((p) => p.id === input.positionId)) {
      throw badRequest("El puesto elegido no existe.");
    }
    const now = nowIso();
    const task: Task = {
      id: newId(),
      folio: folio("T", nextSeq(docs.tasks)),
      title: input.title,
      description: input.description,
      positionId: input.positionId,
      priority: input.priority,
      status: "pendiente",
      dueDate: input.dueDate,
      piece: input.piece,
      quantity: input.quantity,
      quantityDone: 0,
      checklist: input.checklist.map((text) => ({ id: newId(), text, done: false })),
      notes: [],
      blockedReason: null,
      createdBy: principal.user.id,
      createdAt: now,
      updatedAt: now,
      updatedBy: principal.user.id,
      startedAt: null,
      completedAt: null,
      completedBy: null,
      orderId: null,
      workItemId: null,
      machineId: null,
      plannedHours: null,
      actualHours: null,
      history: [],
    };
    docs.tasks.items = pruneTasks(docs.tasks.items, principal.today);
    docs.tasks.items.push(task);
    audit(docs.audit, actorOf(principal), "tarea_creada", task.folio, task.title);
    const notifications: Notification[] = [];
    if (task.positionId) {
      notifications.push(
        pushNotification(docs.notifications, actorOf(principal), {
          audience: { kind: "position", positionId: task.positionId },
          type: "task_assigned",
          title: `Nueva tarea ${task.folio}${task.priority === "urgente" ? " · URGENTE" : ""}`,
          body: `${task.title}${task.dueDate ? ` · entrega ${task.dueDate}` : ""} · prioridad ${PRIORITY_LABEL[task.priority]}`,
          link: `/tareas?t=${task.id}`,
          urgent: task.priority === "urgente",
        }),
      );
    }
    return { task, notifications };
  });
}

export interface TaskPatch {
  title?: string;
  description?: string;
  positionId?: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  piece?: string | null;
  quantity?: number | null;
  status?: TaskStatus;
  blockedReason?: string | null;
  quantityDone?: number;
  checklist?: Array<{ id?: string; text: string; done: boolean }>;
  checklistToggle?: { id: string; done: boolean };
  /** Hours actually spent, reported by the worker (feeds machine utilisation). */
  actualHours?: number | null;
}

/** Fields owned by the work order: edit them on the OT, not on its generated task. */
const ORDER_OWNED_FIELDS: Array<keyof TaskPatch> = ["title", "description", "dueDate", "piece", "quantity", "priority"];

const TASK_LABELS = {
  title: "Título",
  description: "Descripción",
  positionId: "Puesto",
  priority: "Prioridad",
  dueDate: "Fecha límite",
  status: "Estado",
  blockedReason: "Motivo de bloqueo",
  quantityDone: "Piezas hechas",
  actualHours: "Horas reales",
} as const;

const ADMIN_ONLY_FIELDS: Array<keyof TaskPatch> = [
  "title",
  "description",
  "positionId",
  "priority",
  "dueDate",
  "piece",
  "quantity",
  "checklist",
];

export async function updateTask(principal: Principal, taskId: string, patch: TaskPatch) {
  if (patch.dueDate !== undefined) assertDue(patch.dueDate);
  return getDb().transact(["tasks", "positions", "orders", "notifications", "audit"], "Actualiza una tarea", (docs) => {
    const task = docs.tasks.items.find((t) => t.id === taskId);
    if (!task) throw notFound("Tarea no encontrada.");
    if (!canWorkOn(principal, task)) throw forbidden("Esta tarea no es de tu puesto.");
    if (!principal.isAdmin && ADMIN_ONLY_FIELDS.some((f) => patch[f] !== undefined)) {
      throw forbidden("Solo un administrador puede editar los datos de la tarea.");
    }

    if (task.orderId && ORDER_OWNED_FIELDS.some((f) => patch[f] !== undefined)) {
      throw badRequest("Esta tarea viene de una orden de trabajo: cambia esos datos en la OT.", "order_owned");
    }

    const actor = actorOf(principal);
    const now = nowIso();
    const notifications: Notification[] = [];
    const previousPosition = task.positionId;
    const previousStatus = task.status;
    const before = structuredClone(task);

    if (patch.actualHours !== undefined) task.actualHours = patch.actualHours;
    if (patch.positionId !== undefined && patch.positionId !== null && !docs.positions.items.some((p) => p.id === patch.positionId)) {
      throw badRequest("El puesto elegido no existe.");
    }
    if (patch.title !== undefined) task.title = patch.title;
    if (patch.description !== undefined) task.description = patch.description;
    if (patch.positionId !== undefined) task.positionId = patch.positionId;
    if (patch.priority !== undefined) task.priority = patch.priority;
    if (patch.dueDate !== undefined) task.dueDate = patch.dueDate;
    if (patch.piece !== undefined) task.piece = patch.piece;
    if (patch.quantity !== undefined) task.quantity = patch.quantity;
    if (patch.checklist !== undefined) {
      task.checklist = patch.checklist.map<ChecklistItem>((item) => ({
        id: item.id && task.checklist.some((c) => c.id === item.id) ? item.id : newId(),
        text: item.text,
        done: item.done,
      }));
    }
    if (patch.checklistToggle) {
      const item = task.checklist.find((c) => c.id === patch.checklistToggle!.id);
      if (!item) throw notFound("Paso no encontrado.");
      item.done = patch.checklistToggle.done;
    }
    if (patch.quantityDone !== undefined) {
      if (task.quantity !== null && patch.quantityDone > task.quantity) {
        throw badRequest(`No puedes reportar más de ${task.quantity} piezas.`);
      }
      task.quantityDone = patch.quantityDone;
    }

    if (patch.status !== undefined && patch.status !== task.status) {
      if (patch.status === "bloqueada") {
        const reason = patch.blockedReason?.trim();
        if (!reason) throw badRequest("Indica por qué está bloqueada (por ejemplo, falta material).");
        task.blockedReason = reason;
      } else {
        task.blockedReason = null;
      }
      if (patch.status === "en_proceso" && !task.startedAt) task.startedAt = now;
      if (patch.status === "completada") {
        task.completedAt = now;
        task.completedBy = principal.user.id;
        if (task.quantity !== null && task.quantityDone < task.quantity) task.quantityDone = task.quantity;
      } else {
        task.completedAt = null;
        task.completedBy = null;
      }
      task.status = patch.status;
    } else if (patch.blockedReason !== undefined && task.status === "bloqueada") {
      task.blockedReason = patch.blockedReason;
    }

    task.updatedAt = now;
    task.updatedBy = principal.user.id;
    const changes = diffFields(before, task, TASK_LABELS);
    if (changes.length > 0) track(task, actor, "Actualizó la tarea", changes);
    notifications.push(...applyTaskToOrder(docs, task, actor));

    // Who needs to know.
    const positionTitle = docs.positions.items.find((p) => p.id === task.positionId)?.title ?? "sin asignar";
    if (principal.isAdmin) {
      if (task.positionId && task.positionId !== previousPosition) {
        notifications.push(
          pushNotification(docs.notifications, actor, {
            audience: { kind: "position", positionId: task.positionId },
            type: "task_assigned",
            title: `Te asignaron ${task.folio}`,
            body: task.title,
            link: `/tareas?t=${task.id}`,
            urgent: task.priority === "urgente",
          }),
        );
      } else if (task.positionId && ADMIN_ONLY_FIELDS.some((f) => patch[f] !== undefined)) {
        notifications.push(
          pushNotification(docs.notifications, actor, {
            audience: { kind: "position", positionId: task.positionId },
            type: "task_updated",
            title: `Actualización en ${task.folio}`,
            body: `${principal.user.displayName} modificó “${task.title}”.`,
            link: `/tareas?t=${task.id}`,
          }),
        );
      }
    }
    if (!principal.isAdmin || principal.position?.id === task.positionId) {
      if (task.status === "completada" && previousStatus !== "completada") {
        notifications.push(
          pushNotification(docs.notifications, actor, {
            audience: { kind: "admins" },
            type: "task_completed",
            title: `${task.folio} completada`,
            body: `${principal.user.displayName} (${positionTitle}) terminó “${task.title}”.`,
            link: `/admin/tareas?t=${task.id}`,
          }),
        );
      }
      if (task.status === "bloqueada" && previousStatus !== "bloqueada") {
        notifications.push(
          pushNotification(docs.notifications, actor, {
            audience: { kind: "admins" },
            type: "task_blocked",
            title: `${task.folio} bloqueada`,
            body: `${principal.user.displayName} (${positionTitle}): ${task.blockedReason}`,
            link: `/admin/tareas?t=${task.id}`,
            urgent: true,
          }),
        );
      }
    }
    if (patch.status !== undefined || patch.positionId !== undefined) {
      audit(docs.audit, actor, "tarea_actualizada", task.folio, `${previousStatus} → ${task.status}`);
    }
    return { task, notifications };
  });
}

export async function deleteTask(principal: Principal, taskId: string) {
  await getDb().transact(["tasks", "audit"], "Elimina una tarea", ({ tasks, audit: log }) => {
    const task = tasks.items.find((t) => t.id === taskId);
    if (!task) throw notFound("Tarea no encontrada.");
    if (task.orderId) throw conflict("Esta tarea es un paso de una orden de trabajo. Quítalo desde la OT.", "order_owned");
    tasks.items = tasks.items.filter((t) => t.id !== taskId);
    audit(log, actorOf(principal), "tarea_eliminada", task.folio, task.title);
  });
}

export async function addTaskNote(principal: Principal, taskId: string, text: string) {
  return getDb().transact(["tasks", "positions", "notifications"], "Agrega una nota a una tarea", (docs) => {
    const task = docs.tasks.items.find((t) => t.id === taskId);
    if (!task) throw notFound("Tarea no encontrada.");
    if (!canWorkOn(principal, task)) throw forbidden("Esta tarea no es de tu puesto.");
    if (task.notes.length >= 200) throw conflict("La tarea tiene demasiadas notas.");
    task.notes.push({ id: newId(), authorId: principal.user.id, authorName: principal.user.displayName, text, at: nowIso() });
    task.updatedAt = nowIso();
    const fromWorker = !principal.isAdmin || principal.position?.id === task.positionId;
    if (!fromWorker && !task.positionId) return { task, notifications: [] as Notification[] };
    const notification = pushNotification(docs.notifications, actorOf(principal), {
      audience: fromWorker ? { kind: "admins" } : { kind: "position", positionId: task.positionId! },
      type: "task_updated",
      title: `Nota en ${task.folio}`,
      body: `${principal.user.displayName}: ${text}`,
      link: fromWorker ? `/admin/tareas?t=${task.id}` : `/tareas?t=${task.id}`,
    });
    return { task, notifications: [notification] };
  });
}

export interface RequestInput {
  type: RequestType;
  item: string;
  quantity: string | null;
  urgent: boolean;
  note: string | null;
  taskId: string | null;
}

const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  material: "Material",
  herramienta: "Herramienta",
  mantenimiento: "Mantenimiento",
  consumible: "Consumible",
  epp: "EPP",
  otro: "Solicitud",
};

export async function createRequest(principal: Principal, input: RequestInput) {
  return getDb().transact(["requests", "tasks", "notifications", "audit"], "Nueva solicitud de material", (docs) => {
    if (input.taskId) {
      const task = docs.tasks.items.find((t) => t.id === input.taskId);
      if (!task || !canWorkOn(principal, task)) throw badRequest("La tarea indicada no existe o no es de tu puesto.");
    }
    const open = docs.requests.items.filter((r) => r.userId === principal.user.id && r.status === "pendiente").length;
    if (open >= 30) throw conflict("Tienes demasiadas solicitudes pendientes. Espera a que las atiendan.");
    const now = nowIso();
    const request: SupplyRequest = {
      id: newId(),
      folio: folio("SOL", nextSeq(docs.requests)),
      positionId: principal.position?.id ?? null,
      userId: principal.user.id,
      requesterName: principal.user.displayName,
      type: input.type,
      item: input.item,
      quantity: input.quantity,
      urgent: input.urgent,
      note: input.note,
      taskId: input.taskId,
      status: "pendiente",
      response: null,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const cutoff = addDays(principal.today, -180);
    docs.requests.items = docs.requests.items.filter(
      (r) => r.status === "pendiente" || r.status === "en_camino" || r.updatedAt.slice(0, 10) >= cutoff,
    );
    docs.requests.items.push(request);
    const where = principal.position?.title ?? "Administración";
    const notification = pushNotification(docs.notifications, actorOf(principal), {
      audience: { kind: "admins" },
      type: "request_created",
      title: `${input.urgent ? "URGENTE · " : ""}${REQUEST_TYPE_LABEL[input.type]}: ${input.item}`,
      body: `${principal.user.displayName} (${where})${input.quantity ? ` pide ${input.quantity}` : " hace una solicitud"}${input.note ? ` · ${input.note}` : ""}`,
      link: `/admin/solicitudes?s=${request.id}`,
      urgent: input.urgent,
    });
    audit(docs.audit, actorOf(principal), "solicitud_creada", request.folio, input.item);
    return { request, notifications: [notification] };
  });
}

const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pendiente: "pendiente",
  en_camino: "en camino",
  entregada: "entregada",
  rechazada: "rechazada",
  cancelada: "cancelada",
};

export async function updateRequest(
  principal: Principal,
  requestId: string,
  input: { status: RequestStatus; response: string | null },
) {
  return getDb().transact(["requests", "notifications", "audit"], "Actualiza una solicitud", (docs) => {
    const request = docs.requests.items.find((r) => r.id === requestId);
    if (!request) throw notFound("Solicitud no encontrada.");
    const isOwner = request.userId === principal.user.id;

    if (!principal.isAdmin) {
      if (!isOwner) throw forbidden();
      if (input.status !== "cancelada" || request.status !== "pendiente") {
        throw forbidden("Solo puedes cancelar tus solicitudes pendientes.");
      }
    }
    if (request.status === "cancelada" || request.status === "entregada" || request.status === "rechazada") {
      if (input.status !== request.status) throw conflict("Esta solicitud ya está cerrada.");
    }

    request.status = input.status;
    if (input.response !== null) request.response = input.response;
    request.updatedAt = nowIso();
    if (input.status !== "pendiente" && input.status !== "en_camino") {
      request.resolvedAt = request.updatedAt;
      request.resolvedBy = principal.user.id;
    }
    audit(docs.audit, actorOf(principal), "solicitud_actualizada", request.folio, input.status);

    const notifications: Notification[] = [];
    if (!isOwner) {
      notifications.push(
        pushNotification(docs.notifications, actorOf(principal), {
          audience: { kind: "user", userId: request.userId },
          type: "request_updated",
          title: `${request.folio}: ${REQUEST_STATUS_LABEL[input.status]}`,
          body: `${request.item}${input.response ? ` · ${input.response}` : ""}`,
          link: `/solicitudes?s=${request.id}`,
          urgent: input.status === "rechazada",
        }),
      );
    }
    return { request, notifications };
  });
}

export async function closeDay(
  principal: Principal,
  input: { note: string; issues: string; completeTaskIds: string[] },
) {
  const position = principal.position;
  if (!position) throw badRequest("El cierre de día es para cuentas con puesto en el taller.");

  return getDb().transact(["tasks", "orders", "closures", "notifications", "audit"], "Cierre de día", (docs) => {
    const now = nowIso();
    const date = principal.today;
    const extra: Notification[] = [];
    const actor = actorOf(principal);
    for (const id of input.completeTaskIds) {
      const task = docs.tasks.items.find((t) => t.id === id);
      if (!task || task.positionId !== position.id) throw badRequest("Una de las tareas no es de tu puesto.");
      if (task.status !== "completada") {
        task.status = "completada";
        task.completedAt = now;
        task.completedBy = principal.user.id;
        task.blockedReason = null;
        task.updatedAt = now;
        task.updatedBy = principal.user.id;
        if (task.quantity !== null) task.quantityDone = task.quantity;
        track(task, actor, "Completada en el cierre de día");
        extra.push(...applyTaskToOrder(docs, task, actor));
      }
    }
    const mine = docs.tasks.items.filter((t) => t.positionId === position.id);
    const completed = mine
      .filter(
        (t) =>
          t.status === "completada" &&
          t.completedAt !== null &&
          dateInZone(new Date(t.completedAt), principal.settings.timezone) === date,
      )
      .map((t) => ({ id: t.id, folio: t.folio, title: t.title }));
    const pending = mine
      .filter((t) => t.status !== "completada")
      .map((t) => ({ id: t.id, folio: t.folio, title: t.title, status: t.status }));

    const existing = docs.closures.items.find((c) => c.date === date && c.positionId === position.id);
    const closure: DayClosure = {
      id: existing?.id ?? newId(),
      date,
      positionId: position.id,
      userId: principal.user.id,
      userName: principal.user.displayName,
      completed,
      pending,
      note: input.note,
      issues: input.issues,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const cutoff = addDays(date, -RETENTION.closuresDays);
    docs.closures.items = docs.closures.items.filter((c) => c.id !== closure.id && c.date >= cutoff);
    docs.closures.items.push(closure);

    const notification = pushNotification(docs.notifications, actorOf(principal), {
      audience: { kind: "admins" },
      type: "day_closed",
      title: `Cierre de día · ${position.title}`,
      body: `${principal.user.displayName}: ${completed.length} completadas, ${pending.length} pendientes${input.issues ? ` · Novedades: ${input.issues}` : ""}`,
      link: `/admin/cierres?d=${date}`,
      urgent: Boolean(input.issues),
    });
    audit(docs.audit, actorOf(principal), "cierre_de_dia", position.id, `${completed.length}/${pending.length}`);
    return { closure, notifications: [notification, ...extra] };
  });
}
