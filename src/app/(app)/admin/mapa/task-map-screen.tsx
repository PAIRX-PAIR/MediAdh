"use client";

import { Map as MapIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PageHeader, Segmented } from "@/components/ui/kit";
import { cn, EmptyState, Select } from "@/components/ui/primitives";
import { useProduction } from "@/lib/client/use-production";
import { formatDate } from "@/lib/domain/labels";
import { MAP_PRIORITY_LABEL, MAP_STATUS_LABEL, taskMapRows, type MapPriority, type MapStatus } from "@/lib/domain/task-map";

type PriorityFilter = "todas" | MapPriority;
const ALL = "";
const NO_OPERATOR = "__sin_operario";

/** Rojo = urgente, amarillo = alta, azul = programado (con tiempo). */
const PRIORITY_CELL: Record<MapPriority, string> = {
  urgente: "bg-urgent text-white",
  alta: "bg-pending text-abyss",
  programado: "bg-navy-500 text-white",
};
const PRIORITY_EDGE: Record<MapPriority, string> = {
  urgente: "border-l-urgent bg-urgent/10",
  alta: "border-l-pending bg-pending/10",
  programado: "border-l-navy-400 bg-navy-500/10",
};
const STATUS_CELL: Record<MapStatus, string> = {
  material: "border-blocked bg-blocked/80 text-white",
  bloqueada: "border-blocked/60 bg-blocked/10 text-blocked",
  en_proceso: "border-progress/50 bg-progress/10 text-progress",
  en_cola: "border-line-strong bg-white/5 text-ink-soft",
};

const shortDate = (d: string | null) => formatDate(d, { day: "numeric", month: "short", year: "2-digit" });

/**
 * Vista tipo planilla de todo lo que hay en el taller: tarea (paso de cada OT),
 * máquina, prioridad, ingreso, compromiso, estado y operario.
 */
export function TaskMapScreen() {
  const { data } = useSync();
  const prod = useProduction();
  const [priority, setPriority] = useState<PriorityFilter>("todas");
  const [operator, setOperator] = useState(ALL);
  const [machine, setMachine] = useState(ALL);

  const all = useMemo(
    () => taskMapRows(prod.orders, prod.machines, data.positions, data.today, data.settings.timezone),
    [prod.orders, prod.machines, data.positions, data.today, data.settings.timezone],
  );
  const operators = useMemo(() => [...new Set(all.map((r) => r.operator).filter((o): o is string => Boolean(o)))].sort((a, b) => a.localeCompare(b)), [all]);
  const machines = useMemo(() => [...new Set(all.map((r) => r.machine))].sort((a, b) => a.localeCompare(b)), [all]);
  const rows = all.filter(
    (r) =>
      (priority === "todas" || r.priority === priority) &&
      (operator === ALL || (operator === NO_OPERATOR ? r.operator === null : r.operator === operator)) &&
      (machine === ALL || r.machine === machine),
  );
  const count = (p: MapPriority) => all.filter((r) => r.priority === p).length;

  return (
    <>
      <PageHeader
        eyebrow="Producción"
        title="Mapa de tareas"
        description="Cada fila es un trabajo pendiente de una OT: en qué máquina va, quién lo hace y para cuándo. Las más urgentes van arriba."
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <Segmented<PriorityFilter>
          label="Filtrar por prioridad"
          value={priority}
          onChange={setPriority}
          options={[
            { value: "todas", label: "Todas", count: all.length },
            { value: "urgente", label: "Urgente", count: count("urgente") },
            { value: "alta", label: "Alta", count: count("alta") },
            { value: "programado", label: "Programado", count: count("programado") },
          ]}
        />
        <div className="grid flex-1 grid-cols-2 gap-2 lg:max-w-lg">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Operario
            <Select value={operator} onChange={(e) => setOperator(e.target.value)} className="h-10">
              <option value={ALL}>Todos</option>
              {operators.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              <option value={NO_OPERATOR}>Sin asignar</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Máquina
            <Select value={machine} onChange={(e) => setMachine(e.target.value)} className="h-10">
              <option value={ALL}>Todas</option>
              {machines.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      <ul className="mb-3 flex flex-wrap gap-3 text-xs text-muted" aria-label="Colores de prioridad">
        {(["urgente", "alta", "programado"] as const).map((p) => (
          <li key={p} className="flex items-center gap-1.5">
            <span className={cn("size-3 rounded-sm", PRIORITY_CELL[p])} aria-hidden />
            {MAP_PRIORITY_LABEL[p]}
            {p === "urgente" ? " (o entrega vencida)" : p === "alta" ? " (entrega en 7 días o menos)" : " (con tiempo)"}
          </li>
        ))}
      </ul>

      {rows.length === 0 ? (
        <EmptyState
          icon={<MapIcon />}
          title={all.length === 0 ? "No hay trabajos en producción" : "Nada con estos filtros"}
          body={all.length === 0 ? "Cuando registres órdenes con sus procesos, aparecen aquí." : "Cambia la prioridad, el operario o la máquina."}
        />
      ) : (
        <div className="hud-panel overflow-x-auto p-0">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <caption className="sr-only">Mapa de tareas del taller</caption>
            <thead>
              <tr className="border-b border-line-strong bg-navy-800/80 text-left font-display text-xs uppercase tracking-wider text-ink-soft">
                <th scope="col" className="w-12 px-3 py-2.5 text-center">
                  #
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Tarea
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Mecanizar en
                </th>
                <th scope="col" className="px-3 py-2.5 text-center">
                  Prioridad
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Ingreso
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Compromiso
                </th>
                <th scope="col" className="px-3 py-2.5 text-center">
                  Estado
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Operario
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const late = r.due !== null && r.due < data.today;
                return (
                  <tr key={r.key} className="border-b border-line/70 last:border-b-0 hover:bg-white/[0.03]">
                    <td className="tabular px-3 py-2 text-center text-muted">{i + 1}</td>
                    <td className={cn("border-l-4 px-3 py-2", PRIORITY_EDGE[r.priority])}>
                      <Link href={`/admin/ordenes?o=${r.orderId}`} className="group block min-w-0">
                        <span className="font-semibold text-ink group-hover:text-glow">
                          <span className="font-mono text-xs text-glow">{r.folio}</span> · {r.title}
                        </span>
                        {(r.detail || r.clientName) && (
                          <span className="block truncate text-xs text-muted">{[r.detail, r.clientName].filter(Boolean).join(" · ")}</span>
                        )}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-soft">{r.machine}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("inline-block min-w-24 rounded-md px-2 py-1 font-display text-xs font-semibold uppercase tracking-wider", PRIORITY_CELL[r.priority])}>
                        {MAP_PRIORITY_LABEL[r.priority]}
                      </span>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-2 text-ink-soft">{shortDate(r.received)}</td>
                    <td className={cn("tabular whitespace-nowrap px-3 py-2", late ? "font-semibold text-urgent" : "text-ink-soft")}>
                      {shortDate(r.due)}
                      {late && <span className="sr-only"> (vencida)</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("inline-block min-w-28 rounded-md border px-2 py-1 text-xs font-semibold", STATUS_CELL[r.status])}>{MAP_STATUS_LABEL[r.status]}</span>
                    </td>
                    <td className={cn("whitespace-nowrap px-3 py-2", r.operator ? "text-ink" : "italic text-faint")}>{r.operator ?? "Sin asignar"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
