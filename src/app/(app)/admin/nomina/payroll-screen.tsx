"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Download, Plus, Save, Settings2, Trash2, Wallet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyValues, MoneyInput, NumberInput, PageHeader, StatTile, TimeInput } from "@/components/ui/kit";
import { Modal, useConfirm } from "@/components/ui/overlay";
import { Button, Chip, EmptyState, Field, IconButton, Input, Panel, Spinner } from "@/components/ui/primitives";
import { api, type PayrollReport } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDate } from "@/lib/domain/labels";
import { HOUR_KINDS, HOUR_KIND_LABEL, hourFactor, type PayrollLine } from "@/lib/domain/payroll";
import { formatCop } from "@/lib/domain/quote";
import { AdjustmentsEditor } from "@/components/production/pay-editor";
import type { PayrollSettings } from "@/lib/domain/schema";

const hrs = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })} h`;
const EXTRA_KINDS = HOUR_KINDS.filter((k) => k !== "holidayOrdinary");
const extraHours = (l: PayrollLine) => EXTRA_KINDS.reduce((sum, k) => sum + l.hours[k], 0);

function periodLabel(r: PayrollReport) {
  return `${formatDate(r.quincena.from, { day: "numeric" })} al ${formatDate(r.quincena.to, { day: "numeric", month: "long", year: "numeric" })}`;
}

/** Nómina quincenal: horas extra a partir del registro de horas, sueldos y neto a pagar el 15 y el 30. */
export function PayrollScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const key = params.get("q") ?? undefined;
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [config, setConfig] = useState(false);

  const [version, setVersion] = useState(0);
  const load = async () => setVersion((v) => v + 1);

  useEffect(() => {
    api.payroll
      .report(key)
      .then((r) => {
        setReport(r);
        setFailed(null);
      })
      .catch((error) => setFailed(error instanceof Error ? error.message : "No se pudo cargar la nómina."));
  }, [key, version]);

  const go = (q: string) => router.replace(`${pathname}?q=${q}`, { scroll: false });

  if (!report) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader eyebrow="Equipo" title="Nómina" />
        {failed ? <EmptyState icon={<AlertTriangle />} title="No se pudo cargar" body={failed} action={<Button onClick={() => void load()}>Reintentar</Button>} /> : <Spinner />}
      </div>
    );
  }

  const money = !report.moneyHidden;
  const missingSalary = money ? report.lines.filter((l) => l.monthlySalary === null) : [];
  const open = report.lines.reduce((sum, l) => sum + l.openEntries, 0);
  const person = report.lines.find((l) => l.userId === personId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Equipo"
        title="Nómina"
        description={`Quincena del ${periodLabel(report)} · pago el ${formatDate(report.quincena.payDate, { weekday: "long", day: "numeric", month: "long" })}.`}
        actions={
          <>
            <IconButton label="Quincena anterior" onClick={() => go(report.previous)}>
              <ChevronLeft className="size-5" />
            </IconButton>
            {report.quincena.key !== report.current && (
              <Button variant="ghost" size="sm" onClick={() => go(report.current)}>
                Actual
              </Button>
            )}
            <IconButton label="Quincena siguiente" onClick={() => go(report.next)}>
              <ChevronRight className="size-5" />
            </IconButton>
            {money && (
              <a
                href={api.exportUrl("nomina", report.quincena.key)}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink-soft hover:border-glow/60 hover:text-ink"
              >
                <Download className="size-4" aria-hidden /> Excel
              </a>
            )}
            {money && (
              <Button variant="secondary" icon={<Settings2 className="size-4" />} onClick={() => setConfig(true)}>
                Reglas
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        {money ? (
          <StatTile label="Neto a pagar" value={formatCop(report.lines.reduce((s, l) => s + l.net, 0))} tone="glow" icon={<Wallet />} />
        ) : (
          <StatTile label="Horas trabajadas" value={hrs(report.lines.reduce((s, l) => s + l.workedHours, 0))} tone="glow" />
        )}
        <StatTile label="Horas extra" value={hrs(report.lines.reduce((s, l) => s + extraHours(l), 0))} tone="pending" />
        {money ? (
          <StatTile label="Valor extras" value={formatCop(report.lines.reduce((s, l) => s + l.extrasTotal, 0))} />
        ) : (
          <StatTile label="Sin salida" value={open} tone={open ? "pending" : "neutral"} />
        )}
        <StatTile label="Personas" value={report.lines.length} hint={money ? `${missingSalary.length} sin sueldo` : undefined} tone={missingSalary.length ? "pending" : "neutral"} />
      </div>

      {(missingSalary.length > 0 || open > 0) && (
        <div className="flex flex-col gap-2">
          {missingSalary.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-pending/40 bg-pending/10 p-3 text-sm text-pending">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Falta el sueldo de {missingSalary.map((l) => l.name).join(", ")}. Ábrelos para ponerlo; sin sueldo las horas se cuentan pero no se valoran.
            </p>
          )}
          {open > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-pending/40 bg-pending/10 p-3 text-sm text-pending">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Hay {open} registro(s) sin salida: no cuentan hasta que se corrijan.
            </p>
          )}
        </div>
      )}

      {report.lines.length === 0 ? (
        <EmptyState icon={<Wallet />} title="Nadie en la nómina todavía" body="Aparecen aquí las personas del equipo con cuenta activa." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {report.lines.map((l) => (
            <Panel as="article" key={l.userId}>
              <header className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-semibold text-ink">{l.name}</p>
                  <p className="text-sm text-muted">
                    {report.people.find((p) => p.id === l.userId)?.positionTitle ?? "Sin puesto"}
                    {money ? ` · ${l.monthlySalary === null ? "sin sueldo" : `${formatCop(l.monthlySalary)}/mes`}` : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {money && l.monthlySalary === null && <Chip tone="pending">Falta sueldo</Chip>}
                  {l.openEntries > 0 && <Chip tone="blocked">{l.openEntries} sin salida</Chip>}
                </div>
              </header>
              <KeyValues
                items={
                  money
                    ? [
                        ["Trabajadas / horario", `${hrs(l.workedHours)} / ${hrs(l.scheduledHours)}`],
                        [`Básico (${l.paidDays} días)`, formatCop(l.basic)],
                        ["Horas extra", `${hrs(extraHours(l))} · ${formatCop(l.extrasTotal)}`],
                        ["Auxilio de transporte", formatCop(l.transport)],
                        ["Salud + pensión", `− ${formatCop(l.health + l.pension)}`],
                        ["Neto a pagar", <strong key="net" className="text-glow">{formatCop(l.net)}</strong>],
                      ]
                    : [
                        ["Trabajadas / horario", `${hrs(l.workedHours)} / ${hrs(l.scheduledHours)}`],
                        ["Horas extra", hrs(extraHours(l))],
                        ...EXTRA_KINDS.filter((k) => l.hours[k] > 0).map((k): [string, string] => [HOUR_KIND_LABEL[k], hrs(l.hours[k])]),
                      ]
                }
              />
              <Button className="mt-3" variant="secondary" size="sm" onClick={() => setPersonId(l.userId)}>
                {money ? "Horas y sueldo" : "Registro de horas"}
              </Button>
            </Panel>
          ))}
        </div>
      )}

      <p className="text-xs text-muted">
        Todo lo trabajado fuera del horario del taller es hora extra; domingos y festivos suman el recargo dominical.
        {money
          ? ` El valor hora es el sueldo mensual ÷ ${report.settings.monthlyHours} h. Es un cálculo de apoyo: confírmalo con tu contador antes de pagar.`
          : " Los sueldos y valores los ve solo gerencia o administración."}
      </p>

      {person && <PersonModal report={report} line={person} onClose={() => setPersonId(null)} onChanged={load} />}
      {config && <RulesModal settings={report.settings} onClose={() => setConfig(false)} onSaved={load} />}
    </div>
  );
}

function PersonModal({ report, line, onClose, onChanged }: { report: PayrollReport; line: PayrollLine; onClose: () => void; onChanged: () => Promise<void> }) {
  const person = report.people.find((p) => p.id === line.userId)!;
  const [salary, setSalary] = useState<number | null>(person.monthlySalary);
  const [transport, setTransport] = useState(person.transportAllowance);
  const [draft, setDraft] = useState({ date: report.quincena.from, start: "", end: "", note: "" });
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();
  const entries = report.entries.filter((e) => e.userId === line.userId);
  const days = line.days.filter((d) => d.workedMinutes > 0 || d.openEntries > 0);

  return (
    <Modal open onClose={onClose} title={line.name} description={`Quincena del ${periodLabel(report)}`} size="xl">
      <div className="flex flex-col gap-5">
        {!report.moneyHidden && (
          <section aria-labelledby="sueldo-title" className="rounded-xl border border-line bg-night/40 p-3">
            <h3 id="sueldo-title" className="mb-2 font-semibold text-ink">
              Sueldo
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Sueldo mensual">{(id) => <MoneyInput id={id} value={salary} onChange={setSalary} />}</Field>
              <label className="flex h-11 items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" checked={transport} onChange={(e) => setTransport(e.target.checked)} className="size-5 accent-[var(--color-glow)]" />
                Recibe auxilio de transporte
              </label>
              <Button
                loading={busy === "pay"}
                icon={<Save className="size-4" />}
                onClick={async () => {
                  const ok = await run("pay", () => api.payroll.setPay(line.userId, { monthlySalary: salary, transportAllowance: transport }), "Sueldo guardado");
                  if (ok) await onChanged();
                }}
              >
                Guardar
              </Button>
            </div>
            {line.monthlySalary !== null && <p className="mt-2 text-xs text-muted">Valor hora ordinaria: {formatCop(line.hourlyValue)}</p>}
          </section>
        )}

        {!report.moneyHidden && (
          <section aria-labelledby="extras-title">
            <h3 id="extras-title" className="mb-2 font-semibold text-ink">
              Liquidación
            </h3>
            <ul className="flex flex-col gap-1 text-sm">
              <li className="flex justify-between gap-3">
                <span className="text-ink-soft">Básico ({line.paidDays} días)</span>
                <span className="tabular text-ink">{formatCop(line.basic)}</span>
              </li>
              {HOUR_KINDS.filter((k) => line.hours[k] > 0).map((k) => (
                <li key={k} className="flex justify-between gap-3">
                  <span className="text-ink-soft">
                    {HOUR_KIND_LABEL[k]} · {hrs(line.hours[k])} × {hourFactor(k, report.settings).toLocaleString("es-CO")}
                  </span>
                  <span className="tabular text-ink">{formatCop(line.amounts[k])}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3">
                <span className="text-ink-soft">Auxilio de transporte</span>
                <span className="tabular text-ink">{formatCop(line.transport)}</span>
              </li>
              {line.bonuses > 0 && (
                <li className="flex justify-between gap-3">
                  <span className="text-ink-soft">Bonificaciones</span>
                  <span className="tabular text-ink">{formatCop(line.bonuses)}</span>
                </li>
              )}
              <li className="flex justify-between gap-3 border-t border-line pt-1">
                <span className="text-ink-soft">Devengado</span>
                <span className="tabular text-ink">{formatCop(line.earned)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-ink-soft">
                  Salud ({report.settings.healthPct} %) y pensión ({report.settings.pensionPct} %)
                </span>
                <span className="tabular text-ink">− {formatCop(line.health + line.pension)}</span>
              </li>
              {line.otherDeductions > 0 && (
                <li className="flex justify-between gap-3">
                  <span className="text-ink-soft">Descuentos (anticipos, préstamos…)</span>
                  <span className="tabular text-ink">− {formatCop(line.otherDeductions)}</span>
                </li>
              )}
              <li className="flex justify-between gap-3 border-t border-line pt-1 font-semibold">
                <span className="text-ink">Neto a pagar</span>
                <span className="tabular text-glow">{formatCop(line.net)}</span>
              </li>
            </ul>
            <h4 className="mb-2 mt-4 text-sm font-semibold text-ink">Bonificaciones y descuentos de esta quincena</h4>
            <AdjustmentsEditor userId={line.userId} report={report} onChanged={onChanged} />
          </section>
        )}

        <section aria-labelledby="dias-title">
          <h3 id="dias-title" className="mb-2 font-semibold text-ink">
            Registro de horas
          </h3>
          {days.length === 0 ? (
            <p className="text-sm text-muted">Sin registros en esta quincena.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {days.map((d) => {
                const extra = EXTRA_KINDS.reduce((s, k) => s + d.minutes[k], 0);
                return (
                  <li key={d.date} className="rounded-xl border border-line p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="inline-block font-semibold text-ink first-letter:uppercase">{formatDate(d.date, { weekday: "long", day: "numeric", month: "short" })}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        {d.special && <Chip tone="pending">{d.special}</Chip>}
                        <span className="tabular text-muted">
                          {hrs(d.workedMinutes / 60)} trabajadas{extra > 0 ? ` · ${hrs(extra / 60)} extra` : ""}
                        </span>
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {entries
                        .filter((e) => e.date === d.date)
                        .map((e) => (
                          <EntryRow
                            key={`${e.id}-${e.start}-${e.end}`}
                            entry={e}
                            onSaved={onChanged}
                            onDelete={async () => {
                              if (await confirm({ title: `¿Eliminar el registro de ${e.start} a ${e.end ?? "…"}?`, confirmLabel: "Eliminar", danger: true })) {
                                const ok = await run(`rm-${e.id}`, () => api.attendance.remove(e.id), "Registro eliminado");
                                if (ok) await onChanged();
                              }
                            }}
                          />
                        ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-line p-3">
            <Field label="Fecha">
              {(id) => <Input id={id} type="date" min={report.quincena.from} max={report.quincena.to} value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="w-auto" />}
            </Field>
            <Field label="Entrada">{(id) => <TimeInput id={id} value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />}</Field>
            <Field label="Salida">{(id) => <TimeInput id={id} value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />}</Field>
            <Field label="Nota" className="min-w-40 flex-1">
              {(id) => <Input id={id} value={draft.note} maxLength={200} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />}
            </Field>
            <Button
              loading={busy === "add"}
              disabled={!draft.date || !draft.start}
              icon={<Plus className="size-4" />}
              onClick={async () => {
                const ok = await run(
                  "add",
                  () => api.attendance.create({ userId: line.userId, date: draft.date, start: draft.start, end: draft.end || null, note: draft.note }),
                  "Registro agregado",
                );
                if (ok) {
                  setDraft({ ...draft, start: "", end: "", note: "" });
                  await onChanged();
                }
              }}
            >
              Agregar
            </Button>
          </div>
        </section>
      </div>
      {dialog}
    </Modal>
  );
}

function EntryRow({ entry, onSaved, onDelete }: { entry: PayrollReport["entries"][number]; onSaved: () => Promise<void>; onDelete: () => void }) {
  const [start, setStart] = useState(entry.start);
  const [end, setEnd] = useState(entry.end ?? "");
  const { run, busy } = useAction();
  const dirty = start !== entry.start || (end || null) !== entry.end;
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <TimeInput aria-label="Entrada" value={start} onChange={(e) => setStart(e.target.value)} className="h-9" />
      <span className="text-muted">a</span>
      <TimeInput aria-label="Salida" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9" />
      {entry.end === null && <Chip tone="blocked">Sin salida</Chip>}
      <span className="text-xs text-muted">{entry.source === "admin" ? "Coordinador" : "Operario"}</span>
      {entry.note && <span className="text-xs text-ink-soft">“{entry.note}”</span>}
      <span className="ml-auto flex items-center gap-1">
        {dirty && (
          <Button
            size="sm"
            loading={busy === "save"}
            onClick={async () => {
              const ok = await run("save", () => api.attendance.update(entry.id, { start, end: end || null }), "Registro corregido");
              if (ok) await onSaved();
            }}
          >
            Guardar
          </Button>
        )}
        <IconButton label="Eliminar registro" onClick={onDelete}>
          <Trash2 className="size-4" />
        </IconButton>
      </span>
    </li>
  );
}

function RulesModal({ settings, onClose, onSaved }: { settings: PayrollSettings; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(settings);
  const { run, busy } = useAction();
  const set = <K extends keyof PayrollSettings>(k: K, v: PayrollSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const pct = (k: "extraDayPct" | "extraNightPct" | "sundayHolidayPct" | "healthPct" | "pensionPct", label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      {(id, d) => <NumberInput id={id} ariaDescribedBy={d} max={300} value={form[k]} onChange={(v) => set(k, v ?? 0)} suffix="%" />}
    </Field>
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Reglas de la nómina"
      description="Valores por defecto según la ley colombiana vigente en 2026. Ajústalos con tu contador si cambian."
      size="lg"
      footer={
        <Button
          loading={busy === "rules"}
          icon={<Save className="size-4" />}
          onClick={async () => {
            const ok = await run("rules", () => api.payroll.updateSettings(form), "Reglas guardadas");
            if (ok) {
              await onSaved();
              onClose();
            }
          }}
        >
          Guardar reglas
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Horas al mes para el valor hora" hint="Sueldo ÷ estas horas. Con 42 h semanales: 42 × 5 = 210.">
          {(id, d) => <NumberInput id={id} ariaDescribedBy={d} min={1} max={400} value={form.monthlyHours} onChange={(v) => set("monthlyHours", v ?? 210)} suffix="h" />}
        </Field>
        <Field label="Auxilio de transporte mensual" hint="Valor del año; se paga la mitad en cada quincena a quien lo tenga.">
          {(id, d) => <MoneyInput id={id} ariaDescribedBy={d} value={form.transportAllowance} onChange={(v) => set("transportAllowance", v ?? 0)} allowEmpty={false} />}
        </Field>
        {pct("extraDayPct", "Recargo hora extra diurna", "Ley: 25 %")}
        {pct("extraNightPct", "Recargo hora extra nocturna", "Ley: 75 %")}
        {pct("sundayHolidayPct", "Recargo dominical y festivo", "Ley 2466/2025: 90 % desde jul-2026, 100 % desde jul-2027")}
        <Field label="Contar extras en bloques de" hint="Por día; 0 = minuto a minuto.">
          {(id, d) => <NumberInput id={id} ariaDescribedBy={d} integer max={60} value={form.roundingMinutes} onChange={(v) => set("roundingMinutes", v ?? 0)} suffix="min" />}
        </Field>
        <Field label="Inicio de la jornada nocturna" hint="Ley 2466/2025: 7:00 p. m.">
          {(id, d) => <Input id={id} aria-describedby={d} type="time" value={form.nightStart} onChange={(e) => set("nightStart", e.target.value)} />}
        </Field>
        <Field label="Fin de la jornada nocturna">{(id) => <Input id={id} type="time" value={form.nightEnd} onChange={(e) => set("nightEnd", e.target.value)} />}</Field>
        {pct("healthPct", "Descuento salud (trabajador)", "Ley: 4 %")}
        {pct("pensionPct", "Descuento pensión (trabajador)", "Ley: 4 %")}
      </div>
    </Modal>
  );
}
