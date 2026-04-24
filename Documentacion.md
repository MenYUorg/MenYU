# Documentación de Base de Datos — MenYU

**Proyecto:** MenYU — Plataforma Gastronómica Académica  
**Stack:** PostgreSQL 15 · Prisma ORM · Supabase  
**Versión del schema:** v1.0  
**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Última actualización:** Sprint 1 — 2026

---

## Índice

1. [Visión general](#1-visión-general)
2. [Convenciones](#2-convenciones)
3. [Estructura de tablas por módulo](#3-estructura-de-tablas-por-módulo)
   - [Marca y Sucursales](#31-marca-y-sucursales)
   - [Usuarios del sistema](#32-usuarios-del-sistema)
   - [Mesas y Sesiones](#33-mesas-y-sesiones)
   - [Menú](#34-menú)
   - [Pedidos y Pagos](#35-pedidos-y-pagos)
4. [Enums implícitos](#4-enums-implícitos)
5. [Relaciones clave](#5-relaciones-clave)
6. [Decisiones de diseño](#6-decisiones-de-diseño)
7. [Tablas v2.0 planificadas](#7-tablas-v20-planificadas)

---

## 1. Visión general

La base de datos de MenYU está diseñada para soportar una plataforma gastronómica multi-tenant donde múltiples restaurantes operan de forma completamente aislada. Cada sucursal tiene su propio menú, mesas, staff y clientes.

El schema se organiza en torno a dos entidades raíz:

- **`Marca`** — representa la identidad de un negocio gastronómico. Una marca puede tener varias sucursales y comparte el catálogo de ítems entre ellas.
- **`Restaurante`** — representa cada sucursal física. Es el ancla de todas las operaciones: mesas, pedidos, staff y configuración son por sucursal.

**Tablas totales v1.0:** 16  
**Tablas planificadas v2.0:** 8  

---

## 2. Convenciones

| Convención | Detalle |
|---|---|
| **IDs** | `uuid()` en todos los modelos. Generados en el cliente Prisma |
| **Timestamps** | `DateTime` con `@default(now())`. Siempre en UTC |
| **Nombres en BD** | `snake_case` mediante `@map()` en Prisma |
| **Nombres en código** | `camelCase` — Prisma hace la conversión automáticamente |
| **Precios** | `Decimal(10, 2)` — nunca `Float` para evitar errores de precisión monetaria |
| **Cantidades** | `Decimal(10, 3)` — para ingredientes con fracciones |
| **Soft delete** | No hay borrado físico. Los registros se desactivan con campos `activo` o `disponible` |
| **Foreign keys** | Nombradas `entidad_id` en BD (ej: `restaurante_id`, `mesa_id`) |

---

## 3. Estructura de tablas por módulo

---

### 3.1 Marca y Sucursales

#### `marca`

Entidad que representa una marca gastronómica. Puede tener múltiples sucursales y comparte el catálogo base de ítems del menú entre todas ellas.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único de la marca |
| `nombre` | `string` | Nombre comercial de la marca |
| `slug` | `string` UNIQUE | Versión URL-friendly del nombre (ej: `la-parrilla-de-juan`). Se usa para armar las rutas de la app y los QR |
| `created_at` | `timestamp` | Fecha y hora de alta en el sistema |

---

#### `restaurante`

Representa cada sucursal física de una marca. Es el punto de partida de toda consulta multi-tenant: mesas, pedidos, staff y configuración son propios de cada sucursal.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único de la sucursal |
| `marca_id` | `uuid` FK → `marca` | Marca a la que pertenece esta sucursal |
| `nombre` | `string` | Nombre comercial de la sucursal |
| `direccion` | `string?` | Dirección física del local |
| `qr_base_url` | `string?` | URL base que se imprime en los QR de las mesas (ej: `https://tuapp.com/r/la-parrilla`) |
| `created_at` | `timestamp` | Fecha y hora de alta en el sistema |

---

### 3.2 Usuarios del sistema

#### `admin`

Personas que gestionan el restaurante desde el panel de administración. El campo `rol` permite diferenciar permisos: un `owner` puede todo, un `manager` puede editar el menú, un `viewer` solo consulta.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único del administrador |
| `restaurante_id` | `uuid` FK → `restaurante` | Sucursal a la que pertenece este admin |
| `email` | `string` UNIQUE | Email de login en el panel de administración |
| `password_hash` | `string` | Contraseña encriptada. Nunca se guarda en texto plano |
| `rol` | `string` | Nivel de acceso. Ver [enums implícitos](#4-enums-implícitos) |

---

#### `mozo`

Personal de servicio que atiende las mesas. Separado de `admin` porque tiene ciclo de vida operativo propio: puede entrar y salir de turno, tener mesas activas y recibir llamados. El campo `activo` permite desactivarlo sin borrar su historial de asignaciones.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único del mozo |
| `restaurante_id` | `uuid` FK → `restaurante` | Sucursal a la que pertenece |
| `nombre` | `string` | Nombre del mozo |
| `email` | `string?` | Email para login en su panel o app móvil |
| `telefono` | `string?` | Para notificaciones push o SMS de llamados y pedidos nuevos |
| `activo` | `boolean` | Si está en turno activo. Default: `true` |
| `es_jefe_salon` | `boolean` | Si puede ver y gestionar los pedidos de todas las mesas. Default: `false` |
| `created_at` | `timestamp` | Fecha de alta en el sistema |

---

### 3.3 Mesas y Sesiones

#### `mesa`

Representa cada mesa física del local. El `qr_token` es el valor único dentro del código QR impreso. Cuando alguien lo escanea, el sistema identifica exactamente la mesa sin exponer el ID interno de la base de datos.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único de la mesa |
| `restaurante_id` | `uuid` FK → `restaurante` | Sucursal a la que pertenece |
| `numero` | `string` | Nombre o número visible (Mesa 5, Barra 2, Terraza 1) |
| `qr_token` | `string` UNIQUE | Token único dentro del QR impreso. Permite identificar la mesa sin exponer el ID interno |
| `estado` | `string` | Estado actual. Ver [enums implícitos](#4-enums-implícitos) |

---

#### `cliente`

Personas que usan la app para ver el menú y hacer pedidos.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único del cliente |
| `nombre` | `string` | Nombre del cliente |
| `email` | `string?` UNIQUE | Email para login y para el sistema de fidelización (v2.0) |
| `telefono` | `string?` | Teléfono opcional para contacto o notificaciones |
| `created_at` | `timestamp` | Fecha en que se registró en la plataforma |

---

#### `sesion_mesa`

El momento en que alguien escanea el QR y abre una mesa. Es la entidad central que conecta cliente, mesa, pedidos, llamados y asignación de mozo. Una mesa puede tener muchas sesiones a lo largo del tiempo. Cuando se paga y se cierra, la mesa queda libre para la próxima visita.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único de la sesión |
| `mesa_id` | `uuid` FK → `mesa` | Qué mesa se abrió |
| `cliente_id` | `uuid` FK → `cliente` | Quién escaneó el QR y abrió la sesión |
| `iniciada_en` | `timestamp` | Cuándo se escaneó el QR |
| `cerrada_en` | `timestamp?` | Cuándo se pagó y cerró. `null` si sigue activa |
| `estado` | `string` | Estado actual. Ver [enums implícitos](#4-enums-implícitos) |

---

#### `asignacion_mesa`

Registra qué mozo atiende qué mesa en cada momento. Soporta tres escenarios: asignación manual por admin, automática por el sistema, o el mozo que toma la mesa desde su panel. Si hay relevo de turno, se cierra el registro del mozo saliente (`liberado_en`) y se abre uno nuevo para el entrante, dando trazabilidad completa de quién atendió cada mesa en cada franja horaria.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único de la asignación |
| `mesa_id` | `uuid` FK → `mesa` | Qué mesa fue asignada |
| `mozo_id` | `uuid` FK → `mozo` | Qué mozo la atiende |
| `sesion_id` | `uuid` FK → `sesion_mesa` | A qué sesión corresponde esta asignación |
| `origen` | `string` | Cómo se generó. Ver [enums implícitos](#4-enums-implícitos) |
| `asignado_en` | `timestamp` | Cuándo empezó a atender esa mesa |
| `liberado_en` | `timestamp?` | Cuándo dejó de atenderla. `null` si la asignación sigue activa |

---

#### `llamado_mozo`

Registro de cada vez que alguien toca el botón "llamar al mozo" desde la app. El sistema consulta `asignacion_mesa` para obtener el mozo activo en esa sesión y le manda la notificación directo a él. No hay broadcast a todo el local.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único del llamado |
| `sesion_id` | `uuid` FK → `sesion_mesa` | De qué sesión vino el llamado |
| `mozo_id` | `uuid?` FK → `mozo` | A qué mozo se notificó. `null` si no hay mozo asignado |
| `estado` | `string` | Estado del llamado. Ver [enums implícitos](#4-enums-implícitos) |
| `created_at` | `timestamp` | Cuándo se tocó el botón en la app |

---

### 3.4 Menú

#### `comanda`

Estación de cocina a la que se dirige cada ítem del menú. Permite enviar los ítems de un pedido a la pantalla de cocina correcta (ej: parrilla, pizzas, bebidas) de forma independiente.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único de la comanda |
| `restaurante_id` | `uuid` FK → `restaurante` | Sucursal a la que pertenece esta estación |
| `nombre` | `string` | Nombre de la estación (Parrilla, Pizzas, Barra) |

---

#### `categoria_menu`

Los grupos o secciones del menú: Entradas, Platos principales, Bebidas, Postres, etc.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único de la categoría |
| `restaurante_id` | `uuid` FK → `restaurante` | Sucursal a la que pertenece |
| `nombre` | `string` | Nombre visible de la categoría en el menú |
| `orden` | `int` | Posición para controlar el orden de aparición en la app. Default: `0` |

---

#### `subcategoria_menu`

Subdivisión dentro de una categoría del menú. Permite mayor granularidad en la navegación (ej: Carnes → Vacuno / Cerdo / Pollo).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único de la subcategoría |
| `categoria_id` | `uuid` FK → `categoria_menu` | Categoría padre a la que pertenece |
| `nombre` | `string` | Nombre visible de la subcategoría |
| `orden` | `int` | Posición dentro de la categoría. Default: `0` |

---

#### `item_menu`

Cada plato, bebida o producto del menú. Pertenece a una `Marca` y puede estar disponible en múltiples sucursales con precio o disponibilidad diferente (via `item_sucursal`). El `precio_base` es el precio de referencia de la marca; al hacer un pedido se copia a `pedido_item` para que cambios futuros no alteren el historial de ventas.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único del ítem |
| `marca_id` | `uuid` FK → `marca` | Marca a la que pertenece (compartido entre sucursales) |
| `subcategoria_id` | `uuid?` FK → `subcategoria_menu` | Subcategoría a la que pertenece. `null` si no aplica |
| `comanda_id` | `uuid?` FK → `comanda` | Estación de cocina a la que se dirige. `null` si no aplica |
| `nombre` | `string` | Nombre del plato o bebida |
| `descripcion` | `string?` | Descripción larga que ve el cliente en la app |
| `precio_base` | `Decimal(10,2)` | Precio base a nivel de marca. Puede ser sobreescrito por sucursal en `item_sucursal` |
| `disponible` | `boolean` | Si está activo en carta. Permite desactivarlo sin borrarlo. Default: `true` |
| `imagen_url` | `string?` | Link a la foto del plato almacenada en Supabase Storage |

---

#### `item_sucursal`

Disponibilidad y precio de un ítem en una sucursal específica. Permite que cada sucursal active/desactive ítems del catálogo de la marca y establezca un precio diferente al base.

| Columna | Tipo | Descripción |
|---|---|---|
| `item_id` | `uuid` PK, FK → `item_menu` | Ítem del catálogo de la marca |
| `restaurante_id` | `uuid` PK, FK → `restaurante` | Sucursal donde aplica esta configuración |
| `disponible` | `boolean` | Si el ítem está disponible en esta sucursal. Default: `true` |
| `precio_override` | `Decimal(10,2)?` | Precio específico para esta sucursal. `null` usa el `precio_base` del ítem |

> Clave primaria compuesta: `(item_id, restaurante_id)`

---

#### `menu`

Carta o menú específico de una sucursal con vigencia por días u horarios. Permite tener menú de almuerzo, menú de cena, carta de verano, etc.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único del menú |
| `restaurante_id` | `uuid` FK → `restaurante` | Sucursal a la que pertenece |
| `nombre` | `string` | Nombre visible (Carta de Almuerzo, Menú de Verano) |
| `dias` | `string?` | Días de vigencia (ej: `lun,mar,mie`). `null` si aplica todos los días |
| `hora_inicio` | `string?` | Hora de inicio diaria (ej: `12:00`). `null` si sin restricción |
| `hora_fin` | `string?` | Hora de fin diaria (ej: `16:00`). `null` si sin restricción |
| `temporada` | `string?` | Temporada en que aplica (ej: `verano`). `null` si es permanente |

---

#### `menu_item`

Tabla puente que define qué ítems incluye cada menú.

| Columna | Tipo | Descripción |
|---|---|---|
| `menu_id` | `uuid` PK, FK → `menu` | Menú al que pertenece |
| `item_id` | `uuid` PK, FK → `item_menu` | Ítem incluido en ese menú |

> Clave primaria compuesta: `(menu_id, item_id)`

---

#### `clasificacion_dieta`

Etiquetas de clasificación dietaria para los ítems del menú. Permite marcar platos como Vegano, Sin TACC, Sin Lactosa, etc.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único de la clasificación |
| `nombre` | `string` UNIQUE | Nombre de la etiqueta (Vegano, Sin TACC, Sin Lactosa) |

---

#### `item_clasificacion`

Tabla puente que asocia ítems del menú con sus clasificaciones dietarias.

| Columna | Tipo | Descripción |
|---|---|---|
| `item_id` | `uuid` PK, FK → `item_menu` | Ítem del menú clasificado |
| `clasificacion_id` | `uuid` PK, FK → `clasificacion_dieta` | Clasificación dietaria aplicada |

> Clave primaria compuesta: `(item_id, clasificacion_id)`

---

#### `ingrediente`

Catálogo de ingredientes de una sucursal. Se usa tanto para mostrar la composición de los platos al cliente como para permitir modificaciones en los pedidos (sin cebolla, sin ajo).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único del ingrediente |
| `restaurante_id` | `uuid` FK → `restaurante` | Sucursal dueña de este catálogo de ingredientes |
| `nombre` | `string` | Nombre del ingrediente (cebolla, gluten, maní) |

---

#### `item_ingrediente`

Define qué ingredientes tiene cada plato y si el cliente puede pedirle que se los saquen. `removible = true` permite solicitar la exclusión al hacer el pedido (ej: sin cebolla). `removible = false` indica que es estructural y no puede sacarse (ej: el trigo en una pasta).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único de la relación ítem-ingrediente |
| `item_id` | `uuid` FK → `item_menu` | Ítem del menú que contiene este ingrediente |
| `ingrediente_id` | `uuid` FK → `ingrediente` | Ingrediente contenido en el ítem |
| `es_original` | `boolean` | Si forma parte de la receta original (`true`) o es extra opcional (`false`) |
| `cantidad` | `Decimal(10,3)` | Cantidad del ingrediente en la receta |
| `removible` | `boolean` | Si el cliente puede pedir que se lo saquen. Default: `false` |

---

### 3.5 Pedidos y Pagos

#### `pedido`

Cada ronda de pedidos dentro de una sesión. Una misma mesa puede hacer varios pedidos durante la visita (entrada, plato principal, postre). El ciclo de estado es: `pendiente → en_preparacion → listo → entregado`. `mesa_id` es una referencia directa para queries rápidas sin necesidad de hacer JOIN con `sesion_mesa`.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único del pedido |
| `sesion_id` | `uuid` FK → `sesion_mesa` | Sesión de mesa a la que pertenece |
| `mesa_id` | `uuid` FK → `mesa` | Referencia directa a la mesa para queries rápidas |
| `estado` | `string` | Estado del pedido. Ver [enums implícitos](#4-enums-implícitos) |
| `created_at` | `timestamp` | Hora exacta en que se hizo el pedido |

---

#### `pedido_item`

Cada línea dentro de un pedido. `precio_unitario` se copia del `item_menu` en el momento del pedido — si el precio del menú cambia en el futuro, el historial de ventas no se ve afectado.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único del ítem en el pedido |
| `pedido_id` | `uuid` FK → `pedido` | Pedido al que pertenece esta línea |
| `item_id` | `uuid` FK → `item_menu` | Plato o bebida que se pidió |
| `cantidad` | `int` | Cuántas unidades de ese ítem |
| `precio_unitario` | `Decimal(10,2)` | Precio del ítem en el momento exacto del pedido (snapshot) |
| `notas` | `string?` | Texto libre del cliente: "sin sal", "bien cocido", "término medio" |

---

#### `pedido_item_mod`

Modificaciones de ingredientes de un ítem específico dentro de un pedido. Separado de `pedido_item` para mantener el modelo limpio: una misma línea puede tener múltiples modificaciones (sin cebolla Y sin ajo).

| Columna | Tipo | Descripción |
|---|---|---|
| `pedido_item_id` | `uuid` PK, FK → `pedido_item` | Línea del pedido a la que aplica la modificación |
| `item_ingrediente_id` | `uuid` PK, FK → `item_ingrediente` | Ingrediente específico que se modifica |
| `accion` | `string` | Qué se hace. Ver [enums implícitos](#4-enums-implícitos) |
| `cantidad` | `Decimal(10,3)` | Cantidad modificada del ingrediente |

> Clave primaria compuesta: `(pedido_item_id, item_ingrediente_id)`

---

#### `pago`

Registro del pago de un pedido. `referencia_externa` guarda el ID que devuelve el procesador (Mercado Pago, Stripe, etc.) para rastrear la transacción en sus sistemas y poder hacer reconciliaciones.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | `uuid` PK | Identificador único del pago |
| `pedido_id` | `uuid` FK → `pedido` UNIQUE | Pedido que se pagó (relación 1-a-1) |
| `monto` | `Decimal(10,2)` | Monto total cobrado |
| `metodo` | `string` | Método de pago. Ver [enums implícitos](#4-enums-implícitos) |
| `estado` | `string` | Estado del pago. Ver [enums implícitos](#4-enums-implícitos) |
| `referencia_externa` | `string?` | ID de la transacción en el procesador externo para reconciliación |
| `created_at` | `timestamp` | Fecha y hora del pago |

---

## 4. Enums implícitos

El schema usa `String` para campos de estado y tipo. Los valores válidos se documentan acá. **No deben usarse valores fuera de esta lista.**

| Tabla | Campo | Valores válidos |
|---|---|---|
| `admin` | `rol` | `owner` · `manager` · `viewer` |
| `mesa` | `estado` | `libre` · `ocupada` · `reservada` |
| `sesion_mesa` | `estado` | `activa` · `cerrada` · `abandonada` |
| `asignacion_mesa` | `origen` | `manual` · `auto` · `mozo` |
| `llamado_mozo` | `estado` | `pendiente` · `atendido` |
| `pedido` | `estado` | `pendiente` · `en_preparacion` · `listo` · `entregado` |
| `pedido_item_mod` | `accion` | `remover` · `agregar_extra` |
| `pago` | `metodo` | `tarjeta` · `efectivo` · `qr` · `transferencia` |
| `pago` | `estado` | `pendiente` · `aprobado` · `rechazado` |

> **Nota:** Estos valores deberían migrar a `enum` de Prisma/PostgreSQL en una versión futura para tener validación a nivel de base de datos.

---

## 5. Relaciones clave

### Flujo principal de una visita

```
Marca
 └── Restaurante
      ├── Mesa ──────────────────┐
      ├── Mozo                   │
      │    └── AsignacionMesa ───┤
      └── Cliente                │
           └── SesionMesa ───────┘
                ├── LlamadoMozo
                └── Pedido
                     ├── PedidoItem ──── ItemMenu ──── Marca
                     │    └── PedidoItemMod
                     └── Pago
```

### Estructura del menú

```
Marca
 └── ItemMenu
      ├── SubcategoriaMenu ── CategoriaMenu ── Restaurante
      ├── Comanda ── Restaurante
      ├── ItemSucursal ── Restaurante
      ├── ItemIngrediente ── Ingrediente ── Restaurante
      ├── ItemClasificacion ── ClasificacionDieta
      └── MenuItem ── Menu ── Restaurante
```

### Patrones de multiplicidad relevantes

| Relación | Tipo | Detalle |
|---|---|---|
| `Marca` → `Restaurante` | 1 a N | Una marca tiene muchas sucursales |
| `Marca` → `ItemMenu` | 1 a N | El catálogo de ítems es compartido entre sucursales |
| `Mesa` → `SesionMesa` | 1 a N | Una mesa tiene muchas sesiones a lo largo del tiempo |
| `SesionMesa` → `Pedido` | 1 a N | Una visita puede tener múltiples rondas de pedidos |
| `Pedido` → `Pago` | 1 a 1 | Un pedido tiene exactamente un pago |
| `ItemMenu` → `ItemSucursal` | 1 a N | Un ítem puede tener configuración diferente por sucursal |
| `ItemMenu` ↔ `Menu` | N a N | Via tabla puente `menu_item` |
| `ItemMenu` ↔ `ClasificacionDieta` | N a N | Via tabla puente `item_clasificacion` |
| `ItemMenu` ↔ `Ingrediente` | N a N | Via tabla puente `item_ingrediente` |

---

## 6. Decisiones de diseño

### Snapshot de precio en pedidos

`pedido_item.precio_unitario` copia el precio vigente del ítem en el momento del pedido. Esto garantiza que si el precio del menú cambia en el futuro, el historial de ventas no se ve afectado. El `precio_base` en `item_menu` siempre refleja el precio actual.

### `mesa_id` directo en `pedido`

`pedido` tiene tanto `sesion_id` como `mesa_id`. La referencia directa a la mesa evita un JOIN con `sesion_mesa` en las queries más frecuentes del panel de cocina (ver todos los pedidos de una mesa).

### Marca vs Restaurante

El catálogo de ítems vive en `Marca` y no en `Restaurante`. Esto permite que una cadena con múltiples sucursales comparta el menú base y lo personalice por sucursal via `ItemSucursal` (activar/desactivar ítems, sobreescribir precio) sin duplicar registros.

### Separación Mozo / Admin

`admin` y `mozo` son entidades separadas aunque ambos son usuarios del sistema. `admin` tiene ciclo de vida estático (se crea, se modifica, se desactiva). `mozo` tiene ciclo de vida operativo activo: entra y sale de turno, recibe llamados en tiempo real, tiene mesas asignadas. Unificarlos en una sola tabla complicaría la lógica de turnos y asignaciones.

### Ingredientes por sucursal

`ingrediente` tiene `restaurante_id` porque cada sucursal puede tener su propio catálogo de ingredientes. Dos sucursales de la misma marca pueden tener los mismos nombres pero proveedores o alérgenos distintos.

### `pedido_item_mod` separado de `pedido_item`

Las modificaciones de ingredientes se guardan en una tabla aparte para mantener `pedido_item` limpio. Una línea de pedido puede tener múltiples modificaciones y este diseño las representa sin arrays ni JSON.

---

## 7. Tablas v2.0 planificadas

Estas tablas están documentadas en el HTML de referencia (`documentacion_bd.html`) y se agregarán al schema en los sprints correspondientes. No forman parte del schema actual.

| Tabla | Módulo | Sprint |
|---|---|---|
| `division_pago` | División de pagos entre comensales | S9 |
| `programa_fidelizacion` | Configuración del sistema de puntos por restaurante | S11 |
| `puntos_cliente` | Saldo de puntos de un cliente en un restaurante | S11 |
| `transaccion_puntos` | Historial de movimientos de puntos (patrón ledger) | S11 |
| `promo_canje` | Catálogo de beneficios canjeables con puntos | S12 |
| `canje_realizado` | Registro de canjes de promos | S12 |
| `perfil_preferencias` | Perfil de gustos del cliente por restaurante | S13 |
| `interaccion_item` | Contador de interacciones cliente-ítem para recomendaciones | S13 |
| `item_coocurrencia` | Ítems que aparecen juntos en pedidos ("también pidieron") | S13 |
| `recomendacion` | Sugerencias pre-calculadas por el microservicio Python | S14 |

---

*Documentación generada en Sprint 1 — MenYU · 2026*
