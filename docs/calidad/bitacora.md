# Bitácora: SonarCloud en el CI (TP de Calidad de Software, Nivel 3)

Registro de lo que se hizo para poner SonarCloud en el CI de MenYU y tomar la línea base, y del bloque siguiente (`/health` con SHA y smoke post-deploy en staging, SCRUM-34, 35, 22 y 36), en orden y con las decisiones. Sirve para retomar el trabajo con el contexto completo. Los números de la línea base están en [`linea-base.md`](linea-base.md).

## Estado actual

| Tema | Estado |
|---|---|
| Organización y proyecto en SonarCloud | Hechos: org `menyuorg`, proyecto `MenYUorg_MenYU` (público) |
| Automatic Analysis | Apagado (Administration → Analysis Method) |
| Secreto `SONAR_TOKEN` | Cargado en el repo (17/10/2026) |
| Análisis en el CI (PR #371) | Mergeado |
| Línea base (PR #372) | Mergeada: `docs/calidad/linea-base.md`, análisis de `3a7e23d` |
| Quality gate en el CI (PR #373) | Mergeado (17/10/2026, merge `c643559`) |
| Condiciones del gate | Las 6 confirmadas en el PR #374. Cobertura 30 % y duplicación 10 % sobre código nuevo, **provisorias**: se suben el 23/10/2026 |
| Definición de código nuevo de `main` | **Pendiente**: hoy es "Previous version" |
| `/health` con SHA (PR #374) | Mergeado (17/10/2026, merge `90bbb81`). Staging muestra ese SHA |
| Smoke post-deploy en staging (PR #375) | Mergeado (17/10/2026, merge `beb2d18`). Primer run (`39032870161`): smoke en verde |
| CI en verde y smoke en producción (PR #377) | Mergeado (17/10/2026, merge `8dc7c72`). Staging posterior al merge en verde (run `39036386891`). Falta el tag de ensayo |
| e2e del backend con Postgres efímero y `check-ci` que los exige (PR #408, SCRUM-37) | **Mergeado** (21/10/2026 19:32:48 UTC, merge `3dab479`). Postgres de Supabase confirmado en 17 (proyecto de `.env.qa`). Falta sumar el check al ruleset |
| Limpieza de los e2e por marcador de corrida (PR #420) | **Borrador** (21/10/2026), rojo `39704886533` y verde `39705620870`. Sin salvedad de base remota desde `e0ddf05` (22/10/2026, verde `39784392541`) |
| Pruebas de carga con k6 (PR #421) | **Borrador** (22/10/2026), CI en verde (`39709392785`). Sin corridas contra staging |
| Diseño del E2E contra staging (PR #422) | **Borrador** (22/10/2026), solo documento |

## Pendientes

1. **Cambiar el código nuevo de `main`** en SonarCloud (Administration → New Code) a "Number of days" o "Reference branch". Hoy la referencia queda fija en el análisis automático del 17/10 (`7072d67`), que tuvo otro alcance y no tuvo cobertura, y como no se manda `projectVersion` nunca avanza. Después del cambio, verificar por API en el próximo análisis de `main` (`api/qualitygates/project_status?projectKey=MenYUorg_MenYU&branch=main`, campo `periods`).
2. **Subir los umbrales del gate el 23/10/2026.**
3. **Confirmar la Deployment Protection de las previews de Vercel** (queda a cargo del equipo). En el run `39032870161` los tres frontends respondieron 200, así que hoy no hay protección que bloquee el smoke.
4. **Producción:** #377 mergeado y variables `PROD_WEB_*_URL` cargadas (17/10/2026). Falta el tag de ensayo y anotar su resultado (`check-ci`, deploy, smoke y el SHA de `/health` de producción). Con el #408, `check-ci` exige también el check del e2e: el tag tiene que ser sobre un commit que lo tenga. **`v1.0.6`, `v1.0.7` y `v1.1.0` ya existen** (21/10): el ensayo necesita otro número.
5. Opcionales que salieron en el camino:
   - Fijar la versión de `@railway/cli` en los workflows: hecho en el PR #396 (`@5.70.0`), mergeado el 19/10 (`a4c4c53`). El deploy de staging `39311475958` ya lo usó.
   - Revisar en Railway (Settings → Healthcheck Path) si el servicio tiene healthcheck en `/health`. No cambia nada hoy, porque `/health` responde siempre 200.
   - Vulnerabilidades S2245 (`Math.random`): la del PIN de mesa se corrige en el PR #379. Las demás quedan registradas en Jira.
   - `verify-carrito.js` y `verify-carrito.mjs` (raíz del repo, público) tienen un JWT de desarrollo hardcodeado. Se decodificó: solo trae UUIDs de comensal, sesión, mesa y restaurante, sin datos personales, apunta a `localhost` y venció el 26/05/2026.

## Qué se hizo

### 16/10/2026: preparación

- `main` local ya estaba al día con `origin/main` (`7072d67`).
- El repo es **público**: SonarCloud es gratis y sin tope de líneas, el dashboard y la API se leen sin token. Los PRs que vengan de forks no reciben `SONAR_TOKEN`, pero el equipo trabaja con ramas del mismo repo.

### 16 y 17/10/2026: SonarCloud (pasos en la web)

- Se importó la organización `MenYUorg` (GitHub App de SonarQube Cloud) y se creó el proyecto `MenYUorg_MenYU`. La org key es `menyuorg` y la project key es `MenYUorg_MenYU`.
- Al importar, SonarCloud corrió un **análisis automático** sobre `7072d67` (17/10 00:10 UTC). No sirve como línea base: no tiene cobertura y usa otro alcance.
- Se apagó el Automatic Analysis. Se confirmó en el primer run del CI: si siguiera activo, el scanner falla.
- Se generó el token y se cargó como secreto con `gh secret set SONAR_TOKEN`. El token nunca pasó por el chat ni por archivos.

### PR #371 (`ci/sonarcloud`): análisis en el CI

- `sonar-project.properties`: saca `sonar.host.url=localhost` y agrega `sonar.organization` y `sonar.projectKey`.
- `sonar.sources` es el `src/` de las 4 apps. **`packages/` queda fuera de alcance** (unas 1.350 líneas, sin tests ni `lcov`).
- `sonar.tests` y `sonar.test.inclusions`: `*.spec`, `*.test`, `*.e2e-spec` y los helpers de `src/test/`.
- `ci.yml`: corre en `pull_request` y en `push` a `main`, checkout con `fetch-depth: 0`, paso de SonarCloud después de cobertura con `SonarSource/sonarqube-scan-action` **v8.3.0 fijada por SHA** (`d209202bc7d53ff1cc128f7f907dac145c9d6ae9`).
- Las rutas `SF:` de los 4 `lcov.info` son relativas a la raíz del monorepo (Jest y Vitest usan `projectRoot`) y resuelven sin prefijo. En Windows salen con `\`, pero el CI corre en Linux.

**Exclusiones y su justificación**

| Patrón | Dónde | Por qué |
|---|---|---|
| `*.spec.ts(x)`, `*.test.ts(x)`, `*.e2e-spec.ts` | `sonar.exclusions` | Son tests: se analizan como tests, no como código de producción |
| `**/src/test/**` | `sonar.exclusions` | Helpers, fixtures y setup de Vitest |
| `**/*.d.ts` | `sonar.exclusions` | Solo declaran tipos |
| `**/node_modules/**` | `sonar.exclusions` | Dependencias. Incluye el Prisma Client generado (`node_modules/.prisma`) |
| `**/dist/**`, `**/coverage/**` | `sonar.exclusions` | Salida del build y reportes de cobertura |
| `**/*.module.ts` | `sonar.coverage.exclusions` | Módulos de NestJS: solo conectan providers |
| `**/main.ts`, `**/main.tsx` | `sonar.coverage.exclusions` | Puntos de entrada |
| `**/*.dto.ts` | `sonar.coverage.exclusions` | DTOs: datos con decoradores de validación |

**Fuera de alcance por no estar en `sonar.sources`** (no hace falta excluirlos): los `*.config.*` de cada app, `verify-carrito.*`, `prisma/seed.ts`, `scripts/` y `packages/types`. No se pusieron en `coverage.exclusions` para no tener patrones que no coinciden con ningún archivo.

### 17/10/2026: línea base (PR #372)

- Primer análisis del CI en `main`: commit `3a7e23d` (merge del #371), run `38994955520`, 17/10/2026 02:29:29 UTC.
- Cobertura de líneas 36,1 % (Sonar 40,0 %), 3 bugs, 6 vulnerabilidades, 109 code smells, duplicación 8,5 %, ratings C / C / A. Detalle por app, brecha al 80 %, top 15 de archivos y hallazgos en [`linea-base.md`](linea-base.md).
- **El objetivo del 80 % es de cobertura de líneas** (`line_coverage`). Faltan 11.522 líneas: backend 781, web-admin 6.432, web-cliente 1.113, web-staff 3.196.
- Backend (Jest e Istanbul) y frontends (Vitest y v8) no miden igual: los porcentajes se comparan dentro de cada app, no entre apps.

### 17/10/2026: quality gate en el CI (PR #373, `ci/quality-gate`)

- Se saca el `continue-on-error` de cobertura. El paso se llama "Coverage".
- El paso de SonarCloud lleva `args: -Dsonar.qualitygate.wait=true -Dsonar.qualitygate.timeout=300`.
- En el run `38997548540` el scanner esperó al gate unos 11 segundos y respondió `PASSED`.
- **`main` está protegida por un ruleset** (id 16770555, activo, sin bypass), no por la protección de rama clásica: el check `CI — typecheck, lint, test, build` es obligatorio, la rama tiene que estar al día, el merge es solo por PR y el force push está bloqueado. Con el #373, un PR con la cobertura o el gate en rojo no se puede mergear.
- Mergeado el 17/10/2026 (merge `c643559`). Runs de `main` sobre ese merge: CI `38997971156` y Deploy — Staging `38997971140`, los dos en verde.

### 17/10/2026: `/health` con SHA (PR #374, `feat/health-sha`)

- PR abierto a las 12:08 UTC, commit `be07b5f`. CI del PR: run `39031347705`, en verde. Mergeado a las 12:16 UTC (merge `90bbb81`).
- `GET /health` devuelve `{ status, sha, db, uptime, version }`, sin datos sensibles:
  - `db`: `SELECT 1` con Prisma, cortado a los 2 s.
  - `sha`: `APP_COMMIT_SHA`; si no está, `RAILWAY_GIT_COMMIT_SHA`; si tampoco, `null`.
  - `version`: la del `package.json` del backend, o `null` si no lo encuentra (se probó con el build compilado desde una carpeta sin `package.json`).
- `HealthController` pasa a su propio `HealthModule`, con `HealthService`.
- Tests en `health.service.spec.ts` (Jest, AAA): 11 casos, 100 % de líneas y ramas en service y controller.

**Decisiones**

- **Siempre 200; con la base caída, `status: "degraded"`.** `railway.toml` no tiene `healthcheckPath`, pero se puede configurar desde el panel de Railway. Ese healthcheck solo corre en el deploy y acepta cualquier 2xx, así que un 503 haría fallar el deploy. El `HEALTHCHECK` del Dockerfile usa `wget`, que también falla con 503. El smoke lee el JSON, no el código HTTP.
- **`APP_COMMIT_SHA` propio.** Según la doc de Railway, `RAILWAY_GIT_COMMIT_SHA` solo se setea "if the deploy originated from a GitHub trigger"; `railway up` sube un tarball sin git. `deploy-staging.yml` corre `railway variable set APP_COMMIT_SHA=<github.sha> --skip-deploys` antes del `railway up` (flag verificado con `railway variable set --help`, CLI 5.70.0), así no hay un redeploy extra.
- **Caso borde:** si el `variable set` funciona y el `up` falla, la variable queda con el SHA nuevo y un redeploy manual mostraría ese SHA con el código viejo.

**Verificación en staging**

- Run de Deploy — Staging del merge: `39031875896`, en verde (CI de `main`: `39031875851`).
- `https://menyu-backend-staging.up.railway.app/health` respondió `{"status":"ok","sha":"90bbb811cf447f77e91a2cf469421871704d7be1","db":"ok","uptime":31,"version":"0.0.1"}`: el SHA coincide con el merge `90bbb81`.
- SonarCloud en el PR (`api/qualitygates/project_status?projectKey=MenYUorg_MenYU&pullRequest=374`): gate `OK` con **las 6 condiciones**, así que el pendiente sobre el gate asignado queda cerrado:

| Condición | Umbral de error | Valor |
|---|---|---|
| `new_reliability_rating` | > 1 (A) | 1 |
| `new_security_rating` | > 1 (A) | 1 |
| `new_maintainability_rating` | > 1 (A) | 1 |
| `new_coverage` | < 30 | 100,0 |
| `new_duplicated_lines_density` | > 10 | 0,0 |
| `new_security_hotspots_reviewed` | < 100 | 100,0 |

### 17/10/2026: smoke post-deploy en staging (PR #375, `ci/smoke-staging`)

- Commit `0d77d60` sobre `feat/health-sha`; después del merge del #374 se rebaseó con `git rebase --autostash --onto origin/main feat/health-sha ci/smoke-staging` y quedó como `ff67aca`.
- PR abierto a las 12:21 UTC. CI del PR: run `39032208989`, en verde. Mergeado a las 12:31 UTC (merge `beb2d18`).
- `deploy-staging.yml`:
  - Cada deploy de Vercel guarda en `$GITHUB_OUTPUT` la URL que imprime `vercel deploy`; el job las expone como outputs.
  - Job nuevo `smoke-staging` (`needs: deploy-staging`): lee la URL del backend, espera el SHA y corre el smoke.
- **URL del backend:** no hay un secreto con ella. Es la `VITE_API_URL` de preview de web-cliente en Vercel: el job hace `vercel pull` en una carpeta temporal, lee solo esa línea (no imprime el archivo, no lo sube y lo borra) y la deja en `STAGING_API_URL`. `VITE_API_URL` termina en `/api`: `/health` se consulta sin ese sufijo.
- **Espera del SHA:** consulta `/health` cada 10 s, hasta 8 min (49 intentos), hasta que muestre `github.sha`. Los errores de red, los códigos distintos de 200 y el SHA viejo cuentan como "todavía no".
- **Smoke (solo GET):** `/health` con `status` y `db` en `ok` (un `degraded` con 200 cuenta como falla), `/api/discovery` con 200 y los arrays `restaurantes` y `ofertas`, y 200 en web-admin, web-cliente y web-staff. Informa todos los chequeos antes de fallar.
- `scripts/smoke/`: lógica en `lib.mjs`, sin dependencias; tests en `lib.test.mjs` con `node:test` (13 casos, 100 % de líneas de `lib.mjs`), que corren en el CI en el paso `Test — smoke scripts`. `scripts/` está fuera de `sonar.sources`, así que no suma en SonarCloud.
- Workflows validados con `yaml.safe_load` y con `actionlint` 1.7.12 (imagen oficial `rhysd/actionlint`, con shellcheck): sin errores.
- Supone que las previews de Vercel no tienen Deployment Protection.
- Primer run con smoke: Deploy — Staging `39032870161` (CI de `main`: `39032870180`), del merge `beb2d18`. En verde: deploy de 12:31:37 a 12:34:14 UTC y smoke de 12:34:16 a 12:34:42 UTC. `vercel pull --cwd` y la captura de las URLs de `vercel deploy` funcionaron. `/health` ya mostraba `beb2d18` en el intento 1, porque el job arranca después de los deploys de Vercel. Los 5 chequeos dieron OK, así que las previews no devuelven 401. El log (194 líneas) no tiene el contenido del `.env`.

### 17/10/2026: CI en verde, `APP_COMMIT_SHA` y smoke en producción (`ci/smoke-production`)

- PR #377, abierto el 17/10/2026. Commits `fcc6b39` (sobre `main`, `beb2d18`) y `500649c` (validación de las variables `PROD_WEB_*`). Antes del merge se actualizó con "Update branch" desde GitHub (`61ca1f5`, merge de `main` en la rama), sin rebase, así que `fcc6b39` y `500649c` siguen siendo los mismos commits. Mergeado el 17/10/2026 a las 13:23:51 UTC (merge `8dc7c72`).
- **Decisión:** las variables `PROD_WEB_*_URL` se validan en `check-ci`, antes del deploy, para que un tag con una variable faltante nunca toque producción (`smoke-production` repite el chequeo como segunda red).
- **Variables de repo cargadas el 17/10/2026** (13:06 UTC, con `gh variable set`; son variables, no secretos). Antes de cargarlas, cada frontend respondió `200` a un GET real con `curl -L`, sin redirigir a login ni dar 401:

| Variable | Valor |
|---|---|
| `PROD_WEB_CLIENTE_URL` | `https://menyu-cliente.vercel.app` |
| `PROD_WEB_ADMIN_URL` | `https://menyu-admin.vercel.app` |
| `PROD_WEB_STAFF_URL` | `https://menyu-staff.vercel.app` |

No hay variable para la API: el workflow la resuelve desde `VITE_API_URL` de production de web-cliente. La API de producción (`https://menyu-backend-production.up.railway.app`) respondió `200` en `/health`, todavía con el formato viejo.
- `deploy-production.yml`:
  - **`check-ci`** (primer job): consulta con `gh api` el check "CI — typecheck, lint, test, build" del commit del tag y toma el run más reciente de GitHub Actions. Si está en cola o en curso, espera (cada 20 s, hasta 15 min). Si terminó sin `success` o no hay run, falla enseguida y no se despliega. Es la decisión D10 del plan en PDF del equipo (no está en el repo): producción solo con el CI del mismo SHA en verde. Pide `checks: read` y `contents: read` (por el checkout).
  - **`deploy-production`**: `needs: check-ci` y solo en push de tag. Setea `APP_COMMIT_SHA` con `--skip-deploys` antes del `railway up`, con los secretos de producción.
  - **`smoke-production`**: lee `VITE_API_URL` del `vercel pull --environment=production` de web-cliente, espera el SHA en `/health` y corre `scripts/smoke`. Los frontends de producción tienen URL estable (`--prod`): salen de las variables de repo `PROD_WEB_ADMIN_URL`, `PROD_WEB_CLIENTE_URL` y `PROD_WEB_STAFF_URL`.
  - **`workflow_dispatch`**: corre solo `check-ci` y el smoke, sin desplegar, para probar antes de la demo. Hay que lanzarlo desde el tag desplegado ("Use workflow from"): el smoke espera el SHA de ese ref.
- `scripts/smoke/`: `STAGING_API_URL` pasa a `SMOKE_API_URL` y los mensajes dejan de nombrar a staging. Staging no cambia: la variable solo pasa por `$GITHUB_ENV`.
- Validado con `yaml.safe_load`, `actionlint` 1.7.12 (exit 0 en los 3 workflows) y una simulación del loop de `check-ci` (en cola → en curso → success, failure, cancelled, sin run y timeout).
- Se decidió no pasar el smoke a un workflow reutilizable por ahora (queda repetido entre staging y producción).
- Producción hoy responde el `/health` viejo (`{"status":"ok"}`, último tag `v1.0.5`): un `workflow_dispatch` antes de taggear una versión con el `/health` nuevo falla en la espera del SHA.
- **Staging después del merge del #377** (`8dc7c72`), para confirmar que el cambio de `scripts/smoke` no rompió staging:
  - CI de `main`: run `39036386888`, en verde.
  - Deploy — Staging: run `39036386891`, en verde. Job de deploy `117406966224` (13:23:57 a 13:26:36 UTC) y job de smoke `117407542611` (13:26:38 a 13:27:05 UTC).
  - Smoke: `SMOKE_API_URL` tomada de `VITE_API_URL` de web-cliente; `/health` mostró `8dc7c72` en el intento 1; los 5 chequeos en OK (`/health`, `/api/discovery`, web-admin, web-cliente y web-staff).
  - `/health` de staging: `{"status":"ok","sha":"8dc7c72a35eed1aa1bf29029d822148dd1389303","db":"ok","uptime":301,"version":"0.0.1"}`.

## Datos útiles

- Dashboard: https://sonarcloud.io/summary/overall?id=MenYUorg_MenYU
- `/health` de staging: https://menyu-backend-staging.up.railway.app/health (fuera del prefijo `/api`).
- Gate de un PR por API: `api/qualitygates/project_status?projectKey=MenYUorg_MenYU&pullRequest=<n>`.
- Correr los tests del smoke en local: `node --test scripts/smoke/lib.test.mjs`.
- Métricas por API sin token (el proyecto es público):
  - `https://sonarcloud.io/api/measures/component?component=MenYUorg_MenYU&branch=main&metricKeys=...`
  - Por app: `component=MenYUorg_MenYU:apps/<app>/src`
  - Archivos: `api/measures/component_tree?...&qualifiers=FIL&s=metric&metricSort=uncovered_lines&asc=false`
  - Hallazgos: `api/issues/search?componentKeys=MenYUorg_MenYU&branch=main&types=BUG,VULNERABILITY&resolved=false`
- Sin token, la API **no** muestra la definición del quality gate ni del código nuevo ("not member of organization"). Eso se ve en la UI.
- Entorno local: si la cobertura de web-cliente falla con `Failed to resolve import "jsqr"`, el `node_modules` está desactualizado. Se arregla con `pnpm install --frozen-lockfile`.

### 17/10/2026: fase de calidad, plan y defectos (SCRUM-18)

**Cobertura local contra SonarCloud** (`main` = `8dc7c72`, análisis del 17/10 13:26:54 UTC): la diferencia es de 0,2 puntos o menos en las 4 apps.

| App | Local (líneas) | SonarCloud (líneas) |
|---|---|---|
| backend | 1.134 / 2.367 = 47,9 % | 1.161 / 2.416 = 48,1 % |
| web-cliente | 4.246 / 6.699 = 63,38 % | 4.247 / 6.700 = 63,4 % |
| web-admin | 3.467 / 12.374 = 28,01 % | 3.468 / 12.374 = 28,0 % |
| web-staff | 652 / 4.810 = 13,55 % | 652 / 4.810 = 13,6 % |

Total en SonarCloud: 9.528 / 26.300 = 36,2 %. Para el 80 % (21.040 líneas) faltan 11.512. Estimación: entre 72 % y 76 % para el jueves 22/10 con tests que se puedan defender.

**Defecto: PIN de mesa con `Math.random` (`mesas.service.ts:141`, S2245), PR #379**

| Paso | Commit | Run | Resultado |
|---|---|---|---|
| Rojo (solo el test) | `fdd4ed702a1aaed74279aa1e1068466891da9664` | [`39037725031`](https://github.com/MenYUorg/MenYU/actions/runs/39037725031) | failure en Test: 1 fallado, 635 pasados (`Expected: 1, 10000` / `Number of calls: 0`) |
| Verde (fix) | `9aed16c6d41c2b4929236dded7a4eb04de2288c4` | [`39037887375`](https://github.com/MenYUorg/MenYU/actions/runs/39037887375) | success: 636 pasados, quality gate PASSED |

**`reduce` de `sessions.service.ts:40` (S6959):** latente. El único llamador lo invoca con la lista no vacía, así que no se reproduce por la API pública. Queda pendiente decidir cómo tratarlo.

**Candidatos a defecto:** registrados en Jira (detalle fuera del repo).

**Endurecimiento del `reduce` (`sessions.service.ts:40`), PR #380:** sin ciclo rojo/verde porque el defecto es latente. La precondición queda explícita (error claro sin pagos) y el `reduce` tiene valor inicial. Test nuevo: tres pagos con el más reciente primero. Mutación (`<` en vez de `>`): el test falla con "hace 8 minutos". CI: run [`39038583947`](https://github.com/MenYUorg/MenYU/actions/runs/39038583947) (`152c106`), success.

**Backend, lote 1** (rama local `test/backend-cobertura`, commit `7d9f4d4`): helper `src/test/prisma-mock.ts` y specs de 7 servicios que estaban en 0 % (mozos, clasificaciones, categorías, llamados al mozo, admins, ingredientes, admin-restaurante), todos en 100 % de líneas. Backend local: 47,9 % → 61,42 % (1.468/2.390); 743 tests en 21,4 s. Mutaciones detectadas: guardar la contraseña en claro (mozos), sacar el `id: { not }` de la búsqueda de duplicados (categorías) y sacar el chequeo de sesión activa (llamados).

**Auditoría de archivos sin lógica en el denominador:** solo `backend/common/estado-pago.constant.ts` (4 líneas, ya cubiertas). No hay nada para proponer como exclusión.


### 17/10/2026 (tarde): defectos, backend lotes 1 y 2, incidente de Vercel

**PRs**

| PR | Rama | Estado al cortar | Notas |
|---|---|---|---|
| #379 | `fix/pin-mesa-crypto` | Mergeado 14:16 UTC | PIN de mesa con `crypto.randomInt`. Rojo `39037725031`, verde `39037887375` |
| #380 | `fix/reduce-pagos-mp` | Mergeado 14:23 UTC (merge `838b9be`) | Endurecimiento del `reduce` (sin rojo/verde) |
| #381 | `test/backend-cobertura` | Abierto | En GitHub solo está el lote 1 (`747c419`). Los lotes 2a (`70b2546`) y 2b (`d0dbb79`) están **commiteados en local, sin pushear** |
| #382 | `fix/asignar-restaurante-marca` | Abierto, CI en verde | Un gerente solo recibe restaurantes de su marca. Rojo `b24589a` (run `39040126713`, 1 fallado y 636 pasados), verde `086a82b` (run `39040298430`, 638 pasados, gate PASSED) |
| #383 | `fix/fuerza-bruta-sesion` | Abierto | Límite de intentos de PIN (por restaurante) y de código de sesión (por mesa). Rojo `ac87891` (run `39040373763`: `Expected: 429` / `Received: 404`), verde `8444681` (run `39040558892`, success). El último commit (`0ca2f8d`, script de staging) falló el CI en un test intermitente de web-cliente (`QrScanner.spec.tsx` › "con el permiso muestra la imagen de la cámara…"), que no toca ese commit: hay que relanzar el job |

**Backend local:** 47,9 % → **79,75 %** de líneas (1.927/2.416), 904 tests en 14,3 s. Helpers compartidos: `src/test/prisma-mock.ts` y `src/test/app-endpoints.ts`. Mutaciones: 3 por lote (lote 1, 2a y 2b) y 3 en el #383, todas detectadas y revertidas.

**Candidatos a defecto:** registrados en Jira (detalle fuera del repo, que es público).

**Incidente de infraestructura (17/10/2026):** el límite de Vercel del plan Hobby (100 deployments por 24 h) cortó `deploy-staging` en `main`. Los cuatro proyectos (menyu-admin, menyu-cliente, menyu-cliente-staging, menyu-staff) respondieron "Deployment rate limited — retry in 24 hours". En el run [`39040516003`](https://github.com/MenYUorg/MenYU/actions/runs/39040516003) (merge del #380, `838b9be`), el backend sí se desplegó en Railway: `Set APP_COMMIT_SHA` y `Deploy backend` en success. Falló `Deploy web-admin to Vercel staging`, los otros dos frontends quedaron en skipped y el smoke también. `/health` de staging reportó `838b9bed345da92015bf7a53e2414cf8fce2f2d9` (el merge del #380). Causa de infraestructura, no de código.

### 18/10/2026: menos deployments, lotes 2 y 3 del backend, QrScanner y 429 en web-cliente

**PRs**

| PR | Rama | Estado | Notas |
|---|---|---|---|
| #381 | `test/backend-cobertura` | Mergeado 12:54 UTC (merge `de2ebd0`) | Solo con el lote 1: se mergeó antes de pushear los lotes 2a y 2b |
| #382 | `fix/asignar-restaurante-marca` | Mergeado 13:01 UTC (merge `eb544fd`) | Merge de `main` `7e47220` (run `39129264269`, success) |
| #383 | `fix/fuerza-bruta-sesion` | Abierto | Merge de `main` `98b6aa9` (run `39129744685`, success) |
| #384 | `ci/reducir-deployments` | Abierto, CI en verde (run `39130390166`) | `ignoreCommand` con `scripts/vercel/ignorar-build.sh` (turbo-ignore en previews; producción de menyu-admin/cliente/staff sigue sin construir desde Git, menyu-cliente-staging sí) y `paths-ignore` en `deploy-staging.yml` |
| #385 | `test/backend-cobertura-2` | Abierto | Lotes 2a (`70b2546`) y 2b (`d0dbb79`), merge de `main` (`9f62d80`, CI `39130480372` en verde) y lote 3 (`126511f`) |
| #386 | `fix/web-cliente-qr-y-429` | Abierto, CI en verde (run `39131194129`) | QrScanner sin test intermitente (`86fdcf4`) y mensaje del servidor ante un 429 (rojo `b564c81`, verde `0257fe2`) |

**Vercel:** el cupo se liberó el 18/10 (previews en success desde las 13:01 UTC). Las previews del #383 (`98b6aa9`) y de los PRs nuevos gastaron 4 deployments por push. Los proyectos menyu-admin, menyu-cliente y menyu-staff ya tenían un Ignored Build Step en el panel que cancela producción ("Canceled by Ignored Build Step" en `a96d538`, `ae36522` y `53199f9`); el `ignoreCommand` del `vercel.json` lo reemplaza, por eso el script repite esa regla.

**QrScanner.spec.tsx (test intermitente):** falló en el run [`39040637177`](https://github.com/MenYUorg/MenYU/actions/runs/39040637177) (`0ca2f8d`, #383) y pasó con el cambio en el run [`39131194129`](https://github.com/MenYUorg/MenYU/actions/runs/39131194129) (#386). Causa: la cámara simulada responde fuera de `act`; `findByRole` sigue apenas React pinta el título y el efecto del visor (`srcObject` y `play()`) corre en otra tarea del Scheduler cuando el render pasa el corte de 5 ms. Además, el `afterEach` del spec restauraba los dobles antes del `cleanup` de Testing Library. Se reproduce siempre con `performance.now` avanzando 10 ms por llamada (fallaban 2 tests y había una fuga en un tercero); con el cambio, 41/41.

**Backend local:** 79,79 % → **91,77 %** de líneas (2.221/2.420), 57 suites y 1.035 tests.

**Candidatos a defecto:** los nuevos se registraron en Jira (detalle fuera del repo).

**Pendiente al retomar:** se actualizó en la entrada del 18/10 (noche).

### 18/10/2026 (noche): cobertura al 83 %, PR de tests unificado, refactor 1 y rama de integración

**PRs**

| PR | Rama | Estado | Notas |
|---|---|---|---|
| #384 | `ci/reducir-deployments` | Mergeado 13:42 UTC (`2e3e87a`) | Solo turbo-ignore y `paths-ignore` |
| #387 | `ci/vercel-solo-main` | Mergeado (`7fa697b`) | `git.deploymentEnabled`: web-admin y web-staff `false`; web-cliente `{ main: true, "**": false }`. Desde entonces los PRs no generan deployments de Vercel |
| #388 | `fix/mp-conexion-cuenta` | Abierto | Conexión de la cuenta de Mercado Pago: `conectar` exige OWNER o GERENTE con acceso y el `state` es un JWT propio de 10 min. Rojo `1104156` (run [`39152161470`](https://github.com/MenYUorg/MenYU/actions/runs/39152161470), 9 fallados), verde `11c7b5d` (run [`39152391662`](https://github.com/MenYUorg/MenYU/actions/runs/39152391662)) |
| #386 | `fix/web-cliente-qr-y-429` | Abierto | Suma `313edcb` (pantalla del código de sesión ante un 429). Run rojo del 429 tomado en una rama descartable: [`39152185716`](https://github.com/MenYUorg/MenYU/actions/runs/39152185716) (PR borrador #389, cerrado) |
| #393 | `test/cobertura-frontend-backend` | Abierto, CI y Sonar en verde | Une #385, #390, #391 y #392 (cerrados apuntando a él): 47 archivos, solo specs y el helper de tests |
| #383 | `fix/fuerza-bruta-sesion` | Abierto | Head `b099249` (merge de `main`) |

**Cobertura** (local, tests del #393): backend 91,1 %, web-admin 83,7 %, web-cliente 85,8 %, web-staff 74,8 %; repo **83,3 %** (21.908/26.303). 2.335 tests. Cada spec de página pasó 3 mutaciones de control y 3 corridas seguidas sin fallas; los specs están en `sonar.exclusions`.

**Sonar sobre `main`** (antes del #393): cobertura 41,8 % (37,4 % de líneas, 26.304 líneas a cubrir, el mismo universo que el lcov local) y duplicación **8,4 %** (3.335 líneas, 138 bloques). Los bloques más grandes: historial de sesiones admin ↔ staff (≈460 líneas por lado), el modal "Editar pedido" (admin `PedidosPage` ↔ `HistorialPage`), `TomaPedidosPage` admin ↔ staff y el cascarón de pantallas de web-cliente.

**Refactor 1 (historial de sesiones compartido):** commit local `f58f069` en `refactor/historial-sesiones-compartido`, sin PR (espera al #393). Mueve la vista a `@menyu/ui/historial` (subpath fuera del índice: el bundle de web-cliente no lo incluye) y `SesionHistorial` a `@menyu/types`; el botón "Editar pedido" entra por `accionPedido`. 593 líneas agregadas y 1.116 borradas. Specs de las dos páginas sin cambios y en verde; HTML de 13 estados idéntico antes y después (snapshots temporales, no commiteados). Hubo que alinear `react` 19 en `packages/ui`: pnpm resolvía su `lucide-react` contra React 18.
- **Decisión pendiente:** `packages/ui` está fuera de `sonar.sources` y del `coverage.include` de las apps, así que el código compartido deja de medirse (web-admin −423 y web-staff −368 líneas a cubrir). Opción A: dejarlo así. Opción B: medirlo (agregar `packages/ui/src` a Sonar y a la cobertura de vitest; con `allowExternal` el informe salió vacío, falta encontrar la configuración).

**Rama de integración** (`test/integracion-todo`, worktree `../MenYU-integracion`, solo local y sin upstream): `main` + #393 + #383 + #388 + #386 + refactor 1, con `--no-ff` y sin conflictos.
- Install con lockfile congelado, typecheck, lint, tests y build de las 4 apps en verde.
- Tests: backend 1.052, web-admin 487, web-cliente 705, web-staff 120; **2.364** (2.335 + 16 de #383 + 9 de #388 + 4 de #386).
- Cobertura de la unión: backend 2.273/2.472, web-admin 9.935/11.951, web-cliente 5.752/6.701, web-staff 3.228/4.442; repo **82,9 %** (21.188/25.566). Baja del 83,3 % por el refactor 1 (salen 791 líneas casi todas cubiertas); sin él daría 83,4 %.
- jscpd (referencia, no es Sonar): 5,05 % con 100 tokens y 10,2 % con 50; sobre `main` da 4,8 % y 10,0 % contra el 8,4 % de Sonar, así que no está calibrado.

**Candidatos a defecto:** los nuevos se registraron en Jira (detalle fuera del repo).

**Pendiente al retomar:** se actualizó en la entrada del 18/10 (cierre). Los puntos que había acá quedaron resueltos ahí (B elegida, #393 mergeado y leído en Sonar, refactor 1 mergeado, #383, #386 y #388 mergeados) o pasaron a la lista nueva (refactores 2 y 3, script de staging).

### 18/10/2026 (cierre) y 19/10 (madrugada, UTC): merges, Sonar sobre `main`, refactores 1 a 3 y PR de deploy

Horas en UTC.

**PRs**

| PR | Rama | Estado | Notas |
|---|---|---|---|
| #393 | `test/cobertura-frontend-backend` | Mergeado 22:46 (`e000a81`) | Tests unificados |
| #383 | `fix/fuerza-bruta-sesion` | Mergeado 23:06 (`52a5448`) | Antes del merge, `eefc043` estabilizó dos tests de frontend que fallaban por tiempos en el CI: `TablesPage` (con 0 mesas, el encabezado "0 mesas · 0 ocupadas" ya se ve mientras carga, así que el test no esperaba la grilla) y `QrScanner` ("se corta sola": cortaba la cámara antes de que el efecto enganchara el listener de `ended`) |
| #388 | `fix/mp-conexion-cuenta` | Mergeado 23:23 (`40bbf50`) | `ead7439`: `QrScanner.spec` desmonta antes de restaurar los mocks (un efecto pendiente corría contra el `play()` de jsdom) |
| #386 | `fix/web-cliente-qr-y-429` | Mergeado 23:35 (`6438e72`) | Merge de `main` `a7681c2`: el conflicto en `QrScanner.spec.tsx` se resolvió con la versión del #386, que ya cubría los dos parches de #383 y #388 |
| #394 | `refactor/historial-sesiones-compartido` | Mergeado 19/10 00:24 (`8f56bd0`, merge commit) | Refactor 1 + `packages/ui` medido en Sonar (opción B) |
| #395 | `refactor/editar-pedido-compartido` | **Abierto**, CI y Sonar en verde | Refactor 2 |
| #396 | `ci/endurecer-deploy-produccion` | **Abierto**, CI y Sonar en verde | Pin del CLI de Railway, tags, rollback y script de staging. Tiene que estar en `main` antes del ensayo del jueves 22/10 |

El CI de `main` falló una vez, en `52a5448` (merge del #383), por el test intermitente de `QrScanner` ("con el permiso muestra la imagen de la cámara…") que corrige el #386. Los merges siguientes pasaron.

**Sonar sobre `main` en `6438e72`** (después de #393, #383, #388 y #386; análisis de las 23:39): líneas **83,4 %** (21.981/26.359), cobertura mixta **84,9 %** (ramas 91,1 %), duplicación **8,4 %** (3.335 líneas, 138 bloques), gate OK.
- El 83,3 % era el lcov del merge del #393 (`e000a81`, 83,31 %). Con #383, #388 y #386, el lcov de `main` da 83,41 % (26.357 líneas, 4.372 sin cubrir).
- Sonar da 83,39 % por tres diferencias con el lcov: `backend/src/test/app-endpoints.ts` y `prisma-mock.ts` están en el lcov (49 líneas cubiertas) pero Sonar los excluye; `web-cliente/.../menu/modo.ts` no está en el lcov y Sonar lo cuenta como 1 línea sin cubrir; y en 17 services del backend Sonar cuenta 50 líneas más que las `DA` de jest (por ejemplo, `pedidos.service` 180 contra 172).
- Los specs no suman duplicación: de los 34 archivos con líneas duplicadas, ninguno es un spec (están en `sonar.exclusions`).

**Refactor 1 (PR #394):** el commit `f58f069` se pasó a `main` como `e492883`, sin conflictos.
- **Medición de `packages/ui` (opción B):** `packages/ui` tiene su propio `vitest.config.ts` con lcov (rutas desde la raíz del monorepo). `packages/ui/src` entra en `sonar.sources` y `sonar.tests`, y su lcov en `sonar.javascript.lcov.reportPaths`, con los mismos patrones de specs que las apps. El CI corre `--filter=@menyu/ui` en Test y Coverage y sube el artefacto `coverage-ui`. Sin cambios de umbrales ni de exclusiones.
- **Tests nuevos (23):** `precio.ts`, los helpers del historial y `BadgeEstado`, `PedidoEnSesion`, `SesionDetalleModal` y `SesionCard`. Hicieron falta los de componentes: solo con los helpers, `HistorialSesiones.tsx` entraba con 14,7 % y el gate pide 30 % sobre código nuevo; con ellos queda en 99,7 %. Las horas y fechas se comparan por contenido, porque el relleno con cero y el "a. m." cambian según el ICU de cada runtime.
- **Mutaciones:** `getPeriodBounds` con 7 días en vez de 6, `calcDuracion` con `<= 60` y "En preparacion" sin tilde. Cada una rompe al menos un test; todas se revirtieron.
- **Sin cambios de comportamiento:** los specs de las dos pantallas quedaron intactos y el `body.innerHTML` final de sus 25 tests es idéntico antes y después.
- **Sonar del PR:** 99,4 % de cobertura y 1,7 % de duplicación en código nuevo. Marcó 2 code smells de accesibilidad (S6848, un `div` clickeable) en `SesionDetalleModal` y `SesionCard`; ya estaban en las apps y el refactor solo los movió.

**Sonar sobre `main` en `8f56bd0`** (después del #394; análisis de las 00:28):

| | `6438e72` | `8f56bd0` |
|---|---|---|
| Líneas | 83,4 % | **82,0 %** (21.582/26.323) |
| Cobertura mixta | 84,9 % | **83,8 %** |
| Duplicación | 8,4 % (3.335 líneas, 138 bloques) | **6,1 %** (2.419 líneas, 115 bloques) |

- **Cobertura:** baja como se esperaba. Las apps pierden 791 líneas que ya estaban cubiertas y `packages/ui` suma 744; los componentes que ya estaban en `packages/ui` (`Badge`, `Button`, `Modal`, etc.: 369 líneas, 361 sin cubrir) nunca se habían medido.
- **Ranking de duplicación:**
  1. web-admin `gerente/PedidosPage` 320
  2. web-admin `gerente/HistorialPage` 296
  3. web-admin `gerente/TomaPedidosPage` 198
  4. web-admin `menu/AdminMenuPage` 182
  5. web-staff `mozo/TomaPedidosPage` 152
  6. web-admin `mozos/MozosPage` 124
  7. web-cliente `EtiquetarPedidosPage` 114
  8. web-cliente `MisPedidosPage` 111
  9. web-staff `mozo/PedidosPage` 80
  10. web-staff `cocina/CocinaPage` 73
- **Entre `packages/ui` y las apps:** solo 14 líneas, `getPeriodBounds` (`HistorialSesiones.tsx:28-41`) contra la copia propia de `AuditoriaPage.tsx:25-38`. No la creó el refactor: ya estaba.

**Refactor 2 (PR #395):** `EditarPedidoModal` en `@menyu/ui/editar-pedido` reemplaza las 4 copias del modal: web-admin `gerente/PedidosPage`, `HistorialPage` y `HistorialSesionesPage`, y web-staff `mozo/PedidosPage`.
- Cada pantalla pasa `onGuardar` con su endpoint, el código ya formateado (el `shortId` no es igual en todas) y si el pedido está pagado.
- Las copias tenían dos diseños, el del historial de sesiones y el de pedidos. El modal recibe una `apariencia` para que cada pantalla se vea igual que antes; la del mozo es la de pedidos sin transiciones. Unificar el aspecto es una decisión aparte.
- **Sin cambios de comportamiento:** se registró **cada estado del DOM** con un `MutationObserver`, no solo el final: 65 tests y 27 estados con el modal abierto, incluido el aviso de pedido pagado. Antes y después son idénticos, con las horas normalizadas (los specs muestran horas relativas a "ahora").
- **Tests:** spec propio del modal, 12 tests, 99,6 % de cobertura. Mutaciones detectadas: dejar pasar 51 palabras, mandar ítems sin cambios y dejar guardar un pedido pagado.
- **Sonar del PR:** 99,1 % de cobertura y 0 líneas duplicadas en código nuevo. Marcó 2 code smells de accesibilidad (S6853, un `label` sin control asociado, y S6848), heredados de las copias.
- **Duplicación esperada:** las copias del modal concentran 529 de las 2.419 líneas duplicadas de `main` (242 + 253 + 34; la del mozo está escrita compacta y Sonar no la empareja). Después del merge: **≈ 4,8 %**.

**Refactor 3** (rama local `refactor/pantalla-comensal`, `8edc3de`, sobre la rama del #395; sin PR): `components/PantallaComensal.tsx` (`EncabezadoPantalla`, `InsigniaMesa`, `MarcoPantalla`) y `components/estadosPantalla.tsx` (`estadoCargando`, `estadoError`, `estadoVacio`) en web-cliente, porque solo lo usa esa app.
- **Pantallas:** Etiquetar, Mis pedidos, Carrito (solo el encabezado; su marco y su estado vacío tienen otros estilos), Pagar, ¿Cuántos son? y Armar mensaje.
- **Tamaño:** −627 y +213 líneas en las pantallas, +188 en los componentes.
- **Verificación:** specs sin tocar, 705 tests de web-cliente en verde, typecheck y lint ok; los componentes nuevos quedan al 100 % con los specs existentes.
- **Snapshots:** los 65 tests dan el mismo DOM antes y después: 101 estados con la captura al final de cada test y 223 con la captura hasta el desmontaje (recuento verificado en la sección del 19/10, tarde).
- **Lo que detectaron los snapshots:** con los estados como componentes, React desmontaba y montaba el `<div>` al pasar de "cargando" a "error" en vez de reutilizarlo como antes, y cambiaba el orden de las propiedades de `style`. Por eso los estados son funciones que devuelven el elemento.
- **Duplicación:** las 6 pantallas suman 355 líneas duplicadas en `main`. Objetivo: **≈ 4,0 %**.

**PR #396 (`ci: endurecer deploy a producción`):**
- **Commit 1** (`ba61590`):
  - `@railway/cli@latest` → `@5.70.0` (la versión del último deploy de staging exitoso) en los dos workflows.
  - `on.push.tags` pasa de `v*.*.*` a un solo patrón, `v[0-9]+.[0-9]+.[0-9]+`; el anterior aceptaba también `v1.0.6-rc.1` o `v1.2.3.4`.
  - Primer paso de `check-ci`: corta si el tag no es `vX.Y.Z`. Con `workflow_dispatch` no corre.
  - `docs/calidad/plan-rollback.md`.
- **Commit 2** (`f610ef4`): `scripts/staging/fuerza-bruta.mjs` con lista blanca. Exige `STAGING_API_HOST` y `CONFIRMAR_STAGING=si`, rechaza cualquier otro host, no imprime el PIN, el JWT ni el restaurante, y cierra la sesión aunque falle un paso. No se ejecutó.
- **Cómo se probó:** la regex, con 7 tags de ejemplo sin crear tags; el YAML, parseado; y las guardas del script, con hosts ficticios.
- **CI:** sobre `f610ef4`, el primer intento falló por un test inestable de web-admin, sin relación con el PR, y el intento 2 del run [`39184409337`](https://github.com/MenYUorg/MenYU/actions/runs/39184409337) pasó. No es el último verde de la rama: ese es el [`39310384767`](https://github.com/MenYUorg/MenYU/actions/runs/39310384767), sobre `7780925` (el head al merge).

**Test inestable de web-admin (`PagosPage`):** `PagosPage.tsx:518` programa un `setTimeout` de 2,5 s para ocultar el aviso "Pago registrado correctamente" y no lo cancela al desmontar. Si el spec termina antes, el timer dispara con jsdom ya desarmado (`ReferenceError: window is not defined`) y Vitest falla aunque los 487 tests pasen. Propuesta: limpiar el timer en un `useEffect`, como ya hace `MensajePage` en web-cliente, en un PR chico con rojo/verde. Falta decidirlo.

**Deploys de staging:** en las 24 h hasta el merge del #394 hubo 9 ejecuciones de `deploy-staging`, todas exitosas y con los 3 pasos de Vercel: son 27 deployments del cupo de 100. Los 4 merges de la noche (#393, #383, #388 y #386) dispararon 4 de ellas (12 deployments); el #394, una más.

**Candidatos a defecto:** 1 nuevo, funcional, registrado en Jira. Se corrige con rojo/verde en un PR propio después del merge del #395.

**Cómo se verificaron los refactores (para repetirlo):** los scripts quedaron en el scratchpad de la sesión, que no se conserva. Se rearman así:
1. Agregar temporalmente al final de cada spec de las pantallas un `MutationObserver` sobre `document.body`, registrado en un `beforeEach`. Guarda `innerHTML` en cada cambio, sin repetir estados consecutivos.
2. En un `afterEach`, escribir todos los estados del test en un archivo propio.
3. Correr los specs con el código de `main` y con el de la rama, y restaurar los specs con `git checkout`.
4. Normalizar horas y fechas (`HH:MM`, `a. m.`/`p. m.`, `DD/MM`) y comparar con `diff -r`.
5. Antes de comparar, correr dos veces sobre el mismo código para confirmar que la captura es determinista.

**Worktrees y ramas**
- `../MenYU-pr383`: `refactor/pantalla-comensal`, el refactor 3.
- `../MenYU-ci-deploy`: `ci/endurecer-deploy-produccion`, el #396.
- `../MenYU-ci`: `ci/vercel-solo-main`, no se toca.
- `../MenYU-integracion`: `test/integracion-todo`, quedó vieja y es descartable.
- En el checkout principal, la rama local `refactor/historial-sesiones-compartido` (`f58f069`) quedó vieja; la borra Coty. También sobra la local `wip/refactor-historial` (en `../MenYU-pr383`), que ya está en `main` por el #394.

**Pendiente al retomar** (en este orden)
1. **Merge de #395 y #396.** El orden da igual: tocan archivos distintos. El #396 tiene que estar en `main` antes del ensayo del jueves 22/10.
2. **Con el #395 en `main`:**
   - Leer Sonar de `main`: duplicación real contra el ≈ 4,8 % esperado, y si apareció duplicación nueva entre `packages/ui` y las apps.
   - En `../MenYU-pr383`, rebasear `refactor/pantalla-comensal` sobre `origin/main`. Si el #395 entra como merge commit, alcanza `git rebase origin/main`.
   - Repetir typecheck, lint, tests y snapshots, y abrir el PR del refactor 3. En el cuerpo: las 6 pantallas, specs intactos, DOM idéntico (101 estados al final de cada test, 223 hasta el desmontaje) y el ≈ 4,0 % esperado.
3. **Con el #395 en `main`:** PR rojo/verde del candidato nuevo, con el detalle en Jira. En el PR y en los commits no va ningún otro candidato.
4. **Decidir:**
   - el PR chico del timer de `PagosPage` (rojo/verde);
   - un PR de accesibilidad con los 4 code smells (S6848 en `SesionDetalleModal`, `SesionCard` y el fondo de `EditarPedidoModal`; S6853 en su `label`). Cambian el HTML.
5. Si después del refactor 3 la duplicación no queda cerca del 4 %, el siguiente candidato es `TomaPedidosPage` (web-admin 198 y web-staff 152).
6. **Con todo mergeado:** pasarle a Coty las variables y el comando de `scripts/staging/fuerza-bruta.mjs`, sin valores, para que lo corra ella contra staging como evidencia del #383.
7. **Jueves 22/10:** ensayo de producción con un tag `vX.Y.Z`. Anotar `check-ci`, deploy, smoke y el SHA de `/health`.
8. **Viernes 23/10:** subir los umbrales del gate (80 % de cobertura y 5 % de duplicación sobre código nuevo) y cambiar la definición de código nuevo (Pendientes, puntos 1 y 2).
9. Abrir el PR único de esta bitácora después del ensayo.

> Esta lista quedó superada: ver "Pendiente al retomar" en la sección del 19/10 (tarde).

### 19/10/2026 (tarde, UTC): merges de #395 y #396, Sonar, refactor 3 y dos PRs rojo/verde

Horas en UTC. No se mergeó nada desde esta sesión; los merges los hizo Coty.

**Merges y estado de `main`** (`a4c4c53`)
- #395 mergeado a las 19:20 (`78be010`). CI `39310239261` y Deploy Staging `39310238882`, verdes.
- #396 mergeado a las 19:29 (`a4c4c53`). CI `39311475842` verde (con SonarCloud y el quality gate). Deploy Staging `39311475958` verde, con smoke; el log muestra `npx @railway/cli@5.70.0`, así que el pin funciona.

**Sonar sobre `main` después del #395** (análisis de `78be010`, 19:24; el de `a4c4c53`, 19:34, da lo mismo; gate OK)

| | `8f56bd0` (#394) | `78be010` / `a4c4c53` | Diferencia |
|---|---|---|---|
| Duplicación | 6,1 % | **4,8 %** | −1,3 pp |
| Líneas duplicadas | 2.419 | **1.880** | −539 |
| Bloques | 115 | **101** | −14 |
| Cobertura de líneas | 82,0 % | **81,6 %** | |
| Cobertura mixta | 83,8 % | **83,5 %** | |

Dio el ≈ 4,8 % esperado. **Ranking de duplicación** (líneas / bloques):
1. web-admin `gerente/TomaPedidosPage` 198 / 9
2. web-admin `menu/AdminMenuPage` 182 / 4
3. web-staff `mozo/TomaPedidosPage` 152 / 6
4. web-admin `mozos/MozosPage` 124 / 4
5. web-cliente `EtiquetarPedidosPage` 114 / 4
6. web-cliente `MisPedidosPage` 111 / 3
7. web-staff `mozo/PedidosPage` 80 / 5
8. web-staff `cocina/CocinaPage` 73 / 5
9. web-admin `gerente/PedidosPage` 73 / 4
10. web-staff `gerente/PagosGerente` 71 / 4

**PRs abiertos hoy** (los tres con CI y Sonar en verde; falta que Coty los revise y los mergee)

| PR | Rama | Worktree | Commits | CI |
|---|---|---|---|---|
| #397 refactor 3 | `refactor/pantalla-comensal` | `../MenYU-pr383` | `b84a5c9` | `39313433271` ✅ |
| #398 timer de `PagosPage` | `fix/pagos-page-timer-desmontaje` | `../MenYU-fix-pagos` | rojo `33d6146` · verde `3488702` | rojo `39313815527` ❌ · verde `39314277183` ✅ |
| #399 aviso de pedido pagado | `fix/pedido-pagado-desde-api` | `../MenYU-fix-pagado` | rojo `bdc1318` · verde `cbd66b0` | rojo `39314307287` ❌ · verde `39314661875` ✅ |

El CI solo corre en `pull_request` y en `push` a `main`: para obtener el run rojo hay que abrir el PR con el commit rojo y pushear el verde después.

**Refactor 3 (#397):** rebase limpio sobre `main` (`8edc3de` → `b84a5c9`). Mismo diff: 8 archivos, −627 / +402, **225 líneas netas menos**. No toca ningún spec.
- web-cliente: typecheck y lint ok, 705 tests en verde.
- **Snapshots del DOM:** no se pudo reproducir el recuento de estados anotado el 19/10 a la madrugada, porque cómo se contaba se perdió con el scratchpad. Se compararon dos variantes, y en las dos los 65 tests dan el mismo DOM antes y después, con captura determinista:
  - **A**, la receta de abajo tal cual (estados volcados en `afterEach`): **101 estados**, idénticos incluso sin normalizar.
  - **B**, con el observer vivo hasta que el `cleanup` de Testing Library desmonta: **223 estados**, idénticos.
- **Control negativo:** cambiar 1 px un ancho en `PantallaComensal` cambia el DOM de 35 tests, y los 65 tests siguen verdes.
- **Sonar del PR:** 100 % de cobertura y 0,0 % de duplicación en código nuevo (268 líneas). Las 6 pantallas suman 355 de las 1.880 líneas duplicadas: si desaparecen, `main` queda en **≈ 3,9 %**.

**Timer de `PagosPage` (#398):** era la causa del test inestable de web-admin (ver la sección anterior).
- Rojo: test nuevo en `PagosPage.spec.tsx`. Registra un pago, desmonta con `cleanup()`, avanza el reloj falso 2,5 s y exige `vi.getTimerCount() === 0`. Falla con 1, en el paso Test del CI.
- Verde: `useEffect(() => () => clearTimeout(toastTimer.current), [])`, como `MensajePage`. web-admin queda con 488 tests.

**Aviso de pedido pagado (#399):** es el candidato registrado en Jira el 18/10. `GET /api/pedidos` manda `pagado: boolean`, pero las pantallas leían `pago?.estado`.
- Rojo: los fixtures pasan a `pagado`. Además se suma `pagado?: boolean` a `PedidoAdmin` y `PedidoRico`, porque el typecheck (que también compila los specs) corre antes que los tests: sin ese campo, el CI fallaba por tipos y no por el test.
  - En local fallan 3 tests: web-admin `PedidosPage` e `HistorialPage`, y web-staff `PedidosPage`.
  - En el CI turbo corta en la primera falla, la de web-staff.
- Verde: las pantallas leen `pedido.pagado === true` y `pago` sale de los dos tipos. Pasan 487 tests de web-admin y 120 de web-staff.
- Ni los commits ni el PR mencionan otros candidatos.
- **Falta:** cargar los SHAs y los runs en Jira y en `privado/jira-bloque.md`.

**Escaneo de timers (solo lectura, sobre `a4c4c53`):** web-admin, web-staff y web-cliente tienen 24 `setTimeout`/`setInterval`; 14 se limpian al desmontar. Estos 10 no:

| Archivo:línea | Qué hace | Test que desmonte |
|---|---|---|
| web-admin `pagos/PagosPage.tsx:518` | oculta el aviso (2,5 s) | Sí desde #398 |
| web-admin `gerente/TomaPedidosPage.tsx:701` | vuelve a mesas y recarga (2 s) | No |
| web-admin `mozos/MozosPage.tsx:1128` | cierra el alta de gerente (1,5 s) | No |
| web-admin `tables/TablesPage.tsx:564` | oculta "guardado" (2 s) | Desmonta en otro escenario |
| web-staff `gerente/PagosGerente.tsx:258` | oculta el aviso (2,5 s) | Desmonta sin el aviso activo |
| web-staff `mozo/PagosMozo.tsx:177` | oculta el aviso (2,5 s) | No hay spec |
| web-staff `mozo/TomaPedidosPage.tsx:520` | vuelve a mesas y recarga (2 s) | No |
| web-staff `cocina/CocinaPage.tsx:94` | cierra el `AudioContext` (1,2 s), sin estado de React | No lo cubre |
| web-cliente `discovery/DiscoveryPage.tsx:83` | scroll (0 ms, con `?.`) | No |
| web-cliente `restaurante/IngresoMesaPage.tsx:76` | foco en el PIN (0 ms, con `?.`) | Desmonta en otro escenario |

Los de 0 ms y el del audio son inofensivos. Los que importan son los que actualizan estado: `PagosGerente` y `PagosMozo` repiten el patrón de `PagosPage`. No se tocó nada.

**SCRUM-37** ("Tests e2e del backend en CI con Postgres efímero"): **no existe**. El ticket está en "Por hacer" y sin asignar. Los e2e (`jest.e2e.config.js`, `sessions.e2e-spec.ts`) corren contra la base Supabase compartida, y `ci.yml` no tiene un service de Postgres ni un job de e2e.

**Worktrees**
- `../MenYU-pr383`: #397.
- `../MenYU-fix-pagos`: #398, nuevo.
- `../MenYU-fix-pagado`: #399, nuevo.
- `../MenYU-ci`: no se toca.
- El checkout principal sigue en `refactor/historial-sesiones-compartido`, con `Documentacion/datos-de-prueba-local.md` modificado y sin commitear; no se tocó.
- Después de los merges se pueden borrar `../MenYU-fix-pagos` y `../MenYU-fix-pagado`.

**Pendiente al retomar** (en este orden)
1. **Coty:** revisar y mergear #397, #398 y #399. Tocan archivos distintos; #398 y #399 los dos tocan web-admin, pero en pantallas distintas.
2. **Con el #397 en `main`:** leer Sonar de `main` y comparar la duplicación con el ≈ 3,9 % esperado.
3. **Con el #399 en `main`:** pasar SHAs, runs y merge a Jira y a `privado/jira-bloque.md`.
4. **Decidir:**
   - un PR rojo/verde para los timers de `PagosGerente` y `PagosMozo`, con el mismo patrón que el #398 (`PagosMozo` no tiene spec);
   - el PR de accesibilidad de los 4 code smells (sigue pendiente de la sección anterior);
   - el siguiente refactor de duplicación: `TomaPedidosPage` (web-admin 198 y web-staff 152).
5. **SCRUM-37:** queda para otro día.
6. Siguen igual los puntos 6 a 9 de la lista anterior: el script de fuerza bruta para Coty, el **ensayo de producción del jueves 22/10**, los **umbrales del gate el viernes 23/10** y el PR único de esta bitácora.

> Esta lista quedó superada: ver "Pendiente al retomar" en la sección del 19/10 (noche).

### 19/10/2026 (noche, UTC): merges de #398 y #399, Sonar, código nuevo y plan de SCRUM-37

Horas en UTC. Solo lectura, salvo la corrección de esta bitácora (`b4ff0a5`: los estados del DOM del refactor 3 pasan a 101 y 223; ya no queda ningún "165"). No se mergeó nada desde esta sesión.

**Merges**

| PR | Merge | SHA | Último CI verde de la rama | CI de `main` |
|---|---|---|---|---|
| #395 | 19:20:58 | `78be010` | | `39310239261` |
| #396 | 19:29:52 | `a4c4c53` | `39310384767` (`7780925`) | `39311475842` |
| #397 | **Abierto** | | `39329007639` (`9873452`) | |
| #398 | 21:11:07 | `6b680c4` | `39314277183` (`3488702`) | `39325483016` |
| #399 | 21:26:48 | `032f919` | `39325519021` (`ce4ba8f`, con `main` mergeado) | `39327555239` |

- El #397 tiene `main` mergeado (`9873452`, 21:37), CI y Sonar en verde. La rama local de `../MenYU-pr383` quedó 8 commits atrás; no se hizo pull.

**Sonar sobre `main` en `032f919`** (análisis de las 21:30; gate OK)
- Duplicación **4,8 %** (1.880 líneas, 101 bloques); cobertura de líneas **81,6 %** (4.740 sin cubrir de 25.804) y mixta **83,5 %**.
- El ≈ 3,9 % depende del #397, que todavía no entró.

**Por qué la cobertura de líneas bajó de 82,0 % a 81,6 % con el #395** (lcov de los runs `39180630317` y `39310239261`): ningún archivo perdió cobertura. Las líneas sin cubrir pasan de 4.735 a 4.734; el #395 sacó unas 520 líneas cubiertas (las copias del modal), y por eso las mismas líneas sin cubrir pesan más. Los únicos archivos que cambian son los del refactor, más `packages/ui/editar-pedido/index.ts` (0/1, la línea del `export`). El #397 va a tener el mismo efecto.

**Código nuevo y gate** (API pública de Sonar, sin cambiar nada)
- **Definición:** `previous_version` en el proyecto y en `main`, heredada de la instancia (`parentOrigin: INSTANCE`). El período arranca el 17/10/2026 a las 00:10:40.
- **Condiciones:** las 6 de siempre (calificaciones A de confiabilidad, seguridad y mantenibilidad; `new_coverage` < 30; `new_duplicated_lines_density` > 10; hotspots revisados al 100 %). El nombre del gate no se puede leer sin ser miembro de la organización.
- **Valores en `main`:** `new_coverage` **99,1 %** (líneas 99,6 %: 809 a cubrir, 3 sin cubrir, las tres en `packages/ui`); `new_duplicated_lines_density` **0,1 %** (14 líneas sobre 14.002). El divisor incluye los specs: solo con los fuentes son 1.184 líneas nuevas, y la densidad da 1,2 %.
- **Con 80 % y 5 % pasaría hoy:** margen de 19,1 pp en cobertura y 4,9 pp en duplicación (3,8 pp contando solo fuentes).
- **"Reference branch":** no aplica a `main`, que no puede compararse contra sí misma.
- **"Number of days"**, simulado con `git blame` sobre el lcov de `032f919` y contando desde el viernes 23/10. El método reproduce el corte actual: 826 líneas y 99,6 %, contra 809 y 99,6 % de Sonar.

| Días | Líneas a cubrir | Cobertura de líneas | Qué la baja |
|---|---|---|---|
| 7 | 826 | 99,6 % | igual que hoy |
| 14 | 5.697 | 95,9 % | `packages/ui`: `ItemMenuFila` 71, `PrecioConDescuento` 46 |
| 30 | 6.183 | 91,5 % | web-staff `CobroModal.tsx`, 247 sin cubrir |
| 90 | 7.731 | 89,9 % | más `ElegirNombrePage` y `useEtiquetado` |

  - Es cobertura de líneas; la mixta que mira el gate da algo menos (hoy, medio punto). La duplicación con ventanas largas no se simuló; probablemente sube.
- **Alternativa:** dejar "Previous version" y mandar `sonar.projectVersion` con el tag del deploy, para que el código nuevo sea "desde el último release". Empezaría con el ensayo del jueves.

**SCRUM-37: plan** (no se implementó)
- **Specs:** 1 archivo, `apps/backend/src/sessions/sessions.e2e-spec.ts`, con 9 tests de `POST /api/sessions/open` (`jest.e2e.config.js`, `--runInBand`).
- **CI:** un job `e2e-backend` en paralelo al `ci`, con `services: postgres` (imagen oficial, misma versión mayor que Supabase, a confirmar) y healthcheck `pg_isready`. `DATABASE_URL` y `DIRECT_URL` a `localhost` y un `JWT_SECRET` de test. `StorageService` crea el cliente de Supabase recién cuando se usa, así que no hace falta para arrancar.
- **Migraciones:** `pnpm --filter @menyu/api exec prisma migrate deploy` antes de los tests, no `db push`, para comprobar que las 31 migraciones se aplican desde cero. `unaccent` y `gen_random_uuid` existen en la imagen oficial.
  - **Riesgo:** las migraciones de drift (`fix_drift_completo`, `reconcile_schema_drift`, `baseline_…`) y los 3 `.sql` sueltos en `prisma/`. Primer paso: aplicarlas sobre un Postgres vacío y comparar con `prisma migrate diff` para confirmar que no queda drift.
- **Tiempo (estimado, sin medir):** 1 a 1,5 min el job. En paralelo no alarga el CI (hoy ≈ 7 min, Sonar sola 197 s); en el mismo job sumaría ≈ 1 min.
- **Hallazgo:** `clearE2eData` borra **todos** los clientes invitados de la base (`email: null, passwordHash: null`), no solo los del test. Hoy los e2e corren contra la base Supabase compartida.

**Worktrees**
- `../MenYU-pr383`: #397 (local atrás del remoto; no se hizo pull).
- `../MenYU-fix-pagos` y `../MenYU-fix-pagado`: #398 y #399 ya mergeados, se pueden borrar.
- `../MenYU-bitacora`: `docs/bitacora-ensayo-produccion`, con `b4ff0a5` y esta entrada, sin push.

**Pendiente al retomar** (en este orden)
1. **Coty:** mergear el #397. Después, leer Sonar de `main` y comparar la duplicación con el ≈ 3,9 % esperado.
2. **#399 en Jira:** pasar merge (`032f919`, 21:26:48), runs (rojo `39314307287`, verde `39314661875` y `39325519021`, `main` `39327555239`) a Jira y a `privado/jira-bloque.md`.
3. **Antes del viernes, decidir la definición de código nuevo:** "Number of days" (con 30 días, ≈ 91,5 % de líneas) o `sonar.projectVersion` desde el tag. "Reference branch" no aplica a `main`.
4. **Decidir:**
   - un PR rojo/verde para los timers de `PagosGerente` y `PagosMozo` (`PagosMozo` no tiene spec);
   - el PR de accesibilidad de los 4 code smells;
   - el siguiente refactor de duplicación, `TomaPedidosPage` (web-admin 198 y web-staff 152).
5. **SCRUM-37:** plan arriba. Primer paso: migraciones sobre un Postgres vacío y `prisma migrate diff`. Decidir qué hacer con `clearE2eData`.
6. Pasarle a Coty las variables y el comando de `scripts/staging/fuerza-bruta.mjs`, sin valores.
7. **Jueves 22/10:** ensayo de producción con un tag `vX.Y.Z`. Anotar `check-ci`, deploy, smoke y el SHA de `/health`.
8. **Viernes 23/10:** subir los umbrales del gate (80 % y 5 % sobre código nuevo) y aplicar la definición de código nuevo elegida en el punto 3.
9. Abrir el PR único de esta bitácora después del ensayo.

> Esta lista quedó superada: ver "Pendiente al retomar" en la sección del 20/10.

### 20/10/2026: datos del informe y SCRUM-37 (migraciones y job e2e)

Horas en UTC. No se mergeó nada desde esta sesión. Se pusheó solo `ci/e2e-backend` y se abrió el PR #408.

**Último CI verde de cada rama**

| PR | Head al merge | Último CI verde de la rama | Merge |
|---|---|---|---|
| #394 | `21db047` | `39178833392` (terminó 19/10 00:06:24) | 19/10 00:24:23 (`8f56bd0`) |
| #395 | `f9e025a` | `39184346017` (terminó 19/10 01:20:31) | 19/10 19:20:58 (`78be010`) |
| #396 | `7780925` | `39310384767` (terminó 19/10 19:27:45) | 19/10 19:29:52 (`a4c4c53`) |

En los tres, el run verde es del head al merge. Para el #396 se corrigió la sección del 18/10 (cierre): el `39184409337` era de `f610ef4`, no el último verde.

**SCRUM-37, paso 1: migraciones sobre un Postgres vacío** (`main` = `8a2ac5b`, después del #407)
- Son **33** migraciones, no 31: el #407 sumó `auth_usuario_membresia` y `mozo_password_opcional`.
- La versión de Supabase no llegó, así que se corrió con `postgres:17.6` (la del `docker-compose.yml` del backend) y con `postgres:15` (la de `Documentacion/Doc_DB.md`), los dos en Docker local.
- En las dos versiones: `prisma migrate deploy` aplicó las 33 (33 terminadas y 0 revertidas en `_prisma_migrations`), y `prisma migrate diff --from-url … --to-schema-datamodel prisma/schema.prisma --exit-code` salió con exit 0 y una migración vacía. **No queda drift.**
- Lo que `migrate diff` no ve, revisado aparte en las dos: extensiones `plpgsql` y `unaccent`, y los CHECKs `item_menu` (descuento) y `membresia_ambito_check`. Los 3 `.sql` sueltos de `prisma/` ya están incluidos en las migraciones (`baseline_edicion_cantidad_editada` y `reconcile_schema_drift`): `pedido_edicion`, `pedido.updated_at` y `pedido_edicion_item.item_nombre` existen, y la FK que borra `fix_pedido_edicion_item.sql` no.

**Paso 2: job `e2e-backend`** (rama `ci/e2e-backend`, worktree `../MenYU-e2e`, PR #408)
- `e841c09`: el e2e mandaba `restaurantId`, pero el DTO es `restauranteId` desde `ddc3151` (15/05). El spec es del 06/05 y, como no corría en el CI, quedó viejo: el test "pin válido con sesión activa" daba 400.
- `ac05f95`: job nuevo en `ci.yml`, en paralelo al `ci`. Usa `services: postgres` (`postgres:17.6`, a confirmar con Supabase) con `pg_isready`, `timeout-minutes: 15` e instala solo `@menyu/api...`. Pasos: generate, `migrate deploy`, `migrate diff --exit-code` (corta si aparece drift) y `test:e2e`.
  - Sin secretos: `DATABASE_URL` y `DIRECT_URL` apuntan a `localhost`, y `JWT_SECRET` y `MP_ENCRYPTION_KEY` son de test. `CryptoService` exige `MP_ENCRYPTION_KEY` al arrancar `AppModule`.
- Verificación:
  - `actionlint` 1.7.12 dio exit 0.
  - En local, 9/9 contra 17.6 y contra 15.
  - Simulación de los pasos en `node:20` (Linux) con una copia limpia de `ac05f95`: 9/9 y exit 0. Los 551 s no sirven de referencia, porque el volumen de Windows es lento.
- Jest termina con exit 0, pero tarda unos 10 s en salir ("did not exit one second after"): el `Pool` de `pg` de `PrismaService` queda vivo hasta su `idleTimeout`. No se tocó.
- `clearE2eData` sigue borrando todos los clientes invitados. En el job no importa, porque la base es efímera, pero contra Supabase sí.

**Cómo decide `check-ci` y qué exige el ruleset**
- `check-ci` (`deploy-production.yml`) no mira la conclusión del workflow: busca el check run con el nombre `CHECK: CI — typecheck, lint, test, build`, que es el del job `ci`. El job nuevo es otro check run (`E2E — backend (Postgres efímero)`), así que **un e2e rojo no frenaba producción**.
  - **Decisión (opción a):** `39e4633` hace que `check-ci` exija los dos checks del commit (`CHECK_CI` y `CHECK_E2E`). Espera hasta 15 min en total y falla enseguida si alguno termina sin `success` o no tiene run. Se simuló con un `gh` falso en 8 casos: los dos en verde, uno en curso y después verde (para cada check), e2e rojo, e2e sin run, ci cancelado, rojo después de esperar y timeout. Los 8 dieron lo esperado y `actionlint` dio exit 0.
  - **Consecuencia:** un tag sobre un commit anterior a este PR no despliega, porque no tiene el check del e2e ("sin run"). **El ensayo del jueves 22/10 tiene que ser sobre un commit de `main` con el #408 mergeado.**
  - `ebb6b18`: el `postgres:17.6` del job lleva un comentario para confirmarlo con Supabase.
  - **PR #408** (head `39e4633`), CI run [`39438348924`](https://github.com/MenYUorg/MenYU/actions/runs/39438348924), todo en verde: `E2E — backend (Postgres efímero)` tardó **66 s** (14:20:41 a 14:21:47; migraciones, drift y 9/9 e2e), el `ci` 5 min 39 s y Sonar pasó. El e2e no alarga el CI.
  - Después de esos commits, `origin/main` seguía en `8a2ac5b` (no hubo nada que rebasear). Se repitió con 17.6: 33/33 migraciones, `migrate diff` con exit 0 y 9/9 e2e.
- El ruleset de `main` (16770555) exige un solo check: `CI — typecheck, lint, test, build` (integration 15368). Para que un e2e rojo bloquee el merge, Coty tiene que agregar `E2E — backend (Postgres efímero)`. Conviene hacerlo después de que el job haya corrido una vez, para que GitHub lo ofrezca en la lista.

**Sonar sobre `main` después del #397** (merge `e0f42e3`, 19/10 21:59:29; CI de `main` `39331707435`, en verde, con el gate `PASSED` a las 22:11:42)
- El análisis de `e0f42e3` ya no figura en Sonar: el housekeeping borró los del 19/10 salvo el de `8f56bd0`. El siguiente que queda es el de `67cb463` (#400, 20/10 03:08; CI de `main` [`39362326456`](https://github.com/MenYUorg/MenYU/actions/runs/39362326456)), que solo suma archivos fuera de `sonar.sources` (`vercel.json` de web-admin y web-staff, `scripts/vercel/ignorar-build.sh` y `Documentacion/WORKFLOW.md`). Por eso sus números son los del #397.

| | `032f919` (antes del #397) | `67cb463` (= #397) | `8a2ac5b` (hoy, #407) |
|---|---|---|---|
| Duplicación | 4,8 % (1.880 líneas, 101 bloques) | **3,9 %** (1.525 líneas, 88 bloques) | 3,9 % (1.525, 88) |
| Cobertura de líneas | 81,6 % | **81,5 %** (4.740 sin cubrir de 25.574) | 81,3 % (4.817 de 25.767) |
| Cobertura mixta | 83,5 % | **83,4 %** | 83,1 % |
| Gate | OK | **OK** | OK |

- Dio el ≈ 3,9 % esperado: salen 355 líneas duplicadas, las de las 6 pantallas.
- La cobertura de líneas baja 0,1 pp por lo mismo que con el #395: las líneas cubiertas que salen hacen pesar más las que no tienen cobertura (4.740 sin cubrir, igual que antes).
- Hoy, sobre código nuevo: `new_coverage` 88,0 % y `new_duplicated_lines_density` 0,1 %, con las 6 condiciones en OK. Con el umbral del 80 % pasaría, pero el margen bajó de 19,1 a 8 pp por los merges del 20/10.

**Para el informe: run de cada commit del #397**

| Commit | Qué es | CI de `main` | Para qué sirve |
|---|---|---|---|
| `e0f42e3` | Merge del #397 (19/10 21:59:29) | [`39331707435`](https://github.com/MenYUorg/MenYU/actions/runs/39331707435) | Gate `PASSED` en el CI del merge |
| `67cb463` | Merge del #400 (20/10) | [`39362326456`](https://github.com/MenYUorg/MenYU/actions/runs/39362326456) | El análisis de Sonar que quedó con los números del #397 |

Si el informe cita los números de Sonar, hay que nombrar los dos commits: el merge del #397 es `e0f42e3`, no `67cb463`.

**Worktrees**
- `../MenYU-e2e`: `ci/e2e-backend`, el #408. Se puede borrar después del merge.
- `../MenYU-fix-pagos` y `../MenYU-fix-pagado` (#398 y #399, ya mergeados), y `../MenYU-pr383` (#397, ya mergeado): se pueden borrar.
- `../MenYU-bitacora`: `docs/bitacora-ensayo-produccion`, con esta entrada commiteada y sin push.
- Los contenedores de Postgres de las pruebas (`e2e-pg17`, `e2e-pg15` y `e2e-sim-pg`) y la red `e2e-sim` quedaron borrados. Las imágenes `postgres:15`, `node:20` y `rhysd/actionlint:1.7.12` siguen descargadas.

**Pendiente al retomar** (en este orden)
1. **Coty:**
   - revisar y mergear el #408;
   - después, agregar `E2E — backend (Postgres efímero)` como check requerido en el ruleset de `main` (16770555). Ya corrió una vez, así que GitHub lo ofrece en la lista.
2. **Versión de Postgres de Supabase:** confirmarla (Settings → Infrastructure, o `select version();`). Si no es 17, cambiar la imagen en `ci.yml`: las migraciones ya se probaron también con 15.
3. **#399 en Jira:** pasar merge (`032f919`, 21:26:48), runs (rojo `39314307287`, verde `39314661875` y `39325519021`, `main` `39327555239`) a Jira y a `privado/jira-bloque.md`.
4. **Antes del viernes, decidir la definición de código nuevo:** "Number of days" (con 30 días, ≈ 91,5 % de líneas) o `sonar.projectVersion` desde el tag. El margen sobre código nuevo bajó a 8 pp (88,0 %).
5. **Decidir:**
   - un PR rojo/verde para los timers de `PagosGerente` y `PagosMozo` (`PagosMozo` no tiene spec);
   - el PR de accesibilidad de los 4 code smells;
   - el siguiente refactor de duplicación, `TomaPedidosPage` (web-admin 198 y web-staff 152);
   - qué hacer con `clearE2eData` (borra todos los clientes invitados) y con el `Pool` de `pg` que demora el cierre de Jest.
6. Pasarle a Coty las variables y el comando de `scripts/staging/fuerza-bruta.mjs`, sin valores.
7. **Jueves 22/10:** ensayo de producción con un tag `vX.Y.Z` **sobre un commit con el #408 mergeado**. Anotar `check-ci` (los dos checks), deploy, smoke y el SHA de `/health`.
8. **Viernes 23/10:** subir los umbrales del gate (80 % y 5 % sobre código nuevo) y aplicar la definición de código nuevo elegida en el punto 4.
9. Abrir el PR único de esta bitácora después del ensayo.

### 21/10/2026: merge del #408, tests inestables en `main`, caída de Railway, tags y PRs de calidad (k6 y E2E)

Horas en UTC (ART = UTC − 3). Desde esta sesión se mergearon el #408 y el #417. Además se pushearon y abrieron en borrador el #419, el #420, el #421 y el #422: ninguno está mergeado. No se crearon tags, no se hizo push a `main` y no se corrió nada contra producción ni contra Mercado Pago. Contra Supabase solo se hizo un `select` de la versión (más abajo).

**#408 (SCRUM-37): conflicto, merge y CI de `main`**
- **El conflicto:** uno solo, en `.github/workflows/ci.yml`. `main` había sumado `--filter=@menyu/web-auth` al Build, y la rama, el job `e2e-backend` debajo. Quedaron los dos. Merge de `origin/main` en la rama: `8e9d31c`. CI de la rama: `39661462996`, en verde.
- **Merge:** 19:32:48, `3dab479`. El CI de `main` (`39662588187`) salió **rojo** por un test inestable de `@menyu/auth-client`, `RequireAuth › una vez adentro, si en otra pestaña entró otra cuenta, recarga`. El mismo código había pasado en la rama.
- **#417** (`d42beed`): el test disparaba un solo `focus` apenas aparecía el perfil. El listener se registra en un `useEffect` posterior, así que el evento se podía perder. Ahora el `focus` se reintenta dentro del `waitFor`.
  - **Cómo se verificó:** en local pasaba 15 de 15. Demorando 50 ms el registro del listener, el test original falla con el mismo error y el nuevo pasa.
  - **CI:** de la rama `39664495553`, y `39667032362` después de actualizarla con `main`. Merge 20:09:55, `734cba2`. El repo no permite auto-merge y el ruleset exige la rama al día: hubo que actualizarla y esperar el CI.
- **El CI de `main` del `734cba2`** (`39667914465`) también salió **rojo**, por otro test inestable, ahora de web-staff: `MesasPage (mozo) › detalle › si la sesión abierta en el detalle se cierra por socket, se limpia`. Con `gh run rerun --failed` (intento 2) pasó a verde.
- **#418** (`lautiod`, "un token de invitado ya no lee pedidos ni llamados, y un comensal solo actúa sobre su sesión"): merge 21:20:52, `12c7bb4`. Es el HEAD de `main` al cierre. CI de `main`: `39678039006`, en verde.
  - **Tests que pasan:** backend 1.671 (más 25 salteados de `historial-root.base.spec.ts`, que necesita `URL_DE_PRUEBA`), web-admin 686, web-cliente 729, web-staff 120, web-auth 53, `packages/ui` 41 y `packages/auth-client` 79. **Total: 3.379.** Además, 9 e2e.
- **Ruleset de `main` (16770555):** sigue exigiendo un solo check, `CI — typecheck, lint, test, build`. `E2E — backend (Postgres efímero)` todavía no está.
- **Postgres de Supabase:** un `select` de solo lectura sobre la `DIRECT_URL` de `apps/backend/.env.qa` dio **versión mayor 17**. La `.env` local apunta a un Postgres que no es Supabase. Se mantiene `postgres:17.6` en el job; el comentario "a confirmar con Supabase" de `ci.yml` se corrige en el próximo PR que toque ese archivo. **Producción no se consultó.**

**Railway: caída del 21/10 y `Deploy — Staging`**
- **El incidente:** status.railway.com tiene abierto desde las 07:24 un "Major Outage" con los builds pausados. A las 22:10 se sumó un incidente de seguridad con rotación de credenciales. A las 01:22 del 22/10 seguía **sin resolver**, y el estado dice que afectó **variables de entorno y credenciales** de los servicios.
- **Los deploys a staging que fallaron:**
  - `39534619683` (#410, 02:43): `railway up` con 502.
  - `39610446322` (#415, 13:43): `Invalid RAILWAY_TOKEN` en `Set APP_COMMIT_SHA`.
  - `39662588357` (#408): el intento 1 dio `Invalid RAILWAY_TOKEN`. `RAILWAY_TOKEN_STAGING` se actualizó a las 19:55:27, y en el intento 2 (19:56) ese paso pasó y falló `railway up` con "Deploys have been paused" y 502. No se puede separar si lo arregló el token nuevo o la API de Railway que volvía.
  - `39678038916` (#418, 21:21): 502 y "Deploys have been paused".
- **Último deploy en verde antes del primer fallo:** `39556008907` (06:32, `9e8eaba`). Es lo último que llegó a staging. Entre ese run y el primer fallo no cambiaron ni el workflow ni la CLI (`@railway/cli@5.70.0` desde `ba61590`).
- **No se re-ejecutó el deploy a staging:** Railway sigue con los builds pausados.
- **Cómo se usan los secrets:** staging usa `RAILWAY_TOKEN_STAGING` y `RAILWAY_SERVICE_ID_STAGING` en `variable set` y en `up`; producción, los `_PROD`. `deploy-production.yml` no mezcla secrets.

**Tags y producción**
- **Los tags `v1.0.6`, `v1.0.7` y `v1.1.0` ya existen.** Son livianos y los empujó `lautiod`; ningún workflow crea tags.

| Tag | SHA | Run de `deploy-production.yml` | Resultado |
|---|---|---|---|
| `v1.0.6` | `39522af` | `39381340103` (20/10 06:36) | Todo en verde; smoke de backend y 3 frontends |
| `v1.0.7` | `a6fb6b1` | `39394686027` (20/10 08:37) | Todo en verde; smoke de backend y 3 frontends |
| `v1.1.0` | `b4d2dcb` | `39552799290` (21/10 06:00) | Todo en verde; smoke de backend y 4 frontends (con web-auth) |

- **`check-ci` de esos tres:** revisó solo el check `CI` y tardó menos de 1 s. La exigencia del e2e entró recién con el #408.
- **Qué sirve producción:** según el log de `39552799290`, `/health` muestra `b4d2dcb`.
- **SHA del ensayo:** hoy `12c7bb4` cumple las dos condiciones de `check-ci` (CI y E2E en verde).

**Sonar sobre `main`**
- **El último análisis es de `734cba2`** (22:11:39), por el re-run del CI. Llegó **después** del de `12c7bb4` (21:25:25), así que `main` en Sonar muestra un commit anterior al HEAD. El próximo push a `main` lo corrige.
- **Números**, iguales en los análisis de `77d7622`, `12c7bb4` y `734cba2`:
  - cobertura de líneas **83,5 %** y mixta **85,0 %** (4.817 sin cubrir de 29.113);
  - duplicación **3,4 %** (1.525 líneas, 88 bloques);
  - `new_coverage` **94,8 %** y `new_duplicated_lines_density` 0,05 %;
  - gate **OK**, con las 6 condiciones.
- **Por app (líneas):** backend 92,1 %, web-admin 84,4 %, web-cliente 85,8 %, web-staff 72,1 %, web-auth 93,2 %, `packages/ui` 65,0 % y `packages/auth-client` 100 %.
- **web-auth y auth-client:** web-auth entró al repo y a `sonar.sources` con el #409 (`e05ff5a`), y `packages/auth-client`, con el #415 (`ef98793`).

**PRs nuevos, todos en borrador y sin mergear**

| PR | Rama | Qué | Commits y runs |
|---|---|---|---|
| #419 | `fix/test-mesaspage-sesion-cerrada-socket` | `MesasPage` (web-staff) reabría el socket cada vez que se abría el detalle de una mesa, y un `sesion:cerrada` que llegaba antes del efecto nuevo lo atendía el handler viejo. El handler pasa a una actualización funcional y el efecto deja de depender del detalle | Rojo `54a4a7c` (test "abrir el detalle no reabre el socket"; run rojo de `main` `39667914465`, intento 1). Verde `dbabc7a` (`39685607299`). En local, el spec pasó de fallar 1 de 30 a 0 de 30, y la suite de web-staff dio 10 de 10 (121 tests) |
| #420 | `fix/e2e-limpieza-por-marcador` | `clearE2eData` pasa a borrar solo lo de la corrida, con un marcador por corrida (`e2e-<run_id>-<intento>-` en CI y aleatorio en local). `jest.e2e.config.js` no deja correr los e2e contra una base que no sea local o el service container del CI, sin excepción | Rojo `bee62ce` (`39704886533`: falla solo el test nuevo, 1 de 10). Verde `06fefb2` (`39705620870`, 10 de 10). Probado en local contra un Postgres 17.6 descartable en Docker, ya borrado. El 22/10, `e0ddf05` quitó la salvedad y sumó el test de la guarda (`39784392541`, verde) |
| #421 | `feat/k6-carga` | Pruebas de carga con k6: `scripts/carga/` (humo, stress y soak, con guardas de staging confirmado y nunca producción), workflow `carga-k6.yml` (solo `workflow_dispatch`, k6 2.3.0 fijado por digest) y `docs/calidad/k6.md` | `d7725cd`, CI `39709392785` (las guardas suman 31 tests al paso "Test — smoke scripts", que da 48 de 48). Probado solo contra un servidor falso local; **sin corridas contra staging** |
| #422 | `docs/e2e-supabase` | `docs/calidad/e2e-supabase.md`: diseño del E2E contra staging (flujo, datos por marcador, cuándo corre, secrets, usuario de base, riesgos y reporte). Sin implementación | CI en verde |

- **Deployments de Vercel:** ninguno de los cuatro PRs disparó estados ni deployments. Al mergear:
  - el #420 dispara `Deploy — Staging` (`*.e2e-spec.ts` y `jest.e2e.config.js` no caen en `paths-ignore`);
  - el #421 lo dispara una vez (cambia `deploy-staging.yml`); después, `scripts/carga/**` y `carga-k6.yml` quedan en `paths-ignore`;
  - el #419 lo dispara, porque cambia código de web-staff;
  - el #422 no.
- **#420, salvedad de base remota:** se quitó el 22/10/2026 en `e0ddf05`. Los e2e no corren contra una base que no sea local o el service container del CI, sin excepción.
- **Contrato de Mercado Pago** (`test/mercadopago-contrato`): **no se abrió**. No hay payloads reales en el repo ni en el disco: el spec del proveedor usa objetos armados a mano. Faltan los de `merchant_order` (aprobado que cubre, `in_process`, `rejected`, parcial o sin pagos), los de `payment` (con orden y sin orden; `approved`, `rejected`, `in_process`, `pending` y uno fuera del mapa) y la query de la notificación en sus dos formas. Los consigue Coty desde el panel.

**Jira**
- `privado/jira-bloque-2.md` (fuera del repo): los tests de regresión de QrScanner, #386, #388, #398 y #399, con su archivo y su `describe › it`, y lo que faltaba del #386 y del #388.
- En `jira-bloque.md`, el #383, el #386 y el #388 figuran "abierto": están mergeados (`52a5448`, `6438e72` y `40bbf50`).

**Worktrees y estado local**
- `../MenYU-e2e`: quedó en `docs/e2e-supabase`. Ahí también están las ramas de los #419, #420 y #421. Hay dependencias instaladas y `@menyu/types`, `@menyu/ui` y `@menyu/auth` compilados (los `dist` no se commitean).
- `../MenYU-bitacora`: `docs/bitacora-ensayo-produccion`, con esta entrada commiteada y sin push.
- El servidor falso de k6 y el contenedor `menyu-e2e-tmp` quedaron apagados. `menyu-postgres` no se tocó. Quedaron descargadas las imágenes `grafana/k6:2.3.0` y `postgres:17.6`.

**Pendiente al retomar** (en este orden)
1. **Railway (urgente):** el incidente de seguridad afectó variables de entorno y credenciales. Revisar las variables de los servicios de staging y producción (base, `JWT_SECRET`, claves de Mercado Pago y de Supabase) y rotar lo que corresponda; también decidir si se rota `RAILWAY_TOKEN_PROD`, que es del 23/05. Cuando vuelvan los builds, re-ejecutar `39678038916` (`gh run rerun 39678038916 --failed`) y anotar el SHA que muestra staging.
2. **Ensayo de producción:** elegir un número de tag nuevo (`v1.1.1` o `v1.2.0`) sobre un commit con CI y E2E en verde (hoy `12c7bb4`). Si Railway sigue caído, el deploy falla: no crear el tag hasta que vuelva.
3. **Coty:** agregar `E2E — backend (Postgres efímero)` como check requerido en el ruleset 16770555.
4. **Revisar los borradores** #419, #420, #421 y #422.
5. **k6:** confirmar los umbrales iniciales y autorizar el primer humo (`gh workflow run carga-k6.yml -f escenario=humo -f confirmar=si`). Decidir si se implementa el flujo que escribe (sección 5.4 de `k6.md`).
6. **E2E contra staging:** elegir entre un workflow aparte o un job en `deploy-staging.yml`; crear el restaurante, el plato y el mozo de prueba, el usuario `e2e_staging`, las funciones y los secrets del doc.
7. **Mercado Pago:** fuera del alcance del TP: los tests usan objetos armados a mano; el contrato con payloads reales y la revisión de la conexión desde la interfaz quedan para la tesis.
8. **Jira:** pasar a Jira lo de `privado/jira-bloque-2.md` y actualizar los estados en `jira-bloque.md`.
9. **Viernes 23/10:** subir los umbrales del gate y aplicar la definición de código nuevo (pendiente desde el 20/10).
10. Abrir el PR único de esta bitácora después del ensayo.
