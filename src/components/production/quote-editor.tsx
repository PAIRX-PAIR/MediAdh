"use client";

import { CheckCircle2, Copy, FileCheck2, Plus, Printer, Save, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { AttachmentGallery, AttachmentUploader } from "@/components/ui/attachments";
import { ChangeLog, ChangeLogHeading, MoneyInput, NumberInput, Segmented } from "@/components/ui/kit";
import { Modal, useConfirm } from "@/components/ui/overlay";
import { Button, Chip, Field, Input, Select, Textarea, cn } from "@/components/ui/primitives";
import { api, type QuoteInput } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useProduction } from "@/lib/client/use-production";
import { PROCESS_LABEL, QUOTE_STATUS_LABEL, formatDate } from "@/lib/domain/labels";
import { canCommit } from "@/lib/domain/planning";
import { formatCop, quoteDisplayStatus, quoteTotals, quoteValidUntil, quoteWarnings } from "@/lib/domain/quote";
import { PROCESSES, type Difficulty, type Machine, type Process, type ProductionSettings, type Quote } from "@/lib/domain/schema";
import { addDays } from "@/lib/domain/time";
import type { QuoteView } from "@/lib/domain/views";
import { ClientPicker } from "./client-form";
import { CommitVerdict } from "./commit-verdict";

/** Picker value "m:<id>" (a machine and its own tariff) or "p:<process>" (any machine, process rate). */
function laborTarget(value: string, machines: Machine[], rates: ProductionSettings["processRates"] | undefined) {
  if (value.startsWith("m:")) {
    const m = machines.find((x) => x.id === value.slice(2));
    if (m) return { process: m.process, machineId: m.id, rate: m.hourlyRate > 0 ? m.hourlyRate : (rates?.[m.process] ?? 0) };
  }
  const process = value.slice(2) as Process;
  return { process, machineId: null, rate: rates?.[process] ?? 0 };
}

const STATUS_TONE = { borrador: "neutral", enviada: "glow", aprobada: "done", rechazada: "blocked", vencida: "pending" } as const;

export function QuoteStatusChip({ quote, today }: { quote: Pick<Quote, "status" | "issuedAt" | "createdAt" | "validDays">; today: string }) {
  const s = quoteDisplayStatus(quote, today);
  return (
    <Chip tone={STATUS_TONE[s]} dot>
      {QUOTE_STATUS_LABEL[s]}
    </Chip>
  );
}

function toInput(q: QuoteView): QuoteInput {
  return {
    clientId: q.clientId,
    clientName: q.clientName,
    title: q.title,
    description: q.description,
    quantity: q.quantity,
    materials: q.materials.map((m) => ({ ...m })),
    labor: q.labor.map((l) => ({ ...l })),
    difficulty: q.difficulty,
    urgent: q.urgent,
    marginPct: q.marginPct,
    ivaPct: q.ivaPct,
    validDays: q.validDays,
    notes: q.notes,
  };
}

/** Full-screen quote editor: lines on the left, live totals and actions on the right. */
export function QuoteEditorModal({ quote, onClose, onCreated }: { quote: QuoteView | null; onClose: () => void; onCreated?: (q: Quote) => void }) {
  const { data } = useSync();
  const prod = useProduction();
  const rates = prod.settings?.processRates;
  const [form, setForm] = useState<QuoteInput>(() =>
    quote
      ? toInput(quote)
      : {
          clientId: null,
          clientName: "",
          title: "",
          description: "",
          quantity: 1,
          materials: [],
          // Nada viene puesto de antemano: ni horas, ni utilidad. Todo lo que suma lo escribes tú.
          labor: [],
          difficulty: 1,
          urgent: false,
          marginPct: 0,
          ivaPct: prod.settings?.ivaPct ?? 19,
          validDays: prod.settings?.quoteValidDays ?? 15,
          notes: "",
        },
  );
  const [dirty, setDirty] = useState(false);
  const [full, setFull] = useState<Quote | null>(null);
  const [approving, setApproving] = useState(false);
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();
  const set = <K extends keyof QuoteInput>(k: K, v: QuoteInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  useEffect(() => {
    if (!quote) return;
    api.quotes
      .get(quote.id)
      .then((r) => setFull(r.quote))
      .catch(() => undefined);
  }, [quote, quote?.updatedAt]);

  const locked = quote?.status === "aprobada" || quote?.status === "rechazada";
  // La utilidad es la que se escribe. Solo una cotización ya enviada (hecha con la regla anterior)
  // conserva sus puntos de dificultad/urgencia, para no cambiarle el precio al cliente.
  const extra = quote && quote.status !== "borrador" ? quote.extraMarginPct : 0;
  // Una cotización ya enviada con la regla anterior (recargo sobre el costo) conserva su valor.
  const oldRule = Boolean(quote && quote.status !== "borrador" && quote.marginBasis === "costo");
  const calc = {
    materials: form.materials,
    labor: form.labor.map((l) => ({ ...l, id: l.id ?? "", rate: l.rate ?? 0 })),
    difficulty: form.difficulty,
    marginPct: form.marginPct ?? 0,
    extraMarginPct: extra,
    status: quote?.status ?? ("borrador" as const),
    marginBasis: quote?.marginBasis,
    ivaPct: form.ivaPct ?? 19,
    quantity: form.quantity,
  };
  const totals = quoteTotals({ ...calc, materials: calc.materials.map((m) => ({ ...m, id: m.id ?? "" })) });
  const warnings = quoteWarnings({ ...calc, materials: calc.materials.map((m) => ({ ...m, id: m.id ?? "" })) });

  const [commitDate, setCommitDate] = useState(addDays(data.today, 7));
  const commit =
    totals.totalHours > 0 ? canCommit(prod.asOrders, { hoursByProcess: totals.hoursByProcess, dueDate: commitDate, difficulty: form.difficulty, urgent: form.urgent }, prod.ctx) : null;

  const save = async () => {
    const payload = { ...form, clientName: form.clientId ? null : (form.clientName ?? "").trim() };
    const result = await run("save", () => (quote ? api.quotes.update(quote.id, payload) : api.quotes.create(payload)), quote ? "Cotización guardada" : "Cotización creada");
    if (result) {
      setDirty(false);
      if (!quote) onCreated?.(result.quote);
    }
    return result;
  };

  const action = async (key: string, input: Parameters<typeof api.quotes.action>[1], success: string) => {
    if (dirty && !locked) {
      const saved = await save();
      if (!saved) return;
    }
    return run(key, () => api.quotes.action(quote!.id, input), success);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={quote ? `${quote.folio} · ${quote.title}` : "Nueva cotización"}
      description={
        quote ? (
          <span className="flex flex-wrap items-center gap-2">
            <QuoteStatusChip quote={quote} today={data.today} />
            {quote.issuedAt && <span>Vigente hasta {formatDate(quoteValidUntil(quote), { day: "numeric", month: "long" })}</span>}
          </span>
        ) : (
          "Materiales + horas × tarifa de cada máquina, utilidad (con dificultad y urgencia) e IVA."
        )
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_21rem]">
        <fieldset disabled={locked} className="flex min-w-0 flex-col gap-5 disabled:opacity-80">
          <Field label="Cliente">
            {() => (
              <ClientPicker
                clients={prod.clients}
                clientId={form.clientId}
                clientName={form.clientName ?? ""}
                onChange={(v) => {
                  setForm((f) => ({ ...f, clientId: v.clientId, clientName: v.clientName }));
                  setDirty(true);
                }}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Trabajo">{(id) => <Input id={id} maxLength={140} value={form.title} onChange={(e) => set("title", e.target.value)} />}</Field>
            <Field label="Cantidad">{(id) => <NumberInput id={id} integer min={1} value={form.quantity} onChange={(v) => set("quantity", v ?? 1)} />}</Field>
          </div>
          <Field label="Descripción para el cliente">{(id) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />}</Field>

          <section>
            <p className="mb-2 text-sm font-medium text-ink-soft">Materiales</p>
            <div className="flex flex-col gap-2">
              {form.materials.map((m, i) => (
                <div key={m.id ?? `m-${i}`} className="grid grid-cols-[1fr_6rem] gap-2 rounded-xl border border-line bg-night/50 p-3 sm:grid-cols-[1fr_6rem_9rem_auto]">
                  <Input aria-label="Material" placeholder="Material" className="col-span-2 sm:col-span-1" value={m.description} onChange={(e) => set("materials", form.materials.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  <NumberInput value={m.quantity} onChange={(v) => set("materials", form.materials.map((x, j) => (j === i ? { ...x, quantity: v ?? 0 } : x)))} />
                  <MoneyInput value={m.unitCost} allowEmpty={false} onChange={(v) => set("materials", form.materials.map((x, j) => (j === i ? { ...x, unitCost: v ?? 0 } : x)))} />
                  <button type="button" aria-label="Quitar material" onClick={() => set("materials", form.materials.filter((_, j) => j !== i))} className="grid h-12 place-items-center rounded-lg text-muted hover:text-blocked sm:w-10">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <Button variant="secondary" size="sm" className="self-start" icon={<Plus className="size-4" />} onClick={() => set("materials", [...form.materials, { description: "", quantity: 1, unitCost: 0 }])}>
                Agregar material
              </Button>
            </div>
          </section>

          <section>
            <p className="mb-2 text-sm font-medium text-ink-soft">Horas por máquina</p>
            <div className="flex flex-col gap-2">
              {form.labor.map((l, i) => (
                <div key={l.id ?? `l-${i}`} className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-night/50 p-3 sm:grid-cols-[10rem_1fr_6.5rem_9rem_auto]">
                  <Select
                    aria-label="Máquina"
                    value={l.machineId ? `m:${l.machineId}` : `p:${l.process}`}
                    onChange={(e) => {
                      const next = laborTarget(e.target.value, prod.machines, rates);
                      set("labor", form.labor.map((x, j) => (j === i ? { ...x, ...next } : x)));
                    }}
                  >
                    {PROCESSES.map((p) => (
                      <optgroup key={p} label={PROCESS_LABEL[p]}>
                        <option value={`p:${p}`}>{PROCESS_LABEL[p]} (cualquier máquina)</option>
                        {prod.machines
                          .filter((m) => m.process === p)
                          .map((m) => (
                            <option key={m.id} value={`m:${m.id}`}>
                              {m.name}
                              {m.state === "inactiva" ? " · próximamente" : ""}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </Select>
                  <Input aria-label="Detalle" placeholder="Detalle (opcional)" value={l.description} onChange={(e) => set("labor", form.labor.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                  <NumberInput value={l.hours} suffix="h" onChange={(v) => set("labor", form.labor.map((x, j) => (j === i ? { ...x, hours: v ?? 0 } : x)))} />
                  <MoneyInput value={l.rate} allowEmpty={false} onChange={(v) => set("labor", form.labor.map((x, j) => (j === i ? { ...x, rate: v ?? 0 } : x)))} />
                  <button type="button" aria-label="Quitar línea" onClick={() => set("labor", form.labor.filter((_, j) => j !== i))} className="grid h-12 place-items-center rounded-lg text-muted hover:text-blocked sm:w-10">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                icon={<Plus className="size-4" />}
                onClick={() => set("labor", [...form.labor, { process: "torno", machineId: null, description: "", hours: 1, rate: rates?.torno ?? 0 }])}
              >
                Agregar horas
              </Button>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={oldRule ? "Utilidad sobre costo (regla anterior)" : "Utilidad sobre el precio"}
              hint={oldRule ? "Ya se envió así: su valor no cambia." : "La parte del precio que te queda: con 30 %, de cada $100 que cobras, $30 son utilidad."}
            >
              {(id, d) => <NumberInput id={id} ariaDescribedBy={d} value={form.marginPct} onChange={(v) => set("marginPct", v ?? 0)} suffix="%" max={oldRule ? 500 : 99} />}
            </Field>
            <Field label="IVA">{(id) => <NumberInput id={id} value={form.ivaPct} onChange={(v) => set("ivaPct", v ?? 0)} suffix="%" max={100} />}</Field>
            <Field label="Vigencia">{(id) => <NumberInput id={id} integer min={1} max={365} value={form.validDays} onChange={(v) => set("validDays", v ?? 15)} suffix="días" />}</Field>
          </div>
          <Field label="Notas y condiciones">{(id) => <Textarea id={id} rows={2} placeholder="Forma de pago, tiempo de entrega, garantía…" value={form.notes} onChange={(e) => set("notes", e.target.value)} />}</Field>

          {quote && (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium text-ink-soft">Planos del cliente</p>
                {!locked && <AttachmentUploader kind="plano" quoteId={quote.id} onUploaded={() => undefined} label="Adjuntar plano" />}
              </div>
              <AttachmentGallery items={prod.attachmentsOf(quote.drawingIds)} canRemove={!locked} empty="Sin planos." />
            </section>
          )}
          {full && (
            <section>
              <ChangeLogHeading />
              <ChangeLog entries={full.history} />
            </section>
          )}
        </fieldset>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start">
          <div className="rounded-xl border border-line bg-night/50 p-4">
            <p className="mb-3 font-display font-semibold text-ink">Dificultad</p>
            <Segmented<"1" | "2" | "3">
              label="Dificultad"
              value={String(form.difficulty) as "1" | "2" | "3"}
              onChange={(v) => !locked && set("difficulty", Number(v) as Difficulty)}
              options={[
                { value: "1", label: "Normal" },
                { value: "2", label: "Mayor" },
                { value: "3", label: "Muy alta" },
              ]}
              className="[&>button]:flex-1 [&>button]:justify-center"
            />
            <label className="mt-3 flex items-start gap-3 rounded-lg border border-line p-2.5 text-sm text-ink-soft">
              <input type="checkbox" disabled={locked} checked={form.urgent} onChange={(e) => set("urgent", e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-glow)]" />
              <span>
                <strong className="text-ink">Urgente</strong>: hay que bajar la pieza que está montada en la máquina (va primero en la cola).
              </span>
            </label>
            <p className="mt-2 text-xs text-muted">La dificultad y la urgencia ordenan la cola y la planeación; no cambian el precio. La utilidad la pones tú arriba.</p>
          </div>

          <dl className="tabular flex flex-col gap-1.5 rounded-xl border border-glow/30 bg-navy-900/60 p-4 text-sm">
            <Row label="Materiales" value={formatCop(totals.materials)} />
            <Row label={`Horas máquina (${totals.totalHours} h)`} value={formatCop(totals.labor)} />
            <Row label="Costo directo" value={formatCop(totals.cost)} strong />
            <Row label={oldRule ? `Utilidad ${form.marginPct ?? 0} % sobre costo` : `Utilidad ${totals.marginPct} % del precio`} value={formatCop(totals.baseMargin)} />
            {totals.extraMargin > 0 && <Row label={`Ajuste de la regla anterior +${extra} pts`} value={formatCop(totals.extraMargin)} />}
            <Row label="Subtotal (antes de IVA)" value={formatCop(totals.subtotal)} strong />
            <Row label={`IVA ${form.ivaPct ?? 0} %`} value={formatCop(totals.iva)} />
            <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
              <dt className="font-display font-semibold text-ink">Total</dt>
              <dd className="font-display text-2xl font-bold text-glow">{formatCop(totals.total)}</dd>
            </div>
            {form.quantity > 1 && <Row label="Precio por pieza (sin IVA)" value={formatCop(totals.unitPrice)} />}
          </dl>

          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-xl border border-pending/40 bg-pending/10 p-3 text-sm text-pending">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {commit && !locked && (
            <div className="rounded-xl border border-line bg-night/50 p-4">
              <p className="hud-label mb-2">¿Me puedo comprometer?</p>
              <Input type="date" aria-label="Fecha de entrega a ofrecer" min={data.today} value={commitDate} onChange={(e) => setCommitDate(e.target.value)} className="mb-2" />
              <CommitVerdict answer={commit} compact />
            </div>
          )}

          <div className="flex flex-col gap-2">
            {!locked && (
              <Button onClick={() => void save()} loading={busy === "save"} disabled={!form.title.trim() || !(form.clientId || form.clientName?.trim())} icon={<Save className="size-4" />} block>
                {quote ? (dirty ? "Guardar cambios" : "Guardado") : "Crear cotización"}
              </Button>
            )}
            {quote && (
              <>
                <a
                  href={`/imprimir/cotizacion/${quote.id}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line-strong font-display text-[15px] font-semibold text-ink-soft hover:border-glow/60 hover:text-ink"
                >
                  <Printer className="size-4" aria-hidden /> Imprimir / PDF
                </a>
                {quote.status === "borrador" && (
                  <Button variant="secondary" block loading={busy === "send"} icon={<Send className="size-4" />} onClick={() => void action("send", { action: "send" }, "Marcada como enviada")}>
                    Marcar como enviada
                  </Button>
                )}
                {(quote.status === "borrador" || quote.status === "enviada") && (
                  <Button variant="success" block icon={<CheckCircle2 className="size-4" />} onClick={() => setApproving(true)}>
                    Aprobada → crear OT
                  </Button>
                )}
                {quote.status === "enviada" && (
                  <Button variant="ghost" block loading={busy === "reject"} icon={<XCircle className="size-4" />} onClick={() => void action("reject", { action: "reject" }, "Marcada como rechazada")}>
                    El cliente la rechazó
                  </Button>
                )}
                {quote.status === "rechazada" && (
                  <Button variant="ghost" block icon={<Undo2 className="size-4" />} onClick={() => void action("draft", { action: "draft" }, "Volvió a borrador")}>
                    Volver a borrador
                  </Button>
                )}
                <Button
                  variant="ghost"
                  block
                  loading={busy === "dup"}
                  icon={<Copy className="size-4" />}
                  onClick={async () => {
                    const r = await action("dup", { action: "duplicate" }, "Copia creada");
                    if (r?.quote) onCreated?.(r.quote);
                  }}
                >
                  Duplicar
                </Button>
                {quote.status === "borrador" && (
                  <Button
                    variant="ghost"
                    block
                    icon={<Trash2 className="size-4" />}
                    onClick={async () => {
                      if (await confirm({ title: `¿Eliminar ${quote.folio}?`, confirmLabel: "Eliminar", danger: true })) {
                        const ok = await run("del", () => api.quotes.remove(quote.id), "Cotización eliminada");
                        if (ok) onClose();
                      }
                    }}
                  >
                    Eliminar borrador
                  </Button>
                )}
                {quote.orderId && (
                  <a href={`/admin/ordenes?o=${quote.orderId}`} className="inline-flex h-11 items-center justify-center gap-2 font-semibold text-glow hover:underline">
                    <FileCheck2 className="size-4" aria-hidden /> Ver la orden de trabajo
                  </a>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
      {approving && quote && <ApproveSheet quote={quote} onClose={() => setApproving(false)} beforeApprove={dirty ? save : undefined} />}
      {dialog}
    </Modal>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn(strong ? "font-semibold text-ink" : "text-muted")}>{label}</dt>
      <dd className={cn(strong ? "font-semibold text-ink" : "text-ink-soft")}>{value}</dd>
    </div>
  );
}

function ApproveSheet({ quote, onClose, beforeApprove }: { quote: QuoteView; onClose: () => void; beforeApprove?: () => Promise<unknown> }) {
  const router = useRouter();
  const { data } = useSync();
  const prod = useProduction();
  const [date, setDate] = useState(addDays(data.today, 7));
  const [time, setTime] = useState("17:00");
  const [condition, setCondition] = useState("");
  const [machines, setMachines] = useState<Record<string, string | null>>({});
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title="Crear orden de trabajo"
      description="Cada línea de horas se vuelve un paso de proceso con su tarea para el puesto de la máquina."
      size="md"
      footer={
        <Button
          variant="success"
          loading={busy === "approve"}
          icon={<CheckCircle2 className="size-4" />}
          onClick={async () => {
            if (beforeApprove && !(await beforeApprove())) return;
            const r = await run("approve", () => api.quotes.action(quote.id, { action: "approve", due: date ? { date, time } : null, condition, machines }), (res) => `Orden ${res.order?.folio ?? ""} creada`);
            if (r?.order) router.push(`/admin/ordenes?o=${r.order.id}`);
          }}
        >
          Crear OT
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Field label="Entrega pactada">{(id) => <Input id={id} type="date" min={data.today} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Hora">{(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
        </div>
        <Field label="Estado en que llegan las piezas">{(id) => <Input id={id} value={condition} onChange={(e) => setCondition(e.target.value)} />}</Field>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-ink-soft">Máquina de cada paso</p>
          {quote.labor
            .filter((l) => l.hours > 0)
            .map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_1.4fr] items-center gap-2">
                <span className="text-sm text-ink">
                  {PROCESS_LABEL[l.process]} · {l.hours} h
                </span>
                <Select aria-label={`Máquina para ${PROCESS_LABEL[l.process]}`} value={machines[l.id] === undefined ? "" : (machines[l.id] ?? "none")} onChange={(e) => {
                    const value = e.target.value;
                    setMachines((m) => {
                      const next = { ...m };
                      if (value === "") delete next[l.id];
                      else next[l.id] = value === "none" ? null : value;
                      return next;
                    });
                  }}>
                  <option value="">Automática (la menos cargada)</option>
                  {prod.machines
                    .filter((m) => m.process === l.process && m.state !== "inactiva")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  <option value="none">Sin máquina fija</option>
                </Select>
              </div>
            ))}
        </div>
      </div>
    </Modal>
  );
}
