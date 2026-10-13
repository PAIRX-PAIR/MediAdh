"use client";

import { useEffect, useState } from "react";
import { cn } from "@/components/ui/primitives";
import { format12h, formatDuration, workdayStatus, type Shift } from "@/lib/domain/calendar";
import { timeInZone } from "@/lib/domain/time";

/**
 * Hora actual (12 h) con la jornada de hoy: ingreso, salida y cuánto falta por
 * trabajar según el horario del taller (sin contar el almuerzo).
 */
export function WorkdayClock({ date, shifts, timezone, className }: { date: string; shifts: Shift[]; timezone: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Client-side only: the server and the browser would disagree on the second.
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  if (now === null) return <span className={cn("block h-9 w-28", className)} />;

  const label = format12h(timeInZone(new Date(now), timezone)); // "2:05 p. m."
  const [clock = "", ...rest] = label.split(" ");
  const [hour, mm] = clock.split(":");
  const suffix = rest.join(" ");
  const status = workdayStatus(now, date, shifts, timezone);
  const detail =
    status.phase === "libre"
      ? "Hoy no se trabaja"
      : status.phase === "antes"
        ? `Ingreso ${format12h(status.start!)} · sale ${format12h(status.end!)}`
        : status.phase === "terminada"
          ? `Jornada terminada (${format12h(status.end!)})`
          : status.phase === "pausa"
            ? `Almuerzo · vuelve ${format12h(status.resumesAt ?? status.end!)} · faltan ${formatDuration(status.remainingMinutes)}`
            : `Sale ${format12h(status.end!)} · faltan ${formatDuration(status.remainingMinutes)}`;

  return (
    <div className={cn("flex flex-col items-end leading-tight", className)} role="timer" aria-label={`Son las ${label}. ${detail}`}>
      <time className="font-mono text-sm tabular-nums text-glow-soft" aria-hidden>
        {hour}
        <span className="animate-blink">:</span>
        {mm}
        <span className="ml-1 text-[11px]">{suffix}</span>
      </time>
      <span className={cn("text-[11px]", status.phase === "turno" ? "text-ink-soft" : "text-muted")} aria-hidden>
        {detail}
      </span>
    </div>
  );
}
