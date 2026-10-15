# Sesión: Pedidos, Kanban Cocina y Flujo Completo — MenYU

**Sprint:** feat/pedidos  
**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Fecha:** Mayo 2026

---

## Índice

1. [Qué se construyó](#1-qué-se-construyó)
2. [Correcciones de infraestructura local](#2-correcciones-de-infraestructura-local)
3. [Backend — módulo waiter-calls](#3-backend--módulo-waiter-calls)
4. [Backend — módulo pedidos (ampliaciones)](#4-backend--módulo-pedidos-ampliaciones)
5. [Gateway Socket.io — correcciones](#5-gateway-socketio--correcciones)
6. [web-cliente — carrito y pedido](#6-web-cliente--carrito-y-pedido)
7. [web-staff — Panel Cocina Kanban](#7-web-staff--panel-cocina-kanban)
8. [web-staff — Panel Mozo](#8-web-staff--panel-mozo)
9. [Selector de panel para admin](#9-selector-de-panel-para-admin)
10. [Seed de datos de prueba](#10-seed-de-datos-de-prueba)
11. [Variables de entorno](#11-variables-de-entorno)
12. [Configuración de producción (Vercel + Railway)](#12-configuración-de-producción-vercel--railway)
13. [Decisiones de diseño](#13-decisiones-de-diseño)
14. [Qué falta](#14-qué-falta)

---

## 1. Qué se construyó

### Backend (`apps/backend/`)

| Archivo | Cambio |
|---|---|
| `src/waiter-calls/` (nuevo módulo) | `POST /api/waiter-calls` — llamar al mozo |
| `src/pedidos/dto/update-estado-pedido.dto.ts` | Nuevo DTO para cambiar estado |
| `src/pedidos/pedidos.service.ts` | `actualizarEstado`, `listarPorEstado` |
| `src/pedidos/pedidos.controller.ts` | `PATCH /:id/estado` con `JwtAuthGuard`, `GET /` con filtros |
| `src/pedidos/dto/create-pedido.dto.ts` | `@IsUUID('all')` en lugar de `@IsUUID()` |
| `src/gateway/menyu.gateway.ts` | Handlers `cocina:join`, `mozo:join`; evento corregido `waiter:called` |
| `src/auth/auth.module.ts` | `expiresIn: '8h'` (antes 15m) |
| `src/sessions/sessions.module.ts` | `expiresIn: '12h'` (antes 15m) |
| `src/main.ts` | CORS acepta cualquier `localhost:*` en dev; producción usa `CORS_ORIGINS` |
| `prisma/seed.ts` | Seed idempotente con datos de prueba |
| `package.json` (backend) | Comando `prisma db seed` |

### Frontend web-cliente (`apps/web-cliente/`)

| Archivo | Cambio |
|---|---|
| `src/store/sessionStore.ts` | Agrega `jwt` y `mesaId`, persiste en `sessionStorage` |
| `src/store/carritoStore.ts` | Nuevo — carrito en memoria |
| `src/services/api.ts` | Auth header opcional, `sessions.open` retorna `jwt`/`mesaId`, nuevos métodos `waiterCalls.llamar` y `pedidos.confirmar` |
| `src/pages/menu/ClienteMenuPage.tsx` | Badge del carrito, botón "Llamar al mozo" con cooldown 3s |
| `src/pages/menu/ItemDetailPage.tsx` | Botón "Agregar al carrito" funcional; controles +/− para ingredientes `esAgregable` en sección "Incluye" |
| `src/pages/carrito/CarritoPage.tsx` | Nuevo — lista de ítems, total, botón "Confirmar pedido" |
| `src/App.tsx` | Agrega ruta `/carrito` |
| `.env` | `VITE_API_URL=http://localhost:3000/api` |

### Frontend web-staff (`apps/web-staff/`)

| Archivo | Cambio |
|---|---|
| `src/services/socket.ts` | Namespace `/ws` desde `VITE_WS_URL`, `joinRestauranteComoCocina`, `joinRestauranteComoMozo` con await connect, `onPedidoActualizado` |
| `src/store/cocinaStore.ts` | Nuevo — pedidos en Kanban |
| `src/store/mozoStore.ts` | Agrega `pedidosListos`, `agregarPedidoListo`, `marcarEntregado(id, jwt)` |
| `src/pages/cocina/CocinaPage.tsx` | Kanban 4 columnas + botones de avance con PATCH al backend |
| `src/pages/mozo/MozoPanel.tsx` | Carga pedidos listos al montar, sección siempre visible, suscripción a `order:updated` |
| `src/pages/selector/SelectorPage.tsx` | Nuevo — selector Cocina/Mozo para admin |
| `src/pages/login/LoginPage.tsx` | DEST agrega `admin: '/selector'` |
| `src/App.tsx` | Ruta `/selector`, roles `['mozo', 'cocina', 'admin']` en ProtectedRoute |
| `.env` | `VITE_API_URL=http://localhost:3000/api`, `VITE_WS_URL=http://localhost:3000` |

### Apps Expo (solo URL, sin lógica nueva)

| Archivo | Cambio |
|---|---|
| `apps/mozo/src/services/socket.ts` | Eventos corregidos: `waiter:called`, `order:updated`, `mozo:join` |

---

## 2. Correcciones de infraestructura local

### CORS
`main.ts` acepta cualquier origen `http://localhost:*` en desarrollo:

```typescript
origin: (origin, callback) => {
  if (!origin || origin.startsWith('http://localhost:')) {
    return callback(null, true)
  }
  const allowed = process.env.CORS_ORIGINS?.split(',') ?? CORS_ORIGINS
  callback(null, allowed.includes(origin))
}
```

En producción, se controla por `CORS_ORIGINS` en el env del backend (Railway).

### Expiración de tokens

| Token | Antes | Ahora | Motivo |
|---|---|---|---|
| Staff (auth) | 15m | 8h | Mozo/cocina trabajan un turno completo |
| Sesión cliente | 15m | 12h | Cliente puede navegar el menú largo tiempo |

### VITE_API_URL — convención

Las tres apps web usan `VITE_API_URL` **incluyendo el prefijo `/api`**:
```
VITE_API_URL=http://localhost:3000/api
```

El socket usa `VITE_WS_URL` **sin `/api`** (solo web-staff):
```
VITE_WS_URL=http://localhost:3000
```

Esto es coherente con cómo `packages/auth` construye sus requests: `${BASE}/auth/login`.

---

## 3. Backend — módulo waiter-calls

### Endpoint

```
POST /api/waiter-calls
Authorization: Bearer {session-jwt-cliente}
Body: { "sesionId": "uuid" }
Response: { "ok": true }
```

### Lógica

1. Verifica JWT (`tipo: 'cliente'`)
2. Busca `SesionMesa` con `include: { mesa: { select: { numero } } }`
3. `deleteMany` llamados pendientes de esa sesión + `create` nuevo (un activo a la vez)
4. Emite `gateway.emitMozoCalled(restauranteId, { sesionId, mesaNumero })`

El `restauranteId` viene del JWT del cliente (establecido cuando abrió la sesión).

### Modelo LlamadoMozo

Ya existía en el schema. No tiene `@unique` en `sesionId`, por eso se usa `deleteMany + create` en lugar de `upsert`.

---

## 4. Backend — módulo pedidos (ampliaciones)

### PATCH /api/pedidos/:id/estado

```
PATCH /api/pedidos/:id/estado
Authorization: Bearer {staff-jwt}  ← JwtAuthGuard (Passport)
Body: { "estado": "en_preparacion" | "listo" | "entregado" }
```

**Transiciones válidas:**
```
pendiente → en_preparacion → listo → entregado
```
Cualquier otra → `BadRequestException('Transición inválida: X → Y')`.

**Nota importante:** usa `@UseGuards(JwtAuthGuard)` (Passport) en lugar de verificación manual con `JwtService.verify()`. La verificación manual daba 401 porque la ruta no estaba siendo registrada en las primeras compilaciones. Con el guard de Passport funciona igual que el resto de los controllers protegidos.

### GET /api/pedidos

```
GET /api/pedidos?restauranteId=X&estado=listo
Authorization: Bearer {staff-jwt}
```

Retorna pedidos filtrados por restaurante y estado, con el mismo `include` completo (mesa, items, mods, ingredientes).

---

## 5. Gateway Socket.io — correcciones

### Evento corregido

```typescript
// Antes (bug)
this.server.emit('mozo:llamado', data)

// Después (correcto — coincide con lo que escucha MozoPanel)
this.server.emit('waiter:called', data)
```

### Handlers de join agregados

```typescript
@SubscribeMessage('cocina:join') // cocina entra a restaurante-${id}
@SubscribeMessage('mozo:join')   // mozo entra a restaurante-${id}
```

Ambos unen al cliente a la room `restaurante-${restauranteId}`. La separación por evento permite diferenciar roles en el futuro.

### Timing del join

`joinRestauranteComoCocina` y `joinRestauranteComoMozo` esperan el evento `connect` si el socket todavía no está conectado:

```typescript
if (s.connected) {
  s.emit('cocina:join', { restauranteId })
} else {
  s.once('connect', () => s.emit('cocina:join', { restauranteId }))
}
```

Sin esto, el emit se pierde y el cliente nunca entra a la room.

---

## 6. web-cliente — carrito y pedido

### Flujo completo del comensal

```
1. Abrir menú (restauranteId + PIN)
   → sessionStore guarda sesionId, mesaId, restauranteId, jwt

2. Explorar ítems
   → Cada ítem muestra ingredientes originales con controles de modificación:
      - esRemovible → botón "Quitar / Restaurar"
      - esAgregable → controles +/− con precio extra
      - ninguno    → "Fijo"

3. Agregar al carrito
   → carritoStore.agregar({ itemId, nombre, precioUnitario, cantidad: 1, mods })
   → navega a /carrito

4. Carrito
   → Lista de ítems con precio, botón "Quitar"
   → "Confirmar pedido" → POST /api/pedidos con sesionId, mesaId, items+mods

5. Éxito
   → vaciarCarrito()
   → "¡Pedido enviado!" → vuelve al menú en 2.5s

6. Llamar al mozo
   → Botón fijo debajo del header del menú
   → POST /api/waiter-calls con sesionId
   → Feedback en el botón (loading → ok → error), cooldown 3s
```

### Precálculo de precio con mods

```typescript
precioUnitario = precioBase
  + Σ(precioExtra de mods AGREGAR)
  - Σ(precioExtra de mods QUITAR)
```

El precio se calcula en el frontend al armar la tarjeta, y también lo recalcula el backend en la transaction al crear el pedido (snapshot).

### carritoStore

```typescript
interface CartItem {
  cartId: string        // ID único dentro del carrito
  itemId: string
  nombre: string
  precioUnitario: number
  cantidad: number      // siempre 1 al agregar; ajustable en carrito
  notas?: string
  mods: CartMod[]       // [{ itemIngredienteId, accion: 'AGREGAR'|'QUITAR', cantidad }]
}
```

El carrito es en memoria (sin persist). Se vacía al confirmar el pedido o al recargar la página.

---

## 7. web-staff — Panel Cocina Kanban

### Columnas

| Estado | Color | Botón |
|---|---|---|
| `pendiente` | Amarillo | "Iniciar preparación" |
| `en_preparacion` | Azul | "Marcar listo" |
| `listo` | Verde | — |
| `entregado` | Gris | — |

### Tarjeta de pedido

Muestra:
- **Mesa**: `mesa.numero` o `#${sesionId.slice(0,6)}` como fallback
- **Hora**: `createdAt` formateado `HH:mm`
- **Ítems**: `{cantidad}× {item.nombre}`
- **Notas**: en amarillo cursiva
- **Mods**: `+ Queso Extra` (verde) / `− Cebolla` (rojo)
  - Si cantidad > 1: `+ Carne ×2`

### Avance de estado

Botón → `PATCH /api/pedidos/:id/estado` con el JWT staff del `localStorage`.
Loading por tarjeta (no global). Botón deshabilitado durante el request.
Cuando el backend confirma, emite `order:updated` → el store actualiza y la tarjeta se mueve de columna.

### Problema detectado y solución

`ROOT` admin no tiene `restauranteId` en su JWT. Se resolvió con `SelectorPage` que guarda el `restauranteId` elegido en `mozoStore`, y `CocinaPage`/`MozoPanel` lo leen como fallback: `user?.restauranteId ?? mozoStore.restauranteId`.

---

## 8. web-staff — Panel Mozo

### Al montar

1. Carga pedidos actuales en estado `listo` via `GET /api/pedidos?restauranteId=X&estado=listo`
2. Se une a la room del restaurante via `mozo:join`
3. Suscribe a `waiter:called` → `addLlamado`
4. Suscribe a `order:updated` → si `estado === 'listo'` → `agregarPedidoListo`

### Secciones del panel

```
MozoPanel
├── Listos para entregar  ← siempre visible (vacío o con tarjetas)
│     PedidoListoCard: mesa, ítems, hora, botón "Entregado"
│       → PATCH /api/pedidos/:id/estado { estado: 'entregado' }
│       → desaparece del panel al confirmarse
│
├── Llamados pendientes
│     tarjeta por llamado: mesa, hora, botón "Atendido"
│       → marcarAtendido (solo local, sin backend por ahora)
│
└── Historial de hoy
```

### JWT en marcarEntregado

El JWT se pasa como parámetro desde el componente (`getToken()`), no se guarda en el store Zustand. Esto es intencional: Zustand es para estado de UI, no para credenciales.

---

## 9. Selector de panel para admin

`SelectorPage` (`/selector`) aparece cuando el usuario tiene `tipo: 'admin'` tras el login.

- Si el JWT tiene `restauranteId` (gerente/owner): el campo se pre-completa y los botones están habilitados
- Si no tiene (ROOT): muestra input para ingresar el ID del restaurante manualmente

```
Login admin → /selector → ingresá restauranteId → "Panel Cocina" o "Panel Mozo"
                                    ↓
                          setRestauranteId en mozoStore
                          navigate a /cocina o /mozo
```

---

## 10. Seed de datos de prueba

**Ejecutar:**
```bash
pnpm --filter @menyu/api exec prisma db seed
```

| Entidad | ID | Detalle |
|---|---|---|
| Restaurante | `22222222-2222-4222-a222-222222222222` | "Restaurante Seed" |
| Mesa | `33333333-3333-4333-a333-333333333333` | qrToken: `TEST-QR-SEED-002`, PIN: `9998` |
| Item | `66666666-6666-4666-a666-666666666666` | "Hamburguesa Seed", $1500 |
| ItemIng 1 | `77777777-7777-4777-a777-777777777777` | Queso Extra, AGREGAR, +$200 |
| ItemIng 2 | `88888888-8888-4888-a888-888888888888` | Cebolla, QUITAR, -$50 |

**Precio esperado con mods:** $1500 + $200 − $50 = **$1650**

**Credenciales dev:**
```
root@menyu.com / root1234
```

---

## 11. Variables de entorno

### Backend (`apps/backend/.env`)

```
DATABASE_URL=...
DIRECT_URL=...
JWT_SECRET=cambiar-en-produccion-usar-openssl-rand-base64-64
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### web-cliente (`apps/web-cliente/.env`)

```
VITE_API_URL=http://localhost:3000/api
```

### web-staff (`apps/web-staff/.env`)

```
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=http://localhost:3000
```

### web-admin (`apps/web-admin/.env`)

```
VITE_API_URL=http://localhost:3000/api
```

> Los `.env` son solo para desarrollo local. **No se commitean al repo.**

---

## 12. Configuración de producción (Vercel + Railway)

### Railway (backend)

Variables de entorno a configurar en el proyecto Railway:
```
DATABASE_URL=...
DIRECT_URL=...
JWT_SECRET=<secreto seguro generado con openssl>
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
CORS_ORIGINS=https://cliente.menyu.com,https://staff.menyu.com,https://admin.menyu.com
```

### Vercel — web-cliente

Variables de entorno en el proyecto Vercel:
```
VITE_API_URL=https://menyuapi-production.up.railway.app/api
```

### Vercel — web-staff

```
VITE_API_URL=https://menyuapi-production.up.railway.app/api
VITE_WS_URL=https://menyuapi-production.up.railway.app
```

### Vercel — web-admin

```
VITE_API_URL=https://menyuapi-production.up.railway.app/api
```

### Apps Expo (apps/cliente, apps/mozo)

URL hardcodeada en el código fuente. Para cambiar entre ambientes, modificar directamente los archivos:
- `apps/cliente/src/services/api.ts`
- `apps/cliente/src/services/socket.ts`
- `apps/cliente/src/store/menuStore.ts`
- `apps/cliente/src/app/(session)/index.tsx`
- `apps/mozo/src/app/(auth)/login.tsx`
- `apps/mozo/src/services/socket.ts`

> Pendiente: migrar a `EXPO_PUBLIC_API_URL` en `.env` para no tener URLs hardcodeadas.

---

## 13. Decisiones de diseño

**`JwtAuthGuard` en PATCH /pedidos/:id/estado:** la verificación manual de JWT con `JwtService.verify()` generaba 401 intermitentes (el PATCH route no se registraba en algunas compilaciones). Se migró a `@UseGuards(JwtAuthGuard)` (Passport), que es el mecanismo probado por todos los otros controllers protegidos del proyecto.

**Todos los tokens de estado usados internamente (mods.accion) son MAYÚSCULAS:** el DTO `CreatePedidoItemModDto` valida `@IsIn(['AGREGAR', 'QUITAR'])`. El frontend debe comparar con `.toUpperCase()` o comparar directamente en mayúsculas.

**`VITE_WS_URL` separado de `VITE_API_URL`:** el socket no usa el prefijo `/api`. Si usara `VITE_API_URL` para el socket, conectaría a `/api/ws` (no existe). La separación de variables evita este error.

**Emisión del socket DESPUÉS de la transaction:** `emitOrderNew` y `emitOrderUpdated` se llaman fuera del bloque `$transaction`. Si el emit falla, el pedido ya está guardado. No hay rollback de la BD por fallo de socket.

**carritoStore sin `persist`:** el carrito se vacía al recargar la página. En el contexto de una sesión de mesa (escaneo QR → pedir → pagar), esto es aceptable. El estado de sesión persiste en `sessionStorage`.

---

## 14. Qué falta

- **Marcar llamado al mozo como atendido en el backend:** el botón "Atendido" en `MozoPanel` solo actualiza el store local. Falta `PATCH /api/waiter-calls/:id/atender`.
- **Cargar pedidos existentes en CocinaPage al montar:** si la cocina recarga la página, el Kanban queda vacío. Falta `GET /api/pedidos?restauranteId=X&estado=pendiente,en_preparacion,listo`.
- **Migrar URLs hardcodeadas en Expo a variables de entorno:** usar `EXPO_PUBLIC_API_URL` en lugar de URLs hardcodeadas.
- **Módulo `orders/` deprecado:** el módulo `orders/` es el flujo viejo del cliente, distinto al nuevo `pedidos/`. Debería migrarse o eliminarse.
- **Push notifications al mozo:** actualmente el llamado solo llega si el mozo tiene la app abierta. Para pantalla bloqueada se necesitan Expo Notifications.
- **Cantidad en el carrito:** el carrito siempre agrega con `cantidad: 1`. Falta control de cantidad desde la pantalla del carrito.
- **Tests:** no se escribieron tests para los módulos nuevos.
