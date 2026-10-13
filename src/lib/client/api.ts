"use client";

import type {
  Attendance,
  AttachmentKind,
  ClaimKind,
  Client,
  ClientKind,
  Difficulty,
  IpcEntry,
  Machine,
  MachineState,
  Order,
  OrderStatus,
  PayrollSettings,
  Process,
  ProductionSettings,
  Quote,
  RequestStatus,
  RequestType,
  SupplyRequest,
  Task,
  TaskPriority,
  TaskStatus,
} from "@/lib/domain/schema";
import type { AttachmentView, ClientView, OrderView, PublicInfo, QuoteView, SyncPayload } from "@/lib/domain/views";
import type { Indicators } from "@/lib/server/services/indicators";
import type { HourKind, PayrollLine, Quincena } from "@/lib/domain/payroll";

export interface MyAttendance {
  today: Attendance[];
  open: Attendance | null;
  quincena: Quincena;
  hours: Record<HourKind, number>;
  workedHours: number;
  scheduledHours: number;
}

export interface PayrollPersonView {
  id: string;
  displayName: string;
  username: string;
  monthlySalary: number | null;
  transportAllowance: boolean;
  positionTitle: string | null;
}

export interface PayrollReport {
  /** Coordinación/asistencia: hours only, no salaries or amounts. */
  moneyHidden: boolean;
  quincena: Quincena;
  previous: string;
  next: string;
  current: string;
  settings: PayrollSettings;
  people: PayrollPersonView[];
  lines: PayrollLine[];
  entries: Array<Omit<Attendance, "history">>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const UNAUTHORIZED_EVENT = "smi:unauthorized";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function request<T>(path: string, init: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method ?? "GET";
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "Sin conexión. Revisa tu internet e intenta de nuevo.", "network");
  }

  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  let message = "Ocurrió un error. Intenta de nuevo.";
  let code = "error";
  try {
    const body = (await res.json()) as { error?: string; code?: string };
    message = body.error ?? message;
    code = body.code ?? code;
  } catch {
    // non-JSON error body
  }
  if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  const retry = Number(res.headers.get("retry-after"));
  throw new ApiError(res.status, message, code, Number.isFinite(retry) && retry > 0 ? retry : null);
}

export type SessionInfo =
  | { status: "anonymous" }
  | { status: "denied"; reason: string; message: string }
  | {
      status: "ok";
      incomplete: boolean;
      user: { id: string; displayName: string; username: string; isAdmin: boolean; positionTitle: string | null };
    };

export interface TaskCreate {
  title: string;
  description?: string;
  positionId: string | null;
  priority?: TaskPriority;
  dueDate?: string | null;
  piece?: string | null;
  quantity?: number | null;
  checklist?: string[];
}

export interface TaskUpdate {
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
  actualHours?: number | null;
}

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

export interface MachineInput {
  name: string;
  process: Process;
  description: string;
  state: MachineState;
  activeSince: string | null;
  hoursPerDay: number | null;
  hourlyRate: number;
  positionId: string | null;
}

export interface WorkItemInput {
  id?: string;
  process: Process;
  machineId: string | null;
  positionId?: string | null;
  description: string;
  plannedHours: number;
}

export interface SupplyInput {
  id?: string;
  description: string;
  supplier: string;
  quantity: number;
  unitCost: number;
}

export interface OrderInput {
  clientId: string | null;
  clientName: string | null;
  title: string;
  description: string;
  difficulty: Difficulty;
  urgent?: boolean;
  quantity: number;
  condition: string;
  receivedAt?: string | null;
  due: { date: string; time: string } | null;
  workItems: WorkItemInput[];
  supplies: SupplyInput[];
  price: number | null;
  notes: string;
}

export type OrderActionInput =
  | { action: "status"; to: OrderStatus }
  | { action: "deliver"; satisfaction: number | null; finalPrice: number | null }
  | { action: "close" }
  | { action: "invoice"; number: string | null }
  | { action: "claim"; kind: ClaimKind; description: string }
  | { action: "resolveClaim"; claimId: string; resolution: string }
  | { action: "satisfaction"; value: number | null }
  | { action: "cancel"; reason: string | null }
  | { action: "reopen" };

export interface HistoricalInput {
  clientId: string | null;
  clientName: string | null;
  title: string;
  description: string;
  quantity: number;
  receivedAt: string;
  deliveredAt: string;
  dueDate: string | null;
  workItems: Array<{ process: Process; machineId: string | null; hours: number }>;
  supplies: SupplyInput[];
  price: number | null;
  satisfaction: number | null;
  invoiceNumber: string | null;
  notes: string;
}

export interface QuoteInput {
  clientId: string | null;
  clientName: string | null;
  title: string;
  description: string;
  quantity: number;
  materials: Array<{ id?: string; description: string; quantity: number; unitCost: number }>;
  labor: Array<{ id?: string; process: Process; machineId: string | null; description: string; hours: number; rate: number | null }>;
  difficulty: Difficulty;
  urgent: boolean;
  marginPct: number | null;
  ivaPct: number | null;
  validDays: number | null;
  notes: string;
}

export type QuoteActionInput =
  | { action: "send" | "reject" | "draft" | "duplicate" }
  | { action: "approve"; due: { date: string; time: string } | null; condition: string; machines: Record<string, string | null> };

/** Uploads one file as the raw request body (images should be compressed first). */
export async function uploadFile(file: Blob, meta: { kind: AttachmentKind; orderId?: string | null; quoteId?: string | null; name: string }) {
  const params = new URLSearchParams({ tipo: meta.kind, nombre: meta.name });
  if (meta.orderId) params.set("orden", meta.orderId);
  if (meta.quoteId) params.set("cotizacion", meta.quoteId);
  let res: Response;
  try {
    res = await fetch(`/api/adjuntos?${params}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": file.type, Accept: "application/json" },
      body: file,
    });
  } catch {
    throw new ApiError(0, "Sin conexión. Revisa tu internet e intenta de nuevo.", "network");
  }
  const body = (await res.json().catch(() => ({}))) as { attachment?: AttachmentView; error?: string; code?: string };
  if (!res.ok || !body.attachment) throw new ApiError(res.status, body.error ?? "No se pudo subir el archivo.", body.code ?? "error");
  return body.attachment;
}

export const attachmentUrl = (id: string, download = false) => `/api/adjuntos/${encodeURIComponent(id)}${download ? "?descargar=1" : ""}`;

export interface ContractTermsInput {
  startDate: string;
  endDate: string | null;
  notes?: string | null;
}

/** Every endpoint the UI may call. Authorisation is enforced server-side. */
export const api = {
  publicInfo: () => request<PublicInfo>("/api/public"),
  session: () => request<SessionInfo>("/api/session"),
  sync: () => request<SyncPayload>("/api/sync"),

  auth: {
    login: (username: string, password: string) =>
      request<{ ok: true; mustChangePassword: boolean }>("/api/auth/login", { method: "POST", body: { username, password } }),
    logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST", body: {} }),
    logoutEverywhere: () => request<{ ok: true }>("/api/auth/logout-all", { method: "POST", body: {} }),
    register: (input: {
      displayName: string;
      username: string;
      password: string;
      phone?: string | null;
      requestedPositionId?: string | null;
      note?: string | null;
      accessCode?: string | null;
      consent: boolean;
      website?: string | null;
    }) => request<{ ok: true; message: string }>("/api/auth/register", { method: "POST", body: input }),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ ok: true }>("/api/auth/password", { method: "POST", body: { currentPassword, newPassword } }),
    acceptConsent: () => request<{ ok: true }>("/api/auth/consent", { method: "POST", body: {} }),
    setup: (input: { setupKey: string; displayName: string; username: string; password: string }) =>
      request<{ ok: true }>("/api/setup", { method: "POST", body: input }),
  },

  tasks: {
    create: (input: TaskCreate) => request<{ task: Task }>("/api/tasks", { method: "POST", body: input }),
    update: (id: string, patch: TaskUpdate) => request<{ task: Task }>(`/api/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    remove: (id: string) => request<{ ok: true }>(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }),
    addNote: (id: string, text: string) => request<{ task: Task }>(`/api/tasks/${encodeURIComponent(id)}/notes`, { method: "POST", body: { text } }),
  },

  requests: {
    create: (input: { type: RequestType; item: string; quantity?: string | null; urgent?: boolean; note?: string | null; taskId?: string | null }) =>
      request<{ request: SupplyRequest }>("/api/requests", { method: "POST", body: input }),
    update: (id: string, status: RequestStatus, response?: string | null) =>
      request<{ request: SupplyRequest }>(`/api/requests/${encodeURIComponent(id)}`, { method: "PATCH", body: { status, response: response ?? null } }),
  },

  closeDay: (input: { note?: string; issues?: string; completeTaskIds?: string[] }) =>
    request<{ closure: unknown }>("/api/closures", { method: "POST", body: input }),

  notifications: {
    markRead: (ids: string[] | "all") => request<{ ok: true }>("/api/notifications/read", { method: "POST", body: { ids } }),
  },

  push: {
    subscribe: (sub: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string | null }) =>
      request<{ ok: true }>("/api/push/subscribe", { method: "POST", body: sub }),
    unsubscribe: (endpoint: string) => request<{ ok: true }>("/api/push/unsubscribe", { method: "POST", body: { endpoint } }),
    test: () => request<{ sent: number; failed: number }>("/api/push/test", { method: "POST", body: {} }),
  },

  me: {
    exportUrl: "/api/me/export",
  },

  admin: {
    createAccount: (input: {
      displayName: string;
      /** Both empty for an operario without app access. */
      username: string;
      tempPassword: string;
      adminScope?: "total" | "gestion";
      phone?: string | null;
      kind: "admin" | "staff";
      positionId?: string | null;
      replaceCurrent?: boolean;
      startDate?: string;
      endDate?: string | null;
      notes?: string | null;
    }) => request<{ id: string }>("/api/admin/users", { method: "POST", body: input }),
    updateUser: (id: string, patch: { displayName?: string; phone?: string | null; status?: "active" | "disabled"; unlock?: true }) =>
      request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    deleteUser: (id: string) => request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
    approve: (
      id: string,
      input: { mode: "staff" | "admin"; positionId?: string | null; replaceCurrent?: boolean; startDate?: string; endDate?: string | null; notes?: string | null },
    ) => request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/approve`, { method: "POST", body: input }),
    reject: (id: string, reason?: string | null) =>
      request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/reject`, { method: "POST", body: { reason: reason ?? null } }),
    resetPassword: (id: string, tempPassword: string) =>
      request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: "POST", body: { tempPassword } }),

    createPosition: (input: { title: string; area: string; grantsAdmin?: boolean }) =>
      request<{ id: string }>("/api/admin/positions", { method: "POST", body: input }),
    updatePosition: (id: string, patch: { title?: string; area?: string; grantsAdmin?: boolean; order?: number }) =>
      request<{ ok: true }>(`/api/admin/positions/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    deletePosition: (id: string) => request<{ ok: true }>(`/api/admin/positions/${encodeURIComponent(id)}`, { method: "DELETE" }),
    assignContract: (positionId: string, input: { userId: string; replaceCurrent?: boolean } & ContractTermsInput) =>
      request<{ ok: true }>(`/api/admin/positions/${encodeURIComponent(positionId)}/contract`, { method: "PUT", body: input }),
    updateContract: (positionId: string, input: ContractTermsInput) =>
      request<{ ok: true }>(`/api/admin/positions/${encodeURIComponent(positionId)}/contract`, { method: "PATCH", body: input }),
    endContract: (positionId: string, reason?: string | null) =>
      request<{ ok: true }>(`/api/admin/positions/${encodeURIComponent(positionId)}/contract`, { method: "DELETE", body: { reason: reason ?? null } }),

    createAnnouncement: (input: { text: string; level?: "info" | "importante"; expiresAt?: string | null }) =>
      request<{ announcement: unknown }>("/api/admin/announcements", { method: "POST", body: input }),
    deleteAnnouncement: (id: string) => request<{ ok: true }>(`/api/admin/announcements/${encodeURIComponent(id)}`, { method: "DELETE" }),

    updateSettings: (patch: {
      workshopName?: string;
      timezone?: string;
      registrationOpen?: boolean;
      staffLogin?: boolean;
      registrationCode?: string;
      maxPendingRegistrations?: number;
      legal?: Partial<Record<"companyName" | "tradeName" | "nit" | "address" | "city" | "email" | "phone" | "privacyContact" | "website", string>>;
      publishPolicyVersion?: string;
    }) => request<{ ok: true }>("/api/admin/settings", { method: "PATCH", body: patch }),
    audit: () =>
      request<{ entries: Array<{ id: string; at: string; actorName: string | null; action: string; target: string | null; detail: string | null }> }>(
        "/api/admin/audit",
      ),
    updateProduction: (production: Partial<Omit<ProductionSettings, "processRates">> & { processRates?: Partial<ProductionSettings["processRates"]> }) =>
      request<{ ok: true }>("/api/admin/settings", { method: "PATCH", body: { production } }),
  },

  clients: {
    create: (input: ClientInput) => request<{ client: Client }>("/api/admin/clients", { method: "POST", body: input }),
    get: (id: string) => request<{ client: Client; orders: OrderView[]; quotes: QuoteView[] }>(`/api/admin/clients/${encodeURIComponent(id)}`),
    update: (id: string, patch: Partial<ClientInput> & { archived?: boolean }) =>
      request<{ client: ClientView }>(`/api/admin/clients/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
  },

  machines: {
    create: (input: MachineInput) => request<{ machine: Machine }>("/api/admin/machines", { method: "POST", body: input }),
    update: (id: string, patch: Partial<MachineInput> & { order?: number; stopReason?: string | null }) =>
      request<{ machine: Machine }>(`/api/admin/machines/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    remove: (id: string) => request<{ ok: true }>(`/api/admin/machines/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  orders: {
    all: () => request<{ orders: OrderView[] }>("/api/admin/orders"),
    get: (id: string) => request<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(id)}`),
    create: (input: OrderInput) => request<{ order: Order }>("/api/admin/orders", { method: "POST", body: input }),
    update: (id: string, patch: Partial<OrderInput>) => request<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    action: (id: string, input: OrderActionInput) =>
      request<{ order: Order }>(`/api/admin/orders/${encodeURIComponent(id)}/action`, { method: "POST", body: input }),
    remove: (id: string) => request<{ ok: true }>(`/api/admin/orders/${encodeURIComponent(id)}`, { method: "DELETE" }),
    historical: (input: HistoricalInput) => request<{ order: Order }>("/api/admin/historico", { method: "POST", body: input }),
  },

  quotes: {
    get: (id: string) => request<{ quote: Quote }>(`/api/admin/quotes/${encodeURIComponent(id)}`),
    create: (input: QuoteInput) => request<{ quote: Quote }>("/api/admin/quotes", { method: "POST", body: input }),
    update: (id: string, patch: Partial<QuoteInput>) => request<{ quote: Quote }>(`/api/admin/quotes/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    action: (id: string, input: QuoteActionInput) =>
      request<{ quote: Quote; order?: Order }>(`/api/admin/quotes/${encodeURIComponent(id)}/action`, { method: "POST", body: input }),
    remove: (id: string) => request<{ ok: true }>(`/api/admin/quotes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  ipc: {
    save: (entries: Array<{ month: string; index: number }>, remove: string[] = []) =>
      request<{ entries: IpcEntry[] }>("/api/admin/ipc", { method: "PUT", body: { entries, remove } }),
  },

  indicators: (months = 12) => request<Indicators>(`/api/admin/kpis?meses=${months}`),

  attachments: {
    remove: (id: string) => request<{ ok: true }>(`/api/adjuntos/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  exportUrl: (kind: "ordenes" | "clientes" | "nomina", quincena?: string) =>
    `/api/admin/export?tipo=${kind}${quincena ? `&quincena=${encodeURIComponent(quincena)}` : ""}`,

  attendance: {
    mine: () => request<MyAttendance>("/api/asistencia"),
    clock: (action: "in" | "out") => request<{ entry: Attendance }>("/api/asistencia", { method: "POST", body: { action } }),
    create: (input: { userId: string; date: string; start: string; end: string | null; note?: string }) =>
      request<{ entry: Attendance }>("/api/admin/asistencia", { method: "POST", body: input }),
    update: (id: string, patch: { date?: string; start?: string; end?: string | null; note?: string }) =>
      request<{ entry: Attendance }>(`/api/admin/asistencia/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),
    remove: (id: string) => request<{ ok: true }>(`/api/admin/asistencia/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },

  payroll: {
    report: (quincena?: string) => request<PayrollReport>(`/api/admin/nomina${quincena ? `?quincena=${encodeURIComponent(quincena)}` : ""}`),
    setPay: (userId: string, input: { monthlySalary?: number | null; transportAllowance?: boolean }) =>
      request<{ ok: true }>(`/api/admin/users/${encodeURIComponent(userId)}/pay`, { method: "PATCH", body: input }),
    updateSettings: (payroll: Partial<PayrollSettings>) => request<{ ok: true }>("/api/admin/settings", { method: "PATCH", body: { payroll } }),
  },
};
