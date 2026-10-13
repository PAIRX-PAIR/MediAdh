"use client";

import { AlertOctagon, AlertTriangle, ArrowRight, Calculator, CalendarCheck2, ClipboardPlus, Info, Layers, PackageOpen, Receipt, Scale, Wrench } from "lucide-react";
import Link from "next/link";
import { useSync } from "@/components/providers/sync-provider";
import { OccupancyList } from "@/components/production/occupancy";
import { PriorityPanel } from "@/components/production/priority-panel";
import { PageHeader, SectionTitle, StatTile } from "@/components/ui/kit";
import { Chip, cn } from "@/components/ui/primitives";
import { useProduction } from "@/lib/client/use-production";
import { CONTRACT_STATUS_LABEL, formatDate } from "@/lib/domain/labels";
import { isLate } from "@/lib/domain/lifecycle";

function greeting(now: Date) {
  const h = Number(new Intl.DateTimeFormat("es-CO", { hour: "numeric", hourCycle: "h23", timeZone: "America/Bogota" }).format(now));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

export function CommandScreen() {
  const { data } = useSync();
  const prod = useProduction();
  const open = prod.orders.filter((o) => ["recibida", "en_proceso", "garantia"].includes(o.status));
  const dueToday = prod.orders.filter((o) => o.due?.date === data.today && !["entregada", "cerrada", "cancelada"].includes(o.status));
  const late = prod.orders.filter((o) => ["recibida", "en_proceso", "terminada", "garantia"].includes(o.status) && isLate(o, data.settings.timezone, prod.ctx.now));
  const toInvoice = prod.orders.filter((o) => o.invoice.pending);
  const ready = prod.orders.filter((o) => o.status === "terminada");
  const blocked = data.tasks.filter((t) => t.status === "bloqueada");
  const pendingRequests = data.requests.filter((r) => r.status === "pendiente");
  const firstName = data.me.displayName.split(" ")[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={formatDate(data.today, { weekday: "long", day: "numeric", month: "long" })}
        title={`${greeting(new Date(data.serverTime))}, ${firstName}`}
        description="Esto es lo que pide atención en el taller ahora mismo."
        actions={
          <>
            <Link href="/admin/cotizador?nueva=1" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 font-display text-sm font-semibold text-ink-soft hover:border-glow/60 hover:text-ink">
              <Calculator className="size-4" aria-hidden /> Cotizar
            </Link>
            <Link href="/admin/cola#comprometer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 font-display text-sm font-semibold text-ink-soft hover:border-glow/60 hover:text-ink">
              <Scale className="size-4" aria-hidden /> ¿Me comprometo?
            </Link>
            <Link href="/admin/ordenes?nueva=1" className="inline-flex h-11 items-center gap-2 rounded-xl border border-glow/40 bg-gradient-to-b from-navy-400 to-navy-600 px-4 font-display text-sm font-semibold text-white shadow-glow">
              <ClipboardPlus className="size-4" aria-hidden /> Nueva OT
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Link href="/admin/ordenes">
          <StatTile label="En producción" value={open.length} tone="glow" icon={<Layers />} hint={`${prod.ranking.reduce((s, r) => s + r.remainingHours, 0).toFixed(0)} h pendientes`} />
        </Link>
        <Link href="/admin/ordenes?vista=entregar">
          <StatTile label="Entregas hoy" value={dueToday.length} tone={dueToday.length ? "pending" : "neutral"} icon={<CalendarCheck2 />} hint={`${ready.length} listas para entregar`} />
        </Link>
        <Link href="/admin/ordenes?vista=vencidas">
          <StatTile label="Vencidas" value={late.length} tone={late.length ? "blocked" : "done"} icon={<AlertTriangle />} hint={late.length ? "Sin entregar a tiempo" : "Todo a tiempo"} />
        </Link>
        <Link href="/admin/ordenes?vista=facturar">
          <StatTile label="Facturar" value={toInvoice.length} tone={toInvoice.length ? "blocked" : "neutral"} icon={<Receipt />} hint="Servicios cerrados" />
        </Link>
        <Link href="/admin/tareas?estado=bloqueada">
          <StatTile label="Bloqueos" value={blocked.length} tone={blocked.length ? "blocked" : "neutral"} icon={<Wrench />} hint="Tareas detenidas" />
        </Link>
        <Link href="/admin/solicitudes">
          <StatTile label="Pedidos" value={pendingRequests.length} tone={pendingRequests.some((r) => r.urgent) ? "blocked" : pendingRequests.length ? "pending" : "neutral"} icon={<PackageOpen />} hint="Material por atender" />
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <PriorityPanel ranking={prod.ranking} next={prod.next} hrefFor={(id) => `/admin/ordenes?o=${id}`} />
        <section className="hud-panel flex flex-col gap-3 p-5" aria-labelledby="alertas-title">
          <h2 id="alertas-title" className="font-display text-lg font-semibold text-ink">
            Alertas
          </h2>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-muted">Sin alertas. Todo en orden.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.alerts.map((a) => {
                const Icon = a.level === "critical" ? AlertOctagon : a.level === "warning" ? AlertTriangle : Info;
                return (
                  <li key={a.id}>
                    <Link
                      href={a.link ?? "#"}
                      className={cn(
                        "flex gap-3 rounded-xl border p-3 transition-colors hover:bg-white/5",
                        a.level === "critical" ? "border-blocked/40" : a.level === "warning" ? "border-pending/40" : "border-line",
                      )}
                    >
                      <Icon className={cn("mt-0.5 size-5 shrink-0", a.level === "critical" ? "text-blocked" : a.level === "warning" ? "text-pending" : "text-glow")} aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{a.title}</span>
                        <span className="block text-sm text-muted">{a.body}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="maquinas-title">
        <SectionTitle
          action={
            <Link href="/admin/cola" className="inline-flex items-center gap-1 text-sm font-semibold text-glow hover:underline">
              Ver cola <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        >
          <span id="maquinas-title">Máquinas · próximas 2 semanas</span>
        </SectionTitle>
        <OccupancyList items={prod.occupancy} />
      </section>

      <section aria-labelledby="puestos-title">
        <SectionTitle
          action={
            <Link href="/admin/equipo" className="inline-flex items-center gap-1 text-sm font-semibold text-glow hover:underline">
              Equipo <ArrowRight className="size-4" aria-hidden />
            </Link>
          }
        >
          <span id="puestos-title">Puestos</span>
        </SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {data.positions.map((p) => {
            const vacant = !p.holder;
            return (
              <li key={p.id}>
                <Link href={`/admin/equipo?puesto=${p.id}`} className="hud-panel flex flex-col gap-1 p-4 transition-colors hover:border-glow/50">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink">{p.title}</span>
                    <Chip tone={vacant ? "vacant" : p.status === "por_vencer" ? "pending" : "done"}>{CONTRACT_STATUS_LABEL[p.status]}</Chip>
                  </span>
                  <span className="truncate text-sm text-muted">{p.holder?.name ?? "Sin titular"}</span>
                  <span className="text-xs text-faint">{p.openTasks === 0 ? "Sin tareas abiertas" : `${p.openTasks} tareas abiertas`}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
