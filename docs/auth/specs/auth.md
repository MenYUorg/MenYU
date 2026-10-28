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
- **SSO:** sesión de Supabase guardada en cookie con dominio compartido (vía `@supabase/ssr`, `createBrowserClient` con `cookieOptions.domain`). El dominio de la cookie sale de una variable de entorno (`VITE_AUTH_COOKIE_DOMAIN`): `.menyu-app.com` en producción, `.staging.menyu-app.com` en staging y `.menyu.local` en desarrollo. La cookie se llama `sb-<ref>-auth-token`, pero cuando el token no entra en una sola, `@supabase/ssr` la parte en `sb-<ref>-auth-token.0`, `.1`…: pasa con las cuentas de cliente y con las de Google, cuyo token trae el nombre en `user_metadata`. Lo que busque la cookie por nombre (un test, un script, un "¿hay sesión?") tiene que usar el prefijo, como `hayCookieDeSesion` de `web-cliente/src/utils/cuenta.ts`.
- **API:** el frontend envía el access token de Supabase como `Authorization: Bearer <token>` a `api.menyu-app.com`. El backend no depende de la cookie. Verifica el token con las JWT Signing Keys asimétricas del proyecto (JWKS), no con el JWT secret legacy.
- **Clientes:** la cuenta es opcional. Entrar a una mesa por QR o PIN no requiere login (`SesionMesa`, flujo existente). Un cliente puede registrarse e iniciar sesión en web-auth (email + contraseña o Google); su cuenta de Supabase se vincula a la tabla `Cliente` por `Cliente.supabaseUserId`. Una cuenta de cliente nunca da acceso a web-admin ni a web-staff.
- **Convivencia con el modelo actual:** `Membresia` es la única fuente de permisos. `Mozo` sigue existiendo como perfil operativo por restaurante (pagos, asignaciones, llamados, `MozoMesa`, ediciones) y se vincula al usuario con `Mozo.usuarioId`. `Admin`, `AdminRestaurante`, `RefreshToken` y los `passwordHash` los retiró la Fase 5, que antes pasó `PedidoEdicion.adminId` a `Usuario`. El JWT propio (`JWT_SECRET`) quedó solo para el token de sesión de mesa y el `state` del OAuth de Mercado Pago.
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
5. **Las rutas legacy de alta de personal y de ROOT se quitan ya en la Fase 4.** Son `/admins`, `/admin-restaurante`, `POST /mozos` y `POST` y `DELETE` de `/marcas` y `/restaurantes`. Las tablas `Admin` y `AdminRestaurante` quedaron hasta la Fase 5, que las borró.
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
- Supabase: desactivar la Data API (PostgREST), que el backend no usa (usa Prisma y Storage), o habilitar RLS en todas las tablas de `public`. Obligatorio antes del primer deploy de la Fase 3, porque web-auth pone la publishable key en un bundle público: al planificarla ninguna tabla tenía RLS, `admin`, `mozo` y `cliente` guardaban `password_hash` (los retiró la Fase 5) y `restaurante` guarda los tokens de Mercado Pago.
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
- Decorador de roles + guard que valida el rol en el restaurante del recurso pedido (una membresía de `OWNER` cubre todos los restaurantes de su marca). `@Roles`, `RolesGuard` y `@CurrentUser` existían (legacy; los borró la Fase 5): los nuevos usan otros nombres, `@RequiereRol(...)`, `MembresiaGuard` y `@UsuarioActual()`.
- Endpoint `GET /auth/me`: devuelve usuario + membresías. Reemplaza al `GET /auth/me` legacy, que ningún frontend usa.
- Endpoint `POST /auth/invitaciones`: invita por email vía Supabase Admin API, crea el `Usuario` con el `supabaseUserId` devuelto y su `Membresia`. Quién invita a quién: ROOT → OWNER y GERENTE (desde la 4.4, solo OWNER: decisión 2 de la Fase 4); OWNER → cualquier rol de su marca; GERENTE → JEFE_SALON, MOZO y COCINA de sus restaurantes. Si el email ya tiene cuenta confirmada en Supabase (por ejemplo, un cliente registrado), no se reinvita: se usa ese id. Si la cuenta existe sin confirmar, se borra y se invita de nuevo (decisión 2 de la planificación de la Fase 2). Para MOZO y JEFE_SALON crea el `Mozo` del restaurante o vincula el existente con el mismo email.
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
- Usuario autenticado en Supabase pero sin `Usuario` en la DB (403 en `/auth/me`): pantalla "Tu cuenta no tiene acceso. Pedile una invitación al administrador", con un botón para cerrar sesión. La sesión no se cierra sola: desde la 4b, `/sin-acceso` la deja abierta para ofrecer "Ir a MenYU" a una cuenta de cliente (`SinAccesoPage.tsx`).
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

### Fase 4 — SSO en las apps ✅, en producción desde v1.3.0 (2026-10-25)

Entregas (ver Decisiones de la planificación de la Fase 4):

| Entrega | Qué | Estado |
|---|---|---|
| 4.1 | `@menyu/auth-client` y web-auth sobre la cookie de dominio compartido | Hecha (2026-10-21): ver abajo |
| 4.2 | Backend: `AccesoService` con la baja efectiva, `@RequiereRol` con origen explícito, `@Personal()`, `@RequiereRoot()`, la migración de autoría (`pedido_edicion.usuario_id`, `pago.usuario_id`) y el test que recorre el enrutador | Hecha (2026-10-21): ver abajo |
| 4.3 | Backend: los 16 controllers del personal pasan al guard nuevo, sin ROOT; los cobros de #356; el Personal (listar y quitar acceso); se quitan las rutas legacy de la decisión 5 | Hecha (2026-10-21): ver abajo |
| 4.4 | Backend: la consola de ROOT (decisión 2) | Hecha (2026-10-21): ver abajo |
| 4.5 | web-admin: `RequireAuth`, contexto desde `/auth/me`, Personal, `useRootSession` | Hecha (2026-10-21): ver abajo |
| 4.6 | web-staff: `RequireAuth`, selector por membresías, `mozoId` desde el backend | Hecha (2026-10-22): ver abajo |
| 4.7 | web-cliente, variables, documentación, verificación en `*.menyu.local` y staging, revisor | Hecha (2026-10-22), verificada en staging el 2026-10-23: ver abajo |

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
  - La opción legacy `usuario` (`x-test-user`) siguió hasta la 4.4, que la borró junto con las listas de pendientes del test del enrutador.
  - `auth/rutas-por-autenticacion.spec.ts` recorre el enrutador. Las rutas con el JWT legacy tienen que coincidir exactamente con `PENDIENTES_4_3` y `PENDIENTES_4_4`: al pasar una a Supabase, hay que sacarla de la lista. `PATCH /waiter-calls/:id/atender` está aparte, porque verifica el JWT legacy a mano.
  - Contra la base local, con `TEST_DATABASE_URL` (en el CI se saltan): `acceso.service.base.spec.ts` (la baja efectiva) y `usuario-migracion.base.spec.ts` (la autoría y el disparador). El tercero de la misma clase, `root/historial/historial-root.base.spec.ts` (los disparadores del historial de ROOT), viene de la consola de ROOT.

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
| `GET /mozos`, `GET /mozos/:id`, mesas asignadas (listar, asignar y quitar), llamados de hoy | OWNER, GERENTE |
| `PATCH /mozos/:id` (solo nombre y teléfono) | OWNER |
| ~~`DELETE /mozos/:id` (solo un mozo sin cuenta: 409 si tiene `usuarioId`)~~ | ~~OWNER~~. La Fase 5 la borró (decisión 6): un perfil de mozo no se borra desde la app |
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
1. **Solo backend.** `CobroModal` de web-staff se simplificó en la 4.6.
2. **`DELETE /mozos/:id` queda solo para los mozos sin cuenta** (sin `usuarioId`), que no tienen membresía para quitarles el acceso. La Fase 5 lo borró, con su botón de web-admin (decisión 6).
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
- **web-admin funciona contra este backend desde la 4.5 y web-staff desde la 4.6**, que simplificó `CobroModal`: ya no manda `mozoId` ni `cobradoPorNombre`.
- **Revisión:** el subagente `revisor` la aprobó con observaciones en la segunda re-revisión (2026-10-21). Lo que corrigió:
  - Un ítem no puede quedar en la categoría o la comanda de otro restaurante (400). Antes, el OWNER o GERENTE de una marca podía meter ítems en la carta pública de un restaurante ajeno, porque los ids de las categorías son públicos. Además, `GET /menu/:restauranteId` filtra los ítems de cada categoría por restaurante.
  - `POST /payments/confirmar-efectivo` sobre un pago que ya no está pendiente responde 409: antes le cambiaba el autor y la fecha a un cobro hecho. La aprobación es un `updateMany` condicionado a `pendiente` dentro de la transacción, así que tampoco lo pisa un cobro simultáneo, el webhook ni el reintento de la transacción serializable. Atender un llamado usa la misma escritura condicionada (si dos mozos lo atienden a la vez, queda a nombre del primero).
  - La subida de la imagen de un ítem tiene el límite de 5 MB en multer (413), como el logo: con `@Personal()` el archivo se leía entero antes del 403.
  - Un OWNER o GERENTE no puede atribuirle un cobro a un mozo dado de baja.
  - El test del enrutador lista las rutas con `@Personal()` (`CON_PERMISO_EN_EL_SERVICE`): sumar una obliga a revisar que su service pida el rol. El de los selects detecta también una relación seleccionada entera (`mozos: true`) y cubre los selects base.

**4.4, cómo quedó (2026-10-21).** En el PR draft #416. Ninguna ruta usa el JWT legacy del personal: el test del enrutador perdió las listas de pendientes y falla si aparece una.
- **Las rutas de `/root`** (eran 19; quedan 16, ver la tabla) pasan a `@RequiereRoot()`, a nivel de controller. En marcas y restaurantes va debajo de `@UseGuards(CamposPermitidosGuard)`, para que los permisos corran antes que la validación de los campos (un OWNER con un campo de más recibe 403, no 400). `root-routes.spec.ts` lo comprueba.
- **El actor del historial** sale del `Usuario` (`esRoot` y `activo`), leído dentro de la transacción del cambio: si la cuenta dejó de ser ROOT o se desactivó mientras tanto, 401 y no se hace nada. `actor_id` guarda el id del `Usuario` (las filas anteriores, el de `admin`). No hizo falta migración: la columna es texto sin FK y `accion` no tiene CHECK.
- **Las rutas de la consola que cambian:**

  | Ruta | Qué hace |
  |---|---|
  | `GET /root/marcas` y `GET /root/marcas/:id` | Los dueños salen de las membresías OWNER de la marca. El detalle trae `{ id, membresiaId, email, nombre }` (`id` es el del `Usuario`), sin `debeCambiarPassword` |
  | `GET /root/duenos?q=` | Las membresías OWNER: `{ membresiaId, usuarioId, email, nombre, activo, marca }` |
  | `POST /root/marcas/:id/duenos` `{ email, nombre }` | `InvitacionesService.invitar` con el rol OWNER. 201 con `{ usuarioId, membresiaId, invitacionEnviada }`; 403 con el email propio, 404 si la marca no existe, 409 si está de baja, ya es dueño de esa marca o la cuenta está desactivada, 502 si Supabase la rechaza |
  | `DELETE /root/duenos/:membresiaId` | Quita la membresía; el `Usuario` queda (puede tener otras). 409 si es el último dueño de una marca activa, en una transacción serializable |
  | `GET /root/roots` | Los `Usuario` con `esRoot`: `{ id, email, nombre, activo, esPropia }` |
  | `POST /root/roots` `{ email, nombre }` | Invita a una persona nueva como ROOT: 201 con `{ usuarioId, email, invitacionEnviada }`. 409 si el email ya es de un `Usuario` (también el propio): hacerlo ROOT es del script |

  Se fueron `PATCH /root/duenos/:id` (cambiar el email), `POST /root/duenos/:id/restablecer-password` y `POST /root/roots/:id/restablecer-password`: el email y la contraseña son de la persona, que los maneja desde web-auth. Siguen sin existir `DELETE`, `PUT` y `PATCH` en `/root/roots`.
- **Las invitaciones de ROOT, en el historial** (decisión 22 de `docs/plan-consola-root.md`). `invitar` llama a Supabase antes y afuera de la transacción, y guarda el `Usuario`, la `Membresia` y el registro `DUENO_INVITAR` juntos, también cuando el email ya era de un `Usuario` (sin mail). Registra cuando una cuenta ROOT invita a un OWNER, desde la consola o desde `POST /auth/invitaciones`. Si una cuenta ROOT que además tiene membresías invita a su personal, actúa como OWNER o GERENTE y no va al historial de ROOT. `ROLES_DE_ROOT` es `['OWNER']`.
- **Códigos del historial:** `DUENO_INVITAR`, `DUENO_QUITAR`, `ROOT_INVITAR` y `ROOT_PROMOVER`. Los de las cuentas con contraseña (`DUENO_CREAR`, `DUENO_CAMBIAR_EMAIL`, `DUENO_RESTABLECER`, `DUENO_ELIMINAR`, `ROOT_CREAR`, `ROOT_RESTABLECER` y `ROOT_ELIMINAR`) ya no se pueden escribir; sus filas viejas se leen igual.
- **Módulos:** el historial pasa a `HistorialRootModule`, que importan `RootModule` e `InvitacionesModule`. `InvitacionesModule` exporta `InvitacionesService`, y `cuentaDeSupabase` es pública para invitar cuentas ROOT.
- **El script `cuentas-root.ts`** queda con `listar` y `promover <email>` sobre `usuario`, con la misma conexión (`DATABASE_URL` de la terminal, sin leer el `.env`) y la confirmación del nombre de la base. Se probó contra una base descartable con todas las migraciones: promueve y registra `ROOT_PROMOVER` con el actor `SCRIPT`; con una cuenta que ya es ROOT no cambia nada; rechaza un email sin cuenta, una cuenta desactivada, el nombre de la base mal escrito y la entrada cerrada.
- **Se borró:** los helpers de contraseñas de la consola (`root/comun/contrasenas.ts`, casi todo `cuentas.ts` y `CrearCuentaDto`), `CAMBIO_PASSWORD`, la opción `usuario` de `test/app-endpoints.ts` y los fixtures del JWT legacy que nadie usaba.
- **web-admin**, sin tocar pantallas:
  - Los tipos de `@menyu/types`: `RootDuenoDeMarca` y `RootCuentaResumen` suman campos, y hay `RootDueno`, `RootInvitarCuentaRequest` y `RootCuentaInvitada` para E2b.
  - Los textos de las cuatro acciones nuevas en la pantalla del historial.
  - `BAJA_CORTA_EL_LOGIN = true`: la baja corta el acceso desde la 4.2.
- **Tests:**
  - Los specs de endpoints de `/root` usan la opción `cuenta`: ROOT 200 o 201; el personal de cada rol, una cuenta sin membresías y una sin `Usuario`, 403; sin token, 401.
  - Los de los services de dueños y cuentas ROOT se reescribieron, con "si el registro falla, el cambio se revierte" y el 401 de una cuenta que dejó de ser ROOT. El de invitaciones suma el bloque del historial.
  - El código nuevo de la entrega queda en 100 % de líneas.
- **Decisiones de la implementación** (a revisar):
  1. `ROOT_PROMOVER`, un código más, para el script (no estaba en la planificación; decidido con el usuario).
  2. `POST /root/marcas/:id/duenos` no exige un UUID en la marca, porque la base tiene ids como `m-001`; `POST /auth/invitaciones` sí lo exige.
  3. "El último dueño" cuenta todas las membresías OWNER de la marca, también las de un `Usuario` desactivado, igual que el "Sin dueño" de la lista.
  4. Si una invitación de ROOT falla después de llamar a Supabase (por ejemplo, porque la cuenta que invita dejó de ser ROOT), el mail ya salió pero no queda ningún `Usuario`. Al reintentar, `cuentaDeSupabase` borra la cuenta sin confirmar e invita de nuevo.
- **Revisión:** el subagente `revisor` la aprobó con observaciones (2026-10-21), sin bloqueantes. Probó contra un PostgreSQL de verdad la carrera de quitar a los dos últimos dueños (uno se reintenta por la serialización y da 409), la reversión cuando falla el historial, las invitaciones con Supabase simulado, el script y el arranque del backend. Lo que se corrigió:
  - El historial rechazaba los textos de más de 500 caracteres o con forma de hash, y el nombre de una marca o un restaurante lo elige su dueño: con un nombre así, ROOT no podía darlos de baja ni quitar a su dueño (y la baja corta el acceso). Ahora `textoRegistrable` recorta lo largo y tapa el hash, que nunca se guarda. `PATCH /marcas/:id` y `PATCH /restaurantes/:id` tienen además los topes de la consola (nombre de hasta 120, identificador de hasta 80, sin el carácter nulo).
  - `GET /root/duenos?q=` escapa `_` y `%`, que eran comodines del LIKE (`q=_` traía a todos). Comprobado contra PostgreSQL.
  - La documentación vieja de la consola (`doc.md`, `docs/probar-consola-root.md`, secciones de `docs/plan-consola-root.md` y `docs/auth/usuarios-prueba-staging.md`).

**4.5, cómo quedó (2026-10-21).** En el PR draft #416. web-admin ya no tiene login propio: toda la app vive dentro de `RequireAuth` de `@menyu/auth-client`.
- **Montaje** (`App.tsx`): un solo `RequireAuth` con `puedeEntrar = tieneAcceso(perfil, 'admin')`. Adentro, `/root/*` exige `esRoot` y `/admin/*` exige un rol en el restaurante elegido (una cuenta ROOT sin membresías vuelve a `/root`). `AdminRedirect` manda a ROOT a `/root`, al GERENTE a `/admin/tables` y al OWNER a `/admin/dashboard`. Se borraron `/login`, `LoginPage` y el script de `index.html` que leía `?token=&refresh=`; `*` ahora va a `/admin`. Sale `@menyu/auth` del `package.json`.
- **El cliente de la API** (`services/api.ts`): el token sale de `tokenDeAcceso()` en cada llamada (la cookie de dominio compartido, no localStorage). Ante un 401 renueva la sesión y reintenta una vez; si no se pudo, `irAlLogin()`. `upload()` pasa por el mismo camino (antes no manejaba el 401) y `PagosPage` usa el `pedirJson` exportado en lugar de su propio `apiFetch`. Los tres sockets dejaron de mandar `auth.token` (el gateway no lo lee). Se borró `api.pagos.confirmarEfectivo`, que mandaba `{ sesionId }` donde el endpoint pide `{ pagoId }` y nadie llamaba.
- **El rol sale del perfil, no del token:** `useRolActual()` (en `store/contextStore.ts`) da el rol en el restaurante elegido, así que una persona puede ser OWNER de una marca y GERENTE de un restaurante de otra. Lo usan `NAV_BY_ROL`, `RoleGuard`, `MesasRouter`, `isOwner`, `canEdit` y `esGerente`. Mientras no hay restaurante elegido, sale de las membresías, para que la interfaz no quede sin permisos durante la carga.
- **ROOT fuera de las pantallas de datos** (donde el backend ya le da 403 desde la 4.3): perdió su `NAV_BY_ROL` y sus `RoleGuard`. `/admin/dashboard`, `/reportes` y `/auditoria` quedaron solo para OWNER, y `/pedidos`, `/historial` y `/toma-pedidos` solo para GERENTE, como antes pero sin ROOT.
- **El contexto** (`contextStore`): `loadContext(perfil, preferencia)`. El GERENTE no pide `GET /marcas` (es del OWNER: a él le da 403) y sus marcas salen de los restaurantes. El `?marcaId=` o `?restauranteId=` que manda web-auth se lee del primer render y vale como preferencia, validada contra la lista. `refreshContext()` recarga sin volver a pedir el perfil (lo usan `MarcaPage` y el catálogo del menú).
- **Personal** (`pages/admin/mozos/`): la pantalla pasa a tener dos pestañas. *Personal* lista los dueños de la marca (de solo lectura: su membresía es de la marca y la maneja la consola de ROOT), quién tiene acceso al restaurante con su rol, y los mozos sin cuenta del login anterior, que se invitan con su email. "Invitar" usa `POST /auth/invitaciones` (la marca como ámbito para un OWNER, el restaurante para el resto) y "Quitar acceso", `DELETE /restaurantes/:id/personal/:membresiaId`, las dos con la matriz de `puede-invitar.ts` y sin la opción de quitarse a sí mismo. *Mozos* conserva el perfil operativo (mesas asignadas y llamados de hoy); editar queda con nombre y teléfono, y borrar, solo para un mozo sin cuenta. Se fueron el alta con contraseña, la pestaña Gerentes y `api.admins`/`api.adminRestaurante`/`api.mozos.create`.
- **La consola de ROOT:** `useRootSession` usa `usePerfil()` y `logout()`; ninguna pantalla ni diálogo cambió. Los textos de la baja dicen que una mesa ya abierta solo puede pagar con Mercado Pago desde el celular (la decisión de arriba).
- **Local:** `vite.config.ts` suma el proxy `/api` → `BACKEND_URL`, como web-auth, y también `/socket.io` con `ws: true`, como web-cliente: con `VITE_API_URL=/api` el socket apunta a este mismo servidor y sin ese reenvío no llegan los eventos de Caja, Mesas ni Pedidos (lo encontró la revisión). Hay `.env.example` y las variables tipadas en `vite-env.d.ts`.
- **Se borró** `pages/admin/gerente/HistorialPage.tsx` con su spec: no tenía ruta (la de `/admin/historial` es `HistorialSesionesPage`).
- **Tests:** 717 en web-admin (unos 60 nuevos). `src/test/authClient.ts` simula `@menyu/auth-client` (sesión, perfiles y `RequireAuth` de paso) y lo usan los specs que antes mockeaban `@menyu/auth`. Nuevos: el cliente de la API (token, 401 → renovar y reintentar, 401 persistente → login, `upload`, `pedirJson`), `contextStore` (`rolEnElRestaurante` con el caso mixto, la preferencia de la URL, el GERENTE sin `/marcas`, `refreshContext`), `App` (el destino de cada rol y los dos guards), `RoleGuard` sobre el restaurante elegido, Personal (lista, matriz de invitar y quitar, mozos sin cuenta) y `personal.ts`. `App.tsx`, `RoleGuard.tsx`, `contextStore.ts`, `personal.ts`, `useRootSession.ts` y `copy.ts` quedan en 100 % de líneas, y `MozosPage.tsx` en 98,6 %.
- **Verificada en el navegador** (playwright-cli en `*.menyu.local`, con el Supabase de staging y el backend de esta rama en local, porque la API de staging todavía corre `main` y le responde 401 a estas rutas):
  1. **Destino por rol:** el OWNER termina en `/admin/dashboard` con su marca y su restaurante cargados; el GERENTE, en `/admin/tables` con su nav; ROOT, en `/root`.
  2. **ROOT fuera de los datos:** escribiendo `/admin/dashboard` a mano vuelve a `/root/marcas`.
  3. **Sin loop:** un MOZO que abre `admin.menyu.local` pasa una vez por web-auth y sigue a staff (que en la 4.5 todavía no existe: termina en el error de conexión de `staff.menyu.local`).
  4. **SSO:** con la sesión abierta, otra pestaña en `/admin/menu` entra sin volver a iniciar sesión; "Cerrar sesión" borra la cookie `sb-<ref>-auth-token` de `.menyu.local` y la otra pestaña vuelve al login con su `redirect`.
  5. **Rol por restaurante:** la cuenta que es OWNER de una marca y GERENTE de un restaurante de otra ve el nav de dueño en el primero y el de gerente al cambiar de restaurante, sin recargar.
  6. **Personal:** el OWNER ve los tres dueños sin "Quitar acceso", a los miembros con su rol y al mozo sin cuenta con "Invitar" precargado con su email; el GERENTE solo puede quitar al personal de salón y cocina (ni a sí mismo ni a otro gerente) y solo puede invitar JEFE_SALON, MOZO y COCINA. Quitarle el acceso a un mozo borra su membresía y la cuenta pasa a recibir 403 en los datos (comprobado contra la base y la API). La invitación manda la marca para un OWNER y el restaurante para el resto; el 502 de un entorno sin la service role key se muestra en el modal.
  7. **El texto de la baja** en el diálogo real de la consola.
- **Revisión:** el subagente `revisor` la aprobó con observaciones (2026-10-22), sin bloqueantes. Lo que se corrigió:
  - El proxy `/socket.io` de Vite (arriba): en el entorno local que documenta la entrega, los sockets de Caja, Mesas y Pedidos no conectaban y reintentaban en loop contra el servidor de Vite.
  - `MozosPage.loadData` no tenía `catch`: un error del servidor dejaba la pestaña Mozos vacía, sin explicación y con una promesa sin manejar. Ahora muestra el mensaje, como la pestaña Personal.
  - El encabezado mostraba «—» como marca al elegir un restaurante de una marca que no es propia (un GERENTE en la marca de otro): `GET /marcas` no la trae, así que las marcas de los restaurantes se suman a la lista.
  - Entrar directo a `/admin/marca` cargaba el contexto dos veces (el efecto del hijo corre antes que el del layout): `loadContext` comparte la carga en curso.
  - Se borraron cuatro `vi.mock('@menyu/auth', …)` muertos en los specs de `/root`, que iban a romper la suite cuando la Fase 5 borre el paquete.
  Lo que quedó anotado como deuda está en "Lo que dejó la 4.5".
- **Falta probar en staging, después del merge:** la invitación de punta a punta con mail real (este entorno no tiene `SUPABASE_SERVICE_ROLE_KEY`) y la pantalla de Caja con un cobro, que necesita datos de pagos.

**4.6, cómo quedó (2026-10-22).** En el PR draft #416. Ninguna app manda ya el JWT legacy del personal: queda solo el login en `/auth` de web-cliente, que lo retira la 4.7.

Decisiones de la planificación de la 4.6:
1. **`cobradoPorNombre` no lo manda nunca un mozo**, tampoco con Mercado Pago: el método de pago ya lo dice y ese texto le ganaba al nombre del mozo en las sesiones pagadas. `CobroModal` dejó de mandarlo en todos los casos.
2. **Un OWNER o GERENTE en staff ve las dos vistas, con lo vedado oculto.** La visibilidad sale de *todos* los roles en el restaurante elegido, no de uno: la cuenta que es OWNER de la marca y MOZO de la sucursal puede lo de los dos.
3. **`PagosGerente` se borra** (411 líneas sin ruta: la tarjeta "Caja" del selector caía en el 404). OWNER y GERENTE cobran desde `/mozo/pagos`, y el cobro queda a su `usuarioId`; la Caja con atribución a un mozo ya existe en web-admin.

- **Montaje** (`App.tsx`): un solo `RequireAuth` con `puedeEntrar = tieneAcceso(perfil, 'staff')` (cualquier membresía) envuelve toda la app. Se borraron `/login`, `LoginPage` y el script de `index.html` que leía `?token=&refresh=`; `*` ahora va a `/`. El destino por rol: COCINA a `/cocina`, MOZO y JEFE_SALON a `/mozo`, y quien ve las dos vistas al selector. `/cocina` y `/mozo/*` tienen su guard (`SoloCocina` y `SoloMozo`), que ante el rol equivocado manda a la vista que sí le toca, no a un error. Quien tiene acceso a staff pero no trabaja en ningún restaurante disponible (un OWNER de una marca sin sucursales) ve un aviso con "Cerrar sesión".
- **El contexto** (`store/contextoStore.ts`, que reemplaza a `mozoStore`) sale del perfil de `GET /auth/me`, sin pedirle nada a la API: las membresías ya traen el restaurante y su marca. `rolesEnElRestaurante` devuelve **todos** los roles ahí (decisión 2) y de ahí salen `puedeVerCocina`, `puedeVerMozo`, `puedeAtenderLlamados`, `puedeEditarPedidos` y `nombreDelRol`. El `?restauranteId=` que manda web-auth se lee del primer render y vale como preferencia, validada contra la lista; después, el último elegido (localStorage) y, si trabaja en uno solo, ese. `mozoStore` decodificaba el JWT al importar el módulo: se fue con `cocinaStore`, que no usaba nadie.
- **El selector** elige el restaurante entre las membresías cuando hay más de uno (recién entonces aparecen las vistas) y ofrece las dos vistas según los roles. Se fueron el campo "ID del restaurante", que era para ROOT, y la tarjeta de `/gerente/pagos`.
- **El cliente de la API** (`services/api.ts`): el token sale de `tokenDeAcceso()` en cada llamada y ante un 401 renueva y reintenta una vez; si no se pudo, `irAlLogin()`. Se fueron `getToken`, `api.mozos.list` y `api.mesas.getDetalle` (muertos, y la matriz de la 4.3 no se los da al mozo) y, al borrar `PagosGerente`, `api.sesiones.getPagadas`. Los tres sockets (el del módulo y los propios de `MesasPage` y `PedidosPage`) dejaron de mandar `auth.token`, que el gateway no lee, y `cerrarSesion()` los desconecta antes de ir a web-auth.
- **Las pantallas** toman el nombre de `usePerfil()`, el restaurante del contexto y el rol del encabezado de `nombreDelRol` (estaba escrito a mano como "Mozo" en las ocho, incluido el encabezado propio de `MozoPanel`). Se oculta lo que el backend no deja: "Atendido" solo para MOZO y JEFE_SALON, que son los que tienen un `Mozo`, y "Editar pedido" no para el OWNER. **Cocina gana "Salir"**, que antes no tenía.
- **Local:** `vite.config.ts` suma el proxy `/api` y `/socket.io` con `ws: true` (sin ese reenvío, en local cocina y mozo no reciben ningún evento), y hay `.env.example` y las variables tipadas.
- **Tests:** 207 en web-staff (unos 60 nuevos), con `src/test/authClient.ts` (igual que en web-admin, con las fábricas de cada rol y la cuenta mixta) y `src/test/contexto.ts`, que monta el store de verdad para que los permisos de la interfaz salgan de las membresías. Nuevos: el cliente de la API (token, 401 → renovar y reintentar, 401 persistente → login), el socket (sin token, los seis canales, `cerrarSesion`), `contextoStore` (restaurantes de cada tipo de membresía, la preferencia de la URL, la tabla de qué puede cada rol), `App` (destino por rol, los dos guards, sin restaurante), `SelectorPage`, `CobroModal` y `PagosMozo` (que no tenían). web-staff pasa de 81 % a 92 % de líneas, con los archivos de la entrega en 100 % salvo `MesasPage` (98,6), `PedidosPage` y `CocinaPage` (99,7) y `socket.ts` (98,5).
- **Verificada en el navegador** (playwright-cli en `*.menyu.local`, con el Supabase de staging y el backend de esta rama en local, porque la API de staging todavía corre `main`):
  1. **Destino por rol:** MOZO y JEFE_SALON terminan en `/mozo`; COCINA, en `/cocina`; OWNER y GERENTE, en el selector con las dos vistas. La cuenta con dos restaurantes ve el selector de restaurante con su marca.
  2. **SSO:** con una sola sesión, `admin.menyu.local/admin/dashboard` y `staff.menyu.local/mozo` abren sin volver a iniciar sesión; la cookie `sb-<ref>-auth-token` queda en `.menyu.local`. "Salir" en staff (en el panel del mozo y en Cocina) la borra y la pestaña de admin vuelve a web-auth con su `redirect` al recuperar el foco.
  3. **Sin loop:** una cuenta ROOT sin membresías que abre staff termina en `/root/marcas` de admin y se queda ahí. Un COCINA que escribe `/mozo/mesas` o `/mozo/pagos` vuelve a `/cocina`, y su selector solo ofrece Cocina. La cuenta sin `Usuario` termina en `/sin-acceso`.
  4. **Tiempo real por el proxy:** al tomar un pedido, al mozo le llega el toast "Nuevo pedido · Mesa 100"; y con Cocina abierta, un pedido creado desde la API aparece sin recargar (el contador pasó de 2 a 3).
  5. **Cobros:** el cobro de un mozo queda con su `usuarioId` **y** su `mozoId`, y el de un gerente con su `usuarioId` y `mozoId` en null; ninguno guarda `cobradoPorNombre` (decisión 1). El modal ya no pregunta quién cobra.
  6. **Ocultamientos:** el OWNER ve el llamado pero no "Atendido", y tampoco "Editar pedido"; el GERENTE no ve "Atendido" pero sí "Editar". La cuenta que es dueña de la marca y mozo del restaurante ve "Atendido", atiende, y el llamado queda a nombre de su `Mozo`.
- **Revisión:** el subagente `revisor` la aprobó con observaciones (2026-10-22), sin bloqueantes. Lo que se corrigió:
  - **Al cambiar de restaurante, el socket seguía en la sala del anterior.** El gateway une la conexión a la sala y nunca la saca, y la 4.6 es la que hace posible cambiar de sucursal sin recargar: llegaban pedidos y llamados de la que se dejó. `services/socket.ts` recuerda a qué restaurante se unió la conexión y reconecta si le piden otro, así que la regla vale para todas las pantallas y no solo para quien cambia desde el selector. El primer intento la puso en `setRestaurante`, pero eso hacía que el store importara el servicio y el chunk del selector arrastrara `socket.io-client`, lo que volteó `App.spec` en el CI. De paso, el oyente de `connect` vuelve a entrar a la sala cuando socket.io reconecta solo: con `once` por llamada, una caída de red dejaba el tiempo real muerto en silencio.
  - **No había forma de volver al selector desde una vista**, así que una cuenta con dos restaurantes quedaba fija en el primero (está en localStorage). El panel del mozo y Cocina tienen "Cambiar de restaurante" cuando trabaja en más de uno.
  - Se borró el `mesasAsignadas` de `MesasPage`, un TODO del JWT del mozo que quedaba siempre vacío, con el recuadro "Tu mesa" que no se mostraba nunca.
  - `CLAUDE.md` decía que `packages/auth` lo usa el login de web-cliente: no es cierto (web-cliente nunca lo importó). Después de la 4.6 el paquete no tiene ningún consumidor.

- **Datos de prueba:** la base local no tenía JEFE_SALON ni COCINA, que son los roles propios de staff. Se sumaron con su `supabase_user_id` del Supabase de staging, junto con el `Mozo` de cada cuenta de salón (sin él, atender y cobrar dan 403) y una membresía MOZO para la cuenta mixta. El paso a paso está en `docs/auth/usuarios-prueba-staging.md`.

**4.7, cómo quedó (2026-10-22).** La última entrega de la Fase 4, en el PR draft #416. Cierra lo que dejaron la 4.5 y la 4.6, y con ella ninguna app manda ya el JWT legacy del personal.

Decisiones de la planificación de la 4.7:
1. **`packages/auth` se borra acá**, no en la Fase 5: no tenía ningún consumidor desde la 4.6 y no hacía falta esperar.
2. **El test inestable de web-staff se arregla acá**, porque la 4.7 es la que dispara el release que podría frenar.
3. **`POST /payments/solicitar-efectivo` rechaza un restaurante dado de baja**, además del cambio de pantalla: si no, el pedido de efectivo se podía crear igual desde `/pagar` o `/dividir`.
4. **Las variables de Vercel las carga el equipo a mano**, con el checklist de `docs/auth/VariablesACambiar.md`.

- **web-cliente ya no le pasa tokens al personal** (`pages/auth/AuthPage.tsx`). Si el login legacy devuelve `admin` o `mozo`, no guarda los tokens en localStorage ni arma `?token=&refresh=`: avisa que el ingreso de MenYU está en otra pantalla y manda a web-auth, con un link por si la navegación no sale. Antes, como `irAlLogin()` usa la URL completa, esos tokens terminaban copiados en el `redirect` de web-auth y en el historial y los logs de los dos dominios. La URL sale de `urlDeAuth()` (`utils/urlDeAuth.ts`): `VITE_AUTH_URL` y, si falta, el dominio de la app (`mesa.<ambiente>` → `auth.<ambiente>`, y los puertos de desarrollo). `resolveAppUrl` quedó sin uso; lo borra la Fase 5.
- **La mesa de un restaurante dado de baja solo paga con Mercado Pago.** `components/menu/MesaSinCarta.tsx` perdió "Llamar al mozo" y la mención al efectivo: con la baja el personal recibe 403 al cobrar en efectivo, cerrar la mesa y atender un llamado (4.2), así que las dos cosas eran una espera que nadie podía atender. El texto es el mismo que el de los diálogos de la consola de ROOT (`copy.ts`).
- **El backend cierra el otro lado:** `solicitarEfectivo` responde 403 "Este restaurante no está disponible" (el mismo mensaje que `POST /sessions/open`), antes de deduplicar y de crear nada. La ruta solo usa `SessionAuthGuard`, así que sin esto el pedido de efectivo y su llamado al mozo se creaban igual desde `/pagar` o `/dividir` y quedaban pendientes para siempre. `/pagar` y `/dividir` ya muestran el mensaje del servidor: no hubo que tocarlas.
  - Lo mismo en los otros dos caminos que crean un llamado al mozo, que lo señaló la revisión: `POST /waiter-calls` y `POST /payments/avisar-mozo-cuenta`. Hoy ninguno tiene un botón que lleve a ellos con el restaurante de baja, pero el token de la sesión de mesa alcanza para llamarlos, y nadie podría atender ese llamado.
- **El socket de `MesasPage` (web-staff) se suscribe una sola vez.** El efecto dependía de `sesionDetalle?.sesionId`, así que abrir una mesa desconectaba y volvía a conectar, y mientras tanto el handler de `sesion:cerrada` leía la sesión anterior: el detalle podía quedar mostrando una sesión ya cerrada. De ahí venía el test inestable que anotaba esta spec. El handler ya no lee la sesión del detalle: la limpia con una actualización funcional (`setSesionDetalle((actual) => …)`), que siempre ve el valor vigente; `mesas` y `sesiones` se leen por ref.
- **`packages/auth` borrado** (decisión 1), con las dos referencias que quedaban vivas: los `tailwind.config.js` de web-admin y web-staff, que ahora miran `packages/auth-client`. No tenía filtros en `ci.yml` ni entradas en `sonar-project.properties`.
- **Tests:** los de `AuthPage` (admin y mozo: no guarda tokens, no los pasa por la URL, avisa, espera a que se lea y recién entonces navega, y al desmontar no deja nada pendiente), `urlDeAuth` (la variable y cada fallback, incluidos los dominios viejos de Vercel), `MesaSinCarta` (sin mozo ni efectivo, y qué hacer si el pago falla), los tres caminos que crean un llamado al mozo (`solicitarEfectivo`, `avisarMozoPedidoDeCuenta` y `POST /waiter-calls`: restaurante y marca de baja → 403 sin crear ni borrar nada) y el socket de `MesasPage`. web-cliente queda en 737 tests, con `urlDeAuth.ts` y `MesaSinCarta.tsx` en 100 % de líneas y `AuthPage.tsx` en 97,2 %. El código nuevo de la entrega quedó en 98,8 % en SonarCloud.
  - Se arreglaron dos specs que fallaban solo en local: `ClienteMenuPage` esperaba el botón del mozo, y `MisPedidosPage` comparaba "p. m." con el espacio fino (U+202F) del ICU de Windows sin normalizar (la molestia que anotaba "Lo que dejó la 4.5"; en el CI de Linux pasaba).
- **Verificada en el navegador** (playwright-cli en `*.menyu.local`, con el Supabase de staging y el backend de esta rama en local, porque la API de staging todavía corre `main`):
  1. **Personal en el login del comensal:** con `mozo@menyu.com` del seed, termina en `http://auth.menyu.local:5173/` ("Ingresar | MenYU"), sin `token` ni `refresh` en la URL y con el localStorage vacío.
  2. **El comensal no cambia:** con `cliente1@menyu.com` entra al home y sus tokens quedan guardados como siempre.
  3. **Mesa sin carta:** con una mesa abierta y el restaurante dado de baja, `/menu` muestra solo "Pagar la cuenta" y "Ver mis pedidos", y el texto dice que se paga con Mercado Pago, que el efectivo no está disponible y qué hacer si el pago no funciona.
  4. **Efectivo rechazado:** con un pedido en la mesa y el restaurante de baja, "Pagar toda la cuenta en efectivo" muestra "Este restaurante no está disponible", y en la base no quedó ningún `pago` ni `llamado_mozo`. Al reactivar, el efectivo vuelve a funcionar ("El mozo se va a acercar a la mesa a cobrar el total").
  5. **SSO sin regresiones:** con la cuenta de tres lugares, el login en web-auth muestra el selector y después `admin.menyu.local/admin` abre en `/admin/dashboard` con el nav de dueño y `staff.menyu.local` en su selector, las dos sin volver a iniciar sesión.
- **Revisión:** el subagente `revisor` la aprobó con observaciones (2026-10-22), sin bloqueantes. Comprobó que no queda ningún camino por el que se pasen los tokens legacy, que el 403 del efectivo no se esquiva (`solicitarEfectivo` es el único lugar que crea un pago en efectivo del comensal, y un pendiente anterior a la baja tampoco se devuelve) y que el borrado de `packages/auth` no dejó referencias. Lo que se corrigió a partir de sus observaciones:
  - Los otros dos caminos que crean un llamado al mozo (arriba).
  - **El aviso del login del comensal era invisible:** se mostraba y se navegaba en el mismo tick, así que en el navegador la persona saltaba a web-auth sin leer por qué (podía parecer que la contraseña falló). Ahora la navegación espera 1,8 segundos, con el link para ir en el acto, y se cancela si la persona se va antes.
  - **`urlDeAuth` mandaba los dominios viejos de staging al login de producción:** `menyu-cliente-staging.vercel.app` no entraba en el patrón del dominio propio y caía en el default. `resolveAppUrl`, al que reemplaza, sí los distinguía.
  - **La mesa sin salida:** la pantalla dice qué hacer si el pago no funciona (ver "Lo que dejó la 4.7").
  - La lista de verificación en staging, que esta spec prometía y no existía, y el bloque "Lo que dejó la 4.7".

- Paquete compartido en el monorepo (`@menyu/auth-client`) con:
  - Cliente Supabase con cookie de dominio desde `VITE_AUTH_COOKIE_DOMAIN`.
  - Hook `useSession`.
  - Componente `RequireAuth` que redirige a web-auth con `redirect`.
  - `logout()` que hace `signOut()` y redirige a web-auth.
  - Revalidación de sesión al recuperar foco/visibilidad de la pestaña y cada pocos minutos. Necesario porque `onAuthStateChange` no se entera de cambios hechos desde otro subdominio.
- Variables de entorno de los frontends: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_AUTH_COOKIE_DOMAIN` y `VITE_AUTH_URL`.
- `@supabase/ssr` 0.12.x pide `@supabase/supabase-js` ^2.114: alinear la versión del backend. Hecho en la 4.1 (2.117.0).
- Integrarlo en web-admin y web-staff (con `RequireAuth`). En web-cliente **no**: su sesión de mesa no es una cuenta, y la cuenta opcional del comensal (con `useSession`, sin `RequireAuth`) pasó a la Fase 4b (decisión 6). En la Fase 4 web-cliente solo dejó de pasarle tokens al personal (4.7).
- CI: sumar `@menyu/auth-client` a los filtros de test y cobertura de `ci.yml`, a la subida de cobertura y a `sonar-project.properties`, como `@menyu/ui`. Los deploys no cambian: las apps que lo importan se reconstruyen solas cuando cambia (`turbo-ignore` y `dependsOn: ["^build"]`).
- **Terminado cuando:** login en auth → abrir admin y staff en otras pestañas sin volver a loguear; logout en una → las otras vuelven a web-auth al recuperar foco. Probado en `*.menyu.local` y en staging.
  - **Cumplido en los dos** (2026-10-23): en `*.menyu.local` desde la 4.6, y en staging después del merge del PR #416 y del hotfix de Node 22. El detalle, abajo.

**Qué verificar en staging después del merge (Fase 4).** La lista para correr hoy, con casilleros, la Fase 5 y la pasada del 2026-10-27, es [`docs/auth/checklist-staging.md`](../checklist-staging.md); la de abajo queda como la de la Fase 4. Con los usuarios de `docs/auth/usuarios-prueba-staging.md`, nunca contra producción. Los dos requisitos previos están cumplidos desde el 2026-10-22: las variables de Vercel cargadas (`docs/auth/VariablesACambiar.md`, Fase 4) y la consulta de ítems cruzados de "Lo que dejó la 4.3" con cero filas en los dos ambientes.

1. **SSO (el "Terminado cuando"):** iniciar sesión en `auth.staging` y abrir `admin.staging` y `staff.staging` en otras pestañas sin volver a ingresar. Cerrar sesión en una y comprobar que las otras vuelven a web-auth al recuperar el foco.
2. **Destino por rol y sin loop:** cada rol termina en su app; ROOT entra solo a `/root` y recibe 403 en `/admin/*`; COCINA, solo a `/cocina`; un MOZO que abre admin termina en staff.
3. **Personal, de punta a punta con mail real** (pendiente desde la 4.5: el entorno local no tiene `SUPABASE_SERVICE_ROLE_KEY`): el OWNER invita a un MOZO, le llega el mail, define su contraseña y entra. Después le quita el acceso y la cuenta pasa a recibir 403.
4. **Consola de ROOT:** invitar a un dueño, ver las dos acciones en el historial, dar de baja la marca (su gente pierde el acceso) y reactivarla.
5. **Cobros y Caja** (pendiente desde la 4.5, que no tenía datos de pagos): un cobro de un mozo queda con su `usuarioId` y su `mozoId`; uno de un gerente, con `mozoId` en null. Se ven en la pantalla de Caja de web-admin.
6. **web-cliente (4.7):** el login del comensal entra normal; con una cuenta del personal avisa y manda a `auth.staging` sin tokens en la URL.
7. **Regresión de web-auth:** Google, invitación y recuperación de contraseña.

**Cómo salió en staging (2026-10-23).** Con el merge del PR #416 y, encima, el hotfix de Node 22 (ver arriba). Verificado con playwright-cli contra los dominios `*.staging.menyu-app.com` y con la API:

1. **SSO: cumplido.** El OWNER entra por `auth.staging` y aterriza en `admin.staging/admin/dashboard`; `staff.staging` abre en otra pestaña sin volver a ingresar. La cookie `sb-<ref>-auth-token` queda en `.staging.menyu-app.com`, con `secure` (acá sí, es https), `Lax` y sin `httpOnly`. "Salir" en staff la borra y la pestaña de admin vuelve a web-auth con su `redirect` al recuperar el foco.
2. **Destino por rol y sin loop: cumplido.** ROOT termina en `/root/marcas`, COCINA en `/cocina` y MOZO en `/mozo`, los tres con su `?restauranteId=`. Un MOZO que abre `admin.staging/admin/dashboard` termina en staff; un COCINA que escribe `/mozo` vuelve a `/cocina`; ROOT que escribe `/admin/dashboard` vuelve a `/root/marcas`. Con el token de ROOT, `GET /restaurantes`, `/marcas` y `/pedidos` dan **403**, y `/root/marcas` da 200.
3. **Personal: cumplido de punta a punta.** Invitar a un email nuevo responde 201 con `invitacionEnviada: true`, el invitado aparece en la lista con su rol y repetirlo da 409. **El mail llegó**, su link abrió `/invitacion` sin gastar el token y, al guardar la contraseña, la cuenta entró directo a `staff.staging/cocina` (se invitó como COCINA). Es lo que estaba pendiente desde la 4.5, que en local no se podía por la falta de `SUPABASE_SERVICE_ROLE_KEY`. Las credenciales quedaron en `docs/auth/.env.usuarios-staging` (`STAGING_AUTH_INVITADO_F47_*`).
4. **Consola de ROOT: cumplida.** Cargan las pantallas de marcas, dueños, cuentas ROOT (E2b) e historial. La baja efectiva se probó contra la API: el MOZO pasa de 200 a **403** en `GET /mesas` al dar de baja el restaurante, y vuelve a 200 al reactivarlo.
5. **Cobros y Caja: cumplido.** Se abrió una mesa por PIN, se pidió un ítem y se cobró en efectivo, con las dos clases de cuenta. La Caja muestra "Mesa 1 · $1.000 · efectivo · Owner Pruebas Auth" para el cobro del OWNER y "… · Mozo Pruebas Auth" para el del MOZO.
   - Al principio el cobro del MOZO daba **403** ("Tu perfil de mozo no está activo en este restaurante"): la cuenta tenía `Membresia` pero no su fila en `mozo`, porque se insertó a mano. Se corrigió con `docs/auth/mozos-faltantes-staging.sql` y pasó a 200.
   - Ese 403 → 200 es justamente lo que prueba la atribución: `registrarCobro` llama a `exigirMozo` para resolver el `Mozo` del que cobra, así que si no hay `Mozo` no cobra. El nombre por sí solo no alcanzaba para distinguir, porque el `Usuario` de esa cuenta se llama igual que su `Mozo`, y la API no expone el `mozoId`; que el `Pago` del mozo lleve `mozoId` y el del administrador lo deje en null está cubierto por los tests de `atribucion-del-cobro` y se comprobó contra la base en la 4.6.
6. **web-cliente: cumplido.** En `mesa.staging/auth`, una cuenta del personal recibe el aviso, el localStorage queda vacío y termina en `auth.staging` sin `token` ni `refresh` en la URL.
7. **Regresión de web-auth: cumplida, las tres.**
   - **Google:** con el perfil de pruebas, "Continuar con Google" lleva al selector de cuentas y vuelve por `/google` hasta `staff.staging/mozo`, con el panel de la cuenta como MOZO.
   - **Invitación:** el caso 3.
   - **Recuperación:** el link del mail (`/restablecer-contrasena`, `token_hash` con prefijo `pkce_`) abre la pantalla sin gastar el token y, al guardar, entra a `staff.staging/cocina`. Después, la contraseña anterior responde 400 en Supabase y la nueva 200.
   - **De paso:** el link de invitación es de un solo uso. Al reusarlo, `/invitacion` dice "Este link ya no sirve — El link venció o ya se usó" y ofrece pedir uno nuevo desde "Olvidé mi contraseña".

Y lo que destrabó el hotfix de Node 22: **subir un logo** responde 201 con su URL y borrarlo 200 (se hizo y se deshizo sobre el restaurante de prueba).

### Fase 4b — Cuenta de cliente ✅ (2026-10-23), verificada en staging y en producción desde v1.3.0 (2026-10-25)

- Registro (email + contraseña, con confirmación de email) e inicio de sesión de clientes en web-auth, también con Google. Vuelven a web-cliente con `redirect`.
- Backend: resolver o crear el `Cliente` por `supabaseUserId` a partir del token de Supabase. Sin `Usuario` ni `Membresia`: una cuenta de cliente no da acceso al personal.
- `POST /sessions/open` asocia la mesa a ese `Cliente` cuando recibe un token de Supabase.
- **Terminado cuando:** un cliente se registra en web-auth, vuelve logueado a web-cliente, abre una mesa por QR y la sesión queda a su nombre; sin cuenta, el QR y el PIN funcionan igual que antes.
  - **Cumplido en `*.menyu.local`** (2026-10-23), con el Supabase de staging y el backend de la rama en local. **Cumplido en staging** (2026-10-24 y 2026-10-25): el registro con la plantilla de MenYU, la vuelta logueada a `mesa.staging`, la mesa por QR a nombre de la cuenta y, sin cuenta, "Invitado" (ver "Lo que dejó la 4b").

**Decisiones de la planificación de la 4b (2026-10-23):**
1. **Una cuenta de cliente y una del personal sin invitación se distinguen por el contexto, no por `/auth/me`.** Para Supabase son lo mismo: una cuenta sin `Usuario`. `/auth/me` sigue respondiendo 403 y no cambia su contrato, así que `RequireAuth`, `appsDelPerfil` y la nota de seguridad "autenticarse en Supabase NO otorga acceso" quedan igual. Ante un 403, web-auth vuelve al `redirect` si es de web-cliente (que no pide cuenta); si no, `/sin-acceso`, que ahora ofrece "Ir a MenYU". El registro siempre manda un `redirect` a web-cliente. Se descartaron que `/auth/me` devolviera un perfil de cliente (cambiaba el contrato de web-admin y web-staff en el mismo release que la Fase 4) y tratar todo 403 como cliente (quien espera una invitación terminaba en la carta sin explicación).
2. **Un `Cliente` del login anterior con el mismo email se vincula**, como la invitación con el `Mozo`, y conserva su historial. La comparación no distingue mayúsculas. Depende de que Supabase solo dé sesión con el email confirmado (o con Google), y de que la confirmación la haga el dueño del email: por eso la plantilla "Confirm signup" de MenYU es un requisito de seguridad (ver Notas de seguridad).
3. **"Ingresar" y "Registrarme" de web-cliente van a web-auth ya en la 4b.** La ruta `/auth` sigue andando por URL hasta la Fase 5.

**4b, cómo quedó.**
- **Backend** (`auth/supabase/cuenta-de-cliente.service.ts`, en el `SupabaseAuthModule` global):
  - `CuentaDeClienteService.clienteDe(token)` verifica el token con el JWKS (`VerificadorTokenSupabase.claims`, que comparte la verificación con el guard) y devuelve el `Cliente`. Primero busca el de la cuenta; si no hay, vincula uno del login anterior sin cuenta con el mismo email, con una escritura condicionada a que siga sin cuenta; y si no, crea uno.
  - El nombre sale de `user_metadata`: `nombre` (lo manda web-auth), `full_name` o `name` (Google), sin caracteres de control y con un tope de 80. Sin ninguno, "Cliente": la parte local del email no se usa porque el personal ve el nombre.
  - Dos pedidos a la vez de la misma cuenta no crean dos `Cliente`: el P2002 vuelve a buscar el de la cuenta. Si el email es de otro `Cliente` que ya tiene su propia cuenta, el nuevo queda sin email: no se le quita al otro.
  - Nunca crea `Usuario` ni `Membresia`.
  - `resolveClienteId` (sessions) elige con qué verificar por el encabezado del token (`esTokenDeSupabase`: ES256 o RS256). El de Supabase va a `clienteDe`; cualquier otro, al `JWT_SECRET` del login anterior, como antes. Cada verificación acepta solo sus algoritmos, así que un token no puede pasar por el camino del otro. La ruta sigue pública: el token solo dice a nombre de quién queda la mesa. Un token que no sirve, o un Supabase que no responde (queda en el log), entra como "Invitado".
- **web-auth:**
  - `/crear-cuenta` (`CrearCuentaPage`): nombre, email y contraseña, o Google. Hace `signUp` con `data.nombre` y `emailRedirectTo` en `/confirmar-email?redirect=<web-cliente>`. El destino es el `redirect` si es de web-cliente; si no, su inicio. Como "Olvidé mi contraseña", no dice si el email ya tenía cuenta.
  - `/confirmar-email` (`ConfirmarEmailPage`) acepta dos links. El de la plantilla "Confirm signup" de MenYU trae un `token_hash`, que se canjea con `verifyOtp` recién al tocar el botón. El de la plantilla por defecto de Supabase vuelve con un `?code=`, que se canjea al llegar, como `/google`, y solo abre la sesión en el navegador donde se creó la cuenta (en otro, dice que la cuenta quedó confirmada y que ingrese).
  - El post-login (`usePostLogin`) vuelve al `redirect` de web-cliente ante un 403. `decidirDestino` deja ir a web-cliente aunque la cuenta no tenga ningún lugar. `/` suma "Creá tu cuenta" y `/sin-acceso`, "Ir a MenYU".
  - La política de privacidad describe la cuenta de cliente y el mail de confirmación (vigente desde el 23 de octubre; la Fase 5 la actualizó y hoy rige desde el 26 de octubre de 2026, `PrivacidadPage.tsx`).
  - La plantilla nueva es `docs/auth/plantillas-mail/confirm-signup.html`: arma el link con `{{ .RedirectTo }}`, no con la Site URL (`docs/auth/VariablesACambiar.md`).
- **web-cliente:**
  - Suma `@menyu/auth-client` y lee la sesión con `useSession`, sin `RequireAuth`. `useSession` del paquete ahora queda sin sesión si al deploy le faltan las variables de Supabase, en vez de romper la pantalla.
  - `utils/cuenta.ts` y `hooks/useCuenta.ts` juntan las dos cuentas mientras convivan. La del login anterior se lee con una sola regla: un token de cliente, sin vencer y con nombre. Antes el header aceptaba cualquier token con nombre, aunque fuera del personal o estuviera vencido, y el menú lateral no miraba el vencimiento.
  - Si hay las dos cuentas, vale la de Supabase: es su token el que va en `POST /sessions/open`.
  - "Ingresar" y "Registrarme" (header y menú lateral) van a web-auth con el `redirect` a la pantalla actual. "Cerrar sesión" cierra las dos y la persona se queda en web-cliente; la de Supabase se cierra en todas las apps, porque la cookie es compartida.
  - Donde la app no comparte la sesión de web-auth (`comparteLaSesionDeWebAuth`), "Ingresar" y "Registrarme" siguen yendo al `/auth` de la app, con la vuelta a la pantalla. Pasa en los dominios viejos de Vercel, donde está la mayoría de los QR impresos, y en un deploy sin las variables de Supabase. Lo encontró la revisión: en `menyu-cliente*.vercel.app` web-auth no acepta volver a `vercel.app`, así que el cliente terminaba en "sin acceso".
  - Se borraron `utils/resolveAppUrl.ts` y `api.payments.initiate`, que estaban muertos.
- **Tests:**
  - Backend: `cuenta-de-cliente.service.spec.ts`, con tokens firmados contra un JWKS local: crear, encontrar, vincular, las carreras, el nombre y los tokens que no sirven. También `resolveClienteId` y `open` con cada token. El código nuevo queda en 100 % de líneas.
  - web-auth: `CrearCuentaPage`, `ConfirmarEmailPage` (los dos links, el error en la URL y el reintento sin volver a canjear), el 403 con `redirect` a web-cliente, `destinos` y `/sin-acceso`. Las dos pantallas nuevas quedan en 100 %.
  - web-cliente: `cuenta` (con `comparteLaSesionDeWebAuth` y el respaldo a `/auth`), `useCuenta`, el header, el menú lateral, la carta, el menú y `sessions.open` con el token de Supabase. `src/test/authClient.ts` simula `@menyu/auth-client` para todos los specs desde `src/test/setup.ts`, que además deshace las variables simuladas después de cada test. Lo nuevo queda en 100 %.
- **Verificada en el navegador** (playwright-cli en `*.menyu.local`, con el Supabase de staging y el backend de la rama en local):
  1. **Registro de punta a punta, con mail real.** Desde "Registrarme" de web-cliente se llega a `auth/crear-cuenta` con el `redirect`, y el `signUp` sale con el nombre y la vuelta a `/confirmar-email`. El mail llegó con la plantilla por defecto, porque la de MenYU todavía no está cargada en staging. Su link pasó por Supabase, `/confirmar-email` canjeó el `code` y la cuenta volvió a web-cliente como "Hola, Ana Fase Cuatro B". Las credenciales están en `docs/auth/.env.usuarios-staging` (`STAGING_AUTH_CLIENTE_F4B_*`).
  2. **La mesa a su nombre.** Por el link del QR (`/check-in`), `POST /sessions/open` salió con el token ES256 y la sesión nueva quedó con esa cuenta de anfitriona: su `Cliente` tiene su nombre, su email y su `supabase_user_id`. No se creó ningún `Usuario`. Al entrar a otra mesa usó el mismo `Cliente`.
  3. **Ingreso de un cliente que ya tenía cuenta**, con la cuenta de prueba sin `Usuario`. Desde "Ingresar" de web-cliente, `/auth/me` dio 403 y la cuenta volvió a web-cliente con la sesión, en la cookie `sb-<ref>-auth-token` de `.menyu.local`. La mesa quedó a nombre del `Cliente` del login anterior con el mismo email, guardado en mayúsculas a propósito: se vinculó. Con esa sesión, `/auth/me`, `/mesas`, `/pedidos` y `/restaurantes` responden 403.
  4. **Sin cuenta:** el QR y el PIN entran como "Invitado", sin token; el PIN se sumó a una sesión ya abierta por el personal, como antes.
  5. **El login de `/auth` de web-cliente** sigue andando: su token (HS256) deja la mesa a nombre de "Cliente Uno".
  6. **"Cerrar sesión"** en web-cliente borra la cookie de la sesión y la persona se queda en web-cliente.
  7. **El personal no cambió:** la cuenta sin `Usuario`, entrando a web-auth sin `redirect`, termina en `/sin-acceso`, y "Ir a MenYU" la lleva a web-cliente con la sesión. El MOZO termina en `staff/mozo`.
  8. **Google, a medias.** Desde web-cliente, "Continuar con Google" sale con la vuelta a `auth/google?redirect=<web-cliente>` y el verificador PKCE en las cookies de `.menyu.local`. Google pidió un reCAPTCHA ("actividad inusual"), que tiene que resolver una persona, así que la vuelta no se probó. La lógica es la de cualquier 403, que sí se probó en el caso 3.
  9. **Fuera del dominio de la cookie** (`127.0.0.1:5176`, como un dominio viejo de Vercel): "Iniciar sesión" desde la carta va a `/auth?volver=/restaurante/…/carta` de la app. En `mesa.menyu.local` va a web-auth.
- **Revisión:** el subagente `revisor` la aprobó con observaciones (2026-10-23), sin bloqueantes. Probó en el navegador:
  - los `redirect` maliciosos (`evil.example.com`, `mesa.menyu.local.evil.com`, `//…`, `javascript:` y `vercel.app`): todos terminan en `/sin-acceso`;
  - tokens alterados contra `POST /sessions/open`: un HS256 con el `alg` cambiado a ES256, `alg: none` y un RS256 sin firma válida entran como "Invitado";
  - las rutas del personal con el token de cliente: todas dan 403.

  Lo que se corrigió:
  - **En los dominios viejos de Vercel, "Ingresar" y "Registrarme" llevaban a "sin acceso"**: ahora van al `/auth` de la app (arriba, web-cliente).
  - **CLAUDE.md había perdido la regla "No mezclar los dos sistemas en un mismo endpoint"** al reescribir el párrafo de web-cliente. Volvió, con la excepción explícita de `POST /sessions/open`.
  - **La plantilla "Confirm signup" pasó a ser un requisito de seguridad** (Notas de seguridad). La revisión vio el riesgo para el vínculo de la 4b, y ampliarlo mostró que también alcanza a las invitaciones del personal.
  - `docs/auth/VariablesACambiar.md` decía que, sin la plantilla, `/confirmar-email` no abría la sesión; desde el canje del `?code=` sí la abre en el mismo navegador.

  Lo que quedó anotado está en "Lo que dejó la 4b".

### Fase 5 — Limpieza ✅ (2026-10-26), verificada en staging y en producción desde v1.4.0 (2026-10-28)

- Quitar de web-cliente la pantalla `/auth` (login del personal y login/registro de clientes, que ahora viven en web-auth), y con ella la cuenta del login anterior que la 4b mantiene: la rama `anterior` de `utils/cuenta.ts`, `utils/tokenCuenta.ts`, `utils/jwt.ts` si queda sin uso, y el camino del `JWT_SECRET` en `resolveClienteId`.
- El pasaje de tokens por URL (`?token=&refresh=`), el script de `index.html` de web-admin y web-staff, `resolveLoginUrl`, `packages/auth`, `resolveAppUrl` y `api.payments.initiate` de web-cliente ya no están: los retiraron la 4.5, la 4.6, la 4.7 y la 4b.
- Quitar los endpoints legacy `/auth/login`, `/auth/register`, `/auth/guest`, `/auth/refresh` y `/auth/logout`, la tabla `RefreshToken`, `Admin` y `AdminRestaurante` (después de pasar `PedidoEdicion.adminId` a `Usuario`) y los `passwordHash` de `Mozo` y `Cliente`.
- Actualizar CLAUDE.md (roles y dominios; la regla del login del comensal ya la actualizó la 4b) y Swagger.
- Documentar en la tesis las decisiones de esta spec.

#### Decisiones de la planificación de la Fase 5 (2026-10-25)

1. **Los clientes con contraseña del login anterior no se migran ni se avisan.** Contados con un `SELECT` de solo lectura: 1 en staging y 14 en producción, ninguno con cuenta de Supabase. Eran de prueba. Quien quiera volver se registra en web-auth con el mismo email y la 4b le engancha su `Cliente` con su historial de mesas.
2. **`/auth` de web-cliente redirige a web-auth, no desaparece.** Queda una ruta mínima que conserva el `?volver=` (validado con `rutaInterna`) y el `?tab=register`, para que un link o un marcador viejo lleve igual a un ingreso que funciona.
3. **`PedidoEdicion.adminId`: backfill por email y después null.** La migración pasa a `usuario_id` las ediciones cuyo `Admin` fue invitado después con el mismo email (comparado sin mayúsculas) y borra la columna; el resto queda sin editor, como las de un mozo que ya no está. En producción esos admin eran de prueba.
4. **Las migraciones destructivas van en el mismo release que el código, con respaldo.** Un solo tag. Antes del de producción se exportan `admin`, `admin_restaurante`, `refresh_token` y los `password_hash` de `mozo` y `cliente`, fuera del repo. El orden de los commits (código primero, DROP después) deja la base sirviendo al código anterior hasta el último paso.
5. **En los dominios viejos de Vercel la cuenta ya no es posible y no se hace nada al respecto.** Los QR impresos que llevan ahí eran de prueba. "Ingresar" y "Registrarme" van a web-auth esté donde esté la app; sin la cookie, el QR y el PIN entran como invitado.
6. **`DELETE /mozos/:id` se borra, con su botón de web-admin.** Era la única forma de borrar un perfil de mozo sin cuenta, y la spec lo pedía desde la 4.3. Los que queden en la base se limpian con SQL si molestan.
7. **La matriz de quién invita y quita pasa a `@menyu/types`, pero el backend no importa el paquete.** Hacerlo obligaría a construirlo dentro del Dockerfile, o sea a tocar el camino del deploy. La tabla la ofrece web-admin y la decide el backend con su propio `puedeInvitar`; lo que ata una cosa a la otra es `puede-invitar.spec.ts`, que recorre la tabla entera.
8. **supabase-js se carga en diferido en web-cliente**, y antes de cargarlo se mira si hay cookie de sesión: quien entra sin cuenta no espera ningún chunk. La compuerta es `puedeHaberSesion()` de `utils/cuenta.ts`, una sola para los dos lugares que lo cargan sin saber si hay sesión (`tokenParaAbrirMesa` y `useSesionDiferida`; el tercero, `cerrarSesionDeLaCuenta`, solo se alcanza con una sesión abierta), porque la revisión encontró que al principio solo la tenía el segundo y abrir la mesa por QR bajaba el chunk igual.

- **Terminado cuando:**
  1. Los cinco endpoints del login propio responden 404 y no figuran en Swagger; `rutas-por-autenticacion.spec.ts` pasa sin la rama del JWT legacy.
  2. Un grep de `passwordHash`, `password_hash`, `RolAdmin`, `rol_admin`, `prisma.admin`, `adminRestaurante`, `admin_restaurante` y `refreshToken`/`refresh_token` (del login) no devuelve nada en **todo el repo** —no solo en `apps/`: el primer intento se limitó a `apps/` y `packages/`, y se le escapó el SQL del E2E de staging (`scripts/`), que rompió la limpieza del E2E en cuanto la migración se aplicó—, salvo `mpRefreshToken` y `autoRefreshToken`, que son de Mercado Pago y de Supabase, y la regex de `includes-contract.spec.ts` con el test que la ejercita, que ataja una columna de contraseña si alguna vez volviera. `menyu_access_token` y `menyu_refresh_token` quedan a propósito en la limpieza del localStorage de web-cliente (`utils/cuenta.ts`) y en los tests que comprueban que esos tokens se borran o se ignoran (los dos en web-cliente; `menyu_access_token` también en web-admin y web-staff). El `refresh_token` del OAuth de Mercado Pago es otro y tampoco cuenta (`mercado-pago-oauth.*`, `Documentacion/MercadoPago.md`, `docs/calidad/MercadoPago.md` y `Documentacion/modulo-pagos*.md`). Y no cuenta lo que narra el pasado: las migraciones de Prisma; `scripts/e2e-staging/sql/e2e-limpiar-sin-password-hash.sql`, la corrección de la función del E2E; los resúmenes de sprint y de sesión, que cuentan una etapa cerrada (`Documentacion/sprint*-resumen.md`, `devops-resumen-ojeda.md`, `modulo-pagos-sesion2.md`); las bitácoras; lo de `docs/auth/review/`; los documentos con un encabezado que los marca como históricos (`Documentacion/Doc_DB.md`, `modulo-usuarios-y-autenticacion.md` y `modulo-menu.md`, y `docs/plan-consola-root.md`); las frases que cuentan en pasado qué se retiró (los comentarios de `seed.ts`, `packages/types/src/auth.types.ts` y `registrar-historial.ts`, y `CLAUDE.md`, `docs/auth/usuarios-prueba-staging.md` y `docs/plan-discovery-descuentos.md`), y las fases y decisiones de esta spec, que cuentan qué había y qué se hizo en cada una.
  3. La migración corre limpia sobre una base con datos del login anterior y el seed nuevo corre después.
  4. En el navegador (local o staging, nunca producción): `/auth` redirige a web-auth; el registro y el login de un cliente vuelven a web-cliente y la mesa queda a su nombre; el QR y el PIN sin cuenta entran como "Invitado"; un token HS256 del login anterior en `POST /sessions/open` entra como "Invitado".
  5. `pnpm typecheck` y las suites de backend, web-cliente y web-admin en verde, con el quality gate de SonarCloud. **Cumplido en parte:** el gate pasó en el CI de `94fe19f`, pero contra *Previous version* del 17/10, así que la fase no se midió sola. B2 del informe de revisión (`docs/auth/review/auth-review-2026-10-27.md`) queda abierto: el ✅ es decisión del usuario del 2026-10-28.
  6. `/privacidad` actualizada, con su fecha de vigencia.
  7. El subagente `revisor` aprueba la fase.

**5, cómo quedó (2026-10-26).** En seis commits, para que el código deje de usar las tablas antes de borrarlas.

- **Backend:** los cinco endpoints del login propio, `AuthService`, `JwtStrategy`, `JwtAuthGuard`, `TipoGuard`, `@RequiresTipo`, sus cuatro DTOs y, de `common/`, `RolesGuard`, `@Roles` y `@CurrentUser`. `AuthController` quedó con `GET /auth/me` y `AuthModule` sin imports. `UsersModule` se borró entero: su único uso vivo era crear el invitado, que ahora es un `prisma.cliente.create` en `SessionsService`. También `DELETE /mozos/:id` (con su botón de web-admin), `POST /payments/avisar-mozo-cuenta`, el esquema Swagger por defecto, el Postman del login y las dependencias `bcryptjs`, `passport` y `passport-jwt`.
- **`resolveClienteId`** verifica solo con el JWKS, así que `esTokenDeSupabase` quedó redundante y se borró (`claims` ya restringe los algoritmos).
- **Migración `20261025120000_fase5_login_legacy`:** el backfill de `pedido_edicion.admin_id` a `usuario_id` por email, y después los DROP de `admin_restaurante`, `admin` (con la función de su disparador y el tipo `rol_admin`), `refresh_token` y los `password_hash` de `mozo` y `cliente`. El seed ya no crea contraseñas: deja el `Usuario` OWNER de Supabase y, sin cuenta, el mozo y los dos clientes, para probar los vínculos por email.
- **web-cliente:** `AuthPage`, `utils/tokenCuenta.ts` y `utils/jwt.ts`; `/auth` quedó como un redirect a web-auth que conserva el `?volver=` y el `?tab=register`. Al arrancar borra del localStorage los tokens que dejó el login anterior. supabase-js se carga en diferido y solo si hay cookie de sesión: la carga inicial bajó de 650,90 kB (184,19 kB gzip) a 409,88 kB (120,51 kB gzip).
- **La matriz de quién invita y quita** vive en `@menyu/types` (`permisos.ts`), la ofrece web-admin y `puede-invitar.spec.ts` comprueba que el backend diga lo mismo, recorriendo la tabla entera.
- **Lo que cerró de paso:** las contraseñas conocidas de `admin` que estaban documentadas en un repo público (`root@menyu.com` / `root1234` y compañía) ya no sirven, porque no hay dónde verificarlas. Quedó anotado en `docs/plan-consola-root.md` y `docs/plan-discovery-descuentos.md`.

- **Lo que se probó, en local (2026-10-26):**
  - La migración, sobre una base descartable con datos del login anterior: el backfill acierta en los tres casos (el admin con un `usuario` del mismo email, el que no lo tiene y la edición ya atribuida, que no se pisa), y las tablas, el tipo, la función del disparador y las dos columnas quedaron borrados. El seed nuevo corre después sin tocar nada.
  - Las suites: backend 2021 tests, web-cliente 746, web-admin 852, web-auth 93, más los 13 e2e del backend contra el esquema nuevo. `pnpm typecheck` limpio.
  - Con el backend local: los cinco endpoints y los dos borrados responden 404, y `GET /auth/me` sigue dando 401 sin token.
  - **Un token HS256 firmado con `JWT_SECRET`** (el del login anterior, con el `sub` de un `Cliente` que existe) en `POST /sessions/open`: la mesa queda a nombre de un "Invitado" nuevo, no de ese cliente.
  - En el navegador (playwright-cli, `*.menyu.local`): `/auth` manda a `auth.menyu.local:5173` con el `redirect` a web-cliente; `?tab=register` va a `/crear-cuenta`; un `?volver=` interno se conserva y uno a otro sitio (`https://evil.example.com`) se descarta. El QR de la mesa 99 abre la sesión y pide el nombre del comensal, con el `Cliente` en "Invitado".
  - **La carga diferida:** sin cookie de sesión, cero pedidos de supabase-js o `@menyu/auth-client`, y "Ingresar" se ve enseguida. Con una cookie puesta a mano, sí los pide (13 módulos en dev) y, como el token no sirve, sigue ofreciendo "Ingresar".

- **Revisión:** el subagente `revisor` la aprobó en segunda vuelta (2026-10-26). Lo que encontró y se corrigió:
  - **Bloqueante: `pnpm build` de web-admin fallaba** ("`rolesQuePuedeInvitar` is not exported by `packages/types/dist/index.js`"). `@menyu/types` compila a CommonJS y su `index.js` reexporta con `__exportStar`, que Rollup no puede analizar; el commit de la matriz metió el primer import de **valor** de ese paquete en un frontend. Typecheck, lint y los 852 tests pasaban igual, porque en runtime el valor existe: solo lo veía el build de producción, o sea el deploy de Vercel. Se resolvió con un subpath `@menyu/types/permisos` que apunta a la fuente, como hace `@menyu/ui` con los suyos; la entrada principal sigue siendo el `dist` compilado, que es lo que usan los tipos y el spec del backend.
  - **Bloqueante: `tokenParaAbrirMesa` no miraba la cookie**, así que entrar por QR o PIN sin cuenta bajaba igual el chunk de supabase-js, y encima antes del `POST /sessions/open`. Se unificó en `puedeHaberSesion()` y se cubrió con tests; comprobado en el navegador: el check-in pasó de 13 pedidos de `auth-client`/`supabase` a **0**.
  - Comentarios que habían quedado mintiendo (`@CurrentUser` en `usuario-actual.decorator.ts`, "dar de baja" en `mozos.controller.ts`, la matriz en el bullet de web-admin de CLAUDE.md), el tope de rutas del spec del enrutador (quedó en `>= 115` con 120 reales) y `TODOS` del spec de la matriz, que ahora sale del enum de Prisma: un rol nuevo en la base rompe el test hasta que se decida a quién invita.
  - Se sumó el caso de la **cookie rancia** (está la cookie, el token ya no sirve): carga el paquete y termina en `sin-sesion`, no se queda cargando.
- **Para tener en cuenta en el deploy:** el backend declara `@menyu/types` como devDependency y la usa **solo** `puede-invitar.spec.ts`. El build de Docker funciona porque `.dockerignore` excluye `**/*.spec.ts`: el `tsconfig.json` del backend incluye los specs, así que si alguna vez se saca esa exclusión, `nest build` dentro de la imagen va a querer compilar el paquete y fallar.
- **Para tener en cuenta en producción:** la migración es irreversible, así que en cuanto se aplique la base deja de servir al código del release anterior. Es la situación del incidente del 2026-10-20, aunque esta vez no se crea ningún índice único (lo que lo causó). El servicio de producción está desconectado de GitHub a propósito, para que solo despliegue desde `deploy-production.yml`: **si eso cambiara**, un cambio de variables en Railway construiría el último commit de `main` y aplicaría los DROP, así que el respaldo tendría que estar hecho antes del merge, no antes del tag. Antes de aplicarla conviene comprobar que en producción no haya vistas, políticas u otros objetos que referencien `admin` (en local no hay ninguno).
- **Sin verificar todavía** (al 2026-10-26. La cuenta de cliente y Google como cliente se verificaron en staging el 2026-10-27, `docs/auth/review/auth-review-2026-10-27.md` §3.7; el quality gate de SonarCloud sigue pendiente. Los casos quedaron con casilleros en [`docs/auth/checklist-staging.md`](../checklist-staging.md)): el registro y el login de un cliente de punta a punta con la mesa a su nombre, que necesita una cuenta real de Supabase. El camino cambió en esta fase (`useSesionDiferida` y `tokenParaAbrirMesa`), así que conviene pasarlo a mano en staging antes del tag. Lo mismo el quality gate de SonarCloud y el login con Google, que lo prueba una persona.

- **Lo que apareció después del merge (2026-10-26):** el E2E contra staging falló en el paso 6, la limpieza. Los cinco pasos funcionales —QR, pedido, pedido de efectivo, el mozo confirmándolo y el cierre— pasaron, así que no era la app: la función `e2e.e2e_limpiar`, que vive en la base de staging (`scripts/e2e-staging/sql/e2e-staging.sql`), filtraba por `cliente.password_hash IS NULL`, y esa columna ya no existe. Se le sacó la condición (`email IS NULL AND supabase_user_id IS NULL` sigue garantizando que solo borre los invitados de la corrida) y queda `scripts/e2e-staging/sql/e2e-limpiar-sin-password-hash.sql` para reemplazar solo esa función, porque el archivo completo no se puede volver a correr: crea el rol `e2e_staging`, que ya existe. Se aplicó en el SQL Editor del Supabase de staging el 2026-10-26: la definición instalada ya no menciona `password_hash`, sigue siendo `SECURITY DEFINER` de `postgres` y `e2e_staging` conserva el `EXECUTE` (un `CREATE OR REPLACE` no pierde los grants). **Si alguna vez se instala el E2E en producción, hay que aplicarlo ahí también.**

  La lección, y de ahí el criterio 2 del "Terminado cuando": una columna borrada puede tener consumidores fuera de `apps/` y `packages/`. El grep de verificación va sobre todo el repo, y lo que vive instalado en una base (funciones, vistas, políticas) no lo encuentra ningún grep: hay que revisarlo aparte.

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
- Desde la 4.4, ROOT invita a OWNER y a otras cuentas ROOT, y la invitación solo impide invitarse con el email propio. Nada impide que una persona con ROOT invite como dueño de una marca a otra casilla suya (`ana+x@gmail.com`), o se invite primero como otra cuenta ROOT y después la sume como dueño, y entre así a los datos privados de esa marca: la regla "ROOT no accede a los datos privados" se cumple por permisos e interfaz, no es una barrera técnica. Lo que queda es el historial inalterable, donde `ROOT_INVITAR` y `DUENO_INVITAR` registran quién invitó a quién. Riesgo aceptado para el MVP; documentarlo en la tesis.
- `POST /sessions/open` (público) acepta el token de la cuenta de Supabase del comensal. No es un endpoint con dos sistemas de permisos: el token solo dice a nombre de quién queda la mesa. Desde la Fase 5 se verifica solo con el JWKS del proyecto (ES256 o RS256), así que cualquier otro token —incluido el HS256 del login anterior o el de una sesión de mesa— entra como "Invitado". Una cuenta de cliente nunca crea `Usuario` ni `Membresia`.
- Desde la Fase 4b, una cuenta de Supabase se vincula al `Cliente` del login anterior con el mismo email, y se queda con su historial de mesas y pedidos. Vale lo mismo que para el personal: depende de "Confirm email" activo y, con Google, del `email_verified` de Google (ver la nota siguiente). Lo que se expone es el historial de consumo, no un acceso: hoy ninguna ruta del comensal lo devuelve, pero el personal ve las mesas con ese nombre. Riesgo aceptado para el MVP; documentarlo en la tesis.
- **La plantilla "Confirm signup" de MenYU es un requisito de seguridad, no solo de uso** (lo encontró la revisión de la 4b). El link de la plantilla por defecto confirma la cuenta con un GET a `/auth/v1/verify`, así que alcanza con que un escáner de mail (Safe Links, por ejemplo) lo abra. Con eso, quien registra el email de otra persona con su propia contraseña obtiene una cuenta confirmada:
  - que se vincula al `Cliente` del login anterior de esa persona (4b);
  - y, peor, que `POST /auth/invitaciones` reutiliza si después invitan a esa persona como personal, porque solo borra las cuentas **sin** confirmar (decisión 2 de la planificación de la Fase 2). Quien la registró entraría con acceso de personal. Esto ya pasaba desde la Fase 0, con el registro público abierto y la plantilla por defecto.

  Con la plantilla de MenYU el link lleva a `/confirmar-email`, que confirma recién con `verifyOtp` al tocar el botón: un escáner que solo abre el link no confirma nada. **Cargarla en los dos proyectos antes del deploy que lleve la 4b** (en staging, antes del merge).
- Desde la Fase 3b, Supabase vincula una cuenta de Google a la cuenta con el mismo email confiando en el `email_verified` de Google, aunque la cuenta invitada todavía no esté confirmada. Con un email que no es de Gmail ni de Workspace, eso solo prueba que la persona controlaba ese email cuando creó la cuenta de Google: un ex empleado con una cuenta de Google creada con el mail del trabajo podría entrar a una invitación nueva a ese mail. Riesgo aceptado para el MVP; documentarlo en la tesis.

## Para tener en cuenta

Observaciones que dejaron las Fases 0 a 3b (2026-10-20 y 2026-10-21). Revisarlas al arrancar cada fase y borrar las que ya no apliquen.

- **Fases 3 y 3b en producción (v1.1.0, 2026-10-21).** Comprobado después del deploy:
  - El smoke de producción, con web-auth incluida, pasó.
  - `https://auth.menyu-app.com` y `/privacidad` responden. El bundle usa el Supabase de producción y `api.menyu-app.com`.
  - La API acepta el origen `https://auth.menyu-app.com` (`CORS_ORIGINS`).
  - ~~Falta un ingreso real en `auth.menyu-app.com`~~. **Hecho (2026-10-25)** con email y contraseña, con el primer ROOT (ver "Fases 4 y 4b en producción"). Con Google sigue sin probarse en producción.
- **Fases 4 y 4b en producción (v1.3.0, 2026-10-25),** sobre `6ce5680`:
  - **Antes del tag**, la base de producción no tenía ningún `usuario` ni membresía: el acceso todavía era el del login viejo, con 17 cuentas en `admin` (9 OWNER) y 9 `mozo` activos. Todas eran de prueba, así que no hubo a quién avisar. El tag las deja sin acceso a web-admin y web-staff; quien haga falta se invita desde la consola de ROOT (a los OWNER) y desde Personal (al resto). La invitación de un MOZO o un JEFE_SALON engancha el `Mozo` viejo del restaurante con el mismo email.
  - **El primer ROOT** se creó el mismo día, antes del tag, en los dos ambientes: *Add user* en Supabase y el `INSERT` en `usuario` con `es_root` (`docs/auth/usuarios-prueba-staging.md`, "Primer ROOT"). En producción es el único; en staging se sumó a los dos que ya había.
  - **La única migración pendiente** era `20261021141707_fase4_autoria_usuario` (columnas que admiten null y el trigger del último ROOT). Ninguna estaba trabada.
  - **Después del deploy:** el deploy y el smoke de producción pasaron; `api.menyu-app.com/health` responde con el SHA del tag. Los bundles de `admin`, `staff`, `mesa` y `auth.menyu-app.com` traen el Supabase de producción, el dominio `.menyu-app.com` y una clave que el Supabase de producción acepta y el de staging rechaza: la de Production de `menyu-admin` y `menyu-staff` es la correcta. Con la cuenta ROOT se entró a producción por `auth.menyu-app.com`.
- **Fase 5 en producción (v1.4.0, 2026-10-28),** sobre `94fe19f` (`main`, con el PR #438 y el arreglo del E2E, #443). El procedimiento y lo que dio cada paso: `docs/auth/review/release-fase5.md`.
  - **Antes del tag**, las consultas de su sección 1 en el Supabase de producción: la última migración era `20261021141707_fase4_autoria_usuario`, sin ninguna fallida, y ninguna vista, función, política, dependencia ni tarea de pg_cron nombraba lo que la migración borra. El respaldo se omitió (los datos del login anterior eran de prueba) y `JWT_SECRET` se rotó en los dos ambientes.
  - **Después del deploy** (run `40737755116` de "Deploy — Production", los tres jobs en verde): `/health` con el SHA del tag y `"db":"ok"`; los cinco endpoints del login en 404 y `GET /api/auth/me` sin token en 401; Swagger solo con `/api/auth/invitaciones` y `/api/auth/me`; el smoke, 6 de 6; y en la base, la migración aplicada y sin las tres tablas, el tipo, la función ni las tres columnas.
  - **El quality gate de SonarCloud** pasó en el CI de `94fe19f`, pero medido contra *Previous version* del 17/10: la referencia de "código nuevo" no se movió, así que la Fase 5 no se midió sola. Queda para la sesión de limpieza.
- **Fase 3b: pantalla de consentimiento de Google publicada (2026-10-21).** *Branding* es uno solo para los dos ambientes:
  - Página principal: `https://mesa.menyu-app.com` (Discovery). La raíz `menyu-app.com` no tiene sitio.
  - Política de privacidad: `https://auth.menyu-app.com/privacidad`. Google visita estas URLs: no cambiar la ruta ni dejarla caer.
  - Dominios autorizados: `menyu-app.com` y el `<ref>.supabase.co` de cada proyecto de Supabase.
  - Si Google pide verificar la marca, la página principal tiene que tener un link a la política de privacidad, y Discovery todavía no lo tiene.
  - La página la arma JavaScript: el HTML que sirve Vercel tiene el `#root` vacío. Si Google dice que no la encuentra, servirla también como HTML estático.
  - `/privacidad` describe lo que hace el código hoy: qué guarda cada tabla y qué proveedores reciben datos. Si eso cambia, actualizarla junto con la fecha de vigencia (la Fase 5 lo hizo al retirar los `password_hash`).
- **Fase 3b: sin probar el "atrás" desde Google en celulares** (Safari iOS y Chrome Android).
- **Fase 3b: Supabase no agrega una identidad `email` cuando una cuenta que solo tiene Google crea una contraseña.** `identities` sigue mostrando solo `google`, pero la contraseña sirve (comprobado el 2026-10-21). Para saber si una cuenta tiene contraseña no sirve mirar `identities`.
- ~~**Test inestable en web-staff (2026-10-21).**~~ Resuelto en la 4.7: no era el test sino el efecto del socket de `MesasPage`, que dependía de la sesión del detalle y se volvía a suscribir al abrir una mesa (ver "4.7, cómo quedó").
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
  - web-auth manda `?marcaId=` o `?restauranteId=` con lo que se eligió. Las apps lo leen como una preferencia, no como permiso: el acceso lo sigue decidiendo el backend.
  - Resuelto en la 4.1: el `redirect` ya no le gana al rol. web-auth lo sigue solo si `puedeIrA` (de `@menyu/auth-client`), y `RequireAuth` manda a quien no tiene acceso a web-auth sin `redirect`.
  - Con una sesión abierta, `/` de web-auth redirige enseguida, y quien tiene un solo lugar no tiene cómo cerrar sesión ahí. Lo resuelve el `logout()` de `@menyu/auth-client`. Si hace falta antes, sumar "Ingresar con otra cuenta".
- **Lo que dejó la 4.3 (2026-10-21):**
  - Para la 4.5: `GET /marcas` es solo del OWNER (al GERENTE le da 403; el contexto de web-admin ya le pide solo `GET /restaurantes`). Personal usa `GET` y `DELETE /restaurantes/:restauranteId/personal` y `POST /auth/invitaciones`. El `CobroModal` de `PagosPage` puede seguir mandando `mozoId`: al OWNER y al GERENTE se les respeta. `api.pagos.confirmarEfectivo` de web-admin manda `{ sesionId }` y el endpoint pide `{ pagoId }` (ya estaba roto y nadie la llama): borrarla o corregirla.
  - Hecho en la 4.6: el mozo ya no manda su `mozoId` al cobrar y `CobroModal` no manda `cobradoPorNombre` en ningún caso (decisión 1 de la 4.6). Las vistas del mozo usan `GET /mesas`, que ahora también es del JEFE_SALON y el MOZO; `api.mesas.getDetalle` se borró de web-staff, porque `GET /mesas/:id` sigue siendo de OWNER y GERENTE.
  - ~~Antes del merge del PR #416: buscar en staging y en producción ítems que hayan quedado en una categoría o una comanda de otro restaurante.~~ **Hecho el 2026-10-22: cero filas en los dos ambientes**, con las dos consultas de solo lectura (`item_menu` contra `categoria_menu` y contra `comanda`, comparando `restaurante_id`). No hay nada que corregir.
  - Deuda: el catálogo de clasificaciones es global y lo edita cualquier OWNER o GERENTE (como antes, sin ROOT).
  - Deuda (ya estaba en `main`, la señaló la revisión): cerrar una mesa (`close` o `cerrarMesaAdmin`) no cancela los pagos pendientes, y `confirmarEfectivo` no mira si la sesión sigue abierta: un efectivo pendiente de una mesa cerrada se puede confirmar después, y eso reescribe `cerradaEn` y libera la mesa aunque ya tenga otra sesión. En `registrarCobro`, el chequeo de `cerradaEn` está fuera de la transacción. Conviene condicionar la aprobación a que la sesión siga abierta.
  - Quitarle el acceso a un OWNER por Personal da 404 (su membresía es de la marca, no del restaurante): los dueños se quitan desde la consola de ROOT, con `DELETE /root/duenos/:membresiaId` (4.4).
- **Lo que dejó la 4.4 (2026-10-21):**
  - Hecho en la 4.5: `useRootSession` usa `usePerfil()` (`esRoot` y el email) y `logout()`. Las pantallas de dueños y cuentas ROOT (E2b, de la consola) se sumaron sobre las rutas de la tabla de la 4.4 y los tipos de `@menyu/types`, y se mergearon a esta rama con el PR #427 (2026-10-22): `docs/plan-consola-root.md`, 8.2.
  - Para cambiar de dueño se invita al nuevo y después se quita al anterior: al último dueño de una marca activa no se lo puede quitar (409).
  - Sigue sin haber forma de reenviar una invitación que no se aceptó (ver "Para la Fase 4"), tampoco la de una cuenta ROOT.
  - Producción: el primer ROOT se crea a mano (un `INSERT` en `usuario` con `es_root`, como en staging; hecho el 2026-10-25) y los demás se invitan desde la consola o se promueven con el script. Las cuentas ROOT de la tabla `admin` (`root@menyu.com` y las que creó el script viejo) dejan de servir para la consola.
  - **Decidido en la 4.5: las mesas abiertas de un restaurante dado de baja solo pagan con Mercado Pago desde el celular.** No se cambiaron los permisos: el personal de un restaurante dado de baja sigue recibiendo 403 al cobrar en efectivo, cerrar la mesa, atender un llamado o en la cocina. La alternativa —una excepción en `AccesoService` para las sesiones ya abiertas— se descartó: abriría un agujero en la baja efectiva por un caso de borde. La 4.5 ajustó los textos de los diálogos de la consola de ROOT (`copy.ts`, con su test), y **la pantalla del comensal recién lo cumplió en la 4.7**, que además cerró el pedido de efectivo y el llamado al mozo en el backend.
  - El filtro "Quién" del historial sale de `GET /root/roots`, que ahora lista solo `Usuario`: las acciones viejas de las cuentas ROOT de `admin` ya no se pueden filtrar por quién desde la pantalla (siguen en la lista sin filtrar). Para la 4.5 o E2b.
  - Un registro inválido del historial (un error de programación) responde 500 genérico.
- **El backend corre en Node 22 desde el 2026-10-22, y no puede volver a Node 20.** Lo encontró la verificación en staging: invitar personal y subir un logo respondían 500 "Internal server error". `@supabase/supabase-js` 2.117 (la alineó la 4.1 con `@supabase/ssr`) arma un `RealtimeClient` dentro de `createClient` y éste exige el WebSocket nativo, que Node 20 no tiene; además Node 20 ya está fuera de soporte y la librería avisa en cada arranque que deja de soportarlo. Se subieron el `Dockerfile` del backend y los workflows, para que el CI corra en la misma versión mayor que el contenedor, y `src/auth/supabase/cliente-de-supabase.spec.ts` construye los dos clientes **sin mockear la librería**: es el test que faltaba (los demás simulan Supabase, así que nada lo veía). Afectaba a `SupabaseAdminService` (invitaciones) y a `StorageService` (logos).
- **Lo que dejó la 4b (2026-10-23):**
  - **Antes del deploy que la lleve (staging con el merge, producción con el tag, que es el mismo de la Fase 4), a mano:**
    - **Hecho (2026-10-23):** la plantilla **"Confirm signup"** en los dos proyectos de Supabase (`docs/auth/VariablesACambiar.md`, Plantillas de mail). **Es de seguridad:** con la plantilla por defecto, un escáner de mail confirma una cuenta registrada con un email ajeno, y esa cuenta después se vincula al `Cliente` de esa persona o se reutiliza al invitarla como personal (Notas de seguridad). Además, sin ella el registro solo abre la sesión si el link se abre en el mismo navegador en el que se creó la cuenta. Con ella anda desde cualquier navegador, y un escáner que abra el link no confirma nada.
    - Las variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_AUTH_COOKIE_DOMAIN` en `menyu-cliente` y `menyu-cliente-staging` (`docs/auth/VariablesACambiar.md`, Fase 4). Sin ellas web-cliente no ve la sesión de web-auth, y "Ingresar" y "Registrarme" siguen yendo al `/auth` de la app, como antes de la 4b. **Hecho:** `VITE_SUPABASE_URL` y `VITE_AUTH_COOKIE_DOMAIN` el 2026-10-23 y `VITE_SUPABASE_PUBLISHABLE_KEY` el 2026-10-25, en los tres lugares (Production y Preview de `menyu-cliente`, Production de `menyu-cliente-staging`). Como son de build, `menyu-cliente-staging` se volvió a desplegar el 2026-10-25: su bundle trae la URL del Supabase de staging y una clave que ese proyecto acepta y el de producción rechaza. `menyu-cliente` de producción las toma con el tag.
    - **Para el tag (es de la Fase 4), hecho el 2026-10-25:** `menyu-admin` y `menyu-staff` no tenían `VITE_SUPABASE_PUBLISHABLE_KEY` en Production, solo en Preview (revisado el 2026-10-23); el equipo la cargó. Vercel pide un código por mail para mostrar el valor, así que que sea la del proyecto de producción se comprobó con el deploy de v1.3.0: el Supabase de producción acepta la clave de los bundles y el de staging la rechaza. Sin ella, web-admin y web-staff de producción no abren la sesión ("Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY"). Staging no lo mostró porque los proyectos `*-staging` sí la tienen.
  - **Qué verificar en staging después del merge:**
    - **Hecho (2026-10-24):** el registro con la plantilla de MenYU, con `menyuprueba2+fase4bstg@gmail.com` (`docs/auth/usuarios-prueba-staging.md`). El mail llegó con el asunto "Confirmá tu cuenta de MenYU" y el link `auth.staging.menyu-app.com/confirmar-email?redirect=https://mesa.staging.menyu-app.com/&token_hash=pkce_…&type=email`. Abrirlo, desde un navegador distinto al del registro, no llamó a `/auth/v1/verify` y le sacó el token a la URL; el botón lo canjeó con un `POST` y volvió a `mesa.staging` con la cookie `sb-<ref>-auth-token` de `.staging.menyu-app.com`. `mesa.staging` mostró "Ingresar", como se esperaba: su build todavía no tiene la publishable key, así que no lee la sesión.
    - **Hecho (2026-10-25), la vuelta logueada y la mesa a su nombre**, con la publishable key cargada y `menyu-cliente-staging` desplegado de nuevo. Con playwright-cli contra `*.staging.menyu-app.com`:
      - "Ingresar" de `mesa.staging` lleva a `auth.staging.menyu-app.com/?redirect=https://mesa.staging.menyu-app.com/`. Con `menyuprueba2+fase4bstg@gmail.com`, que no tiene `Usuario`, vuelve a `mesa.staging` con "Hola, Ana Staging Cuatro B" y la cookie `sb-<ref>-auth-token` de `.staging.menyu-app.com`.
      - El QR de la mesa 1 de "Restaurante Pruebas Auth" (`/check-in?restaurantId=…&tableCode=…`) manda en `POST /sessions/open` el token de Supabase (ES256) y abre la sesión como anfitriona. Cerrada y abierta otra vez, la segunda sesión queda con el mismo `clienteId`: es el `Cliente` de la cuenta, no un "Invitado" nuevo. Staging no tiene una ruta que muestre el nombre del `Cliente` de una sesión; que sea el de la cuenta, con su `supabase_user_id` y su nombre, se comprobó en la base en local (2026-10-23).
      - Sin cuenta (sin cookie y con "Ingresar" a la vista), el mismo QR no manda token y abre con otro `clienteId`, el de un "Invitado".
      - Las tres sesiones de la prueba se cerraron con `POST /sessions/close` y la mesa quedó libre.
    - **Hecho (2026-10-25), Google como cliente**, que en local se cortó en el reCAPTCHA: desde "Ingresar" de `mesa.staging`, "Continuar con Google" con `menyuprueba2@gmail.com` (en el Chrome aparte) volvió a `mesa.staging` con "Hola, Menyu Prueba 2", el nombre que trae Google. Esta vez Google no pidió reCAPTCHA. "Cerrar sesión" la dejó en `mesa.staging`, con "Ingresar" y sin la cookie. Las dos cuentas de Google de prueba son MOZO en staging, así que el caso de una cuenta de Google **sin invitación** no se probó con Google. Ese 403 de `/auth/me` es el mismo que el de una cuenta con contraseña, y ese sí está verificado arriba con la cuenta de Ana.
    - **Quedó a la vista:** después de abrir la mesa con la cuenta, web-cliente pide igual "Tu nombre" (`/elegir-nombre`, el comensal de la división de la cuenta) con el campo vacío. Podría venir completo con el nombre de la cuenta; no es de la 4b.
  - **"Cerrar sesión" en web-cliente cierra la sesión de MenYU en todas las apps**, porque la cookie es compartida. Para un cliente da lo mismo. Alguien del personal que abre web-cliente aparece con su cuenta ("Hola, …"), y si cierra sesión ahí también sale de admin y staff. Es el comportamiento del SSO, no un agujero: una cuenta del personal en web-cliente es una cuenta de cliente más, y su `Cliente` no le da nada.
  - **Una mesa abierta antes de iniciar sesión sigue como "Invitado".** La cuenta solo cuenta al abrir o sumarse a una mesa, como con el login anterior. Asociar una sesión ya abierta queda para después, si hace falta.
  - **`/auth/me` sigue respondiendo 403 a una cuenta de cliente**, así que ninguna app sabe su `Cliente` desde la API: web-cliente toma el nombre de `user_metadata`. Si algún día hace falta (por ejemplo, para la fidelización de v2), un `GET /clientes/me` aparte, con su guard, sin tocar `/auth/me`.
  - ~~**El bundle de web-cliente creció unos 64 kB con gzip**, por supabase-js.~~ **Resuelto en la Fase 5:** se carga en diferido y solo si hay cookie de sesión. La carga inicial quedó en 409,88 kB (120,51 kB con gzip), menos que antes de la 4b, y Vite ya no avisa por el chunk de más de 500 kB.
  - En `/crear-cuenta`, el link a la política de privacidad abre en la misma pestaña, así que se pierde lo escrito en el formulario. Con una sesión abierta, `/crear-cuenta` muestra el formulario igual.
  - `/confirmar-email` con un `?code=` inventado dice "Tu cuenta está confirmada" sin comprobar nada: no distingue un código de otro navegador de uno falso. No abre ninguna sesión.
  - La plantilla "Confirm signup" arma el link con `{{ .RedirectTo }}&token_hash=…`, así que supone que `RedirectTo` ya trae un `?`, y web-auth siempre lo manda con `?redirect=`. Si algún día se manda el mail con `resend` o `generateLink` sin `emailRedirectTo`, el link queda roto.
- **Lo que dejó la 4.7 (2026-10-22):**
  - **Antes del merge: hecho** (2026-10-22). Las variables de Vercel están cargadas en los seis proyectos (`docs/auth/VariablesACambiar.md`, Fase 4), salvo `VITE_SUPABASE_PUBLISHABLE_KEY` en Production de `menyu-admin` y `menyu-staff` (lo encontró la 4b: ver "Lo que dejó la 4b") y la consulta de ítems en una categoría o comanda ajena dio cero filas en staging y en producción. Queda la verificación en staging de la lista de arriba, después del merge.
  - **Una mesa de un restaurante dado de baja que nunca conectó Mercado Pago no tiene ninguna salida en la app.** `crearPreferenciaMercadoPago` responde 400 "Este restaurante no tiene Mercado Pago conectado", el efectivo da 403 y el personal no puede cobrar ni cerrar la mesa. La pantalla ahora dice que, si el pago no funciona, se arregle con el personal del local, pero la cuenta queda abierta en la base hasta que alguien la cierre. En la base local, ninguno de los dos restaurantes del seed tiene MP conectado.
  - **`/pagar` y `/dividir` siguen ofreciendo el botón de efectivo** aunque el restaurante esté de baja: el backend lo rechaza y el mensaje se ve, pero la pantalla anterior acaba de decir que no está disponible. Es una inconsistencia de interfaz, no un agujero.
  - **El llamado al mozo quedó cerrado por los tres caminos** (`POST /waiter-calls`, `POST /payments/solicitar-efectivo` y `POST /payments/avisar-mozo-cuenta`), todos con el mismo 403. ~~`avisar-mozo-cuenta` ya no tiene ningún llamador en web-cliente: candidato a borrar en la Fase 5.~~ **Borrado en la Fase 5.**
  - ~~**Deuda pre-existente que quedó a la vista:** `api.payments.initiate` (`apps/web-cliente/src/services/api.ts`) apunta a `POST /payments/initiate`, que no existe en el controller.~~ Borrada en la 4b, con `resolveAppUrl`.
  - **Otro test inestable, en web-cliente:** dos casos del buscador de `ClienteMenuPage.spec.tsx` ("si el plato en descuento coincide…" y "si nada coincide…") fallaron **una vez**, con las suites del backend y de web-cliente corriendo en paralelo. No reprodujo: pasan aislados, en la suite completa y en una segunda corrida en paralelo. Escriben con `userEvent.type` y afirman sin esperar, así que probablemente compiten con la carga del menú. Si vuelve a aparecer, es de los que pueden frenar un release.
- **Lo que dejó la 4.6 (2026-10-22):**
  - **El gateway de Socket.io no saca a nadie de una sala.** Se resolvió por el lado del cliente (la conexión recuerda su sala y reconecta al cambiar de restaurante), pero los handlers del socket compartido —`MozoNotifications`, `MozoPanel`, `CocinaPage` y `PagosMozo`— no filtran por restaurante: si alguna vez una conexión queda en dos salas, se mezclan los datos de dos sucursales. `MesasPage` y `PedidosPage` abren su propia conexión y la cierran al cambiar, así que no les pasa. El arreglo de fondo es un `leave` en el gateway, junto con autenticarlo (hoy está en "Fuera de alcance").
  - ~~**Para la 4.7, los tokens legacy en la URL.**~~ Hecho en la 4.7: web-cliente no se los pasa a nadie.
  - **Un 401 que persiste después de renovar la sesión deja la pantalla vacía y sin cartel, también en staff** (`MozoPanel` dice "Sin alertas pendientes"). Es la misma deuda de interfaz que anotó la 4.5 para web-admin, y por la misma razón: mandar al login ante un 401 con sesión viva armaría un loop.
  - ~~**`packages/auth` quedó sin ningún consumidor.**~~ Borrado en la 4.7.
  - El encabezado del panel del mozo muestra el rol de más autoridad, así que un dueño que opera como mozo se ve como "DUEÑO" sobre "PANEL › MOZO". Es la decisión 2 de la 4.6; si molesta, el encabezado puede mostrar el rol con el que está operando.
  - Sin probar en staging: queda para después del merge del PR #416, que es el que lleva este backend a staging (la 4.7 dejó la lista de casos en "Despliegue").
- **Lo que dejó la 4.5 (2026-10-21):**
  - ~~**Para la 4.7, la otra mitad de la decisión de las mesas abiertas.**~~ Hecho en la 4.7: `MesaSinCarta` dejó solo Mercado Pago y el backend rechaza el pedido de efectivo de un restaurante no disponible.
  - ~~**Para la 4.7, los tokens legacy en la URL.**~~ Hecho en la 4.7.
  - **Un 401 que persiste después de renovar la sesión deja la pantalla vacía, sin cartel.** Es a propósito: `irAlLogin()` solo se llama cuando no se pudo renovar (la sesión está muerta de verdad). Mandar al login ante un 401 con sesión viva armaría un loop, porque web-auth la ve válida y devuelve a web-admin — es exactamente lo que pasa si el backend verifica contra otro proyecto de Supabase (ocurrió al probar la 4.5 contra la API de staging). Queda como deuda de interfaz: un cartel de "no pudimos cargar los datos" en lugar del estado vacío. Desde la 4.6 pasa lo mismo en web-staff.
  - ~~**La matriz de quién invita y quita (`pages/admin/mozos/personal.ts`) está duplicada a mano** de `apps/backend/src/auth/invitaciones/puede-invitar.ts`, y ningún test ata una a la otra.~~ **Resuelto en la Fase 5:** la tabla vive en `@menyu/types` (`permisos.ts`), la ofrece web-admin y `puede-invitar.spec.ts` comprueba que el backend diga lo mismo (decisión 7).
  - **Ajeno a la entrega, pero molesta:** `pnpm test` en la raíz no corre nada (no existe el script: hay que usar `turbo run test`). El fallo de `MisPedidosPage.spec.tsx` que iba acá lo arregló la 4.7: comparaba "p. m." con el espacio fino del ICU de Windows sin normalizar, así que fallaba en local y pasaba en el CI de Linux.
  - `pnpm lint` de web-admin falla si quedó la carpeta `coverage/` de un `test:coverage`: eslint lintea el reporte HTML. Borrarla antes de lintear.
- **Producción, incidente del 2026-10-20:** un cambio manual de `CORS_ORIGINS` en Railway de producción redesplegó el servicio construyendo el último commit de `main` (31 migraciones) en lugar del tag v1.0.5 (18). `prisma migrate deploy` aplicó las migraciones pendientes hasta que `20260906183320_division_pagos_campos` falló (P3009): su índice único `comensal(sesion_id, nombre_normalizado)` chocó con los comensales "Invitado" que el backfill de `20260722175451_split_pagos_comensales` crea uno por pago, como ya había pasado en QA. La base de producción ya no servía para el código de v1.0.5 (`pago.pedido_id` y `restaurante.qr_base_url` se borraron), así que se recuperó hacia adelante: se borraron esos comensales, se marcó la migración como revertida y se desplegó `main` con el tag v1.0.6 (`39522af`, con las 32 migraciones aplicadas y el smoke de producción en verde).
  - En Railway, un cambio de variables redespliega el servicio y corre las migraciones. El servicio de producción quedó desconectado de GitHub (*Settings → Source*) para que salga solo de `deploy-production.yml`: no reconectarlo.
- **Dominios propios: falta Mercado Pago y `BASE_URL` (2026-10-20).** Staging y producción ya usan `*.menyu-app.com` (v1.0.7, con las variables de `docs/auth/VariablesACambiar.md`), salvo `BASE_URL`, que en los dos ambientes sigue con la URL vieja de Railway: nadie del equipo tiene acceso al panel de la app de Mercado Pago. `BASE_URL` arma el `redirect_uri` del OAuth con el que cada restaurante conecta su cuenta de MP y la `notification_url` de cada pago. MP rechaza un `redirect_uri` que no esté registrado, así que cambiar `BASE_URL` antes de registrarlo rompe la conexión de MP. Mientras tanto todo funciona por la URL vieja, que no hay que dar de baja: las preferencias ya creadas notifican ahí. Cuando haya acceso al panel:
  1. Comparar `MP_CLIENT_ID` en Railway de staging y de producción: si coincide, los dos ambientes usan la misma app de MP.
  2. En el panel de la app, agregar (sin borrar la actual) `https://api.staging.menyu-app.com/api/payments/mercadopago/oauth/callback` y `https://api.menyu-app.com/api/payments/mercadopago/oauth/callback`. Si el panel acepta una sola URL y la app es la misma, registrar la de producción y cambiar su `BASE_URL` en el mismo momento.
  3. Cambiar `BASE_URL` en Railway a `https://api.staging.menyu-app.com/api` (staging) y `https://api.menyu-app.com/api` (producción). Cada cambio redespliega el servicio.
  4. Probar desde web-admin → Configuración → Pagos → conectar Mercado Pago: tiene que volver a `https://admin.<ambiente>/configuracion/pagos?mp=conectado`.
- **Rama `origin/fix/356-mozo-id-desde-jwt`:** absorbida en la 4.3 (`common/atribucion-del-cobro.ts`, con `Pago.usuarioId`). El issue #356 ya está cerrado. **No mergearla nunca:** su migración `20261014222232_add_admin_id_to_pago` crea una FK a `admin`, que la Fase 5 borró, así que ya no se puede aplicar. Falta avisarle a quien la abrió y borrar la rama remota.
- **Base local:** `apps/backend/.env` apunta a `postgresql://menyu:menyu@localhost:5433/menyu` (`DATABASE_URL` y `DIRECT_URL`, el Postgres de `apps/backend/docker-compose.yml`) y tiene el `CORS_ORIGIN_PATTERNS` de `*.menyu.local`. Le faltan `MP_ENCRYPTION_KEY` (sin ella el backend no arranca; en la Fase 2 se pasó en línea) y, para probar Supabase Auth, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del Supabase de staging.
- **La API legacy no crea OWNERs:** `POST /admins` siempre crea un GERENTE, y uno creado por ROOT queda sin marca y no se le puede asignar ningún restaurante. Los usuarios de prueba de staging (`docs/auth/usuarios-prueba-staging.md`) se crearon con un INSERT para el OWNER y la API para el resto. Con Supabase Auth lo cubre `POST /auth/invitaciones` (ROOT → OWNER).