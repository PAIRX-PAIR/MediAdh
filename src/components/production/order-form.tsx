"use client";

import { Save } from "lucide-react";
import { useMemo, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { MoneyInput, NumberInput, Segmented } from "@/components/ui/kit";
import { Modal } from "@/components/ui/overlay";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { api, type OrderInput } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useProduction } from "@/lib/client/use-production";
import { canCommit } from "@/lib/domain/planning";
import type { Difficulty, Order } from "@/lib/domain/schema";
import { addDays } from "@/lib/domain/time";
import type { OrderView } from "@/lib/domain/views";
import { ClientPicker } from "./client-form";
import { CommitVerdict } from "./commit-verdict";
import { RouteEditor, SuppliesEditor } from "./route-editor";

function fromOrder(o: OrderView): OrderInput {
  return {
    clientId: o.clientId,
    clientName: o.clientName,
    title: o.title,
    description: o.description,
    difficulty: o.difficulty,
    urgent: o.urgent,
    quantity: o.intake.quantity,
    condition: o.intake.condition,
    due: o.due,
    workItems: o.workItems.map((w) => ({ id: w.id, process: w.process, machineId: w.machineId, positionId: w.positionId, description: w.description, plannedHours: w.plannedHours })),
    supplies: o.supplies.map((s) => ({ ...s })),
    price: o.price,
    notes: o.notes,
  };
}

/**
 * Intake of pieces (new OT) or edit of an existing one. While the route and
 * the due date are filled in, the form answers "¿Me puedo comprometer?" live.
 */
export function OrderFormModal({ order, onClose, onSaved }: { order?: OrderView | null; onClose: () => void; onSaved?: (order: Order) => void }) {
  const { data } = useSync();
  const prod = useProduction();
  const [form, setForm] = useState<OrderInput>(() =>
    order
      ? fromOrder(order)
      : {
          clientId: null,
          clientName: "",
          title: "",
          description: "",
          difficulty: 1,
          urgent: false,
          quantity: 1,
          condition: "",
          due: { date: addDays(data.today, 5), time: "17:00" },
          workItems: [],
          supplies: [],
          price: null,
          notes: "",
        },
  );
  const { run, busy } = useAction();
  const set = <K extends keyof OrderInput>(k: K, v: OrderInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const locked = useMemo(() => new Set(order?.workItems.filter((w) => w.status === "completada").map((w) => w.id) ?? []), [order]);

  // Live commitment check against everything else already queued.
  const answer = useMemo(() => {
    if (!form.due || form.workItems.length === 0) return null;
    const hoursByMachine: Record<string, number> = {};
    const hoursByProcess: Partial<Record<(typeof form.workItems)[number]["process"], number>> = {};
    for (const w of form.workItems) {
      if (w.id && locked.has(w.id)) continue;
      if (w.machineId) hoursByMachine[w.machineId] = (hoursByMachine[w.machineId] ?? 0) + w.plannedHours;
      else hoursByProcess[w.process] = (hoursByProcess[w.process] ?? 0) + w.plannedHours;
    }
    const others = prod.asOrders.filter((o) => o.id !== order?.id);
    return canCommit(others, { hoursByMachine, hoursByProcess, dueDate: form.due.date, dueTime: form.due.time, difficulty: form.difficulty, urgent: form.urgent }, prod.ctx);
  }, [form, prod, order?.id, locked]);

  const valid = form.title.trim() && (form.clientId || form.clientName?.trim()) && form.quantity >= 1;

  const save = async () => {
    const payload: OrderInput = { ...form, clientName: form.clientId ? null : (form.clientName ?? "").trim() };
    const result = await run(
      "save",
      () => (order ? api.orders.update(order.id, payload) : api.orders.create(payload)),
      (r) => (order ? "Orden actualizada" : `${r.order.folio} registrada · tareas enviadas a los puestos`),
    );
    if (result) onSaved?.(result.order);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={order ? `Editar ${order.folio}` : "Ingreso de piezas · nueva OT"}
      description={order ? order.title : "Registra lo que llegó; luego adjunta fotos y planos."}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={busy === "save"} disabled={!valid} icon={<Save className="size-4" />}>
            {order ? "Guardar cambios" : "Registrar OT"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-5">
          <Field label="Cliente">
            {() => (
              <ClientPicker
                clients={prod.clients}
                clientId={form.clientId}
                clientName={form.clientName ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, clientId: v.clientId, clientName: v.clientName }))}
              />
            )}
          </Field>
          <Field label="Trabajo">
            {(id) => <Input id={id} required maxLength={140} placeholder="Ej: Eje de transmisión para molino" value={form.title} onChange={(e) => set("title", e.target.value)} />}
          </Field>
          <Field label="Descripción técnica">
            {(id) => <Textarea id={id} rows={3} placeholder="Material, medidas, tolerancias…" value={form.description} onChange={(e) => set("description", e.target.value)} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field label="Cantidad">{(id) => <NumberInput id={id} integer min={1} value={form.quantity} onChange={(v) => set("quantity", v ?? 1)} />}</Field>
            <Field label="Estado en que llegan las piezas">
              {(id) => <Input id={id} placeholder="Ej: desgaste en el asiento del rodamiento" value={form.condition} onChange={(e) => set("condition", e.target.value)} />}
            </Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ink-soft">Ruta de procesos</p>
            <RouteEditor items={form.workItems} onChange={(items) => set("workItems", items)} machines={prod.machines} positions={data.positions} locked={locked} />
          </div>
          <div>
            <p className="text-sm font-medium text-ink-soft">Insumos y proveedores</p>
            <p className="mb-2 text-xs text-muted">Lo que anotes aquí también aparece en la lista de Insumos hasta que lo marques «Ya está». Su costo cuenta en las ganancias.</p>
            <SuppliesEditor items={form.supplies} onChange={(items) => set("supplies", items)} />
          </div>
          <Field label="Notas internas">{(id) => <Textarea id={id} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />}</Field>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start">
          <div className="rounded-xl border border-line bg-night/50 p-4">
            <p className="mb-3 font-display font-semibold text-ink">Entrega</p>
            <div className="grid grid-cols-[1fr_7rem] gap-2">
              <Input
                type="date"
                aria-label="Fecha de entrega"
                value={form.due?.date ?? ""}
                min={order ? undefined : data.today}
                onChange={(e) => set("due", e.target.value ? { date: e.target.value, time: form.due?.time ?? "17:00" } : null)}
              />
              <Input type="time" aria-label="Hora de entrega" value={form.due?.time ?? "17:00"} disabled={!form.due} onChange={(e) => form.due && set("due", { ...form.due, time: e.target.value })} />
            </div>
            <p className="mt-2 text-xs text-muted">Se avisa 24 h antes, el mismo día y si se vence.</p>
            {answer && (
              <div className="mt-3">
                <p className="hud-label mb-1.5">¿Me puedo comprometer?</p>
                <CommitVerdict answer={answer} />
              </div>
            )}
          </div>
          <div className="rounded-xl border border-line bg-night/50 p-4">
            <p className="mb-3 font-display font-semibold text-ink">Dificultad</p>
            <Segmented<"1" | "2" | "3">
              label="Dificultad"
              value={String(form.difficulty) as "1" | "2" | "3"}
              onChange={(v) => set("difficulty", Number(v) as Difficulty)}
              options={[
                { value: "1", label: "Normal" },
                { value: "2", label: "Mayor" },
                { value: "3", label: "Muy alta" },
              ]}
              className="[&>button]:flex-1 [&>button]:justify-center"
            />
            <label className="mt-3 flex items-start gap-3 rounded-lg border border-line p-2.5 text-sm text-ink-soft">
              <input type="checkbox" checked={form.urgent ?? false} onChange={(e) => set("urgent", e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-glow)]" />
              <span>
                <strong className="text-ink">Urgente</strong>: se baja la pieza montada y esta orden pasa primero en la cola.
              </span>
            </label>
          </div>
          <div className="rounded-xl border border-line bg-night/50 p-4">
            <Field label="Precio pactado (antes de IVA)" hint="Si viene de una cotización aprobada, ya está lleno.">
              {(id, d) => <MoneyInput id={id} ariaDescribedBy={d} value={form.price} onChange={(v) => set("price", v)} />}
            </Field>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
