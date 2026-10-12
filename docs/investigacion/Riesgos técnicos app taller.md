# Cómo domar los cuatro riesgos técnicos del taller

Los cuatro frentes son viables para unos 10 operarios en celulares, pero cada uno exige una disciplina concreta y el diseño falla si se descuida cualquiera de ellas. **GitHub como base de datos aguanta con holgura.** Un token fine-grained da 5.000 peticiones por hora, y las lecturas condicionales autenticadas que devuelven `304` no consumen ese cupo. Para que funcione hay tres condiciones: los sondeos de los celulares nunca se reenvían 1:1 a GitHub, toda escritura de varios archivos sale como un único commit vía Git Data API con `force: false` y reintento ante `422`, y la app asume consistencia eventual en las lecturas. **En Android, Web Push funciona en cualquier pestaña de Chrome.** En iPhone, en octubre de 2026 sigue exigiendo que la app esté agregada a la pantalla de inicio (iOS 16.4 en adelante), así que el push debe tratarse como un despertador y no como fuente de verdad. `web-push` 3.6.7 no publica una versión nueva desde enero de 2024, pero sigue funcionando en el runtime Node de Vercel. **En Next.js 16, `proxy.ts` solo sirve para redirecciones optimistas.** Cada Server Action, Route Handler y lectura de datos debe volver a verificar sesión, aprobación y rol. Los Route Handlers no traen protección CSRF. Además, scrypt con los parámetros de OWASP lanza error si no se sube `maxmem`; es mejor usar el `crypto.argon2` nativo de Node 24. **El hero 3D con R3F 9.8.1 y drei 10.7.9 agrega unos 240 KB gzip.** Debe cargarse diferido, con `frameloop="demand"`, DPR máximo de 1,5 y sin `MeshReflectorMaterial` en celulares. El hallazgo transversal más importante es que, con GitHub como base de datos, cada contador de intentos fallidos, cada registro y cada suscripción push se vuelve un commit. Un atacante que dispare escrituras puede agotar el cupo de creación de contenido (unas 80 por minuto y 500 por hora) y bloquear las órdenes de trabajo legítimas. Por eso el rate limiting debe ocurrir antes de tocar GitHub.

## GitHub aguanta la carga si los celulares nunca le hablan directo

Un token de acceso personal fine-grained (PAT) consume el presupuesto personal del usuario: **5.000 peticiones por hora**, compartidas con cualquier otro token o app que actúe en su nombre. La cifra de 15.000 por hora solo aplica a apps aprobadas por organizaciones de GitHub Enterprise Cloud, nunca a PATs ([GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-authenticated-users)). Lo que hace viable el diseño es otra cosa: **una petición GET condicional (`If-None-Match`) que devuelve `304 Not Modified` no descuenta del límite primario, siempre que lleve cabecera `Authorization`** ([GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests)). Una medición comunitaria confirma que el mismo 304 sin autenticar sí descuenta ([DEV Community](https://dev.to/0012303/github-api-rate-limits-an-unauthenticated-304-still-costs-you-a-request-3af7)).

La aritmética muestra por qué importa. Diez operarios sondeando cada 15 segundos generan 2.400 peticiones por hora. Si cada sondeo leyera tres archivos sin condicionales, serían 7.200, por encima del límite. La regla es que **el servidor agrupa los sondeos**: atiende a los celulares desde una caché en memoria con TTL corto y revalida contra GitHub como máximo cada pocos segundos, sin importar cuántos clientes pregunten.

En Git lo único mutable es la referencia de la rama. Blobs, árboles y commits se identifican por SHA y pueden guardarse en caché para siempre. Basta entonces con revalidar `GET /git/ref/heads/main` con ETag y leer todo lo demás por SHA. Ojo: el ETag de la Contents API es un ETag HTTP débil y **no** el SHA del blob, una confusión que causó un bug en el propio servidor MCP de GitHub ([github-mcp-server#2133](https://github.com/github/github-mcp-server/issues/2133)). Sin Redis, cada instancia de Vercel mantiene su propia caché y la pierde en cada arranque en frío. A esta escala eso solo cuesta unas cuantas revalidaciones extra. Las cabeceras `x-ratelimit-*` son la fuente autoritativa, pero pueden variar de una respuesta a otra porque GitHub procesa la API en varias regiones. GitHub pide no escribir lógica que dependa del conteo exacto ([GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#checking-the-status-of-your-rate-limit)).

Los límites secundarios son los que de verdad acotan las escrituras. GitHub publica los siguientes ([GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits)) y además recomienda **no más de 6 pushes por minuto por repositorio** ([Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits#activity)):

| Límite publicado | Valor | Consumo estimado del taller |
|---|---|---|
| Primario (PAT) | 5.000 req/h | Holgado si los sondeos se agrupan y revalidan con 304 |
| Concurrencia | 100 peticiones simultáneas (REST + GraphQL) | Una escritura en curso por repositorio |
| Puntos por endpoint | 900/min; GET = 1, POST/PATCH/PUT/DELETE = 5 | Un commit atómico ≈ 15 puntos |
| Creación de contenido | ~80/min y ~500/h | 3 escrituras por commit; 75 commits en la hora pico ≈ 225 |
| Pushes por repositorio (recomendación) | 6/min | Apuntar a ≤ 1 commit cada ~10 s sostenido |

GitHub no publica qué endpoints cuentan como "generadores de contenido" ni el costo en puntos de los endpoints de Git Data. Lo prudente es asumir que crear árboles, crear commits y actualizar referencias cuentan. Que una actualización de referencia por API equivalga a un push es una inferencia de esta investigación, no algo que GitHub afirme.

Los errores secundarios llegan como `403` o `429` incluso con `x-ratelimit-remaining` alto; se han reportado con 4946 de 5000 disponibles ([community #32120](https://github.com/orgs/community/discussions/32120)). El protocolo oficial es este: esperar lo que indique `retry-after`; si el restante es 0, esperar hasta `x-ratelimit-reset`; y si no, esperar al menos 60 segundos con backoff exponencial y un tope de reintentos. Seguir insistiendo con límite activo "puede resultar en el baneo de su integración" ([GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#exceeding-the-rate-limit)). Como 60 segundos exceden cualquier petición razonable, la función debe responder al celular con un estado "pendiente" en lugar de dormir.

### El commit atómico funciona como compare-and-swap

Para escribir varios archivos de una vez, la secuencia tiene cinco pasos ([Create a tree](https://docs.github.com/en/rest/git/trees#create-a-tree); [Update a reference](https://docs.github.com/en/rest/git/refs#update-a-reference)):

1. Leer la referencia: `GET /git/ref/heads/main` devuelve el commit C0.
2. Leer ese commit para obtener su árbol T0.
3. Crear un árbol nuevo con `base_tree: T0`, con el `content` de cada archivo en la misma petición y `sha: null` para los que se borran.
4. Crear el commit con `parents: [C0]`.
5. Mover la referencia con `PATCH /git/refs/heads/main` y `force: false`.

Con `force: false`, GitHub solo acepta un avance fast-forward. Si otro escritor movió la rama entretanto, el PATCH falla con **`422` y el mensaje "Update is not a fast forward"** ([prose#148](https://github.com/prose/prose/issues/148); [octokit discussion #2240](https://github.com/octokit/octokit.js/discussions/2240)), y no se pierde ningún dato. El conflicto es de rama entera: cualquier commit concurrente lo provoca, aunque toque otro archivo. Por eso el reintento debe releer la referencia y **volver a aplicar la mutación lógica** ("agregar nota a la OT-1234") sobre datos frescos. No sirve reenviar el archivo completo calculado sobre la versión vieja. El `422` debe detectarse por código y no por texto, porque el mensaje exacto solo lo documenta la comunidad. `force: true` nunca: descarta en silencio las escrituras concurrentes.

Tres detalles evitan errores sutiles:

- El árbol base debe salir del mismo commit que se usa como padre, no de una lectura aparte por nombre de rama.
- Omitir `base_tree` marca como borrado todo lo que no se liste.
- **Un repositorio vacío no admite crear referencias**, así que hay que inicializarlo con un commit ([Create a reference](https://docs.github.com/en/rest/git/refs#create-a-reference)).

La alternativa `PUT /contents/{path}` también es segura ante carreras: devuelve `409` si el `sha` está desactualizado y `422` si falta ([PyGithub#1815](https://github.com/PyGithub/PyGithub/issues/1815)). Pero genera **un commit por archivo**, y GitHub exige ejecutarla en serie ([Create or update file contents](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)). Solo sirve cuando una operación toca exactamente un archivo. Las escrituras no admiten `If-Match` ([GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests)), así que `force: false` es el único mecanismo de concurrencia optimista para varios archivos.

No hay límite documentado para el `content` enviado dentro de un árbol. Mantener cada JSON **por debajo de 1 MB** respeta dos umbrales: el punto donde `GET /contents` deja de devolver el contenido completo ([Get repository content](https://docs.github.com/en/rest/repos/contents#get-repository-content)) y el tamaño de objeto que GitHub recomienda ([Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits#activity)).

### Leer lo recién escrito exige memoria propia, no GitHub

GitHub no publica ninguna garantía de leer lo recién escrito. Un reporte del 15 de septiembre de 2026 documenta que `GET /contents` puede devolver el contenido anterior durante algunos segundos después de una escritura. Su solución fue usar el documento que devuelve la propia escritura en vez de releerlo ([classroom50#1004](https://github.com/foundation50/classroom50/issues/1004)). `raw.githubusercontent.com` es peor: en esta investigación respondió con `cache-control: max-age=300` detrás de una caché Varnish ([prueba](https://raw.githubusercontent.com/octocat/Hello-World/master/README)). Eso significa hasta cinco minutos de datos viejos, y en repos privados obliga a usar URLs con token. **Nunca debe usarse para los datos de la app.**

El diseño correcto tiene tres piezas:

- **Escribir también en la caché.** Tras un PATCH exitoso, la función guarda `{headSha, datos}` en memoria y devuelve el estado nuevo en la respuesta de la mutación. Así el celular lo muestra sin esperar el siguiente sondeo.
- **No retroceder nunca.** Servidor y cliente recuerdan el SHA más nuevo que conocen y descartan cualquier respuesta cuyo SHA sea un ancestro de ese. La interfaz nunca retrocede, aunque otra instancia de Vercel sirva datos de hace unos segundos.
- **Leer por SHA.** Una vez conocido el commit, el árbol y los blobs son inmutables y no pueden estar desactualizados.

Leer una referencia desactualizada en el camino de escritura es inofensivo: el PATCH falla con `422` y se reintenta. En Next.js 16, las llamadas a GitHub deben saltarse las cachés del framework (`cache: 'no-store'`) y la revalidación por ETag hay que implementarla a mano. Esto último es una inferencia, porque no se investigaron los valores por defecto de caché de Next 16.

### Token mínimo, políticas y techo de crecimiento

El token adecuado es un PAT fine-grained con acceso **solo al repositorio de datos** y el permiso **Contents: Read and write**, que cubre todos los endpoints de Git Data y Contents usados ([Permisos de PATs fine-grained](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)).

- **Expiración y repos de organización.** La expiración va de 1 a 366 días, o ninguna. Si el repositorio es de una organización, por defecto el token queda **pendiente hasta que lo apruebe un owner**. Mientras tanto solo lee recursos públicos, lo que se ve como errores 404, y su vida máxima es de 366 días ([Política de PATs de organización](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/setting-a-personal-access-token-policy-for-your-organization#enforcing-an-approval-policy-for-fine-grained-personal-access-tokens)).
- **Revocación por inactividad.** GitHub revoca automáticamente cualquier token que lleve un año sin usarse ([Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation)).
- **Un solo token.** Los términos prohíben compartir tokens para superar los límites de tasa ([ToS §H](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms)), así que no se pueden crear varios para multiplicar el cupo.
- **Versión de API fija.** Conviene fijar `X-GitHub-Api-Version`: ya existe la versión `2026-03-10` junto a `2022-11-28`, y sus cambios incompatibles no se revisaron ([Contents API 2026-03-10](https://docs.github.com/en/rest/repos/contents?apiVersion=2026-03-10)).

Ninguna política prohíbe usar un repositorio como base de datos. Sin embargo, las Políticas de Uso Aceptable vetan la "actividad automatizada masiva excesiva" ([AUP](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies)). La guía de repositorios pide guardar "archivos generados programáticamente fuera de Git" y mantener los directorios por debajo de 3.000 entradas ([Repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)), y recomienda repos de menos de 1 GB ([About large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)). Con 100 a 300 commits diarios, el taller está lejos de esos umbrales. El riesgo de largo plazo es el crecimiento del historial. Se mitiga con muchos archivos pequeños por entidad (una OT por archivo, nunca un JSON monolítico) y con directorios de menos de 1.000 entradas, el tope de listado de la Contents API.

## En iPhone, sin ícono en la pantalla de inicio no hay notificaciones

En octubre de 2026, iOS y iPadOS soportan Web Push desde la versión 16.4, pero **solo en web apps agregadas a la pantalla de inicio**. No pueden suscribirse ni una pestaña normal de Safari, ni un WKWebView, ni el navegador interno de WhatsApp ([Apple Developer](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)). Los datos de compatibilidad de MDN publicados el 8 de octubre de 2026, que ya listan Safari/iOS 27 como versión actual, conservan esa nota en todas las entradas de push de iOS. Agregan que la interfaz `Notification` no existe salvo en una web app guardada en inicio **cuyo manifiesto tenga un `display` distinto del predeterminado** ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json)). No hay señales de cambio en iOS 27, aunque no se pudieron consultar las notas de versión de Apple.

Dos cambios recientes confirman que la plataforma es estable:

- **iOS 26** hizo que "Agregar a inicio" abra cualquier sitio como web app por defecto ([heise](https://heise.de/-10749652)).
- **Unión Europea:** en 2024 Apple revirtió su plan de eliminar allí las web apps de inicio ([9to5Mac](https://9to5mac.com/2024/03/01/apple-home-screen-web-apps-ios-17-eu/)).

No hace falta pertenecer al Apple Developer Program. Dos reglas de Apple son innegociables ([Apple Developer](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)):

- **El permiso se pide desde un gesto.** La suscripción se llama **de inmediato** en el manejador del toque, porque un `await fetch()` previo puede consumir la activación del usuario.
- **Cada push debe mostrar una notificación visible, o Safari revoca el permiso.** No existen los pushes silenciosos.

En la práctica, el onboarding del taller debe detectar el modo standalone (`display-mode: standalone` o `navigator.standalone`). En un iPhone dentro de Safari debe enseñar "Compartir → Agregar a pantalla de inicio" en vez de mostrar un botón de notificaciones que fallaría.

Android es más sencillo. Chrome soporta push en una pestaña normal desde la versión 42, sin instalación, aunque las notificaciones solo pueden mostrarse desde el service worker porque `new Notification()` lanza error. Android WebView no soporta push ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json)). Aun así, conviene pedir la instalación también en Android: desde octubre de 2025, Chrome revoca automáticamente el permiso de los sitios con poca interacción y muchas notificaciones, y **esa revocación no aplica a las web apps instaladas** ([Google](https://blog.google/chromium/automatic-notification-permission/)). Un "Bloquear" es prácticamente permanente, porque el sitio no puede volver a preguntar. De ahí el patrón de doble permiso: primero una tarjeta propia ("Activar alertas de trabajos nuevos"), y solo el toque en "Activar" abre el diálogo del navegador ([web.dev](https://web.dev/articles/push-notifications-permissions-ux)). El evento `pushsubscriptionchange` llegó a Chrome apenas en la versión 138 y no existe en iOS ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/ServiceWorkerGlobalScope.json)). Por eso la app debe leer `getSubscription()` en cada apertura y volver a sincronizar la suscripción con el servidor.

### web-push funciona, pero sus valores por defecto no sirven para alertas

La librería `web-push` sigue en **3.6.7, publicada el 16 de enero de 2024**, sin versiones posteriores ([npm](https://www.npmjs.com/package/web-push)). Usa `https.request` y `crypto.createECDH` de Node, así que **requiere el runtime Node.js** ([código fuente](https://github.com/web-push-libs/web-push/blob/master/src/web-push-lib.js)). Sus valores por defecto no sirven para un taller: el TTL es de 28 días, **no hay timeout de socket salvo que se pase `timeout`**, y no valida el tamaño del payload.

Apple impone sus propios límites ([Apple Developer](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)):

- Rechaza payloads de más de **4 KB** (`PayloadTooLarge`).
- Responde `410` cuando el token expiró.
- Guarda los mensajes pendientes como máximo 30 días.
- Solo entrega de inmediato con urgencia `high`.

Las claves VAPID también tienen trampas. El `subject` debe ser un `mailto:` o `https:` real, porque Apple responde **403 BadJwtToken** a sujetos como `mailto:user@localhost` ([web-push README](https://github.com/web-push-libs/web-push)). Las claves se generan una sola vez y no se rotan: cambiarlas invalida todas las suscripciones (`VapidPkHashMismatch`).

Una configuración razonable es `{ TTL: 3600, urgency: 'high', topic: 'ot-1234', timeout: 10000 }`, con un payload JSON de menos de ~3 KB que lleve solo título, cuerpo e identificador. El `topic` (máximo 32 caracteres) hace que una actualización reemplace a la anterior si esta aún no se entregó. Las suscripciones que responden **404 o 410 se borran**; las que fallan con 403, 413 o 429 se registran pero no se borran ([web.dev](https://web.dev/articles/sending-messages-with-web-push-libraries)).

En Vercel, la función puede congelarse apenas devuelve la respuesta. Hay que esperar todos los envíos con `Promise.allSettled`, o entregarlos a `after()`/`waitUntil`, sabiendo que comparten el timeout de la función ([Vercel](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)). Queda una incógnita menor: Apple pide no renovar el JWT más de una vez por hora, y `web-push` firma uno por petición. No se encontraron reportes de fallas por esa razón.

Para iPhone, **Declarative Web Push** (iOS 18.4 y Safari 18.5 en macOS) es una mejora de robustez barata. Es un JSON con la clave `"web_push": 8030` que el sistema muestra **sin ejecutar JavaScript del service worker**, con un campo `navigate` que define la URL que se abre al tocar la notificación ([WebKit](https://webkit.org/blog/16535/meet-declarative-web-push/); [WWDC25](https://developer.apple.com/videos/play/wwdc2025/235/)). Chrome no lo implementa. Aun así, el mismo payload enviado con `web-push` funciona en todas partes si el handler `push` del service worker lo interpreta y llama a `showNotification` dentro de `event.waitUntil`. Esto pesa porque MDN marca `notificationclick` como **no soportado en iOS** ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Clients.json)). Eso contradice la práctica común y obliga a probar en un dispositivo real; el `navigate` declarativo es la ruta confiable. La ubicación de `app_badge` (en el nivel superior o dentro de `notification`) cambió entre versiones de WebKit y también debe verificarse en un iPhone.

### El push despierta; el servidor es el buzón

Hay que ajustar las expectativas de sonido desde ya: **ninguna plataforma permite un tono personalizado en notificaciones web**. iOS usa el sonido del sistema ([OneSignal](https://documentation.onesignal.com/docs/notification-sounds); [Apple Developer Forums](https://developer.apple.com/forums/thread/728022)). La vibración solo existe en Chrome para Android, e iOS ignora `actions`, `image`, `requireInteraction` y `tag` ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json)). Un sonido de alerta dentro de la app solo funciona con la app en primer plano, y después de desbloquear un `AudioContext` con un toque explícito.

Por todo esto, el push es un despertador y **el servidor es el buzón**. Los avisos se guardan por operario. La app sincroniza al abrir, en los eventos `visibilitychange`, `pageshow` y `focus`, y sondea cada ~30 s solo mientras está visible. Hay que escuchar también `pagehide`, porque Safari no dispara `visibilitychange` al navegar fuera del documento ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/Document.json)). Para eventos críticos que sigan sin leerse después de N minutos, se reenvía el push con el mismo `topic` o se escala a una persona. Una pantalla de estado por dispositivo ("activas / bloqueadas / iPhone sin instalar") y un botón de notificación de prueba convierten las fallas silenciosas en algo visible para el administrador. Desuscribirse no siempre produce un `410` inmediato ([WebKit Bugzilla 249766](https://bugs.webkit.org/show_bug.cgi?id=249766)), así que conviene podar además las suscripciones de dispositivos que llevan semanas sin abrir la app.

## proxy.ts solo redirige; la seguridad vive junto a los datos

Next.js 16 renombró `middleware.ts` a **`proxy.ts`** (función `proxy`). Siempre corre en Node.js: no admite el runtime Edge, y declarar `runtime` lanza error ([Guía de actualización a v16](https://nextjs.org/docs/app/guides/upgrading/version-16); [Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)). `cookies()`, `headers()`, `params` y `searchParams` ahora son **solo asíncronos**. Las cookies únicamente pueden escribirse en Server Actions o Route Handlers, nunca durante el render de un Server Component ([cookies()](https://nextjs.org/docs/app/api-reference/functions/cookies)).

La guía oficial es tajante: el proxy solo hace verificaciones **optimistas** con la cookie, como validar firma y expiración del JWT o redirigir a `/login`. Corre en todas las rutas, incluidas las precargas, y "no debería ser su única línea de defensa" ([Autenticación](https://nextjs.org/docs/app/guides/authentication)). La verificación segura vive en una capa de acceso a datos (DAL) marcada como `server-only`, con un `verifySession()` que se invoca en cada página protegida, cada Server Action y cada Route Handler. Ese `verifySession()` relee el registro del usuario y confirma estado aprobado, rol y versión de sesión.

La documentación señala tres trampas ([Data Security](https://nextjs.org/docs/app/guides/data-security)):

- El `cache()` de React no deduplica nada en Server Actions ni en Route Handlers, porque no forman parte de un render.
- Los layouts no se vuelven a renderizar al navegar, así que un chequeo hecho en un layout no protege nada.
- Las Server Actions son alcanzables con un POST directo y deben tratarse como endpoints públicos.

El propio ejemplo de matcher de la guía excluye `/api`, de modo que los Route Handlers quedan fuera del proxy y deben defenderse solos. La documentación del proxy advierte además que no debe depender de variables globales, lo que descarta poner ahí contadores de rate limiting en memoria. El CVE-2025-29927, que permitía saltarse el middleware con la cabecera `x-middleware-subrequest`, ya está corregido y no afectó a Vercel ([Censys](https://censys.com/cve-2025-29927)). Sigue siendo el ejemplo clásico de por qué el proxy no puede ser la única puerta.

### Los Route Handlers no traen CSRF y necesitan un guardián propio

Las Server Actions sí traen una defensa CSRF integrada: solo aceptan POST y comparan `Origin` con `Host` o `X-Forwarded-Host`. Pero **una petición sin cabecera `Origin` pasa con una simple advertencia** ([serverActions](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)). Los Route Handlers no tienen ningún mecanismo ([Route Handler](https://nextjs.org/docs/app/api-reference/file-conventions/route)).

OWASP recomienda tres cosas ([OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)):

- Rechazar los métodos no seguros que lleguen con `Sec-Fetch-Site: cross-site`.
- Verificar `Origin` o `Referer` como respaldo obligatorio.
- Rechazar los content types "simples": `form-urlencoded`, `multipart` y `text/plain`.

En concreto, todo POST, PUT, PATCH o DELETE (login, registro, logout, aprobaciones) pasa por un guardián compartido que hace tres chequeos:

1. Rechaza si `Sec-Fetch-Site` existe y no es `same-origin`.
2. Exige que `Origin` sea igual al origen del despliegue.
3. Exige `Content-Type: application/json`.

`SameSite=Lax` no protege una mutación hecha por GET, así que el logout tiene que ser POST. Y como `*.vercel.app` es un dominio compartido con otros clientes de Vercel, lo robusto es usar un dominio propio.

### Sesiones JWT con jose: exigir `exp` explícitamente

Para las sesiones, la guía de Next.js propone `jose` con **HS256**, un secreto aleatorio de 32 bytes (`openssl rand -base64 32`) en una variable de entorno y un payload mínimo: identificador y rol, sin datos personales ([Autenticación](https://nextjs.org/docs/app/guides/authentication)). OWASP exige que el secreto tenga al menos el tamaño de la salida del hash y prohíbe usar frases de paso ([OWASP JWT](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html)).

El detalle que suele pasarse por alto: **`jose` (versión 6.2.12) solo valida `exp` si el claim está presente** ([jose src](https://github.com/panva/jose/blob/main/src/lib/jwt_claims_set.ts)). La verificación debe exigirlo explícitamente: `jwtVerify(token, key, { algorithms: ['HS256'], issuer, audience, requiredClaims: ['exp', 'iat', 'sub', 'sv'] })` ([JWTVerifyOptions](https://github.com/panva/jose/blob/main/docs/jwt/verify/interfaces/JWTVerifyOptions.md)). La cookie lleva el prefijo `__Host-` y los atributos `HttpOnly; Secure; SameSite=Lax; Path=/`, sin `Domain` ([OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)).

Un JWT sin estado no se puede revocar, y borrar la cookie no invalida una copia robada. Por eso el DAL compara el claim `sv` (versión de sesión) con la `session_version` guardada en el registro del usuario. Subir ese número al cambiar contraseña, rol o estado, o al expulsar a alguien, revoca todas sus sesiones de una vez. El token se emite de nuevo en el login y en cada cambio de privilegio, con un tope absoluto de vida: por ejemplo 7 días, y menos para administradores.

### Argon2id nativo en Node 24 le gana a scrypt

OWASP prefiere **Argon2id** y deja scrypt como alternativa ([OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)). El problema práctico con scrypt en Node es que los parámetros de OWASP **lanzan error con la configuración por defecto**: Node limita `maxmem` a 32 MiB, y N=2^17 con r=8 necesita unos 128 MiB ([Node crypto.scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)).

| Opción | Parámetros mínimos OWASP | Memoria por hash | Cómo en Node |
|---|---|---|---|
| Argon2id (preferida) | m=19.456 KiB, t=2, p=1 | ~19 MiB | `crypto.argon2('argon2id', …)`, Node ≥ 24.7 |
| scrypt | N=2^17, r=8, p=1 | ~128 MiB | `crypto.scrypt` con `maxmem: 256 * 1024 * 1024` |
| scrypt de costo equivalente | N=2^16, r=8, p=2 | ~64 MiB | Igual, con `maxmem` elevado |

Node 24.x es la versión por defecto en Vercel ([Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)), y `crypto.argon2` existe desde la 24.7.0 ([Node crypto.argon2](https://nodejs.org/api/crypto.html#cryptoargon2algorithm-parameters-callback)). Por eso **argon2id nativo es la mejor opción**: usa unas 6,7 veces menos memoria que scrypt y no requiere módulos nativos. Conviene fijar `engines.node: "24.x"`. No se pudo confirmar si esa API ya está marcada como estable.

Si se usa scrypt, el threadpool de libuv ejecuta hasta 4 hashes simultáneos ([UV_THREADPOOL_SIZE](https://nodejs.org/api/cli.html#uv_threadpool_sizesize)). Eso son unos 512 MiB de pico, que caben en los 2 GB de una función estándar ([Vercel memory](https://vercel.com/docs/functions/configuring-functions/memory)). Pero con 1 vCPU los hashes concurrentes se ejecutan uno tras otro, y el endpoint de login se vuelve un amplificador de ataques de denegación de servicio. Hay que **limitar la tasa antes de hashear** y rechazar contraseñas demasiado largas (más de 128 a 256 caracteres) antes del hash.

Dos detalles de implementación:

- La comparación usa `crypto.timingSafeEqual` sobre Buffers de igual longitud; si las longitudes difieren, lanza error ([timingSafeEqual](https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b)).
- El hash se guarda en un formato que describe sus parámetros (`argon2id$v=19$m=…$sal$hash`), para poder subirlos en el siguiente login exitoso.

No se encontró latencia medida en funciones de Vercel; hay que medirla en un despliegue de preview, apuntando a entre 0,5 y 1 s por hash.

La política de contraseñas de NIST SP 800-63B-4, ya en su versión final, establece ([NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html); [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)):

- **Mínimo 15 caracteres** cuando la contraseña es el único factor de autenticación.
- Permitir al menos 64 caracteres.
- Ninguna regla de composición y ninguna rotación periódica.
- Verificación obligatoria contra una lista de contraseñas comunes o filtradas.

Para operarios que escriben en un celular, eso se traduce en frases de tres o cuatro palabras, no en símbolos.

### Fuerza bruta sin Redis: WAF, contador por cuenta y respuestas uniformes

Los contadores en memoria por instancia no son confiables en serverless, así que la protección se arma en tres capas:

1. **Rate limiting del WAF de Vercel**, disponible en todos los planes. Hobby permite **una sola regla por proyecto**, de ventana fija (entre 10 s y 10 min), contada por IP o por huella JA4; Pro permite 40 ([Vercel WAF](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)). En Hobby, esa única regla debe cubrir el prefijo `/api/auth/` (login y registro), por ejemplo con 10 peticiones por minuto. Desde el código, `checkRateLimit()` de `@vercel/firewall` acepta un `rateLimitKey` como el nombre de usuario, lo que frena los ataques distribuidos contra una misma cuenta ([Vercel Rate Limiting SDK](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-sdk)). No se pudo confirmar si en Hobby eso consume la misma regla.
2. **Un contador de fallos asociado a la cuenta**, no a la IP, con bloqueo de duración exponencial ([OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)).
3. **Respuestas uniformes.** Usuario inexistente, contraseña errónea o cuenta bloqueada reciben el mismo mensaje y el mismo código HTTP. Para los usuarios inexistentes se calcula un hash ficticio, de modo que el tiempo de respuesta tampoco delate nada.

OWASP advierte que bloquear IPs nunca debe ser la defensa principal, porque los kits de credential stuffing rotan proxies ([OWASP Credential Stuffing](https://cheatsheetseries.owasp.org/cheatsheets/Credential_Stuffing_Prevention_Cheat_Sheet.html)). Vercel BotID (`checkBotId()`) es un refuerzo opcional para registro y login, siempre que el envío se haga por fetch o por Server Action y no como formulario HTML nativo ([Vercel BotID](https://vercel.com/docs/botid/form-submissions)).

### Ninguna cuenta pendiente recibe cookie

El autorregistro con aprobación es un endpoint de escritura sin autenticar y fácil de abusar. La regla central: **ninguna cuenta recibe cookie si su estado no es `approved`**.

El login primero verifica la contraseña (con hash ficticio si el usuario no existe) y solo después decide según el estado:

- `approved`: emite la sesión.
- `pending`: informa "pendiente de aprobación", sin cookie. Es aceptable porque solo lo ve quien ya conoce la contraseña.
- `rejected` o `disabled`: devuelve el error genérico.

`createSession()` vuelve a leer al usuario y lanza error si no está aprobado, y el DAL repite el chequeo en cada petición.

Las acciones de aprobar, rechazar o desactivar verifican el rol de administrador **desde el registro guardado, no desde el claim del JWT**. Además suben la `session_version` del afectado y dejan registro de auditoría. Ningún administrador puede aprobarse a sí mismo ni escalar roles por el mismo endpoint.

OWASP recomienda mensajes genéricos también en el registro ([OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)). Con nombres de usuario, sin embargo, la existencia de una cuenta se filtra inevitablemente al registrarse. Lo pragmático es aceptar esa fuga en el registro, limitar su tasa con fuerza y mantener el login totalmente genérico.

Contra el spam funcionan cuatro tácticas:

- Un campo trampa oculto.
- Un tiempo mínimo de llenado del formulario, firmado.
- Un tope global de registros pendientes, por ejemplo 200.
- Opcionalmente, un código de invitación del taller comparado con `timingSafeEqual` sobre digests SHA-256.

Son práctica estándar, aunque ninguna fuente cuantifica su efectividad. Los nombres de usuario se normalizan (NFKC, minúsculas, patrón `^[a-z0-9_.-]{3,32}$`). La consola de administración nunca usa `dangerouslySetInnerHTML`, porque los nombres pendientes son texto controlado por posibles atacantes.

### Cabeceras: CSP estática para la landing, sin X-XSS-Protection

Vercel ya fuerza HTTPS con un `308` que no se puede desactivar, y envía HSTS `max-age=63072000` en dominios propios ([Vercel Encryption](https://vercel.com/docs/cdn-security/encryption)). El resto de cabeceras va en `headers()` de `next.config.ts`.

La decisión sobre la CSP depende del modo de render. **Una CSP con nonce obliga a render dinámico**: desactiva la optimización estática y el ISR, y es incompatible con Partial Prerendering ([Next.js CSP](https://nextjs.org/docs/app/guides/content-security-policy)). Para una landing estática con hero 3D, el compromiso razonable es una CSP estática sin nonce, o probar `experimental.sri`, que se basa en hashes. En las rutas autenticadas, que ya son dinámicas porque leen cookies, se puede usar nonce en `script-src`. La política base:

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; worker-src 'self';
object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

`'unsafe-eval'` va solo en desarrollo, porque ni React ni Next lo usan en producción. `worker-src blob:` y `'wasm-unsafe-eval'` solo hacen falta si se cargan decodificadores Draco o KTX2 ([three.js forum](https://discourse.threejs.org/t/how-to-set-content-security-policy-for-usegltfs/51398)); con geometría procedural no se necesitan.

A la CSP se suman estas cabeceras ([OWASP HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)):

- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- Un `Permissions-Policy` restrictivo: `camera=(), microphone=(), geolocation=()`.
- `Cross-Origin-Opener-Policy: same-origin`.
- `Cache-Control: no-store` en las respuestas autenticadas.

Un error a evitar: el ejemplo de `vercel.json` de la propia Vercel incluye `X-XSS-Protection: 1; mode=block` ([Vercel](https://vercel.com/docs/project-configuration/vercel-json)). OWASP indica no enviar esa cabecera o ponerla en `0`, porque puede crear vulnerabilidades XSS en sitios que de otro modo serían seguros.

## El hero 3D debe ganarse cada fotograma en un celular

Las versiones vigentes al 12 de octubre de 2026 son `@react-three/fiber` 9.8.1, `@react-three/drei` 10.7.9 y `three` 0.186.1 ([npm fiber](https://registry.npmjs.org/@react-three/fiber/latest); [npm drei](https://registry.npmjs.org/@react-three/drei/latest)). Fiber 9.8.1 declara compatibilidad con `react >=19 <19.4`, pero las notas de la 9.8.0 admiten que React 19.3 solo tiene soporte parcial. La 9.8.1 además corrige un renderer que no se liberaba al desmontar el Canvas ([R3F releases](https://github.com/pmndrs/react-three-fiber/releases)). Una fuente secundaria reporta un CVE (CVE-2025-66478) que afecta a React 19.0.0–19.2.0 con el App Router de Next 15 y 16 ([Wazuh CTI](https://cti.wazuh.com/vulnerabilities/cves/CVE-2025-66478)). La combinación prudente es entonces **React 19.2.x parcheado (19.2.1 o superior) con fiber 9.8.1 o superior**, verificando que la versión de Next 16 elegida no exija React 19.3. R3F v10 sigue en alfa y marcado como experimental: no debe ir a producción en 2026.

El Canvas vive en un Client Component. `next/dynamic(..., { ssr: false })` solo funciona dentro de uno: en un Server Component produce error, y cuando un Server Component importa dinámicamente un Client Component no hay división automática del código ([Next.js Lazy Loading](https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/lazy-loading.mdx)). La migración a v9 trae dos sorpresas ([Guía de migración v9](https://github.com/pmndrs/react-three-fiber/blob/master/docs/tutorials/v9-migration-guide.mdx)):

- El `StrictMode` se hereda del root de React DOM, así que en desarrollo los efectos se ejecutan dos veces también dentro del Canvas.
- Desapareció la conversión automática de texturas a sRGB.

### Diferir el chunk de 240 KB vale más que recortarlo

El costo de descarga define la estrategia de carga. Una medición propia de esta investigación con esbuild (código minificado, gzip -9, paquetes del [registro de npm](https://registry.npmjs.org/)) dio estos resultados:

| Paquetes | gzip | Incremento |
|---|---|---|
| React + ReactDOM (base) | 59 KB | — |
| + three + R3F (Canvas mínimo) | 301 KB | ≈ +242 KB |
| + 8 helpers de drei | 327 KB | ≈ +26 KB |
| React + Motion (APIs de scroll) | 103 KB | ≈ +45 KB sobre la base |

three por sí solo pesa unos 727 KB minificado y, bajo R3F, prácticamente no se puede podar. drei sí se poda por import nombrado, porque declara `sideEffects: false` ([npm drei](https://www.npmjs.com/package/@react-three/drei)). Next compila con Turbopack, no con esbuild, así que las cifras deben volver a medirse con `next build`. La consecuencia: **la palanca no es recortar three sino diferir el chunk entero**.

Por suerte, `<canvas>` no es candidato a LCP ([web.dev LCP](https://github.com/GoogleChrome/web.dev/blob/main/src/site/content/en/metrics/lcp/index.md)). La secuencia de carga queda así:

1. **HTML del servidor.** El H1, el subtítulo y el CTA llegan en el HTML del servidor, sobre un fondo oscuro definido en CSS.
2. **Póster.** Si existe, es un `<img fetchpriority="high">` que no cubre todo el viewport, porque Chromium ignora para el LCP los elementos a pantalla completa y los de opacidad 0. Animar el H1 desde `opacity: 0` al cargar retrasa el LCP.
3. **Chunk 3D.** Se monta después de `load` o de `requestIdleCallback`, y solo tras comprobar soporte de WebGL, `prefers-reduced-motion`, `saveData` y la gama del dispositivo.
4. **Transición.** El póster se funde con el canvas después del primer fotograma.

Hay además una consecuencia que conecta con el push: el `start_url` del manifiesto debe apuntar al tablero de trabajo, no a la landing. Así la app instalada en los celulares de los operarios nunca descarga el hero.

### Renderizar solo cuando el scroll cambia

El bucle por defecto de R3F (`frameloop="always"`) renderiza a 60 fps sin pausa, y su documentación lo señala como lo que más agota la batería ([R3F Scaling performance](https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/scaling-performance.mdx)). Para un hero guiado por scroll, `frameloop="demand"` más una llamada a `invalidate()` en cada cambio del progreso de scroll renderiza solo cuando algo cambia. `invalidate()` es una bandera que pide un fotograma, no un render inmediato. Dentro de `useFrame`, la cámara se amortigua usando `delta` y se vuelve a invalidar mientras el valor no converja.

`requestAnimationFrame` solo se pausa en pestañas ocultas ([MDN rAF](https://github.com/mdn/content/blob/main/files/en-us/web/api/window/requestanimationframe/index.md)), no cuando el hero salió de la vista. Por eso un IntersectionObserver, o `useInView` de Motion, debe llevar el bucle a `'never'`. Los pitfalls de R3F dejan tres reglas de oro ([R3F Pitfalls](https://github.com/pmndrs/react-three-fiber/blob/master/docs/advanced/pitfalls.mdx)):

- No hacer `setState` dentro de `useFrame`.
- No crear objetos en cada fotograma: un `new Vector3` dentro de un `lerp` asigna memoria 60 veces por segundo y termina activando el recolector de basura.
- Preferir `visible` a montar y desmontar, porque cada material nuevo compila shaders.

La fuente del scroll debe ser el scroll nativo del documento, vía `useScroll` de Motion, leyendo `.get()` dentro de `useFrame`. `ScrollControls` de drei no sirve aquí, porque crea su propio contenedor de scroll delante del canvas ([drei ScrollControls](https://github.com/pmndrs/drei/blob/master/docs/controls/scroll-controls.mdx)). La versión actual de Motion es la **14.1.0 (9 de octubre de 2026)**, que corrige el reporte del overscroll elástico de iOS. Su aceleración por hardware vía ScrollTimeline/ViewTimeline solo aplica a `opacity`, `transform`, `clipPath`, `filter` y `backgroundColor` de elementos DOM, nunca a una escena WebGL. Sus internos de scroll cambiaron tres veces en dos semanas, entre la 13.4.4 y la 13.5.0 ([Motion CHANGELOG](https://github.com/motiondivision/motion/blob/main/CHANGELOG.md)), así que conviene fijarla en `~14.1.0`. Lenis aporta poco en celulares: deja nativo el scroll táctil por defecto, y en Safari queda limitado a 60 fps, o 30 en modo de bajo consumo ([Lenis README](https://github.com/darkroomengineering/lenis/blob/main/README.md)).

### Un look automotriz con efectos baratos

El look de "revelación automotriz" se logra en un celular cambiando cada efecto caro por un equivalente barato:

| Elemento | Configuración para celular | Razón |
|---|---|---|
| Resolución | `dpr={[1, 1.5]}` + `PerformanceMonitor` (baja a 1, sube a 2) | El valor por defecto de R3F es `[1, 2]` |
| Piso reflectante | `MeshReflectorMaterial` solo en gama alta; si no, material estándar brillante | Vuelve a renderizar toda la escena en cada fotograma, más el desenfoque |
| Iluminación | `Environment` con 3–5 `Lightformer` y `frames={1}` | Actúan como luces reales sin su costo |
| Sombras | `shadows={false}`; `ContactShadows frames={1}` o `BakeShadows` | Las sombras en tiempo real son caras |
| Draw calls | Pocos cientos; `Merged`/`Instances` para piezas repetidas | El máximo absoluto ronda 1.000 |
| Chispas de soldadura | Un `THREE.Points` o un `InstancedMesh` directo | Los componentes `<Instance>` agregan costo de CPU |
| Shaders | `<Preload all />` dentro del Suspense | Evita tirones al revelar máquinas |
| Mapa de entorno | Autoalojado (gainmap) o solo Lightformers | Los `preset` dependen de CDNs |

La pieza más cara es el piso reflectante. El código de `MeshReflectorMaterial` en drei 10.7.9 oculta su objeto padre y llama a `gl.render(scene, virtualCamera)` en cada fotograma, más una pasada de desenfoque si `blur` no es cero ([drei MeshReflectorMaterial](https://unpkg.com/@react-three/drei@10.7.9/core/MeshReflectorMaterial.js)). En cambio, un `Lightformer` "actúa como una luz real sin el costo; puede tener tantos como quiera" ([drei Lightformer](https://github.com/pmndrs/drei/blob/master/docs/staging/lightformer.mdx)). `PerformanceMonitor` promedia los fps y dispara `onDecline`/`onIncline` para escalar la calidad ([drei PerformanceMonitor](https://github.com/pmndrs/drei/blob/master/docs/performances/performance-monitor.mdx)). Los `preset` de `Environment` "no están pensados para producción", porque dependen de CDNs ([drei Environment](https://github.com/pmndrs/drei/blob/master/docs/staging/environment.mdx)). Un fondo de escena opaco con `gl={{ alpha: false }}` evita componer un canvas translúcido sobre la página. Esto es una inferencia, porque R3F trae `alpha: true` por defecto.

### iOS Safari: un solo Canvas y un póster de respaldo

iOS Safari es el objetivo más frágil. WebKit tiene reportes de pérdida súbita del contexto WebGL en iOS 18, tras la cual no se puede crear uno nuevo hasta reiniciar Safari ([WebKit 289601](https://bugs.webkit.org/show_bug.cgi?id=289601); [WebKit 290623](https://bugs.webkit.org/show_bug.cgi?id=290623)). También hay un caso de R3F que creaba contextos nuevos sin liberar los anteriores, hasta forzar recargas ([Apple Developer Forums](https://developer.apple.com/forums/tags/webxr?page=2)). three r186 ya intercepta `webglcontextlost`, deja de renderizar y se reinicializa cuando el contexto se restaura ([three WebGLRenderer](https://unpkg.com/three@0.186.1/src/renderers/WebGLRenderer.js)). R3F recomienda además un error boundary con un `fallback` visualmente equivalente a la escena ([R3F Canvas](https://github.com/pmndrs/react-three-fiber/blob/master/docs/API/canvas.mdx)).

La receta para iOS:

- **Un único Canvas** durante toda la vida de la página, nunca vuelto a montar por sección o por ruta.
- Texturas de 1 a 2K como máximo.
- Volver al póster si el contexto no se restaura en pocos segundos.
- Probar todo esto con `gl.forceContextLoss()`.

Las cifras de memoria máxima por pestaña que circulan (300 a 400 MB) no tienen respaldo de Apple.

La accesibilidad cierra el diseño. Una cámara que vuela con el scroll es exactamente el tipo de movimiento que MDN y web.dev señalan como detonante de trastornos vestibulares ([MDN](https://github.com/mdn/content/blob/main/files/en-us/web/css/reference/at-rules/@media/prefers-reduced-motion/index.md); [web.dev](https://github.com/GoogleChrome/web.dev/blob/main/src/site/content/en/blog/prefers-reduced-motion/index.md)), y WCAG 2.3.3 pide ofrecer una forma de desactivarlo ([W3C](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html)). Con `prefers-reduced-motion: reduce`, **el chunk 3D ni siquiera se descarga**: se muestra el póster con la misma composición, y se escucha el evento `change` por si el usuario cambia la preferencia. `MotionConfig reducedMotion="user"` solo afecta las animaciones de transformación de Motion sobre el DOM; no llega a una escena manejada desde `useFrame`, así que la capa 3D necesita su propio chequeo ([tipos de Motion](https://unpkg.com/framer-motion@14.1.0/dist/index.d.ts)). El canvas debe llevar `aria-hidden="true"` y no capturar gestos táctiles que bloqueen el scroll.

## Con GitHub como base, cada contador de seguridad se vuelve un commit

Las guías de seguridad dan por hecha una base de datos con incrementos atómicos y lecturas indexadas baratas en cada petición. Con un repositorio Git ninguna de las dos cosas es gratis, y eso cambia varias recomendaciones de las secciones anteriores.

**Revocación de sesiones.** El `verifySession()` del DAL debe leer estado, rol y `session_version` del usuario en cada petición protegida. Esa lectura tiene que salir de la caché del servidor revalidada por ETag, no de una llamada directa a GitHub. El precio es que, en las demás instancias, una revocación tarda en propagarse lo que dure el TTL de esa caché: unos segundos. Es aceptable para un taller, siempre que la instancia que escribe actualice su propia caché al instante.

**Escrituras que un atacante puede disparar.** Este es el punto más delicado: **toda escritura que un atacante pueda provocar consume el mismo cupo de creación de contenido que las órdenes de trabajo legítimas**, unas 80 por minuto y 500 por hora ([GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits)). Si cada intento fallido de login incrementa un contador guardado en el repo, con tres escrituras por commit, basta una treintena de intentos por minuto contra un usuario conocido para provocar errores secundarios y congelar las escrituras del taller. Esta inferencia asume que los endpoints de Git Data cuentan como creación de contenido, algo que GitHub no confirma ni descarta. En esta arquitectura, entonces:

- **El WAF es obligatorio.** El rate limiting del WAF deja de ser opcional y debe actuar antes de cualquier hash o escritura.
- **El contador de fallos se persiste solo al cruzar el umbral.** Un único commit fija `locked_until`; los intentos por debajo del umbral se cuentan en memoria como mejor esfuerzo.
- **El registro necesita tope de pendientes y regla de WAF**, porque cada solicitud es un commit.

**Push e inbox.** Lo mismo vale para el push. La sincronización de la suscripción en cada apertura debe comparar y escribir solo si cambiaron el endpoint o las claves, nunca actualizar un `last_seen_at` en cada apertura. Las suscripciones muertas que aparezcan en un envío se borran en un único commit, y las marcas de "leído" del buzón se agrupan.

**Hashes en el historial.** Los hashes de contraseña quedan en un repositorio que cualquier colaborador puede clonar, y **el historial de Git conserva cada hash antiguo** incluso después de un cambio de contraseña. Eso eleva la importancia de parámetros fuertes y justifica el pepper que OWASP describe como defensa en profundidad guardada fuera de la base de datos ([OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)). Guardado en una variable de entorno de Vercel, impide que un clon filtrado permita descifrar contraseñas offline; a cambio, rotarlo obliga a restablecer todas las contraseñas.

**Auditoría gratis.** En sentido contrario, el historial es un regalo: cada aprobación, rechazo o cambio de rol queda como un commit con fecha y mensaje. Eso cubre sin costo el registro de auditoría que exigen las acciones de administrador.

**Un solo runtime.** Los runtimes también se alinean: `proxy.ts` es solo Node ([Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)), `web-push` necesita APIs de Node y `crypto.argon2` exige Node 24.7 o superior. Todo el proyecto puede vivir en Node 24 sin Edge en ningún punto. Solo la clave pública VAPID debe exponerse con `NEXT_PUBLIC_`; el PAT, `SESSION_SECRET`, la clave privada VAPID y el pepper viven exclusivamente en variables de servidor.

## Conclusión

El punto débil de esta arquitectura no es la confidencialidad ni el rendimiento sino la **disponibilidad**. El cupo de escritura de GitHub es compartido y opaco: los límites secundarios "pueden cambiar sin aviso" ([GitHub Docs](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#about-secondary-rate-limits)) y GitHub decide "a su sola discreción" qué es uso excesivo de la API ([ToS §H](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service#h-api-terms)). Ese cupo lo comparten las órdenes de trabajo legítimas y cualquier escritura que un atacante logre disparar. Por eso usar GitHub como base de datos es una decisión correcta solo mientras las escrituras sigan en decenas por hora y los endpoints de autenticación estén cerrados por el WAF. La señal de migración es concreta: cuando los commits por hora se acerquen a las centenas, o cuando los reintentos por `422` se vuelvan frecuentes porque varios operarios editan lo mismo a la vez. Llegado ese punto, hay que pasar a un almacén de datos real y dejar GitHub para respaldos, como sugiere la propia guía de GitHub. Encapsular desde el primer día el acceso a datos en una interfaz pequeña (leer entidad, aplicar mutaciones) hace barato ese cambio.

Varios datos decisivos no los resuelve ninguna documentación y deben probarse antes del lanzamiento:

- Si iOS entrega `notificationclick` al service worker.
- Dónde va `app_badge` en el payload declarativo.
- La latencia real de argon2id en una función de Vercel con 1 vCPU.
- El `Cache-Control` que devuelve `api.github.com` para un repo privado.
- El comportamiento bajo la versión de API `2026-03-10`.
- Si `checkRateLimit` consume la única regla de Hobby.
- La pérdida de contexto WebGL en los celulares reales del taller.

Un piloto de una semana con dos iPhone y dos Android de los propios operarios, con la pantalla de estado de notificaciones activa, despeja la mayoría de estas incógnitas a un costo mínimo.
