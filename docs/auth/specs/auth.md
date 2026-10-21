# Spec: Autenticación y autorización (MenYU)

> Ubicación: `docs/auth/specs/auth.md`. Claude Code ejecuta UNA fase por sesión.
> Antes de empezar una fase: leer esta spec completa y el CLAUDE.md.
> Al terminar una fase: invocar al subagente `revisor`, corregir lo que reporte, marcar la fase como hecha acá y actualizar el CLAUDE.md.

## Objetivo

Un login central para el personal del restaurante y para los clientes que quieran tener una cuenta (opcional), con sesión compartida entre todas las apps de MenYU (SSO), y autorización por rol y restaurante controlada por nuestra propia base de datos.

## Decisiones cerradas

- **Autenticación:** Supabase Auth con dos métodos: email + contraseña, y Google (OAuth). No hay auth server propio (el flujo AuthCode quedó cancelado).
- **Autorización:** vive en nuestro PostgreSQL vía Prisma, NO en los metadatos de Supabase. Supabase dice *quién es*; nuestra DB dice *qué puede hacer*.
- **Alta de personal solo por invitación:** quien tiene permiso de invitar lo hace por email desde el panel (Supabase invite). No hay registro público *de personal*. El registro público de Supabase sí está habilitado porque lo usan los clientes: cualquiera puede crear una cuenta o autenticarse con Google, pero sin `Usuario` + `Membresia` en nuestra DB los endpoints del personal lo rechazan (403). Esto es intencional y se documenta en la tesis.
- **Roles:** alineados con el dominio que ya existe (marcas con sucursales). `OWNER` es dueño de una marca; `GERENTE`, `JEFE_SALON`, `MOZO` y `COCINA` trabajan en un restaurante. `ROOT` (administración general de MenYU) no es una membresía sino el flag `Usuario.esRoot`, y no es un bypass (ver CLAUDE.md).
- **Membresías:** un usuario puede tener más de una (tabla `Membresia`). La de `OWNER` se asocia a una marca y cubre todas sus sucursales, incluidas las que se creen después; las demás, a un restaurante. Un CHECK en la base garantiza que cada membresía tenga exactamente el ámbito que le corresponde. Un solo rol por (usuario, restaurante) y por (usuario, marca).
- **Login central:** app `web-auth` en `auth.menyu-app.com`, única pantalla de login de MenYU (personal y clientes). Las demás apps no tienen login propio. web-admin y web-staff exigen sesión: si no hay, redirigen a `auth.menyu-app.com?redirect=<url>`. En web-cliente la sesión es opcional (ver Clientes).
- **SSO:** sesión de Supabase guardada en cookie con dominio compartido (vía `@supabase/ssr`, `createBrowserClient` con `cookieOptions.domain`). El dominio de la cookie sale de una variable de entorno (`VITE_AUTH_COOKIE_DOMAIN`): `.menyu-app.com` en producción, `.staging.menyu-app.com` en staging y `.menyu.local` en desarrollo.
- **API:** el frontend envía el access token de Supabase como `Authorization: Bearer <token>` a `api.menyu-app.com`. El backend no depende de la cookie. Verifica el token con las JWT Signing Keys asimétricas del proyecto (JWKS), no con el JWT secret legacy.
- **Clientes:** la cuenta es opcional. Entrar a una mesa por QR o PIN no requiere login (`SesionMesa`, flujo existente). Un cliente puede registrarse e iniciar sesión en web-auth (email + contraseña o Google); su cuenta de Supabase se vincula a la tabla `Cliente` por `Cliente.supabaseUserId`. Una cuenta de cliente nunca da acceso a web-admin ni a web-staff.
- **Convivencia con el modelo actual:** `Membresia` es la única fuente de permisos. `Mozo` sigue existiendo como perfil operativo por restaurante (pagos, asignaciones, llamados, `MozoMesa`, ediciones) y se vincula al usuario con `Mozo.usuarioId`. `Admin`, `AdminRestaurante`, `RefreshToken` y los `passwordHash` se retiran en la Fase 5; antes, `PedidoEdicion.adminId` pasa a apuntar a `Usuario`. El JWT propio (`JWT_SECRET`) queda solo para el token de sesión de mesa y el `state` del OAuth de Mercado Pago.
- **Cuentas existentes:** no se migran contraseñas. El personal se recrea por invitación desde el panel; si el email invitado coincide con un `Mozo` del mismo restaurante, la invitación lo vincula. Los clientes registrados se registran de nuevo.
- **Accesibilidad:** fuera de esta spec por ahora. WCAG se aborda en una etapa posterior.
- **Diseño de web-auth:** se construye con la skill `frontend-design` de Anthropic. Los colores y la tipografía definidos acá (naranja coral y azul marino del logo) quedan como tokens reutilizables por las demás apps.

## Decisiones de la planificación (2026-10-19)

1. **Mapa de apps:** `web-staff` cubre mozo y cocina (ya tiene `/mozo/*` y `/cocina`). Es un solo subdominio y el ruteo MOZO / JEFE_SALON / COCINA es interno a esa app.
2. **Roles y membresías:** alineados con el código (ver Roles) en lugar de `ADMIN / JEFE_SALON / MOZO / COCINA` por restaurante, para no perder el nivel marca ni la distinción OWNER / GERENTE que ya usan el backend y web-admin.

En la misma sesión se decidieron también los puntos **Clientes**, **Convivencia con el modelo actual** y **Cuentas existentes** de Decisiones cerradas.

## Decisiones de la planificación de la Fase 2 (2026-10-20)

1. **Los endpoints existentes pasan al guard nuevo en la Fase 4**, en la misma entrega que los frontends, para que backend y frontends cambien de token a la vez. Son 43 `@Roles(...)` legacy en 13 controllers, 8 `@RequiresTipo('admin','mozo')`, las verificaciones del JWT propio a mano en `orders`, `pedidos` y `waiter-calls`, y los chequeos de pertenencia (`assertStaffAccess`, `common/assert-owner-access.ts` y los `assertRestauranteOwnership` privados de cada service). En la Fase 2 solo cambia `GET /auth/me`.
2. **Una cuenta de Supabase sin confirmar no se reutiliza al invitar:** se borra y se manda la invitación normal. Como el registro público está abierto, cualquiera puede crear una cuenta con el email de un empleado; si se usara esa cuenta, quien la creó conocería su contraseña y, cuando el dueño del email la confirmara, entraría con acceso de personal.
3. **Tests:** además de los 5 del guard, un test de tabla de la matriz de quién invita a quién, que es la parte con más riesgo de escalada de privilegios.

## Decisiones de la planificación de la Fase 3b (2026-10-21)

1. **El backend no cambia.** `SupabaseAuthGuard` resuelve el `Usuario` por el `sub` del token. Cuando un invitado entra con Google usando el mismo email, Supabase vincula la identidad de Google a esa cuenta y el `sub` no cambia. Una cuenta de Google sin invitación es una cuenta nueva sin `Usuario`: `/auth/me` da 403 y web-auth la manda a `/sin-acceso`.
2. **Vuelta a `/google`.** El `redirect` viaja en el `redirectTo` de `signInWithOAuth` y se vuelve a validar al llegar. El canje del `?code=` lo hace el cliente de Supabase al inicializarse; `/google` lee de `auth.initialize()` si falló, y lee de la URL el error de OAuth (al cancelar en Google, Supabase puede devolver solo `error=access_denied`, que supabase-js no detecta). Si salió bien, sigue a `/`, que hace el post-login de siempre.
3. **`prompt=select_account`.** Cerrar sesión en MenYU no cierra la de Google: sin el selector de cuentas, quien entró con la cuenta equivocada vuelve a entrar con la misma.
4. **El botón va arriba del formulario en `/` y también en `/invitacion`**, no en `/restablecer-contrasena`. En `/invitacion` no gasta el `token_hash` (se canjea recién al guardar la contraseña): si el email de Google no es el de la invitación, el link del mail sigue sirviendo.

## Decisiones de la planificación de la Fase 4 (2026-10-21)

1. **Personal mínimo en web-admin.** La Fase 4 suma invitar, listar y quitar acceso, que reemplazan el alta de mozos y gerentes con contraseña: con el token nuevo, esas cuentas no entran a nada. Usa `POST /auth/invitaciones`.
2. **El backend de la consola de ROOT va en la Fase 4.** Si no, la consola se rompe el día del cambio: sus 19 rutas usan el JWT legacy y `actorDe` lee `admin`. Incluye:
   - `@RequiereRoot()` y el actor desde `Usuario`;
   - dueños y cuentas ROOT sobre `Usuario` y `Membresia`;
   - ROOT invita solo a OWNER y a ROOT;
   - el historial de las invitaciones y la baja efectiva en `AccesoService`.

   Las pantallas de E2b quedan para la consola (`docs/plan-consola-root.md`, sección 13).
3. **JEFE_SALON = MOZO por ahora.** Solo usa web-staff. Que entre a web-admin para mesas y carta (tabla de Roles) queda pendiente.
4. **La rama `fix/356-mozo-id-desde-jwt` se absorbe y se cierra sin mergear.** Su regla de quién cobra (sale del token, nunca del body) se rehace sobre `Usuario` y `Mozo.usuarioId`, con `Pago.usuarioId` en lugar de `Pago.adminId`.
5. **Las rutas legacy de alta de personal y de ROOT se quitan ya en la Fase 4.** Son `/admins`, `/admin-restaurante`, `POST /mozos` y `POST` y `DELETE` de `/marcas` y `/restaurantes`. Las tablas `Admin` y `AdminRestaurante` quedan hasta la Fase 5.
6. **web-cliente:** `useSession` pasa a la Fase 4b, que es la primera que lo usa. En la Fase 4, web-cliente solo deja de pasarle tokens al personal y lo manda a web-auth.
7. **Entregas.**
   - La 4.1 (`@menyu/auth-client` y web-auth sobre la cookie) se mergea sola: las otras apps todavía no leen la sesión.
   - De la 4.2 a la 4.7 van en un solo PR, porque backend y frontends cambian de token a la vez. Se abre como draft desde la 4.2 para ver el quality gate de SonarCloud en cada push.
   - Cada commit trae sus tests. La meta es 80 % de cobertura de líneas en el código nuevo.

## Dominios


| App                       | Producción          | Staging                     | Local             |
| ------------------------- | ------------------- | --------------------------- | ----------------- |
| web-auth                  | auth.menyu-app.com  | auth.staging.menyu-app.com  | auth.menyu.local  |
| web-admin                 | admin.menyu-app.com | admin.staging.menyu-app.com | admin.menyu.local |
| web-staff (mozo + cocina) | staff.menyu-app.com | staff.staging.menyu-app.com | staff.menyu.local |
| web-cliente               | mesa.menyu-app.com  | mesa.staging.menyu-app.com  | mesa.menyu.local  |
| API NestJS                | api.menyu-app.com   | api.staging.menyu-app.com   | api.menyu.local   |


> La cookie con dominio compartido NO funciona en `localhost`. En desarrollo se usan los subdominios `*.menyu.local` mapeados a 127.0.0.1 en el archivo hosts.
>
> Hoy las apps corren en `menyu-{cliente,admin,staff}.vercel.app` y la API en `menyu-backend-*.up.railway.app`. `vercel.app` está en la Public Suffix List: no se puede poner una cookie para `.vercel.app`, así que el SSO solo funciona con el dominio propio. Los previews de Vercel no comparten sesión; el SSO se prueba en staging y en `*.menyu.local`.

## Roles


| Rol                     | Ámbito      | Apps a las que accede                                                                                                      |
| ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| ROOT (`Usuario.esRoot`) | MenYU       | web-admin (`/root`): crea y da de baja marcas y restaurantes, e invita a OWNER y a otras cuentas ROOT. Los GERENTE los invita el OWNER. No accede a los datos privados de las marcas |
| OWNER                   | marca       | web-admin (toda su marca) y web-staff                                                                                      |
| GERENTE                 | restaurante | web-admin (sus restaurantes) y web-staff                                                                                   |
| JEFE\_SALON             | restaurante | web-staff (vista mozo). Las secciones de mesas y carta de web-admin quedan pendientes (decisión 3 de la Fase 4)            |
| MOZO                    | restaurante | web-staff (vista mozo)                                                                                                     |
| COCINA                  | restaurante | web-staff (vista cocina)                                                                                                   |
| Cliente (sin membresía) | —           | web-cliente, con sesión opcional                                                                                           |


## Fases

### Fase 0 — Configuración externa (manual, la hace el equipo) ✅ (2026-10-20)

- Dominio `menyu-app.com`: DNS y dominios custom de producción y staging (ver Dominios): web-auth, web-admin, web-staff y web-cliente en Vercel; la API en Railway. Las variables de cada plataforma (CORS, `BASE_URL`, `FRONTEND_*`, `QR_BASE_URL`, `VITE_API_URL`, `VITE_WS_URL`) y la redirect URL de Mercado Pago: `docs/auth/VariablesACambiar.md`. El CORS es configuración (`CORS_ORIGINS`), no código.
- Supabase (staging y producción): Site URL = `https://auth.menyu-app.com` (en staging, `https://auth.staging.menyu-app.com`); Redirect URLs para invitación, reset de contraseña, confirmación de email y callback de Google (incluir `http://auth.menyu.local:<puerto>` en staging).
- Supabase: registro público con email **habilitado** (lo usan los clientes) y con confirmación de email. El personal igual entra solo por invitación: el acceso lo da la `Membresia`.
- Supabase: JWT Signing Keys asimétricas activas en ambos proyectos (si todavía usan el JWT secret legacy, migrar). Comprobar que `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` devuelve al menos una clave.
- Supabase: desactivar la Data API (PostgREST), que el backend no usa (usa Prisma y Storage), o habilitar RLS en todas las tablas de `public`. Obligatorio antes del primer deploy de la Fase 3, porque web-auth pone la publishable key en un bundle público: hoy ninguna tabla tiene RLS, `admin`, `mozo` y `cliente` guardan `password_hash` y `restaurante` guarda los tokens de Mercado Pago.
- SMTP propio en ambos proyectos: Resend (`smtp.resend.com`), con remitente `no-reply@menyu-app.com`. Figura entre los proveedores de `/privacidad` de web-auth: si cambia, actualizarla. El SMTP por defecto de Supabase tiene límite muy bajo y solo envía a miembros del equipo del proyecto.
- Google Cloud: cliente OAuth con las URLs de callback de ambos proyectos Supabase. Activar el proveedor Google en Supabase.
- Archivo hosts con los subdominios `*.menyu.local`.
- **Terminado cuando:** una invitación de prueba llega al mail, el proveedor Google aparece activo en ambos proyectos, el JWKS devuelve claves en ambos y los dominios de staging responden.

### Fase 1 — Modelo de datos ✅ (2026-10-19)

- Enum `Rol`: `OWNER`, `GERENTE`, `JEFE_SALON`, `MOZO`, `COCINA`.
- Modelo `Usuario` con `supabaseUserId` (único), email (único), nombre, activo y `esRoot`.
- Modelo `Membresia` (usuario, rol, marca o restaurante): `OWNER` con marca y sin restaurante; el resto con restaurante y sin marca (CHECK en la migración). Unicidad (usuario, restaurante) y (usuario, marca).
- `Mozo.usuarioId` (opcional; único junto con el restaurante) y `Cliente.supabaseUserId` (opcional, único).
- RLS habilitada, sin políticas, en `usuario` y `membresia`: `anon` y `authenticated` no las pueden leer ni escribir por la Data API; el backend sí, porque se conecta como dueño de las tablas. `service_role` saltea RLS: su key queda solo en el backend.
- Migración + seed con un OWNER de prueba con membresía en la marca del restaurante de prueba. En local no hay Supabase Auth: su `supabaseUserId` es un UUID fijo que no existe en ningún proyecto; para iniciar sesión con él hay que reemplazarlo por el id de un usuario real de staging.
- **Terminado cuando:** la migración corre limpia, el seed crea un OWNER asociado a la marca del restaurante de prueba, y el typecheck y los tests del backend siguen pasando.

### Fase 2 — Backend (NestJS) ✅ (2026-10-20)

Hecha con los nombres que propone esta sección: `SupabaseAuthGuard`, `@RequiereRol`, `MembresiaGuard` y `@UsuarioActual()`. Viven en `apps/backend/src/auth/guards/`, `decorators/` y `supabase/`, y las invitaciones en `invitaciones/`. Los permisos los decide `AccesoService`, y el guard deja el usuario en `request.usuario`. La verificación con tokens reales queda para staging (ver "Para tener en cuenta").

- `SupabaseAuthGuard`: valida el JWT de Supabase con `jose` contra el JWKS del proyecto (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`) y resuelve el `Usuario` por `supabaseUserId`. Usuario inexistente → 403. Usuario inactivo → 403. Token inválido o vencido → 401.
- Decorador de roles + guard que valida el rol en el restaurante del recurso pedido (una membresía de `OWNER` cubre todos los restaurantes de su marca). `@Roles`, `RolesGuard` y `@CurrentUser` ya existen (legacy, en uso hasta la Fase 5): los nuevos usan otros nombres, por ejemplo `@RequiereRol(...)`, `MembresiaGuard` y `@UsuarioActual()`.
- Endpoint `GET /auth/me`: devuelve usuario + membresías. Reemplaza al `GET /auth/me` legacy, que ningún frontend usa.
- Endpoint `POST /auth/invitaciones`: invita por email vía Supabase Admin API, crea el `Usuario` con el `supabaseUserId` devuelto y su `Membresia`. Quién invita a quién: ROOT → OWNER y GERENTE; OWNER → cualquier rol de su marca; GERENTE → JEFE_SALON, MOZO y COCINA de sus restaurantes. Si el email ya tiene cuenta confirmada en Supabase (por ejemplo, un cliente registrado), no se reinvita: se usa ese id. Si la cuenta existe sin confirmar, se borra y se invita de nuevo (decisión 2 de la planificación de la Fase 2). Para MOZO y JEFE_SALON crea el `Mozo` del restaurante o vincula el existente con el mismo email.
- Pendientes que dejó la Fase 1:
  - `Usuario.email` es único pero distingue mayúsculas: guardar siempre el email que devuelve Supabase (en minúscula) y comparar en minúscula al vincular un `Mozo`.
  - `Mozo.passwordHash` es obligatorio: hacerlo opcional (migración) para poder crear el `Mozo` de un invitado.
- CORS: no lleva código, se configura en la Fase 0 con `CORS_ORIGINS` y `CORS_ORIGIN_PATTERNS`. Acá solo verificar que estén los subdominios de `menyu-app.com` (incluido `staging.menyu-app.com`) y, en local, `menyu.local`.
- Swagger con esquema Bearer.
- **Tests (solo estos):** token válido, token vencido, token de otro proyecto, usuario sin membresía, rol incorrecto. Además, un test de tabla de la matriz de invitaciones (decisión 3 de la planificación de la Fase 2).
- **Terminado cuando:** los tests pasan y un endpoint de prueba protegido responde bien a cada caso.

### Fase 3 — App web-auth (email + contraseña) ✅ (2026-10-20), en producción desde v1.1.0 (2026-10-21)

Hecha en `apps/web-auth`, en el puerto 5173 en local:

- **Pantallas:** `/` (ingresar), `/olvide-contrasena`, `/invitacion` y `/restablecer-contrasena` (links del mail), `/elegir` (selector) y `/sin-acceso`.
- **Destino:** el post-login (`src/flujo/usePostLogin.ts`) llama a `GET /auth/me` y va al `redirect` si es válido (`src/lib/redirect.ts`) o a la app del rol (`src/lib/destinos.ts`).
  - ROOT, OWNER y GERENTE → `admin.<amb>/admin`.
  - JEFE_SALON y MOZO → `staff.<amb>/mozo`.
  - COCINA → `staff.<amb>/cocina`.
  - Con varios lugares, el selector; la elección viaja como `?marcaId=` o `?restauranteId=`.
- **Links del mail:** traen un `token_hash` (plantillas en `docs/auth/VariablesACambiar.md`) que se canjea con `verifyOtp` recién al guardar la contraseña. El backend no manda `redirectTo`.
- **Tokens de marca:** en `@menyu/ui/tailwind-preset`.

Verificada con Supabase simulado (playwright-cli, 31 casos) y contra el Supabase y la API de staging, con un usuario de cada rol (`docs/auth/usuarios-prueba-staging.md`). Desplegada en staging con el merge del PR #409 y en producción con el tag v1.1.0 (2026-10-21).

- Construir la UI con la skill `frontend-design`. Definir tokens de color y tipografía a partir del logo.
- Pantalla de login (email + contraseña) con mensajes de error claros.
- Tras login: llamar `GET /auth/me`; si hay `redirect` válido (solo `*.menyu-app.com` / `*.staging.menyu-app.com` / `*.menyu.local`), ir ahí; si no, redirigir según rol.
- Si tiene varias membresías: selector de restaurante.
- Pantallas de "olvidé mi contraseña" y de aceptar invitación (definir contraseña).
- Usuario autenticado en Supabase pero sin `Usuario` en la DB (403 en `/auth/me`): pantalla "Tu cuenta no tiene acceso. Pedile una invitación al administrador" + cerrar sesión.
- El registro y el post-login de clientes quedan para la Fase 4b.
- **Infra y pipeline.** web-auth es la primera app nueva desde que existe el pipeline. Sin estos pasos funciona en local pero no se despliega (ver `Documentacion/WORKFLOW.md`, "Frontends en Vercel"):
  - Vercel, a mano: proyectos `menyu-auth` (producción) y `menyu-auth-staging`, creados como los de las otras apps, con los dominios `auth.menyu-app.com` y `auth.staging.menyu-app.com` (registro en Cloudflare, sin proxy) y las variables de la sección Fase 3 de `docs/auth/VariablesACambiar.md`.
  - `apps/web-auth/vercel.json` igual al de las otras apps (`ignoreCommand`, `git.deploymentEnabled` solo `main`, rewrite a `index.html`).
  - `scripts/vercel/ignorar-build.sh`: sumar `menyu-auth-staging-*`. Si no, el proyecto de staging nunca construye desde Git.
  - `deploy-staging.yml` y `deploy-production.yml`: sumar `--filter=@menyu/web-auth` al build y un paso "Deploy web-auth" igual a los otros, con el secret nuevo `VERCEL_PROJECT_ID_AUTH` (el ID de `menyu-auth`; el de staging no lo necesita porque despliega desde Git).
  - Smoke: variable de repo `PROD_WEB_AUTH_URL` (`https://auth.menyu-app.com`), sumada a `scripts/smoke/verificar-urls.mjs` en los dos pasos que la validan y al smoke (`scripts/smoke/smoke.mjs` y `lib.mjs` aceptan hoy 3 frontends).
  - CI: sumar `@menyu/web-auth` a los filtros de test y cobertura de `ci.yml`, a la subida de cobertura y a `sonar-project.properties` (`sonar.sources`, `sonar.tests` y `lcov`).
  - CORS: sumar `https://auth.staging.menyu-app.com` y `https://auth.menyu-app.com` a `CORS_ORIGINS` de cada ambiente.
  - Supabase: Data API desactivada (o RLS en todas las tablas) antes del primer deploy, y las plantillas de mail "Invite user" y "Reset password" con `token_hash` (`docs/auth/VariablesACambiar.md`, Fase 3).
- **Terminado cuando:** un usuario de cada rol inicia sesión y termina en la app correcta, y el flujo de invitación funciona de punta a punta. web-auth se despliega sola en staging con cada merge a `main` y en producción con el tag, y el smoke de producción la verifica.

### Fase 3b — Login con Google ✅ (2026-10-21), en producción desde v1.1.0 (2026-10-21)

Hecha en `apps/web-auth` (el backend no cambia):

- **Pantallas:** "Continuar con Google" (`src/components/BotonGoogle.tsx`) arriba del formulario en `/` y en `/invitacion`. La salida a Google es `src/flujo/useIngresoConGoogle.ts`, y `/google` (`src/pages/VolverDeGooglePage.tsx`) recibe la vuelta.
- **Errores:** `/google` muestra el error de OAuth de la URL (`errorDeOAuth`, en `src/lib/mensajes.ts`) o el del canje. Si salió bien, sigue a `/`, que hace el post-login de la Fase 3.
- **Volver atrás:**
  - `/invitacion` sin token (por ejemplo, al volver atrás desde Google) pide abrir de nuevo el link del mail.
  - Si la página vuelve desde la bfcache, los botones se vuelven a habilitar.

**Verificada** en local (`auth.menyu.local:5173`) contra el Supabase y la API de staging, con las dos cuentas de Google de `docs/auth/usuarios-prueba-staging.md`. Se usó playwright-cli conectado a un Chrome aparte en el que una persona inició sesión en Google. Los seis casos de abajo dieron lo esperado:
1. **Cancelar:** `/google` con "Cancelaste…", y el `redirect` se conserva.
2. **Sin invitación:** `/auth/me` 403 y "sin acceso". Después de cerrar sesión aparece el selector de cuentas de Google.
3. **Invitado que no aceptó:**
   - Desde el link del mail, con la otra cuenta, termina en "sin acceso".
   - Con la cuenta invitada, entra como MOZO, mismo `sub` que el `Usuario` de la invitación.
   - Después, el link dice que venció.
4. **Contraseña después de Google:** con la cuenta que entró con Google y después creó una contraseña desde "Olvidé mi contraseña", entra con email y contraseña y con Google, siempre con el mismo id.
5. **Cuenta de Google a la que invitan después:** `invitacionEnviada: false`, no llega mail y entra con Google.
6. **`redirect`:** con `?redirect=…/mozo/mesas`, termina ahí.

El "atrás" desde Google, en un Chrome de escritorio real, restaura la página desde la bfcache con los botones habilitados.

**Despliegue:**
- **Staging:** con el merge del PR #411. El login con Google en `auth.staging.menyu-app.com` desplegado funciona de punta a punta: PKCE `S256`, `/auth/me` 200 y el `redirect` a staff.
- **Producción:** con el tag v1.1.0, junto con la política de privacidad (PR #412).
- **Google Cloud:** la pantalla de consentimiento está publicada (*In production*) desde el 2026-10-21.

Los pendientes están en "Para tener en cuenta".

- Botón "Continuar con Google" en web-auth (`signInWithOAuth`), con callback a `auth.menyu-app.com/google` (ver Decisiones de la planificación de la Fase 3b).
- Mismo post-login que la Fase 3 (`/auth/me`, redirect, selector de restaurante, pantalla de sin acceso).
- Configuración externa (`docs/auth/VariablesACambiar.md`, sección 6): la vuelta a `/google` no necesita Redirect URL en staging ni en producción (es el host de la Site URL), sí en desarrollo (`http://auth.menyu.local:5173/**`). La pantalla de consentimiento de Google Cloud está publicada (*In production*) desde el 2026-10-21. Mientras estuvo en *Testing* solo entraban los usuarios de prueba cargados.
- Política de privacidad pública en `/privacidad` de web-auth (`src/pages/PrivacidadPage.tsx`). Es una ruta estática: no usa la sesión ni llama a `/auth/me`, y el rewrite de `vercel.json` la sirve aunque se cargue directo. Google exige una página principal y una política de privacidad, las dos en un dominio autorizado (`menyu-app.com`), para pasar la pantalla de consentimiento a *In production*, y visita las URLs al publicar.
- **Casos a verificar (a mano, no automatizados):**
  - Usuario invitado con `x@gmail.com` entra con Google usando ese mail → Supabase vincula la identidad al mismo usuario, se conserva el `supabaseUserId` y accede normal.
  - Cuenta de Google sin invitación → pantalla de sin acceso. Al cerrar sesión y volver a Google, aparece el selector de cuentas.
  - Invitado que todavía no aceptó la invitación entra con Google (desde `/` o desde el link del mail) → accede, y después el link del mail dice que venció. Desde el link, con una cuenta de Google de otro email → sin acceso, y el link sigue sirviendo.
  - Cuenta de Google sin invitación a la que después invitan → `POST /auth/invitaciones` responde `invitacionEnviada: false` y la persona entra con Google.
  - Con `?redirect=` de otra app de MenYU, al volver de Google termina ahí.
  - Cancelar en Google → `/google` con el mensaje, y se puede reintentar.
- **Terminado cuando:** los casos se comportan como se describe. Email + contraseña sigue funcionando como respaldo.

### Fase 4 — SSO en las apps

Entregas (ver Decisiones de la planificación de la Fase 4):

| Entrega | Qué | Estado |
|---|---|---|
| 4.1 | `@menyu/auth-client` y web-auth sobre la cookie de dominio compartido | Hecha (2026-10-21): ver abajo |
| 4.2 | Backend: `AccesoService` con la baja efectiva, `@RequiereRol` con origen explícito, `@Personal()`, `@RequiereRoot()`, la migración de autoría (`pedido_edicion.usuario_id`, `pago.usuario_id`) y el test que recorre el enrutador | Hecha (2026-10-21): ver abajo |
| 4.3 | Backend: los 16 controllers del personal pasan al guard nuevo, sin ROOT; los cobros de #356; el Personal (listar y quitar acceso); se quitan las rutas legacy de la decisión 5 | Hecha (2026-10-21): ver abajo |
| 4.4 | Backend: la consola de ROOT (decisión 2) | |
| 4.5 | web-admin: `RequireAuth`, contexto desde `/auth/me`, Personal, `useRootSession` | |
| 4.6 | web-staff: `RequireAuth`, selector por membresías, `mozoId` desde el backend | |
| 4.7 | web-cliente, variables, documentación, verificación en `*.menyu.local` y staging, revisor | |

**4.1, cómo quedó (2026-10-21).**
- **El paquete:** `packages/auth-client` (`@menyu/auth-client`). Es solo código fuente, como `@menyu/ui`, con 100 % de cobertura. Exporta:
  - `clienteAuth()`: `createBrowserClient` de `@supabase/ssr` 0.12.7 con `cookieOptions` (dominio de `VITE_AUTH_COOKIE_DOMAIN`, `Lax`, `secure` solo con https).
  - `useSession`, `RequireAuth` (con `usePerfil`), `logout`, `irAlLogin`, `tokenDeAcceso`, `renovarSesion`, `obtenerPerfil` y `useRevalidarSesion`.
  - `appsDelPerfil`, `tieneAcceso` y `puedeIrA`: la única regla de qué app le toca a quién (admin: ROOT, OWNER o GERENTE; staff: cualquier membresía).
- **web-auth:** usa `clienteAuth()` y se borraron `src/lib/supabase.ts` y `src/lib/api.ts`. `decidirDestino` ignora un `redirect` a una app que no le toca (un MOZO con `redirect=admin…` va a staff), así que no hay loop con `RequireAuth`. Las sesiones que había en localStorage se pierden con el deploy: hay que volver a ingresar.
- **Versiones:** `@supabase/supabase-js` 2.117.0 en el backend, en web-auth y en el paquete.
- **CI y Sonar:** el paquete se sumó a typecheck, test y coverage en `ci.yml`, y a `sonar-project.properties`.
- **Verificada** en `auth.menyu.local:5173` contra el Supabase y la API de staging (playwright-cli, con admin y staff simulados en sus subdominios):
  - El MOZO entra y termina en `staff/mozo`.
  - La cookie `sb-<ref>-auth-token` queda con dominio `.menyu.local`, `path=/`, `Lax`, sin `secure` (http) y sin `httpOnly`. La ven `admin.menyu.local` y `staff.menyu.local`, y localStorage no guarda la sesión.
  - Un `redirect` a admin de un MOZO termina en staff, y uno a `staff/mozo/mesas` termina ahí.
  - Cerrar sesión borra la cookie, y staff deja de verla.
  - La cuenta sin `Usuario` va a `/sin-acceso`.
- **Google, invitación y recuperación con la cookie** (2026-10-21). Se usó el Chrome aparte con el perfil `menyu-pruebas-google` y playwright-cli por CDP; los links de los mails se abrieron en `auth.menyu.local:5173`:
  - **Google** (`menyuprueba2@gmail.com`, con `?redirect=…/mozo/mesas`): `auth/` → selector de Google → `/google` → `staff/mozo/mesas`, en 9 segundos.
    - El verifier del PKCE queda en cookies de `.menyu.local` (`sb-<ref>-auth-token-code-verifier` y las de `-flow…`).
    - La sesión de Google pesa más y `@supabase/ssr` la parte en `auth-token.0` y `.1`. Staff la ve.
  - **Invitación** (cuenta descartable `menyuprueba2+fase41@gmail.com`, MOZO, invitada por el OWNER de prueba): el link del mail (`/invitacion`, `type=invite`) define la contraseña y termina en `staff/mozo` con la sesión en la cookie.
  - **Recuperación** con la misma cuenta:
    - El mail llegó en 12 segundos, y el link (`/restablecer-contrasena`, `type=recovery`) termina en `staff/mozo`.
    - Después, la contraseña nueva entra y la anterior da "El email o la contraseña no son correctos".
- **Hallazgo: el estado de OAuth de Supabase vence a los 5 minutos.**
  - Qué pasó: con `menyuprueba1`, Google pidió "actividad inusual", un QR y la contraseña. Al volver, Supabase respondió `error=invalid_request`, `error_code=bad_oauth_state` ("OAuth state has expired").
  - Como el estado venció, Supabase no sabe a qué `redirectTo` volver: manda a la Site URL (`auth.<ambiente>/`). `/` no muestra `errorDeOAuth` (solo `/google` lo hace), así que la persona ve el login sin explicación.
  - Mejora posible: que `/` también muestre el error de OAuth de la URL.
  - No depende de la cookie: con la cuenta ya verificada en Google, el reintento entró en 9 segundos.

**4.2, cómo quedó (2026-10-21).** En el PR draft #416, que sigue abierto hasta la 4.7. Ningún controller cambió todavía: es la base que usan la 4.3 y la 4.4.
- **`AccesoService`** (`auth/supabase/acceso.service.ts`):
  - Baja efectiva: `rolesEnRestaurante`, `esOwnerDeMarca` y `perfil()` cuentan una membresía solo si el restaurante y su marca están activos (`RESTAURANTE_DISPONIBLE`). Al reactivarlos, vuelve a contar.
  - `exigirRol(usuarioId, restauranteId, roles)` da 403 o devuelve todos los roles del usuario ahí (para distinguir al MOZO del GERENTE en los cobros).
  - `exigirOwnerDeMarca(usuarioId, marcaId)` da 403 si no es OWNER de esa marca activa.
  - `mozoDe(usuarioId, restauranteId)` busca por la clave única y devuelve `{ id, nombre, esJefeSalon }` solo si el `Mozo` está activo.
  - `restaurantesDe(usuarioId, roles?)` devuelve los ids de los restaurantes disponibles, ordenados por nombre. Con OWNER incluye todos los de sus marcas.
  - `PerfilUsuario.membresias[].restaurante` suma `marca: { id, nombre }`, también en `@menyu/types`.
- **Decoradores** (`auth/decorators/`):
  - `@RequiereRol(...roles)` es `@RequiereRolEn({ param: 'restauranteId' }, ...roles)`.
  - `@RequiereRolEn({ param | query | body: '<nombre>' }, ...roles)`. Una ruta mal declarada (sin roles o sin el parámetro) da 403 y se loguea. Sin el id en la query o el body (o si no es un texto), da 400.
  - `@Personal()` es solo `SupabaseAuthGuard`: el service resuelve el restaurante y llama a `exigirRol`.
  - `@RequiereRoot()` es `SupabaseAuthGuard` más `RootGuard` (`usuario.esRoot`).
- **Migración `20261021141707_fase4_autoria_usuario`:**
  - `pedido_edicion.usuario_id` y `pago.usuario_id`, con FK a `usuario` y `ON DELETE SET NULL`.
  - El disparador `usuario_proteger_ultimo_root`. A diferencia del de `admin`, también impide desactivar a la última cuenta ROOT activa (una cuenta inactiva no entra), y una cuenta ROOT inactiva no cuenta como otra.
- **Tests:**
  - `test/app-endpoints.ts`: la opción `cuenta` (header `x-test-usuario`) deja un `UsuarioAutenticado` en la request; `SIN_USUARIO` da 403. MembresiaGuard y RootGuard son los reales.
  - `AccesoService` responde con las membresías de `CUENTAS` en `MUNDO`: ROOT sin membresías, OWNER de las marcas A y B, y GERENTE, JEFE_SALON, MOZO y COCINA del restaurante 1. Solo simula `rolesEnRestaurante` y `esOwnerDeMarca`; si un test llega a `mozoDe` o `restaurantesDe`, falla con un error que lo dice.
  - La opción legacy `usuario` (`x-test-user`) sigue hasta la 4.4.
  - `auth/rutas-por-autenticacion.spec.ts` recorre el enrutador. Las rutas con el JWT legacy tienen que coincidir exactamente con `PENDIENTES_4_3` y `PENDIENTES_4_4`: al pasar una a Supabase, hay que sacarla de la lista. `PATCH /waiter-calls/:id/atender` está aparte, porque verifica el JWT legacy a mano.
  - Contra la base local, con `TEST_DATABASE_URL` (en el CI se saltan): `acceso.service.base.spec.ts` (la baja efectiva) y `usuario-migracion.base.spec.ts` (la autoría y el disparador).

**4.3, la matriz de roles por ruta (planificada el 2026-10-21).** ROOT no figura en ninguna: recibe 403 en todas (no tiene membresías). Con el restaurante en la ruta, la query o el body, la ruta usa `@RequiereRol` o `@RequiereRolEn`; en las de un recurso (`/items/:id`), `@Personal()` y el service llama a `exigirRol` o `exigirOwnerDeMarca`.

| Ruta | Roles |
|---|---|
| `GET /marcas` | OWNER: sus marcas, desde `Membresia` |
| `GET` y `PATCH /marcas/:id`, logo de la marca | OWNER de la marca |
| `GET /restaurantes` | OWNER o GERENTE: los restaurantes de sus membresías |
| `GET` y `PATCH /restaurantes/:id` | OWNER, GERENTE. `direccion` y `nombreSeccionRecomendados`: solo OWNER |
| Logo del restaurante | OWNER |
| `POST /mesas`, `GET`/`PATCH /mesas/:id`, `regenerar-qr`, `pin` | OWNER, GERENTE |
| `GET /mesas` | OWNER, GERENTE, JEFE_SALON, MOZO |
| `DELETE /mesas/:id` | OWNER |
| Ítems, categorías, ingredientes (con la imagen, los ingredientes de un ítem, el descuento y las clasificaciones de un ítem) | OWNER, GERENTE. `DELETE /items/:id` y `DELETE /categorias/:id`: OWNER |
| `POST`, `PATCH` y `DELETE /clasificaciones` (catálogo global) | OWNER o GERENTE de algún restaurante. Deuda: es un catálogo global |
| `GET /mozos`, `GET /mozos/:id`, mesas asignadas, llamados de hoy | OWNER, GERENTE |
| `PATCH /mozos/:id` (solo nombre y teléfono) | OWNER |
| `DELETE /mozos/:id` (solo un mozo sin cuenta: 409 si tiene `usuarioId`) | OWNER |
| `GET /sessions/activas`, `pagadas` e `historial`, `POST /sessions/open-staff`, `mesa/:mesaId/cerrar` y `mesa/:mesaId/activa`, `PATCH /sessions/:id/cobro` | OWNER, GERENTE, JEFE_SALON, MOZO |
| `GET /payments/sesiones`, `POST /payments/confirmar-efectivo` | OWNER, GERENTE, JEFE_SALON, MOZO |
| `GET /payments/mercadopago/oauth/conectar` | OWNER, GERENTE. El `state` lleva el `usuarioId` |
| `GET /pedidos`, `PATCH /pedidos/:id/estado` | OWNER, GERENTE, JEFE_SALON, MOZO, COCINA |
| `POST /pedidos/staff` | OWNER, GERENTE, JEFE_SALON, MOZO |
| `PATCH /pedidos/:id/editar` | GERENTE, JEFE_SALON, MOZO (el OWNER no edita, como hoy) |
| `GET /pedidos/:id/ediciones` | OWNER, GERENTE |
| `GET /pedidos/auditoria`, `GET /reportes/*` | OWNER |
| `GET /waiter-calls` | OWNER, GERENTE, JEFE_SALON, MOZO |
| `PATCH /waiter-calls/:id/atender` | JEFE_SALON o MOZO del restaurante del llamado, con su `Mozo` activo |
| `GET /restaurantes/:restauranteId/personal` (nueva) | OWNER, GERENTE |
| `DELETE /restaurantes/:restauranteId/personal/:membresiaId` (nueva) | OWNER (quita GERENTE, JEFE_SALON, MOZO y COCINA), GERENTE (quita JEFE_SALON, MOZO y COCINA). Nadie se quita a sí mismo |

Se quitan `POST /marcas`, `DELETE /marcas/:id`, `POST /restaurantes`, `DELETE /restaurantes/:id` (viven en `/root`), `POST /mozos`, `/admins` y `/admin-restaurante` (decisión 5).

Decisiones de la planificación de la 4.3:
1. **Solo backend.** `CobroModal` de web-staff se simplifica en la 4.6.
2. **`DELETE /mozos/:id` queda solo para los mozos sin cuenta** (sin `usuarioId`), que no tienen membresía para quitarles el acceso. Se borra en la Fase 5.
3. **Ninguna respuesta devuelve las columnas `mp_*` ni `passwordHash`**, tampoco los detalles (`GET /marcas/:id`, `GET /restaurantes/:id`) ni las respuestas de `PATCH` y de mozos.
4. **`PATCH /mozos/:id` queda con nombre y teléfono.** `email` y la contraseña los quita la decisión 5, `esJefeSalon` lo define la membresía y `activo`, quitar el acceso.
5. **Cobros (#356):** `Pago.usuarioId` guarda siempre quién cobró. Un MOZO o JEFE_SALON cobra con su propio `Mozo` (se ignora el `mozoId` del body); un OWNER o GERENTE puede atribuirle el cobro a un mozo de ese restaurante.

**4.3, cómo quedó (2026-10-21).** En el PR draft #416. Ninguna ruta fuera de `/root` usa el JWT legacy: `PENDIENTES_4_3` y `PENDIENTES_A_MANO` del test del enrutador quedaron vacías.
- **Controllers:** carta, mesas, marcas, restaurantes, mozos, sesiones, pagos (con el OAuth de Mercado Pago), pedidos, llamados al mozo y reportes. Con el restaurante en la ruta, la query o el body, `@RequiereRolEn`; en las de un recurso, `@Personal()` y el service. `GET` y `PATCH /restaurantes/:id` y su logo usan `@RequiereRolEn({ param: 'id' })`. Los grupos de roles de la matriz están en `auth/roles-del-personal.ts` (`ADMINISTRACION`, `SALON`, `TODO_EL_PERSONAL`).
- **`AccesoService`** suma `tieneAlgunRol` y `exigirAlgunRol` (para `GET /restaurantes` y el catálogo global de clasificaciones; cuentan solo marcas activas y restaurantes disponibles) y `exigirMozo` (el `Mozo` activo de la cuenta o 403).
- **ROOT** recibe 403 en todas las rutas de datos. Se borraron `common/assert-staff-access.ts`, `common/assert-owner-access.ts`, los `assertRestauranteOwnership` privados y todos los `rol === 'ROOT'` fuera de `/root`. Los specs que probaban el bypass ahora prueban el 403.
- **Huecos de pertenencia cerrados** (Apéndice B de `docs/plan-discovery-descuentos.md`): `POST /mesas`, `GET /pedidos`, la auditoría, editar, avanzar el estado y ver las ediciones de un pedido, `GET /waiter-calls`, atender un llamado (antes un mozo atendía los de cualquier restaurante), los reportes, `GET /payments/sesiones` y `POST /payments/confirmar-efectivo`. `POST /pedidos/staff` además exige que la sesión sea de la mesa.
- **Quién actúa:** la edición de un pedido guarda `usuarioId` y, si la hizo un mozo, su `Mozo` (`exigirMozo`); `editorDe` (`pedidos/editor-de-la-edicion.ts`) muestra el editor de las ediciones viejas (`adminId`) y las nuevas. Atender un llamado usa el `Mozo` de la cuenta. Los cobros, `common/atribucion-del-cobro.ts`, en `registrarCobro` y `confirmarEfectivo`; las sesiones pagadas muestran el nombre de la cuenta si no hay otro. El `state` del OAuth de Mercado Pago lleva el `usuarioId`.
- **Sin datos sensibles:** `GET /marcas`, `GET /restaurantes`, sus detalles y las respuestas de `PATCH` y de mozos usan `select` explícito (`RESTAURANTE_SELECT`, `MARCA_SELECT`, `MOZO_SELECT` y sus variantes). `prisma/includes-contract.spec.ts` comprueba que ningún select nombre `mp*` ni `passwordHash`, en ningún nivel.
- **Rutas quitadas:** `POST` y `DELETE` de `/marcas` y `/restaurantes`, `POST /mozos`, los módulos `/admins` y `/admin-restaurante`. `PATCH /mozos/:id` quedó con nombre y teléfono y `DELETE /mozos/:id`, para los mozos sin cuenta (409 si tienen `usuarioId`).
- **Personal** (`src/personal/`): `GET /restaurantes/:restauranteId/personal` (dueños, miembros y mozos sin cuenta) y `DELETE .../personal/:membresiaId`, con la matriz de `puede-invitar.ts`; nadie se quita a sí mismo, y a un MOZO o JEFE_SALON también se le da de baja el `Mozo`. Tipos en `@menyu/types` (`PersonalDelRestaurante`). Invitar a una marca o un restaurante dado de baja da 409.
- **Tests:** `src/test/acceso-de-test.ts` reúne `MUNDO`, `CUENTAS`, `MOZOS` y un `AccesoService` sin base (simula también `mozoDe`, `restaurantesDe` y `tieneAlgunRol`), que usan los specs de endpoints y los de los services. Specs nuevos: endpoints de ítems, marcas, restaurantes, mozos, sesiones del salón, llamados y Personal, la atribución de los cobros (los casos de la rama #356), `editorDe` y el service de invitaciones, que no tenía. El backend queda en 96,5 % de cobertura de líneas, y el código nuevo de la entrega casi todo en 100 %.
- **La rama `fix/356-mozo-id-desde-jwt`** quedó absorbida: no se mergea. Su migración `admin_id` no hace falta (`pago.usuario_id` es de la 4.2).
- **Hasta la 4.5 y la 4.6**, web-admin y web-staff no funcionan contra este backend (siguen mandando el JWT legacy): es lo esperado dentro del PR. La 4.6 simplifica `CobroModal`, que ya no necesita mandar `mozoId` para un mozo.

- Paquete compartido en el monorepo (`@menyu/auth-client`) con:
  - Cliente Supabase con cookie de dominio desde `VITE_AUTH_COOKIE_DOMAIN`.
  - Hook `useSession`.
  - Componente `RequireAuth` que redirige a web-auth con `redirect`.
  - `logout()` que hace `signOut()` y redirige a web-auth.
  - Revalidación de sesión al recuperar foco/visibilidad de la pestaña y cada pocos minutos. Necesario porque `onAuthStateChange` no se entera de cambios hechos desde otro subdominio.
- Variables de entorno de los frontends: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AUTH_COOKIE_DOMAIN` y `VITE_AUTH_URL`.
- `@supabase/ssr` 0.12.x pide `@supabase/supabase-js` ^2.114: alinear la versión del backend. Hecho en la 4.1 (2.117.0).
- Integrarlo en web-admin y web-staff (con `RequireAuth`) y en web-cliente (solo `useSession`, sin `RequireAuth`: la sesión es opcional).
- CI: sumar `@menyu/auth-client` a los filtros de test y cobertura de `ci.yml`, a la subida de cobertura y a `sonar-project.properties`, como `@menyu/ui`. Los deploys no cambian: las apps que lo importan se reconstruyen solas cuando cambia (`turbo-ignore` y `dependsOn: ["^build"]`).
- **Terminado cuando:** login en auth → abrir admin y staff en otras pestañas sin volver a loguear; logout en una → las otras vuelven a web-auth al recuperar foco. Probado en `*.menyu.local` y en staging.

### Fase 4b — Cuenta de cliente

- Registro (email + contraseña, con confirmación de email) e inicio de sesión de clientes en web-auth, también con Google. Vuelven a web-cliente con `redirect`.
- Backend: resolver o crear el `Cliente` por `supabaseUserId` a partir del token de Supabase. Sin `Usuario` ni `Membresia`: una cuenta de cliente no da acceso al personal.
- `POST /sessions/open` asocia la mesa a ese `Cliente` cuando recibe un token de Supabase.
- **Terminado cuando:** un cliente se registra en web-auth, vuelve logueado a web-cliente, abre una mesa por QR y la sesión queda a su nombre; sin cuenta, el QR y el PIN funcionan igual que antes.

### Fase 5 — Limpieza

- Quitar de web-cliente la pantalla `/auth` (login del personal y login/registro de clientes, que ahora viven en web-auth).
- Quitar el pasaje de tokens por URL (`?token=&refresh=` y el script de `index.html` de web-admin y web-staff), `resolveLoginUrl`, `resolveAppUrl` y `packages/auth`.
- Quitar los endpoints legacy `/auth/login`, `/auth/register`, `/auth/guest`, `/auth/refresh` y `/auth/logout`, la tabla `RefreshToken`, `Admin` y `AdminRestaurante` (después de pasar `PedidoEdicion.adminId` a `Usuario`) y los `passwordHash` de `Mozo` y `Cliente`.
- Actualizar CLAUDE.md (roles, dominios y la regla "no importar packages/auth en web-cliente": web-cliente sí usa `@menyu/auth-client`, solo para la sesión opcional del cliente) y Swagger.
- Documentar en la tesis las decisiones de esta spec.

## Fuera de alcance

- Otros proveedores además de Google (Apple, Microsoft, etc.).
- Fidelización de clientes (v2). La cuenta opcional de cliente sí está en alcance (Fase 4b).
- 2FA.
- Accesibilidad WCAG (etapa posterior).
- Autenticación del gateway de Socket.io: hoy no tiene (`cors: '*'`, y cada conexión se une a la sala del `restauranteId` que manda). Problema conocido, fuera de esta spec.

## Notas de seguridad

- Validar el parámetro `redirect` contra una allowlist (`*.menyu-app.com`, `*.staging.menyu-app.com`, `*.menyu.local`) para evitar open redirects.
- La cookie compartida es seteada por el browser (no httpOnly); aceptable para el MVP, documentarlo en la tesis como decisión consciente.
- Nunca confiar en el rol que venga del frontend: siempre resolverlo desde la DB en el guard.
- Autenticarse en Supabase (con Google o con una cuenta de cliente) NO otorga acceso. Como el registro público está abierto, ninguna ruta del personal puede conformarse con "tiene sesión de Supabase": el acceso lo da la `Membresia` en nuestra DB.
- Desde la Fase 3 la publishable key de Supabase está en un bundle público (web-auth; desde la Fase 4, en todos): ninguna tabla puede quedar expuesta por la Data API (ver Fase 0). `usuario` y `membresia` tienen RLS desde la Fase 1. La service role key (o secret key) saltea RLS: nunca sale del backend.
- Las pruebas del revisor en el navegador se hacen solo contra staging o local, nunca contra producción, y con usuarios de prueba.
- Desde la Fase 3b, Supabase vincula una cuenta de Google a la cuenta con el mismo email confiando en el `email_verified` de Google, aunque la cuenta invitada todavía no esté confirmada. Con un email que no es de Gmail ni de Workspace, eso solo prueba que la persona controlaba ese email cuando creó la cuenta de Google: un ex empleado con una cuenta de Google creada con el mail del trabajo podría entrar a una invitación nueva a ese mail. Riesgo aceptado para el MVP; documentarlo en la tesis.

## Para tener en cuenta

Observaciones que dejaron las Fases 0 a 3b (2026-10-20 y 2026-10-21). Revisarlas al arrancar cada fase y borrar las que ya no apliquen.

- **Fases 3 y 3b en producción (v1.1.0, 2026-10-21).** Comprobado después del deploy:
  - El smoke de producción, con web-auth incluida, pasó.
  - `https://auth.menyu-app.com` y `/privacidad` responden. El bundle usa el Supabase de producción y `api.menyu-app.com`.
  - La API acepta el origen `https://auth.menyu-app.com` (`CORS_ORIGINS`).
  - Falta un ingreso real en `auth.menyu-app.com`, con email y contraseña y con Google. Hace falta un `Usuario` en la base de producción: el primer ROOT se crea a mano, como en staging (`docs/auth/usuarios-prueba-staging.md`).
- **Fase 3b: pantalla de consentimiento de Google publicada (2026-10-21).** *Branding* es uno solo para los dos ambientes:
  - Página principal: `https://mesa.menyu-app.com` (Discovery). La raíz `menyu-app.com` no tiene sitio.
  - Política de privacidad: `https://auth.menyu-app.com/privacidad`. Google visita estas URLs: no cambiar la ruta ni dejarla caer.
  - Dominios autorizados: `menyu-app.com` y el `<ref>.supabase.co` de cada proyecto de Supabase.
  - Si Google pide verificar la marca, la página principal tiene que tener un link a la política de privacidad, y Discovery todavía no lo tiene.
  - La página la arma JavaScript: el HTML que sirve Vercel tiene el `#root` vacío. Si Google dice que no la encuentra, servirla también como HTML estático.
  - `/privacidad` describe lo que hace el código hoy: qué guarda cada tabla y qué proveedores reciben datos. Si eso cambia (por ejemplo, la Fase 5 retira los `password_hash`), actualizarla junto con la fecha de vigencia.
- **Fase 3b: sin probar el "atrás" desde Google en celulares** (Safari iOS y Chrome Android).
- **Fase 3b: Supabase no agrega una identidad `email` cuando una cuenta que solo tiene Google crea una contraseña.** `identities` sigue mostrando solo `google`, pero la contraseña sirve (comprobado el 2026-10-21). Para saber si una cuenta tiene contraseña no sirve mirar `identities`.
- **Test inestable en web-staff (2026-10-21).**
  - `MesasPage (mozo) › detalle › si la sesión abierta en el detalle se cierra por socket, se limpia` (`apps/web-staff/src/pages/mozo/MesasPage.spec.tsx`) falló en el CI de `main` (`b4d2dcb`) sin cambios en web-staff. Pasó al reintentar y en local pasa siempre.
  - `deploy-production.yml` exige el CI del commit en verde, así que puede frenar un release (para v1.1.0 hubo que relanzar el job). Conviene arreglarlo.
- **Fase 3: lo que se probó en staging (2026-10-20).**
  - El deploy del merge y el smoke de staging, con las cuatro apps y web-auth OK.
  - En `auth.staging.menyu-app.com` desplegado, ROOT y OWNER terminan en `admin.staging…/admin`, MOZO en `staff.staging…/mozo` y COCINA en `staff.staging…/cocina`. "varias" ve el selector y `sin-acceso` va a "Tu cuenta no tiene acceso". `/auth/me` responde con el CORS de `auth.staging`.
  - `GET /auth/me` da 200 con los 7 usuarios con acceso, así que la RLS de `usuario` y `membresia` no bloquea al backend. Da 403 con la cuenta sin `Usuario` y 401 con un token alterado. El MOZO invitando da 403.
  - La invitación de punta a punta (OWNER → MOZO): 201, el mail llegó y la invitación repetida da 409.
    - El link abrió `/invitacion` sin gastar el token. "Guardar y entrar" lo canjeó y llevó a `staff/mozo`, y la contraseña nueva sirve para ingresar.
    - Una invitación anterior con la plantilla por defecto llevó a `auth.<amb>/#access_token=…` (flujo implícito), que web-auth con PKCE no acepta: sin las plantillas con `token_hash`, la invitación no funciona.
  - La recuperación de punta a punta: se pidió desde "Olvidé mi contraseña" y el link (`token_hash` con prefijo `pkce_`) abrió `/restablecer-contrasena` sin gastar el token. Después de guardar, la contraseña nueva sirve y la anterior no.
  - Que una cuenta confirmada se reutiliza al invitarla (`invitacionEnviada: false`) quedó probado en la Fase 3b, con una cuenta de Google. Sin probar: que una sin confirmar se borra y se reinvita.
- **"Confirm email" activo en los dos proyectos de Supabase (Fase 0).** La invitación reutiliza una cuenta confirmada: si la confirmación estuviera apagada, un registro público quedaría confirmado al instante y se le daría acceso de personal a quien lo creó.
- **Para la Fase 4:**
  - Resuelto en la 4.2: `@RequiereRolEn` toma el restaurante de un parámetro, de la query o del body. Las rutas de marca (`/marcas/:id`) y las de un recurso (`/items/:id`) usan `@Personal()` y llaman a `exigirOwnerDeMarca` o a `exigirRol` desde el service.
  - Resuelto en la 4.2: `AccesoService` ya no cuenta las membresías de un restaurante o una marca dados de baja.
  - No hay forma de reenviar la invitación a un `Usuario` que todavía no la aceptó. Mientras tanto, web-auth le dice que pida un link desde "Olvidé mi contraseña" con el mismo email (falta comprobar con GoTrue que el recovery sirva para una cuenta invitada sin confirmar).
  - Hasta esta fase, web-admin y web-staff no leen la sesión de Supabase: el usuario llega a la URL correcta y ve el login legacy.
  - web-auth manda `?marcaId=` o `?restauranteId=` con lo que se eligió. Las apps lo leen como una preferencia, no como permiso: el acceso lo sigue decidiendo el backend.
  - Resuelto en la 4.1: el `redirect` ya no le gana al rol. web-auth lo sigue solo si `puedeIrA` (de `@menyu/auth-client`), y `RequireAuth` manda a quien no tiene acceso a web-auth sin `redirect`.
  - Con una sesión abierta, `/` de web-auth redirige enseguida, y quien tiene un solo lugar no tiene cómo cerrar sesión ahí. Lo resuelve el `logout()` de `@menyu/auth-client`. Si hace falta antes, sumar "Ingresar con otra cuenta".
- **Lo que dejó la 4.3 (2026-10-21):**
  - Para la 4.4: `ROLES_DE_ROOT` de `puede-invitar.ts` todavía incluye GERENTE (pasa a `['OWNER']`), y `PENDIENTES_4_4` del test del enrutador es el checklist de la consola.
  - Para la 4.5: `GET /marcas` es solo del OWNER (al GERENTE le da 403; el contexto de web-admin ya le pide solo `GET /restaurantes`). Personal usa `GET` y `DELETE /restaurantes/:restauranteId/personal` y `POST /auth/invitaciones`. El `CobroModal` de `PagosPage` puede seguir mandando `mozoId`: al OWNER y al GERENTE se les respeta.
  - Para la 4.6: el mozo ya no manda su `mozoId` al cobrar (lo deduce el backend). Las vistas del mozo usan `GET /mesas`, que ahora también es del JEFE_SALON y el MOZO; `GET /mesas/:id` sigue siendo de OWNER y GERENTE, como antes.
  - Deuda: el catálogo de clasificaciones es global y lo edita cualquier OWNER o GERENTE (como antes, sin ROOT). `confirmarEfectivo` aprueba un pago en efectivo aunque ya no esté pendiente (ya pasaba antes de la 4.3).
- **Producción, incidente del 2026-10-20:** un cambio manual de `CORS_ORIGINS` en Railway de producción redesplegó el servicio construyendo el último commit de `main` (31 migraciones) en lugar del tag v1.0.5 (18). `prisma migrate deploy` aplicó las migraciones pendientes hasta que `20260906183320_division_pagos_campos` falló (P3009): su índice único `comensal(sesion_id, nombre_normalizado)` chocó con los comensales "Invitado" que el backfill de `20260722175451_split_pagos_comensales` crea uno por pago, como ya había pasado en QA. La base de producción ya no servía para el código de v1.0.5 (`pago.pedido_id` y `restaurante.qr_base_url` se borraron), así que se recuperó hacia adelante: se borraron esos comensales, se marcó la migración como revertida y se desplegó `main` con el tag v1.0.6 (`39522af`, con las 32 migraciones aplicadas y el smoke de producción en verde).
  - En Railway, un cambio de variables redespliega el servicio y corre las migraciones. El servicio de producción quedó desconectado de GitHub (*Settings → Source*) para que salga solo de `deploy-production.yml`: no reconectarlo.
- **Dominios propios: falta Mercado Pago y `BASE_URL` (2026-10-20).** Staging y producción ya usan `*.menyu-app.com` (v1.0.7, con las variables de `docs/auth/VariablesACambiar.md`), salvo `BASE_URL`, que en los dos ambientes sigue con la URL vieja de Railway: nadie del equipo tiene acceso al panel de la app de Mercado Pago. `BASE_URL` arma el `redirect_uri` del OAuth con el que cada restaurante conecta su cuenta de MP y la `notification_url` de cada pago. MP rechaza un `redirect_uri` que no esté registrado, así que cambiar `BASE_URL` antes de registrarlo rompe la conexión de MP. Mientras tanto todo funciona por la URL vieja, que no hay que dar de baja: las preferencias ya creadas notifican ahí. Cuando haya acceso al panel:
  1. Comparar `MP_CLIENT_ID` en Railway de staging y de producción: si coincide, los dos ambientes usan la misma app de MP.
  2. En el panel de la app, agregar (sin borrar la actual) `https://api.staging.menyu-app.com/api/payments/mercadopago/oauth/callback` y `https://api.menyu-app.com/api/payments/mercadopago/oauth/callback`. Si el panel acepta una sola URL y la app es la misma, registrar la de producción y cambiar su `BASE_URL` en el mismo momento.
  3. Cambiar `BASE_URL` en Railway a `https://api.staging.menyu-app.com/api` (staging) y `https://api.menyu-app.com/api` (producción). Cada cambio redespliega el servicio.
  4. Probar desde web-admin → Configuración → Pagos → conectar Mercado Pago: tiene que volver a `https://admin.<ambiente>/configuracion/pagos?mp=conectado`.
- **Rama `origin/fix/356-mozo-id-desde-jwt`:** absorbida en la 4.3 (`common/atribucion-del-cobro.ts`, con `Pago.usuarioId`). No mergearla: su migración `20261014222232_add_admin_id_to_pago` crea una FK a `admin`, que la Fase 5 borra. Falta cerrarla, avisarle a quien la abrió y cerrar el issue #356 con el merge del PR #416.
- **Base local:** `apps/backend/.env` apunta a `postgresql://menyu:menyu@localhost:5433/menyu` (`DATABASE_URL` y `DIRECT_URL`, el Postgres de `apps/backend/docker-compose.yml`) y tiene el `CORS_ORIGIN_PATTERNS` de `*.menyu.local`. Le faltan `MP_ENCRYPTION_KEY` (sin ella el backend no arranca; en la Fase 2 se pasó en línea) y, para probar Supabase Auth, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del Supabase de staging.
- **La API legacy no crea OWNERs:** `POST /admins` siempre crea un GERENTE, y uno creado por ROOT queda sin marca y no se le puede asignar ningún restaurante. Los usuarios de prueba de staging (`docs/auth/usuarios-prueba-staging.md`) se crearon con un INSERT para el OWNER y la API para el resto. Con Supabase Auth lo cubre `POST /auth/invitaciones` (ROOT → OWNER).