import { buildPublicInfo } from "@/lib/server/services/sync";
import { LegalShell, Responsible, V } from "../legal-ui";

export const metadata = { title: "Peticiones, quejas y reclamos" };

export default async function Pqr() {
  const info = await buildPublicInfo();
  const { legal } = info;
  return (
    <LegalShell
      kicker="Legal · PQR"
      title="Peticiones, quejas y reclamos."
      lead="Si tienes una pregunta, una queja o quieres ejercer tus derechos sobre tus datos personales, este es el camino."
      legal={legal}
    >
      <h2>1. Cómo radicarla</h2>
      <p>
        Escribe a <V value={legal.email} fallback="correo de contacto" />
        {legal.phone ? (
          <>
            {" "}o llama al <V value={legal.phone} />
          </>
        ) : null}
        , dirigido a <V value={legal.privacyContact} fallback="área encargada" />, indicando:
      </p>
      <ul className="legal-list">
        <li>Tu nombre completo y un medio de contacto.</li>
        <li>Qué solicitas: consulta, actualización, corrección, supresión, revocatoria o queja.</li>
        <li>Si aplica, los documentos que soporten la solicitud.</li>
      </ul>
      <p>Te confirmamos que recibimos tu solicitud y te respondemos dentro de los plazos de ley.</p>

      <h2>2. Plazos</h2>
      <ul className="legal-list">
        <li>Consultas: hasta 10 días hábiles, prorrogables 5 días hábiles más con aviso.</li>
        <li>Reclamos: hasta 15 días hábiles, prorrogables 8 días hábiles más con aviso.</li>
      </ul>

      <h2>3. Atajo dentro de la aplicación</h2>
      <p>Si tienes cuenta, en Perfil puedes descargar todos tus datos y cerrar sesión en todos tus dispositivos sin esperar respuesta.</p>

      <h2>4. Si no quedas conforme</h2>
      <p>
        Puedes acudir a la Superintendencia de Industria y Comercio (SIC),{" "}
        <a href="https://www.sic.gov.co" target="_blank" rel="noopener noreferrer">
          www.sic.gov.co
        </a>
        , después de haber presentado tu solicitud ante nosotros.
      </p>

      <h2>5. Responsable</h2>
      <Responsible legal={legal} workshopName={info.workshopName} />
    </LegalShell>
  );
}
