# Usuarios de prueba de staging (auth)

Para probar en **staging** la migración de autenticación (dominios propios y las fases de `docs/auth/specs/auth.md`). Nunca usarlos contra producción.

- Marca: "Marca Pruebas Auth" (slug `pruebas-auth`). Restaurante: "Restaurante Pruebas Auth". Mesa 1, con PIN.
- **Las contraseñas y el PIN no están en el repo**, que es público: viven en `docs/auth/.env.usuarios-staging`, que git ignora (`.env.*`). Quien lo necesite se lo pide al equipo; no subirlo ni pegarlo en issues o PRs.
- **El `tableCode` de la mesa 1 tampoco**, porque abre la mesa igual que el PIN: es `STAGING_MESA_TABLE_CODE` en ese mismo archivo, junto a `STAGING_MESA_PIN` y `STAGING_RESTAURANTE_ID`. El link que codifica el QR de la mesa es `https://mesa.staging.menyu-app.com/check-in?restaurantId=$STAGING_RESTAURANTE_ID&tableCode=$STAGING_MESA_TABLE_CODE`.
- **Las cuentas que se usan son las de Supabase**, más abajo ("Un usuario por rol"). Se entra por `auth.staging.menyu-app.com`.

## Los tres usuarios legacy: ya no sirven

Estos se crearon el 2026-10-20 contra las tablas viejas (`Admin`, `AdminRestaurante`, `Mozo`) y se usaban por `mesa.staging.menyu-app.com/auth`, el login de web-cliente:

| Rol | Email |
|---|---|
| OWNER | `owner.pruebas-auth@menyu-app.com` |
| GERENTE | `gerente.pruebas-auth@menyu-app.com` |
| Mozo | `mozo.pruebas-auth@menyu-app.com` |

**Ya no existen.** Con el merge del PR #416 (Fase 4) dejaron de abrir el panel y staff, y la Fase 5 borró las tablas `admin` y `admin_restaurante` donde vivían, junto con la pantalla `/auth` de web-cliente por la que se usaban. Las reemplazan las cuentas de Supabase de la sección "Un usuario por rol". Quedan acá solo como historia de cómo se armó el ambiente.

## Cómo se crearon (2026-10-20)

La API legacy no crea OWNERs: `POST /admins` siempre crea un GERENTE, y si lo crea ROOT queda sin marca, así que no se le puede asignar ningún restaurante (`admin-restaurante.service.ts`). Por eso:

1. La marca, el restaurante y el OWNER, con un INSERT en el SQL Editor del Supabase de staging (contraseña como hash bcrypt).
2. El resto, por la API de staging iniciando sesión como ese OWNER: el GERENTE (`POST /admins`) y su restaurante (`POST /admin-restaurante`), el mozo (`POST /mozos`) y la mesa (`POST /mesas`, que genera el PIN).

Son usuarios del modelo actual (`Admin`, `AdminRestaurante`, `Mozo`). Con Supabase Auth (Fases 2 a 5 de la spec) el personal se recrea por invitación.

## Usuarios de Supabase Auth (desde la Fase 2)

Para probar `GET /auth/me` y `POST /auth/invitaciones` en `api.staging.menyu-app.com`. Mismas reglas: solo staging, y las contraseñas en `docs/auth/.env.usuarios-staging`.

| Para qué | Email | `Usuario` en la base |
|---|---|---|
| ROOT (invita a OWNER; desde la 4.4, no a GERENTE) | `root.pruebas-auth@menyu-app.com` | `es_root = true`, sin membresías |
| Rol incorrecto (MOZO intenta invitar) | `mozo-supabase.pruebas-auth@menyu-app.com` | membresía MOZO en "Restaurante Pruebas Auth" |
| Sin acceso (cuenta sin `Usuario`) | `sin-acceso.pruebas-auth@menyu-app.com` | ninguno |

### Primer ROOT (y cualquier usuario creado a mano)

El primer `Usuario` no puede llegar por invitación: alguien tiene que invitarlo. Por eso el primer ROOT de cada ambiente se crea a mano:

1. Supabase del ambiente → Authentication → Users → **Add user** → *Create new user*, con email, contraseña y **Auto Confirm User**. Copiar el *User UID*.
2. SQL Editor del mismo proyecto:
   ```sql
   INSERT INTO usuario (id, supabase_user_id, email, nombre, es_root)
   VALUES (gen_random_uuid(), '<User UID>', '<email en minúscula>', 'Root Pruebas Auth', true);
   ```
   Para el MOZO de prueba, `es_root` queda en `false` y se suma su membresía:
   ```sql
   INSERT INTO membresia (id, usuario_id, rol, restaurante_id)
   SELECT gen_random_uuid(), u.id, 'MOZO', r.id
   FROM usuario u, restaurante r
   WHERE u.email = 'mozo-supabase.pruebas-auth@menyu-app.com' AND r.nombre = 'Restaurante Pruebas Auth';
   ```
3. La cuenta sin acceso es solo el paso 1, sin INSERT.

### Obtener un access token

```bash
curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"root.pruebas-auth@menyu-app.com","password":"…"}'
```

El `access_token` de la respuesta vence en una hora (el default de Supabase). Usarlo como `Authorization: Bearer <access_token>`.

## Un usuario por rol (desde la Fase 3)

Para probar web-auth: cada uno tiene que terminar en su app (`docs/auth/specs/auth.md`, Fase 3). Se crean como el primer ROOT, con *Add user* y **Auto Confirm User**, sin invitación. Las contraseñas van en `docs/auth/.env.usuarios-staging` (variables `STAGING_AUTH_<ROL>_EMAIL` y `STAGING_AUTH_<ROL>_PASSWORD`), junto con `STAGING_SUPABASE_URL` y `STAGING_SUPABASE_PUBLISHABLE_KEY`.

| Email | `Usuario` en la base | Después de iniciar sesión |
|---|---|---|
| `root.pruebas-auth@menyu-app.com` | `es_root = true` (sección anterior) | `admin.<amb>/admin` |
| `owner-supabase.pruebas-auth@menyu-app.com` | OWNER de "Marca Pruebas Auth" | `admin.<amb>/admin?marcaId=…` |
| `gerente-supabase.pruebas-auth@menyu-app.com` | GERENTE de "Restaurante Pruebas Auth" | `admin.<amb>/admin?restauranteId=…` |
| `jefe-salon.pruebas-auth@menyu-app.com` | JEFE_SALON de "Restaurante Pruebas Auth" | `staff.<amb>/mozo?restauranteId=…` |
| `mozo-supabase.pruebas-auth@menyu-app.com` | MOZO de "Restaurante Pruebas Auth" (sección anterior) | `staff.<amb>/mozo?restauranteId=…` |
| `cocina.pruebas-auth@menyu-app.com` | COCINA de "Restaurante Pruebas Auth" | `staff.<amb>/cocina?restauranteId=…` |
| `varias.pruebas-auth@menyu-app.com` | OWNER de la marca y MOZO del restaurante | el selector de web-auth |
| `sin-acceso.pruebas-auth@menyu-app.com` | ninguno (sección anterior) | "Tu cuenta no tiene acceso"; desde la Fase 4b, con un `redirect` a web-cliente, vuelve ahí como cliente |
| `menyuprueba2+fase4b@gmail.com` | ninguno: es una cuenta de cliente (Fase 4b) | lo mismo que la anterior |
| `menyuprueba2+fase4bstg@gmail.com` | ninguno: es una cuenta de cliente (Fase 4b) | lo mismo que la anterior |

`menyuprueba2+fase4b@gmail.com` se creó el 2026-10-23 desde `/crear-cuenta` (Fase 4b), con el nombre "Ana Fase Cuatro B" y confirmada con el link del mail. Su contraseña está en `STAGING_AUTH_CLIENTE_F4B_PASSWORD`.

`menyuprueba2+fase4bstg@gmail.com` se creó el 2026-10-24 desde `auth.staging.menyu-app.com/crear-cuenta`, ya con la plantilla "Confirm signup" de MenYU, con el nombre "Ana Staging Cuatro B". Se confirmó desde un navegador distinto al del registro. Su contraseña está en `STAGING_AUTH_CLIENTE_STG_PASSWORD`.

`menyuprueba2+fase41@gmail.com` es una cuenta descartable de la entrega 4.1 de la Fase 4 (2026-10-21). Es MOZO de "Restaurante Pruebas Auth": la invitó el OWNER de prueba y se usó para probar la invitación y la recuperación con la cookie. Los mails llegan a la bandeja de `menyuprueba2@gmail.com` (alias `+`). Su contraseña de Supabase está en `STAGING_AUTH_FASE41_PASSWORD`.

Para la invitación de punta a punta no se crea nada a mano: se invita a un mail con bandeja real (`STAGING_AUTH_INVITADO_EMAIL`, por ejemplo un alias `+invitado` de Gmail) con `POST /auth/invitaciones` y el token del OWNER, y el link del mail lleva a `auth.staging.menyu-app.com/invitacion`.

SQL Editor de staging, después de crear las cuentas (cada `<UID>` es el *User UID* de la suya):

```sql
INSERT INTO usuario (id, supabase_user_id, email, nombre, es_root) VALUES
  (gen_random_uuid(), '<UID>', 'owner-supabase.pruebas-auth@menyu-app.com',   'Owner Pruebas Auth',      false),
  (gen_random_uuid(), '<UID>', 'gerente-supabase.pruebas-auth@menyu-app.com', 'Gerente Pruebas Auth',    false),
  (gen_random_uuid(), '<UID>', 'jefe-salon.pruebas-auth@menyu-app.com',       'Jefe Salón Pruebas Auth', false),
  (gen_random_uuid(), '<UID>', 'cocina.pruebas-auth@menyu-app.com',           'Cocina Pruebas Auth',     false),
  (gen_random_uuid(), '<UID>', 'varias.pruebas-auth@menyu-app.com',           'Varias Pruebas Auth',     false);

INSERT INTO membresia (id, usuario_id, rol, marca_id)
SELECT gen_random_uuid(), u.id, 'OWNER', m.id
FROM usuario u CROSS JOIN marca m
WHERE m.slug = 'pruebas-auth'
  AND u.email IN ('owner-supabase.pruebas-auth@menyu-app.com', 'varias.pruebas-auth@menyu-app.com');

INSERT INTO membresia (id, usuario_id, rol, restaurante_id)
SELECT gen_random_uuid(), u.id, v.rol::rol, r.id
FROM (VALUES
  ('gerente-supabase.pruebas-auth@menyu-app.com', 'GERENTE'),
  ('jefe-salon.pruebas-auth@menyu-app.com',       'JEFE_SALON'),
  ('cocina.pruebas-auth@menyu-app.com',           'COCINA'),
  ('varias.pruebas-auth@menyu-app.com',           'MOZO')
) AS v(email, rol)
JOIN usuario u ON u.email = v.email
JOIN marca m ON m.slug = 'pruebas-auth'
JOIN restaurante r ON r.marca_id = m.id AND r.nombre = 'Restaurante Pruebas Auth';
```

Desde la entrega 4.5, web-admin lee la sesión de Supabase, y web-staff desde la 4.6. Ninguna tiene login propio.

### Las cuentas de salón necesitan su `Mozo` (2026-10-23)

Las cuentas de prueba se insertaron a mano, así que tienen `Membresia` pero no tienen fila en `mozo`. El permiso lo da la membresía, pero **quien atiende un llamado, edita un pedido o cobra sale del `Mozo`** (`AccesoService.exigirMozo`): sin él, esas acciones responden 403 "Tu perfil de mozo no está activo en este restaurante". A las cuentas que llegan por invitación se lo crea `vincularMozo`, por eso solo pasa con las de prueba.

El script está en `docs/auth/mozos-faltantes-staging.sql`: deduce qué falta de las membresías (no hay que pegar ningún id), es idempotente y trae una consulta para comprobar antes y después. Correrlo en el SQL Editor del Supabase de **staging**.

### Probar la 4b (cuenta de cliente) en local (2026-10-23)

Lo mismo que la 4.7, con `apps/web-cliente/.env.local` igual al de web-auth: además de `VITE_API_URL` y `VITE_AUTH_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_AUTH_COOKIE_DOMAIN=.menyu.local`. El backend en local (o el de la rama que se quiera probar), web-auth en el 5173 y web-cliente en el 5176. Lo que agrega:

- **Ingreso de un cliente:** "Ingresar" en `mesa.menyu.local:5176`, con `sin-acceso.pruebas-auth@menyu-app.com`, vuelve a web-cliente con "Hola, …". Abrir una mesa libre con `/check-in?restaurantId=…&tableCode=…` y mirar en la base que `sesion_mesa.cliente_id` sea un `cliente` con su `supabase_user_id`.
- **El vínculo:** antes de abrir la mesa, un `INSERT INTO cliente (id, nombre, email) VALUES (gen_random_uuid(), 'Cliente Login Anterior', '<el email de la cuenta, en mayúsculas>')`; la mesa tiene que quedar a nombre de ese `cliente`, ahora con la cuenta.
- **Registro con mail real:** "Registrarme" con un alias `+` de `menyuprueba2@gmail.com`. El mail llega a esa bandeja (Gmail del Chrome aparte, sección "Probar el login con Google"). Desde el 2026-10-23 el Supabase de staging tiene la plantilla "Confirm signup" de MenYU: el link es la `emailRedirectTo` que mandó web-auth (en local, `auth.menyu.local:5173/confirmar-email?redirect=…`) más `&token_hash=…&type=email`, y se puede abrir en cualquier navegador. Igual conviene **tomar el `href` del mail sin abrirlo** desde el Chrome aparte, para no gastar el link en el navegador equivocado. Antes, con la plantilla por defecto, el link volvía con un `?code=` que solo servía en el navegador del registro.
- **El Chrome aparte puede no resolver `*.menyu.local`.** Si se abrió sin `--host-resolver-rules`, en vez de reiniciarlo se puede registrar, con playwright-cli conectado por CDP, una ruta que pida esos hosts a `127.0.0.1` y le devuelva a la página la respuesta con su URL original (`context.route(...)` con `route.fetch({ url })` y `route.fulfill`). Así se llegó a la pantalla de Google desde web-cliente. Google pidió un reCAPTCHA, que tiene que resolver una persona.
- Para volver a abrir una mesa en la base local: `UPDATE sesion_mesa SET estado = 'cerrada', cerrada_en = now() WHERE mesa_id = '<id>' AND estado = 'activa'` y `UPDATE mesa SET estado = 'libre' WHERE id = '<id>'`.

### Probar la 4.7 en local (2026-10-22)

Lo mismo que abajo, más `apps/web-cliente/.env.local` (`VITE_API_URL=/api` y `VITE_AUTH_URL=http://auth.menyu.local:5173`) y su Vite en el 5176. Lo que agrega la entrega:

- ~~**Personal en el login del comensal:**~~ ya no aplica: la Fase 5 retiró la pantalla `/auth` de web-cliente, que ahora redirige a web-auth para cualquiera. Lo que se prueba es eso: `mesa.menyu.local:5176/auth` tiene que terminar en `auth.menyu.local:5173` con el `redirect` a web-cliente.
- **Mesa de un restaurante dado de baja:** abrir la mesa 100 (`/check-in?restaurantId=…&tableCode=TEST-QR-SEED-100`), hacer un pedido, dar de baja el restaurante (`UPDATE restaurante SET activo = false WHERE id = '22222222-2222-4222-a222-222222222222'`) y recargar `/menu`: solo "Pagar la cuenta" y "Ver mis pedidos". En `/pagar`, el efectivo responde "Este restaurante no está disponible" y no deja ni `pago` ni `llamado_mozo`. Reactivar al terminar.

### Probar la entrega 4.5 en local (2026-10-21)

La API de staging todavía corre `main`, sin el backend de las entregas 4.2 a 4.4 (está en el PR draft #416): le responde **401** a `GET /restaurantes` y `GET /marcas` con un token de Supabase. Para probar web-admin de punta a punta se levanta el backend de la rama en local y se usa el Supabase de staging solo para autenticar:

1. `apps/web-auth/.env.local` y `apps/web-admin/.env.local` (git los ignora) con `VITE_API_URL=/api`, el `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` de staging, `VITE_AUTH_COOKIE_DOMAIN=.menyu.local` y `VITE_AUTH_URL=http://auth.menyu.local:5173`.
2. El backend, con la base local (`apps/backend/.env`) más `SUPABASE_URL` del proyecto de staging y una `MP_ENCRYPTION_KEY` cualquiera: `pnpm --filter @menyu/api dev`. Sin `SUPABASE_SERVICE_ROLE_KEY`, invitar responde 502 ("Supabase no está configurado"): la invitación de punta a punta se prueba en staging.
3. Las cuentas de staging tienen que existir en la base local con su `supabase_user_id`: se pide un token con cada una (`/auth/v1/token?grant_type=password`), se toma el `sub` del JWT y se insertan en `usuario` y `membresia` sobre la Marca Seed y el Restaurante Seed del seed. El `Mozo Seed` se deja sin `usuarioId`: así aparece en "Mozos sin cuenta" de Personal.
4. Los dos Vite en `127.0.0.1` con `--strictPort` (si el puerto queda tomado por un Vite anterior, el nuevo elige otro y el proxy sigue apuntando al backend viejo: fue una hora perdida en la 4.5).

Con eso andan el login, el SSO por la cookie de `.menyu.local`, el destino por rol, Personal y la consola de ROOT.

### Probar la entrega 4.6 (web-staff) en local (2026-10-22)

Lo mismo que arriba, más `apps/web-staff/.env.local` (igual al de web-admin) y el Vite de staff en el puerto 5175. La base local tenía OWNER, GERENTE, ROOT, MOZO y la cuenta con dos roles, pero **le faltaban JEFE_SALON y COCINA**, que son los roles propios de web-staff, y los `Mozo` de las cuentas de salón (sin ellos, atender un llamado y cobrar responden 403, porque salen de `exigirMozo`).

Para cada cuenta que falte: se pide un token a Supabase (`/auth/v1/token?grant_type=password`), se toma el `sub` del JWT y se inserta en la base local.

```sql
INSERT INTO usuario (id, supabase_user_id, email, nombre, es_root) VALUES
  (gen_random_uuid()::text, '<sub>', 'jefe-salon.pruebas-auth@menyu-app.com', 'Jefe Salon Pruebas Auth', false),
  (gen_random_uuid()::text, '<sub>', 'cocina.pruebas-auth@menyu-app.com',     'Cocina Pruebas Auth',     false);

-- El ámbito es el restaurante (ojo: el enum de la base se llama `rol`, en minúscula).
INSERT INTO membresia (id, usuario_id, rol, restaurante_id)
SELECT gen_random_uuid()::text, u.id, v.rol::rol, '22222222-2222-4222-a222-222222222222'
FROM (VALUES
  ('jefe-salon.pruebas-auth@menyu-app.com', 'JEFE_SALON'),
  ('cocina.pruebas-auth@menyu-app.com',     'COCINA'),
  ('varias.pruebas-auth@menyu-app.com',     'MOZO')  -- ya es OWNER de Marca Seed: así queda la cuenta mixta
) AS v(email, rol)
JOIN usuario u ON u.email = v.email;

-- El Mozo de cada cuenta de salón. `Mozo Seed` se deja sin usuario_id: es el "mozo sin cuenta" de Personal.
INSERT INTO mozo (id, restaurante_id, nombre, email, activo, es_jefe_salon, usuario_id)
SELECT gen_random_uuid()::text, '22222222-2222-4222-a222-222222222222', v.nombre, v.email, true, v.jefe, u.id
FROM (VALUES
  ('mozo-supabase.pruebas-auth@menyu-app.com', 'Mozo Pruebas Auth',       false),
  ('jefe-salon.pruebas-auth@menyu-app.com',    'Jefe Salon Pruebas Auth', true),
  ('varias.pruebas-auth@menyu-app.com',        'Varias Pruebas Auth',     false)
) AS v(email, nombre, jefe)
JOIN usuario u ON u.email = v.email;
```

El OWNER y el GERENTE van a web-admin por su destino: para probarlos en staff se entra con `auth.menyu.local:5173/?redirect=http://staff.menyu.local:5175/...`.

Una sesión de mesa hecha a mano tiene que quedar con `estado = 'activa'`: `GET /waiter-calls` solo mira las sesiones activas, así que con cualquier otro valor los llamados no aparecen.

## Cuentas de Google (desde la Fase 3b)

Para probar "Continuar con Google". Son cuentas de Gmail del equipo. Desde que la pantalla de consentimiento de Google Cloud está publicada (2026-10-21), entra cualquier cuenta de Google, sin cargarla como usuario de prueba. Las dos son MOZO de "Restaurante Pruebas Auth": las invitó el OWNER de prueba con `POST /auth/invitaciones` el 2026-10-21.

| Email | Cómo llegó | Entra con |
|---|---|---|
| `menyuprueba1@gmail.com` | Invitada antes de tener cuenta. Aceptó entrando con Google y después creó una contraseña desde "Olvidé mi contraseña" | Google, o email y contraseña (`STAGING_GOOGLE_1_PASSWORD`) |
| `menyuprueba2@gmail.com` | Entró con Google sin invitación ("sin acceso") y después la invitaron: `invitacionEnviada: false` | Solo Google |

En `docs/auth/.env.usuarios-staging` están `STAGING_GOOGLE_1_EMAIL`, `STAGING_GOOGLE_1_PASSWORD` (la contraseña de Supabase, no la de Google) y `STAGING_GOOGLE_2_EMAIL`. Las contraseñas de Google no se guardan en ningún lado.

### Probar el login con Google en el navegador

Google suele bloquear el inicio de sesión en un Chrome abierto por Playwright. Para automatizarlo:

1. Abrir un Chrome aparte, con un perfil propio y el puerto de depuración (PowerShell). Desde Chrome 136 el puerto solo funciona con un `--user-data-dir` que no sea el de siempre:
   ```powershell
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:LOCALAPPDATA\menyu-pruebas-google" "--host-resolver-rules=MAP *.menyu.local 127.0.0.1"
   ```
   Con `Start-Process`, pasar los argumentos como un solo string: con un array se parte `--host-resolver-rules` en los espacios.
2. Una persona inicia sesión en esa ventana con las cuentas de Google. El perfil las recuerda para la próxima vez.
3. Conectarse con `playwright-cli -s=google attach --cdp=http://127.0.0.1:9222` y usar `run-code` con localizadores por rol.
4. Si la ventana queda tapada por otras, Chrome la marca como oculta y congela la página: los clics esperan para siempre y los formularios no se mandan. Al empezar cada script:
   ```js
   const cdp = await page.context().newCDPSession(page)
   await cdp.send('Page.setWebLifecycleState', { state: 'active' })
   await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
   ```
5. Al terminar, cerrar ese Chrome: mientras está abierto, cualquier programa de la máquina lo puede controlar por el puerto 9222.

La pantalla de permisos de Google ("Cancelar" / "Continuar") aparece solo la primera vez que cada cuenta entra; después Google pasa directo del selector de cuentas a MenYU.
