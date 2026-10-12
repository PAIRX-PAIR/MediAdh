"use client";

import { CircleDashed, RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ChartFrame, ColumnChart, HBarChart, LineChart, Sparkline } from "@/components/charts/charts";
import { Meter, PageHeader, Segmented, StatTile } from "@/components/ui/kit";
import { Button, Panel, Spinner, cn } from "@/components/ui/primitives";
import { ApiError, api } from "@/lib/client/api";
import { MACHINE_STATE_LABEL, PROCESS_LABEL } from "@/lib/domain/labels";
import { formatCop } from "@/lib/domain/quote";
import type { Indicators } from "@/lib/server/services/indicators";

type Range = "3" | "6" | "12" | "24";

const monthLabel = (m: string) => new Intl.DateTimeFormat("es-CO", { month: "short" }).format(new Date(`${m}-15T12:00:00`)).replace(".", "");
const monthLong = (m: string) => new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric" }).format(new Date(`${m}-15T12:00:00`));
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)} %`);
const compactCop = (v: number) =>
  v >= 1_000_000 ? `$${(v / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : v >= 1000 ? `$${Math.round(v / 1000)} mil` : formatCop(v);

export function IndicatorsScreen() {
  const [range, setRange] = useState<Range>("6");
  const [data, setData] = useState<Indicators | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [reload, setReload] = useState(0);
  const select = (next: Range) => {
    setLoading(true);
    setRange(next);
  };
  const refreshNow = useCallback(() => {
    setLoading(true);
    setReload((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .indicators(Number(range))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "No se pudieron cargar los indicadores."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, reload]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestión"
        title="Indicadores de producción"
        description="Cómo va la gestión del taller: entregas a tiempo, satisfacción, garantías y uso de la capacidad. Las máquinas inactivas no cuentan; una máquina suma desde el día en que se activa."
        actions={
          <Button variant="secondary" size="sm" icon={<RefreshCcw className="size-4" />} loading={loading} onClick={refreshNow}>
            Actualizar
          </Button>
        }
      />
      <Segmented
        label="Periodo"
        value={range}
        onChange={select}
        options={[
          { value: "3", label: "3 meses" },
          { value: "6", label: "6 meses" },
          { value: "12", label: "12 meses" },
          { value: "24", label: "24 meses" },
        ]}
        className="self-start"
      />
      {error && <p className="rounded-xl border border-blocked/40 bg-blocked/10 p-3 text-sm text-[#ffb3b8]">{error}</p>}
      {!data ? <Spinner label="Cargando indicadores" /> : <Dashboard data={data} stale={loading} />}
    </div>
  );
}

function Dashboard({ data, stale }: { data: Indicators; stale: boolean }) {
  const m = data.monthly;
  const p = data.period;
  const index = p.index;
  const months = data.months;
  const [machineId, setMachineId] = useState<string | null>(null);

  const scoreTone = index.score === null ? "text-muted" : index.score >= 80 ? "text-done" : index.score >= 60 ? "text-pending" : "text-blocked";
  const perMachine = data.machines.map((mc) => {
    const rows = data.perMachine.filter((r) => r.machineId === mc.id);
    const worked = rows.reduce((s, r) => s + r.hoursWorked, 0);
    const capacity = rows.reduce((s, r) => s + r.capacityHours, 0);
    const planned = rows.reduce((s, r) => s + r.plannedHours, 0);
    const done = rows.reduce((s, r) => s + r.stepsDone, 0);
    const onTime = rows.reduce((s, r) => s + r.stepsOnTime, 0);
    const withDue = rows.filter((r) => r.compliance !== null).reduce((s, r) => s + r.stepsDone, 0);
    return {
      ...mc,
      rows,
      worked,
      capacity,
      utilization: capacity > 0 ? worked / capacity : null,
      efficiency: worked > 0 ? planned / worked : null,
      compliance: withDue > 0 ? onTime / withDue : null,
      done,
      warranties: rows.reduce((s, r) => s + r.warranties, 0),
    };
  });
  const focus = machineId ? perMachine.find((x) => x.id === machineId) : null;

  return (
    <div className={cn("flex flex-col gap-6 transition-opacity", stale && "opacity-60")}>
      <Panel corners className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <div className="flex flex-col justify-center">
          <p className="hud-label">Índice de gestión de producción</p>
          <p className={cn("font-display text-7xl font-bold leading-none", scoreTone)}>{index.score ?? "—"}</p>
          <p className="mt-1 text-sm text-muted">de 100 · {monthLong(months[0]!)} a {monthLong(months[months.length - 1]!)}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {index.parts.map((part) => (
            <li key={part.label} className="rounded-xl border border-line bg-night/50 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{part.label}</span>
                <span className="tabular text-xs text-muted">peso {part.weight}</span>
              </div>
              <Meter
                className="mt-2"
                value={part.value ?? 0}
                tone={part.value === null ? "neutral" : part.value >= 0.8 ? "done" : part.value >= 0.6 ? "pending" : "blocked"}
                label={part.label}
              />
              <p className="mt-1.5 text-xs text-muted">
                {part.value === null ? "Sin datos" : `${Math.round(part.value * 100)} / 100`} · {part.detail}
              </p>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Entregas a tiempo" value={pct(p.compliance)} tone="glow" hint={<Sparkline values={m.map((x) => x.compliance)} />} />
        <StatTile label="Satisfacción" value={p.satisfaction ?? "—"} tone="pending" hint={<Sparkline values={m.map((x) => x.satisfaction)} />} />
        <StatTile label="Garantías" value={p.warranties} tone={p.warranties ? "blocked" : "done"} hint={`${p.returns} devoluciones`} />
        <StatTile label="Incumplimientos" value={p.breaches} tone={p.breaches ? "blocked" : "done"} hint="Tarde o sin entregar" />
        <StatTile label="Uso de capacidad" value={pct(p.utilization)} hint={`${Math.round(p.hoursWorked)} de ${Math.round(p.capacityHours)} h`} />
        <StatTile label="Entregado" value={compactCop(p.revenue)} hint={`${p.delivered} trabajos · sin IVA`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Entregas a tiempo por mes"
          subtitle="Porcentaje de entregas con fecha pactada que llegaron a tiempo."
          table={{ columns: ["Mes", "A tiempo", "Con fecha", "%"], rows: m.map((x) => [monthLong(x.month), x.onTime, x.withDue, pct(x.compliance)]) }}
        >
          <LineChart ariaLabel="Cumplimiento mensual" min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} points={m.map((x) => ({ key: x.month, label: monthLabel(x.month), value: x.compliance }))} />
        </ChartFrame>
        <ChartFrame
          title="Satisfacción del cliente"
          subtitle="Promedio de 1 a 5 de los trabajos entregados en el mes."
          table={{ columns: ["Mes", "Promedio", "Calificaciones"], rows: m.map((x) => [monthLong(x.month), x.satisfaction ?? "—", x.satisfactionCount]) }}
        >
          <LineChart ariaLabel="Satisfacción mensual" min={1} max={5} format={(v) => v.toFixed(1)} points={m.map((x) => ({ key: x.month, label: monthLabel(x.month), value: x.satisfaction }))} />
        </ChartFrame>
        <ChartFrame
          title="Garantías y devoluciones"
          subtitle="Reclamos registrados en el mes (menos es mejor)."
          table={{ columns: ["Mes", "Garantías", "Devoluciones"], rows: m.map((x) => [monthLong(x.month), x.warranties, x.returns]) }}
        >
          <ColumnChart
            ariaLabel="Reclamos por mes"
            unit=""
            color="var(--viz-2)"
            data={m.map((x) => ({
              key: x.month,
              label: monthLabel(x.month),
              value: x.warranties + x.returns,
              tip: (
                <>
                  <p className="tabular text-sm font-semibold text-ink">{x.warranties + x.returns} reclamos</p>
                  <p className="text-muted">
                    {x.warranties} garantías · {x.returns} devoluciones · {monthLong(x.month)}
                  </p>
                </>
              ),
            }))}
          />
        </ChartFrame>
        <ChartFrame
          title="Uso de la capacidad"
          subtitle="Horas trabajadas sobre horas disponibles de las máquinas activas. Línea: meta 85 %."
          table={{ columns: ["Mes", "Horas trabajadas", "Capacidad", "%"], rows: m.map((x) => [monthLong(x.month), x.hoursWorked, x.capacityHours, pct(x.utilization)]) }}
        >
          <LineChart
            ariaLabel="Utilización mensual"
            min={0}
            max={1}
            target={{ value: 0.85, label: "meta" }}
            format={(v) => `${Math.round(v * 100)}%`}
            color="var(--viz-3)"
            points={m.map((x) => ({ key: x.month, label: monthLabel(x.month), value: x.utilization }))}
          />
        </ChartFrame>
      </div>

      <ChartFrame
        title="Por máquina"
        subtitle="Uso de capacidad en el periodo. Toca una máquina para ver su detalle."
        table={{
          columns: ["Máquina", "Estado", "Pasos terminados", "Uso", "Eficiencia (plan/real)", "A tiempo", "Garantías"],
          rows: perMachine.map((x) => [
            x.name,
            MACHINE_STATE_LABEL[x.state],
            x.done,
            pct(x.utilization),
            x.efficiency === null ? "—" : x.efficiency.toFixed(2),
            pct(x.compliance),
            x.warranties,
          ]),
        }}
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <HBarChart
            ariaLabel="Uso de capacidad por máquina"
            max={1}
            target={{ value: 0.85, label: "Meta 85 %" }}
            data={perMachine.map((x) => ({
              key: x.id,
              label: x.name,
              value: x.utilization,
              display: pct(x.utilization),
              muted: x.utilization === null,
              note: x.state === "inactiva" ? "—" : undefined,
            }))}
          />
          <div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {perMachine.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  aria-pressed={machineId === x.id}
                  onClick={() => setMachineId(machineId === x.id ? null : x.id)}
                  className={cn(
                    "h-9 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                    machineId === x.id ? "border-glow bg-navy-700/60 text-ink" : "border-line text-ink-soft hover:border-glow/60",
                  )}
                >
                  {x.name}
                </button>
              ))}
            </div>
            {focus ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-muted">
                  {PROCESS_LABEL[focus.process]} · {MACHINE_STATE_LABEL[focus.state]}
                  {focus.activeSince ? ` · activa desde ${focus.activeSince}` : ""}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <StatTile label="Uso" value={pct(focus.utilization)} />
                  <StatTile label="A tiempo" value={pct(focus.compliance)} />
                  <StatTile label="Eficiencia" value={focus.efficiency === null ? "—" : focus.efficiency.toFixed(2)} hint="plan / real" />
                </div>
                <ColumnChart
                  ariaLabel={`Horas trabajadas por mes en ${focus.name}`}
                  data={focus.rows.map((r) => ({
                    key: r.month,
                    label: monthLabel(r.month),
                    value: r.hoursWorked,
                    reference: r.capacityHours,
                    tip: (
                      <>
                        <p className="tabular text-sm font-semibold text-ink">
                          {r.hoursWorked} h <span className="font-normal text-muted">de {r.capacityHours} h</span>
                        </p>
                        <p className="text-muted">
                          {monthLong(r.month)} · {r.stepsDone} pasos
                        </p>
                      </>
                    ),
                  }))}
                />
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted">
                <CircleDashed className="size-4" aria-hidden /> Elige una máquina para ver sus horas por mes frente a su capacidad.
              </p>
            )}
          </div>
        </div>
      </ChartFrame>

      <ChartFrame
        title="Dinero"
        subtitle={`Valor entregado por mes (antes de IVA). ${data.ipcAvailable ? "Incluye el valor a precios de hoy con el IPC." : "Carga la tabla del IPC en Ajustes para ver valores a precios de hoy."}`}
        table={{
          columns: ["Mes", "Trabajos", "Precio", "Costo (insumos + máquinas)", "Margen", "A precios de hoy"],
          rows: data.money.map((x) => [monthLong(x.month), x.orders, formatCop(x.price), formatCop(x.cost), formatCop(x.margin), formatCop(x.adjusted)]),
        }}
      >
        <ColumnChart
          ariaLabel="Valor entregado por mes"
          unit=""
          data={data.money.map((x) => ({
            key: x.month,
            label: monthLabel(x.month),
            value: x.price / 1_000_000,
            tip: (
              <>
                <p className="tabular text-sm font-semibold text-ink">{formatCop(x.price)}</p>
                <p className="text-muted">
                  {monthLong(x.month)} · margen {formatCop(x.margin)}
                </p>
              </>
            ),
          }))}
        />
        <p className="text-xs text-muted">Eje en millones de pesos.</p>
      </ChartFrame>
    </div>
  );
}
