"use client";

import { AlertOctagon, CalendarClock, Cog, MessageSquare, Paperclip } from "lucide-react";
import Link from "next/link";
import { Chip, cn } from "@/components/ui/primitives";
import { TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, TASK_STATUS_TONE, formatDate } from "@/lib/domain/labels";
import type { Task } from "@/lib/domain/schema";
import { daysBetween } from "@/lib/domain/time";
import type { OrderBrief } from "@/lib/domain/views";

const STRIPE: Record<Task["status"], string> = {
  pendiente: "bg-pending",
  en_proceso: "bg-progress",
  bloqueada: "bg-blocked",
  completada: "bg-done",
};

/**
 * A work order card the way it looks pinned on a shop board: folio stamp,
 * priority stripe, pieces done/total and the due date in plain words.
 */
export function TaskCard({
  task,
  brief,
  href,
  today,
  positionTitle,
}: {
  task: Task;
  brief?: Pick<OrderBrief, "folio" | "due" | "drawingIds" | "photoIds">;
  href: string;
  today: string;
  positionTitle?: string;
}) {
  const due = brief?.due?.date ?? task.dueDate;
  const days = due ? daysBetween(today, due) : null;
  const pct = task.quantity ? Math.round((task.quantityDone / task.quantity) * 100) : null;
  const files = brief ? brief.drawingIds.length + brief.photoIds.length : 0;
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "hud-panel group relative flex overflow-hidden p-0 transition-[border-color,transform] duration-150 hover:border-glow/50 active:scale-[0.99]",
        task.status === "completada" && "opacity-70",
      )}
    >
      <span className={cn("w-1.5 shrink-0", task.priority === "urgente" ? "hazard-stripe" : STRIPE[task.status])} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-glow/40 bg-navy-900/80 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-glow">{brief?.folio ?? task.folio}</span>
          <Chip tone={TASK_STATUS_TONE[task.status]} dot>
            {TASK_STATUS_LABEL[task.status]}
          </Chip>
          {(task.priority === "urgente" || task.priority === "alta") && <Chip tone={task.priority === "urgente" ? "urgent" : "pending"}>{TASK_PRIORITY_LABEL[task.priority]}</Chip>}
        </div>
        <p className="font-display text-lg font-semibold leading-snug text-ink">{task.title}</p>
        {task.blockedReason && task.status === "bloqueada" && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-blocked">
            <AlertOctagon className="size-4 shrink-0" aria-hidden /> {task.blockedReason}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {due && (
            <span className={cn("inline-flex items-center gap-1.5", days !== null && days < 0 ? "font-semibold text-blocked" : days !== null && days <= 1 ? "font-semibold text-pending" : "")}>
              <CalendarClock className="size-4" aria-hidden />
              {days === null ? "" : days < 0 ? `Vencida (${formatDate(due)})` : days === 0 ? "Entrega hoy" : days === 1 ? "Entrega mañana" : `Entrega ${formatDate(due, { weekday: "short", day: "numeric", month: "short" })}`}
            </span>
          )}
          {task.piece && (
            <span className="inline-flex items-center gap-1.5">
              <Cog className="size-4" aria-hidden /> {task.piece}
            </span>
          )}
          {task.plannedHours !== null && <span className="tabular">{task.plannedHours} h</span>}
          {positionTitle && <span>{positionTitle}</span>}
          {files > 0 && (
            <span className="inline-flex items-center gap-1">
              <Paperclip className="size-3.5" aria-hidden /> {files}
            </span>
          )}
          {task.notes.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3.5" aria-hidden /> {task.notes.length}
            </span>
          )}
        </div>
        {task.quantity !== null && (
          <div className="flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
              <div className="h-full rounded-full bg-done transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="tabular text-sm font-semibold text-ink">
              {task.quantityDone}/{task.quantity} piezas
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
