import { z } from "zod";

/**
 * Persisted domain model. Every document read from the data repository is
 * parsed with these schemas, so a corrupted or hand-edited file fails loudly
 * instead of propagating bad data into the app.
 */

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)");
export const isoDateTime = z.string().datetime({ offset: true });
export const id = z.string().min(1).max(64);

export const USER_KINDS = ["admin", "staff"] as const;
export const USER_STATUSES = ["pending", "active", "rejected", "disabled"] as const;
export type UserKind = (typeof USER_KINDS)[number];
export type UserStatus = (typeof USER_STATUSES)[number];

export const userSchema = z.object({
  id,
  username: z.string(),
  displayName: z.string(),
  passwordHash: z.string(),
  /** admin = standalone admin account; staff = bound to a workshop position. */
  kind: z.enum(USER_KINDS),
  status: z.enum(USER_STATUSES),
  phone: z.string().nullable().default(null),
  /** Self-registration: the position the person says they occupy. */
  requestedPositionId: z.string().nullable().default(null),
  registrationNote: z.string().nullable().default(null),
  rejectionReason: z.string().nullable().default(null),
  /** Proof of authorisation for personal-data processing (Ley 1581 art. 9). */
  consentAt: isoDateTime.nullable().default(null),
  consentVersion: z.string().nullable().default(null),
  mustChangePassword: z.boolean().default(false),
  /** Bumped to revoke every session of the user. */
  sessionVersion: z.number().int().nonnegative().default(0),
  failedLogins: z.number().int().nonnegative().default(0),
  lockedUntil: isoDateTime.nullable().default(null),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  approvedBy: z.string().nullable().default(null),
  approvedAt: isoDateTime.nullable().default(null),
  lastLoginAt: isoDateTime.nullable().default(null),
});
export type User = z.infer<typeof userSchema>;

export const contractSchema = z.object({
  id,
  userId: z.string(),
  personName: z.string(),
  startDate: isoDate,
  /** null = indefinite term. */
  endDate: isoDate.nullable(),
  notes: z.string().nullable().default(null),
  createdBy: z.string(),
  createdAt: isoDateTime,
  /** Set when the contract was terminated before its end date or archived. */
  endedAt: isoDateTime.nullable().default(null),
  endedReason: z.string().nullable().default(null),
});
export type Contract = z.infer<typeof contractSchema>;

export const positionSchema = z.object({
  id,
  title: z.string(),
  area: z.string(),
  /** Holding this position grants admin rights (Coordinador de producción). */
  grantsAdmin: z.boolean().default(false),
  order: z.number().int(),
  contract: contractSchema.nullable().default(null),
  contractHistory: z.array(contractSchema).default([]),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Position = z.infer<typeof positionSchema>;

/** One edit to an entity: who, when and which fields changed ("Historial de cambios"). */
export const fieldChangeSchema = z.object({
  field: z.string(),
  label: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});
export type FieldChange = z.infer<typeof fieldChangeSchema>;

export const changeEntrySchema = z.object({
  at: isoDateTime,
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  changes: z.array(fieldChangeSchema).default([]),
});
export type ChangeEntry = z.infer<typeof changeEntrySchema>;

export const TASK_PRIORITIES = ["baja", "normal", "alta", "urgente"] as const;
export const TASK_STATUSES = ["pendiente", "en_proceso", "bloqueada", "completada"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const checklistItemSchema = z.object({
  id,
  text: z.string(),
  done: z.boolean(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const taskNoteSchema = z.object({
  id,
  authorId: z.string(),
  authorName: z.string(),
  text: z.string(),
  at: isoDateTime,
});
export type TaskNote = z.infer<typeof taskNoteSchema>;

export const taskSchema = z.object({
  id,
  folio: z.string(),
  title: z.string(),
  description: z.string().default(""),
  /** Tasks belong to positions, not people: they survive contract changes. */
  positionId: z.string().nullable(),
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  dueDate: isoDate.nullable().default(null),
  piece: z.string().nullable().default(null),
  quantity: z.number().int().positive().nullable().default(null),
  quantityDone: z.number().int().nonnegative().default(0),
  checklist: z.array(checklistItemSchema).default([]),
  notes: z.array(taskNoteSchema).default([]),
  blockedReason: z.string().nullable().default(null),
  createdBy: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  updatedBy: z.string(),
  startedAt: isoDateTime.nullable().default(null),
  completedAt: isoDateTime.nullable().default(null),
  completedBy: z.string().nullable().default(null),
  /** Work order (OT) this task was generated from, and its machine routing. */
  orderId: z.string().nullable().default(null),
  workItemId: z.string().nullable().default(null),
  machineId: z.string().nullable().default(null),
  plannedHours: z.number().nonnegative().nullable().default(null),
  /** Hours reported when finishing; feeds the utilisation indicators. */
  actualHours: z.number().nonnegative().nullable().default(null),
  history: z.array(changeEntrySchema).default([]),
});
export type Task = z.infer<typeof taskSchema>;

export const REQUEST_TYPES = ["material", "herramienta", "mantenimiento", "consumible", "epp", "otro"] as const;
export const REQUEST_STATUSES = ["pendiente", "en_camino", "entregada", "rechazada", "cancelada"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const supplyRequestSchema = z.object({
  id,
  folio: z.string(),
  positionId: z.string().nullable(),
  userId: z.string(),
  requesterName: z.string(),
  type: z.enum(REQUEST_TYPES),
  item: z.string(),
  quantity: z.string().nullable().default(null),
  urgent: z.boolean().default(false),
  note: z.string().nullable().default(null),
  taskId: z.string().nullable().default(null),
  status: z.enum(REQUEST_STATUSES),
  response: z.string().nullable().default(null),
  resolvedBy: z.string().nullable().default(null),
  resolvedAt: isoDateTime.nullable().default(null),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type SupplyRequest = z.infer<typeof supplyRequestSchema>;

export const NOTIFICATION_TYPES = [
  "task_assigned",
  "task_updated",
  "task_completed",
  "task_blocked",
  "request_created",
  "request_updated",
  "day_closed",
  "registration_pending",
  "account_approved",
  "announcement",
  "contract_changed",
  "order_created",
  "order_due_soon",
  "order_due_today",
  "order_overdue",
  "order_ready",
  "order_invoice",
  "order_claim",
  "quote_approved",
  "machine_status",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const audienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("admins") }),
  z.object({ kind: z.literal("all") }),
  z.object({ kind: z.literal("position"), positionId: z.string() }),
  z.object({ kind: z.literal("user"), userId: z.string() }),
]);
export type Audience = z.infer<typeof audienceSchema>;

export const notificationSchema = z.object({
  id,
  audience: audienceSchema,
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable().default(null),
  /** Urgent notifications open a blocking popup instead of a toast. */
  urgent: z.boolean().default(false),
  actorId: z.string().nullable().default(null),
  createdAt: isoDateTime,
  readBy: z.array(z.string()).default([]),
});
export type Notification = z.infer<typeof notificationSchema>;

export const announcementSchema = z.object({
  id,
  text: z.string(),
  level: z.enum(["info", "importante"]),
  createdBy: z.string(),
  authorName: z.string(),
  createdAt: isoDateTime,
  expiresAt: isoDateTime.nullable().default(null),
});
export type Announcement = z.infer<typeof announcementSchema>;

export const dayClosureSchema = z.object({
  id,
  date: isoDate,
  positionId: z.string(),
  userId: z.string(),
  userName: z.string(),
  completed: z.array(z.object({ id: z.string(), folio: z.string(), title: z.string() })),
  pending: z.array(z.object({ id: z.string(), folio: z.string(), title: z.string(), status: z.enum(TASK_STATUSES) })),
  note: z.string().default(""),
  issues: z.string().default(""),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type DayClosure = z.infer<typeof dayClosureSchema>;

export const pushSubscriptionSchema = z.object({
  id,
  userId: z.string(),
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  userAgent: z.string().nullable().default(null),
  createdAt: isoDateTime,
});
export type StoredPushSubscription = z.infer<typeof pushSubscriptionSchema>;

export const auditEntrySchema = z.object({
  id,
  at: isoDateTime,
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  target: z.string().nullable().default(null),
  detail: z.string().nullable().default(null),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/* ───────────── Producción: máquinas, clientes, órdenes de trabajo, cotizaciones ───────────── */

/** Processes quoted and scheduled by the workshop. Each machine belongs to one. */
export const PROCESSES = ["torno", "fresadora", "cnc", "prensa", "soldadura", "banco"] as const;
export type Process = (typeof PROCESSES)[number];

export const MACHINE_STATES = ["activa", "inactiva", "mantenimiento"] as const;
export type MachineState = (typeof MACHINE_STATES)[number];

export const machineStopSchema = z.object({
  id,
  from: isoDateTime,
  /** null while the stop is still running. */
  to: isoDateTime.nullable().default(null),
  reason: z.string().default(""),
  createdBy: z.string().nullable().default(null),
});
export type MachineStop = z.infer<typeof machineStopSchema>;

export const machineSchema = z.object({
  id,
  name: z.string(),
  process: z.enum(PROCESSES),
  /** Brand, model, capacity… */
  description: z.string().default(""),
  /**
   * inactiva = bought or planned but not in service: shown as "próximamente",
   * never receives work and never counts for capacity or indicators.
   */
  state: z.enum(MACHINE_STATES),
  /** First day it counts for capacity and indicators (AAAA-MM-DD). */
  activeSince: isoDate.nullable().default(null),
  hoursPerDay: z.number().min(0).max(24),
  /** COP per hour, used to cost actual work. */
  hourlyRate: z.number().min(0).default(0),
  /** Position that usually runs it; new work steps on this machine go to that position. */
  positionId: z.string().nullable().default(null),
  order: z.number().int(),
  /** Maintenance stops (paros); an open stop removes the machine's capacity. */
  stops: z.array(machineStopSchema).default([]),
  history: z.array(changeEntrySchema).default([]),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Machine = z.infer<typeof machineSchema>;

export const CLIENT_KINDS = ["empresa", "persona"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export const clientSchema = z.object({
  id,
  kind: z.enum(CLIENT_KINDS),
  /** Nombre o razón social. */
  name: z.string(),
  /** NIT or cédula digits, without the verification digit. */
  nit: z.string().default(""),
  /** Dígito de verificación DIAN. */
  dv: z.string().default(""),
  companyPhone: z.string().default(""),
  personalPhone: z.string().default(""),
  contactName: z.string().default(""),
  email: z.string().default(""),
  city: z.string().default(""),
  address: z.string().default(""),
  notes: z.string().default(""),
  /** 1 normal · 2 frecuente · 3 estratégico — weighs in the priority advisor. */
  tier: z.number().int().min(1).max(3).default(1),
  archived: z.boolean().default(false),
  history: z.array(changeEntrySchema).default([]),
  createdBy: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Client = z.infer<typeof clientSchema>;

export const DIFFICULTIES = [1, 2, 3] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const difficulty = z.union([z.literal(1), z.literal(2), z.literal(3)]);

export const WORK_ITEM_STATUSES = ["pendiente", "en_proceso", "bloqueada", "completada"] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/** One process step of a work order; it becomes a task for a position. */
export const workItemSchema = z.object({
  id,
  process: z.enum(PROCESSES),
  machineId: z.string().nullable().default(null),
  positionId: z.string().nullable().default(null),
  description: z.string().default(""),
  plannedHours: z.number().min(0).max(2000),
  actualHours: z.number().min(0).max(2000).nullable().default(null),
  status: z.enum(WORK_ITEM_STATUSES).default("pendiente"),
  taskId: z.string().nullable().default(null),
  completedAt: isoDateTime.nullable().default(null),
});
export type WorkItem = z.infer<typeof workItemSchema>;

export const supplyLineSchema = z.object({
  id,
  description: z.string(),
  supplier: z.string().default(""),
  quantity: z.number().min(0),
  unitCost: z.number().min(0),
});
export type SupplyLine = z.infer<typeof supplyLineSchema>;

export const CLAIM_KINDS = ["garantia", "devolucion"] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

export const claimSchema = z.object({
  id,
  kind: z.enum(CLAIM_KINDS),
  at: isoDateTime,
  description: z.string(),
  resolvedAt: isoDateTime.nullable().default(null),
  resolution: z.string().nullable().default(null),
  createdBy: z.string().nullable().default(null),
});
export type Claim = z.infer<typeof claimSchema>;

/**
 * recibida → en_proceso → terminada → entregada → (N días sin reclamos) cerrada.
 * Un reclamo sobre entregada/cerrada abre garantía; cancelada en cualquier punto.
 */
export const ORDER_STATUSES = ["recibida", "en_proceso", "terminada", "entregada", "cerrada", "garantia", "cancelada"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderSchema = z.object({
  id,
  folio: z.string(),
  clientId: z.string().nullable(),
  /** Snapshot so the record survives a renamed or archived client. */
  clientName: z.string(),
  title: z.string(),
  description: z.string().default(""),
  status: z.enum(ORDER_STATUSES),
  difficulty: difficulty.default(1),
  intake: z.object({
    receivedAt: isoDateTime,
    quantity: z.number().int().min(1),
    /** Estado en que llegan las piezas. */
    condition: z.string().default(""),
  }),
  /** Fotos de llegada, planos/dibujos y otras fotos (attachment ids). */
  intakePhotoIds: z.array(z.string()).default([]),
  drawingIds: z.array(z.string()).default([]),
  photoIds: z.array(z.string()).default([]),
  due: z
    .object({
      date: isoDate,
      /** HH:mm in the workshop timezone. */
      time: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .nullable()
    .default(null),
  workItems: z.array(workItemSchema).default([]),
  supplies: z.array(supplyLineSchema).default([]),
  quoteId: z.string().nullable().default(null),
  /** Agreed price before VAT (COP). */
  price: z.number().min(0).nullable().default(null),
  /** Price after final adjustments, before VAT (COP). */
  finalPrice: z.number().min(0).nullable().default(null),
  startedAt: isoDateTime.nullable().default(null),
  finishedAt: isoDateTime.nullable().default(null),
  deliveredAt: isoDateTime.nullable().default(null),
  closedAt: isoDateTime.nullable().default(null),
  /** "FACTURAR" stays on until someone marks the invoice as issued. */
  invoice: z
    .object({
      pending: z.boolean().default(false),
      number: z.string().nullable().default(null),
      invoicedAt: isoDateTime.nullable().default(null),
    })
    .default({ pending: false, number: null, invoicedAt: null }),
  claims: z.array(claimSchema).default([]),
  /** Satisfacción del cliente 1–5. */
  satisfaction: z.number().int().min(1).max(5).nullable().default(null),
  /** Flags that make the reminder scheduler idempotent. */
  reminders: z
    .object({ before24h: z.boolean().default(false), dayOf: z.boolean().default(false), overdue: z.boolean().default(false) })
    .default({ before24h: false, dayOf: false, overdue: false }),
  /** Registered in the historical archive (job done before using the app). */
  historical: z.boolean().default(false),
  notes: z.string().default(""),
  history: z.array(changeEntrySchema).default([]),
  createdBy: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  updatedBy: z.string().nullable().default(null),
});
export type Order = z.infer<typeof orderSchema>;

export const QUOTE_STATUSES = ["borrador", "enviada", "aprobada", "rechazada"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const quoteMaterialSchema = z.object({
  id,
  description: z.string(),
  quantity: z.number().min(0),
  unitCost: z.number().min(0),
});
export type QuoteMaterial = z.infer<typeof quoteMaterialSchema>;

export const quoteLaborSchema = z.object({
  id,
  process: z.enum(PROCESSES),
  description: z.string().default(""),
  hours: z.number().min(0),
  /** COP per hour, copied from the process rate when the line was added. */
  rate: z.number().min(0),
});
export type QuoteLabor = z.infer<typeof quoteLaborSchema>;

export const quoteSchema = z.object({
  id,
  folio: z.string(),
  clientId: z.string().nullable(),
  clientName: z.string(),
  title: z.string(),
  description: z.string().default(""),
  quantity: z.number().int().min(1).default(1),
  materials: z.array(quoteMaterialSchema).default([]),
  labor: z.array(quoteLaborSchema).default([]),
  difficulty: difficulty.default(1),
  /** Utilidad sobre el costo (%). */
  marginPct: z.number().min(0).max(500),
  ivaPct: z.number().min(0).max(100),
  validDays: z.number().int().min(1).max(365),
  status: z.enum(QUOTE_STATUSES),
  issuedAt: isoDateTime.nullable().default(null),
  decidedAt: isoDateTime.nullable().default(null),
  orderId: z.string().nullable().default(null),
  drawingIds: z.array(z.string()).default([]),
  notes: z.string().default(""),
  history: z.array(changeEntrySchema).default([]),
  createdBy: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Quote = z.infer<typeof quoteSchema>;

export const ATTACHMENT_KINDS = ["foto_ingreso", "plano", "foto", "documento"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];
export const ATTACHMENT_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AttachmentMime = (typeof ATTACHMENT_MIMES)[number];

export const attachmentSchema = z.object({
  id,
  kind: z.enum(ATTACHMENT_KINDS),
  orderId: z.string().nullable().default(null),
  quoteId: z.string().nullable().default(null),
  name: z.string(),
  mime: z.enum(ATTACHMENT_MIMES),
  size: z.number().int().positive(),
  /** Location in the attachment store: data/adjuntos/AAAA/MM/<id>.<ext>. */
  path: z.string(),
  /** Backend reference (git blob sha for GitHub). */
  ref: z.string().nullable().default(null),
  createdBy: z.string(),
  createdAt: isoDateTime,
});
export type Attachment = z.infer<typeof attachmentSchema>;

/** Monthly consumer price index (DANE, base diciembre 2018 = 100). Editable by admins. */
export const ipcEntrySchema = z.object({
  id,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido (AAAA-MM)"),
  index: z.number().positive(),
});
export type IpcEntry = z.infer<typeof ipcEntrySchema>;

export const productionSettingsSchema = z.object({
  /** ISO weekdays that are working days (1 = lunes … 7 = domingo). */
  workdays: z.array(z.number().int().min(1).max(7)).default([1, 2, 3, 4, 5, 6]),
  /** Saturday capacity cap in hours (half day); null = same as weekdays. */
  saturdayHours: z.number().min(0).max(24).nullable().default(4),
  /** Skip Colombian public holidays in capacity. */
  skipHolidays: z.boolean().default(true),
  /** COP per hour by process, used by the quoting tool. 0 = not configured yet. */
  processRates: z
    .object({
      torno: z.number().min(0).default(0),
      fresadora: z.number().min(0).default(0),
      cnc: z.number().min(0).default(0),
      prensa: z.number().min(0).default(0),
      soldadura: z.number().min(0).default(0),
      banco: z.number().min(0).default(0),
    })
    .default({ torno: 0, fresadora: 0, cnc: 0, prensa: 0, soldadura: 0, banco: 0 }),
  defaultMarginPct: z.number().min(0).max(500).default(0),
  ivaPct: z.number().min(0).max(100).default(19),
  quoteValidDays: z.number().int().min(1).max(365).default(15),
  /** Days after delivery without claims before the service closes automatically. */
  claimWindowDays: z.number().int().min(1).max(60).default(3),
});
export type ProductionSettings = z.infer<typeof productionSettingsSchema>;

export const legalInfoSchema = z.object({
  /** Razón social del responsable del tratamiento. */
  companyName: z.string().default(""),
  tradeName: z.string().default(""),
  nit: z.string().default(""),
  address: z.string().default(""),
  city: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  /** Área o persona encargada de atender PQR y derechos de habeas data. */
  privacyContact: z.string().default(""),
  website: z.string().default(""),
  /** Fecha de la versión vigente de los textos legales (AAAA-MM-DD). */
  policyVersion: isoDate,
});
export type LegalInfo = z.infer<typeof legalInfoSchema>;

export const settingsSchema = z.object({
  workshopName: z.string(),
  timezone: z.string(),
  registrationOpen: z.boolean().default(true),
  /** Optional shared code required to self-register (stored as a scrypt hash). */
  registrationCodeHash: z.string().nullable().default(null),
  maxPendingRegistrations: z.number().int().min(1).max(200).default(25),
  legal: legalInfoSchema,
  production: productionSettingsSchema.default(productionSettingsSchema.parse({})),
  updatedAt: isoDateTime,
});
export type Settings = z.infer<typeof settingsSchema>;

/** Generic collection file: monotonically increasing `seq` feeds folios. */
export function collectionSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    schema: z.literal(1),
    seq: z.number().int().nonnegative().default(0),
    items: z.array(item),
  });
}
export type Collection<T> = { schema: 1; seq: number; items: T[] };

export const COLLECTIONS = {
  users: collectionSchema(userSchema),
  positions: collectionSchema(positionSchema),
  tasks: collectionSchema(taskSchema),
  requests: collectionSchema(supplyRequestSchema),
  notifications: collectionSchema(notificationSchema),
  announcements: collectionSchema(announcementSchema),
  closures: collectionSchema(dayClosureSchema),
  push: collectionSchema(pushSubscriptionSchema),
  audit: collectionSchema(auditEntrySchema),
  clients: collectionSchema(clientSchema),
  machines: collectionSchema(machineSchema),
  orders: collectionSchema(orderSchema),
  quotes: collectionSchema(quoteSchema),
  attachments: collectionSchema(attachmentSchema),
  ipc: collectionSchema(ipcEntrySchema),
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export interface Database {
  settings: Settings;
  users: Collection<User>;
  positions: Collection<Position>;
  tasks: Collection<Task>;
  requests: Collection<SupplyRequest>;
  notifications: Collection<Notification>;
  announcements: Collection<Announcement>;
  closures: Collection<DayClosure>;
  push: Collection<StoredPushSubscription>;
  audit: Collection<AuditEntry>;
  clients: Collection<Client>;
  machines: Collection<Machine>;
  orders: Collection<Order>;
  quotes: Collection<Quote>;
  attachments: Collection<Attachment>;
  ipc: Collection<IpcEntry>;
}

export type DocName = keyof Database;

/**
 * Where each document lives in the data repository.
 * - single:  one file (data/<name>.json).
 * - sharded: one file per month of creation (data/<dir>/AAAA-MM.json); callers see
 *            the merged collection and only the shards that changed are written,
 *            so commits stay small while the history keeps growing.
 * - monthly: append-only log; callers get the current month's file.
 */
export type DocLayout =
  | { kind: "single" }
  | { kind: "sharded"; dir: string }
  | { kind: "monthly"; dir: string };

export const DOC_LAYOUT: Record<DocName, DocLayout> = {
  settings: { kind: "single" },
  users: { kind: "single" },
  positions: { kind: "single" },
  tasks: { kind: "single" },
  requests: { kind: "single" },
  notifications: { kind: "single" },
  announcements: { kind: "single" },
  closures: { kind: "single" },
  push: { kind: "single" },
  audit: { kind: "monthly", dir: "auditoria" },
  clients: { kind: "single" },
  machines: { kind: "single" },
  orders: { kind: "sharded", dir: "ordenes" },
  quotes: { kind: "sharded", dir: "cotizaciones" },
  attachments: { kind: "single" },
  ipc: { kind: "single" },
};

export const DOC_NAMES = Object.keys(DOC_LAYOUT) as DocName[];

/** Retention caps keep every JSON document small (GitHub blobs, sync payloads). */
export const RETENTION = {
  notifications: 400,
  /** Per monthly audit file. */
  audit: 5000,
  announcements: 60,
  closuresDays: 400,
  completedTaskDays: 120,
  /** Change-log entries kept inside each entity. */
  entityHistory: 60,
} as const;
