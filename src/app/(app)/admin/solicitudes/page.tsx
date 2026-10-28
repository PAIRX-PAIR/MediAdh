"use client";

import { ArrowUpRight, Check, ClipboardList, Flame, PackageOpen, RotateCcw, Truck, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PageHeader, Segmented } from "@/components/ui/kit";
import { Modal } from "@/components/ui/overlay";
import { Button, Chip, EmptyState, Field, Input, cn } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL, timeAgo } from "@/lib/domain/labels";
import type { RequestStatus, SupplyRequest } from "@/lib/domain/schema";
import { formatQuantity, supplyRows, type SupplyRow } from "@/lib/domain/supplies";

type View = "abiertas" | "cerradas";

/** A pedido is either something a puesto asked for, or an «insumo requerido» loaded in an OT. */
type Entry = { kind: "request"; at: string; urgent: boolean; request: SupplyRequest } | { kind: "supply"; at: string; urgent: boolean; row: SupplyRow };

export default function AdminRequestsPage() {
  return (
    <Suspense>
      <AdminRequests />
    </Suspense>
  );
}

/**
 * Material requests inbox: answer "en camino", "entregada" or "rechazada" with a
 * short message. It also lists the «insumos requeridos» loaded in the OTs: they
 * are the same lines as in the OT and in «Insumos», so marking one «Conseguido»
 * here updates it everywhere (there is no copy that could drift).
 */
function AdminRequests() {
  const { data } = useSync();
  const params = useSearchParams();
  const { run, busy } = useAction();
  const [view, setView] = useState<View>("abiertas");
  const [responding, setResponding] = useState<{ request: SupplyRequest; status: RequestStatus } | null>(null);
  const highlight = params.get("s");
  const orders = useMemo(() => data.production.orders ?? [], [data.production.orders]);
  const urgentOrders = useMemo(() => new Set(orders.filter((o) => o.urgent).map((o) => o.id)), [orders]);
  const nameOf = useMemo(() => {
    const names = new Map<string, string>();
    for (const p of data.positions) if (p.holder) names.set(p.holder.userId, p.holder.name);
    for (const u of data.users ?? []) names.set(u.id, u.displayName);
    return (id: string | null) => (id ? (names.get(id) ?? null) : null);
  }, [data.positions, data.users]);

  const otSupplies = useMemo(() => supplyRows(orders, [], { includeDone: true }).filter((r) => r.orderId), [orders]);
  const isOpen = (r: SupplyRequest) => r.status === "pendiente" || r.status === "en_camino";
  const openCount = data.requests.filter(isOpen).length + otSupplies.filter((r) => r.supply.status === "pendiente").length;
  const list: Entry[] = [
    ...data.requests
      .filter((r) => (view === "abiertas" ? isOpen(r) : !isOpen(r)))
      .map((r): Entry => ({ kind: "request", at: r.createdAt, urgent: r.urgent, request: r })),
    ...otSupplies
      .filter((r) => (view === "abiertas" ? r.supply.status === "pendiente" : r.supply.status !== "pendiente"))
      .map((r): Entry => ({ kind: "supply", at: r.supply.obtainedAt ?? r.supply.requestedAt, urgent: urgentOrders.has(r.orderId!), row: r })),
  ].sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.at.localeCompare(a.at));

  const setObtained = (row: SupplyRow, done: boolean) =>
    run(
      `ot-${row.supply.id}`,
      () => api.orders.action(row.orderId!, { action: "supplyDone", supplyId: row.supply.id, done }),
      done ? `Conseguido: ${row.supply.name}` : `Pendiente otra vez: ${row.supply.name}`,
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="Equipo"
        title="Pedidos de material, insumos, consumibles"
        description="Lo que piden los puestos y los insumos requeridos que se cargan en las OT. Al responder un pedido, la persona recibe el aviso en su celular."
      />
      <Segmented
        label="Vista"
        value={view}
        onChange={setView}
        options={[
          { value: "abiertas", label: "Por atender", count: openCount },
          { value: "cerradas", label: "Atendidos" },
        ]}
        className="self-start"
      />
      {list.length === 0 ? (
        <EmptyState
          icon={<PackageOpen />}
          title={view === "abiertas" ? "No hay pedidos pendientes" : "Sin pedidos atendidos recientes"}
          body={view === "abiertas" ? "Aquí llegan los pedidos de los puestos y los insumos requeridos que se carguen en las OT." : undefined}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((entry) => {
            if (entry.kind === "supply") {
              const { row } = entry;
              const done = row.supply.status !== "pendiente";
              const by = nameOf(row.supply.requestedBy);
              const got = done ? nameOf(row.supply.obtainedBy) : null;
              const key = `ot-${row.supply.id}`;
              return (
                <li key={key} className={cn("hud-panel flex flex-col gap-2 p-4", entry.urgent && !done && "border-urgent/60")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-glow">{row.folio}</span>
                    <Chip tone={done ? "done" : "pending"} dot>
                      {done ? "Conseguido" : "Pendiente"}
                    </Chip>
                    <Chip tone="glow">
                      <ClipboardList className="size-3" aria-hidden /> Insumo de OT
                    </Chip>
                    {entry.urgent && !done && (
                      <Chip tone="urgent">
                        <Flame className="size-3" aria-hidden /> OT urgente
                      </Chip>
                    )}
                    <span className="ml-auto text-xs text-faint">{timeAgo(entry.at)}</span>
                  </div>
                  <p className="font-display text-lg font-semibold text-ink">
                    Insumo: {row.supply.name}
                    <span className="ml-2 font-sans text-sm font-normal text-ink-soft">{formatQuantity(row.supply.quantity, row.supply.unit)}</span>
                  </p>
                  <p className="text-sm text-muted">
                    {row.orderTitle}
                    {row.clientName ? ` · ${row.clientName}` : ""}
                    {by ? ` · cargó ${by}` : ""}
                    {got ? ` · consiguió ${got}` : ""}
                  </p>
                  {row.supply.note && <p className="text-sm text-ink-soft">“{row.supply.note}”</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {done ? (
                      <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} loading={busy === key} onClick={() => setObtained(row, false)}>
                        Volver a pedir
                      </Button>
                    ) : (
                      <Button size="sm" variant="success" icon={<Check className="size-4" />} loading={busy === key} onClick={() => setObtained(row, true)}>
                        Conseguido
                      </Button>
                    )}
                    <Link
                      href={`/admin/ordenes?o=${row.orderId}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-sm font-semibold text-ink-soft hover:border-glow/60"
                    >
                      Ver OT <ArrowUpRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </li>
              );
            }
            const r = entry.request;
            const position = data.positions.find((p) => p.id === r.positionId);
            const task = data.tasks.find((t) => t.id === r.taskId);
            return (
              <li key={r.id} className={cn("hud-panel flex flex-col gap-2 p-4", r.urgent && r.status === "pendiente" && "border-urgent/60", highlight === r.id && "ring-2 ring-glow")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-glow">{r.folio}</span>
                  <Chip tone={r.status === "pendiente" ? "pending" : r.status === "en_camino" ? "progress" : r.status === "entregada" ? "done" : "vacant"} dot>
                    {REQUEST_STATUS_LABEL[r.status]}
                  </Chip>
                  {r.urgent && (
                    <Chip tone="urgent">
                      <Flame className="size-3" aria-hidden /> Urgente
                    </Chip>
                  )}
                  <span className="ml-auto text-xs text-faint">{timeAgo(r.createdAt)}</span>
                </div>
                <p className="font-display text-lg font-semibold text-ink">
                  {REQUEST_TYPE_LABEL[r.type]}: {r.item}
                </p>
                <p className="text-sm text-muted">
                  {r.requesterName}
                  {position ? ` · ${position.title}` : ""}
                  {r.quantity ? ` · ${r.quantity}` : ""}
                  {task ? ` · para ${task.folio}` : ""}
                </p>
                {r.note && <p className="text-sm text-ink-soft">“{r.note}”</p>}
                {r.response && <p className="text-sm text-glow-soft">Respuesta: {r.response}</p>}
                {(r.status === "pendiente" || r.status === "en_camino") && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {r.status === "pendiente" && (
                      <Button size="sm" variant="secondary" icon={<Truck className="size-4" />} onClick={() => setResponding({ request: r, status: "en_camino" })}>
                        En camino
                      </Button>
                    )}
                    <Button size="sm" variant="success" icon={<Check className="size-4" />} onClick={() => setResponding({ request: r, status: "entregada" })}>
                      Entregado
                    </Button>
                    <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setResponding({ request: r, status: "rechazada" })}>
                      Rechazar
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {responding && <RespondSheet {...responding} onClose={() => setResponding(null)} />}
    </div>
  );
}

function RespondSheet({ request, status, onClose }: { request: SupplyRequest; status: RequestStatus; onClose: () => void }) {
  const [message, setMessage] = useState("");
  const { run, busy } = useAction();
  const title = { en_camino: "Marcar en camino", entregada: "Marcar entregado", rechazada: "Rechazar pedido" }[status as "en_camino"] ?? "Responder";
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description={`${request.folio} · ${request.item}`}
      size="sm"
      footer={
        <Button
          variant={status === "rechazada" ? "danger" : "primary"}
          loading={busy === "r"}
          onClick={async () => {
            const ok = await run("r", () => api.requests.update(request.id, status, message.trim() || null), "Respuesta enviada");
            if (ok) onClose();
          }}
        >
          Enviar
        </Button>
      }
    >
      <Field label="Mensaje para la persona (opcional)">
        {(id) => <Input id={id} placeholder={status === "en_camino" ? "Ej: llega mañana a las 9 a. m." : status === "rechazada" ? "Ej: usa el inserto del cajón 3" : ""} value={message} onChange={(e) => setMessage(e.target.value)} />}
      </Field>
    </Modal>
  );
}
