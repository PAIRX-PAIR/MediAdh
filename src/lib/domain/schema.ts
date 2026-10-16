import { z } from "zod";
import { DEFAULT_WEEK_SCHEDULE, minutesOf } from "./calendar";

/**
 * Persisted domain model. Every document read from the data repository is
 * parsed with these schemas, so a corrupted or hand-edited file fails loudly
 * instead of propagating bad data into the app.
 */

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)");
export const isoDateTime = z.string().datetime({ offset: true });
export const id = z.string().min(1).max(64);
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:mm)");

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
  /** Nómina (admin only): monthly salary in COP; null = not set yet. */
  monthlySalary: z.number().min(0).nullable().default(null),
  /** Receives the auxilio de transporte with each payment. */
  transportAllowance: z.boolean().default(false),
  /**
   * Admin accounts only. total = gerencia/administración (todo); gestion =
   * coordinación y asistencia (operación completa, sin configuración, equipo ni sueldos).
   */
  adminScope: z.enum(["total", "gestion"]).default("total"),
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
export const PROCESSES = ["torno", "fresadora", "cepillo", "cnc", "prensa", "soldadura", "banco", "pintura"] as const;
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
  /** Cap on the workshop schedule (h/día); null = follows the workshop schedule. */
  hoursPerDay: z.number().min(0).max(24).nullable().default(null),
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
  /** Urgencia: se baja la pieza que estaba montada; va primero en la cola. */
  urgent: z.boolean().default(false),
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
  /** Machine quoted (its own tariff); null = any machine of the process. */
  machineId: z.string().nullable().default(null),
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
  urgent: z.boolean().default(false),
  /** Utilidad base sobre el costo (%). */
  marginPct: z.number().min(0).max(500),
  /** Points added to the margin for difficulty and urgency (snapshot of the rules when quoted). */
  extraMarginPct: z.number().min(0).max(1000).default(0),
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

export const shiftSchema = z
  .object({ start: hhmm, end: hhmm })
  .refine((s) => minutesOf(s.end) > minutesOf(s.start), "El turno debe terminar después de empezar.");

/** Weekly schedule: index 0 = lunes … 6 = domingo; shifts in order and without overlaps. */
export const weekScheduleSchema = z
  .array(z.array(shiftSchema).max(4))
  .length(7)
  .refine((days) => days.every((day) => day.every((s, i) => i === 0 || minutesOf(s.start) >= minutesOf(day[i - 1]!.end))), "Los turnos de un día van en orden y sin cruzarse.");

export const productionSettingsSchema = z.object({
  /** Horario del taller: capacity of the machines and ordinary hours of the team. */
  schedule: weekScheduleSchema.default(DEFAULT_WEEK_SCHEDULE),
  /** Skip Colombian public holidays in capacity. */
  skipHolidays: z.boolean().default(true),
  /** COP per hour by process, used by the quoting tool. 0 = not configured yet. */
  processRates: z
    .object({
      torno: z.number().min(0).default(0),
      fresadora: z.number().min(0).default(0),
      cepillo: z.number().min(0).default(0),
      cnc: z.number().min(0).default(0),
      prensa: z.number().min(0).default(0),
      soldadura: z.number().min(0).default(0),
      banco: z.number().min(0).default(0),
      pintura: z.number().min(0).default(0),
    })
    .default({ torno: 0, fresadora: 0, cepillo: 0, cnc: 0, prensa: 0, soldadura: 0, banco: 0, pintura: 0 }),
  /** Utilidad base de S.M.I.: 35 %. */
  defaultMarginPct: z.number().min(0).max(500).default(35),
  /** Points added to the margin for "dificultad mayor" (2) and "muy alta" (3). */
  difficultyMarginPct: z.number().min(0).max(500).default(15),
  highDifficultyMarginPct: z.number().min(0).max(500).default(25),
  /** Points added when the job is urgent (se baja la pieza montada en la máquina). */
  urgencyMarginPct: z.number().min(0).max(1000).default(125),
  /** Garantía sobre el trabajo entregado (días). Soldadura no tiene garantía. */
  warrantyDays: z.number().int().min(0).max(3650).default(90),
  ivaPct: z.number().min(0).max(100).default(19),
  quoteValidDays: z.number().int().min(1).max(365).default(15),
  /** Days after delivery without claims before the service closes automatically. */
  claimWindowDays: z.number().int().min(1).max(60).default(3),
});
export type ProductionSettings = z.infer<typeof productionSettingsSchema>;

/**
 * Nómina quincenal (pagos los días 15 y 30). Defaults follow Colombian law as of
 * 2026 (CST arts. 168 y 179, Ley 2466 de 2025): extra diurna +25 %, extra
 * nocturna +75 %, dominical/festivo +90 % desde el 1-jul-2026 (+100 % desde el
 * 1-jul-2027), jornada nocturna desde las 19:00. Everything is editable.
 */
export const payrollSettingsSchema = z.object({
  /** Divisor for the hourly value: monthly salary / monthlyHours (42 h × 5 = 210). */
  monthlyHours: z.number().min(1).max(400).default(210),
  extraDayPct: z.number().min(0).max(300).default(25),
  extraNightPct: z.number().min(0).max(300).default(75),
  sundayHolidayPct: z.number().min(0).max(300).default(90),
  nightStart: hhmm.default("19:00"),
  nightEnd: hhmm.default("06:00"),
  /** Overtime per day is counted in blocks of this many minutes (0 = exact). */
  roundingMinutes: z.number().int().min(0).max(60).default(15),
  /** Employee deductions over salary + overtime (%). */
  healthPct: z.number().min(0).max(100).default(4),
  pensionPct: z.number().min(0).max(100).default(4),
  /** Monthly auxilio de transporte (COP) for those who have it; 0 until the admin sets it. */
  transportAllowance: z.number().min(0).default(0),
  /** Each workday adds the schedule hours by itself (no clock-in needed); records and faltas replace it. */
  autoAttendance: z.boolean().default(true),
});
export type PayrollSettings = z.infer<typeof payrollSettingsSchema>;

/** Metas mensuales de ventas (COP antes de IVA); the last one can be marked as bonus. */
export const goalSchema = z.object({ label: z.string().max(40), amount: z.number().min(0), bonus: z.boolean().default(false) });
export type Goal = z.infer<typeof goalSchema>;
export const DEFAULT_GOALS: Goal[] = [
  { label: "Meta 1", amount: 30_000_000, bonus: false },
  { label: "Meta 2", amount: 50_000_000, bonus: false },
  { label: "Meta 3", amount: 70_000_000, bonus: false },
  { label: "Meta 4", amount: 90_000_000, bonus: false },
  { label: "Bonus", amount: 100_000_000, bonus: true },
];
export const financeSettingsSchema = z.object({
  goals: z.array(goalSchema).max(10).default(DEFAULT_GOALS),
  /** What the goals measure: ventas del mes or what remains after insumos y nómina. */
  goalBasis: z.enum(["ventas", "ganancia"]).default("ventas"),
  /**
   * Employer cost on top of what is paid (seguridad social del empleador, ARL,
   * caja, prima, cesantías, vacaciones) as % of salary + overtime. 0 until the
   * accountant gives the workshop's figure.
   */
  employerCostPct: z.number().min(0).max(200).default(0),
});
export type FinanceSettings = z.infer<typeof financeSettingsSchema>;

/**
 * Bonificación o descuento puntual de una persona en una quincena (anticipo,
 * préstamo, bono…). Bonuses are paid on top (not part of the social-security
 * base); deductions come off the net pay.
 */
export const payAdjustmentSchema = z.object({
  id,
  userId: z.string(),
  /** "AAAA-MM-1" o "AAAA-MM-2". */
  quincena: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-[12]$/),
  kind: z.enum(["bono", "descuento"]),
  concept: z.string(),
  amount: z.number().min(0),
  createdBy: z.string(),
  createdAt: isoDateTime,
});
export type PayAdjustment = z.infer<typeof payAdjustmentSchema>;

/** One clock-in/clock-out block of a person (registro de horas). */
export const attendanceSchema = z.object({
  id,
  userId: z.string(),
  userName: z.string(),
  date: isoDate,
  start: hhmm,
  /** null while the person is still clocked in. */
  end: hhmm.nullable().default(null),
  note: z.string().default(""),
  /** Falta: the day counts 0 hours (and stops the automatic schedule hours for that day). */
  absent: z.boolean().default(false),
  /** operario = marked from the phone; admin = entered or corrected by an admin; auto = schedule hours (never stored). */
  source: z.enum(["operario", "admin", "auto"]),
  createdBy: z.string(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  history: z.array(changeEntrySchema).default([]),
});
export type Attendance = z.infer<typeof attendanceSchema>;

/**
 * Celular de un operario autorizado por QR: the phone asks for access (pending,
 * with a short code shown as QR), an admin scans it and assigns the operator.
 * Only a hash of the device secret is stored; the secret lives in an httpOnly cookie.
 */
export const DEVICE_STATUSES = ["pendiente", "aprobado", "revocado"] as const;
export const deviceSchema = z.object({
  id,
  /** Short code shown on the phone and inside its QR (pending requests only). */
  code: z.string(),
  secretHash: z.string(),
  status: z.enum(DEVICE_STATUSES),
  userId: z.string().nullable().default(null),
  /** Short description of the phone (from its browser). */
  label: z.string().default(""),
  createdAt: isoDateTime,
  expiresAt: isoDateTime,
  approvedBy: z.string().nullable().default(null),
  approvedAt: isoDateTime.nullable().default(null),
  revokedAt: isoDateTime.nullable().default(null),
});
export type Device = z.infer<typeof deviceSchema>;

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
  /** Self-registration from the home page (S.M.I.: closed; only the admins create accounts). */
  registrationOpen: z.boolean().default(false),
  /** Operarios may sign in (S.M.I.: no — they see their queue on the public board). */
  staffLogin: z.boolean().default(false),
  /** Secret of the read-only workshop board (/tablero/<token>); null until an admin creates it. */
  boardToken: z.string().nullable().default(null),
  /** Optional shared code required to self-register (stored as a scrypt hash). */
  registrationCodeHash: z.string().nullable().default(null),
  maxPendingRegistrations: z.number().int().min(1).max(200).default(25),
  /** Usernames already created from ADMIN_BOOTSTRAP_* (never recreated after a deletion). */
  bootstrapAdmins: z.array(z.string()).default([]),
  legal: legalInfoSchema,
  production: productionSettingsSchema.default(productionSettingsSchema.parse({})),
  payroll: payrollSettingsSchema.default(payrollSettingsSchema.parse({})),
  finance: financeSettingsSchema.default(financeSettingsSchema.parse({})),
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
  attendance: collectionSchema(attendanceSchema),
  devices: collectionSchema(deviceSchema),
  payAdjustments: collectionSchema(payAdjustmentSchema),
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
  attendance: Collection<Attendance>;
  devices: Collection<Device>;
  payAdjustments: Collection<PayAdjustment>;
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
  attendance: { kind: "sharded", dir: "asistencia" },
  devices: { kind: "single" },
  payAdjustments: { kind: "single" },
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
