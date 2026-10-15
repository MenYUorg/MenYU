# Módulo Waiter Calls + Panel Mozo — MenYU

**Sprint:** feat/pedidos  
**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Fecha:** Mayo 2026

---

## Índice

1. [Qué se construyó](#1-qué-se-construyó)
2. [Backend — módulo waiter-calls](#2-backend--módulo-waiter-calls)
3. [Corrección del gateway](#3-corrección-del-gateway)
4. [web-cliente — botón Llamar al mozo](#4-web-cliente--botón-llamar-al-mozo)
5. [web-staff — mozoStore](#5-web-staff--mozostore)
6. [web-staff — MozoPanel](#6-web-staff--mozopanel)
7. [Decisiones de diseño](#7-decisiones-de-diseño)
8. [Qué falta](#8-qué-falta)

---

## 1. Qué se construyó

### Backend (`apps/backend/`)

| Archivo | Cambio |
|---|---|
| `src/waiter-calls/dto/create-waiter-call.dto.ts` | Nuevo — DTO con `sesionId: UUID` |
| `src/waiter-calls/waiter-calls.service.ts` | Nuevo — lógica de llamado al mozo |
| `src/waiter-calls/waiter-calls.controller.ts` | Nuevo — `POST /api/waiter-calls` |
| `src/waiter-calls/waiter-calls.module.ts` | Nuevo — módulo NestJS |
| `src/app.module.ts` | Registra `WaiterCallsModule` |
| `src/gateway/menyu.gateway.ts` | Corrige evento `'mozo:llamado'` → `'waiter:called'`, agrega handler `mozo:join` |

### Frontend

| Archivo | Cambio |
|---|---|
| `web-cliente/.env` | Nuevo — `VITE_API_URL=http://localhost:3000/api` |
| `web-cliente/src/store/sessionStore.ts` | Agrega campo `jwt`, lo persiste en `sessionStorage` |
| `web-cliente/src/services/api.ts` | Auth header opcional en `req`, `sessions.open` retorna `jwt`, nuevo `waiterCalls.llamar` |
| `web-cliente/src/pages/menu/ClienteMenuPage.tsx` | Agrega componente `LlamarMozoBtn` |
| `web-staff/src/store/mozoStore.ts` | Agrega `pedidosListos`, `agregarPedidoListo`, `marcarEntregado` |
| `web-staff/src/pages/mozo/MozoPanel.tsx` | Join a la room, suscripción a `order:updated`, sección "Listos para entregar" |

---

## 2. Backend — módulo waiter-calls

### Autenticación

Mismo patrón que el resto del proyecto: `@Headers('authorization')` en el controller, verificación manual del JWT en el service. Requiere JWT con `tipo: 'cliente'`.

### Endpoint

**`POST /api/waiter-calls`**

Body:
```json
{ "sesionId": "uuid-de-la-sesion" }
```

Respuesta:
```json
{ "ok": true }
```

### Lógica del service

```
1. Verificar JWT (tipo cliente)
2. Buscar SesionMesa con include de mesa.numero
   → 404 si no existe
   → 400 si estado !== 'activa'
3. Persistir en LlamadoMozo:
   - deleteMany llamados pendientes de esa sesión (evita duplicados)
   - create nuevo LlamadoMozo
4. Emitir gateway.emitMozoCalled(restauranteId, { sesionId, mesaNumero })
5. Retornar { ok: true }
```

El `restauranteId` para el emit viene del JWT del cliente (fue establecido cuando abrió la sesión de mesa), no del body.

### Modelo LlamadoMozo (ya existía en el schema)

```prisma
model LlamadoMozo {
  id        String   @id @default(uuid())
  sesionId  String   @map("sesion_id")
  mozoId    String?  @map("mozo_id")
  estado    String   @default("pendiente")
  createdAt DateTime @default(now()) @map("created_at")
}
```

`sesionId` no tiene `@unique` en el schema, por eso se implementó como `deleteMany` + `create` en lugar de `upsert`.

---

## 3. Corrección del gateway

Se encontraron dos bugs preexistentes:

**Bug 1 — Evento incorrecto:**  
`emitMozoCalled` emitía `'mozo:llamado'` pero `MozoPanel` escuchaba `'waiter:called'`. Los llamados nunca llegaban al mozo.

```typescript
// Antes
this.server.to(...).emit('mozo:llamado', data)

// Después
this.server.to(...).emit('waiter:called', data)
```

**Bug 2 — Handler faltante para mozo:**  
`MozoPanel` nunca llamaba `joinRestauranteComoMozo` y, aunque lo hubiera hecho, `mozo:join` no tenía handler en el backend. El mozo nunca entraba a la room del restaurante.

Se agregó:
```typescript
@SubscribeMessage('mozo:join')
handleJoinMozo(@MessageBody() data: { restauranteId: string }, @ConnectedSocket() client: Socket) {
  void client.join(`restaurante-${data.restauranteId}`)
  return { ok: true }
}
```

Y en `MozoPanel.tsx` se agregó la llamada al montar:
```typescript
socketService.joinRestauranteComoMozo(restauranteId)
```

---

## 4. web-cliente — botón Llamar al mozo

### Problema del JWT en web-cliente

`sessionStore.ts` en `web-cliente` no guardaba el JWT que devuelve `POST /api/sessions/open`. Se agregó:
- Campo `jwt: string | null` en el store
- Clave `menyu_sesion_jwt` en `sessionStorage`
- El JWT se captura en `openSession` y se limpia en `clear()`

### VITE_API_URL

Las rutas en `web-cliente/src/services/api.ts` usan formato `/sessions/open`, `/menu/:id` (sin prefijo `/api`). Por eso `VITE_API_URL` se configura como `http://localhost:3000/api` (incluyendo el prefijo). El nuevo endpoint también sigue este mismo formato: `/waiter-calls`.

### api.ts — cambios

```typescript
// req ahora acepta token opcional
async function req<T>(method, path, body?, token?): Promise<T>

// sessions.open retorna jwt
req<{ sesionId: string; esAnfitrion: boolean; codigoSesion: string; jwt: string }>

// nuevo método
waiterCalls: {
  llamar: (sesionId: string, jwt: string) =>
    req<{ ok: boolean }>('POST', '/waiter-calls', { sesionId }, jwt)
}
```

### Componente LlamarMozoBtn

Estados del botón:

| Estado | Label | Color | Duración |
|---|---|---|---|
| `idle` | "Llamar al mozo" | Blanco con borde naranja | indefinido |
| `loading` | "Llamando…" | deshabilitado | hasta respuesta |
| `ok` | "¡Mozo en camino!" | Verde | 3 segundos |
| `error` | "Error, intentá de nuevo" | Rojo | 3 segundos |

El botón se deshabilita durante `loading`, `ok` y `error` para evitar spam. Se ubica debajo del header del menú, visible solo cuando hay `sesionId` y `jwt` disponibles (es decir, solo cuando hay una sesión activa).

---

## 5. web-staff — mozoStore

### Nuevos campos y acciones

```typescript
pedidosListos: Pedido[]
agregarPedidoListo: (pedido: Pedido) => void
marcarEntregado: (pedidoId: string, jwt: string) => Promise<void>
```

`agregarPedidoListo` usa `filter + push` para evitar duplicados si llega el mismo pedido dos veces via socket.

### marcarEntregado — JWT como parámetro

`marcarEntregado` recibe el JWT desde el componente, no lo guarda en el store. El flujo es:

```
PedidoListoCard (MozoPanel)
  → llama marcarEntregado(pedido.id, getToken())
  → fetch PATCH /api/pedidos/:id/estado { estado: 'entregado' }
  → si OK: remueve el pedido de pedidosListos en el store
  → si error: lanza excepción (el componente la atrapa y loguea)
```

Esta decisión evita guardar tokens en Zustand (antipatrón) y mantiene el store enfocado en estado de UI, no en credenciales.

---

## 6. web-staff — MozoPanel

### Flujo completo al montar

```typescript
useEffect(() => {
  joinRestauranteComoMozo(restauranteId)  // entra a la room del restaurante

  const unsubLlamado = onMozoCalled((data) => addLlamado(data))

  const unsubPedido = onPedidoActualizado((pedido) => {
    if (pedido.estado === 'listo') agregarPedidoListo(pedido)
    // otros estados los maneja CocinaPage, no MozoPanel
  })

  return () => { unsubLlamado(); unsubPedido(); disconnect() }
}, [user?.restauranteId])
```

### Secciones del panel

```
MozoPanel
├── Header: logo + email + logout
├── [si hay pedidosListos] Listos para entregar
│     → PedidoListoCard: mesa, items, hora, botón "Entregado"
│         → llama marcarEntregado → PATCH /api/pedidos/:id/estado
│         → desaparece del panel al confirmarse
├── Llamados pendientes
│     → tarjeta por llamado: mesa, hora, botón "Atendido"
│         → marcarAtendido en store (solo local, sin backend)
└── [si hay atendidos] Historial de hoy
```

### PedidoListoCard — loading por tarjeta

Estado `loading` local con `useState`, igual que `PedidoCard` en `CocinaPage`. Mientras procesa: botón dice "Guardando…" y está deshabilitado. Si hay error: se loguea en consola y el botón vuelve a estar disponible.

---

## 7. Decisiones de diseño

**JWT como parámetro en `marcarEntregado`:** Zustand es para estado de UI, no para credenciales. El componente lee el JWT de `useAuth().getToken()` (que lo obtiene de `localStorage`) y lo pasa al action del store. Si en el futuro se necesita refrescar el token, el componente es el lugar correcto para hacerlo antes de llamar al store.

**`deleteMany` + `create` en lugar de `upsert`:** `LlamadoMozo` no tiene `@unique` en `sesionId`, por lo que Prisma no permite hacer upsert directo por ese campo. Se usa `deleteMany` de llamados pendientes de esa sesión + `create` nuevo para garantizar un solo llamado activo por sesión.

**`onPedidoActualizado` en MozoPanel filtra por `estado === 'listo'`:** el mozo solo necesita ver pedidos listos para entregar. Los demás estados (`en_preparacion`, `entregado`) los maneja `CocinaPage`. Esto evita que el panel del mozo se llene con ruido de otros cambios de estado.

**`VITE_API_URL` en web-cliente incluye `/api`:** las rutas existentes en `api.ts` no tienen prefijo `/api` (ej: `/menu/:id`, `/sessions/open`). Para no romper el contrato existente y mantener consistencia, se configuró la variable de entorno como `http://localhost:3000/api`. Los nuevos endpoints siguen el mismo patrón.

**Eventos socket unificados por room:** todos los roles (cocina, mozo, cliente si lo necesita) se unen a `restaurante-${restauranteId}`. Se diferencia por el evento de join (`cocina:join`, `mozo:join`, `session:join`) aunque actualmente todos hacen lo mismo. La separación permite en el futuro filtrar qué eventos recibe cada rol.

---

## 8. Qué falta

- **Marcar llamado como atendido en el backend:** el botón "Atendido" en `MozoPanel` solo actualiza el store local. No persiste el cambio en `LlamadoMozo.estado`. Falta un `PATCH /api/waiter-calls/:id/atender`.
- **Cargar llamados y pedidos listos al montar:** si el mozo recarga la página, pierde el historial de llamados y pedidos listos. Falta un `GET /api/waiter-calls?restauranteId=X&estado=pendiente` y `GET /api/pedidos?restauranteId=X&estado=listo`.
- **Botón "Llamar al mozo" en apps/cliente (Expo):** `features/waiter-call/index.ts` está vacío. La app nativa no tiene el flujo implementado.
- **Notificación push al mozo:** actualmente el llamado llega solo si el mozo tiene la app abierta. Para recibirlo con pantalla bloqueada se necesitan push notifications (Expo Notifications en `apps/mozo`).
