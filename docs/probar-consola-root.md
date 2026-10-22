# Cómo probar la consola de ROOT en tu compu

Guía para probar cada etapa de la consola de ROOT ([`plan-consola-root.md`](plan-consola-root.md)) sin tocar staging ni producción. Se actualiza en cada etapa: hoy cubre el backend (etapas 1a y 1b), la pantalla de marcas, restaurantes e historial (etapa 2a) y la de dueños y cuentas ROOT (etapa 2b, sección 5.1).

> **En la rama `feat/auth-fase-4` (desde la entrega 4.4 de auth, 2026-10-21) esta guía no sirve tal cual.** La API de `/root/*` pide el token de Supabase de una cuenta ROOT (un `Usuario` con `es_root`), no el de `POST /api/auth/login`: con `root@menyu.com` / `root1234` responde 401. Ya no existen las rutas de restablecer contraseñas ni la de cambiar el email de un dueño, los dueños y las cuentas ROOT se invitan con `{ email, nombre }`, y el script solo tiene `listar` y `promover <email>` (no `crear`). Las rutas actuales están en "4.4, cómo quedó" de [`docs/auth/specs/auth.md`](auth/specs/auth.md).
>
> Para probar la API en local hace falta el backend apuntando al Supabase de staging (`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, ver "Desarrollo local" en [`docs/auth/VariablesACambiar.md`](auth/VariablesACambiar.md)), un `Usuario` con `es_root` en tu base con el `supabase_user_id` de una cuenta de prueba de staging, y el access token de esa cuenta (por ejemplo, el de la cookie de sesión después de entrar en `auth.menyu.local:5173`). Desde la entrega 4.5 las pantallas vuelven a funcionar: web-admin lee la sesión de Supabase, así que se entra por `auth.menyu.local:5173` con una cuenta ROOT y la consola queda en `admin.menyu.local:5174/root`. El paso a paso de ese entorno (los `.env.local`, el backend de la rama con la base local y las cuentas de staging en `usuario`) está en "Probar la entrega 4.5 en local" de [`docs/auth/usuarios-prueba-staging.md`](auth/usuarios-prueba-staging.md). Lo de abajo, pensado para el login propio, se reescribe cuando se cierre la Fase 4.

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
   - **Qué corta la baja hoy:** lo público. Con la marca (o el restaurante) dada de baja, `GET /api/menu/{idRestaurante}` y `GET /api/discovery/restaurantes/{id}` dan **404**, `GET /api/marca/{idMarca}/restaurantes` da una lista vacía y `POST /api/sessions/open` (por QR o por PIN) en una mesa libre da **403 "Este restaurante no está disponible"**. Una mesa que **ya tenía una sesión abierta** sigue funcionando: quien vuelve a escanear su QR o se suma entra igual, para poder pedir la cuenta y pagar. Al reactivar, todo vuelve.
   - **Qué todavía no corta:** el inicio de sesión del personal. El dueño, el gerente y los mozos de una marca dada de baja pueden seguir entrando (eso va con la migración de autenticación).
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

## 5. Etapa 2a: la pantalla (marcas, restaurantes, bajas e historial)

La consola vive en web-admin, en `/root/*`. Usa el mismo backend de la etapa anterior: levantalo contra la base de prueba (sección 1) y, en otra terminal, la pantalla:

```bash
pnpm install                              # una vez: la rama trae dependencias nuevas
pnpm --filter @menyu/types build          # una vez: los tipos de la consola se consumen compilados
pnpm --filter @menyu/web-admin dev        # http://localhost:5174
```

Abrí <http://localhost:5174>: web-admin no tiene login propio y te manda al de la app de clientes (<http://localhost:5176/auth>, que tiene que estar levantada y apuntando al mismo backend). Entrá con `root@menyu.com` / `root1234` y volvés a web-admin, donde aterrizás en **Marcas** (`/root/marcas`). Un dueño o un gerente que escriba `/root` a mano vuelve a su pantalla de siempre; y un ROOT que escriba `/admin` termina en `/root`.

Un recorrido para ver todo (con el backend en la base de prueba, porque deja filas en el historial):

1. **Marcas.** La lista con las marcas del seed, cuántos restaurantes y dueños tiene cada una y si están activas. Buscá `cafe` (sin acento ni mayúsculas) y probá el interruptor **Mostrar dadas de baja**.
2. **Nueva marca.** Escribí un nombre: el identificador se arma solo. Probá dejarlo vacío, ponerle espacios o repetir el de una marca existente: el error aparece debajo del campo, sin cerrar el diálogo. Al crearla te lleva a su detalle.
3. **Detalle de la marca.** Datos, dueños (se invitan y se les quita el acceso: ver 5.1) y restaurantes. **Agregar restaurante** pide nombre y dirección (esa es la única vez que ROOT la carga). Desde el menú ⋮ de cada restaurante: **Editar nombre** y **Dar de baja** / **Reactivar**. No existe ningún botón de eliminar.
4. **Dar de baja una marca.** Pide escribir su nombre. El texto dice lo que pasa: sus restaurantes dejan de aparecer en Discovery, no muestran su carta y no abren mesas nuevas; las mesas que ya están abiertas se pueden terminar; y **su gente todavía puede iniciar sesión** (ese corte llega con la migración de autenticación). Comprobalo en la app del comensal (<http://localhost:5176>): el restaurante desaparece del inicio; `/restaurante/<id>/carta` y el ingreso por QR o PIN dicen que no está disponible. Para ver qué le pasa a quien **ya estaba en una mesa**: abrí una mesa (por ejemplo la 100, con su QR `TEST-QR-SEED-100`), hacé un pedido, dá de baja la marca y recargá `/menu`: aparece "Este restaurante ya no está disponible", que explica que la mesa sigue abierta y cómo pedir la cuenta, con los botones **Pagar la cuenta**, **Ver mis pedidos** y **Llamar al mozo**. Después **Reactivar la marca**: todo vuelve.
5. **Historial** (menú lateral → *Historial*). Lo que hiciste aparece agrupado por día (hora de Buenos Aires): tocá la flecha de una fila para ver el antes y el después. Probá los filtros **Quién**, **Sobre qué**, **Desde** y **Hasta** (poné un **Hasta** anterior al **Desde**: lo avisa y no pide nada). Para ver **Cargar más** hacen falta más de 50 acciones: cambiá el nombre de una marca unas 60 veces con Swagger.
6. **Celular.** En el navegador, abrí las herramientas de desarrollo y probá el ancho 390: el menú pasa a ser un cajón con el botón de las tres rayas y los diálogos suben desde abajo.

Tests de esta etapa: `pnpm --filter @menyu/web-admin test` (toda la suite de web-admin) y `pnpm --filter @menyu/web-admin lint`.

### 5.1 Etapa 2b: dueños y cuentas ROOT por invitación

Necesita el entorno de la Fase 4 (rama `feat/auth-fase-4`: la 4.4 es la API de dueños y cuentas ROOT, la 4.5 el login con Supabase): ver el aviso del principio y "Probar la entrega 4.5 en local" de [`docs/auth/usuarios-prueba-staging.md`](auth/usuarios-prueba-staging.md). Se entra por `auth.menyu.local:5173` con una cuenta ROOT y la consola queda en `admin.menyu.local:5174/root`.

> **Las invitaciones mandan mails de verdad** (el Supabase de staging) y **dejan filas en el historial para siempre**. Usá direcciones tuyas con alias (`tunombre+dueno1@gmail.com`): llegan a tu casilla y Supabase las trata como direcciones distintas. Y probá contra una base de prueba (sección 1).

1. **Dueños** (menú lateral). Todos los dueños con su marca (se toca para abrirla). Buscá por nombre, email o marca: `lucia` encuentra a "Lucía". Una cuenta desactivada lleva el aviso **Cuenta desactivada**. No hay aviso de "invitación pendiente": la API no lo informa.
2. **Invitar dueño.** Elegí la marca, escribí el nombre y el email y enviá: dice **Invitación enviada** y te llega el mail con el enlace para elegir una contraseña. El dueño aparece en la lista enseguida, haya aceptado o no. Probá los errores (todos debajo del campo del email): repetir el mismo email en la misma marca → "Esa persona ya es dueña de esta marca."; tu propio email → "Ese es tu propio email". Con el email de alguien que ya tiene cuenta (otro dueño, o una cuenta que ya entró con Google) dice **Ya tenía una cuenta**: no se manda mail y ya puede entrar. Una persona puede ser dueña de más de una marca. En el detalle de una marca de baja no hay botón de invitar.
3. **Quitar acceso** (menú ⋮ de un dueño, en la lista o en el detalle de su marca). Pide confirmar y aclara que **la cuenta de la persona no se borra** y que se la puede volver a invitar. Si es el único dueño de una marca activa dice **No se puede quitar todavía** y ofrece **Invitar a otro dueño**, con la marca ya elegida; en una marca de baja sí se quita. Comprobalo con el dueño que quitaste: ya no entra a esa marca, pero su cuenta sigue (`select email from usuario`).
4. **Cuentas ROOT** (menú lateral). La tuya dice **Vos**, y no hay ninguna acción por cuenta (ni eliminar ni restablecer contraseña). **Invitar cuenta ROOT** con un email que todavía no tenga cuenta en MenYU. Con el de una cuenta que ya existe (un dueño, por ejemplo) el error dice que hacerla ROOT es del script de cuentas ROOT (`promover`).
5. **Historial.** Aparecen "Invitó al dueño", "Quitó al dueño" y "Invitó a la cuenta ROOT"; el detalle cuenta si se mandó el mail ("mail enviado" o "ya tenía cuenta: no se le mandó mail") y nunca guarda una contraseña.
6. **Celular.** Probá 390 y 360: los diálogos suben desde abajo y los textos largos (el error del script) se parten sin scroll horizontal.

Tests de esta etapa: los de la sección 5 (`pnpm --filter @menyu/web-admin test` y `lint`).

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
pnpm exec ts-node --transpile-only scripts/cuentas-root.ts crear ana@ejemplo.com
```

Pide la contraseña sin eco y el nombre de la base para confirmar. Lo que hace queda en el historial con el actor `script` y tu usuario de Windows como operador: `GET /api/root/historial?actor=script`.

## Etapas que faltan

- **Etapa 2b** (dueños y cuentas ROOT por invitación): hecha (2026-10-22), ver 5.1.
- **Etapa 3:** la baja corta de verdad (mesas, menú, login) y el cambio de contraseña obligatorio en el primer ingreso.
