import { describe, expect, it } from "vitest";
import type { Order, WorkItem } from "./schema";
import { canSeeTaskMap, mapPriority, taskMapRows } from "./task-map";

const TODAY = "2026-10-27";
const TZ = "America/Bogota";

function item(id: string, over: Partial<WorkItem> = {}): WorkItem {
  return { id, process: "torno", machineId: "m1", positionId: null, description: "", plannedHours: 2, actualHours: null, status: "pendiente", taskId: null, completedAt: null, ...over };
}

function order(id: string, over: Partial<Order> = {}): Order {
  return {
    id,
    folio: `OT-${id}`,
    title: `Trabajo ${id}`,
    clientName: "Cliente",
    status: "recibida",
    urgent: false,
    intake: { receivedAt: "2026-10-20T15:00:00.000Z", quantity: 1, condition: "" },
    due: null,
    workItems: [item(`${id}a`)],
    requiredSupplies: [],
    supplies: [],
    createdAt: "2026-10-20T15:00:00.000Z",
    ...over,
  } as Order;
}

const machines = [{ id: "m1", name: "Torno Pinacho", positionId: "p-torno" }];
const positions = [{ id: "p-torno", holder: { name: "Henry Henao" } }, { id: "p-cnc", holder: null }];

describe("mapa de tareas", () => {
  it("prioridad: rojo urgente o vencida, amarillo 7 días o menos, azul con tiempo", () => {
    expect(mapPriority({ urgent: true, due: null }, TODAY)).toBe("urgente");
    expect(mapPriority({ urgent: false, due: { date: "2026-10-26", time: "17:00" } }, TODAY)).toBe("urgente");
    expect(mapPriority({ urgent: false, due: { date: "2026-11-03", time: "17:00" } }, TODAY)).toBe("alta");
    expect(mapPriority({ urgent: false, due: { date: "2026-11-04", time: "17:00" } }, TODAY)).toBe("programado");
    expect(mapPriority({ urgent: false, due: null }, TODAY)).toBe("programado");
  });

  it("una fila por paso abierto, con máquina, operario y lo más urgente arriba", () => {
    const rows = taskMapRows(
      [
        order("1", { due: { date: "2026-12-01", time: "17:00" } }),
        order("2", { urgent: true, workItems: [item("2a", { status: "en_proceso" }), item("2b", { machineId: null, process: "cnc", positionId: "p-cnc" }), item("2c", { status: "completada" })] }),
        order("3", { status: "entregada" }),
      ],
      machines,
      positions,
      TODAY,
      TZ,
    );
    expect(rows.map((r) => r.key)).toEqual(["2:2a", "2:2b", "1:1a"]);
    expect(rows[0]).toMatchObject({ machine: "Torno Pinacho", operator: "Henry Henao", status: "en_proceso", priority: "urgente", received: "2026-10-20" });
    expect(rows[1]).toMatchObject({ machine: "CNC", operator: null, status: "en_cola" });
    expect(rows[2]).toMatchObject({ priority: "programado", due: "2026-12-01" });
  });

  it("con insumos pendientes el estado es «Material pdte» salvo que ya esté en proceso", () => {
    const pending = [{ id: "s1", name: "Bronce", quantity: 1, unit: "kg", status: "pendiente", note: "", requestedAt: "2026-10-20T15:00:00.000Z", requestedBy: null, obtainedAt: null, obtainedBy: null }];
    const rows = taskMapRows([order("1", { requiredSupplies: pending as Order["requiredSupplies"], workItems: [item("a"), item("b", { status: "en_proceso" })] })], machines, positions, TODAY, TZ);
    expect(rows.map((r) => r.status)).toEqual(["material", "en_proceso"]);
  });

  it("solo los usuarios habilitados lo ven en el menú", () => {
    expect(canSeeTaskMap("edwin.enriquez")).toBe(true);
    expect(canSeeTaskMap("alejandra.urrea")).toBe(false);
  });
});
