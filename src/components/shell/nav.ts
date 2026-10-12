import {
  Bell,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  Gauge,
  Megaphone,
  PackagePlus,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { SyncPayload } from "@/lib/domain/views";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the bottom task bar on phones (max 5). */
  primary?: boolean;
  badge?: (data: SyncPayload) => number;
}

const openTasks = (d: SyncPayload) =>
  d.tasks.filter((t) => t.status !== "completada" && t.positionId === d.me.positionId).length;

export const WORKER_NAV: NavItem[] = [
  { href: "/panel", label: "Panel", icon: Gauge, primary: true },
  { href: "/tareas", label: "Tareas", icon: ClipboardList, primary: true, badge: openTasks },
  { href: "/solicitudes", label: "Pedir", icon: PackagePlus, primary: true },
  { href: "/cierre", label: "Cerrar día", icon: ClipboardCheck, primary: true },
  { href: "/perfil", label: "Perfil", icon: UserRound, primary: true },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Mando", icon: Gauge, primary: true, badge: (d) => d.alerts.filter((a) => a.level === "critical").length },
  { href: "/admin/tareas", label: "Tareas", icon: Wrench, primary: true, badge: (d) => d.tasks.filter((t) => t.status === "bloqueada").length },
  { href: "/admin/equipo", label: "Equipo", icon: Users, primary: true, badge: (d) => d.users?.filter((u) => u.status === "pending").length ?? 0 },
  {
    href: "/admin/solicitudes",
    label: "Pedidos",
    icon: PackagePlus,
    primary: true,
    badge: (d) => d.requests.filter((r) => r.status === "pendiente").length,
  },
  { href: "/admin/cierres", label: "Cierres", icon: FileClock },
  { href: "/admin/avisos", label: "Avisos", icon: Megaphone },
  { href: "/admin/ajustes", label: "Ajustes", icon: Settings },
  { href: "/admin/auditoria", label: "Auditoría", icon: ShieldCheck },
  { href: "/perfil", label: "Perfil", icon: UserRound, primary: true },
];

/** Admins who also hold a workshop position get their own work views too. */
export const ADMIN_WORKER_EXTRAS: NavItem[] = [
  { href: "/tareas", label: "Mis tareas", icon: ClipboardList, badge: openTasks },
  { href: "/cierre", label: "Cerrar mi día", icon: ClipboardCheck },
];

export const NOTIFICATIONS_ICON = Bell;
