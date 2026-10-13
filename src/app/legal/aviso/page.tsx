import { buildPublicInfo } from "@/lib/server/services/sync";
import { LegalShell, Responsible } from "../legal-ui";

export const metadata = { title: "Aviso legal" };

export default async function Notice() {
  const info = await buildPublicInfo();
  return (
    <LegalShell
      kicker="Legal · Aviso legal"
      title="Aviso legal."
      lead="Información sobre el titular de esta aplicación y las condiciones básicas de acceso."
      legal={info.legal}
    >
      <h2>1. Titular</h2>
      <Responsible legal={info.legal} workshopName={info.workshopName} />

      <h2>2. Objeto</h2>
      <p>
        «{info.workshopName}» es la herramienta de gestión de producción de la empresa: fabricación y reparación de piezas para la industria y el agro. El acceso está
        restringido a personas autorizadas por la empresa.
      </p>

      <h2>3. Contenido y responsabilidad</h2>
      <p>
        La información que se muestra se registra por el equipo del taller. La empresa procura que sea exacta y actualizada, y corrige los errores que se le reporten por los
        canales de PQR.
      </p>

      <h2>4. Propiedad intelectual</h2>
      <p>
        La marca, los textos y el diseño de la aplicación pertenecen a sus titulares. Los planos, fotos y documentos de clientes se usan solo para ejecutar sus trabajos.
      </p>

      <h2>5. Ley aplicable</h2>
      <p>Este aviso se rige por las leyes de la República de Colombia.</p>
    </LegalShell>
  );
}
