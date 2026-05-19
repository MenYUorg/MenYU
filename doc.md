# MenYU — API Reference

## Global

### Base URL

```
http://localhost:3000
```

The global prefix `/api` is applied to every route **except** `GET /health`.

### Authentication

All protected endpoints require a JWT in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Tokens are obtained from any `/api/auth` endpoint that returns a `TokenPair`.

### Token pair shape

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "a3f9c2b1..."
}
```

`accessToken` is a signed JWT. `refreshToken` is a 40-char hex string, stored hashed in the database and valid for 30 days.

### JWT payload (`req.user`)

```json
{
  "sub": "uuid",
  "email": "user@example.com",
  "nombre": "Juan",
  "tipo": "admin | mozo | cliente",
  "rol": "ROOT | OWNER | ADMIN",
  "restauranteId": "uuid"
}
```

### Roles

| Role | Who |
|---|---|
| `ROOT` | Super-admin of the whole platform |
| `OWNER` | Admin of a specific brand (`marcaId` in JWT) |
| `ADMIN` | Operator-level admin (not yet used in guards) |

### Validation

All requests are processed by `ValidationPipe({ whitelist: true, transform: true })`. Unknown fields are stripped. Types are auto-coerced.

### Swagger UI

Available at `/docs` while the server is running.

---

## Health

### `GET /health`

No authentication. No `/api` prefix.

**Response 200**

```json
{ "status": "ok" }
```

---

## Auth — `/api/auth`

### `POST /api/auth/login`

Sign in with email and password (for `Cliente` accounts).

**Request body**

```json
{
  "email": "juan@example.com",
  "password": "MiPassword123!"
}
```

| Field | Type | Required |
|---|---|---|
| `email` | string (email) | yes |
| `password` | string | yes |

**Responses**

| Status | Description |
|---|---|
| 200 | Login successful — returns `TokenPair` |
| 401 | Invalid credentials |

---

### `POST /api/auth/register`

Register a new `Cliente` account.

**Request body**

```json
{
  "nombre": "Juan Pérez",
  "email": "juan@example.com",
  "password": "MiPassword123!",
  "telefono": "+5491112345678"
}
```

| Field | Type | Required |
|---|---|---|
| `nombre` | string | yes |
| `email` | string (email) | yes |
| `password` | string (min 8 chars) | yes |
| `telefono` | string | no |

**Responses**

| Status | Description |
|---|---|
| 201 | Client created — returns `TokenPair` |
| 409 | Email already registered |

---

### `POST /api/auth/guest`

Create a guest session (no credentials required).

**Request body**

```json
{
  "nombre": "Invitado"
}
```

| Field | Type | Required |
|---|---|---|
| `nombre` | string | no |

**Responses**

| Status | Description |
|---|---|
| 200 | Guest session created — returns `TokenPair` |

---

### `POST /api/auth/refresh`

Rotate tokens using a valid refresh token.

**Request body**

```json
{
  "refreshToken": "abc123def456..."
}
```

**Responses**

| Status | Description |
|---|---|
| 200 | Tokens rotated — returns new `TokenPair` |
| 401 | Refresh token invalid or expired |

---

### `POST /api/auth/logout`

Revoke a refresh token (sign out).

**Request body**

```json
{
  "refreshToken": "abc123def456..."
}
```

**Responses**

| Status | Description |
|---|---|
| 204 | Session closed |

---

### `GET /api/auth/me`

Return the JWT payload of the authenticated user.

**Auth required:** `Bearer <accessToken>`

**Responses**

| Status | Description |
|---|---|
| 200 | Returns JWT payload object |
| 401 | Token invalid or expired |

---

### DEV endpoints — remove before production

> These endpoints exist for local testing only. They are not protected.

#### `POST /api/auth/dev/seed`

Creates a seed `Marca`, `Restaurante`, `Admin`, and `Mozo` with known credentials.

**Response 200** — returns the created objects with plain-text passwords.

---

#### `POST /api/auth/dev/admin`

Creates an `Admin` user.

**Request body**

```json
{
  "email": "admin@menyu.com",
  "password": "Admin1234!",
  "rol": "ADMIN",
  "marcaId": "uuid-de-la-marca"
}
```

**Responses:** 201 created · 409 email already taken

---

#### `POST /api/auth/dev/mozo`

Creates a `Mozo` user.

**Request body**

```json
{
  "nombre": "Carlos Mozo",
  "email": "mozo@menyu.com",
  "password": "Mozo1234!",
  "restauranteId": "uuid-del-restaurante"
}
```

**Responses:** 201 created · 409 email already taken

---

#### `POST /api/auth/dev/root`

Creates or refreshes the ROOT account (`root@menyu.com` / `root1234`).

**Response 200** — returns `{ mensaje, accessToken, refreshToken }`

---

## Marcas — `/api/marcas`

Auth required on all endpoints: `Bearer` + role `ROOT`.

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/marcas` | Create brand |
| `GET` | `/api/marcas` | List brands |
| `GET` | `/api/marcas/:id` | Get brand by ID |
| `PATCH` | `/api/marcas/:id` | Update brand |
| `DELETE` | `/api/marcas/:id` | Delete brand |

---

### `POST /api/marcas`

**Request body**

```json
{
  "nombre": "Grupo Gastronómico SRL",
  "slug": "grupo-gastronomico"
}
```

| Field | Type | Required |
|---|---|---|
| `nombre` | string | yes |
| `slug` | string (unique) | yes |

**Responses:** 201 created · 401 unauthenticated · 403 forbidden

---

### `GET /api/marcas`

Returns all brands the current user can see (ROOT sees all).

**Responses:** 200

---

### `GET /api/marcas/:id`

**Responses:** 200 · 404 not found

---

### `PATCH /api/marcas/:id`

**Request body** — all fields optional:

```json
{
  "nombre": "Nuevo nombre",
  "slug": "nuevo-slug"
}
```

**Responses:** 200 · 404

---

### `DELETE /api/marcas/:id`

**Responses:** 204 · 404

---

## Restaurantes — `/api/restaurantes`

Auth required: `Bearer` + role `ROOT` or `OWNER`. OWNER only sees their own brand's restaurants.

### Endpoint summary

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/restaurantes` | ROOT | Create restaurant |
| `GET` | `/api/restaurantes` | ROOT, OWNER | List restaurants |
| `GET` | `/api/restaurantes/:id` | ROOT, OWNER | Get restaurant |
| `PATCH` | `/api/restaurantes/:id` | ROOT, OWNER | Update restaurant |
| `DELETE` | `/api/restaurantes/:id` | ROOT | Delete restaurant |

---

### `POST /api/restaurantes`

**Request body**

```json
{
  "marcaId": "uuid",
  "nombre": "Sucursal Centro",
  "direccion": "Av. Corrientes 1234",
  "qrBaseUrl": "https://app.menyu.com"
}
```

| Field | Type | Required |
|---|---|---|
| `marcaId` | UUID | yes |
| `nombre` | string | yes |
| `direccion` | string | no |
| `qrBaseUrl` | string | no |

**Responses:** 201 · 401 · 403

---

### `GET /api/restaurantes`

**Responses:** 200

---

### `GET /api/restaurantes/:id`

**Responses:** 200 · 404

---

### `PATCH /api/restaurantes/:id`

**Request body** — all fields optional:

```json
{
  "nombre": "Sucursal Norte",
  "direccion": "Av. Santa Fe 500",
  "qrBaseUrl": "https://app.menyu.com",
  "modoSesion": "abierto"
}
```

| Field | Type | Values |
|---|---|---|
| `nombre` | string | — |
| `direccion` | string | — |
| `qrBaseUrl` | string | — |
| `modoSesion` | string | `"abierto"` \| `"seguro"` |

**Responses:** 200 · 404

---

### `DELETE /api/restaurantes/:id`

**Responses:** 204 · 404

---

## Mesas — `/api/mesas`

Auth required: `Bearer` + role `ROOT` or `OWNER`.

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/mesas` | Create table |
| `GET` | `/api/mesas?restauranteId=` | List tables for a restaurant |
| `GET` | `/api/mesas/:id` | Get table |
| `PATCH` | `/api/mesas/:id` | Update table |
| `DELETE` | `/api/mesas/:id` | Delete table |
| `POST` | `/api/mesas/:id/regenerar-qr` | Re-generate QR token |
| `PATCH` | `/api/mesas/:id/pin` | Change table PIN |

---

### `POST /api/mesas`

**Request body**

```json
{
  "numero": "5",
  "restauranteId": "uuid",
  "estado": "libre"
}
```

| Field | Type | Required | Values |
|---|---|---|---|
| `numero` | string | yes | — |
| `restauranteId` | UUID | yes | — |
| `estado` | string | no | `"libre"` \| `"ocupada"` \| `"reservada"` |

**Responses:** 201 · 401 · 403

---

### `GET /api/mesas`

**Query params**

| Param | Type | Required |
|---|---|---|
| `restauranteId` | UUID | yes |

**Responses:** 200

---

### `GET /api/mesas/:id`

**Responses:** 200 · 404

---

### `PATCH /api/mesas/:id`

**Request body** — all optional:

```json
{
  "numero": "6",
  "estado": "ocupada"
}
```

**Responses:** 200 · 404

---

### `DELETE /api/mesas/:id`

**Responses:** 204 · 404

---

### `POST /api/mesas/:id/regenerar-qr`

Generates a new `qrToken` for the table (invalidates the old QR).

**Responses:** 200 · 404

---

### `PATCH /api/mesas/:id/pin`

**Request body**

```json
{
  "pin": "1234"
}
```

| Field | Type | Constraint |
|---|---|---|
| `pin` | string | exactly 4 numeric digits |

**Responses:** 200 · 400 invalid format · 404

---

## Sessions — `/api/sessions`

### `POST /api/sessions/open`

Open or join a table session. The client either:
- Provides `tableCode` (the `qrToken` scanned from a QR)
- Provides `restauranteId` + `pin` (manual entry in secure mode)

If the restaurant is in `seguro` mode and a session already exists, `codigoSesion` is required to join it.

**Auth:** Optional JWT in `Authorization: Bearer <token>`. If absent, the backend auto-creates a guest token.

**Request body**

```json
{
  "tableCode": "abc-qr-token",
  "restauranteId": "uuid",
  "pin": "1234",
  "codigoSesion": "XYZ789"
}
```

| Field | Type | Required |
|---|---|---|
| `tableCode` | string | one of `tableCode` or `restauranteId+pin` |
| `restauranteId` | string | — |
| `pin` | string | — |
| `codigoSesion` | string | required only to join an existing session in secure mode |

**Responses**

| Status | Description |
|---|---|
| 200 | Session opened or joined |
| 403 | Secure mode — `codigoSesion` required |
| 404 | Table not found |

---

### `POST /api/sessions/close`

Close the active session for the authenticated client.

**Auth required:** `Bearer <accessToken>`

**Responses**

| Status | Description |
|---|---|
| 200 | Session closed — returns `{ ok: true }` |
| 400 | Session already closed |
| 401 | Missing or invalid JWT |

---

## Menú público — `/api/menu`

No authentication required.

### `GET /api/menu/:restauranteId`

Returns the full public menu for a restaurant — categories, items, ingredients, and diet classifications.

**Path params**

| Param | Type |
|---|---|
| `restauranteId` | UUID |

**Query params** — all optional

| Param | Type | Description |
|---|---|---|
| `categoriaId` | UUID | Filter by category |
| `buscar` | string | Search by item name |
| `dieta` | string | Comma-separated diet classification names, e.g. `Vegano,Sin TACC` |
| `evitarAlergenos` | `"true"` | If `"true"`, excludes items that contain allergen ingredients |

**Responses**

| Status | Description |
|---|---|
| 200 | Full menu with categories, items, and ingredients |
| 404 | Restaurant not found |

---

## Categorías — `/api/categorias`

Auth required: `Bearer` + role `ROOT` or `OWNER`.

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/categorias` | Create category |
| `GET` | `/api/categorias?restauranteId=` | List categories |
| `GET` | `/api/categorias/:id` | Get category |
| `PATCH` | `/api/categorias/:id` | Update category |
| `DELETE` | `/api/categorias/:id` | Delete category |
| `POST` | `/api/categorias/:categoriaId/subcategorias` | Create subcategory |
| `GET` | `/api/categorias/:categoriaId/subcategorias` | List subcategories |
| `GET` | `/api/categorias/subcategorias/:id` | Get subcategory |
| `PATCH` | `/api/categorias/subcategorias/:id` | Update subcategory |
| `DELETE` | `/api/categorias/subcategorias/:id` | Delete subcategory |

---

### `POST /api/categorias`

**Request body**

```json
{
  "nombre": "Entradas",
  "restauranteId": "uuid",
  "orden": 1
}
```

| Field | Type | Required |
|---|---|---|
| `nombre` | string | yes |
| `restauranteId` | UUID | yes |
| `orden` | integer (≥ 0) | no |

**Responses:** 201 · 401 · 403

---

### `GET /api/categorias`

**Query params**

| Param | Required |
|---|---|
| `restauranteId` (UUID) | yes |

**Responses:** 200 · 401

---

### `GET /api/categorias/:id`

**Responses:** 200 · 404

---

### `PATCH /api/categorias/:id`

**Request body** — all optional:

```json
{
  "nombre": "Platos principales",
  "orden": 2
}
```

**Responses:** 200 · 404

---

### `DELETE /api/categorias/:id`

**Responses:** 204 · 404

---

### `POST /api/categorias/:categoriaId/subcategorias`

**Request body**

```json
{
  "nombre": "Tartas",
  "orden": 0
}
```

| Field | Type | Required |
|---|---|---|
| `nombre` | string | yes |
| `orden` | integer (≥ 0) | no |

**Responses:** 201 · 404 category not found

---

### `GET /api/categorias/:categoriaId/subcategorias`

**Responses:** 200

---

### `GET /api/categorias/subcategorias/:id`

**Responses:** 200 · 404

---

### `PATCH /api/categorias/subcategorias/:id`

**Request body** — all optional:

```json
{
  "nombre": "Empanadas",
  "orden": 1
}
```

**Responses:** 200 · 404

---

### `DELETE /api/categorias/subcategorias/:id`

**Responses:** 204 · 404

---

## Items — `/api/items`

Auth required: `Bearer` + role `ROOT` or `OWNER`.

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/items` | Create item |
| `GET` | `/api/items?restauranteId=` | List items |
| `GET` | `/api/items/:id` | Get item |
| `PATCH` | `/api/items/:id` | Update item |
| `DELETE` | `/api/items/:id` | Delete item |
| `POST` | `/api/items/:id/imagen` | Upload item image (multipart) |
| `DELETE` | `/api/items/:id/imagen` | Remove item image |
| `POST` | `/api/items/:itemId/ingredientes` | Add ingredient to item |
| `PATCH` | `/api/items/:itemId/ingredientes/:id` | Update item-ingredient relationship |
| `DELETE` | `/api/items/:itemId/ingredientes/:id` | Remove ingredient from item |

---

### `POST /api/items`

**Request body**

```json
{
  "restauranteId": "uuid",
  "nombre": "Milanesa napolitana",
  "precioBase": 1500.00,
  "descripcion": "Milanesa de ternera con salsa napolitana y queso",
  "categoriaId": "uuid",
  "subcategoriaId": "uuid",
  "comandaId": "uuid",
  "disponible": true,
  "imagenUrl": "https://storage.example.com/imagen.jpg"
}
```

| Field | Type | Required |
|---|---|---|
| `restauranteId` | UUID | yes |
| `nombre` | string | yes |
| `precioBase` | number (≥ 0, max 2 decimals) | yes |
| `descripcion` | string | no |
| `categoriaId` | UUID | no |
| `subcategoriaId` | UUID | no |
| `comandaId` | UUID | no |
| `disponible` | boolean | no |
| `imagenUrl` | URL string | no |

**Responses:** 201 · 401 · 403

---

### `GET /api/items`

**Query params**

| Param | Type | Required |
|---|---|---|
| `restauranteId` | UUID | yes |
| `subcategoriaId` | UUID | no |
| `disponible` | `"true"` \| `"false"` | no |

**Responses:** 200

---

### `GET /api/items/:id`

**Responses:** 200 · 404

---

### `PATCH /api/items/:id`

**Request body** — all optional:

```json
{
  "nombre": "Milanesa napolitana especial",
  "precioBase": 1600.00,
  "descripcion": "Descripción actualizada",
  "categoriaId": "uuid",
  "subcategoriaId": null,
  "comandaId": "uuid",
  "disponible": false,
  "imagenUrl": "https://storage.example.com/nueva-imagen.jpg"
}
```

`categoriaId` and `subcategoriaId` accept `null` to unset them.

**Responses:** 200 · 404

---

### `DELETE /api/items/:id`

**Responses:** 204 · 404

---

### `POST /api/items/:id/imagen`

Upload an image for an item. Accepts `multipart/form-data`.

**Field name:** `imagen`  
**Allowed types:** `image/jpeg`, `image/png`, `image/webp`  
**Max size:** 5 MB

**Responses:** 201 uploaded · 400 invalid file or too large · 404

---

### `DELETE /api/items/:id/imagen`

Remove the stored image of an item.

**Responses:** 200 · 404

---

### `POST /api/items/:itemId/ingredientes`

Add an ingredient to an item and configure its rules.

**Request body**

```json
{
  "ingredienteId": "uuid",
  "esOriginal": true,
  "cantidad": 1,
  "esRemovible": true,
  "esAgregable": false,
  "precioExtra": 0,
  "cantidadMin": 0,
  "cantidadMax": 3
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `ingredienteId` | UUID | yes | — |
| `esOriginal` | boolean | yes | Part of the original dish |
| `cantidad` | number (positive) | yes | Base quantity |
| `esRemovible` | boolean | no | Client can remove it |
| `esAgregable` | boolean | no | Client can add extra |
| `precioExtra` | number (≥ 0) | no | Extra price when added |
| `cantidadMin` | integer (≥ 0) | no | Minimum client can order |
| `cantidadMax` | integer (positive) | no | Maximum client can add |

**Responses:** 201 · 404 item or ingredient not found

---

### `PATCH /api/items/:itemId/ingredientes/:id`

Update the rules for an existing item-ingredient relationship.

**Request body** — all optional:

```json
{
  "cantidad": 2.0,
  "esOriginal": false,
  "esRemovible": false,
  "esAgregable": true,
  "precioExtra": 0.5,
  "cantidadMin": 0,
  "cantidadMax": 3
}
```

**Responses:** 200 · 404

---

### `DELETE /api/items/:itemId/ingredientes/:id`

Remove the ingredient from the item.

**Responses:** 204 · 404

---

## Ingredientes — `/api/ingredientes`

Auth required: `Bearer` + role `ROOT` or `OWNER`.

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/ingredientes` | Create ingredient |
| `GET` | `/api/ingredientes?restauranteId=` | List ingredients |
| `GET` | `/api/ingredientes/:id` | Get ingredient |
| `PATCH` | `/api/ingredientes/:id` | Update ingredient |
| `DELETE` | `/api/ingredientes/:id` | Delete ingredient |

---

### `POST /api/ingredientes`

**Request body**

```json
{
  "nombre": "Tomate",
  "restauranteId": "uuid",
  "esAlergeno": false
}
```

| Field | Type | Required |
|---|---|---|
| `nombre` | string | yes |
| `restauranteId` | UUID | yes |
| `esAlergeno` | boolean | no |

**Responses:** 201 · 401 · 403

---

### `GET /api/ingredientes`

**Query params**

| Param | Required |
|---|---|
| `restauranteId` (UUID) | yes |

**Responses:** 200

---

### `GET /api/ingredientes/:id`

**Responses:** 200 · 404

---

### `PATCH /api/ingredientes/:id`

**Request body** — all optional:

```json
{
  "nombre": "Cebolla",
  "esAlergeno": true
}
```

**Responses:** 200 · 404

---

### `DELETE /api/ingredientes/:id`

**Responses:** 204 · 404

---

## Clasificaciones — `/api/clasificaciones`

Diet classifications (e.g. Vegano, Sin TACC). `GET /` is public; all write operations require `Bearer` + role `ROOT` or `OWNER`.

### Endpoint summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/clasificaciones?restauranteId=` | None | List classifications |
| `POST` | `/api/clasificaciones` | JWT + ROOT/OWNER | Create classification |
| `PATCH` | `/api/clasificaciones/:id` | JWT + ROOT/OWNER | Update classification |
| `DELETE` | `/api/clasificaciones/:id` | JWT + ROOT/OWNER | Delete classification |
| `POST` | `/api/clasificaciones/items/:itemId` | JWT + ROOT/OWNER | Assign to item |
| `DELETE` | `/api/clasificaciones/items/:itemId/:clasificacionId` | JWT + ROOT/OWNER | Remove from item |

---

### `GET /api/clasificaciones`

**Query params**

| Param | Required |
|---|---|
| `restauranteId` (UUID) | yes |

**Responses:** 200

---

### `POST /api/clasificaciones`

**Request body**

```json
{
  "nombre": "Vegano"
}
```

**Responses:** 201 · 409 already exists

---

### `PATCH /api/clasificaciones/:id`

**Request body**

```json
{
  "nombre": "Vegetariano"
}
```

**Responses:** 200 · 404

---

### `DELETE /api/clasificaciones/:id`

**Responses:** 204 · 409 classification in use · 404

---

### `POST /api/clasificaciones/items/:itemId`

Assign a classification to an item.

**Request body**

```json
{
  "clasificacionId": "uuid"
}
```

**Responses:** 201

---

### `DELETE /api/clasificaciones/items/:itemId/:clasificacionId`

Remove a classification from an item.

**Responses:** 204

---

## Mozos — `/api/mozos`

Auth required: `Bearer` + role `ROOT` or `OWNER`.

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/mozos` | Create waiter |
| `GET` | `/api/mozos?restauranteId=` | List waiters |
| `GET` | `/api/mozos/:id` | Get waiter |
| `PATCH` | `/api/mozos/:id` | Update waiter |
| `DELETE` | `/api/mozos/:id` | Deactivate waiter (soft delete) |

---

### `POST /api/mozos`

**Request body**

```json
{
  "restauranteId": "uuid",
  "nombre": "Carlos Gómez",
  "email": "carlos@menyu.app",
  "password": "password123",
  "telefono": "+54911111111",
  "esJefeSalon": false
}
```

| Field | Type | Required |
|---|---|---|
| `restauranteId` | UUID | yes |
| `nombre` | string | yes |
| `email` | string (email) | no |
| `password` | string (min 8 chars) | yes |
| `telefono` | string | no |
| `esJefeSalon` | boolean | no |

**Responses:** 201

---

### `GET /api/mozos`

**Query params**

| Param | Required |
|---|---|
| `restauranteId` (UUID) | yes |

**Responses:** 200

---

### `GET /api/mozos/:id`

**Responses:** 200 · 404

---

### `PATCH /api/mozos/:id`

**Request body** — all optional:

```json
{
  "nombre": "Carlos G.",
  "email": "nuevo@menyu.app",
  "telefono": "+54911000000",
  "activo": true,
  "esJefeSalon": true,
  "password": "nuevaPassword123"
}
```

**Responses:** 200 · 404

---

### `DELETE /api/mozos/:id`

Sets `activo = false` (soft delete). The waiter record is not removed from the database.

**Responses:** 204 · 404

---

## WebSocket — `/ws`

Namespace: `/ws`  
Transport: Socket.io (default polling + WebSocket upgrade)  
CORS: `origin: *`

### Connection

```js
const socket = io('http://localhost:3000/ws')
```

---

### Client → Server events

#### `session:join`

Join a restaurant-scoped room to receive real-time events for that restaurant.

**Payload**

```json
{
  "restauranteId": "uuid"
}
```

**Acknowledgement**

```json
{ "ok": true }
```

---

### Server → Client events

All events are scoped to the room `restaurante-{restauranteId}`.

#### `pedido:nuevo`

Emitted when a new order is created for this restaurant.

**Payload:** full `Pedido` object

---

#### `pedido:estado`

Emitted when an order's status changes.

**Payload:** updated `Pedido` object

---

#### `mozo:llamado`

Emitted when a table calls the waiter.

**Payload**

```json
{
  "sesionId": "uuid",
  "mesaNumero": "5"
}
```

---

#### `sesion:cerrada`

Emitted when a table session is closed (e.g. after payment).

**Payload**

```json
{
  "sesionId": "uuid"
}
```
