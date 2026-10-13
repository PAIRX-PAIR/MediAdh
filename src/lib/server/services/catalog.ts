import "server-only";
import { diffFields } from "@/lib/domain/diff";
import { MACHINE_STATE_LABEL } from "@/lib/domain/labels";
import { parseNit } from "@/lib/domain/nit";
import type { Client, ClientKind, IpcEntry, Machine, MachineState, Notification, Process } from "@/lib/domain/schema";
import { isRealDate } from "@/lib/domain/time";
import type { Principal } from "../auth/principal";
import { badRequest, conflict, notFound } from "../http";
import { getDb } from "../store";
import { actorOf, audit, newId, nowIso, pushNotification, track } from "./common";

/* ─────────────────────────────── Clientes ─────────────────────────────── */

export interface ClientInput {
  kind: ClientKind;
  name: string;
  nit: string;
  companyPhone: string;
  personalPhone: string;
  contactName: string;
  email: string;
  city: string;
  address: string;
  notes: string;
  tier: number;
}

const CLIENT_LABELS = {
  kind: "Tipo",
  name: "Nombre / razón social",
  nit: "NIT / cédula",
  dv: "DV",
  companyPhone: "Teléfono empresarial",
  personalPhone: "Teléfono personal",
  contactName: "Contacto",
  email: "Correo",
  city: "Ciudad",
  address: "Dirección",
  notes: "Notas",
  tier: "Nivel",
  archived: "Archivado",
} as const;

/** Validates the NIT/cédula and returns base number + DV ("" when not given). */
function normalizeNit(raw: string): { nit: string; dv: string } {
  if (!raw.trim()) return { nit: "", dv: "" };
  const parsed = parseNit(raw);
  if (!parsed) throw badRequest("El NIT o la cédula debe tener entre 5 y 15 dígitos.");
  if (parsed.mismatch) throw badRequest(`El dígito de verificación no coincide: para ${parsed.number} es ${parsed.dv}.`, "nit_dv");
  return { nit: parsed.number, dv: parsed.dv };
}

function assertUniqueNit(clients: Client[], nit: string, exceptId?: string) {
  if (!nit) return;
  const other = clients.find((c) => c.nit === nit && c.id !== exceptId && !c.archived);
  if (other) throw conflict(`Ya existe un cliente con ese NIT: ${other.name}.`, "nit_taken");
}

export async function createClient(principal: Principal, input: ClientInput) {
  const { nit, dv } = normalizeNit(input.nit);
  return getDb().transact(["clients", "audit"], "Registra un cliente", (docs) => {
    assertUniqueNit(docs.clients.items, nit);
    const now = nowIso();
    const client: Client = {
      id: newId(),
      kind: input.kind,
      name: input.name,
      nit,
      dv,
      companyPhone: input.companyPhone,
      personalPhone: input.personalPhone,
      contactName: input.contactName,
      email: input.email,
      city: input.city,
      address: input.address,
      notes: input.notes,
      tier: input.tier,
      archived: false,
      history: [],
      createdBy: principal.user.id,
      createdAt: now,
      updatedAt: now,
    };
    track(client, actorOf(principal), "Creó el cliente");
    docs.clients.items.push(client);
    audit(docs.audit, actorOf(principal), "cliente_creado", client.id, client.name);
    return client;
  });
}

export async function updateClient(principal: Principal, id: string, patch: Partial<ClientInput> & { archived?: boolean }) {
  const nitPatch = patch.nit !== undefined ? normalizeNit(patch.nit) : null;
  return getDb().transact(["clients", "audit"], "Actualiza un cliente", (docs) => {
    const client = docs.clients.items.find((c) => c.id === id);
    if (!client) throw notFound("Cliente no encontrado.");
    const before = { ...client };
    if (nitPatch) {
      assertUniqueNit(docs.clients.items, nitPatch.nit, id);
      client.nit = nitPatch.nit;
      client.dv = nitPatch.dv;
    }
    for (const key of ["kind", "name", "companyPhone", "personalPhone", "contactName", "email", "city", "address", "notes", "tier", "archived"] as const) {
      if (patch[key] !== undefined) (client as Record<string, unknown>)[key] = patch[key];
    }
    const changes = diffFields(before, client, CLIENT_LABELS);
    if (changes.length === 0) return client;
    client.updatedAt = nowIso();
    track(client, actorOf(principal), patch.archived === true ? "Archivó el cliente" : patch.archived === false ? "Restauró el cliente" : "Editó el cliente", changes);
    audit(docs.audit, actorOf(principal), "cliente_actualizado", client.id, changes.map((c) => c.label).join(", "));
    return client;
  });
}

/* ─────────────────────────────── Máquinas ─────────────────────────────── */

export interface MachineInput {
  name: string;
  process: Process;
  description: string;
  state: MachineState;
  activeSince: string | null;
  hoursPerDay: number;
  hourlyRate: number;
  positionId: string | null;
}

const MACHINE_LABELS = {
  name: "Nombre",
  process: "Proceso",
  description: "Descripción",
  state: "Estado",
  activeSince: "Activa desde",
  hoursPerDay: "Horas por día",
  hourlyRate: "Tarifa por hora",
  positionId: "Puesto responsable",
  order: "Orden",
} as const;

function assertDate(value: string | null | undefined, label: string) {
  if (value && !isRealDate(value)) throw badRequest(`${label}: fecha inválida.`);
}

export async function createMachine(principal: Principal, input: MachineInput) {
  assertDate(input.activeSince, "Activa desde");
  return getDb().transact(["machines", "positions", "audit"], "Agrega una máquina", (docs) => {
    if (input.positionId && !docs.positions.items.some((p) => p.id === input.positionId)) throw badRequest("El puesto no existe.");
    if (input.state === "mantenimiento") throw badRequest("Una máquina nueva no puede empezar en mantenimiento.");
    const now = nowIso();
    const machine: Machine = {
      id: newId(),
      name: input.name,
      process: input.process,
      description: input.description,
      state: input.state,
      activeSince: input.state === "activa" ? (input.activeSince ?? principal.today) : input.activeSince,
      hoursPerDay: input.hoursPerDay,
      hourlyRate: input.hourlyRate,
      positionId: input.positionId,
      order: Math.max(0, ...docs.machines.items.map((m) => m.order)) + 1,
      stops: [],
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    track(machine, actorOf(principal), "Agregó la máquina");
    docs.machines.items.push(machine);
    audit(docs.audit, actorOf(principal), "maquina_creada", machine.id, machine.name);
    return machine;
  });
}

export interface MachinePatch extends Partial<MachineInput> {
  order?: number;
  /** Reason for a maintenance stop when moving to "mantenimiento". */
  stopReason?: string | null;
}

/**
 * State changes have business meaning:
 * - inactiva → activa: counts for capacity and indicators from `activeSince` (default today).
 * - activa → mantenimiento: opens a stop (paro) that removes its capacity.
 * - mantenimiento → activa: closes the stop.
 * - → inactiva: only when no pending work is assigned to it.
 */
export async function updateMachine(principal: Principal, id: string, patch: MachinePatch) {
  assertDate(patch.activeSince, "Activa desde");
  return getDb().transact(["machines", "positions", "orders", "notifications", "audit"], "Actualiza una máquina", (docs) => {
    const machine = docs.machines.items.find((m) => m.id === id);
    if (!machine) throw notFound("Máquina no encontrada.");
    if (patch.positionId && !docs.positions.items.some((p) => p.id === patch.positionId)) throw badRequest("El puesto no existe.");
    const before = { ...machine };
    const actor = actorOf(principal);
    const now = nowIso();
    const notifications: Notification[] = [];

    for (const key of ["name", "process", "description", "hoursPerDay", "hourlyRate", "positionId", "order", "activeSince"] as const) {
      if (patch[key] !== undefined) (machine as Record<string, unknown>)[key] = patch[key];
    }

    if (patch.state !== undefined && patch.state !== machine.state) {
      const from = machine.state;
      const to = patch.state;
      const pending = docs.orders.items.flatMap((o) =>
        ["recibida", "en_proceso", "garantia"].includes(o.status) ? o.workItems.filter((w) => w.machineId === id && w.status !== "completada") : [],
      );
      if (to === "inactiva" && pending.length > 0) {
        throw conflict(`Hay ${pending.length} paso(s) de trabajo pendientes en esta máquina. Reasígnalos antes de dejarla inactiva.`, "machine_busy");
      }
      if (to === "activa" && from === "inactiva") {
        // Keep the original service start so past capacity and indicators survive a pause.
        machine.activeSince = patch.activeSince ?? machine.activeSince ?? principal.today;
      }
      if (to === "mantenimiento") {
        if (from === "inactiva") throw badRequest("Activa la máquina antes de ponerla en mantenimiento.");
        machine.stops.push({ id: newId(), from: now, to: null, reason: patch.stopReason?.trim() || "Mantenimiento", createdBy: principal.user.id });
        if (machine.stops.length > 200) machine.stops.splice(0, machine.stops.length - 200);
      }
      if (from === "mantenimiento") {
        for (const stop of machine.stops) if (!stop.to) stop.to = now;
      }
      machine.state = to;
      const message = `${machine.name}: ${MACHINE_STATE_LABEL[from]} → ${MACHINE_STATE_LABEL[to]}`;
      notifications.push(
        pushNotification(docs.notifications, actor, {
          audience: { kind: "admins" },
          type: "machine_status",
          title: to === "mantenimiento" ? `${machine.name} en mantenimiento` : `${machine.name} ${MACHINE_STATE_LABEL[to].toLowerCase()}`,
          body: to === "mantenimiento" ? `${patch.stopReason?.trim() || "Paro de mantenimiento"}. Su capacidad sale de la planeación.` : message,
          link: "/admin/cola",
        }),
      );
      if (machine.positionId) {
        notifications.push(
          pushNotification(docs.notifications, actor, {
            audience: { kind: "position", positionId: machine.positionId },
            type: "machine_status",
            title: `${machine.name}: ${MACHINE_STATE_LABEL[to]}`,
            body: to === "mantenimiento" ? `${patch.stopReason?.trim() || "Paro de mantenimiento"}.` : "La máquina vuelve a estar disponible.",
            link: "/tareas",
          }),
        );
      }
    }

    if (machine.state === "activa" && !machine.activeSince) machine.activeSince = principal.today;
    const changes = diffFields(before, machine, MACHINE_LABELS);
    if (changes.length === 0) return { machine, notifications };
    machine.updatedAt = now;
    track(machine, actor, patch.state && patch.state !== before.state ? `Cambió el estado a ${MACHINE_STATE_LABEL[patch.state]}` : "Editó la máquina", changes);
    audit(docs.audit, actor, "maquina_actualizada", machine.id, changes.map((c) => `${c.label}: ${c.to ?? "—"}`).join(", "));
    return { machine, notifications };
  });
}

export async function deleteMachine(principal: Principal, id: string) {
  await getDb().transact(["machines", "orders", "audit"], "Elimina una máquina", (docs) => {
    const machine = docs.machines.items.find((m) => m.id === id);
    if (!machine) throw notFound("Máquina no encontrada.");
    const used = docs.orders.items.some((o) => o.workItems.some((w) => w.machineId === id));
    if (used) throw conflict("La máquina tiene trabajos registrados. Déjala inactiva en lugar de eliminarla para conservar el histórico.", "machine_in_use");
    docs.machines.items = docs.machines.items.filter((m) => m.id !== id);
    audit(docs.audit, actorOf(principal), "maquina_eliminada", id, machine.name);
  });
}

/* ─────────────────────────────── IPC (DANE) ─────────────────────────────── */

/** Upserts monthly indices and removes the months listed in `remove`. */
export async function saveIpc(principal: Principal, input: { entries: Array<{ month: string; index: number }>; remove: string[] }) {
  const months = new Set<string>();
  for (const e of input.entries) {
    if (months.has(e.month)) throw badRequest(`El mes ${e.month} está repetido.`);
    months.add(e.month);
  }
  return getDb().transact(["ipc", "audit"], "Actualiza la tabla de IPC", (docs) => {
    const byMonth = new Map<string, IpcEntry>(docs.ipc.items.map((e) => [e.month, e]));
    for (const m of input.remove) byMonth.delete(m);
    for (const e of input.entries) byMonth.set(e.month, { id: byMonth.get(e.month)?.id ?? e.month, month: e.month, index: e.index });
    docs.ipc.items = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
    audit(docs.audit, actorOf(principal), "ipc_actualizado", null, `${input.entries.length} mes(es)${input.remove.length ? `, ${input.remove.length} eliminado(s)` : ""}`);
    return docs.ipc.items;
  });
}
