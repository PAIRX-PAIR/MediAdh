import Link from "next/link";
import { buildPublicInfo } from "@/lib/server/services/sync";
import { LegalShell, Responsible } from "../legal-ui";

export const metadata = { title: "Términos de uso" };

export default async function Terms() {
  const info = await buildPublicInfo();
  return (
    <LegalShell
      kicker="Legal · Términos"
      title="Términos de uso."
      lead="Estas son las reglas para usar la aplicación del taller. Al crear tu cuenta o entrar, las aceptas. Si algo no está claro, pregúntale al coordinador antes de usarla."
      legal={info.legal}
    >
      <h2>1. Quiénes somos</h2>
      <Responsible legal={info.legal} workshopName={info.workshopName} />

      <h2>2. Para qué sirve</h2>
      <p>
        Es una herramienta interna para planear, asignar, verificar y medir el trabajo del taller: órdenes de trabajo, cotizaciones, tareas por puesto, solicitudes de material,
        cierres de día, avisos e indicadores. No es una tienda ni un servicio abierto al público.
      </p>

      <h2>3. Cuentas</h2>
      <ul className="legal-list">
        <li>Cada cuenta es personal e intransferible. No compartas tu contraseña; si sospechas que alguien la conoce, cámbiala y usa «Cerrar sesión en todos los dispositivos».</li>
        <li>Las cuentas nuevas quedan pendientes hasta que un administrador las aprueba y asigna un puesto con su contrato.</li>
        <li>Las tareas pertenecen al puesto, no a la persona: si un contrato termina, el puesto queda vacante con su trabajo y el acceso de esa persona se cierra.</li>
        <li>Los administradores pueden desactivar cuentas, restablecer contraseñas y ver el registro de auditoría.</li>
      </ul>

      <h2>4. Buen uso</h2>
      <ul className="legal-list">
        <li>Registra información veraz: horas, piezas hechas, bloqueos y novedades.</li>
        <li>No intentes acceder a funciones o datos que no corresponden a tu puesto, ni vulnerar la seguridad de la aplicación.</li>
        <li>Los datos de clientes y los planos son confidenciales: úsalos solo para el trabajo del taller.</li>
      </ul>

      <h2>5. Disponibilidad</h2>
      <p>
        Dependemos de proveedores externos (alojamiento, almacenamiento y servicios de notificaciones). Hacemos lo razonable para que la aplicación esté disponible, pero no
        podemos garantizarlo al 100 %. Los avisos en el celular son un apoyo: la información oficial es la que muestra la aplicación.
      </p>

      <h2>6. Propiedad</h2>
      <p>La información de producción, clientes, planos y cotizaciones es de la empresa. Los planos y fotos de clientes siguen siendo de sus dueños.</p>

      <h2>7. Datos personales</h2>
      <p>
        El tratamiento de tus datos se rige por la <Link href="/legal/datos">política de tratamiento de datos personales</Link>.
      </p>

      <h2>8. Cambios y ley aplicable</h2>
      <p>Podemos actualizar estos términos; la fecha de la versión vigente aparece arriba. Se rigen por las leyes de la República de Colombia.</p>
    </LegalShell>
  );
}
