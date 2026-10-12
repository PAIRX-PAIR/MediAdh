"use client";

import { ArrowRight, Ban, ChevronDown, Crosshair } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/components/ui/primitives";
import { formatDate } from "@/lib/domain/labels";
import type { PriorityItem } from "@/lib/domain/planning";

/** "Sigue con OT-xxxx" + the explainable ranking (every point has a reason). */
export function PriorityPanel({ ranking, next, hrefFor, limit = 6 }: { ranking: PriorityItem[]; next: PriorityItem | null; hrefFor: (orderId: string) => string; limit?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  if (ranking.length === 0) {
    return (
      <section className="hud-panel p-5">
        <p className="hud-label mb-1">Prioridades</p>
        <p className="text-ink-soft">No hay órdenes en producción. Cuando registres una, aquí verás con cuál seguir y por qué.</p>
      </section>
    );
  }
  const max = Math.max(1, ...ranking.map((r) => r.score));
  return (
    <section className="hud-panel hud-corners flex flex-col gap-4 p-5" aria-labelledby="sigue-title">
      {next && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-glow/50 bg-navy-700/60 text-glow shadow-glow animate-pulse-glow" aria-hidden>
            <Crosshair className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="hud-label text-glow-soft">Sigue con</p>
            <h2 id="sigue-title" className="font-display text-2xl font-bold text-ink">
              <span className="font-mono text-glow">{next.folio}</span> · {next.title}
            </h2>
            <p className="text-sm text-muted">
              {next.clientName}
              {next.dueDate ? ` · entrega ${formatDate(next.dueDate, { weekday: "short", day: "numeric", month: "short" })}` : ""} · {next.remainingHours} h pendientes
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {next.reasons
                .filter((r) => r.points !== 0)
                .map((r) => (
                  <li key={r.label} className={cn("rounded-full border px-2.5 py-0.5 text-xs", r.points < 0 ? "border-blocked/40 text-[#ffb3b8]" : "border-glow/30 text-ink-soft")}>
                    {r.label} <span className="tabular text-faint">{r.points > 0 ? `+${r.points}` : r.points}</span>
                  </li>
                ))}
            </ul>
          </div>
          <Link href={hrefFor(next.orderId)} className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-xl border border-glow/50 bg-navy-700/60 px-4 font-display text-sm font-semibold text-ink hover:border-glow">
            Ver OT <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
      <div>
        <p className="hud-label mb-2">Orden recomendado</p>
        <ol className="flex flex-col gap-1">
          {ranking.slice(0, limit).map((r, i) => {
            const expanded = open === r.orderId;
            return (
              <li key={r.orderId}>
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? null : r.orderId)}
                  className="grid w-full grid-cols-[1.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <span className="tabular font-mono text-sm text-faint">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-ink">{r.folio}</span>
                      <span className="truncate text-sm text-ink-soft">{r.title}</span>
                      {!r.actionable && <Ban className="size-3.5 shrink-0 text-blocked" aria-label="Bloqueada" />}
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--viz-track)]" aria-hidden>
                      <span className="block h-full rounded-full bg-[var(--viz-1)]" style={{ width: `${Math.max(4, (Math.max(0, r.score) / max) * 100)}%` }} />
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <span className="tabular">{r.score} pts</span>
                    <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
                  </span>
                </button>
                {expanded && (
                  <div className="mb-2 ml-9 rounded-lg border border-line bg-night/60 p-3 text-sm">
                    <p className="mb-1 font-semibold text-ink">Por qué está en el puesto {i + 1}</p>
                    <ul className="flex flex-col gap-0.5 text-ink-soft">
                      {r.reasons.map((reason) => (
                        <li key={reason.label} className="flex justify-between gap-3">
                          <span>{reason.label}</span>
                          <span className="tabular text-faint">{reason.points > 0 ? `+${reason.points}` : reason.points}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href={hrefFor(r.orderId)} className="mt-2 inline-block text-xs font-semibold text-glow hover:underline">
                      Abrir {r.folio}
                    </Link>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
