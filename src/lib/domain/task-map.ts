import { PROCESS_LABEL } from "./labels";
import { OPEN_ORDER_STATUSES } from "./planning";
import type { Machine, Order, Process, WorkItem } from "./schema";
import { orderSupplyLines } from "./supplies";
import { daysBetween, dateInZone } from "./time";

/** Rojo = urgente, amarillo = alta, azul = programado (con tiempo). */
export type MapPriority = "urgente" | "alta" | "programado";
export type MapStatus = "en_cola" | "en_proceso" | "bloqueada" | "material";

export const MAP_PRIORITY_LABEL: Record<MapPriority, string> = { urgente: "Urgente", alta: "Alta", programado: "Programado" };
export const MAP_STATUS_LABEL: Record<MapStatus, string> = { en_cola: "En cola", en_proceso: "En proceso", bloqueada: "Bloqueada", material: "Material pdte" };
const PRIORITY_RANK: Record<MapPriority, number> = { urgente: 0, alta: 1, programado: 2 };

/** A delivery due within this many days is «Alta»; later (or without date) is «Programado». */
export const HIGH_PRIORITY_DAYS = 7;

export interface TaskMapRow {
  key: string;
  orderId: string;
  folio: string;
  title: string;
  /** What this step does (work item description), if any. */
  detail: string;
  clientName: string;
  machine: string;
  process: Process | null;
  priority: MapPriority;
  /** AAAA-MM-DD in the workshop timezone. */
  received: string;
  due: string | null;
  status: MapStatus;
  operator: string | null;
}

type MapOrder = Pick<Order, "id" | "folio" | "title" | "clientName" | "status" | "urgent" | "intake" | "due" | "workItems" | "requiredSupplies" | "supplies" | "createdAt">;
type MapMachine = Pick<Machine, "id" | "name" | "positionId">;
type MapPosition = { id: string; holder: { name: string } | null };

/** Urgent orders and overdue deliveries are red; due within a week yellow; the rest blue. */
export function mapPriority(order: Pick<Order, "urgent" | "due">, today: string): MapPriority {
  if (order.urgent) return "urgente";
  if (!order.due) return "programado";
  const days = daysBetween(today, order.due.date);
  if (days < 0) return "urgente";
  return days <= HIGH_PRIORITY_DAYS ? "alta" : "programado";
}

function stepStatus(item: WorkItem | null, materialPending: boolean): MapStatus {
  if (item?.status === "en_proceso") return "en_proceso";
  if (materialPending) return "material";
  return item?.status === "bloqueada" ? "bloqueada" : "en_cola";
}

/**
 * One row per open process step of every order in production (the step is the
 * task a machine and its operario are working on), most urgent first.
 */
export function taskMapRows(orders: MapOrder[], machines: MapMachine[], positions: MapPosition[], today: string, timezone: string): TaskMapRow[] {
  const machineById = new Map(machines.map((m) => [m.id, m]));
  const holderOf = (positionId: string | null) => (positionId ? (positions.find((p) => p.id === positionId)?.holder?.name ?? null) : null);

  const rows = orders
    .filter((o) => OPEN_ORDER_STATUSES.includes(o.status))
    .flatMap((order) => {
      const priority = mapPriority(order, today);
      const materialPending = orderSupplyLines(order).some((l) => l.supply.status === "pendiente");
      const base = {
        orderId: order.id,
        folio: order.folio,
        title: order.title,
        clientName: order.clientName,
        priority,
        received: dateInZone(new Date(order.intake.receivedAt), timezone),
        due: order.due?.date ?? null,
      };
      const steps = order.workItems.filter((w) => w.status !== "completada");
      if (order.workItems.length === 0) {
        return [{ ...base, key: order.id, detail: "", machine: "Sin asignar", process: null, status: stepStatus(null, materialPending), operator: null }];
      }
      return steps.map((item): TaskMapRow => {
        const machine = item.machineId ? machineById.get(item.machineId) : undefined;
        return {
          ...base,
          key: `${order.id}:${item.id}`,
          detail: item.description,
          machine: machine?.name ?? PROCESS_LABEL[item.process],
          process: item.process,
          status: stepStatus(item, materialPending),
          operator: holderOf(item.positionId) ?? holderOf(machine?.positionId ?? null),
        };
      });
    });

  return rows.sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      (a.due ?? "9999-12-31").localeCompare(b.due ?? "9999-12-31") ||
      a.received.localeCompare(b.received) ||
      a.folio.localeCompare(b.folio),
  );
}
