# MenYU — API Reference

## Global

### Base URL

```
http://localhost:3000
```

The global prefix `/api` is applied to every route **except** `GET /health`.

### Authentication

MenYU has no login of its own: there are no email-and-password endpoints, no refresh tokens and no passwords in our database (Phase 5 of `docs/auth/specs/auth.md` removed them). Accounts live in Supabase Auth, and people sign in at web-auth (`auth.menyu-app.com`). Every route is exactly one of three kinds; `src/auth/rutas-por-autenticacion.spec.ts` walks the router and fails if a route is unclassified or mixes two of them.

| Kind | Header | Who |
|---|---|---|
| Staff and ROOT console | `Authorization: Bearer <Supabase access token>` (Swagger scheme `supabase`) | Accounts with a `Usuario` in MenYU: ROOT, OWNER, GERENTE, JEFE_SALON, MOZO and COCINA |
| Table session | `Authorization: Bearer <jwt>`, the `jwt` returned by `POST /api/sessions/open` | The diner at a table |
| Public | none | Health, Discovery (and `GET /api/marca/publicas` and `/api/marca/:id/restaurantes`), the public menu, `GET /api/clasificaciones`, `POST /api/sessions/open` and Mercado Pago's webhook and OAuth callback |

**Supabase access token.** The backend verifies it against the project's JWKS (issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`) and loads the `Usuario` by its `supabaseUserId`. No token, or an invalid or expired one, or one from another Supabase project: **401**. A Supabase account without an active `Usuario` (a customer account, for example) or without the role the route asks for: **403**. If the JWKS cannot be fetched: **503**.

**Table-session token.** `POST /api/sessions/open` signs it with `JWT_SECRET` and ties it to one session, table and restaurant (`sub` is the `Cliente`). The diner's routes only act on that session: another session's id answers **403**. It is not an account and grants nothing outside the table. A customer account (Supabase) only decides whose name the table is under, when it is sent to `POST /api/sessions/open`.

### Roles

Staff permissions come from `Membresia`: `OWNER` belongs to a brand and covers all of its restaurants; `GERENTE`, `JEFE_SALON`, `MOZO` and `COCINA` belong to one restaurant. Memberships of a deactivated brand or restaurant do not count. ROOT is `Usuario.esRoot`, not a membership: it only works under `/api/root/*` and gets **403** on every data route (ROOT is not a bypass).

The role each route asks for is the matrix of delivery 4.3 in `docs/auth/specs/auth.md`; the restaurant is taken from the path, the query or the body (`restauranteId`) or, for a single resource (`/api/items/:id`), from the resource itself. The groups used below are the ones in `apps/backend/src/auth/roles-del-personal.ts`:

| Group | Roles |
|---|---|
| Administration | `OWNER`, `GERENTE` |
| Floor | `OWNER`, `GERENTE`, `JEFE_SALON`, `MOZO` |
| All staff | `OWNER`, `GERENTE`, `JEFE_SALON`, `MOZO`, `COCINA` |

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

Only these two routes. The old login (`POST /api/auth/login`, `/register`, `/guest`, `/refresh` and `/logout`) was removed in Phase 5 and answers 404: signing up, signing in and recovering a password happen in web-auth, against Supabase.

### `GET /api/auth/me`

Return the user authenticated with Supabase and their memberships (`PerfilUsuario` in `@menyu/types`). An OWNER membership comes with its brand's active restaurants, since it covers all of them.

**Auth required:** `Bearer <Supabase access token>`

**Response 200**

```json
{
  "id": "uuid",
  "email": "ana@menyu.com",
  "nombre": "Ana",
  "esRoot": false,
  "membresias": [
    { "id": "uuid", "rol": "OWNER", "marca": { "id": "uuid", "nombre": "Marca", "restaurantes": [{ "id": "uuid", "nombre": "Sucursal" }] }, "restaurante": null },
    { "id": "uuid", "rol": "MOZO", "marca": null, "restaurante": { "id": "uuid", "nombre": "Sucursal", "marcaId": "uuid" } }
  ]
}
```

**Responses**

| Status | Description |
|---|---|
| 200 | User and memberships (empty list if none) |
| 401 | No token, or invalid, expired or from another Supabase project |
| 403 | The Supabase account has no active `Usuario` in MenYU |
| 503 | The Supabase JWKS could not be fetched |

---

### `POST /api/auth/invitaciones`

Invite a staff member by email (Supabase invite). Creates the `Usuario`, its `Membresia` and, for `MOZO` and `JEFE_SALON`, the restaurant's `Mozo` (or links the existing one with the same email).

**Auth required:** `Bearer <Supabase access token>`

**Body**

```json
{ "email": "carlos@restaurante.com", "nombre": "Carlos", "rol": "MOZO", "restauranteId": "uuid" }
```

`OWNER` goes with `marcaId` (and no `restauranteId`); every other role with `restauranteId` (and no `marcaId`).

Who can invite whom: ROOT → `OWNER` and `GERENTE`; OWNER → any role in their brand; GERENTE → `JEFE_SALON`, `MOZO` and `COCINA` in their restaurants.

If the email already belongs to a `Usuario`, or to a confirmed Supabase account (a registered customer, for example), no email is sent: the membership is added (`invitacionEnviada: false`). An unconfirmed Supabase account with that email is deleted and invited again, because whoever created it may not own the email.

**Response 201:** `{ "usuarioId": "uuid", "membresiaId": "uuid", "invitacionEnviada": true }`

| Status | Description |
|---|---|
| 201 | Invitation created |
| 400 | Invalid body, or `marcaId`/`restauranteId` that doesn't match the role |
| 401 | No token, or invalid or expired |
| 403 | No access to MenYU, or not allowed to invite that role there |
| 404 | Brand or restaurant not found |
| 409 | The user already has a role there, or is deactivated |
| 502 | Supabase rejected the invitation |

---

### No development endpoints

There are no `/api/auth/dev/*` endpoints (they used to create users, even a ROOT, without authentication, and were removed). To get data in a local database run the seed (`pnpm --filter @menyu/api seed`); what it creates is in `Documentacion/datos-de-prueba-local.md` (no passwords: a local account needs a real Supabase user from staging). The seed is never run in staging or production: there, accounts are created with the authenticated endpoints. The **first** ROOT account of an environment is created by hand (a Supabase user plus an `INSERT` into `usuario` with `es_root`, see `docs/auth/usuarios-prueba-staging.md`); the other ones are invited with `POST /api/root/roots`, or an existing `Usuario` is promoted with the team script `apps/backend/scripts/cuentas-root.ts`.

---

## ROOT console — `/api/root`

Plan and decisions: `docs/plan-consola-root.md`. Since delivery 4.4 of `docs/auth/specs/auth.md` the console uses Supabase Auth: owners and ROOT accounts are Supabase users (`Usuario`, `Membresia`) invited by email, with no passwords in our database. The screens for owners and ROOT accounts (stage E2b) are still to come.

- **Auth:** the Supabase access token of a ROOT account (`Usuario.esRoot`), checked at controller level with `@RequiereRoot()`. Any staff role, an account without memberships and a Supabase account without a `Usuario` get **403**; no token, **401**. The routes that change something also read the account inside the transaction: if it stopped being ROOT or was deactivated meanwhile they answer **401** and change nothing.
- **IDs in the path are not required to be UUIDs** (`m-001` works). An id with an impossible shape (`a.b`, spaces…) answers 404.
- **Every change is recorded in the ROOT history, inside the same database transaction as the change**: if the record cannot be written, the change is not made. The record keeps who (a copy of the ROOT's email), what, on what and when. Texts longer than 500 characters are cut and anything that looks like a password hash is replaced by "(no se registra)" (a brand name chosen by its owner cannot block a ROOT action). The table is append-only: the database blocks `UPDATE`, `DELETE` and `TRUNCATE` on it, and there is no route that edits it.
- **Invitations** go through `InvitacionesService`: the call to Supabase comes first, outside the transaction (it sends the email, or reuses an account that is already confirmed), and the `Usuario`, the `Membresia` and the history record are saved together.
- **There is no route to delete a ROOT account or to take ROOT away from it** (not even for ROOT). A test walks the whole router and fails if one appears; the database also refuses to leave no active ROOT account.

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/root/duenos?q=` | List owners (OWNER memberships) with their account and brand (`q`: email or brand name, up to 100 chars, literal) |
| `POST` | `/api/root/marcas/:id/duenos` | Invite an owner to a brand |
| `DELETE` | `/api/root/duenos/:membresiaId` | Remove an owner from a brand (the account stays) |
| `GET` | `/api/root/roots` | List ROOT accounts |
| `POST` | `/api/root/roots` | Invite a new person as a ROOT account |
| `GET` | `/api/root/marcas?bajas=` | List brands with how many restaurants and owners they have (`bajas=true` also lists deactivated ones) |
| `POST` | `/api/root/marcas` | Create a brand (`nombre`, `slug`) |
| `GET` | `/api/root/marcas/:id` | A brand's detail: data, restaurants (address read-only) and owners |
| `PATCH` | `/api/root/marcas/:id` | Change a brand's `nombre` and/or `slug` |
| `POST` | `/api/root/marcas/:id/baja` · `/reactivar` | Deactivate / reactivate a brand (reversible, nothing is deleted) |
| `POST` | `/api/root/marcas/:id/restaurantes` | Create a restaurant in a brand (`nombre`, `direccion`) |
| `PATCH` | `/api/root/restaurantes/:id` | Change a restaurant's `nombre` (only that) |
| `POST` | `/api/root/restaurantes/:id/baja` · `/reactivar` | Deactivate / reactivate a restaurant |
| `GET` | `/api/root/historial` | The ROOT history, newest first, 50 at a time, with filters |

There are no routes to change an owner's or a ROOT account's email or password: they belong to the person, who manages them from web-auth ("Olvidé mi contraseña").

### Owner object

```json
{
  "membresiaId": "4d0e…",
  "usuarioId": "9b1c…",
  "email": "juan@laparrilla.com",
  "nombre": "Juan Pérez",
  "activo": true,
  "marca": { "id": "m-001", "nombre": "La Parrilla", "activo": true }
}
```

No other field is ever returned (no Supabase id, no role). A person can own more than one brand: one object per membership.

### `POST /api/root/marcas/:id/duenos`

```json
{ "email": "Juan@LaParrilla.com", "nombre": "Juan Pérez" }
```

| Field | Type | Required |
|---|---|---|
| `email` | string, valid email, up to 254 chars (trimmed and lowercased) | yes |
| `nombre` | string, up to 100 chars (trimmed); kept as it was if the email already has an account | yes |

**201** — `{ "usuarioId": "9b1c…", "membresiaId": "4d0e…", "invitacionEnviada": true }`. `invitacionEnviada` is `false` when the email already had an account (another brand's owner, staff, a registered client): the membership is added and no email is sent.

**Errors:** 400 invalid body · 403 the email is the caller's own · 404 the brand does not exist · 409 the brand is deactivated, the person already owns it, or the account is deactivated · 502 Supabase rejected the invitation. History: `DUENO_INVITAR`.

### `DELETE /api/root/duenos/:membresiaId`

Deletes the OWNER membership; the `Usuario` stays (it can have other memberships). Every request checks the memberships, so the access is cut at once. **Responses:** 204 · 404 not an OWNER membership · **409 if it is the only owner of an active brand** (invite another owner first, or deactivate the brand). Runs in a serializable transaction. History: `DUENO_QUITAR`.

### `GET /api/root/roots`

```json
[{ "id": "3f2a…", "email": "ana@ejemplo.com", "nombre": "Ana", "activo": true, "esPropia": true }]
```

`esPropia` is `true` for the caller's own account. **Responses:** 200.

### `POST /api/root/roots`

`{ "email": "carla@ejemplo.com", "nombre": "Carla" }`, same rules as inviting an owner. **201** — `{ "usuarioId": "…", "email": "carla@ejemplo.com", "invitacionEnviada": true }`. **Errors:** 400 · **409 if the email already belongs to a `Usuario`** (also the caller's own): making an existing account ROOT is done with `cuentas-root.ts promover` · 502 Supabase. History: `ROOT_INVITAR`.

### Brands and restaurants: what ROOT sees and edits

ROOT sees only identity and state. **Never** logos, address edits, menu, prices, discounts, tables, orders, waiters, session mode or Mercado Pago data: every query has an explicit `select` and a test compares each response's keys against an exact list. ROOT edits a brand's `nombre` and `slug`, and a restaurant's `nombre`; the address is loaded by ROOT **once**, when creating the restaurant, and from then on only the OWNER changes it.

- **A body with any other field is rejected with 400** (it is not silently ignored): for example `{ "nombre": "X", "direccion": "Y" }` on `PATCH /api/root/restaurantes/:id`. The message says which fields were sent and that the rest is the owner's decision. (The global pipe would drop unknown fields without a word and ROOT would think it saved them.) This applies to the four bodies of this section; the owner and ROOT-account invitations above ignore extra fields.
- **A "delete" is a reversible deactivation** (`activo = false`): no brand or restaurant row is ever deleted, and there is no `DELETE` route for them. A deactivated brand or restaurant disappears from Discovery, its menu and its tables stop opening, and its staff loses access (their memberships stop counting); the sessions already open can be paid with Mercado Pago from the table. Each restaurant keeps its own state: reactivating a brand brings everything back as it was.
- `POST …/baja` and `…/reactivar` are idempotent: if it is already in that state the answer is 200 and nothing is recorded.
- `slug` is a lowercase identifier (`la-parrilla-de-juan`: letters a–z, numbers and single hyphens, up to 80 chars). It is unique **even among deactivated brands**: to reuse it, change the old brand's `slug` (ROOT can edit a deactivated brand).

### Brand objects

```json
// GET /api/root/marcas → [ … ]
{ "id": "m-001", "nombre": "La Parrilla", "slug": "la-parrilla", "activo": true,
  "restaurantes": { "activos": 2, "total": 3 }, "duenos": 1 }

// GET /api/root/marcas/:id (also the answer of POST, PATCH, baja and reactivar)
{ "id": "m-001", "nombre": "La Parrilla", "slug": "la-parrilla", "activo": true,
  "restaurantes": [ { "id": "r-001", "nombre": "Centro", "direccion": "Av. Colón 1200", "activo": true } ],
  "duenos": [ { "id": "9b1c…", "membresiaId": "4d0e…", "email": "juan@laparrilla.com", "nombre": "Juan Pérez" } ] }
```

`duenos` is only the OWNER memberships (never the GERENTE ones); `0` means "no owner yet". In the detail, `id` is the `Usuario` and `membresiaId` is what `DELETE /api/root/duenos/:membresiaId` removes.

### `POST /api/root/marcas`

`{ "nombre": "La Parrilla", "slug": "la-parrilla" }` (`nombre` up to 120 chars, trimmed; `slug` is lowercased). **201** the detail of the new, active brand. **Errors:** 400 invalid or extra field · 409 `slug` in use (also by a deactivated brand). History: `MARCA_CREAR`.

### `PATCH /api/root/marcas/:id`

`{ "nombre"?: string, "slug"?: string }`, at least one. Works on deactivated brands too. What arrives equal to what is stored is neither written nor recorded. **Errors:** 400 (nothing to change, invalid, or extra field such as `logoUrl` or `activo`) · 404 · 409 `slug` in use by another brand. History: `MARCA_EDITAR` with the before and after of each changed field.

### `POST /api/root/marcas/:id/baja` and `/reactivar`

No body. **200** the detail. **404** if the brand does not exist. History: `MARCA_BAJA` (`Activa → De baja`) and `MARCA_REACTIVAR`.

### `POST /api/root/marcas/:id/restaurantes`

`{ "nombre": "La Parrilla Centro", "direccion": "Av. Colón 1200, Córdoba" }` (`direccion` up to 200 chars, mandatory). **201** `{ id, nombre, direccion, activo: true }`. **Errors:** 400 · 404 the brand does not exist · 409 the brand is deactivated. History: `RESTAURANTE_CREAR`.

### `PATCH /api/root/restaurantes/:id`

`{ "nombre": string }`. **200** `{ id, nombre, direccion, activo }`. **400 for any other field** (`direccion`, `logoUrl`, `modoSesion`, `nombreSeccionRecomendados`, `activo`, `marcaId`, `mp_*`…) and for an empty body. **404** if it does not exist. History: `RESTAURANTE_EDITAR`.

### `POST /api/root/restaurantes/:id/baja` and `/reactivar`

No body, idempotent, **200** `{ id, nombre, direccion, activo }`, **404**. Reactivating a restaurant of a deactivated brand is allowed. History: `RESTAURANTE_BAJA` (`Activo → De baja`) and `RESTAURANTE_REACTIVAR`.

### `GET /api/root/historial`

Read-only: **there is no route that edits or deletes the history**, not even for ROOT (a test walks the whole router), and the database blocks it too. Only ROOT can read it (the rest get 403).

| Query | Meaning |
|---|---|
| `actor` | Who did it: the email of a ROOT account (case-insensitive) or `script` for the actions of the ROOT-accounts script |
| `entidad` | On what: `MARCA`, `RESTAURANTE`, `OWNER` or `ROOT` |
| `desde`, `hasta` | `YYYY-MM-DD`, whole days in **Buenos Aires time** (UTC-3), both included. A date that does not exist, or `desde` after `hasta`, is a 400 |
| `cursor` | The `siguiente` of the previous answer, to get the next 50 |

Blank values (`?actor=&desde=`) mean "no filter".

```json
{
  "items": [
    { "id": 142, "cuando": "2026-10-20T14:20:11.512Z", "actorTipo": "ROOT", "actorNombre": "ana@ejemplo.com",
      "accion": "RESTAURANTE_EDITAR", "entidadTipo": "RESTAURANTE", "entidadId": "r-001", "entidadNombre": "La Parrilla Alta Córdoba",
      "marcaId": "m-001", "marcaNombre": "La Parrilla",
      "cambios": [ { "campo": "Nombre", "antes": "La Parrilla Centro", "despues": "La Parrilla Alta Córdoba" } ] }
  ],
  "siguiente": 93
}
```

Newest first (by `id`, which only grows, so a new action never shifts the pages). `siguiente` is `null` on the last page. `actorTipo` is `SCRIPT` for the script, and then `actorNombre` is the operating-system user of whoever ran it. `antes` / `despues` are `null` when there was nothing ("—" on screen). The `id` of the ROOT account that acted is not exposed. A password is never in a record: it shows as "no se registra".

---

## Marcas — `/api/marcas`

Auth required on all endpoints: the Supabase access token of the brand's `OWNER`. ROOT gets 403: creating, editing and deactivating brands is done in the ROOT console (`/api/root/marcas`).

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/marcas` | List the caller's brands |
| `GET` | `/api/marcas/:id` | Get brand by ID |
| `PATCH` | `/api/marcas/:id` | Update brand |
| `POST` | `/api/marcas/:id/logo` | Upload or replace the brand logo |
| `DELETE` | `/api/marcas/:id/logo` | Remove the brand logo |

---

### `GET /api/marcas`

Returns the active brands of the caller's `OWNER` memberships (403 without any).

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

Auth required: the Supabase access token, with the roles of the table below. ROOT gets 403: creating and deactivating restaurants is done in the ROOT console (`POST /api/root/marcas/:id/restaurantes` and `POST /api/root/restaurantes/:id/baja`).

### Endpoint summary

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/restaurantes` | OWNER, GERENTE | List the restaurants of the caller's memberships |
| `GET` | `/api/restaurantes/:id` | OWNER, GERENTE | Get restaurant |
| `PATCH` | `/api/restaurantes/:id` | OWNER, GERENTE | Update restaurant (`direccion`: OWNER only) |
| `POST` | `/api/restaurantes/:id/logo` | OWNER | Upload or replace the restaurant logo |
| `DELETE` | `/api/restaurantes/:id/logo` | OWNER | Remove the restaurant logo |

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

Auth required: the Supabase access token. Administration (`OWNER`, `GERENTE`) of the table's restaurant; listing (`GET /api/mesas`) is for the whole floor (`JEFE_SALON` and `MOZO` too), and deleting a table only for the `OWNER`.

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

**Auth:** Public. It optionally takes the Supabase access token of a customer account in `Authorization: Bearer <token>`, verified against the JWKS (ES256 or RS256). With a valid one the session is registered under that account's `Cliente`: the response `clienteId` is its id, and the same account joining again (for example from a second device) is still one participant. Without a token, or with any other one (expired, invalid or from the old login; it is ignored, no error), a guest client ("Invitado") is created. The token only decides whose name the table is under: it grants no permissions. The web client sends it whenever a customer is signed in. The response's `jwt` is the table-session token (see Authentication).

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

**Auth required:** the table-session token (`Bearer <jwt>` from `POST /api/sessions/open`)

**Responses**

| Status | Description |
|---|---|
| 200 | Session closed — returns `{ ok: true }` |
| 400 | Session already closed |
| 401 | Missing or invalid table-session token |

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
| `id` | Id of the restaurant: 1 to 64 letters, digits, `-` or `_`. Usually a UUID, but legacy ids such as `r-001` work too |

**Responses**

| Status | Description |
|---|---|
| 200 | The restaurant and its offers |
| 404 | The restaurant does not exist, is not active, or its brand is not active. An `id` that does not have that shape (other characters, or more than 64) also answers 404 without reaching the database |

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

Auth required: the Supabase access token, Administration (`OWNER`, `GERENTE`) of the restaurant. `DELETE /api/categorias/:id`: `OWNER` only.

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

Auth required: the Supabase access token, Administration (`OWNER`, `GERENTE`) of the item's restaurant. `DELETE /api/items/:id`: `OWNER` only.

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

Auth required: the Supabase access token, Administration (`OWNER`, `GERENTE`) of the restaurant.

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

Diet classifications (e.g. Vegano, Sin TACC). `GET /` is public; the write operations take the Supabase access token. The catalogue is global: creating, editing or deleting a classification needs `OWNER` or `GERENTE` in some restaurant; assigning one to an item, in the item's restaurant.

### Endpoint summary

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/clasificaciones?restauranteId=` | None | List classifications |
| `POST` | `/api/clasificaciones` | OWNER or GERENTE of some restaurant | Create classification |
| `PATCH` | `/api/clasificaciones/:id` | OWNER or GERENTE of some restaurant | Update classification |
| `DELETE` | `/api/clasificaciones/:id` | OWNER or GERENTE of some restaurant | Delete classification |
| `POST` | `/api/clasificaciones/items/:itemId` | OWNER or GERENTE of the item's restaurant | Assign to item |
| `DELETE` | `/api/clasificaciones/items/:itemId/:clasificacionId` | OWNER or GERENTE of the item's restaurant | Remove from item |

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

The waiter's operational profile (`Mozo`). Auth required: the Supabase access token, Administration (`OWNER`, `GERENTE`) of the restaurant; `PATCH /api/mozos/:id`: `OWNER` only.

A waiter is not created here: a person is invited from Personal with `POST /api/auth/invitaciones` (role `MOZO` or `JEFE_SALON`), which creates the restaurant's `Mozo` or links the one with the same email. Their access is removed from Personal (`DELETE /api/restaurantes/:restauranteId/personal/:membresiaId`); a waiter profile is not deleted from the app. The email and the password belong to the person's Supabase account.

### Endpoint summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/mozos?restauranteId=` | List waiters |
| `GET` | `/api/mozos/:id` | Get waiter |
| `PATCH` | `/api/mozos/:id` | Update the waiter's name and phone |

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
  "telefono": "+54911000000"
}
```

Any other field is stripped: whether the person is a floor manager comes from their membership, and access is removed from Personal.

**Responses:** 200 · 403 · 404

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
