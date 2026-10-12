"use client";

import { CheckCircle2, Save } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api, type ClientInput } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { CLIENT_KIND_LABEL, CLIENT_TIER_LABEL } from "@/lib/domain/labels";
import { formatNit, parseNit } from "@/lib/domain/nit";
import type { Client } from "@/lib/domain/schema";
import type { ClientView } from "@/lib/domain/views";

const EMPTY: ClientInput = {
  kind: "empresa",
  name: "",
  nit: "",
  companyPhone: "",
  personalPhone: "",
  contactName: "",
  email: "",
  city: "",
  address: "",
  notes: "",
  tier: 1,
};

/** Create or edit a client. The DIAN verification digit is computed while typing. */
export function ClientFormModal({
  open,
  onClose,
  client,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  client?: ClientView | null;
  onSaved?: (client: Client | ClientView) => void;
}) {
  const [form, setForm] = useState<ClientInput>(() =>
    client ? { ...EMPTY, ...client, nit: client.nit ? formatNit(client.nit, client.dv) : "" } : EMPTY,
  );
  const { run, busy } = useAction();
  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const parsed = form.nit.trim() ? parseNit(form.nit) : null;
  const nitError = form.nit.trim() && !parsed ? "Escribe entre 5 y 15 dígitos." : parsed?.mismatch ? `El dígito de verificación correcto es ${parsed.dv}.` : null;

  const save = async () => {
    const payload = { ...form, nit: parsed ? `${parsed.number}` : "" };
    const result = await run(
      "save",
      () => (client ? api.clients.update(client.id, payload) : api.clients.create(payload)),
      client ? "Cliente actualizado" : "Cliente registrado",
    );
    if (result) {
      onSaved?.(result.client);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? "Editar cliente" : "Nuevo cliente"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={busy === "save"} disabled={!form.name.trim() || Boolean(nitError)} icon={<Save className="size-4" />}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={form.kind} onChange={(e) => set("kind", e.target.value as ClientInput["kind"])}>
              {Object.entries(CLIENT_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={form.kind === "empresa" ? "Razón social" : "Nombre completo"} className="sm:col-span-1">
          {(id) => <Input id={id} required maxLength={160} value={form.name} onChange={(e) => set("name", e.target.value)} />}
        </Field>
        <Field
          label={form.kind === "empresa" ? "NIT" : "Cédula o NIT"}
          hint={parsed && !parsed.mismatch ? `DV ${parsed.dv} · ${formatNit(parsed.number, form.kind === "empresa" ? parsed.dv : null)}` : "Con o sin dígito de verificación (900123456-8)."}
          error={nitError}
        >
          {(id, d) => (
            <div className="relative">
              <Input id={id} aria-describedby={d} inputMode="numeric" autoComplete="off" value={form.nit} onChange={(e) => set("nit", e.target.value)} />
              {parsed && !parsed.mismatch && <CheckCircle2 className="absolute right-3 top-1/2 size-5 -translate-y-1/2 text-done" aria-hidden />}
            </div>
          )}
        </Field>
        <Field label="Nivel del cliente" hint="Pesa en la recomendación de prioridades.">
          {(id, d) => (
            <Select id={id} aria-describedby={d} value={form.tier} onChange={(e) => set("tier", Number(e.target.value))}>
              {[1, 2, 3].map((t) => (
                <option key={t} value={t}>
                  {CLIENT_TIER_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Persona de contacto">{(id) => <Input id={id} autoComplete="off" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />}</Field>
        <Field label="Correo">{(id) => <Input id={id} type="email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} />}</Field>
        <Field label="Teléfono empresarial">
          {(id) => <Input id={id} type="tel" inputMode="tel" autoComplete="off" value={form.companyPhone} onChange={(e) => set("companyPhone", e.target.value)} />}
        </Field>
        <Field label="Teléfono personal">
          {(id) => <Input id={id} type="tel" inputMode="tel" autoComplete="off" value={form.personalPhone} onChange={(e) => set("personalPhone", e.target.value)} />}
        </Field>
        <Field label="Ciudad">{(id) => <Input id={id} value={form.city} onChange={(e) => set("city", e.target.value)} />}</Field>
        <Field label="Dirección">{(id) => <Input id={id} value={form.address} onChange={(e) => set("address", e.target.value)} />}</Field>
        <Field label="Notas" className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

/** Choose a registered client, or type a walk-in name. */
export function ClientPicker({
  clients,
  clientId,
  clientName,
  onChange,
}: {
  clients: ClientView[];
  clientId: string | null;
  clientName: string;
  onChange: (value: { clientId: string | null; clientName: string }) => void;
}) {
  const [creating, setCreating] = useState(false);
  const active = clients.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name, "es"));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Select
          aria-label="Cliente"
          value={clientId ?? ""}
          onChange={(e) => {
            const c = active.find((x) => x.id === e.target.value);
            onChange(c ? { clientId: c.id, clientName: c.name } : { clientId: null, clientName: "" });
          }}
          className="flex-1"
        >
          <option value="">Cliente sin registrar…</option>
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.nit ? ` · ${formatNit(c.nit, c.dv)}` : ""}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={() => setCreating(true)}>
          Nuevo
        </Button>
      </div>
      {!clientId && (
        <Input aria-label="Nombre del cliente sin registrar" placeholder="Nombre del cliente" value={clientName} onChange={(e) => onChange({ clientId: null, clientName: e.target.value })} />
      )}
      {creating && (
        <ClientFormModal
          open
          onClose={() => setCreating(false)}
          onSaved={(c) => onChange({ clientId: c.id, clientName: c.name })}
        />
      )}
    </div>
  );
}
