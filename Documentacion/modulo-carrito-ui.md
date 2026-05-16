# Módulo Carrito — UI (feat/carrito)

**Sprint:** feat/carrito  
**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Fecha:** Mayo 2026

---

## Índice

1. [Qué se construyó](#1-qué-se-construyó)
2. [Arquitectura de componentes](#2-arquitectura-de-componentes)
3. [CantidadControl](#3-cantidadcontrol)
4. [MenuItemCard](#4-menuitemcard)
5. [CarritoItem](#5-carritoitem)
6. [MenuScreen](#6-menuscreen)
7. [CarritoScreen](#7-carritoscreen)
8. [Paleta de estilos](#8-paleta-de-estilos)
9. [Decisiones de diseño](#9-decisiones-de-diseño)
10. [Qué falta](#10-qué-falta)

---

## 1. Qué se construyó

Cinco archivos nuevos que implementan la UI completa del carrito: tres componentes reutilizables y dos pantallas.

| Archivo | Tipo |
|---|---|
| `apps/cliente/src/components/CantidadControl.tsx` | Componente UI puro |
| `apps/cliente/src/components/MenuItemCard.tsx` | Componente de ítem del menú |
| `apps/cliente/src/components/CarritoItem.tsx` | Componente de ítem en el carrito |
| `apps/cliente/src/screens/MenuScreen.tsx` | Pantalla del menú |
| `apps/cliente/src/screens/CarritoScreen.tsx` | Pantalla del carrito |

No se modificó ningún archivo existente. El store `useCarritoStore` y el tipo `ItemCarrito` de `@menyu/types` se usan tal como quedaron del sprint anterior.

---

## 2. Arquitectura de componentes

```
MenuScreen
└── MenuItemCard (×N)
    └── CantidadControl        ← aparece cuando cantidad > 0

CarritoScreen
└── CarritoItem (×N)
    └── CantidadControl
```

`CantidadControl` es el único componente que lee `cantidad` del store directamente. Los dos componentes que lo usan (`MenuItemCard` y `CarritoItem`) le pasan las callbacks `onIncrement` y `onDecrement`, que contienen la lógica de negocio correspondiente a cada contexto.

---

## 3. CantidadControl

**Archivo:** `apps/cliente/src/components/CantidadControl.tsx`

Componente de UI pura. No contiene lógica de negocio.

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `itemId` | `string` | ID del ítem para leer la cantidad del store |
| `onIncrement` | `() => void` | Callback al presionar "+" |
| `onDecrement` | `() => void` | Callback al presionar "−" |

### Lectura del store

Lee `cantidad` con un selector granular para evitar re-renders innecesarios:

```typescript
const cantidad = useCarritoStore(
  (state) => state.items.find((i) => i.id === itemId)?.cantidad ?? 0,
)
```

Si el ítem no existe en el carrito, devuelve `0` por defecto (aunque en la práctica `CantidadControl` solo se renderiza cuando `cantidad > 0`).

### Renderizado

```
[ − ]  cantidad  [ + ]
```

Botones circulares naranja (`#D4621A`). El número de cantidad queda centrado con `minWidth: 24` para que no se mueva el layout al pasar de 1 dígito a 2.

---

## 4. MenuItemCard

**Archivo:** `apps/cliente/src/components/MenuItemCard.tsx`

Tarjeta horizontal que representa un ítem del menú. Alterna entre dos estados según si el ítem ya está en el carrito.

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `item` | `Omit<ItemCarrito, 'cantidad'>` | Datos del ítem del menú (sin cantidad) |

El tipo excluye `cantidad` porque esa información vive en el store, no en los datos del menú.

### Lectura del store

```typescript
const cantidad = useCarritoStore(
  (state) => state.items.find((i) => i.id === item.id)?.cantidad ?? 0,
)
const agregarItem = useCarritoStore((s) => s.agregarItem)
const quitarItem = useCarritoStore((s) => s.quitarItem)
const actualizarCantidad = useCarritoStore((s) => s.actualizarCantidad)
```

Las acciones se seleccionan individualmente. En Zustand v5 las funciones del store son referencias estables, por lo que estos selectores no producen re-renders.

### Comportamiento según estado

**Si `cantidad === 0`:**
```
[ imagen ]  nombre          [ Agregar ]
            $precio
```
El botón "Agregar" llama a `agregarItem(item)`, que inserta el ítem con `cantidad: 1`.

**Si `cantidad > 0`:**
```
[ imagen ]  nombre          [ − ]  N  [ + ]
            $precio
```
Se reemplaza el botón por `CantidadControl`. Las callbacks son:
- `onIncrement` → `actualizarCantidad(item.id, cantidad + 1)`
- `onDecrement` → si `cantidad === 1`: `quitarItem(item.id)`; si no: `actualizarCantidad(item.id, cantidad - 1)`

Decrementar a 0 llama `quitarItem` en vez de `actualizarCantidad(id, 0)` para evitar que `actualizarCantidad` tenga que manejar el caso borde de cantidad cero (eso ya lo hace internamente, pero la intención queda más clara así).

### Imagen

Si `item.imagenUrl` está definida, se renderiza `<Image source={{ uri }}>`. Si no, se muestra un `View` con el emoji 🍽 como fallback visual. Esto evita errores de red o imágenes rotas en el menú de desarrollo.

---

## 5. CarritoItem

**Archivo:** `apps/cliente/src/components/CarritoItem.tsx`

Tarjeta de ítem dentro de la pantalla del carrito. Muestra más información que `MenuItemCard` porque en el carrito el usuario ya decidió qué quiere y necesita ver el detalle económico.

### Props

| Prop | Tipo | Descripción |
|---|---|---|
| `item` | `ItemCarrito` | Ítem completo, incluyendo `cantidad` |

A diferencia de `MenuItemCard`, recibe `ItemCarrito` completo porque `CarritoScreen` ya lo lee del store.

### Lectura del store

Solo lee las acciones, no el estado:

```typescript
const quitarItem = useCarritoStore((s) => s.quitarItem)
const actualizarCantidad = useCarritoStore((s) => s.actualizarCantidad)
```

La `cantidad` viene por prop (`item.cantidad`), que es siempre fresca porque `CarritoScreen` se re-renderiza cuando el store cambia.

### Layout

```
[ imagen ]  nombre
            $precio c/u
            Subtotal: $XXX
─────────────────────────────────────
[ − ]  N  [ + ]              Eliminar
```

- **Precio unitario** (`$X.XX c/u`): gris `#666666`, referencia por unidad.
- **Subtotal** (`precio × cantidad`): naranja `#D4621A`, valor destacado.
- **Eliminar**: texto rojo `#C62828`, llama directamente a `quitarItem(item.id)` sin pasar por `actualizarCantidad`.

### Callbacks de CantidadControl

- `onIncrement` → `actualizarCantidad(item.id, item.cantidad + 1)`
- `onDecrement` → si `item.cantidad === 1`: `quitarItem(item.id)`; si no: `actualizarCantidad(item.id, item.cantidad - 1)`

---

## 6. MenuScreen

**Archivo:** `apps/cliente/src/screens/MenuScreen.tsx`

Pantalla del menú. Por ahora usa datos mockeados — se conectará a la API en un sprint posterior.

### Datos mockeados

```typescript
const ITEMS_MOCK: Omit<ItemCarrito, 'cantidad'>[] = [
  { id: '1', nombre: 'Milanesa napolitana', precio: 3500, imagenUrl: '...' },
  { id: '2', nombre: 'Empanada de carne',   precio: 850 },
  { id: '3', nombre: 'Ensalada mixta',      precio: 2200, imagenUrl: '...' },
  { id: '4', nombre: 'Agua mineral 500ml',  precio: 600 },
]
```

Dos ítems con imagen y dos sin, para probar ambos estados del fallback.

### Lectura del store

```typescript
const cantidadTotal = useCarritoStore((s) => s.cantidadTotal())
```

Se llama al getter `cantidadTotal()` directamente en el selector. Zustand re-renderiza la pantalla cada vez que el resultado del selector cambia, por lo que el botón del footer aparece y desaparece reactivamente.

### Layout

```
┌─────────────────────────────────────┐
│  Menú                               │
│  ┌───────────────────────────────┐  │
│  │ MenuItemCard                  │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ MenuItemCard                  │  │
│  └───────────────────────────────┘  │
│  ...                                │
├─────────────────────────────────────┤
│  [ Ver carrito · N ítems ]          │  ← solo si cantidadTotal > 0
└─────────────────────────────────────┘
```

El footer con "Ver carrito" solo se monta cuando hay al menos un ítem en el carrito. El texto se pluraliza: `1 ítem` / `N ítems`.

El botón "Ver carrito" no tiene navegación todavía — se conectará cuando se integre Expo Router en este flujo.

---

## 7. CarritoScreen

**Archivo:** `apps/cliente/src/screens/CarritoScreen.tsx`

Pantalla del carrito con dos estados: vacío y con ítems.

### Lectura del store

```typescript
const items = useCarritoStore((s) => s.items)
const total = useCarritoStore((s) => s.total())
const vaciarCarrito = useCarritoStore((s) => s.vaciarCarrito)
```

### Estado vacío

Si `items.length === 0`, retorna una pantalla centrada con ícono 🛒 y el mensaje "Tu carrito está vacío". No hay lista ni footer.

### Estado con ítems

```
┌─────────────────────────────────────┐
│  Tu pedido                          │
│  ┌───────────────────────────────┐  │
│  │ CarritoItem                   │  │
│  └───────────────────────────────┘  │
│  ...                                │
├─────────────────────────────────────┤
│  Total                   $XXXX.XX   │
│  [ Confirmar pedido              ]  │
│  [ Vaciar carrito                ]  │
└─────────────────────────────────────┘
```

- **Total**: calculado con el getter `total()` del store, formateado con `toFixed(2)`.
- **Confirmar pedido**: botón principal naranja. Sin lógica todavía — se conectará al endpoint `POST /orders` en el sprint de pedidos.
- **Vaciar carrito**: botón secundario (borde gris), llama a `vaciarCarrito()`. Cuando se ejecuta, `items` queda vacío y la pantalla pasa al estado vacío automáticamente.

---

## 8. Paleta de estilos

Todos los estilos usan `StyleSheet.create`. Se sigue la misma paleta que el resto de la app cliente (tomada de `check-in.tsx`):

| Token | Valor | Uso |
|---|---|---|
| Naranja primario | `#D4621A` | Botones principales, acciones, subtotal destacado |
| Texto principal | `#1A1A1A` | Nombres, totales, cantidades |
| Texto secundario | `#666666` | Precios unitarios, mensajes vacíos |
| Fondo de pantalla | `#F9F9F9` | Background de screens |
| Fondo de tarjeta | `#FFFFFF` | Cards de ítems, footer |
| Borde | `#E0E0E0` | Bordes de cards y footers |
| Fondo fallback | `#F3F3F3` | Placeholder de imagen |
| Error / Eliminar | `#C62828` | Texto "Eliminar" |
| Texto sobre naranja | `#FFFFFF` | Labels de botones primarios |

Border radius estándar: `12` para cards y botones rectangulares, `18`/`20` para botones circulares y píldoras.

---

## 9. Decisiones de diseño

**`CantidadControl` no contiene lógica de negocio.** Las callbacks `onIncrement` y `onDecrement` vienen del padre. Esto permite que el mismo componente funcione con comportamiento diferente en `MenuItemCard` (donde decrementar a 1 llama `quitarItem`) y en `CarritoItem` (donde `quitarItem` también se puede llamar desde el botón "Eliminar").

**Selección granular del store para `cantidad`.** Tanto `CantidadControl` como `MenuItemCard` usan `state.items.find(...)?.cantidad ?? 0` en vez de seleccionar `state.items` completo. Así, un re-render de un componente no arrastra a todos los demás cuando cambia la cantidad de un ítem distinto.

**`CarritoItem` recibe `ItemCarrito` completo.** `CarritoScreen` ya lee el array del store, así que los ítems que recibe `CarritoItem` siempre son frescos. No hay doble lectura del store.

**El botón "Confirmar pedido" no tiene lógica.** Se dejó como placeholder vacío a propósito — la lógica de envío de pedido al backend pertenece al sprint de pedidos, no al sprint de carrito. Conectarlo antes implicaría acoplar dos módulos que aún no están completos.

**Datos mockeados en `MenuScreen`.** La pantalla del menú real requiere integración con la API y la sesión de mesa activa. Eso corresponde al sprint de sesión/menú. Los mocks permiten desarrollar y probar la UI del carrito de forma aislada.

---

## 10. Qué falta

- Reemplazar `ITEMS_MOCK` en `MenuScreen` con datos reales del endpoint `GET /menu/items` una vez que esté integrada la sesión.
- Conectar el botón "Ver carrito" en `MenuScreen` con navegación Expo Router hacia `CarritoScreen`.
- Conectar "Confirmar pedido" en `CarritoScreen` al endpoint `POST /orders` y llamar `vaciarCarrito()` al recibir respuesta exitosa.
- Considerar si el carrito debe persistir en storage entre reinicios de app (por ahora es solo memoria).
- Agregar soporte para mostrar las modificaciones de ingredientes (`ModificacionIngrediente`) en `CarritoItem` cuando se implemente ese flujo.
