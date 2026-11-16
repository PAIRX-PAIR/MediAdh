"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { TALLER_SECTIONS } from "@/components/shell/nav";
import { PageHeader } from "@/components/ui/kit";
import { useProduction } from "@/lib/client/use-production";
import { formatDate } from "@/lib/domain/labels";
import { isLate } from "@/lib/domain/lifecycle";

type Summary = { line: string; details: Array<[string, ReactNode]> };

/** Pantalla compacta del Taller: los cuatro accesos con un resumen; el detalle se abre solo si se quiere. */
export function TallerHub() {
  const { data } = useSync();
  const prod = useProduction();

  const open = prod.orders.filter((o) => ["recibida", "en_proceso", "garantia"].includes(o.status));
  const late = prod.orders.filter((o) => ["recibida", "en_proceso", "terminada", "garantia"].includes(o.status) && isLate(o, data.settings.timezone, prod.ctx.now));
  const ready = prod.orders.filter((o) => o.status === "terminada");
  const active = prod.occupancy.filter((o) => o.level !== "inactiva");
  const freeDates = active.map((o) => o.freeDate).filter((d): d is string => Boolean(d)).sort();
  const lateJobs = prod.schedule.jobs.filter((j) => j.late).length;
  const queued = Math.round(active.reduce((s, o) => s + o.queuedHours, 0));
  const saturated = active.filter((o) => o.level === "alta").length;
  const stopped = active.filter((o) => o.level === "mantenimiento").length;
  const blocked = data.tasks.filter((t) => t.status === "bloqueada").length;
  const day = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short" });

  const summaries: Record<(typeof TALLER_SECTIONS)[number]["href"], Summary> = {
    "/admin/ordenes": {
      line: `${open.length} abiertas · ${late.length} vencidas`,
      details: [
        ["Abiertas", open.length],
        ["Listas para entregar", ready.length],
        ["Vencidas", late.length],
      ],
    },
    "/admin/programacion": {
      line: freeDates[0] ? `Primer hueco libre: ${day(freeDates[0])}` : "Sin capacidad libre próxima",
      details: [
        ["Horas en cola", `${queued} h`],
        ["Trabajos que llegarían tarde", lateJobs],
        ["Máquinas con cola", active.filter((o) => o.queuedHours > 0).length],
      ],
    },
    "/admin/maquinas": {
      line: `${active.length - stopped} disponibles · ${saturated} saturadas${stopped ? ` · ${stopped} en mantenimiento` : ""}`,
      details: [
        ["Activas", active.length],
        ["Saturadas", saturated],
        ["En mantenimiento", stopped],
      ],
    },
    "/admin/produccion": {
      line: prod.next ? `Sigue con ${prod.next.folio}` : "Sin órdenes en producción",
      details: [
        ["Sigue con", prod.next ? `${prod.next.folio} · ${prod.next.title}` : "—"],
        ["Horas pendientes", `${Math.round(prod.ranking.reduce((s, r) => s + r.remainingHours, 0))} h`],
        ["Tareas bloqueadas", blocked],
      ],
    },
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Taller" title="Taller" description="Las cuatro áreas del taller. Abre una, o toca «Detalle» para ver más sin salir." />
      <ul className="flex flex-col gap-3">
        {TALLER_SECTIONS.map((s) => {
          const Icon = s.icon;
          const sum = summaries[s.href];
          return (
            <li key={s.href} className="hud-panel overflow-hidden">
              <Link href={s.href} className="flex items-center gap-3 p-4 transition-colors hover:bg-white/5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-glow/40 bg-navy-800/70 text-glow" aria-hidden>
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-bold text-ink">{s.label}</span>
                  <span className="block truncate text-sm text-muted">{sum.line}</span>
                </span>
                <ArrowRight className="size-5 shrink-0 text-muted" aria-hidden />
              </Link>
              <details className="group border-t border-line">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm font-semibold text-ink-soft [&::-webkit-details-marker]:hidden">
                  Detalle
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <dl className="grid gap-1.5 px-4 pb-3 text-sm">
                  {sum.details.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-muted">{label}</dt>
                      <dd className="tabular text-right font-semibold text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
