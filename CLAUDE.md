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
| Infra frontend | Vercel (3 proyectos separados) |
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
│   └── web-admin/        → @menyu/web-admin    (React + Vite · panel administrador)
├── packages/
│   ├── types/            → @menyu/types    (tipos TS compartidos)
│   ├── ui/               → @menyu/ui       (componentes React compartidos)
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
| `ROOT` | Dueños del sistema MenYu — bypass total, acceso a todo |
| `OWNER` | Dueño de una marca — acceso a toda su marca y sus restaurantes |
| `GERENTE` | Gerente de restaurantes específicos, asignados via tabla `AdminRestaurante` |

### Tipos de usuario adicionales (tablas separadas, NO son RolAdmin)
| Tipo | Tabla | App |
|---|---|---|
| Mozo | `mozo` | apps/web-staff |
| Cocina | `cocina` | apps/web-staff |
| Cliente/Comensal | `cliente` | apps/web-cliente |

### Guards NestJS
- `@Roles(RolAdmin.ROOT)` — solo ROOT
- `@Roles(RolAdmin.OWNER, RolAdmin.GERENTE)` — panel admin
- Mozos y cocina usan sus propios guards separados del enum RolAdmin
- El comensal no usa guards de admin — se autentica por sesión de mesa

---

## Arquitectura de frontends web

### Tres apps web independientes (Vercel)
```
apps/web-cliente/   → menu.menyu.com     (comensal)
apps/web-staff/     → staff.menyu.com    (cocina + mozo web)
apps/web-admin/     → admin.menyu.com    (dueño/administrador)
```

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

Incluye: auth, sesión de mesa vía QR interno, menú digital, pedidos con modificación de ingredientes, llamado al mozo, pago con Mercado Pago, panel de cocina en tiempo real, panel de admin (CRUD menú, mesas, mozos).

**No incluye en v1.0:** pagos divididos, programa de fidelización, motor de recomendaciones, chatbot. Esas son v2.0.

---

## GitHub Projects

La gestión del proyecto se realiza íntegramente en GitHub. Jira es usado por la cátedra de forma independiente y no es la fuente de verdad del equipo.

- **Organización:** `MenYUorg`
- **Repositorio:** `MenYUorg/MenYU`
- **Handle del autor principal:** `lautiod`
- **Project ID (GraphQL):** `PVT_kwHOB57las4BUwQe`
- **Project número:** `#1` bajo el usuario `lautiod`

### Vistas del board
- **Kanban:** gestión día a día de tareas del equipo
- **Roadmap:** vista temporal con campos custom `Inicio` y `Fin` (tipo date)

### Notas técnicas para automatización con `gh` CLI
- Requiere scope `project`: `gh auth refresh -s project`
- Los sub-issues **no se agregan automáticamente** al Project — deben añadirse vía mutación GraphQL `addProjectV2ItemById` usando el `node_id` de cada issue
- Los campos custom de fecha usan inline fragments tipados: `... on ProjectV2Field` para campos estándar/date
- Entorno: Windows con Git Bash — sin `jq` ni `python3` disponibles por defecto; usar `gh api --jq` para parsear JSON inline
- Sub-issues se vinculan vía: `gh api --method POST "/repos/MenYUorg/MenYU/issues/PARENT_NUM/sub_issues" -f sub_issue_id="CHILD_NUM"`
