"use client";

import { Eye, Undo2 } from "lucide-react";
import { useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { api } from "@/lib/client/api";

/** Always visible while a gerencia admin is "entrando como" someone else. */
export function ImpersonationBar() {
  const { data } = useSync();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actor = data.me.impersonator;
  if (!actor) return null;

  const back = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.auth.stopImpersonating();
      // Full reload on purpose: nothing of the other person's view may stay in memory.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/admin/cambiar-usuario");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo volver a tu cuenta.");
      setBusy(false);
    }
  };

  return (
    <div role="status" className="relative z-50 border-b border-pending/60 bg-pending text-abyss">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm sm:px-5 lg:px-8">
        <Eye className="size-4 shrink-0" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Estás viendo la app como {data.me.displayName}</span>
          <span className="hidden sm:inline"> · solo lectura: no se guarda ningún cambio</span>
          {error && <span className="block font-semibold">{error}</span>}
        </p>
        <button
          type="button"
          onClick={back}
          disabled={busy}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-abyss px-3 font-display text-sm font-semibold text-ink disabled:opacity-60"
        >
          <Undo2 className="size-4" aria-hidden />
          {busy ? "Volviendo…" : `Volver a ${actor.displayName}`}
        </button>
      </div>
    </div>
  );
}
