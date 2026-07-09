# Módulo de Usuarios y Autenticación — MenYU

**Sprint:** feat/CRUD-usuario-autenticacion  
**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Fecha:** Abril 2026

---

## Índice

1. [Qué se construyó](#1-qué-se-construyó)
2. [Cambios en la base de datos](#2-cambios-en-la-base-de-datos)
3. [Módulo Users](#3-módulo-users)
4. [Módulo Auth — Backend](#4-módulo-auth--backend)
5. [Guards y decoradores de permisos](#5-guards-y-decoradores-de-permisos)
6. [Módulos Marca y Restaurante](#6-módulos-marca-y-restaurante)
7. [App cliente — pantallas de auth](#7-app-cliente--pantallas-de-auth)
8. [Tests unitarios](#8-tests-unitarios)
9. [Cómo funciona un login completo](#9-cómo-funciona-un-login-completo)
10. [Cómo funcionan los tokens](#10-cómo-funcionan-los-tokens)
11. [Decisiones de diseño](#11-decisiones-de-diseño)
12. [Qué falta antes de producción](#12-qué-falta-antes-de-producción)

---

## 1. Qué se construyó

### Backend (`apps/backend/src/`)

- **`users/`** — acceso a la base de datos para los tres tipos de usuario (Admin, Mozo, Cliente). No tiene endpoints propios, es una capa de datos que otros módulos consumen.
- **`auth/`** — autenticación completa con JWT. Endpoints de login, registro, invitado, refresh y logout. Sistema de guards y decoradores para proteger rutas por tipo y rol.
- **`marca/`** — CRUD de marcas con soft delete y control de acceso por rol (ROOT ve todo, OWNER solo su marca).
- **`restaurante/`** — CRUD de restaurantes con el mismo patrón de permisos.
- **`common/`** — guards y decoradores reutilizables entre módulos: `RolesGuard`, `@Roles()`, `@CurrentUser()`.

### App cliente (`apps/cliente/src/`)

- **Pantallas de autenticación** — login, registro y flujo de invitado completos con navegación y manejo de errores.
- **`services/api.ts`** — cliente HTTP axios con interceptor de refresh automático.
- **`services/storage.ts`** — abstracción de almacenamiento multiplataforma (SecureStore en nativo, localStorage en web).
- **`store/userStore.ts`** — estado global de autenticación con Zustand.

### Tests

- **43 tests unitarios** en 3 suites cubriendo `UsersService`, `AuthService` y `MarcaService`.

**Estructura final del backend:**

```
src/
  auth/
    auth.module.ts
    auth.service.ts
    auth.controller.ts
    strategies/jwt.strategy.ts
    guards/
      jwt-auth.guard.ts
      tipo.guard.ts
      rol.guard.ts
    decorators/
      requires-tipo.decorator.ts
      requires-rol.decorator.ts
  common/
    guards/roles.guard.ts           ← usado por marca y restaurante
    decorators/
      roles.decorator.ts
      current-user.decorator.ts
  marca/
    marca.module.ts
    marca.controller.ts
    marca.service.ts
    dto/create-marca.dto.ts
    dto/update-marca.dto.ts
  restaurante/
    restaurante.module.ts
    restaurante.controller.ts
    restaurante.service.ts
    dto/create-restaurante.dto.ts
    dto/update-restaurante.dto.ts
  users/
    users.module.ts
    users.service.ts
  prisma/
    prisma.module.ts
    prisma.service.ts
```

---

## 2. Cambios en la base de datos

Se corrieron cuatro migraciones en este sprint.

### Migración 1 — `add-password-hash-mozo-cliente`

Agrega `password_hash` a `Mozo` (requerido) y `Cliente` (opcional). Detalle completo en versiones anteriores del documento.

### Migración 2 — `add-refresh-token`

Crea la tabla `refresh_token` para persistir los tokens de renovación. Detalle completo en versiones anteriores.

### Migración 3 — `add-activo-soft-delete`

**Problema:** el código mergeado de marca y restaurante usa un campo `activo` para borrado lógico (soft delete), pero ese campo no existía en el schema original.

**Cambios:**
- `Marca`: se agregó `activo Boolean @default(true)`.
- `Restaurante`: se agregó `activo Boolean @default(true)`.

Con esto, eliminar una marca o restaurante no borra el registro de la DB — solo pone `activo = false`. Esto preserva el historial y evita problemas con foreign keys de pedidos o sesiones históricas.

### Migración 4 — `admin-restaurante-opcional`

**Problema:** el Admin ROOT pertenece a MenYU (la empresa), no a ningún restaurante. Pero el modelo `Admin` tenía `restauranteId` como campo requerido.

**Cambios:**
- `Admin.restauranteId`: pasó de `String` a `String?` (nullable).

Con esto, ROOT puede existir sin restaurante asignado. Los admins normales siguen teniendo su restaurante. Los métodos que derivan el restaurante de un admin (`getMarcaIdForAdmin`, `getRestauranteIdForAdmin`) ahora tiran `NotFoundException` si se llaman con un ROOT (lo cual no debería pasar porque ROOT toma el path separado en los services).

---

## 3. Módulo Users

**Archivos:** `src/users/users.module.ts` y `src/users/users.service.ts`

Este módulo no expone endpoints. Solo existe para que `AuthModule` (y en el futuro el panel admin) puedan buscar y crear usuarios sin saber nada de Prisma directamente.

### Métodos disponibles

Por cada tipo de usuario hay tres operaciones:

```
findAdminByEmail(email)    → busca admin por email (para login)
findAdminById(id)          → busca admin por id (para verificar que existe)
createAdmin(data)          → crea un admin nuevo (restauranteId opcional para ROOT)

findMozoByEmail(email)     → ídem para mozo
findMozoById(id)
createMozo(data)

findClienteByEmail(email)  → ídem para cliente
findClienteById(id)
createCliente(data)
```

### PrismaModule es global

`PrismaModule` está decorado con `@Global()`, lo que significa que `PrismaService` está disponible en cualquier módulo sin necesidad de importarlo explícitamente.

---

## 4. Módulo Auth — Backend

**Archivos:** `src/auth/auth.module.ts`, `auth.service.ts`, `auth.controller.ts`, `strategies/jwt.strategy.ts`

### El controller — endpoints

| Método | Ruta | Requiere auth | Descripción |
|---|---|---|---|
| POST | `/api/auth/login` | No | Login de cualquier tipo de usuario |
| POST | `/api/auth/register` | No | Registro de un Cliente nuevo |
| POST | `/api/auth/guest` | No | Entrar como invitado (crea un Cliente sin contraseña) |
| POST | `/api/auth/refresh` | No | Renovar el access token usando el refresh token |
| POST | `/api/auth/logout` | No* | Cerrar sesión (invalida el refresh token) |
| GET | `/api/auth/me` | Sí | Devuelve el payload del JWT del usuario logueado |

*Pendiente de proteger antes de producción.

**Endpoints temporales de desarrollo** (eliminar antes de producción):

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/dev/seed` | Crea Marca + Restaurante + Admin + Mozo de prueba |
| POST | `/api/auth/dev/admin` | Crea un Admin con los datos que le mandás |
| POST | `/api/auth/dev/mozo` | Crea un Mozo con los datos que le mandás |
| POST | `/api/auth/dev/root` | Crea el Admin ROOT de la plataforma (sin restaurante) |

### El payload del JWT

```json
{
  "sub": "uuid-del-usuario",
  "email": "usuario@test.com",
  "nombre": "Coty",
  "tipo": "cliente",
  "rol": null,
  "iat": 1234567890,
  "exp": 1234568790
}
```

`nombre` se incluyó para que la app pueda mostrar el nombre del usuario (especialmente invitados que no tienen email) sin hacer una llamada extra a la DB.

---

## 5. Guards y decoradores de permisos

Hay dos sistemas de guards en el proyecto que coexisten y se usan en contextos distintos:

### Sistema 1 — `auth/guards/` (tipo + rol)

Creado en este sprint para proteger rutas según el tipo de usuario (`admin`, `mozo`, `cliente`) y su rol libre. Se usa donde hay lógica que diferencia entre tipos de usuario.

```typescript
@UseGuards(JwtAuthGuard, TipoGuard, RolGuard)
@RequiresTipo('admin')
@RequiresRol('JEFE_SALON')
@Post('asignar-mesa')
```

### Sistema 2 — `common/guards/` (roles directo)

Viene del merge con los módulos de marca y restaurante. Es más compacto — chequea directamente `user.rol` contra un array de roles permitidos.

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ROOT', 'OWNER')
@Get()
findAll(@CurrentUser() user: JwtPayload) { ... }
```

`@CurrentUser()` es un param decorator que extrae `req.user` directamente en el argumento del método, evitando tener que tipar `@Req() req: RequestWithUser` en cada endpoint.

### Cuándo usar cada uno

- **`auth/guards/`** → módulos donde la lógica varía por tipo de usuario (auth, sesiones, pedidos).
- **`common/guards/`** → módulos de backoffice (marca, restaurante, admin panel) donde el acceso es solo por rol.

---

## 6. Módulos Marca y Restaurante

Estos módulos llegaron vía merge y se integraron al proyecto corrigiendo tres problemas: paquetes faltantes, schema desincronizado y `restauranteId` obligatorio en ROOT.

### Endpoints de Marca

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/api/marcas` | ROOT | Crea una marca nueva |
| GET | `/api/marcas` | ROOT, OWNER | Lista marcas (ROOT ve todas, OWNER solo la suya) |
| GET | `/api/marcas/:id` | ROOT, OWNER | Detalle de una marca con restaurantes, items y staff |
| PATCH | `/api/marcas/:id` | ROOT, OWNER | Actualiza nombre o slug |
| DELETE | `/api/marcas/:id` | ROOT | Soft delete (activo → false) |

### Endpoints de Restaurante

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | `/api/restaurantes` | ROOT | Crea un restaurante |
| GET | `/api/restaurantes` | ROOT, OWNER | Lista restaurantes (ROOT ve todos, OWNER solo el suyo) |
| GET | `/api/restaurantes/:id` | ROOT, OWNER | Detalle con admins, mozos, mesas, menús |
| PATCH | `/api/restaurantes/:id` | ROOT, OWNER | Actualiza datos del restaurante |
| DELETE | `/api/restaurantes/:id` | ROOT | Soft delete |

### Lógica de permisos

Los services implementan el patrón ROOT / OWNER en todos los métodos de lectura y escritura:

```
findAll(user):
  si user.rol === 'ROOT' → devuelve todos
  si user.rol === 'OWNER' → deriva su marcaId/restauranteId desde la DB y filtra

findOne(id, user):
  si user.rol === 'OWNER' → verifica que el id pedido coincide con el suyo
  si no coincide → 403 Forbidden
```

### Soft delete

Ningún módulo borra registros de la DB. En cambio usa el patrón soft delete: el campo `activo` pasa a `false` y todas las queries filtran por `activo: true`. Esto preserva el historial para reportes y evita errores de integridad referencial con pedidos o sesiones pasadas.

### ROOT admin — sin restaurante

El admin ROOT pertenece a MenYU (la empresa dueña de la plataforma), no a ningún restaurante. Para permitir esto se hizo `restauranteId` nullable en el modelo `Admin`. Los métodos que intentan derivar un restaurante desde un admin (`getMarcaIdForAdmin`, `getRestauranteIdForAdmin`) tiran `NotFoundException('Admin sin restaurante asignado')` si el admin no tiene restaurante — lo cual nunca debería ocurrir porque ROOT toma el path separado en los services.

Credenciales ROOT para desarrollo: `root@menyu.com` / `root1234` (creados vía `POST /api/auth/dev/root`).

---

## 7. App cliente — pantallas de auth

### Flujo de navegación

```
App arranca
    │
    ▼
hydrate() ← carga tokens desde storage
    │
    ├── Hay tokens válidos → /(session)
    │
    └── No hay tokens    → /(auth)/login
                                │
                  ┌─────────────┼──────────────┐
                  ▼             ▼               ▼
           Ingresar        Invitado        Registrarse
         (email+pass)    /(auth)/guest  /(auth)/register
                  │             │               │
                  └─────────────┴───────────────┘
                                │
                                ▼
                          /(session)
```

### Pantalla de login (`(auth)/login.tsx`)

- Campos: email y contraseña.
- Errores diferenciados: `401` → "Email o contraseña incorrectos", sin conexión → "No se pudo conectar".
- El campo `tipo` se fija siempre como `'cliente'` — admins y mozos tienen sus propias apps.

### Pantalla de invitado (`(auth)/guest.tsx`)

- Campo de nombre opcional. Si se deja vacío, el backend lo guarda como `'Invitado'`.
- El nombre queda en el JWT payload, así la app lo puede mostrar sin ir a la DB.

### Pantalla de registro (`(auth)/register.tsx`)

- Campos: nombre, email, contraseña (mínimo 6 caracteres).
- Error `409` → "Ese email ya está registrado".
- Auto-login después del registro.

### `services/api.ts` — axios con refresh automático

Si el servidor devuelve `401`, el interceptor llama a `/auth/refresh` en segundo plano, obtiene un token nuevo y reintenta el request original. El usuario no ve nada. Si el refresh también falla, se hace logout automático.

**Dependencia circular resuelta:** `api.ts` expone `configureApiAuth()` y el store llama a esa función al crearse, registrando los callbacks sin crear un ciclo de imports.

### `services/storage.ts` — almacenamiento multiplataforma

| Plataforma | Implementación | Seguridad |
|---|---|---|
| iOS / Android | `expo-secure-store` | Cifrado en keychain del SO |
| Web (desarrollo) | `localStorage` | Sin cifrado — solo para dev |

### `store/userStore.ts` — estado global con Zustand

| Campo | Tipo | Descripción |
|---|---|---|
| `accessToken` | `string \| null` | JWT actual |
| `refreshToken` | `string \| null` | Token opaco para renovar |
| `user` | `JwtPayload \| null` | Payload decodificado del JWT |
| `isLoading` | `boolean` | Indica si hay un request en curso |
| `isHydrated` | `boolean` | Si ya se cargaron los tokens del storage |

---

## 8. Tests unitarios

### Setup

- **Framework:** Jest + ts-jest (TypeScript nativo, sin compilar a JS primero).
- **Módulo de testing:** `@nestjs/testing` para instanciar servicios en aislamiento.
- **Sin DB:** todos los tests son unitarios puros. `PrismaService` se reemplaza con un mock de Jest que controla exactamente qué devuelve cada método.

### Comandos

```bash
pnpm --filter @menyu/api test         # corre todos una vez
pnpm --filter @menyu/api test:watch   # re-corre al guardar
pnpm --filter @menyu/api test:cov     # genera reporte de cobertura
```

### Cobertura

| Suite | Tests | Qué cubre |
|---|---|---|
| `users.service.spec.ts` | 13 | find/create de Admin, Mozo y Cliente — incluyendo ROOT sin restaurante e invitado sin password |
| `auth.service.spec.ts` | 16 | login (ok + 3 casos fallidos), register, guest (2 casos), refresh (4 casos), logout |
| `marca.service.spec.ts` | 14 | CRUD completo + permisos ROOT vs OWNER + soft delete |
| **Total** | **43** | |

### Patrón de los mocks

Cada service se instancia en un módulo de test donde `PrismaService` y demás dependencias se reemplazan por objetos con `jest.fn()`. Antes de cada test, `jest.clearAllMocks()` limpia el estado para evitar contaminación entre tests.

```typescript
const mockPrisma = {
  admin: { findUnique: jest.fn(), create: jest.fn() },
  refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
}

const module = await Test.createTestingModule({
  providers: [
    AuthService,
    { provide: PrismaService, useValue: mockPrisma },
  ],
}).compile()
```

`bcryptjs` se mockea a nivel de módulo para evitar el costo computacional real del hashing en cada test. En los tests de login, se controla manualmente qué devuelve `bcrypt.compare` (true o false).

---

## 9. Cómo funciona un login completo

```
Cliente                    Backend                      Base de datos
  │                           │                               │
  │── POST /auth/login ───────►│                               │
  │   { email, password, tipo }│                               │
  │                           │── findAdminByEmail(email) ────►│
  │                           │◄── Admin { passwordHash } ─────│
  │                           │                               │
  │                           │ bcrypt.compare(password, hash)│
  │                           │ ✓ coincide                    │
  │                           │                               │
  │                           │── jwt.sign({ sub, email,      │
  │                           │    nombre, tipo, rol })       │
  │                           │                               │
  │                           │── INSERT refresh_token ───────►│
  │                           │   { hash, userId, expiresAt } │
  │                           │                               │
  │◄── { accessToken,─────────│                               │
  │      refreshToken }       │                               │
  │                           │                               │
  │ store: guarda tokens en storage, decodifica JWT           │
  │                                                           │
  │ [15 minutos después, el accessToken expiró]               │
  │                                                           │
  │── GET /api/algo ──────────►│                               │
  │   Authorization: Bearer    │── 401 Unauthorized           │
  │   <token expirado>         │                               │
  │                           │                               │
  │ interceptor detecta 401                                   │
  │── POST /auth/refresh ─────►│                               │
  │   { refreshToken }         │── hash(rawToken)             │
  │                           │── SELECT refresh_token ───────►│
  │                           │◄── { revokedAt: null, valid } ─│
  │                           │── UPDATE revokedAt = NOW() ───►│
  │                           │── INSERT nuevo refresh_token ─►│
  │◄── { accessToken nuevo } ─│                               │
  │                           │                               │
  │── GET /api/algo ──────────►│  [reintento automático]       │
  │◄── respuesta normal ───────│                               │
```

---

## 10. Cómo funcionan los tokens

### Access token (JWT)

- Es un JSON firmado con una clave secreta (`JWT_SECRET`).
- Contiene: ID, email, nombre, tipo y rol del usuario.
- Expira en **15 minutos**.
- Es **stateless**: el backend no necesita ir a la DB para validarlo, solo verifica la firma.
- No se puede revocar antes de que expire (por eso dura poco).

### Refresh token (opaco)

- Es una cadena aleatoria de 80 caracteres hexadecimales.
- **Nunca se guarda en crudo** — se guarda su hash SHA-256 en la DB.
- Expira en **7 días**.
- Se puede revocar en cualquier momento (logout).
- Cada vez que se usa para renovar, se invalida y se emite uno nuevo (rotación).

### Por qué dos tokens y no uno solo

- El access token si se filtra, deja de funcionar en 15 minutos.
- El refresh token está en la DB, se puede revocar al cerrar sesión.
- Es el estándar de la industria para apps móviles.

### Por qué hashear el refresh token

Si la DB se filtra, un atacante encontraría los hashes pero no los tokens originales. Es el mismo principio que hashear contraseñas.

---

## 11. Decisiones de diseño

### `bcryptjs` en lugar de `bcrypt`

`bcrypt` nativo requiere compilar código C++ en la máquina donde se instala. En Windows con pnpm dio problemas de permisos. `bcryptjs` es una implementación 100% JavaScript con la misma API. La diferencia de velocidad no importa: hashear contraseñas intencionalmente lento es una feature de seguridad.

### El `rol` del Admin es un `string` libre

Se evaluó hacer un enum en Prisma. Se descartó porque los roles pueden variar según el negocio. Los valores conocidos en la plataforma son `ROOT` (plataforma), `OWNER` (dueño del restaurante), `ADMIN` (administrador), `JEFE_SALON`.

### Un solo endpoint `/auth/login` con campo `tipo`

Menos rutas, el tipo igual necesita ir en el JWT, y cada app cliente sabe siempre qué tipo de usuario está logueando.

### No hay FK entre `refresh_token` y las tablas de usuario

Postgres no permite FK a tres tablas distintas. Se usa `user_id` + `user_tipo` como strings. Más simple y funciona igual.

### `UsersModule` separado de `AuthModule`

El panel admin también necesita listar/editar usuarios. Si todo estuviera en `AuthModule`, habría que importarlo desde módulos que no tienen nada que ver con auth.

### Dos sistemas de guards

El sistema de `auth/guards/` (TipoGuard + RolGuard) protege rutas donde la lógica varía por tipo de usuario. El sistema de `common/guards/` (RolesGuard) es más compacto y lo usan los módulos de backoffice. Conviven sin conflicto.

### ROOT admin sin `restauranteId`

ROOT pertenece a la empresa MenYU, no a ningún restaurante específico. Forzarlo a tener un restaurante sería incorrecto conceptualmente y crearía dependencias artificiales. `restauranteId` se volvió nullable con una migración específica.

### Soft delete en Marca y Restaurante

Borrar físicamente una marca o restaurante rompería el historial de pedidos, sesiones y pagos que referencian sus IDs. El soft delete (`activo = false`) preserva la integridad referencial y permite restaurar registros si fue un error.

### `expo-secure-store` + fallback a `localStorage`

En producción los tokens van al keychain cifrado del SO. En web (desarrollo con Metro) se usa `localStorage`. La abstracción `storage.ts` oculta esta diferencia con `Platform.OS`.

### Dependencia circular `api.ts ↔ userStore.ts`

Se resolvió con inicialización diferida: `api.ts` expone `configureApiAuth()`, el store la llama al crearse. La dependencia queda en una sola dirección.

---

## 12. Qué falta antes de producción

| Tarea | Por qué importa |
|---|---|
| Eliminar los endpoints `/auth/dev/*` | Cualquiera podría crear admins o ROOT sin autenticación |
| Agregar `@UseGuards(JwtAuthGuard)` al endpoint `/auth/logout` | Hoy cualquiera puede cerrar la sesión de otro si conoce el refreshToken |
| Crear DB de producción separada en Supabase | Hoy tests manuales y dev comparten la misma DB |
| Mover `JWT_SECRET` a variable de entorno segura en Railway | El placeholder actual no es apto para producción |
| Limpiar `refresh_token` vencidos periódicamente | La tabla va a acumular filas viejas con el tiempo |
| Cambiar `localStorage` por `expo-secure-store` en web si se publica como PWA | En web de producción los tokens estarían sin cifrar |
