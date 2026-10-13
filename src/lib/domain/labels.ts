import type { ContractStatus } from "./contracts";
import type { AttachmentKind, ClaimKind, ClientKind, Difficulty, MachineState, OrderStatus, Process, QuoteStatus, RequestStatus, RequestType, TaskPriority, TaskStatus, UserStatus } from "./schema";

/** Plain-language labels shown in the UI (single place to adjust wording). */

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  bloqueada: "Bloqueada",
  completada: "Completada",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  baja: "Baja",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  material: "Material",
  herramienta: "Herramienta",
  mantenimiento: "Mantenimiento",
  consumible: "Consumible",
  epp: "EPP (protección)",
  otro: "Otro",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pendiente: "Pendiente",
  en_camino: "En camino",
  entregada: "Entregada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  vacante: "Vacante",
  programado: "Inicia pronto",
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencido · vacante",
  terminado: "Terminado · vacante",
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  pending: "Pendiente de aprobación",
  active: "Activa",
  rejected: "Rechazada",
  disabled: "Desactivada",
};

/** Tailwind color token per status, used by chips, stripes and rings. */
export const TASK_STATUS_TONE: Record<TaskStatus, "pending" | "progress" | "blocked" | "done"> = {
  pendiente: "pending",
  en_proceso: "progress",
  bloqueada: "blocked",
  completada: "done",
};

export const PRIORITY_RANK: Record<TaskPriority, number> = { urgente: 0, alta: 1, normal: 2, baja: 3 };

export function formatDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  if (!value) return "—";
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return new Intl.DateTimeFormat("es-CO", opts).format(date);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function timeAgo(value: string, now = Date.now()) {
  const seconds = Math.round((now - new Date(value).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (Math.abs(seconds) < 60) return "justo ahora";
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

export const PROCESS_LABEL: Record<Process, string> = {
  torno: "Torno",
  fresadora: "Fresadora",
  cepillo: "Cepillo",
  cnc: "CNC",
  prensa: "Prensa",
  soldadura: "Soldadura",
  banco: "Mecánica de banco",
};

export const MACHINE_STATE_LABEL: Record<MachineState, string> = {
  activa: "Activa",
  inactiva: "Próximamente",
  mantenimiento: "En mantenimiento",
};

export const CLIENT_KIND_LABEL: Record<ClientKind, string> = { empresa: "Empresa", persona: "Persona natural" };

export const CLIENT_TIER_LABEL: Record<number, string> = { 1: "Normal", 2: "Frecuente", 3: "Estratégico" };

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: "Normal", 2: "Complicado (+15 %)", 3: "Urgente (+25 %)" };

export const QUOTE_STATUS_LABEL: Record<QuoteStatus | "vencida", string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  vencida: "Vencida",
};

export const CLAIM_KIND_LABEL: Record<ClaimKind, string> = { garantia: "Garantía", devolucion: "Devolución" };

export const ATTACHMENT_KIND_LABEL: Record<AttachmentKind, string> = {
  foto_ingreso: "Foto de llegada",
  plano: "Plano / dibujo",
  foto: "Foto",
  documento: "Documento",
};

/** Chip tone per work-order status (see Chip in components/ui). */
export const ORDER_STATUS_TONE: Record<OrderStatus, "neutral" | "progress" | "done" | "glow" | "pending" | "blocked" | "vacant"> = {
  recibida: "neutral",
  en_proceso: "progress",
  terminada: "done",
  entregada: "glow",
  cerrada: "neutral",
  garantia: "blocked",
  cancelada: "vacant",
};

export const MACHINE_STATE_TONE: Record<MachineState, "done" | "vacant" | "pending"> = {
  activa: "done",
  inactiva: "vacant",
  mantenimiento: "pending",
};

export const WEEKDAY_LABEL: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom" };
