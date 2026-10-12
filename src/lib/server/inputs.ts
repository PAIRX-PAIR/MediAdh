import "server-only";
import { z } from "zod";
import { AREAS } from "@/lib/domain/defaults";
import { REQUEST_STATUSES, REQUEST_TYPES, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/domain/schema";
import { requiredText, text } from "./http";

export const optionalText = (max: number) =>
  z
    .union([text(max), z.null()])
    .optional()
    .transform((v) => (v ? v : null));

export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
export const nullableDate = z.union([date, z.null(), z.literal("")]).transform((v) => (v ? v : null));
const password = z.string().min(1, "Campo obligatorio").max(256);
const username = z.string().min(1, "Campo obligatorio").max(64);
const phone = z
  .union([z.string().max(30), z.null()])
  .optional()
  .transform((v) => (v ? v.replace(/[^\d+\s()-]/g, "").trim() || null : null));
export const entityId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/, "Identificador inválido");

export const loginInput = z.object({ username, password });

export const registerInput = z.object({
  displayName: requiredText(80),
  username,
  password,
  phone,
  requestedPositionId: z.union([entityId, z.null(), z.literal("")]).optional().transform((v) => (v ? v : null)),
  note: optionalText(300),
  accessCode: z.union([z.string().max(64), z.null()]).optional().transform((v) => (v ? v : null)),
  consent: z.boolean(),
  /** Honeypot: humans never see this field. */
  website: z.union([z.string().max(200), z.null()]).optional().transform((v) => (v ? v : null)),
});

export const passwordInput = z.object({ currentPassword: password, newPassword: password });

export const setupInput = z.object({
  setupKey: z.string().min(1).max(200),
  displayName: requiredText(80),
  username,
  password,
});

export const taskCreateInput = z.object({
  title: requiredText(140),
  description: text(4000).default(""),
  positionId: z.union([entityId, z.null()]).default(null),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  dueDate: nullableDate.default(null),
  piece: optionalText(120),
  quantity: z.union([z.number().int().min(1).max(100000), z.null()]).default(null),
  checklist: z.array(requiredText(160)).max(30).default([]),
});

export const taskPatchInput = z
  .object({
    title: requiredText(140),
    description: text(4000),
    positionId: z.union([entityId, z.null()]),
    priority: z.enum(TASK_PRIORITIES),
    dueDate: nullableDate,
    piece: optionalText(120),
    quantity: z.union([z.number().int().min(1).max(100000), z.null()]),
    status: z.enum(TASK_STATUSES),
    blockedReason: optionalText(300),
    quantityDone: z.number().int().min(0).max(100000),
    checklist: z.array(z.object({ id: z.string().max(64).optional(), text: requiredText(160), done: z.boolean() })).max(30),
    checklistToggle: z.object({ id: z.string().max(64), done: z.boolean() }),
    actualHours: z.union([z.number().min(0).max(2000), z.null()]),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nada que actualizar");

export const noteInput = z.object({ text: requiredText(1000) });

export const requestCreateInput = z.object({
  type: z.enum(REQUEST_TYPES),
  item: requiredText(140),
  quantity: optionalText(80),
  urgent: z.boolean().default(false),
  note: optionalText(500),
  taskId: z.union([entityId, z.null()]).optional().transform((v) => v ?? null),
});

export const requestPatchInput = z.object({
  status: z.enum(REQUEST_STATUSES),
  response: optionalText(500),
});

export const closeDayInput = z.object({
  note: text(1000).default(""),
  issues: text(1000).default(""),
  completeTaskIds: z.array(entityId).max(200).default([]),
});

export const markReadInput = z.object({
  ids: z.union([z.literal("all"), z.array(entityId).max(500)]),
});

export const pushSubscribeInput = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
  userAgent: optionalText(300),
});

export const pushUnsubscribeInput = z.object({ endpoint: z.string().url().max(1000) });

const contractTerms = {
  startDate: date,
  endDate: nullableDate,
  notes: optionalText(500),
};

export const approveInput = z.object({
  mode: z.enum(["staff", "admin"]),
  positionId: z.union([entityId, z.null()]).default(null),
  replaceCurrent: z.boolean().default(false),
  startDate: date.optional(),
  endDate: nullableDate.optional(),
  notes: optionalText(500),
});

export const rejectInput = z.object({ reason: optionalText(300) });

export const createAccountInput = z.object({
  displayName: requiredText(80),
  username,
  tempPassword: password,
  phone,
  kind: z.enum(["admin", "staff"]),
  positionId: z.union([entityId, z.null()]).default(null),
  replaceCurrent: z.boolean().default(false),
  startDate: date.optional(),
  endDate: nullableDate.optional(),
  notes: optionalText(500),
});

export const userPatchInput = z
  .object({
    displayName: requiredText(80),
    phone,
    status: z.enum(["active", "disabled"]),
    unlock: z.literal(true),
  })
  .partial();

export const resetPasswordInput = z.object({ tempPassword: password });

export const positionCreateInput = z.object({
  title: requiredText(60),
  area: z.enum(AREAS),
  grantsAdmin: z.boolean().default(false),
});

export const positionPatchInput = z
  .object({
    title: requiredText(60),
    area: z.enum(AREAS),
    grantsAdmin: z.boolean(),
    order: z.number().int().min(0).max(1000),
  })
  .partial();

export const contractAssignInput = z.object({
  userId: entityId,
  replaceCurrent: z.boolean().default(false),
  ...contractTerms,
});

export const contractUpdateInput = z.object(contractTerms);

export const contractEndInput = z.object({ reason: optionalText(300) });

export const announcementInput = z.object({
  text: requiredText(280),
  level: z.enum(["info", "importante"]).default("info"),
  expiresAt: nullableDate.default(null),
});

const legalPatch = z
  .object({
    companyName: text(160),
    tradeName: text(120),
    nit: text(40),
    address: text(200),
    city: text(80),
    email: z.union([z.email().max(160), z.literal("")]),
    phone: text(40),
    privacyContact: text(160),
    website: text(200),
  })
  .partial();

const money = z.number().min(0).max(100_000_000_000);

const productionSettingsPatch = z
  .object({
    workdays: z.array(z.number().int().min(1).max(7)).max(7),
    saturdayHours: z.union([z.number().min(0).max(24), z.null()]),
    skipHolidays: z.boolean(),
    processRates: z
      .object({ torno: money, fresadora: money, cnc: money, prensa: money, soldadura: money, banco: money })
      .partial(),
    defaultMarginPct: z.number().min(0).max(500),
    ivaPct: z.number().min(0).max(100),
    quoteValidDays: z.number().int().min(1).max(365),
    claimWindowDays: z.number().int().min(1).max(60),
  })
  .partial();

export const settingsPatchInput = z
  .object({
    workshopName: requiredText(60),
    timezone: z.string().min(1).max(60),
    registrationOpen: z.boolean(),
    registrationCode: z.string().max(64),
    maxPendingRegistrations: z.number().int().min(1).max(200),
    legal: legalPatch,
    publishPolicyVersion: date,
    production: productionSettingsPatch,
  })
  .partial();
