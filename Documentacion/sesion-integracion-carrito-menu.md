# Integración carrito ↔ menú — Resumen de cambios

Fecha: 2026-05-16  
Rama de trabajo: `fix/casos-uso-login`

---

## 1. Resolución de conflictos de merge

### `fix/casos-uso-login` → `main`

| Archivo | Decisión |
|---|---|
| `.claude/settings.json` | Se conservaron ambos bloques de permisos (son aditivos) |
| `pnpm-lock.yaml` (resolución de packages) | Se conservó `main` en todos los casos — la rama `fix/casos-uso-login` tenía `jsdom@25` + `vitest` que no aplican a Expo/React Native |
| `apps/cliente/package.json` (scripts de test) | Se conservó `main` (`jest`, `jest --watch`, `jest --coverage`) — Vitest no tiene soporte para React Native |
| `apps/cliente/package.json` (devDependencies) | Se conservó `main` (`jest-expo`, `@testing-library/react-native`, `@types/jest`) |
| `apps/cliente/src/app/_layout.tsx` | Se combinaron ambos lados: `user`, `logout` de `fix/casos-uso-login` + `currentPage` state de `main` |

**Criterio general:** los conflictos del lockfile de `fix/casos-uso-login` introducían `jsdom@25` y `vitest` como dependencias del cliente, lo cual es incorrecto para un proyecto Expo. Se descartó toda esa cadena de dependencias y se conservó el setup de `jest-expo`.

---

## 2. Compatibilidad carrito ↔ menú

### Problema detectado

Había dos definiciones incompatibles de `ItemCarrito`:

- `packages/types/src/cart.types.ts` → tipo simple con `id`, `nombre`, `precio`, `cantidad`, `imagenUrl` (obsoleto)
- `packages/types/src/order.types.ts` → tipo correcto alineado con la DB: `itemMenuId`, `precioBase`, `modificaciones[]`, `precioTotal`

Además el `cartStore.ts` estaba vacío y el botón "Agregar al carrito" no tenía lógica.

---

## 3. Cambios en `@menyu/types`

### `packages/types/src/cart.types.ts`

**Antes:** definía un `ItemCarrito` simple e incompatible con el backend.  
**Después:** define `ItemCarritoUI` que extiende `ItemCarrito` de `order.types.ts` agregando campos de presentación:

```typescript
import type { ItemCarrito } from './order.types'

export interface ItemCarritoUI extends ItemCarrito {
  nombre: string
  imagenUrl?: string | null
}
```

### `packages/types/src/socket/events.ts`

Se alinearon los nombres de eventos con los que el gateway realmente emite:

```typescript
export interface ServerToClientEvents {
  'order:new': (pedido: Pedido) => void       // era 'pedido:nuevo' en el gateway
  'order:updated': (pedido: Pedido) => void   // era 'pedido:estado' en el gateway
  'waiter:called': (llamado: LlamadoMozo) => void
  'session:closed': (sesionId: string) => void
}

export interface ClientToServerEvents {
  'session:join': (data: { restauranteId: string }) => void  // corregido: toma objeto
  'waiter:call': (sesionId: string) => void
}
```

---

## 4. Store del carrito

**Archivo:** `apps/cliente/src/store/cartStore.ts`

Implementado con Zustand. Cada entrada del carrito es un `ItemCarritoUI` indexado por posición (un mismo ítem con distintas modificaciones genera entradas separadas).

**Acciones:**

| Acción | Descripción |
|---|---|
| `agregar(item)` | Agrega un nuevo ítem al carrito |
| `quitar(index)` | Elimina el ítem en la posición dada |
| `incrementar(index)` | Suma 1 a la cantidad, recalcula `precioTotal` |
| `decrementar(index)` | Resta 1; si llega a 0, elimina el ítem |
| `limpiar()` | Vacía el carrito completo |
| `total()` | Retorna la suma de `precioTotal` de todos los ítems |

**Cálculo de precio unitario en `incrementar`/`decrementar`:**
```ts
const precioUnitario = item.precioTotal / item.cantidad
```

---

## 5. Pantalla de detalle de ítem

**Archivo:** `apps/cliente/src/app/(session)/menu/[itemId].tsx`

Se conectó el botón "Agregar al carrito" (`onPress` estaba vacío). La lógica:

1. Itera `removidos` (Set de IDs de ingredientes quitados) → genera mods con `accion: 'quitar'`
2. Itera `agregados` (Map de ID → cantidad de extras) → genera mods con `accion: 'agregar'`
3. Construye un `ItemCarritoUI` con `precioTotal` calculado en el frontend
4. Llama a `cartStore.agregar()` y vuelve al menú con `router.back()`

```typescript
agregarAlCarrito({
  itemMenuId: item.id,
  cantidad: 1,
  precioBase: Number(item.precioBase),
  modificaciones,   // ModificacionIngrediente[]
  precioTotal,      // precioBase + suma de extras
  nombre: item.nombre,
  imagenUrl: item.imagenUrl,
})
```

---

## 6. Módulo de pedidos — Backend

**Archivos creados:**

```
apps/backend/src/orders/
├── dto/
│   └── create-order.dto.ts
├── orders.service.ts
├── orders.controller.ts
└── orders.module.ts
```

### Endpoint

```
POST /api/orders
Authorization: Bearer <session-jwt>
```

**Body:**
```json
{
  "items": [
    {
      "itemMenuId": "uuid",
      "cantidad": 2,
      "modificaciones": [
        { "itemIngredienteId": "uuid", "accion": "quitar", "cantidad": 1 },
        { "itemIngredienteId": "uuid", "accion": "agregar", "cantidad": 2 }
      ],
      "nota": "sin sal"
    }
  ]
}
```

### Lógica del servicio

1. Valida el session JWT (extrae `sesionId`, `mesaId`, `restauranteId`, `clienteId`)
2. Verifica que la sesión esté activa
3. Busca los ítems en DB filtrando por `restauranteId` (seguridad: no se pueden pedir ítems de otro restaurante)
4. **Recalcula el precio server-side** ignorando el precio que manda el cliente:
   ```
   precioUnitario = precioBase + Σ(precioExtra × cantidad) para mods 'agregar'
   ```
5. Crea `Pedido` + `PedidoItem[]` + `PedidoItemMod[]` en una transacción
6. Emite `order:new` por WebSocket al room del restaurante

### Registro en `app.module.ts`

Se agregó `OrdersModule` a los imports del módulo raíz.

---

## 7. Gateway WebSocket

**Archivo:** `apps/backend/src/gateway/menyu.gateway.ts`

Se renombraron los métodos para alinearlos con los tipos:

| Antes | Después | Evento emitido |
|---|---|---|
| `emitPedidoNuevo()` | `emitOrderNew()` | `'order:new'` |
| `emitPedidoEstado()` | `emitOrderUpdated()` | `'order:updated'` |

---

## 8. Pantalla del menú

**Archivo:** `apps/cliente/src/app/(session)/menu.tsx`

### Fixes aplicados

**Bug 1 — Ítems directos no se mostraban**  
El menú solo renderizaba ítems dentro de subcategorías. Los ítems asignados directo a una categoría (sin subcategoría) quedaban invisibles.

**Solución:** se agregó renderizado de `cat.itemsDirectos` y se corrigió el filtro para incluir categorías que tengan ítems directos:
```ts
.filter((cat) => cat.itemsDirectos.length > 0 || cat.subcategorias.length > 0)
```

**Bug 2 — `menuStore.getItemById` no buscaba en `itemsDirectos`**  
La pantalla de detalle del ítem no encontraba ítems directos, mostrando "Ítem no encontrado".

**Solución:** se agregó la búsqueda en `itemsDirectos` antes de buscar en subcategorías.

### Ícono del carrito

Se agregó un botón 🛒 en el header superior derecho con badge naranja que muestra la cantidad de ítems. Navega a `/(session)/carrito`.

---

## 9. Pantalla del carrito

**Archivo:** `apps/cliente/src/app/(session)/carrito.tsx` *(nuevo)*

Pantalla de Expo Router que muestra los ítems del `cartStore`. Funcionalidades:

- Listado de ítems con nombre, imagen placeholder si no hay URL, precio total
- Botones − / + por ítem para cambiar cantidad (− en cantidad 1 elimina el ítem)
- Botón "Eliminar" para quitar un ítem directamente
- Total calculado en tiempo real
- Estado vacío con mensaje
- Botón "Confirmar pedido" (conectar al endpoint `POST /api/orders` — pendiente)

---

## 10. Bug fix: apertura de sesión

**Archivo:** `apps/cliente/src/app/check-in.tsx`

El campo enviado al backend estaba en inglés:
```ts
// ❌ Antes
void handleSubmit({ restaurantId: restaurantId.trim(), pin })

// ✅ Después
void handleSubmit({ restauranteId: restaurantId.trim(), pin })
```

El backend espera `restauranteId` según el `OpenSessionDto`.

---

## 11. Dependencias instaladas

```bash
# WebSocket (faltaban en backend)
pnpm --filter @menyu/api add @nestjs/websockets @nestjs/platform-socket.io socket.io

# Prisma regenerado (cliente desactualizado respecto al schema)
pnpm --filter @menyu/api exec prisma generate
```

---

## 12. Flujo completo de prueba (Postman + browser)

1. `POST /api/auth/login` → obtener token de admin
2. `POST /api/categorias` → crear categoría con `restauranteId`
3. `POST /api/ingredientes` → crear ingrediente
4. `POST /api/items` → crear ítem con `categoriaId`
5. `POST /api/items/:id/ingredientes` → asociar ingrediente al ítem
6. `GET /api/menu/:restauranteId` → verificar que aparece
7. `GET /api/mesas?restauranteId=...` → obtener PIN de mesa
8. En el browser: ingresar `restauranteId` + PIN → abrir sesión
9. Navegar al menú → el ítem aparece
10. Abrir detalle → modificar ingredientes → "Agregar al carrito"
11. Tocar 🛒 → ver carrito → ajustar cantidades

---

## Pendiente

- Conectar botón "Confirmar pedido" en `carrito.tsx` con `POST /api/orders` usando el session JWT
- Mostrar nombres de ingredientes en las modificaciones del carrito (actualmente muestra el `itemIngredienteId`)
