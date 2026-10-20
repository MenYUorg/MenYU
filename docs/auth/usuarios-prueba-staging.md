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
