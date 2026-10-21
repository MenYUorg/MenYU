# Usuarios de prueba de staging (auth)

Para probar en **staging** la migración de autenticación (dominios propios y, más adelante, las fases de `docs/auth/specs/auth.md`). Nunca usarlos contra producción.

| Rol | Email | Entra a |
|---|---|---|
| OWNER | `owner.pruebas-auth@menyu-app.com` | web-admin (toda "Marca Pruebas Auth") |
| GERENTE | `gerente.pruebas-auth@menyu-app.com` | web-admin ("Restaurante Pruebas Auth") |
| Mozo | `mozo.pruebas-auth@menyu-app.com` | web-staff ("Restaurante Pruebas Auth") |

- Marca: "Marca Pruebas Auth" (slug `pruebas-auth`). Restaurante: "Restaurante Pruebas Auth". Mesa 1, con PIN.
- **Las contraseñas y el PIN no están en el repo**, que es público: viven en `docs/auth/.env.usuarios-staging`, que git ignora (`.env.*`). Quien lo necesite se lo pide al equipo; no subirlo ni pegarlo en issues o PRs.
- Se entra por `mesa.staging.menyu-app.com/auth` (o `menyu-cliente-staging.vercel.app/auth`): el login todavía es el legacy de web-cliente.

## Cómo se crearon (2026-10-20)

La API legacy no crea OWNERs: `POST /admins` siempre crea un GERENTE, y si lo crea ROOT queda sin marca, así que no se le puede asignar ningún restaurante (`admin-restaurante.service.ts`). Por eso:

1. La marca, el restaurante y el OWNER, con un INSERT en el SQL Editor del Supabase de staging (contraseña como hash bcrypt).
2. El resto, por la API de staging iniciando sesión como ese OWNER: el GERENTE (`POST /admins`) y su restaurante (`POST /admin-restaurante`), el mozo (`POST /mozos`) y la mesa (`POST /mesas`, que genera el PIN).

Son usuarios del modelo actual (`Admin`, `AdminRestaurante`, `Mozo`). Con Supabase Auth (Fases 2 a 5 de la spec) el personal se recrea por invitación.

## Usuarios de Supabase Auth (desde la Fase 2)

Para probar `GET /auth/me` y `POST /auth/invitaciones` en `api.staging.menyu-app.com`. Mismas reglas: solo staging, y las contraseñas en `docs/auth/.env.usuarios-staging`.

| Para qué | Email | `Usuario` en la base |
|---|---|---|
| ROOT (invita a OWNER y GERENTE) | `root.pruebas-auth@menyu-app.com` | `es_root = true`, sin membresías |
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
| `sin-acceso.pruebas-auth@menyu-app.com` | ninguno (sección anterior) | "Tu cuenta no tiene acceso" |

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

Hasta la Fase 4, web-admin y web-staff no leen la sesión de Supabase: al llegar muestran su login legacy. Lo que se verifica es la URL a la que manda web-auth.

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
