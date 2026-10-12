import { buildPublicInfo } from "@/lib/server/services/sync";
import { LegalShell } from "../legal-ui";

export const metadata = { title: "Cookies y almacenamiento" };

export default async function Cookies() {
  const info = await buildPublicInfo();
  return (
    <LegalShell
      kicker="Legal · Cookies"
      title="Cookies y almacenamiento."
      lead="La aplicación guarda lo mínimo para funcionar. No usamos cookies de publicidad ni de analítica, por eso no te mostramos un banner de cookies."
      legal={info.legal}
    >
      <h2>1. Cookie de sesión (estrictamente necesaria)</h2>
      <ul className="legal-list">
        <li>
          <strong>Nombre:</strong> __Host-smi_session.
        </li>
        <li>
          <strong>Para qué:</strong> mantener tu sesión abierta hasta 30 días mientras uses la aplicación.
        </li>
        <li>
          <strong>Características:</strong> solo viaja por conexión segura, no es legible por código de la página (HttpOnly) y no se comparte con otros sitios.
        </li>
        <li>Sin ella no se puede entrar a la aplicación; por eso no requiere consentimiento adicional.</li>
      </ul>

      <h2>2. Almacenamiento del navegador y la app instalada</h2>
      <ul className="legal-list">
        <li>Una copia de la interfaz para abrir la aplicación más rápido y mostrar un aviso si no hay conexión (service worker).</li>
        <li>Si activas las notificaciones, tu navegador guarda el permiso y la suscripción a los avisos. Puedes desactivarlos desde tu Perfil o desde los ajustes del celular.</li>
        <li>Preferencias simples de la interfaz, como la última pestaña que usaste.</li>
      </ul>

      <h2>3. Terceros</h2>
      <p>
        No cargamos contenido de redes sociales, analítica ni publicidad. Las tipografías se sirven desde nuestro propio servidor. Si quieres borrar todo, cierra sesión y elimina
        los datos del sitio desde la configuración de tu navegador.
      </p>
    </LegalShell>
  );
}
