"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Flag, Plus, Save, Target, Trash2, Trophy } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MoneyInput, NumberInput, PageHeader, StatTile } from "@/components/ui/kit";
import { Modal } from "@/components/ui/overlay";
import { Button, Chip, EmptyState, Field, IconButton, Input, Panel, Select, Spinner, cn } from "@/components/ui/primitives";
import { request } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import type { GoalProgress } from "@/lib/domain/finance";
import { formatDate } from "@/lib/domain/labels";
import { formatCop } from "@/lib/domain/quote";
import type { Goal } from "@/lib/domain/schema";

interface FinanceReport {
  month: string;
  previous: string;
  next: string;
  current: string;
  quincenas: { q1: { from: string; to: string; payDate: string }; q2: { from: string; to: string; payDate: string } };
  sales: number;
  supplies: number;
  payrollQ1: number;
  payrollQ2: number;
  employerCost: number;
  employerCostPct: number;
  profit: number;
  orders: Array<{ id: string; folio: string; clientName: string; title: string; deliveredOn: string; price: number; supplies: number; invoiced: boolean }>;
  withoutPrice: number;
  missingSalaries: string[];
  payroll: Array<{
    userId: string;
    name: string;
    positionTitle: string | null;
    q1: { net: number; earned: number; extras: number };
    q2: { net: number; earned: number; extras: number };
    net: number;
    cost: number;
  }>;
  goals: { goals: Goal[]; goalBasis: "ventas" | "ganancia"; employerCostPct: number; value: number; progress: GoalProgress };
}

const monthLabel = (month: string) => formatDate(`${month}-15`, { month: "long", year: "numeric" });
const millions = (n: number) => `${(n / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;

/** Ventas del mes, menos insumos y las dos quincenas, lo que se paga a cada quien y las metas. */
export function FinanceScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const month = params.get("mes") ?? undefined;
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [editingGoals, setEditingGoals] = useState(false);

  useEffect(() => {
    request<FinanceReport>(`/api/admin/finanzas${month ? `?mes=${month}` : ""}`)
      .then((r) => {
        setReport(r);
        setFailed(null);
      })
      .catch((e) => setFailed(e instanceof Error ? e.message : "No se pudo cargar."));
  }, [month, version]);

  if (!report) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader eyebrow="Producción" title="Ganancias del mes" />
        {failed ? <EmptyState icon={<AlertTriangle />} title="No se pudo cargar" body={failed} /> : <Spinner />}
      </div>
    );
  }

  const go = (m: string) => router.replace(`${pathname}?mes=${m}`, { scroll: false });
  const payroll = report.payrollQ1 + report.payrollQ2 + report.employerCost;
  const { q1, q2 } = report.quincenas;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Producción"
        title="Ganancias del mes"
        description={`${monthLabel(report.month)} · ventas de los trabajos entregados (antes de IVA), menos insumos y nómina.`}
        actions={
          <>
            <IconButton label="Mes anterior" onClick={() => go(report.previous)}>
              <ChevronLeft className="size-5" />
            </IconButton>
            {report.month !== report.current && (
              <Button variant="ghost" size="sm" onClick={() => go(report.current)}>
                Este mes
              </Button>
            )}
            <IconButton label="Mes siguiente" onClick={() => go(report.next)}>
              <ChevronRight className="size-5" />
            </IconButton>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Ventas del mes" value={formatCop(report.sales)} hint={`${report.orders.length} trabajo(s) entregado(s)`} tone="glow" />
        <StatTile label="Insumos" value={formatCop(report.supplies)} />
        <StatTile label="Nómina (2 quincenas)" value={formatCop(payroll)} hint={report.employerCostPct > 0 ? `incluye carga prestacional ${report.employerCostPct} %` : "sin carga prestacional"} />
        <StatTile label="Ganancia" value={formatCop(report.profit)} tone={report.profit >= 0 ? "done" : "blocked"} />
      </div>

      {(report.withoutPrice > 0 || report.missingSalaries.length > 0) && (
        <div className="flex flex-col gap-2">
          {report.withoutPrice > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-pending/40 bg-pending/10 p-3 text-sm text-pending">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {report.withoutPrice} trabajo(s) entregado(s) sin precio: no suman a las ventas.
            </p>
          )}
          {report.missingSalaries.length > 0 && (
            <p className="flex items-start gap-2 rounded-xl border border-pending/40 bg-pending/10 p-3 text-sm text-pending">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Falta el sueldo de {report.missingSalaries.join(", ")} (Nómina): la nómina sale incompleta.
            </p>
          )}
        </div>
      )}

      <GoalsPanel report={report} onEdit={() => setEditingGoals(true)} />

      <Panel>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Del ingreso a la ganancia</h2>
        <dl className="tabular flex max-w-xl flex-col gap-1.5 text-sm">
          <Row label="Ventas del mes" value={formatCop(report.sales)} strong />
          <Row label="− Insumos de esos trabajos" value={`− ${formatCop(report.supplies)}`} />
          <Row label={`− Quincena 1 (${formatDate(q1.from, { day: "numeric" })}–${formatDate(q1.to, { day: "numeric", month: "short" })})`} value={`− ${formatCop(report.payrollQ1)}`} />
          <Row label={`− Quincena 2 (${formatDate(q2.from, { day: "numeric" })}–${formatDate(q2.to, { day: "numeric", month: "short" })})`} value={`− ${formatCop(report.payrollQ2)}`} />
          <Row label={`− Carga prestacional (${report.employerCostPct} %)`} value={`− ${formatCop(report.employerCost)}`} />
          <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
            <dt className="font-display font-semibold text-ink">Queda para el taller</dt>
            <dd className={cn("font-display text-2xl font-bold", report.profit >= 0 ? "text-done" : "text-blocked")}>{formatCop(report.profit)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted">
          Las quincenas cuentan lo devengado (sueldo, horas extra y auxilio). La carga prestacional es lo que la empresa paga además (seguridad social del empleador, ARL, caja,
          prima, cesantías y vacaciones).{" "}
          {report.employerCostPct === 0 && <strong className="text-pending">Está en 0 %: pide el porcentaje a tu contador y ponlo en «Editar metas».</strong>}
        </p>
      </Panel>

      <Panel>
        <h2 className="mb-1 font-display text-lg font-semibold text-ink">Pago a cada quien</h2>
        <p className="mb-3 text-sm text-muted">Neto a pagar en cada quincena, lado a lado.</p>
        {report.payroll.length === 0 ? (
          <p className="text-sm text-muted">Sin personas en la nómina.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-panel text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Persona</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Quincena 1<span className="block font-normal">pago {formatDate(q1.payDate, { day: "numeric", month: "short" })}</span>
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Quincena 2<span className="block font-normal">pago {formatDate(q2.payDate, { day: "numeric", month: "short" })}</span>
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">Total del mes</th>
                </tr>
              </thead>
              <tbody>
                {report.payroll.map((p) => (
                  <tr key={p.userId} className="border-t border-line/60">
                    <td className="px-3 py-2">
                      <span className="block font-semibold text-ink">{p.name}</span>
                      <span className="block text-xs text-muted">{p.positionTitle ?? "Sin puesto"}</span>
                    </td>
                    <td className="tabular px-3 py-2 text-right text-ink">
                      {formatCop(p.q1.net)}
                      {p.q1.extras > 0 && <span className="block text-xs text-pending">incl. {formatCop(p.q1.extras)} extras</span>}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-ink">
                      {formatCop(p.q2.net)}
                      {p.q2.extras > 0 && <span className="block text-xs text-pending">incl. {formatCop(p.q2.extras)} extras</span>}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-semibold text-glow">{formatCop(p.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line bg-panel/60 font-semibold">
                  <td className="px-3 py-2 text-ink">Total a pagar</td>
                  <td className="tabular px-3 py-2 text-right text-ink">{formatCop(report.payroll.reduce((s, p) => s + p.q1.net, 0))}</td>
                  <td className="tabular px-3 py-2 text-right text-ink">{formatCop(report.payroll.reduce((s, p) => s + p.q2.net, 0))}</td>
                  <td className="tabular px-3 py-2 text-right text-glow">{formatCop(report.payroll.reduce((s, p) => s + p.net, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <h2 className="mb-3 font-display text-lg font-semibold text-ink">Trabajos entregados en el mes</h2>
        {report.orders.length === 0 ? (
          <p className="text-sm text-muted">Ningún trabajo entregado todavía este mes.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line/60">
            {report.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="tabular font-mono font-semibold text-glow">{o.folio}</span> <span className="text-ink">{o.title}</span>
                  <span className="block text-xs text-muted">
                    {o.clientName} · {formatDate(o.deliveredOn, { day: "numeric", month: "short" })}
                    {o.supplies > 0 ? ` · insumos ${formatCop(o.supplies)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {!o.invoiced && <Chip tone="pending">Sin factura</Chip>}
                  <span className="tabular font-semibold text-ink">{formatCop(o.price)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editingGoals && (
        <GoalsModal
          goals={report.goals.goals}
          basis={report.goals.goalBasis}
          employerCostPct={report.goals.employerCostPct}
          onClose={() => setEditingGoals(false)}
          onSaved={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={strong ? "font-semibold text-ink" : "text-ink-soft"}>{label}</dt>
      <dd className={strong ? "font-semibold text-ink" : "text-ink"}>{value}</dd>
    </div>
  );
}

function GoalsPanel({ report, onEdit }: { report: FinanceReport; onEdit: () => void }) {
  const { goals, goalBasis, value, progress } = report.goals;
  const sorted = [...goals].filter((g) => g.amount > 0).sort((a, b) => a.amount - b.amount);
  const top = sorted[sorted.length - 1]?.amount ?? 0;
  const basisLabel = goalBasis === "ventas" ? "ventas" : "ganancia";
  return (
    <Panel>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Target className="size-5 text-glow" aria-hidden /> Metas del mes
          </h2>
          <p className="text-sm text-muted">
            Llevas <strong className="text-ink">{formatCop(value)}</strong> en {basisLabel}.{" "}
            {progress.next ? (
              <>
                Faltan <strong className="text-pending">{formatCop(progress.missing)}</strong> para {progress.next.label} ({millions(progress.next.amount)}).
              </>
            ) : sorted.length > 0 ? (
              <strong className="text-done">¡Todas las metas cumplidas!</strong>
            ) : null}
          </p>
        </div>
        <Button variant="secondary" size="sm" icon={<Flag className="size-4" />} onClick={onEdit}>
          Editar metas
        </Button>
      </div>
      {top > 0 && (
        <div className="relative pb-3 pt-2 sm:pb-12">
          <div className="h-4 overflow-hidden rounded-full bg-night/80 ring-1 ring-line" role="progressbar" aria-label={`Avance hacia ${millions(top)}`} aria-valuemin={0} aria-valuemax={top} aria-valuenow={Math.max(0, value)}>
            <div className="h-full rounded-full bg-gradient-to-r from-navy-400 to-glow transition-[width] duration-700" style={{ width: `${progress.ratio * 100}%` }} />
          </div>
          {sorted.map((g) => {
            const left = (g.amount / top) * 100;
            const done = value >= g.amount;
            return (
              <div key={`${g.label}-${g.amount}`} className="absolute top-1 flex -translate-x-1/2 flex-col items-center" style={{ left: `clamp(1.5rem, ${left}%, calc(100% - 1.5rem))` }}>
                <span className={cn("h-6 w-0.5", done ? "bg-done" : "bg-line-strong")} aria-hidden />
                <span className={cn("mt-1 hidden items-center gap-0.5 whitespace-nowrap text-[11px] font-semibold sm:flex", done ? "text-done" : g.bonus ? "text-pending" : "text-muted")}>
                  {g.bonus && <Trophy className="size-3" aria-hidden />}
                  {millions(g.amount)}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <ul className="flex flex-wrap gap-2">
        {sorted.map((g) => (
          <li key={`${g.label}-${g.amount}`}>
            <Chip tone={value >= g.amount ? "done" : g.bonus ? "pending" : "neutral"}>
              {g.label}: {formatCop(g.amount)}
            </Chip>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function GoalsModal({
  goals,
  basis,
  employerCostPct,
  onClose,
  onSaved,
}: {
  goals: Goal[];
  basis: "ventas" | "ganancia";
  employerCostPct: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState(goals);
  const [goalBasis, setGoalBasis] = useState(basis);
  const [employer, setEmployer] = useState<number | null>(employerCostPct);
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title="Metas y costos del mes"
      description="En pesos, antes de IVA. Se comparan con las ventas o con la ganancia del mes."
      size="md"
      footer={
        <Button
          loading={busy === "g"}
          icon={<Save className="size-4" />}
          onClick={async () => {
            const ok = await run("g", () => request("/api/admin/settings", { method: "PATCH", body: { finance: { goals: rows, goalBasis, employerCostPct: employer ?? 0 } } }), "Metas guardadas");
            if (ok) {
              onSaved();
              onClose();
            }
          }}
        >
          Guardar metas
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Las metas miden">
          {(id) => (
            <Select id={id} value={goalBasis} onChange={(e) => setGoalBasis(e.target.value as "ventas" | "ganancia")}>
              <option value="ventas">Las ventas del mes</option>
              <option value="ganancia">Lo que queda después de insumos y nómina</option>
            </Select>
          )}
        </Field>
        <Field label="Carga prestacional" hint="% sobre sueldo y horas extra que la empresa paga además (dato de tu contador).">
          {(id, d) => <NumberInput id={id} ariaDescribedBy={d} max={200} value={employer} onChange={setEmployer} suffix="%" />}
        </Field>
        {rows.map((g, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input aria-label="Nombre de la meta" className="min-w-32 flex-1" value={g.label} maxLength={40} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} />
            <MoneyInput className="w-40" value={g.amount} allowEmpty={false} onChange={(v) => setRows(rows.map((r, j) => (j === i ? { ...r, amount: v ?? 0 } : r)))} />
            <label className="flex items-center gap-1 text-xs text-ink-soft">
              <input type="checkbox" checked={g.bonus} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, bonus: e.target.checked } : r)))} className="size-4 accent-[var(--color-glow)]" />
              Bonus
            </label>
            <IconButton label="Quitar meta" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
        {rows.length < 10 && (
          <Button variant="ghost" size="sm" className="self-start" icon={<Plus className="size-4" />} onClick={() => setRows([...rows, { label: `Meta ${rows.length + 1}`, amount: 0, bonus: false }])}>
            Agregar meta
          </Button>
        )}
      </div>
    </Modal>
  );
}
