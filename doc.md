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

### No development endpoints

There are no `/api/auth/dev/*` endpoints (they used to create users, even a ROOT, without authentication, and were removed). To get users and data in a local database run the seed (`pnpm --filter @menyu/api seed`); the credentials are in `Documentacion/datos-de-prueba-local.md`. The seed is never run in staging or production: there, accounts are created with the authenticated endpoints.

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
| `POST` | `/api/marcas/:id/logo` | Upload or replace the brand logo (OWNER of that brand only) |
| `DELETE` | `/api/marcas/:id/logo` | Remove the brand logo (OWNER of that brand only) |

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

### `POST /api/marcas/:id/logo`

Upload (or replace) the brand logo. Only the `OWNER` of that brand can do it: `ROOT`, `GERENTE` and the `OWNER` of another brand get 403. Accepts `multipart/form-data`.

**Field name:** `logo`  
**Allowed types:** `image/png`, `image/jpeg`, `image/webp` (checked against the file content, so a renamed file is rejected; SVG is not accepted)  
**Max size:** 2 MB (a file of exactly 2 MB is accepted)

**Response 201**

```json
{
  "id": "uuid",
  "logoUrl": "https://<project>.supabase.co/storage/v1/object/public/logos/marcas/<id>?v=1760000000000"
}
```

The file is always stored at the same path, so the `?v=` suffix changes on every upload to keep browsers from showing the previous logo. The bucket name comes from `SUPABASE_LOGOS_BUCKET` (default `logos`).

**Responses:** 201 uploaded · 400 invalid or missing file · 401 · 403 · 404 · 413 file too large

---

### `DELETE /api/marcas/:id/logo`

Remove the brand logo and delete the stored file. Only the `OWNER` of that brand. Restaurants without a logo of their own end up with no logo.

**Response 200:** `{ "id": "uuid", "logoUrl": null }`

**Responses:** 200 · 401 · 403 · 404 (the brand has no logo)

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
| `POST` | `/api/restaurantes/:id/logo` | OWNER | Upload or replace the restaurant logo |
| `DELETE` | `/api/restaurantes/:id/logo` | OWNER | Remove the restaurant logo |

---

### `POST /api/restaurantes`

**Request body**

```json
{
  "marcaId": "uuid",
  "nombre": "Sucursal Centro",
  "direccion": "Av. Corrientes 1234"
}
```

| Field | Type | Required |
|---|---|---|
| `marcaId` | UUID | yes |
| `nombre` | string | yes |
| `direccion` | string (trimmed, not empty, max 200 characters) | yes |

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
  "modoSesion": "abierto"
}
```

| Field | Type | Values |
|---|---|---|
| `nombre` | string | — |
| `direccion` | string | Trimmed, not empty, max 200 characters. **Only the `OWNER` of the restaurant's brand can change it** (`GERENTE` and `ROOT` get 403) |
| `modoSesion` | string | `"abierto"` \| `"seguro"` |

**Responses:** 200 · 400 · 403 · 404

---

### `DELETE /api/restaurantes/:id`

**Responses:** 204 · 404

---

### `POST /api/restaurantes/:id/logo`

Upload (or replace) the logo of one restaurant. Same rules as the brand logo: `multipart/form-data`, field `logo`, PNG, JPEG or WebP up to 2 MB, only the `OWNER` of the restaurant's brand (`ROOT`, `GERENTE` and the `OWNER` of another brand get 403). When a restaurant has no logo of its own, the brand logo is the one shown to diners.

**Response 201**

```json
{
  "id": "uuid",
  "logoUrl": "https://<project>.supabase.co/storage/v1/object/public/logos/restaurantes/<id>?v=1760000000000"
}
```

**Responses:** 201 uploaded · 400 invalid or missing file · 401 · 403 · 404 · 413 file too large

---

### `DELETE /api/restaurantes/:id/logo`

Remove the restaurant's own logo and delete the stored file (it goes back to using the brand logo). Only the `OWNER` of the restaurant's brand.

**Response 200:** `{ "id": "uuid", "logoUrl": null }`

**Responses:** 200 · 401 · 403 · 404 (the restaurant has no logo of its own)

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

`restauranteId` can also come together with `tableCode`: the table has to belong to that restaurant (the app sends it when the person already chose a restaurant). The table is looked up before anything is created, so a wrong QR or PIN does not leave a guest client behind.

If the restaurant is in `seguro` mode and a session already exists, `codigoSesion` is required to join it.

**Auth:** Optional JWT in `Authorization: Bearer <token>`. With a valid client token the session is registered under that account: the response `clienteId` is the account id, and the same account joining again (for example from a second device) is still one participant. Without a token, or with an expired or invalid one (it is ignored, no error), a guest client ("Invitado") is created. The web client sends the token whenever a customer is logged in.

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
| `restauranteId` | string | required with `pin`; optional with `tableCode` (then the table must belong to it) |
| `pin` | string | — |
| `codigoSesion` | string | required only to join an existing session in secure mode |

**Responses**

| Status | Description |
|---|---|
| 200 | Session opened or joined |
| 403 | Secure mode — `codigoSesion` required |
| 404 | Table not found |
| 409 | The QR belongs to a table of another restaurant than `restauranteId` |

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

**Response body (shape)**

```json
{
  "restaurante": {
    "id": "uuid",
    "nombre": "Restaurante Seed",
    "nombreSeccionRecomendados": "Recomendaciones del chef",
    "direccion": "Av. Siempreviva 742",
    "logoUrl": "https://…/logos/… o null"
  },
  "categorias": [{ "id": "uuid", "nombre": "Principales", "orden": 2, "itemsDirectos": [ /* items */ ] }],
  "recomendados": [ /* items */ ],
  "descuentos": [ /* items */ ]
}
```

`restaurante.logoUrl` ya viene resuelto: el logo propio del restaurante o, si no tiene, el de su marca; `null` si ninguno tiene (la app muestra el de MenYU). `restaurante.direccion` es `null` si no está cargada. El header y el menú lateral del menú (mesa y carta) usan los dos.

Every item carries its prices already calculated, so the apps never calculate prices or percentages:

| Field | Type | Description |
|---|---|---|
| `precioBase` | number | Regular price |
| `precioDescuento` | number \| null | Discounted price in whole pesos; `null` if the item is not discounted |
| `porcentajeDescuento` | number \| null | Discount as an integer from 1 to 99, calculated from the two prices; `null` without discount |
| `precioVigente` | number | What is charged for the item before extras: `precioDescuento` if it has one, otherwise `precioBase` |

`descuentos` lists the available items that are discounted (it honors `buscar`, `dieta` and `evitarAlergenos`), in the same order as `recomendados`: category order, then name. Extras are always charged at their regular price.

---

## Discovery — `/api/discovery`

No authentication required. Public and anonymous: only active restaurants of active brands and available items are returned, and every query selects explicit fields (no Mercado Pago tokens, session mode, tables or PINs).

### `GET /api/discovery`

Restaurants and discounted items for the home screen of `web-cliente`.

**Responses:** 200

**Response body (shape)**

```json
{
  "restaurantes": [
    {
      "id": "uuid",
      "nombre": "Café Almendra",
      "direccion": "Thames 1620, Palermo",
      "logoUrl": "https://.../logos/restaurantes/uuid?v=1760400000000",
      "marca": { "id": "uuid", "nombre": "Café Almendra" },
      "cantidadOfertas": 1
    }
  ],
  "ofertas": [
    {
      "id": "uuid",
      "nombre": "Café + medialuna",
      "imagenUrl": null,
      "precioBase": 3200,
      "precioDescuento": 2400,
      "porcentajeDescuento": 25,
      "precioVigente": 2400,
      "restaurante": { "id": "uuid", "nombre": "Café Almendra" }
    }
  ]
}
```

| Field | Description |
|---|---|
| `restaurantes` | Up to 50 active restaurants (of active brands), ordered by name |
| `restaurantes[].logoUrl` | The restaurant's own logo or, if it has none, its brand's; `null` if neither has one |
| `restaurantes[].direccion` | `null` for restaurants without a stored address |
| `restaurantes[].cantidadOfertas` | Number of available discounted items |
| `ofertas` | Up to 30 available discounted items, highest discount percentage first (ties by name). Prices and percentage are already calculated, as in the menu |

`GET /api/discovery` does not use the `unaccent` extension, so it keeps working if the extension is missing.

---

### `GET /api/discovery/buscar?q=`

Searches restaurants, dishes and offers. It ignores case and accents (`cafe` finds `Café`, `nandu` finds `Ñandú`) and matches "contains", using the `unaccent` PostgreSQL extension (migration `enable_unaccent`). The text is matched literally: `%` and `_` are not wildcards.

**Query params**

| Param | Type | Description |
|---|---|---|
| `q` | string | Required. 2 to 60 characters after trimming the spaces |

**Responses**

| Status | Description |
|---|---|
| 200 | The three groups (any of them can be empty) |
| 400 | `q` is missing, is shorter than 2 characters, is longer than 60 or is repeated |

**Response body (shape)**

```json
{
  "ofertas": [ /* same shape as "ofertas" in GET /api/discovery */ ],
  "restaurantes": [ /* same shape as "restaurantes" in GET /api/discovery */ ],
  "restaurantesConPlatos": [ /* same shape as "restaurantes" in GET /api/discovery */ ]
}
```

The groups come in the order in which `web-cliente` shows them: first the offers, then the restaurants that match by name, and last the restaurants that have matching dishes.

| Group | Description |
|---|---|
| `ofertas` | Available discounted items whose name matches (up to 30, highest percentage first) |
| `restaurantes` | Active restaurants whose name, or whose brand's name, matches (up to 50, by name) |
| `restaurantesConPlatos` | Active restaurants whose name does **not** match but that have at least one available dish that does (up to 50, by name). They have the same fields as the restaurants of the listing: the response does not say which dishes matched or how many |

A restaurant appears in one group only: if its name matches it is in `restaurantes` even when it also has matching dishes.

---

### `GET /api/discovery/restaurantes/:id`

One restaurant and its offers. It is what the restaurant screen of `web-cliente` needs when it is opened from a link or reloaded, because `GET /api/discovery` returns at most 50 restaurants and 30 offers in total. It does not use the `unaccent` extension.

**Path params**

| Param | Type |
|---|---|
| `id` | UUID of the restaurant |

**Responses**

| Status | Description |
|---|---|
| 200 | The restaurant and its offers |
| 404 | The restaurant does not exist, is not active, or its brand is not active. An `id` that is not shaped like a UUID also answers 404 |

**Response body (shape)**

```json
{
  "restaurante": { /* same shape as an item of "restaurantes" in GET /api/discovery */ },
  "ofertas": [ /* same shape as "ofertas" in GET /api/discovery, only this restaurant's */ ]
}
```

| Field | Description |
|---|---|
| `restaurante` | Same fields as in the listing: `logoUrl` is the restaurant's own logo or its brand's, `direccion` can be `null`, `cantidadOfertas` counts the available discounted items |
| `ofertas` | Up to 30 available discounted items of this restaurant, highest discount percentage first (ties by name) |

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
| `PUT` | `/api/items/:id/descuento` | Put an item on discount, by price or by percentage (OWNER and assigned GERENTE) |
| `DELETE` | `/api/items/:id/descuento` | Remove an item's discount (OWNER and assigned GERENTE) |
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

If the item has an active discount, the new `precioBase` must stay greater than the discounted price (and the resulting percentage must stay between 1% and 99%); otherwise the request fails with 400 and the discount has to be removed or changed first.

**Responses:** 200 · 400 · 404

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

### `PUT /api/items/:id/descuento`

Put an item on discount. Only the `OWNER` of the restaurant's brand and a `GERENTE` assigned to that restaurant can do it: `ROOT`, a `GERENTE` of another restaurant, an `OWNER` of another brand and waiters get 403.

Send exactly one of the two fields; the server calculates the other:

```json
{ "precioDescuento": 1200 }
```

```json
{ "porcentaje": 20 }
```

| Field | Type | Rules |
|---|---|---|
| `precioDescuento` | integer | Whole pesos, greater than 0 and lower than `precioBase`. The resulting percentage (rounded) must be between 1 and 99 |
| `porcentaje` | integer | From 1 to 99. The price is `precioBase × (100 − porcentaje) / 100`, rounded to the nearest peso (.5 rounds up). Fails if rounding leaves the price equal to `precioBase` or at $0 |

Only the discounted price is stored; the percentage is always calculated. The discount stays active until someone removes it. A new request replaces the previous discount. It applies to the base price only: extras are charged at their regular price. On success the item is returned with `precioDescuento`, `porcentajeDescuento` and `precioVigente`, and a `menu:updated` event is emitted to the restaurant's room.

**Responses:** 200 · 400 (both fields, none, or an invalid value) · 401 · 403 · 404

---

### `DELETE /api/items/:id/descuento`

Remove the item's discount (same permissions as above). Removing a discount that does not exist is not an error: the item is returned as it is, and no event is emitted.

**Responses:** 200 · 401 · 403 · 404

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
