"use client";

import { AlertOctagon, CheckCircle2, Minus, PackagePlus, Play, Plus, Send, Square, SquareCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { AttachmentGallery } from "@/components/ui/attachments";
import { ChangeLog, KeyValues, NumberInput } from "@/components/ui/kit";
import { Modal } from "@/components/ui/overlay";
import { Button, Chip, Field, Input, Textarea, cn } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { DIFFICULTY_LABEL, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, TASK_STATUS_TONE, formatDate, timeAgo } from "@/lib/domain/labels";
import type { Task } from "@/lib/domain/schema";

const BLOCK_REASONS = ["Falta material", "Falta herramienta o inserto", "Máquina en falla", "Falta plano o información", "Esperando otro proceso"];

/** Everything a worker does on one task, with big buttons for gloves and sunlight. */
export function TaskDetailModal({ task, onClose, adminActions }: { task: Task; onClose: () => void; adminActions?: ReactNode }) {
  const { data } = useSync();
  const { run, busy } = useAction();
  const [sheet, setSheet] = useState<null | "block" | "finish">(null);
  const [note, setNote] = useState("");
  const brief = data.production.briefs?.find((b) => b.id === task.orderId) ?? data.production.orders?.find((o) => o.id === task.orderId);
  const drawings = brief ? data.production.attachments.filter((a) => brief.drawingIds.includes(a.id)) : [];
  const photos = brief
    ? data.production.attachments.filter((a) => ("photoIds" in brief ? brief.photoIds : []).includes(a.id) || ("intakePhotoIds" in brief ? brief.intakePhotoIds : []).includes(a.id))
    : [];
  const update = (key: string, patch: Parameters<typeof api.tasks.update>[1], success?: string) => run(key, () => api.tasks.update(task.id, patch), success);
  const canEditCount = task.status !== "completada" && task.quantity !== null;
  const position = data.positions.find((p) => p.id === task.positionId);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={task.title}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono font-semibold text-glow">{brief?.folio ?? task.folio}</span>
          <Chip tone={TASK_STATUS_TONE[task.status]} dot>
            {TASK_STATUS_LABEL[task.status]}
          </Chip>
          {task.priority !== "normal" && <Chip tone={task.priority === "urgente" ? "urgent" : task.priority === "alta" ? "pending" : "neutral"}>{TASK_PRIORITY_LABEL[task.priority]}</Chip>}
        </span>
      }
    >
      {task.priority === "urgente" && <div className="hazard-stripe -mx-5 -mt-4 mb-4 h-2" aria-hidden />}
      <div className="flex flex-col gap-5">
        {adminActions && <div className="flex flex-wrap gap-2 border-b border-line pb-4">{adminActions}</div>}
        {/* Primary actions: one obvious next step. */}
        <div className="grid grid-cols-2 gap-2">
          {task.status === "pendiente" && (
            <Button size="xl" className="col-span-2" loading={busy === "start"} icon={<Play className="size-6" />} onClick={() => void update("start", { status: "en_proceso" }, "¡A trabajar!")}>
              Empezar
            </Button>
          )}
          {(task.status === "en_proceso" || task.status === "bloqueada") && (
            <Button size="xl" variant="success" className="col-span-2" icon={<CheckCircle2 className="size-6" />} onClick={() => setSheet("finish")}>
              Terminé
            </Button>
          )}
          {task.status === "bloqueada" && (
            <Button size="lg" variant="secondary" loading={busy === "resume"} icon={<Play className="size-5" />} onClick={() => void update("resume", { status: "en_proceso" }, "Desbloqueada")}>
              Ya puedo seguir
            </Button>
          )}
          {task.status !== "bloqueada" && task.status !== "completada" && (
            <Button size="lg" variant="secondary" icon={<AlertOctagon className="size-5 text-blocked" />} onClick={() => setSheet("block")}>
              Estoy bloqueado
            </Button>
          )}
          {task.status !== "completada" && (
            <Link
              href={`/solicitudes?nueva=1&tarea=${task.id}`}
              className="inline-flex h-13 items-center justify-center gap-2.5 rounded-xl border border-line-strong bg-panel-2/80 px-5 font-display font-semibold text-ink transition-colors hover:border-glow/60"
            >
              <PackagePlus className="size-5" aria-hidden /> Pedir material
            </Link>
          )}
          {task.status === "completada" && (
            <Button size="lg" variant="ghost" className="col-span-2" loading={busy === "reopen"} icon={<Undo2 className="size-5" />} onClick={() => void update("reopen", { status: "en_proceso" }, "Tarea reabierta")}>
              Reabrir (me equivoqué)
            </Button>
          )}
        </div>

        {task.status === "bloqueada" && task.blockedReason && (
          <p className="flex items-center gap-2 rounded-xl border border-blocked/40 bg-blocked/10 p-3 text-sm font-semibold text-[#ffb3b8]">
            <AlertOctagon className="size-5 shrink-0" aria-hidden /> {task.blockedReason}
          </p>
        )}

        {task.quantity !== null && (
          <section className="rounded-xl border border-line bg-night/50 p-4">
            <p className="hud-label mb-3">Piezas terminadas</p>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                aria-label="Una pieza menos"
                disabled={!canEditCount || task.quantityDone <= 0 || busy !== null}
                onClick={() => void update("minus", { quantityDone: task.quantityDone - 1 })}
                className="grid size-16 place-items-center rounded-2xl border border-line-strong bg-panel-2 text-ink transition-transform active:scale-95 disabled:opacity-40"
              >
                <Minus className="size-7" />
              </button>
              <p className="tabular text-center font-display text-5xl font-bold text-ink" aria-live="polite">
                {task.quantityDone}
                <span className="text-2xl text-muted">/{task.quantity}</span>
              </p>
              <button
                type="button"
                aria-label="Una pieza más"
                disabled={!canEditCount || task.quantityDone >= task.quantity || busy !== null}
                onClick={() => void update("plus", { quantityDone: task.quantityDone + 1, ...(task.status === "pendiente" ? { status: "en_proceso" as const } : {}) })}
                className="grid size-16 place-items-center rounded-2xl border border-done/50 bg-done/15 text-done transition-transform active:scale-95 disabled:opacity-40"
              >
                <Plus className="size-7" />
              </button>
            </div>
          </section>
        )}

        {task.checklist.length > 0 && (
          <section>
            <p className="hud-label mb-2">Pasos</p>
            <ul className="flex flex-col gap-1.5">
              {task.checklist.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={c.done}
                    disabled={task.status === "completada" || busy !== null}
                    onClick={() => void update(`chk-${c.id}`, { checklistToggle: { id: c.id, done: !c.done } })}
                    className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors", c.done ? "border-done/40 bg-done/10" : "border-line bg-night/50 hover:border-glow/50")}
                  >
                    {c.done ? <SquareCheck className="size-6 shrink-0 text-done" aria-hidden /> : <Square className="size-6 shrink-0 text-muted" aria-hidden />}
                    <span className={cn("text-[15px]", c.done ? "text-ink-soft line-through decoration-done/60" : "text-ink")}>{c.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {task.description && (
          <section>
            <p className="hud-label mb-1">Indicaciones</p>
            <p className="whitespace-pre-wrap text-[15px] text-ink">{task.description}</p>
          </section>
        )}

        {(drawings.length > 0 || photos.length > 0) && (
          <section className="flex flex-col gap-3">
            {drawings.length > 0 && (
              <div>
                <p className="hud-label mb-2">Planos</p>
                <AttachmentGallery items={drawings} />
              </div>
            )}
            {photos.length > 0 && (
              <div>
                <p className="hud-label mb-2">Fotos</p>
                <AttachmentGallery items={photos} />
              </div>
            )}
          </section>
        )}

        <KeyValues
          items={[
            ["Entrega", brief?.due ? `${formatDate(brief.due.date, { weekday: "long", day: "numeric", month: "long" })} · ${brief.due.time}` : task.dueDate ? formatDate(task.dueDate, { weekday: "long", day: "numeric", month: "long" }) : "Sin fecha"],
            ["Máquina", task.piece ?? "—"],
            ["Horas estimadas", task.plannedHours !== null ? `${task.plannedHours} h` : "—"],
            ["Horas reportadas", task.actualHours !== null ? `${task.actualHours} h` : "—"],
            ["Dificultad", brief ? DIFFICULTY_LABEL[brief.difficulty] : "—"],
            ["Puesto", position?.title ?? "Sin asignar"],
          ]}
        />

        <section>
          <p className="hud-label mb-2">Notas</p>
          {task.notes.length > 0 && (
            <ul className="mb-3 flex flex-col gap-2">
              {task.notes.map((n) => (
                <li key={n.id} className="rounded-xl border border-line bg-night/50 p-3 text-sm">
                  <p className="text-ink">{n.text}</p>
                  <p className="mt-1 text-xs text-faint">
                    {n.authorName} · {timeAgo(n.at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!note.trim()) return;
              const ok = await run("note", () => api.tasks.addNote(task.id, note.trim()), "Nota enviada");
              if (ok) setNote("");
            }}
          >
            <Input aria-label="Escribir nota" placeholder="Escribe una novedad para el coordinador" enterKeyHint="send" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button type="submit" aria-label="Enviar nota" loading={busy === "note"} icon={<Send className="size-5" />} />
          </form>
        </section>

        {task.history.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-ink-soft">Historial de cambios</summary>
            <div className="mt-3">
              <ChangeLog entries={task.history} />
            </div>
          </details>
        )}
      </div>

      {sheet === "block" && <BlockSheet onClose={() => setSheet(null)} onConfirm={(reason) => update("block", { status: "bloqueada", blockedReason: reason }, "Aviso enviado al coordinador").then((ok) => ok && setSheet(null))} />}
      {sheet === "finish" && (
        <FinishSheet
          task={task}
          onClose={() => setSheet(null)}
          onConfirm={(hours) =>
            update("finish", { status: "completada", actualHours: hours }, "¡Tarea terminada!").then((ok) => {
              if (ok) {
                setSheet(null);
                onClose();
              }
            })
          }
        />
      )}
    </Modal>
  );
}

function BlockSheet({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title="¿Qué te detiene?"
      description="El coordinador recibe un aviso urgente."
      size="sm"
      footer={
        <Button variant="danger" size="lg" block disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
          Avisar que estoy bloqueado
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        {BLOCK_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={reason === r}
            onClick={() => setReason(r)}
            className={cn("min-h-12 rounded-xl border px-3 text-left font-semibold transition-colors", reason === r ? "border-blocked bg-blocked/15 text-ink" : "border-line bg-night/50 text-ink-soft hover:border-glow/50")}
          >
            {r}
          </button>
        ))}
        <Field label="O escríbelo">{(id) => <Textarea id={id} rows={2} value={BLOCK_REASONS.includes(reason) ? "" : reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

function FinishSheet({ task, onClose, onConfirm }: { task: Task; onClose: () => void; onConfirm: (hours: number | null) => void }) {
  const [hours, setHours] = useState<number | null>(task.actualHours ?? task.plannedHours);
  return (
    <Modal
      open
      onClose={onClose}
      title="¿Cuántas horas te tomó?"
      description="Con esto se mide el uso real de cada máquina. Si no sabes exacto, aproxima."
      size="sm"
      footer={
        <Button variant="success" size="lg" block icon={<CheckCircle2 className="size-5" />} onClick={() => onConfirm(hours)}>
          Terminar tarea
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <NumberInput value={hours} onChange={setHours} suffix="horas" max={2000} />
        <div className="flex flex-wrap gap-2">
          {[0.5, 1, 2, 4, 8].map((h) => (
            <button key={h} type="button" onClick={() => setHours(h)} className={cn("h-11 min-w-14 rounded-xl border px-3 font-semibold", hours === h ? "border-glow bg-navy-700/60 text-ink" : "border-line text-ink-soft")}>
              {String(h).replace(".", ",")} h
            </button>
          ))}
        </div>
        {task.plannedHours !== null && <p className="text-xs text-muted">Estimado por el coordinador: {task.plannedHours} h</p>}
      </div>
    </Modal>
  );
}
