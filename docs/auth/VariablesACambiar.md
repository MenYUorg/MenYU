# Variables a cambiar: dominios propios (menyu-app.com)

Checklist para pasar las apps a `*.menyu-app.com` (Fase 0 de `docs/auth/specs/auth.md`, sección Dominios) sin dejar de servir los dominios viejos. Acá solo hay nombres de variables y URLs públicas, ningún secreto.

| App | Producción | Staging | Dominio viejo (sigue activo) |
|---|---|---|---|
| web-cliente | `mesa.menyu-app.com` | `mesa.staging.menyu-app.com` | `menyu-cliente.vercel.app` / `menyu-cliente-staging.vercel.app` |
| web-admin | `admin.menyu-app.com` | `admin.staging.menyu-app.com` | `menyu-admin.vercel.app` / `menyu-admin-staging.vercel.app` |
| web-staff | `staff.menyu-app.com` | `staff.staging.menyu-app.com` | `menyu-staff.vercel.app` / `menyu-staff-staging.vercel.app` |
| API | `api.menyu-app.com` | `api.staging.menyu-app.com` | `menyu-backend-production.up.railway.app` / `menyu-backend-staging.up.railway.app` |
| web-auth (Fase 3) | `auth.menyu-app.com` | `auth.staging.menyu-app.com` | — |

Estado al 2026-10-20: los 6 dominios de Vercel responden y apuntan a sus proyectos. `api.staging.menyu-app.com` y `api.menyu-app.com` responden (producción volvió con v1.0.6 después del incidente P3009, ver la spec). El `CORS_ORIGINS` de producción ya acepta los dominios nuevos y los viejos. El DNS está en Cloudflare, sin proxy: dejarlo así (con proxy, el certificado de Cloudflare no cubre los subdominios de dos niveles como `admin.staging.menyu-app.com`).

## Reglas

- **El servicio de producción de Railway no tiene que estar conectado a GitHub** (*Settings → Source*: desconectado desde el 2026-10-20). Si lo está, un cambio de variables construye y publica el último commit de `main`: así empezó el incidente del 2026-10-20. Desconectado, el cambio redespliega lo último que subió `deploy-production.yml`.
- **No borrar los dominios viejos** (`*.vercel.app`, `*.up.railway.app`): los QR impresos llevan a `menyu-cliente.vercel.app`, y las preferencias de Mercado Pago ya creadas notifican a la URL vieja de la API.
- **Las `VITE_*` se fijan en el build.** Cambiarlas en Vercel no alcanza: hay que volver a desplegar. Los proyectos `*-staging` se reconstruyen con cada merge a `main` (o con *Redeploy* en Vercel); los de producción, solo con un tag `vX.Y.Z`.
- **En Railway, cada cambio de variables redespliega el servicio**, y el contenedor corre `prisma migrate deploy` al arrancar. Juntar los cambios de cada paso y desplegar una sola vez.
- **Producción, con el código de dominios ya desplegado**: el próximo tag (`v1.0.7`), que incluye la rama `fix/dominios-propios`. v1.0.6 (el de la recuperación) no la incluye.

## Orden

**Staging:** 1. Mercado Pago (redirect URL de staging) → 2. Railway staging → 3. Vercel (proyectos `*-staging` y entorno Preview de los de producción) → 4. volver a desplegar → 5. probar.

**Producción:** 1. ~~Railway `CORS_ORIGINS`~~ (hecho el 2026-10-20) → 2. Mercado Pago (redirect URL de producción) → 3. Vercel, entorno Production → 4. tag `v1.0.7` → 5. Railway: `BASE_URL`, `FRONTEND_URL`, `FRONTEND_ADMIN_URL` y `QR_BASE_URL`, todas juntas → 6. GitHub `PROD_WEB_*_URL`.

`CORS_ORIGINS` va primero porque los frontends con `VITE_API_URL` nueva (paso 4) llaman a la API desde los dominios nuevos; el resto de las variables de Railway arma URLs hacia esos dominios y va después, en un solo cambio.

## 1. Mercado Pago

`BASE_URL` arma dos URLs a la vez: el `redirect_uri` del OAuth con el que cada restaurante conecta su cuenta (`<BASE_URL>/payments/mercadopago/oauth/callback`) y el webhook de cada pago (`notification_url`). Mercado Pago rechaza un `redirect_uri` que no esté registrado en la app, así que **la URL nueva se registra antes de cambiar `BASE_URL`**.

1. **¿Staging y producción usan la misma app?** En Railway, comparar `MP_CLIENT_ID` del servicio de staging con el de producción (sin copiarlo a ningún lado). Si es el mismo valor, es la misma app.
2. En el panel de Mercado Pago Developers → la app → URLs de redireccionamiento, **agregar** (sin borrar la actual):
   - Staging: `https://api.staging.menyu-app.com/api/payments/mercadopago/oauth/callback`
   - Producción: `https://api.menyu-app.com/api/payments/mercadopago/oauth/callback`
3. Si el panel acepta **una sola** URL y la app es la misma para los dos ambientes, solo uno de los dos puede conectar cuentas a la vez (ya pasa hoy). En ese caso, registrar la de producción y cambiar el `BASE_URL` de producción en el mismo momento.
4. El webhook no se configura en el panel (va en cada preferencia). Si además hay una URL cargada en la sección de Webhooks del panel, actualizarla igual.

**Verificar:** en `admin.staging.menyu-app.com` → Configuración → Pagos → conectar Mercado Pago: tiene que volver a `admin.staging.menyu-app.com/configuracion/pagos?mp=conectado`.

## 2. Railway: servicio del backend

| Variable | Staging | Producción | Notas |
|---|---|---|---|
| `CORS_ORIGINS` | `https://menyu-cliente-staging.vercel.app,https://menyu-admin-staging.vercel.app,https://menyu-staff-staging.vercel.app,https://mesa.staging.menyu-app.com,https://admin.staging.menyu-app.com,https://staff.staging.menyu-app.com` | `https://menyu-cliente.vercel.app,https://menyu-admin.vercel.app,https://menyu-staff.vercel.app,https://mesa.menyu-app.com,https://admin.menyu-app.com,https://staff.menyu-app.com` | Valor actual: ver en el panel. En staging ya acepta los dominios nuevos (comprobado el 2026-10-20): confirmar que estén los 6. Sin barra final. En la Fase 3 se suma `https://auth.staging.menyu-app.com` (staging) y `https://auth.menyu-app.com` (producción): sin eso, web-auth no puede llamar a `/auth/me`. Cambiar una variable redespliega el servicio y corre las migraciones: en producción, hacerlo junto con el release que lleve web-auth |
| `CORS_ORIGIN_PATTERNS` | sin cambios | sin cambios | Cubre los previews de Vercel (`men-yu-s-projects.vercel.app`) |
| `BASE_URL` | `https://api.staging.menyu-app.com/api` | `https://api.menyu-app.com/api` | **Después** de registrar la redirect URL en Mercado Pago (sección 1) |
| `FRONTEND_URL` | `https://mesa.staging.menyu-app.com` | `https://mesa.menyu-app.com` | Respaldo de las `back_urls` del pago cuando no llega un `Origin` válido |
| `FRONTEND_ADMIN_URL` | `https://admin.staging.menyu-app.com` | `https://admin.menyu-app.com` | A dónde vuelve el panel después de conectar Mercado Pago. Tiene un solo valor: quien conecte desde `menyu-admin.vercel.app` vuelve a `admin.menyu-app.com`, donde no tiene sesión (los tokens viven en el localStorage de cada dominio) y pasa por el login sin ver el aviso de conectado. La conexión sí queda guardada |
| `QR_BASE_URL` | `https://mesa.staging.menyu-app.com` | `https://mesa.menyu-app.com` | En producción hoy no está definida y vale `https://menyu-cliente.vercel.app`. Sin barra final y nunca vacía. Solo cambia los QR que se descarguen de ahí en más |

Las demás variables (`DATABASE_URL`, `SUPABASE_*`, `MP_*`, `JWT_SECRET`) no dependen del dominio. La Fase 2 tampoco suma ninguna: el JWKS sale de `SUPABASE_URL`.

**Verificar:**
```bash
curl -s https://api.staging.menyu-app.com/health
curl -s -o /dev/null -D - -H "Origin: https://mesa.staging.menyu-app.com" https://api.staging.menyu-app.com/api/discovery | grep -i access-control-allow-origin
```
Y descargar el QR de una mesa en web-admin: el link tiene que empezar con `QR_BASE_URL`.

## 3. Vercel

### Proyectos de producción: `menyu-cliente`, `menyu-admin`, `menyu-staff`

El entorno **Preview** de estos proyectos es el que usan los previews que `deploy-staging.yml` despliega en cada merge a `main`, y el smoke de staging lee de ahí la `VITE_API_URL` de `menyu-cliente`. Mismos valores en los tres proyectos.

| Variable       | Entorno    | Valor actual                                                                         | Valor nuevo                             | Cuándo             |
| -------------- | ---------- | ------------------------------------------------------------------------------------ | --------------------------------------- | ------------------ |
| `VITE_API_URL` | Preview    | ver en el panel                                                                      | `https://api.staging.menyu-app.com/api` | Con staging        |
| `VITE_WS_URL`  | Preview    | ver en el panel                                                                      | `https://api.staging.menyu-app.com`     | Con staging        |
| `VITE_API_URL` | Production | `https://menyu-backend-production.up.railway.app/api` (visto en el bundle publicado) | `https://api.menyu-app.com/api`         | Producción, paso 3 |
| `VITE_WS_URL`  | Production | ver en el panel                                                                      | `https://api.menyu-app.com`             | Producción, paso 3 |

### Proyectos de staging: `menyu-cliente-staging`, `menyu-admin-staging`, `menyu-staff-staging`

Su entorno **Production** es staging. Mismos valores en los tres.

| Variable | Valor actual | Valor nuevo |
|---|---|---|
| `VITE_API_URL` | `https://menyu-backend-staging.up.railway.app/api` (visto en el bundle publicado) | `https://api.staging.menyu-app.com/api` |
| `VITE_WS_URL` | ver en el panel | `https://api.staging.menyu-app.com` |

`VITE_WS_URL` es opcional desde que el socket se deduce bien de `VITE_API_URL` (`urlDelSocket`, en `@menyu/ui/socket`), pero definirla deja explícito a dónde se conecta.

**Verificar:** en la pestaña Network del navegador, en `mesa.staging.menyu-app.com`, las llamadas van a `api.staging.menyu-app.com/api/...` y el websocket a `wss://api.staging.menyu-app.com/ws`.

### Fase 3: `menyu-auth` y `menyu-auth-staging` (todavía no existen)

**Antes del primer deploy (staging con el merge, producción con el tag):**

1. **Data API de Supabase cerrada en ese proyecto** (hecho en los dos el 2026-10-20). web-auth lleva la publishable key en un bundle público. Si la Data API (PostgREST) está activa sin RLS, cualquiera puede leer con esa key `admin`, `mozo`, `cliente` (con los `password_hash`) y `restaurante` (con los tokens de Mercado Pago). En *Project Settings → Data API*, desactivarla, o habilitar RLS en todas las tablas de `public`. Verificar con `curl "$SUPABASE_URL/rest/v1/admin?select=id&limit=1" -H "apikey: <publishable key>"` (también `restaurante` y `usuario`): no puede devolver filas. Con la Data API cerrada, staging responde 503 `PGRST002` en todas las tablas, sin filas.
2. Los proyectos de Vercel, sus dominios, el secret `VERCEL_PROJECT_ID_AUTH` y la variable `PROD_WEB_AUTH_URL` (sección 4). Sin el secret, `deploy-staging.yml` y `deploy-production.yml` cortan al empezar.
3. Las plantillas de mail (abajo) y `CORS_ORIGINS` en Railway (sección 2).

| Variable | Staging | Producción |
|---|---|---|
| `VITE_API_URL` | `https://api.staging.menyu-app.com/api` | `https://api.menyu-app.com/api` |
| `VITE_SUPABASE_URL` | la del Supabase de staging | la del Supabase de producción |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | la de staging | la de producción |
| `VITE_AUTH_COOKIE_DOMAIN` | `.staging.menyu-app.com` | `.menyu-app.com` |

Dominios: `auth.staging.menyu-app.com` en `menyu-auth-staging` y `auth.menyu-app.com` en `menyu-auth`, con su registro en Cloudflare.

`VITE_AUTH_COOKIE_DOMAIN` todavía no se lee: la cookie compartida llega en la Fase 4. El entorno Preview de `menyu-auth` (el deploy que prueba el smoke de staging) puede quedar sin las de Supabase: el smoke solo pide la página.

#### Plantillas de mail de Supabase (staging y producción)

Los links de invitación y de "olvidé mi contraseña" llevan a web-auth con un `token_hash`, que la app canjea con `verifyOtp` recién cuando la persona guarda la contraseña. Así funcionan con el flujo PKCE (el que usa `@supabase/ssr` desde la Fase 4), desde cualquier navegador, y un escáner de mail que abra el link no lo gasta. La invitación no manda `redirectTo`: el link sale de la Site URL (`auth.<ambiente>`). Las rutas `/invitacion` y `/restablecer-contrasena` están en `apps/web-auth/src/App.tsx`: si cambian, cambiar también las plantillas.

En *Authentication → Emails → Templates* de cada proyecto, pegar como cuerpo (*Message body*) el HTML de `docs/auth/plantillas-mail/`:

| Plantilla | Asunto | Cuerpo |
|---|---|---|
| **Invite user** | `Te invitaron a MenYU` | `docs/auth/plantillas-mail/invite-user.html` |
| **Reset password** | `Creá una contraseña nueva para MenYU` | `docs/auth/plantillas-mail/reset-password.html` |

**Verificar:** invitar a un mail propio (`POST /auth/invitaciones`) y que el link del mail abra `https://auth.<ambiente>/invitacion?token_hash=...` y pida la contraseña.

### Fase 4: web-admin, web-staff y web-cliente

| Variable | Staging (`*-staging`) | Producción (entorno Production) |
|---|---|---|
| `VITE_SUPABASE_URL` | la del Supabase de staging | la del Supabase de producción |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | la de staging | la de producción |
| `VITE_AUTH_COOKIE_DOMAIN` | `.staging.menyu-app.com` | `.menyu-app.com` |
| `VITE_AUTH_URL` | `https://auth.staging.menyu-app.com` | `https://auth.menyu-app.com` |

El entorno Preview de los proyectos de producción corre en `*.vercel.app`, donde no se puede poner la cookie de `.staging.menyu-app.com`: se define en la Fase 4.

## 4. GitHub (Settings → Secrets and variables → Actions)

| Tipo | Nombre | Valor actual | Valor nuevo | Cuándo |
|---|---|---|---|---|
| Variable | `PROD_WEB_CLIENTE_URL` | `https://menyu-cliente.vercel.app` | `https://mesa.menyu-app.com` | Producción, paso 6: el smoke pasa a probar el dominio nuevo |
| Variable | `PROD_WEB_ADMIN_URL` | `https://menyu-admin.vercel.app` | `https://admin.menyu-app.com` | Ídem |
| Variable | `PROD_WEB_STAFF_URL` | `https://menyu-staff.vercel.app` | `https://staff.menyu-app.com` | Ídem |
| Variable | `PROD_WEB_AUTH_URL` | — | `https://auth.menyu-app.com` | Fase 3 |
| Secret | `VERCEL_PROJECT_ID_AUTH` | — | el ID del proyecto `menyu-auth` | Fase 3 |

Los secrets de Railway y Vercel que ya existen no cambian: los dominios no cambian ni los servicios ni los proyectos.

## 5. Desarrollo local (`*.menyu.local`)

- Archivo hosts: `127.0.0.1 auth.menyu.local admin.menyu.local staff.menyu.local mesa.menyu.local api.menyu.local`.
- `.env` del backend: sumar a `CORS_ORIGIN_PATTERNS` (separado por coma de los que ya tenga) el patrón `^http://(auth|admin|staff|mesa)\.menyu\.local(:[0-9]+)?$`.
- Los `vite.config.ts` ya aceptan `*.menyu.local`. Cada app sigue en su puerto: `http://auth.menyu.local:5173`, `http://admin.menyu.local:5174`, `http://staff.menyu.local:5175`, `http://mesa.menyu.local:5176`.
- web-auth: copiar `apps/web-auth/.env.example` a `apps/web-auth/.env.local` (git lo ignora) con la URL y la publishable key del Supabase de staging. El servidor de Vite reenvía `/api` a `BACKEND_URL` (por defecto `http://localhost:3000`). Para iniciar sesión con los usuarios de staging, `/auth/me` tiene que encontrarlos en la base de staging: `BACKEND_URL=https://api.staging.menyu-app.com pnpm --filter @menyu/web-auth dev`. Como la llamada sale del servidor de Vite, no hace falta tocar el CORS de staging.
- Sin archivo hosts, Chrome resuelve los `*.menyu.local` si se abre con `--host-resolver-rules="MAP *.menyu.local 127.0.0.1"` (así se abre en las pruebas con playwright-cli). Con este mapeo Vite tiene que escuchar en IPv4: `--host 127.0.0.1`.
