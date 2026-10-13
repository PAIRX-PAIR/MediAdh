# Cómo continuar el proyecto

Rama: `claude/smi-information-6393uk` · PR en borrador #1.
Última verificación local (13-oct-2026): `npm run check` (tsc + eslint + 54 tests Vitest), `next build`, `npm run test:e2e` (16 pruebas Playwright en escritorio y celular), revisión de seguridad y de código aplicadas.

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
- **Interfaz**: landing con hero 3D procedural (torno, engranajes, CNC, soldadura) guiado por el scroll y póster sin movimiento, ventana de acceso, /setup, centro legal (Ley 1581/2012, Decreto 1377/2013, Ley 527/1999), HUD del operario y consola completa.
- **PWA**: manifest, íconos generados, `sw.js` (push declarativo, clic, sin conexión), `/inicio`, `npm run vapid`.
- **APK**: `android/twa-manifest.json`, `/.well-known/assetlinks.json` desde variables, workflow de Bubblewrap (`deploy/github-workflows/apk.yml`), guía `docs/APK.md`.
- **Calidad**: CI (`deploy/github-workflows/ci.yml`: check, build, e2e).

## Pendiente (requiere al dueño de las cuentas)

1. **Workflows de GitHub**: el token de `gh` no tiene el permiso `workflow`. Ejecuta `gh auth refresh -h github.com -s workflow` y mueve `deploy/github-workflows/*.yml` a `.github/workflows/`.
2. **Despliegue en Vercel**: seguir `docs/DESPLIEGUE.md` (repo privado de datos, token fine-grained, variables, regla de firewall).
3. **APK**: crear el keystore, cargar los secretos y ejecutar el workflow (`docs/APK.md`).
4. **Nómina**: cargar el sueldo de cada operario y el valor del auxilio de transporte del año (Nómina → Reglas) y validar las reglas con el contador.
5. **IPC del DANE**: descargar el anexo «Índices – series de empalme» y pegarlo en Ajustes → IPC.
6. **Prueba en celulares reales** (iPhone en pantalla de inicio y Android) de avisos push y del hero 3D.

## Mejoras opcionales (no hechas)

QR por OT, enviar aviso por WhatsApp al cliente, margen real vs cotizado en un reporte propio, cargar solo las particiones recientes de órdenes en cada escritura (hoy cada escritura de tareas lee todas las órdenes; suficiente para años de uso de un taller pequeño).
