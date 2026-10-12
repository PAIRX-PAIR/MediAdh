"use client";

import { Flame, PackagePlus, Send, Truck, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PageHeader } from "@/components/ui/kit";
import { Modal } from "@/components/ui/overlay";
import { Button, Chip, EmptyState, Field, Input, Select, Textarea, cn } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL, timeAgo } from "@/lib/domain/labels";
import { REQUEST_TYPES, type RequestStatus, type RequestType } from "@/lib/domain/schema";

const STATUS_TONE: Record<RequestStatus, "pending" | "progress" | "done" | "blocked" | "vacant"> = {
  pendiente: "pending",
  en_camino: "progress",
  entregada: "done",
  rechazada: "blocked",
  cancelada: "vacant",
};

/** Ask the coordinator for material in three taps: what kind, what, how urgent. */
export function MyRequests() {
  const { data } = useSync();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { run, busy } = useAction();
  const mine = data.requests.filter((r) => r.userId === data.me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const creating = params.get("nueva") === "1";
  const highlight = params.get("s");
  const setNew = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set("nueva", "1");
    else {
      next.delete("nueva");
      next.delete("tarea");
    }
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Pedidos"
        title="Pedir material"
        description="Material, herramienta, insumos o mantenimiento. El coordinador recibe el aviso al instante."
        actions={
          <Button size="lg" icon={<PackagePlus className="size-5" />} onClick={() => setNew(true)}>
            Nuevo pedido
          </Button>
        }
      />
      {mine.length === 0 ? (
        <EmptyState icon={<PackagePlus />} title="No has pedido nada todavía" action={<Button onClick={() => setNew(true)}>Hacer un pedido</Button>} />
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((r) => (
            <li key={r.id} className={cn("hud-panel flex flex-col gap-2 p-4", highlight === r.id && "ring-2 ring-glow")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-glow">{r.folio}</span>
                <Chip tone={STATUS_TONE[r.status]} dot>
                  {REQUEST_STATUS_LABEL[r.status]}
                </Chip>
                {r.urgent && (
                  <Chip tone="urgent">
                    <Flame className="size-3" aria-hidden /> Urgente
                  </Chip>
                )}
                <span className="ml-auto text-xs text-faint">{timeAgo(r.createdAt)}</span>
              </div>
              <p className="font-display text-lg font-semibold text-ink">
                {REQUEST_TYPE_LABEL[r.type]}: {r.item}
              </p>
              {(r.quantity || r.note) && <p className="text-sm text-muted">{[r.quantity, r.note].filter(Boolean).join(" · ")}</p>}
              {r.response && (
                <p className="flex items-start gap-2 rounded-lg border border-glow/30 bg-glow/5 p-2.5 text-sm text-glow-soft">
                  <Truck className="mt-0.5 size-4 shrink-0" aria-hidden /> {r.response}
                </p>
              )}
              {r.status === "pendiente" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="self-start"
                  loading={busy === r.id}
                  icon={<X className="size-4" />}
                  onClick={() => void run(r.id, () => api.requests.update(r.id, "cancelada"), "Pedido cancelado")}
                >
                  Cancelar pedido
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {creating && <NewRequest taskId={params.get("tarea")} onClose={() => setNew(false)} />}
    </div>
  );
}

function NewRequest({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { data } = useSync();
  const [type, setType] = useState<RequestType>("material");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [note, setNote] = useState("");
  const [task, setTask] = useState(taskId ?? "");
  const { run, busy } = useAction();
  const myTasks = data.tasks.filter((t) => t.positionId === data.me.positionId && t.status !== "completada");

  return (
    <Modal
      open
      onClose={onClose}
      title="Nuevo pedido"
      size="md"
      footer={
        <Button
          size="lg"
          block
          loading={busy === "send"}
          disabled={!item.trim()}
          icon={<Send className="size-5" />}
          onClick={async () => {
            const ok = await run(
              "send",
              () => api.requests.create({ type, item: item.trim(), quantity: quantity.trim() || null, urgent, note: note.trim() || null, taskId: task || null }),
              "Pedido enviado al coordinador",
            );
            if (ok) onClose();
          }}
        >
          Enviar pedido
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-soft">¿Qué necesitas?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {REQUEST_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => setType(t)}
                className={cn("min-h-12 rounded-xl border px-3 font-semibold transition-colors", type === t ? "border-glow bg-navy-700/60 text-ink shadow-glow" : "border-line bg-night/50 text-ink-soft")}
              >
                {REQUEST_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Qué exactamente">{(id) => <Input id={id} placeholder="Ej: Inserto CNMG 120408" value={item} onChange={(e) => setItem(e.target.value)} />}</Field>
        <Field label="Cantidad (opcional)">{(id) => <Input id={id} placeholder="Ej: 10 unidades" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
        <button
          type="button"
          role="switch"
          aria-checked={urgent}
          onClick={() => setUrgent((u) => !u)}
          className={cn("flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 text-left transition-colors", urgent ? "border-urgent bg-urgent/15" : "border-line bg-night/50")}
        >
          <span className="flex items-center gap-2 font-semibold text-ink">
            <Flame className={cn("size-5", urgent ? "text-urgent" : "text-muted")} aria-hidden /> Es urgente (me tiene detenido)
          </span>
          <span className={cn("h-7 w-12 rounded-full p-1 transition-colors", urgent ? "bg-urgent" : "bg-line-strong")} aria-hidden>
            <span className={cn("block size-5 rounded-full bg-white transition-transform", urgent && "translate-x-5")} />
          </span>
        </button>
        {myTasks.length > 0 && (
          <Field label="Para qué tarea (opcional)">
            {(id) => (
              <Select id={id} value={task} onChange={(e) => setTask(e.target.value)}>
                <option value="">General</option>
                {myTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.folio} · {t.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="Nota (opcional)">{(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}
