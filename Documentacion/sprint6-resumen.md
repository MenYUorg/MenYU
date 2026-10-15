# Sprint 6 — Pagos + Dashboard

**Sprint:** S6 · Issue épica #6  
**Equipo:** De Marcos (margarita0912) · Ojeda (lautiod) · Strumia Carrara (CotyStrumia)  
**Fecha:** 23 de mayo – 2 de junio de 2026  
**Estado:** In Progress (#68 y #248 pendientes)

---

## Índice

1. [Objetivo del sprint](#1-objetivo-del-sprint)
2. [Actividades y responsables](#2-actividades-y-responsables)
3. [#65 — Módulo Pagos con interfaz abstracta PaymentProvider](#3-65--módulo-pagos-con-interfaz-abstracta-paymentprovider)
4. [#66 — Implementar MercadoPagoProvider](#4-66--implementar-mercadopagoprovider)
5. [#67 — Webhook MP: recibir confirmación de pago y cerrar mesa](#5-67--webhook-mp-recibir-confirmación-de-pago-y-cerrar-mesa)
6. [#68 — Validación webhook en staging (en progreso)](#6-68--validación-webhook-en-staging-en-progreso)
7. [#71 — Bug fixing: pedido y Socket.io (deuda S5)](#7-71--bug-fixing-pedido-y-socketio-deuda-s5)
8. [#69 — Dashboard admin: mapa de mesas en tiempo real y resumen de ventas](#8-69--dashboard-admin-mapa-de-mesas-en-tiempo-real-y-resumen-de-ventas)
9. [#279 — Diseño e implementación frontend Mozo](#9-279--diseño-e-implementación-frontend-mozo)
10. [#248 — Integrar login vía Google Account (pendiente)](#10-248--integrar-login-vía-google-account-pendiente)
11. [Infraestructura — Ojeda (sin issue propio)](#11-infraestructura--ojeda-sin-issue-propio)
12. [Decisiones de diseño transversales](#12-decisiones-de-diseño-transversales)
13. [Problemas encontrados y resoluciones](#13-problemas-encontrados-y-resoluciones)

---

## 1. Objetivo del sprint

Implementar el módulo de pagos completo con Mercado Pago (backend + frontend en las tres apps), el dashboard del panel admin con KPIs y tiempo real, el frontend del mozo con pagos integrados, y la validación del flujo de cobro en el ambiente de staging.

---

## 2. Actividades y responsables

| # | Actividad | Responsable | Estado |
|---|---|---|---|
| #65 | Módulo Pagos con interfaz abstracta PaymentProvider | Strumia Carrara | Done |
| #66 | Implementar MercadoPagoProvider | Strumia Carrara | Done |
| #67 | Webhook MP: recibir confirmación de pago y cerrar mesa | Strumia Carrara | Done |
| #68 | Validación webhook en staging | Strumia Carrara + Ojeda | **In Progress** |
| #71 | Bug fixing: pedido y Socket.io (deuda S5) | De Marcos | Done |
| #69 | Dashboard admin: mapa de mesas en tiempo real y resumen de ventas | De Marcos | Done |
| #279 | Diseño e implementación frontend Mozo | De Marcos | Done |
| #248 | Integrar login vía Google Account | Ojeda | **Todo** |

---

## 3. #65 — Módulo Pagos con interfaz abstracta PaymentProvider

**Responsable:** Strumia Carrara  
**Commits:** `18b7559`, `d0711c9` — 25/05/2026  
**Documentación detallada:** `Documentacion/modulo-pagos.md`

### Qué se hizo

Se implementó el módulo `payments/` con el patrón **Provider** para desacoplar la lógica de negocio del proveedor concreto:

```
PaymentsController
      │
PaymentsService          ← lógica de negocio + Prisma
      │
PaymentProvider          ← interfaz abstracta
      │
MercadoPagoProvider      ← implementación concreta (token 'PAYMENT_PROVIDER')
```

**`payment-provider.interface.ts`** — contrato que cualquier proveedor debe cumplir:
```typescript
interface PaymentProvider {
  createPreference(data: CreatePaymentDto): Promise<PaymentPreference>
  processWebhook(payload: any): Promise<WebhookResult>
  getPaymentStatus(externalId: string): Promise<PaymentStatus>
}
```

**Endpoints implementados:**

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/payments/initiate` | JWT sesión (cliente) | Crea preferencia MP + registro `Pago` en DB |
| POST | `/api/payments/webhook` | Sin auth | Recibe notificación MP, cierra sesión si aprobado |
| GET | `/api/payments/status/:externalId` | Sin auth | Consulta estado de un pago externo |
| GET | `/api/payments/connect/:restauranteId` | JWT admin | URL de autorización OAuth MP |
| GET | `/api/payments/callback` | Sin auth | Callback OAuth: canjea code por tokens |
| GET | `/api/payments/sesiones` | JWT admin | Lista sesiones con estado de pago derivado |
| POST | `/api/payments/confirmar-efectivo` | JWT admin | Aprueba pago en efectivo y cierra sesión |
| POST | `/api/payments/solicitar-efectivo` | JWT sesión | Registra intención de pago en efectivo |

### Decisiones

**Interfaz `PaymentProvider`:** permite reemplazar Mercado Pago por otro proveedor en el futuro sin tocar el controller ni el service.

**Multi-tenant por token de restaurante:** `createPreference` crea un `MercadoPagoConfig` local con el token OAuth del restaurante en cada llamada, no un token global. Cada restaurante recibe los pagos directamente en su cuenta de MP.

**`externalReference` como join key:** `${sesionId}-${Date.now()}` como referencia externa. El webhook la usa para encontrar el `Pago` en la DB y de ahí la `SesionMesa` a cerrar.

**Efectivo sin transacción de DB compleja:** `solicitarEfectivo` crea un registro `Pago` con `metodo: 'efectivo'` y es idempotente (si ya existe, devuelve el existente).

---

## 4. #66 — Implementar MercadoPagoProvider

**Responsable:** Strumia Carrara  
**Documentación detallada:** `Documentacion/modulo-pagos.md` (sección MercadoPagoProvider)

### Qué se hizo

- **SDK:** `mercadopago@3.0.0` con imports nombrados (`MercadoPagoConfig`, `Preference`, `Payment`).
- **`createPreference`:** construye la preferencia con `back_urls` y `auto_return: 'approved'`. En local, `auto_return` se omite condicionalmente si `MP_SUCCESS_URL` apunta a localhost (MP rechaza URLs no públicas).
- **`processWebhook`:** ignora eventos que no sean `type: 'payment'`. Mapea status MP → `PaymentStatus`.
- **`getPaymentStatus`:** envuelto en try/catch → `NotFoundException`.

**Mapeo de estados:**

| Status MP | PaymentStatus |
|---|---|
| `'approved'` | `'APROBADO'` |
| `'rejected'` | `'RECHAZADO'` |
| `'in_process'` / `'pending'` | `'EN_PROCESO'` |
| cualquier otro | `'PENDIENTE'` |

---

## 5. #67 — Webhook MP: recibir confirmación de pago y cerrar mesa

**Responsable:** Strumia Carrara  
**Documentación detallada:** `Documentacion/modulo-pagos.md` + `modulo-pagos-sesion2.md`

### Qué se hizo

**Flujo `POST /payments/webhook`:**
1. Llama a `processWebhook()` — extrae `externalId` y `status`.
2. Si `status !== 'APROBADO'`: retorna sin tocar la DB.
3. Si `status === 'APROBADO'`: `prisma.$transaction` actualiza `pago.estado = 'aprobado'` y `sesionMesa.estado = 'cerrada'`, `cerradaEn = now()`.

**`PagoPage.tsx`** (web-cliente):
- Estados: `idle → loading → mp_redirect → efectivo_solicitado → error`.
- Botón "Pagar con Mercado Pago" redirige a `initPoint` de la preferencia.
- Botón "Pagar en efectivo" llama `POST /payments/solicitar-efectivo`.

**`PagoExitosoPage.tsx`** (web-cliente, ruta `/pago-exitoso`):
- Pantalla post-pago MP. Countdown de 30s + botón "Ir ahora".

**`PagosPage.tsx`** (web-admin) — pantalla de caja:

| Tab | Filtro |
|---|---|
| Activas | `estado === 'activa'` |
| Efectivo pendiente | `estado === 'efectivo_solicitado'` |
| MP pendiente | `estado === 'mp_pendiente'` |
| Cerradas hoy | `estado === 'cerrada'` + hoy |

- Polling automático cada 30s.
- Botón "Confirmar pago en efectivo" solo visible en tab Efectivo pendiente.

**`CarritoPage.tsx`** (web-cliente) — post-confirmación:
- Botón "Pedir la cuenta" → `/pago?pedidoId={id}&monto={total}`.
- Botón "Seguir pidiendo" → `/menu`.

**Schema Prisma — campos nuevos en `Restaurante`:**
```prisma
mpAccessToken  String?  @map("mp_access_token")
mpRefreshToken String?  @map("mp_refresh_token")
mpUserId       String?  @map("mp_user_id")
```

---

## 6. #68 — Validación webhook en staging (en progreso)

**Responsables:** Strumia Carrara + Ojeda  
**Estado:** In Progress  
**Commits:** `2ea8f23` (01/06/2026) · `ed58b0a` (02/06/2026)

### Estado de las migraciones

El schema fue actualizado pero la migración tenía drift por el historial acumulado de cambios directos en Supabase. Se resolvió aplicando SQL manualmente en el SQL Editor:

```sql
CREATE TYPE "rol_admin" AS ENUM ('ROOT', 'OWNER', 'GERENTE');
UPDATE "admin" SET "rol" = 'GERENTE' WHERE "rol" = 'ADMIN';
ALTER TABLE "admin" ALTER COLUMN "rol" TYPE "rol_admin" USING "rol"::text::"rol_admin";
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_access_token" TEXT;
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_refresh_token" TEXT;
ALTER TABLE "restaurante" ADD COLUMN IF NOT EXISTS "mp_user_id" TEXT;
```

### Encriptación de tokens OAuth de MP — Strumia Carrara

Los `mpAccessToken` y `mpRefreshToken` de cada restaurante se guardaban en texto plano en la DB. Se implementó encriptación AES-256:

**`crypto.service.ts`** (nuevo):
- `encrypt(text: string): string` — AES-256-CBC, IV aleatorio, resultado en base64.
- `decrypt(encrypted: string): string` — inversa.
- La clave de encriptación se lee de `ENCRYPTION_KEY` en el env.

**`payments.service.ts`** actualizado: cifra antes de guardar en DB, descifra antes de usar. El access token que llega de MP nunca queda en texto plano en la DB.

**Script de migración** `scripts/migrate-mp-tokens.ts`: para encriptar los tokens existentes en la DB sin truncar datos.

### Logs de Railway para asignación de MP — Ojeda

Se agregaron logs explícitos en `payments.service.ts` para trazar el flujo de asignación del token MP a un restaurante. Facilita el debugging en Railway cuando el OAuth callback llega pero no se guarda correctamente.

### Pendiente de validación

El webhook de MP requiere una URL pública para recibir las notificaciones. En staging, esto implica que la URL de Railway debe estar configurada en la app de MP como `Webhook URL`. La validación completa del flujo (pago aprobado → webhook → cierre de sesión) está pendiente de confirmar en el ambiente de staging con un pago de prueba real.

---

## 7. #71 — Bug fixing: pedido y Socket.io (deuda S5)

**Responsable:** De Marcos  
**Commits:** `00fdd24`, `de54559`, `6ee1fa9`, `00c4e42` — 25-26/05/2026

### Qué se hizo

**Correcciones en tests del backend:**
- `sessions.service.spec.ts`: mocks faltantes de `MenyuGateway` y métodos de Prisma que se usaban en el service pero no estaban en el mock — causaban que los tests fallaran en CI aunque el código fuera correcto.
- `mesas.service.spec.ts`: alineación con los nuevos métodos del service.

**Correcciones en web-admin:**
- `TablesPage.tsx`: warning `exhaustive-deps` en `useCallback` — dependencias faltantes.
- Eliminación de todos los `// eslint-disable` manuales reemplazados por correcciones reales.
- Ruta y nav item de Reportes agregados (`/admin/reportes`).

**Correcciones en web-cliente:**
- Lint errors en `ClienteMenuPage` e `ItemDetailPage`.

**Correcciones en web-staff:**
- Tipo de `onMozoCalled` expandido para incluir `llamadoId` y `motivo` (campos que el backend sí devuelve pero el tipo original no modelaba).

**Bug fixing menú, carrito y barras de búsqueda (`00c4e42`):**
- `AdminMenuPage.tsx`: refactor visual y corrección de lógica de ítems.
- `ItemFormModal.tsx`: correcciones de validación.
- `CarritoPage.tsx` (web-cliente): fix menor de comportamiento.
- `ClienteMenuPage.tsx` (web-cliente): mejoras visuales.
- `carritoStore.ts`: corrección del cálculo de precio.
- `ReportesPage.tsx`: corrección de queries.

---

## 8. #69 — Dashboard admin: mapa de mesas en tiempo real y resumen de ventas

**Responsable:** De Marcos  
**Commits:** `617f5fa`, `40c0a54`, `8ed5628` — 25/05/2026  
**Contexto:** SESIÓN 07 del resumen de De Marcos

### Backend — ReportesModule

**`feat(backend): add reportes module`** — nuevo módulo `reportes/` en NestJS:

| Endpoint | Descripción |
|---|---|
| `GET /reportes/ventas-hoy` | Total de ventas del día con conteo de pedidos |
| `GET /reportes/ventas-por-hora` | Array de 24 elementos con el total por hora del día |
| `GET /reportes/top-items` | Top 5 ítems más pedidos con cantidad y monto total |

Todos los endpoints filtran por `restauranteId` y requieren JWT de admin (OWNER/ROOT/GERENTE).

### Frontend — DashboardPage

**KPI cards:**
- Ventas del día (con Σ de pedidos pagados).
- Cantidad de pedidos activos.
- Mesas ocupadas vs. total.
- Ticket promedio del día.

**Mapa de mesas:**
- Grid de tiles con estado visual (verde = libre, rojo = ocupada).
- Polling cada 30s para actualizar el estado en tiempo real.
- Al hacer click en una mesa ocupada: detalles de la sesión (cliente, ítems, tiempo).

**Gráfico de ventas por hora:**
- Barras CSS (sin librería de gráficos externa) con las ventas de las últimas 24h.
- Formato visual tipo spark chart con el pico del día resaltado.

**Ranking top 5 ítems:**
- Lista con nombre del ítem, cantidad de veces pedido y monto acumulado.

**Fix de timezone:** función `toLocaleDateStr()` para convertir las fechas UTC del backend a UTC-3. Sin esta conversión, los reportes del día mostraban datos incorrectos en horarios cercanos a la medianoche.

---

## 9. #279 — Diseño e implementación frontend Mozo

**Responsable:** De Marcos  
**Commits:** `c671b45` · `87dd93f` · `a1dc431` · `d19e04a` · `7c32a54` · `c775e57` · `b2a6816` — 30/05 – 02/06/2026  
**Contexto:** SESIÓN 08 y 09 del resumen de De Marcos

### GerenceMesasPage (web-admin)

Pantalla completa del gerente para gestión de mesas:
- Tiles de mesas con estado, badge de llamados pendientes, tiempo de ocupación.
- WebSocket `waiter:called` para alertas en tiempo real.
- Detalle a pantalla completa al seleccionar una mesa: pedidos activos, historial de ítems, botones de acción.
- **Acciones disponibles:** ver pedidos, imprimir comanda, cobrar mesa (llama `PATCH /sessions/:id/cobro`), cerrar sesión forzada.
- **Modal QR/PIN:** permite ver o imprimir el QR de la mesa y regenerar el PIN.

### AuditoriaPage (web-admin — OWNER/ROOT)

Panel de auditoría de ediciones de pedidos:
- Consume `GET /pedidos/auditoria` con filtro de período.
- Muestra todas las ediciones: pedido original, cantidades cambiadas, justificación y timestamp.
- Accesible solo para OWNER/ROOT (no GERENTE).
- **KPI grid responsive:** las cards del dashboard se reorganizan según el viewport (1, 2 o 3 columnas).
- **Toggle de ingredientes:** en `ItemDetailPage` y `ItemFormModal`, los ingredientes se pueden mostrar/ocultar con un toggle para no saturar la UI.

### HistorialSesionesPage (web-admin y web-staff)

- Agrupación de pedidos por sesión de mesa.
- Modal con detalle de cada sesión: ítems pedidos, modificaciones, ediciones, total.
- Historial colapsable por sesión.

**Nuevo endpoint:** `GET /sessions/historial?restauranteId=X` — agrupa sesiones cerradas con todos sus pedidos, accesible para admin y mozo (implementado por De Marcos en `feat(sessions): endpoint GET /sessions/historial`).

### MozoPanel rediseñado (web-staff)

- Card primaria "Hacer pedido" en navy con ícono grande.
- Cuatro cards secundarias en grilla: Mesas, Pedidos, Historial, Pagos.
- Alertas en tiempo real (badge rojo) cuando hay llamados pendientes o pedidos listos.

### SelectorPage rediseñado (web-staff)

- Header navy con logo de MenYU.
- Cards por rol con barra lateral de color (naranja para mozo, teal para cocina, navy para admin).
- Avatar con iniciales del usuario logueado.
- Para ROOT sin restauranteId: input para ingresar el ID del restaurante manualmente.

### PagosMozo (web-staff — SESIÓN 09)

**Nueva pantalla `/mozo/pagos`:**
- Lista de mesas activas con tiempo de ocupación y total acumulado.
- Bell icon con badge cuando el cliente solicita pagar (`sesion:quierePagar` via WebSocket).
- Modal de cobro: seleccionar método (efectivo/MP), confirmar → `PATCH /sessions/:id/cobro`.
- Navegación directa a la mesa desde la notificación: query param `?mesaId=X` en `MesasPage`.

**PagosGerente (web-staff):**
- Mismo flujo que `PagosMozo` pero con select de mozo (para asignar quién cobró).
- Historial de sesiones cobradas con nombre del mozo, método y timestamp.

**PageHeader reutilizable (web-staff):**
- Componente `PageHeader.tsx` compartido por todas las pantallas: título, botón back, nombre y rol del usuario, botón logout.

### Modal de cierre de sesión en web-cliente

`SessionGuard` en `App.tsx` de web-cliente:
- Escucha `sesion:cerrada` o `sesion:cobrada` via WebSocket.
- Muestra modal "Gracias por su visita" que requiere acción del usuario para cerrarse.
- Limpia el store de sesión y carrito al confirmar.

---

## 10. #248 — Integrar login vía Google Account (pendiente)

**Responsable:** Ojeda  
**Estado:** Todo

Implementación de OAuth2 con Google para el login de administradores y staff como alternativa al email/contraseña. Pendiente de implementación.

---

## 11. Infraestructura — Ojeda (sin issue propio)

### CORS para Vercel Preview URLs

**Problema:** las Preview URLs de Vercel tienen el formato `https://{branch}-{hash}-{org}.vercel.app`, que cambia en cada deploy. El array fijo de `CORS_ORIGINS` en `main.ts` no podía incluir estos dominios dinámicos.

**Commit:** `3186243 feat(backend): support regex patterns in CORS via CORS_ORIGIN_PATTERNS`  
**Solución:** nueva variable de entorno `CORS_ORIGIN_PATTERNS` que acepta expresiones regulares. El handler de CORS evalúa el origin contra los patrones además del array estático:

```typescript
// CORS_ORIGIN_PATTERNS=^https://.*\.vercel\.app$
const patterns = process.env.CORS_ORIGIN_PATTERNS?.split(',').map(p => new RegExp(p)) ?? []
if (patterns.some(p => p.test(origin))) callback(null, true)
```

Esto permite que cualquier Preview URL de Vercel pueda hacer requests al backend sin hardcodear dominios.

### React 19 — upgrade de apps web

**Commit:** `24fc2fb chore: upgrade web apps and shared packages to React 19`  
Se actualizaron `web-admin`, `web-cliente` y `web-staff` a React 19. El upgrade fue necesario para compatibilidad con las últimas versiones de las dependencias de UI y para mantener el stack actualizado antes de la primera release.

---

## 12. Decisiones de diseño transversales

| Decisión | Contexto |
|---|---|
| Encriptación AES-256 para tokens MP en DB | Si la DB se filtra, los access tokens de MP de cada restaurante no quedan expuestos en texto plano |
| `auto_return` condicional según URL | MP rechaza `auto_return` con URLs de localhost — la condición evita errores en desarrollo sin cambiar el código |
| Reportes sin librería de gráficos | Las barras CSS son suficientes para el caso de uso académico. Evita agregar una dependencia pesada (Chart.js, Recharts) |
| Polling en dashboard (30s) en lugar de WebSocket | Los KPIs del dashboard no requieren reactividad inmediata. Un push de WebSocket en cada cambio sería costoso; el polling cada 30s es un buen balance |
| `GET /sessions/historial` accesible para mozo y admin | El mozo necesita ver el historial de mesas para referencia. En lugar de dos endpoints separados, un único endpoint filtra por rol internamente |
| CORS con regex patterns para previews | Las preview URLs de Vercel son dinámicas. El array estático no escala — los regex permiten patrones como `*.vercel.app` sin enumerar cada URL |

---

## 13. Problemas encontrados y resoluciones

### Drift en el historial de migraciones de Prisma

**Síntoma:** `prisma migrate dev` fallaba con error de drift porque algunos cambios se habían aplicado directamente en Supabase (SQL manual) sin pasar por el historial de migraciones.

**Causa:** a lo largo del proyecto se aplicaron columnas directamente en Supabase (para unbloquear trabajo mientras el historial tenía conflictos), creando divergencia entre el schema de Prisma y el estado real de la DB.

**Resolución:** se marcaron las migraciones como aplicadas con `prisma migrate resolve --applied` y se ejecutó SQL directo en el SQL Editor de Supabase para las columnas pendientes. El historial de migraciones quedó sincronizado.

### `auto_return: 'approved'` rechazado por MP en local

**Síntoma:** al iniciar un pago desde local, MP devolvía error de validación sobre `auto_return`.

**Causa:** `auto_return` requiere que `back_urls.success` sea una URL pública. `http://localhost:5176/...` es rechazada.

**Resolución:** condición en `MercadoPagoProvider`: el campo `auto_return` y `back_urls` solo se incluyen si `MP_SUCCESS_URL` existe y no contiene `localhost`.

### Tests fallando en CI por mocks incompletos

**Síntoma:** CI rechazaba PRs porque las suites de tests del backend fallaban con `TypeError: Cannot read properties of undefined`.

**Causa:** al agregar nuevas dependencias a los services (como `MenyuGateway` en `SessionsService`), los mocks en los archivos spec no se actualizaban. El servicio real los usaba pero el mock de Jest no los proveía.

**Resolución:** De Marcos actualizó sistemáticamente todos los archivos spec afectados para agregar los mocks faltantes. Se estableció la práctica de actualizar los mocks cuando se modifica un service.

---

*MenYU · De Marcos · Ojeda · Strumia Carrara · 2026*
