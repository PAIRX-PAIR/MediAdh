import Link from "next/link";
import { buildPublicInfo } from "@/lib/server/services/sync";
import { LegalShell, Responsible, V } from "../legal-ui";

export const metadata = { title: "Tratamiento de datos personales" };

export default async function DataPolicy() {
  const info = await buildPublicInfo();
  const { legal } = info;
  const company = legal.companyName || "la empresa";
  return (
    <LegalShell
      kicker="Legal · Datos personales"
      title="Política de tratamiento de datos personales."
      lead={
        <>
          {company} trata los datos de su equipo de trabajo y de los contactos de sus clientes con respeto y solo para operar el taller. Esta política cumple la Ley 1581 de 2012,
          el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015), el artículo 15 de la Constitución Política (habeas data) y la Ley 527 de 1999 sobre mensajes de datos.
        </>
      }
      legal={legal}
    >
      <h2>1. Responsable del tratamiento</h2>
      <Responsible legal={legal} workshopName={info.workshopName} />

      <h2>2. A quién aplica</h2>
      <ul className="legal-list">
        <li>Personas que trabajan en el taller y usan la aplicación (operarios, coordinadores y administradores), y quienes solicitan una cuenta.</li>
        <li>Personas de contacto de nuestros clientes y proveedores (nombre, teléfono, correo), registradas para cotizar, producir, entregar y facturar.</li>
      </ul>

      <h2>3. Qué datos tratamos</h2>
      <ul className="legal-list">
        <li>
          <strong>Identificación y contacto:</strong> nombre, usuario, celular y, si aplica, puesto solicitado y nota de registro.
        </li>
        <li>
          <strong>Datos laborales:</strong> puesto, fechas de inicio y fin de contrato, tareas asignadas y realizadas, horas reportadas, notas, cierres de día y solicitudes de
          material.
        </li>
        <li>
          <strong>Datos de seguridad:</strong> contraseña (guardada cifrada con un algoritmo de una sola vía; nadie puede leerla), intentos fallidos de acceso, fecha del último
          ingreso y registro de auditoría de acciones administrativas.
        </li>
        <li>
          <strong>Dispositivos para avisos:</strong> si activas las notificaciones, el identificador técnico que entrega tu navegador para enviarte avisos y el tipo de
          navegador.
        </li>
        <li>
          <strong>Clientes:</strong> nombre o razón social, NIT o cédula, teléfonos, persona de contacto, correo, ciudad, dirección e historial de trabajos.
        </li>
        <li>
          <strong>Fotos y planos</strong> de las piezas. No buscamos fotografiar personas; si una foto muestra a alguien por accidente, puede pedirse su eliminación.
        </li>
      </ul>
      <p>No pedimos datos sensibles (salud, creencias, orientación, biometría, etc.). Si alguien los escribe en una nota, no está obligado a hacerlo y pueden eliminarse.</p>

      <h2>4. Para qué los usamos (finalidades)</h2>
      <ul className="legal-list">
        <li>Dar acceso a la aplicación, verificar identidad y proteger las cuentas.</li>
        <li>Asignar, seguir y verificar el trabajo de cada puesto; organizar la producción y medir la gestión del taller.</li>
        <li>Enviar avisos de trabajo (en la app y, si lo autorizas, como notificaciones en el celular).</li>
        <li>Gestionar contratos laborales en lo relacionado con el acceso a la herramienta (un contrato vencido deja el puesto vacante).</li>
        <li>Cotizar, producir, entregar, atender garantías y facturar los trabajos de nuestros clientes.</li>
        <li>Cumplir obligaciones legales, contables y tributarias, y atender requerimientos de autoridades.</li>
      </ul>
      <p>No vendemos, alquilamos ni cedemos datos para publicidad. La aplicación no usa analítica ni publicidad de terceros.</p>

      <h2>5. Autorización</h2>
      <p>
        Al crear tu cuenta (o al entrar por primera vez a una cuenta creada por un administrador) marcas la casilla de autorización: eso es un consentimiento previo, expreso e
        informado (artículo 9 de la Ley 1581 de 2012) dado por un mensaje de datos válido según la Ley 527 de 1999. Guardamos la fecha y la versión de esta política que
        aceptaste como prueba. Cuando publicamos una nueva versión, te la mostramos de nuevo para que la aceptes.
      </p>
      <p>
        Los datos de contacto de clientes se tratan para ejecutar la relación comercial que el cliente solicita (cotización u orden de trabajo), conforme al artículo 10 de la
        Ley 1581 de 2012.
      </p>

      <h2>6. Tus derechos</h2>
      <ul className="legal-list">
        <li>Conocer, actualizar y rectificar tus datos.</li>
        <li>Pedir prueba de la autorización que diste.</li>
        <li>Saber qué uso les hemos dado.</li>
        <li>Revocar la autorización y pedir la supresión cuando no exista un deber legal o contractual de conservarlos.</li>
        <li>
          Acceder gratis a tus datos. En la aplicación, en <strong>Perfil → Exportar mis datos</strong>, descargas todo lo que guardamos sobre ti en un archivo.
        </li>
        <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC), después de haber hecho tu consulta o reclamo ante nosotros.</li>
      </ul>

      <h2>7. Cómo ejercer tus derechos y plazos</h2>
      <p>
        Escribe a <V value={legal.email} fallback="correo de contacto" /> o por el canal indicado en la página de{" "}
        <Link href="/legal/pqr">peticiones, quejas y reclamos</Link>, con tu nombre, un medio de contacto, lo que solicitas y, si aplica, los documentos que lo soporten.
      </p>
      <ul className="legal-list">
        <li>
          <strong>Consultas:</strong> respondemos en máximo 10 días hábiles. Si no alcanzamos, te avisamos el motivo y respondemos dentro de los 5 días hábiles siguientes.
        </li>
        <li>
          <strong>Reclamos</strong> (corregir, actualizar, suprimir o revocar): respondemos en máximo 15 días hábiles. Si no alcanzamos, te avisamos y respondemos dentro de
          los 8 días hábiles siguientes. Si falta información, la pedimos en los 5 días siguientes; si no llega en 2 meses, entendemos que desististe.
        </li>
      </ul>

      <h2>8. Con quién compartimos datos (encargados)</h2>
      <p>Para operar la aplicación usamos proveedores tecnológicos que guardan o transportan datos por cuenta nuestra, algunos fuera de Colombia:</p>
      <ul className="legal-list">
        <li>
          <strong>Vercel Inc.</strong> (Estados Unidos): alojamiento y ejecución de la aplicación.
        </li>
        <li>
          <strong>GitHub, Inc. / Microsoft</strong> (Estados Unidos): almacenamiento cifrado en tránsito de la base de datos en un repositorio privado.
        </li>
        <li>
          <strong>Servicios de notificaciones del navegador</strong> (Google Firebase Cloud Messaging, Apple Push Notification service, Mozilla, Microsoft): solo si activas
          los avisos; reciben el texto del aviso para entregarlo a tu dispositivo.
        </li>
      </ul>
      <p>
        Estas transmisiones se hacen para cumplir las finalidades de esta política, con proveedores que ofrecen medidas de seguridad adecuadas, conforme a los artículos 25 y 26
        de la Ley 1581 de 2012 y sus normas reglamentarias. Las tipografías de la aplicación se sirven desde nuestro propio servidor: tu navegador no se conecta a Google Fonts.
        También entregaremos datos a autoridades cuando una ley o una orden judicial lo exija.
      </p>

      <h2>9. Cuánto tiempo los guardamos</h2>
      <ul className="legal-list">
        <li>Cuentas y datos laborales: mientras exista la relación laboral y, después, el tiempo que exijan las normas laborales, contables y tributarias.</li>
        <li>Avisos: se conservan los 400 más recientes. Cierres de día: 400 días. Tareas terminadas en la vista diaria: 120 días.</li>
        <li>Órdenes de trabajo, cotizaciones y clientes: forman el histórico de producción y se conservan mientras sean necesarios para garantías, contabilidad y estadística.</li>
        <li>Registro de auditoría: archivos mensuales con las acciones administrativas.</li>
      </ul>

      <h2>10. Seguridad</h2>
      <p>
        Acceso solo con cuenta aprobada por un administrador, contraseñas largas cifradas, bloqueo automático ante intentos repetidos, sesiones que se pueden cerrar en todos los
        dispositivos, conexión cifrada (https), protecciones contra falsificación de solicitudes y un repositorio de datos privado. Ningún sistema es infalible: si ocurre un
        incidente que afecte datos personales, lo informaremos a los afectados y a la SIC cuando la ley lo exija.
      </p>

      <h2>11. Menores de edad</h2>
      <p>La aplicación es para personas mayores de edad vinculadas al taller. No recogemos a sabiendas datos de niños, niñas o adolescentes.</p>

      <h2>12. Registro Nacional de Bases de Datos</h2>
      <p>
        Si la empresa está obligada por su tamaño (Decreto 090 de 2018), registra sus bases de datos ante la SIC. La razón social y el NIT se configuran en la aplicación por el
        administrador.
      </p>

      <h2>13. Cambios a esta política</h2>
      <p>Si cambia de forma importante, publicamos la nueva versión con su fecha y la aplicación te pedirá aceptarla la próxima vez que entres.</p>
    </LegalShell>
  );
}
