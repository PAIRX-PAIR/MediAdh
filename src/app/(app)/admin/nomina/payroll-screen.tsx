"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Download, Plus, Printer, Save, Settings2, Trash2, Wallet } from "lucide-react";
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
/** Hours since the 1st of the month (both quincenas, up to now). */
const monthLabel = (report: PayrollReport, userId: string) => {
  const m = report.monthHours[userId];
  return m ? `${hrs(m.worked)}${m.extra > 0 ? ` · ${hrs(m.extra)} extra` : ""}` : "—";
};

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

  // Las horas del horario suman solas: la pantalla vuelve a leer cada minuto y al volver a la pestaña.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setVersion((v) => v + 1);
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

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
  const totals = {
    nomina: report.lines.reduce((s, l) => s + l.earned, 0),
    seguridad: report.lines.reduce((s, l) => s + l.employerCost, 0),
    prestaciones: report.lines.reduce((s, l) => s + l.prestaciones.total, 0),
    total: report.lines.reduce((s, l) => s + l.earned + l.employerCost, 0),
  };
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

      <style>{`@media print { body * { visibility: hidden !important; } #nomina-impresion, #nomina-impresion * { visibility: visible !important; } #nomina-impresion { position: absolute; inset: 0 0 auto 0; } }`}</style>
      <div id="nomina-impresion" className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
        {money ? (
          <StatTile label="Nómina" value={formatCop(totals.nomina)} hint="Devengado de la quincena" tone="glow" icon={<Wallet />} />
        ) : (
          <StatTile label="Horas trabajadas" value={hrs(report.lines.reduce((s, l) => s + l.workedHours, 0))} tone="glow" />
        )}
        {money ? (
          <StatTile label="Seguridad social" value={formatCop(totals.seguridad)} hint="Asumida por SMI, no se descuenta" tone="pending" />
        ) : (
          <StatTile label="Horas extra" value={hrs(report.lines.reduce((s, l) => s + extraHours(l), 0))} tone="pending" />
        )}
        {money ? (
          <StatTile label="Valor total de las prestaciones sociales" value={formatCop(totals.prestaciones)} hint="Plus de SMI: no se descuenta del neto" />
        ) : null}
        {money ? (
          <StatTile label="Costo con las prestaciones" value={formatCop(totals.total)} hint="Nómina + seguridad social" />
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
                        ["Acumulado del mes", monthLabel(report, l.userId)],
                        [`Básico (${l.paidDays} días)`, formatCop(l.basic)],
                        ["Horas extra", `${hrs(extraHours(l))} · ${formatCop(l.extrasTotal)}`],
                        ["Auxilio de transporte", formatCop(l.transport)],
                        ["Prestaciones sociales (plus de SMI, no se descuentan)", formatCop(l.prestaciones.total)],
                        ["Seguridad social (asumida por SMI)", formatCop(l.employerCost)],
                        ["Costo total del trabajador", formatCop(l.earned + l.employerCost)],
                        ["Neto a pagar", <strong key="net" className="text-glow">{formatCop(l.net)}</strong>],
                      ]
                    : [
                        ["Trabajadas / horario", `${hrs(l.workedHours)} / ${hrs(l.scheduledHours)}`],
                        ["Acumulado del mes", monthLabel(report, l.userId)],
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

      {money && (
        <section aria-labelledby="consolidado-title" className="rounded-xl border border-line p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id="consolidado-title" className="font-display text-lg font-semibold text-ink">
              Consolidado de la quincena
            </h2>
            <Button className="print:hidden" variant="secondary" size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Imprimir
            </Button>
          </div>
          <table className="tabular w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="py-2 font-semibold">Concepto</th>
                <th scope="col" className="py-2 text-right font-semibold">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="py-2 text-ink">NÓMINA</td>
                <td className="py-2 text-right text-ink">{formatCop(totals.nomina)}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="py-2 text-ink">SEGURIDAD SOCIAL</td>
                <td className="py-2 text-right text-ink">{formatCop(totals.seguridad)}</td>
              </tr>
              <tr className="font-semibold">
                <td className="py-2 text-ink">TOTAL GENERAL</td>
                <td className="py-2 text-right text-glow">{formatCop(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
      </div>

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
  const days = line.days.filter((d) => d.workedMinutes > 0 || d.openEntries > 0 || d.absent);
  const markAbsent = async (date: string) => {
    if (!(await confirm({ title: `¿Marcar falta el ${formatDate(date, { weekday: "long", day: "numeric" })}?`, body: "Ese día deja de sumar horas.", confirmLabel: "Marcar falta", danger: true }))) return;
    const ok = await run(`falta-${date}`, () => api.attendance.create({ userId: line.userId, date, start: "00:00", end: "00:01", note: "Falta", absent: true }), "Falta registrada");
    if (ok) await onChanged();
  };

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
              {line.otherDeductions > 0 && (
                <li className="flex justify-between gap-3">
                  <span className="text-ink-soft">Descuentos (anticipos, préstamos…)</span>
                  <span className="tabular text-ink">− {formatCop(line.otherDeductions)}</span>
                </li>
              )}
              <li className="flex justify-between gap-3 border-t border-line pt-1 font-semibold">
                <span className="text-ink">Neto a pagar (sin descontar prestaciones ni seguridad social)</span>
                <span className="tabular text-glow">{formatCop(line.net)}</span>
              </li>
            </ul>
            <h4 className="mb-2 mt-4 text-sm font-semibold text-ink">Seguridad social y prestaciones (asumidas por SMI)</h4>
            <ul className="flex flex-col gap-1 text-sm">
              <li className="flex justify-between gap-3">
                <span className="text-ink-soft">Cesantías ({report.settings.cesantiasPct} %)</span>
                <span className="tabular text-ink">{formatCop(line.prestaciones.cesantias)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-ink-soft">Intereses sobre cesantías ({report.settings.interesesCesantiasPct} %)</span>
                <span className="tabular text-ink">{formatCop(line.prestaciones.intereses)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-ink-soft">Prima ({report.settings.primaPct} %)</span>
                <span className="tabular text-ink">{formatCop(line.prestaciones.prima)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-ink-soft">Vacaciones ({report.settings.vacacionesPct} % del básico)</span>
                <span className="tabular text-ink">{formatCop(line.prestaciones.vacaciones)}</span>
              </li>
              <li className="flex justify-between gap-3 border-t border-line pt-1 font-semibold">
                <span className="text-ink">Total prestaciones sociales (plus de SMI, no se descuentan del neto)</span>
                <span className="tabular text-ink">{formatCop(line.prestaciones.total)}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-ink-soft">Aportes del empleador (pensión, caja, ARL{report.settings.exoneracionParafiscales ? "" : ", salud, SENA, ICBF"})</span>
                <span className="tabular text-ink">{formatCop(line.aportes)}</span>
              </li>
              <li className="flex justify-between gap-3 border-t border-line pt-1 font-semibold">
                <span className="text-ink">Costo total del trabajador (nómina + seguridad social)</span>
                <span className="tabular text-glow">{formatCop(line.earned + line.employerCost)}</span>
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
                        {d.auto && <Chip tone="neutral">Automático (horario)</Chip>}
                        {d.absent && <Chip tone="blocked">Falta</Chip>}
                        <span className="tabular text-muted">
                          {hrs(d.workedMinutes / 60)} trabajadas{extra > 0 ? ` · ${hrs(extra / 60)} extra` : ""}
                        </span>
                        {d.auto && (
                          <Button size="sm" variant="ghost" loading={busy === `falta-${d.date}`} onClick={() => void markAbsent(d.date)}>
                            Marcar falta
                          </Button>
                        )}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {entries
                        .filter((e) => e.date === d.date && e.absent)
                        .map((e) => (
                          <li key={e.id} className="flex items-center justify-between gap-2 text-sm text-muted">
                            <span>Falta registrada{e.note && e.note !== "Falta" ? ` · ${e.note}` : ""}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busy === `rm-${e.id}`}
                              onClick={async () => {
                                const ok = await run(`rm-${e.id}`, () => api.attendance.remove(e.id), "Falta quitada");
                                if (ok) await onChanged();
                              }}
                            >
                              Quitar falta
                            </Button>
                          </li>
                        ))}
                      {entries
                        .filter((e) => e.date === d.date && !e.absent)
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
  type PctKey = { [K in keyof PayrollSettings]: PayrollSettings[K] extends number ? K : never }[keyof PayrollSettings];
  const pct = (k: PctKey, label: string, hint?: string) => (
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
        <label className="flex items-start gap-2 text-sm text-ink-soft sm:col-span-2">
          <input type="checkbox" checked={form.autoAttendance} onChange={(e) => set("autoAttendance", e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-glow)]" />
          <span>
            <span className="font-semibold text-ink">Sumar solas las horas del horario cada día</span>
            <span className="block text-xs text-muted">Desde el inicio del contrato, cada día de trabajo suma sus turnos al terminar. Lo que se registre a mano o una falta reemplaza ese día.</span>
          </span>
        </label>
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
        <h3 className="font-semibold text-ink sm:col-span-2">Prestaciones sociales (se provisionan cada quincena)</h3>
        {pct("cesantiasPct", "Cesantías", "Ley: 8,33 % del salario, horas extra y auxilio")}
        {pct("interesesCesantiasPct", "Intereses sobre cesantías", "Ley: 12 % anual de cesantías = 1 % mensual")}
        {pct("primaPct", "Prima de servicios", "Ley: 8,33 % del salario, horas extra y auxilio")}
        {pct("vacacionesPct", "Vacaciones", "Ley: 4,17 % solo del básico")}
        <h3 className="font-semibold text-ink sm:col-span-2">Aportes del empleador</h3>
        {pct("pensionEmpleadorPct", "Pensión del empleador", "Ley: 12 %")}
        {pct("cajaPct", "Caja de compensación", "Ley: 4 %")}
        {pct("arlPct", "ARL", "Riesgo I (taller): 0,522 %")}
        <label className="flex items-start gap-2 text-sm text-ink-soft sm:col-span-2">
          <input type="checkbox" checked={form.exoneracionParafiscales} onChange={(e) => set("exoneracionParafiscales", e.target.checked)} className="mt-0.5 size-5 accent-[var(--color-glow)]" />
          <span>
            <span className="font-semibold text-ink">Exonerados de salud, SENA e ICBF</span>
            <span className="block text-xs text-muted">Aplica si el sueldo es menor a 10 SMMLV (art. 114-1 ET). Si está apagado, el empleador paga también salud, SENA e ICBF.</span>
          </span>
        </label>
        {!form.exoneracionParafiscales && (
          <>
            {pct("saludEmpleadorPct", "Salud del empleador", "Ley: 8,5 %")}
            {pct("senaPct", "SENA", "Ley: 2 %")}
            {pct("icbfPct", "ICBF", "Ley: 3 %")}
          </>
        )}
      </div>
    </Modal>
  );
}
