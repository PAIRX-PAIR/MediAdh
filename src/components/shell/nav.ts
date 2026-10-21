import {
  Archive,
  BarChart3,
  Bell,
  Building2,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  Gauge,
  ListOrdered,
  Megaphone,
  PackageSearch,
  PiggyBank,
  PackagePlus,
  QrCode,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { pendingSupplyCount } from "@/lib/domain/supplies";
import type { SyncPayload } from "@/lib/domain/views";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the bottom task bar on phones (max 5). */
  primary?: boolean;
  /** Sidebar section. */
  group?: "Producción" | "Equipo" | "Sistema" | "Mi trabajo";
  /** Only gerencia y administración (scope total). */
  owner?: boolean;
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

const toInvoiceOrLate = (d: SyncPayload) =>
  (d.production.orders ?? []).filter((o) => o.invoice.pending).length + (d.alerts.find((a) => a.id === "overdue") ? 1 : 0);

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Mando", icon: Gauge, primary: true, group: "Producción", badge: (d) => d.alerts.filter((a) => a.level === "critical").length },
  { href: "/admin/ordenes", label: "Órdenes", icon: ClipboardList, primary: true, group: "Producción", badge: toInvoiceOrLate },
  { href: "/admin/cola", label: "Cola", icon: ListOrdered, primary: true, group: "Producción" },
  { href: "/admin/insumos", label: "Insumos", icon: PackageSearch, group: "Producción", badge: (d) => pendingSupplyCount(d.production.orders ?? [], d.production.generalSupplies ?? []) },
  { href: "/admin/cotizador", label: "Cotizador", icon: Calculator, group: "Producción", badge: (d) => (d.production.quotes ?? []).filter((q) => q.status === "enviada").length },
  { href: "/admin/clientes", label: "Clientes", icon: Building2, group: "Producción" },
  { href: "/admin/indicadores", label: "Indicadores", icon: BarChart3, group: "Producción" },
  { href: "/admin/finanzas", label: "Ganancias", icon: PiggyBank, owner: true, group: "Producción" },
  { href: "/admin/historico", label: "Histórico", icon: Archive, group: "Producción" },
  { href: "/admin/tareas", label: "Tareas", icon: Wrench, group: "Equipo", badge: (d) => d.tasks.filter((t) => t.status === "bloqueada").length },
  { href: "/admin/equipo", label: "Equipo", icon: Users, primary: true, owner: true, group: "Equipo", badge: (d) => d.users?.filter((u) => u.status === "pending").length ?? 0 },
  {
    href: "/admin/solicitudes",
    label: "Pedidos",
    icon: PackagePlus,
    primary: true,
    group: "Equipo",
    badge: (d) => d.requests.filter((r) => r.status === "pendiente").length,
  },
  { href: "/admin/cierres", label: "Cierres", icon: FileClock, group: "Equipo" },
  { href: "/admin/nomina", label: "Nómina", icon: Wallet, group: "Equipo" },
  { href: "/admin/dispositivos", label: "Accesos QR", icon: QrCode, group: "Equipo" },
  { href: "/admin/avisos", label: "Avisos", icon: Megaphone, group: "Equipo" },
  { href: "/admin/ajustes", label: "Ajustes", icon: Settings, owner: true, group: "Sistema" },
  { href: "/admin/auditoria", label: "Auditoría", icon: ShieldCheck, owner: true, group: "Sistema" },
  { href: "/perfil", label: "Perfil", icon: UserRound, group: "Sistema" },
];

/** Admins who also hold a workshop position get their own work views too. */
export const ADMIN_WORKER_EXTRAS: NavItem[] = [
  { href: "/tareas", label: "Mis tareas", icon: ClipboardList, group: "Mi trabajo", badge: openTasks },
  { href: "/cierre", label: "Cerrar mi día", icon: ClipboardCheck, group: "Mi trabajo" },
];

export const NOTIFICATIONS_ICON = Bell;
