import Link from "next/link";
import { SetupForm } from "@/components/access/setup-form";
import { BrandMark } from "@/components/shell/brand-mark";
import { setupStatus } from "@/lib/server/services/auth";

export const metadata = { title: "Configuración inicial" };

/** One-time creation of the first administrator, protected by SETUP_KEY. */
export default async function SetupPage() {
  const status = await setupStatus();
  return (
    <main id="contenido" className="hud-grid-bg flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark className="size-11" />
          <div>
            <p className="hud-label">Configuración inicial</p>
            <h1 className="font-display text-2xl font-bold text-ink">Primer administrador</h1>
          </div>
        </div>
        {!status.needsSetup ? (
          <div className="hud-panel p-5">
            <p className="text-ink-soft">El taller ya tiene administrador. Esta página queda inactiva.</p>
            <p className="mt-2 text-sm text-muted">Por seguridad, borra la variable SETUP_KEY en Vercel si aún existe.</p>
            <Link href="/?acceso=1" className="mt-4 inline-block font-semibold text-glow underline-offset-4 hover:underline">
              Ir a iniciar sesión
            </Link>
          </div>
        ) : !status.setupEnabled ? (
          <div className="hud-panel p-5">
            <p className="text-ink-soft">Para crear el primer administrador, define la variable de entorno SETUP_KEY (mínimo 16 caracteres) y vuelve a cargar esta página.</p>
          </div>
        ) : (
          <SetupForm />
        )}
      </div>
    </main>
  );
}
