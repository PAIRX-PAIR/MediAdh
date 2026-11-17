"use client";

import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { useSync } from "@/components/providers/sync-provider";
import { useProduction } from "@/lib/client/use-production";
import { PRIORITY_RANK } from "@/lib/domain/labels";
import type { SyncPayload } from "@/lib/domain/views";
import { guideOrder, nextStep, orderSteps } from "@/lib/domain/process";
import { cn } from "@/components/ui/primitives";

/**
 * «Tu siguiente paso»: el recorrido del trabajo que sigue (recibida → en máquina → terminada →
 * entregada → factura) y un solo botón para lo que toca. No reemplaza al panel «Sigue con»:
 * lo resume en cinco pasos para quien no quiere pensar en qué botón sigue.
 */
export function ProcessGuide() {
  const { data } = useSync();
  // Si la persona tiene un puesto con tareas abiertas, su siguiente paso es SU tarea (no el de la orden).
  const personal = nextTaskFor(data);
  if (personal) return <PersonalStep task={personal.task} remaining={personal.remaining} />;
  return <OrderGuide />;
}

/** La tarea que sigue en el puesto de la persona: misma prioridad que el panel de operarios. */
function nextTaskFor(data: SyncPayload) {
  if (!data.me.positionId) return null;
  const open = data.tasks
    .filter((t) => t.positionId === data.me.positionId && t.status !== "completada")
    .sort((a, b) => {
      const blocked = Number(a.status === "bloqueada") - Number(b.status === "bloqueada");
      if (blocked) return blocked;
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr) return pr;
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    });
  const task = open.find((t) => t.status !== "bloqueada") ?? open[0];
  return task ? { task, remaining: open.length } : null;
}

type PersonalTask = NonNullable<ReturnType<typeof nextTaskFor>>["task"];

function PersonalStep({ task, remaining }: { task: PersonalTask; remaining: number }) {
  const blocked = task.status === "bloqueada";
  return (
    <section className="hud-panel hud-corners flex flex-col gap-4 p-5" aria-labelledby="siguiente-paso-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="siguiente-paso-title" className="font-display text-xl font-bold text-ink">
          Tu siguiente paso
        </h2>
        <span className="tabular text-sm text-muted">{remaining === 1 ? "1 tarea abierta" : `${remaining} tareas abiertas`}</span>
      </div>
      <p className="-mt-2 min-w-0 truncate text-sm text-muted">
        <span className="tabular font-mono font-semibold text-glow">{task.folio}</span> · {task.title}
      </p>
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-night/50 px-4 py-3.5 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-sm text-ink-soft">
          <strong className="text-ink">{blocked ? "Bloqueada." : task.status === "en_proceso" ? "En curso." : "Pendiente."}</strong>{" "}
          {blocked ? task.blockedReason || "Resuelve el bloqueo para seguir." : task.description || "Abre la tarea para ver el detalle."}
          {task.quantity ? ` · ${task.quantityDone} de ${task.quantity} piezas` : ""}
        </p>
        <Link
          href="/tareas"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-glow/40 bg-gradient-to-b from-navy-400 to-navy-600 px-5 font-display text-sm font-semibold text-white shadow-glow transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97]"
        >
          Abrir mi tarea <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function OrderGuide() {
  const prod = useProduction();
  const order = guideOrder(prod.orders, prod.next?.orderId ?? null);
  if (!order) return null;
  const steps = orderSteps(order);
  const next = order.status === "garantia" ? null : nextStep(steps);
  const warranty = order.status === "garantia";
  if (!next && !warranty) return null;
  const doneCount = steps.filter((s) => s.done).length;
  const href = `/admin/ordenes?o=${order.id}`;
  return (
    <section className="hud-panel hud-corners flex flex-col gap-4 p-5" aria-labelledby="siguiente-paso-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="siguiente-paso-title" className="font-display text-xl font-bold text-ink">
          Tu siguiente paso
        </h2>
        <span className="tabular text-sm text-muted">
          {warranty ? "Garantía abierta" : `${doneCount} de ${steps.length}`}
        </span>
      </div>
      <p className="-mt-2 min-w-0 truncate text-sm text-muted">
        <span className="tabular font-mono font-semibold text-glow">{order.folio}</span> · {order.title} · {order.clientName}
      </p>
      {!warranty && (
        <ol className="grid grid-cols-5 gap-1.5" aria-label="Pasos del trabajo">
          {steps.map((s, i) => {
            const current = next !== null && s.key === next.key;
            return (
              <li key={s.key} className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                <span
                  className={cn(
                    "grid size-8 place-items-center rounded-full border text-xs font-bold transition-[background-color,box-shadow] duration-500",
                    s.done ? "border-done/50 bg-done/20 text-done" : current ? "border-glow bg-navy-700/70 text-glow shadow-glow" : "border-line bg-night/70 text-faint",
                  )}
                  aria-hidden
                >
                  {s.done ? <Check className="size-4" strokeWidth={2.5} /> : i + 1}
                </span>
                <span className={cn("line-clamp-2 text-[11px] font-semibold leading-tight sm:text-xs", current ? "text-ink" : "text-muted")}>
                  {s.label}
                  <span className="sr-only">{s.done ? " (hecho)" : current ? " (siguiente)" : ""}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-night/50 px-4 py-3.5 sm:flex-row sm:items-center">
        <p className="min-w-0 flex-1 text-sm text-ink-soft">
          {warranty ? (
            <>
              <strong className="text-ink">Garantía.</strong> Hay un reclamo abierto: resuélvelo y vuelve a entregar.
            </>
          ) : (
            <>
              <strong className="text-ink">{next!.label}.</strong> {next!.hint}
            </>
          )}
        </p>
        <Link
          href={href}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-glow/40 bg-gradient-to-b from-navy-400 to-navy-600 px-5 font-display text-sm font-semibold text-white shadow-glow transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.97]"
        >
          {warranty ? "Ver la orden" : next!.cta} <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
