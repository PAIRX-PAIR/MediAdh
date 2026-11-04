import {
  Archive,
  BarChart3,
  Bell,
  Building2,
  Calculator,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  Cog,
  Factory,
  FileClock,
  Gauge,
  House,
  Map as MapIcon,
  Megaphone,
  PackageSearch,
  PiggyBank,
  PackagePlus,
  QrCode,
  Settings,
  ShieldCheck,
  UserRound,
  UserRoundCog,
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
  /** Label in the bottom bar when the sidebar one is too long. */
  mobileLabel?: string;
  /** Only in the phone bottom bar (the sidebar already lists its sections). */
  mobileOnly?: boolean;
  /** Extra paths that keep this item highlighted (e.g. the Taller hub covers its four sections). */
  match?: string[];
  /** Sidebar section. */
  group?: "Taller" | "Gestión" | "Equipo" | "Usuarios" | "Sistema" | "Mi trabajo";
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

/**
 * Las cuatro secciones del módulo Taller. Una sola definición: la barra de pestañas, la pantalla
 * «Taller» del celular y el menú lateral leen de aquí, así no hay accesos duplicados que se desalineen.
 */
export const TALLER_SECTIONS = [
  { href: "/admin/ordenes", label: "Órdenes de trabajo", short: "Órdenes", icon: ClipboardList },
  { href: "/admin/programacion", label: "Programación", short: "Programación", icon: CalendarClock },
  { href: "/admin/maquinas", label: "Máquinas", short: "Máquinas", icon: Cog },
  { href: "/admin/produccion", label: "Producción", short: "Producción", icon: Factory },
] as const;

export const TALLER_HUB = "/admin/taller";

const section = (href: (typeof TALLER_SECTIONS)[number]["href"]) => TALLER_SECTIONS.find((t) => t.href === href)!;

/**
 * Menú de gerencia y coordinación. En el celular la barra inferior muestra Inicio · Órdenes · Taller ·
 * Clientes · Más; «Más» agrupa lo demás (lo que no es de uso diario), con los mismos permisos de siempre.
 */
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Inicio", icon: House, primary: true, badge: (d) => d.alerts.filter((a) => a.level === "critical").length },
  { href: section("/admin/ordenes").href, label: section("/admin/ordenes").label, mobileLabel: "Órdenes", icon: section("/admin/ordenes").icon, primary: true, group: "Taller", badge: toInvoiceOrLate },
  { href: TALLER_HUB, label: "Taller", icon: Factory, primary: true, mobileOnly: true, group: "Taller", match: [TALLER_HUB, "/admin/programacion", "/admin/maquinas", "/admin/produccion"] },
  { href: section("/admin/programacion").href, label: section("/admin/programacion").label, icon: section("/admin/programacion").icon, group: "Taller" },
  { href: section("/admin/maquinas").href, label: section("/admin/maquinas").label, icon: section("/admin/maquinas").icon, group: "Taller" },
  { href: section("/admin/produccion").href, label: section("/admin/produccion").label, icon: section("/admin/produccion").icon, group: "Taller" },
  { href: "/admin/clientes", label: "Clientes", icon: Building2, primary: true, group: "Gestión" },
  { href: "/admin/cotizador", label: "Cotizador", icon: Calculator, group: "Gestión", badge: (d) => (d.production.quotes ?? []).filter((q) => q.status === "enviada").length },
  { href: "/admin/mapa", label: "Mapa de tareas", icon: MapIcon, group: "Gestión" },
  { href: "/admin/insumos", label: "Insumos", icon: PackageSearch, group: "Gestión", badge: (d) => pendingSupplyCount(d.production.orders ?? [], d.production.generalSupplies ?? []) },
  { href: "/admin/indicadores", label: "Indicadores", icon: BarChart3, group: "Gestión" },
  { href: "/admin/finanzas", label: "Ganancias", icon: PiggyBank, owner: true, group: "Gestión" },
  { href: "/admin/historico", label: "Histórico", icon: Archive, group: "Gestión" },
  { href: "/admin/tareas", label: "Tareas", icon: Wrench, group: "Equipo", badge: (d) => d.tasks.filter((t) => t.status === "bloqueada").length },
  { href: "/admin/equipo", label: "Equipo", icon: Users, owner: true, group: "Equipo", badge: (d) => d.users?.filter((u) => u.status === "pending").length ?? 0 },
  {
    href: "/admin/solicitudes",
    label: "Pedidos",
    icon: PackagePlus,
    group: "Equipo",
    // Pedidos de los puestos + insumos requeridos de las OT que siguen pendientes.
    badge: (d) => d.requests.filter((r) => r.status === "pendiente").length + pendingSupplyCount(d.production.orders ?? []),
  },
  { href: "/admin/cierres", label: "Cierres", icon: FileClock, group: "Equipo" },
  { href: "/admin/nomina", label: "Nómina", icon: Wallet, group: "Equipo" },
  { href: "/admin/dispositivos", label: "Accesos QR", icon: QrCode, group: "Equipo" },
  { href: "/admin/avisos", label: "Avisos", icon: Megaphone, group: "Equipo" },
  { href: "/admin/cambiar-usuario", label: "Cambiar de usuario", icon: UserRoundCog, owner: true, group: "Usuarios" },
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
