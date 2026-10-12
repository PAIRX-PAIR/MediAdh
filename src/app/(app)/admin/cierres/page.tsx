"use client";

import { AlertTriangle, CheckCircle2, CircleDashed, FileClock } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PageHeader } from "@/components/ui/kit";
import { EmptyState, Input, Panel } from "@/components/ui/primitives";
import { TASK_STATUS_LABEL, formatDate, formatDateTime } from "@/lib/domain/labels";

export default function ClosuresPage() {
  return (
    <Suspense>
      <Closures />
    </Suspense>
  );
}

/** Day closures by date: who closed, what they finished, what stays pending and any issues. */
function Closures() {
  const { data } = useSync();
  const params = useSearchParams();
  const [date, setDate] = useState(params.get("d") ?? data.today);
  const closures = data.closures.filter((c) => c.date === date);
  const staffed = data.positions.filter((p) => p.holder && !p.grantsAdmin);
  const missing = date === data.today ? staffed.filter((p) => !closures.some((c) => c.positionId === p.id)) : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Equipo"
        title="Cierres de día"
        description="Cada operario reporta al terminar la jornada. Las novedades llegan como aviso urgente."
        actions={<Input type="date" aria-label="Fecha" max={data.today} value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />}
      />
      {missing.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-night/50 p-3 text-sm text-muted">
          <CircleDashed className="size-4" aria-hidden /> Aún sin cerrar hoy: {missing.map((p) => `${p.title} (${p.holder?.name})`).join(", ")}
        </p>
      )}
      {closures.length === 0 ? (
        <EmptyState icon={<FileClock />} title={`Sin cierres el ${formatDate(date, { weekday: "long", day: "numeric", month: "long" })}`} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {closures.map((c) => (
            <Panel as="article" key={c.id}>
              <header className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-lg font-semibold text-ink">{data.positions.find((p) => p.id === c.positionId)?.title ?? "Puesto"}</p>
                  <p className="text-sm text-muted">
                    {c.userName} · {formatDateTime(c.updatedAt)}
                  </p>
                </div>
                <span className="tabular text-sm text-ink-soft">
                  {c.completed.length} hechas · {c.pending.length} pendientes
                </span>
              </header>
              {c.issues && (
                <p className="mb-2 flex items-start gap-2 rounded-lg border border-blocked/40 bg-blocked/10 p-2.5 text-sm text-[#ffb3b8]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {c.issues}
                </p>
              )}
              {c.note && <p className="mb-2 text-sm text-ink-soft">“{c.note}”</p>}
              <ul className="flex flex-col gap-1 text-sm">
                {c.completed.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-ink-soft">
                    <CheckCircle2 className="size-4 text-done" aria-hidden /> {t.folio} · {t.title}
                  </li>
                ))}
                {c.pending.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-muted">
                    <CircleDashed className="size-4" aria-hidden /> {t.folio} · {t.title} ({TASK_STATUS_LABEL[t.status]})
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
