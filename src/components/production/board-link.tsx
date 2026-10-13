"use client";

import { Copy, ExternalLink, MonitorPlay, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useConfirm, useToast } from "@/components/ui/overlay";
import { Button } from "@/components/ui/primitives";
import { request } from "@/lib/client/api";

/** Secret link of the operators' board: open it on the workshop screen or send it to their phones. */
export function BoardLinkCard() {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    request<{ token: string }>("/api/admin/board")
      .then((r) => setToken(r.token))
      .catch(() => undefined);
  }, []);

  const url = token ? `${window.location.origin}/tablero/${token}` : null;
  return (
    <section className="hud-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="tablero-title">
      <div className="min-w-0">
        <h2 id="tablero-title" className="flex items-center gap-2 font-display font-semibold text-ink">
          <MonitorPlay className="size-5 text-glow" aria-hidden /> Tablero de operarios
        </h2>
        <p className="text-sm text-muted">
          Todas las colas en una pantalla del taller (televisor o tablet). Solo lectura, sin clientes ni precios. Para que cada operario vea solo la suya en su celular, usa{" "}
          <a href="/admin/dispositivos" className="font-semibold text-glow hover:underline">
            Accesos QR
          </a>
          .
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!url}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink-soft hover:border-glow/60 hover:text-ink"
        >
          <ExternalLink className="size-4" aria-hidden /> Abrir
        </a>
        <Button
          variant="secondary"
          icon={<Copy className="size-4" />}
          disabled={!url}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url!);
              toast("Enlace copiado");
            } catch {
              toast("No se pudo copiar. Ábrelo y copia la dirección.", "error");
            }
          }}
        >
          Copiar enlace
        </Button>
        <Button
          variant="ghost"
          loading={busy}
          icon={<RefreshCw className="size-4" />}
          onClick={async () => {
            if (!(await confirm({ title: "¿Cambiar el enlace del tablero?", body: "El enlace anterior deja de funcionar; habrá que compartir el nuevo.", confirmLabel: "Cambiar" }))) return;
            setBusy(true);
            try {
              const r = await request<{ token: string }>("/api/admin/board", { method: "POST", body: { rotate: true } });
              setToken(r.token);
              toast("Enlace nuevo creado");
            } catch {
              toast("No se pudo cambiar el enlace.", "error");
            } finally {
              setBusy(false);
            }
          }}
        >
          Cambiar
        </Button>
      </div>
      {dialog}
    </section>
  );
}
