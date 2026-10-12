"use client";

import { BellOff, BellRing, Download, Share, SquarePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useSync } from "@/components/providers/sync-provider";
import { useToast } from "@/components/ui/overlay";
import { Button, cn } from "@/components/ui/primitives";
import { api } from "@/lib/client/api";
import { usePush } from "@/lib/client/use-push";

/** Two-step permission: our own card first; only the tap on "Activar" opens the browser dialog. */
export function PushCard({ compact = false }: { compact?: boolean }) {
  const { data } = useSync();
  const { state, enable, disable, busy, error } = usePush();
  const toast = useToast();
  const [testing, setTesting] = useState(false);

  if (state === "subscribed" && compact) return null;
  if (state === "not-configured" && !data.me.isAdmin) return null;

  return (
    <section className={cn("hud-panel flex flex-col gap-3 p-4", state === "default" && "border-glow/40")} aria-labelledby="push-title">
      <div className="flex items-start gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl border", state === "subscribed" ? "border-done/40 text-done" : "border-glow/40 text-glow")} aria-hidden>
          {state === "denied" ? <BellOff className="size-5" /> : <BellRing className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="push-title" className="font-display font-semibold text-ink">
            {state === "subscribed" ? "Avisos activos en este celular" : "Avisos de trabajo en el celular"}
          </h2>
          <p className="text-sm text-muted">
            {state === "default" && "Te llega una notificación cuando te asignen trabajo, cambie una entrega o respondan tu pedido, aunque la app esté cerrada."}
            {state === "subscribed" && "Te llegarán las notificaciones de tu puesto. Dentro de la app también suenan las alertas."}
            {state === "denied" && "Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para este sitio y vuelve a abrir la app."}
            {state === "unsupported" && "Este navegador no permite notificaciones. Usa Chrome en Android o instala la app."}
            {state === "not-configured" && "Faltan las claves VAPID en el servidor (npm run vapid). Mientras tanto, los avisos funcionan dentro de la app."}
            {state === "ios-needs-install" && "En iPhone, los avisos solo funcionan con la app en la pantalla de inicio:"}
          </p>
          {state === "ios-needs-install" && (
            <ol className="mt-2 flex flex-col gap-1.5 text-sm text-ink-soft">
              <li className="flex items-center gap-2">
                <Share className="size-4 text-glow" aria-hidden /> 1. Toca Compartir en Safari.
              </li>
              <li className="flex items-center gap-2">
                <SquarePlus className="size-4 text-glow" aria-hidden /> 2. Elige «Agregar a pantalla de inicio».
              </li>
              <li>3. Abre la app desde el ícono y vuelve a esta tarjeta.</li>
            </ol>
          )}
          {error && <p className="mt-1 text-sm text-blocked">{error}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {state === "default" && (
          <Button size="lg" loading={busy} icon={<BellRing className="size-5" />} onClick={() => void enable()}>
            Activar avisos
          </Button>
        )}
        {state === "subscribed" && (
          <>
            <Button
              size="sm"
              variant="secondary"
              loading={testing}
              onClick={async () => {
                setTesting(true);
                try {
                  const r = await api.push.test();
                  toast(r.sent > 0 ? `Enviado a ${r.sent} dispositivo(s)` : "No se pudo enviar la prueba", r.sent > 0 ? "success" : "error");
                } finally {
                  setTesting(false);
                }
              }}
            >
              Enviar prueba
            </Button>
            <Button size="sm" variant="ghost" loading={busy} onClick={() => void disable()}>
              Desactivar en este celular
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** "Instalar app" when the browser offers it (Android/desktop Chrome). Installed apps keep notification permission. */
export function InstallButton() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (!event || installed) return null;
  return (
    <Button
      variant="secondary"
      icon={<Download className="size-4" />}
      onClick={async () => {
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === "accepted") setInstalled(true);
        setEvent(null);
      }}
    >
      Instalar la app
    </Button>
  );
}
