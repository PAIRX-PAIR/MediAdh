"use client";

import { ChevronDown } from "lucide-react";
import { CommitSimulator } from "@/components/production/commit-simulator";
import { MachineQueueList } from "@/components/production/machine-queue";
import { TallerTabs } from "@/components/production/taller-tabs";
import { PageHeader, SectionTitle } from "@/components/ui/kit";
import { useProduction } from "@/lib/client/use-production";
import { PROCESS_LABEL, formatDate } from "@/lib/domain/labels";

export function ProgramacionScreen() {
  const prod = useProduction();
  const queues = prod.occupancy.filter((o) => o.level !== "inactiva");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Taller"
        title="Programación"
        description="Calcula si una fecha de entrega es posible con la capacidad real de cada máquina (turnos, festivos y paros) y mira la cola de cada una."
      />
      <TallerTabs />

      <CommitSimulator />

      <section aria-labelledby="colas-title">
        <SectionTitle>
          <span id="colas-title">Cola por máquina</span>
        </SectionTitle>
        <ul className="flex flex-col gap-2">
          {queues.map((o) => (
            <li key={o.machineId}>
              <details className="group hud-panel p-0">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{o.name}</span>
                    <span className="block text-xs text-muted">
                      {PROCESS_LABEL[o.process]} · {o.queuedHours > 0 ? `${o.queuedHours} h en cola` : "sin cola"} · libre{" "}
                      {o.freeDate ? formatDate(o.freeDate, { weekday: "short", day: "numeric", month: "short" }) : "—"}
                    </span>
                  </span>
                  <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <div className="border-t border-line p-4 pt-3">
                  <MachineQueueList machineId={o.machineId} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
