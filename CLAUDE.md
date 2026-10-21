# MenYu — Contexto del Proyecto

Plataforma gastronómica para gestión de restaurantes. Los clientes escanean un QR **desde dentro de la app** (no URL) para abrir una sesión de mesa, ver el menú, hacer pedidos con modificaciones de ingredientes, llamar al mozo y pagar — todo desde su dispositivo.

Equipo: De Marcos, Ojeda, Strumia Carrara (ODS390-2026). Stack sin experiencia previa, ~10-20h/semana por persona.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js + TypeScript + NestJS + Prisma ORM |
| Base de datos | PostgreSQL via Supabase |
| Tiempo real | Socket.io |
| Panel web admin | React + Vite + TailwindCSS · apps/web-admin |
| Panel web staff | React + Vite + TailwindCSS · apps/web-staff (cocina + mozo web) |
| App web cliente | React + Vite + TailwindCSS · apps/web-cliente |
| Login central | React + Vite + TailwindCSS · apps/web-auth (Supabase Auth) |
| Infra frontend | Vercel (un proyecto por app, más uno de staging por app) |
| Estado global | Zustand |
| Monorepo | Turborepo + pnpm workspaces |
| Tipos compartidos | `@menyu/types` |
| Pagos | Mercado Pago (detrás de interfaz `PaymentProvider`) |
| Infra | Railway (backend) + Supabase (DB) + Vercel (frontends web) |
| Recomendaciones (v2.0) | Python + FastAPI + pandas/numpy + OpenAI API |

---

## Estructura de carpetas

```
MenYu/
├── apps/
│   ├── backend/          → @menyu/api          (NestJS + Prisma)
│   ├── web-cliente/      → @menyu/web-cliente  (React + Vite · menú del comensal)
│   ├── web-staff/        → @menyu/web-staff    (React + Vite · cocina + mozo web)
│   ├── web-admin/        → @menyu/web-admin    (React + Vite · panel administrador)
│   └── web-auth/         → @menyu/web-auth     (React + Vite · login central con Supabase)
├── packages/
│   ├── types/            → @menyu/types    (tipos TS compartidos)
│   ├── ui/               → @menyu/ui       (componentes React compartidos y tokens de marca: @menyu/ui/tailwind-preset)
│   ├── auth-client/      → @menyu/auth-client (sesión de Supabase en cookie de dominio compartido, RequireAuth, logout)
│   └── config/           → @menyu/config   (ESLint + TS configs base)
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
└── .env.example
```

### Interior de `apps/backend/`

```
apps/backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── auth/             (module, controller, service, guards/)
    ├── restaurant/       (module, controller, service)
    ├── tables/           (module, controller, service)
    ├── sessions/         (module, controller, service, gateway.ts)
    ├── menu/             (module, controller, service)
    ├── discovery/        (module, controller, service, dto/ — público, sin guards)
    ├── root/             (consola de ROOT: marcas/, restaurantes/, duenos/, roots/, historial/ — solo ROOT; el historial es de solo agregar)
    ├── orders/           (module, controller, service, gateway.ts)
    ├── waiter-calls/     (module, controller, service, gateway.ts)
    ├── payments/
    │   ├── payments.module.ts
    │   ├── payments.controller.ts
    │   ├── payments.service.ts
    │   └── providers/    (payment-provider.interface.ts, mercadopago.provider.ts)
    └── common/           (filters/, interceptors/, decorators/, pipes/)
```

### Interior de `packages/types/`

```
packages/types/src/
├── index.ts
├── auth.types.ts
├── session.types.ts
├── menu.types.ts
├── order.types.ts
├── payment.types.ts
├── waiter.types.ts
├── socket/               (events.ts — eventos Socket.io tipados)
└── api/                  (requests.ts, responses.ts — DTOs compartidos)
```

### Roles de administración (enum `RolAdmin` en DB)
| Rol | Descripción |
|---|---|
| `ROOT` | Administración general del sistema MenYu: crea, edita y borra marcas, restaurantes y usuarios OWNER (asignados a su marca) y crea otras cuentas ROOT (las cuentas ROOT no se borran desde la app, y la primera de cada entorno sale de `apps/backend/scripts/cuentas-root.ts`). Todo lo que hace queda en un historial que nadie puede editar ni borrar y que ven todos los ROOT. **No** crea GERENTE (los crea el OWNER), **no** decide sobre marcas ni restaurantes (menú, precios, descuentos, mesas, pedidos, logo, dirección…) y **no** accede a sus datos privados. No es un bypass. Su consola (`/root` en web-admin) está en `docs/plan-consola-root.md` |
| `OWNER` | Dueño de una marca — acceso a toda su marca y sus restaurantes. Lo crea ROOT |
| `GERENTE` | Gerente de restaurantes específicos (una `Membresia` por restaurante; antes, la tabla `AdminRestaurante`, que se retira en la Fase 5). Lo invita el OWNER desde Personal |

### Tipos de usuario adicionales (tablas separadas, NO son RolAdmin)
| Tipo | Tabla | App |
|---|---|---|
| Mozo | `mozo` | apps/web-staff |
| Cocina | — (no hay tabla ni login propio; con Supabase es el rol `COCINA` de `Membresia`) | apps/web-staff |
| Cliente/Comensal | `cliente` | apps/web-cliente |

### Guards NestJS
- Las rutas del personal usan el token de Supabase (ver "Autenticación con Supabase"): `@RequiereRol`/`@RequiereRolEn` o `@Personal()` más `AccesoService` en el service. Los grupos de roles de la matriz por ruta están en `apps/backend/src/auth/roles-del-personal.ts`.
- `@Roles(RolAdmin.ROOT)` con el JWT legacy queda solo en la consola de ROOT (`/root/*`) hasta la entrega 4.4, que la pasa a `@RequiereRoot()`
- ROOT no es un bypass: no figura en ningún rol ni chequeo de pertenencia y recibe 403 en las rutas de datos (`AccesoService` ignora `esRoot`). Sus rutas van en `/root/*`, con un `select` explícito en cada consulta
- El comensal no usa guards del personal — se autentica por sesión de mesa (`SessionAuthGuard`)

### Autenticación con Supabase (migración en curso)
Spec, decisiones y fases: `docs/auth/specs/auth.md` (una fase por sesión; al cerrar cada una, el subagente `revisor`). Hechas: Fase 1 (modelo de datos), Fase 2 (backend), Fase 3 (web-auth) y Fase 3b (Google y `/privacidad`), en staging y en producción desde v1.1.0, con la pantalla de consentimiento de Google publicada. En curso: Fase 4 (SSO en las apps), por entregas, en el PR draft #416 desde la 4.2; están hechas la 4.1 (`@menyu/auth-client` y web-auth sobre la cookie de dominio compartido), la 4.2 (base de permisos del backend) y la 4.3 (los controllers del personal sobre Supabase, sin ROOT, los cobros de #356 y Personal).
- Modelos nuevos: `Usuario` (`supabaseUserId`, `esRoot` para ROOT) y `Membresia` con el enum `Rol`: `OWNER` por marca; `GERENTE`, `JEFE_SALON`, `MOZO` y `COCINA` por restaurante (CHECK `membresia_ambito_check` en la migración). Además `Mozo.usuarioId` (los mozos invitados no tienen `passwordHash`) y `Cliente.supabaseUserId`. `usuario` y `membresia` tienen RLS sin políticas.
- Backend (en `apps/backend/src/auth/`):
  - `SupabaseAuthGuard` verifica el access token de Supabase contra el JWKS de `SUPABASE_URL` y deja el `Usuario` en `request.usuario` (lo lee `@UsuarioActual()`).
  - `@RequiereRol(...)` suma `MembresiaGuard` y exige el rol en el restaurante de `:restauranteId` (la membresía OWNER de la marca cubre sus sucursales). `@RequiereRolEn({ param | query | body }, ...)` lo toma de otro lugar.
  - `@Personal()` solo autentica: en las rutas de un recurso (`/items/:id`) el service llama a `AccesoService.exigirRol` o `exigirOwnerDeMarca`. `@RequiereRoot()` suma `RootGuard` (`esRoot`), solo para `/root/*`.
  - Los permisos los decide `AccesoService`, que ignora `esRoot` y no cuenta las membresías de un restaurante o una marca dados de baja. `exigirMozo` da el `Mozo` activo de la cuenta (quien atiende, edita o cobra sale de ahí, nunca del body), y `exigirAlgunRol` es para lo que no es de un restaurante.
  - Desde la 4.3 los usan todas las rutas del personal; la matriz por ruta está en `docs/auth/specs/auth.md`. `src/auth/rutas-por-autenticacion.spec.ts` lista las que todavía usan el JWT legacy (solo `/root/*`, hasta la 4.4): al pasar una a Supabase, sacarla de ahí.
  - Ninguna respuesta del personal devuelve las columnas `mp_*` ni `passwordHash`: `select` explícito (`RESTAURANTE_SELECT` y compañía), con un test de contrato en `prisma/includes-contract.spec.ts`.
  - Personal (`GET` y `DELETE /restaurantes/:restauranteId/personal`, en `src/personal/`) lista y quita el acceso; el alta es `POST /auth/invitaciones`. `/admins`, `/admin-restaurante` y `POST /mozos` ya no existen.
  - Los cobros guardan la cuenta en `Pago.usuarioId` (`common/atribucion-del-cobro.ts`): un mozo cobra a su nombre, un OWNER o GERENTE puede atribuírselo a un mozo.
  - Tests: `src/test/acceso-de-test.ts` tiene las cuentas (`CUENTAS`), el `MUNDO` y un `AccesoService` sin base que usan los specs de endpoints (`cuenta:` en `crearAppDeEndpoints`) y los de los services.
- web-auth (`apps/web-auth`, `auth.<ambiente>`, puerto 5173): login con email y contraseña o con Google, olvidé mi contraseña, aceptar invitación, selector y "sin acceso".
  - "Continuar con Google" está en `/` y en `/invitacion`, y vuelve a `/google`, que muestra el error o sigue a `/`.
  - Una cuenta de Google sin invitación no da acceso: `/auth/me` responde 403.
  - `/privacidad` es la política de privacidad pública que figura en Google Cloud. No usa la sesión: no le pongas post-login ni la cambies de ruta.
  - Después del login llama a `GET /auth/me` y manda al `redirect` (solo `https://*.menyu-app.com`, o `*.menyu.local` en local) o a la app del rol.
  - Los links del mail traen un `token_hash` que se canjea con `verifyOtp` (plantillas: `docs/auth/VariablesACambiar.md`).
  - La sesión vive en la cookie de dominio compartido de `@menyu/auth-client` (`VITE_AUTH_COOKIE_DOMAIN`). web-admin y web-staff todavía no la leen (entregas 4.5 y 4.6).
  - Probar en local contra staging: `docs/auth/VariablesACambiar.md`, Desarrollo local.
- Siguen con la autenticación actual la consola de ROOT (hasta la 4.4), web-admin y web-staff (hasta la 4.5 y la 4.6: mientras tanto no funcionan contra este backend, dentro del PR #416) y el login en `/auth` de web-cliente: JWT propio con `JWT_SECRET`, `@Roles`, `RolesGuard` y `@CurrentUser`. No mezclar los dos sistemas en un mismo endpoint.
- En el seed, el `Usuario` OWNER de Marca Seed (`owner@menyu.com`) tiene un `supabaseUserId` ficticio que no existe en ningún proyecto de Supabase. Para iniciar sesión con él (desde la Fase 2) hay que reemplazarlo por el id de un usuario real del Supabase de staging; el seed no lo pisa.

---

## Arquitectura de frontends web

### Cuatro apps web independientes (Vercel)
```
apps/web-cliente/   → mesa.menyu-app.com     (comensal)
apps/web-staff/     → staff.menyu-app.com    (cocina + mozo web)
apps/web-admin/     → admin.menyu-app.com    (dueño/administrador)
apps/web-auth/      → auth.menyu-app.com     (login central, Supabase Auth)
```
La API (Railway) está en `api.menyu-app.com`. Staging: `<app>.staging.menyu-app.com`. Local: `<app>.menyu.local` (ver la sección Dominios de `docs/auth/specs/auth.md`). Durante la migración siguen activos los dominios viejos (`menyu-*.vercel.app`, `menyu-backend-*.up.railway.app`): no darlos de baja (QR impresos, webhooks de Mercado Pago). Las variables por plataforma: `docs/auth/VariablesACambiar.md`.

Cada una es un proyecto Vite independiente con su propio deploy en Vercel.
Un cambio en web-admin no afecta ni rebuilda web-cliente.

### Autenticación

**Flujo normal (usuario + contraseña):**
- Login compartido entre web-admin y web-staff vía `packages/auth`
- Al recibir el JWT redirige según `user.tipo`:
  admin → web-admin, mozo/cocina → web-staff
- Cada app valida que el rol del JWT coincida con su dominio.
  Si no coincide, redirige al login.

**Flujo alternativo QR/PIN (solo web-cliente):**
- Exclusivo de apps/web-cliente — nunca en web-admin ni web-staff
- No usa usuario ni contraseña — autentica una mesa, no un usuario
- Redirige directamente a la vista de menú de esa mesa
- El comensal nunca pasa por el login común

### Código compartido entre apps web

Vive en packages/:
- `packages/auth`  → LoginForm, useAuth, authService
                     compartido entre web-admin y web-staff
                     NO usar en web-cliente
- `packages/auth-client` → cliente de Supabase con la cookie de dominio compartido, `useSession`,
                     `RequireAuth`, `logout` y qué app le toca a cada perfil (Fase 4 de auth)
- `packages/ui`    → componentes visuales idénticos entre apps
                     Button, Input, Modal, Avatar, hooks compartidos
- `packages/types` → tipos TypeScript (sin cambios)

**Regla para decidir si algo va a packages/:**
Un componente va a packages/ solo si se comporta exactamente igual sin importar el rol.
Si tiene lógica condicional por rol, vive en cada app por separado.

### Seguridad por separación de bundles
El código del admin no existe en el bundle del comensal.
Aunque el comensal no pueda acceder al panel admin, en la arquitectura anterior
el código JS era inspeccionable. Con las 3 apps separadas eso no es posible.

---

## Entidades base del dominio (v1.0)

### Mesa / Sesión
- Una mesa tiene un QR interno (no URL). El cliente escanea desde la app.
- La sesión se abre al escanear y se cierra al pagar.
- `SESION_MESA` conecta mesa → cliente → pedidos → pagos.

### Pedido
- Un pedido tiene ítems (`PEDIDO_ITEM`) con modificaciones de ingredientes (`PEDIDO_ITEM_MOD`).
- Estados: `PENDIENTE → EN_PREPARACION → LISTO → ENTREGADO`.
- Se comunica en tiempo real vía Socket.io (canal por sesión).

### Pago
- Interfaz abstracta `PaymentProvider` — implementación concreta: Mercado Pago.
- Un pago cierra la sesión de mesa.

### Tipos TypeScript base en `@menyu/types`

```typescript
// Pedido
export type EstadoPedido = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO' | 'CANCELADO'

export interface PedidoItem {
  id: string
  itemMenuId: string
  nombre: string
  cantidad: number
  precioUnitario: number
  modificaciones: ModificacionIngrediente[]
}

export interface ModificacionIngrediente {
  ingredienteId: string
  nombre: string
  accion: 'AGREGAR' | 'QUITAR'
}

export interface Pedido {
  id: string
  sesionId: string
  estado: EstadoPedido
  items: PedidoItem[]
  total: number
  creadoEn: string
}

// Cliente
export interface Cliente {
  id: string
  nombre?: string
  email?: string
  telefono?: string
  creadoEn: string
}

// Mesa
export interface Mesa {
  id: string
  restauranteId: string
  numero: number
  capacidad: number
  qrCode: string        // identificador interno, no URL
  activa: boolean
}

// Sesión
export type EstadoSesion = 'ABIERTA' | 'CERRADA' | 'PAGANDO'

export interface SesionMesa {
  id: string
  mesaId: string
  clienteId: string
  estado: EstadoSesion
  abiertaEn: string
  cerradaEn?: string
}

// Eventos Socket.io
export interface ServerToClientEvents {
  'order:updated': (pedido: Pedido) => void
  'order:new': (pedido: Pedido) => void
  'waiter:called': (sesionId: string) => void
  'session:closed': (sesionId: string) => void
}

export interface ClientToServerEvents {
  'order:create': (items: Omit<PedidoItem, 'id'>[]) => void
  'waiter:call': (sesionId: string) => void
}
```

---

## Discovery, logo, dirección y descuentos

Detalle, decisiones (D1 a D31) y checklists: `docs/plan-discovery-descuentos.md`. Mockups en `docs/mockups/`. Para probar en staging: `docs/checklist-qa-staging.md`.

**API** (prefijo `/api`):

| Ruta | Quién | Qué hace |
|---|---|---|
| `GET /discovery` | público | Hasta 50 restaurantes activos de marcas activas (por nombre; `logoUrl` = el del restaurante, si no el de su marca, si no `null`) y hasta 30 platos en oferta (por porcentaje de descuento mayor) |
| `GET /discovery/buscar?q=` | público | `q` de 2 a 60 caracteres. Ignora mayúsculas y acentos (extensión de PostgreSQL `unaccent`). Devuelve `{ ofertas, restaurantes, restaurantesConPlatos }` |
| `GET /discovery/restaurantes/:id` | público | Un restaurante y sus ofertas. 404 si no existe, no está activo o su marca no lo está |
| `GET /menu/:restauranteId` | público | Suma `restaurante.direccion`, `restaurante.logoUrl` (resuelto igual que en Discovery) y `descuentos[]`. 404 si el restaurante o su marca están dados de baja |
| `POST /sessions/open` | público | Con `tableCode` y `restauranteId` valida que la mesa sea de ese restaurante (409 si no); también acepta `restauranteId` + `pin`. 403 "Este restaurante no está disponible" si el restaurante o su marca están dados de baja y la mesa no tiene una sesión abierta (una sesión ya abierta se deja terminar) |
| `POST` y `DELETE /marcas/:id/logo` y `/restaurantes/:id/logo` | OWNER de la marca | Sube o quita el logo (PNG, JPEG o WebP de hasta 2 MB, en Supabase Storage) |
| `PATCH /restaurantes/:id` con `direccion` | OWNER de la marca | GERENTE y ROOT reciben 403 si envían `direccion` |
| `PUT` y `DELETE /items/:id/descuento` | OWNER o GERENTE asignado | `precioDescuento` (precio entero) o `porcentaje` (1 a 99), uno solo. ROOT recibe 403 |

Un descuento se guarda como `precio_descuento` (entero, con un CHECK en la base: mayor a 0 y menor que `precio_base`); el porcentaje no se guarda, se calcula. `precioVigente` es `precioDescuento` si hay, si no `precioBase`: con ese precio cobra el backend (los extras se suman a precio normal) y se reprecia el carrito de web-cliente.

**Rutas de web-cliente**:
- `/` es Discovery, el home público. `/ingresar-pin` redirige a `/`.
- `/restaurante/:id` es la pantalla del restaurante; `/restaurante/:id/mesa`, el ingreso a mesa (escáner de QR; el PIN queda detrás de un texto chico y `?pin` lo abre); `/restaurante/:id/carta`, la carta en modo vista (sin sesión y sin pedir).
- `/check-in?restaurantId=…&tableCode=…` es lo que codifica el QR impreso de cada mesa: abre la sesión y sigue al menú; si falla, ofrece el PIN.
- `/auth` acepta `?volver=` (solo rutas internas de la app).

**web-admin**: `/admin/marca` ("Marca y sucursales", solo OWNER) con el logo de la marca, el de cada sucursal y su dirección. El botón "Descuento" de la lista del menú lo ven OWNER y GERENTE. La consola de ROOT vive en `/root/*` (marcas, restaurantes con baja y reactivar, e historial; solo ROOT, con carga aparte vía `React.lazy`); lo que falta (dueños y cuentas ROOT) espera a `feat/auth`: ver `docs/plan-consola-root.md` y, para probarla en local, `docs/probar-consola-root.md`.

**Fuera de alcance:** combos, fidelización, vigencia o programación de descuentos.

---

## Comandos útiles

```bash
# Instalar todo desde la raíz
pnpm install

# Desarrollo (levanta todas las apps en paralelo)
pnpm dev

# Solo una app
pnpm --filter @menyu/api dev

# Build
pnpm build

# Prisma
pnpm --filter @menyu/api exec prisma migrate dev
pnpm --filter @menyu/api exec prisma studio

# Typecheck global
pnpm typecheck
```

---

## Reglas de desarrollo

- TypeScript estricto en todas las apps. Sin `any` salvo casos justificados.
- Los tipos van en `@menyu/types`, nunca duplicados en cada app.
- Los eventos de Socket.io **siempre** tipados vía `ServerToClientEvents` / `ClientToServerEvents`.
- Cada módulo de NestJS tiene su propio archivo `.module.ts`, `.controller.ts`, `.service.ts`.
- El patrón de pagos es `PaymentProvider` — nunca llamar Mercado Pago directamente desde el controller.
- El QR es un identificador interno de la app, **no** una URL directa a una ruta web.
- Cada feature nueva de frontend va en la app correspondiente a su rol: web-cliente, web-staff o web-admin.
- El login QR/PIN del comensal es independiente del login común — nunca mezclarlos ni importar packages/auth en web-cliente.
- Componentes compartidos entre apps van en packages/ui o packages/auth. Nunca duplicar lógica idéntica en cada app.
- Nunca agregar lógica de un rol en la app de otro rol. El comensal no debe tener acceso al código del admin ni siquiera en el bundle compilado.

---

## Scope v1.0 (MVP — semanas 1-7)

Incluye: auth, sesión de mesa vía QR interno, menú digital, pedidos con modificación de ingredientes, llamado al mozo, pago con Mercado Pago, panel de cocina en tiempo real, panel de admin (CRUD menú, mesas, mozos), logo y dirección de marcas y restaurantes, descuentos en ítems y Discovery (home público y anónimo con restaurantes y platos en oferta, búsqueda sin acentos, carta en solo lectura e ingreso a mesa desde la app; issues #350 a #354, #104 y #110).

**No incluye en v1.0:** pagos divididos, combos (tampoco como promos en Discovery), motor de recomendaciones, chatbot. Esas son v2.0.

---

## GitHub Projects

La gestión del proyecto se realiza íntegramente en GitHub. Jira es usado por la cátedra de forma independiente y no es la fuente de verdad del equipo.

- **Organización:** `MenYUorg`
- **Repositorio:** `MenYUorg/MenYU`
- **Handle del autor principal:** `lautiod`
- **Project ID (GraphQL):** `PVT_kwDOEHoLEs4BU0UP`
- **Project número:** `#1` bajo la organización `MenYUorg`

### Vistas del board
- **Kanban:** gestión día a día de tareas del equipo
- **Roadmap:** vista temporal con campos custom `Inicio` y `Fin` (tipo date)

### Notas técnicas para automatización con `gh` CLI
- Requiere scope `project`: `gh auth refresh -s project`
- Los sub-issues **no se agregan automáticamente** al Project — deben añadirse vía mutación GraphQL `addProjectV2ItemById` usando el `node_id` de cada issue
- Los campos custom de fecha usan inline fragments tipados: `... on ProjectV2Field` para campos estándar/date
- Entorno: Windows con Git Bash — sin `jq` ni `python3` disponibles por defecto; usar `gh api --jq` para parsear JSON inline
- Sub-issues se vinculan vía: `gh api --method POST "/repos/MenYUorg/MenYU/issues/PARENT_NUM/sub_issues" -f sub_issue_id="CHILD_NUM"`
