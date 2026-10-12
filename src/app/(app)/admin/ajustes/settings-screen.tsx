"use client";

import { ClipboardPaste, FileCheck2, Plus, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { MoneyInput, NumberInput, PageHeader } from "@/components/ui/kit";
import { Modal, useConfirm } from "@/components/ui/overlay";
import { Button, Field, Input, Panel, Textarea, cn } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useProduction } from "@/lib/client/use-production";
import { ipcVariations } from "@/lib/domain/ipc";
import { PROCESS_LABEL, WEEKDAY_LABEL, formatDate } from "@/lib/domain/labels";
import { formatNit, parseNit } from "@/lib/domain/nit";
import { PROCESSES, type ProductionSettings } from "@/lib/domain/schema";

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Panel as="section">
      <div id={id} className="scroll-mt-24">
        <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        <div className="mt-4">{children}</div>
      </div>
    </Panel>
  );
}

export function SettingsScreen() {
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Sistema" title="Ajustes" description="Todo se edita desde aquí; nada requiere tocar código." />
      <nav aria-label="Secciones" className="flex flex-wrap gap-2 text-sm">
        {[
          ["#taller", "Taller y acceso"],
          ["#produccion", "Producción y tarifas"],
          ["#ipc", "IPC (DANE)"],
          ["#empresa", "Datos legales"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-lg border border-line px-3 py-1.5 text-ink-soft hover:border-glow/60 hover:text-ink">
            {label}
          </a>
        ))}
        <Link href="/admin/cola" className="rounded-lg border border-line px-3 py-1.5 text-ink-soft hover:border-glow/60 hover:text-ink">
          Máquinas →
        </Link>
      </nav>
      <WorkshopSection />
      <ProductionSection />
      <IpcSection />
      <LegalSection />
    </div>
  );
}

function WorkshopSection() {
  const { data } = useSync();
  const s = data.settings;
  const [name, setName] = useState(s.workshopName);
  const [timezone, setTimezone] = useState(s.timezone);
  const [open, setOpen] = useState(s.registrationOpen);
  const [code, setCode] = useState("");
  const [max, setMax] = useState<number | null>(s.maxPendingRegistrations);
  const { run, busy } = useAction();
  return (
    <Section id="taller" title="Taller y acceso" description="Nombre visible, zona horaria y cómo se piden las cuentas nuevas.">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del taller">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Zona horaria" hint="Colombia: America/Bogota">
          {(id, d) => <Input id={id} aria-describedby={d} value={timezone} onChange={(e) => setTimezone(e.target.value)} />}
        </Field>
        <label className="flex items-start gap-3 rounded-xl border border-line bg-night/50 p-3 text-sm text-ink-soft sm:col-span-2">
          <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-glow)]" />
          Permitir que las personas pidan cuenta desde la página de inicio (quedan pendientes hasta que las apruebes).
        </label>
        <Field label="Código del taller (opcional)" hint={s.hasRegistrationCode ? "Hay un código activo. Escribe uno nuevo para cambiarlo, o deja vacío y guarda con «Quitar código»." : "Si lo defines, se pide al crear cuenta."}>
          {(id, d) => <Input id={id} aria-describedby={d} autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} />}
        </Field>
        <Field label="Máximo de solicitudes pendientes">{(id) => <NumberInput id={id} integer min={1} max={200} value={max} onChange={setMax} />}</Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          loading={busy === "w"}
          icon={<Save className="size-4" />}
          onClick={() =>
            void run(
              "w",
              () =>
                api.admin.updateSettings({
                  workshopName: name,
                  timezone,
                  registrationOpen: open,
                  maxPendingRegistrations: max ?? 25,
                  ...(code.trim() ? { registrationCode: code.trim() } : {}),
                }),
              "Ajustes guardados",
            ).then(() => setCode(""))
          }
        >
          Guardar
        </Button>
        {s.hasRegistrationCode && (
          <Button variant="ghost" loading={busy === "c"} onClick={() => void run("c", () => api.admin.updateSettings({ registrationCode: "" }), "Código eliminado")}>
            Quitar código
          </Button>
        )}
      </div>
    </Section>
  );
}

function ProductionSection() {
  const prod = useProduction();
  const [form, setForm] = useState<ProductionSettings | undefined>(prod.settings);
  const { run, busy } = useAction();
  if (!form) return null;
  const set = <K extends keyof ProductionSettings>(k: K, v: ProductionSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  return (
    <Section
      id="produccion"
      title="Producción y tarifas"
      description="Calendario de trabajo (capacidad), tarifas por hora del cotizador y reglas de cierre. Las tarifas empiezan en $0: ponlas tú, no se inventan precios."
    >
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-soft">Días laborales</legend>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => {
              const on = form.workdays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("workdays", on ? form.workdays.filter((x) => x !== d) : [...form.workdays, d].sort())}
                  className={cn("h-11 min-w-14 rounded-xl border px-3 font-semibold", on ? "border-glow bg-navy-700/60 text-ink" : "border-line text-muted")}
                >
                  {WEEKDAY_LABEL[d]}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Horas del sábado" hint="Vacío = igual que entre semana.">
            {(id, d) => <NumberInput id={id} ariaDescribedBy={d} max={24} value={form.saturdayHours} onChange={(v) => set("saturdayHours", v)} suffix="h" />}
          </Field>
          <label className="flex items-center gap-3 rounded-xl border border-line bg-night/50 p-3 text-sm text-ink-soft sm:col-span-2">
            <input type="checkbox" checked={form.skipHolidays} onChange={(e) => set("skipHolidays", e.target.checked)} className="size-5 accent-[var(--color-glow)]" />
            No contar los festivos de Colombia (Ley Emiliani) en la capacidad.
          </label>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-ink-soft">Tarifa por hora para cotizar (antes de IVA)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {PROCESSES.map((p) => (
              <Field key={p} label={PROCESS_LABEL[p]}>
                {(id) => <MoneyInput id={id} allowEmpty={false} value={form.processRates[p]} onChange={(v) => set("processRates", { ...form.processRates, [p]: v ?? 0 })} />}
              </Field>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Utilidad por defecto">{(id) => <NumberInput id={id} max={500} value={form.defaultMarginPct} onChange={(v) => set("defaultMarginPct", v ?? 0)} suffix="%" />}</Field>
          <Field label="IVA">{(id) => <NumberInput id={id} max={100} value={form.ivaPct} onChange={(v) => set("ivaPct", v ?? 0)} suffix="%" />}</Field>
          <Field label="Vigencia de cotizaciones">{(id) => <NumberInput id={id} integer min={1} max={365} value={form.quoteValidDays} onChange={(v) => set("quoteValidDays", v ?? 15)} suffix="días" />}</Field>
          <Field label="Cierre automático tras entrega" hint="Días sin reclamos antes de FACTURAR.">
            {(id, d) => <NumberInput id={id} ariaDescribedBy={d} integer min={1} max={60} value={form.claimWindowDays} onChange={(v) => set("claimWindowDays", v ?? 3)} suffix="días" />}
          </Field>
        </div>
        <Button className="self-start" loading={busy === "p"} icon={<Save className="size-4" />} onClick={() => void run("p", () => api.admin.updateProduction(form), "Producción actualizada")}>
          Guardar producción
        </Button>
      </div>
    </Section>
  );
}

/** Parses pasted rows like "2026-09 150,23", "09/2026;150.23" or "2026\t9\t150,23". */
function parseIpc(text: string): Array<{ month: string; index: number }> {
  const out: Array<{ month: string; index: number }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m = line.match(/^(\d{4})[-/](\d{1,2})[\s;,\t]+([\d.,]+)$/);
    let year: string | undefined;
    let month: string | undefined;
    let value: string | undefined;
    if (m) [, year, month, value] = m;
    else if ((m = line.match(/^(\d{1,2})[-/](\d{4})[\s;,\t]+([\d.,]+)$/))) [, month, year, value] = m;
    else if ((m = line.match(/^(\d{4})[\s;\t]+(\d{1,2})[\s;\t]+([\d.,]+)$/))) [, year, month, value] = m;
    if (!year || !month || !value) continue;
    const mm = Number(month);
    const normalized = value.includes(",") && value.lastIndexOf(",") > value.lastIndexOf(".") ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
    const index = Number(normalized);
    if (mm >= 1 && mm <= 12 && Number.isFinite(index) && index > 0) out.push({ month: `${year}-${String(mm).padStart(2, "0")}`, index });
  }
  return out;
}

function IpcSection() {
  const prod = useProduction();
  const [month, setMonth] = useState("");
  const [index, setIndex] = useState<number | null>(null);
  const [pasting, setPasting] = useState(false);
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();
  const rows = ipcVariations(prod.ipc).reverse();
  return (
    <Section
      id="ipc"
      title="IPC mensual (DANE)"
      description={
        <>
          Índice de precios al consumidor, serie con base diciembre de 2018 = 100. Se usa para llevar precios antiguos a pesos de hoy: valor × IPC actual / IPC del mes. Descárgalo
          de{" "}
          <a href="https://www.dane.gov.co/index.php/estadisticas-por-tema/precios-y-costos/indice-de-precios-al-consumidor-ipc" target="_blank" rel="noopener noreferrer" className="font-semibold text-glow hover:underline">
            dane.gov.co
          </a>{" "}
          (anexo «Índices – series de empalme») y pégalo aquí.
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Mes">{(id) => <Input id={id} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}</Field>
          <Field label="Índice">{(id) => <NumberInput id={id} value={index} onChange={setIndex} placeholder="150,23" />}</Field>
          <Button
            loading={busy === "add"}
            disabled={!month || !index}
            icon={<Plus className="size-4" />}
            onClick={async () => {
              const ok = await run("add", () => api.ipc.save([{ month, index: index! }]), "Mes guardado");
              if (ok) {
                setMonth("");
                setIndex(null);
              }
            }}
          >
            Guardar mes
          </Button>
          <Button variant="secondary" icon={<ClipboardPaste className="size-4" />} onClick={() => setPasting(true)}>
            Pegar desde Excel
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-pending/40 p-4 text-sm text-pending">Sin datos del IPC. Mientras tanto, los precios «a hoy» se muestran sin ajustar.</p>
        ) : (
          <div className="max-h-80 overflow-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Mes</th>
                  <th className="px-3 py-2 text-right font-semibold">Índice</th>
                  <th className="px-3 py-2 text-right font-semibold">Variación mensual</th>
                  <th className="px-3 py-2 text-right font-semibold">Variación anual</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month} className="border-t border-line/60">
                    <td className="px-3 py-1.5 text-ink">{formatDate(`${r.month}-15`, { month: "long", year: "numeric" })}</td>
                    <td className="tabular px-3 py-1.5 text-right text-ink">{r.index.toLocaleString("es-CO", { maximumFractionDigits: 2 })}</td>
                    <td className="tabular px-3 py-1.5 text-right text-ink-soft">{r.monthly === null ? "—" : `${r.monthly.toLocaleString("es-CO")} %`}</td>
                    <td className="tabular px-3 py-1.5 text-right text-ink-soft">{r.annual === null ? "—" : `${r.annual.toLocaleString("es-CO")} %`}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button"
                        aria-label={`Quitar ${r.month}`}
                        className="text-muted hover:text-blocked"
                        onClick={async () => {
                          if (await confirm({ title: `¿Quitar ${r.month}?`, confirmLabel: "Quitar", danger: true })) void run(`rm-${r.month}`, () => api.ipc.save([], [r.month]), "Mes eliminado");
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pasting && <PasteIpc onClose={() => setPasting(false)} />}
      {dialog}
    </Section>
  );
}

function PasteIpc({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const parsed = parseIpc(text);
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title="Pegar IPC desde Excel"
      description="Una fila por mes: «AAAA-MM valor», «MM/AAAA valor» o «AAAA MM valor». Coma o punto decimal."
      size="md"
      footer={
        <Button
          loading={busy === "paste"}
          disabled={parsed.length === 0}
          onClick={async () => {
            const ok = await run("paste", () => api.ipc.save(parsed), `${parsed.length} meses guardados`);
            if (ok) onClose();
          }}
        >
          Guardar {parsed.length || ""} meses
        </Button>
      }
    >
      <Textarea aria-label="Datos pegados" rows={10} className="font-mono text-sm" placeholder={"2026-08\t151,12\n2026-09\t151,70"} value={text} onChange={(e) => setText(e.target.value)} />
      {text && <p className="mt-2 text-sm text-muted">Reconocidos: {parsed.length} meses{parsed.length ? ` (${parsed[0]!.month} … ${parsed[parsed.length - 1]!.month})` : ""}.</p>}
    </Modal>
  );
}

function LegalSection() {
  const { data } = useSync();
  const legal = data.settings.legal;
  const [form, setForm] = useState({
    companyName: legal.companyName,
    tradeName: legal.tradeName,
    nit: legal.nit,
    address: legal.address,
    city: legal.city,
    email: legal.email,
    phone: legal.phone,
    privacyContact: legal.privacyContact,
    website: legal.website,
  });
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const nit = form.nit.trim() ? parseNit(form.nit) : null;
  const fields: Array<[keyof typeof form, string, string?]> = [
    ["companyName", "Razón social", "Servi Mecanizados Industriales S.A.S."],
    ["tradeName", "Nombre comercial", "S.M.I."],
    ["nit", "NIT"],
    ["address", "Dirección"],
    ["city", "Ciudad"],
    ["email", "Correo de contacto"],
    ["phone", "Teléfono"],
    ["privacyContact", "Responsable de datos personales y PQR", "Ej: Gerencia administrativa"],
    ["website", "Sitio web"],
  ];
  return (
    <Section id="empresa" title="Datos legales de la empresa" description="Aparecen en las páginas legales, en las cotizaciones impresas y en el pie de la página de inicio.">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map(([key, label, placeholder]) => (
          <Field
            key={key}
            label={label}
            error={key === "nit" && nit?.mismatch ? `El dígito de verificación correcto es ${nit.dv}.` : null}
            hint={key === "nit" && nit && !nit.mismatch ? `Se mostrará como ${formatNit(nit.number, nit.dv)}` : undefined}
          >
            {(id, d) => <Input id={id} aria-describedby={d} placeholder={placeholder} value={form[key]} onChange={(e) => set(key, e.target.value)} />}
          </Field>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          loading={busy === "l"}
          disabled={Boolean(nit?.mismatch)}
          icon={<Save className="size-4" />}
          onClick={() => void run("l", () => api.admin.updateSettings({ legal: { ...form, nit: nit ? formatNit(nit.number, nit.dv) : form.nit } }), "Datos legales guardados")}
        >
          Guardar datos
        </Button>
        <Button
          variant="secondary"
          loading={busy === "v"}
          icon={<FileCheck2 className="size-4" />}
          onClick={async () => {
            if (
              await confirm({
                title: "¿Publicar una nueva versión de la política?",
                body: "Todas las personas deberán aceptarla de nuevo al entrar. Hazlo solo si cambiaste algo importante del tratamiento de datos.",
                confirmLabel: "Publicar",
              })
            ) {
              void run("v", () => api.admin.updateSettings({ publishPolicyVersion: data.today }), "Nueva versión publicada");
            }
          }}
        >
          Publicar nueva versión de la política
        </Button>
        <Link href="/legal" target="_blank" className="inline-flex h-11 items-center px-2 text-sm font-semibold text-glow hover:underline">
          Ver centro legal
        </Link>
      </div>
      <p className="mt-3 text-xs text-muted">Versión vigente: {formatDate(legal.policyVersion, { day: "numeric", month: "long", year: "numeric" })}</p>
      {dialog}
    </Section>
  );
}
