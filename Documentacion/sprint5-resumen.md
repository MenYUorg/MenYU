# Sprint 5 — Pedido + Socket.io

**Sprint:** S5 · Issue épica #5  
**Equipo:** De Marcos (margarita0912) · Ojeda (lautiod) · Strumia Carrara (CotyStrumia)  
**Fecha:** Mayo–Junio 2026 (PRs #283 → #294)  
**Estado:** In Progress (#59 y #64 pendientes)

---

## Índice

1. [Objetivo del sprint](#1-objetivo-del-sprint)
2. [Actividades y responsables](#2-actividades-y-responsables)
3. [#58 — Módulo Pedido en NestJS: confirmación con snapshot de precio](#3-58--módulo-pedido-en-nestjs-confirmación-con-snapshot-de-precio)
4. [#59 — Configurar Socket.io Gateway en NestJS (pendiente)](#4-59--configurar-socketio-gateway-en-nestjs-pendiente)
5. [#60 — Evento pedido:nuevo → notifica a cocina en tiempo real](#5-60--evento-pedonuevo--notifica-a-cocina-en-tiempo-real)
6. [#61 — Panel Kanban cocina: comandas entrantes con Socket.io](#6-61--panel-kanban-cocina-comandas-entrantes-con-socketio)
7. [#62 — App mozo: pantalla de pedidos activos y llamados](#7-62--app-mozo-pantalla-de-pedidos-activos-y-llamados)
8. [#63 — Store Zustand: useMozoStore](#8-63--store-zustand-usemozostore)
9. [#64 — Tests de pedido y Socket.io (pendiente)](#9-64--tests-de-pedido-y-socketio-pendiente)
10. [#245 — Diseño e implementación de Frontend del cliente](#10-245--diseño-e-implementación-de-frontend-del-cliente)
11. [#266 — Diseño e implementación de Frontend del Staff](#11-266--diseño-e-implementación-de-frontend-del-staff)
12. [#267 — Diseño e implementación de Frontend de Administración](#12-267--diseño-e-implementación-de-frontend-de-administración)
13. [Decisiones de diseño transversales](#13-decisiones-de-diseño-transversales)
14. [Problemas encontrados y resoluciones](#14-problemas-encontrados-y-resoluciones)

---

## 1. Objetivo del sprint

Implementar el flujo completo de pedidos con tiempo real: módulo de pedido en el backend con snapshot de precio, gateway Socket.io, panel Kanban de cocina, panel del mozo, y el desarrollo visual completo de las tres apps web (web-cliente, web-staff, web-admin) con sus flujos de usuario funcionales.

---

## 2. Actividades y responsables

| # | Actividad | Responsable | Estado |
|---|---|---|---|
| #58 | Módulo Pedido en NestJS: confirmación con snapshot de precio | Strumia Carrara | Done |
| #59 | Configurar Socket.io Gateway en NestJS | Ojeda | **Todo** |
| #60 | Evento pedido:nuevo → notifica a cocina en tiempo real | Strumia Carrara + De Marcos | Done |
| #61 | Panel Kanban cocina: comandas entrantes con Socket.io client | Strumia Carrara | Done |
| #62 | App mozo: pantalla de pedidos activos y llamados | Strumia Carrara | Done |
| #63 | Store Zustand: useMozoStore | Strumia Carrara | Done |
| #64 | Tests de pedido y Socket.io | Ojeda | **Todo** |
| #245 | Diseño e Implementación de Frontend del cliente | De Marcos | Done |
| #266 | Diseño e implementación de Frontend del Staff | De Marcos | Done |
| #267 | Diseño e implementación de Frontend de Administración | De Marcos | Done |

---

## 3. #58 — Módulo Pedido en NestJS: confirmación con snapshot de precio

**Responsable:** Strumia Carrara  
**Documentación detallada:** `Documentacion/modulo-pedidos-y-cocina-kanban.md` (sección backend)

### Qué se hizo

Se implementó el módulo `pedidos/` (independiente del `orders/` preexistente) con validación completa y snapshot de precio:

**Endpoints:**
- `POST /api/pedidos` — crea un pedido. Requiere JWT de sesión (`tipo: 'cliente'`).
- `PATCH /api/pedidos/:id/estado` — avanza el estado del pedido. Requiere JWT de staff.
- `GET /api/pedidos` — lista pedidos con filtros por restaurante y estado (para carga inicial de la cocina y el mozo).

**Lógica de negocio (dentro de `$transaction`):**
1. Verificar sesión activa.
2. Por cada ítem: buscar `ItemMenu`, leer `precioBase`, validar cada mod (`esAgregable`/`esRemovible`).
3. Crear `Pedido → PedidoItem[] → PedidoItemMod[]` en una sola operación atómica.
4. Emitir `order:new` via socket **fuera** de la transaction.

**Snapshot de precio:**
```
precioUnitario = precioBase
  + Σ(precioExtra de mods AGREGAR)
  − Σ(precioExtra de mods QUITAR)
```
El precio se guarda al momento del pedido. Cambios posteriores en el menú no afectan pedidos ya creados.

**Transiciones de estado:**
```
pendiente → en_preparacion → listo → entregado
```

**Seed de datos de prueba:** `prisma/seed.ts` con UUIDs v4 válidos. Precio esperado con mods: $1500 + $200 − $50 = **$1650**.

### Decisiones

**`pedidos/` independiente de `orders/`:** `orders/` tiene DTOs con estructura diferente y no valida `esAgregable`/`esRemovible`. En lugar de modificar código existente y potencialmente romper el flujo anterior mientras se itera, se creó un módulo nuevo.

**`restauranteId` del JWT, no del body:** evita que un cliente malicioso pase un `restauranteId` falso.

**Emit del socket después de la transaction:** si el emit falla, el pedido ya está guardado. No hay rollback por fallo de socket.

---

## 4. #59 — Configurar Socket.io Gateway en NestJS (pendiente)

**Responsable:** Ojeda  
**Estado:** Todo

### Contexto

El gateway `menyu.gateway.ts` está operativo (namespace `/ws`, rooms `restaurante-${id}`) y siendo usado por los módulos de pedidos, waiter-calls y sesiones. La tarea formal de configuración incluyendo `@nestjs/websockets` y la arquitectura de rooms está siendo completada por Ojeda como parte del trabajo de infraestructura del sprint.

### Arquitectura actual del gateway

- **Namespace:** `/ws`
- **Room pattern:** `restaurante-${restauranteId}`
- **Eventos de join:** `session:join`, `cocina:join`, `mozo:join` → todos unen al cliente a la misma room

| Método del gateway | Evento emitido | Payload |
|---|---|---|
| `emitOrderNew` | `order:new` | Pedido completo con mesa, ítems, mods |
| `emitOrderUpdated` | `order:updated` | Pedido con estado nuevo |
| `emitMozoCalled` | `waiter:called` | `{ sesionId, mesaNumero }` |
| `emitSesionCerrada` | `sesion:cerrada` | `{ sesionId }` |
| `emitMenuUpdated` | `menu:updated` | `{ restauranteId }` |
| `emitOrderEdited` | `order:edited` | Pedido editado |

---

## 5. #60 — Evento pedido:nuevo → notifica a cocina en tiempo real

**Responsables:** Strumia Carrara + De Marcos  
**Documentación detallada:** `Documentacion/sesion-pedidos-kanban-flujo-completo.md`

### Qué se hizo

Se conectó el flujo completo de tiempo real entre el cliente (que crea el pedido) y la cocina (que lo recibe):

**Backend:**
- `emitOrderNew(restauranteId, pedido)` — llamado en `PedidosService.create()` después de la transaction. Emite a todos los clientes en la room `restaurante-${id}`.
- `emitOrderUpdated(restauranteId, pedido)` — llamado en `actualizarEstado()`. Permite que múltiples pantallas (cocina + mozo) estén sincronizadas.

**Frontend (web-staff) — socket.ts:**
- Corrección crítica: el socket conectaba a la URL base pero no al namespace `/ws`. Se cambió de `io(WS_URL)` a `io(${WS_URL}/ws, {...})`.
- `joinRestauranteComoCocina(id)` — espera el evento `connect` si el socket no está conectado antes de emitir:
  ```typescript
  if (s.connected) s.emit('cocina:join', { restauranteId })
  else s.once('connect', () => s.emit('cocina:join', { restauranteId }))
  ```
- `onPedidoNuevo(cb)` / `onPedidoActualizado(cb)` — retornan cleanup `() => void` para `useEffect`.

**CORS:**
`main.ts` actualizado para aceptar cualquier `localhost:*` en desarrollo. En producción, controlado por `CORS_ORIGINS` en Railway.

**Expiración de tokens:**
- Staff (auth): 15min → **8h** — el mozo/cocina trabajan un turno completo.
- Sesión cliente: 15min → **12h** — el comensal puede navegar el menú largo tiempo.

---

## 6. #61 — Panel Kanban cocina: comandas entrantes con Socket.io

**Responsable:** Strumia Carrara  
**Documentación detallada:** `Documentacion/modulo-pedidos-y-cocina-kanban.md` (sección frontend)

### Qué se hizo

**`cocinaStore.ts`** (Zustand, web-staff):
```typescript
interface CocinaStore {
  pedidos: Pedido[]
  agregarPedido: (pedido: Pedido) => void      // inserta al inicio (más reciente primero)
  actualizarEstado: (id: string, estado) => void
}
```

**`CocinaPage.tsx`** — Kanban de 4 columnas:

| Columna | Color | Botón |
|---|---|---|
| Pendiente | Amarillo | "Iniciar preparación" |
| En preparación | Azul | "Marcar listo" |
| Listo | Verde | sin botón |
| Entregado | Gris | sin botón |

**`PedidoCard`** muestra: mesa, hora `HH:mm`, `{cant}× {nombre}`, notas en amarillo, mods en verde/rojo.

**Botón de avance:**
```
[Click] → PATCH /api/pedidos/:id/estado (con JWT del localStorage)
        → backend actualiza DB + emite order:updated
        → onPedidoActualizado → actualizarEstado en store
        → tarjeta se mueve de columna
```
Loading por tarjeta (`useState` local), no global.

**Carga inicial al montar:** `GET /api/pedidos?restauranteId=X&estado=pendiente,en_preparacion,listo` para que el Kanban no quede vacío al recargar la página.

**Tipos locales `PedidoRico`:** el tipo `Pedido` de `@menyu/types` no modela los campos anidados que el backend devuelve. Se definen tipos locales y se castea con `as PedidoRico` para el render.

---

## 7. #62 — App mozo: pantalla de pedidos activos y llamados

**Responsable:** Strumia Carrara  
**Documentación detallada:** `Documentacion/modulo-waiter-calls-y-mozo-panel.md`

### Qué se hizo

**Backend — módulo `waiter-calls/`:**
- `POST /api/waiter-calls` — el cliente llama al mozo. Requiere JWT de sesión.
- Lógica: `deleteMany` llamados pendientes de esa sesión + `create` nuevo (un activo a la vez).
- El `restauranteId` viene del JWT del cliente.

**Corrección del gateway:**
- Bug 1: `emitMozoCalled` emitía `'mozo:llamado'` pero el panel escuchaba `'waiter:called'`.
- Bug 2: no existía handler `mozo:join` en el backend → el mozo nunca entraba a la room del restaurante.

**`MozoPanel.tsx`** (web-staff) — al montar:
1. `joinRestauranteComoMozo(restauranteId)` — entra a la room.
2. Carga pedidos en estado `listo` via `GET /api/pedidos?restauranteId=X&estado=listo`.
3. Suscribe a `waiter:called` → agrega al historial de llamados.
4. Suscribe a `order:updated` → si `estado === 'listo'` → `agregarPedidoListo`.

**Secciones del panel:**
```
MozoPanel
├── Listos para entregar  → PedidoListoCard: botón "Entregado"
│     → PATCH /api/pedidos/:id/estado { estado: 'entregado' }
│     → desaparece al confirmarse
├── Llamados pendientes   → tarjeta: mesa, hora, botón "Atendido"
└── Historial de hoy
```

**LlamarMozoBtn (web-cliente):** estados `idle → loading → ok → error`. Cooldown de 3s. Requiere `sesionId` y `jwt`.

---

## 8. #63 — Store Zustand: useMozoStore

**Responsable:** Strumia Carrara

### Qué se hizo

**`mozoStore.ts`** (web-staff) — estado del panel del mozo:

```typescript
interface MozoStore {
  llamados: LlamadoData[]
  pedidosListos: Pedido[]
  restauranteId: string | null          // para admins ROOT sin restauranteId en JWT

  addLlamado(data): void
  marcarAtendido(id): void
  agregarPedidoListo(pedido): void      // filter + push para evitar duplicados
  marcarEntregado(id, jwt): Promise<void>
  setRestauranteId(id): void
}
```

**`marcarEntregado(id, jwt)` recibe el JWT por parámetro:** Zustand es para estado de UI, no para credenciales. El componente lee el JWT de `useAuth().getToken()` y lo pasa al action. Si el token necesita refrescarse, el componente es el lugar correcto.

**`SelectorPage`** (`/selector`) para admins ROOT: si el JWT no tiene `restauranteId` (ROOT no pertenece a ningún restaurante), muestra un input para ingresarlo manualmente. Al confirmar, guarda en `mozoStore.restauranteId`. `CocinaPage` y `MozoPanel` lo leen como fallback: `user?.restauranteId ?? mozoStore.restauranteId`.

---

## 9. #64 — Tests de pedido y Socket.io (pendiente)

**Responsable:** Ojeda  
**Estado:** Todo

Pendiente de implementación. Cubrirá las suites de tests unitarios y de integración para el módulo de pedidos y la lógica del gateway Socket.io.

---

## 10. #245 — Diseño e implementación de Frontend del cliente

**Responsable:** De Marcos  
**Commits principales:** `d664d52` (23/05/2026) · `64aa7cd` (24/05/2026) + PRs de feat/front-carrito y bug-fixing  
**Contexto:** SESIÓN 04, 05 y 06 del resumen de De Marcos

### Fase 1 — Limpieza de deuda técnica (carritoStore vs cartStore)

Se encontraron dos sistemas de carrito en paralelo con páginas y endpoints incompatibles:

- Se eliminó el sistema duplicado (`cartStore.ts`, `CartPage.tsx`, `ConfirmacionPage.tsx` del sprint anterior).
- Se migró el carrito activo a `POST /orders` que extrae `sesionId` del JWT.
- Se corrigió `orders.service.ts` para incluir `DETAIL_INCLUDE` al emitir el evento WebSocket `order:new`.

**Deduplicación en `carritoStore.agregar()`:** compara `itemMenuId`, nota y modificaciones para evitar entradas duplicadas del mismo ítem con la misma configuración.

**Bug de precio:** `precioUnitario` se guardaba incorrectamente como `precioTotal × cantidad`. Corregido.

**Carrito entre sesiones:** se llama `carritoStore.vaciar()` dentro de `sessionStore.clear()` para que el carrito no persista al cambiar de mesa.

### Fase 2 — Rediseño visual completo

**Sistema de diseño:** naranja `#E8563A`, navy `#2D3561`, tipografía Montserrat + Inter.

**`ClienteMenuPage`** — rediseño completo:
- Header navy con drawer lateral (perfil invitado/logueado).
- Botón fijo "Llamar al mozo".
- Barra de búsqueda de ítems.
- Filtro de clasificaciones dietéticas.
- Chips de categoría con scroll spy via `IntersectionObserver`.

**`ItemDetailPage`** — rediseño completo:
- Imagen arriba, pills de clasificaciones.
- Toggles de ingredientes: `esRemovible` (quitar/restaurar), `esAgregable` (controles +/−).
- Campo de nota por ítem.
- Edición desde el carrito con precarga de modificaciones existentes.

**`CarritoPage`** — rediseño:
- Cards con detalle de modificaciones, stepper de cantidad.
- Panel lateral con total acumulado.
- Pantalla de éxito con resumen completo del pedido.

**`MisPedidosPage`** (nueva):
- Consume `GET /orders` (nuevo endpoint que lista pedidos de la sesión activa).
- WebSocket `order:updated` en tiempo real para actualizar el estado de cada ítem.
- Barra de progreso visual por pedido (pendiente → en preparación → listo → entregado).

**`PagarPage`** (nueva):
- Tabla de ítems agrupados por pedido.
- Botón Mercado Pago (badge 'Próximamente').
- Botón "Llamar al mozo para pagar" → emite solicitud al mozo.

### Nuevos endpoints en el backend (formulados por De Marcos, implementados por Strumia)

- `GET /orders` — lista pedidos de la sesión activa con include rico.
- `POST /sessions/open` extendido: devuelve `numeroMesa` y `modoSesion`. Flujo en dos pasos para modo seguro.

---

## 11. #266 — Diseño e implementación de Frontend del Staff

**Responsable:** De Marcos  
**Commits principales:** `a1dc431` (31/05/2026) · `d19e04a` · `7c32a54` (02/06/2026)  
**Contexto:** SESIÓN 08 del resumen de De Marcos

### Auditoría del estado inicial

`web-staff` tenía: estructura mínima, `mozoStore.ts`, `api.ts` con un único método, sin `lucide-react` instalado. Se auditaron las páginas de `web-admin` para identificar qué portar y adaptar.

### Decisiones técnicas

- **Reutilización:** se optó por copiar páginas de `web-admin` y adaptar JWT, store y endpoints, en lugar de extraer un paquete compartido.
- **`api.ts` reescrito** con módulos: `api.mesas`, `api.pedidos`, `api.sesiones`, `api.menu`, `api.waiterCalls`.
- **`lucide-react`** instalado: `pnpm --filter @menyu/web-staff add lucide-react`.

### Problema crítico: sistema de roles dual

`RolesGuard` valida `user.rol` (ROOT/OWNER/GERENTE), pero los mozos tienen `user.tipo === 'mozo'` y `user.rol === undefined`. Solución: uso del `TipoGuard` preexistente en tres endpoints específicos (GET /mesas, GET /sessions/mesa/:mesaId/activa, POST /sessions/mesa/:mesaId/cerrar). `assertAdminAccess` reemplazado por `assertStaffAccess` en `sessions.service.ts`.

### Nuevo endpoint en el backend

- `GET /waiter-calls?restauranteId=X` — para cargar los llamados pendientes al montar `MesasPage`.

### Páginas implementadas

**`MesasPage.tsx`:** grid de tiles con polling cada 30s, badge de llamados pendientes, WebSocket `waiter-call:new`, modal de detalle con sesión activa y pedidos.

**`TomaPedidosPage.tsx`:** tres vistas en secuencia — selección de mesa, menú con buscador, carrito. Abre sesión automáticamente si no hay activa.

**`PedidosPage.tsx`:** kanban con WebSocket en tiempo real, optimistic updates, modal de edición con stepper y justificación.

**`HistorialPage.tsx`:** pedidos entregados/anulados con selector de período y buscador. Ediciones bajo demanda.

**`MozoPanel.tsx` rediseñado:** alertas en tiempo real + cuatro cards de navegación (card primaria "Hacer pedido" en navy, cards secundarias en grilla).

**`SelectorPage` rediseñado:** header navy, cards por rol con barra lateral de color, avatar con iniciales del usuario.

### CocinaPage — rediseño completo

- Kanban de dos columnas (En preparación / Listo). Sin botón de entrega ni edición — solo cocina.
- Badge naranja en header con conteo de pedidos activos.
- **Notificaciones visuales de ediciones:** badge 'Editado' al recibir `order:edited` (nuevo evento en el gateway).
- **Pedidos anulados con desaparición diferida:** borde rojo + ítems tachados, eliminación automática a los 3 minutos via `setTimeout`.
- **Sonidos con Web Audio API nativa** (sin dependencias externas): tres sonidos distintos para pedido nuevo, edición y anulación.

**`PageHeader.tsx`** (nuevo componente compartido): header reutilizable en todas las pantallas de web-staff.

### Pagos en web-staff (SESIÓN 09)

- **`PagosMozo.tsx`** (nuevo, ruta `/mozo/pagos`): mesas activas, notificación en tiempo real cuando el cliente solicita pagar, registro de cobro.
- **`PagosGerente.tsx`** (nuevo): mesas activas con campanitas, registro de cobro seleccionando el mozo, historial de hoy y ayer.
- Socket integrado: `sesion:quierePagar` y `sesion:cobrada`.
- Bug corregido: `mozoId` enviado como `user?.id` (campo inexistente en JWT) en lugar de `user?.sub`.

---

## 12. #267 — Diseño e implementación de Frontend de Administración

**Responsable:** De Marcos  
**Commits principales:** `40c0a54` · `c671b45` (30/05/2026) · `87dd93f` (30/05/2026) · `7c32a54` (02/06/2026)  
**Contexto:** SESIÓN 07 del resumen de De Marcos

### Dashboard (OWNER/ROOT)

- KPI cards: ventas del día, pedidos, mesas ocupadas, ticket promedio.
- Mapa de mesas con polling cada 30s, gráfico de barras CSS de ventas por hora, ranking top 5 ítems.
- **`ReportesModule`** (backend): `GET /reportes/ventas-hoy`, `/ventas-por-hora`, `/top-items`.
- Fix de timezone: función `toLocaleDateStr()` para compensar UTC-3 vs UTC del backend.
- `contextStore` extendido: `selectedRestauranteId` persiste en localStorage.

### Pantalla de mesas (OWNER/GERENTE)

- Grid de tiles con estado visual (verde/rojo) y datos de sesión en tiempo real, polling cada 30s.
- Modal por tile: ver PIN, mostrar QR, imprimir, regenerar QR y eliminar (solo si libre), cerrar sesión (si ocupada).
- **Nuevo endpoint `POST /sessions/mesa/:mesaId/cerrar`** para cierre desde el admin.
- Bug corregido: `sessions.service.ts` no actualizaba `mesa.estado = 'ocupada'` — encapsulado en `$transaction`.
- WebSocket: el cliente detecta en tiempo real el cierre de su sesión via `session:closed`.

### Pantalla de menú — CMS

- Ítems agrupados por categoría con scroll spy (`IntersectionObserver`), pills de categoría.
- **`ItemFormModal`**: crear/editar ítems, upload de imagen, clasificaciones de dieta, panel de ingredientes con toggles.
- Modal "Gestionar catálogo": tabs para categorías (con drag & drop y campo `orden`), ingredientes y clasificaciones.
- Fix: `findAll` en `items.service.ts` no incluía `DETAIL_INCLUDE` → modal de edición abría con ingredientes vacíos.
- Tiempo real: `emitMenuUpdated` desde `items.service.ts`; `web-cliente` escucha `menu:updated` y recarga el menú.

### Diferenciación de roles OWNER / GERENTE

- Navegación dinámica via `NAV_BY_ROL`: OWNER ve Dashboard, Mesas, Menú, Mozos, Reportes, Auditoría; GERENTE ve Mesas, Toma de pedidos, Pedidos, Historial, Menú, Mozos.
- `RoleGuard` en `App.tsx` verifica `user?.rol` y redirige si no tiene acceso.
- Backend: DELETE en categorías, mesas, ítems y mozos restringido a OWNER/ROOT.

### Pantallas exclusivas del GERENTE

- **`GerenceMesasPage`**: tiles con notificación de llamados via WebSocket, detalle a pantalla completa con acciones.
- **`TomaPedidosPage`**: abrir mesa + cargar pedido en nombre del cliente. Endpoints `POST /orders/staff` y `POST /sessions/open-staff`.
- **`PedidosPage`**: kanban con actualización optimista y WebSocket. Edición directa desde kanban.
- **`HistorialSesionesPage`**: agrupación por sesión, modal con pedidos, ítems con ediciones y historial colapsable.

### Sistema de auditoría de ediciones

- **Modelos `PedidoEdicion` y `PedidoEdicionItem`:** snapshot de los cambios. Edición modifica `cantidadEditada` en `PedidoItem` sin eliminar registros.
- **Reglas:** solo pedidos entregados, justificación obligatoria (máx 50 palabras), debe quedar al menos un ítem con cantidad > 0.
- **Pantalla Auditoría (OWNER/ROOT):** `GET /pedidos/auditoria` con todas las ediciones del período.

### Pagos en web-admin (SESIÓN 09)

- **`PagosPage.tsx` reescrita** con diferenciación de roles: GERENTE con campanitas y selector de mozo para registrar cobros; OWNER solo lectura con filtros (hoy / ayer / última semana).
- Socket integrado: `sesion:quierePagar` y `sesion:cobrada`.
- "Caja" agregada al sidebar para GERENTE y OWNER.
- Bug corregido: modal de cobro enviaba `mozoId: ''` en lugar de `null` cuando no se seleccionaba mozo.

### Nuevos endpoints en el backend (formulados por De Marcos, implementados)

- `GET /sessions/activas?restauranteId=X` — sesiones abiertas con tiempo, ítems, personas, total y flag `quierePagar`.
- `GET /sessions/pagadas?restauranteId=X&fecha=hoy|ayer` — sesiones cobradas con método, nombre del mozo y timestamp.
- `PATCH /sessions/:id/cobro` — registra cobro, cierra sesión, emite WebSocket `sesion:cobrada`.
- Evento WebSocket `sesion:quierePagar` — emitido cuando el cliente inicia pago con mozo.

---

## 13. Decisiones de diseño transversales

| Decisión | Contexto |
|---|---|
| Snapshot de precio server-side | El frontend calcula para mostrar, el backend recalcula y guarda. Si el admin cambia precios después, los pedidos existentes no se ven afectados |
| Socket emit fuera de la `$transaction` | Si el emit falla, el pedido ya está guardado. No hay rollback de DB por fallo de red |
| `TipoGuard` para mozos en endpoints de staff | Los mozos no tienen `rol` en el JWT; la diferenciación se hace por `tipo`, no por rol |
| Sonidos con Web Audio API nativa | Sin dependencias externas. Tres tonos distintos dan contexto sin que la cocina tenga que mirar la pantalla |
| Auditoría con snapshot, sin hard delete | Los pedidos entregados no se modifican destructivamente. La trazabilidad queda completa para reportes |
| `PagosPage` diferenciada por rol | El mozo gestiona cobros; el gerente supervisa y asigna; el owner solo lee. Misma ruta, interfaz distinta |

---

## 14. Problemas encontrados y resoluciones

### Namespace `/ws` faltante en la URL del socket

**Síntoma:** el socket conectaba pero los eventos no llegaban a la cocina ni al mozo.  
**Causa:** `io(WS_URL)` conectaba al namespace default `/` en lugar del namespace `/ws` del gateway.  
**Resolución:** `io(`${WS_URL}/ws`, {...})`.

### Emit del join race condition

**Síntoma:** la cocina/mozo entraba a la room pero los primeros eventos se perdían.  
**Causa:** el emit de `cocina:join` se enviaba antes de que el socket confirmara la conexión.  
**Resolución:** esperar el evento `connect` antes de emitir: `s.once('connect', () => s.emit('cocina:join', ...))`

### CI/CD: módulo ReportesModule no commiteado

**Síntoma:** el build en CI fallaba por import de `ReportesModule` que no existía en el repo.  
**Causa:** el archivo se creó localmente pero no se agregó al commit.  
**Resolución:** se commiteó el módulo y se corrió CI nuevamente.

### Duplicación de sesiones WebSocket en MesasPage

**Síntoma:** al recibir eventos WebSocket, se creaban entradas duplicadas en el store de sesiones activas.  
**Causa:** el handler agregaba una nueva entrada en lugar de actualizar la existente por ID.  
**Resolución:** se reemplazó `push` por `map` buscando por ID de sesión.

### Migraciones no aplicadas en producción (SESIÓN 09)

**Síntoma:** error `P2022` al intentar acceder a columnas nuevas en la tabla `pago`.  
**Causa:** el schema de Prisma tenía las columnas nuevas (`mozo_id`, `fecha_cobro`, `cobrado_por_nombre`) pero no se había aplicado la migración en Supabase.  
**Resolución:** se aplicó el SQL manualmente en el SQL Editor de Supabase y se marcó con `prisma migrate resolve --applied`.

---

*MenYU · De Marcos · Ojeda · Strumia Carrara · 2026*
