"use client";

import { AlertTriangle, Ban, Clock, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/shell/brand-mark";
import { Chip, Spinner, cn } from "@/components/ui/primitives";
import { DIFFICULTY_LABEL, MACHINE_STATE_LABEL, PROCESS_LABEL, formatDate } from "@/lib/domain/labels";
import type { Board, BoardGroup, BoardJob } from "@/lib/server/services/board";

const REFRESH_MS = 60_000;

function dueLabel(job: BoardJob) {
  if (!job.due) return "Sin fecha";
  return `${formatDate(job.due.date, { weekday: "short", day: "numeric", month: "short" })} · ${job.due.time}`;
}

/** The floor's view: each operator, their machines and the jobs in the order they should run. */
export function BoardScreen({ token }: { token: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [operator, setOperator] = useState<string>("todos");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    fetch(`/api/tablero/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 404) throw new Error("Este enlace del tablero no existe o fue cambiado. Pide el enlace nuevo al coordinador.");
        if (!res.ok) throw new Error("No se pudo actualizar el tablero. Se reintenta en un minuto.");
        return (await res.json()) as Board;
      })
      .then((b) => {
        setBoard(b);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, [token, tick]);

  if (!board) {
    return (
      <main className="hud-grid-bg flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
        <BrandMark className="size-12" />
        {error ? <p className="max-w-md text-ink-soft">{error}</p> : <Spinner label="Cargando el tablero" />}
      </main>
    );
  }

  const groups = operator === "todos" ? board.groups : board.groups.filter((g) => g.id === operator);
  return (
    <main id="contenido" className="hud-grid-bg min-h-dvh px-4 py-5 sm:px-6">
      <header className="mx-auto mb-5 flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <BrandMark className="size-10 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold text-ink sm:text-2xl">Tablero del taller</h1>
            <p className="text-sm text-muted">
              {formatDate(board.today, { weekday: "long", day: "numeric", month: "long" })}
              {board.shiftsToday.length ? ` · turnos ${board.shiftsToday.map((s) => `${s.start}–${s.end}`).join(" y ")}` : " · hoy no se trabaja"}
            </p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          Operario
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="h-11 rounded-xl border border-line bg-night/80 px-3 text-ink focus:border-glow focus:outline-none"
          >
            <option value="todos">Todos</option>
            {board.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.operator ?? g.title}
              </option>
            ))}
          </select>
        </label>
      </header>
      {error && (
        <p className="mx-auto mb-4 flex max-w-7xl items-center gap-2 rounded-xl border border-pending/40 bg-pending/10 p-3 text-sm text-pending">
          <AlertTriangle className="size-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {groups.map((g) => (
          <OperatorSection key={g.id} group={g} />
        ))}
        {groups.length === 0 && <p className="text-center text-ink-soft">No hay máquinas asignadas.</p>}
      </div>
      <p className="mx-auto mt-6 max-w-7xl text-xs text-muted">
        Solo lectura · se actualiza cada minuto · última actualización {new Date(board.generatedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
      </p>
    </main>
  );
}

function OperatorSection({ group }: { group: BoardGroup }) {
  return (
    <section aria-labelledby={`op-${group.id}`}>
      <h2 id={`op-${group.id}`} className="mb-3 font-display text-lg font-semibold text-ink">
        {group.operator ?? "Sin operario"} <span className="text-sm font-normal text-muted">· {group.title}</span>
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {group.machines.map((m) => (
          <article key={m.id} className="hud-panel flex flex-col gap-3 p-4">
            <header className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-display text-lg font-semibold text-ink">{m.name}</p>
                <p className="text-xs text-muted">{PROCESS_LABEL[m.process]}</p>
              </div>
              {m.state !== "activa" && <Chip tone="pending">{MACHINE_STATE_LABEL[m.state]}</Chip>}
            </header>
            {m.stopReason && (
              <p className="flex items-center gap-2 text-sm text-pending">
                <Wrench className="size-4 shrink-0" aria-hidden /> {m.stopReason}
              </p>
            )}
            {m.jobs.length === 0 ? (
              <p className="text-sm text-muted">Sin trabajos en cola.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {m.jobs.map((job, i) => (
                  <li
                    key={`${job.folio}-${i}`}
                    className={cn(
                      "rounded-xl border p-3",
                      i === 0 ? "border-glow/60 bg-navy-700/40" : "border-line bg-night/40",
                      job.urgent && "border-blocked/60",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tabular font-mono text-sm font-semibold text-glow">{job.folio}</span>
                      {i === 0 && <Chip tone="glow">{job.inProgress ? "En proceso" : "Sigue"}</Chip>}
                      {job.urgent && <Chip tone="urgent">Urgente</Chip>}
                      {job.difficulty > 1 && <Chip tone="pending">{DIFFICULTY_LABEL[job.difficulty]}</Chip>}
                      {job.late && <Chip tone="blocked">Atrasada</Chip>}
                    </div>
                    <p className="mt-1 font-semibold text-ink">
                      {job.title} <span className="font-normal text-ink-soft">× {job.quantity}</span>
                    </p>
                    {job.detail && <p className="text-sm text-ink-soft">{job.detail}</p>}
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span className="tabular inline-flex items-center gap-1">
                        <Clock className="size-3.5" aria-hidden /> {job.hours.toLocaleString("es-CO")} h
                      </span>
                      <span>Entrega: {dueLabel(job)}</span>
                    </p>
                    {job.blockedReason && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-blocked">
                        <Ban className="size-4 shrink-0" aria-hidden /> {job.blockedReason}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
