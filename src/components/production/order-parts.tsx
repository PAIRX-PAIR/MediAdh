"use client";

import { AlertTriangle, CalendarClock, Clock3, FileWarning, Receipt, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Chip, cn } from "@/components/ui/primitives";
import { DIFFICULTY_LABEL, ORDER_STATUS_TONE, PROCESS_LABEL, formatDate } from "@/lib/domain/labels";
import { ORDER_STATUS_LABEL, isLate } from "@/lib/domain/lifecycle";
import { remainingHours } from "@/lib/domain/planning";
import { formatCop } from "@/lib/domain/quote";
import type { Machine, OrderStatus } from "@/lib/domain/schema";
import { daysBetween } from "@/lib/domain/time";
import type { OrderView } from "@/lib/domain/views";

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  return (
    <Chip tone={ORDER_STATUS_TONE[status]} dot>
      {ORDER_STATUS_LABEL[status]}
    </Chip>
  );
}

/** Due date in words relative to today: "Hoy 4:00 p. m.", "Mañana", "En 3 días", "Vencida hace 2 días". */
export function dueText(due: OrderView["due"], today: string): { text: string; tone: "blocked" | "pending" | "neutral" } {
  if (!due) return { text: "Sin fecha de entrega", tone: "neutral" };
  const days = daysBetween(today, due.date);
  const time = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" }).format(new Date(`2000-01-01T${due.time}:00`));
  if (days < 0) return { text: `Vencida hace ${-days} ${days === -1 ? "día" : "días"}`, tone: "blocked" };
  if (days === 0) return { text: `Hoy ${time}`, tone: "pending" };
  if (days === 1) return { text: `Mañana ${time}`, tone: "pending" };
  if (days <= 6) return { text: `En ${days} días · ${formatDate(due.date, { weekday: "short", day: "numeric", month: "short" })}`, tone: "neutral" };
  return { text: formatDate(due.date, { day: "numeric", month: "short", year: "numeric" }), tone: "neutral" };
}

export function DueBadge({ order, today, timezone, now }: { order: OrderView; today: string; timezone: string; now: number }) {
  if (order.deliveredAt) {
    const claim = order.claims.find((c) => !c.resolvedAt);
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-sm", claim ? "font-semibold text-blocked" : "text-muted")}>
        <CalendarClock className="size-4" aria-hidden />
        {claim ? `Reclamo del ${formatDate(claim.at)}` : `Entregada ${formatDate(order.deliveredAt)}`}
      </span>
    );
  }
  const late = ["recibida", "en_proceso", "terminada", "garantia"].includes(order.status) && isLate(order, timezone, now);
  const d = dueText(order.due, today);
  const tone = late ? "blocked" : d.tone;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", tone === "blocked" ? "font-semibold text-blocked" : tone === "pending" ? "font-semibold text-pending" : "text-muted")}>
      {late ? <AlertTriangle className="size-4" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />}
      {late && !d.text.startsWith("Vencida") ? `Vencida · ${d.text}` : d.text}
    </span>
  );
}

/** One work order as a dense, scannable row/card. */
export function OrderCard({
  order,
  machines,
  today,
  timezone,
  now,
  href,
}: {
  order: OrderView;
  machines: Map<string, Machine>;
  today: string;
  timezone: string;
  now: number;
  href: string;
}) {
  const pending = order.workItems.filter((w) => w.status !== "completada");
  const hours = order.workItems.reduce((s, w) => s + remainingHours(w), 0);
  const done = order.workItems.length ? order.workItems.length - pending.length : 0;
  const blocked = order.workItems.some((w) => w.status === "bloqueada");
  return (
    <Link
      href={href}
      scroll={false}
      className="hud-panel group relative flex flex-col gap-2 overflow-hidden p-4 transition-colors hover:border-glow/50 active:scale-[0.995]"
    >
      {order.urgent && <span className="hazard-stripe absolute inset-x-0 top-0 h-1" aria-hidden />}
      <div className="flex flex-wrap items-center gap-2">
        <span className="tabular font-mono text-sm font-semibold text-glow">{order.folio}</span>
        <OrderStatusChip status={order.status} />
        {order.urgent && <Chip tone="urgent">Urgente</Chip>}
        {order.difficulty > 1 && <Chip tone="pending">{DIFFICULTY_LABEL[order.difficulty]}</Chip>}
        {order.invoice.pending && (
          <Chip tone="urgent">
            <Receipt className="size-3" aria-hidden /> Facturar
          </Chip>
        )}
        {order.status === "garantia" && <ShieldAlert className="size-4 text-blocked" aria-label="Garantía abierta" />}
        {blocked && <FileWarning className="size-4 text-blocked" aria-label="Tiene pasos bloqueados" />}
      </div>
      <div className="min-w-0">
        <p className="truncate font-display text-[17px] font-semibold text-ink">{order.title}</p>
        <p className="truncate text-sm text-muted">
          {order.clientName} · {order.intake.quantity} {order.intake.quantity === 1 ? "pieza" : "piezas"}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <DueBadge order={order} today={today} timezone={timezone} now={now} />
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <Clock3 className="size-3.5" aria-hidden />
          {order.workItems.length === 0 ? "Sin ruta" : `${done}/${order.workItems.length} pasos · ${Math.round(hours * 10) / 10} h pendientes`}
        </span>
      </div>
      {(pending.length > 0 || (order.finalPrice ?? order.price) !== null) && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <p className="min-w-0 truncate text-faint">
            {pending.map((w) => `${PROCESS_LABEL[w.process]}${w.machineId ? ` ${machines.get(w.machineId)?.name ?? ""}` : ""}`).join(" → ")}
          </p>
          {(order.finalPrice ?? order.price) !== null && <span className="tabular shrink-0 text-ink-soft">{formatCop(order.finalPrice ?? order.price)}</span>}
        </div>
      )}
    </Link>
  );
}
