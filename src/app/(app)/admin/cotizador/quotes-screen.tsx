"use client";

import { Calculator, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { QuoteEditorModal, QuoteStatusChip } from "@/components/production/quote-editor";
import { PageHeader, Segmented } from "@/components/ui/kit";
import { Button, EmptyState, Input } from "@/components/ui/primitives";
import { useProduction } from "@/lib/client/use-production";
import { formatDate } from "@/lib/domain/labels";
import { formatCop, quoteDisplayStatus, quoteTotals } from "@/lib/domain/quote";

type View = "abiertas" | "aprobadas" | "cerradas";

export function QuotesScreen() {
  const { data } = useSync();
  const prod = useProduction();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<View>("abiertas");
  const [query, setQuery] = useState("");

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prod.quotes
      .filter((qt) => {
        const s = quoteDisplayStatus(qt, data.today);
        if (view === "abiertas") return s === "borrador" || s === "enviada" || s === "vencida";
        if (view === "aprobadas") return s === "aprobada";
        return s === "rechazada";
      })
      .filter((qt) => !q || `${qt.folio} ${qt.title} ${qt.clientName}`.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [prod.quotes, view, query, data.today]);

  const selectedId = params.get("c");
  const selected = selectedId ? (prod.quotes.find((q) => q.id === selectedId) ?? null) : null;
  const creating = params.get("nueva") === "1";
  const unconfigured = prod.settings && Object.values(prod.settings.processRates).every((r) => r === 0);

  return (
    <div>
      <PageHeader
        eyebrow="Ventas"
        title="Cotizador"
        description="Materiales, horas por máquina × tarifa, la utilidad que tú pones e IVA. Una cotización aprobada se vuelve orden de trabajo con un clic."
        actions={
          <Button icon={<Calculator className="size-5" />} onClick={() => setParam({ nueva: "1", c: null })}>
            Nueva cotización
          </Button>
        }
      />
      {unconfigured && (
        <p className="mb-4 rounded-xl border border-pending/40 bg-pending/10 px-4 py-3 text-sm text-pending">
          Las tarifas por hora están en $0.{" "}
          <Link href="/admin/ajustes#produccion" className="font-semibold underline underline-offset-4">
            Configúralas en Ajustes
          </Link>{" "}
          para que el cotizador las proponga solo.
        </p>
      )}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented
          label="Vista"
          value={view}
          onChange={setView}
          options={[
            { value: "abiertas", label: "Abiertas" },
            { value: "aprobadas", label: "Aprobadas" },
            { value: "cerradas", label: "Rechazadas" },
          ]}
        />
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" aria-label="Buscar cotización" placeholder="Folio, cliente o trabajo" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<Calculator />} title="No hay cotizaciones aquí" body={view === "abiertas" ? "Crea una cotización para un cliente; podrás imprimirla o guardarla en PDF." : undefined} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((q) => {
            const t = quoteTotals(q);
            return (
              <li key={q.id}>
                <button type="button" onClick={() => setParam({ c: q.id, nueva: null })} className="hud-panel flex w-full flex-col gap-2 p-4 text-left transition-colors hover:border-glow/50">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-glow">{q.folio}</span>
                    <QuoteStatusChip quote={q} today={data.today} />
                  </span>
                  <span className="block truncate font-display text-[17px] font-semibold text-ink">{q.title}</span>
                  <span className="block truncate text-sm text-muted">
                    {q.clientName} · {q.quantity} {q.quantity === 1 ? "pieza" : "piezas"} · {t.totalHours} h
                  </span>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-faint">{q.issuedAt ? `Enviada ${formatDate(q.issuedAt)}` : `Creada ${formatDate(q.createdAt)}`}</span>
                    <span className="tabular font-display text-lg font-semibold text-ink">{formatCop(t.total)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {(selected || creating) && (
        <QuoteEditorModal
          key={selected?.id ?? "new"}
          quote={selected}
          onClose={() => setParam({ c: null, nueva: null })}
          onCreated={(q) => setParam({ c: q.id, nueva: null })}
        />
      )}
    </div>
  );
}
