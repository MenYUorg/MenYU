# Módulo Pagos — Sesión 3: Reimplementación de Mercado Pago desde cero (rama `fix/mp`)

**Equipo:** De Marcos · Ojeda · Strumia Carrara
**Fecha:** 12 de julio de 2026
**Rama:** `fix/mp`
**Contexto:** la implementación vieja de Mercado Pago (documentada en `modulo-pagos.md` y `modulo-pagos-sesion2.md`) fue eliminada por completo en un commit anterior (`e0cd9b1 fix(payments): eliminar implementacion de MercadoPago para reimplementar desde cero`). Esta sesión reconstruye la integración desde cero, preservando el módulo de efectivo intacto.

---

## Índice

1. [Estado al empezar la sesión](#1-estado-al-empezar-la-sesión)
2. [Qué se construyó — backend](#2-qué-se-construyó--backend)
3. [Migración de base de datos](#3-migración-de-base-de-datos)
4. [Variables de entorno nuevas/corregidas](#4-variables-de-entorno-nuevascorregidas)
5. [Bug real de Mercado Pago encontrado y resuelto](#5-bug-real-de-mercado-pago-encontrado-y-resuelto)
6. [Testing end-to-end realizado](#6-testing-end-to-end-realizado)
7. [Hallazgo: frontend web-cliente sin botón de MP funcional](#7-hallazgo-frontend-web-cliente-sin-botón-de-mp-funcional)
8. [Bloqueo actual — test users de Mercado Pago](#8-bloqueo-actual--test-users-de-mercado-pago)
9. [Datos de prueba que quedaron en la DB](#9-datos-de-prueba-que-quedaron-en-la-db)
10. [Qué falta para la próxima sesión](#10-qué-falta-para-la-próxima-sesión)

---

## 1. Estado al empezar la sesión

Al iniciar, la rama `fix/mp` estaba al día con `main` (ya mergeada vía PR #330). Se detectaron restos huérfanos de la limpieza anterior:

| Elemento | Estado encontrado |
|---|---|
| `Restaurante.mpAccessToken/mpRefreshToken/mpUserId` en `schema.prisma` | Campos presentes, sin uso en código |
| `apps/backend/src/common/crypto.service.ts` | Clase completa (AES-256-GCM), no registrada en ningún `@Module` |
| `apps/backend/src/payments/` | Módulo funcionando, pero **solo con pago en efectivo** (`solicitarEfectivo`, `confirmarEfectivo`, `getSesiones`) |
| `payment-provider.interface.ts` | Interfaz `PaymentProvider` huérfana, sin implementación |
| `.env.example` | Sección "MERCADO PAGO — TODO: reimplementar" con variables comentadas |

---

## 2. Qué se construyó — backend

### Archivos nuevos

| Archivo | Descripción |
|---|---|
| `apps/backend/src/payments/mercado-pago-oauth.service.ts` | `buildAuthUrl`, `handleCallback` (intercambio de code, encripta y guarda tokens), `getAccessTokenDecrypted` |
| `apps/backend/src/payments/mercado-pago-oauth.controller.ts` | `GET /payments/mercadopago/oauth/conectar`, `GET /payments/mercadopago/oauth/callback` |
| `apps/backend/src/payments/providers/mercado-pago.provider.ts` | `MercadoPagoProvider implements PaymentProvider` — `createPreference`, `processWebhook` (reconciliación vía Merchant Order), `getPaymentStatus` |

### Archivos modificados (aditivo, sin tocar lógica de efectivo)

| Archivo | Cambio |
|---|---|
| `providers/payment-provider.interface.ts` | +`restauranteId`/`pedidoId` en `CreatePaymentDto`; +`accessToken` como 2do parámetro de `processWebhook`/`getPaymentStatus` |
| `payments.module.ts` | Registrados `CryptoService`, `MercadoPagoProvider`, `MercadoPagoOAuthService` (providers) + `MercadoPagoOAuthController` (controllers) |
| `payments.service.ts` | +`crearPreferenciaMercadoPago(sesionId, pedidoId, monto)`, +`procesarWebhookMercadoPago(restauranteId, pedidoId, query)` |
| `payments.controller.ts` | +`POST mercadopago/crear-preferencia`, +`POST webhook/mercadopago/restaurante/:restauranteId/pedido/:pedidoId` |
| `.env` / `.env.example` | Ver sección 4 |

### Lógica clave — `procesarWebhookMercadoPago`

- Responde `res.status(HttpStatus.OK).send('OK')` como primera línea del controller, **antes** del `try/catch` — cumple la ventana de 22s de MP sin bloquear la respuesta.
- `processWebhook` en el provider centraliza todo en el **Merchant Order**: suma `transaction_amount` solo de pagos con `status === 'approved'`, compara contra `total_amount`.
- `upsert` de `Pago` por `pedidoId` (`@unique`) — evita duplicados en reintentos/ráfagas de notificaciones de MP.
- Guard de idempotencia: si `referenciaExterna` y `estado` ya coinciden con lo que llegó, no hace nada (protege contra las notificaciones repetidas típicas de MP).
- Al aprobarse: cierra `SesionMesa` (`estado: 'cerrada'`) y emite `gateway.emitSesionCobrada(restauranteId, { sesionId, mesaId, mesaNumero })` — reusa el evento tipado existente, no se inventó ninguno nuevo.

### Dependencia agregada

`mercadopago@3.2.0` vía `pnpm --filter @menyu/api add mercadopago` (SDK oficial, no había ninguna versión previa instalada — quedó un `3.0.0` huérfano en el store de pnpm de antes de la limpieza, sin usar).

---

## 3. Migración de base de datos

Se agregó un solo campo nuevo: `Restaurante.mpTokenExpiresAt DateTime?` (`mp_token_expires_at`).

**Complicación encontrada:** la DB tenía un drift preexistente y no relacionado — el historial de migraciones esperaba una columna `qr_base_url` en `restaurante` que no existe en la DB real (fue borrada manualmente en algún momento, sin migración). Esto rompía `prisma migrate dev`.

**Solución aplicada** (sin tocar el drift viejo, sin reset, sin pérdida de datos):
1. `prisma db execute --schema prisma/schema.prisma` con el `ALTER TABLE` manual.
2. Carpeta de migración creada a mano: `20260712000000_add_mp_token_expires_at/migration.sql`.
3. `prisma migrate resolve --applied 20260712000000_add_mp_token_expires_at` para dejar el historial consistente.

Resultado: `prisma migrate status` → "Database schema is up to date!" (aunque `migrate dev` seguirá mostrando el drift de `qr_base_url` si se lo vuelve a invocar — es preexistente, no se resolvió a propósito).

---

## 4. Variables de entorno nuevas/corregidas

Agregadas en `apps/backend/.env` y `.env.example`:

```env
MP_ENCRYPTION_KEY=...          # ya existía en .env real, agregada a .env.example
FRONTEND_ADMIN_URL=http://localhost:5174   # dev; https://admin.menyu.com en prod
BASE_URL=https://street-crayfish-comply.ngrok-free.dev/api   # debe incluir /api (setGlobalPrefix)
FRONTEND_URL=http://localhost:5176         # ver corrección de puerto abajo
```

**Corrección de puerto encontrada:** `MP_SUCCESS_URL`, `MP_FAILURE_URL`, `MP_PENDING_URL` en `.env` apuntaban a `localhost:5173`, pero `apps/web-cliente/vite.config.ts` tiene configurado el puerto **5176** (no 5173 — ese era el default viejo de Vite, ya no vigente). Se corrigieron las 3 variables a `5176`.

`PORT` del backend: **3000** (default de `main.ts`, sin override en `.env`).

---

## 5. Bug real de Mercado Pago encontrado y resuelto

Al probar `crearPreferenciaMercadoPago` por primera vez, MP devolvió:

```json
{ "message": "auto_return invalid. back_url.success must be defined", "error": "invalid_auto_return", "status": 400 }
```

**Causa:** `auto_return: 'approved'` exige que `back_urls.success` sea una URL pública HTTPS. Con `FRONTEND_URL=http://localhost:5176`, MP rechaza la preferencia aunque la URL esté técnicamente definida (es un mensaje de error engañoso, documentado en foros de MP).

**Fix en `mercado-pago.provider.ts`:** `auto_return` se agrega condicionalmente, solo si `successUrl` empieza con `https://` y no contiene `localhost`:

```typescript
const esUrlPublica = successUrl.startsWith('https://') && !successUrl.includes('localhost')
...
...(esUrlPublica ? { auto_return: 'approved' as const } : {}),
```

Después del fix, la creación de preferencia funcionó correctamente (HTTP 201, `initPoint` real devuelto).

---

## 6. Testing end-to-end realizado

### OAuth — funcionó de punta a punta

Con el restaurante de prueba `b3f8e097-6300-4592-9add-b2cf1f2b0c22` y ngrok (`https://street-crayfish-comply.ngrok-free.dev`):
1. `GET /payments/mercadopago/oauth/conectar?restauranteId=...` → redirect a MP → autorización manual → callback procesado.
2. Verificado en DB: `mpAccessToken`/`mpRefreshToken` no-null (encriptados), `mpUserId: "3442517448"`, `mpTokenExpiresAt: 2027-01-08T19:53:31.634Z`.

### Creación de preferencia — funcionó, 3 veces

Se crearon 3 pedidos de prueba (`Flan` x1, $200) en la sesión `6a358402-35e0-449a-8db7-b46101aba62b` / mesa `80c9a463-d1e3-49a4-8c81-f88d266e86f8`, y se generó preferencia para cada uno vía `curl` contra `POST /api/payments/mercadopago/crear-preferencia`. Las 3 devolvieron HTTP 201 con `initPoint` válido (ver sección 9 para IDs).

### Intento de pago con tarjeta de prueba — bloqueado, causa identificada

Al intentar completar el checkout visual, dio error. Se investigó a fondo:
- El inspector de ngrok (`127.0.0.1:4040`) mostró **cero requests nuevos** al webhook — el fallo ocurrió enteramente dentro de la UI de MP, antes de llegar a nuestro backend.
- Se hizo un pago directo server-to-server (tokenizando la tarjeta de prueba oficial `5031755734530604`/`APRO` vía `/v1/card_tokens`, luego `/v1/payments`) para diagnosticar sin depender del checkout visual.
- Resultado: `card_token` se creó bien (`live_mode: true`), pero el `payment` fue rechazado con **error 2034 "Invalid users involved"**.

**Causa raíz confirmada:** estamos usando credenciales de **producción reales** (`MP_ACCESS_TOKEN=APP_USR-...`, obtenidas vía OAuth real). Las tarjetas de prueba de MP (y usuarios de prueba) solo funcionan contra cuentas sandbox — usarlas contra una cuenta `live_mode: true` dispara el bloqueo antifraude de MP. **No es un bug de nuestra integración** — el código de OAuth, creación de preferencia y webhook ya está validado y funcionando.

---

## 7. Hallazgo: frontend web-cliente sin botón de MP funcional

Se investigó `apps/web-cliente/src/` buscando cualquier rastro de un flujo de pago con MP para reactivar, en vez de armar todo de cero:

- `services/api.ts` tiene un método **`payments.initiate`** activo (no comentado) que llama a `POST /payments/initiate` — **ruta que ya no existe**, no coincide con la implementada (`/payments/mercadopago/crear-preferencia`), y su forma de respuesta tampoco coincide (`{ id, initPoint, externalReference, pagoId }` vs la real `{ initPoint, preferenceId }`). **No se usa en ningún lado** (verificado, cero referencias).
- `pages/pago/PagarPage.tsx` tiene el texto "Conectando con Mercado Pago..." (línea ~154) atado al estado `'loading'` de `usePagoStore` — pero ese estado **solo lo dispara `solicitarEfectivo`** (el flujo de efectivo). Es un resabio de copy de la implementación vieja, no un flujo de MP real.
- `store/pagoStore.ts` **no tiene ningún método de MP** — ni activo ni comentado. Solo `solicitarEfectivo`.

**Conclusión:** no hay nada que reactivar — hay que construir el botón/flujo de pago con MP en `web-cliente` desde cero (nuevo método en `pagoStore`, UI en `PagarPage.tsx`, y limpiar/reemplazar el `api.payments.initiate` viejo).

También se confirmó que `apps/` tiene carpetas viejas de la arquitectura Expo abandonada (`admin/`, `cliente/`, `cocina/`, `mozo/`, `web/` — todas vacías, solo `node_modules`, sin `package.json`) conviviendo con las apps reales (`web-admin/`, `web-cliente/`, `web-staff/`). No se tocaron.

---

## 8. Bloqueo actual — test users de Mercado Pago

Para probar un pago aprobado de punta a punta (incluyendo el webhook) sin usar dinero real, se decidió crear un **test user vendedor** + **test user comprador** vía la API de MP (en vez de forzar tarjetas de prueba contra producción).

### Pasos hechos

1. Conectado el MCP de Mercado Pago (`claude mcp`, plugin ya instalado) — requirió autenticación OAuth con la **cuenta personal** del desarrollador (la misma que tiene registrada la app "MenYu", `AppID: 7614597750511204`).
2. `create_test_user` para `site_id: MLA` (Argentina), perfiles `seller` y `buyer` — **ambos ya existían** (creados en mayo/junio 2026, antes de esta sesión):

| Rol | User ID | Nickname |
|---|---|---|
| Vendedor | `3428536456` | `TESTUSER739912715881549713` |
| Comprador | `3428536462` | `TESTUSER3220575624282032946` |

3. **Dato curioso:** el nickname del comprador coincide con el `test_user_3220575624282032946@...` que se había visto antes en una pantalla de verificación de MP — confirma que es el mismo usuario.
4. **Detalle a verificar:** estos test users están administrados bajo la app `8480749303914870`, no bajo `7614597750511204` ("MenYu"). No debería bloquear nada — un test user es una cuenta MP común, conectable vía OAuth desde cualquier app — pero quedó sin confirmar el porqué de la diferencia.

### Bloqueo

El MCP **enmascara las contraseñas** de test users que ya existían (solo las revela la primera vez que se crean). Sin la contraseña no se puede:
- Loguear al vendedor de prueba en la pantalla de autorización OAuth (para conectar su cuenta sandbox vía nuestro propio flujo, igual que se hizo con el restaurante real).
- Loguear al comprador de prueba en el checkout para pagar con tarjeta de prueba sin el error 2034.

**Se quedó esperando** que se recuperen o reseteen las contraseñas desde el Developer Dashboard: `https://www.mercadopago.com.ar/developers/panel/app/8480749303914870/test-users`

---

## 9. Datos de prueba que quedaron en la DB

Tres pedidos de prueba creados durante la sesión, todos en la sesión `6a358402-35e0-449a-8db7-b46101aba62b` / mesa `80c9a463-d1e3-49a4-8c81-f88d266e86f8`, ítem "Flan" x1 ($200), estado `pendiente`, sin pago aprobado (ninguno llegó a completarse):

| pedidoId | preferenceId generado | Notas |
|---|---|---|
| `ffe17ec8-d427-419d-a716-e967c2dfb1d3` | `...c89d9786-17de-4da5-bd73-8d0f63565139` | Primer test, quedó "bloqueado" tras intentos fallidos en checkout |
| `4f0d691d-53c3-4603-8a4e-892645a1a240` | `...eff06a5e-e157-4c8b-a388-ef6a39415448` | Segundo test, mismo destino |
| `d7c568ce-3ff3-4bde-950d-f3c05723b981` | `...4c673fe5-824a-427d-88ab-c34260e995e2` | Último — confirmado sin `merchant_order` (`total: 0`), usado en el diagnóstico del error 2034 |

No se limpiaron — quedan como datos de prueba en la sesión `6a358402...`. Considerar si conviene borrarlos o dejarlos para seguir reusando la misma sesión en la próxima sesión de trabajo.

---

## 10. Qué falta para la próxima sesión

| Item | Prioridad |
|---|---|
| Conseguir/resetear las contraseñas de los test users (vendedor `3428536456` / comprador `3428536462`) vía el Developer Dashboard | **Alta — bloqueante** |
| Conectar el vendedor de prueba vía nuestro propio flujo OAuth (`/payments/mercadopago/oauth/conectar`), usando su login | Alta |
| Completar un checkout real con el comprador de prueba + tarjeta de prueba, y verificar que el webhook cierre la `SesionMesa` y emita `emitSesionCobrada` | Alta |
| Construir el botón/flujo de pago con MP en `apps/web-cliente` (hoy no existe — ver sección 7) | Alta |
| Reemplazar o eliminar `api.payments.initiate` (ruta vieja `/payments/initiate`, sin uso) en `web-cliente/src/services/api.ts` | Media |
| Corregir el string "Conectando con Mercado Pago..." mal atado al estado `loading` de efectivo en `PagarPage.tsx` | Media |
| Decidir si limpiar los 3 pedidos de prueba huérfanos (sección 9) | Baja |
| Entender por qué los test users están bajo una app distinta (`8480749303914870`) a la real (`7614597750511204`) | Baja |
| Agregar `MP_ENCRYPTION_KEY`/`FRONTEND_ADMIN_URL`/`BASE_URL`/`FRONTEND_URL` al README/onboarding si no está ya | Baja |
| Revisar si conviene resolver el drift viejo de `qr_base_url` (no se tocó a propósito en esta sesión) | Baja |
