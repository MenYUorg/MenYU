# Sprint 2 — Auth + Restaurante

**Sprint:** S2 · Issue épica #2  
**Equipo:** De Marcos (margarita0912) · Ojeda (lautiod) · Strumia Carrara (CotyStrumia)  
**Fecha:** 25 de abril de 2026 (con algunas entregas en días siguientes)  
**Estado:** Done

---

## Índice

1. [Objetivo del sprint](#1-objetivo-del-sprint)
2. [Actividades y responsables](#2-actividades-y-responsables)
3. [#185 — CRUD de usuarios](#3-185--crud-de-usuarios)
4. [#35 — Módulo Auth: JWT access + refresh token](#4-35--módulo-auth-jwt-access--refresh-token)
5. [#36 — Configurar Passport.js con estrategia JWT](#5-36--configurar-passportjs-con-estrategia-jwt)
6. [#38 — CRUD Restaurante + Marca (NestJS + Prisma)](#6-38--crud-restaurante--marca-nestjs--prisma)
7. [#40 — Panel admin base: login y gestión de restaurante](#7-40--panel-admin-base-login-y-gestión-de-restaurante)
8. [#41 — App cliente: pantalla de login y flujo invitado](#8-41--app-cliente-pantalla-de-login-y-flujo-invitado)
9. [#39 — CRUD Mesas con generación de QR token](#9-39--crud-mesas-con-generación-de-qr-token)
10. [#42 — Tests de auth (roles, guards, tokens)](#10-42--tests-de-auth-roles-guards-tokens)
11. [#43 — Documentar tipos en @menyu/types](#11-43--documentar-tipos-en-menyutypes)
12. [Decisiones de diseño transversales](#12-decisiones-de-diseño-transversales)
13. [Problemas encontrados y resoluciones](#13-problemas-encontrados-y-resoluciones)

---

## 1. Objetivo del sprint

Implementar autenticación completa con JWT, el módulo de usuarios (Admin, Mozo, Cliente), los primeros módulos de backoffice (Marca y Restaurante), un panel admin base funcional, la app cliente con login, y el CRUD de mesas con generación de QR. Al cierre del sprint el sistema debía soportar login, gestión básica de restaurantes y emisión de QRs para mesas.

---

## 2. Actividades y responsables

| # | Actividad | Responsable |
|---|---|---|
| #185 | CRUD de usuarios | Strumia Carrara |
| #35 | Módulo Auth en NestJS: JWT access + refresh token | Strumia Carrara |
| #36 | Configurar Passport.js con estrategia JWT | Strumia Carrara |
| #38 | CRUD Restaurante + Marca (NestJS + Prisma) | De Marcos |
| #40 | Panel admin base: login y gestión de restaurante | De Marcos |
| #41 | App cliente: pantalla de login y flujo invitado | Strumia Carrara |
| #39 | CRUD Mesas con generación de QR token | Strumia Carrara |
| #42 | Tests de auth (roles, guards, tokens) | Strumia Carrara |
| #43 | Documentar tipos en @menyu/types | Ojeda |

---

## 3. #185 — CRUD de usuarios

**Responsable:** Strumia Carrara  
**PR:** #197 (`feat/CRUD-usuario-autenticacion`) · commit `CRUD de usuarios y auth` — 25/04/2026

### Qué se hizo

Se creó el módulo `users/` que provee acceso a la base de datos para los tres tipos de usuario del sistema (Admin, Mozo, Cliente). No tiene endpoints propios: es una capa de datos que `AuthModule` y otros módulos consumen.

**Archivos creados:**
- `src/users/users.module.ts` — exporta `UsersService`.
- `src/users/users.service.ts` — métodos `findByEmail`, `findById` y `create` para cada tipo de usuario.

**Métodos disponibles:**

```
findAdminByEmail(email)   →  busca Admin por email (login)
findAdminById(id)         →  busca Admin por id (validación de token)
createAdmin(data)         →  crea Admin (restauranteId opcional para ROOT)

findMozoByEmail(email)    →  ídem para Mozo
findMozoById(id)
createMozo(data)

findClienteByEmail(email) →  ídem para Cliente
findClienteById(id)
createCliente(data)
```

**Migraciones corridas:**
- `add-password-hash-mozo-cliente` — agrega `password_hash` a `Mozo` (requerido) y `Cliente` (opcional, para invitados).
- `add-refresh-token` — crea tabla `refresh_token` para persistir tokens de renovación.

### Decisiones

**`UsersModule` separado de `AuthModule`:** el panel admin también necesita listar y editar usuarios. Si todo estuviera en `AuthModule`, otros módulos que no tienen nada que ver con auth tendrían que importarlo.

**Sin endpoints propios en `UsersModule`:** es una capa de abstracción sobre Prisma. Los endpoints de gestión de usuarios los expone `AuthModule` y en el futuro el panel admin.

---

## 4. #35 — Módulo Auth: JWT access + refresh token

**Responsable:** Strumia Carrara  
**PR:** #197 · mismo commit que #185

### Qué se hizo

Se implementó el módulo `auth/` con autenticación completa basada en dos tokens:

**Endpoints implementados:**

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | Login para cualquier tipo de usuario |
| POST | `/api/auth/register` | Registro de cliente nuevo |
| POST | `/api/auth/guest` | Login como invitado (sin contraseña) |
| POST | `/api/auth/refresh` | Renovar access token con refresh token |
| POST | `/api/auth/logout` | Cerrar sesión, invalida refresh token |
| GET | `/api/auth/me` | Datos del usuario autenticado (requiere JWT) |

**Endpoints de desarrollo** (a eliminar antes de producción):

| Ruta | Descripción |
|---|---|
| `POST /api/auth/dev/seed` | Crea datos de prueba completos |
| `POST /api/auth/dev/admin` | Crea un Admin |
| `POST /api/auth/dev/mozo` | Crea un Mozo |
| `POST /api/auth/dev/root` | Crea el Admin ROOT sin restaurante |

**Payload del JWT:**
```json
{
  "sub": "uuid",
  "email": "usuario@test.com",
  "nombre": "Coty",
  "tipo": "cliente",
  "rol": null
}
```

**Tokens:**
- **Access token:** JWT firmado con `JWT_SECRET`, expira en 15 minutos (luego ajustado a 8h para staff y 12h para sesiones de mesa). Stateless — el backend no necesita ir a la DB para validarlo.
- **Refresh token:** cadena aleatoria de 80 caracteres hexadecimales. **Nunca se guarda en crudo** — se persiste su hash SHA-256. Expira en 7 días. Se invalida al hacer logout. Cada uso emite uno nuevo (rotación).

**Contraseñas:** hasheadas con `bcryptjs` (no `bcrypt`).

### Decisiones

**Un solo endpoint `/auth/login` con campo `tipo`:** menos rutas, el tipo igual necesita ir en el JWT, y cada app cliente sabe qué tipo de usuario está logueando.

**Hashear el refresh token antes de guardarlo:** si la DB se filtra, un atacante encontraría los hashes pero no los tokens originales — el mismo principio que hashear contraseñas.

**`bcryptjs` en lugar de `bcrypt`:** `bcrypt` nativo requiere compilar código C++ en la máquina. En Windows con pnpm dio problemas de permisos. `bcryptjs` es 100% JavaScript con la misma API. La diferencia de velocidad no importa: hashear contraseñas intencionalmente lento es una feature de seguridad.

**`nombre` en el JWT payload:** para que la app pueda mostrar el nombre del usuario (especialmente invitados que no tienen email) sin hacer una llamada extra a la DB.

---

## 5. #36 — Configurar Passport.js con estrategia JWT

**Responsable:** Strumia Carrara  
**PR:** #204 (`feat/passport`) · commit `passport` — 25/04/2026

### Qué se hizo

Se configuró Passport.js y se crearon los guards y decoradores del sistema de autorización:

**Guards:**

`auth/guards/` — sistema por tipo + rol (para módulos con lógica que varía por tipo de usuario):
- `jwt-auth.guard.ts` — verifica que el JWT sea válido (via Passport `JwtStrategy`).
- `tipo.guard.ts` — verifica que el `tipo` del JWT coincida con lo declarado en `@RequiresTipo()`.
- `rol.guard.ts` — verifica que el `rol` del JWT coincida con lo declarado en `@RequiresRol()`.

`common/guards/` — sistema compacto por rol (para módulos de backoffice):
- `roles.guard.ts` — verifica `user.rol` contra un array de roles permitidos.

**Decoradores:**
- `@RequiresTipo('admin')` — en auth/decorators/
- `@RequiresRol('ROOT')` — en auth/decorators/
- `@Roles('ROOT', 'OWNER')` — en common/decorators/
- `@CurrentUser()` — param decorator que extrae `req.user` directamente en el argumento del método.

**Estrategia JWT:**
- `strategies/jwt.strategy.ts` — extiende `PassportStrategy(Strategy)`. Lee el token del header `Authorization: Bearer <token>`, valida firma con `JWT_SECRET`, y adjunta el payload a `req.user`.

**Credenciales ROOT para desarrollo:** `root@menyu.com` / `root1234` (creadas vía `POST /api/auth/dev/root`).

### Decisiones

**Dos sistemas de guards que coexisten:**
- `auth/guards/` se usa donde la lógica varía por tipo de usuario (auth, sesiones, pedidos).
- `common/guards/` se usa en módulos de backoffice (marca, restaurante) donde el acceso es solo por rol.

**`@CurrentUser()` como param decorator:** evita tener que tipar `@Req() req: RequestWithUser` en cada endpoint. El payload del JWT queda disponible directamente como argumento del método.

**Migraciones adicionales corridas en este sprint:**
- `admin-restaurante-opcional` — `Admin.restauranteId` pasó de `String` a `String?` para que el ROOT pueda existir sin restaurante asignado.

---

## 6. #38 — CRUD Restaurante + Marca (NestJS + Prisma)

**Responsable:** De Marcos  
**PR:** #206 (`feat/CRUD_restaurantes`) · commit `CRUD de Marca y Restaurante con soft delete` — 25/04/2026

### Qué se hizo

Se implementaron los módulos `marca/` y `restaurante/` con CRUD completo y control de acceso por rol:

**Archivos creados:**
```
src/marca/
  marca.module.ts
  marca.controller.ts
  marca.service.ts
  dto/create-marca.dto.ts
  dto/update-marca.dto.ts

src/restaurante/
  restaurante.module.ts
  restaurante.controller.ts
  restaurante.service.ts
  dto/create-restaurante.dto.ts
  dto/update-restaurante.dto.ts

src/common/
  guards/roles.guard.ts
  decorators/roles.decorator.ts
  decorators/current-user.decorator.ts
```

**Endpoints de Marca:**

| Método | Ruta | Roles |
|---|---|---|
| POST | `/api/marcas` | ROOT |
| GET | `/api/marcas` | ROOT, OWNER |
| GET | `/api/marcas/:id` | ROOT, OWNER |
| PATCH | `/api/marcas/:id` | ROOT, OWNER |
| DELETE | `/api/marcas/:id` | ROOT |

**Endpoints de Restaurante:**

| Método | Ruta | Roles |
|---|---|---|
| POST | `/api/restaurantes` | ROOT |
| GET | `/api/restaurantes` | ROOT, OWNER |
| GET | `/api/restaurantes/:id` | ROOT, OWNER |
| PATCH | `/api/restaurantes/:id` | ROOT, OWNER |
| DELETE | `/api/restaurantes/:id` | ROOT |

**Lógica ROOT vs OWNER:**
```
findAll(user):
  ROOT → devuelve todos
  OWNER → deriva su marcaId/restauranteId desde la DB y filtra por el suyo

findOne(id, user):
  OWNER → verifica que el id solicitado coincide con el suyo
  si no coincide → 403 Forbidden
```

**Migración:** `add-activo-soft-delete` — agrega campo `activo Boolean @default(true)` a `Marca` y `Restaurante`.

### Decisiones

**CRUD de Marca incluido en la misma tarea que Restaurante:** `Restaurante` tiene `marcaId` como campo requerido. No se puede crear un restaurante sin una marca preexistente. Implementar uno sin el otro no tenía sentido.

**Protección de endpoints:** GET públicos (de consulta), POST requiere ROOT (solo la plataforma crea marcas/restaurantes), PATCH requiere OWNER o GERENTE, DELETE requiere ROOT.

**Respuesta de GET por ID sin relaciones anidadas:** devuelve solo los campos propios del registro, sin include de admins, mozos, mesas, etc. Reduce el tamaño de la respuesta y evita exponer datos sensibles inadvertidamente.

**Soft delete:** ningún módulo borra registros de la DB. El campo `activo` pasa a `false`. Todas las queries filtran por `activo: true`. Preserva el historial para reportes y evita errores de integridad referencial con pedidos o sesiones pasadas.

**`class-validator` + `ValidationPipe` global:** adoptado desde este módulo en adelante. Los DTOs validan los campos de entrada antes de que lleguen al service. El pipe global se configura en `main.ts`.

**Downgrade Prisma 7 → 6:** incompatibilidad de Prisma 7 con Node 20. Se hizo downgrade a Prisma 6, que es estable con la versión de Node del proyecto. La migración del lockfile fue la principal fuente del conflicto de merge de este PR (ver sección 13).

---

## 7. #40 — Panel admin base: login y gestión de restaurante

**Responsable:** De Marcos  
**Commit:** `se agrego el panel de login para admins` — entregado dentro del sprint feat/menu (S3)

### Qué se hizo

Se implementó la pantalla de login del panel de administración y la configuración base del cliente HTTP para las apps web:

- **Login screen en `apps/admin/`** — formulario de email/password que consume `POST /api/auth/login`. JWT almacenado en `localStorage`.
- **`services/api.ts` base** — cliente HTTP con header `Authorization` automático para las llamadas autenticadas.
- **Correcciones de compatibilidad en `apps/cliente/`:**
  - `metro.config.js` — actualizado para resolver correctamente los módulos en el monorepo pnpm.
  - `services/storage.ts` — refactorizado en tres archivos: `storage.ts` (interfaz), `storage.native.ts` (implementación Expo SecureStore), `storage.web.ts` (implementación localStorage). Uso de `Platform.select` para cargar la implementación correcta según la plataforma.
  - `store/userStore.ts` — simplificado.

> **Nota:** la gestión completa del catálogo del panel admin (ítems, categorías, ingredientes) se entregó en Sprint 3 dentro de `feat/front-menu`. Esta actividad cubre la base de autenticación y la estructura inicial.

---

## 8. #41 — App cliente: pantalla de login y flujo invitado

**Responsable:** Strumia Carrara  
**PR:** #205 (`feat/login-invitado`) · commit `front cliente` — 25/04/2026

### Qué se hizo

Se implementó el flujo de autenticación completo en `apps/cliente`:

**Pantallas:**
- `(auth)/login.tsx` — email + contraseña, errores diferenciados (401 → "Email o contraseña incorrectos", sin conexión → "No se pudo conectar"). El `tipo` se fija siempre como `'cliente'`.
- `(auth)/guest.tsx` — nombre opcional, se guarda como `'Invitado'` si vacío.
- `(auth)/register.tsx` — nombre, email, contraseña (mínimo 6 caracteres). Error 409 → "Ese email ya está registrado". Auto-login tras el registro.

**`services/api.ts` — axios con refresh automático:**
- Si el servidor devuelve 401, el interceptor llama a `/auth/refresh` en segundo plano, obtiene un token nuevo y reintenta el request original. El usuario no ve nada. Si el refresh también falla, logout automático.
- Dependencia circular entre `api.ts` y `userStore.ts` resuelta con inicialización diferida: `api.ts` expone `configureApiAuth()` que el store llama al crearse.

**`services/storage.ts` — almacenamiento multiplataforma:**

| Plataforma | Implementación | Seguridad |
|---|---|---|
| iOS / Android | `expo-secure-store` | Cifrado en keychain del SO |
| Web (desarrollo) | `localStorage` | Sin cifrado — solo para dev |

**`store/userStore.ts` — Zustand:**

| Campo | Tipo | Descripción |
|---|---|---|
| `accessToken` | `string \| null` | JWT actual |
| `refreshToken` | `string \| null` | Token opaco de renovación |
| `user` | `JwtPayload \| null` | Payload decodificado |
| `isLoading` | `boolean` | Request en curso |
| `isHydrated` | `boolean` | Si ya se cargaron los tokens del storage |

**Flujo de navegación al arrancar la app:**
```
App arranca → hydrate() carga tokens del storage
  ├── Hay tokens válidos → /(session)
  └── No hay tokens → /(auth)/login
```

---

## 9. #39 — CRUD Mesas con generación de QR token

**Responsable:** Strumia Carrara  
**PR:** #213 (`feat/crud-mesas`) · commit `crud mesas y generacion de QR, incluye test` — 25/04/2026

### Qué se hizo

Se implementó el módulo `mesas/` con CRUD completo y generación de QR:

**Archivos creados:**
```
src/mesas/
  mesas.module.ts
  mesas.controller.ts
  mesas.service.ts
  mesas.service.spec.ts   ← 230 líneas de tests
  dto/create-mesa.dto.ts
  dto/update-mesa.dto.ts
```

**Funcionalidad:**
- Crear mesa con número, capacidad y restaurante.
- Al crear una mesa se genera automáticamente un `qrToken` único — identificador interno de la app, **no una URL**.
- Listar mesas por restaurante.
- Actualizar datos de una mesa.
- Soft delete via campo `activo`.
- Endpoint de regeneración de QR (para cuando se necesita invalidar el QR anterior).

**Migración:** `add-activo-mesa` — agrega `activo Boolean @default(true)` a la tabla `mesa`.

**Dependencia agregada:** `qrcode` para la generación del token QR.

**Tests:** 230 líneas en `mesas.service.spec.ts` cubriendo CRUD y generación de QR.

### Decisiones

**QR como identificador interno, no URL:** el cliente escanea el QR desde dentro de la app MenYU, no desde la cámara del SO. El QR contiene solo el token (UUID o string corto), no una URL completa. Esto permite cambiar el dominio de la app sin invalidar todos los QRs impresos.

**Regeneración de QR como operación explícita:** si un QR se filtra o se quiere cambiar, el admin puede generar uno nuevo. El token anterior queda inválido automáticamente porque el nuevo token sobreescribe el campo en la DB.

---

## 10. #42 — Tests de auth (roles, guards, tokens)

**Responsable:** Strumia Carrara  
**PR:** #207 (`test/test-avances`) · commit `test de usuarios y marcas/restaurantes` — 25/04/2026

### Qué se hizo

Se implementó la infraestructura de testing del backend y se escribieron 43 tests unitarios en 3 suites:

**Setup:**
- `apps/backend/jest.config.js` — configuración de Jest + ts-jest para TypeScript nativo.
- Scripts en `package.json`: `test`, `test:watch`, `test:cov`.

**Suites:**

| Suite | Tests | Qué cubre |
|---|---|---|
| `users.service.spec.ts` | 13 | find/create de Admin, Mozo y Cliente — ROOT sin restaurante, invitado sin password |
| `auth.service.spec.ts` | 16 | login (ok + 3 casos fallidos), register, guest (2 casos), refresh (4 casos), logout |
| `marca.service.spec.ts` | 14 | CRUD completo + permisos ROOT vs OWNER + soft delete |
| **Total** | **43** | |

**Patrón de mocks:**
```typescript
const mockPrisma = {
  admin: { findUnique: jest.fn(), create: jest.fn() },
  refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
}
// jest.clearAllMocks() antes de cada test
```

`bcryptjs` se mockea a nivel de módulo para evitar el costo computacional real del hashing. El mock controla manualmente si `bcrypt.compare` devuelve `true` o `false`.

---

## 11. #43 — Documentar tipos en @menyu/types

**Responsable:** Ojeda  
**PRs:** #233 y #235 (`feat/doc-menyutypes`) · commit `feat(types): centralizar y expandir tipos en @menyu/types`

### Qué se hizo

Se expandió `@menyu/types` de los 4 tipos iniciales del Sprint 1 a una librería completa que modela todo el dominio del sistema. Se reorganizó en archivos por módulo:

**Archivos creados/expandidos (+365 líneas, 10 archivos):**

| Archivo | Contenido |
|---|---|
| `src/auth.types.ts` | `JwtPayload`, tipos de auth, roles |
| `src/session.types.ts` | `SesionMesa`, `OpenSessionResult`, estados de sesión |
| `src/menu.types.ts` | `ItemMenu`, `CategoriaMenu`, `SubcategoriaMenu`, `Ingrediente` |
| `src/order.types.ts` | `Pedido`, `PedidoItem`, `PedidoItemMod`, `ItemCarrito` |
| `src/payment.types.ts` | `Pago`, `PaymentStatus` |
| `src/waiter.types.ts` | `LlamadoMozo` |
| `src/socket/events.ts` | `ServerToClientEvents`, `ClientToServerEvents` |
| `src/api/requests.ts` | DTOs de request tipados (136 líneas) |
| `src/api/responses.ts` | DTOs de response tipados |

**`src/index.ts`** — actualizado para re-exportar todos los archivos.

### Decisiones

**Archivos por módulo en lugar de un `index.ts` monolítico:** a medida que el sistema crece, un único archivo de tipos se vuelve difícil de navegar. Separar por módulo (`menu.types.ts`, `order.types.ts`, etc.) permite encontrar los tipos relevantes rápidamente y reduce los conflictos de merge cuando dos personas modifican tipos distintos simultáneamente.

**`api/requests.ts` y `api/responses.ts` dentro de `@menyu/types`:** los DTOs tipados se comparten entre el backend (que los valida) y el frontend (que los construye). Tenerlos en un paquete compartido garantiza que ambos lados usen exactamente la misma estructura.

---

## 12. Decisiones de diseño transversales

| Decisión | Contexto |
|---|---|
| `class-validator` + `ValidationPipe` global desde S2 | Se adoptó en el módulo de marca/restaurante y se propagó a todos los módulos siguientes |
| Dos sistemas de guards que coexisten (`auth/guards/` y `common/guards/`) | Diferentes necesidades: tipo+rol para flujos de usuario, solo rol para backoffice |
| Soft delete en Marca y Restaurante | Preserva historial de pedidos/sesiones con FK activas |
| ROOT admin sin `restauranteId` | ROOT pertenece a MenYU (la plataforma), no a un restaurante específico |
| QR como token interno, no URL | Permite cambiar la URL de la app sin invalidar QRs ya impresos |
| Access token de 15min + refresh token de 7 días | Estándar industria para apps móviles: access corto limita el daño si se filtra, refresh revocable permite logout real |

---

## 13. Problemas encontrados y resoluciones

### Conflicto de merge en `pnpm-lock.yaml` — PR #206

**Problema:** el PR de CRUD Marca/Restaurante tenía conflicto con `main` en `pnpm-lock.yaml` por diferencia de versión de Prisma (v6 en el PR vs v7 en main). GitHub no pudo resolverlo automáticamente.

**Resolución:**
```bash
git merge origin/main        # materializar el conflicto localmente
git checkout --theirs pnpm-lock.yaml  # aceptar la versión de main (Prisma v7 → luego downgrade a v6)
pnpm install                 # regenerar el lockfile con las deps del proyecto
# commit y push → PR se actualizó automáticamente
```

**Archivos afectados:** `pnpm-lock.yaml` + `apps/backend/package.json` (versión de Prisma).

### Downgrade Prisma 7 → 6

**Problema:** Prisma 7 introdujo incompatibilidades con Node 20 en el entorno de desarrollo.

**Resolución:** downgrade a Prisma 6, que es la versión estable y compatible con el stack del proyecto.

### Dependencia circular `api.ts ↔ userStore.ts` en `apps/cliente`

**Problema:** `api.ts` necesita el refresh token del store para el interceptor, pero el store importa `api.ts` para hacer llamadas. Ciclo de imports.

**Resolución:** inicialización diferida con `configureApiAuth()`. `api.ts` expone la función; el store la llama al crearse. La dependencia queda en una sola dirección: store → api.

---

*MenYU · De Marcos · Ojeda · Strumia Carrara · 2026*
