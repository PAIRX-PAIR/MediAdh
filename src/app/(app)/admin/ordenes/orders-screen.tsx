"use client";

import { ClipboardPlus, Download, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { OrderDetailModal } from "@/components/production/order-detail";
import { OrderFormModal } from "@/components/production/order-form";
import { OrderCard } from "@/components/production/order-parts";
import { PageHeader, Segmented } from "@/components/ui/kit";
import { Button, EmptyState, Input } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useProduction } from "@/lib/client/use-production";
import { isLate } from "@/lib/domain/lifecycle";
import type { OrderView } from "@/lib/domain/views";

type View = "activas" | "entregar" | "entregadas" | "facturar" | "vencidas" | "garantia" | "todas";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function OrdersScreen() {
  const { data } = useSync();
  const prod = useProduction();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const view = (params.get("vista") as View | null) ?? "activas";

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const late = (o: OrderView) => ["recibida", "en_proceso", "terminada", "garantia"].includes(o.status) && isLate(o, data.settings.timezone, prod.ctx.now);
  const groups: Record<View, (o: OrderView) => boolean> = {
    activas: (o) => ["recibida", "en_proceso", "garantia"].includes(o.status),
    entregar: (o) => o.status === "terminada",
    entregadas: (o) => o.status === "entregada" || o.status === "cerrada",
    facturar: (o) => o.invoice.pending,
    vencidas: late,
    garantia: (o) => o.status === "garantia",
    todas: () => true,
  };

  const rank = useMemo(() => new Map(prod.ranking.map((r, i) => [r.orderId, i])), [prod.ranking]);
  const list = useMemo(() => {
    const q = normalize(query.trim());
    return prod.orders
      .filter(groups[view])
      .filter((o) => !q || normalize(`${o.folio} ${o.title} ${o.clientName} ${o.description}`).includes(q))
      .sort((a, b) => {
        if (view === "activas") return (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999);
        return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prod.orders, view, query, rank]);

  const counts = Object.fromEntries((Object.keys(groups) as View[]).map((k) => [k, prod.orders.filter(groups[k]).length])) as Record<View, number>;
  const selected = params.get("o");
  const editing = params.get("editar");
  const creating = params.get("nueva") === "1";
  const editOrder = editing ? prod.orders.find((o) => o.id === editing) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Producción"
        title="Órdenes de trabajo"
        description="Cada orden nace con el ingreso de las piezas y genera las tareas de cada puesto. En «Activas» aparecen en el orden recomendado."
        actions={
          <>
            <a href={api.exportUrl("ordenes")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 font-display text-sm font-semibold text-ink-soft hover:border-glow/60 hover:text-ink">
              <Download className="size-4" aria-hidden /> Excel
            </a>
            <Button icon={<ClipboardPlus className="size-5" />} onClick={() => setParam({ nueva: "1" })}>
              Nueva OT
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          label="Vista"
          value={view}
          onChange={(v) => setParam({ vista: v === "activas" ? null : v })}
          options={[
            { value: "activas", label: "Activas", count: counts.activas },
            { value: "entregar", label: "Por entregar", count: counts.entregar },
            { value: "vencidas", label: "Vencidas", count: counts.vencidas },
            { value: "facturar", label: "Facturar", count: counts.facturar },
            { value: "garantia", label: "Garantía", count: counts.garantia },
            { value: "entregadas", label: "Entregadas" },
            { value: "todas", label: "Todas" },
          ]}
        />
        <div className="relative lg:ml-auto lg:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label="Buscar orden" placeholder="Folio, cliente o trabajo" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ClipboardPlus />}
          title={query ? "Nada coincide con la búsqueda" : "No hay órdenes en esta vista"}
          body={view === "activas" ? "Registra el ingreso de piezas para crear la primera orden de trabajo." : undefined}
          action={view === "activas" && !query ? <Button onClick={() => setParam({ nueva: "1" })}>Nueva OT</Button> : undefined}
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {list.map((o) => (
            <li key={o.id}>
              <OrderCard
                order={o}
                machines={prod.machineById}
                today={data.today}
                timezone={data.settings.timezone}
                now={prod.ctx.now}
                href={`${pathname}?${new URLSearchParams({ ...Object.fromEntries(params), o: o.id }).toString()}`}
              />
            </li>
          ))}
        </ul>
      )}

      {selected && !editing && (
        <OrderDetailModal
          key={selected}
          orderId={selected}
          initialTab={params.get("tab") === "archivos" ? "archivos" : "resumen"}
          onClose={() => setParam({ o: null, tab: null })}
          onEdit={() => setParam({ editar: selected })}
        />
      )}
      {(creating || editOrder) && (
        <OrderFormModal
          key={editOrder?.id ?? "new"}
          order={editOrder}
          onClose={() => setParam({ nueva: null, editar: null })}
          onSaved={(order) => setParam({ nueva: null, editar: null, o: order.id, tab: creating ? "archivos" : null })}
        />
      )}
    </div>
  );
}
