# E2E contra staging (Supabase)

**Implementado** (PR #433). Un E2E que recorre el flujo del comensal y del mozo contra **staging** y comprueba en su base (Supabase) que cada paso quedó guardado, con un usuario de base propio. Corre en cada deploy a staging, después del smoke. No corre contra producción en ningún caso.

| Pieza | Dónde |
|---|---|
| El usuario de base y las dos funciones (SQL, a mano) | `scripts/e2e-staging/sql/e2e-staging.sql` |
| El flujo | `scripts/e2e-staging/flujo.mjs` |
| Funciones puras (marcador, guardas, categorías, reintentos, reporte) | `scripts/e2e-staging/lib.mjs` |
| La entrada (variables, guardas, conexión, reporte) | `scripts/e2e-staging/main.mjs` |
| Tests (`node --test 'scripts/e2e-staging/*.test.mjs'`, en el paso "Test — smoke scripts" de `ci.yml`) | `scripts/e2e-staging/lib.test.mjs`, `flujo.test.mjs` |
| El workflow (reutilizable y a mano) | `.github/workflows/e2e-staging.yml` |
| El enganche en cada deploy | `.github/workflows/deploy-staging.yml`, job `e2e-staging` |

Lo que ya había y no cambia:
- **Los e2e del backend** (`apps/backend/src/sessions/sessions.e2e-spec.ts`): corren en CI contra un Postgres efímero y, desde el PR #420, no corren contra una base remota (`apps/backend/jest.e2e.config.js`).
- **El smoke de staging**: `deploy-staging.yml`, job `smoke-staging`.

---

## 1. Flujo

Siete pasos, en orden (`flujo.mjs`). Cada uno verifica dos cosas:
- **La API:** el código HTTP y el cuerpo.
- **La base:** una consulta de solo lectura con `e2e_staging`, por los ids que devolvió la API, nunca por "la última fila".

| # | Paso | Llamada | Qué verifica la API | Qué verifica la base |
|---|---|---|---|---|
| 0 | Preparación | `GET /health` y `e2e.e2e_preparar(marcador, restaurante)` | 200, sin `degraded` y, en un deploy, el SHA desplegado | La mesa nueva, `libre`, en el restaurante de prueba y con su QR |
| 1 | **QR**: abrir la sesión | `POST /api/sessions/open` con `tableCode` y `restauranteId`, sin token | 200, `esAnfitrion: true`, `sesionId`, `jwt` y la mesa de la corrida | `sesion_mesa` `activa` en esa mesa, la mesa `ocupada` y un único participante |
| 2 | **Pedido** | `POST /api/pedidos` con el token de sesión, `sesionId`, `mesaId` y el plato de prueba | 200 o 201 con el id del pedido | El `pedido` en esa sesión y mesa, con el ítem de prueba, cantidad 1 y su precio |
| 3 | **Pedido de efectivo** | `POST /api/payments/solicitar-efectivo` con el token de sesión | `efectivo_solicitado` y `pagoId` | El `pago` `efectivo` `pendiente` en esa sesión, por el total del pedido |
| 4 | **El mozo confirma** | Login del mozo en Supabase (`/auth/v1/token?grant_type=password`) y `POST /api/payments/confirmar-efectivo` con su token | Estado `cerrada` | El `pago` `aprobado`, con `fecha_cobro` |
| 5 | **Cierre** | Lo hace el paso 4 cuando el total queda cubierto (`payments.service.ts`, `confirmarEfectivo`) | — | La `sesion_mesa` `cerrada` con `cerrada_en`, y la mesa de nuevo `libre` |
| 6 | Limpieza | `e2e.e2e_limpiar(marcador)` | — | Que borró lo mismo que creó la corrida y que no queda ninguna fila con los ids de la corrida |

**Reglas del flujo:**
- **Se entra solo por QR.** El PIN tiene un límite de fallos por restaurante que lo bloquea (`apps/backend/src/sessions/sessions.service.ts`, `LIMITE_PIN`), y un E2E no debería poder bloquear un restaurante.
- **Si un paso falla, los siguientes no corren**, pero la limpieza (paso 6) corre siempre que se haya creado la mesa.
- **El mozo es MOZO, no OWNER ni GERENTE:** cobra con su propio `Mozo` (`apps/backend/src/common/atribucion-del-cobro.ts`), así que el paso 4 también prueba que el cobro quede a su nombre.

## 2. Datos

### 2.1 Marcador

- **Formato:** `e2e-<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>-` en Actions, como los e2e del backend (`sessions.e2e-spec.ts:18-20`), o `e2e-local-<8 hex>-` fuera de Actions (`lib.mjs`, `marcadorDeCorrida`).
- **Dónde va:** en el `qr_token` de la mesa (marcador + `mesa`) y en su `numero`.
- **Ligado a la corrida:** el resto (sesión, participante, pedido, pago, llamado, cliente invitado) lo crea la API y cuelga de esa mesa por las claves foráneas.

### 2.2 Datos fijos de staging

Se crearon una vez, el 24/10/2026, por la API (consola de ROOT y cuenta OWNER). No se borran: la consola de ROOT no borra marcas, solo las da de baja, y todo lo de ROOT queda en su historial.

| Dato | Valor |
|---|---|
| Marca | "E2E Staging", slug `e2e-staging-menyu` |
| Restaurante | "Restaurante E2E", activo, modo de sesión abierto: es `E2E_STAGING_RESTAURANTE_ID` |
| Plato | "Plato E2E", $1.000, categoría "E2E": es `E2E_STAGING_ITEM_ID` |
| Cuentas de Supabase Auth (creadas a mano, con *Auto Confirm*) | `root-e2e.pruebas-auth@menyu-app.com` (ROOT, `usuario.es_root` por SQL), `owner-e2e.pruebas-auth@menyu-app.com` (OWNER de la marca) y `mozo-e2e.pruebas-auth@menyu-app.com` (MOZO del restaurante, con su `Mozo`) |

El restaurante aparece en el Discovery público de staging.

### 2.3 Las funciones (`scripts/e2e-staging/sql/e2e-staging.sql`)

En PL/pgSQL, en un schema propio, `e2e`, y no en `public`: Supabase da `EXECUTE` por defecto a `anon` y `authenticated` sobre lo que se crea en `public`. Las dos son `SECURITY DEFINER` con `search_path` fijo, y validan el marcador con el mismo formato que `lib.mjs`.

- **`e2e.e2e_preparar(marcador text, restaurante_id text)`:** crea **una** fila en `mesa` (QR = marcador + `mesa`, PIN libre al azar, `libre`) y devuelve `id_mesa` y `qr`. Rechaza un restaurante que no sea de una marca activa con slug `e2e-staging-…`, que esté dado de baja o en modo seguro, y una mesa que ya exista con ese marcador. No modifica ni borra nada.
- **`e2e.e2e_limpiar(marcador text)`:** busca la mesa con ese QR exacto en un restaurante `e2e-staging-…` y borra solo lo que cuelga de ella, en orden de claves foráneas, cada `DELETE` con un `WHERE` acotado a los ids de esa mesa:
  - `item_comensal`, `pedido_item_mod`, `pedido_edicion_item`, `pedido_edicion`, `pedido_item` y `pedido`;
  - `pago`, `llamado_mozo` y `asignacion_mesa`;
  - `comensal`, `sesion_mesa_cliente` y `sesion_mesa`;
  - `mozo_mesa`;
  - los clientes invitados de esas sesiones (sin email, contraseña ni cuenta de Supabase) que ya no aparecen en nada más;
  - la mesa.

  Devuelve cuántas filas borró de cada tabla. Si al final queda algo de la corrida, falla y no borra nada. Si no encuentra la mesa, no borra nada. Un cliente con cuenta que haya entrado a la mesa no se borra.

El SQL lo corre a mano un administrador del proyecto en el SQL Editor del Supabase de **staging**, que queda como dueño de las funciones. No es una migración de Prisma: no tiene que llegar a producción. Se probó antes contra un Postgres 17.6 local con las 35 migraciones (aislamiento entre dos corridas, datos reales intactos, todo o nada).

### 2.4 Qué garantiza que no toca datos reales

1. **Restaurante propio.** `e2e_preparar` solo crea mesas en un restaurante de marca `e2e-staging-…`, y `e2e_limpiar` solo borra lo que cuelga de una mesa con el QR exacto de la corrida en ese tipo de restaurante.
2. **Nada se selecciona por columnas vacías, por fecha ni por "lo último".** Los candidatos salen siempre de la mesa de la corrida.
3. **El usuario del job no puede escribir** (sección 4): sus únicas escrituras son las de las dos funciones.
4. **Las funciones validan el marcador** y el restaurante.
5. **Producción nunca entra** (`lib.mjs`, `erroresDeDestino`, antes de conectarse a nada):
   - la API tiene que ser https y no estar en la lista de hosts de producción de `scripts/carga/guardas.mjs` ni en las `PROD_WEB_*`;
   - el Supabase de staging tiene que ser distinto del de producción, que se lee del entorno Production de web-staff en Vercel solo para comparar;
   - la base tiene que ser con el usuario `e2e_staging` y, si la URL nombra un proyecto, el mismo que el Supabase de staging. Al conectarse, además, comprueba que `current_user` sea `e2e_staging`.

## 3. Cuándo corre

**En cada deploy a staging, como job `e2e-staging` de `deploy-staging.yml`, con `needs: smoke-staging`:** el smoke ya esperó que `/health` muestre el SHA del deploy (`scripts/smoke/esperar-sha.mjs`). El job llama al workflow reutilizable `e2e-staging.yml` con el SHA del deploy; si `/health` muestra otro, la corrida termina en `infraestructura`.

**A mano:** `workflow_dispatch` de `e2e-staging.yml`. Sin SHA esperado, el reporte guarda el que muestra `/health`. Es la forma de probar un cambio que solo toca el E2E: esos archivos (`scripts/e2e-staging/**`, `.github/workflows/e2e-staging.yml`) no disparan un deploy (`paths-ignore` de `deploy-staging.yml`).

**Se eligió el job dentro del deploy** (y no el workflow aparte con `workflow_run` que recomendaba este diseño) para que corra en cada deploy sin depender de otro disparo. La consecuencia es la de la tabla original: **si el E2E falla, el deploy queda en rojo aunque el deploy haya andado**; el reporte dice si fue infraestructura o producto. Una corrida a la vez (`concurrency: e2e-staging`, a nivel de job).

### 3.1 Si Railway responde 502

**Reintentos acotados, solo en lo que se puede repetir sin efectos** (`lib.mjs`, `conReintentos`; `flujo.mjs`, `escribir`):
- **Lecturas** (`GET /health`, las consultas a la base): hasta 3 reintentos por infraestructura, con 10, 20 y 40 segundos. Un dato que no es el esperado no se reintenta: la base ya respondió.
- **Escrituras** (`POST`): **no se reintentan a ciegas.** Si fallan por infraestructura, el job espera 10 s y mira en la base si el efecto ya está: si está (el pedido, el pago pendiente, el pago aprobado), sigue desde ahí; si no, reintenta una vez. La apertura de la sesión es la excepción: si se abrió pero la respuesta no llegó, no hay token de sesión y la corrida termina en `infraestructura`.

**Categorías** (`lib.mjs`, `CATEGORIAS`):

| Categoría | Cuándo | Qué significa |
|---|---|---|
| `ok` | El paso pasó | — |
| `infraestructura` | 502, 503 o 504; error de red; timeout; `/health` `degraded` (`apps/backend/src/health/health.service.ts`); el SHA que no llega; la base que no conecta | Staging, Railway o Supabase no estaban disponibles. Se puede re-ejecutar |
| `producto` | Respuesta 2xx con datos que no coinciden; 4xx inesperado; la base sin la fila esperada; la limpieza que no borró lo que creó | Posible defecto del producto. No se re-ejecuta hasta revisarlo |
| `configuracion` | Faltan variables, una guarda contra producción cortó, la conexión a la base no es `e2e_staging` o Supabase rechazó el login del mozo | El job está mal configurado. No es ni infraestructura ni producto |

El job termina en rojo en cualquier categoría que no sea `ok`, y el título del resumen la dice.

## 4. Secrets, variables y usuario de base

**Se leen de Vercel** (con los secrets que ya existen, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_CLIENTE` y `VERCEL_PROJECT_ID_STAFF`):
- La URL de la API: la `VITE_API_URL` de preview de web-cliente, como el smoke.
- La URL de Supabase de **producción**: la `VITE_SUPABASE_URL` del entorno Production de web-staff, solo para la guarda.

**Secrets** (en GitHub):

| Secret | Para qué |
|---|---|
| `E2E_STAGING_DB_URL_LECTURA` | Conexión a la base de staging con el usuario `e2e_staging` (por el pooler de Supabase) |
| `E2E_STAGING_MOZO_EMAIL` | `mozo-e2e.pruebas-auth@menyu-app.com`, para el paso 4 |
| `E2E_STAGING_MOZO_PASSWORD` | Su contraseña |
| `E2E_STAGING_DB_CA` (opcional, no cargado) | El certificado de Supabase: con él, la conexión verifica el servidor. Sin él, va cifrada sin verificar el certificado |

**Variables del repo** (no son secretas):

| Variable | Para qué |
|---|---|
| `E2E_STAGING_RESTAURANTE_ID` | El restaurante de prueba |
| `E2E_STAGING_ITEM_ID` | El plato de prueba |
| `E2E_SUPABASE_URL` | La URL del Supabase de staging, para el login del mozo |
| `E2E_SUPABASE_PUBLISHABLE_KEY` | Su clave pública (publishable), que ya está en los bundles de web-auth y web-staff |

La URL y la clave de Supabase son variables del repo y no se leen de Vercel: en la primera corrida, las del Preview de web-staff dieron **401** en el login del mozo (run `40131089925`, sección 7).

**Usuario de base `e2e_staging`**, solo en el proyecto de Supabase de staging. **No es "solo lectura": lee y ejecuta las dos funciones.**

| Permiso | Sobre qué |
|---|---|
| `LOGIN`, nada más (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`), `CONNECTION LIMIT 3`, `statement_timeout = 15s` | El rol |
| `USAGE` | Los schemas `public` y `e2e` |
| `SELECT` (tabla completa) | `mesa`, `sesion_mesa`, `sesion_mesa_cliente`, `pedido`, `pedido_item` y `pago` |
| `SELECT` (solo columnas) | `cliente`: `id`, `nombre` y `created_at`. No el email, el teléfono, el `password_hash` ni el `supabase_user_id` de los clientes reales |
| `EXECUTE` | `e2e.e2e_preparar(text, text)` y `e2e.e2e_limpiar(text)` |
| **Ninguno** | `INSERT`, `UPDATE` o `DELETE` en cualquier tabla; cualquier otra tabla (`usuario`, `membresia`, `restaurante`, `mozo`…); `CREATE` en cualquier schema |

A `PUBLIC`, `anon`, `authenticated` y `service_role` se les saca `EXECUTE` sobre las dos funciones. Las verificaciones del archivo (sección 7: permisos por tabla, columnas de `cliente`, quién ejecuta las funciones y RLS) dieron lo esperado en staging el 24/10/2026.

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| **R4: datos reales en staging.** Staging tiene datos que no son de prueba | Restaurante propio, mesa por corrida, filtro por marcador exacto, un usuario sin escritura y funciones que validan el marcador y el restaurante (sección 2.4) |
| Una corrida cortada a la mitad deja filas | La limpieza corre siempre que se creó la mesa. Si igual queda algo (por ejemplo, si se cancela el job), la próxima corrida no lo toca porque tiene otro marcador; se borra a mano con `SELECT e2e.e2e_limpiar('<marcador>')` |
| Dos corridas en paralelo | `concurrency: e2e-staging`. Igual, cada una tiene su marcador y su mesa |
| Bloquear el ingreso por PIN del restaurante | El flujo entra solo por QR |
| Correr contra producción por error | Las guardas de la sección 2.4, punto 5 |
| Falsos rojos por Railway | Reintentos acotados y la categoría `infraestructura` |
| El deploy en rojo por una falla del E2E | Es la consecuencia elegida (sección 3); el reporte separa infraestructura de producto |
| Las credenciales en un log | No se imprimen: los secrets se enmascaran (la clave pública no es secreta y tampoco se imprime), y el reporte no lleva tokens, URLs ni la conexión a la base (lo cubre un test de `flujo.test.mjs`) |
| Cambian el login o los permisos del mozo | El paso 4 falla en `configuracion` (login) o en `producto` (403 del cobro) y lo dice |

## 6. Qué se mide y cómo se reporta

**Por corrida**, en `resultados/e2e-staging.json`, que el workflow sube como artifact `e2e-staging-<run_id>` (30 días):

- el SHA probado (el de `/health`) y el esperado, y el marcador;
- la categoría final;
- **por paso:** nombre, categoría, código HTTP, duración de la llamada a la API, si la base tuvo lo esperado, cuántos reintentos hubo y el detalle de la falla;
- la duración total;
- las filas que creó la corrida (contadas con `e2e_staging` antes de borrar) y las que borró `e2e_limpiar`, y si quedó alguna.

El resumen del run (`$GITHUB_STEP_SUMMARY`) muestra la misma tabla por paso. **Ningún archivo incluye tokens, la URL de la API ni la conexión a la base.**

## 7. Resultados

| Corrida | Run | SHA en staging | Categoría | Duración | Filas creadas y borradas | Artifact |
|---|---|---|---|---|---|---|
| Primera, a mano (24/10/2026 17:43 ART) | `40131089925` | `75fc4eb` | `configuracion`: pasos 0 a 3 ok; el login del mozo en Supabase respondió 401 con la clave del Preview de web-staff | 1,9 s | Coinciden (mesa, sesión, participante, pedido, ítem y pago, 1 cada uno; más el llamado y el cliente invitado). No quedó nada | `e2e-staging-40131089925` |
| Segunda, a mano (24/10/2026 17:59 ART), con la URL y la clave como variables del repo | `40132210229` | `75fc4eb` | **`ok`**: los 7 pasos, sin reintentos | 2,7 s | Coinciden, igual que la anterior. No quedó nada | `e2e-staging-40132210229` |

Las dos se dispararon con un push temporal a la rama `e2e-staging-prueba`, que se sacó del workflow antes del merge.

## 8. Antes de implementar (hecho)

- [x] Decidir dónde engancha: job dentro de `deploy-staging.yml`, después del smoke (sección 3).
- [x] Crear el restaurante, el plato y el mozo de prueba en staging (sección 2.2).
- [x] Crear el usuario `e2e_staging` y las dos funciones en el Supabase de staging (sección 4).
- [x] Cargar los secrets y las variables (sección 4).
- [x] Mergear el PR #420 (mergeado el 22/10/2026).
