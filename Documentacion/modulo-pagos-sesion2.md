# Módulo Pagos — Sesión 2: Caja Admin + Fixes

**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Fecha:** 26 de mayo de 2026

---

## Índice

1. [Qué se hizo](#1-qué-se-hizo)
2. [Pantalla de Caja en web-admin](#2-pantalla-de-caja-en-web-admin)
3. [Endpoint solicitarEfectivo](#3-endpoint-solicitarefectivo)
4. [Countdown post-pago](#4-countdown-post-pago)
5. [Fixes de infraestructura](#5-fixes-de-infraestructura)
6. [Estado actualizado del módulo](#6-estado-actualizado-del-módulo)

---

## 1. Qué se hizo

### Backend (`apps/backend/src/payments/`)

| Archivo | Cambio |
|---|---|
| `payments.service.ts` | Nuevo método `solicitarEfectivo`, exportado `SesionResumen`, reemplazado `.at()` por `[0]` |
| `payments.controller.ts` | Nuevos endpoints: `GET /sesiones`, `POST /confirmar-efectivo`, `POST /solicitar-efectivo` |
| `providers/mercadopago.provider.ts` | `auto_return` condicional — se omite si `MP_SUCCESS_URL` apunta a localhost |
| `prisma/schema.prisma` | Agregado `@@map("rol_admin")` al enum `RolAdmin` |

### Frontend web-admin (`apps/web-admin/src/`)

| Archivo | Cambio |
|---|---|
| `services/api.ts` | Nueva interface `SesionResumen` + namespace `pagos` |
| `pages/admin/AdminLayout.tsx` | Nav link "Caja" → `/admin/pagos` |
| `App.tsx` | Ruta `/admin/pagos` → `<PagosPage />` |
| `pages/admin/pagos/PagosPage.tsx` | Nuevo — pantalla de caja con 4 tabs y polling |

### Frontend web-cliente (`apps/web-cliente/src/`)

| Archivo | Cambio |
|---|---|
| `store/pagoStore.ts` | `solicitarEfectivo` ahora llama al backend + firma actualizada |
| `pages/pago/PagoPage.tsx` | Reset en mount + `CountdownRedirect` para efectivo |
| `pages/pago/PagoExitosoPage.tsx` | Nuevo — pantalla post-pago MP con countdown |
| `App.tsx` | Ruta `/pago-exitoso` → `<PagoExitosoPage />` |

---

## 2. Pantalla de Caja en web-admin

### Nuevos endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/payments/sesiones?restauranteId=xxx` | Lista sesiones con estado de pago derivado |
| `POST` | `/api/payments/confirmar-efectivo` | Aprueba pago en efectivo y cierra sesión |
| `POST` | `/api/payments/solicitar-efectivo` | Registra intención de pago en efectivo (llamado desde el cliente) |

### `SesionResumen` (exportada desde `payments.service.ts`)

```typescript
export interface SesionResumen {
  sesionId: string
  mesaNumero: string
  estado: 'activa' | 'efectivo_solicitado' | 'mp_pendiente' | 'cerrada'
  total: number
  pedidos: { id: string; total: number; estado: string }[]
  pago?: { id: string; metodo: string; estado: string }
  cerradaEn?: string
}
```

La lógica de derivación del `estado`:
- `cerrada`: `sesionMesa.estado === 'cerrada'`
- `mp_pendiente`: hay pago con `metodo='mercadopago'` y `estado='pendiente'`
- `efectivo_solicitado`: hay pago con `metodo='efectivo'`
- `activa`: ninguno de los anteriores

### `PagosPage.tsx`

4 tabs con conteo en cada uno:

| Tab | Filtro |
|---|---|
| Activas | `estado === 'activa'` |
| Efectivo pendiente | `estado === 'efectivo_solicitado'` |
| MP pendiente | `estado === 'mp_pendiente'` |
| Cerradas hoy | `estado === 'cerrada'` + `cerradaEn` es hoy |

- Polling automático cada 30s con `setInterval` + cleanup en `useEffect`
- Cada sesión muestra: mesa, badge de estado, lista de pedidos con totales parciales, total general
- Botón "Confirmar pago en efectivo" visible solo en tab Efectivo pendiente → llama `POST /confirmar-efectivo` y recarga

### `api.ts` — namespace `pagos`

```typescript
pagos: {
  listSesiones: (restauranteId: string) =>
    req<SesionResumen[]>('GET', `/payments/sesiones?restauranteId=...`),
  confirmarEfectivo: (sesionId: string) =>
    req<{ sesionId: string; estado: string }>('POST', '/payments/confirmar-efectivo', { sesionId }),
}
```

---

## 3. Endpoint solicitarEfectivo

### Por qué se agregó

En la sesión anterior `solicitarEfectivo` en el pagoStore solo cambiaba estado local — nunca creaba un registro `Pago` en la DB. Esto causaba que:
1. El gerente no veía la sesión como "efectivo_solicitado" en PagosPage
2. El tipo de pago no quedaba guardado

### Implementación en service

```typescript
async solicitarEfectivo(sesionId: string, pedidoId: string, monto: number) {
  // Idempotente: si ya existe un pago en efectivo, devuelve el existente
  const existing = await this.prisma.pago.findFirst({
    where: { pedidoId, metodo: 'efectivo' },
  })
  if (existing) return { pagoId: existing.id, sesionId, estado: 'efectivo_solicitado' }

  const pago = await this.prisma.pago.create({
    data: { pedidoId, monto, metodo: 'efectivo', estado: 'pendiente' },
  })
  return { pagoId: pago.id, sesionId, estado: 'efectivo_solicitado' }
}
```

### Actualización de pagoStore

`solicitarEfectivo` pasó de ser síncrona a async, con llamada a `POST /payments/solicitar-efectivo`. Si el backend falla, el store queda en estado `error`.

Firma actualizada:
```typescript
solicitarEfectivo: (jwt: string, sesionId: string, pedidoId: string, monto: number) => Promise<void>
```

### Reset en mount de PagoPage

Se agregó `useEffect(() => { reset() }, [])` para que al navegar de vuelta a `/pago` no quede el estado de la sesión anterior.

---

## 4. Countdown post-pago

### Componente `CountdownRedirect` (interno de PagoPage)

Cuenta regresiva de 30s con botón "Ir ahora" para saltear la espera. Al llegar a 0 navega a `/menu` con `useNavigate`.

Se usa en el estado `efectivo_solicitado` de PagoPage.

### `PagoExitosoPage` (`/pago-exitoso`)

Pantalla para cuando Mercado Pago redirige de vuelta al finalizar el pago. Mismo comportamiento de 30s + botón de navegación inmediata.

La URL de redirección está configurada en `apps/backend/.env`:
```env
MP_SUCCESS_URL=http://localhost:5173/pago-exitoso
```

En producción cambiar a:
```env
MP_SUCCESS_URL=https://menu.menyu.com/pago-exitoso
```

---

## 5. Fixes de infraestructura

### `@@map("rol_admin")` en schema Prisma

**Problema:** La migración `20260519000000_add_rol_admin_enum_and_admin_restaurante` creó el enum en PostgreSQL como `rol_admin` (snake_case). El schema de Prisma lo definía como `RolAdmin` sin `@@map`, por lo que el cliente generado intentaba insertar valores de tipo `"RolAdmin"` — tipo inexistente en la DB.

**Fix:** Agregar `@@map("rol_admin")` al enum en `schema.prisma` + `prisma generate`.

```prisma
enum RolAdmin {
  ROOT
  OWNER
  GERENTE

  @@map("rol_admin")
}
```

### `auto_return` condicional en MercadoPagoProvider

**Problema:** `auto_return: 'approved'` requiere que `back_urls.success` sea una URL pública válida. En local, `MP_SUCCESS_URL=http://localhost:5173/...` es rechazada por MP con error `auto_return invalid`.

**Fix:** La condición para incluir `back_urls` + `auto_return` también verifica que la URL no sea localhost:

```typescript
...(process.env.MP_SUCCESS_URL && !process.env.MP_SUCCESS_URL.includes('localhost') && {
  back_urls: { ... },
  auto_return: 'approved' as const,
}),
```

### `.at(0)` → `[0]` en payments.service.ts

El método `.at()` de arrays requiere `lib: es2022` o posterior. El proyecto no lo tiene configurado. Se reemplazaron ambas ocurrencias por acceso por índice `[0]`.

### SQL aplicado en Supabase

Se ejecutó el siguiente bloque en el SQL Editor para resolver el drift acumulado:

```sql
CREATE TYPE "rol_admin" AS ENUM ('ROOT', 'OWNER', 'GERENTE');
UPDATE "admin" SET "rol" = 'GERENTE' WHERE "rol" = 'ADMIN';
ALTER TABLE "admin" ALTER COLUMN "rol" TYPE "rol_admin" USING "rol"::text::"rol_admin";

CREATE TABLE IF NOT EXISTS "admin_restaurante" ( ... );

ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_access_token" TEXT;
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_refresh_token" TEXT;
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_user_id" TEXT;
```

---

## 6. Estado actualizado del módulo

### Qué funciona

| Feature | Estado |
|---|---|
| Crear preferencia MP y redirigir al checkout | ✅ |
| Webhook MP → cerrar sesión automáticamente | ✅ |
| Solicitar pago en efectivo (cliente → DB) | ✅ |
| Confirmar efectivo desde PagosPage (gerente) | ✅ |
| PagosPage con 4 tabs y polling 30s | ✅ |
| Countdown 30s post-pago (efectivo y MP) | ✅ |
| OAuth MP por restaurante (connect + callback) | ✅ |
| Reset de estado al volver a /pago | ✅ |

### Pendiente

| Item | Prioridad |
|---|---|
| Validar firma del webhook MP (`MP_WEBHOOK_SECRET`) | Alta — seguridad |
| `MP_SUCCESS_URL` con URL de producción (Vercel) | Alta — para que `auto_return` funcione en prod |
| Refresh del `mpAccessToken` cuando expira | Baja |
| Página "Conectar Mercado Pago" en web-admin | Baja — OAuth backend listo, falta UI |
| Resolver drift del historial de migraciones Prisma | Media |
