# Integración Supabase — MenYu

Supabase es la segunda integración externa de MenYU, junto con Mercado Pago (`MercadoPago.md`). Este documento cubre lo que pide SCRUM-44: qué se usa, entornos, credenciales por entorno, cómo se prueba y qué pasa si Supabase está caído. No repite lo que ya está en otros documentos: los cita.

## Índice

1. [Qué se usa](#qué-se-usa)
2. [Entornos](#entornos)
3. [Credenciales por entorno](#credenciales-por-entorno)
4. [Cómo se prueba](#cómo-se-prueba)
5. [Si Supabase está caído](#si-supabase-está-caído)
6. [Qué se verificó y qué no](#qué-se-verificó-y-qué-no)

---

## Qué se usa

| Servicio | Para qué | Dónde |
|---|---|---|
| **Base de datos (Postgres)** | Toda la persistencia del backend, vía Prisma | `apps/backend/prisma/schema.prisma:5-9` (`DATABASE_URL` y `DIRECT_URL`); `apps/backend/src/prisma/prisma.service.ts:9-14` (pool de `pg` con el adapter `PrismaPg`, SSL solo con `NODE_ENV=production`) |
| **Auth** | Login del personal y cuenta opcional del cliente (web-auth) | Ver abajo |
| **Storage** | Logos de marcas y restaurantes, e imágenes de los platos | `apps/backend/src/storage/storage.service.ts` |
| **Realtime** | **No se usa** | Ver abajo |

**Base de datos**
- Las migraciones se aplican al arrancar el contenedor (`apps/backend/Dockerfile:70`: `prisma migrate deploy && node dist/main`).
- La Data API de Supabase (PostgREST) está cerrada en los dos proyectos desde el 20/10/2026: el backend no la usa (`docs/auth/VariablesACambiar.md:94`, `docs/auth/specs/auth.md:104`).

**Auth**
- **Backend:** verifica el token de Supabase **localmente**, con el JWKS del proyecto (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`). `jose` lo descarga en el primer uso y lo cachea (`apps/backend/src/auth/supabase/verificador-token.service.ts:32-38`). No hay una llamada a Supabase por cada request. Acepta solo ES256 y RS256, con issuer y audience (`:53-63`). Lo usan `SupabaseAuthGuard` (`apps/backend/src/auth/guards/supabase-auth.guard.ts`) y la cuenta de cliente (`apps/backend/src/auth/supabase/cuenta-de-cliente.service.ts`).
- **Admin API:** las invitaciones del personal usan la service role key (`apps/backend/src/auth/supabase/supabase-admin.service.ts:12-21`).
- **Frontends:** `packages/auth-client` arma el cliente de Supabase con la sesión en una cookie de dominio compartido. Lee `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` y falla si no están (`packages/auth-client/src/config.ts:4-11`).
- **web-cliente:** sin esas variables, o fuera del dominio de la cookie, anda igual, sin cuentas: el QR y el PIN entran como invitado (`apps/web-cliente/src/utils/cuenta.ts:91-96`).
- **Configuración de los dos proyectos** (Site URL, Redirect URLs, JWT Signing Keys, SMTP, Google): `docs/auth/specs/auth.md:100-106`.

**Storage**
- **Cliente:** el backend crea un cliente con la service role key (`storage.service.ts:8-16`). Sube con `upsert` (`:18-27`) y borra (`:29-32`).
- **Buckets:**
  - `logos`, o el de `SUPABASE_LOGOS_BUCKET` si está definido (`apps/backend/src/storage/logos.service.ts:6`, `:13-15`), con los logos en `marcas/<id>` y `restaurantes/<id>`;
  - `menu-items`, para las imágenes de los platos (`apps/backend/src/items/items.service.ts:20`, `:104`).

**Realtime: no se usa**
- El tiempo real de MenYU es Socket.io: `apps/backend/src/gateway/menyu.gateway.ts:12-15`, namespace `/ws`.
- En `apps/` y `packages/` no hay ningún `.channel(`, `postgres_changes` ni `RealtimeChannel`.
- `@supabase/realtime-js` está solo como dependencia transitiva de `@supabase/supabase-js` (`pnpm-lock.yaml:1783`).
- **Consecuencia que sí importa:** desde 2.117, `createClient` arma un `RealtimeClient` aunque no se use, y exige el WebSocket nativo. Con el backend en Node 20, invitar personal y subir un logo respondían 500. Es el defecto #428, corregido con Node 22 (`docs/calidad/bitacora.md:829-837`; test de regresión `apps/backend/src/auth/supabase/cliente-de-supabase.spec.ts`).

---

## Entornos

| Entorno | Base de datos | Auth y Storage | Fuente |
|---|---|---|---|
| **Local** | Postgres 17.6 en Docker, `localhost:5433` (`apps/backend/docker-compose.yml`), no Supabase | Los del proyecto de **staging**: no hay Supabase local | `apps/backend/README.md:5-20`; `apps/backend/.env.example:35-36`; `docs/auth/VariablesACambiar.md:171` |
| **CI** | Postgres 17.6 efímero, como service container (job `e2e-backend`, `.github/workflows/ci.yml:127-186`) | Ninguno: el CI no tiene secretos de Supabase y los tests lo simulan | `ci.yml:151-155`; `docs/calidad/plan-de-pruebas.md:23-24` |
| **Staging** | Proyecto de Supabase de staging (la README del backend lo llama "QA") | El mismo proyecto | `Documentacion/WORKFLOW.md:110-114` |
| **Producción** | Proyecto de Supabase de producción, aparte | El mismo proyecto | `Documentacion/WORKFLOW.md:110-116` ("Nunca se comparten datos entre staging y producción") |

**Notas sobre los entornos**
- **Integración local:** para correr los e2e del backend en local como en el CI (Postgres descartable en Docker, en el puerto 5434), el PR #444 suma `pnpm test:integracion` (`apps/backend/scripts/e2e-local.mjs`). **A la fecha de este documento el #444 no está mergeado.**
- **Logos desde local:** suben al Storage del proyecto al que apunte `SUPABASE_URL`, que tiene que ser el de staging. Con el bucket por defecto pisan los logos de staging; por eso existe `SUPABASE_LOGOS_BUCKET` (`apps/backend/README.md:121-139`).
- **Preview de Vercel:** el entorno Preview de los proyectos de producción usa los valores del Supabase de **staging** (`docs/auth/VariablesACambiar.md:144`).
- **Versión de Postgres:** el Supabase de staging es Postgres 17 (consulta de solo lectura, `docs/calidad/bitacora.md:664`). La de producción no está registrada. `Documentacion/Doc_DB.md:4` dice "PostgreSQL 15": está desactualizado.

---

## Credenciales por entorno

Los valores no están en el repo:
- los del backend, en el panel de Railway;
- los de los frontends, en el panel de Vercel (`Documentacion/WORKFLOW.md:116`);
- los del E2E, en GitHub.

`deploy-staging.yml` y `deploy-production.yml` no tienen secretos de Supabase ni de la base.

| Variable | Dónde se usa | Qué cambia entre entornos | Plantilla |
|---|---|---|---|
| `DATABASE_URL` | Backend (Prisma, conexión con pooler) | Local: Postgres de Docker. Staging y producción: el de cada proyecto | `apps/backend/.env.example:5-6` |
| `DIRECT_URL` | Backend (`prisma migrate`, sin pooler) | Igual que `DATABASE_URL` | `apps/backend/.env.example:8-9` |
| `SUPABASE_URL` | Backend (JWKS y Storage) | Local y staging: la de staging. Producción: la de producción | `apps/backend/.env.example:33-37` |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend (Storage y Admin API). **Nunca en un frontend** | La de cada proyecto | `apps/backend/.env.example:39-41` |
| `SUPABASE_LOGOS_BUCKET` | Backend, opcional | Solo para un bucket de desarrollo en local | `apps/backend/.env.example:43-45` |
| `NODE_ENV` | Backend: con `production`, la conexión a la base va con SSL | | `apps/backend/.env.example:19` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | web-auth, web-admin, web-staff, web-cliente | La de staging o la de producción, por proyecto de Vercel | `.env.example` de cada app (`apps/web-admin/.env.example:9-10`, `apps/web-staff/.env.example:10-11`, `apps/web-auth/.env.example:8-9`, `apps/web-cliente/.env.example:15-16`) |
| `VITE_AUTH_COOKIE_DOMAIN` | Los cuatro frontends | `.menyu.local`, `.staging.menyu-app.com` o `.menyu-app.com` | Los mismos `.env.example`; tabla en `docs/auth/VariablesACambiar.md:98-104` y `:130-146` |
| `E2E_STAGING_DB_URL_LECTURA`, `E2E_SUPABASE_URL`, `E2E_SUPABASE_PUBLISHABLE_KEY` y el resto de `E2E_*` | Solo el E2E contra staging | Solo existen para staging | `docs/calidad/e2e-supabase.md:116-140` |

El `.env.example` de la raíz tiene `DATABASE_URL`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (`.env.example:2`, `:8-9`), pero no `DIRECT_URL`. La plantilla completa del backend es `apps/backend/.env.example`.

---

## Cómo se prueba

| Nivel | Qué prueba de Supabase | Dónde | Cómo se corre |
|---|---|---|---|
| Unitarias | Supabase simulado: el guard (401 por vencido, 401 por otro proyecto, 403), la cuenta de cliente, `auth-client` y web-auth | `apps/backend/src/auth/supabase/supabase-auth.spec.ts` (con un JWKS local); `cuenta-de-cliente.service.spec.ts`; `apps/web-auth/src/test/supabaseSimulado.ts`; `packages/auth-client/src/*.spec.ts` | `ci.yml:45`, en cada PR |
| Regresión del #428 | Que `createClient` se pueda construir en la versión de Node del contenedor, con la librería real y sin red | `apps/backend/src/auth/supabase/cliente-de-supabase.spec.ts` | Con las unitarias |
| Integración | Migraciones desde cero, drift contra `schema.prisma` y los e2e del backend contra un Postgres de verdad (no Supabase) | `ci.yml:127-186`; `apps/backend/jest.e2e.config.js` (se niega a correr contra un host que no sea local, `:27-38`) | En cada PR (job `e2e-backend`). En local: `pnpm test:integracion` (PR #444, sin mergear) |
| Sistema (E2E) | El flujo del comensal y del mozo contra el Supabase de **staging**, con un usuario de base propio y verificación en la base | **`docs/calidad/e2e-supabase.md`**: diseño, guardas contra producción, categorías y secretos | En cada deploy a staging (job `e2e-staging` de `deploy-staging.yml`) |
| Base caída | `/health` con la base caída | `apps/backend/src/health/health-endpoint.spec.ts:8-38` (SCRUM-16) | Con las unitarias |

---

## Si Supabase está caído

**Si la base no responde**
- **`/health`:** responde **200** con `status: "degraded"` y `db: "error"`. No responde 503, para no hacer fallar el healthcheck del deploy (`apps/backend/src/health/health.controller.ts:8-9`). La base se da por caída si `SELECT 1` no responde en 2 s (`health.service.ts:7`, `:47-60`). Lo cubre el test `health-endpoint.spec.ts:28-38`.
- **El smoke de staging falla** si `db` no es `ok` (`scripts/smoke/lib.mjs:104-109`).
- **El resto de la API:** no hay un filtro global para los errores de conexión de Prisma. En `apps/backend/src` no hay ningún `@Catch(` ni `useGlobalFilters`, así que se responde el 500 por defecto de Nest. **Esto no está probado.**
- **Al arrancar:** el backend se conecta (`prisma.service.ts:17-19`) y antes corre `prisma migrate deploy` (`Dockerfile:70`). Si falla, Railway reintenta hasta 10 veces (`railway.toml:6-7`). No se probó con la base caída.

**Si no se puede bajar el JWKS (Auth caído)**
- **Rutas del personal:** responden **503** "No se pudo verificar el token" (`apps/backend/src/auth/guards/supabase-auth.guard.ts:70-72`). Está documentado en `doc.md:234`. **Este camino del guard no tiene test:** ningún spec busca el 503 ni `ServiceUnavailableException`.
- **Cuenta de cliente:** si no se puede verificar el token, se deja un warning y la mesa se abre como invitado (`cuenta-de-cliente.service.ts:50-59`). Esto sí tiene test: `cuenta-de-cliente.service.spec.ts:283-291`.
- **Cache del JWKS:** como `jose` lo cachea (`verificador-token.service.ts:32`), un backend que ya lo había bajado podría seguir verificando tokens con Auth caído. **Se deduce del comentario y no está probado.**
- **Sin `SUPABASE_URL`:** 500 "La autenticación no está configurada" (`supabase-auth.guard.ts:66-68`).
- **Invitaciones:** si Supabase rechaza o falla, 502 (`apps/backend/src/auth/invitaciones/invitaciones.service.ts:233-235`; `doc.md:266`).
- **Frontends:**
  - si no hay red o Supabase no responde al revalidar, la sesión no se cierra (`packages/auth-client/src/revalidacion.ts:67-69`);
  - web-auth muestra "No pudimos conectarnos…" (`apps/web-auth/src/lib/mensajes.ts:30`, `:38-41`).

**Si Storage falla**
- **Subir o borrar:** responde **500** "Error al subir imagen…" o "Error al eliminar imagen…", sin reintento (`storage.service.ts:23`, `:31`).
- **La base no queda a medias:**
  - el logo de una marca o un restaurante se guarda en la base solo después de una subida exitosa (`apps/backend/src/marca/marca.service.ts:111-116`, `apps/backend/src/restaurante/restaurante.service.ts:73`);
  - lo mismo la imagen de un plato (`items.service.ts:104-106`);
  - al borrar, si Storage falla, la base sigue apuntando a la imagen (`marca.service.ts:126-127`, `items.service.ts:116-118`).
- **Tests:** `apps/backend/src/storage/logos.service.spec.ts:91-95` prueba que el error de Storage se propague. No hay test del 500 por HTTP.
- **Antecedente:** el defecto #428 se vio justamente como un 500 al subir un logo y al invitar personal (`docs/calidad/bitacora.md:829-837`).

**Pérdida de datos**
- Prisma no tiene migraciones "down". Restaurar un backup de Supabase **no se puede hoy:** el plan Free no incluye backups (`docs/calidad/plan-rollback.md:33-40`).

**Lo que no hay**
- No hay conciliación ni cola de reintentos para ninguna operación contra Supabase.
- No hay un modo de solo lectura.
- No hay alertas: el único aviso es el smoke después de cada deploy.
- El escenario de la base caída en las pruebas de resiliencia está en el informe de calidad, fuera del repo (`docs/calidad/plan-de-pruebas.md:80`). No se re-verificó para este documento.

---

## Qué se verificó y qué no

> **Aviso (26/10/2026):**
> - **Verificado hoy contra el código de `main` (`601aac7`):**
>   - las secciones "Qué se usa" y "Si Supabase está caído";
>   - los nombres de las variables y sus líneas en los `.env.example`;
>   - las rutas y las líneas de los tests citados;
>   - que no hay test del 503 del guard, ni filtro global.
> - **Tomado de los documentos existentes, sin re-verificar:**
>   - la configuración de los proyectos en los paneles de Supabase, Vercel y Railway (`docs/auth/specs/auth.md`, `docs/auth/VariablesACambiar.md`, `Documentacion/WORKFLOW.md`);
>   - la Data API cerrada;
>   - el plan Free sin backups (`plan-rollback.md`, dato del 22/10);
>   - la versión 17 del Postgres de staging (`bitacora.md`, consulta del 21/10).
> - **No se probó en vivo** ningún escenario de caída contra Supabase.
