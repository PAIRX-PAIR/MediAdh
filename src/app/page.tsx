import { ArrowRight, BellRing, ClipboardCheck, Cog, FileText, Gauge, LogIn, ShieldCheck, Smartphone, UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AccessDialog } from "@/components/access/access-dialog";
import { HeroStage } from "@/components/landing/hero-stage";
import { Reveal, StoryRail } from "@/components/landing/story";
import { BrandMark } from "@/components/shell/brand-mark";
import { DEFAULT_MACHINES } from "@/lib/domain/defaults";
import { PROCESS_LABEL } from "@/lib/domain/labels";
import { resolvePrincipal } from "@/lib/server/auth/principal";
import { buildPublicInfo } from "@/lib/server/services/sync";

export const metadata = { title: { absolute: "Procesos productivos S.M.I." } };

const STEPS = [
  {
    id: "recibe",
    kicker: "01 · Ingreso",
    title: "Cada pieza entra con folio, fotos y estado",
    body: "Al llegar el trabajo se registra el cliente, la cantidad, cómo llegó y las fotos o planos. Nace la orden de trabajo con su número consecutivo.",
    icon: FileText,
  },
  {
    id: "cotiza",
    kicker: "02 · Cotización",
    title: "Cotiza con materiales, horas y dificultad",
    body: "Torno, fresadora, CNC, prensa, soldadura y banco con su tarifa. Recargo por dificultad, utilidad e IVA. Si el cliente aprueba, se vuelve orden de trabajo.",
    icon: ClipboardCheck,
  },
  {
    id: "programa",
    kicker: "03 · Programación",
    title: "La cola de cada máquina, a la vista",
    body: "Ocupación en verde, ámbar o rojo, fecha libre más cercana y una recomendación explicada de qué trabajo sigue. Antes de prometer, pregunta: ¿me puedo comprometer?",
    icon: Gauge,
  },
  {
    id: "produce",
    kicker: "04 · Producción",
    title: "Cada operario, su trabajo en el celular",
    body: "Las tareas llegan al puesto, no a la persona. Avisos con sonido, pedir material en tres toques y cierre del día. Si cambia el contrato, el puesto conserva su trabajo.",
    icon: Smartphone,
  },
  {
    id: "entrega",
    kicker: "05 · Entrega",
    title: "Recordatorios, garantías y aviso de facturar",
    body: "Avisos 24 horas antes, el mismo día y al vencer. Tres días después de entregar sin reclamos, el servicio se cierra solo y aparece FACTURAR.",
    icon: BellRing,
  },
  {
    id: "mide",
    kicker: "06 · Gestión",
    title: "Mide la gestión de producción",
    body: "Cumplimiento, satisfacción, garantías, devoluciones y uso de cada máquina, mes a mes. Las máquinas nuevas suman desde el día en que se activan.",
    icon: Cog,
  },
] as const;

export default async function Home() {
  const [info, session] = await Promise.all([buildPublicInfo(), resolvePrincipal().catch(() => ({ status: "anonymous" as const }))]);
  const signedIn = session.status === "ok";
  const home = signedIn && session.principal.isAdmin ? "/admin" : "/panel";
  const company = info.legal.companyName || "Servi Mecanizados Industriales S.A.S.";

  return (
    <div className="relative">
      <header className="safe-top fixed inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Procesos productivos S.M.I., inicio">
            <BrandMark className="size-9" />
            <span className="font-display text-sm font-bold tracking-wide text-ink sm:text-base">S.M.I.</span>
          </Link>
          <nav className="ml-auto flex items-center gap-2" aria-label="Acceso">
            {signedIn ? (
              <Link href={home} className="inline-flex h-11 items-center gap-2 rounded-xl border border-glow/40 bg-navy-700/60 px-4 font-display text-sm font-semibold text-ink backdrop-blur hover:border-glow">
                Mi panel <ArrowRight className="size-4" aria-hidden />
              </Link>
            ) : (
              <Link href="/?acceso=1" scroll={false} className="inline-flex h-11 items-center gap-2 rounded-xl border border-line-strong bg-abyss/60 px-4 font-display text-sm font-semibold text-ink backdrop-blur hover:border-glow/60">
                <LogIn className="size-4" aria-hidden /> Entrar
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main id="contenido">
        {/* Hero: text and buttons are server HTML (fast first paint); the 3D stage loads after. */}
        <section className="relative isolate flex min-h-svh flex-col justify-end overflow-hidden pb-16 pt-28 sm:justify-center sm:pb-24" aria-labelledby="hero-title">
          <HeroStage />
          <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6">
            <p className="hud-label mb-3 text-glow-soft">{company}</p>
            <h1 id="hero-title" className="max-w-3xl text-balance font-display text-5xl font-bold leading-[0.95] tracking-tight text-ink sm:text-7xl">
              Procesos productivos <span className="text-glow text-glow">S.M.I.</span>
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-lg text-ink-soft">
              Del ingreso de la pieza a la factura: planea, asigna, verifica y entrega a tiempo. Cada operario ve su trabajo en el celular; el coordinador dirige el taller
              desde un solo mando.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {signedIn ? (
                <Link href={home} className="inline-flex h-14 items-center gap-2.5 rounded-xl border border-glow/50 bg-gradient-to-b from-navy-400 to-navy-600 px-6 font-display text-lg font-semibold text-white shadow-glow transition-shadow hover:shadow-glow-strong">
                  Ir a mi panel <ArrowRight className="size-5" aria-hidden />
                </Link>
              ) : (
                <>
                  <Link href="/?acceso=1" scroll={false} className="inline-flex h-14 items-center gap-2.5 rounded-xl border border-glow/50 bg-gradient-to-b from-navy-400 to-navy-600 px-6 font-display text-lg font-semibold text-white shadow-glow transition-shadow hover:shadow-glow-strong">
                    <LogIn className="size-5" aria-hidden /> Iniciar sesión
                  </Link>
                  {info.registrationOpen && (
                    <Link href="/?acceso=registro" scroll={false} className="inline-flex h-14 items-center gap-2.5 rounded-xl border border-line-strong bg-abyss/60 px-6 font-display text-lg font-semibold text-ink backdrop-blur hover:border-glow/60">
                      <UserPlus className="size-5" aria-hidden /> Crear cuenta
                    </Link>
                  )}
                </>
              )}
            </div>
            {info.demo && (
              <p className="mt-4 text-sm text-vacant">Demostración con datos ficticios: entra y prueba como coordinador o como tornero.</p>
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32 bg-gradient-to-b from-transparent to-abyss" aria-hidden />
        </section>

        <StoryRail steps={STEPS.map(({ id, kicker, title, body }) => ({ id, kicker, title, body }))}>
          {STEPS.map((s) => {
            const Icon = s.icon;
            return <Icon key={s.id} className="size-6" aria-hidden />;
          })}
        </StoryRail>

        <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6" aria-labelledby="maquinas-title">
          <Reveal>
            <p className="hud-label mb-2">Planta</p>
            <h2 id="maquinas-title" className="max-w-2xl text-balance font-display text-3xl font-bold text-ink sm:text-4xl">
              Las máquinas del taller, con su capacidad real
            </h2>
            <p className="mt-3 max-w-2xl text-ink-soft">
              Una máquina en «próximamente» se ve, pero no recibe trabajo ni cuenta en los indicadores. El día que se activa, empieza a sumar capacidad propia y del taller.
            </p>
          </Reveal>
          <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {DEFAULT_MACHINES.map((m, i) => (
              <Reveal as="li" key={m.id} delay={i * 0.04} className={`hud-panel p-4 ${m.state === "inactiva" ? "opacity-60" : ""}`}>
                <p className="font-display text-lg font-semibold text-ink">{m.name}</p>
                <p className="text-sm text-muted">{PROCESS_LABEL[m.process]}</p>
                <p className={`mt-2 text-xs font-semibold uppercase tracking-wider ${m.state === "inactiva" ? "text-vacant" : "text-done"}`}>
                  {m.state === "inactiva" ? "Próximamente" : "En servicio"}
                </p>
              </Reveal>
            ))}
          </ul>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6" aria-labelledby="seguridad-title">
          <Reveal className="hud-panel hud-corners flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-10">
            <ShieldCheck className="size-12 shrink-0 text-glow" aria-hidden />
            <div className="flex-1">
              <h2 id="seguridad-title" className="font-display text-2xl font-bold text-ink">
                Acceso solo para el equipo, datos protegidos
              </h2>
              <p className="mt-2 text-ink-soft">
                Cada cuenta la aprueba el coordinador. Contraseñas cifradas, bloqueo ante intentos repetidos y tratamiento de datos conforme a la Ley 1581 de 2012.
              </p>
            </div>
            {!signedIn && (
              <Link href="/?acceso=1" scroll={false} className="inline-flex h-12 items-center gap-2 rounded-xl border border-glow/50 bg-navy-700/60 px-5 font-display font-semibold text-ink hover:border-glow">
                Entrar <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © {new Date().getFullYear()} {company}
            {info.legal.nit ? ` · NIT ${info.legal.nit}` : ""}
          </p>
          <nav aria-label="Información legal" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/legal" className="hover:text-ink">
              Centro legal
            </Link>
            <Link href="/legal/datos" className="hover:text-ink">
              Tratamiento de datos
            </Link>
            <Link href="/legal/terminos" className="hover:text-ink">
              Términos
            </Link>
            <Link href="/legal/pqr" className="hover:text-ink">
              PQR
            </Link>
          </nav>
        </div>
      </footer>

      <Suspense>
        <AccessDialog info={info} />
      </Suspense>
    </div>
  );
}
