"use client";

import { Link2, PackagePlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useProduction } from "@/lib/client/use-production";
import { SUPPLY_ORDER_STATUSES } from "@/lib/domain/supplies";
import { UNIT_SUGGESTIONS } from "./required-supplies";

/** Órdenes que todavía aceptan insumos, las más recientes primero. */
function useOpenOrders() {
  const { orders } = useProduction();
  return useMemo(
    () => orders.filter((o) => SUPPLY_ORDER_STATUSES.includes(o.status)).sort((a, b) => b.intake.receivedAt.localeCompare(a.intake.receivedAt)),
    [orders],
  );
}

const orderLabel = (o: { folio: string; title: string; clientName: string }) => `${o.folio} · ${o.title} (${o.clientName})`;

/**
 * Pide un insumo desde la lista general: suelto («hay que comprarlo») o
 * enlazado a la orden que lo necesita.
 */
export function AddSupplyModal({ onClose, defaultOrderId = "" }: { onClose: () => void; defaultOrderId?: string }) {
  const openOrders = useOpenOrders();
  const { run, busy } = useAction();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("unidades");
  const [note, setNote] = useState("");
  const [orderId, setOrderId] = useState(defaultOrderId);
  const qty = Number(quantity.replace(",", "."));
  const valid = name.trim().length > 0 && Number.isFinite(qty) && qty > 0;

  const save = async (another: boolean) => {
    const ok = await run(
      "add",
      () => api.supplies.add({ orderId: orderId || null, name: name.trim(), quantity: qty, unit: unit.trim() || null, note: note.trim() || null }),
      orderId ? "Insumo agregado a la orden y a la lista" : "Insumo agregado a la lista",
    );
    if (!ok) return;
    if (!another) return onClose();
    setName("");
    setQuantity("1");
    setNote("");
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Agregar insumo"
      description="Para ir a comprarlo. Si es para un trabajo, enlázalo a su orden; si no, queda suelto en la lista."
      footer={
        <>
          <Button variant="secondary" disabled={!valid} loading={busy === "add"} onClick={() => void save(true)}>
            Guardar y agregar otro
          </Button>
          <Button icon={<PackagePlus className="size-4" />} disabled={!valid} loading={busy === "add"} onClick={() => void save(false)}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) void save(false);
        }}
      >
        <Field label="Insumo">{(id) => <Input id={id} autoFocus placeholder="Ej.: Tornillo hexagonal 3/8 x 2" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cantidad">{(id) => <Input id={id} inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
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
        <Field label="¿Para qué orden? (opcional)" hint="Si lo dejas sin orden, se puede enlazar después.">
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">Sin orden (compra suelta)</option>
              {openOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {orderLabel(o)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Observación (opcional)">{(id) => <Textarea id={id} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </form>
    </Modal>
  );
}

/** Enlaza un insumo suelto a la orden que lo necesita. */
export function LinkSupplyModal({ supplyId, supplyName, onClose }: { supplyId: string; supplyName: string; onClose: () => void }) {
  const openOrders = useOpenOrders();
  const { run, busy } = useAction();
  const [orderId, setOrderId] = useState("");

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Enlazar a una orden"
      description={`«${supplyName}» pasa a ser un insumo requerido de la orden que elijas.`}
      footer={
        <Button
          icon={<Link2 className="size-4" />}
          disabled={!orderId}
          loading={busy === "link"}
          onClick={async () => {
            const ok = await run("link", () => api.supplies.action(supplyId, { action: "link", orderId }), "Insumo enlazado a la orden");
            if (ok) onClose();
          }}
        >
          Enlazar
        </Button>
      }
    >
      <Field label="Orden">
        {(id) => (
          <Select id={id} value={orderId} onChange={(e) => setOrderId(e.target.value)}>
            <option value="">Elige una orden…</option>
            {openOrders.map((o) => (
              <option key={o.id} value={o.id}>
                {orderLabel(o)}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </Modal>
  );
}
