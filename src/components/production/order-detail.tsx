"use client";

import {
  Ban,
  CheckCheck,
  CircleCheckBig,
  Edit3,
  PackageCheck,
  Play,
  Receipt,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { AttachmentGallery, AttachmentUploader } from "@/components/ui/attachments";
import { ChangeLog, KeyValues, MoneyInput, Segmented, StarRating } from "@/components/ui/kit";
import { Modal, useConfirm } from "@/components/ui/overlay";
import { Button, Chip, Field, Input, Select, Spinner, Textarea, cn } from "@/components/ui/primitives";
import { api, type OrderActionInput } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useProduction } from "@/lib/client/use-production";
import { adjustForInflation } from "@/lib/domain/ipc";
import { CLAIM_KIND_LABEL, DIFFICULTY_LABEL, PROCESS_LABEL, TASK_STATUS_LABEL, TASK_STATUS_TONE, formatDate, formatDateTime } from "@/lib/domain/labels";
import { autoCloseAt, orderMoney, warrantyStatus, type WarrantyStatus } from "@/lib/domain/lifecycle";
import { formatCop } from "@/lib/domain/quote";
import type { ClaimKind, Order } from "@/lib/domain/schema";
import { DueBadge, OrderStatusChip } from "./order-parts";

type Tab = "resumen" | "ruta" | "archivos" | "dinero" | "historial";

export function OrderDetailModal({ orderId, onClose, onEdit, initialTab = "resumen" }: { orderId: string; onClose: () => void; onEdit: () => void; initialTab?: Tab }) {
  const { data } = useSync();
  const prod = useProduction();
  const live = prod.orders.find((o) => o.id === orderId);
  const [full, setFull] = useState<Order | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const { run, busy } = useAction();
  const { confirm, dialog } = useConfirm();
  const [sheet, setSheet] = useState<null | "deliver" | "invoice" | "claim" | "resolve" | "cancel">(null);

  // The change log is not in the live payload; fetch the full order (and re-fetch when it changes).
  useEffect(() => {
    let cancelled = false;
    api.orders
      .get(orderId)
      .then((r) => !cancelled && setFull(r.order))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [orderId, live?.updatedAt]);

  const order = live ?? full;
  if (!order) {
    return (
      <Modal open onClose={onClose} title="Orden de trabajo">
        <Spinner label="Cargando la orden" />
      </Modal>
    );
  }

  const act = (key: string, input: OrderActionInput, success: string) => run(key, () => api.orders.action(order.id, input), success);
  const rate = (id: string | null) => prod.machineById.get(id ?? "")?.hourlyRate ?? 0;
  const money = orderMoney(order, rate);
  const s = order.status;
  const closeAt = s === "entregada" ? autoCloseAt(order, prod.settings?.claimWindowDays ?? 3) : null;
  const openClaims = order.claims.filter((c) => !c.resolvedAt);
  const planned = prod.schedule.jobs.filter((j) => j.orderId === order.id);

  const actions = (
    <div className="flex flex-wrap gap-2">
      {["recibida", "en_proceso", "garantia", "terminada", "entregada"].includes(s) && (
        <Button size="sm" variant="secondary" icon={<Edit3 className="size-4" />} onClick={onEdit}>
          Editar
        </Button>
      )}
      {s === "recibida" && (
        <Button size="sm" variant="secondary" icon={<Play className="size-4" />} loading={busy === "start"} onClick={() => void act("start", { action: "status", to: "en_proceso" }, "Orden en proceso")}>
          Iniciar
        </Button>
      )}
      {["recibida", "en_proceso"].includes(s) && (
        <Button
          size="sm"
          variant="secondary"
          icon={<CircleCheckBig className="size-4" />}
          loading={busy === "finish"}
          onClick={async () => {
            if (await confirm({ title: "¿Marcar todo como terminado?", body: "Los pasos pendientes y sus tareas quedarán completados.", confirmLabel: "Terminar" })) {
              void act("finish", { action: "status", to: "terminada" }, "Lista para entregar");
            }
          }}
        >
          Terminar
        </Button>
      )}
      {["terminada", "garantia", "en_proceso", "recibida"].includes(s) && (
        <Button size="sm" icon={<PackageCheck className="size-4" />} onClick={() => setSheet("deliver")}>
          Entregar
        </Button>
      )}
      {s === "terminada" && (
        <Button size="sm" variant="ghost" icon={<Undo2 className="size-4" />} onClick={() => void act("back", { action: "status", to: "en_proceso" }, "Volvió a proceso")}>
          Volver a proceso
        </Button>
      )}
      {s === "entregada" && (
        <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} loading={busy === "close"} onClick={() => void act("close", { action: "close" }, "Servicio cerrado · FACTURAR")}>
          Cerrar ahora
        </Button>
      )}
      {(s === "cerrada" || s === "entregada") && order.invoice.pending && (
        <Button size="sm" icon={<Receipt className="size-4" />} onClick={() => setSheet("invoice")}>
          Marcar facturado
        </Button>
      )}
      {(s === "entregada" || s === "cerrada") && (
        <Button size="sm" variant="secondary" icon={<ShieldAlert className="size-4" />} onClick={() => setSheet("claim")}>
          Reclamo
        </Button>
      )}
      {openClaims.length > 0 && (
        <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} onClick={() => setSheet("resolve")}>
          Resolver reclamo
        </Button>
      )}
      {["recibida", "en_proceso", "terminada", "garantia"].includes(s) && (
        <Button size="sm" variant="ghost" icon={<Ban className="size-4" />} onClick={() => setSheet("cancel")}>
          Cancelar
        </Button>
      )}
      {s === "cancelada" && (
        <Button size="sm" variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => void act("reopen", { action: "reopen" }, "Orden reabierta")}>
          Reabrir
        </Button>
      )}
      {(s === "cancelada" || data.me.scope === "total") && (
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 className="size-4" />}
          onClick={async () => {
            const body =
              s === "cancelada"
                ? "Se borra la orden cancelada. Esta acción no se puede deshacer."
                : "Se borra la orden y sus tareas. Si está entregada, sus ventas dejan de contar en Ganancias. Esta acción no se puede deshacer.";
            if (await confirm({ title: `¿Eliminar ${order.folio}?`, body, confirmLabel: "Eliminar", danger: true })) {
              const ok = await run("delete", () => api.orders.remove(order.id), "Orden eliminada");
              if (ok) onClose();
            }
          }}
        >
          Eliminar
        </Button>
      )}
    </div>
  );

  const adjusted = money.price !== null && order.deliveredAt ? adjustForInflation(money.price, order.deliveredAt.slice(0, 7), prod.ipc, data.today.slice(0, 7)) : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`${order.folio} · ${order.title}`}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <OrderStatusChip status={order.status} />
          {order.invoice.pending && <Chip tone="urgent">Facturar</Chip>}
          <span>{order.clientName}</span>
          <DueBadge order={order} today={data.today} timezone={data.settings.timezone} now={prod.ctx.now} />
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        {actions}
        {closeAt && (
          <p className="rounded-xl border border-glow/30 bg-glow/5 px-3.5 py-2.5 text-sm text-glow-soft">
            Entregada {formatDateTime(order.deliveredAt)}. Si no hay reclamos, el servicio se cierra solo el {formatDateTime(new Date(closeAt).toISOString())} y aparecerá FACTURAR.
          </p>
        )}
        {openClaims.map((c) => (
          <p key={c.id} className="rounded-xl border border-blocked/40 bg-blocked/10 px-3.5 py-2.5 text-sm text-[#ffb3b8]">
            <strong>{CLAIM_KIND_LABEL[c.kind]}</strong> · {formatDateTime(c.at)}: {c.description}
          </p>
        ))}

        <Segmented
          label="Secciones de la orden"
          value={tab}
          onChange={setTab}
          options={[
            { value: "resumen", label: "Resumen" },
            { value: "ruta", label: "Ruta", count: order.workItems.filter((w) => w.status !== "completada").length },
            { value: "archivos", label: "Archivos", count: order.drawingIds.length + order.intakePhotoIds.length + order.photoIds.length },
            { value: "dinero", label: "Dinero" },
            { value: "historial", label: "Historial" },
          ]}
        />

        {tab === "resumen" && (
          <div className="flex flex-col gap-4">
            <KeyValues
              items={[
                ["Cliente", order.clientName],
                ["Cantidad", `${order.intake.quantity}`],
                ["Ingreso", formatDateTime(order.intake.receivedAt)],
                ["Entrega pactada", order.due ? `${formatDate(order.due.date, { weekday: "long", day: "numeric", month: "long" })} · ${order.due.time}` : "Sin fecha"],
                ["Dificultad", `${DIFFICULTY_LABEL[order.difficulty]}${order.urgent ? " · Urgente" : ""}`],
                ["Garantía", warrantyLabel(warrantyStatus(order, prod.settings?.warrantyDays ?? 90, data.settings.timezone))],
                ["Estado de llegada", order.intake.condition || "—"],
                ["Cotización", order.quoteId ? (prod.quotes.find((q) => q.id === order.quoteId)?.folio ?? "Sí") : "—"],
                ["Satisfacción", <StarRating key="s" value={order.satisfaction} label="Satisfacción del cliente" />],
              ]}
            />
            {order.description && (
              <div>
                <p className="text-xs text-muted">Descripción técnica</p>
                <p className="whitespace-pre-wrap text-sm text-ink">{order.description}</p>
              </div>
            )}
            {order.notes && (
              <div>
                <p className="text-xs text-muted">Notas internas</p>
                <p className="whitespace-pre-wrap text-sm text-ink">{order.notes}</p>
              </div>
            )}
            {order.claims.length > 0 && (
              <div>
                <p className="mb-1 text-xs text-muted">Reclamos</p>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {order.claims.map((c) => (
                    <li key={c.id} className="text-ink-soft">
                      <strong className="text-ink">{CLAIM_KIND_LABEL[c.kind]}</strong> {formatDate(c.at)} · {c.description}
                      {c.resolvedAt ? <span className="text-done"> · resuelto: {c.resolution}</span> : <span className="text-blocked"> · abierto</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === "ruta" && (
          <ol className="flex flex-col gap-2">
            {order.workItems.length === 0 && <p className="text-sm text-muted">Sin pasos de proceso. Edita la orden para agregarlos.</p>}
            {order.workItems.map((w, i) => {
              const job = planned.find((j) => j.workItemId === w.id);
              const position = data.positions.find((p) => p.id === w.positionId);
              const task = data.tasks.find((t) => t.id === w.taskId);
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-night/50 p-3">
                  <span className="tabular w-6 font-mono text-sm text-faint">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {PROCESS_LABEL[w.process]} · {w.machineId ? (prod.machineById.get(w.machineId)?.name ?? "Máquina") : "cualquier máquina"}
                    </p>
                    <p className="text-xs text-muted">
                      {position ? `${position.title}${position.holder ? ` · ${position.holder.name}` : " · vacante"}` : "Sin puesto"}
                      {w.description ? ` · ${w.description}` : ""}
                    </p>
                    {task?.blockedReason && <p className="text-xs font-semibold text-blocked">Bloqueada: {task.blockedReason}</p>}
                  </div>
                  <span className="tabular text-sm text-ink-soft">
                    {w.actualHours !== null ? `${w.actualHours} / ` : ""}
                    {w.plannedHours} h
                  </span>
                  <Chip tone={TASK_STATUS_TONE[w.status]}>{TASK_STATUS_LABEL[w.status]}</Chip>
                  {job?.endDate && w.status !== "completada" && (
                    <span className={cn("text-xs", job.late ? "font-semibold text-blocked" : "text-muted")}>
                      Fin estimado {formatDate(job.endDate, { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {tab === "archivos" && (
          <div className="flex flex-col gap-6">
            {(
              [
                ["plano", "Planos y dibujos", order.drawingIds, false],
                ["foto_ingreso", "Fotos de llegada", order.intakePhotoIds, true],
                ["foto", "Fotos del trabajo", order.photoIds, true],
              ] as const
            ).map(([kind, label, ids, camera]) => (
              <section key={kind}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-display font-semibold text-ink">{label}</h3>
                  <div className="flex gap-2">
                    {camera && <AttachmentUploader kind={kind} orderId={order.id} camera onUploaded={() => undefined} />}
                    <AttachmentUploader kind={kind} orderId={order.id} onUploaded={() => undefined} label={kind === "plano" ? "Adjuntar plano o PDF" : "Subir fotos"} />
                  </div>
                </div>
                <AttachmentGallery items={prod.attachmentsOf([...ids])} canRemove empty="Nada adjunto todavía." />
              </section>
            ))}
            <p className="text-xs text-muted">Fotos hasta 4 MB (se comprimen solas en el celular) y PDF hasta 4 MB. Solo las ve el equipo que trabaja en esta orden.</p>
          </div>
        )}

        {tab === "dinero" && (
          <div className="flex flex-col gap-4">
            <KeyValues
              items={[
                ["Precio pactado (antes de IVA)", formatCop(order.price)],
                ["Precio final", formatCop(order.finalPrice)],
                ["Insumos", formatCop(money.supplies)],
                ["Costo de máquinas (horas reales × tarifa)", formatCop(money.machineCost)],
                ["Margen bruto", money.grossMargin === null ? "—" : formatCop(money.grossMargin)],
                [
                  "Precio a hoy (IPC)",
                  adjusted ? `${formatCop(adjusted.value)} · índice ${adjusted.fromMonth} → ${adjusted.toMonth}` : order.deliveredAt ? "Falta el IPC del mes" : "Al entregar",
                ],
              ]}
            />
            {order.supplies.length > 0 && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1.5 font-semibold">Insumo</th>
                    <th className="font-semibold">Proveedor</th>
                    <th className="text-right font-semibold">Cant.</th>
                    <th className="text-right font-semibold">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {order.supplies.map((l) => (
                    <tr key={l.id} className="border-t border-line/60">
                      <td className="py-1.5 text-ink">{l.description}</td>
                      <td className="text-ink-soft">{l.supplier || "—"}</td>
                      <td className="tabular text-right text-ink-soft">{l.quantity}</td>
                      <td className="tabular text-right text-ink">{formatCop(Math.round(l.quantity * l.unitCost))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === "historial" && (full ? <ChangeLog entries={full.history} /> : <Spinner label="Cargando historial" />)}
      </div>

      {sheet === "deliver" && <DeliverSheet order={order} onClose={() => setSheet(null)} />}
      {sheet === "invoice" && <InvoiceSheet orderId={order.id} onClose={() => setSheet(null)} />}
      {sheet === "claim" && <ClaimSheet orderId={order.id} onClose={() => setSheet(null)} />}
      {sheet === "resolve" && openClaims[0] && <ResolveSheet orderId={order.id} claims={openClaims} onClose={() => setSheet(null)} />}
      {sheet === "cancel" && <CancelSheet orderId={order.id} onClose={() => setSheet(null)} />}
      {dialog}
    </Modal>
  );
}

function DeliverSheet({ order, onClose }: { order: { id: string; finalPrice: number | null; price: number | null; satisfaction: number | null; workItems: Array<{ status: string }> }; onClose: () => void }) {
  const [satisfaction, setSatisfaction] = useState<number | null>(order.satisfaction);
  const [finalPrice, setFinalPrice] = useState<number | null>(order.finalPrice ?? order.price);
  const { run, busy } = useAction();
  const pending = order.workItems.filter((w) => w.status !== "completada").length;
  return (
    <Modal
      open
      onClose={onClose}
      title="Entregar al cliente"
      size="sm"
      footer={
        <Button
          loading={busy === "deliver"}
          icon={<PackageCheck className="size-4" />}
          onClick={async () => {
            const ok = await run("deliver", () => api.orders.action(order.id, { action: "deliver", satisfaction, finalPrice: finalPrice !== order.price ? finalPrice : null }), "Entregada · empieza el plazo de reclamos");
            if (ok) onClose();
          }}
        >
          Confirmar entrega
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {pending > 0 && <p className="rounded-xl border border-pending/40 bg-pending/10 p-3 text-sm text-pending">Quedan {pending} paso(s) sin terminar; se marcarán como completados.</p>}
        <Field label="¿Qué tan satisfecho quedó el cliente?">{() => <StarRating value={satisfaction} onChange={setSatisfaction} label="Satisfacción del cliente" />}</Field>
        <Field label="Precio final (antes de IVA)" hint="Cámbialo solo si hubo ajustes.">
          {(id, d) => <MoneyInput id={id} ariaDescribedBy={d} value={finalPrice} onChange={setFinalPrice} />}
        </Field>
      </div>
    </Modal>
  );
}

function InvoiceSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [number, setNumber] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title="Marcar como facturado"
      size="sm"
      footer={
        <Button
          loading={busy === "inv"}
          icon={<Receipt className="size-4" />}
          onClick={async () => {
            const ok = await run("inv", () => api.orders.action(orderId, { action: "invoice", number: number.trim() || null }), "Facturado");
            if (ok) onClose();
          }}
        >
          Guardar
        </Button>
      }
    >
      <Field label="Número de factura electrónica" hint="Opcional, para encontrarla después.">
        {(id, d) => <Input id={id} aria-describedby={d} autoCapitalize="characters" placeholder="FE-1234" value={number} onChange={(e) => setNumber(e.target.value)} />}
      </Field>
    </Modal>
  );
}

function ClaimSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [kind, setKind] = useState<ClaimKind>("garantia");
  const [description, setDescription] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar reclamo"
      description="La orden pasa a garantía y se detiene el cierre automático."
      size="sm"
      footer={
        <Button
          variant="danger"
          loading={busy === "claim"}
          disabled={!description.trim()}
          icon={<ShieldAlert className="size-4" />}
          onClick={async () => {
            const ok = await run("claim", () => api.orders.action(orderId, { action: "claim", kind, description }), "Reclamo registrado");
            if (ok) onClose();
          }}
        >
          Registrar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Tipo">
          {(id) => (
            <Select id={id} value={kind} onChange={(e) => setKind(e.target.value as ClaimKind)}>
              <option value="garantia">Garantía (reproceso o ajuste)</option>
              <option value="devolucion">Devolución</option>
            </Select>
          )}
        </Field>
        <Field label="¿Qué pasó?">{(id) => <Textarea id={id} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

function ResolveSheet({ orderId, claims, onClose }: { orderId: string; claims: Array<{ id: string; kind: ClaimKind; description: string }>; onClose: () => void }) {
  const [claimId, setClaimId] = useState(claims[0]!.id);
  const [resolution, setResolution] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title="Resolver reclamo"
      size="sm"
      footer={
        <Button
          loading={busy === "res"}
          disabled={!resolution.trim()}
          onClick={async () => {
            const ok = await run("res", () => api.orders.action(orderId, { action: "resolveClaim", claimId, resolution }), "Reclamo resuelto");
            if (ok) onClose();
          }}
        >
          Guardar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {claims.length > 1 && (
          <Field label="Reclamo">
            {(id) => (
              <Select id={id} value={claimId} onChange={(e) => setClaimId(e.target.value)}>
                {claims.map((c) => (
                  <option key={c.id} value={c.id}>
                    {CLAIM_KIND_LABEL[c.kind]}: {c.description}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label="¿Cómo se resolvió?" hint="Si hubo reproceso, agrégalo como paso en la ruta antes de resolver.">
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

function CancelSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const { run, busy } = useAction();
  return (
    <Modal
      open
      onClose={onClose}
      title="Cancelar orden"
      description="Las tareas pendientes de esta orden desaparecen de los puestos."
      size="sm"
      footer={
        <Button
          variant="danger"
          loading={busy === "cancel"}
          icon={<Ban className="size-4" />}
          onClick={async () => {
            const ok = await run("cancel", () => api.orders.action(orderId, { action: "cancel", reason: reason.trim() || null }), "Orden cancelada");
            if (ok) onClose();
          }}
        >
          Cancelar orden
        </Button>
      }
    >
      <Field label="Motivo (opcional)">{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
    </Modal>
  );
}

function warrantyLabel(w: WarrantyStatus): string {
  if (w.weldingOnly) return "Soldadura: sin garantía";
  if (!w.until) return "Desde la entrega";
  return `Hasta el ${formatDate(w.until, { day: "numeric", month: "long", year: "numeric" })}${w.excludesWelding ? " (no cubre la soldadura)" : ""}`;
}
