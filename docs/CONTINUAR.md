# Cómo continuar el proyecto (traspaso desde la sesión en la nube)

Rama: `claude/smi-information-6393uk` · Última verificación: `tsc` y `eslint` sin errores, 14/14 tests de Vitest en verde. (`next build` aún no se ha ejecutado: faltan las páginas.)

## 1. Traerlo a tu equipo

```bash
git clone https://github.com/PAIRX-PAIR/MediAdh.git   # o: git fetch origin
cd MediAdh
git checkout claude/smi-information-6393uk
npm install
cp .env.example .env.local
npm run check        # typecheck + lint + tests
npm run dev
```

Requisitos: Node ≥ 20.9 (recomendado 22 o 24). En local el backend por defecto es `file` (JSON en `.data/`, ignorado por git).

> Todavía **no existen las páginas** (`/`, `/panel`, etc.): `npm run dev` arranca, pero esas rutas darán 404 hasta construir la interfaz (sección 4).
> La API ya funciona: por ejemplo, `GET http://localhost:3000/api/public`.

## 2. Decisiones ya tomadas (no re-discutir)

| Tema | Decisión |
|---|---|
| Base de datos | Repo **privado aparte** (ej. `pairx-pair/smi-taller-data`), JSON en `data/*.json`, commits atómicos multiarchivo por Git Data API con concurrencia optimista (`force:false` → 422 → reintento). `MediAdh` es **público**: cero secretos en el código. |
| Admins | Coordinador de producción (puesto con `grantsAdmin`) + cuentas admin extra sin puesto. Siempre queda ≥1 admin. |
| Dispositivo | Celular de cada trabajador, mobile-first, sesión de 30 días deslizante, PWA instalable. |
| Avisos | Ventana emergente in-app con sonido (modal bloqueante si es urgente) + Web Push (Declarative Web Push). En iPhone push solo con la app en pantalla de inicio. |
| Registro | Ventana emergente "Crear cuenta / Iniciar sesión". Registro abierto → cuenta **pendiente**; un admin la aprueba asignando puesto y contrato. Honeypot, límites por IP, tope de pendientes, código de taller opcional. |
| Contratos | Tareas pertenecen al **puesto**, no a la persona. Contrato vencido ⇒ puesto vacante automáticamente (calculado por fecha, sin cron), acceso revocado al instante. |
| Legal | **Colombia**: Ley 1581 de 2012, Decreto 1377 de 2013 (compilado en el 1074 de 2015), habeas data, SIC. Estilo de referencia: `PAIRX-PAIR/pairx-negocios/legal/` (Centro legal + Datos personales + Términos + Cookies + Aviso legal + PQR, lenguaje claro). Datos de la empresa editables por el admin en Ajustes. Prueba de autorización guardada (`consentAt`, `consentVersion`). |
| APK | **TWA** (Trusted Web Activity) con Bubblewrap; `/.well-known/assetlinks.json`; workflow de GitHub Actions para APK firmado. Java 21 disponible; falta Android SDK. |
| Contraseñas | scrypt N=2^17,r=8,p=1 (OWASP), mínimo 12 caracteres (frase), bloqueo 15 min/1 h/24 h tras 5/10/15 fallos, hash señuelo para usuarios inexistentes. |
| Versiones | React fijado en **19.2.8** (R3F 9.8 solo soporta 19.3 parcialmente), TypeScript **5.9.3** (no 7), fuentes autoalojadas con Fontsource (sin Google Fonts). |
| Paleta | Azul marino y derivados, brillos, HUD; tokens en `src/app/globals.css`. |

Investigación con fuentes: [`docs/investigacion/Riesgos técnicos app taller.md`](investigacion/Riesgos%20t%C3%A9cnicos%20app%20taller.md).

## 3. Lo que ya está hecho

**Dominio** (`src/lib/domain/`): `schema.ts` (zod de todo lo persistido), `contracts.ts` (estado de contrato y `evaluateAccess`), `time.ts`, `defaults.ts` (7 puestos), `labels.ts`, `views.ts` (tipos enviados al navegador).

**Almacenamiento** (`src/lib/server/store/`): `github.ts` (Git Data API, ETag/304, caché por SHA, protección contra réplicas atrasadas, ≥1 s entre escrituras), `file.ts`, `memory.ts`, `db.ts` (lectura validada + `transact` con reintentos).

**Seguridad** (`src/lib/server/`): `auth/password.ts`, `auth/session.ts` (JWT HS256 con jose, cookie `__Host-`, revocación por `sessionVersion`), `auth/principal.ts`, `route.ts` (CSRF por Sec-Fetch-Site/Origin + JSON obligatorio, authn/authz, errores), `rate-limit.ts`, `http.ts`, `src/proxy.ts` (CSP con nonce), `next.config.ts` (HSTS, XFO, etc.).

**Servicios** (`src/lib/server/services/`): `auth.ts` (login, registro con aprobación, cambio de contraseña, consentimiento, primer admin), `team.ts` (aprobar/rechazar, cuentas, puestos, contratos), `work.ts` (tareas, notas, solicitudes, cierre de día), `misc.ts` (avisos, ajustes, push, exportar mis datos), `sync.ts` (payload por usuario con ETag), `demo.ts`, `visibility.ts`. Push: `src/lib/server/push.ts`.

**API** (33 rutas en `src/app/api/`): ver `src/lib/client/api.ts`, que es el contrato tipado que debe usar la interfaz.

**Base de UI**: `globals.css` (tokens), `components/ui/primitives.tsx` (Button, Field, Input, Select, Chip, Ring…), `components/ui/overlay.tsx` (Modal con `<dialog>`, Toasts, useConfirm), `components/providers/sync-provider.tsx` (sondeo + popups + sonido), `components/shell/*` (HUD: barra superior con reloj y conexión, ticker de avisos, barra de tareas inferior, centro de avisos, ventanas emergentes, gate de consentimiento + contraseña), `app/(app)/layout.tsx` y `app/(app)/admin/layout.tsx`.

**Tests**: `src/lib/server/services/core.test.ts` (registro/aprobación, bloqueo, honeypot, contratos vencidos, permisos por puesto, sin hashes en el payload, concurrencia).

## 4. Pendiente (en este orden)

1. **Landing + hero 3D** (`src/app/page.tsx`): estilo "revelado automotriz" adaptado al taller. Modelos 3D procedurales en R3F: torno (chuck girando, viruta/chispas), engranajes, fresadora CNC y soplete de soldadura. Cámara ligada al scroll (Motion `useScroll` leído en `useFrame`), un solo `<Canvas>` cargado con `next/dynamic({ ssr:false })` dentro de un componente cliente, `dpr [1,1.5]` + `PerformanceMonitor`, `Environment` con `Lightformer` (sin presets por CDN), `ContactShadows frames={1}`, pausa fuera de pantalla, póster estático con `prefers-reduced-motion`. El texto y el botón principal van en HTML del servidor (LCP).
2. **Ventana emergente de acceso** (`?acceso=1`): pestañas "Iniciar sesión" / "Crear cuenta" (nombre, usuario, contraseña, teléfono, puesto, nota, código del taller si aplica, casilla de autorización de datos y honeypot `website` oculto). Mensajes por `?motivo=` (pending, no_contract…) y `?expirada=1`. Mostrar credenciales demo si `publicInfo.demo`.
3. **HUD del trabajador**: `/panel` (estado del puesto, anillos de progreso, próximas tareas, avisos, botón activar push), `/tareas` (órdenes de trabajo estilo taller: folio OT, franja de prioridad, piezas hechas/total, checklist, bloquear con motivo, notas; detalle por `?t=`), `/solicitudes` (pedir material en 3 toques; `?s=`), `/cierre` (flujo de cierre de día: completar pendientes, novedades, confirmar), `/perfil` (contraseña, avisos push y prueba, exportar mis datos, cerrar sesión en todos los dispositivos, instalar app).
4. **Consola admin**: `/admin` (tablero de puestos con estado de contrato, alertas, bloqueadas, urgentes), `/admin/tareas` (crear/editar/reasignar/eliminar, filtros por puesto/estado; `?t=`), `/admin/equipo` (pestañas Puestos · Solicitudes de acceso · Cuentas; aprobar con puesto+fechas, contratos, restablecer contraseña, desbloquear; `?tab=`, `?puesto=`), `/admin/solicitudes` (bandeja; `?s=`), `/admin/cierres` (`?d=`), `/admin/avisos`, `/admin/ajustes` (nombre, zona horaria, registro abierto, código, datos legales, publicar nueva versión de la política), `/admin/auditoria`.
5. **Legal** (`/legal`, `/legal/datos`, `/legal/terminos`, `/legal/cookies`, `/legal/aviso`) con datos de `settings.legal`, estilo PairX, adaptado a una herramienta interna de empleados (Ley 1581: finalidades laborales, derechos ARCO/habeas data, plazos 10 + 5 y 15 + 8 días hábiles, encargados: Vercel, GitHub/Microsoft, servicios de push de Google/Apple/Mozilla; cookie de sesión estrictamente necesaria; fuentes autoalojadas). Página `/setup` para el primer admin.
6. **PWA**: `public/manifest.webmanifest`, íconos en `app/icons/[size]/route.ts` (ImageResponse), `public/sw.js` (push con formato declarativo `web_push: 8030`, `notificationclick`, aviso a la app con `postMessage({type:"smi:push"})`, shell offline), hook `usePush` (suscribir tras gesto del usuario, re-sincronizar en cada arranque), `scripts/generate-vapid.mjs`.
7. **APK (TWA)**: `android/twa-manifest.json`, `public/.well-known/assetlinks.json` (con la huella SHA-256 de la firma), `.github/workflows/apk.yml` (Bubblewrap, keystore en secretos), y documentación de instalación en celulares.
8. **Calidad**: `npm run lint`, `next build`, tests e2e con Playwright (Chromium), `/security-review`, revisión adversarial, y `docs/DESPLIEGUE.md`.
9. **Despliegue en Vercel**: crear el repo privado de datos (con README inicial), token fine-grained (solo ese repo, Contents RW), variables de `.env.example`, regla de Firewall de Vercel para `/api/auth/*`, crear el primer admin en `/setup` y luego borrar `SETUP_KEY`.

`/fat-agent` no existe en la sesión de la nube (no hay skill con ese nombre). Si en tu equipo tienes un skill con ese nombre, ejecútalo al terminar.

## 5. Prompt sugerido para la siguiente sesión

> Continúa el proyecto SMI Taller en la rama `claude/smi-information-6393uk`. Lee `docs/CONTINUAR.md` y respeta las decisiones de la sección 2. El núcleo (datos, seguridad, API) ya está hecho y probado; construye la interfaz siguiendo la sección 4 en orden, usando solo `src/lib/client/api.ts`, `useSync()` y los componentes de `src/components/ui` y `src/components/shell`. Mantén el estilo JARVIS: HUD azul marino con brillos, animaciones de scroll no básicas, uso simple para cualquier persona. Al terminar: `npm run check`, `next build`, pruebas e2e, `/security-review` y despliegue en Vercel.
