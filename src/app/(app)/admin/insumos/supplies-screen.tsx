"use client";

import { Check, ClipboardCopy, Link2, PackageCheck, PackagePlus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { AddSupplyModal, LinkSupplyModal } from "@/components/production/add-supply";
import { RequiredSuppliesModal } from "@/components/production/required-supplies";
import { PageHeader, Segmented } from "@/components/ui/kit";
import { useConfirm, useToast } from "@/components/ui/overlay";
import { Button, Chip, EmptyState, Input, Select } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useProduction } from "@/lib/client/use-production";
import { formatDate } from "@/lib/domain/labels";
import { formatQuantity, groupSupplies, normalizeSupplyText, shoppingListText, supplyRows, type SupplyRow } from "@/lib/domain/supplies";

type View = "agrupado" | "detalle";
const NO_ORDER = "__sin_orden";

/** Clipboard API first; a hidden textarea covers browsers (or webviews) that block it. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

/**
 * Listado general de insumos: lo que piden las órdenes más las compras sueltas
 * que agregan los administradores. Marcar «Ya está» cambia únicamente la línea
 * donde se marcó (la de una orden no toca la de otra).
 */
export function SuppliesScreen() {
  const prod = useProduction();
  const { run, busy } = useAction();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [view, setView] = useState<View>("agrupado");
  const [orderId, setOrderId] = useState("");
  const [query, setQuery] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [linking, setLinking] = useState<{ id: string; name: string } | null>(null);

  const pendingAll = useMemo(() => supplyRows(prod.orders, prod.generalSupplies), [prod.orders, prod.generalSupplies]);
  const rows = useMemo(() => {
    const q = normalizeSupplyText(query);
    return supplyRows(prod.orders, prod.generalSupplies, { includeDone: showDone }).filter((r) => {
      if (orderId === NO_ORDER ? r.orderId !== null : orderId && r.orderId !== orderId) return false;
      return !q || normalizeSupplyText(`${r.supply.name} ${r.folio ?? "sin orden"} ${r.orderTitle ?? ""} ${r.clientName ?? ""}`).includes(q);
    });
  }, [prod.orders, prod.generalSupplies, showDone, orderId, query]);
  const groups = useMemo(() => groupSupplies(rows), [rows]);
  const orderOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of supplyRows(prod.orders, [], { includeDone: true })) seen.set(r.orderId!, `${r.folio} · ${r.orderTitle}`);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [prod.orders]);

  const markDone = (row: SupplyRow) => {
    const label = `Ya está: ${row.supply.name}${row.folio ? ` (${row.folio})` : ""}`;
    return run(
      `done-${row.supply.id}`,
      async () => {
        if (row.orderId) await api.orders.action(row.orderId, { action: "supplyDone", supplyId: row.supply.id, done: true });
        else await api.supplies.action(row.supply.id, { action: "done", done: true });
      },
      label,
    );
  };

  const copyList = async () => {
    const pending = groupSupplies(rows.filter((r) => r.supply.status === "pendiente"));
    const text = shoppingListText(pending);
    if (!text) return toast("No hay nada pendiente para copiar.", "error");
    if (await copyText(text)) toast("Lista copiada: pégala en WhatsApp o notas.");
    else toast("No se pudo copiar. Revisa los permisos del navegador.", "error");
  };

  const rowActions = (row: SupplyRow) => {
    if (row.supply.status !== "pendiente") return <Chip tone="done">Conseguido {formatDate(row.supply.obtainedAt)}</Chip>;
    return (
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="success" icon={<Check className="size-4" />} loading={busy === `done-${row.supply.id}`} onClick={() => void markDone(row)}>
          Ya está
        </Button>
        {!row.orderId && (
          <>
            <Button size="sm" variant="secondary" aria-label={`Enlazar ${row.supply.name} a una orden`} title="Enlazar a una orden" icon={<Link2 className="size-4" />} onClick={() => setLinking({ id: row.supply.id, name: row.supply.name })} />
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Quitar ${row.supply.name}`}
              title="Quitar de la lista"
              icon={<Trash2 className="size-4" />}
              onClick={async () => {
                if (await confirm({ title: `¿Quitar «${row.supply.name}»?`, body: "Sale de la lista de compras.", confirmLabel: "Quitar", danger: true })) {
                  void run(`rm-${row.supply.id}`, () => api.supplies.action(row.supply.id, { action: "remove" }), "Insumo quitado");
                }
              }}
            />
          </>
        )}
      </div>
    );
  };

  const origin = (r: SupplyRow) =>
    r.orderId ? (
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(r.orderId)}>
        <p className="font-semibold text-ink">
          {r.folio} · {r.orderTitle}
        </p>
        <p className="text-xs text-muted">
          {r.clientName} · solicitado el {formatDate(r.supply.requestedAt)}
          {r.supply.note ? ` · ${r.supply.note}` : ""}
        </p>
      </button>
    ) : (
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">Sin orden · compra suelta</p>
        <p className="text-xs text-muted">
          solicitado el {formatDate(r.supply.requestedAt)}
          {r.supply.note ? ` · ${r.supply.note}` : ""}
        </p>
      </div>
    );

  return (
    <div>
      <PageHeader
        eyebrow="Producción"
        title="Insumos requeridos"
        description="Lo que piden las órdenes y lo que agregues a mano, en una sola lista para ir a comprar. «Ya está» solo cumple la línea donde lo marcas."
        actions={
          <>
            <Chip tone={pendingAll.length ? "pending" : "done"}>{pendingAll.length} por conseguir</Chip>
            <Button variant="secondary" icon={<ClipboardCopy className="size-5" />} onClick={() => void copyList()}>
              Copiar lista
            </Button>
            <Button icon={<PackagePlus className="size-5" />} onClick={() => setAdding(true)}>
              Agregar insumo
            </Button>
          </>
        }
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
          <option value={NO_ORDER}>Sin orden (compras sueltas)</option>
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
          body="Agrega uno con el botón «Agregar insumo», o desde una orden con «Insumos requeridos»."
          action={!query && !orderId ? <Button onClick={() => setAdding(true)}>Agregar insumo</Button> : undefined}
        />
      ) : view === "agrupado" ? (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <li key={g.key} className="rounded-2xl border border-line bg-panel/60 p-3.5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg font-semibold text-ink">{g.name}</h3>
                <p className="tabular text-sm text-ink-soft">
                  Total requerido: <strong className="text-ink">{formatQuantity(g.total, g.unit)}</strong> · {g.rows.length} {g.rows.length === 1 ? "pedido" : "pedidos"}
                </p>
              </div>
              <ul className="flex flex-col divide-y divide-line">
                {g.rows.map((r) => (
                  <li key={r.supply.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2">
                    {origin(r)}
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
                    {r.orderId ? (
                      <button type="button" className="text-left text-glow hover:underline" onClick={() => setOpen(r.orderId)}>
                        {r.folio} · {r.orderTitle}
                      </button>
                    ) : (
                      <span className="text-muted">Sin orden</span>
                    )}
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
      {adding && <AddSupplyModal onClose={() => setAdding(false)} />}
      {linking && <LinkSupplyModal key={linking.id} supplyId={linking.id} supplyName={linking.name} onClose={() => setLinking(null)} />}
      {dialog}
    </div>
  );
}
