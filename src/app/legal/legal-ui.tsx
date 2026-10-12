import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/shell/brand-mark";
import { formatDate } from "@/lib/domain/labels";
import type { LegalInfo } from "@/lib/domain/schema";

export const LEGAL_PAGES = [
  { href: "/legal/datos", title: "Tratamiento de datos personales", summary: "Qué datos usamos, para qué, cuánto tiempo y cómo ejercer tus derechos (Ley 1581 de 2012)." },
  { href: "/legal/terminos", title: "Términos de uso", summary: "Reglas para usar la aplicación del taller: cuentas, buen uso y responsabilidades." },
  { href: "/legal/cookies", title: "Cookies y almacenamiento", summary: "Qué guarda tu navegador o celular cuando usas la aplicación (y qué no)." },
  { href: "/legal/aviso", title: "Aviso legal", summary: "Quién es el titular de la aplicación, para qué sirve y condiciones básicas." },
  { href: "/legal/pqr", title: "Peticiones, quejas y reclamos", summary: "Cómo radicar una solicitud y en cuánto tiempo respondemos." },
] as const;

/** "Field or a visible placeholder": unconfigured company data never looks like real data. */
export function V({ value, fallback = "pendiente de configurar" }: { value: string; fallback?: string }) {
  return value ? <>{value}</> : <span className="text-pending">[{fallback}]</span>;
}

export function Responsible({ legal, workshopName }: { legal: LegalInfo; workshopName: string }) {
  return (
    <ul className="legal-list">
      <li>
        Responsable: <V value={legal.companyName} fallback="razón social" />
        {legal.tradeName ? ` (${legal.tradeName})` : ""}, que opera la aplicación «{workshopName}».
      </li>
      <li>
        NIT: <V value={legal.nit} />
      </li>
      <li>
        Dirección: <V value={legal.address} />
        {legal.city ? `, ${legal.city}` : ""}, Colombia.
      </li>
      <li>
        Correo: <V value={legal.email} /> · Teléfono: <V value={legal.phone} />
      </li>
      <li>
        Atención de datos personales y PQR: <V value={legal.privacyContact} fallback="área o persona encargada" />
      </li>
      {legal.website && <li>Sitio web: {legal.website}</li>}
    </ul>
  );
}

export function LegalShell({
  kicker,
  title,
  lead,
  legal,
  children,
}: {
  kicker: string;
  title: string;
  lead: ReactNode;
  legal: LegalInfo;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Inicio">
            <BrandMark className="size-8" />
            <span className="font-display font-bold text-ink">S.M.I.</span>
          </Link>
          <Link href="/legal" className="ml-auto inline-flex h-11 items-center gap-1.5 text-sm text-muted hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Centro legal
          </Link>
        </div>
      </header>
      <main id="contenido" className="legal mx-auto max-w-3xl px-4 py-10">
        <p className="hud-label mb-2">{kicker}</p>
        <h1 className="text-balance font-display text-3xl font-bold text-ink sm:text-4xl">{title}</h1>
        <p className="mt-4 text-pretty text-lg text-ink-soft">{lead}</p>
        <p className="mt-3 text-sm text-muted">Versión vigente: {formatDate(legal.policyVersion, { day: "numeric", month: "long", year: "numeric" })}</p>
        <div className="mt-10">{children}</div>
      </main>
    </div>
  );
}
