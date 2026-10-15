# Módulo Pagos — MenYU

**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Fecha:** 25 de mayo de 2026

---

## Índice

1. [Qué se construyó](#1-qué-se-construyó)
2. [Arquitectura del módulo](#2-arquitectura-del-módulo)
3. [Backend — PaymentsModule](#3-backend--paymentsmodule)
4. [Backend — OAuth de Mercado Pago](#4-backend--oauth-de-mercado-pago)
5. [Schema Prisma](#5-schema-prisma)
6. [Frontend — web-cliente](#6-frontend--web-cliente)
7. [Decisiones de diseño](#7-decisiones-de-diseño)
8. [Variables de entorno requeridas](#8-variables-de-entorno-requeridas)
9. [Estado de la migración](#9-estado-de-la-migración)
10. [Qué falta](#10-qué-falta)

---

## 1. Qué se construyó

### Backend (`apps/backend/src/payments/`)

| Archivo | Descripción |
|---|---|
| `providers/payment-provider.interface.ts` | Interfaz abstracta `PaymentProvider` + tipos locales |
| `providers/mercadopago.provider.ts` | Implementación real con SDK `mercadopago@3.0.0` |
| `dto/initiate-payment.dto.ts` | DTO HTTP para `POST /payments/initiate` |
| `payments.service.ts` | Lógica de negocio completa |
| `payments.controller.ts` | 5 endpoints REST |
| `payments.module.ts` | Módulo NestJS registrado en `AppModule` |

### Frontend (`apps/web-cliente/src/`)

| Archivo | Descripción |
|---|---|
| `store/pagoStore.ts` | Zustand store para el flujo de pago del comensal |
| `pages/pago/PagoPage.tsx` | Pantalla de selección de método de pago |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `apps/backend/prisma/schema.prisma` | 3 campos nuevos en modelo `Restaurante` |
| `apps/backend/src/app.module.ts` | Registro de `PaymentsModule` |
| `apps/backend/.env` | `DIRECT_URL` apuntando al pooler (workaround Supabase pausado) |
| `.env.example` (raíz) | Variables MP documentadas |
| `apps/web-cliente/src/App.tsx` | Ruta `/pago` agregada |
| `apps/web-cliente/src/services/api.ts` | `orders.create` tipado con `{ id: string }` |
| `apps/web-cliente/src/pages/carrito/CarritoPage.tsx` | Botón "Pedir la cuenta" post-confirmación |
| `.vscode/settings.json` | `typescript.tsdk` apuntando al workspace TS |

---

## 2. Arquitectura del módulo

El módulo sigue el patrón **Provider** para desacoplar la lógica de negocio del proveedor concreto de pagos:

```
PaymentsController
      │
PaymentsService          ← lógica de negocio + Prisma
      │
PaymentProvider          ← interfaz abstracta
      │
MercadoPagoProvider      ← implementación concreta (inyectada con token 'PAYMENT_PROVIDER')
```

La interfaz `PaymentProvider` permite reemplazar Mercado Pago por otro proveedor sin tocar el controller ni el service.

---

## 3. Backend — PaymentsModule

### Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/payments/initiate` | JWT de sesión (cliente) | Crea preferencia MP + registro `Pago` en DB |
| `POST` | `/api/payments/webhook` | Sin auth | Recibe notificación MP, cierra sesión si aprobado |
| `GET` | `/api/payments/status/:externalId` | Sin auth | Consulta estado de un pago externo |
| `GET` | `/api/payments/connect/:restauranteId` | JWT de admin | Devuelve URL de autorización OAuth MP |
| `GET` | `/api/payments/callback` | Sin auth | Callback OAuth: canjea code por tokens y los guarda |

### Tipos en `payment-provider.interface.ts`

```typescript
export type PaymentStatus = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'EN_PROCESO'

export interface CreatePaymentDto {
  sesionId: string
  monto: number
  descripcion: string
  externalReference: string
  accessToken: string        // token OAuth del restaurante
}

export interface PaymentPreference {
  id: string
  initPoint: string
  externalReference: string
}

export interface WebhookResult {
  externalId: string
  status: PaymentStatus
  externalReference: string
}
```

### Flujo `POST /payments/initiate`

1. Valida JWT de sesión (tipo `cliente`)
2. Busca `restaurante.mpAccessToken` — lanza `400` si no está configurado
3. Genera `externalReference = ${sesionId}-${Date.now()}`
4. Llama a `MercadoPagoProvider.createPreference()` con el token del restaurante
5. Crea registro `Pago` en DB (`estado: 'pendiente'`)
6. Retorna `{ id, initPoint, externalReference, pagoId }`

### Flujo `POST /payments/webhook`

1. Llama a `processWebhook()` — extrae `externalId` y `status` del payload MP
2. Si `status !== 'APROBADO'`: retorna sin tocar la DB
3. Si `status === 'APROBADO'`:
   - Busca `Pago` por `referenciaExterna`
   - Busca `Pedido` para obtener `sesionId`
   - Ejecuta `prisma.$transaction([...])`:
     - `pago.estado = 'aprobado'`
     - `sesionMesa.estado = 'cerrada'`, `cerradaEn = now()`
   - Retorna `{ sesionId, estado: 'cerrada' }`

### MercadoPagoProvider

- SDK: `mercadopago@3.0.0` (imports nombrados: `MercadoPagoConfig`, `Preference`, `Payment`)
- `createPreference`: usa un `MercadoPagoConfig` **local** creado con `data.accessToken` (token del restaurante), no el token global. Esto soporta multi-tenant.
- `processWebhook`: ignora eventos que no sean `type: 'payment'`; mapea status MP → `PaymentStatus`
- `getPaymentStatus`: envuelto en try/catch → `NotFoundException`
- Mapeo de estados:
  - `'approved'` → `'APROBADO'`
  - `'rejected'` → `'RECHAZADO'`
  - `'in_process'` | `'pending'` → `'EN_PROCESO'`
  - cualquier otro → `'PENDIENTE'`

### DTO `initiate-payment.dto.ts`

```typescript
class InitiatePaymentDto {
  pedidoId: string
  restauranteId: string
  sesionId: string
  monto: number          // @Min(0)
  descripcion: string
}
```

---

## 4. Backend — OAuth de Mercado Pago

Permite que cada restaurante conecte su propia cuenta de MP. Los tokens se guardan en la tabla `restaurante`.

### Flujo completo

```
Admin abre /admin/pagos
  → GET /api/payments/connect/:restauranteId
  ← { url: "https://auth.mercadopago.com/authorization?..." }
  → redirige al admin a MP
  ← MP redirige a GET /api/payments/callback?code=xxx&state=restauranteId
  → service canjea code por tokens (POST a MP OAuth)
  → guarda mpAccessToken + mpRefreshToken + mpUserId en restaurante
  ← { restauranteId, mpUserId, conectado: true }
```

### `getMpAuthUrl`

Construye la URL con `URLSearchParams`: `client_id`, `response_type: 'code'`, `platform_id: 'mp'`, `redirect_uri`, `state: restauranteId`.

### `handleMpCallback`

- `fetch` a `https://api.mercadopago.com/oauth/token` con body `application/x-www-form-urlencoded`
- Respuesta tipada con interface local `MpTokenResponse { access_token, refresh_token, user_id }`
- Si no es `ok` → `InternalServerErrorException('MP OAuth falló')`

---

## 5. Schema Prisma

### Campos agregados al modelo `Restaurante`

```prisma
mpAccessToken  String?  @map("mp_access_token")
mpRefreshToken String?  @map("mp_refresh_token")
mpUserId       String?  @map("mp_user_id")
```

Los tres campos son opcionales — un restaurante puede existir sin tener MP conectado. `initiatePayment` lanza `400` si `mpAccessToken` es null.

### Estado de la migración

Ver sección 9.

---

## 6. Frontend — web-cliente

### `pagoStore.ts`

```typescript
type Estado = 'idle' | 'loading' | 'mp_redirect' | 'efectivo_solicitado' | 'error'
```

- `initiarPagoMP`: llama `POST /payments/initiate` con fetch directo (mismo patrón que `api.ts`). Si ok → `window.location.href = initPoint`.
- `solicitarEfectivo`: solo cambia estado local, sin llamada al backend. El mozo ve la mesa en su panel.
- `reset`: vuelve a `idle`.

### `PagoPage.tsx`

Accesible en `/pago?pedidoId=xxx&monto=xxx`. Lee `sesionId`, `jwt`, `restauranteId` del `sessionStore`.

| Estado | Render |
|---|---|
| `idle` | Dos botones: "Pagar con Mercado Pago" (azul MP `#009EE3`) y "Pagar en efectivo" (gris) |
| `loading` / `mp_redirect` | Spinner naranja + "Conectando con Mercado Pago..." |
| `efectivo_solicitado` | ✅ + mensaje al mozo. Sin botón de volver — la sesión sigue abierta |
| `error` | ❌ + mensaje + botón "Reintentar" |

### Cambios en `CarritoPage.tsx`

- `api.orders.create()` ahora retorna `{ id: string }` → se guarda como `pedidoId`
- Se captura `total()` en `totalFinal` antes de llamar a `vaciar()`
- Pantalla de éxito reemplaza el auto-redirect por dos botones explícitos:
  - **"Pedir la cuenta"** → `/pago?pedidoId={pedidoId}&monto={totalFinal}`
  - **"Seguir pidiendo"** → `/menu`

---

## 7. Decisiones de diseño

**Multi-tenant por token de restaurante:** `createPreference` crea un `MercadoPagoConfig` local con el token del restaurante en cada llamada, en vez de usar un token global. Esto permite que cada restaurante reciba sus propios pagos en su cuenta de MP.

**`externalReference` como join key:** Se usa `${sesionId}-${Date.now()}` como referencia externa. El webhook la usa para encontrar el `Pago` en la DB y de ahí el `Pedido` y la `SesionMesa` a cerrar.

**Webhook sin transacción de Supabase:** La transacción de Prisma (`$transaction`) es a nivel de aplicación, no de base de datos — suficiente para el caso de uso ya que los dos updates son simples y no tienen dependencias cruzadas con otras operaciones concurrentes.

**Efectivo sin backend:** `solicitarEfectivo` solo cambia el estado local del store. En v1.0 el cierre en efectivo lo confirma el mozo desde su panel. No se crea ningún registro de pago en DB.

**`.vscode/settings.json`:** Creado para que VS Code use el TypeScript del workspace (5.9.3) en lugar del bundled (6.x), evitando falsas advertencias de deprecación sobre `moduleResolution: node` y `baseUrl`.

---

## 8. Variables de entorno requeridas

Agregar a `apps/backend/.env`:

```env
# Mercado Pago — aplicación
MP_ACCESS_TOKEN=          # token global de la app MP (para webhooks/consultas)
MP_WEBHOOK_SECRET=        # secret para validar firma de webhooks (pendiente implementar)
MP_WEBHOOK_URL=           # URL pública donde MP notifica (ej: https://api.menyu.com/payments/webhook)
MP_SUCCESS_URL=           # redirect tras pago exitoso
MP_FAILURE_URL=           # redirect tras pago fallido
MP_PENDING_URL=           # redirect tras pago pendiente
MP_CLIENT_ID=             # ID de la aplicación MP (para OAuth)
MP_CLIENT_SECRET=         # secret de la aplicación MP (para OAuth)
MP_REDIRECT_URI=          # callback URI registrada en MP (ej: https://api.menyu.com/payments/callback)
```

---

## 9. Estado de la migración

El schema fue actualizado pero **la migración no pudo aplicarse** por el siguiente motivo:

- El proyecto Supabase estaba pausado (free tier). DNS del host directo (`db.*.supabase.co`) no resuelve cuando está pausado.
- `prisma migrate dev` requiere conexión directa. Se intentó con `DIRECT_URL` apuntando al pooler, pero el historial de migraciones tiene drift preexistente que bloquea el comando.
- `prisma db push` también fue bloqueado por drift en la columna `admin.rol`.

**Acción pendiente:** Ejecutar el siguiente SQL directamente en el **SQL Editor de Supabase** (Dashboard → SQL Editor):

```sql
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_access_token" TEXT;
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_refresh_token" TEXT;
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_user_id" TEXT;
```

El cliente Prisma ya fue regenerado con `prisma generate` y reconoce los campos. El typecheck pasa.

El drift del historial de migraciones (columna `admin.rol` y `item_menu.restaurante_id`) es un problema separado a resolver en otra sesión.

---

## 10. Qué falta

| Item | Prioridad |
|---|---|
| Ejecutar el SQL de migración en Supabase | Alta — bloquea el flujo de pagos en producción |
| Validar firma del webhook MP (`MP_WEBHOOK_SECRET`) | Alta — seguridad |
| Pantalla de confirmación post-pago MP (cuando MP redirige de vuelta) | Media |
| Cierre de sesión desde el panel del mozo al cobrar en efectivo | Media |
| Refresh del `mpAccessToken` cuando expira (usar `mpRefreshToken`) | Baja |
| Página de configuración MP en `web-admin` (botón "Conectar Mercado Pago") | Baja — OAuth ya implementado en backend, falta la UI |
| Resolver el drift del historial de migraciones Prisma | Media |
