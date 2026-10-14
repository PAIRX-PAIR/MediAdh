# Cómo continuar el proyecto

Rama: `main` (producción en https://smi-taller.vercel.app). Estado: entregada y en uso.
Última verificación local (13-oct-2026): `npm run check` (tsc + eslint + 60 tests Vitest), `next build`, `npm run test:e2e` (18 pruebas Playwright en escritorio y celular), revisión de seguridad y de código aplicadas.

## Arranque local

```bash
npm install
cp .env.example .env.local   # DATA_BACKEND=memory para el demo, file para datos locales persistentes
npm run dev
```

Cuentas demo (solo con `DATA_BACKEND=memory`): `admin.demo` / `Demo-Taller-2026`, `tornero.demo` / `Tornero-Demo-2026`.
Administrador real: `judago` (declarado con `ADMIN_BOOTSTRAP_*` en `.env.local`; ver `docs/DESPLIEGUE.md`).

## Qué está hecho

- **Núcleo**: datos en repo privado de GitHub (commits atómicos, concurrencia optimista, órdenes y cotizaciones particionadas por mes, auditoría mensual), seguridad (scrypt, bloqueo progresivo, JWT con revocación, CSRF, CSP con nonce), push, sincronización con ETag.
- **Producción**: clientes con NIT/DV, máquinas (activa / inactiva «próximamente» / mantenimiento con paros), OT desde el ingreso con fotos y planos, ruta por máquina que genera tareas por puesto, cotizador (dificultad +15 % / +25 %, utilidad, IVA, vigencia, PDF, aprobada → OT), recordatorios de entrega (24 h, el día, vencida), cierre automático a los 3 días con FACTURAR, garantías y devoluciones, histórico editable con precio ajustado por IPC, indicadores con índice de gestión (global y por máquina), cola por máquina con ocupación, asesor de prioridades explicable y simulador «¿Me puedo comprometer?», historial de cambios por entidad, exportación a Excel.
- **Horario y nómina**: horario del taller por turnos (lun y vie 8–12 y 13:30–16:30, mar a jue 7:30–12 y 13:30–17, sáb 8–12 = 42 h), que define la capacidad de las máquinas; el operario marca entrada y salida desde el celular; todo lo trabajado fuera del horario es hora extra (diurna, nocturna desde las 19:00, dominical/festiva), quincenas del 1–15 y 16–fin con pago el 15 y el 30, sueldo por persona, auxilio de transporte, salud y pensión, exportación a Excel (Equipo → Nómina). Las reglas (recargos, divisor de 210 h) se editan en Nómina → Reglas.
- **Cargos y acceso**: total para gerencia y administración (`judago`, `ax95`); gestión para coordinación de producción y asistencia administrativa (todo lo operativo, sin Ajustes, Equipo, sueldos ni auditoría; en Nómina ven horas, no dinero). Los operarios no inician sesión: tocan «Soy operario» en el inicio, su celular muestra un **QR** y un admin o el coordinador lo escanea en **Equipo → Accesos QR** y elige quién es; desde ahí ese celular ve solo la cola de esa persona (revocable en cualquier momento). Para una pantalla del taller está el **tablero general** (enlace secreto en Cola). Solo lectura, sin clientes ni precios. Registro público cerrado.
- **Cotizador S.M.I.**: utilidad base 35 %, +15 puntos por dificultad mayor (+25 muy alta), +125 por urgencia (se baja la pieza montada; la OT urgente va primero en la cola), IVA 19 %, vigencia 15 días, tarifa propia por máquina. La cotización impresa reparte la utilidad en cada línea e incluye la garantía.
- **Garantía**: 90 días desde la entrega; la soldadura no tiene garantía (se bloquea el reclamo de garantía; queda la devolución).
- **Equipo inicial**: `npm run equipo:cargar` con `equipo.local.json` (no se sube).
- **Interfaz**: landing con hero 3D procedural (torno, engranajes, CNC, soldadura) guiado por el scroll y póster sin movimiento, ventana de acceso, /setup, centro legal (Ley 1581/2012, Decreto 1377/2013, Ley 527/1999), HUD del operario y consola completa.
- **PWA**: manifest, íconos generados, `sw.js` (push declarativo, clic, sin conexión), `/inicio`, `npm run vapid`.
- **APK**: `android/twa-manifest.json`, `/.well-known/assetlinks.json` desde variables, workflow de Bubblewrap (`.github/workflows/apk.yml`), guía `docs/APK.md`.
- **Calidad**: CI (`.github/workflows/ci.yml`: check, build, e2e).

## Pendiente (lo carga el dueño dentro de la app)

1. Tarifa de Pintura y fechas de ingreso reales del equipo (contratos).
2. Tabla del IPC del DANE (Ajustes → IPC).
3. Validar con el contador las reglas de nómina y la carga prestacional (54 %).
4. Rotar el token de datos de GitHub si se filtra (Vercel → GITHUB_DATA_TOKEN).

## Mejoras

QR por OT, enviar aviso por WhatsApp al cliente, margen real vs cotizado en un reporte propio, cargar solo las particiones recientes de órdenes en cada escritura (hoy cada escritura de tareas lee todas las órdenes; suficiente para años de uso de un taller pequeño).
