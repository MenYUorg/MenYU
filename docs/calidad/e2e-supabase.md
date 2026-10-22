# Diseño del E2E contra staging (Supabase)

**Solo diseño: no hay nada implementado.** Describe un E2E que recorre el flujo del comensal y del mozo contra **staging** y comprueba en su base (Supabase) que cada paso quedó guardado. No corre contra producción en ningún caso.

Parte de lo que ya existe en el repo:

- **Los e2e del backend:** `apps/backend/src/sessions/sessions.e2e-spec.ts`. Corren en CI contra un Postgres efímero (job `E2E — backend (Postgres efímero)` de `.github/workflows/ci.yml`).
- **La limpieza por marcador:** está en la rama `fix/e2e-limpieza-por-marcador` (PR #420, en borrador y todavía no mergeado al 22/10/2026). Las referencias de la sección 2 son a esa rama, commit `e0ddf05`.
- **El smoke de staging:** `.github/workflows/deploy-staging.yml`, job `smoke-staging`.

Ningún número de este documento es una medición: lo que se mida va en la sección 7, hoy `[PENDIENTE: corrida del dd/mm]`.

---

## 1. Flujo

Siete pasos, en orden. Cada uno verifica dos cosas:
- **La API:** el código HTTP y el cuerpo.
- **La base:** una consulta de solo lectura (sección 4).

Todo pasa en un restaurante de prueba con el marcador de la corrida (sección 2).

| # | Paso | Llamada | Qué verifica la API | Qué verifica la base (solo lectura) |
|---|---|---|---|---|
| 0 | Preparación | Función de preparación en la base (sección 2.2) | — | Hay una mesa del restaurante de prueba con el marcador y estado `libre` |
| 1 | **QR**: abrir la sesión de mesa | `POST /api/sessions/open` con `tableCode` (el QR de la mesa) | 200, `esAnfitrion: true`, `sesionId` y token de sesión | Una `sesion_mesa` `activa` en esa mesa, la mesa `ocupada` y un participante |
| 2 | **Pedido** | `POST /api/pedidos` con el token de sesión, su `sesionId` y su `mesaId` (`apps/backend/src/pedidos/pedidos.service.ts:27-30`) | 201 o 200 con el pedido | Un `pedido` en esa sesión, con sus ítems y el precio cobrado |
| 3 | **Pedido de efectivo** | `POST /api/payments/solicitar-efectivo` con el token de sesión (`apps/backend/src/payments/payments.service.ts:115`) | Estado `efectivo_solicitado` y `pagoId` | Un `pago` `efectivo` `pendiente` por el saldo |
| 4 | **Confirmación del mozo** | `POST /api/payments/confirmar-efectivo` con el token del mozo de prueba (`payments.service.ts:217`) | Estado `cerrada` | El `pago` pasa a `aprobado`, con `fecha_cobro` |
| 5 | **Cierre** | Lo hace el paso 4 cuando el total queda cubierto (`payments.service.ts:239-254`) | — | La `sesion_mesa` `cerrada` con `cerrada_en`, y la mesa vuelve a `libre` |
| 6 | Limpieza | Función de limpieza en la base (sección 2.2) | — | No queda ninguna fila con el marcador |

**Reglas del flujo:**
- **Se entra solo por QR.** El PIN tiene un límite de 10 fallos por restaurante que bloquea 15 minutos (`apps/backend/src/sessions/sessions.service.ts:39`), y un E2E no debería poder bloquear un restaurante.
- **Si un paso falla, los siguientes no corren**, pero la limpieza (paso 6) corre siempre.

**Cómo se comprueba la persistencia:** después de cada paso, el job consulta la base de staging con un usuario que solo puede leer (sección 4). Busca siempre por los ids que devolvió la API y por el marcador, nunca por "la última fila". Así no lee datos de otra corrida ni de un usuario real.

## 2. Datos

### 2.1 Marcador

- **Formato:** cada corrida tiene un marcador propio, `e2e-<GITHUB_RUN_ID>-<GITHUB_RUN_ATTEMPT>-`, el mismo que usan los e2e del backend en la rama del PR #420 (`apps/backend/src/sessions/sessions.e2e-spec.ts:18-20`).
- **Dónde va:** en el slug de la marca, en el `qr_token` de la mesa y en el email de cualquier cliente que se cree a mano.
- **Ligado a la corrida:** el resto (sesión, pedido, pago) cuelga de esa mesa, así que queda ligado al marcador por las claves foráneas.

### 2.2 Qué se crea y cómo se limpia

**Lo fijo.** Una marca y un restaurante de prueba de staging, con un plato y un mozo. Se crean una sola vez desde la consola de ROOT y el panel del OWNER, y no se borran: la consola de ROOT no borra marcas, solo las da de baja (`apps/backend/src/root/marcas/root-marcas.controller.ts:69`). El slug de la marca empieza con `e2e-staging-`.

**Lo de cada corrida:**
- **Lo crea la preparación:** una mesa con el marcador en el `qr_token`.
- **Lo crea el flujo:** la sesión, su participante (el cliente invitado que crea `POST /sessions/open`), el pedido con sus ítems y el pago.

**La limpieza** va en una **función de la base**, `e2e_limpiar(marcador)`, no en el código del job. Borra, en orden de claves foráneas, solo lo que cuelga de las mesas con ese marcador:

- ítems y pedidos;
- pagos y llamados al mozo;
- comensales y asignaciones;
- participantes y la sesión;
- los clientes que no aparecen en nada más;
- la mesa.

La preparación también va en una función de la base, `e2e_preparar(marcador)`, que crea la mesa y devuelve su QR. Las dos funciones son `SECURITY DEFINER`: el usuario del job solo puede ejecutarlas (sección 4), no escribir en las tablas.

### 2.3 Cómo se parece a `clearE2eData`

El criterio es el de `clearE2eData` en la rama del PR #420:

- **Empieza por las marcas con el marcador:** `sessions.e2e-spec.ts:38-50`.
- **Junta los clientes de esas sesiones y los que llevan el marcador en el email:** `:52-68`.
- **Borra en orden de claves foráneas:** `:70-84`.
- **Un cliente se borra solo si ya no aparece en sesiones, participantes, ítems de pedido ni comensales:** `:73-80`.

En la misma rama, `apps/backend/jest.e2e.config.js:14-38` no deja correr los e2e del backend si `DATABASE_URL` o `DIRECT_URL` no son locales (o el service container del CI). No hay excepción.

**Diferencias con el E2E de staging:**
- **Pedidos y pagos:** el E2E de staging los crea; los e2e del backend no. Por eso su limpieza tiene que incluirlos (sección 2.2).
- **No usa Jest ni `clearE2eData`:** el E2E de staging es un job aparte que habla con la API y lee la base. Los e2e del backend siguen corriendo solo contra un Postgres local o el del CI.

### 2.4 Qué garantiza que no toca datos reales

1. **Restaurante propio.** El flujo solo opera sobre el restaurante de prueba. Ningún paso recibe el id de otro restaurante, y la mesa la crea la preparación.
2. **La base se filtra por marcador.** La limpieza parte de las mesas con el marcador y sigue las claves foráneas. Nunca selecciona por columnas vacías (como `email IS NULL`), ni por fecha, ni por "lo último".
3. **El job no puede escribir.** Su usuario de base no tiene `INSERT`, `UPDATE` ni `DELETE` en las tablas: solo `SELECT` sobre las que lee y `EXECUTE` sobre las dos funciones.
4. **Las funciones validan el marcador.** Rechazan cualquier valor que no empiece con `e2e-` seguido de un id de corrida, y solo actúan sobre el restaurante de prueba.
5. **Producción nunca entra.** La URL de la API sale de la `VITE_API_URL` de **preview** de web-cliente, como el smoke de staging. Las credenciales de la base son de un usuario que solo existe en el proyecto de Supabase de staging.

## 3. Cuándo corre

**Después de un `Deploy — Staging` en verde, y solo cuando el smoke ya confirmó el SHA** (`deploy-staging.yml:167`, `scripts/smoke/esperar-sha.mjs`).

### 3.1 Workflow aparte (recomendado) o job dentro de `deploy-staging.yml`

| | Workflow aparte, `e2e-staging.yml` | Job `e2e-staging` en `deploy-staging.yml` |
|---|---|---|
| Disparo | `workflow_run` de "Deploy — Staging" con `conclusion == success`, más `workflow_dispatch` para correrlo a mano | `needs: smoke-staging` (el smoke es `deploy-staging.yml:138-140`) |
| Si el E2E falla | El deploy queda verde; el E2E queda rojo aparte | El deploy queda rojo aunque el deploy haya andado |
| Volver a correrlo | Solo el E2E | Hay que re-ejecutar el job dentro del deploy |
| SHA probado | Hay que volver a comprobarlo: `/health` tiene que mostrar el `head_sha` del run que lo disparó | Es el mismo run |

**Recomendado: el workflow aparte.**
- **No mezcla fallas:** una falla del producto no marca como fallido un deploy que anduvo.
- **No se dispara solo:** se puede correr a mano.
- **Antes del flujo:** el primer paso vuelve a esperar el SHA con `scripts/smoke/esperar-sha.mjs`.

### 3.2 Si Railway responde 502

**Reintentos acotados, solo en lo que se puede repetir sin efectos:**
- **Lecturas** (`GET /health`, las consultas de solo lectura): hasta 3 intentos, con 10, 20 y 40 segundos de espera.
- **Escrituras** (`POST`): **no se reintentan a ciegas.** Antes de repetirlas, el job consulta la base: si el efecto ya está (por ejemplo, la sesión ya existe), sigue desde ahí; si no está, reintenta una vez.

**Reporte que separa infraestructura de producto.** Cada paso termina con una de tres categorías:

| Categoría | Cuándo | Qué significa |
|---|---|---|
| `ok` | El paso pasó | — |
| `infraestructura` | 502, 503 o 504; error de red; timeout; `/health` con `status: "degraded"` (`apps/backend/src/health/health.service.ts:39`); o el SHA que no llega | Staging o Railway no estaban disponibles. No es un defecto del producto |
| `producto` | Respuesta 2xx con datos que no coinciden; 4xx inesperado; o la base sin la fila esperada | Posible defecto del producto: hay que revisarlo |

El job termina en rojo en los dos casos de falla, y el título del resumen dice la categoría. Una corrida `infraestructura` se puede re-ejecutar; una `producto`, no se re-ejecuta hasta revisarla.

## 4. Secrets, variables y usuario de base

**Secrets que ya existen** (para resolver la URL de la API, como el smoke): `VERCEL_TOKEN`, `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID_CLIENTE`.

**Secrets nuevos** (solo nombres):

| Secret | Para qué |
|---|---|
| `E2E_STAGING_DB_URL_LECTURA` | Conexión a la base de staging con el usuario `e2e_staging` |
| `E2E_STAGING_MOZO_EMAIL` | Mozo del restaurante de prueba, para confirmar el efectivo |
| `E2E_STAGING_MOZO_PASSWORD` | Ídem |

**Variables del repo** (no son secretas): `E2E_STAGING_RESTAURANTE_ID` y `E2E_STAGING_ITEM_ID`, el restaurante y el plato de prueba.

**Usuario de base `e2e_staging`**, solo en el proyecto de Supabase de staging:
- **Lectura:** `SELECT` sobre `mesa`, `sesion_mesa`, `sesion_mesa_cliente`, `pedido`, `pedido_item`, `pago` y `cliente`.
- **Ejecución:** `EXECUTE` sobre `e2e_preparar(text)` y `e2e_limpiar(text)`.
- **Nada más:** sin `INSERT`, `UPDATE` ni `DELETE` en ninguna tabla, sin `BYPASSRLS` y sin acceso a `usuario` ni a `membresia` (las que tienen RLS, según `CLAUDE.md`).
- **Quién crea qué:** las funciones las crea un administrador del proyecto, que es su dueño. Este diseño no incluye su SQL.

**Riesgo con la Fase 4 de auth:** el login del mozo usa hoy el JWT propio. Cuando se migre a Supabase Auth (PR #416, abierto), el paso 4 tiene que pedir el token por el login nuevo y estos secrets cambian.

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| **R4: datos reales en staging.** Staging tiene datos que no son de prueba y el E2E podría leerlos, cambiarlos o borrarlos | Restaurante propio (sección 2.4, punto 1), filtro por marcador (punto 2), un usuario sin escritura (punto 3) y funciones que validan el marcador y el restaurante (punto 4) |
| Una corrida cortada a la mitad deja filas | La limpieza corre siempre (`if: always()`). Si igual queda algo, la próxima corrida no lo toca, porque tiene otro marcador; se borra a mano con `e2e_limpiar` y el marcador viejo |
| Dos corridas en paralelo | `concurrency` del workflow: una a la vez. Igual, cada una tiene su marcador y su mesa |
| Bloquear el ingreso por PIN del restaurante | El flujo entra solo por QR (sección 1) |
| Correr contra producción por error | La URL sale de preview; las credenciales de base solo existen en staging; y el job verifica que el host de la API no sea uno de producción, con la misma lista que `scripts/carga/guardas.mjs` (PR #421, en borrador) |
| Falsos rojos por Railway | Reintentos acotados y la categoría `infraestructura` (sección 3.2) |
| Las credenciales del mozo en un log | No se imprimen. Los secrets de GitHub se enmascaran, y el reporte no incluye tokens, URLs ni la conexión a la base |

## 6. Qué se mide y cómo se reporta

**Por corrida**, en un JSON que el workflow sube como artifact `e2e-staging-<run_id>`:

- el SHA probado y el marcador;
- la categoría final (`ok`, `infraestructura` o `producto`);
- **por paso:** nombre, categoría, código HTTP, duración de la llamada a la API, si la consulta a la base encontró lo esperado y cuántos reintentos hubo;
- la duración total;
- cuántas filas creó la corrida y cuántas borró la limpieza (tienen que coincidir).

El resumen de GitHub Actions (`$GITHUB_STEP_SUMMARY`) muestra la misma tabla por paso. **Ningún archivo incluye tokens, la URL de la API ni la conexión a la base.**

## 7. Resultados

| Corrida | SHA | Categoría | Duración | Filas creadas y borradas | Artifact |
|---|---|---|---|---|---|
| Primera | `[PENDIENTE: corrida del dd/mm]` | `[PENDIENTE]` | `[PENDIENTE]` | `[PENDIENTE]` | `[PENDIENTE]` |

## 8. Antes de implementar

- [ ] Decidir entre el workflow aparte y el job dentro de `deploy-staging.yml` (sección 3.1).
- [ ] Crear el restaurante, el plato y el mozo de prueba en staging (sección 2.2).
- [ ] Crear el usuario `e2e_staging` y las dos funciones en el Supabase de staging (sección 4).
- [ ] Cargar los secrets y las variables (sección 4).
- [ ] Mergear el PR #420 (la limpieza por marcador de los e2e del backend), del que este diseño toma el criterio.
