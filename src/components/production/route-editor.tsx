"use client";

import { Plus, Trash2 } from "lucide-react";
import { NumberInput, MoneyInput } from "@/components/ui/kit";
import { Button, Input, Select, cn } from "@/components/ui/primitives";
import type { SupplyInput, WorkItemInput } from "@/lib/client/api";
import { PROCESS_LABEL } from "@/lib/domain/labels";
import { formatCop } from "@/lib/domain/quote";
import { PROCESSES, type Machine, type Process } from "@/lib/domain/schema";
import type { PositionView } from "@/lib/domain/views";

/** Route of process steps: process → machine → position → hours. Inactive machines are visible but not selectable. */
export function RouteEditor({
  items,
  onChange,
  machines,
  positions,
  locked = new Set<string>(),
}: {
  items: WorkItemInput[];
  onChange: (items: WorkItemInput[]) => void;
  machines: Machine[];
  positions: PositionView[];
  /** Steps already finished cannot be edited or removed. */
  locked?: Set<string>;
}) {
  const update = (i: number, patch: Partial<WorkItemInput>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const machinesOf = (process: Process) => machines.filter((m) => m.process === process).sort((a, b) => a.order - b.order);
  const firstActive = (process: Process) => machinesOf(process).find((m) => m.state === "activa")?.id ?? null;

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && <p className="rounded-xl border border-dashed border-line px-4 py-3 text-sm text-muted">Agrega los pasos de proceso: cada uno crea una tarea para el puesto de esa máquina.</p>}
      <ol className="flex flex-col gap-3">
        {items.map((it, i) => {
          const isLocked = it.id ? locked.has(it.id) : false;
          const machine = machines.find((m) => m.id === it.machineId);
          return (
            <li key={it.id ?? `new-${i}`} className={cn("rounded-xl border border-line bg-night/50 p-3", isLocked && "opacity-70")}>
              <div className="mb-2 flex items-center justify-between">
                <span className="hud-label">
                  Paso {i + 1}
                  {isLocked ? " · terminado" : ""}
                </span>
                {!isLocked && (
                  <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Quitar paso ${i + 1}`} className="grid size-9 place-items-center rounded-lg text-muted hover:text-blocked">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1.3fr_1.3fr_7rem]">
                <Select
                  aria-label="Proceso"
                  disabled={isLocked}
                  value={it.process}
                  onChange={(e) => {
                    const process = e.target.value as Process;
                    update(i, { process, machineId: firstActive(process), positionId: undefined });
                  }}
                >
                  {PROCESSES.map((p) => (
                    <option key={p} value={p}>
                      {PROCESS_LABEL[p]}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Máquina"
                  disabled={isLocked}
                  value={it.machineId ?? ""}
                  onChange={(e) => update(i, { machineId: e.target.value || null, positionId: undefined })}
                >
                  <option value="">Cualquiera de {PROCESS_LABEL[it.process].toLowerCase()}</option>
                  {machinesOf(it.process).map((m) => (
                    <option key={m.id} value={m.id} disabled={m.state === "inactiva" && it.machineId !== m.id}>
                      {m.name}
                      {m.state === "inactiva" ? " · próximamente" : m.state === "mantenimiento" ? " · en mantenimiento" : ""}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Puesto responsable"
                  disabled={isLocked}
                  value={it.positionId === undefined ? (machine?.positionId ?? "") : (it.positionId ?? "")}
                  onChange={(e) => update(i, { positionId: e.target.value || null })}
                >
                  <option value="">Sin asignar</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {p.holder ? ` · ${p.holder.name}` : " · vacante"}
                    </option>
                  ))}
                </Select>
                <NumberInput value={it.plannedHours} onChange={(v) => update(i, { plannedHours: v ?? 0 })} suffix="h" max={2000} ariaDescribedBy={undefined} />
              </div>
              <Input
                aria-label="Indicaciones para el operario"
                placeholder="Indicaciones (tolerancias, material, cuidado especial…)"
                disabled={isLocked}
                className="mt-2"
                value={it.description}
                onChange={(e) => update(i, { description: e.target.value })}
              />
            </li>
          );
        })}
      </ol>
      <Button
        variant="secondary"
        size="sm"
        className="self-start"
        icon={<Plus className="size-4" />}
        onClick={() => onChange([...items, { process: "torno", machineId: firstActive("torno"), description: "", plannedHours: 1 }])}
      >
        Agregar paso
      </Button>
    </div>
  );
}

export function SuppliesEditor({ items, onChange }: { items: SupplyInput[]; onChange: (items: SupplyInput[]) => void }) {
  const update = (i: number, patch: Partial<SupplyInput>) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const total = items.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => (
        <div key={it.id ?? `s-${i}`} className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-night/50 p-3 sm:grid-cols-[1.6fr_1.2fr_6rem_9rem_auto]">
          <Input aria-label="Insumo" placeholder="Insumo o material" className="col-span-2 sm:col-span-1" value={it.description} onChange={(e) => update(i, { description: e.target.value })} />
          <Input aria-label="Proveedor" placeholder="Proveedor" className="col-span-2 sm:col-span-1" value={it.supplier} onChange={(e) => update(i, { supplier: e.target.value })} />
          <NumberInput value={it.quantity} onChange={(v) => update(i, { quantity: v ?? 0 })} />
          <MoneyInput value={it.unitCost} onChange={(v) => update(i, { unitCost: v ?? 0 })} allowEmpty={false} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Quitar insumo" className="col-span-2 grid h-12 place-items-center rounded-lg text-muted hover:text-blocked sm:col-span-1 sm:w-10">
            <Trash2 className="size-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => onChange([...items, { description: "", supplier: "", quantity: 1, unitCost: 0 }])}>
          Agregar insumo
        </Button>
        {items.length > 0 && <span className="tabular text-sm text-ink-soft">Total insumos: {formatCop(Math.round(total))}</span>}
      </div>
    </div>
  );
}
