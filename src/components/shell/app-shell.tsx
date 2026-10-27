"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertOctagon, Bell, CheckCheck, LogOut, Megaphone, Menu, Wifi, WifiOff, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PwaBridge } from "@/components/pwa/pwa-bridge";
import { Button, cn } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/overlay";
import { api } from "@/lib/client/api";
import { shiftsOn } from "@/lib/domain/calendar";
import { timeAgo } from "@/lib/domain/labels";
import type { NotificationView } from "@/lib/domain/views";
import { BrandMark } from "./brand-mark";
import { ImpersonationBar } from "./impersonation-bar";
import { ADMIN_NAV, ADMIN_WORKER_EXTRAS, WORKER_NAV, type NavItem } from "./nav";
import { ProfileGate } from "./profile-gate";
import { WorkdayClock } from "./workday-clock";

export function AppShell({ children }: { children: ReactNode }) {
  const { data } = useSync();
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [menuOpenedAt, setMenuOpenedAt] = useState<string | null>(null);
  const menu = menuOpenedAt === pathname;

  const nav = useMemo<NavItem[]>(() => {
    if (!data.me.isAdmin) return WORKER_NAV;
    const admin = (data.me.scope === "total" ? ADMIN_NAV : ADMIN_NAV.filter((item) => !item.owner)).filter(
      (item) => !item.users || item.users.includes(data.me.username),
    );
    return data.me.positionId ? [...admin, ...ADMIN_WORKER_EXTRAS] : admin;
  }, [data.me.isAdmin, data.me.positionId, data.me.scope, data.me.username]);

  if (data.me.mustChangePassword || data.me.needsConsent) {
    return (
      <>
        <PwaBridge />
        <ImpersonationBar />
        <ProfileGate />
      </>
    );
  }

  const primary = nav.filter((n) => n.primary).slice(0, 5);
  const isActive = (href: string) => (href === "/admin" || href === "/panel" ? pathname === href : pathname.startsWith(href));

  return (
    <div className="flex min-h-dvh flex-col">
      <PwaBridge />
      <ImpersonationBar />
      <TopBar onBell={() => setDrawer(true)} onMenu={() => setMenuOpenedAt(pathname)} />
      <AnnouncementTicker />
      {data.demo && (
        <div className="border-b border-vacant/30 bg-vacant/10 px-4 py-1.5 text-center text-xs text-vacant">
          Modo demostración: datos ficticios que se reinician. No ingreses información real.
        </div>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-3 sm:px-5 lg:px-8">
        <aside
          className="sticky top-[76px] hidden h-[calc(100dvh-96px)] w-60 shrink-0 flex-col gap-1 overflow-y-auto overscroll-contain py-6 [scrollbar-width:thin] lg:flex"
          aria-label="Navegación principal"
        >
          <GroupedNav nav={nav} isActive={isActive} />
          <div className="mt-auto pt-4">
            <SignOutButton />
          </div>
        </aside>
        <main id="contenido" className="min-w-0 flex-1 pb-28 pt-4 lg:pb-10 lg:pt-6">
          {children}
        </main>
      </div>

      {/* Barra de tareas (mobile task bar) */}
      <nav
        aria-label="Barra de tareas"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-night/90 backdrop-blur-xl lg:hidden"
      >
        <div className="shimmer-line h-px w-full opacity-60" aria-hidden />
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {primary.map((item) => (
            <li key={item.href}>
              <BottomLink item={item} active={isActive(item.href)} />
            </li>
          ))}
        </ul>
      </nav>

      <NotificationDrawer open={drawer} onClose={() => setDrawer(false)} />
      <MobileMenu open={menu} onClose={() => setMenuOpenedAt(null)} nav={nav} isActive={isActive} />
      <NotificationPopups />
    </div>
  );
}

function TopBar({ onBell, onMenu }: { onBell: () => void; onMenu: () => void }) {
  const { data, connection } = useSync();
  return (
    <header className="safe-top sticky top-0 z-40 border-b border-line bg-abyss/80 backdrop-blur-xl">
      <div className="mx-auto flex h-[60px] max-w-7xl items-center gap-3 px-3 sm:px-5 lg:px-8">
        <Link href={data.me.isAdmin ? "/admin" : "/panel"} className="flex min-w-0 items-center gap-2.5" aria-label="Inicio">
          <BrandMark className="size-9 shrink-0" />
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-[15px] font-bold tracking-wide text-ink">
              {/* Phones get the short name so it is never cut in the middle. */}
              <span className="sm:hidden">
                {data.settings.legal.tradeName || "S.M.I."}
                {data.demo ? " · Demo" : ""}
              </span>
              <span className="hidden sm:inline">{data.settings.workshopName}</span>
            </p>
            <p className="truncate text-xs text-muted">
              {data.me.displayName}
              {data.me.positionTitle ? ` · ${data.me.positionTitle}` : data.me.isAdmin ? " · Administración" : ""}
            </p>
          </div>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <WorkdayClock
            className="hidden sm:flex"
            date={data.today}
            shifts={shiftsOn(data.today, data.production.calendar)}
            timezone={data.settings.timezone}
          />
          <ConnectionDot state={connection} />
          <button
            type="button"
            onClick={onBell}
            aria-label={`Avisos${data.unread ? `: ${data.unread} sin leer` : ""}`}
            className="relative inline-flex size-11 items-center justify-center rounded-xl border border-line bg-panel/70 text-ink-soft transition hover:border-glow/60 hover:text-ink"
          >
            <Bell className={cn("size-5", data.unread > 0 && "text-glow")} />
            {data.unread > 0 && (
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-urgent px-1 font-mono text-[11px] font-bold text-white shadow-[0_0_12px_rgb(255_77_94/0.8)]">
                {data.unread > 99 ? "99+" : data.unread}
              </span>
            )}
          </button>
          {data.me.isAdmin && (
            <button
              type="button"
              onClick={onMenu}
              aria-label="Más opciones"
              className="inline-flex size-11 items-center justify-center rounded-xl border border-line bg-panel/70 text-ink-soft lg:hidden"
            >
              <Menu className="size-5" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function ConnectionDot({ state }: { state: "online" | "syncing" | "offline" | "error" }) {
  const label = { online: "En línea", syncing: "Sincronizando", offline: "Sin conexión", error: "Reconectando" }[state];
  const ok = state === "online" || state === "syncing";
  return (
    <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted sm:inline-flex" role="status" aria-live="polite">
      {ok ? <Wifi className="size-3.5 text-done" /> : <WifiOff className="size-3.5 text-blocked" />}
      <span className={cn("size-1.5 rounded-full", ok ? "bg-done shadow-[0_0_8px_var(--color-done)]" : "bg-blocked", state === "syncing" && "animate-pulse")} />
      {label}
    </span>
  );
}

function AnnouncementTicker() {
  const { data } = useSync();
  const reduce = useReducedMotion();
  const items = data.announcements;
  if (items.length === 0) return null;
  const text = items.map((a) => `${a.level === "importante" ? "⚠ " : ""}${a.text}`).join("   ·   ");
  return (
    <div className="relative z-30 flex items-center gap-3 overflow-hidden border-b border-glow/20 bg-navy-900/70 px-3 py-2 text-sm" role="region" aria-label="Avisos del taller">
      <Megaphone className="size-4 shrink-0 text-glow" aria-hidden />
      <div className="relative min-w-0 flex-1 overflow-hidden">
        {reduce ? (
          <p className="truncate text-ink-soft">{text}</p>
        ) : (
          <motion.p
            className="whitespace-nowrap text-ink-soft"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: Math.max(18, text.length / 4), ease: "linear", repeat: Infinity }}
          >
            {text}
            <span className="px-8" aria-hidden>
              ·
            </span>
            <span aria-hidden>{text}</span>
          </motion.p>
        )}
      </div>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { data } = useSync();
  const count = item.badge?.(data) ?? 0;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-display text-[15px] font-semibold tracking-wide transition",
        active ? "bg-navy-700/50 text-ink shadow-glow" : "text-muted hover:bg-white/5 hover:text-ink",
      )}
    >
      {active && <motion.span layoutId="nav-active" className="absolute inset-y-2 left-0 w-1 rounded-full bg-glow shadow-[0_0_12px_var(--color-glow)]" />}
      <Icon className={cn("size-5", active && "text-glow")} />
      {item.label}
      {count > 0 && <span className="ml-auto rounded-full bg-glow/15 px-2 py-0.5 font-mono text-xs text-glow">{count}</span>}
    </Link>
  );
}

function BottomLink({ item, active }: { item: NavItem; active: boolean }) {
  const { data } = useSync();
  const count = item.badge?.(data) ?? 0;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn("relative flex h-[64px] flex-col items-center justify-center gap-1 text-[11px] font-semibold tracking-wide", active ? "text-glow" : "text-muted")}
    >
      {active && (
        <motion.span
          layoutId="tab-active"
          className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-glow shadow-[0_0_14px_var(--color-glow)]"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
      <span className="relative">
        <Icon className={cn("size-6 transition", active && "drop-shadow-[0_0_8px_var(--color-glow)]")} />
        {count > 0 && (
          <span className="absolute -right-2.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-urgent px-1 font-mono text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </span>
      {item.label}
    </Link>
  );
}

function GroupedNav({ nav, isActive }: { nav: NavItem[]; isActive: (href: string) => boolean }) {
  const groups: Array<[string | undefined, NavItem[]]> = [];
  for (const item of nav) {
    const last = groups[groups.length - 1];
    if (last && last[0] === item.group) last[1].push(item);
    else groups.push([item.group, [item]]);
  }
  return (
    <>
      {groups.map(([group, items], i) => (
        <div key={group ?? i} className="flex flex-col gap-0.5">
          {group && <p className={cn("hud-label px-3 pb-1 text-[0.65rem]", i > 0 && "pt-4")}>{group}</p>}
          {items.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>
      ))}
    </>
  );
}

function MobileMenu({ open, onClose, nav, isActive }: { open: boolean; onClose: () => void; nav: NavItem[]; isActive: (href: string) => boolean }) {
  return (
    <Modal open={open} onClose={onClose} title="Menú" size="sm">
      <div className="flex flex-col gap-1">
        <GroupedNav nav={nav} isActive={isActive} />
        <div className="mt-3 border-t border-line pt-3">
          <SignOutButton />
        </div>
      </div>
    </Modal>
  );
}

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      block
      loading={busy}
      icon={<LogOut className="size-5" />}
      onClick={async () => {
        setBusy(true);
        await api.auth.logout().catch(() => undefined);
        router.replace("/");
        router.refresh();
      }}
      className="justify-start"
    >
      Cerrar sesión
    </Button>
  );
}

function NotificationDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, refresh } = useSync();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const openItem = async (n: NotificationView) => {
    onClose();
    if (!n.read) void api.notifications.markRead([n.id]).then(refresh).catch(() => undefined);
    if (n.link) router.push(n.link);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Avisos"
      description={data.unread ? `${data.unread} sin leer` : "Estás al día"}
      footer={
        data.unread > 0 ? (
          <Button
            variant="secondary"
            loading={busy}
            icon={<CheckCheck className="size-4" />}
            onClick={async () => {
              setBusy(true);
              await api.notifications.markRead("all").catch(() => undefined);
              await refresh();
              setBusy(false);
            }}
          >
            Marcar todo como leído
          </Button>
        ) : undefined
      }
    >
      {data.notifications.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No hay avisos todavía.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {data.notifications.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openItem(n)}
                className={cn("flex w-full gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-white/5", !n.read && "bg-glow/5")}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read ? "bg-line-strong" : n.urgent ? "bg-urgent shadow-[0_0_8px_var(--color-urgent)]" : "bg-glow shadow-[0_0_8px_var(--color-glow)]")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", n.read ? "text-ink-soft" : "font-semibold text-ink")}>{n.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                  <span className="mt-1 block text-xs text-faint">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/**
 * Emergent windows for new notifications. Urgent ones (material requests
 * marked urgent, blocked work, new access requests…) block the screen until
 * acknowledged; the rest slide in and can be dismissed.
 */
function NotificationPopups() {
  const { popups, dismissPopup, refresh } = useSync();
  const router = useRouter();
  const urgent = popups.find((n) => n.urgent);
  const regular = popups.filter((n) => !n.urgent).slice(0, 3);

  const acknowledge = (n: NotificationView, go: boolean) => {
    dismissPopup(n.id);
    void api.notifications.markRead([n.id]).then(refresh).catch(() => undefined);
    if (go && n.link) router.push(n.link);
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-[72px] z-50 flex flex-col items-center gap-2 px-3 sm:items-end sm:pr-6">
        <AnimatePresence initial={false}>
          {regular.map((n) => (
            <motion.div
              key={n.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40 }}
              role="status"
              className="hud-panel pointer-events-auto w-full max-w-sm overflow-hidden p-0 shadow-glow"
            >
              <div className="shimmer-line h-0.5" aria-hidden />
              <div className="flex gap-3 p-4">
                <Bell className="mt-0.5 size-5 shrink-0 text-glow" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-ink">{n.title}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{n.body}</p>
                  <div className="mt-3 flex gap-2">
                    {n.link && (
                      <Button size="sm" onClick={() => acknowledge(n, true)}>
                        Ver
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => acknowledge(n, false)}>
                      Entendido
                    </Button>
                  </div>
                </div>
                <button type="button" aria-label="Cerrar aviso" onClick={() => dismissPopup(n.id)} className="-mr-1 -mt-1 size-8 shrink-0 rounded-lg text-muted hover:text-ink">
                  <X className="mx-auto size-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Modal
        open={Boolean(urgent)}
        onClose={() => urgent && acknowledge(urgent, false)}
        title={urgent?.title ?? ""}
        dismissible
        footer={
          urgent && (
            <>
              <Button variant="secondary" onClick={() => acknowledge(urgent, false)}>
                Entendido
              </Button>
              {urgent.link && (
                <Button onClick={() => acknowledge(urgent, true)} icon={<AlertOctagon className="size-5" />}>
                  Atender ahora
                </Button>
              )}
            </>
          )
        }
      >
        <div className="hazard-stripe -mx-5 -mt-4 mb-4 h-2" aria-hidden />
        <p className="text-base text-ink">{urgent?.body}</p>
        {urgent && <p className="mt-2 text-xs text-muted">{timeAgo(urgent.createdAt)}</p>}
      </Modal>
    </>
  );
}
