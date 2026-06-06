# Integración Mercado Pago — MenYu

## Índice

1. [Arquitectura general](#arquitectura-general)
2. [OAuth por restaurante](#oauth-por-restaurante)
3. [Flujo de pago digital](#flujo-de-pago-digital)
4. [Flujo de pago en efectivo](#flujo-de-pago-en-efectivo)
5. [Webhook](#webhook)
6. [Endpoints del backend](#endpoints-del-backend)
7. [Variables de entorno](#variables-de-entorno)
8. [Abstracción PaymentProvider](#abstracción-paymentprovider)
9. [Seguridad](#seguridad)
10. [Configuración Sandbox](#configuración-sandbox)
11. [Estados de pago](#estados-de-pago)
12. [Bugs conocidos y diagnóstico](#bugs-conocidos-y-diagnóstico)

---

## Arquitectura general

MenYu usa Mercado Pago Checkout Pro con el modelo **marketplace OAuth**: cada restaurante conecta su propia cuenta MP como seller. El pago del cliente va directamente a la cuenta del restaurante; MenYu actúa como plataforma intermediaria.

```
Cliente (web-cliente)
    │
    │  POST /api/payments/initiate  (JWT de sesión)
    ▼
Backend (NestJS)
    │
    │  Descifra el access_token OAuth del restaurante
    │  Crea preference en MP con ese token
    │
    ▼
Mercado Pago API
    │
    │  Devuelve init_point / sandbox_init_point
    ▼
Cliente abre checkout de MP → paga → MP redirige a back_url
    │
    │  POST /api/payments/webhook  (notificación MP)
    ▼
Backend actualiza estado del pago y cierra sesión de mesa
```

---

## OAuth por restaurante

### Paso 1 — El admin inicia la conexión

El panel admin llama a `GET /api/payments/connect/:restauranteId`.

El backend construye la URL de autorización de MP:

```
https://auth.mercadopago.com/authorization
  ?client_id=MP_CLIENT_ID
  &response_type=code
  &platform_id=mp
  &redirect_uri=MP_REDIRECT_URI
  &state=restauranteId
```

El `state` transporta el `restauranteId` para identificar al seller al volver.

### Paso 2 — MP redirige al callback

Luego de que el dueño del restaurante autoriza, MP llama a `GET /api/payments/callback?code=...&state=restauranteId`.

El backend intercambia el `code` por tokens:

```
POST https://api.mercadopago.com/oauth/token
  client_id, client_secret, grant_type=authorization_code
  code, redirect_uri
  test_token=true  ← solo si MP_ENV=sandbox
```

Guarda en la tabla `restaurante`:
- `mpAccessToken` — cifrado con `CryptoService` (AES)
- `mpRefreshToken` — cifrado
- `mpUserId`

### Renovación de token

No implementada en v1.0. El `refresh_token` se almacena para uso futuro.

---

## Flujo de pago digital

### 1. Cliente solicita pagar

En `PagarPage`, el cliente hace clic en "Pagar con Mercado Pago". Esto llama a `initiarPagoMP` del `pagoStore`.

```ts
// pagoStore.ts
POST /api/payments/initiate
Authorization: Bearer <session_jwt>
Body: {
  pedidoId, sesionId, restauranteId,
  monto, descripcion,
  returnBaseUrl: window.location.origin   // ej. https://menyu-cliente.vercel.app
}
```

### 2. Backend crea la preference

`PaymentsService.initiatePayment`:

1. Verifica el JWT de sesión (tipo `cliente`).
2. Busca el restaurante en DB y descifra su `mpAccessToken`.
3. Construye `successUrl`, `failureUrl`, `pendingUrl` a partir del `returnBaseUrl`:
   ```
   successUrl = returnBaseUrl + /pago/exitoso
   failureUrl = returnBaseUrl + /pago/fallido
   pendingUrl = returnBaseUrl + /pago/pendiente
   ```
   Si no viene `returnBaseUrl`, usa las env vars `MP_SUCCESS_URL` / `MP_FAILURE_URL` / `MP_PENDING_URL`.
4. Valida que `returnBaseUrl` esté en `ALLOWED_ORIGINS` (regex Vercel).
5. Delega a `MercadoPagoProvider.createPreference`.
6. Guarda un registro `pago` en DB con estado `pendiente`.
7. Devuelve `{ id, initPoint, externalReference, pagoId }`.

### 3. MercadoPagoProvider construye la preference

```ts
{
  external_reference: `${sesionId}-${Date.now()}`,
  items: [{
    id: sesionId,
    title: descripcion,
    quantity: 1,
    unit_price: Math.round(monto * 100) / 100,  // redondeado a 2 decimales
    currency_id: 'ARS',
  }],
  // Si MP_MINIMAL_PREFERENCE !== 'true':
  back_urls: { success, failure, pending },
  auto_return: 'approved',
  // Si MP_WEBHOOK_URL definida:
  notification_url: MP_WEBHOOK_URL,
}
```

La preference se crea con el **access_token del restaurante** (no el de la plataforma).

En sandbox usa `sandbox_init_point`; en producción usa `init_point`.

### 4. Cliente es redirigido a MP

El store hace `window.location.href = data.initPoint`. El cliente completa el pago en el checkout de MP.

### 5. MP redirige de vuelta

Según el resultado, MP redirige al cliente a:

| Resultado | URL |
|---|---|
| Aprobado | `{origin}/pago/exitoso` |
| Fallido | `{origin}/pago/fallido` |
| Pendiente | `{origin}/pago/pendiente` |

### 6. Páginas de resultado

| Ruta | Componente | Comportamiento |
|---|---|---|
| `/pago/exitoso` | `PagoExitosoPage` | Countdown 30s → `/menu` |
| `/pago/fallido` | `PagoFallidoPage` | Botón reintentar → `/pagar` |
| `/pago/pendiente` | `PagoPendientePage` | Botón ver pedidos → `/pedidos` |

---

## Flujo de pago en Efectivo

### 1. Cliente solicita pagar en efectivo

```ts
POST /api/payments/solicitar-efectivo
Body: { sesionId, pedidoId, monto }
```

### 2. Backend

1. Crea registro `pago` con `metodo: 'efectivo'` y `estado: 'pendiente'`.
2. Elimina llamados al mozo pendientes de esa sesión.
3. Crea un llamado al mozo con `motivo: 'pedir_cuenta'`.
4. Emite eventos Socket.io:
   - `mozo:called` → panel mozo
   - `quiere:pagar` → panel staff

### 3. Mozo confirma el cobro

```ts
POST /api/payments/confirmar-efectivo
Body: { sesionId, mozoId? }
```

Cierra la sesión y marca el pago como `aprobado`.

---

## Webhook

### Endpoint

```
POST /api/payments/webhook
```

Sin autenticación. MP llama a esta URL cuando ocurre un evento de pago.

### Flujo

1. Recibe payload `{ type, data: { id } }`.
2. Si `type !== 'payment'`, ignora.
3. Consulta el pago a MP por ID.
4. Si el estado es `approved`:
   - Busca el registro `pago` por `referenciaExterna`.
   - Actualiza `pago.estado = 'aprobado'`.
   - Cierra `sesionMesa` (`estado: 'cerrada'`, `cerradaEn: now`).
5. Emite `sesion:cerrada` vía Socket.io al cliente.

### Nota sobre sandbox

En sandbox, `MP_WEBHOOK_URL` debe ser una URL pública accesible desde Internet (no localhost). Se puede usar `ngrok` para pruebas locales.

En sandbox con `MP_MINIMAL_PREFERENCE=true`, el webhook no se configura en la preference. El cierre de sesión debe hacerse manualmente o vía `confirmar-efectivo` para testing.

---

## Endpoints del backend

Base path: `/api/payments`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/initiate` | Session JWT | Crea preference MP y registra pago en DB |
| `POST` | `/webhook` | Ninguna | Recibe notificaciones de pago de MP |
| `GET` | `/status/:externalId` | Ninguna | Consulta estado de un pago por ID externo MP |
| `GET` | `/connect/:restauranteId` | Ninguna | Genera URL de OAuth para conectar cuenta MP |
| `GET` | `/callback` | Ninguna | Callback OAuth: intercambia code → tokens |
| `POST` | `/solicitar-efectivo` | Ninguna | Registra intención de pago en efectivo |
| `POST` | `/confirmar-efectivo` | Ninguna | Confirma cobro en efectivo, cierra sesión |
| `GET` | `/sesiones` | Ninguna | Lista sesiones con estado de pago (panel caja) |

### DTO `POST /initiate`

```ts
{
  pedidoId: string        // ID del pedido a pagar
  restauranteId: string   // ID del restaurante
  sesionId: string        // ID de la sesión de mesa
  monto: number           // total en ARS
  descripcion: string     // texto que aparece en el checkout MP
  returnBaseUrl?: string  // origin del frontend (ej. https://menyu-cliente.vercel.app)
}
```

### Respuesta `POST /initiate`

```ts
{
  id: string              // preference ID de MP
  initPoint: string       // URL del checkout (init_point o sandbox_init_point)
  externalReference: string
  pagoId: string          // ID del registro pago en DB
}
```

---

## Variables de entorno

```env
# Credenciales de la app plataforma (MenYu)
MP_CLIENT_ID=...
MP_CLIENT_SECRET=...
MP_ACCESS_TOKEN=...          # token de plataforma (no del seller)

# OAuth callback
MP_REDIRECT_URI=https://api.menyu.com/api/payments/callback

# Entorno
MP_ENV=sandbox               # 'sandbox' | 'production'

# URLs de retorno (fallback cuando returnBaseUrl no viene del frontend)
MP_SUCCESS_URL=https://menyu-cliente.vercel.app/pago/exitoso
MP_FAILURE_URL=https://menyu-cliente.vercel.app/pago/fallido
MP_PENDING_URL=https://menyu-cliente.vercel.app/pago/pendiente

# Webhook
MP_WEBHOOK_URL=https://api.menyu.com/api/payments/webhook

# Diagnóstico
MP_MINIMAL_PREFERENCE=true   # 'true' omite back_urls/auto_return/notification_url
```

---

## Abstracción PaymentProvider

El patrón de pagos está desacoplado mediante la interfaz `PaymentProvider`:

```ts
interface PaymentProvider {
  createPreference(data: CreatePaymentDto): Promise<PaymentPreference>
  processWebhook(payload: unknown): Promise<WebhookResult>
  getPaymentStatus(externalId: string): Promise<PaymentStatus>
}
```

`MercadoPagoProvider` implementa esta interfaz y se registra en el módulo como:

```ts
{ provide: 'PAYMENT_PROVIDER', useClass: MercadoPagoProvider }
```

Para agregar otro proveedor (ej. Stripe), basta implementar la interfaz y cambiar el `useClass` sin tocar el servicio ni el controlador.

---

## Seguridad

- Los tokens OAuth de los restaurantes se almacenan **cifrados** (AES vía `CryptoService`) en la columna `mpAccessToken` de la tabla `restaurante`.
- El campo `returnBaseUrl` es validado contra una lista de orígenes permitidos (`ALLOWED_ORIGINS`) antes de construir las back URLs. Orígenes no listados reciben `400 Bad Request`.
- Los tokens nunca se loguean. Los logs solo muestran si el token es de test (`isTestToken: true/false`).
- El endpoint `/webhook` no lleva autenticación por requerimiento de MP, pero solo procesa eventos de tipo `payment`.

### ALLOWED_ORIGINS

```ts
/^https:\/\/menyu-cliente(-[a-z0-9]+)?\.vercel\.app$/
/^https:\/\/menyu-cliente-[a-z0-9-]+-men-yu-s-projects\.vercel\.app$/
// + process.env.MP_SUCCESS_URL origin (si está definida)
```

Cubre dominios de producción Vercel, branch previews y deployment-specific previews.

---

## Configuración Sandbox

### Requisitos para que el pago funcione en sandbox

1. **Dos usuarios de test distintos** creados desde el [dashboard de MP](https://www.mercadopago.com.ar/developers/panel/test-users):
   - `seller-test`: conecta su cuenta al restaurante via OAuth
   - `buyer-test`: realiza el pago en el checkout

   El buyer y el seller **no pueden ser la misma cuenta**. MP sandbox no permite que una cuenta se compre a sí misma.

2. **Token OAuth del seller en sandbox**: al iniciar el OAuth con `test_token=true`, el token resultante empieza con `TEST-`. Verificable en los logs como `isTestToken: true`.

3. **Tarjetas de test de MP** (no tarjetas reales):

   | Marca | Número | CVV | Vencimiento |
   |---|---|---|---|
   | Mastercard | `5031 7557 3453 0604` | `123` | cualquier fecha futura |
   | Visa | `4509 9535 6623 3704` | `123` | cualquier fecha futura |
   | Amex | `3711 803032 57522` | `1234` | cualquier fecha futura |

4. **`MP_ENV=sandbox`** en Railway: hace que el backend use `sandbox_init_point` en lugar de `init_point`.

### Variable de diagnóstico

`MP_MINIMAL_PREFERENCE=true`: envía a MP solo `external_reference` e `items`, sin `back_urls`, `auto_return` ni `notification_url`. Útil para aislar si el error viene de esos campos. Si el pago funciona en modo minimal pero falla con back_urls, el problema está en los dominios configurados.

---

## Estados de pago

### En la base de datos (`pago.estado`)

| Estado DB | Descripción |
|---|---|
| `pendiente` | Preference creada, esperando resultado |
| `aprobado` | Pago confirmado (por webhook MP o confirmación mozo) |

### Mapeado desde MP (`PaymentStatus`)

| Estado MP | Estado interno |
|---|---|
| `approved` | `APROBADO` |
| `rejected` | `RECHAZADO` |
| `in_process` / `pending` | `EN_PROCESO` |
| otros | `PENDIENTE` |

---

## Bugs conocidos y diagnóstico

### "Oh, no, algo anduvo mal" en sandbox

Error que aparece al confirmar el pago en el checkout de MP en entorno sandbox. Causas más frecuentes:

| Causa | Diagnóstico | Solución |
|---|---|---|
| Buyer y seller son la misma cuenta | El email del buyer-test coincide con el seller-test | Crear dos usuarios de test distintos |
| Tarjeta real en sandbox | El buyer intenta pagar con una tarjeta personal | Usar las tarjetas de test de MP |
| back_urls apuntan a dominios con protección | Vercel Deployment Protection activa en el preview | Deshabilitar Deployment Protection en Vercel para la app, o probar con `MP_MINIMAL_PREFERENCE=true` |
| Token OAuth expirado o de entorno incorrecto | `isTestToken: false` en los logs | Reconectar el restaurante via OAuth con cuenta de test |
| `unit_price` con decimales imprecisos | `unit_price_original` ≠ `unit_price` en logs | Ya resuelto: se redondea con `Math.round(x * 100) / 100` |

### `hasReturnBaseUrl: false`

El campo `returnBaseUrl` no llegó al backend. Causas:

- `pagoStore.ts` no lo incluía en el body del fetch (resuelto: se agregó `returnBaseUrl: window.location.origin`).
- El deploy de Vercel activo es uno anterior al fix. Usar el URL del deploy más reciente.

### URL del preview no matchea ALLOWED_ORIGINS

Vercel genera dos formatos de URL de preview:
- Branch: `menyu-cliente-git-<branch>-men-yu-s-projects.vercel.app`
- Deployment: `menyu-cliente-<hash>-men-yu-s-projects.vercel.app`

Ambos formatos están cubiertos por el regex actual. Si aparece un nuevo formato, agregar un regex a `ALLOWED_ORIGINS` en `payments.service.ts`.
