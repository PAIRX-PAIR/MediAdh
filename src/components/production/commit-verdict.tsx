"use client";

import { CheckCircle2, CircleAlert, XCircle } from "lucide-react";
import { cn } from "@/components/ui/primitives";
import { formatDate } from "@/lib/domain/labels";
import type { CommitAnswer } from "@/lib/domain/planning";

const STYLE = {
  si: { icon: CheckCircle2, label: "Sí", box: "border-done/40 bg-done/10", text: "text-done" },
  si_moviendo: { icon: CircleAlert, label: "Sí, moviendo trabajos", box: "border-pending/40 bg-pending/10", text: "text-pending" },
  no: { icon: XCircle, label: "No", box: "border-blocked/40 bg-blocked/10", text: "text-blocked" },
} as const;

/** The answer to "¿Me puedo comprometer?" with its explanation (icon + label, never color alone). */
export function CommitVerdict({ answer, compact = false }: { answer: CommitAnswer; compact?: boolean }) {
  const s = STYLE[answer.verdict];
  const Icon = s.icon;
  return (
    <div role="status" aria-live="polite" className={cn("rounded-xl border p-3.5", s.box)}>
      <p className={cn("flex items-center gap-2 font-display text-lg font-bold", s.text)}>
        <Icon className="size-5 shrink-0" aria-hidden /> {s.label}
        {answer.feasibleDate && answer.verdict !== "si" && (
          <span className="text-sm font-semibold text-ink-soft">· posible el {formatDate(answer.feasibleDate, { weekday: "short", day: "numeric", month: "short" })}</span>
        )}
      </p>
      <p className="mt-1 text-sm text-ink-soft">{answer.explanation}</p>
      {!compact && answer.moved.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {answer.moved.map((m) => (
            <li key={m.orderId} className="flex flex-wrap gap-x-2">
              <span className="font-mono font-semibold text-ink">{m.folio}</span>
              <span className="text-muted">
                {m.from ? formatDate(m.from) : "—"} → {m.to ? formatDate(m.to) : "sin fecha"}
              </span>
              <span className={m.onTime ? "text-done" : "font-semibold text-blocked"}>{m.onTime ? "sigue a tiempo" : "quedaría tarde"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
