"use client";

import { useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDate } from "@/lib/domain/labels";
import type { OrderView } from "@/lib/domain/views";

const day = (d: string) => formatDate(d, { weekday: "short", day: "numeric", month: "short" });

/**
 * Fecha de entrega de la orden. La comprometida y la propuesta van por separado: una propuesta pendiente
 * nunca se muestra como fecha confirmada. Producción propone; gerencia aprueba, rechaza o pide ajustes.
 */
export function DueCard({ order }: { order: OrderView }) {
  const { data } = useSync();
  const { run, isBusy } = useAction();
  const owner = data.me.scope === "total";
  const p = order.dueProposal;
  const open = p?.status === "pendiente_aprobacion" || p?.status === "reprogramacion_pendiente";
  const [date, setDate] = useState("");
  const [time, setTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const closed = ["cancelada", "cerrada", "entregada"].includes(order.status);

  const propose = async () => {
    const ok = await run("propose", () => api.orders.proposeDue(order.id, { date, time, reason, affectedWorkItemIds: [] }), "Propuesta enviada a gerencia");
    if (ok) {
      setDate("");
      setReason("");
    }
  };
  const decide = (decision: "aprobar" | "rechazar" | "ajuste") =>
    run(`decide-${decision}`, () => api.orders.decideDue(order.id, { decision, note }), decision === "aprobar" ? "Fecha aprobada" : "Decisión guardada");

  return (
    <section aria-labelledby="fecha-title" className="mb-4 rounded-xl border border-line bg-night/50 p-4">
      <p id="fecha-title" className="hud-label mb-2">Fecha de entrega</p>
      <p className="text-sm text-ink">
        {order.due ? (
          <>
            <strong>Comprometida:</strong> {day(order.due.date)} · {order.due.time}
          </>
        ) : (
          <strong>Sin fecha confirmada.</strong>
        )}
      </p>

      {open && p && (
        <div className="mt-3 rounded-lg border border-pending/40 bg-pending/10 p-3 text-sm">
          <p className="font-semibold text-ink">
            {p.status === "reprogramacion_pendiente" ? "Reprogramación pendiente" : "Propuesta pendiente"}: {day(p.date)} · {p.time}
          </p>
          {p.status === "reprogramacion_pendiente" && p.previous && <p className="text-ink-soft">Cambia la fecha de {day(p.previous.date)} · {p.previous.time}. Causa: {p.reason}</p>}
          {p.conflict && <p className="font-semibold text-blocked">Sin capacidad para esa fecha: pide un nuevo cálculo antes de aprobar.</p>}
          <p className="mt-1 text-xs text-muted">No es una fecha confirmada: el cliente no la conoce hasta que gerencia la apruebe.</p>
          {owner ? (
            <div className="mt-3 flex flex-col gap-2">
              <Textarea aria-label="Nota de la decisión" rows={2} placeholder="Nota (obligatoria para pedir ajustes)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void decide("aprobar")} loading={isBusy("decide-aprobar")}>Aprobar fecha</Button>
                <Button variant="secondary" onClick={() => void decide("ajuste")} loading={isBusy("decide-ajuste")} disabled={!note.trim()}>Pedir ajustes</Button>
                <Button variant="ghost" onClick={() => void decide("rechazar")} loading={isBusy("decide-rechazar")}>Rechazar</Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-ink-soft">Esperando a gerencia.</p>
          )}
        </div>
      )}

      {!open && p && p.decisionNote && (
        <p className="mt-2 text-xs text-muted">Última decisión de gerencia: {p.decisionNote}</p>
      )}

      {!owner && !open && !closed && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label={order.due ? "Nueva fecha propuesta" : "Fecha propuesta"}>
            {(id) => <Input id={id} type="date" min={data.today} value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Hora">{(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
          {order.due && (
            <Field label="Causa del cambio">{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: falta un insumo" />}</Field>
          )}
          <div className="sm:col-span-3">
            <Button onClick={() => void propose()} loading={isBusy("propose")} disabled={!date || (Boolean(order.due) && !reason.trim())}>
              Proponer a gerencia
            </Button>
          </div>
        </div>
      )}

      {owner && !open && !closed && <p className="mt-2 text-xs text-muted">Para cambiar la fecha directamente, usa Editar. Las propuestas de producción llegan aquí para aprobarlas.</p>}
    </section>
  );
}
