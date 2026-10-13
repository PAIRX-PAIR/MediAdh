import { WifiOff } from "lucide-react";
import { BrandMark } from "@/components/shell/brand-mark";
import { RetryButton } from "./retry";

export const metadata = { title: "Sin conexión" };

/** Cached by the service worker and shown when a page cannot load without internet. */
export default function Offline() {
  return (
    <main id="contenido" className="hud-grid-bg flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <BrandMark className="size-14" />
      <WifiOff className="size-10 text-pending" aria-hidden />
      <h1 className="font-display text-2xl font-bold text-ink">Sin conexión</h1>
      <p className="max-w-sm text-ink-soft">
        No hay internet en este momento. Lo que hayas guardado ya está en el servidor; cuando vuelva la señal, la app se pone al día sola.
      </p>
      <RetryButton />
    </main>
  );
}
