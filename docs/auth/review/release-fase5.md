# Release de la Fase 5 a producción

Preparado el 2026-10-28 para la Etapa 4 de `plan-cierre-auth.md`, sobre `main` en `94fe19f`. Las secciones 1 a 3 las
hace una persona del equipo, en orden y en un mismo día; la 4 la corre el orquestador cuando el usuario confirma el tag
(salvo 4.6, que es SQL y la corre el usuario). Las secciones 1 y 2 son de solo lectura (`SELECT`, `pg_dump`): en
producción solo escriben el cambio de `JWT_SECRET` (paso 5 de la sección 3) y el deploy (paso 8).

## Qué hace el release en la base

El tag aplica **una** migración nueva, `20261025120000_fase5_login_legacy`; las otras 35 ya están en producción desde
v1.3.0. La aplica el propio backend al arrancar: el contenedor corre `prisma migrate deploy && node dist/main`
(`apps/backend/Dockerfile:70`). Lo que hace (`apps/backend/prisma/migrations/20261025120000_fase5_login_legacy/migration.sql`):

| Líneas | Qué hace |
|---|---|
| 11-15 | Pasa `pedido_edicion.admin_id` a `usuario_id` cuando el `admin` tiene un `usuario` con el mismo email (sin distinguir mayúsculas) |
| 17-18 | Borra la FK `pedido_edicion_admin_id_fkey` y la columna `pedido_edicion.admin_id` |
| 22 | `DROP TABLE "admin_restaurante"` |
| 25 | `DROP TABLE "admin"`, con sus disparadores `admin_ultimo_root_sin_delete` y `admin_ultimo_root_sin_cambio_de_rol` |
| 26-27 | `DROP FUNCTION "admin_proteger_ultimo_root"()` y `DROP TYPE "rol_admin"` |
| 29 | `DROP TABLE "refresh_token"` |
| 34-35 | Borra `mozo.password_hash` y `cliente.password_hash` |

- **Ningún `DROP` lleva `CASCADE`.** Si una vista, una política, una FK o una función con cuerpo SQL estándar dependen
  de algo de lo que se borra, el `DROP` falla, la migración queda fallida (P3009, como en el incidente del 2026-10-20,
  `docs/auth/specs/auth.md:743`) y el backend nuevo no arranca. Solo dejan dependencia los cuerpos SQL estándar
  (`BEGIN ATOMIC` o `RETURN …`): una función `plpgsql`, una `LANGUAGE sql` con el cuerpo entre `$$` o un procedure con
  el cuerpo como texto no la dejan. Con esas, el `DROP` pasa y la función se rompe la próxima vez que alguien la llama,
  como `e2e.e2e_limpiar` en staging (`auth.md:614`). Por eso las consultas de la sección 1 son dos: lo que dice el
  texto (1.2) y lo que registra Postgres (1.3).
- **No tiene vuelta atrás.** En cuanto se aplica, la base deja de servir al código de v1.3.0 (`auth.md:611`): mientras
  el backend viejo siga atendiendo, sus consultas a `cliente`, `mozo` y `pedido_edicion` pueden fallar. Conviene un
  horario de poco uso, el mismo que para `JWT_SECRET` (paso 5).

## 1. Consultas previas

En el **Supabase de producción**, SQL Editor, una consulta por vez (si se pegan varias, el editor muestra solo el
resultado de la última). Son de solo lectura. Antes, conviene correrlas una vez en el de staging, donde la migración ya
está aplicada: tienen que correr sin error y dar 0 filas. Eso solo prueba que parsean en Supabase, porque en staging
1.3 da vacío por construcción (no quedan tablas ni columnas que mirar). Que detectan lo que tienen que detectar quedó
probado en un PostgreSQL local con las migraciones de v1.3.0 y objetos señuelo (revisión del 2026-10-28; ver la
bitácora, Etapa 4). En Supabase no se corrieron.

### 1.1 Estado de las migraciones

Que la base esté donde la dejó v1.3.0 y sin una migración fallida pendiente: con una, `prisma migrate deploy` corta con
P3009 antes de llegar a la nueva.

```sql
SELECT migration_name, finished_at, rolled_back_at,
       finished_at IS NULL AND rolled_back_at IS NULL AS fallida
FROM _prisma_migrations
ORDER BY fallida DESC, started_at DESC
LIMIT 3;
```

**Esperado:** `fallida` en `false` en las tres filas; la primera es `20261021141707_fase4_autoria_usuario`, y
`20261025120000_fase5_login_legacy` no aparece.

### 1.2 Vistas, funciones y políticas que nombran lo que se borra

```sql
WITH patrones(patron, que) AS (
  VALUES ('\madmin\M',                   'admin'),
         ('\madmin_restaurante\M',       'admin_restaurante'),
         ('\madmin_id\M',                'admin_id'),
         ('\mrol_admin\M',               'rol_admin'),
         ('\mrefresh_?token\M',          'refresh_token'),
         ('\mpassword_?hash\M',          'password_hash'),
         ('\mdebe_?cambiar_?password\M', 'debe_cambiar_password')
),
-- Todos los esquemas menos los del sistema y los que administra Supabase
-- (auth.refresh_tokens es la sesión de Supabase Auth, no la nuestra).
esquemas AS (
  SELECT oid, nspname::text AS nspname
  FROM pg_namespace
  WHERE nspname !~ '^pg_'
    AND nspname NOT IN ('information_schema', 'auth', 'storage', 'realtime', '_realtime', 'extensions',
                        'graphql', 'graphql_public', 'pgsodium', 'pgsodium_masks', 'vault', 'net', 'cron',
                        'pgbouncer', 'pgmq', 'supabase_functions', 'supabase_migrations', '_analytics')
),
objetos(tipo, esquema, nombre, texto) AS (
  SELECT 'vista', schemaname::text, viewname::text, definition
  FROM pg_views
  WHERE schemaname IN (SELECT nspname FROM esquemas)
  UNION ALL
  SELECT 'vista materializada', schemaname::text, matviewname::text, definition
  FROM pg_matviews
  WHERE schemaname IN (SELECT nspname FROM esquemas)
  UNION ALL
  -- pg_get_functiondef y no prosrc: también trae el cuerpo de las funciones BEGIN ATOMIC
  SELECT 'función', e.nspname, p.oid::regprocedure::text, pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN esquemas e ON e.oid = p.pronamespace
  WHERE p.prokind IN ('f', 'p')
    -- las de una extensión (unaccent y compañía) no son nuestras
    AND NOT EXISTS (SELECT 1 FROM pg_depend x
                    WHERE x.classid = 'pg_proc'::regclass AND x.objid = p.oid AND x.deptype = 'e')
    -- la borra la propia migración (línea 26), después de la tabla y sus disparadores
    AND NOT (e.nspname = 'public' AND p.proname = 'admin_proteger_ultimo_root')
  UNION ALL
  -- Las políticas, en todos los esquemas: una de Storage (storage.objects) también podría mirar public.admin.
  -- Menos las de las tres tablas que se borran, que caen con ellas.
  SELECT 'política', schemaname::text, tablename::text || ' / ' || policyname::text, concat_ws(' ', qual, with_check)
  FROM pg_policies
  WHERE NOT (schemaname = 'public' AND tablename IN ('admin', 'admin_restaurante', 'refresh_token'))
)
SELECT o.tipo, o.esquema, o.nombre, string_agg(pt.que, ', ' ORDER BY pt.que) AS menciona
FROM objetos o
JOIN patrones pt ON o.texto ~* pt.patron
GROUP BY o.tipo, o.esquema, o.nombre
ORDER BY o.tipo, o.esquema, o.nombre;
```

**Esperado: 0 filas.**

### 1.3 Lo que Postgres no dejaría borrar

Lo mismo que mira el `DROP` sin `CASCADE`: los objetos que dependen de lo que borra la migración. Cubre las FK de otras
tablas (`pg_constraint`), las vistas, las políticas, los tipos usados en otras columnas o funciones, y el `WHEN` o el
`UPDATE OF` de un disparador.

```sql
WITH tablas AS (
  SELECT oid, reltype
  FROM pg_class
  WHERE oid IN (to_regclass('public.admin'), to_regclass('public.admin_restaurante'), to_regclass('public.refresh_token'))
),
a_borrar(clase, id, sub) AS (
  SELECT 'pg_class'::regclass, oid, 0 FROM tablas               -- las tres tablas
  UNION ALL
  SELECT 'pg_type'::regclass, reltype, 0 FROM tablas            -- y su tipo de fila
  UNION ALL
  SELECT 'pg_class'::regclass, attrelid, attnum::int            -- las tres columnas
  FROM pg_attribute
  WHERE NOT attisdropped
    AND ((attrelid = to_regclass('public.mozo')           AND attname = 'password_hash')
      OR (attrelid = to_regclass('public.cliente')        AND attname = 'password_hash')
      OR (attrelid = to_regclass('public.pedido_edicion') AND attname = 'admin_id'))
  UNION ALL
  SELECT 'pg_type'::regclass, oid, 0 FROM pg_type WHERE oid = to_regtype('public.rol_admin')
  UNION ALL                                                      -- y sus tipos array (_rol_admin, _admin…)
  SELECT 'pg_type'::regclass, t.typarray, 0
  FROM pg_type t
  WHERE t.typarray <> 0
    AND (t.oid = to_regtype('public.rol_admin') OR t.oid IN (SELECT reltype FROM tablas))
  UNION ALL
  SELECT 'pg_proc'::regclass, oid, 0 FROM pg_proc WHERE oid = to_regprocedure('public.admin_proteger_ultimo_root()')
),
-- Lo que cae con las mismas tablas, o que la migración borra antes (línea 17): no frena nada
cae_con_las_tablas(clase, id) AS (
  SELECT 'pg_class'::regclass, oid FROM tablas
  UNION ALL SELECT 'pg_constraint'::regclass, oid FROM pg_constraint WHERE conrelid IN (SELECT oid FROM tablas)
  UNION ALL SELECT 'pg_trigger'::regclass, oid FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM tablas)
  UNION ALL SELECT 'pg_attrdef'::regclass, oid FROM pg_attrdef WHERE adrelid IN (SELECT oid FROM tablas)
  UNION ALL SELECT 'pg_policy'::regclass, oid FROM pg_policy WHERE polrelid IN (SELECT oid FROM tablas)
  UNION ALL SELECT 'pg_constraint'::regclass, oid FROM pg_constraint
            WHERE conrelid = to_regclass('public.pedido_edicion') AND confrelid = to_regclass('public.admin')
)
SELECT DISTINCT
       pg_describe_object(b.clase, b.id, b.sub)           AS lo_que_borra_la_migracion,
       pg_describe_object(d.classid, d.objid, d.objsubid) AS depende_de_eso
FROM a_borrar b
JOIN pg_depend d
  ON d.refclassid = b.clase AND d.refobjid = b.id AND (b.sub = 0 OR d.refobjsubid = b.sub)
WHERE d.deptype = 'n'
  AND NOT EXISTS (SELECT 1 FROM cae_con_las_tablas c WHERE c.clase = d.classid AND c.id = d.objid)
ORDER BY 1, 2;
```

**Esperado: 0 filas.** Casi todas las filas son un `DROP` que fallaría; la excepción está en "Cómo leer un resultado".

### 1.4 Tareas programadas (pg_cron)

Su SQL es texto: ningún catálogo lo relaciona con las tablas.

```sql
SELECT jobid, jobname, schedule, command
FROM cron.job
WHERE command ~* '\m(admin|admin_restaurante|admin_id|rol_admin|refresh_?token|password_?hash|debe_?cambiar_?password)\M';
```

**Esperado:** 0 filas, o el error `relation "cron.job" does not exist`, que quiere decir que el proyecto no tiene pg_cron.

### Cómo leer un resultado

- **Una fila en 1.3:** la migración fallaría. Se resuelve antes del tag: ver la definición
  (`SELECT pg_get_viewdef('esquema.vista'::regclass)` o `SELECT pg_get_functiondef('esquema.funcion(args)'::regprocedure)`),
  guardarla fuera del repo y, si nadie la usa, borrarla a mano; si se usa, adaptarla para que no dependa de lo que se
  borra. La migración no se cambia: ya está aplicada en staging.
- **La excepción de 1.3:** un `CHECK` o una regla (`RULE`) de `mozo`, `cliente` o `pedido_edicion` que use la columna
  borrada aparece, pero no frena la migración: el `DROP COLUMN` se lo lleva. Igual conviene mirarlo, porque desaparece
  con la columna.
- **Una fila en 1.2 o 1.4 que no está en 1.3** (una función `plpgsql`, una política que nombra algo en un texto): no
  frena la migración, pero se rompe después. Mismo remedio. El precedente es
  `scripts/e2e-staging/sql/e2e-limpiar-sin-password-hash.sql`, un `CREATE OR REPLACE` sin la referencia; si la que
  aparece es `e2e.e2e_limpiar`, es justo ese archivo.
- **Lo que las consultas ya descuentan:** en 1.2, `admin_proteger_ultimo_root()` y las políticas de las tres tablas; en
  1.3, las restricciones, los disparadores, los valores por defecto y las políticas de las tres tablas, más la FK de
  `pedido_edicion` a `admin`. Los borra la propia migración (líneas 17 a 26).
- **Falsos positivos.** Los patrones buscan palabras enteras (`\m…\M`, donde el `_` cuenta como parte de la palabra):
  `admin` no encuentra `admin_restaurante`, `admin_id`, `rol_admin` ni `supabase_admin`, y `refresh_token` no encuentra
  `mp_refresh_token` (Mercado Pago) ni `refresh_tokens` (Supabase Auth). Los tres primeros tienen su propio patrón. Sí
  puede aparecer la palabra en un comentario o en un texto, como `'admin'` en una política que mira un rol: leer la
  definición antes de descartarla.
- **Lo que no miran.** 1.2 saltea los esquemas del sistema, los de Supabase (la lista de la consulta) y las funciones de
  extensiones; las políticas sí las mira en todos los esquemas. Los disparadores no van aparte: su cuerpo es una
  función (1.2) y su `WHEN` o su `UPDATE OF` dejan dependencia (1.3). `information_schema` tampoco: solo muestra los
  objetos sobre los que el rol tiene privilegios, y para las vistas no agrega nada a `pg_depend`. Y nada de esto ve lo
  que vive fuera de la base: si el proyecto tuviera Edge Functions, mirar que ninguna lea esas tablas.

## 2. Respaldo

**Omitido para este release** por decisión del usuario del 2026-10-28: los datos del login anterior en producción son de
prueba. Queda como referencia por si se necesitara en otro momento.

Antes de cualquier deploy (decisión 4 de la Fase 5, `auth.md:573`). Después del paso 8 es lo único que queda de esos
datos.

**Contiene hashes de contraseñas (bcrypt) y emails reales.** Guardarlo:

- Fuera del repo (ni en `docs/` ni en un `.env.*` ignorado) y fuera de OneDrive. El repo vive en `OneDrive\Escritorio`,
  así que todo lo del Escritorio se sube a la nube: usar una carpeta que OneDrive no sincronice (por ejemplo
  `$HOME/respaldos-menyu/`, fuera de Escritorio y Documentos).
- Cifrado (por ejemplo, un `.7z` con contraseña y `-mhe=on`, con la contraseña en un gestor), o borrado cuando el
  release esté confirmado (sugerencia: después de una semana sin problemas, anotando la fecha en la bitácora).
- Nunca en un issue, un PR, un Drive compartido ni un chat, tampoco el del agente.

### 2.1 Cuántas filas hay

```sql
SELECT 'admin' AS que, count(*) AS filas FROM admin
UNION ALL SELECT 'admin_restaurante', count(*) FROM admin_restaurante
UNION ALL SELECT 'refresh_token', count(*) FROM refresh_token
UNION ALL SELECT 'mozo con password_hash', count(*) FROM mozo WHERE password_hash IS NOT NULL
UNION ALL SELECT 'cliente con password_hash', count(*) FROM cliente WHERE password_hash IS NOT NULL
UNION ALL SELECT 'pedido_edicion con admin_id', count(*) FROM pedido_edicion WHERE admin_id IS NOT NULL;
```

Anotar los seis números: el respaldo tiene que tener esas filas. El 25/10 había 14 clientes con contraseña
(`auth.md:570`); puede haber más, porque el web-cliente de v1.3.0 todavía registra con el login anterior.

`pedido_edicion.admin_id` no está en la lista del plan, pero la migración también la borra (línea 18): sin ella, el
respaldo de `admin` no dice quién editó cada pedido.

### 2.2 Opción A: desde el SQL Editor (sin instalar nada)

Cada consulta por separado, y su resultado descargado como CSV con el nombre que va en el comentario:

```sql
SELECT * FROM admin ORDER BY id;                                                     -- fase5-admin.csv
```
```sql
SELECT * FROM admin_restaurante ORDER BY id;                                         -- fase5-admin_restaurante.csv
```
```sql
SELECT * FROM refresh_token ORDER BY created_at;                                     -- fase5-refresh_token.csv
```
```sql
SELECT id, restaurante_id, nombre, email, password_hash
FROM mozo WHERE password_hash IS NOT NULL ORDER BY id;                               -- fase5-mozo-password_hash.csv
```
```sql
SELECT id, nombre, email, password_hash
FROM cliente WHERE password_hash IS NOT NULL ORDER BY id;                            -- fase5-cliente-password_hash.csv
```
```sql
SELECT id, pedido_id, admin_id, usuario_id
FROM pedido_edicion WHERE admin_id IS NOT NULL ORDER BY id;                          -- fase5-pedido_edicion-admin_id.csv
```

Comprobar que cada CSV tenga las filas de 2.1, más el encabezado. Si alguno trae menos (el candidato es
`refresh_token`, si es largo), sacar ese con la opción B o en partes con `LIMIT` y `OFFSET`. El CSV no trae la
estructura de las tablas: está en las migraciones del repo. `COPY … TO '<archivo>'` no sirve para esto: escribe en el
servidor de la base, no en tu máquina.

### 2.3 Opción B: `pg_dump` y `psql` (Git Bash)

Hace falta un cliente de PostgreSQL de la misma versión mayor que el servidor o más nueva: `SHOW server_version;` en
el SQL Editor (el proyecto de QA dio 17, `docs/calidad/bitacora.md:664`; producción no se consultó).

```bash
DESTINO="$HOME/respaldos-menyu/fase5-$(date +%F)"
mkdir -p "$DESTINO"
D=$(cygpath -m "$DESTINO")   # C:/Users/…: pg_dump y psql de Windows no entienden /c/Users/…

# La cadena "Session pooler" o "Direct connection" del proyecto de producción (Connect, en Supabase), no la del
# "Transaction pooler" (puerto 6543). Se lee sin eco para que no quede en el historial.
read -rsp 'Cadena de conexión de producción: ' PROD_DB_URL; echo

pg_dump "$PROD_DB_URL" \
  --table=public.admin --table=public.admin_restaurante --table=public.refresh_token \
  --no-owner --no-privileges --file="$D/fase5-tablas.sql"

# En Windows, sin esto el \copy escribe con la página de códigos de la consola, no en UTF-8
export PGCLIENTENCODING=UTF8

psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 \
  -c "\copy (SELECT id, restaurante_id, nombre, email, password_hash FROM mozo WHERE password_hash IS NOT NULL ORDER BY id) TO '$D/fase5-mozo-password_hash.csv' WITH (FORMAT csv, HEADER)" \
  -c "\copy (SELECT id, nombre, email, password_hash FROM cliente WHERE password_hash IS NOT NULL ORDER BY id) TO '$D/fase5-cliente-password_hash.csv' WITH (FORMAT csv, HEADER)" \
  -c "\copy (SELECT id, pedido_id, admin_id, usuario_id FROM pedido_edicion WHERE admin_id IS NOT NULL ORDER BY id) TO '$D/fase5-pedido_edicion-admin_id.csv' WITH (FORMAT csv, HEADER)"

unset PROD_DB_URL
```

`pg_dump --table` no incluye el tipo `rol_admin` ni la función de los disparadores de `admin`. Para restaurar, crearlos
antes con `20260519000000_add_rol_admin_enum_and_admin_restaurante/migration.sql:2` y
`20261020150000_consola_root_historial/migration.sql:74-87`.

## 3. Checklist

En este orden. **No cambies ninguna variable de Railway producción (paso 5) sin el 3 hecho:** si el servicio estuviera
conectado a GitHub, el cambio construiría `main` y aplicaría los `DROP` (`auth.md:611`).

- [x] ~~**Respaldo hecho y guardado fuera del repo.**~~ **Omitido: datos de prueba, decisión del usuario del
  2026-10-28.** Los datos del login anterior en producción son de prueba (`auth.md:570`), así que no se exportan. La
  sección 2 queda como referencia.
- [ ] **Las consultas de arriba no devuelven nada (o se resolvió lo que devolvieran antes de seguir).**
  - 1.1 como se espera, y 1.2, 1.3 y 1.4 en 0 filas. Lo que se haya resuelto, con su definición guardada fuera del
    repo.
- [x] **Railway producción sigue desconectado de GitHub.** Hecho el 2026-10-28: el auto-deploy ya estaba deshabilitado
  y ahora el servicio quedó sin source.
  - Railway → el servicio de producción → *Settings → Source*: sin repositorio (`docs/auth/VariablesACambiar.md:17`).
    Si alguien lo vuelve a conectar, desconectarlo antes de seguir.
- [ ] **En SonarCloud, la referencia de "código nuevo" movida para que mida la Fase 5, y el quality gate en verde.**
  - Hoy es *Previous version*, desde el 17/10 (`docs/calidad/bitacora.md:16,27`): el gate mide junto todo lo que entró
    desde entonces, y la Fase 5 nunca se midió sola (informe, C1 punto 3).
  - SonarCloud → `MenYUorg_MenYU` → *Administration → New Code*, rama `main`: *Number of days*, con los días que van
    del 25/10/2026 (el primer commit de la fase, `6dab9a7`) al día en que se corra el análisis, más uno. Por ejemplo,
    4 si se analiza el 28/10. *Reference branch* no aplica a `main`.
  - El cambio vale desde el próximo análisis: en GitHub Actions, el último run de **CI** de `main` (el del push del
    commit que se va a taggear) → *Re-run all jobs*. El paso de Sonar espera el gate y falla si no pasa (`ci.yml:122`).
  - Comprobar: `curl -s "https://sonarcloud.io/api/qualitygates/project_status?projectKey=MenYUorg_MenYU&branch=main"`
    tiene que traer `"status":"OK"` y, en `periods`, un modo que ya no sea `previous_version` (el de hoy,
    `docs/calidad/bitacora.md:764`).
  - Si el gate da rojo, ese commit no se puede taggear: el `check-ci` de `deploy-production.yml` (líneas 59-85) mira el
    último run de CI del commit y corta. Hay que arreglarlo antes.
  - Después del release, decidir si *Number of days* queda o se pasa a otra definición (pendiente 1 de
    `docs/calidad/bitacora.md`).
- [ ] **`JWT_SECRET` rotado en Railway staging y producción.**
  - Por qué: el JWT de sesión de mesa de `verify-carrito.*` estuvo en el repo público. La Etapa 2 borró los archivos,
    pero sigue en la historia de git, y con un token firmado se puede probar el secreto por fuerza bruta sin tocar el
    servidor (informe §3.3, punto 4). Además, el incidente de seguridad de Railway del 21/10 afectó variables de los
    servicios (`docs/calidad/bitacora.md:667,727`).
  - Qué corta: los tokens de sesión de mesa (duran 12 h, `apps/backend/src/sessions/sessions.module.ts:17`) y los
    `state` del OAuth de Mercado Pago en vuelo (10 min, `apps/backend/src/payments/mercado-pago-oauth.service.ts:10,85`).
    Un comensal con la mesa abierta recibe 401 en su próxima acción y tiene que volver a entrar con el QR o el PIN: el
    `open` le da un token nuevo de la misma sesión (`sessions.service.ts:231-262`). Un dueño que estaba conectando
    Mercado Pago lo reintenta. Además, v1.3.0 todavía firma con `JWT_SECRET` los access tokens del login anterior
    (8 h, `apps/backend/src/auth/auth.module.ts:17-18` en ese tag): esos clientes pierden el token y lo renuevan o
    entran como invitado. Al personal no le cambia nada: sus tokens los firma Supabase.
  - **No es `MP_ENCRYPTION_KEY`**: esa cifra los tokens de Mercado Pago guardados en la base y no se toca.
  - Cuándo: fuera del almuerzo y de la cena (por ejemplo, a la mañana temprano o entre las 16 y las 19), y mejor en la
    misma ventana que el tag. Justo antes, en el SQL Editor de producción,
    `SELECT count(*) FROM sesion_mesa WHERE estado = 'activa';` (lo ideal, 0).
  - Cómo: un valor distinto por ambiente, generado con
    `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`. Railway → el servicio →
    *Variables* → `JWT_SECRET`, y aplicar (redespliega). Primero staging, después producción. El valor no se guarda en
    ningún otro lado.
  - Después del de producción: `curl -s https://api.menyu-app.com/health` con `"status":"ok"`, y
    `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' https://api.menyu-app.com/api/auth/login`
    tiene que dar **400**, no 404: v1.3.0 todavía tiene ese endpoint y rechaza el cuerpo vacío. Un 404 querría decir
    que Railway construyó `main` y la migración ya corrió: parar e ir a "Si algo falla". No usar `/auth/guest` para
    esto: en v1.3.0 crea un cliente invitado.
  - El 400 no alcanza solo: si Railway hubiera construido `main` y la migración hubiera fallado, el deploy viejo
    seguiría respondiendo 400, y `/health` seguiría mostrando el SHA viejo, porque `APP_COMMIT_SHA` tiene prioridad
    (`health.service.ts:40`). Por eso, después de rotar en producción, volver a correr 1.1:
    `20261025120000_fase5_login_legacy` no tiene que aparecer, y `fallida` tiene que seguir en `false`.
- [ ] **Decidido qué hacer con la cuenta de cliente de prueba de staging (`menyuprueba2+rev2710@gmail.com`): sumarla a
  `docs/auth/.env.usuarios-staging` o borrarla del Supabase de staging.**
  - Es "Revisor Fase Cinco", confirmada, `Cliente` `404ef2c3-d60b-449e-ad88-2fb76d185e4f`
    (`auth-review-2026-10-27.md:778`). Su contraseña quedó en un archivo temporal del scratchpad de la revisión; la
    ruta está en esa misma entrada del informe.
  - Sumarla: `STAGING_AUTH_CLIENTE_REV_EMAIL` y `STAGING_AUTH_CLIENTE_REV_PASSWORD` en `docs/auth/.env.usuarios-staging`
    (git lo ignora, `.gitignore:7`), más una fila en la tabla de `docs/auth/usuarios-prueba-staging.md` (líneas 73-84) y
    un párrafo como los de las líneas 86-88.
  - Borrarla: Supabase de staging → *Authentication → Users* → la cuenta → *Delete user*. El `Cliente` queda como
    historia de la mesa; si alguien se registra después con ese email, el `Cliente` nuevo queda sin email y no falla
    nada (`apps/backend/src/auth/supabase/cuenta-de-cliente.service.ts:99-103`).
  - En los dos casos, borrar después el archivo del scratchpad.
- [ ] **`tableCode` de la mesa 1 sumado a `docs/auth/usuarios-prueba-staging.md`.**
  - Es `mesa.qr_token`: el QR codifica `/check-in?restaurantId=…&tableCode=<qr_token>`
    (`apps/backend/src/mesas/mesas.service.ts:114`). En el SQL Editor de staging:
    `SELECT m.qr_token FROM mesa m JOIN restaurante r ON r.id = m.restaurante_id WHERE r.nombre = 'Restaurante Pruebas Auth' AND m.numero = '1';`
  - Ojo: ese doc deja el PIN fuera del repo, que es público (línea 6), y el `tableCode` abre la misma mesa. Para seguir
    la regla: el valor en `.env.usuarios-staging` como `STAGING_MESA_TABLE_CODE`, al lado de `STAGING_MESA_PIN` y
    `STAGING_RESTAURANTE_ID`, y en el doc el nombre de la variable y el link armado:
    `https://mesa.staging.menyu-app.com/check-in?restaurantId=$STAGING_RESTAURANTE_ID&tableCode=$STAGING_MESA_TABLE_CODE`.
    Si se decide publicarlo igual, que el doc lo diga.
  - Es documentación: puede ir en `chore/cierre-auth`, no hace falta que esté en el tag.
- [ ] **Tag creado y deploy terminado.**
  - Versión: **v1.4.0** (el porqué, abajo).
  - Va sobre `main`, no sobre `chore/cierre-auth`: `main` (`94fe19f`, si no entró nada después) es lo que corre
    staging y lo que se verificó el 2026-10-27 (informe §3.7). La rama del cierre trae un cambio de comportamiento en
    web-cliente (Etapa 1) probado solo con tests; va en un release posterior, después de su PR y de pasar por staging.
  - El tag dispara `deploy-production.yml` solo si es `vX.Y.Z` con números (líneas 4-7). El procedimiento es el de
    `Documentacion/WORKFLOW.md`, sección 5:

    ```bash
    git checkout main
    git pull origin main
    git fetch --tags
    git tag --list v1.4.0          # tiene que salir vacío
    git log -1 --format='%H %s'    # el commit que va a llevar el tag
    git tag v1.4.0
    git push origin v1.4.0
    ```

  - En GitHub Actions, el run "Deploy — Production". Terminado es los tres jobs en verde: `check-ci` (las variables, y
    el CI y el E2E del commit en verde; espera hasta 15 min), `deploy-production` (`APP_COMMIT_SHA` con el SHA del tag,
    Railway y los cuatro proyectos de Vercel) y `smoke-production` (espera el SHA en `/health` hasta 8 min y corre el
    smoke).
  - Al terminar, avisarle al orquestador ("listo", con el tag) para la sección 4.

**Por qué v1.4.0.** Desde v1.3.0 entraron la Fase 5 (#438) y su arreglo del E2E de staging (#443), más documentación y
pruebas. La tabla de `WORKFLOW.md` (sección 5) pide MAJOR para "un cambio que rompe compatibilidad", y borrar cinco
endpoints lo es en sentido estricto. Pero la API no tiene consumidores fuera de MenYU, y el único que los llamaba es el
`/auth` de web-cliente de v1.3.0 (`apps/web-cliente/src/services/api.ts:202,206` en ese tag), que este mismo release
reemplaza. Además, el repo ya numeró cada fase de auth como MINOR (v1.1.0 las Fases 3 y 3b; v1.3.0 la 4 y la 4b, que
cambiaron el login entero), y en `CLAUDE.md` "v2.0" es el alcance del producto (recomendaciones, chatbot, pagos
divididos). Tampoco es PATCH: además de borrar, cambia comportamiento (la carga diferida de web-cliente, `/privacidad`,
sin `DELETE /mozos/:id`).

## 4. Verificación posterior al deploy

La corre el orquestador cuando el usuario confirma el tag, salvo 4.6. Contra `https://api.menyu-app.com`, con los
prefijos de `apps/backend/src/main.ts:18`: todo va bajo `/api` salvo `/health`.

```bash
API=https://api.menyu-app.com
TAG=v1.4.0
git fetch origin tag "$TAG"
SHA=$(git rev-parse "$TAG^{commit}")
echo "$SHA"
```

### 4.1 `/health` con el SHA del tag (siempre primero)

```bash
SMOKE_API_URL="$API/api" EXPECTED_SHA="$SHA" node scripts/smoke/esperar-sha.mjs
curl -s -w '\nHTTP %{http_code}\n' "$API/health"
```

**Esperado:** `esperar-sha.mjs` termina con `/health ya muestra <SHA>` (pregunta cada 10 s, hasta 8 min:
`scripts/smoke/lib.mjs:3-4`), y el `curl` da `HTTP 200` con `"status":"ok"`, `"db":"ok"` y `"sha":"<SHA>"`
(`apps/backend/src/health/health.service.ts:38-44`). `version` es la de `apps/backend/package.json` (`0.0.1`), no el tag.

Lo que sigue, solo con 4.1 mostrando el SHA del tag: mientras v1.3.0 siga atendiendo, `POST /api/auth/guest` crea un
cliente invitado en producción.

### 4.2 Los cinco endpoints del login: 404

```bash
for ruta in login register guest refresh logout; do
  echo "POST /api/auth/$ruta -> $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' "$API/api/auth/$ruta")"
done
```

**Esperado:** `404` en los cinco. El cuerpo, si se lo mira: `{"message":"Cannot POST /api/auth/login","error":"Not Found","statusCode":404}`.

### 4.3 `GET /api/auth/me` sin token: 401

```bash
curl -s -w '\nHTTP %{http_code}\n' "$API/api/auth/me"
```

**Esperado:** `HTTP 401` y `{"message":"Token de Supabase requerido","error":"Unauthorized","statusCode":401}`
(`apps/backend/src/auth/guards/supabase-auth.guard.ts:43-45`).

### 4.4 Swagger sin el login (criterio 1 de la Fase 5)

```bash
curl -s "$API/docs-json" | grep -o '"/api/auth/[^"]*"' | sort -u
```

**Esperado:** solo `"/api/auth/invitaciones"` y `"/api/auth/me"`. Swagger está en `/docs` (`main.ts:31`) y su JSON en
`/docs-json`.

### 4.5 El smoke de producción

Lo corre el job `smoke-production` del mismo run (`deploy-production.yml:193-244`): primero
`node scripts/smoke/esperar-sha.mjs` con `EXPECTED_SHA: ${{ github.sha }}` (líneas 232-235) y después
`node scripts/smoke/smoke.mjs` con `WEB_ADMIN_URL`, `WEB_CLIENTE_URL`, `WEB_STAFF_URL` y `WEB_AUTH_URL` de las variables
`PROD_WEB_*_URL` (líneas 238-244). `SMOKE_API_URL` sale de la `VITE_API_URL` de producción de web-cliente en Vercel
(líneas 221-230). Lo primero es mirar ese job. Para volver a correrlo sin desplegar:
`gh workflow run deploy-production.yml --ref v1.4.0` (con *workflow_dispatch* solo corren `check-ci` y el smoke: líneas
8-10, 94 y 197). El equivalente local, con los dominios de producción (`Documentacion/WORKFLOW.md:137`):

```bash
SMOKE_API_URL="$API/api" \
WEB_ADMIN_URL=https://admin.menyu-app.com WEB_CLIENTE_URL=https://mesa.menyu-app.com \
WEB_STAFF_URL=https://staff.menyu-app.com WEB_AUTH_URL=https://auth.menyu-app.com \
node scripts/smoke/smoke.mjs
```

**Esperado:** seis líneas `OK` (`backend /health`, `backend /api/discovery`, `web-admin`, `web-cliente`, `web-staff` y
`web-auth`) y exit 0.

### 4.6 En la base (la corre el usuario, SQL Editor de producción)

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
WHERE migration_name = '20261025120000_fase5_login_legacy';
```

**Esperado:** una fila, con `finished_at` y sin `rolled_back_at`.

```sql
SELECT to_regclass('public.admin')                            AS admin,
       to_regclass('public.admin_restaurante')                AS admin_restaurante,
       to_regclass('public.refresh_token')                    AS refresh_token,
       to_regtype('public.rol_admin')                         AS rol_admin,
       to_regprocedure('public.admin_proteger_ultimo_root()') AS funcion,
       (SELECT count(*) FROM pg_attribute
        WHERE NOT attisdropped
          AND ((attrelid = 'public.mozo'::regclass           AND attname = 'password_hash')
            OR (attrelid = 'public.cliente'::regclass        AND attname = 'password_hash')
            OR (attrelid = 'public.pedido_edicion'::regclass AND attname = 'admin_id'))) AS columnas;
```

**Esperado:** las cinco primeras en `null` y `columnas` en 0.

Para la bitácora (Etapa 5): el resultado de 1.1 a 1.4, la versión, el SHA y el run del deploy, y que el respaldo se
omitió (decisión del 2026-10-28).

## Si algo falla

- **`check-ci` en rojo:** no se desplegó nada. El log dice por qué (el CI o el E2E del commit en rojo, el gate de Sonar,
  una variable o un secret que falta). Corregido, *Re-run failed jobs* en el mismo run; si hizo falta un commit nuevo,
  otro tag (`v1.4.1`).
- **`/health` no muestra el SHA en 8 minutos, o el log de Railway dice `P3009` o `cannot drop … because other objects
  depend on it`:** la migración falló. No crear otro tag ni redesplegar a ciegas. Con 4.6 se ve qué quedó aplicado. Se
  resuelve la causa (lo que habría mostrado 1.3) y se sigue hacia adelante, como el 2026-10-20 (`auth.md:743`): la
  migración se marca como revertida (`prisma migrate resolve --rolled-back 20261025120000_fase5_login_legacy`) solo si
  sus cambios no quedaron aplicados, y se vuelve a correr el deploy. No hay respaldo de esos datos (se omitió, sección
  2): eran de prueba.
- **El smoke en rojo en un frontend:** el backend ya está. Ver el deploy de Vercel de esa app y *Re-run failed jobs*.
