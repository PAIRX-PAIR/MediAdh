"use client";

import { Check, PackageCheck, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { RequiredSuppliesModal } from "@/components/production/required-supplies";
import { PageHeader, Segmented } from "@/components/ui/kit";
import { Button, Chip, EmptyState, Input, Select } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useProduction } from "@/lib/client/use-production";
import { formatDate } from "@/lib/domain/labels";
import { formatQuantity, groupSupplies, normalizeSupplyText, supplyRows, type SupplyRow } from "@/lib/domain/supplies";

type View = "agrupado" | "detalle";

/**
 * Listado general de insumos: arma solo con lo que piden las órdenes. Marcar
 * «Ya está» cambia únicamente la línea de la orden donde se marcó.
 */
export function SuppliesScreen() {
  const prod = useProduction();
  const { run, busy } = useAction();
  const [view, setView] = useState<View>("agrupado");
  const [orderId, setOrderId] = useState("");
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const pendingAll = useMemo(() => supplyRows(prod.orders), [prod.orders]);
  const rows = useMemo(() => {
    const q = normalizeSupplyText(query);
    return supplyRows(prod.orders, { includeDone: showDone }).filter(
      (r) => (!orderId || r.orderId === orderId) && (!q || normalizeSupplyText(`${r.supply.name} ${r.folio} ${r.orderTitle} ${r.clientName}`).includes(q)),
    );
  }, [prod.orders, showDone, orderId, query]);
  const groups = useMemo(() => groupSupplies(rows), [rows]);
  const orderOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of supplyRows(prod.orders, { includeDone: true })) seen.set(r.orderId, `${r.folio} · ${r.orderTitle}`);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [prod.orders]);

  const markDone = (row: SupplyRow) =>
    run(`done-${row.supply.id}`, () => api.orders.action(row.orderId, { action: "supplyDone", supplyId: row.supply.id, done: true }), `Ya está: ${row.supply.name} (${row.folio})`);

  const rowActions = (row: SupplyRow) =>
    row.supply.status === "pendiente" ? (
      <Button size="sm" variant="success" icon={<Check className="size-4" />} loading={busy === `done-${row.supply.id}`} onClick={() => void markDone(row)}>
        Ya está
      </Button>
    ) : (
      <Chip tone="done">Conseguido {formatDate(row.supply.obtainedAt)}</Chip>
    );

  return (
    <div>
      <PageHeader
        eyebrow="Producción"
        title="Insumos requeridos"
        description="Todo lo que piden las órdenes de trabajo, en un solo lugar. Al marcar «Ya está» el insumo sale de la lista y queda como cumplido solo en la orden donde lo marcaste."
        actions={<Chip tone={pendingAll.length ? "pending" : "done"}>{pendingAll.length} por conseguir</Chip>}
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Segmented
          label="Forma de ver el listado"
          value={view}
          onChange={setView}
          options={[
            { value: "agrupado", label: "Agrupado", count: groups.length },
            { value: "detalle", label: "Por orden", count: rows.length },
          ]}
        />
        <Select aria-label="Filtrar por orden" className="lg:w-72" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="">Todas las órdenes</option>
          {orderOptions.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" className="size-4 accent-[var(--color-glow)]" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Ver también los conseguidos
        </label>
        <div className="relative lg:ml-auto lg:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label="Buscar insumo" placeholder="Insumo u orden" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<PackageCheck />}
          title={query || orderId ? "Nada coincide con el filtro" : "No falta ningún insumo"}
          body="Para pedir uno, abre una orden de trabajo y toca «Insumos requeridos»."
        />
      ) : view === "agrupado" ? (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <li key={g.key} className="rounded-2xl border border-line bg-panel/60 p-3.5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-semibold text-ink">{g.name}</h3>
                <p className="tabular text-sm text-ink-soft">
                  Total requerido: <strong className="text-ink">{formatQuantity(g.total, g.unit)}</strong> · {g.rows.length} {g.rows.length === 1 ? "orden" : "órdenes"}
                </p>
              </div>
              <ul className="flex flex-col divide-y divide-line">
                {g.rows.map((r) => (
                  <li key={r.supply.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(r.orderId)}>
                      <p className="font-semibold text-ink">
                        {r.folio} · {r.orderTitle}
                      </p>
                      <p className="text-xs text-muted">
                        {r.clientName} · solicitado el {formatDate(r.supply.requestedAt)}
                        {r.supply.note ? ` · ${r.supply.note}` : ""}
                      </p>
                    </button>
                    <span className="tabular text-sm text-ink-soft">{formatQuantity(r.supply.quantity, r.supply.unit)}</span>
                    {rowActions(r)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-3 py-2 font-semibold">Insumo</th>
                <th className="px-3 font-semibold">Cantidad</th>
                <th className="px-3 font-semibold">Orden</th>
                <th className="px-3 font-semibold">Solicitado</th>
                <th className="px-3 font-semibold">Estado</th>
                <th className="px-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.supply.id} className="border-t border-line">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-ink">{r.supply.name}</p>
                    {r.supply.note && <p className="text-xs text-muted">{r.supply.note}</p>}
                  </td>
                  <td className="tabular px-3">{formatQuantity(r.supply.quantity, r.supply.unit)}</td>
                  <td className="px-3">
                    <button type="button" className="text-left text-glow hover:underline" onClick={() => setOpen(r.orderId)}>
                      {r.folio} · {r.orderTitle}
                    </button>
                  </td>
                  <td className="px-3 text-ink-soft">{formatDate(r.supply.requestedAt)}</td>
                  <td className="px-3">
                    <Chip tone={r.supply.status === "pendiente" ? "pending" : "done"}>{r.supply.status === "pendiente" ? "Pendiente" : "Conseguido"}</Chip>
                  </td>
                  <td className="px-3 text-right">{r.supply.status === "pendiente" && rowActions(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <RequiredSuppliesModal key={open} orderId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
