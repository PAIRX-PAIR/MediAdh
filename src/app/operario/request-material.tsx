"use client";

import { ClipboardCheck, PackagePlus } from "lucide-react";
import { ShiftCheckin } from "./shift-checkin";
import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { ApiError, request } from "@/lib/client/api";
import { REQUEST_TYPE_LABEL } from "@/lib/domain/labels";
import { REQUEST_TYPES, type RequestType } from "@/lib/domain/schema";

/** Barra de abajo del celular del operario: pedir material, herramienta o EPP sin iniciar sesión. */
export function RequestMaterialBar() {
  const [open, setOpen] = useState(false);
  const [checkin, setCheckin] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-line bg-night/95 p-3 backdrop-blur safe-bottom">
        <Button variant="secondary" size="lg" className="shrink-0" icon={<ClipboardCheck className="size-5" />} onClick={() => setCheckin(true)} aria-label="Avance del turno">
          Avance
        </Button>
        <Button size="lg" block icon={<PackagePlus className="size-5" />} onClick={() => setOpen(true)}>
          Pedir material
        </Button>
        {done && <p className="mt-2 text-center text-xs text-done">{done}</p>}
      </div>
      <ShiftCheckin open={checkin} onClose={() => setCheckin(false)} />
      {open && <RequestForm onClose={() => setOpen(false)} onSent={(folio) => setDone(`Pedido ${folio} enviado al coordinador.`)} />}
    </>
  );
}

function RequestForm({ onClose, onSent }: { onClose: () => void; onSent: (folio: string) => void }) {
  const [type, setType] = useState<RequestType>("material");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await request<{ request: { folio: string } }>("/api/dispositivo/pedidos", {
        method: "POST",
        body: { type, item: item.trim(), quantity: quantity.trim() || null, note: note.trim() || null, urgent, taskId: null },
      });
      onSent(res.request.folio);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Pedir material" description="Lo recibe el coordinador o la asistente. Escribe qué necesitas y cuánto." size="sm"
      footer={
        <Button loading={busy} disabled={!item.trim()} icon={<PackagePlus className="size-4" />} onClick={() => void send()}>
          Enviar pedido
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={type} onChange={(e) => setType(e.target.value as RequestType)}>
              {REQUEST_TYPES.map((t) => (
                <option key={t} value={t}>
                  {REQUEST_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="¿Qué necesitas?">{(id) => <Input id={id} maxLength={140} placeholder="Ej: inserto CCMT 09" value={item} onChange={(e) => setItem(e.target.value)} />}</Field>
        <Field label="Cantidad" hint="Opcional">{(id) => <Input id={id} maxLength={80} placeholder="Ej: 4 unidades" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
        <Field label="Nota" hint="Opcional">{(id) => <Textarea id={id} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} className="size-5 accent-[var(--color-glow)]" />
          Es urgente (la máquina está parada)
        </label>
        {error && <p role="alert" className="text-sm text-blocked">{error}</p>}
      </div>
    </Modal>
  );
}
