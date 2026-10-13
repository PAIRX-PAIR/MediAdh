"use client";

import { Clock, LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Spinner } from "@/components/ui/primitives";
import { api, type MyAttendance } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { formatDate } from "@/lib/domain/labels";
import { HOUR_KINDS, HOUR_KIND_LABEL } from "@/lib/domain/payroll";

const hours = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 2 })} h`;

/** Entrada/salida from the phone, today's blocks and this quincena's overtime (hours only). */
export function ClockCard({ today }: { today: string }) {
  const [data, setData] = useState<MyAttendance | null>(null);
  const [failed, setFailed] = useState(false);
  const { run, busy } = useAction();

  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);

  useEffect(() => {
    api.attendance
      .mine()
      .then((r) => {
        setData(r);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [version]);

  const openToday = data?.open && data.open.date === today ? data.open : null;
  const staleOpen = data?.open && data.open.date !== today ? data.open : null;
  const extras = data ? HOUR_KINDS.filter((k) => k !== "holidayOrdinary" && data.hours[k] > 0) : [];
  const extraTotal = data ? extras.reduce((sum, k) => sum + data.hours[k], 0) : 0;

  return (
    <section className="hud-panel p-4" aria-labelledby="reloj-title">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="reloj-title" className="hud-label flex items-center gap-2 text-glow-soft">
          <Clock className="size-4" aria-hidden /> Mi horario
        </h2>
        {data && <span className="text-xs text-muted">Quincena {formatDate(data.quincena.from, { day: "numeric" })}–{formatDate(data.quincena.to, { day: "numeric", month: "short" })}</span>}
      </div>
      {!data ? (
        failed ? (
          <p className="text-sm text-muted">No se pudo cargar tu registro de horas.</p>
        ) : (
          <Spinner />
        )
      ) : (
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            block
            variant={openToday ? "secondary" : "primary"}
            loading={busy === "clock"}
            icon={openToday ? <LogOut className="size-5" /> : <LogIn className="size-5" />}
            onClick={async () => {
              const action = openToday ? "out" : "in";
              const ok = await run("clock", () => api.attendance.clock(action), (r) => `${action === "in" ? "Entrada" : "Salida"} marcada a las ${action === "in" ? r.entry.start : r.entry.end}`);
              if (ok) load();
            }}
          >
            {openToday ? `Marcar salida (entraste a las ${openToday.start})` : "Marcar entrada"}
          </Button>
          {staleOpen && (
            <p className="rounded-lg border border-pending/40 bg-pending/10 p-2.5 text-sm text-pending">
              Tu entrada del {formatDate(staleOpen.date, { day: "numeric", month: "long" })} quedó sin salida. Avísale al coordinador para que la corrija.
            </p>
          )}
          {data.today.length > 0 && (
            <ul className="flex flex-wrap gap-2 text-sm" aria-label="Registros de hoy">
              {data.today.map((e) => (
                <li key={e.id} className="tabular rounded-lg border border-line px-2.5 py-1 text-ink-soft">
                  {e.start} – {e.end ?? "…"}
                </li>
              ))}
            </ul>
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-line bg-night/40 p-2.5">
              <dt className="text-xs text-muted">Trabajadas en la quincena</dt>
              <dd className="tabular font-display text-lg font-semibold text-ink">{hours(data.workedHours)}</dd>
            </div>
            <div className="rounded-lg border border-line bg-night/40 p-2.5">
              <dt className="text-xs text-muted">Horas extra</dt>
              <dd className="tabular font-display text-lg font-semibold text-pending">{hours(extraTotal)}</dd>
            </div>
          </dl>
          {extras.length > 0 && (
            <p className="text-xs text-muted">
              {extras.map((k) => `${HOUR_KIND_LABEL[k]}: ${hours(data.hours[k])}`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
