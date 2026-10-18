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

## Pendientes

1. **Cambiar el código nuevo de `main`** en SonarCloud (Administration → New Code) a "Number of days" o "Reference branch". Hoy la referencia queda fija en el análisis automático del 17/10 (`7072d67`), que tuvo otro alcance y no tuvo cobertura, y como no se manda `projectVersion` nunca avanza. Después del cambio, verificar por API en el próximo análisis de `main` (`api/qualitygates/project_status?projectKey=MenYUorg_MenYU&branch=main`, campo `periods`).
2. **Subir los umbrales del gate el 23/10/2026.**
3. **Confirmar la Deployment Protection de las previews de Vercel** (queda a cargo del equipo). En el run `39032870161` los tres frontends respondieron 200, así que hoy no hay protección que bloquee el smoke.
4. **Producción:** #377 mergeado y variables `PROD_WEB_*_URL` cargadas (17/10/2026). Falta el tag de ensayo y anotar su resultado (`check-ci`, deploy, smoke y el SHA de `/health` de producción).
5. Opcionales que salieron en el camino:
   - Fijar la versión de `@railway/cli` en los workflows (hoy `@latest` en el `variable set` y en el `up`).
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

**Pendiente al retomar**
1. Revisión y merge de #384 (antes de mergear, mirar el Ignored Build Step del panel de Vercel), #385 y #386.
2. Probar el #384 con un push que solo toque el backend: las previews de menyu-admin, menyu-cliente y menyu-staff tienen que cancelarse.
3. Correr `scripts/staging/fuerza-bruta.mjs` contra staging antes de un tag (falta un restaurante de staging y su PIN).
4. Cobertura: web-cliente (63,4 % local), después web-staff y web-admin.
