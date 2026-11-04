"use client";

import Link from "next/link";
import { cn } from "@/components/ui/primitives";
import { useProduction } from "@/lib/client/use-production";
import { formatDate } from "@/lib/domain/labels";

/** The ordered jobs waiting on one machine with their projected finish. */
export function MachineQueueList({ machineId }: { machineId: string }) {
  const prod = useProduction();
  const jobs = prod.schedule.jobs.filter((j) => j.assignedMachineId === machineId);
  if (jobs.length === 0) return <p className="text-sm text-muted">Sin trabajos en cola.</p>;
  return (
    <ol className="flex flex-col gap-1">
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
