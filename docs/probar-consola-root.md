# Cómo probar la consola de ROOT en tu compu

Guía para probar cada etapa de la consola de ROOT ([`plan-consola-root.md`](plan-consola-root.md)) sin tocar staging ni producción. Se actualiza en cada etapa: hoy cubre el backend (etapas 1a y 1b); cuando exista la pantalla (etapa 2) suma cómo verla.

## 0. Una vez, al traer la rama

Con el backend parado, desde `apps/backend`:

```bash
npx prisma migrate deploy     # aplica la migración del historial a tu base local
npx prisma generate           # regenera el cliente (falla con EPERM si el backend está corriendo)
```

Sin eso el login da 500: el cliente nuevo pide la columna `debe_cambiar_password`, que tu base todavía no tiene.

## 1. Conviene una base aparte para jugar (recomendado)

**El historial de ROOT no se puede borrar**, ni siquiera en tu base local: cada prueba que hagas deja filas para siempre (es a propósito, ver el plan). Para no ensuciar tu base de todos los días, creá una de prueba y apuntá el backend a ella.

PowerShell, desde `apps/backend`:

```powershell
docker exec menyu-postgres psql -U menyu -d postgres -c "create database menyu_probar"
$env:DATABASE_URL = 'postgresql://menyu:menyu@localhost:5433/menyu_probar'
$env:DIRECT_URL   = $env:DATABASE_URL
npx prisma migrate deploy
pnpm prisma db seed
pnpm dev                       # el backend queda en http://localhost:3000
```

Las variables `$env:` valen solo para esa terminal: en otra terminal, o al cerrarla, el backend vuelve a usar tu base de siempre. (El `.env` no las pisa.) Para volver a empezar de cero con la de prueba:

```powershell
docker exec menyu-postgres psql -U menyu -d postgres -c "drop database menyu_probar with (force)"
```

(Primero parar el backend que la esté usando.)

Git Bash es igual, con `export DATABASE_URL=...` en lugar de `$env:`.

## 2. Entrar como ROOT

En la base de prueba (con el seed) la cuenta ROOT es `root@menyu.com` / `root1234`. **Solo existe en local**: en staging y producción hay que crearla con el script (`apps/backend/scripts/cuentas-root.ts`).

### Con Swagger (lo más cómodo)

1. Abrí <http://localhost:3000/docs>.
2. `POST /api/auth/login` con `{ "email": "root@menyu.com", "password": "root1234" }` y copiá el `accessToken`.
3. Botón **Authorize** (arriba a la derecha), pegá el token y confirmá. Ya podés probar todas las rutas de la sección **root**.

### Con la terminal (Git Bash)

```bash
API=http://localhost:3000/api
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"root@menyu.com","password":"root1234"}' | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).accessToken")
curl -s $API/root/marcas -H "Authorization: Bearer $TOKEN"
```

El token dura 8 horas.

## 3. Etapa 1a: dueños y cuentas ROOT

| Probá | Qué tendría que pasar |
|---|---|
| `GET /api/root/duenos` | Los dueños del seed con su marca. Ningún gerente. |
| `POST /api/root/marcas/{idMarca}/duenos` con `{ "email": "prueba@ejemplo.com" }` | 201 con `passwordTemporal` (12 caracteres, **se muestra una sola vez**: copiala). |
| Entrar a web-admin (<http://localhost:5174>) con ese email y esa contraseña | Entra como dueño de esa marca. (Todavía no se le pide cambiarla: eso llega en la etapa 3.) |
| Repetir el mismo email, o uno de un mozo (`mozo@menyu.com`) | 409, sin decir quién lo usa. |
| `POST /api/root/duenos/{id}/restablecer-password` | Otra contraseña temporal. La vieja deja de servir y las sesiones del dueño se cierran. |
| `DELETE /api/root/duenos/{id}` del único dueño de una marca activa | 409. |
| `GET /api/root/roots`, `POST /api/root/roots` con un email | La lista (con "esPropia") y una cuenta ROOT nueva con su contraseña temporal. |
| `POST /api/root/roots/{id}/restablecer-password` con **tu propio** id | 400. Con el de otra ROOT, 200. |
| `DELETE /api/root/roots/{id}` | 404: **no existe** ruta para borrar cuentas ROOT. |

## 4. Etapa 1b: marcas, restaurantes e historial

Un recorrido de punta a punta (copiando los `id` que va devolviendo cada paso):

1. `GET /api/root/marcas` → las marcas del seed, con cuántos restaurantes y dueños tienen. `?bajas=true` suma las dadas de baja.
2. `POST /api/root/marcas` con `{ "nombre": "Marca de prueba", "slug": "marca-de-prueba" }` → 201 con el detalle. Repetí el `slug` y da 409; con espacios o mayúsculas raras, 400.
3. `POST /api/root/marcas/{id}/restaurantes` con `{ "nombre": "Sucursal Centro", "direccion": "Av. Colón 1200, Córdoba" }` → 201. La dirección la carga ROOT **esta única vez**.
4. `POST /api/root/marcas/{id}/duenos` con un email → el dueño de esa marca (paso 3 de la etapa 1a).
5. `GET /api/root/marcas/{id}` → el detalle: datos, restaurantes (con su dirección, de solo lectura) y dueños. Fijate que **no** aparecen logos, menú, mesas, mozos ni datos de Mercado Pago.
6. `PATCH /api/root/marcas/{id}` con `{ "nombre": "Otro nombre" }` → 200. Con `{ "logoUrl": "x" }` → **400** (el logo lo carga el dueño; ROOT no puede ni intentarlo).
7. `PATCH /api/root/restaurantes/{id}` con `{ "nombre": "Sucursal Alta Córdoba" }` → 200. Con `{ "direccion": "otra" }`, `{ "modoSesion": "seguro" }` o cualquier otro campo → **400**, no se ignora en silencio.
8. **Baja y reactivar:**
   - `POST /api/root/marcas/{id}/baja` → la marca queda inactiva (no se borra nada).
   - Abrí la app del comensal (<http://localhost:5176>): los restaurantes de esa marca **ya no aparecen** en el inicio (Discovery).
   - Repetí la baja: 200 igual, y no suma otro registro al historial.
   - `POST /api/root/marcas/{id}/reactivar` → vuelven a aparecer.
   - Lo mismo con `POST /api/root/restaurantes/{id}/baja` y `/reactivar`.
   - **Hoy la baja solo saca a la marca de Discovery.** Todavía no corta el login ni las mesas (eso es la etapa 3): el dueño de una marca dada de baja puede seguir entrando.
9. `GET /api/root/historial` → todo lo que hiciste, de lo más nuevo a lo más viejo, con quién (tu email), qué, sobre qué y el antes y después.
   - Filtros: `?actor=root@menyu.com` (o `script`), `?entidad=MARCA` (o `RESTAURANTE`, `OWNER`, `ROOT`), `?desde=2026-10-20&hasta=2026-10-20` (días en hora de Buenos Aires, los dos incluidos).
   - De a 50: si hay más, la respuesta trae `siguiente`; se pide `?cursor=<ese número>`. Para probarlo hacé unos 60 `PATCH` cambiando el nombre de una marca.
10. **Nada de lo que hagas en `/root/historial` lo cambia:** probá `DELETE`, `PATCH` o `POST` y vas a ver 404. Y desde la base:

    ```bash
    docker exec menyu-postgres psql -U menyu -d menyu_probar -c "select id, accion, actor_nombre, entidad_nombre from historial_root order by id desc limit 10"
    docker exec menyu-postgres psql -U menyu -d menyu_probar -c "delete from historial_root"
    ```

    El segundo da `ERROR: historial_root es de solo agregar: no admite DELETE`.

### Que los otros roles no entran

Con el token de un dueño (`owner@menyu.com` / `owner1234`), de un gerente (`gerente@menyu.com` / `gerente1234`) o de un mozo, **todas** las rutas de `/api/root/*` dan 403, y sin token, 401.

## 5. Probar los tests

```bash
pnpm --filter @menyu/api test                      # toda la suite del backend (no necesita base)
pnpm --filter @menyu/api exec tsc --noEmit         # tipos
```

Los disparadores de la base se prueban contra un Postgres real; se saltan solos si no se lo indicás. Contra tu base local (corren dentro de transacciones que se revierten y no dejan filas):

```powershell
$env:TEST_DATABASE_URL = 'postgresql://menyu:menyu@localhost:5433/menyu'
pnpm --filter @menyu/api exec jest historial-root.base
```

## 6. Probar el script de cuentas ROOT

Contra la base de prueba (nunca contra staging o producción desde acá):

```powershell
cd apps/backend
$env:DATABASE_URL = 'postgresql://menyu:menyu@localhost:5433/menyu_probar'
pnpm exec ts-node --transpile-only scripts/cuentas-root.ts listar
pnpm exec ts-node --transpile-only scripts/cuentas-root.ts crear ana@ejemplo.com
```

Pide la contraseña sin eco y el nombre de la base para confirmar. Lo que hace queda en el historial con el actor `script` y tu usuario de Windows como operador: `GET /api/root/historial?actor=script`.

## Etapas que faltan

- **Etapa 2:** la pantalla (web-admin, rutas `/root/*`). Esta guía va a sumar cómo abrirla y recorrerla.
- **Etapa 3:** la baja corta de verdad (mesas, menú, login) y el cambio de contraseña obligatorio en el primer ingreso.
