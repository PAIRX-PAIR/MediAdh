"use client";

import { CircleCheck, CircleDashed, CircleAlert, OctagonAlert, Wrench } from "lucide-react";
import { cn } from "@/components/ui/primitives";
import { formatDate, PROCESS_LABEL } from "@/lib/domain/labels";
import type { MachineOccupancy, OccupancyLevel } from "@/lib/domain/planning";

export const LEVEL: Record<OccupancyLevel, { label: string; icon: typeof CircleCheck; text: string; bar: string }> = {
  libre: { label: "Disponible", icon: CircleCheck, text: "text-done", bar: "bg-done" },
  media: { label: "Ocupada", icon: CircleAlert, text: "text-pending", bar: "bg-pending" },
  alta: { label: "Saturada", icon: OctagonAlert, text: "text-blocked", bar: "bg-blocked" },
  mantenimiento: { label: "Mantenimiento", icon: Wrench, text: "text-vacant", bar: "bg-vacant" },
  inactiva: { label: "Próximamente", icon: CircleDashed, text: "text-faint", bar: "bg-line-strong" },
};

/** Traffic light per machine: icon + label + % (never color alone) and nearest free date. */
export function OccupancyList({ items, compact = false }: { items: MachineOccupancy[]; compact?: boolean }) {
  return (
    <ul className={cn("grid gap-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>
      {items.map((m) => {
        const l = LEVEL[m.level];
        const Icon = l.icon;
        const pct = Math.round(m.ratio * 100);
        return (
          <li key={m.machineId} className={cn("rounded-xl border border-line bg-night/50 p-3", m.level === "inactiva" && "opacity-60")}>
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{m.name}</span>
                <span className="block text-xs text-muted">{PROCESS_LABEL[m.process]}</span>
              </span>
              <span className={cn("flex shrink-0 items-center gap-1.5 text-xs font-semibold", l.text)}>
                <Icon className="size-4" aria-hidden /> {l.label}
                {m.level !== "inactiva" && m.level !== "mantenimiento" && <span className="tabular text-ink-soft">{pct}%</span>}
              </span>
            </div>
            {m.level !== "inactiva" && (
              <>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--viz-track)]" aria-hidden>
                  <div className={cn("h-full rounded-full", l.bar)} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {m.queuedHours > 0 ? `${m.queuedHours} h en cola · ` : "Sin cola · "}
                  libre {m.freeDate ? formatDate(m.freeDate, { weekday: "short", day: "numeric", month: "short" }) : "—"}
                </p>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
