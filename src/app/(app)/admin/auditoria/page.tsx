"use client";

import { Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/kit";
import { EmptyState, Input, Spinner } from "@/components/ui/primitives";
import { ApiError, api } from "@/lib/client/api";
import { formatDateTime } from "@/lib/domain/labels";

type Entry = Awaited<ReturnType<typeof api.admin.audit>>["entries"][number];

/** Who did what and when (administrative actions, access and production changes). */
export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    api.admin
      .audit()
      .then((r) => setEntries(r.entries))
      .catch((e) => setError(e instanceof ApiError ? e.message : "No se pudo cargar la auditoría."));
  }, []);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter((e) => !q || `${e.actorName ?? ""} ${e.action} ${e.target ?? ""} ${e.detail ?? ""}`.toLowerCase().includes(q));
  }, [entries, query]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader eyebrow="Sistema" title="Auditoría" description="Registro inalterable de acciones: accesos, aprobaciones, contratos, órdenes, cotizaciones y configuración. Cada cambio también queda en el historial del repositorio de datos." />
      <div className="relative sm:w-80">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input type="search" aria-label="Filtrar auditoría" placeholder="Persona, acción o folio" className="pl-10" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {error && <p className="text-sm text-blocked">{error}</p>}
      {!entries ? (
        <Spinner label="Cargando auditoría" />
      ) : list.length === 0 ? (
        <EmptyState icon={<ShieldCheck />} title="Sin registros" />
      ) : (
        <div className="hud-panel overflow-x-auto p-0">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-semibold">Cuándo</th>
                <th className="px-2 py-3 font-semibold">Quién</th>
                <th className="px-2 py-3 font-semibold">Acción</th>
                <th className="px-4 py-3 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-b border-line/50">
                  <td className="tabular whitespace-nowrap px-4 py-2 text-xs text-muted">{formatDateTime(e.at)}</td>
                  <td className="px-2 py-2 text-ink">{e.actorName ?? "Sistema"}</td>
                  <td className="px-2 py-2 font-mono text-xs text-glow-soft">{e.action}</td>
                  <td className="px-4 py-2 text-ink-soft">{[e.target, e.detail].filter(Boolean).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
