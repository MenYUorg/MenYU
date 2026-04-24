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
| App cliente | Expo (React Native + Expo Web) |
| App mozo | Expo (React Native) · push notifications |
| Panel cocina | React + Vite + TailwindCSS · integración impresoras físicas |
| Panel admin | React + Vite + TailwindCSS |
| Estado global | Zustand |
| Monorepo | Turborepo + pnpm workspaces |
| Tipos compartidos | `@menyu/types` |
| Pagos | Mercado Pago (detrás de interfaz `PaymentProvider`) |
| Infra | Railway + Supabase + Cloudflare |
| Recomendaciones (v2.0) | Python + FastAPI + pandas/numpy + OpenAI API |

---

## Estructura de carpetas

```
MenYu/
├── apps/
│   ├── backend/          → @menyu/api      (NestJS + Prisma)
│   ├── cliente/          → @menyu/cliente  (Expo React Native + Expo Web)
│   ├── mozo/             → @menyu/mozo     (Expo React Native · push notifications · panel completo)
│   ├── cocina/           → @menyu/cocina   (React + Vite · web app lectura de comandas + integración impresoras físicas)
│   └── admin/            → @menyu/admin    (React + Vite, desktop)
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

### Interior de `apps/cliente/`

```
apps/cliente/src/
├── app/                  (Expo Router file-based: _layout.tsx, (auth)/, (session)/)
├── features/             (auth/, qr-scanner/, menu/, cart/, payment/, waiter-call/, session/)
├── components/           (ui/, layout/, menu/, order/)
├── store/                (sessionStore.ts, cartStore.ts, userStore.ts — Zustand)
└── services/             (api.ts, socket.ts)
```

### Interior de `apps/cocina/`

Web app React + Vite de solo lectura de comandas, más integración con impresoras físicas (comanderas). No requiere login complejo — la tablet/PC de cocina siempre está logueada. Sin interacción compleja: cocina solo visualiza pedidos entrantes y dispara la impresión.

```
apps/cocina/src/
├── pages/                (KitchenBoard.tsx)
├── components/           (OrderCard.tsx, OrderList.tsx, StatusBadge.tsx)
├── store/                (ordersStore.ts — Zustand)
├── services/
│   ├── api.ts
│   ├── socket.ts
│   └── printer.ts        (integración impresoras físicas — ESC/POS o similar)
└── config/               (printerConfig.ts — IP/puerto de la impresora)
```

**Notas de impresoras:** la integración es con impresoras de red (ESC/POS sobre TCP/IP). A definir en el sprint correspondiente si la lógica de impresión vive en el frontend de cocina o en el backend.

### Interior de `apps/mozo/`

App Expo React Native. El mozo se mueve por el salón — necesita push notifications nativas que lleguen con la pantalla bloqueada. Panel completo: estado de platos, llamados de mesa, pedidos listos para despacho.

```
apps/mozo/src/
├── app/                  (Expo Router: _layout.tsx, (auth)/, (panel)/)
├── features/             (notifications/, orders/, tables/, waiter-calls/)
├── components/           (ui/, layout/, order/)
├── store/                (mozoStore.ts, ordersStore.ts — Zustand)
└── services/             (api.ts, socket.ts, notifications.ts)
```

### Interior de `apps/admin/`

```
apps/admin/src/
├── pages/                (dashboard/, menu/, tables/, staff/, payments/)
├── components/           (ui/, forms/, tables/, charts/)
├── store/                (menuStore.ts, tablesStore.ts — Zustand)
└── services/             (api.ts)
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
pnpm --filter @menyu/cliente dev

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
