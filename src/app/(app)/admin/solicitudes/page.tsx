"use client";

import { Check, Flame, PackageOpen, Truck, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { PageHeader, Segmented } from "@/components/ui/kit";
import { Modal } from "@/components/ui/overlay";
import { Button, Chip, EmptyState, Field, Input, cn } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL, timeAgo } from "@/lib/domain/labels";
import type { RequestStatus, SupplyRequest } from "@/lib/domain/schema";

type View = "abiertas" | "cerradas";

export default function AdminRequestsPage() {
  return (
    <Suspense>
      <AdminRequests />
    </Suspense>
  );
}

/** Material requests inbox: answer "en camino", "entregada" or "rechazada" with a short message. */
function AdminRequests() {
  const { data } = useSync();
  const params = useSearchParams();
  const [view, setView] = useState<View>("abiertas");
  const [responding, setResponding] = useState<{ request: SupplyRequest; status: RequestStatus } | null>(null);
  const highlight = params.get("s");
  const list = data.requests
    .filter((r) => (view === "abiertas" ? r.status === "pendiente" || r.status === "en_camino" : r.status !== "pendiente" && r.status !== "en_camino"))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Equipo" title="Pedidos de material, insumos, consumibles" description="Lo que piden los puestos. Al responder, la persona recibe el aviso en su celular." />
      <Segmented
        label="Vista"
        value={view}
        onChange={setView}
        options={[
          { value: "abiertas", label: "Por atender", count: data.requests.filter((r) => r.status === "pendiente" || r.status === "en_camino").length },
          { value: "cerradas", label: "Atendidos" },
        ]}
        className="self-start"
      />
      {list.length === 0 ? (
        <EmptyState icon={<PackageOpen />} title={view === "abiertas" ? "No hay pedidos pendientes" : "Sin pedidos atendidos recientes"} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((r) => {
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
