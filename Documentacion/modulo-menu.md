# Módulo Menú — MenYU

**Sprints:** feat/menu · feat/front-menu  
**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Fecha:** Mayo 2026

---

## Índice

1. [Qué se construyó](#1-qué-se-construyó)
2. [Modelo de datos del menú](#2-modelo-de-datos-del-menú)
3. [Módulo Ingredientes](#3-módulo-ingredientes)
4. [Módulo Categorías](#4-módulo-categorías)
5. [Módulo Ítems](#5-módulo-ítems)
6. [Fotos de ítems — Supabase Storage](#6-fotos-de-ítems--supabase-storage)
7. [Panel Admin — Gestión del catálogo](#7-panel-admin--gestión-del-catálogo)
8. [Decisiones de diseño](#8-decisiones-de-diseño)
9. [Qué falta](#9-qué-falta)

---

## 1. Qué se construyó

### Frontend — Panel Admin (`apps/admin/`) — sprint feat/front-menu

- **Autenticación:** login con email/password contra `/auth/login`, JWT almacenado en `localStorage`, decode local del payload.
- **`services/api.ts`:** cliente HTTP tipado con header `Authorization` automático, manejo de `ApiError` con status code, upload multipart para imágenes.
- **`store/authStore.ts`:** login, logout, carga de contexto (marcas + restaurantes), selección activa de marca/restaurante. Zustand v5.
- **`store/menuStore.ts`:** CRUD completo de ítems, categorías, subcategorías e ingredientes con optimistic updates en el array local.
- **Componentes UI:** `Button`, `Input`, `Textarea`, `Select`, `Badge`, `Modal`, `Spinner` — todos en Tailwind, sin dependencias de UI externas.
- **Layout:** sidebar con nav + header con selector de marca/restaurante (aparece solo si hay más de uno).
- **`MenuPage`:** tres tabs — Ítems del menú | Categorías | Ingredientes. Carga datos al montar y al cambiar de marca/restaurante.
- **`ItemsTab`:** tabla con imagen thumbnail, precio, badge de disponibilidad, botones de upload/quitar imagen, modal de create/edit.
- **`CategoriasTab`:** árbol expandible de categorías con sus subcategorías. Inline edit sin modal para ambos niveles. Agregar subcategoría directamente desde la card de la categoría.
- **`IngredientesTab`:** lista con inline edit y delete por fila.

### Backend (`apps/backend/src/`)

- **`ingredientes/`** — CRUD completo de ingredientes. Un ingrediente pertenece a un restaurante y puede estar asociado a múltiples ítems del menú. Incluye validaciones de nombre duplicado y protección contra borrado si está en uso.
- **`categorias/`** — CRUD de categorías y subcategorías del menú en un único módulo. Las subcategorías se gestionan desde rutas anidadas bajo la categoría padre.
- **`items/`** — CRUD de ítems del menú. Los ítems pertenecen a la marca (no al restaurante), lo que permite compartir el catálogo entre sucursales. Incluye validación cruzada de subcategoría, protección contra borrado de ítems con pedidos históricos, y endpoints de upload/delete de imagen.
- **`storage/`** — servicio compartido que encapsula el cliente de Supabase Storage. Por ahora solo lo usa el módulo de ítems.

**Estructura de archivos:**

```
src/
  ingredientes/
    ingredientes.module.ts
    ingredientes.controller.ts
    ingredientes.service.ts
    dto/
      create-ingrediente.dto.ts
      update-ingrediente.dto.ts
  categorias/
    categorias.module.ts
    categorias.controller.ts
    categorias.service.ts
    dto/
      create-categoria.dto.ts
      update-categoria.dto.ts
      create-subcategoria.dto.ts
      update-subcategoria.dto.ts
  items/
    items.module.ts
    items.controller.ts
    items.service.ts
    dto/
      create-item.dto.ts
      update-item.dto.ts
  storage/
    storage.module.ts
    storage.service.ts
```

**Registro en `app.module.ts`:** se importaron `IngredientesModule`, `CategoriasModule` e `ItemsModule`. `StorageModule` no se registra globalmente — `ItemsModule` lo importa directamente.

### Prisma client

El modelo `Ingrediente` ya existía en el schema desde el diseño inicial. Lo que sí fue necesario fue correr `prisma generate` para sincronizar el cliente TypeScript con el schema actual. Esto de paso resolvió errores de tipado pre-existentes en `mesas.service.ts`, `marca.service.ts` y `restaurante.service.ts` que usaban `admin.marcaId` y fallaban porque el cliente estaba desactualizado.

---

## 2. Modelo de datos del menú

El schema Prisma ya tenía todas las tablas necesarias para el módulo menú desde el inicio del proyecto. A continuación se documenta la estructura completa para referencia.

### `Ingrediente`

```prisma
model Ingrediente {
  id            String @id @default(uuid())
  restauranteId String @map("restaurante_id")
  nombre        String

  restaurante Restaurante       @relation(fields: [restauranteId], references: [id])
  items       ItemIngrediente[]

  @@map("ingrediente")
}
```

Un ingrediente pertenece a un restaurante. Puede estar vinculado a muchos ítems del menú a través de `ItemIngrediente`.

### `ItemIngrediente` (tabla de unión)

```prisma
model ItemIngrediente {
  id            String  @id @default(uuid())
  itemId        String  @map("item_id")
  ingredienteId String  @map("ingrediente_id")
  esOriginal    Boolean @map("es_original")
  cantidad      Decimal @db.Decimal(10, 3)
  removible     Boolean @default(false)

  item        ItemMenu          @relation(...)
  ingrediente Ingrediente       @relation(...)
  mods        PedidoItemMod[]
}
```

Relaciona un ítem del menú con sus ingredientes. El campo `removible` indica si el cliente puede pedir que se lo quiten. `esOriginal` diferencia los ingredientes del plato base de los que se agregan como extra.

### `ItemMenu`

```prisma
model ItemMenu {
  id             String   @id @default(uuid())
  marcaId        String   @map("marca_id")
  subcategoriaId String?  @map("subcategoria_id")
  comandaId      String?  @map("comanda_id")
  nombre         String
  descripcion    String?
  precioBase     Decimal  @map("precio_base") @db.Decimal(10, 2)
  disponible     Boolean  @default(true)
  imagenUrl      String?  @map("imagen_url")
  ...
}
```

Un ítem pertenece a una marca (no a un restaurante específico), lo que permite compartir el catálogo entre sucursales. La disponibilidad por sucursal se maneja con la tabla `ItemSucursal`.

### `CategoriaMenu` y `SubcategoriaMenu`

```
Restaurante
  └── CategoriaMenu (ej: "Bebidas")
        └── SubcategoriaMenu (ej: "Cervezas")
              └── ItemMenu (ej: "Stella Artois 500ml")
```

Las categorías pertenecen al restaurante. Las subcategorías pertenecen a una categoría. Los ítems pertenecen a la marca y se asignan a subcategorías.

### `Menu` y `MenuItem`

`Menu` es una configuración horaria/estacional que determina qué ítems están disponibles en qué horario o temporada (ej: "Menú de almuerzo", "Menú de verano"). `MenuItem` es la tabla de unión entre `Menu` e `ItemMenu`.

### `ItemSucursal`

Permite que cada restaurante sobreescriba el precio base de un ítem (`precioOverride`) o lo marque como no disponible localmente, sin afectar al ítem de la marca.

---

## 3. Módulo Ingredientes

### Endpoints

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/api/ingredientes` | ROOT, OWNER | Crea un ingrediente nuevo |
| GET | `/api/ingredientes?restauranteId=` | ROOT, OWNER | Lista todos los ingredientes del restaurante (orden alfabético) |
| GET | `/api/ingredientes/:id` | ROOT, OWNER | Detalle de un ingrediente |
| PATCH | `/api/ingredientes/:id` | ROOT, OWNER | Renombra el ingrediente |
| DELETE | `/api/ingredientes/:id` | ROOT, OWNER | Elimina el ingrediente (solo si no está en uso) |

### Lógica de permisos

El guard `RolesGuard` + `@Roles('ROOT', 'OWNER')` aplica a toda la clase del controller. El service implementa `assertRestauranteOwnership` que:

1. Si `user.rol === 'ROOT'` → acceso libre.
2. Si `user.rol === 'OWNER'` → busca el admin en la DB, obtiene su `marcaId`, y verifica que el restaurante del ingrediente pertenezca a esa misma marca. Si no coincide → 403 Forbidden.

### Validaciones

- **Nombre duplicado al crear:** compara case-insensitive (`mode: 'insensitive'`) dentro del mismo restaurante → 409 Conflict.
- **Nombre duplicado al renombrar:** misma validación, excluye el propio ID para permitir un PATCH sin cambios.
- **Borrado con ítems asociados:** antes de deletear cuenta cuántos `ItemIngrediente` referencian ese ingrediente. Si hay alguno → 409 Conflict con mensaje explicativo.

### DTOs

**`CreateIngredienteDto`**
```typescript
class CreateIngredienteDto {
  nombre: string        // @IsString @IsNotEmpty
  restauranteId: string // @IsUUID
}
```

**`UpdateIngredienteDto`**
```typescript
class UpdateIngredienteDto {
  nombre?: string       // @IsOptional @IsString @IsNotEmpty
}
```

`restauranteId` no es editable — un ingrediente no puede cambiar de restaurante.

---

## 4. Módulo Categorías

### Estructura

Un módulo único (`categorias`) maneja tanto `CategoriaMenu` como `SubcategoriaMenu` en un solo controller y service. Las subcategorías se exponen como rutas anidadas bajo su categoría padre.

### Endpoints — Categorías

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/api/categorias` | ROOT, OWNER | Crea una categoría (nombre + restauranteId + orden?) |
| GET | `/api/categorias?restauranteId=` | ROOT, OWNER | Lista categorías del restaurante con sus subcategorías incluidas |
| GET | `/api/categorias/:id` | ROOT, OWNER | Detalle de una categoría con subcategorías |
| PATCH | `/api/categorias/:id` | ROOT, OWNER | Actualiza nombre u orden |
| DELETE | `/api/categorias/:id` | ROOT, OWNER | Elimina (solo si no tiene subcategorías) |

### Endpoints — Subcategorías

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/api/categorias/:categoriaId/subcategorias` | ROOT, OWNER | Crea una subcategoría bajo la categoría indicada |
| GET | `/api/categorias/:categoriaId/subcategorias` | ROOT, OWNER | Lista subcategorías de una categoría |
| GET | `/api/categorias/subcategorias/:id` | ROOT, OWNER | Detalle de una subcategoría |
| PATCH | `/api/categorias/subcategorias/:id` | ROOT, OWNER | Actualiza nombre u orden |
| DELETE | `/api/categorias/subcategorias/:id` | ROOT, OWNER | Elimina (solo si no tiene ítems del menú) |

### Respuesta del `findAll` de categorías

`GET /categorias?restauranteId=` devuelve las categorías ordenadas por `orden ASC`, y cada una incluye su array de subcategorías también ordenado por `orden ASC`. Esto evita dos llamadas separadas desde el panel admin al cargar la estructura del menú.

```json
[
  {
    "id": "uuid",
    "nombre": "Bebidas",
    "orden": 0,
    "restauranteId": "uuid",
    "subcategorias": [
      { "id": "uuid", "nombre": "Cervezas", "orden": 0, "categoriaId": "uuid" },
      { "id": "uuid", "nombre": "Gaseosas", "orden": 1, "categoriaId": "uuid" }
    ]
  }
]
```

### Lógica de permisos

Misma que ingredientes. Para subcategorías, el service primero resuelve la categoría padre para obtener el `restauranteId` y luego aplica `assertRestauranteOwnership`.

### Validaciones

- **Nombre de categoría:** único por restaurante (case-insensitive) → 409 al crear y al renombrar.
- **Nombre de subcategoría:** único dentro de su categoría (case-insensitive) → 409 al crear y al renombrar.
- **Borrado de categoría:** requiere que no tenga subcategorías → 409 con conteo.
- **Borrado de subcategoría:** requiere que no tenga ítems del menú → 409 con conteo.

### DTOs

**`CreateCategoriaDto`**
```typescript
class CreateCategoriaDto {
  nombre: string        // @IsString @IsNotEmpty
  restauranteId: string // @IsUUID
  orden?: number        // @IsOptional @IsInt @Min(0)
}
```

**`UpdateCategoriaDto`**
```typescript
class UpdateCategoriaDto {
  nombre?: string  // @IsOptional @IsString @IsNotEmpty
  orden?: number   // @IsOptional @IsInt @Min(0)
}
```

**`CreateSubcategoriaDto`** / **`UpdateSubcategoriaDto`** — mismo esquema que los de categoría pero sin `restauranteId` (viene del param de la URL).

---

## 5. Módulo Ítems

### Estructura

Un módulo `items` con un controller y service únicos. Los ítems viven bajo `/items`.

### Endpoints — CRUD de ítems

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/api/items` | ROOT, OWNER | Crea un ítem del menú |
| GET | `/api/items?marcaId=&subcategoriaId=&disponible=` | ROOT, OWNER | Lista ítems con filtros opcionales |
| GET | `/api/items/:id` | ROOT, OWNER | Detalle completo con subcategoría, ingredientes y clasificaciones |
| PATCH | `/api/items/:id` | ROOT, OWNER | Actualiza cualquier campo |
| DELETE | `/api/items/:id` | ROOT, OWNER | Elimina (solo si no tiene pedidos históricos) |

### Endpoints — Ingredientes del ítem

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/api/items/:itemId/ingredientes` | ROOT, OWNER | Asocia un ingrediente al ítem |
| PATCH | `/api/items/:itemId/ingredientes/:id` | ROOT, OWNER | Actualiza cantidad, removible o esOriginal |
| DELETE | `/api/items/:itemId/ingredientes/:id` | ROOT, OWNER | Desasocia el ingrediente (si no tiene mods en pedidos) |

El `id` en PATCH y DELETE es el id de `ItemIngrediente` (la asociación), no del ingrediente en sí. Viene dentro del array `ingredientes` en la respuesta de `findOne`.

### Respuestas diferenciadas

**`findAll`** — respuesta ligera para la lista del panel admin:
```json
[
  {
    "id": "uuid",
    "nombre": "Milanesa napolitana",
    "precioBase": "1200.00",
    "disponible": true,
    "imagenUrl": null,
    "marcaId": "uuid",
    "subcategoria": { "id": "uuid", "nombre": "Platos principales", "categoriaId": "uuid" }
  }
]
```

**`findOne`** — respuesta completa para el formulario de edición:
```json
{
  "id": "uuid",
  "nombre": "Milanesa napolitana",
  "descripcion": "Con jamón, salsa y queso",
  "precioBase": "1200.00",
  "disponible": true,
  "imagenUrl": null,
  "subcategoria": { "id": "uuid", "nombre": "Platos principales", ... },
  "ingredientes": [
    {
      "id": "uuid", "esOriginal": true, "cantidad": "1.000", "removible": false,
      "ingrediente": { "id": "uuid", "nombre": "Milanesa de ternera" }
    }
  ],
  "clasificaciones": [
    { "clasificacion": { "id": "uuid", "nombre": "Sin gluten" } }
  ]
}
```

Los ingredientes se ordenan: `esOriginal DESC` (primero los originales del plato), luego `nombre ASC` del ingrediente.

### Lógica de permisos

`assertMarcaOwnership` — distinto al resto de los módulos, el check no pasa por el restaurante sino directo a la marca:

1. Si `user.rol === 'ROOT'` → acceso libre.
2. Si no → busca el admin por `user.sub`, verifica que `admin.marcaId === item.marcaId`. Si no coincide → 403 Forbidden.

### Validaciones

- **Nombre duplicado:** único por marca (case-insensitive) → 409 al crear y al renombrar.
- **Subcategoría cruzada:** si se provee `subcategoriaId`, el service verifica que esa subcategoría pertenezca a un restaurante de la misma marca (cadena: `subcategoria → categoria → restaurante → marcaId`). Si no coincide → 400 Bad Request.
- **Borrado con pedidos:** si el ítem aparece en algún `PedidoItem` → 409 con sugerencia de usar `disponible: false` en su lugar.
- **Ingrediente duplicado:** no se puede asociar dos veces el mismo ingrediente al mismo ítem → 409.
- **Ingrediente cruzado:** al asociar, verifica que el ingrediente pertenezca a un restaurante de la misma marca que el ítem (cadena: `ingrediente → restaurante → marcaId`). Si no coincide → 400 Bad Request.
- **Desasociación con historial:** si el `ItemIngrediente` tiene modificaciones en pedidos históricos (`PedidoItemMod`) → 409. Esto preserva la integridad del historial de pedidos.

### DTOs

**`CreateItemDto`**
```typescript
class CreateItemDto {
  marcaId: string        // @IsUUID
  nombre: string         // @IsString @IsNotEmpty
  precioBase: number     // @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  descripcion?: string   // @IsOptional @IsString
  subcategoriaId?: string // @IsOptional @IsUUID
  comandaId?: string     // @IsOptional @IsUUID
  disponible?: boolean   // @IsOptional @IsBoolean
  imagenUrl?: string     // @IsOptional @IsUrl
}
```

**`UpdateItemDto`** — todos los campos de `CreateItemDto` opcionales, excepto `marcaId` que no es editable.

**`AddIngredienteDto`**
```typescript
class AddIngredienteDto {
  ingredienteId: string  // @IsUUID
  esOriginal: boolean    // @IsBoolean
  cantidad: number       // @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive
  removible?: boolean    // @IsOptional @IsBoolean (default false)
}
```

**`UpdateIngredienteItemDto`**
```typescript
class UpdateIngredienteItemDto {
  cantidad?: number    // @IsOptional @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive
  removible?: boolean  // @IsOptional @IsBoolean
  esOriginal?: boolean // @IsOptional @IsBoolean
}
```

`ingredienteId` no es editable en el update — si querés cambiar el ingrediente, desasociás y volvés a asociar.

### Filtros del `findAll`

| Parámetro | Tipo | Comportamiento |
|---|---|---|
| `marcaId` | string (requerido) | Filtra por marca |
| `subcategoriaId` | string (opcional) | Filtra por subcategoría específica |
| `disponible` | `"true"` / `"false"` (opcional) | Filtra por disponibilidad; si se omite devuelve todos |

El valor de `disponible` llega como string desde la query y el controller lo convierte a `boolean | undefined` antes de pasarlo al service.

---

## 6. Fotos de ítems — Supabase Storage

### Dependencias nuevas

| Paquete | Tipo | Para qué |
|---|---|---|
| `@supabase/supabase-js` | dependency | Cliente de Supabase (Storage) |
| `@types/multer` | devDependency | Tipos de `Express.Multer.File` para TypeScript |

`@nestjs/platform-express` ya estaba instalado e incluye multer para el manejo de archivos multipart.

### Variables de entorno requeridas

Se creó `.env.example` en la raíz del monorepo. Las dos variables nuevas son:

```
SUPABASE_URL="https://xxxx.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOi..."
```

`SUPABASE_SERVICE_ROLE_KEY` es la clave de servicio (no la anon key). Se encuentra en Supabase → Project Settings → API. Permite hacer operaciones de Storage sin pasar por las políticas RLS.

### Setup requerido en Supabase

1. Ir a **Storage** en el dashboard.
2. Crear bucket llamado **`menu-items`**.
3. Marcarlo como **público** — las imágenes del menú son de acceso libre, no requieren autenticación para verse.

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/items/:id/imagen` | Sube o reemplaza la imagen del ítem |
| DELETE | `/api/items/:id/imagen` | Elimina la imagen del storage y limpia `imagenUrl` |

Ambos endpoints requieren los mismos roles que el resto del módulo (`ROOT`, `OWNER`) y devuelven el ítem completo actualizado.

### Upload — `POST /items/:id/imagen`

- **Content-Type:** `multipart/form-data`
- **Campo:** `imagen`
- **Formatos permitidos:** `image/jpeg`, `image/png`, `image/webp`
- **Tamaño máximo:** 5 MB

La validación se hace en el controller con `ParseFilePipe` + `MaxFileSizeValidator` + `FileTypeValidator` de NestJS, antes de que el request llegue al service.

### Path en el bucket

```
menu-items/
  {marcaId}/
    {itemId}         ← sin extensión, se sobreescribe en cada upload
```

Usar `{marcaId}/{itemId}` como path fijo tiene dos efectos:
- Subir una imagen nueva **sobreescribe** la anterior automáticamente (`upsert: true`).
- La URL pública **no cambia** entre uploads — el panel admin y la app cliente no necesitan actualizar nada.

### `StorageService`

Encapsula las dos operaciones sobre Supabase Storage que se usan hoy:

```typescript
uploadFile(bucket, path, buffer, mimetype): Promise<string>  // → URL pública
deleteFile(bucket, path): Promise<void>
```

El cliente Supabase se inicializa en el constructor del service con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del entorno. Los errores de Supabase se convierten en `InternalServerErrorException` con el mensaje original.

### Flujo completo de upload

```
Panel admin
  │
  │── POST /items/:id/imagen
  │   Content-Type: multipart/form-data
  │   Body: imagen=<archivo>
  │
  ▼
ItemsController
  │── ParseFilePipe valida tipo y tamaño
  │── @CurrentUser() extrae user del JWT
  │
  ▼
ItemsService.uploadImagen()
  │── getOrThrow(id)          → 404 si no existe
  │── assertMarcaOwnership()  → 403 si no es su marca
  │── storage.uploadFile()    → sube a Supabase, obtiene URL pública
  │── prisma.itemMenu.update() → guarda URL en imagenUrl
  │
  ▼
Respuesta: ítem completo con imagenUrl actualizada
```

---

## 7. Panel Admin — Gestión del catálogo

**Sprint:** `feat/front-menu`

### Estructura de archivos

```
apps/admin/src/
  services/
    api.ts              ← cliente HTTP con auth y upload
  store/
    authStore.ts        ← login, JWT, contexto de marca/restaurante
    menuStore.ts        ← CRUD ítems, categorías, ingredientes
  components/
    ui/                 ← Button, Input, Textarea, Select, Badge, Modal, Spinner
    layout/
      Layout.tsx        ← sidebar + header con selector de contexto
  pages/
    login/
      LoginPage.tsx
    menu/
      MenuPage.tsx      ← tabs: Ítems | Categorías | Ingredientes
      ItemsTab.tsx
      CategoriasTab.tsx
      IngredientesTab.tsx
```

### Flujo de autenticación

1. Usuario ingresa email/password → `POST /auth/login` → `{ accessToken, refreshToken }`.
2. Tokens guardados en `localStorage`. JWT decodificado localmente (sin verificar firma) para leer `sub`, `email`, `nombre`, `rol`.
3. Al autenticarse (o al recargar con token guardado), se llama `GET /marcas` y `GET /restaurantes`. El primero de cada lista se selecciona automáticamente. Si hay más de uno, aparece un dropdown en el header.
4. Al cambiar la marca seleccionada → refetch de ítems. Al cambiar el restaurante → refetch de categorías e ingredientes.

### `services/api.ts` — detalles técnicos

- Base URL leída de `import.meta.env.VITE_API_URL` (requiere `apps/admin/.env.local` con `VITE_API_URL=http://localhost:3000`).
- `ApiError` — clase que extiende `Error` con campo `status: number`.
- Upload de imagen: `FormData` con campo `'imagen'` (nombre esperado por `FileInterceptor` del backend). No incluye `Content-Type` manual para que el browser agregue el boundary correcto.
- Todos los métodos son funciones tipadas que devuelven la entidad completa del backend.

### `store/menuStore.ts` — actualizaciones optimistas

Después de cada operación exitosa el store actualiza el array local sin refetch:

| Operación | Actualización local |
|---|---|
| `createItem` | agrega el ítem al final del array |
| `updateItem` | reemplaza el ítem por ID |
| `deleteItem` | filtra el ítem del array |
| `uploadItemImage` / `deleteItemImage` | reemplaza el ítem (la respuesta incluye la nueva `imagenUrl`) |
| `createCategoria` | agrega al final del array |
| `createSubcategoria` | agrega al array `subcategorias` de la categoría padre |
| `updateSubcategoria` | reemplaza la subcategoría dentro de su categoría |
| `deleteSubcategoria` | filtra la subcategoría del array de su categoría |
| `createIngrediente` | agrega al final del array |

### Comportamiento de las tabs

**ItemsTab**
- Muestra un aviso si no hay `selectedMarcaId` (el usuario no tiene marcas cargadas).
- Columnas: imagen (thumbnail 48×48), nombre + descripción truncada, precio, subcategoría, badge disponible, acciones.
- Modal único para create y edit. El campo subcategoría se puebla con las categorías/subcategorías ya cargadas en el store (no hace un fetch adicional).
- El upload de imagen usa un `<input type="file" class="hidden">` con `ref`. Al hacer click en el botón "📷", se dispara `fileRef.current?.click()`. El campo `imageTarget` guarda el ID del ítem al que pertenece el upload en curso.

**CategoriasTab**
- Muestra un aviso si no hay `selectedRestauranteId`.
- Cada categoría es un `CategoriaCard` con header expandible/colapsable.
- Inline edit: al clickear "Editar" aparece un `<input>` con los botones Guardar/Cancelar directamente en la fila, sin abrir modal.
- La validación de "no se puede borrar si tiene subcategorías" la hace el backend (409). El frontend lo avisa con `window.alert` antes de intentar si el conteo local es mayor a 0.

**IngredientesTab**
- Lista plana con una fila por ingrediente.
- Inline edit con el mismo patrón que CategoriasTab.
- Formulario de nuevo ingrediente en la parte superior de la página.

### Variables de entorno

```
# apps/admin/.env.local
VITE_API_URL=http://localhost:3000
```

---

## 8. Decisiones de diseño

### Ingredientes sin soft delete

La tabla `Ingrediente` no tiene campo `activo`. A diferencia de `Marca` o `Restaurante`, un ingrediente sin referencias no tiene historial que preservar — si se borra, no hay pedidos que dependan de él porque la FK de los pedidos va a `ItemIngrediente`, no a `Ingrediente` directamente. Por eso el borrado es físico (hard delete), pero protegido por la validación de `ItemIngrediente.count`.

### Ingredientes scoped al restaurante, ítems scoped a la marca

Un ingrediente como "tomate" puede tener diferente origen o nombre entre sucursales de una misma cadena. Por eso `Ingrediente.restauranteId` — cada restaurante mantiene su propio catálogo de ingredientes.

Los ítems del menú (`ItemMenu`) en cambio pertenecen a la marca, porque el catálogo de platos es compartido entre sucursales. La disponibilidad por sucursal se controla con `ItemSucursal`.

### Comparación case-insensitive para nombres

Un restaurante no debería poder tener "Tomate" y "tomate" como ingredientes distintos. La validación usa la capacidad de Prisma de hacer `mode: 'insensitive'` directamente en la query, sin necesidad de normalizar en la aplicación. El mismo criterio aplica a nombres de categoría, subcategoría e ítem del menú.

### Categorías y subcategorías en un solo módulo

`CategoriaMenu` y `SubcategoriaMenu` son entidades íntimamente relacionadas — una subcategoría no existe fuera de su categoría, y el panel admin siempre las trabaja juntas. Tener dos módulos separados hubiera duplicado la lógica de ownership y obligado a que uno importara el service del otro. Un único `CategoriasService` con métodos `create/findAll/findOne/update/remove` para categorías y `createSub/findAllSubs/findOneSub/updateSub/removeSub` para subcategorías mantiene toda la lógica cohesionada.

### Rutas de subcategorías como sub-rutas del controller de categorías

En lugar de crear un segundo controller `SubcategoriasController`, todas las rutas se definen en `CategoriasController`. Las rutas anidadas (`/categorias/:categoriaId/subcategorias`) expresan la jerarquía en la URL misma. Las rutas de operaciones individuales de subcategorías usan el segmento fijo `subcategorias` antes del `:id` (`/categorias/subcategorias/:id`) para diferenciarse sin ambigüedad de las rutas de categorías (`/categorias/:id`).

---

## 9. Qué falta

| Tarea | Detalle |
|---|---|
| ~~CRUD Ingredientes (backend)~~ | ✅ |
| ~~CRUD Categorías (backend)~~ | ✅ |
| ~~CRUD Ítems del menú (backend)~~ | ✅ |
| ~~Fotos de ítems (backend)~~ | ✅ |
| ~~Asignación de ingredientes a ítems (backend)~~ | ✅ |
| ~~Panel admin — gestión completa del catálogo~~ | ✅ feat/front-menu |
| Disponibilidad por sucursal | `ItemSucursal` — precio override y disponibilidad local por restaurante |
| Menús horarios | `Menu` + `MenuItem` — menús de almuerzo, cena, temporada |
| Admin — gestión de ingredientes por ítem | UI para asociar/desasociar ingredientes a un ítem desde el panel admin |
| Admin — clasificaciones dietéticas | UI para asignar/quitar clasificaciones (vegano, sin gluten, etc.) a un ítem |
