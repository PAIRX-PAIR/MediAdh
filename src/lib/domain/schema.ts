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
}

export type DocName = keyof Database;
export const DOC_NAMES: DocName[] = [
  "settings",
  "users",
  "positions",
  "tasks",
  "requests",
  "notifications",
  "announcements",
  "closures",
  "push",
  "audit",
];

/** Retention caps keep every JSON document small (GitHub blobs, sync payloads). */
export const RETENTION = {
  notifications: 400,
  audit: 3000,
  announcements: 60,
  closuresDays: 400,
  completedTaskDays: 120,
} as const;
