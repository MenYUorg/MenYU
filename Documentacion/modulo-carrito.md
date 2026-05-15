# Módulo Carrito — MenYU

**Sprint:** feat/carrito  
**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Fecha:** Mayo 2026

---

## Índice

1. [Qué se construyó](#1-qué-se-construyó)
2. [Tipo compartido — ItemCarrito](#2-tipo-compartido--itemcarrito)
3. [Store Zustand — useCarritoStore](#3-store-zustand--usecarritostore)
4. [Estado](#4-estado)
5. [Acciones](#5-acciones)
6. [Getters](#6-getters)
7. [Decisiones de diseño](#7-decisiones-de-diseño)
8. [Qué falta](#8-qué-falta)

---

## 1. Qué se construyó

Dos archivos nuevos, sin tocar nada existente fuera de esos dos paquetes:

| Archivo | Paquete |
|---|---|
| `packages/types/src/cart.types.ts` | `@menyu/types` |
| `apps/cliente/src/stores/useCarritoStore.ts` | `@menyu/cliente` |

También se actualizó `packages/types/src/index.ts` para re-exportar el nuevo tipo.

---

## 2. Tipo compartido — ItemCarrito

**Archivo:** `packages/types/src/cart.types.ts`

```typescript
export interface ItemCarrito {
  id: string
  nombre: string
  precio: number
  cantidad: number
  imagenUrl?: string
}
```

El tipo vive en `@menyu/types` (igual que todos los tipos del dominio) para que pueda ser importado tanto desde `apps/cliente` como desde cualquier otra app que lo necesite en el futuro.

`imagenUrl` es opcional porque no todos los ítems del menú tienen imagen cargada.

La re-exportación se agregó en `packages/types/src/index.ts`:

```typescript
export * from './cart.types'
```

---

## 3. Store Zustand — useCarritoStore

**Archivo:** `apps/cliente/src/stores/useCarritoStore.ts`

Implementado con Zustand v5 (ya instalado en `apps/cliente/package.json` como `^5.0.3`). No usa `persist` ni ningún middleware — el carrito es estado en memoria, se resetea al cerrar la app.

```typescript
import { create } from 'zustand'
import type { ItemCarrito } from '@menyu/types'
```

La interfaz del store:

```typescript
interface CarritoState {
  items: ItemCarrito[]
  agregarItem: (item: Omit<ItemCarrito, 'cantidad'>) => void
  quitarItem: (itemId: string) => void
  actualizarCantidad: (itemId: string, cantidad: number) => void
  vaciarCarrito: () => void
  total: () => number
  cantidadTotal: () => number
}
```

---

## 4. Estado

| Campo | Tipo | Valor inicial |
|---|---|---|
| `items` | `ItemCarrito[]` | `[]` |

Un array plano de ítems. Cada ítem tiene su `cantidad` embebida — no hay estructura anidada ni mapa por id. Esto simplifica la iteración en la UI.

---

## 5. Acciones

### `agregarItem(item: Omit<ItemCarrito, 'cantidad'>)`

El caller no pasa `cantidad` — siempre se agrega de a uno.

- Si el ítem **ya existe** en el carrito (mismo `id`): incrementa `cantidad` en 1.
- Si **no existe**: lo inserta con `cantidad: 1`.

```typescript
agregarItem: (item) =>
  set((state) => {
    const existing = state.items.find((i) => i.id === item.id)
    if (existing) {
      return {
        items: state.items.map((i) =>
          i.id === item.id ? { ...i, cantidad: i.cantidad + 1 } : i,
        ),
      }
    }
    return { items: [...state.items, { ...item, cantidad: 1 }] }
  }),
```

### `quitarItem(itemId: string)`

Elimina el ítem completamente del carrito, sin importar su cantidad actual.

```typescript
quitarItem: (itemId) =>
  set((state) => ({ items: state.items.filter((i) => i.id !== itemId) })),
```

### `actualizarCantidad(itemId: string, cantidad: number)`

Permite al usuario escribir o ajustar la cantidad directamente (por ejemplo desde un input numérico).

- Si `cantidad <= 0`: elimina el ítem (equivalente a `quitarItem`).
- Si `cantidad > 0`: actualiza la cantidad del ítem.

```typescript
actualizarCantidad: (itemId, cantidad) =>
  set((state) => {
    if (cantidad <= 0) {
      return { items: state.items.filter((i) => i.id !== itemId) }
    }
    return {
      items: state.items.map((i) => (i.id === itemId ? { ...i, cantidad } : i)),
    }
  }),
```

### `vaciarCarrito()`

Resetea el array a vacío. Se llama al confirmar el pedido o al cerrar la sesión de mesa.

```typescript
vaciarCarrito: () => set({ items: [] }),
```

---

## 6. Getters

Son funciones que viven dentro del store y leen el estado actual vía `get()` en el momento de la llamada. No son hooks externos, se acceden igual que las acciones:

```typescript
const total = useCarritoStore((s) => s.total)
const precio = total()
```

### `total(): number`

Suma de `precio * cantidad` para cada ítem del carrito.

```typescript
total: () => get().items.reduce((acc, i) => acc + i.precio * i.cantidad, 0),
```

### `cantidadTotal(): number`

Suma de todas las cantidades. Útil para el badge del ícono del carrito.

```typescript
cantidadTotal: () => get().items.reduce((acc, i) => acc + i.cantidad, 0),
```

---

## 7. Decisiones de diseño

**Sin persist:** el carrito no se persiste en storage. Si el cliente cierra la app a mitad de un pedido, pierde lo que tenía. Esto es aceptable para el MVP — la sesión de mesa sí persiste (vía `sessionStore`), y el pedido solo existe en el backend una vez enviado.

**Getters dentro del store, no hooks externos:** se eligió el patrón `get()` interno en lugar de selectores externos con `useShallow` para mantener la lógica concentrada en un solo archivo y no requerir imports adicionales en los componentes.

**`Omit<ItemCarrito, 'cantidad'>` en `agregarItem`:** el componente de menú no sabe cuántas unidades hay en el carrito — esa responsabilidad es del store. Así el caller solo pasa los datos del ítem del menú y el store gestiona la cantidad.

**Directorio `stores/` separado de `store/`:** el store existente de la sesión (`store/sessionStore.ts`) y del usuario (`store/userStore.ts`) viven en `store/`. El carrito se ubicó en `stores/` según la convención indicada para este sprint. `store/cartStore.ts` queda como placeholder vacío de los sprints anteriores y no se tocó.

---

## 8. Qué falta

- Conectar `useCarritoStore` a los componentes de menú (`ItemCard`, pantalla de detalle de ítem).
- Pantalla del carrito: lista de ítems con controles de cantidad, total, botón "Confirmar pedido".
- Al confirmar el pedido: llamar al endpoint `POST /orders`, luego `vaciarCarrito()`.
- Decidir si agregar `persist` en una iteración posterior (probable no, ya que el pedido se envía rápido dentro de la sesión de mesa).
