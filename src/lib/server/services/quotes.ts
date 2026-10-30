import "server-only";
import { diffFields } from "@/lib/domain/diff";
import { QUOTE_STATUS_LABEL } from "@/lib/domain/labels";
import { formatCop, quoteTotals } from "@/lib/domain/quote";
import type { Difficulty, Machine, Notification, Order, Process, Quote } from "@/lib/domain/schema";
import { isRealDate } from "@/lib/domain/time";
import type { Principal } from "../auth/principal";
import { badRequest, conflict, notFound } from "../http";
import { getDb } from "../store";
import { actorOf, audit, folio, newId, nextSeq, nowIso, pushNotification, track } from "./common";
import { createOrderIn, leastLoadedMachine } from "./orders";

export interface QuoteInput {
  clientId: string | null;
  clientName: string | null;
  title: string;
  description: string;
  quantity: number;
  materials: Array<{ id?: string; description: string; quantity: number; unitCost: number }>;
  labor: Array<{ id?: string; process: Process; machineId?: string | null; description: string; hours: number; rate: number | null }>;
  difficulty: Difficulty;
  urgent: boolean;
  marginPct: number | null;
  ivaPct: number | null;
  validDays: number | null;
  notes: string;
}

const QUOTE_LABELS = {
  clientName: "Cliente",
  title: "Trabajo",
  description: "Descripción",
  quantity: "Cantidad",
  difficulty: "Dificultad",
  urgent: "Urgente",
  marginPct: "Utilidad %",
  ivaPct: "IVA %",
  validDays: "Vigencia (días)",
  status: "Estado",
  notes: "Notas",
} as const;

type QuoteDocs = "quotes" | "clients" | "settings" | "machines" | "audit";

function resolveClient(clients: Array<{ id: string; name: string }>, clientId: string | null, clientName: string | null) {
  if (clientId) {
    const client = clients.find((c) => c.id === clientId);
    if (!client) throw badRequest("El cliente elegido no existe.");
    return { clientId, clientName: client.name };
  }
  const name = clientName?.trim();
  if (!name) throw badRequest("Elige un cliente o escribe su nombre.");
  return { clientId: null, clientName: name };
}

/**
 * Each machine has its own tariff (it depends on the machine and on its operator's
 * salary); without a machine, or with a $0 tariff, the process rate of Ajustes applies.
 */
function rateFor(process: Process, machineId: string | null, machines: Machine[], rates: Record<Process, number>): number {
  const machine = machineId ? machines.find((m) => m.id === machineId) : undefined;
  return machine && machine.hourlyRate > 0 ? machine.hourlyRate : rates[process];
}

function lines(input: Pick<QuoteInput, "materials" | "labor">, previous: Quote | null, rates: Record<Process, number>, machines: Machine[]) {
  return {
    materials: input.materials.map((m) => ({
      id: m.id && previous?.materials.some((p) => p.id === m.id) ? m.id : newId(),
      description: m.description,
      quantity: m.quantity,
      unitCost: m.unitCost,
    })),
    labor: input.labor.map((l) => {
      const machine = l.machineId ? machines.find((m) => m.id === l.machineId) : undefined;
      if (l.machineId && !machine) throw badRequest("Una de las máquinas cotizadas ya no existe.");
      const process = machine?.process ?? l.process;
      return {
        id: l.id && previous?.labor.some((p) => p.id === l.id) ? l.id : newId(),
        process,
        machineId: machine?.id ?? null,
        description: l.description,
        hours: l.hours,
        // Rates are copied into the quote: later tariff changes never alter a sent price.
        rate: l.rate ?? rateFor(process, machine?.id ?? null, machines, rates),
      };
    }),
  };
}

function totalsSummary(q: Quote) {
  const t = quoteTotals(q);
  return `${formatCop(t.subtotal)} + IVA = ${formatCop(t.total)}`;
}

/** A minimal open order carrying one step of load, used only to balance machine choice. */
function pseudoLoad(machineId: string, process: Process, hours: number): Order {
  return {
    status: "recibida",
    workItems: [{ id: "load", process, machineId, positionId: null, description: "", plannedHours: hours, actualHours: null, status: "pendiente", taskId: null, completedAt: null }],
  } as unknown as Order;
}

export async function createQuote(principal: Principal, input: QuoteInput) {
  return getDb().transact<QuoteDocs, Quote>(["quotes", "clients", "settings", "machines", "audit"], "Crea una cotización", (docs) => {
    const production = docs.settings.production;
    const client = resolveClient(docs.clients.items, input.clientId, input.clientName);
    const now = nowIso();
    const quote: Quote = {
      id: newId(),
      folio: folio("COT", nextSeq(docs.quotes)),
      ...client,
      title: input.title,
      description: input.description,
      quantity: input.quantity,
      ...lines(input, null, production.processRates, docs.machines.items),
      difficulty: input.difficulty,
      urgent: input.urgent,
      marginPct: input.marginPct ?? 0,
      // La dificultad y la urgencia no suman puntos: la utilidad es la que se escribe.
      extraMarginPct: 0,
      ivaPct: input.ivaPct ?? production.ivaPct,
      validDays: input.validDays ?? production.quoteValidDays,
      status: "borrador",
      issuedAt: null,
      decidedAt: null,
      orderId: null,
      drawingIds: [],
      notes: input.notes,
      history: [],
      createdBy: principal.user.id,
      createdAt: now,
      updatedAt: now,
    };
    track(quote, actorOf(principal), `Creó la cotización · ${totalsSummary(quote)}`);
    docs.quotes.items.push(quote);
    audit(docs.audit, actorOf(principal), "cotizacion_creada", quote.folio, quote.title);
    return quote;
  });
}

export async function updateQuote(principal: Principal, id: string, patch: Partial<QuoteInput>) {
  return getDb().transact<QuoteDocs, Quote>(["quotes", "clients", "settings", "machines", "audit"], "Actualiza una cotización", (docs) => {
    const quote = docs.quotes.items.find((q) => q.id === id);
    if (!quote) throw notFound("Cotización no encontrada.");
    if (quote.status === "aprobada" || quote.status === "rechazada") {
      const onlyNotes = Object.keys(patch).every((k) => k === "notes");
      if (!onlyNotes) throw conflict("La cotización ya fue decidida. Duplícala para hacer una nueva versión.", "quote_locked");
    }
    const before = structuredClone(quote);
    const priceBefore = totalsSummary(quote);
    if (patch.clientId !== undefined || patch.clientName !== undefined) {
      Object.assign(quote, resolveClient(docs.clients.items, patch.clientId ?? null, patch.clientName ?? quote.clientName));
    }
    for (const key of ["title", "description", "quantity", "difficulty", "urgent", "notes"] as const) {
      if (patch[key] !== undefined) (quote as Record<string, unknown>)[key] = patch[key];
    }
    // Un borrador hecho con la regla anterior pierde sus puntos de dificultad/urgencia al guardarse;
    // una cotización ya enviada conserva su valor para no cambiarle el precio al cliente.
    if (quote.status === "borrador") quote.extraMarginPct = 0;
    if (patch.marginPct !== undefined && patch.marginPct !== null) quote.marginPct = patch.marginPct;
    if (patch.ivaPct !== undefined && patch.ivaPct !== null) quote.ivaPct = patch.ivaPct;
    if (patch.validDays !== undefined && patch.validDays !== null) quote.validDays = patch.validDays;
    if (patch.materials !== undefined || patch.labor !== undefined) {
      const next = lines(
        { materials: patch.materials ?? quote.materials, labor: patch.labor ?? quote.labor },
        quote,
        docs.settings.production.processRates,
        docs.machines.items,
      );
      quote.materials = next.materials;
      quote.labor = next.labor;
    }
    const changes = diffFields(before, quote, QUOTE_LABELS);
    const priceAfter = totalsSummary(quote);
    if (priceBefore !== priceAfter) changes.push({ field: "total", label: "Valor", from: priceBefore, to: priceAfter });
    if (changes.length === 0) return quote;
    quote.updatedAt = nowIso();
    track(quote, actorOf(principal), "Editó la cotización", changes);
    return quote;
  });
}

export async function setQuoteStatus(principal: Principal, id: string, to: "enviada" | "rechazada" | "borrador") {
  return getDb().transact(["quotes", "audit"], "Cambia el estado de una cotización", (docs) => {
    const quote = docs.quotes.items.find((q) => q.id === id);
    if (!quote) throw notFound("Cotización no encontrada.");
    if (quote.status === "aprobada") throw conflict("La cotización ya fue aprobada y tiene su orden de trabajo.");
    const from = quote.status;
    if (to === "enviada") {
      if (quote.materials.length === 0 && quote.labor.length === 0) throw badRequest("Agrega materiales u horas antes de enviarla.");
      quote.issuedAt = nowIso();
      quote.decidedAt = null;
    }
    if (to === "rechazada") quote.decidedAt = nowIso();
    if (to === "borrador") quote.decidedAt = null;
    quote.status = to;
    quote.updatedAt = nowIso();
    track(quote, actorOf(principal), to === "enviada" ? "Envió la cotización al cliente" : to === "rechazada" ? "El cliente rechazó la cotización" : "Volvió a borrador", [
      { field: "status", label: "Estado", from: QUOTE_STATUS_LABEL[from], to: QUOTE_STATUS_LABEL[to] },
    ]);
    audit(docs.audit, actorOf(principal), "cotizacion_estado", quote.folio, to);
    return quote;
  });
}

export interface ApproveInput {
  due: { date: string; time: string } | null;
  condition: string;
  /** Machine per labor line; missing lines get the least loaded active machine of the process. */
  machines: Record<string, string | null>;
}

/** Cotización aprobada → orden de trabajo con su ruta de procesos e insumos. */
export async function approveQuote(principal: Principal, id: string, input: ApproveInput) {
  if (input.due && (!isRealDate(input.due.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.due.time))) throw badRequest("Fecha u hora de entrega inválida.");
  return getDb().transact(
    ["quotes", "orders", "tasks", "machines", "positions", "clients", "attachments", "notifications", "audit"],
    "Aprueba una cotización y crea la orden de trabajo",
    (docs) => {
      const quote = docs.quotes.items.find((q) => q.id === id);
      if (!quote) throw notFound("Cotización no encontrada.");
      if (quote.status === "aprobada") throw conflict("Esta cotización ya tiene orden de trabajo.");
      if (quote.status === "rechazada") throw conflict("La cotización fue rechazada. Vuélvela a borrador si el cliente cambió de opinión.");
      const totals = quoteTotals(quote);
      // Lines assigned so far count as load, so several lines of one process spread over its machines.
      const assigned: Order[] = [...docs.orders.items];
      const { order, notifications } = createOrderIn(
        docs,
        principal,
        {
          clientId: quote.clientId && docs.clients.items.some((c) => c.id === quote.clientId) ? quote.clientId : null,
          clientName: quote.clientName,
          title: quote.title,
          description: quote.description,
          difficulty: quote.difficulty,
          urgent: quote.urgent,
          quantity: quote.quantity,
          condition: input.condition,
          receivedAt: null,
          due: input.due,
          workItems: quote.labor
            .filter((l) => l.hours > 0)
            .map((l) => {
              // An explicit choice in the approve dialog (even "sin máquina" = null) wins over the quoted machine.
              const chosen = l.id in input.machines ? input.machines[l.id] : (l.machineId ?? undefined);
              const machineId = chosen !== undefined ? chosen : (leastLoadedMachine(docs.machines.items, assigned, l.process)?.id ?? null);
              if (machineId) assigned.push(pseudoLoad(machineId, l.process, l.hours));
              return { process: l.process, machineId, description: l.description, plannedHours: l.hours };
            }),
          supplies: quote.materials.map((m) => ({ description: m.description, supplier: "", quantity: m.quantity, unitCost: m.unitCost })),
          price: totals.subtotal,
          notes: quote.notes,
        },
        { quoteId: quote.id, drawingIds: quote.drawingIds },
      );
      for (const a of docs.attachments.items) if (quote.drawingIds.includes(a.id)) a.orderId = order.id;
      quote.status = "aprobada";
      quote.decidedAt = nowIso();
      quote.orderId = order.id;
      quote.updatedAt = quote.decidedAt;
      track(quote, actorOf(principal), `Aprobada → ${order.folio}`, [{ field: "status", label: "Estado", from: "Enviada", to: "Aprobada" }]);
      audit(docs.audit, actorOf(principal), "cotizacion_aprobada", quote.folio, order.folio);
      const all: Notification[] = [
        ...notifications,
        pushNotification(docs.notifications, actorOf(principal), {
          audience: { kind: "admins" },
          type: "quote_approved",
          title: `${quote.folio} aprobada → ${order.folio}`,
          body: `${quote.clientName} · ${quote.title} · ${formatCop(totals.subtotal)} + IVA`,
          link: `/admin/ordenes?o=${order.id}`,
        }),
      ];
      return { quote, order, notifications: all };
    },
  );
}

export async function duplicateQuote(principal: Principal, id: string) {
  return getDb().transact(["quotes", "audit"], "Duplica una cotización", (docs) => {
    const source = docs.quotes.items.find((q) => q.id === id);
    if (!source) throw notFound("Cotización no encontrada.");
    const now = nowIso();
    const copy: Quote = {
      ...structuredClone(source),
      id: newId(),
      folio: folio("COT", nextSeq(docs.quotes)),
      status: "borrador",
      issuedAt: null,
      decidedAt: null,
      orderId: null,
      materials: source.materials.map((m) => ({ ...m, id: newId() })),
      labor: source.labor.map((l) => ({ ...l, id: newId() })),
      history: [],
      createdBy: principal.user.id,
      createdAt: now,
      updatedAt: now,
    };
    track(copy, actorOf(principal), `Duplicada de ${source.folio}`);
    docs.quotes.items.push(copy);
    audit(docs.audit, actorOf(principal), "cotizacion_duplicada", copy.folio, source.folio);
    return copy;
  });
}

export async function deleteQuote(principal: Principal, id: string) {
  await getDb().transact(["quotes", "attachments", "audit"], "Elimina una cotización", (docs) => {
    const quote = docs.quotes.items.find((q) => q.id === id);
    if (!quote) throw notFound("Cotización no encontrada.");
    if (quote.status !== "borrador") throw conflict("Solo se eliminan borradores; las enviadas quedan en el histórico.");
    docs.quotes.items = docs.quotes.items.filter((q) => q.id !== id);
    for (const a of docs.attachments.items) if (a.quoteId === id) a.quoteId = null;
    audit(docs.audit, actorOf(principal), "cotizacion_eliminada", quote.folio);
  });
}
