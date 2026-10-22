# Cómo probar la consola de ROOT en tu compu

Guía para probar cada etapa de la consola de ROOT ([`plan-consola-root.md`](plan-consola-root.md)) sin tocar staging ni producción. Se actualiza en cada etapa: hoy cubre el backend (etapas 1a y 1b) y la pantalla de marcas, restaurantes e historial (etapa 2a).

> **Desde la Fase 4 de auth, la consola se entra con una cuenta de Supabase** (un `Usuario` con `es_root`), no con `POST /api/auth/login`: `root@menyu.com` / `root1234` ya no abre nada. Montar el entorno local lleva unos pasos (los `.env.local`, el backend de la rama contra tu base local y las cuentas de staging en `usuario`): el paso a paso está en "Probar la entrega 4.5 en local" de [`docs/auth/usuarios-prueba-staging.md`](auth/usuarios-prueba-staging.md), y las rutas actuales en "4.4, cómo quedó" de [`docs/auth/specs/auth.md`](auth/specs/auth.md).

## 0. Una vez, al traer la rama

Con el backend parado, desde `apps/backend`:

```bash
npx prisma migrate deploy     # aplica las migraciones nuevas a tu base local
npx prisma generate           # regenera el cliente (falla con EPERM si el backend está corriendo)
```

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

La cuenta ROOT es un `Usuario` con `es_root` en tu base, vinculado por `supabase_user_id` a una cuenta del Supabase de **staging** (en local no hay Supabase propio). La de prueba es `root.pruebas-auth@menyu-app.com`; cómo dejarla en tu base está en "Probar la entrega 4.5 en local" de [`docs/auth/usuarios-prueba-staging.md`](auth/usuarios-prueba-staging.md), junto con las contraseñas (en `docs/auth/.env.usuarios-staging`, que git ignora).

> El seed sigue creando `root@menyu.com`, pero es de la tabla `admin`: no abre la consola. Las cuentas ROOT nuevas se invitan desde la consola o se promueven con el script (sección 7).

### Por la pantalla (lo normal)

Entrá por `http://auth.menyu.local:5173` con la cuenta ROOT y aterrizás en `http://admin.menyu.local:5174/root`. Necesitás las cuatro apps y el backend como dice la guía de arriba.

### Con la terminal (Git Bash), para pegarle a la API

El access token sale de Supabase con la contraseña de la cuenta:

```bash
API=http://localhost:3000/api
TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"root.pruebas-auth@menyu-app.com","password":"…"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).access_token")
curl -s $API/root/marcas -H "Authorization: Bearer $TOKEN"
```

El token dura una hora (el default de Supabase). En Swagger (<http://localhost:3000/docs>) se pega con el botón **Authorize**.

## 3. Etapa 1a: dueños y cuentas ROOT

Los dueños y las cuentas ROOT se dan de alta **por invitación**: no hay contraseñas temporales (las maneja la persona desde web-auth). Invitar necesita `SUPABASE_SERVICE_ROLE_KEY` en el backend; sin ella responde 502, así que la invitación de punta a punta se prueba en staging.

| Probá | Qué tendría que pasar |
|---|---|
| `GET /api/root/duenos` | Las membresías OWNER con su marca y su email. Ningún gerente. `?q=` filtra (ignora mayúsculas; `_` y `%` son literales). |
| `POST /api/root/marcas/{idMarca}/duenos` con `{ "email": "prueba@ejemplo.com", "nombre": "Prueba" }` | 201 con `{ usuarioId, membresiaId, invitacionEnviada }`. Le llega un mail para definir su contraseña. |
| Repetir el mismo email en esa marca | 409. Con tu propio email, 403. Con una marca dada de baja, 409. |
| `DELETE /api/root/duenos/{membresiaId}` del único dueño de una marca activa | 409. Con otro dueño, 200: se quita la membresía y el `Usuario` queda (puede tener otras). |
| `GET /api/root/roots` | Los `Usuario` con `es_root`, con `esPropia`. |
| `POST /api/root/roots` con `{ "email": "otra@ejemplo.com", "nombre": "Otra" }` | 201. Con un email que ya es de un `Usuario` (también el tuyo), 409: hacer ROOT a alguien que ya existe es del script. |
| `DELETE /api/root/roots/{id}`, `PATCH /api/root/duenos/{id}` | 404: **no existen**. Cambiar el email o la contraseña es de la persona, desde web-auth. |

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
   - **Qué corta la baja hoy:** lo público. Con la marca (o el restaurante) dada de baja, `GET /api/menu/{idRestaurante}` y `GET /api/discovery/restaurantes/{id}` dan **404**, `GET /api/marca/{idMarca}/restaurantes` da una lista vacía y `POST /api/sessions/open` (por QR o por PIN) en una mesa libre da **403 "Este restaurante no está disponible"**. Una mesa que **ya tenía una sesión abierta** sigue funcionando: quien vuelve a escanear su QR o se suma entra igual, para poder pedir la cuenta y pagar. Al reactivar, todo vuelve.
   - **Qué corta además, desde la Fase 4 de auth:** el acceso del personal. `AccesoService` no cuenta las membresías de una marca o un restaurante dados de baja, así que su dueño, gerentes, mozos y cocina reciben 403 en las rutas de datos (y web-admin y web-staff los mandan a "sin acceso"). A la mesa que ya estaba abierta le queda pagar con Mercado Pago: el efectivo también da 403, porque nadie puede confirmarlo. Al reactivar, todo vuelve.
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

Con el token de Supabase de un dueño, un gerente, un mozo o una cuenta sin `Usuario`, **todas** las rutas de `/api/root/*` dan 403, y sin token, 401. Las cuentas de prueba de cada rol están en [`docs/auth/usuarios-prueba-staging.md`](auth/usuarios-prueba-staging.md).

Y al revés: ROOT **no** entra a los datos. Con el token de la cuenta ROOT, `GET /api/restaurantes`, `GET /api/pedidos` y las demás rutas del personal dan 403 (`AccesoService` ignora `esRoot`).

## 5. Etapa 2a: la pantalla (marcas, restaurantes, bajas e historial)

La consola vive en web-admin, en `/root/*`. Usa el mismo backend de la etapa anterior: levantalo contra la base de prueba (sección 1) y, en otra terminal, la pantalla:

```bash
pnpm install                              # una vez: la rama trae dependencias nuevas
pnpm --filter @menyu/types build          # una vez: los tipos de la consola se consumen compilados
pnpm --filter @menyu/web-auth  exec vite --host 127.0.0.1 --strictPort --port 5173
pnpm --filter @menyu/web-admin exec vite --host 127.0.0.1 --strictPort --port 5174
```

web-admin no tiene login propio: entrá por <http://auth.menyu.local:5173> con la cuenta ROOT y volvés a web-admin, donde aterrizás en **Marcas** (`http://admin.menyu.local:5174/root/marcas`). Un dueño o un gerente que escriba `/root` a mano vuelve a su pantalla de siempre; y un ROOT que escriba `/admin` termina en `/root`.

> Los `*.menyu.local` necesitan el archivo hosts o un Chrome abierto con `--host-resolver-rules="MAP *.menyu.local 127.0.0.1"`, y por eso Vite va con `--host 127.0.0.1` (ver "Desarrollo local" en [`docs/auth/VariablesACambiar.md`](auth/VariablesACambiar.md)).

Un recorrido para ver todo (con el backend en la base de prueba, porque deja filas en el historial):

1. **Marcas.** La lista con las marcas del seed, cuántos restaurantes y dueños tiene cada una y si están activas. Buscá `cafe` (sin acento ni mayúsculas) y probá el interruptor **Mostrar dadas de baja**.
2. **Nueva marca.** Escribí un nombre: el identificador se arma solo. Probá dejarlo vacío, ponerle espacios o repetir el de una marca existente: el error aparece debajo del campo, sin cerrar el diálogo. Al crearla te lleva a su detalle.
3. **Detalle de la marca.** Datos, dueños (solo se ven: invitarlos y quitarlos es la etapa 2b, sobre la API de la entrega 4.4) y restaurantes. **Agregar restaurante** pide nombre y dirección (esa es la única vez que ROOT la carga). Desde el menú ⋮ de cada restaurante: **Editar nombre** y **Dar de baja** / **Reactivar**. No existe ningún botón de eliminar.
4. **Dar de baja una marca.** Pide escribir su nombre. El texto dice lo que pasa: sus restaurantes dejan de aparecer en Discovery, no muestran su carta y no abren mesas nuevas; **las mesas que ya están abiertas solo pueden pagar con Mercado Pago desde el celular**; y **su gente pierde el acceso** mientras dure la baja. Comprobalo en la app del comensal (<http://mesa.menyu.local:5176>): el restaurante desaparece del inicio; `/restaurante/<id>/carta` y el ingreso por QR o PIN dicen que no está disponible. Para ver qué le pasa a quien **ya estaba en una mesa**: abrí una mesa (por ejemplo la 100, con su QR `TEST-QR-SEED-100`), hacé un pedido, dá de baja la marca y recargá `/menu`: aparece "Este restaurante ya no está disponible", que explica que la mesa sigue abierta y cómo pedir la cuenta, con los botones **Pagar la cuenta** y **Ver mis pedidos** (desde la 4.7 no ofrece llamar al mozo ni pagar en efectivo: el personal perdió el acceso y recibiría 403). En `/pagar`, "Pagar toda la cuenta en efectivo" responde "Este restaurante no está disponible". Después **Reactivar la marca**: todo vuelve, también el efectivo.
5. **Historial** (menú lateral → *Historial*). Lo que hiciste aparece agrupado por día (hora de Buenos Aires): tocá la flecha de una fila para ver el antes y el después. Probá los filtros **Quién**, **Sobre qué**, **Desde** y **Hasta** (poné un **Hasta** anterior al **Desde**: lo avisa y no pide nada). Para ver **Cargar más** hacen falta más de 50 acciones: cambiá el nombre de una marca unas 60 veces con Swagger.
6. **Celular.** En el navegador, abrí las herramientas de desarrollo y probá el ancho 390: el menú pasa a ser un cajón con el botón de las tres rayas y los diálogos suben desde abajo.

Tests de esta etapa: `pnpm --filter @menyu/web-admin test` (toda la suite de web-admin) y `pnpm --filter @menyu/web-admin lint`.

## 6. Probar los tests

```bash
pnpm --filter @menyu/api test                      # toda la suite del backend (no necesita base)
pnpm --filter @menyu/api exec tsc --noEmit         # tipos
```

Los disparadores de la base se prueban contra un Postgres real; se saltan solos si no se lo indicás. Contra tu base local (corren dentro de transacciones que se revierten y no dejan filas):

```powershell
$env:TEST_DATABASE_URL = 'postgresql://menyu:menyu@localhost:5433/menyu'
pnpm --filter @menyu/api exec jest historial-root.base
```

## 7. Probar el script de cuentas ROOT

Contra la base de prueba (nunca contra staging o producción desde acá):

```powershell
cd apps/backend
$env:DATABASE_URL = 'postgresql://menyu:menyu@localhost:5433/menyu_probar'
pnpm exec ts-node --transpile-only scripts/cuentas-root.ts listar
pnpm exec ts-node --transpile-only scripts/cuentas-root.ts promover ana@ejemplo.com
```

`promover` marca `es_root` en un `Usuario` que **ya existe** (el que no existe se invita desde la consola). Pide el nombre de la base para confirmar. Lo que hace queda en el historial como `ROOT_PROMOVER`, con el actor `SCRIPT` y tu usuario de Windows como operador: `GET /api/root/historial?actor=script`.

## Etapas que faltan

- **Etapa 2b:** las pantallas de dueños y cuentas ROOT. La API ya está (entrega 4.4 de auth); faltan las pantallas.
- ~~**Etapa 3**~~ (contraseñas): descartada. La baja ya corta de verdad desde la Fase 4, y las contraseñas las maneja web-auth.
