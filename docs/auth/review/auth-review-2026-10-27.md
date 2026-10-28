# Revisión integral de la implementación de `docs/auth/specs/auth.md`

> Fecha: 2026-10-27 · Rama `main`, HEAD `63c512e` · Sesión de **solo revisión**: no se modificó código.
> Método: checklist extraído de la spec (Fases 0 a 5 + requisitos implícitos), verificado por cinco revisiones
> paralelas de solo lectura (backend, web-auth + `@menyu/auth-client`, las tres apps de consumo, infra/CI/env/docs,
> y ejecución real de las suites), más un pase transversal propio. Regla aplicada: **evidencia o nada** —
> ningún requisito se marcó HECHO por inferencia ni por el nombre de un archivo.

---

## 1. Resumen ejecutivo

La implementación de auth **está completa y es sólida**: los ~140 requisitos verificables de la spec están
implementados con evidencia en código, el monorepo está en verde (typecheck 10/10, lint 9/9, build en frío 6/6,
**4050 tests** pasando, 0 `.only`), y no encontré ningún agujero de seguridad en el diseño implementado —
la verificación del token, la allowlist del `redirect` y la separación de los dos sistemas de autenticación
resisten las pruebas de bypass que hicimos sobre el código.

Lo que **impide dar auth por cerrado** no es el código, son tres cosas: **(1)** la Fase 5 está en `main` y en
staging pero **no en producción** — el tag v1.3.0 apunta a `6ce5680`, que no contiene su migración destructiva,
que sigue pendiente y exige un respaldo previo; **(2)** el quality gate de SonarCloud sobre el código nuevo de
la fase, el único punto que queda abierto de los que la spec dejaba "sin verificar"; **(3)** documentación que
describe el login borrado **en presente**, incluido `doc.md`, la API Reference de la raíz del repo público.

La **verificación funcional en staging del 2026-10-27** (§3.7) cerró el resto: el criterio 4 del "Terminado
cuando" de la Fase 5 está cumplido, el SSO de la Fase 4 sigue en pie sobre el backend ya limpio, y el punto de
mayor riesgo —la carga diferida de supabase-js en web-cliente, que la revisión de la Fase 5 encontró roto dos
veces— funciona en el deploy real.

Coherente con eso, la Fase 5 es la única cuyo encabezado en la spec **no tiene ✅**, mientras `CLAUDE.md` ya
la describe como hecha. Ninguno de los tres puntos requiere escribir código nuevo.

---

## 2. Estado por fase

Leyenda: **HECHO** · **PARCIAL** · **FALTA** · **N/V** (no verificable desde el código) · **SUPERADO**
(una fase posterior lo cambió a propósito: el requisito ya no describe el código).

### Fase 0 — Configuración externa

Toda la fase vive en paneles externos. Ver el §5 (checklist para el equipo). La spec la declara hecha el
2026-10-20 y la evidencia indirecta la respalda: el login con contraseña, Google, las invitaciones por mail y
los logos funcionan en staging y en producción, lo que exige el JWKS asimétrico, el SMTP, el provider de
Google y las redirect URLs activas.

| ID | Requisito | Estado |
|---|---|---|
| F0-01 … F0-10 | DNS y dominios, variables de plataforma, Site URL, redirect URLs, registro público con confirmación, JWT Signing Keys asimétricas, Data API cerrada, SMTP de Resend, cliente OAuth de Google, archivo hosts | **N/V** |

### Fase 1 — Modelo de datos

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| F1-01 | Enum `Rol` con los 5 valores | HECHO | `prisma/schema.prisma:528-536`; migración `20261020013358…:2` |
| F1-02 | `Usuario` (supabaseUserId único, email único, nombre, activo, esRoot) | HECHO | `schema.prisma:540-554`; migración `:11-21,36,39` |
| F1-03 | `Membresia` + CHECK `membresia_ambito_check` | HECHO | `schema.prisma:559-576`; migración `:74-77` |
| F1-04 | Unicidad (usuario, restaurante) y (usuario, marca) | HECHO | `schema.prisma:571-572`; migración `:48,51` |
| F1-05 | `Mozo.usuarioId` opcional, único con el restaurante | HECHO | `schema.prisma:101,111`; migración `:8,57,60` |
| F1-06 | `Cliente.supabaseUserId` opcional y único | HECHO | `schema.prisma:158`; migración `:5,54` |
| F1-07 | RLS habilitada sin políticas en `usuario` y `membresia` | HECHO | migración `:82-83`; sin ningún `CREATE POLICY` en `prisma/` |
| F1-08 | Seed con un OWNER con membresía en la marca del restaurante de prueba | HECHO | `prisma/seed.ts:319-333`, `:50-51` |

### Fase 2 — Backend (NestJS)

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| F2-01 | `SupabaseAuthGuard` con `jose` + JWKS, issuer, audience, resuelve por `supabaseUserId` | HECHO | `verificador-token.service.ts:37,58-61`; `supabase-auth.guard.ts:51-53` |
| F2-02 | Inexistente→403, inactivo→403, inválido/vencido→401 | HECHO | `supabase-auth.guard.ts:44,54,65,74` (extra: 503 si no baja el JWKS, `:71`) |
| F2-03 | `@RequiereRol` + `MembresiaGuard`; OWNER de marca cubre sucursales | HECHO | `requiere-rol.decorator.ts:16,22-31`; `membresia.guard.ts:36-55`; `acceso.service.ts:54-58` |
| F2-04 | `@UsuarioActual()` lee `request.usuario` | HECHO | `usuario-actual.decorator.ts:5-9` |
| F2-05 | `GET /auth/me` con usuario + membresías | HECHO | `auth.controller.ts:13-22`; `acceso.service.ts:157-187` |
| F2-06 | `POST /auth/invitaciones` crea `Usuario` + `Membresia` vía Admin API | HECHO | `invitaciones.controller.ts:17-34`; `invitaciones.service.ts:76-83,188-194` |
| F2-07 | Matriz de quién invita a quién | HECHO | `puede-invitar.ts:3-19` |
| F2-08 | Cuenta confirmada → no reinvita (`invitacionEnviada:false`) | HECHO | `invitaciones.service.ts:171,175` |
| F2-09 | Cuenta sin confirmar → se borra y se reinvita | HECHO | `invitaciones.service.ts:177-185` |
| F2-10 | MOZO y JEFE_SALON: crea o vincula el `Mozo` | HECHO | `invitaciones.service.ts:190-192,200-219` |
| F2-11 | Email en minúscula; vínculo del `Mozo` sin distinguir mayúsculas | HECHO | `crear-invitacion.dto.ts:9`; `invitaciones.service.ts:79,209` |
| F2-12 | `Mozo.passwordHash` opcional por migración | SUPERADO | migración `20261020100931_mozo_password_opcional`; la Fase 5 borró la columna |
| F2-13 | CORS con los subdominios propios | N/V | configuración de Railway (§5); `.env.example:96-99` ya los lista |
| F2-14 | Swagger con esquema Bearer | HECHO | `main.ts:25-28` (único esquema, `'supabase'`) |
| F2-15 | Tests: válido, vencido, otro proyecto, sin membresía, rol incorrecto + tabla de la matriz | HECHO | `supabase-auth.spec.ts:101,120,132,149-152,163`; `puede-invitar.spec.ts:48-56` |

### Fase 3 — web-auth (email + contraseña)

| ID | Requisito | Estado | Evidencia | Veredicto / nota |
|---|---|---|---|---|
| F3-01 | Las 6 pantallas | HECHO | `App.tsx:21,24,25,26,28,29` | +4 posteriores (`/crear-cuenta`, `/confirmar-email`, `/google`, `/privacidad`) |
| F3-02 | Post-login llama a `/auth/me` y decide | HECHO | `usePostLogin.ts:34,40-41,60-64`; `perfil.ts:14` | |
| F3-03 | Destinos por rol | HECHO | `destinos.ts:49-55,93` | |
| F3-04 | Selector + `?marcaId=`/`?restauranteId=` | HECHO | `destinos.ts:80,84,102-106,122-124`; `ElegirPage.tsx:58` | |
| F3-05 | `verifyOtp` recién al guardar la contraseña | HECHO | `DefinirContrasenaPage.tsx:42,54-56,68-72,81` | |
| F3-06 | Allowlist del `redirect` | HECHO | `redirect.ts:24-33` | Análisis de bypass en §3.3 |
| F3-07 | 403 → "sin acceso" **y cerrar sesión** | **SUPERADO** | `usePostLogin.ts:42-48`; `SinAccesoPage.tsx:47-67` | La 4b decidió **dejar la sesión abierta** para ofrecer "Ir a MenYU", y lo testea (`otrasPantallas.spec.tsx`, "sin cerrar la sesión"). El texto de la Fase 3 quedó viejo, no es un olvido |
| F3-08 | Tokens de marca en `@menyu/ui/tailwind-preset` | HECHO | `packages/ui/tailwind-preset.cjs:9-29`; `web-auth/tailwind.config.js:1,5` | |
| F3-09 | UI con la skill `frontend-design` | N/V | — | No es observable en el resultado |
| F3-10 | `vercel.json` igual al de las otras apps | HECHO | los 4 `vercel.json` son **byte-idénticos** (md5 `d1189b77…`) | |
| F3-11 | `ignorar-build.sh` con `menyu-auth-staging-*` | HECHO | `scripts/vercel/ignorar-build.sh:21` (los 4 proyectos) | |
| F3-12 | `--filter` + paso "Deploy web-auth" + `VERCEL_PROJECT_ID_AUTH` | HECHO | `deploy-staging.yml:60,127-140,39-42`; `deploy-production.yml:114,178-190,51-54` | Staging corta antes del checkout si falta el secret |
| F3-13 | `PROD_WEB_AUTH_URL` en el smoke (4 frontends) | HECHO | `deploy-production.yml:43,48,212,217`; `smoke.mjs:19`; `lib.mjs:99,118` | `verificar-urls.mjs` acepta N frontends |
| F3-14 | `@menyu/web-auth` en CI y Sonar | HECHO | `ci.yml:39,42,45,51,89-96,125`; `sonar-project.properties:8,11,23` | |
| F3-15 | CORS con los dos `auth.*` | N/V | `.env.example:96-99` los lista; el valor real está en Railway (§5) | |
| F3-16 | Plantillas "Invite user" y "Reset password" con `token_hash` | HECHO (fuente) / N/V (cargadas) | `docs/auth/plantillas-mail/invite-user.html:16,21`; `reset-password.html:16,21` | Las rutas que nombran existen en `App.tsx:25,26` |
| F3-17 | Proyectos Vercel `menyu-auth` y `menyu-auth-staging` | N/V | §5 | |

### Fase 3b — Login con Google

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| F3b-01 | Google arriba del formulario en `/` y `/invitacion`, no en `/restablecer-contrasena` | HECHO | `IngresarPage.tsx:103-107`; `DefinirContrasenaPage.tsx:164-173`; test "(recuperación) no ofrece Google" |
| F3b-02 | `signInWithOAuth` vuelve a `/google`; el `redirect` se revalida | HECHO | `useIngresoConGoogle.ts:32-38`; `VolverDeGooglePage.tsx:45` → `usePostLogin.ts:40` |
| F3b-03 | `prompt=select_account` | HECHO | `useIngresoConGoogle.ts:36` |
| F3b-04 | `/google` muestra el error de OAuth (incluido `access_denied` suelto) o el del canje | HECHO | `VolverDeGooglePage.tsx:29-45`; `mensajes.ts:54-56` |
| F3b-05 | `/invitacion` sin token pide abrir de nuevo el link | HECHO | `DefinirContrasenaPage.tsx:114-126` |
| F3b-06 | bfcache: los botones se rehabilitan | HECHO | `useIngresoConGoogle.ts:19-25` (`pageshow` + `persisted`) |
| F3b-07 | `/privacidad` sin sesión ni `/auth/me`, servida por el rewrite | HECHO | `PrivacidadPage.tsx:1-4` (sin `clienteAuth`/`fetch`); `vercel.json:9-11`; 2 specs |
| F3b-08 | Redirect URL de desarrollo | N/V | §5 |
| F3b-09 | Consentimiento publicado + Branding | N/V | §5 |
| F3b-10 | Que `/` también muestre el error de OAuth | **No implementado — mejora anotada, no requisito** | `errorDeOAuth` (`mensajes.ts:50`) solo se usa en `VolverDeGooglePage.tsx:29`. Ver §4.3 M4 |

### Fase 4 — SSO en las apps

**4.1 — `@menyu/auth-client` y web-auth sobre la cookie**

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| F41-01 | `createBrowserClient` con `cookieOptions` del env, Lax, `secure` solo con https | HECHO | `cliente.ts:12-14,25`; `config.ts:17-19`; 4 specs de cookie |
| F41-02 | Los 8 exports | HECHO | `index.ts:2-15`; test de contrato `index.spec.ts:6-29` (lista cerrada de 22 nombres) |
| F41-03 | `appsDelPerfil`/`tieneAcceso`/`puedeIrA` como única regla | HECHO | `apps.ts:8,13-20,40-44`; reusado por web-auth (`destinos.ts:1,120`) |
| F41-04 | Revalidación al foco/visibilidad y cada 5 min | HECHO | `revalidacion.ts:5,8-18,62-78`; montada en `RequireAuth.tsx:96-99` |
| F41-05 | web-auth usa `clienteAuth()`; sin `lib/supabase.ts` ni `lib/api.ts` | HECHO | `ls src/lib/` solo tiene destinos/mensajes/navegar/redirect |
| F41-06 | `decidirDestino` ignora un `redirect` a una app que no le toca | HECHO | `destinos.ts:113-120`; 2 specs |
| F41-07 | supabase-js 2.117.0 en los 4 lugares; `@supabase/ssr` 0.12.7 | HECHO | `backend:31`, `web-auth:18`, `auth-client:17-18`; lock coherente. Las otras 3 apps también en 2.117.0 |
| F41-08 | `auth-client` en CI y Sonar | HECHO | `ci.yml:39,45,51,107-114`; `sonar-project.properties:8,11,23` |
| F41-09 | Las 4 variables documentadas y tipadas | HECHO | `VariablesACambiar.md:101-103,131-136`; los 4 `.env.example` y `vite-env.d.ts` |
| F41-10 | 100 % de cobertura del paquete | HECHO | **medido: 100 %** (80 tests). Único archivo sin spec propio: `ir.ts`, cubierto en `index.spec.ts:33-47` |
| F41-11 | `RequireAuth` manda con `redirect`, y sin él a quien no tiene acceso a esa app | HECHO | `RequireAuth.tsx:71,76,78,83`; `navegacion.ts:13-28`; 3 specs |

**4.2 — Base de permisos del backend**

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| F42-01 | Baja efectiva en `rolesEnRestaurante`, `esOwnerDeMarca` y `perfil()` | HECHO | `acceso.service.ts:48-52,64,159`; `restaurante-disponible.ts:8`; `acceso.service.base.spec.ts` (contra base real) |
| F42-02 | `exigirRol` → 403 o todos los roles | HECHO | `acceso.service.ts:75-79` |
| F42-03 | `exigirOwnerDeMarca` | HECHO | `acceso.service.ts:82-84` |
| F42-04 | `mozoDe` por clave única, solo activo | HECHO | `acceso.service.ts:113-121` (+ `exigirMozo` en `:127-131`) |
| F42-05 | `restaurantesDe` ordenado; OWNER incluye sus marcas | HECHO | `acceso.service.ts:137-154` |
| F42-06 | `restaurante.marca {id,nombre}` en el perfil y en `@menyu/types` | HECHO | `acceso.service.ts:17,176`; `auth.types.ts:45` |
| F42-07 | `@RequiereRolEn`; mal declarada→403+log; id ausente→400 | HECHO | `requiere-rol.decorator.ts:22-31`; `membresia.guard.ts:42-51,58-61` |
| F42-08 | `@Personal()` y `@RequiereRoot()` | HECHO | `personal.decorator.ts:10-16`; `requiere-root.decorator.ts:7-13`; `root.guard.ts:10-14` |
| F42-09 | Migración de autoría con FK `ON DELETE SET NULL` | HECHO | `20261021141707_fase4_autoria_usuario/migration.sql:7,9,11,13` |
| F42-10 | Disparador del último ROOT (borrar **y** desactivar) | HECHO | misma migración `:20-43` (2 triggers, `FOR UPDATE` en `:23`); `usuario-migracion.base.spec.ts` |
| F42-11 | Opción `cuenta` (`x-test-usuario`); guards reales | HECHO | `test/app-endpoints.ts:23-24,31-41,67,98-100` |
| F42-12 | `acceso-de-test.ts` con `CUENTAS`, `MUNDO`, `MOZOS` | HECHO | `src/test/acceso-de-test.ts` |
| F42-13 | El spec del enrutador recorre todo y clasifica | HECHO | `rutas-por-autenticacion.spec.ts:149-198` |
| F42-14 | Los 2 specs contra base real con `TEST_DATABASE_URL` | HECHO | `acceso.service.base.spec.ts:18-21`; `usuario-migracion.base.spec.ts:12-15`. **Hay un tercero** no listado en la spec: `historial-root.base.spec.ts:20` |

**4.3 — Los controllers del personal**

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| F43-01 | Marcas | HECHO | `marca.controller.ts:16-51`; `marca.service.ts:80-84,89,96,109,120` |
| F43-02 | Restaurantes (`direccion` y `nombreSeccionRecomendados` solo OWNER; logo OWNER) | HECHO | `restaurante.controller.ts:18-49`; `restaurante.service.ts:45-46,63-66` |
| F43-03 | Mesas | HECHO | `mesas.controller.ts:19,26,32-59`; `mesas.service.ts:69-70,96-100` |
| F43-04 | Carta | HECHO | `items.controller.ts:42-183`; `items.service.ts:67-217`; `categorias.service.ts:32,38,49`; `ingredientes.service.ts:70-75` |
| F43-05 | Clasificaciones globales | HECHO | `clasificaciones.controller.ts:37,46,56,65`; `clasificaciones.service.ts:29,41,54` |
| F43-06 | Mozos (`PATCH` solo nombre y teléfono, OWNER) | HECHO | `mozos.controller.ts:20,28-79`; `mozos.service.ts:55-56,119-123`; `update-mozo.dto.ts:8-19` |
| F43-07 | Sesiones, pagos del salón y OAuth de MP con `usuarioId` en el `state` | HECHO | `sessions.controller.ts:88,96,107`; `mercado-pago-oauth.service.ts:15,28,34` |
| F43-08 | Pedidos (el OWNER **no** edita) | HECHO | `pedidos.controller.ts:21,31`; `pedidos.service.ts:154,286,486,533` |
| F43-09 | Llamados: atender solo JEFE_SALON/MOZO del restaurante, con `Mozo` activo | HECHO | `waiter-calls.service.ts:92-101` |
| F43-10 | Personal: GET y DELETE, nadie se quita a sí mismo, baja del `Mozo`, 409 al invitar a algo de baja | HECHO | `personal.controller.ts:11-23`; `personal.service.ts:87,89-92,96-101`; `invitaciones.service.ts:141,148` |
| F43-11 | ROOT 403 en los datos; borrados los helpers y los `rol === 'ROOT'` | HECHO | `src/common/` sin los 2 archivos; sin `assertRestauranteOwnership`; `acceso.service.ts:33`; `decoradores-de-acceso.spec.ts:145` |
| F43-12 | Rutas legacy inexistentes | HECHO | sin `@Post()`/`@Delete(':id')` en marca y restaurante; sin POST raíz de mozos; sin módulos admin |
| F43-13 | Sin `mp_*` ni `passwordHash`: select explícito + contrato | HECHO | `includes-contract.spec.ts:62,93-96,138-160`; los `*_SELECT` de cada service |
| F43-14 | Atribución del cobro | HECHO | `atribucion-del-cobro.ts:28,31-34,37-41` |
| F43-15 | Huecos de pertenencia; la sesión tiene que ser de la mesa | HECHO | `pedidos.service.ts:150-160,176-178`; `payments.service.ts:206-219` |
| F43-16 | Ítem no cruza de restaurante (400); `GET /menu` filtra | HECHO | `items.service.ts:267-289`; `menu.service.ts:69-71` |
| F43-17 | `confirmar-efectivo` 409 condicionado; atender igual | HECHO | `payments.service.ts:221-233`; `waiter-calls.service.ts:105-110` |
| F43-18 | 5 MB en multer (413) | HECHO | `items.controller.ts:34,116,132` |
| F43-19 | `CON_PERMISO_EN_EL_SERVICE` | HECHO | `rutas-por-autenticacion.spec.ts:46-102,180-186` (54 rutas, conjunto exacto) |
| F43-20 | `PersonalDelRestaurante` en `@menyu/types` | HECHO | `packages/types/src/` |

**4.4 — Consola de ROOT (backend)**

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| F44-01 | `@RequiereRoot()` por controller, debajo de `CamposPermitidosGuard` | HECHO | los 5 controllers de `/root`; `root-routes.spec.ts:74-93` |
| F44-02 | Actor del historial desde `Usuario`, dentro de la transacción; 401 | HECHO | `historial-root.service.ts:101-110`; `registrar-historial.ts:118` |
| F44-03 | Las 7 rutas con sus códigos (403/404/409/502/409 último dueño) | HECHO | `root-marcas.controller.ts:31,49`; `root-duenos.controller.ts:21,28-29,45-46`; `root-roots.controller.ts:20,27-28`; `invitaciones.service.ts:63,69,71,140,141,233-236` |
| F44-04 | Las rutas de contraseña ya no existen | HECHO | `root-routes.spec.ts:23-44,100-106`; 404 en `root-endpoints.spec.ts:224,236` |
| F44-05 | Invitaciones de ROOT en el historial, misma transacción; `ROLES_DE_ROOT=['OWNER']` | HECHO | `invitaciones.service.ts:76-119`; `puede-invitar.ts:3` |
| F44-06 | Los 4 códigos; los de contraseña no se escriben pero se leen | HECHO | `registrar-historial.ts:23-40,96-106`; `historial-root.service.ts:70-84` |
| F44-07 | `HistorialRootModule`; `InvitacionesService` exportado con `cuentaDeSupabase` | HECHO | `historial-root.module.ts`; `root.module.ts:20`; `invitaciones.module.ts:9,12`; `invitaciones.service.ts:170` |
| F44-08 | `cuentas-root.ts` con `listar` y `promover` | HECHO | `scripts/cuentas-root.ts:13-14,42,151-199,217,237` |
| F44-09 | Borrados los helpers de contraseñas y los fixtures legacy | HECHO | sin `contrasenas`/`CrearCuentaDto`/`CAMBIO_PASSWORD`; `app-endpoints.ts` solo con `cuenta` |
| F44-10 | web-admin: tipos, textos del historial, `BAJA_CORTA_EL_LOGIN` | HECHO | `pages/root/copy.ts:13` |
| F44-11 | `textoRegistrable` + topes de los DTO | HECHO | `registrar-historial.ts:74-89,119-126`; `update-marca.dto.ts:10-18`; `marca-root.dto.ts:6-7` |
| F44-12 | `?q=` escapa `_` y `%` | HECHO | `root/comun/cuentas.ts:11-13`; también en `historial-root.service.ts:128` |
| F44-13 | Specs de `/root` con todos los roles | HECHO | `test/root-mock.ts:13-21`; `root-endpoints.spec.ts:36,43,50,174,181,188` |
| F44-14 | 409 al último dueño, serializable | HECHO | `root-duenos.service.ts:73,80-87` |

**4.5 — web-admin** · **4.6 — web-staff** · **4.7 — web-cliente y cierre**

| ID | Requisito | Estado | Evidencia | Veredicto / nota |
|---|---|---|---|---|
| F45-01 | Un solo `RequireAuth` con `tieneAcceso(…,'admin')` | HECHO | `App.tsx:66` | Único en la app |
| F45-02 | `/root/*` con `esRoot`; `/admin/*` con rol; ROOT sin membresías a `/root` | HECHO | `App.tsx:32-36,42-47,69-79` | |
| F45-03 | `AdminRedirect` + `*`→`/admin` | HECHO | `App.tsx:54-60,133` | |
| F45-04 | Sin `/login`, sin el script de `index.html`, sin `@menyu/auth` | HECHO | `index.html:1-13`; `package.json:14-25` | `packages/auth` ya no existe |
| F45-05 | Token de `tokenDeAcceso()`, 401 → renovar + 1 reintento; `upload()` igual | HECHO | `services/api.ts:45-62,73-81,90-96`; `PagosPage.tsx:7,78-79` | |
| F45-06 | Los 3 sockets sin `auth.token` | HECHO | `GerenceMesasPage.tsx:425-428`; `PedidosPage.tsx:317-320`; `PagosPage.tsx:458-461` | |
| F45-07 | `useRolActual()` en los 6 consumidores | HECHO | `contextStore.ts:32-47,162-167` + 6 pantallas | |
| F45-08 | ROOT fuera de los datos | HECHO | `AdminLayout.tsx:28`; `contextStore.ts:9` (`RolDeAdmin`); `App.tsx:88-131` | ROOT es **imposible por tipo** en los guards |
| F45-09 | `loadContext` con preferencia validada, sin `/marcas` al GERENTE, carga compartida | HECHO | `contextStore.ts:61-78,95,104-132,143`; `AdminLayout.tsx:215-221` | Caso de borde en §3.4 |
| F45-10 | Personal: 2 pestañas, invitar/quitar con la matriz, dueños de solo lectura | HECHO | `MozosPage.tsx:311,603,706,732-738,886-898,997,1013`; `personal.ts:2,11-26`; `api.ts:382-392` | La matriz sale de `@menyu/types/permisos` |
| F45-11 | `useRootSession` con `usePerfil()` y `logout()` | HECHO | `pages/root/useRootSession.ts:1,9,13` | |
| F45-12 | Proxy `/api` y `/socket.io`; `.env.example`; tipos | HECHO | `vite.config.ts:17-22`; `.env.example:1-16`; `vite-env.d.ts:3-10` | |
| F45-13 | Sin `HistorialPage.tsx` ni `api.pagos.confirmarEfectivo` | HECHO | `ls pages/admin/gerente/`; `api.ts:313-316` | |
| F45-14 | Los tests nuevos + `test/authClient.ts` | HECHO | `api.sesion.spec.ts:28,64,79,89,131`; `contextStore.spec.ts`; `App.spec.tsx`; `RoleGuard.spec.tsx`; `MozosPage.spec.tsx`; `personal.spec.ts` | **852 tests, verde** |
| F46-01 | `RequireAuth` con `tieneAcceso(…,'staff')` | HECHO | `App.tsx:115`; `apps.ts:14` | |
| F46-02 | Sin `/login`; `*`→`/` | HECHO | `index.html:1-13`; `App.tsx:133` | |
| F46-03 | Destino por rol; los guards mandan a la vista que toca | HECHO | `App.tsx:85-96,102-109` | |
| F46-04 | Aviso + "Cerrar sesión" sin restaurante | HECHO | `App.tsx:44-64,80` | |
| F46-05 | `contextoStore` del perfil; todos los roles; preferencia URL→localStorage→único | HECHO | `contextoStore.ts:32-49,56-76,88-91,97-107,123-128` | Sin `mozoStore`/`cocinaStore`; nada decodifica el JWT |
| F46-06 | Selector sin "ID del restaurante" ni `/gerente/pagos` | HECHO | `SelectorPage.tsx:241-256,288-315` | |
| F46-07 | API con 401; sin las 4 funciones muertas | HECHO | `services/api.ts:1,18-33,219-269` | |
| F46-08 | Sockets sin token; `cerrarSesion()` los desconecta | HECHO | `socket.ts:19,55-58`; `MesasPage.tsx:287`; `PedidosPage.tsx:241` | |
| F46-09 | Nombre, restaurante y rol del contexto; ocultamientos; Cocina con "Salir" | HECHO | 6 pantallas con `usePerfil`+`useNombreDelRol`; `MozoPanel.tsx:87,108,340`; `PedidosPage.tsx:183-191,204`; `CocinaPage.tsx:392-398` | `CocinaPage` no muestra nombre ni rol (su encabezado es distinto): no contradice la spec |
| F46-10 | `CobroModal` sin `mozoId` ni `cobradoPorNombre` | HECHO | `CobroModal.tsx:36-58`; `api.ts:285-294`; `PagosMozo.spec.tsx:110` | |
| F46-11 | `PagosGerente` borrado | HECHO | sin archivos ni ruta `/gerente/*` | |
| F46-12 | El socket recuerda su sala y reconecta; `connect` re-entra | HECHO | `socket.ts:11-14,22-25,31-36,42-49,74-108` | Sin ningún `once` |
| F46-13 | "Cambiar de restaurante" en mozo y cocina | HECHO | `MozoPanel.tsx:342,497-508`; `CocinaPage.tsx:220,384-391` | |
| F46-14 | Proxy, `.env.example`, tipos | HECHO | `vite.config.ts:17-22`; `.env.example:1-17`; `vite-env.d.ts:3-10` | |
| F46-15 | Sin `mesasAsignadas` ni "Tu mesa" | HECHO | grep sin resultados | |
| F46-16 | Los tests nuevos + `authClient.ts` y `contexto.ts` | HECHO | los 9 archivos | **211 tests, verde** |
| F47-01 | `AuthPage` no pasa tokens, avisa y espera | SUPERADO | la Fase 5 borró `AuthPage` y dejó `/auth` como redirect (F5-01) | Cumplido en su momento; hoy el requisito ya no aplica |
| F47-02 | `urlDeAuth()` con variable y fallbacks por ambiente | HECHO | `urlDeAuth.ts:5,9,15-26`; `urlDeAuth.spec.ts:28-38` | Staging viejo **no** cae en producción |
| F47-03 | `MesaSinCarta` sin mozo ni efectivo, con el texto y la salida | **HECHO** | `MesaSinCarta.tsx:62-79` (`:69` efectivo no disponible, `:72` qué hacer si falla) | Un revisor lo marcó PARCIAL porque el texto no se **importa** de `copy.ts`. La spec dice "es el mismo texto", no "importado": importarlo rompería la separación de bundles de `CLAUDE.md`. Queda la deuda de duplicación (§4.3 M9) |
| F47-04 | Los 3 caminos del llamado al mozo con 403 | HECHO | `payments.service.ts`; `waiter-calls.service.ts` | |
| F47-05 | El socket de `MesasPage` se suscribe una sola vez | **HECHO** | `MesasPage.tsx:283-312` (deps `[restauranteId, cargarLlamados]`), `:304-308` | Un revisor lo marcó PARCIAL: usa una **actualización funcional** en lugar de una ref. El objetivo se cumple y es más robusto; la spec quedó vieja en el cómo (§4.3 M2) |
| F47-06 | `packages/auth` borrado, con sus referencias | HECHO | `ls packages/`; los `tailwind.config.js` miran `auth-client` | |
| F47-07 | Los tests de la entrega | HECHO | — | **752 tests en web-cliente, verde** |
| F47-08 | Variables de Vercel en los 6 proyectos | N/V | §5 | La spec las declara completas al 2026-10-25 |
| F47-09 | La lista de verificación en staging | **PARCIAL** | existe en `auth.md:472-481` (los 7 casos), **no** como archivo; `docs/checklist-qa-staging.md` es el de Discovery y aún dice "los tres frontends" (`:24`) | No se actualizó para la Fase 5 (§4.2 I3) |
| F4-T | SSO de punta a punta en local y staging | HECHO | `auth.md:482-498` (verificado el 2026-10-23, los 7 casos) | |

### Fase 4b — Cuenta de cliente

| ID | Requisito | Estado | Evidencia | Veredicto / nota |
|---|---|---|---|---|
| F4b-01 | `clienteDe(token)` con el JWKS compartido | HECHO | `cuenta-de-cliente.service.ts:40-53`; `verificador-token.service.ts:52-64` | |
| F4b-02 | Buscar → vincular (condicionado, sin mayúsculas) → crear | HECHO | `cuenta-de-cliente.service.ts:43-47,65-91,93-105` | |
| F4b-03 | Nombre de `user_metadata`, sin control, tope 80, "Cliente" | HECHO | `cuenta-de-cliente.service.ts:126-137` | |
| F4b-04 | P2002 vuelve a buscar; email ajeno → sin email | HECHO | `cuenta-de-cliente.service.ts:96-104` | |
| F4b-05 | Nunca crea `Usuario` ni `Membresia` | HECHO | `cuenta-de-cliente.service.ts:107-113` + spec dedicado | |
| F4b-06 | `resolveClienteId` solo con el JWKS; ruta pública; token malo → Invitado | HECHO | `sessions.service.ts:755-763`; `rutas-por-autenticacion.spec.ts:30,168-172`; sin `esTokenDeSupabase` | |
| F4b-07 | `/crear-cuenta` con `data.nombre` y `emailRedirectTo` a web-cliente; no revela el email | HECHO | `CrearCuentaPage.tsx:35-38,66-75,105-121` | |
| F4b-08 | `/confirmar-email` con los dos links | HECHO | `ConfirmarEmailPage.tsx:26-37,58,72-92,100-113,146-154` | |
| F4b-09 | 403 → `redirect` de web-cliente; "Creá tu cuenta"; "Ir a MenYU" | HECHO | `usePostLogin.ts:42-47`; `destinos.ts:37-39`; `IngresarPage.tsx:139`; `SinAccesoPage.tsx:54-56` | |
| F4b-10 | `/privacidad` con la cuenta de cliente, el mail y su fecha | HECHO | `PrivacidadPage.tsx:8,40,64-67,100-103` | Fecha real: **26 de octubre de 2026** (la spec dice 23: §4.3 M2) |
| F4b-11 | `confirm-signup.html` con `{{ .RedirectTo }}` | HECHO | `confirm-signup.html:16,21` | |
| F4b-12 | `useSesionDiferida` sin `RequireAuth`; sin variables no rompe | HECHO | `useSesionDiferida.ts:16-72`; `cuenta.ts:91-96`; 2 specs | |
| F4b-13 | `cuenta.ts` y `useCuenta.ts`, solo Supabase tras la Fase 5 | HECHO | `cuenta.ts:35-75`; `useCuenta.ts:18-25` | |
| F4b-14 | El token de Supabase es el de `POST /sessions/open` | HECHO | `cuenta.ts:53-62`; `services/api.ts:2,78` | |
| F4b-15 | Ingresar/Registrarme a web-auth con `redirect`; cerrar sesión se queda | HECHO | `useIrAlIngreso.ts:6-10`; `cuenta.ts:68-82`; `AppHeader.tsx:30-33,87-125`; `MenuDrawer.tsx:148-180` | |
| F4b-16 | Fuera del dominio de la cookie, al `/auth` de la app | **SUPERADO** | `useIrAlIngreso.ts:6-10` va siempre a web-auth | La **decisión 5 de la Fase 5** lo canceló explícitamente ("van a web-auth esté donde esté la app"). Un revisor lo marcó FALTA; no lo es. Consecuencia operativa asumida en §4.3 M5 |
| F4b-17 | Sin `resolveAppUrl.ts` ni `api.payments.initiate` | HECHO | grep sin resultados | |
| F4b-18 | Los tests de las tres capas | HECHO | `cuenta-de-cliente.service.spec.ts:70-290`; `CrearCuentaPage.spec.tsx`; `ConfirmarEmailPage.spec.tsx`; `cuenta.spec.ts` | |
| F4b-19 | Plantilla "Confirm signup" cargada (seguridad) | N/V | §5 | La spec la declara cargada el 2026-10-23 |
| F4b-20 | Las 4 variables en los proyectos de web-cliente | N/V | §5 | |
| F4b-T | Registro → vuelta → mesa a su nombre; sin cuenta igual | HECHO | `auth.md:526-528,703-710` (verificado en staging el 2026-10-24/25) | **Pero el camino cambió en la Fase 5**: ver §4.1 B2 |

### Fase 5 — Limpieza

| ID | Requisito | Estado | Evidencia |
|---|---|---|---|
| F5-01 | `/auth` como redirect que conserva `?volver=` y `?tab=register` | HECHO | `App.tsx:166`; `RedirigirAWebAuth.tsx:16-20`; `rutaInterna.ts:6-13`; spec con `evil.example.com`, `//` y `/\` |
| F5-02 | Borrados `AuthPage`, `tokenCuenta.ts`, `jwt.ts` y la rama `anterior` | HECHO | `ls pages/auth/`, `ls utils/`; `cuenta.ts:1-116` |
| F5-03 | Los 5 endpoints no existen ni en Swagger | HECHO | `auth.controller.ts:13` (único `@Get('me')`); grep sin usos |
| F5-04 | Borrados los 9 artefactos del login + `UsersModule`; invitado con `prisma.cliente.create` | HECHO | `app.module.ts:2-26`; `sessions.service.ts:760` |
| F5-05 | Sin `DELETE /mozos/:id` ni `avisar-mozo-cuenta`; sin bcryptjs/passport | HECHO | `mozos.controller.ts:19-79`; `main.ts:21-29`; `package.json:25-60` |
| F5-06 | `resolveClienteId` solo JWKS; `esTokenDeSupabase` borrado | HECHO | `sessions.service.ts:755-763` |
| F5-07 | Migración con backfill por email y los DROP | HECHO | `20261025120000_fase5_login_legacy/migration.sql:11-18,22,25-27,29,34-35` |
| F5-08 | Seed sin contraseñas | HECHO | `prisma/seed.ts:41` (solo el comentario) |
| F5-09 | Matriz en `@menyu/types/permisos`; el backend no importa el paquete en producción | HECHO | `permisos.ts:21-28`; `package.json:46` (devDep); único import en `puede-invitar.spec.ts:1` |
| F5-10 | supabase-js en diferido; `authClientDiferido.ts` único importador; `puedeHaberSesion()` como compuerta | HECHO | `authClientDiferido.ts:15-16`; **todo lo demás es `import type`**; compuerta en `cuenta.ts:54` y `useSesionDiferida.ts:18,22` |
| F5-11 | Borra del localStorage los tokens viejos al arrancar | HECHO | `main.tsx:5,9`; `cuenta.ts:10-18` |
| F5-12 | Subpath `@menyu/types/permisos` a la fuente | HECHO | `packages/types/package.json:12`; **build en frío verde** |
| F5-13 | Swagger actualizado | HECHO | se genera del enrutador, sin los controllers borrados |
| F5-14 | `CLAUDE.md` actualizado | PARCIAL | roles y dominios al día; quedan `:116` ("migración en curso"), `:206` ("las 3 apps"), `:63-64` (`restaurant/`, `tables/`), `:103-108` (sin JEFE_SALON) |
| F5-15 | `/privacidad` actualizada con su fecha | HECHO | `PrivacidadPage.tsx:8,56-62` ("la base de MenYU ya no guarda ninguna contraseña") |
| F5-16 | El SQL del E2E sin `password_hash`, aplicado en staging | HECHO | `e2e-limpiar-sin-password-hash.sql:16-21`; `e2e-staging.sql:201-207` ya corregido. **Pendiente si se instala en producción** (§5) |
| F5-17 | Documentar en la tesis | N/V | §5 |

**Los 7 criterios del "Terminado cuando" de la Fase 5**

| # | Criterio | Estado |
|---|---|---|
| 1 | Los 5 endpoints 404 y fuera de Swagger; el spec del enrutador sin la rama legacy | **CUMPLIDO** (`rutas-por-autenticacion.spec.ts:16-17,21-102`, sin `PENDIENTES`) |
| 2 | El grep de 8 patrones en todo el repo | **CUMPLIDO en código, scripts, `packages/` y `schema.prisma`; NO en documentación** (§4.2 I1) |
| 3 | La migración corre limpia sobre datos del login anterior + el seed después | **CUMPLIDO en local** (`auth.md:608`); pendiente en producción (§4.1 B1) |
| 4 | Los 4 casos en el navegador | **CUMPLIDO**: hechos en local y **verificados en staging el 2026-10-27** con el código de la Fase 5 (§3.7, casos B1 a B3) |
| 5 | Typecheck y suites en verde con el quality gate de SonarCloud | **Suites y typecheck: CUMPLIDO y medido.** Quality gate: **sin verificar** (`auth.md:612`; `bitacora.md` lo deja como pendiente, "código nuevo" todavía en *Previous version* del 17/10). **Es lo único que queda abierto del criterio** |
| 6 | `/privacidad` actualizada con su fecha | **CUMPLIDO** (26/10/2026) |
| 7 | El revisor aprueba la fase | **CUMPLIDO** (`auth.md`, segunda vuelta del 2026-10-26) |

### Requisitos implícitos

| ID | Requisito | Estado | Nota |
|---|---|---|---|
| I-01 | Variables del backend documentadas | HECHO | `.env.example:25-41,96-113`. El comentario de `JWT_SECRET` (`:25-26`) sigue genérico y no dice que hoy solo firma la sesión de mesa y el `state` de MP |
| I-02 | Variables en Vercel | N/V | §5 |
| I-03 | Supabase: redirect URLs, provider, las 3 plantillas | N/V | §5 |
| I-04 | Dominio de la cookie por ambiente, nunca hardcodeado | HECHO (cookie) / PARCIAL (destinos) | `config.ts:17-19` es el único lugar y sale de la variable. Las URLs destino están escritas a mano con una regla por ambiente que **sí** cubre los tres (`destinos.ts:14-33`, `urlDeAuth.ts:15-26`), con fallback a producción (§4.3 M6) |
| I-05 | CORS no abierto a `*` | PARCIAL | No hay `*` ni `origin:true`, y sin la variable **falla cerrado**. Pero `localhost` siempre pasa y los patrones no se anclan (§4.2 I7) |
| I-06 | Las 5 apps y los 2 paquetes en los 5 workflows | PARCIAL | `@menyu/types` sin typecheck propio en `ci.yml:39` (mitigado por `dependsOn: ["^build"]`) y **fuera de Sonar** (§4.2 I4); `WORKFLOW.md` desalineado (§4.2 I10) |
| I-07 | `.env.example` completos en los dos sentidos | PARCIAL | Sin variables muertas del login viejo en ninguno. Faltan: `DIRECT_URL` en el de la raíz (lo exige `schema.prisma:8`), `VITE_WS_URL` como clave en los 3 frontends que la leen, y `APP_COMMIT_SHA`/`TEST_DATABASE_URL` sin documentar |
| I-08 | README y `WORKFLOW.md` al día | PARCIAL | §4.2 I10 |
| I-09 | `CLAUDE.md` consistente | PARCIAL | §4.2 I9. Los 11 caminos de la muestra existen todos |
| I-10 | Node 22 alineado | HECHO | 11 apariciones mayor 22, ninguna 20, en Dockerfile, workflows y `engines`. Única excepción documental: `WORKFLOW.md:169` pide ">= 20" |
| I-11 | Sin tokens en storage, sin secrets en bundles ni en el repo | PARCIAL | Ningún token de cuenta en storage en ninguna app. Ver `verify-carrito.*` (§4.2 I11) |
| I-12 | Nada atado a un solo ambiente | PARCIAL | Sin URLs de staging en el deploy de producción ni al revés, y sin project refs en el repo. Atados a un ambiente: el default de `QR_BASE_URL` y los fallbacks a producción (§4.3 M6, M18) |
| INF-1 | `.dockerignore` excluye `**/*.spec.ts` y nada de producción importa `@menyu/types` | HECHO | `.dockerignore:33`; único import en el spec. **Pero no excluye `*.e2e-spec.ts`** (§4.2 I12) |

---

## 3. Hallazgos transversales

### 3.1 Consistencia entre fases

**La Fase 5 está en `main` y en staging, pero no en producción.** `git rev-list -n1 v1.3.0` da `6ce5680`, y
`git ls-tree -r v1.3.0 -- apps/backend/prisma/migrations` **no contiene** `20261025120000_fase5_login_legacy`
(0 coincidencias de `fase5`); `main` sí. La Fase 5 entró en `b9b6db2` el 2026-10-26 a las 11:40 y no hubo tag
después. Es la única discrepancia de fase relevante, y explica por qué el encabezado de la Fase 5 en la spec
es el único sin ✅ mientras `CLAUDE.md` ya la narra como hecha.

**No encontré ningún caso de una fase posterior que rompiera algo que una anterior había cerrado.** Lo
verifiqué sobre los contratos que cruzan varias fases:

- **`GET /auth/me`**: el tipo vive una sola vez, en `packages/types/src/auth.types.ts:39-55`, y lo consumen
  web-auth, web-admin, web-staff y `auth-client`. La decisión 1 de la 4b (no cambiar su contrato) se respetó.
- **Nombres de variables**: las 4 `VITE_*` de auth se leen **solo** en `packages/auth-client/src/config.ts:5,6,18,23`
  (más `VITE_AUTH_URL` en `web-cliente/src/utils/urlDeAuth.ts:15`). Ninguna app las lee por su cuenta: no hay
  deriva de nombres posible.
- **Versiones**: `@supabase/supabase-js` 2.117.0 en los 6 `package.json` que la declaran, `@supabase/ssr` 0.12.7,
  `jose` ^5.10.0. Sin divergencias.
- **Rutas de los mails**: `/invitacion`, `/restablecer-contrasena` y `/confirmar-email` existen en
  `App.tsx:23,25,26` y los `type` de las plantillas coinciden con los del canje.
- **El único caso conocido de una fase que rompió un consumidor externo** fue el que la spec ya documenta: la
  Fase 5 borró `cliente.password_hash` y rompió `e2e.e2e_limpiar`, una función instalada en la base de staging
  que ningún grep ve. Está corregido y la lección quedó escrita en `auth.md:616`.

**Dependencia implícita que conviene no perder:** la navegación de web-admin asume que `GET /restaurantes`
solo devuelve restaurantes donde la persona es OWNER o GERENTE. Lo cumple el backend
(`restaurante.service.ts:45-46`, `restaurantesDe(usuario.id, ADMINISTRACION)`). Si eso cambiara, el guard
`SoloAdministracion` (`web-admin/src/App.tsx:42-47`) podría rebotar contra sí mismo, porque navega a `/admin`,
que está dentro del mismo guard. Hoy no es alcanzable.

### 3.2 Código muerto y restos

- **Cero `TODO`, `FIXME`, `XXX`, `HACK`, `WIP` o `TEMP`** en todo el repo (`*.ts,tsx,js,mjs,sh,sql,yml`).
  Las coincidencias de un grep ingenuo son identificadores en español (`TODOS`, `METODOS`, `TODO_EL_PERSONAL`).
- **Cero rastros del flujo `AuthCode` cancelado**, salvo la línea de la propia spec que lo declara cancelado
  (`auth.md:13`).
- **Cero `.only`** en el repo, y los 36 tests salteados son los 3 `*.base.spec.ts` que piden `TEST_DATABASE_URL`
  por diseño (y que además rechazan una URL que no sea local).
- **Sin dependencias muertas**: no hay `bcryptjs`, `passport`, `passport-jwt`, `jwt-decode`, `jsonwebtoken`
  ni `@menyu/auth` en ningún `package.json`. `packages/auth` no existe.
- **Sin restos del login viejo en las apps**: ningún `/login`, ninguna `LoginPage`, ningún script de
  `?token=&refresh=` en los `index.html`, ningún `mozoStore`/`cocinaStore`. Lo único que lo nombra es
  intencional: la limpieza de `CLAVES_DEL_LOGIN_ANTERIOR`, la ruta puente `/auth` y los tests que comprueban
  que el token viejo se ignora.
- **Restos reales, los tres menores**: 4 comentarios que describen cosas borradas como vigentes
  (`session-auth.guard.ts:22-24`, `supabase-auth.guard.ts:28`, `membresia.guard.ts:7`,
  `orders.service.spec.ts:19`), la rama `false` de `BAJA_CORTA_EL_LOGIN` (`web-admin/src/pages/root/copy.ts:13`,
  ~10 líneas que ya no se pueden mostrar) y `apps/cliente/`, miembro del workspace con un único
  `expo-env.d.ts` y sin `package.json`.

### 3.3 Seguridad

**Lo que está bien, verificado:**

- **La cookie** sale siempre de `VITE_AUTH_COOKIE_DOMAIN`, con `path:'/'`, `sameSite:'lax'` y `secure` solo
  con https (`cliente.ts:12-14`). No es `httpOnly` y no puede serlo: la escribe JavaScript. Es la decisión
  consciente que la spec documenta, no una falta. Consecuencia real a asumir: un XSS en **cualquier**
  subdominio de `menyu-app.com` lee la sesión de todas las apps.
- **Ningún token de cuenta en `localStorage` ni `sessionStorage`** en ninguna de las cuatro apps. web-admin y
  web-staff guardan solo la preferencia de restaurante; web-cliente **borra** las claves del login viejo al
  arrancar. La única credencial en web storage es el JWT de la **sesión de mesa**
  (`web-cliente/src/store/sessionStore.ts:30,56`, en `sessionStorage`), que la spec mantiene a propósito.
- **La verificación del token** cierra la confusión de algoritmos: `algorithms: ['ES256','RS256']` más `issuer`,
  `audience` y `requiredClaims: ['sub','exp']` (`verificador-token.service.ts:57-62`), y un chequeo de UUID
  sobre el `sub`. Un HS256 del login anterior o de una sesión de mesa no puede pasar por ahí.
- **La allowlist del `redirect`** (`redirect.ts:24-33`) resistió todas las pruebas sobre el código: bloquea
  userinfo (`evil.com@admin.menyu-app.com`), exige URL absoluta (mata `//evil.com` y las rutas relativas),
  exige `https:` en el dominio propio, rechaza `javascript:` y `data:` por hostname vacío, y `endsWith('.menyu-app.com')`
  descarta `admin.menyu-app.com.evil.com` y `evilmenyu-app.com`. El parser normaliza mayúsculas y convierte
  homógrafos a punycode, así que no hay bypass por ahí. Riesgos residuales, los dos de infra, no de código:
  un subdominio colgado de `menyu-app.com`, y que no se restringe el puerto.
- **Ningún secret en el código**: ni service role key, ni JWT secret, ni publishable key hardcodeadas, en
  backend ni en frontends. Las credenciales de los usuarios de prueba de staging **no están commiteadas**
  (`docs/auth/.env.usuarios-staging` lo tapa `.env.*`); el doc que sí está versionado solo tiene emails y
  nombres de variables, y lo dice explícito en su línea 6.
- **Un solo sistema de autenticación por ruta**, garantizado por un test que recorre el enrutador entero
  (`rutas-por-autenticacion.spec.ts`): clasifica las 120 rutas, exige que las públicas no tengan **ningún**
  guard, que ninguna mezcle los dos sistemas, que `MembresiaGuard` y `RootGuard` corran después de
  `SupabaseAuthGuard`, y que `RootGuard` esté solo y siempre en `/root`. Las 4 rutas públicas del comensal que
  verifican el token a mano usan la **misma** función que el guard (`verificarSesionDeMesa`), así que la
  garantía es real, solo que vive en el service.
- **ROOT no es un bypass**: `AccesoService` ignora `esRoot` (`acceso.service.ts:33`), no hay ningún
  `rol === 'ROOT'` fuera de `src/root/`, y en web-admin ROOT es **imposible por tipo** en los guards
  (`RolDeAdmin = 'OWNER' | 'GERENTE'`).

**Lo que anoto como riesgo, con su alcance:**

1. **CORS acepta cualquier `http://localhost:<puerto>` en todos los ambientes, incondicionalmente**
   (`is-allowed-origin.ts:12`), con `credentials: true`. El impacto hoy es bajo porque el backend autentica
   con `Authorization: Bearer` y no con la cookie (que además es `Lax`), pero la regla es más amplia de lo
   necesario y **la misma función** valida el `Origin` del que se derivan las `back_urls` de un pago
   (`payments.service.ts:336`). Es previo a auth, no lo introdujo esta spec.
2. **`CORS_ORIGIN_PATTERNS` se compila sin anclar** (`is-allowed-origin.ts:19`, `new RegExp(p.trim())`): la
   seguridad depende de que quien carga la variable escriba `^…$`. Los valores documentados lo hacen.
3. **`irAlLogin()` manda la URL completa como `redirect`**, query incluida (`navegacion.ts:6-9`, invocada
   siempre sin argumento). El destino es siempre el propio `auth.<ambiente>`, así que no es un leak a un
   tercero, pero un `qrToken` o un `tableCode` de la URL del QR viajaría a web-auth y quedaría en la barra, el
   historial y los logs de acceso, y dentro del `redirectTo` al salir a Google.
4. **`verify-carrito.js:4` y `verify-carrito.mjs:4`** traen un JWT HS256 completo de sesión de mesa, en un repo
   público, y están trackeados. **El equipo ya lo detectó y triageó**: `docs/calidad/bitacora.md:35` registra
   que se decodificó, que solo trae UUIDs sin datos personales, que apunta a `localhost` y que venció el
   26/05/2026. Lo que la bitácora no registra: un JWT válido publicado permite atacar el secreto **offline**, y
   `JWT_SECRET` sigue firmando el token de sesión de mesa y el `state` del OAuth de MP. El riesgo real depende
   de si el secreto local alguna vez fue el mismo que el de staging o producción — no se puede saber desde el repo.
5. **El `conRedirect` de web-auth propaga el `redirect` crudo entre pantallas y hacia Google**
   (`flujo/rutas.ts:2-5`, usado en 16 lugares, incluido el `redirectTo` de `useIngresoConGoogle.ts:35`). No es
   un open redirect, porque la validación está en el único punto donde se navega (`usePostLogin.ts:40`), pero
   una URL arbitraria puede quedar visible en la barra de `auth.<ambiente>`. Validar al entrar sería más
   defensivo que validar al salir.

### 3.4 Staging vs. producción

- **Ningún project ref de Supabase, service id de Railway ni URL de un ambiente cruzada** en los workflows:
  todo sale de `vars.*` y `secrets.*`. El deploy de producción no referencia staging ni al revés.
- **Dos fallbacks apuntan a producción ante un host desconocido**: `web-auth/src/lib/destinos.ts:24` y
  `web-cliente/src/utils/urlDeAuth.ts:26`. Están documentados y testeados, pero significan que un login en un
  preview de Vercel de staging puede terminar en `admin.menyu-app.com`.
  **Matiz importante de la verificación del 2026-10-27 (§3.7):** ninguno de los dos se activa en el deploy de
  staging, que tiene las variables cargadas — en toda la pasada no hubo una sola navegación a un host sin
  `staging`. Los fallbacks aplican a *hosts desconocidos* (los dominios viejos de Vercel, `127.0.0.1`), no a
  staging. Esto **no** se lee como "staging manda a producción".
- **El default de `QR_BASE_URL`** (`mesas.service.ts:113` cae en `https://menyu-cliente.vercel.app`) sigue
  siendo un riesgo de configuración, pero **en staging la variable está bien puesta**: el `qrImage` que
  devuelve la API para la mesa 1 decodifica a `https://mesa.staging.menyu-app.com/check-in?…` (§3.7). Queda
  pendiente solo como endurecimiento, no como defecto activo.
- **`127.0.0.1` no entra en la regla de desarrollo** de `urlDeAuth.ts:23`, que solo mira `localhost`: desde ahí
  "Ingresar" va al web-auth de producción, que no acepta volver, y la persona termina en `/sin-acceso`.
- **El smoke de staging no prueba los dominios de staging**: usa los deploys *preview* de los proyectos de
  producción (`deploy-staging.yml:179-182`, documentado en `WORKFLOW.md:127`). Un problema propio de
  `*.staging.menyu-app.com` —dominio, variables del proyecto `-staging`, build desde Git— no lo detecta.

### 3.5 Spec desactualizada

Puntos donde el código hace algo distinto **a propósito** y la spec no lo refleja. Ninguno es un defecto; los
anoto porque leer la spec sola induce al error:

1. **Fase 3, F3-07**: dice "pantalla de sin acceso **+ cerrar sesión**". La 4b decidió dejar la sesión abierta
   para poder ofrecer "Ir a MenYU", y lo testea.
2. **Fase 4b**: dice que `/privacidad` está "vigente desde el 23 de octubre"; el código dice
   **26 de octubre de 2026** (`PrivacidadPage.tsx:8`), porque la Fase 5 la movió al retirar los `password_hash`.
3. **Entrega 4.7, F47-05**: dice que la sesión del detalle "se lee por ref"; el código usa una actualización
   funcional (`MesasPage.tsx:304-308`), que cumple lo mismo y es más robusta.
4. **Criterio 2 de la Fase 5**: la lista de excepciones nombra `menyu_access_token` pero no
   `menyu_refresh_token`, que la limpieza también borra (`cuenta.ts:10`). El código está bien; falta la excepción.
5. **Matriz de la 4.3**: la fila de `DELETE /mozos/:id` quedó superada por la decisión 6 de la Fase 5, que lo borró.
6. **4.2**: la spec nombra dos `*.base.spec.ts`; hay **tres** (`historial-root.base.spec.ts`).
7. **Fase 5**: dice "los dos lugares que lo cargan" para `cargarAuthClient()`; hay un tercero
   (`cuenta.ts:70`, `cerrarSesionDeLaCuenta`), inofensivo porque solo se llega con sesión abierta.

### 3.6 Estado real de las suites y el build

Medido, no declarado:

| Comando | Resultado | Números |
|---|---|---|
| `pnpm typecheck` | **verde** | 10/10 |
| `pnpm lint` (`--force`) | **verde** | 9/9 |
| `pnpm build --force` (en frío) | **verde** | 6/6, sin caché |
| Tests, por paquete | **verde** | backend 2021 (+36 skip), web-admin 852, web-cliente 752, web-staff 211, web-auth 93, auth-client 80, ui 41 → **4050** |
| `node --test` de `scripts/` | **verde** | 78 |
| e2e del backend | **no corridos** | 13, requieren Postgres local (corren en el job `e2e-backend` del CI) |

> **Nota (2026-10-27, posterior a la medición):** `origin/main` avanzó 6 commits durante esta revisión, y uno de
> ellos (`b64933b`, PR #444) suma comandos de prueba en la raíz: `pnpm test:unitarias` (los mismos 7 paquetes
> del paso Test del CI más los tests de `scripts/`), `pnpm test:integracion` (`apps/backend/scripts/e2e-local.mjs`:
> levanta un Postgres 17.6 descartable en Docker, aplica las migraciones, revisa el drift y corre los e2e),
> `pnpm test:smoke` y `pnpm test:todo`. Dos consecuencias para este informe: **los 13 e2e del backend ya se
> pueden correr en local con un comando** (solo hacen falta Docker y `pnpm test:integracion`), y la molestia que
> anotaba la spec ("`pnpm test` en la raíz no corre nada", `auth.md:739`) quedó resuelta — aunque sigue sin
> existir un `pnpm test` pelado, que es lo primero que alguien escribe. El README documenta la tabla de los
> cuatro tipos.

Cobertura medida donde se corrió: backend **97,96 %** (la spec declaraba ~96,5), web-auth **95,68 %**,
`auth-client` **100 %** (confirma lo declarado), `packages/ui` 64,63 %. Los conteos de la spec quedaron
levemente atrás, siempre al alza.

**`turbo run test` falla en una máquina de desarrollo por dos causas que no son del código**, y conviene
saberlo porque se lee como si el repo estuviera roto:

1. **Cliente de Prisma generado desactualizado**: `includes-contract.spec.ts` compara contra el `dmmf` del
   cliente de `node_modules`, que todavía tenía `Mozo.passwordHash`. Con `prisma generate` pasa 2021/2021. El CI
   no lo ve porque lo corre como paso explícito (`ci.yml:33`). **Lo accionable**: `pnpm build` **no** lo arregla
   si `@menyu/api#build` da cache hit en turbo.
2. **Flake de timeout** en `DuenosPage.spec.tsx:292` bajo carga paralela (5 s por defecto; el mismo test pasa
   en 910 ms aislado). web-admin da 852/852 corrido solo.

Y un detalle de método: **`turbo run test` cancela las tareas pendientes al primer fallo**, así que una lectura
rápida atribuye todo al primer paquete que falla. Para auditar conviene `--continue`.

### 3.7 Verificación funcional en staging (2026-10-27)

Pasada en el navegador contra `*.staging.menyu-app.com`, con los usuarios de prueba, **nunca contra
producción** (ninguna navegación terminó en un host sin `staging`). Entorno: restaurante "Restaurante Pruebas
Auth", mesa 1, proyecto de Supabase de staging `dgljbkbendznyxabcbtr`. **Los 12 casos dan CUMPLE.**

**Regresión del SSO de la Fase 4, ahora sobre el backend ya limpio (A1-A6):** el OWNER aterriza en
`admin.staging/admin/dashboard`; `staff.staging` abre en otra pestaña **sin un solo request a `auth.staging`**;
la cookie `sb-dgljbkbendznyxabcbtr-auth-token` queda con `domain: .staging.menyu-app.com`, `path: /`,
`secure: true`, `sameSite: Lax` y `httpOnly: false` (la decisión consciente, confirmada); "Salir" en staff la
borra y la pestaña de admin vuelve a web-auth **con su `redirect`** al recuperar el foco; un MOZO que abre
admin termina en staff, ROOT que abre staff termina en `/root/marcas`, un COCINA que escribe `/mozo` vuelve a
`/cocina`, los tres sin loop; y con el token de ROOT, `GET /restaurantes`, `/marcas` y `/pedidos` dan **403**
mientras `/root/marcas` da **200**. **La verificación del 2026-10-23 (`auth.md:482-498`) no quedó invalidada
por la limpieza.**

**Lo que la Fase 5 dejaba sin verificar (B1-B6), ahora cerrado:**

- **La carga diferida sin cuenta — el punto de mayor riesgo — funciona.** Con un perfil limpio, el home de
  `mesa.staging` hace 9 requests con un solo JS y el check-in por QR hace 16: **cero chunks de supabase-js o
  `auth-client`** en los dos, y `POST /sessions/open` sale **sin ningún chunk previo y sin header
  `Authorization`**. La evidencia que descarta el falso positivo: el bundle de entrada
  (`index-B6QlvyVd.js`, 409.918 bytes) **no contiene supabase-js** (0 ocurrencias de `GoTrueClient`,
  `createClient`, `gotrue`), y el chunk diferido existe y es grande (`index-OHXQDtAO.js`, 245.516 bytes, 104
  ocurrencias de `supabase`). O sea: el split es real, no se descarga sin cookie y **sí** se descarga con cookie.
- **Registro desde cero, de punta a punta, con mail real.** Alta desde `mesa.staging` → `auth.staging/crear-cuenta`
  con el `redirect` correcto → mail de `no-reply@menyu-app.com` en ~1 minuto **con la plantilla de MenYU** y un
  link con `token_hash=pkce_…`. Abierto **en otro navegador** (no el del registro), `/confirmar-email` borra el
  token de la barra, pide confirmar y devuelve a `mesa.staging` logueado. Esto es exactamente lo que la
  plantilla de seguridad tenía que lograr.
- **La mesa a nombre del cliente, por el camino nuevo.** `POST /sessions/open` manda
  `Authorization: Bearer` con un JWT **ES256** y la sesión queda con el `Cliente` de la cuenta, estable: repetir
  el `open` con el mismo token devuelve el mismo `clienteId`.
- **`/auth` de web-cliente**: redirige con el `redirect` armado; `?tab=register` va a `/crear-cuenta`; un
  `?volver=` interno se conserva y `https://evil.example.com` **se descarta** y cae a `/`.
- **Google como cliente** volvió a `mesa.staging` con el nombre que trae Google, sin reCAPTCHA. Salvedad de
  alcance: la única cuenta de Google con sesión viva es además MOZO del restaurante de prueba, así que lo que
  quedó probado es que **el `redirect` a web-cliente le gana al destino por rol**; una cuenta de Google *sin*
  ninguna membresía no se probó con Google (sí con contraseña, en la 4b).
- **El login propio ya no existe**: los cinco endpoints responden **404** y `GET /auth/me` sin token **401**.
- **Recuperación de contraseña**: el link llega con la plantilla de MenYU y un `token_hash=pkce_…`; se tomó el
  `href` sin abrirlo, así que el token **no se gastó**.

**Limpieza:** las 3 sesiones de mesa abiertas se cerraron con `POST /sessions/close` (200), `GET
/sessions/activas` quedó en `[]` y la mesa 1 en `"libre"`. No se creó ningún pedido ni pago. El repo quedó
intacto. **Quedó creada una cuenta de cliente de prueba** que hay que decidir qué hacer con ella (§5).

**No verificado por falta de acceso:** la fila `cliente.nombre = 'Invitado'` en la base de staging (se infirió
de la red, del `clienteId` nuevo, del header de la app y del código), y el `localStorage` de web-admin en
particular (sí se verificó en web-cliente, web-auth y web-staff: la sesión está solo en la cookie).

---

## 4. Pendientes priorizados

### 4.1 Bloqueante — no se puede demostrar auth sin esto

**B1. La Fase 5 no está en producción, y su migración es irreversible.**
Producción corre v1.3.0 (`6ce5680`), que no contiene `20261025120000_fase5_login_legacy`. Para cerrarla hay que:
el respaldo previo fuera del repo de `admin`, `admin_restaurante`, `refresh_token` y los `password_hash` de
`mozo` y `cliente` (decisión 4 de la Fase 5); comprobar que en producción no haya vistas, políticas o funciones
que referencien `admin` (en local no hay ninguna, y es justo la clase de cosa que ningún grep ve — es lo que
rompió el E2E de staging); y el tag. Riesgo adicional que la spec ya marca: si el servicio de producción de
Railway volviera a conectarse a GitHub, un cambio de variables construiría `main` y aplicaría los DROP, así que
el respaldo tendría que estar hecho **antes del merge**, no antes del tag.

**B2. Queda abierto el quality gate de SonarCloud sobre el código nuevo de la Fase 5** (criterio 5).
La "nueva versión" de referencia en SonarCloud sigue apuntando a *Previous version* del 17/10 según
`docs/calidad/bitacora.md`, así que el código de la fase todavía no se midió contra el gate. Es lo único que
resta de lo que la spec dejaba en "Sin verificar todavía" (`auth.md:612`): **el criterio 4 se cerró** en la
verificación del 2026-10-27 (§3.7) —registro desde cero con mail real, login, la mesa a nombre del cliente y
el QR sin cuenta como "Invitado", los cuatro por el camino nuevo— y **Google también quedó probado**, con la
salvedad de alcance que anota §3.7. Sin el gate, la Fase 5 no se puede marcar ✅ según su propio criterio.

### 4.2 Importante — funciona, pero es deuda que conviene cerrar antes del chatbot

**I1. Documentación que describe el login borrado en presente.** Es la razón por la que el criterio 2 de la
Fase 5 no se cumple en su lectura literal. Los ocho lugares:
`doc.md:30,34,83,110,165,173,194` (la **API Reference de la raíz**, el documento más expuesto del repo, que
arranca con `POST /api/auth/login`), `Documentacion/modulo-usuarios-y-autenticacion.md` (13 líneas),
`Documentacion/Doc_DB.md:104` (`password_hash` como columna actual), `Documentacion/modulo-menu.md:549`,
`docs/calidad/e2e-supabase.md:149` (la matriz de permisos nombra `cliente.password_hash`),
`docs/auth/VariablesACambiar.md:94,136,146`, `Documentacion/datos-de-prueba-local.md:22` (dice que el seed
sigue creando `root@menyu.com`/`root1234`, que ya no existe). Los resúmenes de sprint y las bitácoras **no**
cuentan: narran el pasado y están fechados.

**I2. `docs/plan-consola-root.md:160-171` documenta cinco rutas borradas como vigentes.**
`PATCH /root/duenos/:id`, los dos `restablecer-password`, `DELETE /root/duenos/:id` (con el id viejo, hoy es
`:membresiaId`) y `POST /auth/cambiar-password`. Además dice que `POST /root/marcas/:id/duenos` recibe
`{ email, password? }` y "devuelve la contraseña inicial", que "las contraseñas se guardan con bcrypt", y
nombra la tabla `refresh_token` y `debeCambiarPassword`. No es un apéndice histórico: la línea de entrada
(`:150`) fue parcheada en su lugar, así que la tabla se lee como vigente — y `CLAUDE.md` remite a ese archivo
como la autoridad de la consola de ROOT.

**I3. La lista de verificación en staging no cubre la Fase 5 y no existe como archivo.**
Vive dentro de la spec (`auth.md:472-481`) y su alcance es la Fase 4. `docs/checklist-qa-staging.md` es el de
Discovery y todavía dice "los tres frontends" (`:24`). Los pendientes de la Fase 5 están sueltos en prosa
(`auth.md:612,614`), sin casilleros.

**I4. `packages/types/src` está fuera de SonarCloud, y no tiene lint ni tests propios.**
`sonar-project.properties:8,11,23` no lo incluye, y su `package.json:18-19` tiene `lint` y `test` de mentira.
Desde la Fase 5 ese paquete contiene `permisos.ts`, la **matriz de autorización** que web-admin importa como
código fuente por el subpath. Está cubierta indirectamente por `puede-invitar.spec.ts` (backend) y
`personal.spec.ts` (web-admin), pero no entra en el quality gate ni en la cobertura.

**I5. Nada en CI protege la regla dura de la carga diferida de web-cliente.**
"Ningún archivo de web-cliente puede importar `@menyu/auth-client` de forma estática" es una regla de
`CLAUDE.md` que hoy se cumple (lo verifiqué: todo lo demás es `import type`), pero que **la revisión de la
Fase 5 encontró violada dos veces**. No hay regla de ESLint, ni test de bundle, ni assertion de tamaño que
atrape una regresión; y `@supabase/supabase-js` está declarado como dependencia directa de web-cliente, así
que un import estático no haría ruido en typecheck ni en lint.

**I6. `eslint --max-warnings 0` falla con una carpeta `coverage/` presente, en tres apps.**
La spec lo documenta solo para web-admin; está comprobado que vale igual para **web-staff y web-cliente**:
sus `eslint.config.js:8` tienen `{ ignores: ['dist'] }`, mientras web-auth ya tiene `['dist', 'coverage']`.
El reporte lcov genera JS y HTML que eslint lintea. Arreglo de una línea en cada una.

**I7. CORS más amplio de lo necesario.** `http://localhost:<puerto>` siempre permitido, en todos los ambientes,
con `credentials: true`; y `CORS_ORIGIN_PATTERNS` compilado sin anclar. Ver §3.3.1 y §3.3.2 para el alcance real.

**I8. Los porcentajes de cobertura que declara la spec no están forzados por nada.**
No hay `thresholds` ni `coverageThreshold` en **ninguna** config del monorepo, y los cuatro frontends corren
`vitest run --passWithNoTests`: si los specs dejaran de ser descubiertos (un cambio de `include` o de carpeta),
el CI pasaría en verde con 0 tests.

**I9. `CLAUDE.md`**: el encabezado de la sección de auth dice "(migración en curso)" (`:116`) cuando la Fase 5
la cerró; `:206` dice "con las 3 apps separadas" (son 4 desde la Fase 3, y es el último "3 frontends" de la
documentación viva); el árbol del backend nombra `restaurant/` y `tables/` (`:63-64`), que se llaman
`restaurante/` y `mesas/`, y omite 15 módulos que sí existen; el árbol de `packages/types` (`:79-92`) no
incluye `permisos.ts`; y la tabla de tipos de usuario (`:103-108`) no nombra `JEFE_SALON`.

**I10. `Documentacion/WORKFLOW.md`**: `:131` dice que el nombre del proyecto de staging importa porque "el
login entre apps (`resolveAppUrl` y `resolveLoginUrl`) depende de él" — las dos funciones ya no existen;
`:92` omite web-auth del deploy preview con la CLI; `:67` dice 3 workflows (hay 5, y `e2e-staging.yml` y
`carga-k6.yml` no están documentados); `:47` promete una Preview URL por PR y `:112` dice lo contrario (lo
cierto es `:112`); `:169` pide Node >= 20.

**I11. `verify-carrito.js` y `verify-carrito.mjs`**: ya triageados por el equipo (§3.3.4). Queda decidir el
borrado de los dos archivos —no los referencia nada más que `.claude/settings.json:7`— y si `JWT_SECRET` se
rota, que depende de si el secreto local se reusó en staging o producción.

**I12. `.dockerignore` no excluye `*.e2e-spec.ts`.** Excluye `**/*.spec.ts` (`:33`), y de eso depende que el
build de Docker funcione, porque el backend declara `@menyu/types` como devDependency. Pero el backend no tiene
`tsconfig.build.json` y su `include` es `src/**/*`, así que `sessions.e2e-spec.ts` **sí** se compila dentro de
la imagen. Hoy no importa el paquete; si lo hiciera, rompería el deploy igual que un `.spec.ts`. Es la misma
trampa que `auth.md:610` advierte, con un archivo que nadie está mirando.

### 4.3 Menor — limpieza, docs, nice-to-have

| # | Pendiente | Dónde |
|---|---|---|
| M1 | Cuatro comentarios que describen cosas borradas como vigentes | `session-auth.guard.ts:22-24`, `supabase-auth.guard.ts:28`, `membresia.guard.ts:7`, `orders.service.spec.ts:19` |
| M2 | Los 7 puntos de spec desactualizada | §3.5 |
| M3 | Ampliar la excepción del criterio 2 con `menyu_refresh_token` | `auth.md:581` |
| M4 | Que `/` de web-auth muestre el error de OAuth: con el `bad_oauth_state` (el estado vence a los 5 min) la persona ve el login sin explicación | `IngresarPage.tsx`; `errorDeOAuth` ya existe en `mensajes.ts:50` |
| M5 | `127.0.0.1` fuera de la regla de desarrollo: "Ingresar" va al web-auth de producción y termina en `/sin-acceso` | `urlDeAuth.ts:23` |
| M6 | Los fallbacks a producción ante un host desconocido | `destinos.ts:24`, `urlDeAuth.ts:26` |
| M7 | Rama muerta de `BAJA_CORTA_EL_LOGIN = true` (~10 líneas vivas solo por su test) | `web-admin/src/pages/root/copy.ts:13,72,86,106,122,133` |
| M8 | Tercer call site de `cargarAuthClient()` sin compuerta (inofensivo) | `web-cliente/src/utils/cuenta.ts:70` |
| M9 | El texto de la baja duplicado a mano entre dos apps, sin fuente común | `MesaSinCarta.tsx:68-72` vs `web-admin/src/pages/root/copy.ts:80-87` |
| M10 | `irAlLogin()` manda la URL completa, query incluida | `navegacion.ts:6-9` |
| M11 | `apps/cliente/` es miembro del workspace con un solo `expo-env.d.ts` y sin `package.json` | `pnpm-workspace.yaml:2` |
| M12 | Sacar la clave `prisma` de `package.json` (deprecada; ya hay `prisma.config.ts` que la sobreescribe) | `apps/backend/package.json` |
| M13 | Subir el `testTimeout` de web-admin (flake de 5 s bajo carga) | `web-admin/vitest.config.ts` |
| M14 | Documentar que `pnpm build` no regenera el cliente de Prisma si el build del backend da cache hit | `WORKFLOW.md` / `CLAUDE.md` |
| M15 | Dos topes distintos para el mismo recorrido de rutas (`>= 115` vs `> 80`) | `rutas-por-autenticacion.spec.ts:151`, `root-routes.spec.ts:19` |
| M16 | Invitar a un email con cuenta confirmada invalida su link de "olvidé mi contraseña" pendiente (documentado en el código) | `invitaciones.service.ts:161-163` |
| M17 | `POST /auth/invitaciones` exige UUID mientras `/root` a propósito no (la base tiene ids `m-001`) | `crear-invitacion.dto.ts:26,31` |
| M18 | El default de `QR_BASE_URL` apunta al web-cliente de producción | `mesas.service.ts:113` |
| M19 | Anotar que `turbo run test` cancela tareas al primer fallo (usar `--continue` para auditar) | `WORKFLOW.md` |
| M20 | `packages/ui` y `packages/auth-client` tienen `lint` placeholder: cero reglas de ESLint sobre el paquete que decide qué app le toca a cada perfil | sus `package.json` |
| M21 | `.env.example` de la raíz sin `DIRECT_URL` (lo exige `schema.prisma:8`); `VITE_WS_URL` solo como comentario en los 3 frontends que la leen; `APP_COMMIT_SHA` y `TEST_DATABASE_URL` sin documentar | los `.env.example` |
| M22 | El comentario de `JWT_SECRET` sigue genérico y no dice que hoy solo firma la sesión de mesa y el `state` de MP | `apps/backend/.env.example:25-26`, `.env.example:4-5` |
| M23 | El smoke de staging prueba previews, no `*.staging.menyu-app.com` | `deploy-staging.yml:179-182` |
| M24 | **`/check-in` no reenvía el `restaurantId` del QR**, así que la validación cruzada que `CLAUDE.md` documenta para `POST /sessions/open` ("valida que la mesa sea de ese restaurante, 409 si no") nunca corre desde el camino del QR impreso, que es justo el que tiene el dato a mano. El backend la cumple (`sessions.service.ts:169`) y el hook ya soporta el campo (`useEntrarAMesa.tsx:9`); `IngresoMesaPage.tsx:89,106` sí lo manda. **No es un agujero** (el `qrToken` es el secreto y ya identifica la mesa), es defensa en profundidad sin ejercitar. Arreglo de una línea | `CheckInRedirectPage.tsx:50,56` (lee el valor en `:28` pero solo para el fallo) y `DiscoveryPage.tsx:76` |
| M25 | **Un `menyu_sesion_id` viejo en `sessionStorage` hace que `/check-in` no abra la mesa**: el corto confía en el id guardado sin comprobar que la sesión siga activa, así que no emite ningún `POST /sessions/open` y deja a la persona en una sesión muerta. Severidad baja (`sessionStorage` muere con la pestaña) pero el síntoma es malo —escaneás el QR de tu mesa y no se abre— y el caso es alcanzable: misma pestaña, el mozo cierra la sesión, volvés a escanear. Observado en la verificación de §3.7 | `CheckInRedirectPage.tsx:46-49` |
| M26 | **Con las cuentas de cliente la cookie se parte en `-auth-token.0` y `.1`** (el JWT es más largo: trae `user_metadata` con el nombre), mientras con las del personal es una sola. Las dos partes tienen los atributos correctos, así que no es una falla; pero la spec y los docs hablan de `sb-<ref>-auth-token` en singular, y cualquier cosa que matchee el nombre exacto (un test, un script de limpieza, un chequeo de "¿hay sesión?") se perdería las cuentas de cliente. Conviene que el doc lo diga | `auth.md` (Dominios, 4.1); `web-cliente/src/utils/cuenta.ts:99-116` (`puedeHaberSesion`, que sí usa prefijo) |
| M27 | Después del login con Google quedan las cookies `-code-verifier` del PKCE. El verifier ya se canjeó y es de un solo uso, y "Cerrar sesión" las borra. Higiene nomás | observado en §3.7 |
| M28 | **Dato sucio preexistente en staging**: el panel de cocina muestra un pedido en "Listo" de la mesa 1 de hace ~7,6 días, de una sesión ya cerrada (del armado del ambiente, el 20/10). Ensucia la vista de cocina de quien pruebe ahí | base de staging |

---

## 5. No verificable desde el código — checklist para el equipo

### Supabase (los dos proyectos)

- [ ] Data API (PostgREST) **desactivada**, o RLS en todas las tablas de `public`. Verificar con
      `curl "$SUPABASE_URL/rest/v1/restaurante?select=id&limit=1" -H "apikey: <publishable key>"`: no puede
      devolver filas (en staging daba 503 `PGRST002`).
- [ ] JWT Signing Keys **asimétricas** activas: `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` devuelve al
      menos una clave ES256/RS256 en ambos.
- [ ] Site URL `https://auth.menyu-app.com` / `https://auth.staging.menyu-app.com`, con las Redirect URLs de
      invitación, reset, confirmación y callback de Google, más `http://auth.menyu.local:5173/**` en staging.
- [ ] Las **tres** plantillas cargadas en los dos proyectos: "Invite user", "Reset password" y
      **"Confirm signup"** (esta es un requisito de **seguridad**, no de uso).
- [ ] "Confirm email" **activo** en los dos (sin eso, un registro público queda confirmado al instante y la
      invitación lo reutilizaría).
- [ ] SMTP de Resend activo, remitente `no-reply@menyu-app.com`. Si cambia el proveedor, actualizar
      `/privacidad` **y su fecha de vigencia**.
- [ ] Provider Google habilitado en los dos.
- [ ] **Objetos instalados en la base, que ningún grep ve**: que la definición vigente de `e2e.e2e_limpiar` en
      staging no mencione `password_hash`, siga siendo `SECURITY DEFINER` de `postgres` y `e2e_staging`
      conserve el `EXECUTE`. Si el E2E se instala alguna vez en producción, aplicar ahí
      `scripts/e2e-staging/sql/e2e-limpiar-sin-password-hash.sql`.
- [ ] **Antes del tag de la Fase 5 (B1)**: que en producción no queden vistas, políticas ni funciones que
      referencien `admin`, `admin_restaurante`, `refresh_token` o los `password_hash`.
- [ ] **Antes del tag de la Fase 5 (B1)**: respaldo fuera del repo de `admin`, `admin_restaurante`,
      `refresh_token` y los `password_hash` de `mozo` y `cliente`.

### Vercel (6 proyectos)

- [ ] `menyu-auth` (dominio `auth.menyu-app.com`) y `menyu-auth-staging` (`auth.staging.menyu-app.com`) creados
      como los otros: Root Directory `apps/web-auth`, "Include source files outside of the Root Directory"
      activado, rama de producción `main`, sin Deployment Protection.
- [ ] Variables de los dos proyectos de web-auth: `VITE_API_URL`, `VITE_SUPABASE_URL`,
      `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_AUTH_COOKIE_DOMAIN` (`.menyu-app.com` / `.staging.menyu-app.com`).
      web-auth **no** usa `VITE_WS_URL` ni `VITE_AUTH_URL`.
- [ ] Las cuatro variables de la Fase 4/4b en `menyu-{admin,staff,cliente}` y sus `-staging`, en Production y
      Preview según la tabla de `VariablesACambiar.md:131-136`. El punto que más mordió: la publishable key en
      **Production** de `menyu-admin` y `menyu-staff`.
- [ ] Que la publishable key de cada proyecto sea la del Supabase **de ese ambiente**.
- [ ] Que los proyectos de producción sigan sin construir desde Git.

### Railway (los dos servicios)

- [ ] `CORS_ORIGINS` incluye `https://auth.staging.menyu-app.com` y `https://auth.menyu-app.com`, además de
      `mesa`, `admin`, `staff` y los `*.vercel.app` que siguen vivos. Y que los patrones de
      `CORS_ORIGIN_PATTERNS` estén **anclados** con `^…$` (el código no lo fuerza: §4.2 I7).
- [ ] `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en los dos (sin ellas, `/auth/me` y `/auth/invitaciones` dan 500).
- [ ] El servicio de **producción sigue desconectado de GitHub** (*Settings → Source*). Es parte del riesgo de B1.
- [x] ~~`QR_BASE_URL` definida en staging~~ — **comprobado el 2026-10-27**: el `qrImage` de la mesa 1
      decodifica a `https://mesa.staging.menyu-app.com/check-in?…`, así que no cae en el fallback a producción.
      Queda por verificar lo mismo en **producción**.
- [ ] `BASE_URL` sigue con la URL vieja de Railway a propósito, hasta tener acceso al panel de Mercado Pago.

### Cloudflare

- [ ] Registros de `auth.menyu-app.com` y `auth.staging.menyu-app.com` a Vercel, **sin proxy**.
- [ ] Que no haya subdominios colgados de `menyu-app.com`: la allowlist del `redirect` acepta cualquier
      `*.menyu-app.com` (§3.3).

### Google Cloud

- [ ] Cliente OAuth con los callbacks de los dos proyectos de Supabase; pantalla de consentimiento *In production*.
- [ ] Branding: página principal `https://mesa.menyu-app.com` y política de privacidad
      `https://auth.menyu-app.com/privacidad` — **no mover esa ruta ni dejarla caer**, Google la visita.

### GitHub

- [ ] Secret `VERCEL_PROJECT_ID_AUTH` = el ID de `menyu-auth` (producción). Sin él los dos deploys cortan a propósito.
- [ ] Variable `PROD_WEB_AUTH_URL` = `https://auth.menyu-app.com`.
- [ ] **Quality gate de SonarCloud de la Fase 5 en verde** (criterio 5; hoy el "código nuevo" sigue apuntando a
      *Previous version* del 17/10, según la bitácora). Es parte de B2.
- [ ] Decidir la rotación de `JWT_SECRET` por §3.3.4, y si las credenciales de Mercado Pago que quedaron en un
      archivo local (`.claude/settings.local.json`, gitignoreado) necesitan rotarse.
- [ ] Borrar la rama remota `origin/fix/356-mozo-id-desde-jwt` (absorbida en la 4.3; su migración ya no se
      puede aplicar porque crea una FK a `admin`).

### Datos de prueba de staging (de la verificación del 2026-10-27)

- [ ] **Decidir qué hacer con la cuenta de cliente `menyuprueba2+rev2710@gmail.com`** ("Revisor Fase Cinco",
      confirmada, `Cliente` `404ef2c3-d60b-449e-ad88-2fb76d185e4f`), creada para probar el registro de punta a
      punta. O se suma a `docs/auth/.env.usuarios-staging` como cuenta reutilizable, o se borra del Supabase de
      staging (hace falta la service role key, que la revisión no tiene). Su contraseña quedó en el scratchpad
      de la sesión: `C:\Users\dante\AppData\Local\Temp\claude\C--Users-dante-OneDrive-Escritorio-MenYU\3b63d914-0f39-47e3-b1a2-74d8e52ad591\scratchpad\cuenta-nueva.txt`
      (es temporal: si se la quiere conservar, moverla al `.env.usuarios-staging` antes de que se limpie).
- [ ] **El `tableCode` de la mesa 1 no está en `docs/auth/usuarios-prueba-staging.md`** (solo figura el PIN),
      así que la revisión tuvo que sacarlo de `GET /api/mesas` con el token del OWNER. Sumarlo al doc, o el
      link completo del `/check-in`, ahorra ese paso en la próxima verificación.
- [ ] **Limpiar el pedido viejo en "Listo" de la mesa 1** (M28), que ensucia el panel de cocina de staging.

### Tesis (fuera del repo)

- [ ] Las decisiones que la spec manda documentar: la cookie sin `httpOnly`; el registro público de Supabase
      abierto sin que dé acceso sin `Membresia`; que ROOT puede invitarse como dueño con otra casilla (lo cubre
      el historial, no una barrera técnica); el vínculo por email con el `Cliente` del login anterior; la
      confianza en el `email_verified` de Google; y la publishable key en bundles públicos.

---

## 6. Propuesta de cierre

Un prompt por pendiente, agrupando los chicos. Los dos primeros no son sesiones de implementación: son
operación, y los hace el equipo.

### C1 — Release de la Fase 5 a producción (B1 + lo que queda de B2)

> **No es una sesión de código.** Operación, con el plan de `docs/auth/specs/auth.md` (Fase 5, "Para tener en
> cuenta en producción") a la vista.
>
> 1. Antes de nada, en el Supabase de **producción**: exportar fuera del repo `admin`, `admin_restaurante`,
>    `refresh_token` y los `password_hash` de `mozo` y `cliente`. Y consultar `pg_views`, `pg_policies` y
>    `pg_proc` buscando referencias a `admin`, `admin_restaurante`, `refresh_token` y esas columnas: es la
>    clase de objeto que ningún grep ve y que ya rompió el E2E de staging una vez.
> 2. Confirmar que el servicio de producción de Railway sigue **desconectado de GitHub**.
> 3. Antes del tag, lo único que queda de verificación es el **quality gate de SonarCloud** sobre el código
>    nuevo de la fase: hoy la referencia de "código nuevo" está en *Previous version* del 17/10, así que el
>    código de la Fase 5 todavía no se midió contra el gate. El resto del criterio 4 ya está cerrado en staging
>    (§3.7 de esta revisión: registro desde cero con mail real, login, la mesa a nombre del cliente, el QR sin
>    cuenta como "Invitado" y la carga diferida con 0 chunks).
> 4. Tag `vX.Y.Z` y, después del deploy: smoke de producción, `GET /health` con el SHA del tag, y comprobar que
>    los cinco endpoints del login responden 404.
> 5. Marcar la Fase 5 con ✅ y su fecha en la spec, y actualizar el encabezado de `CLAUDE.md:116`, que todavía
>    dice "(migración en curso)".

### C2 — Documentación: retirar el login borrado de lo que se lee en presente (I1 + I2 + I3)

> Sesión de solo documentación, sin tocar código. Objetivo: que el criterio 2 del "Terminado cuando" de la
> Fase 5 se cumpla también en su lectura literal, y que nadie implemente contra una API que no existe.
>
> 1. **`doc.md`** (API Reference de la raíz, lo más expuesto del repo público): quitar `POST /api/auth/login`,
>    `/register` y `/refresh` con sus `{ accessToken, refreshToken }`, y reemplazarlos por `GET /auth/me` y
>    `POST /auth/invitaciones` con el esquema Bearer de Supabase. Revisar también las menciones a `password_hash`.
> 2. **`docs/plan-consola-root.md:160-171`**: la tabla de rutas de la consola describe cinco rutas que la 4.4
>    borró, dice que las contraseñas se guardan con bcrypt y nombra `refresh_token` y `debeCambiarPassword`.
>    Reemplazarla por la tabla de `auth.md` (4.4, "Las rutas de la consola que cambian") o marcar la sección
>    como planificación histórica, de forma explícita.
> 3. **`Documentacion/Doc_DB.md:104`**: sacar `password_hash`, o poner un encabezado que diga a qué sprint
>    corresponde el documento.
> 4. **`Documentacion/modulo-usuarios-y-autenticacion.md`**, **`modulo-menu.md:549`** y
>    **`Documentacion/datos-de-prueba-local.md:22`** (el seed ya no crea `root@menyu.com`): fechar como
>    histórico o corregir. Los resúmenes de sprint y las bitácoras no se tocan: narran el pasado.
> 5. **`docs/calidad/e2e-supabase.md:149`** y **`docs/auth/VariablesACambiar.md:94,136,146`**: la matriz de
>    permisos nombra `cliente.password_hash`, y los dos últimos dicen que "Ingresar" va al `/auth` de la app,
>    que desde la Fase 5 es un redirect a web-auth.
> 6. **`docs/checklist-qa-staging.md`**: dice "los tres frontends" (`:24`). Y crear la lista de verificación de
>    auth como archivo propio (hoy vive dentro de la spec, `auth.md:472-481`, con alcance Fase 4), con
>    casilleros y sumando los casos de la Fase 5.
> 7. **`CLAUDE.md`**: `:116` ("migración en curso"), `:206` ("las 3 apps separadas"), `:63-64`
>    (`restaurant/`→`restaurante/`, `tables/`→`mesas/`, más los 15 módulos que faltan), `:79-92` (`permisos.ts`
>    y los otros 4 archivos de types) y `:103-108` (la tabla de tipos de usuario no nombra `JEFE_SALON`).
> 8. **`Documentacion/WORKFLOW.md`**: `:131` (`resolveAppUrl` y `resolveLoginUrl` ya no existen; el login entre
>    apps sale de `VITE_AUTH_URL`), `:92` (falta web-auth en el deploy preview), `:67` (son 5 workflows, y
>    `e2e-staging.yml` y `carga-k6.yml` no están documentados), `:47` vs `:112` (la contradicción sobre los
>    previews de PR; vale `:112`), `:169` (Node >= 22).
> 9. Al cerrar, actualizar la lista de excepciones del criterio 2 en `auth.md:581` para incluir
>    `menyu_refresh_token`, y los 7 puntos de spec desactualizada del §3.5 de esta revisión.

### C3 — Proteger las reglas que hoy solo sostiene una revisión a mano (I5 + I8 + I4 + I6)

> Sesión de código, solo infraestructura de calidad. Ninguna de estas reglas está protegida por nada
> automático, y dos de ellas ya se rompieron una vez.
>
> 1. **La carga diferida de web-cliente** (`CLAUDE.md`: "ningún archivo de web-cliente puede importar
>    `@menyu/auth-client` de forma estática"). La revisión de la Fase 5 la encontró violada dos veces y nada en
>    CI la atrapa. Elegir **una**: una regla `no-restricted-imports` de ESLint en `apps/web-cliente` que
>    prohíba el import de valor de `@menyu/auth-client` y `@supabase/supabase-js` (permitiendo `import type`),
>    o un test que lea el bundle construido y falle si el chunk de entrada contiene supabase-js. La primera es
>    más barata y falla antes.
> 2. **Umbrales de cobertura.** No hay `thresholds` en ninguna config del monorepo, así que los porcentajes que
>    declara la spec (80 % en código nuevo, 100 % en `auth-client`) no los sostiene nada. Fijar un `thresholds`
>    por paquete, con los valores medidos hoy como piso: backend 97, web-auth 95, `auth-client` 100.
> 3. **Quitar `--passWithNoTests`** de los cuatro frontends, o dejarlo solo donde haga falta: hoy, si los specs
>    dejaran de ser descubiertos, el CI pasaría en verde con 0 tests.
> 4. **Sumar `packages/types/src`** a `sonar.sources`, `sonar.tests` y la cobertura, y darle un `lint` y un
>    `typecheck` reales en su `package.json`: desde la Fase 5 contiene `permisos.ts`, la matriz de autorización
>    que web-admin importa como fuente. De paso, `packages/ui` y `packages/auth-client` tienen `lint`
>    placeholder (`echo`): `auth-client` es el paquete que decide qué app le toca a cada perfil y no tiene
>    ninguna regla de ESLint encima.
> 5. **Agregar `'coverage'` al `ignores`** de `eslint.config.js` en web-admin, web-staff y web-cliente, como ya
>    tiene web-auth: está comprobado que `eslint --max-warnings 0` falla si quedó la carpeta de un
>    `test:coverage`, en las tres.
> 6. **Subir el `testTimeout`** de `apps/web-admin/vitest.config.ts` (hoy rige el default de 5 s y
>    `DuenosPage.spec.tsx:292` se pasa bajo carga paralela; aislado corre en 910 ms).
> 7. **Sumar `**/*.e2e-spec.ts` a `.dockerignore`**: hoy solo excluye `**/*.spec.ts`, y de esa exclusión depende
>    que el build de Docker no intente compilar `@menyu/types`. `sessions.e2e-spec.ts` sí entra a la imagen.
> 8. Documentar en `WORKFLOW.md` dos trampas de desarrollo que cuestan media hora cada una: que `pnpm build`
>    **no** regenera el cliente de Prisma si el build del backend da cache hit (hay que correr `prisma generate`),
>    y que `turbo run test` cancela las tareas pendientes al primer fallo (usar `--continue` para auditar).
> Cada cambio con su test donde aplique, y en el mismo commit.

### C4 — Endurecer CORS y el `redirect` (I7 + M4 + M5 + M10)

> Sesión de código, chica y acotada a dos archivos del backend y dos de los frontends. Ninguno de estos
> puntos es un agujero hoy; los cuatro reducen superficie.
>
> 1. **`apps/backend/src/common/is-allowed-origin.ts:12`**: `http://localhost:<puerto>` se acepta
>    incondicionalmente en todos los ambientes, con `credentials: true`, y la misma función valida el `Origin`
>    del que se derivan las `back_urls` de un pago (`payments.service.ts:336`). Restringirlo a desarrollo (por
>    `NODE_ENV`, o pasando los orígenes locales por `CORS_ORIGINS` como cualquier otro).
> 2. **`is-allowed-origin.ts:19`**: anclar los patrones en el código (`^(?:…)$`) en lugar de confiar en que
>    quien carga `CORS_ORIGIN_PATTERNS` escriba `^…$`.
> 3. **`apps/web-auth/src/pages/IngresarPage.tsx`**: mostrar el error de OAuth de la URL con el `errorDeOAuth`
>    que ya existe (`lib/mensajes.ts:50`). Es el hallazgo del `bad_oauth_state` de la 4.1: cuando el estado de
>    OAuth vence a los 5 minutos, Supabase manda a la Site URL (`/`) y la persona ve el login sin ninguna
>    explicación.
> 4. **`apps/web-cliente/src/utils/urlDeAuth.ts:23`**: sumar `127.0.0.1` a la regla de desarrollo, que hoy solo
>    mira `localhost`; desde ahí "Ingresar" va al web-auth de producción y termina en `/sin-acceso`.
> 5. **Opcional, `packages/auth-client/src/navegacion.ts:6-9`**: `urlDeLogin` arma el `redirect` con
>    `window.location.href` completo, query incluida. El destino es siempre el propio `auth.<ambiente>`, pero
>    un `qrToken` de la URL del QR viajaría ahí y quedaría en la barra, el historial y los logs. Recortar a
>    `pathname` más una allowlist de params.
> Cada cambio con su test, en el mismo commit.

### C5 — Limpieza final (los M que quedan)

> Sesión de código chica, sin cambios de comportamiento.
>
> 1. **Los cuatro comentarios que mienten**: `session-auth.guard.ts:22-24` (nombra `/auth/login` y
>    `/auth/guest`), `supabase-auth.guard.ts:28` ("el del JWT legacy"), `membresia.guard.ts:7` ("`@Roles` sigue
>    en uso hasta la Fase 5") y `orders.service.spec.ts:19`.
> 2. **`web-admin/src/pages/root/copy.ts`**: `BAJA_CORTA_EL_LOGIN` es `true` desde la Fase 4; quitar el flag y
>    las ~10 líneas de la rama `false`, con su parte del spec.
> 3. **El texto de la baja**, duplicado a mano entre `web-cliente/src/components/menu/MesaSinCarta.tsx:68-72`
>    y `web-admin/src/pages/root/copy.ts:80-87`: moverlo a `packages/types` o `packages/ui` para que haya una
>    sola fuente. Importarlo de web-admin **no** es opción: rompería la separación de bundles.
> 4. **`apps/cliente/`**: borrar la carpeta (solo tiene `expo-env.d.ts`, sin `package.json`) o excluirla del
>    workspace, para que el inventario de apps cierre.
> 5. **`apps/backend/package.json`**: sacar la clave `prisma`, deprecada y ya sobreescrita por
>    `prisma.config.ts`.
> 6. **Los `.env.example`**: sumar `DIRECT_URL` al de la raíz (lo exige `schema.prisma:8`), `VITE_WS_URL` como
>    clave en los tres frontends que la leen, y documentar `APP_COMMIT_SHA` y `TEST_DATABASE_URL`. Y corregir
>    el comentario de `JWT_SECRET`, que no dice que hoy solo firma el token de sesión de mesa y el `state` del
>    OAuth de Mercado Pago.
> 7. **Alinear los dos topes** de recorrido de rutas: `rutas-por-autenticacion.spec.ts:151` usa `>= 115` con 120
>    reales y `root-routes.spec.ts:19` usa `> 80`.
> 8. **Decidir sobre `verify-carrito.js` y `verify-carrito.mjs`**: son dos scripts manuales sin referencias
>    salvo `.claude/settings.json:7`, y traen un JWT real en un repo público (ya triageado por el equipo:
>    `docs/calidad/bitacora.md:35`). Borrarlos, y decidir aparte si `JWT_SECRET` se rota, según si el secreto
>    local se reusó en staging o producción.

### C6 — El `/check-in` de web-cliente (M24 + M25)

> Sesión de código chica, en un solo archivo de web-cliente. Los dos puntos salieron de la verificación en
> staging del 2026-10-27, no de la lectura del código.
>
> 1. **Reenviar el `restaurantId` del QR en `POST /sessions/open`.** `CheckInRedirectPage.tsx:50,56` llama
>    `entrar({ qrToken: tableCode })` y el body real que viaja es solo `{"tableCode":"…"}`, aunque la URL del
>    QR trae el `restaurantId` y la página ya lo lee (`:28`, hoy solo para la pantalla de fallo). El hook lo
>    soporta (`useEntrarAMesa.tsx:9`), el backend valida el cruce (`sessions.service.ts:169`, 409 si la mesa es
>    de otro restaurante) y `IngresoMesaPage.tsx:89,106` sí lo manda. Es la validación que `CLAUDE.md` promete
>    para `POST /sessions/open` y que, tal como está, nunca corre desde el camino del QR impreso. Mismo cambio
>    en `DiscoveryPage.tsx:76`. No es un agujero —el `qrToken` es el secreto y ya identifica la mesa— pero es
>    defensa en profundidad gratis.
> 2. **No confiar en el `menyu_sesion_id` de `sessionStorage` sin comprobar que la sesión siga activa.**
>    `CheckInRedirectPage.tsx:46-49` corta y navega a `/menu` si hay un id guardado, así que con un id de una
>    sesión ya cerrada el check-in **no emite ningún `POST /sessions/open`** y deja a la persona en una sesión
>    muerta: escaneás el QR de tu mesa y no se abre. Alcanzable en la misma pestaña cuando el mozo cierra la
>    sesión. Validar contra `GET /sessions/mesa/:mesaId/activa` o, más simple, dejar que el `open` decida y usar
>    el id guardado solo como optimización.
> Los dos cambios con su test, en el mismo commit.

---

## 7. Sugerencias fuera de la spec

Cosas que la spec no pide y que, a mi criterio, valdría considerar. Van aparte a propósito: **no** son
incumplimientos.

1. **Autenticar el gateway de Socket.io.** La spec lo declara fuera de alcance y es coherente, pero hoy el
   gateway tiene `cors: '*'`, no autentica nada, y cada conexión se une a la sala del `restauranteId` que
   manda, sin que nadie la saque nunca. La 4.6 lo resolvió del lado del cliente (la conexión recuerda su sala y
   reconecta al cambiar de restaurante), y los handlers del socket compartido no filtran por restaurante. Es el
   único lugar del sistema donde el modelo de permisos que construyeron estas cinco fases no llega.
2. **Un `GET /clientes/me`**, con su propio guard, si la fidelización de v2 necesita el `Cliente` del comensal.
   La 4b lo dejó anotado y la decisión de no tocar `/auth/me` fue correcta; cuando haga falta, la forma ya
   está pensada.
3. **Precargar el nombre del comensal** con el de la cuenta en `/elegir-nombre`: hoy, después de abrir la mesa
   con la cuenta, web-cliente pide "Tu nombre" con el campo vacío. Lo anotó la 4b.
4. **Reenviar una invitación no aceptada.** No existe la forma, ni para el personal ni para una cuenta ROOT;
   el workaround documentado es pedir un link desde "Olvidé mi contraseña". Si el equipo invita gente seguido,
   es la clase de hueco que genera soporte.
5. **Cerrar la deuda de los pagos que la 4.3 dejó anotada** (es previa a auth, pero la toca): cerrar una mesa
   no cancela los pagos pendientes, y `confirmarEfectivo` no mira si la sesión sigue abierta, así que un
   efectivo pendiente de una mesa cerrada se puede confirmar después y eso reescribe `cerradaEn` y libera una
   mesa que ya tiene otra sesión.
6. **Un cartel de "no pudimos cargar los datos"** cuando un 401 persiste después de renovar la sesión: hoy la
   pantalla queda vacía y sin explicación en web-admin y en web-staff. Es deuda de interfaz que las dos
   entregas anotaron, y la razón de no mandar al login es correcta (sería un loop).
7. **Validar el `redirect` al entrar, no solo al salir** (`web-auth/src/flujo/rutas.ts:2-5`): hoy el valor
   crudo se propaga entre pantallas y dentro del `redirectTo` de OAuth, y queda visible en la barra de
   `auth.<ambiente>`. No es un open redirect, porque la validación está en el único punto donde se navega.

---

## Cierre (2026-10-28)

Rama `chore/cierre-auth`, en cinco etapas (`plan-cierre-auth.md`; el detalle, en `cierre-auth-bitacora.md`).

**Release (B1).** Tag **v1.4.0** sobre `main` en `94fe19f` (`94fe19f85de311d525ca2bec7fd73da8fd70dbb2`). Run
`40737755116` de "Deploy — Production" con los tres jobs en verde. El smoke se volvió a correr: su espera de 8 min
venció porque un incidente de Railway demoró el build unos 15 min. El procedimiento y su checklist están en
`release-fase5.md`. La Fase 5 tiene su ✅ en la spec y `CLAUDE.md` ya no dice "(migración en curso)".

- **Antes del tag** (SQL Editor, solo lectura): en producción, la última migración era
  `20261021141707_fase4_autoria_usuario`, sin fallidas. Vistas, funciones y políticas (1.2) y dependencias (1.3) dieron
  0 filas, y el proyecto no tiene pg_cron (1.4). En staging, de control, también 0 filas. Railway producción quedó sin
  source y `JWT_SECRET` se rotó en los dos ambientes (§3.3.4, I11).
- **Después del deploy:**
  - `/health` con `"sha":"94fe19f…"` y `"db":"ok"`.
  - Los cinco endpoints del login en 404 y `GET /api/auth/me` sin token en 401.
  - `/docs-json` solo con `/api/auth/invitaciones` y `/api/auth/me`.
  - El smoke local, 6 de 6.
  - En la base, `20261025120000_fase5_login_legacy` aplicada, sin `admin`, `admin_restaurante`, `refresh_token`,
    `rol_admin` ni `admin_proteger_ultimo_root()`, y con 0 de las tres columnas.

**Desviaciones del checklist** (decisiones del usuario):

- **Respaldo omitido:** los datos del login anterior en producción eran de prueba.
- **SonarCloud salteado:** la referencia de "código nuevo" no se movió, porque la cuenta del usuario no es
  administradora de la organización. El gate pasó en el CI de `94fe19f`, pero contra *Previous version* del 17/10, así
  que **B2 queda abierto**: el ✅ de la Fase 5 se puso sin que la fase se midiera sola.
- **La cuenta `menyuprueba2+rev2710@gmail.com` se borró** del Supabase de staging, en lugar de sumarse a
  `.env.usuarios-staging`.
- Además, un `POST /api/auth/guest` corrido antes de que se sirviera el SHA nuevo creó en producción un `Cliente`
  "Invitado" de más, sin sesión.

**Lo que cerró la rama:**

- C1, salvo el gate y el respaldo (omitido).
- C2 entero.
- C6: M24 entero y M25 en parte. Una sesión nueva hereda el comensal y el carrito de la anterior.
- C3, los puntos 1, 5 y 8 (I5, I6, M14 y M19).
- C5, el 8: los `verify-carrito.*` se borraron y `JWT_SECRET` se rotó.
- M26, en la Etapa 3: la cookie partida en `…auth-token.0` y `.1` está en `CLAUDE.md:157` y `auth.md:19`.
- M8, también en la Etapa 3: `auth.md:577` documenta el tercer lugar que carga `cargarAuthClient()`
  (`cerrarSesionDeLaCuenta`) como intencional, porque solo se alcanza con una sesión abierta. No queda nada por hacer.

**Para la sesión de limpieza:**

- B2: medir la Fase 5 sola en SonarCloud.
- C3, los puntos 2, 3, 4, 6 y 7 (I8, I4 con M20, M13 e I12).
- C4 entero (I7, M4, M5 y M10).
- C5, los puntos 1 a 7.
- La sección 7.
- Los M de §4.3 que no entraron en ninguna propuesta: M6, M16 a M18, M23, M27 y M28.
- Los casilleros de §5 que este cierre no tocó. Entre ellos, la mitad de Mercado Pago del de la rotación (GitHub): si
  las credenciales de Mercado Pago que quedaron en `.claude/settings.local.json` necesitan rotarse, nadie lo evaluó.
- Lo acumulado en "Para la sesión de limpieza" de `cierre-auth-bitacora.md`: el resto de M25, el "Invitado" de más y
  lo que anotó cada etapa.
