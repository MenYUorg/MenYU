# Lista de verificación de auth en staging

Lo que hay que pasar a mano en **staging** (`*.staging.menyu-app.com`) para dar por buena la autenticación: después de un merge que toque auth y antes del tag que la lleve a producción. **Nunca contra producción.** La spec y sus decisiones están en [`specs/auth.md`](specs/auth.md); esta lista junta en un solo lugar los casos que estaban repartidos:

- **[F4-n]** los 7 casos de "Qué verificar en staging después del merge (Fase 4)" de la spec, con el caso 6 al día con la Fase 5;
- **[F5]** los casos de navegador del criterio 4 de la Fase 5 y lo que la Fase 5 dejó "sin verificar todavía";
- **[R]** la pasada del 2026-10-27 de la revisión integral ([`review/auth-review-2026-10-27.md`](review/auth-review-2026-10-27.md), §3.7): la regresión del SSO y lo que la Fase 5 dejaba sin verificar.

**Cómo se usa.** Tildar cada caso y anotar el navegador. Un caso que falla se anota con qué se vio y qué se esperaba. Al terminar, sumar la pasada a la tabla del final.

**Con qué.** Los usuarios de [`usuarios-prueba-staging.md`](usuarios-prueba-staging.md), un usuario por rol; las contraseñas viven en `docs/auth/.env.usuarios-staging`, que git ignora (pedírselas al equipo). Restaurante "Restaurante Pruebas Auth", mesa 1. Para mirar cookies, `localStorage` y pedidos, las herramientas del navegador (o playwright-cli).

---

## 0. Preparación

- [ ] El deploy de staging terminó: el backend en Railway y los cuatro frontends (web-auth, web-admin, web-staff y web-cliente) en Vercel. `GET https://api.staging.menyu-app.com/health` muestra el SHA del merge.
- [ ] Un perfil del navegador limpio, sin cookies de `.staging.menyu-app.com`, para los casos sin cuenta.
- [ ] Al terminar, cerrar las sesiones de mesa que se abrieron (`GET /api/sessions/activas` vacío y la mesa en "libre").

## 1. SSO y destino por rol

- [ ] **[F4-1] [R]** El OWNER inicia sesión en `auth.staging` y aterriza en `admin.staging/admin/dashboard`.
- [ ] **[F4-1] [R]** `staff.staging` abre en otra pestaña sin volver a ingresar y sin ningún pedido a `auth.staging`.
- [ ] **[R]** La cookie `sb-<ref>-auth-token` queda con dominio `.staging.menyu-app.com`, `path=/`, `secure`, `SameSite=Lax` y sin `httpOnly`, y el `localStorage` no guarda la sesión. Con una cuenta de cliente o de Google la cookie se parte en `…auth-token.0`, `.1`: cada parte con los mismos atributos.
- [ ] **[F4-1] [R]** "Salir" en staff borra la cookie, y la pestaña de admin vuelve a web-auth, con su `redirect`, al recuperar el foco.
- [ ] **[F4-2] [R]** Cada rol termina en su app, sin loop: un MOZO que abre admin termina en staff; ROOT que abre staff termina en `/root/marcas`, y si escribe `/admin/dashboard` vuelve ahí; un COCINA que escribe `/mozo` vuelve a `/cocina`.
- [ ] **[F4-2] [R]** Con el token de ROOT, `GET /api/restaurantes`, `/api/marcas` y `/api/pedidos` responden 403, y `GET /api/root/marcas`, 200.

## 2. Personal, consola de ROOT y cobros

- [ ] **[F4-3]** Personal de punta a punta, con mail real: el OWNER invita a un MOZO, le llega el mail con la plantilla de MenYU, define su contraseña y entra a staff. El link de invitación es de un solo uso. Después el OWNER le quita el acceso y la cuenta pasa a recibir 403.
- [ ] **[F4-4]** Consola de ROOT: invitar a un dueño, ver las dos acciones en el historial, dar de baja la marca (su gente pierde el acceso) y reactivarla.
- [ ] **[F4-5]** Cobros y Caja: un cobro de un mozo queda con su `usuarioId` y su `mozoId`; uno de un gerente, con `mozoId` en null. Los dos se ven en la Caja de web-admin.

## 3. web-auth

- [ ] **[F4-7]** Google: "Continuar con Google" lleva al selector de cuentas y vuelve por `/google` a la app del rol.
- [ ] **[F4-7] [R]** Recuperación de contraseña: el link llega con la plantilla de MenYU y un `token_hash=pkce_…`, y abre `/restablecer-contrasena` sin gastar el token. Al guardar, la contraseña nueva sirve y la anterior no.

## 4. web-cliente y la cuenta de cliente

- [ ] **[F4-6]** web-cliente no le pasa tokens a nadie: "Ingresar" va a `auth.staging` solo con el `redirect` (sin `token` ni `refresh` en la URL), y el `localStorage` de web-cliente no guarda tokens del login anterior.
- [ ] **[F5] [R]** `/auth` de web-cliente redirige a `auth.staging` con el `redirect` armado; `?tab=register` va a `/crear-cuenta`; un `?volver=` interno se conserva y uno a otro sitio (`https://evil.example.com`) se descarta y cae en `/`.
- [ ] **[F5] [R]** Registro desde cero, con mail real: desde `mesa.staging`, "Registrarme" lleva a `auth.staging/crear-cuenta` con el `redirect` a web-cliente; el mail llega de `no-reply@menyu-app.com` con la plantilla de MenYU y un `token_hash=pkce_…`. Abierto **en otro navegador**, `/confirmar-email` borra el token de la barra, pide confirmar y vuelve a `mesa.staging` con la sesión.
- [ ] **[F5]** Login de un cliente que ya tiene cuenta: desde "Ingresar" de `mesa.staging` vuelve a `mesa.staging` con su nombre ("Hola, …").
- [ ] **[F5] [R]** La mesa a nombre del cliente: con la sesión abierta, `POST /api/sessions/open` sale con `Authorization: Bearer` y un JWT ES256, y la sesión queda con el `Cliente` de la cuenta. Repetir el `open` con el mismo token devuelve el mismo `clienteId`.
- [ ] **[F5]** Sin cuenta, el QR y el PIN entran como "Invitado" (un `clienteId` nuevo y "Invitado" en el header).
- [ ] **[F5]** Un token HS256 firmado con el `JWT_SECRET` del login anterior, con el `sub` de un `Cliente` que existe, en `POST /api/sessions/open`: la mesa queda a nombre de un "Invitado" nuevo, no de ese cliente. Se probó en local el 2026-10-26; en staging pide el `JWT_SECRET` de ese ambiente, que no sale de Railway.
- [ ] **[R]** La carga diferida sin cuenta: con el perfil limpio, el home de `mesa.staging` y el check-in por QR no piden ningún chunk de supabase-js ni de `@menyu/auth-client`, y `POST /api/sessions/open` sale sin chunk previo y sin header `Authorization`. Con la cookie de sesión, el chunk diferido sí se descarga.
- [ ] **[F5] [R]** Google como cliente: desde "Ingresar" de `mesa.staging`, "Continuar con Google" vuelve a `mesa.staging` con el nombre que trae Google. Falta hacerlo con una cuenta de Google **sin** ninguna membresía: la del 2026-10-27 era además MOZO, así que probó que el `redirect` a web-cliente le gana al destino por rol.

## 5. El login propio ya no existe

- [ ] **[F5] [R]** `POST /api/auth/login`, `/api/auth/register`, `/api/auth/guest`, `/api/auth/refresh` y `/api/auth/logout` responden 404, y `GET /api/auth/me` sin token, 401.

## 6. Lo de la Fase 5 que no es del navegador

- [ ] **[F5]** El quality gate de SonarCloud en verde, con la referencia de "código nuevo" movida para que mida la Fase 5 (criterio 5).
- [ ] **[F5]** Si alguna vez se instala el E2E de staging en producción, aplicar ahí también `scripts/e2e-staging/sql/e2e-limpiar-sin-password-hash.sql` (spec, "Lo que apareció después del merge").

---

## Pasadas

| Fecha | Ambiente | Qué se pasó | Resultado | Detalle |
|---|---|---|---|---|
| 2026-10-23 | staging | Los 7 casos de la Fase 4 ([F4-n]) | Cumplen | `specs/auth.md`, "Cómo salió en staging (2026-10-23)" |
| 2026-10-27 | staging | Los casos [R], con el código de la Fase 5 | Cumplen, con una salvedad: Google como cliente se probó con una cuenta que además era MOZO (falta una sin membresías) | `review/auth-review-2026-10-27.md`, §3.7 |
