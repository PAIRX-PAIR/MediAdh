"use client";

import { ArrowRight, ClipboardCheck, ClipboardList, Megaphone, PackagePlus } from "lucide-react";
import Link from "next/link";
import { useSync } from "@/components/providers/sync-provider";
import { PushCard } from "@/components/pwa/push-card";
import { PageHeader } from "@/components/ui/kit";
import { EmptyState, Ring } from "@/components/ui/primitives";
import { TaskCard } from "@/components/work/task-card";
import { CONTRACT_STATUS_LABEL, PRIORITY_RANK, formatDate, timeAgo } from "@/lib/domain/labels";
import { daysBetween, dateInZone } from "@/lib/domain/time";

/** The worker's HUD: what's next, today's progress, and the latest from the workshop. */
export function WorkerPanel() {
  const { data } = useSync();
  const mine = data.tasks.filter((t) => t.positionId === data.me.positionId);
  const open = mine
    .filter((t) => t.status !== "completada")
    .sort((a, b) => {
      const blocked = Number(a.status === "bloqueada") - Number(b.status === "bloqueada");
      if (blocked) return blocked;
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr) return pr;
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    });
  const doneToday = mine.filter((t) => t.completedAt && dateInZone(new Date(t.completedAt), data.settings.timezone) === data.today);
  const next = open.find((t) => t.status !== "bloqueada") ?? open[0];
  const pieces = open.reduce((s, t) => s + (t.quantity ?? 0), 0);
  const piecesDone = open.reduce((s, t) => s + t.quantityDone, 0);
  const briefs = data.production.briefs ?? [];
  const contractDays = data.me.contractEndDate ? daysBetween(data.today, data.me.contractEndDate) : null;
  const closedToday = data.closures.some((c) => c.date === data.today && c.userId === data.me.id);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={formatDate(data.today, { weekday: "long", day: "numeric", month: "long" })}
        title={`Hola, ${data.me.displayName.split(" ")[0]}`}
        description={
          <>
            {data.me.positionTitle ?? "Sin puesto"}
            {data.me.contractStatus && data.me.contractStatus !== "vigente" ? ` · ${CONTRACT_STATUS_LABEL[data.me.contractStatus]}` : ""}
            {contractDays !== null && contractDays <= 7 && contractDays >= 0 ? ` · tu contrato termina ${contractDays === 0 ? "hoy" : `en ${contractDays} días`}` : ""}
          </>
        }
      />

      <section className="hud-panel hud-corners grid grid-cols-3 gap-2 p-4" aria-label="Mi día">
        <div className="flex flex-col items-center gap-1 text-center">
          <Ring value={open.length + doneToday.length ? doneToday.length / (open.length + doneToday.length) : 0} tone="done" label={`${doneToday.length} tareas terminadas hoy`}>
            <span className="tabular font-display text-lg font-bold">{doneToday.length}</span>
          </Ring>
          <span className="text-xs text-muted">Hechas hoy</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <Ring value={open.length ? 1 : 0} tone={open.some((t) => t.status === "bloqueada") ? "blocked" : "glow"} label={`${open.length} tareas abiertas`}>
            <span className="tabular font-display text-lg font-bold">{open.length}</span>
          </Ring>
          <span className="text-xs text-muted">Pendientes</span>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <Ring value={pieces ? piecesDone / pieces : 0} tone="pending" label={`${piecesDone} de ${pieces} piezas`}>
            <span className="tabular font-display text-sm font-bold">{pieces ? `${Math.round((piecesDone / pieces) * 100)}%` : "—"}</span>
          </Ring>
          <span className="text-xs text-muted">Piezas</span>
        </div>
      </section>

      {next ? (
        <section aria-labelledby="sigue-title">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="sigue-title" className="hud-label text-glow-soft">
              Sigue con
            </h2>
            <Link href="/tareas" className="inline-flex items-center gap-1 text-sm font-semibold text-glow">
              Todas ({open.length}) <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <TaskCard task={next} brief={briefs.find((b) => b.id === next.orderId)} href={`/tareas?t=${next.id}`} today={data.today} />
        </section>
      ) : (
        <EmptyState icon={<ClipboardList />} title="No tienes tareas pendientes" body="Cuando el coordinador te asigne trabajo te llegará un aviso." />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link href="/solicitudes?nueva=1" className="hud-panel flex min-h-24 flex-col items-start justify-between gap-2 p-4 transition-colors hover:border-glow/50">
          <PackagePlus className="size-6 text-glow" aria-hidden />
          <span className="font-display font-semibold text-ink">Pedir material</span>
        </Link>
        <Link href="/cierre" className="hud-panel flex min-h-24 flex-col items-start justify-between gap-2 p-4 transition-colors hover:border-glow/50">
          <ClipboardCheck className={closedToday ? "size-6 text-done" : "size-6 text-glow"} aria-hidden />
          <span className="font-display font-semibold text-ink">{closedToday ? "Día cerrado" : "Cerrar mi día"}</span>
        </Link>
      </div>

      <PushCard compact />

      {data.announcements.length > 0 && (
        <section className="hud-panel p-4" aria-labelledby="avisos-title">
          <h2 id="avisos-title" className="mb-2 flex items-center gap-2 font-display font-semibold text-ink">
            <Megaphone className="size-5 text-glow" aria-hidden /> Avisos del taller
          </h2>
          <ul className="flex flex-col gap-2">
            {data.announcements.slice(0, 4).map((a) => (
              <li key={a.id} className={a.level === "importante" ? "rounded-lg border border-pending/40 bg-pending/10 p-2.5 text-sm text-ink" : "text-sm text-ink-soft"}>
                {a.text}
                <span className="mt-0.5 block text-xs text-faint">
                  {a.authorName} · {timeAgo(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
