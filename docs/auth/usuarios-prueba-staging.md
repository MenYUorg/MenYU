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
