"use client";

import { CheckCircle2, ClipboardCheck, Square, SquareCheck } from "lucide-react";
import { useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PageHeader } from "@/components/ui/kit";
import { Button, EmptyState, Field, Panel, Textarea, cn } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { TASK_STATUS_LABEL, formatDate, formatDateTime } from "@/lib/domain/labels";
import { dateInZone } from "@/lib/domain/time";

/** End-of-day report: mark what got finished, report issues, send. Can be sent again to update it. */
export function DayClose() {
  const { data } = useSync();
  const { run, busy } = useAction();
  const mine = data.tasks.filter((t) => t.positionId === data.me.positionId);
  const open = mine.filter((t) => t.status !== "completada");
  const doneToday = mine.filter((t) => t.completedAt && dateInZone(new Date(t.completedAt), data.settings.timezone) === data.today);
  const existing = data.closures.find((c) => c.date === data.today && c.userId === data.me.id);
  const [complete, setComplete] = useState<Set<string>>(new Set());
  const [issues, setIssues] = useState(existing?.issues ?? "");
  const [note, setNote] = useState(existing?.note ?? "");

  if (!data.me.positionId) {
    return <EmptyState icon={<ClipboardCheck />} title="El cierre de día es para cuentas con puesto" body="Las cuentas de administración no cierran día." />;
  }

  const toggle = (id: string) =>
    setComplete((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={formatDate(data.today, { weekday: "long", day: "numeric", month: "long" })}
        title="Cerrar mi día"
        description={existing ? `Ya enviaste el cierre (${formatDateTime(existing.updatedAt)}). Puedes actualizarlo.` : "Marca lo que terminaste, cuenta las novedades y envía."}
      />

      {doneToday.length > 0 && (
        <Panel>
          <p className="hud-label mb-2">Terminadas hoy ({doneToday.length})</p>
          <ul className="flex flex-col gap-1.5">
            {doneToday.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm text-ink-soft">
                <CheckCircle2 className="size-4 shrink-0 text-done" aria-hidden /> <span className="font-mono text-xs text-faint">{t.folio}</span> {t.title}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <section>
        <p className="mb-2 text-sm font-medium text-ink-soft">¿Terminaste alguna de estas? Márcala:</p>
        {open.length === 0 ? (
          <p className="text-sm text-muted">No tienes tareas abiertas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {open.map((t) => {
              const on = complete.has(t.id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(t.id)}
                    className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left transition-colors", on ? "border-done/50 bg-done/10" : "border-line bg-night/50")}
                  >
                    {on ? <SquareCheck className="size-6 shrink-0 text-done" aria-hidden /> : <Square className="size-6 shrink-0 text-muted" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{t.title}</span>
                      <span className="block text-xs text-muted">
                        {t.folio} · {TASK_STATUS_LABEL[t.status]}
                        {t.quantity !== null ? ` · ${t.quantityDone}/${t.quantity} piezas` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Field label="Novedades (daños, faltantes, accidentes)" hint="Si escribes algo aquí, el coordinador recibe un aviso urgente.">
        {(id, d) => <Textarea id={id} aria-describedby={d} rows={3} value={issues} onChange={(e) => setIssues(e.target.value)} />}
      </Field>
      <Field label="Comentario del día (opcional)">{(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>

      <Button
        size="xl"
        variant="success"
        block
        loading={busy === "close"}
        icon={<ClipboardCheck className="size-6" />}
        onClick={async () => {
          const ok = await run("close", () => api.closeDay({ note, issues, completeTaskIds: [...complete] }), "Cierre enviado. ¡Buen descanso!");
          if (ok) setComplete(new Set());
        }}
      >
        {existing ? "Actualizar cierre" : "Enviar cierre del día"}
      </Button>
    </div>
  );
}
