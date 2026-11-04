# Reestructuración del módulo Taller

Documento del parche «Reestructuración del módulo Taller y autorización de entregas».
Se implementa por etapas; este archivo recoge el **inventario previo**, las **duplicidades reales**
y la **matriz de equivalencias** entre la interfaz anterior y la nueva.

## Etapas

| Etapa | Contenido | Estado |
|---|---|---|
| 1 | Los trabajos salen completos en todos lados («Ver las N órdenes», aviso de la ventana de 120 días) | Hecha |
| 2 | Navegación: Taller con 4 secciones, barra móvil (Inicio · Órdenes · Taller · Clientes · Más), rutas canónicas y redirecciones, renombre a «Programación» | Hecha |
| 3 | Autorización de fechas: propuesta → revisión → confirmación de Gerencia, fecha propuesta y comprometida por separado, reprogramaciones, notificaciones | Pendiente |
| 4 | Motor de programación: margen de contingencia, operario compartido, secuencia de operaciones, causa de la restricción y horas disponibles/comprometidas | Pendiente |

## Inventario previo (antes de la etapa 2)

### Rutas del administrador

| Ruta | Pantalla | Grupo del menú |
|---|---|---|
| `/admin` | Mando (inicio) | Producción |
| `/admin/ordenes` | Órdenes de trabajo | Producción |
| `/admin/cola` | Cola por máquina: ocupación, carga diaria, prioridades, simulador «¿Me puedo comprometer?», lista de máquinas, enlace del tablero | Producción |
| `/admin/mapa` | Mapa de tareas | Producción |
| `/admin/insumos` | Insumos requeridos | Producción |
| `/admin/cotizador` | Cotizador | Producción |
| `/admin/clientes` | Clientes | Producción |
| `/admin/indicadores` | Indicadores | Producción |
| `/admin/finanzas` | Ganancias (solo gerencia) | Producción |
| `/admin/historico` | Histórico | Producción |
| `/admin/tareas`, `/admin/equipo`, `/admin/solicitudes`, `/admin/cierres`, `/admin/nomina`, `/admin/dispositivos`, `/admin/avisos` | Equipo y operación | Equipo |
| `/admin/cambiar-usuario` | Cambiar de usuario (solo gerencia) | Usuarios |
| `/admin/ajustes`, `/admin/auditoria`, `/perfil` | Sistema | Sistema |

### Datos y relaciones que usa el Taller

- `orders` (particionada por mes en `data/ordenes/`): cada OT tiene `id` y `folio` únicos, `due` (fecha de entrega), `workItems[]` (operaciones con `process`, `machineId`, `positionId`, `plannedHours`, `actualHours`, `status`, `taskId`), `claims`, `invoice`, `history`.
- `machines`: `state`, `activeSince`, `hoursPerDay`, `positionId` (puesto que la opera), `stops[]` (paros de mantenimiento), `history`.
- `tasks`: una tarea por operación (`workItemId`), con avance y horas reales; actualiza el `workItem` de la OT (sin duplicar datos).
- `settings.production`: horario por turnos, festivos, tarifas y ventana de garantía.
- Motor: `src/lib/domain/planning.ts` (`scheduleJobs`, `occupancy`, `prioritize`, `canCommit`). Capacidad por máquina = turnos del taller − paros, con tope por máquina.
- Dónde se escribe `order.due` hoy: `createOrder`, `updateOrder`, aprobación de cotización (`approveQuote`) y carga histórica. Hasta la etapa 3 cualquier administrador puede fijarla.

### Duplicidades reales encontradas

1. El panel de prioridades (`PriorityPanel`) estaba en el Mando (6) y en la Cola (10) con límites distintos y sin «ver todas».
2. La ocupación de máquinas (`OccupancyList`) estaba en el Mando y en la Cola.
3. El simulador «¿Me puedo comprometer?» tenía tres implementaciones de pantalla (Cola, formulario de OT, editor de cotización) además de un acceso en el Mando; todas usan el mismo cálculo `canCommit`.
4. La cola mezclaba en una sola pantalla programación, máquinas y configuración de máquinas.
5. Móvil: la barra inferior llevaba cinco accesos (Mando, Órdenes, Cola, Equipo, Pedidos) y el menú repetía todo.

## Matriz de equivalencias

| Antes | Ahora | Notas |
|---|---|---|
| Mando (`/admin`) | **Inicio** (`/admin`) | Conserva saludo, accesos rápidos, «Tu siguiente paso», contadores, alertas y puestos. El panel de prioridades y la ocupación pasan a sus secciones. |
| Panel «Sigue con / Orden recomendado» en Mando y en Cola | **Producción** (`/admin/produccion`) | Un solo componente; muestra un resumen y «Ver las N órdenes». |
| Ocupación · próximas 2 semanas (Mando y Cola) | **Máquinas** (`/admin/maquinas`) | Un solo lugar. |
| Carga diaria por máquina (Cola) | **Máquinas** → «Carga diaria por máquina» (desplegable) | Mismos gráficos y tablas. |
| Lista «Máquinas de la planta», alta y edición de máquinas, paros | **Máquinas** | Mismo formulario (`MachineFormModal`) y mismos permisos (alta solo gerencia). |
| Enlace del tablero de operarios (Cola) | **Máquinas** | Mismo componente `BoardLinkCard`. |
| Cola de trabajos por máquina (dentro del gráfico) | **Programación** → «Cola por máquina» (desplegable por máquina) | Mismo componente `MachineQueueList`. |
| «¿Me puedo comprometer?» (Cola) | **Programación** → «Simular una fecha de entrega» | Mismo cálculo; ancla `#comprometer` conservada. Es simulación: no reserva. |
| «¿Me puedo comprometer?» en formulario de OT y cotización | Etiqueta **Programación** | Mismo cálculo. |
| `/admin/cola` | Redirige a `/admin/programacion` | Los enlaces y marcadores viejos siguen funcionando. |
| Alertas de mantenimiento con enlace a `/admin/cola` | Enlazan a `/admin/maquinas` | |
| Órdenes (`/admin/ordenes`) | **Órdenes de trabajo** (`/admin/ordenes`) | Sin cambios de ruta; «Entregadas» y «Todas» avisan de la ventana y enlazan al Histórico. |
| Mapa de tareas, Insumos, Cotizador, Clientes, Indicadores, Ganancias, Histórico | Menú **Gestión** (y «Más» en el celular) | Misma ruta y mismos permisos. |
| Tareas, Equipo, Pedidos, Cierres, Nómina, Accesos QR, Avisos | Menú **Equipo** (y «Más») | Sin cambios. |
| Barra móvil: Mando · Órdenes · Cola · Equipo · Pedidos | **Inicio · Órdenes · Taller · Clientes · Más** | «Más» agrupa Gestión, Equipo, Usuarios y Sistema, con los permisos de siempre; su insignia suma los avisos pendientes de esos apartados. |
| (no existía) | **Taller** (`/admin/taller`) | Pantalla compacta con los cuatro accesos y un resumen desplegable. |

### Criterio de aceptación de la etapa 2

- Toda ruta anterior sigue respondiendo (la única que cambió, `/admin/cola`, redirige).
- Ninguna función se eliminó: cada bloque de la Cola y del Mando aparece en la tabla anterior.
- Los permisos no cambian: el menú sigue filtrando por alcance y las rutas de la API validan en el servidor.
- No se tocó ningún dato ni esquema.
