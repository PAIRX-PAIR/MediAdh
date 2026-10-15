"use client";

import { ClipboardCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { Button, Input, Spinner, cn } from "@/components/ui/primitives";
import { request } from "@/lib/client/api";

type Status = "completada" | "en_proceso" | "bloqueada" | "pendiente";

interface CheckinTask {
  id: string;
  folio: string;
  title: string;
  piece: string | null;
  quantity: number | null;
  quantityDone: number;
  status: "pendiente" | "en_proceso" | "bloqueada" | "completada";
  actualHours: number | null;
  plannedHours: number | null;
  blockedReason: string | null;
}

interface CheckinData {
  date: string;
  minutesToEnd: number | null;
  tasks: CheckinTask[];
}

interface Answer {
  status: Status;
  quantityDone: string;
  hours: string;
  reason: string;
}

const WINDOW_MINUTES = 15;
const POLL_MS = 60_000;

const OPTIONS: Array<{ value: Status; label: string }> = [
  { value: "completada", label: "Terminada" },
  { value: "en_proceso", label: "Sigo mañana" },
  { value: "bloqueada", label: "Bloqueada" },
  { value: "pendiente", label: "No empecé" },
];

/**
 * Check-in de fin de turno: 15 minutos antes de salir, el operario dice en qué
 * va cada trabajo. Los trabajos largos quedan a medias: se guardan piezas y horas
 * y la cola de la máquina se recalcula sola (las horas reportadas se descuentan).
 */
export function ShiftCheckin({ open: openProp, onClose }: { open?: boolean; onClose?: () => void }) {
  const [data, setData] = useState<CheckinData | null>(null);
  const [auto, setAuto] = useState(false);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    request<CheckinData>("/api/dispositivo/avance")
      .then((d) => {
        setData(d);
        // Opens by itself once a day, in the last 15 minutes, unless it was closed already today.
        const dismissed = sessionStorage.getItem(`checkin-${d.date}`) === "cerrado";
        if (d.minutesToEnd !== null && d.minutesToEnd <= WINDOW_MINUTES && !dismissed) setAuto(true);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const open = openProp ?? auto;
  const close = () => {
    if (data) sessionStorage.setItem(`checkin-${data.date}`, "cerrado");
    setAuto(false);
    onClose?.();
  };

  const answerOf = (t: CheckinTask): Answer =>
    answers[t.id] ?? {
      status: t.status,
      quantityDone: t.quantityDone ? String(t.quantityDone) : "",
      hours: t.actualHours ? String(t.actualHours) : "",
      reason: t.blockedReason ?? "",
    };
  const set = (t: CheckinTask, patch: Partial<Answer>) => setAnswers((a) => ({ ...a, [t.id]: { ...answerOf(t), ...patch } }));

  const save = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      const updates = data.tasks.map((t) => {
        const a = answerOf(t);
        if (a.status === "bloqueada" && !a.reason.trim()) throw new Error(`Indica por qué está bloqueado «${t.title}».`);
        const hours = a.hours.trim() === "" ? NaN : Number(a.hours.replace(",", "."));
        const qty = a.quantityDone.trim() === "" ? NaN : Number(a.quantityDone);
        return {
          taskId: t.id,
          status: a.status,
          ...(Number.isFinite(qty) ? { quantityDone: qty } : {}),
          ...(Number.isFinite(hours) ? { actualHours: hours } : {}),
          ...(a.status === "bloqueada" ? { blockedReason: a.reason.trim() } : {}),
        };
      });
      await request("/api/dispositivo/avance", { method: "POST", body: { updates } });
      setAnswers({});
      load();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Avance del turno"
      description={data?.minutesToEnd != null ? `Faltan ${data.minutesToEnd} min para salir. Cuéntanos cómo va cada trabajo.` : "Cuéntanos cómo va cada trabajo."}
      size="md"
      footer={
        data && data.tasks.length > 0 ? (
          <Button loading={busy} icon={<ClipboardCheck className="size-4" />} onClick={() => void save()}>
            Guardar avance
          </Button>
        ) : undefined
      }
    >
      {!data ? (
        <Spinner />
      ) : data.tasks.length === 0 ? (
        <p className="text-sm text-muted">No tienes trabajos abiertos en tu puesto.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.tasks.map((t) => {
            const a = answerOf(t);
            return (
              <article key={t.id} className="rounded-xl border border-line bg-night/50 p-3">
                <p className="font-semibold text-ink">
                  <span className="font-mono text-glow">{t.folio}</span> · {t.title}
                </p>
                {t.piece && <p className="text-xs text-muted">{t.piece}</p>}
                <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={`Estado de ${t.title}`}>
                  {OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={a.status === o.value}
                      onClick={() => set(t, { status: o.value })}
                      className={cn(
                        "h-10 rounded-lg border px-3 text-sm font-semibold",
                        a.status === o.value ? "border-glow bg-navy-700/60 text-ink" : "border-line text-muted",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {a.status !== "completada" && a.status !== "pendiente" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {t.quantity !== null && (
                      <label className="text-xs text-muted">
                        Piezas listas (de {t.quantity})
                        <Input inputMode="numeric" value={a.quantityDone} onChange={(e) => set(t, { quantityDone: e.target.value })} className="mt-1" />
                      </label>
                    )}
                    <label className="text-xs text-muted">
                      Horas trabajadas hasta ahora{t.plannedHours ? ` (plan ${t.plannedHours} h)` : ""}
                      <Input inputMode="decimal" value={a.hours} onChange={(e) => set(t, { hours: e.target.value })} className="mt-1" />
                    </label>
                  </div>
                )}
                {a.status === "bloqueada" && (
                  <label className="mt-2 block text-xs text-muted">
                    ¿Qué lo bloquea?
                    <Input value={a.reason} maxLength={300} placeholder="Ej: falta el inserto CCMT 09" onChange={(e) => set(t, { reason: e.target.value })} className="mt-1" />
                  </label>
                )}
              </article>
            );
          })}
          {error && (
            <p role="alert" className="text-sm text-blocked">
              {error}
            </p>
          )}
          <p className="text-xs text-muted">Las horas que pongas se descuentan del trabajo: la cola de la máquina se actualiza sola y las fechas libres cambian.</p>
        </div>
      )}
    </Modal>
  );
}
