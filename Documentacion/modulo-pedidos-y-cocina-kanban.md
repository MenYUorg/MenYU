# Módulo Pedidos + Panel Kanban de Cocina — MenYU

**Sprint:** feat/pedidos  
**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Fecha:** Mayo 2026

---

## Índice

1. [Qué se construyó](#1-qué-se-construyó)
2. [Backend — módulo pedidos](#2-backend--módulo-pedidos)
3. [Endpoint POST /api/pedidos](#3-endpoint-post-apipedidos)
4. [Endpoint PATCH /api/pedidos/:id/estado](#4-endpoint-patch-apipedidosidestado)
5. [Gateway Socket.io](#5-gateway-socketio)
6. [Seed de datos de prueba](#6-seed-de-datos-de-prueba)
7. [Frontend — web-staff](#7-frontend--web-staff)
8. [Socket.ts — correcciones y nuevas funciones](#8-socketstscorrecciones-y-nuevas-funciones)
9. [cocinaStore](#9-cocinastore)
10. [CocinaPage — Panel Kanban](#10-cocinapage--panel-kanban)
11. [Decisiones de diseño](#11-decisiones-de-diseño)
12. [Qué falta](#12-qué-falta)

---

## 1. Qué se construyó

### Backend (`apps/backend/`)

| Archivo | Cambio |
|---|---|
| `src/pedidos/dto/create-pedido.dto.ts` | Nuevo — DTOs para crear pedido |
| `src/pedidos/dto/update-estado-pedido.dto.ts` | Nuevo — DTO para cambiar estado |
| `src/pedidos/pedidos.service.ts` | Nuevo — lógica de creación y transición de estado |
| `src/pedidos/pedidos.controller.ts` | Nuevo — endpoints POST y PATCH |
| `src/pedidos/pedidos.module.ts` | Nuevo — módulo NestJS |
| `src/app.module.ts` | Agrega `PedidosModule` a los imports |
| `src/gateway/menyu.gateway.ts` | Agrega `emitPedidoNuevo` → renombrado a `emitOrderNew`, handler `cocina:join` |
| `prisma/seed.ts` | Nuevo — datos de prueba con UUIDs v4 válidos |
| `package.json` (backend) | Agrega config `prisma.seed` para `ts-node` |

### Frontend (`apps/web-staff/`)

| Archivo | Cambio |
|---|---|
| `src/services/socket.ts` | Namespace `/ws`, `onPedidoNuevo`, `onPedidoActualizado`, `joinRestauranteComoCocina` |
| `src/store/cocinaStore.ts` | Nuevo — store Zustand para pedidos de cocina |
| `src/pages/cocina/CocinaPage.tsx` | Reemplaza placeholder con Kanban completo |
| `.env` | Nuevo — `VITE_API_URL=http://localhost:3000` |

---

## 2. Backend — módulo pedidos

El módulo vive en `apps/backend/src/pedidos/` y es **independiente** del módulo `orders/` preexistente. `orders/` es el flujo viejo del cliente (con DTO distinto, sin validación de `esAgregable`/`esRemovible`). `pedidos/` es el flujo nuevo y correcto.

### Autenticación

Ambos endpoints usan el mismo patrón del proyecto: `@Headers('authorization')` en el controller, verificación manual del JWT en el service via `JwtService.verify()`. No se usan guards de NestJS Passport.

- `POST /api/pedidos` → requiere JWT con `tipo: 'cliente'`
- `PATCH /api/pedidos/:id/estado` → requiere cualquier JWT válido con `tipo !== 'cliente'` (mozo o admin)

---

## 3. Endpoint POST /api/pedidos

**Ruta:** `POST /api/pedidos`  
**Auth:** Session JWT del cliente (tipo: `'cliente'`)

### DTO de entrada

```typescript
// create-pedido.dto.ts
class CreatePedidoItemModDto {
  @IsUUID('all') itemIngredienteId: string
  @IsIn(['AGREGAR', 'QUITAR']) accion: string
  @IsNumber() @Min(0.001) cantidad: number
}

class CreatePedidoItemDto {
  @IsUUID('all') itemId: string
  @IsInt() @Min(1) cantidad: number
  @IsOptional() @IsString() notas?: string
  @IsOptional() mods?: CreatePedidoItemModDto[]
}

class CreatePedidoDto {
  @IsUUID('all') sesionId: string
  @IsUUID('all') mesaId: string
  items: CreatePedidoItemDto[]
}
```

> **Nota:** Se usa `@IsUUID('all')` en lugar de `@IsUUID()` porque `class-validator 0.15.x` defaultea a UUID v4 estricto. `'all'` acepta cualquier UUID RFC 4122 válido.

### Lógica del service (dentro de `$transaction`)

Todo ocurre dentro de una única `prisma.$transaction` para garantizar atomicidad:

1. **Verificar sesión:** busca `SesionMesa` por `dto.sesionId`. Si no existe → `NotFoundException`. Si `estado !== 'activa'` → `BadRequestException`.

2. **Por cada ítem del DTO:**
   - Busca `ItemMenu` por `itemId` filtrando por `restauranteId` del JWT.
   - Lee `precioBase` como snapshot.
   - Por cada mod:
     - Busca `ItemIngrediente` por id.
     - Valida que `itemIngrediente.itemId === itemDto.itemId` (el modificador pertenece al ítem).
     - Si `accion = 'AGREGAR'`: valida `esAgregable = true`.
     - Si `accion = 'QUITAR'`: valida `esRemovible = true`.
     - Acumula precio: `+precioExtra` si AGREGAR, `-precioExtra` si QUITAR.

3. **Crear pedido** con nested writes: `pedido → items → mods` en una sola operación.

4. **Emit socket** (fuera de la transaction): `gateway.emitOrderNew(restauranteId, pedido)`.

### Cálculo de precioUnitario

```
precioUnitario = precioBase
  + Σ(precioExtra de mods AGREGAR)
  - Σ(precioExtra de mods QUITAR)
```

El precio se guarda como snapshot al momento del pedido. Si el admin cambia el precio del ítem después, los pedidos ya creados no se ven afectados.

### Respuesta incluida (select del backend)

```typescript
include: {
  mesa: { select: { numero: true } },
  items: {
    include: {
      item: { select: { nombre: true } },
      mods: {
        include: {
          itemIngrediente: {
            include: { ingrediente: { select: { nombre: true } } },
          },
        },
      },
    },
  },
}
```

Esto garantiza que el payload del socket tenga todos los datos que necesita el Kanban de cocina para renderizar las tarjetas (nombre del ítem, nombre del ingrediente modificado, número de mesa).

---

## 4. Endpoint PATCH /api/pedidos/:id/estado

**Ruta:** `PATCH /api/pedidos/:id/estado`  
**Auth:** JWT de staff (tipo: `'admin'` o `'mozo'`)

### DTO de entrada

```typescript
class UpdateEstadoPedidoDto {
  @IsString()
  @IsIn(['en_preparacion', 'listo', 'entregado'])
  estado: string
}
```

`'pendiente'` no está en el `@IsIn` porque es el estado inicial y nunca se "vuelve" a pendiente.

### Transiciones válidas

```
pendiente → en_preparacion
en_preparacion → listo
listo → entregado
```

Cualquier otra combinación → `BadRequestException('Transición inválida: X → Y')`.

La validación usa un mapa de transiciones:

```typescript
const TRANSICIONES: Record<string, string> = {
  pendiente: 'en_preparacion',
  en_preparacion: 'listo',
  listo: 'entregado',
}
if (TRANSICIONES[pedido.estado] !== dto.estado) throw BadRequestException(...)
```

### Flujo

1. Verifica JWT (válido y tipo ≠ cliente).
2. Busca el pedido con su mesa (para tener `restauranteId`).
3. Valida transición.
4. Actualiza estado en BD (mismo `include` que el POST para consistencia de payload).
5. Emite `gateway.emitOrderUpdated(restauranteId, pedidoActualizado)`.

---

## 5. Gateway Socket.io

**Archivo:** `apps/backend/src/gateway/menyu.gateway.ts`  
**Namespace:** `/ws`  
**Room pattern:** `restaurante-${restauranteId}`

### Handlers de join

| Evento entrante | Handler | Efecto |
|---|---|---|
| `session:join` | `handleJoinRestaurante` | Cliente se une a la room |
| `cocina:join` | `handleJoinCocina` | Cocina se une a la room (misma lógica) |

Se usan eventos distintos por semántica (en el futuro se puede diferenciar comportamiento por rol), pero ambos unen al cliente a la misma room `restaurante-${id}`.

### Eventos emitidos

| Método | Evento emitido | Payload |
|---|---|---|
| `emitOrderNew` | `order:new` | Pedido completo |
| `emitOrderUpdated` | `order:updated` | Pedido con estado nuevo |
| `emitMozoCalled` | `mozo:llamado` | `{ sesionId, mesaNumero }` |
| `emitSesionCerrada` | `sesion:cerrada` | `{ sesionId }` |

---

## 6. Seed de datos de prueba

**Archivo:** `apps/backend/prisma/seed.ts`

Crea datos idempotentes (upsert por id fijo) para desarrollo local:

| Entidad | ID (UUID v4) | Detalle |
|---|---|---|
| Marca | `11111111-1111-4111-a111-...` | "Marca Seed" |
| Restaurante | `22222222-2222-4222-a222-...` | "Restaurante Seed", modo abierto |
| Mesa | `33333333-3333-4333-a333-...` | qrToken: `TEST-QR-SEED-002`, pin: `9998` |
| ItemMenu | `66666666-6666-4666-a666-...` | "Hamburguesa Seed", $1500 |
| ItemIngrediente 1 | `77777777-7777-4777-a777-...` | Queso Extra, esAgregable=true, +$200 |
| ItemIngrediente 2 | `88888888-8888-4888-a888-...` | Cebolla, esRemovible=true, -$50 |

**Precio esperado con mods:** 1500 + 200 − 50 = **$1650**

**Ejecutar:**
```bash
pnpm --filter @menyu/api exec prisma db seed
```

> **Importante:** los IDs del seed usan formato `4xxx-axxx` para ser UUID v4 válidos. `class-validator @IsUUID('all')` rechaza IDs que no cumplan RFC 4122 aunque tengan formato correcto de guiones.

---

## 7. Frontend — web-staff

**Puerto:** 5175  
**URL backend:** `VITE_API_URL` en `.env` → `http://localhost:3000`

### Flujo de autenticación en web-staff

El usuario (mozo o cocina) hace login con email/contraseña via `POST /api/auth/login`. El JWT resultante tiene `tipo: 'mozo'` o `tipo: 'admin'` y contiene `restauranteId`. Este JWT es el que se usa para:
- Abrir el socket y unirse a la room del restaurante.
- Llamar `PATCH /api/pedidos/:id/estado`.

---

## 8. socket.ts — correcciones y nuevas funciones

**Archivo:** `apps/web-staff/src/services/socket.ts`

### Corrección: namespace `/ws`

```typescript
// Antes (no conectaba al namespace correcto)
socket = io(WS_URL, { ... })

// Después
socket = io(`${WS_URL}/ws`, { ... })
```

### Funciones

| Función | Evento | Descripción |
|---|---|---|
| `joinRestauranteComoMozo(id)` | emit `mozo:join` | Mozo se une a su room |
| `joinRestauranteComoCocina(id)` | emit `cocina:join` | Cocina se une a su room |
| `onMozoCalled(cb)` | on `waiter:called` | Escucha llamados de mesa |
| `onPedidoNuevo(cb: (Pedido) => void)` | on `order:new` | Escucha pedidos nuevos |
| `onPedidoActualizado(cb: (Pedido) => void)` | on `order:updated` | Escucha cambios de estado |
| `disconnect()` | — | Desconecta y limpia el singleton |

Todas las funciones `on*` retornan un cleanup `() => void` para usarse en `useEffect`.

---

## 9. cocinaStore

**Archivo:** `apps/web-staff/src/store/cocinaStore.ts`

Store Zustand para el estado local de la cocina:

```typescript
interface CocinaStore {
  pedidos: Pedido[]
  agregarPedido: (pedido: Pedido) => void
  actualizarEstado: (pedidoId: string, estado: EstadoPedido) => void
}
```

- `agregarPedido`: inserta el nuevo pedido al inicio del array (más reciente primero).
- `actualizarEstado`: hace un map sobre el array y reemplaza el estado del pedido por id.

`EstadoPedido` en `@menyu/types` usa **minúsculas** (`'pendiente'`, `'en_preparacion'`, `'listo'`, `'entregado'`, `'cancelado'`), igual que el backend. No requiere normalización.

---

## 10. CocinaPage — Panel Kanban

**Archivo:** `apps/web-staff/src/pages/cocina/CocinaPage.tsx`

### Estructura

```
CocinaPage
├── useEffect: socket setup (join + suscripción order:new + order:updated + cleanup)
├── Header: logo + "Cocina" + botón logout
└── Kanban (overflow-x scroll, 4 columnas)
    ├── Pendiente (borde amarillo)    → botón "Iniciar preparación"
    ├── En preparación (borde azul)  → botón "Marcar listo"
    ├── Listo (borde verde)           → sin botón
    └── Entregado (borde gris)        → sin botón
```

### PedidoCard

Cada tarjeta muestra:
- **Mesa:** `mesa.numero` si está disponible, sino `#${sesionId.slice(0,6)}`
- **Hora:** `createdAt` formateado como `HH:mm`
- **Items:** `{cantidad}× {item.nombre}`
- **Notas:** en amarillo si las hay
- **Mods:** `+ Queso Extra` (verde) / `− Cebolla` (rojo)
- **Botón de avance:** deshabilita durante el request para evitar doble click, muestra "Actualizando…"

### Tipos locales (PedidoRico)

El tipo `Pedido` de `@menyu/types` no modela los campos anidados (`item.nombre`, `ingrediente.nombre`, `mesa.numero`) que el backend sí devuelve. Se definen tipos locales en `CocinaPage.tsx` y se castea el pedido con `as PedidoRico` para el render, sin modificar el store (que sigue tipado con `Pedido[]`).

### Botón de avance — llamada al backend

El botón no solo actualiza el store local: hace `PATCH /api/pedidos/:id/estado` con el JWT del usuario logueado. El evento `order:updated` del socket también actualiza el store, lo que permite que múltiples pantallas de cocina estén sincronizadas en tiempo real.

```
[Botón click]
    → PATCH /api/pedidos/:id/estado
    → Backend actualiza BD
    → Backend emite order:updated via socket
    → onPedidoActualizado → actualizarEstado en store
    → Tarjeta se mueve de columna
```

---

## 11. Decisiones de diseño

**`pedidos/` independiente de `orders/`:** `orders/` tiene DTOs distintos (campos `itemMenuId`, `modificaciones`, valores de acción en minúscula) y no valida `esAgregable`/`esRemovible`. Se decidió crear un módulo nuevo en lugar de modificar el existente para no romper el flujo anterior mientras se itera.

**Validaciones dentro de la `$transaction`:** todas las validaciones de negocio (sesión activa, ítem existe, modificador válido, esAgregable/esRemovible) ocurren dentro de la transaction. Si cualquiera falla, el pedido no se crea parcialmente en la BD.

**`restauranteId` del JWT, no del body:** el `restauranteId` que se usa para validar que los ítems pertenecen al restaurante viene del JWT del cliente (establecido cuando abrió la sesión de mesa), no del body del pedido. Esto evita que un cliente malicioso pase un `restauranteId` falso.

**Snapshot de precio:** `precioUnitario` se calcula y se guarda al momento de crear el pedido. Cambios posteriores en `precioBase` o `precioExtra` de los ingredientes no afectan pedidos ya creados.

**`emitOrderNew` y `emitOrderUpdated` fuera de la transaction:** los emits de socket van después de que la transaction commitea. Si el emit falla (el socket no está disponible), el pedido ya está guardado. No hay rollback del pedido por un fallo de socket.

**Loading por tarjeta, no global:** el estado `loading` del botón es local a cada `PedidoCard` (`useState`), no en el store global. Esto permite que múltiples tarjetas se puedan avanzar de estado de forma independiente.

---

## 12. Qué falta

- **Cargar pedidos existentes al montar:** la `CocinaPage` actualmente solo recibe pedidos que llegan via socket mientras está abierta. Si se recarga la página, el Kanban queda vacío. Falta un `GET /api/pedidos?restauranteId=X&estado=pendiente,en_preparacion,listo` al montar.
- **Módulo `orders/` deprecado:** debería migrarse al nuevo flujo de `pedidos/` o eliminarse para evitar confusión.
- **Integración del Kanban con la app mozo:** el mozo necesita ver los pedidos en estado `listo` para saber qué llevar a la mesa y marcarlos como `entregado`.
- **Autenticación real de cocina:** el panel de cocina se maneja con el mismo JWT de mozo/admin. En el futuro puede tener un rol específico `'cocina'`.
- **Tests:** no se escribieron tests para el módulo de pedidos.
