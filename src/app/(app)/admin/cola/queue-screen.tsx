"use client";

import { Cog, Plus, Scale } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChartFrame, ColumnChart } from "@/components/charts/charts";
import { useSync } from "@/components/providers/sync-provider";
import { CommitVerdict } from "@/components/production/commit-verdict";
import { MachineFormModal } from "@/components/production/machine-form";
import { LEVEL, OccupancyList } from "@/components/production/occupancy";
import { PriorityPanel } from "@/components/production/priority-panel";
import { NumberInput, PageHeader, SectionTitle } from "@/components/ui/kit";
import { Button, Chip, Field, Input, Select, cn } from "@/components/ui/primitives";
import { useProduction } from "@/lib/client/use-production";
import { MACHINE_STATE_LABEL, PROCESS_LABEL, formatDate } from "@/lib/domain/labels";
import { weeklyHours } from "@/lib/domain/calendar";
import { canCommit } from "@/lib/domain/planning";
import { PROCESSES, type Machine, type Process } from "@/lib/domain/schema";
import { addDays } from "@/lib/domain/time";

const short = (d: string) => new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "numeric" }).format(new Date(`${d}T12:00:00`));

export function QueueScreen() {
  const { data } = useSync();
  const prod = useProduction();
  const [editing, setEditing] = useState<Machine | "new" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const machines = prod.machines;
  const visible = selected ? prod.occupancy.filter((o) => o.machineId === selected) : prod.occupancy.filter((o) => o.level !== "inactiva");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Producción"
        title="Cola por máquina"
        description="Programación automática por fecha de entrega con la capacidad real de cada máquina (jornada, sábados, festivos y paros). Las máquinas inactivas se ven, pero no reciben trabajo."
        actions={
          <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            Agregar máquina
          </Button>
        }
      />

      <section aria-labelledby="ocupacion-title">
        <SectionTitle>
          <span id="ocupacion-title">Ocupación · próximas 2 semanas</span>
        </SectionTitle>
        <OccupancyList items={prod.occupancy} />
      </section>

      <section aria-labelledby="carga-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="carga-title" className="font-display text-lg font-semibold text-ink">
            Carga diaria por máquina
          </h2>
          <Select aria-label="Filtrar máquina" className="h-11 w-auto" value={selected ?? ""} onChange={(e) => setSelected(e.target.value || null)}>
            <option value="">Todas las activas</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((o) => {
            const l = LEVEL[o.level];
            const Icon = l.icon;
            return (
              <ChartFrame
                key={o.machineId}
                title={o.name}
                subtitle={
                  <span className="flex flex-wrap items-center gap-x-3">
                    <span className={cn("inline-flex items-center gap-1 font-semibold", l.text)}>
                      <Icon className="size-3.5" aria-hidden /> {l.label} {o.level !== "mantenimiento" && o.level !== "inactiva" ? `${Math.round(o.ratio * 100)}%` : ""}
                    </span>
                    <span>
                      Horas programadas (azul) sobre la capacidad del día (fondo) · libre {o.freeDate ? formatDate(o.freeDate, { weekday: "short", day: "numeric" }) : "—"}
                    </span>
                  </span>
                }
                table={{
                  columns: ["Día", "Programado (h)", "Capacidad (h)"],
                  rows: o.daily.map((d) => [formatDate(d.date, { weekday: "short", day: "numeric", month: "short" }), d.load, d.capacity]),
                }}
                actions={
                  <button
                    type="button"
                    onClick={() => setEditing(machines.find((m) => m.id === o.machineId) ?? null)}
                    aria-label={`Configurar ${o.name}`}
                    className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:border-glow/60 hover:text-ink"
                  >
                    <Cog className="size-4" />
                  </button>
                }
              >
                <ColumnChart
                  ariaLabel={`Carga diaria de ${o.name}`}
                  data={o.daily.map((d) => ({
                    key: d.date,
                    label: short(d.date),
                    value: d.load,
                    reference: d.capacity,
                    tip: (
                      <>
                        <p className="tabular text-sm font-semibold text-ink">
                          {d.load} h <span className="font-normal text-muted">de {d.capacity} h</span>
                        </p>
                        <p className="text-muted">{formatDate(d.date, { weekday: "long", day: "numeric", month: "short" })}</p>
                      </>
                    ),
                  }))}
                />
                <QueueList machineId={o.machineId} />
              </ChartFrame>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <PriorityPanel ranking={prod.ranking} next={prod.next} hrefFor={(id) => `/admin/ordenes?o=${id}`} limit={10} />
        <CommitSimulator />
      </div>

      <section aria-labelledby="planta-title">
        <SectionTitle>
          <span id="planta-title">Máquinas de la planta</span>
        </SectionTitle>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {[...machines].sort((a, b) => a.order - b.order).map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setEditing(m)}
                className={cn("hud-panel flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:border-glow/50", m.state === "inactiva" && "opacity-60")}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{m.name}</span>
                  <span className="block text-xs text-muted">
                    {PROCESS_LABEL[m.process]} · {m.hoursPerDay === null ? "horario del taller" : `máx. ${m.hoursPerDay} h/día`}{m.activeSince && m.state !== "inactiva" ? ` · desde ${formatDate(m.activeSince)}` : ""}
                  </span>
                </span>
                <Chip tone={m.state === "activa" ? "done" : m.state === "mantenimiento" ? "pending" : "vacant"}>{MACHINE_STATE_LABEL[m.state]}</Chip>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Horario del taller: {weeklyHours(data.production.calendar.schedule).toLocaleString("es-CO")} h por semana
          {data.production.calendar.skipHolidays ? ", sin festivos de Colombia" : ""}. Se cambia en{" "}
          <Link href="/admin/ajustes#horario" className="font-semibold text-glow hover:underline">
            Ajustes
          </Link>
          .
        </p>
      </section>

      {editing && <MachineFormModal key={editing === "new" ? "new" : editing.id} machine={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** The ordered jobs waiting on one machine with their projected finish. */
function QueueList({ machineId }: { machineId: string }) {
  const prod = useProduction();
  const jobs = prod.schedule.jobs.filter((j) => j.assignedMachineId === machineId);
  if (jobs.length === 0) return <p className="text-sm text-muted">Sin trabajos en cola.</p>;
  return (
    <ol className="flex flex-col gap-1 border-t border-line pt-3">
      {jobs.map((j, i) => (
        <li key={j.workItemId}>
          <Link href={`/admin/ordenes?o=${j.orderId}`} className="grid grid-cols-[1.25rem_auto_1fr_auto] items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-white/5">
            <span className="tabular text-xs text-faint">{i + 1}</span>
            <span className="font-mono font-semibold text-ink">{j.folio}</span>
            <span className="truncate text-muted">{prod.orders.find((o) => o.id === j.orderId)?.title}</span>
            <span className={cn("tabular text-xs", j.late ? "font-semibold text-blocked" : "text-ink-soft")}>
              {Math.round(j.hours * 10) / 10} h · {j.endDate ? formatDate(j.endDate, { weekday: "short", day: "numeric" }) : "sin fecha"}
              {j.late ? " · tarde" : ""}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** "¿Me puedo comprometer?": hours per process (or machine) + requested date → Sí / Sí moviendo / No. */
function CommitSimulator() {
  const { data } = useSync();
  const prod = useProduction();
  const [hours, setHours] = useState<Partial<Record<Process, number | null>>>({ torno: 8 });
  const [machineHours, setMachineHours] = useState<Record<string, number | null>>({});
  const [date, setDate] = useState(addDays(data.today, 3));
  const [time, setTime] = useState("17:00");

  const answer = useMemo(() => {
    const byProcess: Partial<Record<Process, number>> = {};
    for (const [p, h] of Object.entries(hours)) if (h) byProcess[p as Process] = h;
    const byMachine: Record<string, number> = {};
    for (const [m, h] of Object.entries(machineHours)) if (h) byMachine[m] = h;
    if (!date) return null;
    return canCommit(prod.asOrders, { hoursByProcess: byProcess, hoursByMachine: byMachine, dueDate: date, dueTime: time }, prod.ctx);
  }, [hours, machineHours, date, time, prod]);

  return (
    <section id="comprometer" className="hud-panel hud-corners flex scroll-mt-24 flex-col gap-4 p-5" aria-labelledby="sim-title">
      <div className="flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl border border-glow/40 bg-navy-800/70 text-glow" aria-hidden>
          <Scale className="size-5" />
        </span>
        <div>
          <h2 id="sim-title" className="font-display text-xl font-bold text-ink">
            ¿Me puedo comprometer?
          </h2>
          <p className="text-sm text-muted">Escribe las horas del trabajo nuevo y la fecha que pide el cliente.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {PROCESSES.map((p) => (
          <Field key={p} label={PROCESS_LABEL[p]}>
            {(id) => <NumberInput id={id} value={hours[p] ?? null} onChange={(v) => setHours((h) => ({ ...h, [p]: v }))} suffix="h" placeholder="0" />}
          </Field>
        ))}
      </div>
      <details className="rounded-xl border border-line bg-night/40 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink-soft">En una máquina específica (opcional)</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {prod.machines
            .filter((m) => m.state !== "inactiva")
            .map((m) => (
              <Field key={m.id} label={m.name}>
                {(id) => <NumberInput id={id} value={machineHours[m.id] ?? null} onChange={(v) => setMachineHours((h) => ({ ...h, [m.id]: v }))} suffix="h" placeholder="0" />}
              </Field>
            ))}
        </div>
      </details>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Field label="Fecha que pide el cliente">{(id) => <Input id={id} type="date" min={data.today} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Hora">{(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
      </div>
      {answer && <CommitVerdict answer={answer} />}
    </section>
  );
}
