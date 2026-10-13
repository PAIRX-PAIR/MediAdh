"use client";

import { Power, PowerOff, Save, Trash2, Wrench } from "lucide-react";
import { useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { ChangeLog, ChangeLogHeading, MoneyInput, NumberInput } from "@/components/ui/kit";
import { Modal, useConfirm } from "@/components/ui/overlay";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { api, type MachineInput } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { MACHINE_STATE_LABEL, PROCESS_LABEL, formatDate, formatDateTime } from "@/lib/domain/labels";
import { PROCESSES, type Machine, type Process } from "@/lib/domain/schema";

/** Create/edit a machine; state changes (activate with date, maintenance stop) are explicit buttons. */
export function MachineFormModal({ machine, onClose }: { machine: Machine | null; onClose: () => void }) {
  const { data } = useSync();
  const [form, setForm] = useState<MachineInput>(() =>
    machine
      ? {
          name: machine.name,
          process: machine.process,
          description: machine.description,
          state: machine.state,
          activeSince: machine.activeSince,
          hoursPerDay: machine.hoursPerDay,
          hourlyRate: machine.hourlyRate,
          positionId: machine.positionId,
        }
      : { name: "", process: "torno", description: "", state: "activa", activeSince: data.today, hoursPerDay: null, hourlyRate: 0, positionId: null },
  );
  const [activateOn, setActivateOn] = useState(data.today);
  const [stopReason, setStopReason] = useState("");
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();
  const set = <K extends keyof MachineInput>(k: K, v: MachineInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Coordinación y asistencia only assign the operator; the rest is configuration.
  const owner = data.me.scope === "total";
  const save = async () => {
    const { state: _state, ...rest } = form;
    void _state;
    const patch = owner ? rest : { positionId: form.positionId };
    const ok = await run("save", () => (machine ? api.machines.update(machine.id, patch) : api.machines.create(form)), machine ? "Máquina actualizada" : "Máquina agregada");
    if (ok) onClose();
  };
  const changeState = async (state: Machine["state"], extra: { activeSince?: string; stopReason?: string | null } = {}) => {
    if (!machine) return;
    const ok = await run("state", () => api.machines.update(machine.id, { state, ...extra }), `${machine.name}: ${MACHINE_STATE_LABEL[state]}`);
    if (ok) onClose();
  };
  const openStop = machine?.stops.find((s) => !s.to);

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={machine ? machine.name : "Nueva máquina"}
      description={machine ? `${PROCESS_LABEL[machine.process]} · ${MACHINE_STATE_LABEL[machine.state]}` : "Una máquina nueva empieza a sumar capacidad desde la fecha en que la actives."}
      footer={
        <>
          {machine && owner && (
            <Button
              variant="ghost"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (await confirm({ title: `¿Eliminar ${machine.name}?`, body: "Solo se puede si nunca recibió trabajo. Si ya tiene histórico, déjala inactiva.", confirmLabel: "Eliminar", danger: true })) {
                  const ok = await run("del", () => api.machines.remove(machine.id), "Máquina eliminada");
                  if (ok) onClose();
                }
              }}
              className="mr-auto"
            >
              Eliminar
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} loading={busy === "save"} disabled={!form.name.trim()} icon={<Save className="size-4" />}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {machine && (
          <section className="rounded-xl border border-line bg-night/50 p-4">
            <p className="mb-2 font-display font-semibold text-ink">Estado</p>
            {machine.state === "inactiva" && (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Activar desde" hint="Desde ese día recibe trabajo y suma capacidad e indicadores.">
                  {(id, d) => <Input id={id} aria-describedby={d} type="date" value={activateOn} onChange={(e) => setActivateOn(e.target.value)} />}
                </Field>
                <Button loading={busy === "state"} icon={<Power className="size-4" />} onClick={() => void changeState("activa", { activeSince: activateOn })}>
                  Activar
                </Button>
              </div>
            )}
            {machine.state === "activa" && (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink-soft">
                  Activa{machine.activeSince ? ` desde el ${formatDate(machine.activeSince, { day: "numeric", month: "long", year: "numeric" })}` : ""}.
                </p>
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Motivo del paro" className="min-w-56 flex-1">
                    {(id) => <Input id={id} placeholder="Ej: cambio de correas" value={stopReason} onChange={(e) => setStopReason(e.target.value)} />}
                  </Field>
                  <Button variant="secondary" loading={busy === "state"} icon={<Wrench className="size-4" />} onClick={() => void changeState("mantenimiento", { stopReason: stopReason || null })}>
                    Poner en mantenimiento
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  icon={<PowerOff className="size-4" />}
                  onClick={async () => {
                    if (await confirm({ title: `¿Dejar ${machine.name} inactiva?`, body: "No recibirá trabajo ni contará en capacidad ni indicadores hasta reactivarla.", confirmLabel: "Dejar inactiva" })) {
                      void changeState("inactiva");
                    }
                  }}
                >
                  Dejar inactiva (próximamente)
                </Button>
              </div>
            )}
            {machine.state === "mantenimiento" && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex-1 text-sm text-ink-soft">
                  En mantenimiento desde {formatDateTime(openStop?.from)}
                  {openStop?.reason ? ` · ${openStop.reason}` : ""}. Su capacidad no cuenta.
                </p>
                <Button loading={busy === "state"} icon={<Power className="size-4" />} onClick={() => void changeState("activa")}>
                  Terminar mantenimiento
                </Button>
              </div>
            )}
          </section>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">{(id) => <Input id={id} maxLength={60} value={form.name} onChange={(e) => set("name", e.target.value)} />}</Field>
          <Field label="Proceso">
            {(id) => (
              <Select id={id} value={form.process} onChange={(e) => set("process", e.target.value as Process)}>
                {PROCESSES.map((p) => (
                  <option key={p} value={p}>
                    {PROCESS_LABEL[p]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {!machine && (
            <Field label="Estado inicial">
              {(id) => (
                <Select id={id} value={form.state} onChange={(e) => set("state", e.target.value as MachineInput["state"])}>
                  <option value="activa">Activa</option>
                  <option value="inactiva">Inactiva (próxima compra)</option>
                </Select>
              )}
            </Field>
          )}
          {!machine && form.state === "activa" && (
            <Field label="Activa desde">{(id) => <Input id={id} type="date" value={form.activeSince ?? ""} onChange={(e) => set("activeSince", e.target.value || null)} />}</Field>
          )}
          <Field label="Tope de horas por día (opcional)" hint="Vacío = trabaja todo el horario del taller (Ajustes → Horario).">
            {(id, d) => <NumberInput id={id} ariaDescribedBy={d} min={0} max={24} value={form.hoursPerDay} onChange={(v) => set("hoursPerDay", v)} placeholder="Horario del taller" suffix="h" />}
          </Field>
          <Field label="Tarifa por hora" hint="Se usa al cotizar en esta máquina. Incluye el costo de la máquina y el sueldo de su operario (sueldo ÷ 210 h).">
            {(id, d) => <MoneyInput id={id} ariaDescribedBy={d} value={form.hourlyRate} onChange={(v) => set("hourlyRate", v ?? 0)} allowEmpty={false} />}
          </Field>
          <Field label="Operario responsable" hint="Un operario puede tener 2 o 3 máquinas. Su cola aparece en el tablero del taller.">
            {(id, d) => (
              <Select id={id} aria-describedby={d} value={form.positionId ?? ""} onChange={(e) => set("positionId", e.target.value || null)}>
                <option value="">Sin operario asignado</option>
                {data.positions
                  .filter((p) => !p.grantsAdmin)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.holder ? `${p.holder.name} · ${p.title}` : `${p.title} (vacante)`}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          <Field label="Descripción" className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={2} placeholder="Marca, modelo, capacidad…" value={form.description} onChange={(e) => set("description", e.target.value)} />}
          </Field>
        </div>

        {machine && (
          <section>
            <ChangeLogHeading />
            <ChangeLog entries={machine.history} />
          </section>
        )}
      </div>
      {dialog}
    </Modal>
  );
}
