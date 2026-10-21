"use client";

import { Check, PackagePlus, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { Modal, useConfirm } from "@/components/ui/overlay";
import { Button, Chip, Field, Input, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useProduction } from "@/lib/client/use-production";
import { formatDate } from "@/lib/domain/labels";
import { formatQuantity } from "@/lib/domain/supplies";

export const UNIT_SUGGESTIONS = ["unidades", "kg", "g", "m", "cm", "mm", "pulgadas", "litros", "galones", "hojas", "cajas", "pares"];

/** «Insumos requeridos» de una orden: lo que ESTE trabajo necesita conseguir. */
export function RequiredSuppliesModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const prod = useProduction();
  const order = prod.orders.find((o) => o.id === orderId);
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("unidades");
  const [note, setNote] = useState("");

  if (!order) return null;
  const editable = ["recibida", "en_proceso", "terminada", "garantia"].includes(order.status);
  const lines = order.requiredSupplies;
  const pending = lines.filter((l) => l.status === "pendiente");
  const done = lines.filter((l) => l.status === "conseguido");
  const qty = Number(quantity.replace(",", "."));
  const valid = name.trim().length > 0 && Number.isFinite(qty) && qty > 0;

  const add = async () => {
    const ok = await run(
      "add",
      () => api.orders.action(order.id, { action: "supplyAdd", name: name.trim(), quantity: qty, unit: unit.trim() || null, note: note.trim() || null }),
      "Insumo agregado al listado general",
    );
    if (ok) {
      setName("");
      setQuantity("1");
      setNote("");
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Insumos requeridos · ${order.folio}`}
      description={`${order.title} · ${order.clientName}. Lo que agregues aquí también aparece en el listado general de Insumos.`}
    >
      <div className="flex flex-col gap-5">
        {editable && (
          <form
            className="flex flex-col gap-3 rounded-xl border border-line bg-night/50 p-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid) void add();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem]">
              <Field label="Insumo">{(id) => <Input id={id} placeholder="Ej.: Electrodo 6013 de 1/8" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label="Cantidad">
                {(id) => <Input id={id} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}
              </Field>
              <Field label="Unidad">
                {(id) => (
                  <>
                    <Input id={id} list={`${id}-units`} maxLength={24} value={unit} onChange={(e) => setUnit(e.target.value)} />
                    <datalist id={`${id}-units`}>
                      {UNIT_SUGGESTIONS.map((u) => (
                        <option key={u} value={u} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
            </div>
            <Field label="Observación (opcional)">{(id) => <Textarea id={id} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            <div>
              <Button type="submit" size="sm" icon={<PackagePlus className="size-4" />} loading={busy === "add"} disabled={!valid}>
                Agregar insumo
              </Button>
            </div>
          </form>
        )}

        <section>
          <h3 className="mb-2 font-display font-semibold text-ink">Por conseguir ({pending.length})</h3>
          {pending.length === 0 ? (
            <p className="text-sm text-muted">{lines.length === 0 ? "Esta orden todavía no pide insumos." : "No falta ningún insumo."}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pending.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-night/50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{l.name}</p>
                    <p className="text-xs text-muted">
                      {formatQuantity(l.quantity, l.unit)} · pedido el {formatDate(l.requestedAt)}
                      {l.note ? ` · ${l.note}` : ""}
                    </p>
                  </div>
                  <Chip tone="pending">Pendiente</Chip>
                  {editable && (
                    <>
                      <Button
                        size="sm"
                        variant="success"
                        icon={<Check className="size-4" />}
                        loading={busy === `done-${l.id}`}
                        onClick={() => void run(`done-${l.id}`, () => api.orders.action(order.id, { action: "supplyDone", supplyId: l.id, done: true }), "Ya está el insumo")}
                      >
                        Ya está
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Quitar ${l.name}`}
                        icon={<Trash2 className="size-4" />}
                        onClick={async () => {
                          if (await confirm({ title: `¿Quitar «${l.name}»?`, body: "Deja de pedirse para esta orden.", confirmLabel: "Quitar", danger: true })) {
                            void run(`rm-${l.id}`, () => api.orders.action(order.id, { action: "supplyRemove", supplyId: l.id }), "Insumo quitado");
                          }
                        }}
                      />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {done.length > 0 && (
          <section>
            <h3 className="mb-2 font-display font-semibold text-ink">Ya están ({done.length})</h3>
            <ul className="flex flex-col gap-2">
              {done.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-done/30 bg-done/5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{l.name}</p>
                    <p className="text-xs text-muted">
                      {formatQuantity(l.quantity, l.unit)} · conseguido el {formatDate(l.obtainedAt)}
                      {l.note ? ` · ${l.note}` : ""}
                    </p>
                  </div>
                  <Chip tone="done">Ya está el insumo</Chip>
                  {editable && (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Undo2 className="size-4" />}
                      loading={busy === `undo-${l.id}`}
                      onClick={() => void run(`undo-${l.id}`, () => api.orders.action(order.id, { action: "supplyDone", supplyId: l.id, done: false }), "Vuelve a estar pendiente")}
                    >
                      Deshacer
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {dialog}
    </Modal>
  );
}
