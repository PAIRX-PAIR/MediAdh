"use client";

import { LogOut, QrCode, RefreshCw } from "lucide-react";
import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { BrandMark } from "@/components/shell/brand-mark";
import { Button, Spinner } from "@/components/ui/primitives";
import { BoardScreen } from "../tablero/[token]/board-screen";

type State =
  | { status: "cargando" }
  | { status: "ninguno" | "vencido" | "revocado" }
  | { status: "pendiente"; code: string; expiresAt: string }
  | { status: "aprobado"; operator: string };

const POLL_MS = 3000;

/** "8 letras" shown in two groups so it can be read aloud. */
const pretty = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * Operator entry: the phone asks for access and shows a QR; an admin scans it
 * from Dispositivos and picks who the operator is. Then this phone shows that
 * person's queue, without user or password, until an admin revokes it.
 */
export function OperatorAccess() {
  const [state, setState] = useState<State>({ status: "cargando" });
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    fetch("/api/dispositivo", { cache: "no-store" })
      .then((r) => r.json() as Promise<State>)
      .then(setState)
      .catch(() => setError("Sin conexión. Reintentando…"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While waiting for the admin, check every few seconds.
  useEffect(() => {
    if (state.status !== "pendiente") return;
    const id = window.setInterval(() => {
      setNow(Date.now());
      load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [state.status, load]);

  useEffect(() => {
    if (state.status !== "pendiente") return;
    // The QR opens the approval page directly, even from a phone's normal camera app.
    const url = `${window.location.origin}/admin/dispositivos?codigo=${state.code}`;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#030812", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [state]);

  const request = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dispositivo", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo generar el código.");
      setState((await res.json()) as State);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (state.status === "aprobado") {
    return (
      <BoardScreen
        source="/api/dispositivo/tablero"
        title={`Mi trabajo · ${state.operator}`}
        onDenied={() => setState({ status: "revocado" })}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon={<LogOut className="size-4" />}
            onClick={async () => {
              await fetch("/api/dispositivo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" });
              setState({ status: "ninguno" });
            }}
          >
            Salir
          </Button>
        }
      />
    );
  }

  const secondsLeft = state.status === "pendiente" ? Math.max(0, Math.round((Date.parse(state.expiresAt) - now) / 1000)) : 0;
  return (
    <main id="contenido" className="hud-grid-bg flex min-h-dvh flex-col items-center justify-center gap-5 px-4 py-8 text-center">
      <BrandMark className="size-12" />
      <h1 className="font-display text-2xl font-bold text-ink">Soy operario</h1>
      {state.status === "cargando" && <Spinner label="Revisando este celular" />}

      {state.status === "pendiente" && (
        <section className="flex w-full max-w-sm flex-col items-center gap-4" aria-live="polite">
          <p className="text-ink-soft">Muéstrale este código al coordinador o al administrador para que lo escanee.</p>
          <div className="rounded-2xl bg-white p-3 shadow-glow">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- local SVG data URI, no network image
              <img src={`data:image/svg+xml;utf8,${encodeURIComponent(qr)}`} alt={`Código QR para autorizar este celular: ${pretty(state.code)}`} className="size-64" />
            ) : (
              <div className="grid size-64 place-items-center">
                <Spinner />
              </div>
            )}
          </div>
          <p className="text-sm text-muted">
            Sin cámara, díctale el código: <strong className="tabular font-mono text-lg tracking-widest text-ink">{pretty(state.code)}</strong>
          </p>
          <p className="text-xs text-muted">
            Esperando aprobación… vence en {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </p>
        </section>
      )}

      {(state.status === "ninguno" || state.status === "vencido" || state.status === "revocado") && (
        <section className="flex w-full max-w-sm flex-col items-center gap-4">
          <p className="text-ink-soft">
            {state.status === "vencido"
              ? "El código anterior venció. Genera uno nuevo."
              : state.status === "revocado"
                ? "Este celular ya no tiene acceso. Si fue un error, pide acceso otra vez."
                : "Para ver tu cola de trabajo en este celular, genera un código y muéstraselo al coordinador. Solo se hace una vez."}
          </p>
          <Button size="lg" block loading={busy} icon={state.status === "ninguno" ? <QrCode className="size-5" /> : <RefreshCw className="size-5" />} onClick={() => void request()}>
            {state.status === "ninguno" ? "Pedir acceso" : "Generar otro código"}
          </Button>
        </section>
      )}

      {error && <p className="text-sm text-pending">{error}</p>}
      <Link href="/?acceso=1" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
        ¿Eres administrador o coordinador? Inicia sesión
      </Link>
    </main>
  );
}
