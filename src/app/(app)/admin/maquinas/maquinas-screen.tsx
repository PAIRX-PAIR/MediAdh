"use client";

import { ChevronDown, Cog, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ChartFrame, ColumnChart } from "@/components/charts/charts";
import { useSync } from "@/components/providers/sync-provider";
import { BoardLinkCard } from "@/components/production/board-link";
import { MachineFormModal } from "@/components/production/machine-form";
import { LEVEL, OccupancyList } from "@/components/production/occupancy";
import { TallerTabs } from "@/components/production/taller-tabs";
import { PageHeader, SectionTitle } from "@/components/ui/kit";
import { Button, Chip, Select, cn } from "@/components/ui/primitives";
import { useProduction } from "@/lib/client/use-production";
import { MACHINE_STATE_LABEL, PROCESS_LABEL, formatDate } from "@/lib/domain/labels";
import { weeklyHours } from "@/lib/domain/calendar";
import type { Machine } from "@/lib/domain/schema";

const short = (d: string) => new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "numeric" }).format(new Date(`${d}T12:00:00`));

export function MaquinasScreen() {
  const { data } = useSync();
  const prod = useProduction();
  const [editing, setEditing] = useState<Machine | "new" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const machines = prod.machines;
  const visible = selected ? prod.occupancy.filter((o) => o.machineId === selected) : prod.occupancy.filter((o) => o.level !== "inactiva");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Taller"
        title="Máquinas"
        description="Estado y ocupación de cada máquina con su horario por turnos, festivos y paros. Las máquinas inactivas se ven, pero no reciben trabajo."
        actions={
          data.me.scope === "total" ? (
            <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
              Agregar máquina-herramienta
            </Button>
          ) : undefined
        }
      />
      <TallerTabs />

      <section aria-labelledby="ocupacion-title">
        <SectionTitle>
          <span id="ocupacion-title">Ocupación · próximas 2 semanas</span>
        </SectionTitle>
        <OccupancyList items={prod.occupancy} />
      </section>

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

      <details className="group" aria-labelledby="carga-title">
        <summary className="hud-panel flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <h2 id="carga-title" className="font-display text-lg font-semibold text-ink">
            Carga diaria por máquina
          </h2>
          <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <Select aria-label="Filtrar máquina" className="h-11 w-auto self-start" value={selected ?? ""} onChange={(e) => setSelected(e.target.value || null)}>
            <option value="">Todas las activas</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
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
                </ChartFrame>
              );
            })}
          </div>
        </div>
      </details>

      <BoardLinkCard />

      {editing && <MachineFormModal key={editing === "new" ? "new" : editing.id} machine={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
