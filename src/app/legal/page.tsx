import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { buildPublicInfo } from "@/lib/server/services/sync";
import { LEGAL_PAGES, LegalShell, Responsible } from "./legal-ui";

export const metadata = { title: "Centro legal" };

export default async function LegalCenter() {
  const info = await buildPublicInfo();
  return (
    <LegalShell
      kicker="Legal · Centro legal"
      title="Todo lo legal, en claro."
      lead="Aquí están las reglas de la aplicación del taller: cómo cuidamos los datos de quienes trabajan aquí y de nuestros clientes, cómo se usa la app y qué derechos tienes. En palabras normales, sin letra pequeña."
      legal={info.legal}
    >
      <ol className="grid gap-3">
        {LEGAL_PAGES.map((p, i) => (
          <li key={p.href}>
            <Link href={p.href} className="hud-panel group flex items-center gap-4 p-5 !no-underline transition-colors hover:border-glow/60">
              <span className="tabular font-display text-2xl font-bold text-glow">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1">
                <span className="block font-display text-lg font-semibold text-ink">{p.title}</span>
                <span className="block text-sm text-muted">{p.summary}</span>
              </span>
              <ArrowRight className="size-5 text-muted transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
          </li>
        ))}
      </ol>
      <h2>Quién es el responsable</h2>
      <Responsible legal={info.legal} workshopName={info.workshopName} />
      <p>
        Si consideras que no atendimos bien tu solicitud sobre datos personales, puedes acudir a la Superintendencia de Industria y Comercio (SIC),{" "}
        <a href="https://www.sic.gov.co" target="_blank" rel="noopener noreferrer">
          www.sic.gov.co
        </a>
        .
      </p>
    </LegalShell>
  );
}
