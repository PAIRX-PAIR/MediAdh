"use client";

import { Archive, Download, FilePlus2, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { ClientPicker } from "@/components/production/client-form";
import { OrderStatusChip } from "@/components/production/order-parts";
import { SuppliesEditor } from "@/components/production/route-editor";
import { MoneyInput, NumberInput, PageHeader, StarRating, StatTile } from "@/components/ui/kit";
import { Modal } from "@/components/ui/overlay";
import { Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui/primitives";
import { ApiError, api, type HistoricalInput } from "@/lib/client/api";
import { useAction } from "@/lib/client/use-action";
import { useProduction } from "@/lib/client/use-production";
import { adjustForInflation } from "@/lib/domain/ipc";
import { PROCESS_LABEL, formatDate } from "@/lib/domain/labels";
import { orderMoney } from "@/lib/domain/lifecycle";
import { formatCop } from "@/lib/domain/quote";
import { PROCESSES, type Process } from "@/lib/domain/schema";
import { addDays } from "@/lib/domain/time";
import type { OrderView } from "@/lib/domain/views";

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Every job ever done (live + archive), with supplies, suppliers, costs,
 * agreed price and price in today's pesos (DANE CPI). Rows open the editable OT.
 */
export function ArchiveScreen() {
  const { data } = useSync();
  const prod = useProduction();
  const [orders, setOrders] = useState<OrderView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState<string>("todos");
  const [machine, setMachine] = useState<string>("");
  const [adding, setAdding] = useState(false);

  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload((n) => n + 1), []);
  // Re-fetch the archive when live data changes (an OT edited elsewhere) or after adding a record.
  useEffect(() => {
    let cancelled = false;
    api.orders
      .all()
      .then((r) => !cancelled && setOrders(r.orders))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : "No se pudo cargar el histórico."));
    return () => {
      cancelled = true;
    };
  }, [reload, data.version]);

  const rate = (id: string | null) => prod.machineById.get(id ?? "")?.hourlyRate ?? 0;
  const currentMonth = data.today.slice(0, 7);
  const years = useMemo(() => [...new Set((orders ?? []).map((o) => o.intake.receivedAt.slice(0, 4)))].sort().reverse(), [orders]);

  const rows = useMemo(() => {
    const q = normalize(query.trim());
    return (orders ?? [])
      .filter((o) => year === "todos" || o.intake.receivedAt.startsWith(year))
      .filter((o) => !machine || o.workItems.some((w) => w.machineId === machine))
      .filter(
        (o) =>
          !q ||
          normalize(`${o.folio} ${o.title} ${o.clientName} ${o.description} ${o.supplies.map((s) => `${s.description} ${s.supplier}`).join(" ")}`).includes(q),
      )
      .map((o) => {
        const money = orderMoney(o, rate);
        const month = (o.deliveredAt ?? o.intake.receivedAt).slice(0, 7);
        const adjusted = money.price !== null ? adjustForInflation(money.price, month, prod.ipc, currentMonth) : null;
        return { o, money, adjusted };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, query, year, machine, prod.ipc, currentMonth]);

  const totals = rows.reduce(
    (s, r) => ({ price: s.price + (r.money.price ?? 0), cost: s.cost + r.money.supplies + r.money.machineCost, adjusted: s.adjusted + (r.adjusted?.value ?? r.money.price ?? 0) }),
    { price: 0, cost: 0, adjusted: 0 },
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="Base de datos"
        title="Histórico de trabajos"
        description={
          <>
            Todos los trabajos con insumos, proveedores, costos y precio; el precio «a hoy» usa el IPC del DANE (valor × IPC actual / IPC del mes).{" "}
            {prod.ipc.length === 0 && (
              <Link href="/admin/ajustes#ipc" className="font-semibold text-pending underline-offset-4 hover:underline">
                Falta cargar la tabla del IPC.
              </Link>
            )}
          </>
        }
        actions={
          <>
            <a href={api.exportUrl("ordenes")} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong px-4 font-display text-sm font-semibold text-ink-soft hover:border-glow/60 hover:text-ink">
              <Download className="size-4" aria-hidden /> Excel
            </a>
            <Button variant="secondary" icon={<FilePlus2 className="size-4" />} onClick={() => setAdding(true)}>
              Agregar trabajo anterior
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label="Buscar en el histórico" placeholder="Trabajo, cliente, insumo o proveedor" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select aria-label="Año" className="md:w-36" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="todos">Todos los años</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Select aria-label="Máquina" className="md:w-52" value={machine} onChange={(e) => setMachine(e.target.value)}>
          <option value="">Todas las máquinas</option>
          {prod.machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="text-sm text-blocked">{error}</p>}
      {!orders ? (
        <Spinner label="Cargando histórico" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Trabajos" value={rows.length} />
            <StatTile label="Precio total" value={formatCop(totals.price)} hint="Antes de IVA" />
            <StatTile label="Costo registrado" value={formatCop(totals.cost)} hint="Insumos + horas × tarifa" />
            <StatTile label="A precios de hoy" value={formatCop(totals.adjusted)} tone="glow" hint="Con IPC" />
          </div>
          <div className="hud-panel overflow-x-auto p-0">
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-semibold">OT</th>
                  <th className="px-2 py-3 font-semibold">Trabajo</th>
                  <th className="px-2 py-3 font-semibold">Ingreso</th>
                  <th className="px-2 py-3 font-semibold">Procesos</th>
                  <th className="px-2 py-3 text-right font-semibold">Insumos</th>
                  <th className="px-2 py-3 text-right font-semibold">Costo máq.</th>
                  <th className="px-2 py-3 text-right font-semibold">Precio</th>
                  <th className="px-2 py-3 text-right font-semibold">A hoy (IPC)</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ o, money, adjusted }) => (
                  <tr key={o.id} className="border-b border-line/50 hover:bg-white/5">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/ordenes?o=${o.id}`} className="font-mono font-semibold text-glow hover:underline">
                        {o.folio}
                      </Link>
                      {o.historical && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-faint">anterior</span>}
                    </td>
                    <td className="max-w-64 px-2 py-2.5">
                      <span className="block truncate text-ink">{o.title}</span>
                      <span className="block truncate text-xs text-muted">{o.clientName}</span>
                    </td>
                    <td className="tabular whitespace-nowrap px-2 py-2.5 text-ink-soft">{formatDate(o.intake.receivedAt, { day: "numeric", month: "short", year: "2-digit" })}</td>
                    <td className="max-w-48 truncate px-2 py-2.5 text-xs text-muted">{[...new Set(o.workItems.map((w) => PROCESS_LABEL[w.process]))].join(", ") || "—"}</td>
                    <td className="tabular px-2 py-2.5 text-right text-ink-soft">{formatCop(money.supplies)}</td>
                    <td className="tabular px-2 py-2.5 text-right text-ink-soft">{formatCop(money.machineCost)}</td>
                    <td className="tabular px-2 py-2.5 text-right text-ink">{formatCop(money.price)}</td>
                    <td className="tabular px-2 py-2.5 text-right text-glow-soft" title={adjusted ? `Índice ${adjusted.fromMonth} → ${adjusted.toMonth}` : "Falta el IPC de ese mes"}>
                      {adjusted ? formatCop(adjusted.value) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <OrderStatusChip status={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <p className="flex items-center gap-2 p-6 text-sm text-muted">
                <Archive className="size-4" aria-hidden /> Nada coincide con los filtros.
              </p>
            )}
          </div>
        </>
      )}
      {adding && (
        <HistoricalForm
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function HistoricalForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data } = useSync();
  const prod = useProduction();
  const [form, setForm] = useState<HistoricalInput>({
    clientId: null,
    clientName: "",
    title: "",
    description: "",
    quantity: 1,
    receivedAt: addDays(data.today, -30),
    deliveredAt: addDays(data.today, -20),
    dueDate: null,
    workItems: [{ process: "torno", machineId: null, hours: 1 }],
    supplies: [],
    price: null,
    satisfaction: null,
    invoiceNumber: null,
    notes: "",
  });
  const { run, busy } = useAction();
  const set = <K extends keyof HistoricalInput>(k: K, v: HistoricalInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Agregar trabajo anterior"
      description="Para que el histórico y los precios ajustados por inflación arranquen completos."
      footer={
        <Button
          loading={busy === "save"}
          disabled={!form.title.trim() || !(form.clientId || form.clientName?.trim())}
          icon={<Plus className="size-4" />}
          onClick={async () => {
            const ok = await run("save", () => api.orders.historical({ ...form, clientName: form.clientId ? null : form.clientName }), (r) => `${r.order.folio} agregado al histórico`);
            if (ok) onSaved();
          }}
        >
          Guardar en el histórico
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Cliente">
          {() => (
            <ClientPicker clients={prod.clients} clientId={form.clientId} clientName={form.clientName ?? ""} onChange={(v) => setForm((f) => ({ ...f, clientId: v.clientId, clientName: v.clientName }))} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <Field label="Trabajo">{(id) => <Input id={id} value={form.title} onChange={(e) => set("title", e.target.value)} />}</Field>
          <Field label="Cantidad">{(id) => <NumberInput id={id} integer min={1} value={form.quantity} onChange={(v) => set("quantity", v ?? 1)} />}</Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Ingreso">{(id) => <Input id={id} type="date" max={data.today} value={form.receivedAt} onChange={(e) => set("receivedAt", e.target.value)} />}</Field>
          <Field label="Entrega prometida">{(id) => <Input id={id} type="date" value={form.dueDate ?? ""} onChange={(e) => set("dueDate", e.target.value || null)} />}</Field>
          <Field label="Entregado">{(id) => <Input id={id} type="date" max={data.today} value={form.deliveredAt} onChange={(e) => set("deliveredAt", e.target.value)} />}</Field>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-ink-soft">Horas por proceso</p>
          <div className="flex flex-col gap-2">
            {form.workItems.map((w, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_6rem_auto] gap-2">
                <Select aria-label="Proceso" value={w.process} onChange={(e) => set("workItems", form.workItems.map((x, j) => (j === i ? { ...x, process: e.target.value as Process, machineId: null } : x)))}>
                  {PROCESSES.map((p) => (
                    <option key={p} value={p}>
                      {PROCESS_LABEL[p]}
                    </option>
                  ))}
                </Select>
                <Select aria-label="Máquina" value={w.machineId ?? ""} onChange={(e) => set("workItems", form.workItems.map((x, j) => (j === i ? { ...x, machineId: e.target.value || null } : x)))}>
                  <option value="">Sin máquina</option>
                  {prod.machines
                    .filter((m) => m.process === w.process)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </Select>
                <NumberInput value={w.hours} suffix="h" onChange={(v) => set("workItems", form.workItems.map((x, j) => (j === i ? { ...x, hours: v ?? 0 } : x)))} />
                <button type="button" aria-label="Quitar" onClick={() => set("workItems", form.workItems.filter((_, j) => j !== i))} className="grid h-12 w-10 place-items-center text-muted hover:text-blocked">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <Button variant="secondary" size="sm" className="self-start" icon={<Plus className="size-4" />} onClick={() => set("workItems", [...form.workItems, { process: "torno", machineId: null, hours: 1 }])}>
              Agregar proceso
            </Button>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-ink-soft">Insumos y proveedores</p>
          <SuppliesEditor items={form.supplies} onChange={(s) => set("supplies", s)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Precio cobrado (antes de IVA)">{(id) => <MoneyInput id={id} value={form.price} onChange={(v) => set("price", v)} />}</Field>
          <Field label="Factura (opcional)">{(id) => <Input id={id} value={form.invoiceNumber ?? ""} onChange={(e) => set("invoiceNumber", e.target.value || null)} />}</Field>
        </div>
        <Field label="Satisfacción del cliente">{() => <StarRating value={form.satisfaction} onChange={(v) => set("satisfaction", v)} label="Satisfacción" />}</Field>
        <Field label="Notas">{(id) => <Textarea id={id} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}
