import "server-only";
import { z } from "zod";
import { CLAIM_KINDS, CLIENT_KINDS, MACHINE_STATES, ORDER_STATUSES, PROCESSES } from "@/lib/domain/schema";
import { requiredText, text } from "./http";
import { date, entityId, nullableDate, optionalText } from "./inputs";

/** Request validation for the production module (clients, machines, OT, quotes, IPC). */

const money = z.number().min(0).max(100_000_000_000);
const hours = z.number().min(0).max(2000);
const process = z.enum(PROCESSES);
const nullableId = z.union([entityId, z.null()]);
const difficultyInput = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido (AAAA-MM)");
const dueInput = z.union([z.object({ date, time }), z.null()]);
const longText = (max: number) => text(max).default("");
const satisfaction = z.union([z.number().int().min(1).max(5), z.null()]);

export const clientInput = z.object({
  kind: z.enum(CLIENT_KINDS).default("empresa"),
  name: requiredText(160),
  nit: z.string().max(30).default(""),
  companyPhone: longText(40),
  personalPhone: longText(40),
  contactName: longText(120),
  email: z.union([z.email().max(160), z.literal("")]).default(""),
  city: longText(80),
  address: longText(200),
  notes: longText(2000),
  tier: z.number().int().min(1).max(3).default(1),
});

export const clientPatchInput = z
  .object({
    kind: z.enum(CLIENT_KINDS),
    name: requiredText(160),
    nit: z.string().max(30),
    companyPhone: text(40),
    personalPhone: text(40),
    contactName: text(120),
    email: z.union([z.email().max(160), z.literal("")]),
    city: text(80),
    address: text(200),
    notes: text(2000),
    tier: z.number().int().min(1).max(3),
    archived: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada que actualizar");

export const machineInput = z.object({
  name: requiredText(60),
  process,
  description: longText(300),
  state: z.enum(MACHINE_STATES).default("activa"),
  activeSince: nullableDate.default(null),
  hoursPerDay: z.number().min(0).max(24).nullable().default(null),
  hourlyRate: money.default(0),
  positionId: nullableId.default(null),
});

export const machinePatchInput = z
  .object({
    name: requiredText(60),
    process,
    description: text(300),
    state: z.enum(MACHINE_STATES),
    activeSince: nullableDate,
    hoursPerDay: z.number().min(0).max(24).nullable(),
    hourlyRate: money,
    positionId: nullableId,
    order: z.number().int().min(0).max(1000),
    stopReason: optionalText(200),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada que actualizar");

const workItemInput = z.object({
  id: entityId.optional(),
  process,
  machineId: nullableId.default(null),
  positionId: nullableId.optional(),
  description: longText(500),
  plannedHours: hours,
});

const supplyInput = z.object({
  id: entityId.optional(),
  description: requiredText(160),
  supplier: longText(120),
  quantity: z.number().min(0).max(1_000_000),
  unitCost: money,
});

export const orderInput = z.object({
  clientId: nullableId.default(null),
  clientName: optionalText(160),
  title: requiredText(140),
  description: longText(4000),
  difficulty: difficultyInput.default(1),
  urgent: z.boolean().default(false),
  quantity: z.number().int().min(1).max(1_000_000).default(1),
  condition: longText(1000),
  receivedAt: z.union([z.iso.datetime({ offset: true }), z.null()]).default(null),
  due: dueInput.default(null),
  workItems: z.array(workItemInput).max(40).default([]),
  supplies: z.array(supplyInput).max(100).default([]),
  price: z.union([money, z.null()]).default(null),
  notes: longText(2000),
});

export const orderPatchInput = z
  .object({
    clientId: nullableId,
    clientName: optionalText(160),
    title: requiredText(140),
    description: text(4000),
    difficulty: difficultyInput,
    urgent: z.boolean(),
    quantity: z.number().int().min(1).max(1_000_000),
    condition: text(1000),
    receivedAt: z.iso.datetime({ offset: true }),
    due: dueInput,
    workItems: z.array(workItemInput).max(40),
    supplies: z.array(supplyInput).max(100),
    price: z.union([money, z.null()]),
    notes: text(2000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada que actualizar");

export const orderActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), to: z.enum(ORDER_STATUSES) }),
  z.object({ action: z.literal("deliver"), satisfaction: satisfaction.default(null), finalPrice: z.union([money, z.null()]).default(null), noInvoice: z.boolean().optional() }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("invoice"), number: optionalText(40) }),
  z.object({ action: z.literal("noInvoice"), none: z.boolean() }),
  z.object({ action: z.literal("claim"), kind: z.enum(CLAIM_KINDS), description: requiredText(500) }),
  z.object({ action: z.literal("resolveClaim"), claimId: entityId, resolution: requiredText(500) }),
  z.object({ action: z.literal("satisfaction"), value: satisfaction }),
  z.object({ action: z.literal("cancel"), reason: optionalText(300) }),
  z.object({ action: z.literal("reopen") }),
  z.object({
    action: z.literal("supplyAdd"),
    name: requiredText(120),
    quantity: z.number().gt(0).max(1_000_000),
    unit: optionalText(24),
    note: optionalText(300),
  }),
  z.object({ action: z.literal("supplyRemove"), supplyId: entityId }),
  z.object({ action: z.literal("supplyDone"), supplyId: entityId, done: z.boolean() }),
]);

export const historicalInput = z.object({
  clientId: nullableId.default(null),
  clientName: optionalText(160),
  title: requiredText(140),
  description: longText(4000),
  quantity: z.number().int().min(1).max(1_000_000).default(1),
  receivedAt: date,
  deliveredAt: date,
  dueDate: nullableDate.default(null),
  workItems: z.array(z.object({ process, machineId: nullableId.default(null), hours })).max(40).default([]),
  supplies: z.array(supplyInput).max(100).default([]),
  price: z.union([money, z.null()]).default(null),
  satisfaction: satisfaction.default(null),
  invoiceNumber: optionalText(40),
  notes: longText(2000),
});

const quoteMaterial = z.object({
  id: entityId.optional(),
  description: requiredText(160),
  quantity: z.number().min(0).max(1_000_000),
  unitCost: money,
});
const quoteLabor = z.object({
  id: entityId.optional(),
  process,
  description: longText(200),
  hours,
  rate: z.union([money, z.null()]).default(null),
  machineId: nullableId.default(null),
});

export const quoteInput = z.object({
  clientId: nullableId.default(null),
  clientName: optionalText(160),
  title: requiredText(140),
  description: longText(4000),
  quantity: z.number().int().min(1).max(1_000_000).default(1),
  materials: z.array(quoteMaterial).max(100).default([]),
  labor: z.array(quoteLabor).max(40).default([]),
  difficulty: difficultyInput.default(1),
  urgent: z.boolean().default(false),
  marginPct: z.union([z.number().min(0).max(99), z.null()]).default(null),
  ivaPct: z.union([z.number().min(0).max(100), z.null()]).default(null),
  validDays: z.union([z.number().int().min(1).max(365), z.null()]).default(null),
  notes: longText(2000),
});

export const quotePatchInput = z
  .object({
    clientId: nullableId,
    clientName: optionalText(160),
    title: requiredText(140),
    description: text(4000),
    quantity: z.number().int().min(1).max(1_000_000),
    materials: z.array(quoteMaterial).max(100),
    labor: z.array(quoteLabor).max(40),
    difficulty: difficultyInput,
    urgent: z.boolean(),
    marginPct: z.number().min(0).max(99),
    ivaPct: z.number().min(0).max(100),
    validDays: z.number().int().min(1).max(365),
    notes: text(2000),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada que actualizar");

export const quoteActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("send") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("draft") }),
  z.object({ action: z.literal("duplicate") }),
  z.object({
    action: z.literal("approve"),
    due: dueInput.default(null),
    condition: longText(1000),
    machines: z.record(entityId, nullableId).default({}),
  }),
]);

export const ipcInput = z.object({
  entries: z.array(z.object({ month, index: z.number().positive().max(100_000) })).max(600),
  remove: z.array(month).max(600).default([]),
});


export const supplyCreateInput = z.object({
  orderId: nullableId.default(null),
  name: requiredText(120),
  quantity: z.number().gt(0).max(1_000_000),
  unit: optionalText(24),
  note: optionalText(300),
});

export const generalSupplyActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("done"), done: z.boolean() }),
  z.object({ action: z.literal("remove") }),
  z.object({ action: z.literal("link"), orderId: entityId }),
]);
