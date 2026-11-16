"use client";

import { Scale } from "lucide-react";
import { useMemo, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { CommitVerdict } from "@/components/production/commit-verdict";
import { NumberInput } from "@/components/ui/kit";
import { Field, Input } from "@/components/ui/primitives";
import { useProduction } from "@/lib/client/use-production";
import { PROCESS_LABEL } from "@/lib/domain/labels";
import { canCommit } from "@/lib/domain/planning";
import { PROCESSES, type Process } from "@/lib/domain/schema";
import { addDays } from "@/lib/domain/time";

/**
 * Programación: horas por proceso (o por máquina) + fecha pedida → Sí / Sí moviendo / No.
 * Es solo una simulación: no reserva capacidad ni compromete ninguna fecha.
 * (Antes se llamaba «¿Me puedo comprometer?»; el ancla #comprometer se conserva para los enlaces viejos.)
 */
export function CommitSimulator() {
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
            Simular una fecha de entrega
          </h2>
          <p className="text-sm text-muted">Escribe las horas del trabajo nuevo y la fecha que pide el cliente. Es una simulación: no reserva capacidad.</p>
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
