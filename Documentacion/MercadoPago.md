# Integración Mercado Pago — MenYu

> **Aviso (26/10/2026):** las secciones 1 a 12 son de junio de 2026 (`35bc855`) y varias ya no coinciden con el código. Por ejemplo:
> - los endpoints actuales son `POST /api/payments/mercadopago/crear-preferencia`, `POST /api/payments/webhook/mercadopago/restaurante/:restauranteId/pago/:pagoId` y `GET /api/payments/mercadopago/oauth/conectar` y `/callback`, no `/initiate`, `/webhook`, `/connect` ni `/callback`;
> - el webhook ya no busca el pago por `referenciaExterna`: usa el `pagoId` de la ruta.
>
> Las variables de entorno (sección 7), el caso de Mercado Pago caído y los pagos para revisión (sección 13) y el log del webhook (sección 14) están al día con el PR B de la deuda de pagos (05/11/2026).

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
13. [Si Mercado Pago está caído](#si-mercado-pago-está-caído)
14. [El log del webhook y la firma](#el-log-del-webhook-y-la-firma)

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

Todas son del backend. Los frontends no tienen variables de Mercado Pago. Detalle y valores por entorno: `apps/backend/.env.example:47-80`.

| Variable | Para qué | Dónde se usa |
|---|---|---|
| `MP_ENCRYPTION_KEY` | Clave AES-256-GCM para cifrar los tokens OAuth de cada restaurante | `apps/backend/src/common/crypto.service.ts:14` |
| `MP_CLIENT_ID` | Credencial de la app de Mercado Pago (OAuth) | `apps/backend/src/payments/mercado-pago-oauth.service.ts:30` y `:46` |
| `MP_CLIENT_SECRET` | Credencial de la app de Mercado Pago (OAuth) | `mercado-pago-oauth.service.ts:47` |
| `BASE_URL` | URL pública del backend con `/api`: arma el `redirect_uri` del OAuth y el `notification_url` del webhook | `mercado-pago-oauth.service.ts:33` y `:50`; `apps/backend/src/payments/providers/mercado-pago.provider.ts:22` |
| `FRONTEND_URL` | Web-cliente: `back_urls` de respaldo cuando el `Origin` falta o no está en la lista de CORS | `mercado-pago.provider.ts:25-27` |
| `FRONTEND_ADMIN_URL` | Panel admin: a dónde vuelve después de conectar Mercado Pago | `apps/backend/src/payments/mercado-pago-oauth.controller.ts:30` |
| `MP_WEBHOOK_SECRET` | Opcional. La clave secreta de las notificaciones, para evaluar la firma del webhook (DT-02: validar la firma del webhook) | `apps/backend/src/payments/payments.controller.ts` (`registrarFirma` y el aviso de `onModuleInit`) |

**`MP_WEBHOOK_SECRET`** existe de nuevo desde el PR B de la deuda de pagos (05/11/2026), con otro uso que el de junio:
- **De dónde sale:** en Tus integraciones de Mercado Pago, la aplicación → Webhooks → Configurar notificaciones → Clave secreta.
- **Qué hace hoy (modo observación, DT-02):** con la clave, el webhook evalúa la firma de cada notificación y la anota en el log (sección 14). La notificación **se procesa igual**, con firma válida, inválida o sin firma. Exigirla queda para un PR posterior (PR C), cuando los logs de staging muestren qué notificaciones vienen firmadas.
- **Si falta:** el backend arranca igual y avisa una vez al arrancar ("MP_WEBHOOK_SECRET no está definida: las firmas del webhook de Mercado Pago no se evalúan"). Cada notificación queda con `firma=sin-secreto`.

**Ya no existen en el código:** `MP_ACCESS_TOKEN`, `MP_WEBHOOK_URL`, `MP_SUCCESS_URL`, `MP_FAILURE_URL`, `MP_PENDING_URL`, `MP_REDIRECT_URI`, `MP_ENV` y `MP_MINIMAL_PREFERENCE` (`git grep` sobre `apps/*/src`, `packages`, `scripts` y `.github`, sin resultados). Lo que las secciones 2, 3, 5 y 10 dicen de ellas es histórico.

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

---

## Si Mercado Pago está caído

Revisado el 26/10/2026 contra el código de `main` (`8b98247`; los archivos citados no cambiaron hasta `3a8300b`). Es una lectura del código: **no se probó** contra la sandbox ni contra producción. Lo mismo, en versión resumida, está en `docs/calidad/plan-de-pruebas.md`, sección 8.

### Si falla la creación de la preferencia

- **Sin timeout ni reintentos propios:** `new MercadoPagoConfig({ accessToken })` va sin `options` (`apps/backend/src/payments/providers/mercado-pago.provider.ts:13-15`). Rigen los valores del SDK `mercadopago@3.2.0` (`pnpm-lock.yaml:3963`):
  - **timeout:** 10.000 ms por intento (`dist/utils/config/index.js:53`);
  - **intentos:** 2 en total, con 2 s de espera entre los dos (`dist/utils/config/index.js:55` y `dist/utils/restClient/index.js:65-80`);
  - **cuándo reintenta:** con timeout, error de red o 5xx. Un 4xx no se reintenta;
  - **peor caso calculado, no medido:** unos 22 s.
- **El backend no deja un pago "fantasma":** si los dos intentos fallan, cancela el `Pago` pendiente que acababa de crear y relanza el error (`apps/backend/src/payments/payments.service.ts:363-376`).
- **Qué ve el comensal:** no hay filtro de excepciones global, así que la respuesta sería un 500 `"Internal server error"` (deducido del comportamiento de Nest, no probado).
  - El botón queda en "cargando" mientras el backend reintenta. Después muestra ese mensaje y se vuelve a habilitar (`apps/web-cliente/src/pages/pago/PagarPage.tsx:104-106`, `apps/web-cliente/src/pages/dividir/MensajePage.tsx:148-151`).
  - Puede reintentar (cada intento cancela el pendiente anterior, `payments.service.ts:331-334`) o pedir efectivo.

### Si un pago queda pendiente porque el webhook no llega

- **No hay un proceso en segundo plano** que lo cancele: no hay `@Cron`, `@Interval` ni `ScheduleModule` en `apps/backend/src`.
- **Se cancela cuando el personal registra el cobro** (`registrarCobro`, `apps/backend/src/sessions/sessions.service.ts:667-681`):
  - **pendiente de más de 10 minutos** (`VENTANA_MP_PENDIENTE_MS`, `sessions.service.ts:38`): lo cancela sin preguntar;
  - **más nuevo:** responde 409 y lo cancela si se repite con `confirmarCancelacionPagosPendientes: true`.
    - web-staff lo maneja (`apps/web-staff/src/components/CobroModal.tsx:51-68`);
    - web-admin no (`apps/web-admin/src/pages/admin/pagos/PagosPage.tsx:114-129`).
- **Métodos de cobro del personal:** efectivo, débito, crédito, transferencia o Mercado Pago (`apps/backend/src/sessions/dto/registrar-cobro.dto.ts:3`).
- **Otra salida, del lado del comensal:** puede pedir efectivo aunque tenga un MP pendiente (`payments.service.ts:124-199`). Cuando el mozo lo confirma y la mesa queda cubierta, se cancelan los pendientes (`payments.service.ts:291-297`).
  - **Excepción:** con el restaurante o su marca dados de baja, pedir efectivo responde 403 (`payments.service.ts:149-151`) y solo queda Mercado Pago.

### Si el webhook llega pero Mercado Pago no responde

Desde el PR B de la deuda de pagos (05/11/2026), que resolvió DT-11 (el webhook respondía 200 antes de procesar), el webhook **responde después de procesar** la notificación: el `200` sale solo cuando el pago ya quedó registrado en la base, o cuando la notificación no se puede procesar nunca. Si algo falla en el medio, responde `500` y Mercado Pago la vuelve a mandar.

- **Quién decide qué responder:** una sola función, `clasificarErrorDelWebhook` (`apps/backend/src/payments/clasificar-error-del-webhook.ts`). El controller responde lo que ella dice y no tiene otra regla.
- **Antes de consultar a Mercado Pago**, el servicio mira la base: si el pago no existe, si es de otro restaurante que el de la URL o si no es de Mercado Pago, no le pide nada a MP.

| Caso | Respuesta | En el log |
|---|---|---|
| El pago no existe | `200` | warn |
| El pago es de otro restaurante que el de la URL (no se consulta a MP) | `200` | warn |
| El pago no es de Mercado Pago | `200` | warn |
| El `external_reference` de la orden no es este pago | `200` | warn |
| Tópico desconocido, o un `payment` todavía sin orden | `200` (cae en el caso anterior: la referencia viene vacía) | warn |
| Mercado Pago responde `400` | `200` (reintentar no lo arregla) | warn, `codigo=mp-solicitud-invalida` |
| El restaurante no tiene Mercado Pago conectado | `500` | error: "hay que reconectar Mercado Pago desde el panel del restaurante" |
| Mercado Pago responde `401` o `403` (token vencido o revocado) | `500` | error: el mismo aviso de reconectar |
| Mercado Pago responde `404`, `429` o `5xx` | `500` | error |
| Otro 4xx de Mercado Pago (`409`, `422`…) | `500` | error, `codigo=mp-otro` |
| Error de red o timeout | `500` | error |
| Error de Prisma (la base) | `500` | error |
| Cualquier otro error | `500` | error, `codigo=desconocido` |

- **Qué devuelve un `500`:** un cuerpo genérico, `{ statusCode: 500, message: "No se pudo procesar la notificación", error: "Internal Server Error" }`. El detalle queda solo en el log: `pagoId`, `restauranteId`, el código, el status de MP y el mensaje del error en una línea. Nunca el objeto de error entero ni tokens.
- **Cuánto reintenta Mercado Pago:** según su documentación de Webhooks, unos 4 días, con esperas crecientes (al momento, 15 min, 30 min, 6 h, 48 h, 96 h…). Mientras tanto el pago sigue pendiente y el personal puede cobrar la mesa igual (la sección anterior).
- **Timeout por intento:** las consultas del webhook (`payment.get` y `merchantOrder.get`) van con **4000 ms** por intento (`TIMEOUT_DE_LAS_CONSULTAS_DEL_WEBHOOK_MS` en `mercado-pago.provider.ts`). Los reintentos del SDK se mantienen (2 intentos con 2 s de espera ante un 5xx, error de red o timeout). Peor caso: 2 consultas × (4 s + 2 s + 4 s) = **20 s**, por debajo de los **22 s** que Mercado Pago espera la respuesta. `createPreference` no cambió: sigue con los 10 s del SDK.
- **Un cobro ya registrado nunca termina en `500`:** después del commit, el aviso a las pantallas (el `emit` de Socket.io y la lectura de la mesa) va protegido. Si falla, queda un `logger.error` y el webhook responde `200`. Si respondiera `500`, Mercado Pago reintentaría una notificación ya aplicada.
- **Dos notificaciones iguales al mismo tiempo:** la transacción es serializable. Una de las dos choca (`P2034`), se reintenta una vez y ya ve el pago aprobado. Lo prueba el e2e `apps/backend/src/payments/webhook.e2e-spec.ts` (caso 8).

### Riesgo de doble cobro y pagos para revisión

Hay dos casos en que Mercado Pago aprueba un pago y la plata entra, pero la mesa ya se cobró o se cerró por otro lado. El webhook no los deshace: los **marca para revisión** en la tabla `pago`.

| Caso | Qué pasó | Cómo queda el pago |
|---|---|---|
| **(a)** `aprobado-sobre-cancelado` | El personal cobró la mesa (o la cerró a mano), eso canceló el pago de MP, y después Mercado Pago lo aprobó | Sigue `cancelado`. `requiereRevision = true`, `motivoRevision = 'aprobado-sobre-cancelado'` y `referenciaExterna` con la orden de MP, solo si estaba vacía. Es la única excepción a "el webhook no toca un pago en estado final", y no cambia nada más |
| **(b)** `aprobado-sobre-sesion-cerrada` | Mercado Pago aprueba un pago de una sesión que ya no está activa, cubra o no el total | Queda `aprobado`, con la marca y ese motivo. La sesión y la mesa no se tocan: la mesa puede tener otra sesión abierta. Tampoco se avisa a las pantallas |

- **El motivo es el primero:** si el pago ya tenía la marca, no se pisa.
- **Una notificación repetida** sobre un pago ya marcado y con referencia no escribe nada; solo vuelve a dejar el warn.
- **Dónde verlos:** `GET /api/payments/requieren-revision?restauranteId=…`, para OWNER y GERENTE del restaurante. Devuelve hasta 200 pagos, más nuevos primero, con `pagoId`, `sesionId`, `mesaNumero`, `monto`, `metodo`, `estado`, `motivo`, `referenciaExterna`, `fechaCobro` y `creadoEn`. No trae datos de comensales ni de quién cobró.
- **Cómo se resuelve hoy:** a mano. Con la `referenciaExterna` (la orden de Mercado Pago), se busca el pago en el panel de Mercado Pago de la cuenta del restaurante y se devuelve desde ahí.

> **Limitación conocida:** no hay forma de marcar un pago como revisado o resuelto, ni una pantalla en el frontend. El endpoint es de solo lectura y la lista solo crece (por eso tiene tope de 200).

### Limitaciones conocidas (quedan para la tesis)

1. **El mensaje que ve el comensal** no distingue una falla de Mercado Pago de cualquier otro error del servidor.
2. **El panel de administración (web-admin)** no maneja el 409 del pago reciente pendiente: solo lo hace el panel de mozo (web-staff).
3. **Los pagos para revisión** no se pueden marcar como resueltos ni tienen pantalla, y no hay conciliación automática con Mercado Pago (la sección anterior).

Lo que decía la versión anterior de esta sección, que un webhook cuya consulta a Mercado Pago falla deja el pago pendiente sin reintento, ya no vale: ahora responde `500` y Mercado Pago reintenta.

---

## El log del webhook y la firma

Cada notificación deja **una línea** en el log, al principio, antes de procesarla (`registrarFirma` en `payments.controller.ts`). Por ejemplo:

```
webhook MP: restauranteId=<id> pagoId=<id> x-signature=sí x-request-id=sí query=[data.id,type] tipo=payment firma=valida
```

- **`restauranteId` y `pagoId`:** los de la URL, filtrados a `[\w.-]` y recortados a 40 caracteres.
- **`x-signature` y `x-request-id`:** `sí` o `no`, si vinieron los headers.
- **`query=[…]`:** los **nombres** de los parámetros de la query, filtrados igual y hasta 10.
- **`tipo=`:** el único valor de la query que entra: `topic` y, si no viene, `type` (la misma precedencia que el provider), filtrado y recortado. Sin ninguno de los dos, `tipo=sin-tipo`.
- **`firma=`:**

| Valor | Qué significa | Nivel |
|---|---|---|
| `valida` | La firma coincide con la clave secreta | log |
| `invalida` | No coincide con la clave secreta (también un `v1` que no es hexa) | warn |
| `no-evaluable` | El header vino, pero mal armado: sin `ts`, sin `v1` o con otro formato | warn |
| `sin-header` | Vino sin `x-signature` | warn |
| `sin-secreto` | Falta `MP_WEBHOOK_SECRET` en el backend | warn |

**Qué no se loguea nunca:** la clave secreta, el `v1` de la firma, los valores de la query (salvo el tipo), el `ts`, el `x-request-id` ni ningún token.

**Qué mirar en staging para decidir el PR C** (exigir la firma): con `MP_WEBHOOK_SECRET` cargada y un pago real de prueba, qué combinaciones de `tipo=` y `firma=` aparecen. Mercado Pago manda más de una notificación por pago (`payment` y `merchant_order`) y puede no firmar todas: si alguna llega siempre `sin-header` o `invalida`, exigir la firma la rechazaría.

**Lo que no está confirmado:**
- **Las notificaciones IPN** (`?topic=…&id=…`, sin `data.id`) suelen venir sin `x-signature` (`sin-header`). Si alguna trae el header, no se puede validar: el manifest se arma con `data.id`, así que daría `invalida`. Sin confirmar con tráfico real.
- **Las notificaciones de pagos con QR** no vienen firmadas, según la documentación de Mercado Pago. MenYU no usa QR de Mercado Pago, pero queda anotado.
- **La unidad del `ts`** (segundos o milisegundos) no es la misma en todas las fuentes. Por eso, en modo observación no se aplica una tolerancia de tiempo.
