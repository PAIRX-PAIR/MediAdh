"use client";

import { Archive, ArchiveRestore, Building2, Download, Edit3, Mail, Phone, Search, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { ClientFormModal } from "@/components/production/client-form";
import { OrderStatusChip } from "@/components/production/order-parts";
import { QuoteStatusChip } from "@/components/production/quote-editor";
import { ChangeLog, ChangeLogHeading, KeyValues, PageHeader, Segmented, StatTile } from "@/components/ui/kit";
import { Modal } from "@/components/ui/overlay";
import { Button, Chip, EmptyState, Input, Spinner } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useProduction } from "@/lib/client/use-production";
import { CLIENT_KIND_LABEL, CLIENT_TIER_LABEL, formatDate } from "@/lib/domain/labels";
import { formatNit, nitDigits } from "@/lib/domain/nit";
import { formatCop, quoteTotals } from "@/lib/domain/quote";
import type { Client } from "@/lib/domain/schema";
import type { ClientView, OrderView, QuoteView } from "@/lib/domain/views";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ClientsScreen() {
  const prod = useProduction();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<"activos" | "archivados">("activos");
  const [editing, setEditing] = useState<ClientView | "new" | null>(null);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const orderCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of prod.orders) if (o.clientId) m.set(o.clientId, (m.get(o.clientId) ?? 0) + 1);
    return m;
  }, [prod.orders]);

  const list = useMemo(() => {
    const q = normalize(query.trim());
    const digits = nitDigits(query);
    return prod.clients
      .filter((c) => (show === "activos" ? !c.archived : c.archived))
      .filter((c) => !q || normalize(`${c.name} ${c.contactName} ${c.city}`).includes(q) || (digits.length >= 3 && c.nit.includes(digits)))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [prod.clients, query, show]);

  const selected = params.get("c");

  return (
    <div>
      <PageHeader
        eyebrow="Ventas"
        title="Clientes"
        description="Razón social, NIT con dígito de verificación, contactos e historial de trabajos de cada cliente."
        actions={
          <>
            <a href={api.exportUrl("clientes")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 font-display text-sm font-semibold text-ink-soft hover:border-glow/60 hover:text-ink">
              <Download className="size-4" aria-hidden /> Excel
            </a>
            <Button icon={<UserPlus className="size-5" />} onClick={() => setEditing("new")}>
              Nuevo cliente
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented
          label="Mostrar"
          value={show}
          onChange={setShow}
          options={[
            { value: "activos", label: "Activos", count: prod.clients.filter((c) => !c.archived).length },
            { value: "archivados", label: "Archivados" },
          ]}
        />
        <div className="relative sm:ml-auto sm:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label="Buscar cliente" placeholder="Nombre, contacto, ciudad o NIT" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Building2 />} title={query ? "Ningún cliente coincide" : "Todavía no hay clientes"} body={query ? undefined : "Registra el primero; también puedes crearlos desde una OT o una cotización."} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => setParam("c", c.id)} className="hud-panel flex w-full flex-col gap-1.5 p-4 text-left transition-colors hover:border-glow/50">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-display text-[17px] font-semibold text-ink">{c.name}</span>
                  {c.tier > 1 && <Chip tone={c.tier === 3 ? "glow" : "neutral"}>{CLIENT_TIER_LABEL[c.tier]}</Chip>}
                </span>
                <span className="text-sm text-muted">
                  {CLIENT_KIND_LABEL[c.kind]}
                  {c.nit ? ` · ${formatNit(c.nit, c.kind === "empresa" ? c.dv : null)}` : ""}
                  {c.city ? ` · ${c.city}` : ""}
                </span>
                <span className="text-xs text-faint">
                  {c.contactName || "Sin contacto"} · {orderCount.get(c.id) ?? 0} órdenes recientes
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && <ClientDetail key={selected} clientId={selected} onClose={() => setParam("c", null)} onEdit={(c) => setEditing(c)} />}
      {editing && (
        <ClientFormModal
          key={editing === "new" ? "new" : editing.id}
          open
          client={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(c: Client | ClientView) => editing === "new" && setParam("c", c.id)}
        />
      )}
    </div>
  );
}

function ClientDetail({ clientId, onClose, onEdit }: { clientId: string; onClose: () => void; onEdit: (c: ClientView) => void }) {
  const { data } = useSync();
  const prod = useProduction();
  const live = prod.clients.find((c) => c.id === clientId);
  const [detail, setDetail] = useState<{ client: Client; orders: OrderView[]; quotes: QuoteView[] } | null>(null);
  const { run, busy } = useAction();

  useEffect(() => {
    api.clients
      .get(clientId)
      .then(setDetail)
      .catch(() => undefined);
  }, [clientId, live?.updatedAt]);

  const client = live ?? detail?.client;
  if (!client) {
    return (
      <Modal open onClose={onClose} title="Cliente">
        <Spinner />
      </Modal>
    );
  }
  const orders = detail?.orders ?? [];
  const delivered = orders.filter((o) => o.deliveredAt);
  const billed = delivered.reduce((s, o) => s + (o.finalPrice ?? o.price ?? 0), 0);
  const rated = delivered.filter((o) => o.satisfaction !== null);
  const avg = rated.length ? Math.round((rated.reduce((s, o) => s + o.satisfaction!, 0) / rated.length) * 10) / 10 : null;

  return (
    <Modal open onClose={onClose} title={client.name} description={`${CLIENT_KIND_LABEL[client.kind]} · ${CLIENT_TIER_LABEL[client.tier]}`} size="xl">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Edit3 className="size-4" />} onClick={() => onEdit(client)}>
            Editar
          </Button>
          <Link href={`/admin/ordenes?nueva=1`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-sm font-semibold text-ink-soft hover:border-glow/60">
            Nueva OT
          </Link>
          <Button
            size="sm"
            variant="ghost"
            loading={busy === "arch"}
            icon={client.archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            onClick={() => void run("arch", () => api.clients.update(client.id, { archived: !client.archived }), client.archived ? "Cliente restaurado" : "Cliente archivado")}
          >
            {client.archived ? "Restaurar" : "Archivar"}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Órdenes" value={orders.length} />
          <StatTile label="Entregadas" value={delivered.length} tone="done" />
          <StatTile label="Facturado" value={formatCop(billed)} hint="Antes de IVA" />
          <StatTile label="Satisfacción" value={avg ?? "—"} tone="pending" hint={rated.length ? `${rated.length} calificaciones` : "Sin calificar"} />
        </div>
        <KeyValues
          items={[
            ["NIT / cédula", client.nit ? formatNit(client.nit, client.kind === "empresa" ? client.dv : null) : "—"],
            ["Contacto", client.contactName || "—"],
            [
              "Teléfono empresarial",
              client.companyPhone ? (
                <a href={`tel:${client.companyPhone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-glow hover:underline">
                  <Phone className="size-3.5" aria-hidden /> {client.companyPhone}
                </a>
              ) : (
                "—"
              ),
            ],
            [
              "Teléfono personal",
              client.personalPhone ? (
                <a href={`tel:${client.personalPhone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-glow hover:underline">
                  <Phone className="size-3.5" aria-hidden /> {client.personalPhone}
                </a>
              ) : (
                "—"
              ),
            ],
            [
              "Correo",
              client.email ? (
                <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1 text-glow hover:underline">
                  <Mail className="size-3.5" aria-hidden /> {client.email}
                </a>
              ) : (
                "—"
              ),
            ],
            ["Ciudad y dirección", [client.city, client.address].filter(Boolean).join(" · ") || "—"],
          ]}
        />
        {client.notes && <p className="whitespace-pre-wrap text-sm text-ink-soft">{client.notes}</p>}

        <section>
          <h3 className="mb-2 font-display font-semibold text-ink">Historial de trabajos</h3>
          {!detail ? (
            <Spinner />
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted">Sin órdenes todavía.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {[...orders]
                .sort((a, b) => b.intake.receivedAt.localeCompare(a.intake.receivedAt))
                .map((o) => (
                  <li key={o.id}>
                    <Link href={`/admin/ordenes?o=${o.id}`} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-white/5">
                      <span className="font-mono font-semibold text-glow">{o.folio}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{o.title}</span>
                        <span className="block text-xs text-muted">{formatDate(o.intake.receivedAt, { day: "numeric", month: "short", year: "numeric" })}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular hidden text-xs text-ink-soft sm:inline">{formatCop(o.finalPrice ?? o.price)}</span>
                        <OrderStatusChip status={o.status} />
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </section>

        {detail && detail.quotes.length > 0 && (
          <section>
            <h3 className="mb-2 font-display font-semibold text-ink">Cotizaciones</h3>
            <ul className="flex flex-col gap-1.5">
              {detail.quotes.map((q) => (
                <li key={q.id}>
                  <Link href={`/admin/cotizador?c=${q.id}`} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-white/5">
                    <span className="font-mono font-semibold text-glow">{q.folio}</span>
                    <span className="truncate text-ink">{q.title}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular hidden text-xs text-ink-soft sm:inline">{formatCop(quoteTotals(q).total)}</span>
                      <QuoteStatusChip quote={q} today={data.today} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {detail && (
          <section>
            <ChangeLogHeading />
            <ChangeLog entries={detail.client.history} />
          </section>
        )}
      </div>
    </Modal>
  );
}
