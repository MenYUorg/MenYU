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
| Deuda de pagos, PR B: el webhook responde después de procesar, pagos para revisión y la firma en observación (PR #454) | **Mergeado** (05/11/2026 15:39 ART, `0a4c9df`). CI del PR en verde (`42083407587`), gate de Sonar `OK` con 100 % de cobertura nueva, y en `main` el CI `42086389972` y el deploy de staging `42086389508` en verde. Falta el checklist de staging, que decide el PR C |
| Caja: modelo de cajas, turnos, movimientos y arqueo (#355, PR #460) | **Mergeado** (10/11/2026, `9633939`). Migración `20261110120000_caja_turnos_arqueo`. CI en verde y gate de Sonar `OK` con 100 % de cobertura nueva |
| Caja #357 A1: grupo `CAJA`, ABM de cajas, apertura de turno y reasignación de mesas (PR #461) | **Mergeado** (10/11/2026, `c393dcc`). CI en verde y gate de Sonar `OK` con 99,6 % de cobertura nueva. Rutas: 127 → 133 |
| Caja #357 A2: movimientos y cierre con arqueo (PR #462) | **Mergeado** (11/11/2026, `560e81e`). CI en verde y gate de Sonar `OK` con 100 % de cobertura nueva. Rutas: 133 → 135 |
| Caja #357 B1: resumen, historial y detalle del turno (PR #463) | **Mergeado** (11/11/2026, `3fcb2f0`). CI en verde (run `43090550370`) y gate de Sonar `OK` con 98,8 % de cobertura nueva. Rutas: 135 → 138. El CI y el deploy de staging de `3fcb2f0` estaban en `queued` a las 20:36 UTC: **mirarlos al retomar** |
| Caja #357 B2: filtro por mozo en `GET /mesas` y `GET /sessions/activas` (cierra #357) | **Mergeado** (14/11/2026, `d5c7450`). Commits `5c87690`, `5023417` y `24e35d3`. CI en verde (run `43456351501`) y gate de Sonar `OK` con 100 % de cobertura nueva. e2e: 9 → 10 suites, 143 → 154 tests. Rutas sin cambios (138) |
| #358 A: los cobros del personal van a una caja del turno (PR #470) | **Mergeado** (16/11/2026, `7a502d9`). CI `43879611515` y deploy de staging `43879611457` en verde |
| #358 B: Mercado Pago a la caja del turno (PR #471) | **Mergeado** (16/11/2026, `87a183e`). Unitarios 2806, e2e 183. CI `43917383346` y deploy `43917383644` en verde. #358 sigue abierto: los PR usaron "Refs" y el texto del issue quedó desactualizado (la decisión sobre Mercado Pago se revisó el 16/11/2026: todo pago aprobado va a una caja) |
| #359 PR 0: `GET /cajas/abiertas` y `GET /turnos/preparacion` (PR #472) | **Mergeado** (16/11/2026, `a52385f`). Unitarios 116 / 2832, e2e 13 / 189, rutas 138 → 140. CI `43935297337` y deploy `43935297488` en verde |
| #359 PR 1: cobro con caja y propina, y bloqueo sin turno, en web-staff (PR #473) | **Mergeado** (18/11/2026, `9246505`). CI `44308317618` y deploy de staging `44308317372` en verde |
| #359 PR 2: abrir el turno, verlo y reasignar sus mesas en `/mozo/caja` (PR #474) | **Mergeado** (18/11/2026, `25852b5`). CI `44319757396` y deploy de staging `44319757359` en verde |
| #359 PR 3: movimientos de caja (ingresos y egresos) en `/mozo/caja` (PR #475) | **Mergeado** (18/11/2026, `0f65830`). CI `44365577904` y deploy de staging `44365578005` en verde |
| #359 PR 4: cerrar el turno con arqueo ciego, resultado y resumen (PR #476) | **Mergeado** (18/11/2026, `df7e1ab`). CI `44382302485` y deploy de staging `44382302564` en verde. #359 sigue abierto (los PR usaron "Refs") |
| #360 PR 1: el cobro con caja, propina y advertencia de Mercado Pago en web-admin (PR #477) | **Mergeado** (18/11/2026, `ed08818`). CI `44408917528` y deploy de staging `44408917636` en verde |
| #360 PR 2: el ABM de cajas en `/admin/cajas` (PR #478) | **Mergeado** (19/11/2026, `7d33e5d`). CI `44522782812` y deploy de staging `44522783206` en verde |
| #360 PR 3: el historial y el detalle de los turnos de caja en `/admin/turnos` (PR #480) | **Mergeado** (19/11/2026, `ccd6c04`). CI `44541662085` y deploy de staging `44541662270` en verde. #360 sigue abierto (los PR usaron "Refs") |

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

> Esta lista quedó superada: ver "Pendiente al retomar" en la sección del 26/10.

### 26/10/2026: permiso del reporte de k6 (PR #437), Sonar del 25/10 y Mercado Pago caído

Horas en ART (UTC − 3). Las sesiones del 23/10 al 25/10 (corridas de k6, E2E contra staging #433, plan de pruebas v0.3 #434, v1.3.0) **no tienen entrada** en esta bitácora. Desde esta sesión solo se pusheó la rama `fix/k6-permisos-resultados` (PR #437, borrador) y se corrieron dos pruebas de carga contra staging. No se tocó `main` ni producción, y no se llamó a Mercado Pago.

**k6: el reporte no se guardaba**
- **Síntoma:** las tres corridas contra staging (humo `39981407930` del 23/10, stress `40100656575` y soak `40105801689` del 24/10) terminaron en verde **sin artifact**.
- **Causa, en los logs de los tres runs:** k6 no pudo abrir `/resultados/<escenario>-resumen.json` ("permission denied"). La carpeta la crea el usuario del runner y la imagen de k6 corre con otro usuario. Después, `upload-artifact` avisó "No files were found" (`if-no-files-found: warn`), así que el run no falló. No se confirmó con qué usuario corre la imagen: Docker no estaba levantado en la máquina.
- **Fix:** `chmod 777 resultados` antes del `docker run` (`.github/workflows/carga-k6.yml:75`), commit `6bd3c90`.
- **Validación,** con `workflow_dispatch --ref fix/k6-permisos-resultados` (sin mergear):

| Escenario | Run | Hora | Requests | Error | p95 | p95 `/health` | Artifact |
|---|---|---|---|---|---|---|---|
| Humo | `40319115538` | 08:59 | 141 | 0 % | 272,5 ms | 74,0 ms | `k6-humo-40319115538` |
| Stress | `40319384572` | 09:01 | 17.686 | 0 % | 253,6 ms | 48,2 ms | `k6-stress-40319384572` |

  Ningún umbral fallado y checks al 100 %. Los dos artifacts se bajaron y traen el JSON, sin la URL ni el host de staging. El soak no se repitió.
- **`docs/calidad/k6.md`** (commit `a3ed5aa`): sin `[PENDIENTE]`. Tabla con las cinco corridas. El p95 de `/health` de las del 23/10 y 24/10 queda "Sin dato": no está en el texto del log y el JSON no se guardó. Los umbrales no se cambiaron.
- **Plan de pruebas v0.4** (commit `beb7bb2`): `docs/calidad/plan-de-pruebas.md` reemplazado por el archivo que pasó Coty, sin cambios (mismo blob, `a5e9a33`).
- **PR #437:** los tres commits. CI de `a3ed5aa` en verde (`40321194680`). Al mergearlo no se dispara `Deploy — Staging`: `docs/**` y `carga-k6.yml` están en su `paths-ignore`.

**Sonar sobre `main`**
- **Último análisis:** 25/10 22:00:59, sobre `8b98247` (HEAD de `main`).
- **Números:** cobertura de líneas **87,3 %** (3.663 sin cubrir de 28.736), de condiciones **93,2 %** (525 de 7.763), mixta 88,5 %; duplicación **2,2 %** (1.006 líneas); gate **OK** con las 6 condiciones (`new_coverage` 97,9 %, `new_duplicated_lines_density` 0,1 %).
- **Umbrales del gate:** ya están en 80 % y 5 % sobre código nuevo.
- **Código nuevo:** sigue en `previous_version`, del 17/10 (`periods` de `project_status`).
- **Tests:** Sonar no los cuenta (no recibe reportes de ejecución). Del CI de `8b98247` (`40251793396`): 4.120 unitarios (backend 2.051 más 43 salteados, web-admin 853, web-cliente 791, web-staff 211, web-auth 93, `auth-client` 80, `ui` 41), 13 e2e del backend y 78 de los scripts.

**Mercado Pago caído: revisión del código para el plan de contingencia**
- Solo lectura del código de `main` (`8b98247`) y del SDK `mercadopago@3.2.0` instalado. **Sin cambios de código** y sin pruebas contra la sandbox ni producción. El resultado quedó en la sección 8 del plan de pruebas v0.4.
- **Preferencia que falla:** sin configuración propia, rigen los valores del SDK: 10 s de timeout y un reintento a los 2 s para timeouts, errores de red y 5xx. Si falla, el backend cancela el pago pendiente recién creado y relanza el error (`payments.service.ts:363-376`). Sin filtro global, la respuesta sería un 500 genérico (no se probó). El comensal recupera el botón.
- **Pendiente sin webhook:** `registrarCobro` cancela los MP pendientes de más de 10 minutos sin preguntar, y los más nuevos con confirmación (409) (`sessions.service.ts:38` y `:667-681`). web-staff maneja el 409; web-admin no (`PagosPage.tsx:114-129`).
- **Riesgos sin cubrir:**
  - el webhook responde 200 antes de procesar (`payments.controller.ts:76-81`): si la consulta a Mercado Pago falla, el pago queda pendiente y Mercado Pago no reintenta;
  - un pago aprobado después de cancelado solo deja un warning, "devolución manual pendiente" (`payments.service.ts:460-472`);
  - no hay conciliación automática.

**Después del merge del #437** (10:14, merge `2c77111`)
- **El plan v0.4 entró sin corregir:** la corrección de la sección 8 y de la cita a un archivo que no está en el repo va en un PR aparte.
- **`../MenYU` en `main`:** al día con `origin/main` (`2c77111`). Los tres `plan-de-pruebas-v0.X.md` sin trackear se movieron, sin borrarlos, a `C:\Users\COTYS\Desktop\MenYU-planes-sueltos-2026-10-26`, después de comprobar que eran copias exactas de blobs que ya están en git.
  - La rama `docs/plan-pruebas-v0.2` sigue existiendo, en local y en el remoto.
- **Cambio para la demo:** un comentario en `apps/backend/src/discovery/discovery.module.ts:6`, sin commitear en `../MenYU`.
  - `main` no acepta push directo: el ruleset 16770555 exige PR y los dos checks, con la rama al día. El commit de la demo tiene que ir por rama y PR.
  - Al mergearlo se dispara `Deploy — Staging`, porque `apps/backend/src/**` no está en el `paths-ignore`.
- **Esta bitácora:** se pusheó y se abrió su PR. Las sesiones del 23/10 al 25/10 siguen sin entrada.

**Pendiente al retomar** (en este orden)
1. **Demo:** commit del comentario de `discovery.module.ts` en una rama, PR y merge en vivo.
2. **Plan de pruebas:** revisar y mergear el PR de la corrección de la sección 8.
3. **Código nuevo de Sonar:** sigue en "Previous version" (17/10).
4. **Umbrales de k6:** decidir si se ajustan con las mediciones.
5. **Mercado Pago:** las limitaciones de la sección 8 del plan quedan para la tesis.
6. **Esta bitácora:**
   - sumar las sesiones del 23/10 al 25/10;
   - actualizar la tabla "Estado actual", que sigue con datos del 22/10.

> Esta lista quedó superada: ver "Pendiente al retomar" en la sección del 26/10 (mediodía).

### 26/10/2026 (mediodía): merges del #440 y el #441 (SCRUM-44), datos del defecto #428 y la carpeta principal lista para la demo

Horas en ART (UTC − 3). Desde esta sesión se abrió y se pusheó el #441, y se actualizaron las ramas del #440 y del #441 con `main`. Los merges del #440 y del #441 los hizo Coty. No se corrió nada contra producción ni contra Mercado Pago, y no se cambió código: solo documentación y `.env.example`.

**#440: la sección 8 del plan de pruebas según el código**
- **Commit:** `58a4e06` (10:18:20), en `docs/plan-v04-contingencia`.
  - Saca la cita a `Resultado-stress-k6-24-10.md`, que no está en el repo, y deja los runs `40100656575` y `40105801689`.
  - El MP pendiente se cancela al registrar el cobro, no con un timer.
  - Agrega la excepción del 403 de `solicitarEfectivo` con el restaurante dado de baja.
  - Agrega el webhook que responde 200 antes de consultar (`payments.controller.ts:76-81`).
- **CI:** `40329463170` en verde. Después del merge del #439 la rama quedó atrás: `gh pr update-branch` (`3668735`) y `40330685802` en verde.
- **Merge:** 10:45:58, `569b4c4`. CI de `main`: `40333476441`, success. Sin deploy (`docs/**`).

**#441 (SCRUM-44): `MercadoPago.md` y `.env.example`**
- **Rama y commit:** `docs/mercadopago-contingencia`, commit `dbbb108` (10:48:23). Después del merge del #440, `update-branch` (`283030c`) y CI `40334324677` en verde.
- **`Documentacion/MercadoPago.md`** (no está en `docs/`; antes de hoy, `35bc855`, del 06/06):
  - **Aviso arriba:** las secciones 1 a 12 son de junio, con endpoints y variables viejos. No se reescribieron.
  - **Sección 7:** las seis variables que usa el código, con su archivo y línea.
  - **Sección 13 nueva, "Si Mercado Pago está caído":**
    - timeout de 10 s y un reintento a los 2 s del SDK `mercadopago@3.2.0`;
    - qué ve el comensal;
    - el pendiente sin webhook;
    - el 403;
    - el webhook que responde 200 antes de consultar;
    - el doble cobro;
    - las tres limitaciones del plan.
- **`.env.example`:**
  - **`apps/backend/.env.example`:** ya tenía las seis variables (`MP_ENCRYPTION_KEY`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `BASE_URL`, `FRONTEND_URL` y `FRONTEND_ADMIN_URL`, `:47-80`). No se tocó.
  - **Frontends:** no usan variables de Mercado Pago.
  - **`.env.example` de la raíz:** era de `e0cd9b1` (09/07). Tenía `MP_CLIENT_ID` y `MP_CLIENT_SECRET` comentadas bajo "TODO: reimplementar", decía que `CryptoService` estaba "huérfano" y listaba siete variables que el código ya no usa. Ahora tiene las tres `MP_*` activas.
- **Merge:** 11:04:55, `f3094af`. Disparó `Deploy — Staging` (`40336311218`, success, de 11:04:58 a 11:08:49), porque el `.env.example` de la raíz no está en el `paths-ignore`. Pasaron deploy, smoke y E2E contra staging. CI de `main`: `40336311143`, success (11:16:07).

**Defecto #428 (Node 22), datos para Jira**
- **Qué pasaba:** con el backend en Node 20, invitar personal y subir un logo respondían 500.
- **Causa:** `@supabase/supabase-js` 2.117 (subido en la 4.1, `ef98793`) arma un `RealtimeClient` en `createClient` y exige el WebSocket nativo, que `node:20-alpine` no tiene.
  - **Dónde:** `apps/backend/Dockerfile:5` y `:58` en `1fe0f80^`.
  - **Dónde explota:** `supabase-admin.service.ts:17` y `storage.service.ts:10`.
- **Fix:** Node 22 en el Dockerfile, en los cuatro workflows y en `engines`.
- **Test de regresión:** `apps/backend/src/auth/supabase/cliente-de-supabase.spec.ts`, con 3 `it` que usan la librería real.
- **Commit y CI:** `1fe0f80` (22/10 18:36:14), CI `39858662666` en verde.
- **PR #428:** merge el 23/10 a las 19:04:10, `2020028`. Después del merge, CI `40031173974` y deploy a staging `40031173932`, los dos en success.
- **No hay ciclo rojo-verde en el CI:** el test entró en el mismo commit que el fix y la rama tuvo un solo run. El fallo se vio en staging, después del merge del #416 (`f15240a`, deploy `39852761756` en success, porque el 500 es en tiempo de ejecución). No hay logs de Railway guardados.

**Carpeta principal y demo**
- **`../MenYU`:** pull después de cada merge (`569b4c4`, `f3094af`). Sigue en `main` con un solo cambio sin commitear: el comentario de `apps/backend/src/discovery/discovery.module.ts:6`. El diff está en `privado/respuesta-prompt-26.md`.
- **El #438 de `lautiod` (Fase 5)** entró a `main` a las 11:40:30 (`b9b6db2`). Cambia 104 archivos, ninguno en `apps/backend/src/discovery/`, así que no choca con el cambio de la demo.
- **Para la demo:** `main` no acepta push directo. El ruleset 16770555 exige PR, los dos checks y la rama al día. El CI de `main` tardó hoy entre 5 y 12 minutos, y el deploy a staging, unos 4.

**Respuestas de hoy** (fuera del repo, en `privado/`): 23, 24, 25 y 26. La 25 llegó después de la 26 y se hizo última.

**Pendiente al retomar** (en este orden)
1. **Demo:** `../MenYU` ya está en `b9b6db2`, con el #438. Rama, commit del comentario de `discovery.module.ts`, PR, CI y merge en vivo. Si entra otro PR antes, hacer `git pull`.
2. **Jira:** cargar el #428 con los datos de arriba, sin ciclo rojo-verde.
3. **Esta bitácora:**
   - sumar las sesiones del 23/10 al 25/10;
   - actualizar la tabla "Estado actual", que sigue con datos del 22/10.
4. **Código nuevo de Sonar:** sigue en "Previous version" (17/10).
5. **Umbrales de k6:** decidir si se ajustan.
6. **Mercado Pago:** las limitaciones de la sección 8 del plan y de la sección 13 de `MercadoPago.md` quedan para la tesis.
7. **Limpieza:**
   - la rama `docs/plan-pruebas-v0.2` (local y remota), del PR #432, que se cerró;
   - los worktrees de este bloque.

> El punto 7 se hizo en local el 31/10 (ver la sección siguiente). La rama remota `docs/plan-pruebas-v0.2` sigue en GitHub.

### 31/10/2026: limpieza local de worktrees y ramas

Solo en la máquina local, sobre `../MenYU` en `main` (`6475eb9`, al día con `origin/main`). No se tocaron ramas remotas ni GitHub, no hubo commits ni push, y no se usó `--force`. El único cambio sin commitear, el comentario de la demo en `apps/backend/src/discovery/discovery.module.ts`, quedó igual (`git status --porcelain` idéntico antes y después).

- **`git fetch --prune`:** desaparecieron `origin/feat/auth-fase-5` y `origin/fix/e2e-staging-sin-password-hash`. Ninguna rama local las seguía.
- **Worktrees:** se quitaron los 19 `../MenYU-*` con `git worktree remove`, sin `--force` y sin fallas. Antes se revisaron los ignorados: el único que importaba era `.env.smoke` de `MenYU-supabase-doc`, que se copió a `../MenYU/.env.smoke` (ignorado por `.env.*`, sha256 idéntico).
  - Quedaron 10 carpetas vacías (las que tenían `node_modules`), ya sin `.git`: `MenYU-e2e`, `-e2e-guarda`, `-fix-pagado`, `-fix-pagos`, `-huerfanos`, `-integracion`, `-pr383`, `-scrum16`, `-scrum2627` y `-supabase-doc`. Se borran a mano.
  - No se tocaron `MenYU-f15240a` ni `MenYU-main-12c7bb4`.
- **Ramas mergeadas en `main`:** 45. 44 con `git branch -d`; `test/backend-cobertura` con `-D`, porque estaba `ahead 2` de su remota, pero era ancestro de `main`.
- **Ramas no mergeadas:** 5, con `-D`, después de comprobar el contenido:
  - `docs/bitacora-calidad`, `refactor/historial-sesiones-compartido` y `test/integracion-todo`: `git cherry` sin ningún `+`.
  - `ci/reducir-deployments`: su commit `34933ba` (solo local) agregaba `deploymentEnabled` (`main: true`, `"**": false`) a los `vercel.json` de web-admin, web-cliente y web-staff; los tres son idénticos en `main`, que además lo tiene en web-auth.
  - `docs/plan-pruebas-v0.2`: plan v0.2 viejo; sigue en `origin/docs/plan-pruebas-v0.2` (`4812d45`).
- **Resultado:** queda solo `main`, sin worktrees extra y sin `.lock` en `.git`.

**SHAs para recuperar una rama** (`git branch <nombre> <sha>`, mientras git no limpie los commits sueltos). Sin copia en el remoto: `test/integracion-todo`, `refactor/historial-sesiones-compartido` y el commit `34933ba` de `ci/reducir-deployments`.

| Rama | SHA | Cómo se borró |
|---|---|---|
| `ci/reducir-deployments` | `34933ba` | `-D`, no mergeada (commit solo local) |
| `docs/bitacora-calidad` | `ecad6bc` | `-D`, no mergeada |
| `docs/plan-pruebas-v0.2` | `4812d45` | `-D`, no mergeada |
| `refactor/historial-sesiones-compartido` | `f58f069` | `-D`, no mergeada (sin upstream) |
| `test/integracion-todo` | `2140b07` | `-D`, no mergeada (sin upstream) |
| `test/backend-cobertura` | `d0dbb79` | `-D`, mergeada |
| `ci/e2e-backend` | `8e9d31c` | `-d` |
| `ci/endurecer-deploy-produccion` | `f610ef4` | `-d` |
| `ci/quality-gate` | `d8c359f` | `-d` |
| `ci/smoke-production` | `500649c` | `-d` |
| `ci/smoke-staging` | `ff67aca` | `-d` |
| `ci/sonarcloud` | `9224daa` | `-d` |
| `ci/vercel-solo-main` | `60d7508` | `-d` |
| `docs/bitacora-26-10-tarde` | `5dedb08` | `-d` |
| `docs/bitacora-ensayo-produccion` | `3fd4724` | `-d` |
| `docs/bitacora-produccion` | `f707fa3` | `-d` |
| `docs/e2e-supabase` | `a7afac6` | `-d` |
| `docs/linea-base-calidad` | `595e318` | `-d` |
| `docs/mercadopago-contingencia` | `dbbb108` | `-d` |
| `docs/plan-pruebas-v0.3` | `956a587` | `-d` |
| `docs/plan-v04-contingencia` | `58a4e06` | `-d` |
| `docs/rollback-correcciones` | `8524646` | `-d` |
| `docs/supabase-scrum-44` | `65520ba` | `-d` |
| `feat/health-sha` | `be07b5f` | `-d` |
| `feat/k6-carga` | `57e6fa1` | `-d` |
| `fix/asignar-restaurante-marca` | `086a82b` | `-d` |
| `fix/e2e-limpieza-por-marcador` | `b9d3dcd` | `-d` |
| `fix/fuerza-bruta-sesion` | `eefc043` | `-d` |
| `fix/k6-permisos-resultados` | `beb7bb2` | `-d` |
| `fix/mp-conexion-cuenta` | `ead7439` | `-d` |
| `fix/pagos-page-timer-desmontaje` | `3488702` | `-d` |
| `fix/pedido-pagado-desde-api` | `cbd66b0` | `-d` |
| `fix/pin-mesa-crypto` | `9aed16c` | `-d` |
| `fix/reduce-pagos-mp` | `152c106` | `-d` |
| `fix/sesion-abierta-sin-huerfanos` | `0788dd6` | `-d` |
| `fix/test-mesaspage-sesion-cerrada-socket` | `dbabc7a` | `-d` |
| `fix/test-requireauth-otra-pestana` | `d42beed` | `-d` |
| `fix/web-cliente-qr-y-429` | `a7681c2` | `-d` |
| `refactor/editar-pedido-compartido` | `f9e025a` | `-d` |
| `refactor/pantalla-comensal` | `b84a5c9` | `-d` |
| `test/backend-cobertura-2` | `b75a6b8` | `-d` |
| `test/caida-de-base-scrum-16` | `ccc493d` | `-d` |
| `test/casos-limite-scrum-26-27` | `14d6c2a` | `-d` |
| `test/cobertura-frontend-backend` | `bb45b6f` | `-d` |
| `test/comando-unico-por-tipo` | `b64933b` | `-d` |
| `test/e2e-staging-supabase` | `034598a` | `-d` |
| `test/web-admin-cobertura` | `fb63295` | `-d` |
| `test/web-cliente-cobertura` | `dec6f02` | `-d` |
| `test/web-staff-cobertura` | `182deab` | `-d` |
| `wip/refactor-historial` | `21db047` | `-d` |

**Cierre de 21 issues viejos en GitHub** (`gh issue close`, cuenta `CotyStrumia`; la lista y los motivos los decidió Coty). Antes se verificó con `gh issue view` que los 21 estaban abiertos y que los títulos coincidían. No se tocaron labels, milestones, el Project ni otros issues o PRs.

- **App móvil (Expo), "not planned"** (10): #45, #208, #72, #210, #75, #209, #79, #80, #150 y #212. Comentario: la app móvil se reemplazó por las apps web en Vercel.
- **Duplicados, "not planned"** (6), con el comentario "Duplicado de #M.": #198 → #128, #199 → #133, #200 → #134, #201 → #136, #202 → #135 y #203 → #137. Los originales #128, #134, #135, #136 y #137 siguen abiertos.
- **Hechos, "completed"** (5):
  - #37 (guards por rol): `RequiereRol`, `AccesoService` y `SessionAuthGuard`, con la auth de Supabase en producción (v1.4.0);
  - #133 (k6, 200 usuarios): humo, stress y soak contra staging, en `docs/calidad/k6.md`;
  - #138 (E2E v2.0): E2E del backend en el CI y E2E contra el Supabase de staging en cada deploy, en `docs/calidad/e2e-supabase.md`;
  - #144 (E2E de casos límite): casos límite, caída de la base y E2E de staging;
  - #151 (smoke en producción): smoke automático después de los deploys.
- **Resultado:** los 21 cerrados, sin fallas (`stateReason`: 16 `NOT_PLANNED` y 5 `COMPLETED`). Quedan **76 issues abiertos** (eran 97).

### 01/11/2026: DT-08, el gateway de Socket.io autenticado (#449 y #450)

Horas en ART (UTC − 3). Hasta hoy el gateway (`apps/backend/src/gateway/menyu.gateway.ts`) no autenticaba nada:
- `cors: '*'`;
- `session:join`, `cocina:join` y `mozo:join` unían a `restaurante-{id}` con el id que mandaba el cliente;
- todos los eventos iban a esa sala.

Cualquiera recibía los pedidos, llamados y cobros de cualquier local, y los comensales, los eventos del personal. Se resolvió en dos PR, uno por mitad, trabajando por pasos con el ok de Coty en cada uno. Desde esta sesión se pushearon las dos ramas y se abrieron los dos PR; el merge del #449 lo hizo Coty. Los dos cambios sin commitear de la carpeta principal (el comentario de `discovery.module.ts` y la sección del 31/10 de esta bitácora) no entraron en ningún commit.

**#449: los frontends mandan el token al conectar (1/2)**
- **Rama:** `feat/gateway-auth-frontends`, desde `4f45e4d`.
- **Commits:**
  - `5f62dc5`: `authDelSocket` en `@menyu/auth-client`.
  - `8cdf42b`: web-staff y web-admin.
  - `acd14fc`: `PagosPage.spec` verifica el token.
  - `4e729fe`: web-cliente.
- **Qué cambia:**
  - **Los 8 sitios que abren un socket mandan `auth`.** El personal usa `authDelSocket`, que lee `tokenDeAcceso()` en cada (re)conexión y llama siempre al callback. El comensal manda el JWT de su sesión de mesa, o `{}`.
  - **`GerenceMesasPage` y `PagosPage` de web-admin** pasaron de `cocina:join` a `mozo:join`.
  - **`SessionGuard` de web-cliente** depende de `[restauranteId, jwt]`. Con otra mesa del mismo restaurante cambia el JWT sin que cambie el restaurante, y socket.io reusa el `auth` en cada reconexión.
  - No cambió ningún evento ni payload.
- **Tests locales:**
  - auth-client: 84;
  - web-staff: 211;
  - web-admin: 852;
  - web-cliente: 764;
  - `pnpm typecheck` 10/10 y `pnpm lint` 9/9.
- **Entorno local:** hicieron falta `pnpm install --frozen-lockfile`, el build de `@menyu/types` (su `dist` estaba viejo) y `prisma generate`. Los tres escriben solo en `node_modules` o en carpetas ignoradas.
- **CI:** run `41338684540`, con CI, E2E y SonarCloud en verde. El E2E ya mostraba "Jest did not exit one second after the test run has completed" con solo `sessions.e2e-spec.ts`.
- **Merge:** 16:21:42, `db47dd9`, por Coty. Después del merge, CI `41341346611` y `Deploy — Staging` `41341346485`, los dos en success.

**#450: el backend exige token para unirse a las salas (2/2)**
- **Rama:** `feat/gateway-auth-backend`, desde `4f45e4d`. No se rebaseó: no comparte archivos con el #449 y `git merge-tree` no da conflictos.
- **Commits:**
  - `46568db`: `AccesoDelSocket`.
  - `909e400`: salas y ruteo.
  - `a7a2b67`: revalidación.
  - `a66e29c`: el fix del token vencido.
  - `39f065b`: `socket.io-client` como devDependency.
  - `7949c13`: e2e.
  - `1610f1f`: docs.
- **Qué cambia:**
  - **Cuatro salas, con el nombre armado por el servidor:**
    - `salon:{restauranteId}`, con `mozo:join` y los roles de `SALON`;
    - `cocina:{restauranteId}`, con `cocina:join` y los de `TODO_EL_PERSONAL`;
    - `sesion:{sesionId}`, con `session:join` y el JWT de mesa; la sesión y el restaurante salen del token;
    - `menu:{restauranteId}`, pública.
  - **Ruteo por tipo de evento,** en una sola llamada `to([...])`, sin duplicados.
  - **Un socket del personal está en un restaurante a la vez.**
  - **Rechazos:** siempre "No autorizado", con el motivo en `Logger.warn` y nunca el token.
  - **Revalidación periódica** (`WS_REVALIDACION_MS`: 10 min por defecto, entre 1 s y 24 h) con `acceso:revocado`.
  - **CORS** con `isAllowedOrigin`, y `Logger` en lugar de `console.log`.
- **El fix del token vencido** (`a66e29c`, lo encontró Coty al revisar el paso 2): el token del handshake queda fijo mientras vive la conexión y el de Supabase vence a la hora. Ahora se exige en el primer join; los siguientes usan el `usuarioId` guardado y solo vuelven a mirar la cuenta activa y el rol (`personalYaAutenticado`). Se sumó también un máximo de 24 h al intervalo, porque `setInterval` con más de 2^31-1 ms se dispara cada 1 ms.
- **Tests:**
  - **Unitarios del backend:** 85 suites y 2126 tests (más 3 `*.base.spec.ts` salteadas). Los del gateway son 114, sin handles abiertos.
  - **e2e nuevo** (`gateway.e2e-spec.ts`): 10 casos con socket.io real y el verificador de Supabase como doble (tokens vencidos con un `Set`, sin sleeps):
    - cruce entre restaurantes;
    - roles por sala;
    - comensal y anónimo;
    - cambio de restaurante;
    - revalidación;
    - `order:new` una sola vez estando en dos salas;
    - token vencido en una conexión ya autenticada.
  - **`pnpm test:integracion`** (Postgres 17.6 en Docker): 2 suites, 23 tests en verde. El e2e del gateway con `--detectOpenHandles`: 10/10, sin handles.
  - **El aviso "Jest did not exit"** aparece también sin este PR (ver el #449): no es del gateway.
  - **Además:** `pnpm typecheck` 10/10 y `pnpm --filter @menyu/api build` sin errores.
- **Docs:**
  - Sección nueva "Gateway de Socket.io autenticado (DT-08)" en `docs/auth/specs/auth.md`, sin marcarla como verificada en staging.
  - En la misma spec quedaron tachados "Fuera de alcance" y la deuda del `leave` de la 4.6.
  - `WS_REVALIDACION_MS`, comentada, en `apps/backend/.env.example`.
  - No se tocaron los documentos históricos de `docs/auth/review/` ni `CLAUDE.md`.
- **PR:** abierto a las 16:45:10, sin mergear. CI `41343309012` con CI, E2E y SonarCloud en verde.

**Pendiente al retomar** (en este orden)
1. **Antes de mergear el #450:** confirmar que terminó el deploy de web-staff, web-admin y web-cliente con el #449. Mergear fuera del horario de servicio o avisar al personal que recargue la página: las pestañas abiertas desde antes del #449 no mandan token y se quedan sin tiempo real hasta recargar.
2. **Después del merge, en staging:** pasar el checklist del cuerpo del #450.
   - El mozo y la cocina con lo suyo, y el mozo en `/mozo/pedidos`.
   - El comensal, solo con su sesión.
   - La carta sin sesión recibe `menu:updated`.
   - Una conexión de más de una hora cambia de pantalla y sigue recibiendo.
   - El OWNER cambia de sucursal y deja de recibir la anterior.
   - Quitarle el rol a un mozo conectado, con `WS_REVALIDACION_MS` bajo.
   - Los logs no muestran tokens.
3. **Deuda para v2.0:**
   - Las pantallas del personal no escuchan `acceso:revocado`: quien pierde el rol deja de recibir eventos sin aviso.
   - Un mismo socket que hace `session:join` con el JWT de otra sesión no sale de la sala `sesion:` anterior. No pasa con los frontends actuales, que abren otro socket.
4. **Opcional:**
   - las notas históricas de la 4.5 y la 4.6 en `docs/auth/specs/auth.md` (`:375`, `:411`) todavía dicen que "el gateway no lee" el token;
   - `CLAUDE.md` nombra el gateway solo en el árbol de carpetas.
5. **Siguen vigentes** los pendientes del 26/10 (Jira del #428, la tabla "Estado actual", el código nuevo de Sonar y los umbrales de k6).

### 03 y 04/11/2026: deuda de pagos, PR A (#453): un solo cierre de sesión de mesa

Horas en ART (UTC − 3). El #450 se mergeó el 03/11 a las 14:52:55 (`29ffdb8`), con el CI de `main` en verde (`41688484644`).

**El bug.** El cierre de una sesión (sesión `cerrada` con `cerradaEn` y mesa `libre`) estaba copiado en 5 lugares:
- `confirmarEfectivo` y el webhook de Mercado Pago;
- `close`, `cerrarMesaAdmin` y `registrarCobro`.

Ninguno miraba si la sesión seguía activa, y cerrar a mano no cancelaba los pagos pendientes. Un efectivo o un MP pendiente que se aprobaba tarde pisaba `cerradaEn` y liberaba la mesa aunque ya tuviera otra sesión abierta.

**#453**, rama `fix/cierre-de-sesion-unico` desde `29ffdb8`. Se trabajó por pasos, con el ok de Coty en cada uno.
- **Commits:**
  - `debd448`: `cerrarSesionDeMesa` (`common/`). Cierra solo una sesión activa, cancela los pendientes y libera la mesa solo si cerró.
  - `42f2c2d`: `confirmarEfectivo` relee la sesión dentro de la tx (409 "La sesión ya no está activa"). El webhook, si la sesión ya estaba cerrada, deja el pago aprobado sin tocar sesión ni mesa y con un warn.
  - `d9989f0`: `cerrarMesaAdmin` cancela los pendientes. `registrarCobro` relee la sesión dentro de la tx (400 "La sesión ya fue cerrada").
  - `87e8614`: se borra `POST /sessions/close`. Solo lo usaba `scripts/staging/fuerza-bruta.mjs`, que ahora avisa en qué mesa dejó la sesión abierta. Salió también de `doc.md`, y la deuda de `docs/auth/specs/auth.md:733` quedó resuelta.
  - `2c3cec0` y `009342e`: e2e `sessions/cierre-de-sesion.e2e-spec.ts`, con 6 casos y el estado heredado (una sesión vieja cerrada con un efectivo pendiente y la mesa con una sesión nueva).
- **Mutaciones:**
  - sacar la relectura de `confirmarEfectivo` hace fallar el caso f, el del pendiente que no cubre el total. El caso c sigue pasando porque el helper es una segunda defensa;
  - sacar la cancelación del helper hace fallar a, b y e.
- **Tests:** 2194 unitarios del backend, `test:integracion` 29/29, `pnpm typecheck` 10/10 y el build sin errores. CI del PR en verde, con CI, E2E y SonarCloud.
- **Hallazgo:** ningún frontend llama a `POST /payments/confirmar-efectivo`. El salón cobra con `PATCH /sessions/:id/cobro`, que reutiliza el efectivo pendiente.
- **Merge:** 04/11 a las 10:16:59, `7dd96d6`, por Coty.
- **Después del merge:**
  - `Deploy — Staging` `41836685195`: en success.
  - CI `41836685250`: en **failure**, pero no por el código. El E2E y todos los pasos del job principal hasta el build pasaron. Lo que falló fue el paso SonarCloud: "Unexpected HTTP response: 403" al descargar el scanner (`sonar-scanner-cli-8.1.0.6389`) de `binaries.sonarsource.com`, antes de analizar nada.
  - El quality gate de `main` en SonarCloud seguía en `OK`.

**Pendiente al retomar** (en este orden)
0. **Volver a correr el CI `41836685250`** (`gh run rerun 41836685250 --failed`), para que `main` tenga el análisis de Sonar del #453.
1. **Staging del #450:** el checklist del cuerpo del PR, el de la sección del 01/11. Sigue sin hacerse.
2. **Staging del #453:** el checklist del cuerpo del PR, con las 7 casillas sin marcar:
   - efectivo pedido por el comensal y cobrado desde `PagosMozo`;
   - cerrar a mano con un efectivo y con un MP pendiente;
   - `confirmar-efectivo` por API sobre la mesa cerrada (409);
   - un `CobroModal` viejo (400);
   - un MP aprobado cierra la mesa;
   - `POST /sessions/close` da 404;
   - `fuerza-bruta.mjs`.
3. **PR B** (`feat/webhook-mp-confiable`):
   - el webhook responde después de procesar (DT-11);
   - `requiereRevision` y `motivoRevision` en `Pago`, con un endpoint de consulta para OWNER y GERENTE;
   - la firma de MP en modo observación (DT-02).

   Ahí entra el MP aprobado sobre una sesión cerrada que no cubre el total, que el #453 deja aprobado sin aviso.
4. **PR C:** exigir la firma del webhook, después de ver en los logs del PR B que las notificaciones la traen.
5. **Siguen vigentes** los puntos 3 y 4 del 01/11 (deuda del gateway para v2.0 y opcionales) y los pendientes del 26/10.

### 04/11/2026: deuda de pagos, PR B (`feat/webhook-mp-confiable`), en curso

Rama desde `7dd96d6` (el merge del #453), sin upstream: el push va con `git push -u origin feat/webhook-mp-confiable` y solo en el último paso. Se trabaja por pasos, con el ok de Coty en cada uno. Todavía no hay PR: el borrador se le muestra a Coty antes de crearlo, y no se mergea desde acá.

**Decisiones cerradas en el paso 0**
- **D1, cuándo responde el webhook (DT-11):** después de procesar.
  - **200** si se procesó o si la notificación no es procesable: pago inexistente, `externalReference` que no coincide, método que no es MP, 400 de MP, o `restauranteId` de la URL distinto del restaurante del pago.
  - **500** si la falla es transitoria (MP 5xx o 429, red, timeout, Prisma, errores desconocidos), y también con el restaurante sin MP conectado, el token vencido o revocado (401/403) y el 404 de MP. MP reintenta unos 4 días. Los dos primeros van con `logger.error` y un mensaje accionable ("reconectar Mercado Pago"), sin el token.
  - El restaurante se compara (`sesion.mesa.restauranteId` contra el de la URL) **antes** de consultar a MP. Si no coincide, 200 "no procesable" con un warn.
  - `console.error` pasa a Logger y se saca `@Res`.
  - Timeout de **4000 ms por intento**, solo en las consultas del webhook (`requestOptions: { timeout }`), sin desactivar los reintentos del SDK. Peor caso: 2 consultas × (4 s + 2 s de espera + 4 s) = 20 s < 22 s. Con los 5000 ms que se habían propuesto daba 24 s.
- **D2, `requiereRevision` y `motivoRevision`:**
  - **(a)** MP aprueba un pago ya cancelado: motivo `aprobado-sobre-cancelado`, el pago sigue cancelado y hay que devolver la plata a mano. Guarda `referenciaExterna` solo si estaba vacía, en el mismo update. Es la excepción a "el webhook no toca estados finales": va en un comentario, en la doc y con tests.
  - **(b)** MP aprueba un pago de una sesión ya cerrada, cubra o no el total: motivo `aprobado-sobre-sesion-cerrada`. Queda aprobado, sin tocar sesión ni mesa y sin emitir. El estado de la sesión se lee siempre que el pago pasa a aprobado; si el helper devuelve `false`, también marca.
  - Si ya tenía `requiereRevision`, no se pisa el motivo (queda el primero). Se mantienen los `logger.warn` de hoy.
- **D3, consulta:** `GET /payments/requieren-revision?restauranteId=…`, con `@RequiereRolEn({ query: 'restauranteId' }, ...ADMINISTRACION)`. Solo lectura, `select` explícito, más nuevos primero. Devuelve `{ pagoId, sesionId, mesaNumero, monto (number), metodo, estado, motivo, referenciaExterna, fechaCobro (ISO | null), creadoEn }`. Hay que actualizar la matriz de `docs/auth/specs/auth.md:295` y el "Hoy son 119" de `rutas-por-autenticacion.spec.ts` a 120.
- **D4, firma (DT-02) en modo observación:**
  - Se evalúa si hay `MP_WEBHOOK_SECRET` y el header `x-signature`, se loguea y la notificación se procesa igual.
  - Una línea por notificación, aun sin el secreto: `x-signature` y `x-request-id` sí o no, los nombres de la query (filtrados a `[\w.-]`, hasta 10), `tipo=` y `firma=valida|invalida|no-evaluable|sin-header|sin-secreto`. Va con `log` si es válida y con `warn` si no.
  - **`tipo=` (cambio del 05/11, pedido por Coty):** el valor de `topic ?? type` (la precedencia del provider), solo si es string, filtrado y recortado; sin ninguno, `sin-tipo`. Es el único valor de la query que entra: no es sensible y hace falta para decidir el PR C (MP manda `payment` y `merchant_order` por pago y puede no firmar todas). La regla anterior, "nunca valores de la query", era demasiado estricta.
  - Nunca el secreto, el `v1`, los demás valores de la query ni tokens.
  - Si falta la variable, un `warn` al arrancar, sin tirar la app.
- **Limitación conocida (va en la doc):** no hay cómo marcar un pago como revisado ni pantalla en el frontend. El endpoint es de solo lectura.
- **Fuera de alcance:** el job de conciliación, la pantalla en web-admin, exigir la firma (PR C) y el 409 de PagosPage (#360).

**La firma, lo que se confirmó** (en el SDK instalado, `mercadopago@3.2.0`, en el repo sdk-nodejs y en la doc de Webhooks)
- **El manifest** es `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, sin los pares que falten. `data.id` sale de la query. Es un HMAC-SHA256 en hexa con la clave secreta de Tus integraciones, y el header tiene la forma `ts=…,v1=…`.
- **Las notificaciones IPN** (`topic=…&id=…`) no se pueden validar. No está confirmado si las que llegan al `notification_url` de cada preferencia vienen firmadas: lo van a decir los logs del PR B.
- **Las fuentes no coinciden** en la unidad del `ts` (segundos o milisegundos). Por eso no hay tolerancia en modo observación.
- **Mayúsculas:** los SDK no pasan `data.id` a minúscula (sdk-nodejs PR #439), aunque la doc dice que sí.
- **Un caso que tira error:** el validador del SDK compara el largo en caracteres, no en bytes. Un `v1` de 64 caracteres con una `ñ` hace lanzar `RangeError ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH`. `evaluarFirmaDelWebhook` lo ataja y lo cuenta como inválida.
- **Vector fijo:** secreto `your_secret_key_here`, request-id `2066ca19-c6f1-498a-be75-1923005edd06`, ts `1742505638683`.
  - Sin `data.id` da `8a7b0cc7…`; con `data.id=123456`, `3376cb55…`.
  - No viene de una fuente oficial: se calculó con crypto y se verificó con el validador del 3.2.0.

**Commits hasta ahora**
- `923db04` `feat(pagos): requiereRevision y motivoRevision en Pago`: el schema, la migración `20261104120000_pago_requiere_revision` (solo agrega columnas) y `common/motivo-revision.constant.ts`.
- `8b2809f` `feat(pagos): evaluarFirmaDelWebhook, la firma de Mercado Pago como función pura (DT-02)`. Es `payments/firma-del-webhook.ts`, que envuelve `WebhookSignatureValidator`, con 26 tests. Nunca lanza ni loguea, y con el secreto vacío da `no-evaluable`.

**Paso 3, hecho y sin commitear:** el controller observa la firma sin cambiar la respuesta.
- **Qué hace:**
  - la línea de log va al principio del handler, antes del 200, y todo el bloque está protegido;
  - `dataId` sale de `query['data.id']`;
  - los ids de la ruta pasan por el mismo filtro y se recortan a 40 caracteres;
  - el `warn` de arranque va en `onModuleInit`.
- **Archivos:**
  - `payments.controller.ts`;
  - `payments/webhook-firma-endpoint.spec.ts` (nuevo, 10 tests con supertest: válida, inválida, sin header, sin secreto, IPN, que no se filtre nada, los nombres de la query y que no lance);
  - `MP_WEBHOOK_SECRET` en los dos `.env.example`.
- **Tests:** 139/139 en `src/payments`, `rutas-por-autenticacion` en verde y `tsc` sin errores.
- **Commit propuesto, esperando el ok:** `feat(pagos): el webhook loguea la firma de Mercado Pago en modo observación (DT-02)`.

**Pendiente al retomar** (en este orden)
0. **El ok del paso 3** y su commit, con los cuatro archivos agregados por nombre. Esta bitácora y `discovery.module.ts` no entran en ningún commit.
1. **Paso 4:**
   - responder después de procesar, con la clasificación 200/500 de D1;
   - sacar `@Res` y pasar `console.error` a Logger;
   - el timeout de 4000 ms en `mercado-pago.provider.ts`;
   - el chequeo del `restauranteId` antes de consultar a MP.
2. **Las marcas (a) y (b) de D2 en `procesarWebhookMercadoPago`**, con sus tests.
3. **El endpoint de D3:** sus specs, el 119 → 120 y `auth.md:295`.
4. **El e2e del webhook** (`payments/webhook.e2e-spec.ts`). Se puede adaptar `e2e-cierre.sh` del scratchpad.
5. **La doc:** `Documentacion/MercadoPago.md` y `docs/calidad/MercadoPago.md`, con la limitación conocida.
6. **La verificación final:**
   - un grep de que ningún endpoint devuelve un `Pago` entero sin `select` explícito, para que `requiereRevision` y `motivoRevision` no se filtren;
   - los tests unitarios, `test:integracion`, el typecheck y el build;
   - el borrador del PR a Coty y el push solo después de su ok.
7. **Siguen** los pendientes 0 a 2, 4 y 5 de la sección anterior: volver a correr el CI `41836685250`, los checklists de staging del #450 y el #453, el PR C y lo anterior.

### 05/11/2026: PR B (`feat/webhook-mp-confiable`), pasos 3 a 8

Rama sin push y sin PR todavía. Cada paso se mostró a Coty y se commiteó con su ok, con los archivos por nombre. Esta bitácora y `discovery.module.ts` no entran en ningún commit.

**Aparte del PR: el CI `41836685250`.** `gh run rerun 41836685250 --failed` terminó en success (los dos jobs). SonarCloud analizó `7dd96d6` (el merge del #453) y el gate de `main` sigue en `OK`. El pendiente 0 de la sección del 03 y 04/11 quedó resuelto.

**Paso 3, `54770cc`:** el webhook loguea la firma en modo observación (D4), con `tipo=` sumado antes del commit. 10 tests nuevos del endpoint más 3 del tipo (sin tipo, `topic` gana a `type`, y uno raro y largo que llega filtrado y recortado).

**Paso 4, `7d35426`:** el webhook responde después de procesar (D1, DT-11).
- `clasificarErrorDelWebhook` (`payments/clasificar-error-del-webhook.ts`) es la única regla de 200/500, con un test en tabla de 25 filas. Coty confirmó tres decisiones: el 400 de MP da 200, el chequeo del método va antes de consultar a MP, y los demás 4xx dan 500 (`mp-otro`).
- Los errores del SDK 3.2.0 son el cuerpo de la respuesta parseado, un objeto plano (no un `Error`) con `status`. Por eso se exige que no sea un `Error`: un `HttpException` de Nest también tiene `status`. El "MP no conectado" es un error propio, `MercadoPagoNoConectadoError`: `getAccessTokenDecrypted` tira un `BadRequest` que si no se confundiría con un 400 de MP.
- El servicio carga el pago y compara el restaurante y el método **antes** de pedir el token o consultar a MP.
- El aviso a las pantallas después del commit nunca lanza: si falla, `logger.error` y 200.
- Timeout de 4000 ms en `payment.get` y `merchantOrder.get` (`TIMEOUT_DE_LAS_CONSULTAS_DEL_WEBHOOK_MS`), sin tocar los reintentos del SDK.
- Mutación: con el controller sin `await` fallan 15 de los 16 tests del bloque. El que pasa es el del servicio que vuelve sin lanzar, y es lo esperable.

**Paso 5, `1995d49`:** las marcas de revisión (D2).
- (a) aprobado sobre cancelado: marca y guarda la referencia solo si estaba vacía, en el mismo `update`. Si ya estaba marcado y con referencia, no escribe (ajuste de Coty antes del commit).
- (b) aprobado sobre una sesión que no está activa: se lee el estado de la sesión dentro de la transacción, justo después de aprobar, y se marca sin calcular totales ni llamar al helper. El helper en `false` también marca.
- El motivo no se pisa. Mutaciones: pisar el motivo (2 fallan), no leer la sesión (4), pisar la referencia (2) y escribir siempre en (a) (1, el de la repetida).

**Paso 6, `5e5ca2d`:** `GET /payments/requieren-revision?restauranteId=` (D3), `@RequiereRolEn({ query }, ...ADMINISTRACION)`, `select` explícito, hasta 200 (`MAX_PAGOS_PARA_REVISION`) y más nuevos primero.
- `auth.md:296` con la fila nueva.
- **El conteo de rutas es 127, no 120:** se comprobó imprimiendo el recorrido. El "119" del comentario ya estaba desactualizado. La matriz de `rutas-por-autenticacion.spec.ts` no lista las rutas con `@RequiereRolEn`: solo cambió el comentario.
- Sin `restauranteId`, el guard responde 400 "Falta restauranteId en la query".

**Paso 7, `769c1d8`:** `payments/webhook.e2e-spec.ts`, 10 casos contra Postgres por HTTP, con el provider de MP como doble.
- En "MP no conectado" corre el `getAccessTokenDecrypted` real sobre un restaurante sin token.
- `pnpm test:integracion`: 38 migraciones desde cero, sin drift y 39/39. Con `--detectOpenHandles`, 10/10 sin handles abiertos.
- La concurrencia (caso 8) salió estable en 5 corridas. Con un log temporal se vio que hay un P2034 de verdad en cada corrida y lo resuelve el reintento de `runSerializableTransaction`.
- Mutación: sin el filtro por restaurante, falla solo el caso 7.
- Hubo que arrancar Docker Desktop, que estaba apagado.

**Paso 8 (doc), sin commitear al escribir esto:**
- `Documentacion/MercadoPago.md` y su copia en `docs/calidad/`, regenerada: la copia es la cabecera más el original, byte a byte.
  - `MP_WEBHOOK_SECRET` en la sección 7.
  - En la sección 13: la tabla de 200/500, los reintentos de MP, los 4000 ms y el peor caso, el emit después del commit, y "Riesgo de doble cobro y pagos para revisión" con la limitación conocida.
  - La sección 14 nueva: el log del webhook y la firma, con lo que no está confirmado.
- `docs/calidad/plan-de-pruebas.md`: las dos frases que decían "200 antes de procesar" y "sin reintento".
- Los históricos (`modulo-pagos.md` ×2 y `modulo-pagos-sesion2.md`): una nota debajo de cada mención que apunta a `MercadoPago.md`, secciones 7 y 14.
- **Detalle de la doc:** un header de firma mal armado da `no-evaluable`, no `invalida` (`NO_EVALUABLE` en `firma-del-webhook.ts`).

**Paso 8, `16236ef`:** la doc, con cinco ajustes de Coty:
- la fila de los otros 4xx en la tabla;
- sin el nombre de la rama: dice "el PR B de la deuda de pagos (05/11/2026)";
- DT-02 y DT-11 explicados la primera vez que aparecen;
- la redacción de las IPN;
- la versión 0.5 de `plan-de-pruebas.md`.

**Paso 9, la verificación final (sin commits):**
- **Ninguna respuesta serializa un `Pago` entero.** El historial de `sessions.service.ts` trae los pagos con `include`, pero los arma campo por campo. Nada de `packages/` ni de los frontends menciona las columnas nuevas.
- **Backend:** 2330 tests en verde (94 suites; 36 skipped en 3 suites).
- **Typecheck y build:** `tsc` sin errores, el build de `@menyu/api` bien y `pnpm typecheck` 10/10.
- **`test:integracion`:** 39/39, con las 38 migraciones desde cero y sin drift.
- **Contra `origin/main` (`7dd96d6`):** 8 commits y 25 archivos, sin la bitácora ni `discovery.module.ts`.
- **Borrador del PR:** lo revisó Coty. Antes de publicarlo pidió que dijera de forma explícita:
  - la migración aditiva y su rollback (dejar las columnas);
  - que cambiar `MP_WEBHOOK_SECRET` reinicia el backend;
  - que no hay cambios de frontend;
  - el tiempo de respuesta (20 s contra 22);
  - los números: 8 commits, 25 archivos, 2330 tests y 39/39.

**PR #454, publicado como borrador** (https://github.com/MenYUorg/MenYU/pull/454):
- **Push:** `git push -u origin feat/webhook-mp-confiable`. La rama sigue a `origin/feat/webhook-mp-confiable`.
- **Creación:** `gh pr create --draft --base main`, con el cuerpo pasado por `--body-file`: un archivo con solo el cuerpo, sin las líneas "TÍTULO:" y "CUERPO:" del borrador.
- **Verificación del texto publicado** (`gh pr view 454 --json title,body`):
  - el título es el del borrador y el cuerpo es idéntico al archivo;
  - tiene la sección de pagos para revisión (a/b y el endpoint), el último ítem del checklist (la simulación del panel de MP) y "Qué decide el PR C".
  - No hizo falta ningún `gh pr edit`.
- **Estado:** sigue como draft. No se marcó como listo ni se mergeó.

**El CI del #454** (run `42083407587`) salió en verde a la primera, sin reruns. El 403 de la descarga del scanner de Sonar no apareció.

| Check | Resultado | Duración |
|---|---|---|
| E2E — backend (Postgres efímero) | pass | 53 s |
| CI — typecheck, lint, test, build | pass | 10 min 51 s |
| SonarCloud Code Analysis | pass | 3 min 59 s |

Quality gate del PR en `OK`:
- cobertura del código nuevo **100 %** (umbral 80 %);
- duplicación 0 % (umbral 5 %);
- confiabilidad, seguridad y mantenibilidad en A;
- hotspots revisados 100 %.

**Pendiente al retomar** (en este orden)
0. **La revisión de Coty del #454** en GitHub. Lo marca como listo y lo mergea ella: desde acá no se hace ni `gh pr ready` ni merge.
1. **Después del merge:**
   - mirar el CI de `main` y el `Deploy — Staging`; si Sonar falla con el 403 del scanner, `gh run rerun <id> --failed`;
   - el checklist de staging del cuerpo del #454:
     - cargar `MP_WEBHOOK_SECRET` en Railway (eso redespliega el servicio);
     - confirmar las columnas `requiere_revision` y `motivo_revision`;
     - un pago real de prueba: leer `tipo=` y `firma=` de `payment` y de `merchant_order`, y verificar **en la base** que el pago quedó aprobado y la sesión cerrada;
     - MP desconectado da 500 con "hay que reconectar";
     - `requieren-revision` da `[]` para un OWNER y 403 para un MOZO;
     - la simulación del panel da 404, que se ve como 500.
2. **El PR C (exigir la firma), condicional:** solo si `tipo=payment` y `tipo=merchant_order` salen con `firma=valida` en staging.
3. **Siguen** los checklists de staging del #450 y el #453 y los pendientes anteriores (secciones del 03 y 04/11 y del 01/11).

### 05/11/2026 (tarde): merge del #454 y caja (#355), paso 0

Horas en ART (UTC − 3).

**El #454 está mergeado.** Lo mergeó Coty a las 15:39:44 (`0a4c9df`). Después del merge, en `main`:
- CI `42086389972`: success;
- `Deploy — Staging` `42086389508`: success.

**Sigue pendiente el checklist de staging del #454** (ver la sección anterior). Ese checklist es lo que decide el PR C.

**Issue #355, "[S13] Caja: modelo de cajas, turnos, movimientos y arqueo (schema + migración)".** Es el modelo de #357 a #361. El paso 0 fue solo reconocimiento y propuesta: no se tocó ningún archivo del repo. Lo que se validó se hizo en un Postgres descartable, con una copia del schema en el scratchpad de la sesión (`scratchpad/caja/`). El contenedor ya está borrado.

**La rama.**
- `git fetch`, `git switch main` y `git pull --ff-only`: `main` avanzó 52 commits sin conflicto hasta `0a4c9df`.
- Rama `feat/caja-schema` desde `0a4c9df`. Sigue la convención del repo, `tipo/descripcion-en-kebab` sin número de issue.
- Esta bitácora y `discovery.module.ts` viajaron sin commitear y siguen afuera.

**Lo que se encontró.**
- **Convenciones del schema (Prisma 6.19.3, con `prisma.config.ts`):**
  - ids `String @id @default(uuid())`, que en la base son `TEXT`;
  - `@map` en snake_case y `@@map` en singular;
  - Timestamptz solo en lo nuevo: `@db.Timestamptz(3)` en `HistorialRoot` y `RegistroAsistente`, y `@db.Timestamptz` en `Pago.fechaCobro`;
  - `onDelete` casi nunca explícito: rige el default de Prisma (Restrict si la FK es obligatoria, SetNull si es opcional). `Cascade` en tablas de unión y del asistente, `SetNull` en `Pago.usuario` y `PedidoEdicion.usuario`.
- **En el repo no había índices únicos parciales.** Las migraciones `20260722175451_split_pagos_comensales` y `20260906183320_division_pagos_campos` tienen `WHERE` solo en los backfills, y lo mismo pasa con las demás (backfills, triggers y bloques `DO`). Los del #355 son los primeros.
- **Prisma 6.19.3 ignora los parciales y los CHECK en el drift.** Probado: con un índice parcial creado a mano, `prisma migrate diff --from-url … --to-schema-datamodel … --exit-code` da "No difference detected". `test:integracion` los tolera, y un `migrate dev` futuro no va a querer borrarlos. La contracara es que si alguien los borra, solo se entera el e2e.
- **El repo ya usa CHECK**, en tres migraciones: `item_menu_precio_descuento_check`, `membresia_ambito_check` y los de `historial_root`. Estos últimos son un `IN (…)` sobre un String: el antecedente para `tipo` y `metodo`.
- **Las migraciones** se crean con `prisma migrate dev --create-only` y después se edita el SQL, con un comentario de cabecera. Algunas tienen timestamp redondo, puesto a mano.
- **En la app no hay borrados físicos** de mesas, mozos, usuarios ni restaurantes: `DELETE /mesas/:id` hace `activo: false`. El seed no borra nada.
- **El DMMF** (`Prisma.dmmf`) expone `dbName`, `uniqueFields`, `relationOnDelete` y `nativeType`, pero no los `@@index` no únicos ni los parciales.

**La propuesta**, validada en la base descartable:
- **6 modelos nuevos:** `Caja`, `Turno`, `TurnoCaja`, `MovimientoCaja`, `ArqueoMetodo` y `AsignacionTurno`.
- **En `Pago`:** `turnoCajaId?`, con FK Restrict e índice, y `propina Decimal(10,2) @default(0)`.
- **Todas las FKs nuevas son Restrict:** el historial financiero no se borra.
- **A mano en la migración:**
  - dos índices únicos parciales, `turno_restaurante_id_abierto_key` y `turno_caja_caja_id_abierta_key`, los dos `WHERE "cerrado_en" IS NULL`;
  - cinco CHECK: el tipo de movimiento, el método del arqueo (sin `mercadopago`), el monto mayor a 0, el fondo inicial mayor o igual a 0 y la propina mayor o igual a 0.
- **Resultados:**
  - `prisma validate` bien;
  - el SQL que genera Prisma más el de a mano se aplicó limpio sobre las 38 migraciones;
  - el drift contra la copia del schema: "No difference detected";
  - un pago que ya existía quedó con `propina = 0.00` y `turno_caja_id = NULL`;
  - cada restricción rechaza lo que tiene que rechazar (un segundo turno abierto, una caja abierta dos veces, los duplicados de los únicos, los CHECK, los borrados con Restrict) y acepta los casos válidos (otro restaurante, después de cerrar).
- **Las pruebas propuestas:**
  - `src/prisma/caja-schema.spec.ts`: el contrato con DMMF;
  - `src/caja/caja-schema.e2e-spec.ts`: contra Postgres, con una verificación en `pg_indexes` y la limpieza en el orden que impone Restrict;
  - una mutación: sacar un índice parcial tiene que hacer fallar el e2e.

**Riesgos anotados para más adelante:**
- **#358:** `registrarCobro` acepta `'mercadopago'` como cobro del personal (`METODOS_PAGO_STAFF`). Hay que definir si sin turno abierto también se rechaza, y si puede llevar propina, que no entraría a ninguna caja.
- **La base no impide mezclar restaurantes** entre caja, turno, mesa y mozo: lo valida el servicio (#357 y #358).
- **El máximo de 2 aperturas por turno** y el cierre de las cajas junto con el turno van en el servicio.

**Pendiente al retomar** (en este orden)
0. **Las decisiones de Coty sobre la propuesta del #355:**
   1. el `tipo` en mayúsculas (`INGRESO`, `EGRESO`, como dice el issue) o en minúsculas;
   2. los cinco CHECK;
   3. si `TurnoCaja` es única por (`turnoId`, `cajaId`);
   4. si el nombre de la caja es único también entre las inactivas;
   5. si `movimiento_caja` se protege con triggers, como `historial_root`;
   6. los CHECK de coherencia opcionales (`cerrado_en` con `cerrado_por_usuario_id`, y `diferencia = declarado − esperado`);
   7. `Timestamptz(3)`;
   8. si la migración se crea con `migrate dev --create-only` contra la base local (puerto 5433) o con `migrate diff` contra un Postgres descartable;
   9. dónde van las constantes (`common/caja.constant.ts`) y el e2e (`src/caja/`).
1. **Con su ok, el paso 1 del #355:** el schema, la migración, las constantes, el spec de contrato, el e2e, la mutación y `test:integracion`.
2. **El checklist de staging del #454** y, según lo que muestre, el PR C.
3. **Siguen** los checklists de staging del #450 y el #453 y los pendientes anteriores.

### 10/11/2026: caja #355 (PR #460) y #357 A1 (PR #461) mergeados, y #357 A2 en curso

Un día largo, en pasos chicos con el ok de Coty en cada uno. Cada paso se commiteó con los archivos por nombre, uno por uno; esta bitácora y `discovery.module.ts` no entran en ningún commit. En todas las pruebas contra Postgres se usó un contenedor descartable propio (`postgres:17.6`, puerto 5544x), borrado con `docker rm -f` al terminar.

**#355, el modelo de datos (PR #460, mergeado como `9633939`).**
- Decisiones de Coty: `tipo` en mayúsculas (`INGRESO`, `EGRESO`) y los métodos en minúsculas; los 5 CHECK más 2 de coherencia (`turno_cierre_check` y `arqueo_metodo_diferencia_check`); `TurnoCaja` única por `(turnoId, cajaId)`; el nombre de la caja único también entre las inactivas; sin triggers en `movimiento_caja`; `Timestamptz(3)`; todas las FKs nuevas con `onDelete: Restrict` explícito (son **13**).
- `prisma format` **no se corre** sobre `schema.prisma`: el archivo nunca se formateó y reformatea ~120 líneas ajenas.
- La migración se generó con `migrate diff` contra un Postgres descartable (también como shadow) y se le sumaron a mano los 2 índices parciales y los 7 CHECK.
- Pruebas: `src/prisma/caja-schema.spec.ts` (contrato con DMMF; `METODOS_ARQUEO` + `mercadopago` = `METODOS_PAGO_STAFF`, para eso se exportó esa constante) y `src/caja/caja-schema.e2e-spec.ts` (catálogo y comportamiento de cada restricción). 69 casos manuales en la base descartable y un pago anterior a la migración que queda con `propina = 0` y `turno_caja_id = NULL`.
- Antes del push se rebasó sobre `main`: **Workers Builds (Cloudflare) publica en producción cualquier rama que se pushee**, así que `landing/` tiene que quedar idéntico a `main`. El rebase borró `.claude/settings.local.json` (que `main` dejó de versionar); se restauró desde un respaldo y ahora está ignorado.

**Lo que se aprendió de Prisma 6.19.3 con el adapter `pg`** (sirve para todo lo que venga):
- un único, común o **parcial**, llega como **P2002** con `meta: { modelName, target: [columnas] }`, **sin el nombre del índice**;
- un **CHECK** llega como `PrismaClientUnknownRequestError` **sin código**: el mensaje trae el `23514` de Postgres y el nombre del CHECK. Por `$executeRaw` es P2010;
- una FK es **P2003** con `meta.constraint`;
- en `$queryRaw`, las columnas de tipo `name` (`conname`, `indexname`) no se deserializan (P2010): hay que pasarlas a `::text`.

**#357, el plan: 3 PRs.** A1 (cajas, apertura y reasignación), A2 (movimientos y cierre con arqueo) y B (resumen, historial y el filtro por mozo en `GET /mesas` y `GET /sessions/activas`, que cierra #357). Decisiones vigentes:
- grupo **`CAJA` = OWNER, GERENTE y JEFE_SALON** (`auth/roles-del-personal.ts`); el ABM de cajas es de OWNER y GERENTE;
- otro restaurante = **403**, como el resto del repo; lo del body que no es del restaurante = 400;
- montos como **`number`** en la API y `Prisma.Decimal` adentro;
- un P2034 que sobrevive al reintento es un **409 genérico** ("Otra operación modificó esto al mismo tiempo; probá de nuevo"); los P2002 conocidos tienen su mensaje (todo en `caja/conflictos.ts`);
- los mozos sin cuenta no se asignan (400); la segunda caja solo se abre con el turno;
- la precarga de asignaciones desde `MozoMesa` asigna solo las mesas con **exactamente un** mozo activo con cuenta, y devuelve `avisos` con el motivo de las demás.

**#357 A1 (PR #461, mergeado como `c393dcc`).** Commits `282de63` (ABM de cajas), `cc33625` (apertura), `114bbdd` (e2e) y `9c162bf` (reasignación).
- Rutas: `GET/POST /cajas`, `PATCH /cajas/:id`, `POST /turnos`, `GET /turnos/actual` y `PUT /turnos/:id/asignaciones`. Cada controller aparte, para no cambiarle las dependencias a los specs existentes.
- Helpers nuevos de test: `test/caja-en-memoria.ts` (una base en memoria que respeta los `where`: así una mutación que saca un filtro se nota), `test/app-e2e.ts` (AppModule por HTTP, que reemplaza solo `SupabaseAuthGuard` y toma el `Usuario` real por el header `x-test-usuario`; también `contarReintentos`, `mostrarDistribucion` y `contar`) y `test/fixture-de-caja.ts` (datos con marcador de corrida y limpieza en el orden de Restrict). `pipeDeValidacion()` en `test/app-endpoints.ts` es una copia del `ValidationPipe` de `main.ts`, que lo arma inline.
- Las mutaciones contra la base: sin serializable en `CajasService.actualizar`, la carrera "desactivar mientras se abre" falló 14 de 30; sin serializable en la reasignación, 29 de 30. El borrado de las asignaciones fuera de la transacción dio 0 de 30 en la carrera; lo atrapa un unitario que le pasa a `$transaction` un cliente **distinto** del de afuera y verifica que todo vaya por `tx` (patrón que se repite en todos los services de la caja).
- En la cobertura del CI, `turbo test:coverage` de todas las apps juntas tiró **timeouts en web-admin** (`invitar-dueno.spec.tsx` y `DuenosPage.spec.tsx`) por carga de la máquina; aislado pasa 860/860, y en el CI del #461 no apareció.

**#357 A2 (rama `feat/caja-cierre-backend`, desde `c393dcc`, sin push).**
- `67d2dc7`: **`caja/esperado-de-caja.ts`**, la función pura del esperado con `Prisma.Decimal` (cuentan solo los pagos aprobados; `mercadopago` se ignora; cada método suma monto + propina; el efectivo suma el fondo y los ingresos y resta los egresos; puede dar negativo). Y **`POST /turnos/:id/movimientos`** (`MovimientosService`, serializable `'registrarMovimiento'`, 409 con el turno cerrado, 400 si la caja no está abierta en el turno, `usuarioId` de la cuenta).
- `157ab16`: **`POST /turnos/:id/cierre`** (`CierreService`, serializable `'cerrarTurno'`). El body trae el declarado de los 4 métodos por caja (`DeclaradoDto implements Record<MetodoArqueo, number>`); tienen que venir exactamente las cajas abiertas del turno. Antes de escribir valida que el esperado y la diferencia entren en `Decimal(10,2)` (400, no 500). Escribe 4 filas de `ArqueoMetodo` por caja, cierra las `TurnoCaja` y el turno con el mismo `cerradoEn` y `cerradoPorUsuarioId` de la cuenta, y suma las observaciones como "Cierre: <texto>". **Las mesas abiertas se leen después del commit, por fuera de la transacción** (son un aviso). El P2002 del arqueo se traduce a 409 `MENSAJE_TURNO_CERRADO`.
- **Paso 3, sin commitear:** el fixture suma `sesion()` y `pago()` (la limpieza borra los pagos antes que `turno_caja` y las sesiones antes que las mesas), y **`caja/cierre.e2e-spec.ts`** con 19 tests en 9 casos (ciclo completo con esperados literales, decimales exactos, turno cerrado inmutable, validaciones contra la base, reapertura, permisos y 3 carreras).
- **Las carreras del cierre** (4 corridas de 10 rondas, siempre igual): dos cierres a la vez → un 200 y un 409 que sale del **P2002 del único del arqueo**, sin reintentos; movimiento contra cierre → siempre "movimiento 201 / cierre 200" con el cierre reintentado y el movimiento contado; cobro simulado contra cierre → siempre "cobrado", **sin ningún reintento**.
- **Las mutaciones (30 corridas, `E2E_RONDAS=2`):** el cierre sin serializable rompe la carrera del movimiento 30/30 (el movimiento commiteado queda fuera del arqueo); el movimiento sin serializable, 30/30 (**las dos transacciones tienen que ser serializables**); sin la traducción del P2002 del arqueo, la carrera de dos cierres da 500 en 30/30. El cierre sin serializable no rompe la carrera de dos cierres (0/30: la ataja el único del arqueo) ni la del cobro (0/30, porque no hubo entrelazado). **Sin el chequeo de turno cerrado del cierre no falla ningún e2e**: el P2002 del único del arqueo da el mismo 409 y revierte; ese chequeo lo cubre solo el unitario.

**Tarea corta resuelta:** `E2E_DISTRIBUCION=1` no imprime cuando jest corre **dos o más archivos** juntos (no imprime nada por archivo, ni siquiera los `PASS`); con un solo archivo imprime, con `jest` directo o con `pnpm --filter`. Para ver las distribuciones, correr cada e2e de a uno.

**Números al cerrar el día:** unitarios 107 suites y 2615 tests (36 skipped); `test:e2e` 8 suites y 121 tests; rutas **135** (el comentario del spec dice "Hoy son 135"); en `main`, la base del día era 95 suites y 2344 tests, y 5 suites e2e con 64 tests.

**Pendiente al retomar** (en este orden)
0. **Dos decisiones de Coty sobre el paso 3 de A2:**
   1. **El caso 9** (cobro simulado contra cierre): el cobro termina antes de que el cierre empiece a leer, así que la carrera real no se ejercita. Propuesta: que el cobro espere una señal **desde adentro** de su transacción (una promesa que el test resuelve cuando el cierre ya empezó), sin `sleep`. Es la evidencia de que el patrón de #358 (transacción serializable que lee la `TurnoCaja` y después inserta el pago) alcanza.
   2. **M-D:** si alcanza con que el chequeo de turno cerrado lo cubra el unitario (el único del arqueo es la segunda defensa en la base) o si se anota como límite conocido en el PR.
1. **Commit del paso 3:** `apps/backend/src/test/fixture-de-caja.ts` y `apps/backend/src/caja/cierre.e2e-spec.ts`.
2. **Cerrar A2 como se hizo con A1:** chequear que `origin/main` no se movió (si se movió, rebasar antes del primer push por Workers Builds), la verificación completa con los comandos del CI, el borrador del PR en `.git/PR-A2-cuerpo.md` ("Refs #357", parte 2 de 3; las carreras con sus números reales y los 0 de 30 explicados), y recién con el ok de Coty, push y PR en borrador.
3. **PR B** (cierra #357): el resumen, el historial paginado y el filtro por mozo (es de vista, no de seguridad).
4. **Para #358, ya decidido o anotado:** el `turnoCajaId` se pone **al aprobar** el pago (también en `confirmarEfectivo`, no solo en `registrarCobro`); `mercadopago` nunca va a una caja; el cobro tiene que ser **serializable** y leer la `TurnoCaja` adentro (M-B lo demuestra). Falta decidir: a qué caja va un cobro con 2 cajas abiertas, y si un cobro sin turno abierto se rechaza.
5. **Siguen:** el checklist de staging del #454 (decide el PR C), los del #450 y el #453, la pasada combinada de staging antes de #358 y los pendientes anteriores.

### 11/11/2026: #357 A2 (PR #462) y B1 (PR #463) mergeados, y B2 paso 0

Otro día de pasos chicos con el ok de Coty en cada uno. Cada commit con los archivos por nombre, uno por uno; esta bitácora y `discovery.module.ts` siguen fuera de todos los commits. Cada prueba contra Postgres usó un contenedor descartable propio (`postgres:17.6`, nombre y puerto nuevos cada vez: 55470 a 55473), borrado con `docker rm -f` al terminar. Docker Desktop estaba apagado y se levantó a mano.

**#357 A2, cierre del paso 3 (rama `feat/caja-cierre-backend`).**
- **Caso 9 partido en tres.** El 9a es la carrera libre de siempre. El **9b** fuerza el entrelazado con dos promesas que el test resuelve a mano (sin sleeps): el cobro lee la caja abierta, el cierre termina entero por HTTP y recién ahí el cobro inserta. Resultado, 3 de 3 rondas: el primer intento del cobro falla con P2034 y el reintento lee la caja cerrada y rechaza; 0 pagos y arqueo en `1000.00`. El **9c** es el control negativo, con un cobro que no lee la caja (lee la sesión, porque Postgres toma la foto en la primera consulta, no en el BEGIN).
- **Lo que cambió lo que sabíamos (9c):** el primer intento del cobro **también** falla con P2034. Pero el reintento ya no choca con nada y, como no mira la caja, inserta el pago en una caja cerrada, afuera del arqueo. En el log de Postgres: 9b, "Canceled on identification as a pivot, during write"; 9c, "Canceled on conflict out to pivot, during read", los dos en el INSERT del pago. **Conclusión para #358: serializable sola no alcanza; lo que hace rechazar al reintento es leer la `TurnoCaja` adentro de la transacción.**
- **M-A2 (el cierre con una transacción común) rompe el 9b en 10 de 10 corridas:** el cobro queda cobrado sin reintento, después del arqueo.
- Commit del paso 3: `d22c5c7`, enmendado como **`0892560`** para cambiar un comentario (se sacó la deducción de la FK y quedó solo lo observado). PR **#462** abierto en borrador; CI (`43025825272`) y Sonar en verde (100 % de cobertura nueva). **Mergeado como `560e81e`.**

**#357 B1, las consultas (PR #463, rama `feat/caja-consultas-backend`).** El B original se partió en dos: **B1 (consultas) y B2 (filtro por mozo, que cierra #357)**, así que el plan quedó en 4 PRs. Decisiones de Coty: "por mozo" es quien cobró (`Pago.mozoId`) con un grupo sin mozo al final; el resumen cuenta solo pagos aprobados de las cajas del turno y no incluye esperado ni arqueo; plata y propina siempre separadas.
- `83bd7e1`: `caja/resumen-de-turno.ts`, la función pura (`porMetodo` con los 4 métodos, `porMozo`, `total`), con `Prisma.Decimal`.
- `1d708a6`: `esMetodoDeArqueo` pasó a `common/caja.constant.ts`, compartido entre el esperado y el resumen.
- `8ff1e10`: **`GET /turnos/:id/resumen`** (`CAJA`, con el rol en el service antes de leer pagos). Mercado Pago va como informativo: aprobados del restaurante con `fechaCobro` en la franja **inclusive** (de `abiertoEn` a `cerradoEn`, o a "ahora" si está abierto), con el flag `requiereRevision`, incluidos los que registra el staff.
- `8c8f203`: **`GET /turnos?restauranteId=&limite=&cursor=`** (historial): `limite` de 1 a 100 (30 por defecto), cursor inclusivo = id del primer turno de la página siguiente (`@IsUUID`; si no es del restaurante, 400), orden `abiertoEn desc, id desc`, arqueo `null` con el turno abierto, y los totales de movimientos con **un solo `groupBy` por página** (sin N+1). Se extrajo `metodosDelArqueoParaLaApi` (`caja/arqueo-para-la-api.ts`), que ahora usa también el cierre.
- `4f32b7b`: **`GET /turnos/:id`** (detalle), después de `GET /turnos/actual` para no taparlo; trae la lista de movimientos de cada caja y las asignaciones. Se exportaron `MOVIMIENTO_SELECT` y `movimientoParaLaApi`, y se extrajo `asignacionParaLaApi`.
- `3b69f36`: `caja/consultas.e2e-spec.ts` (20 tests). El fixture suma `turnoCerrado()` y `pago()` acepta `mozoId`, `fechaCobro` y `requiereRevision`.
- **`test/caja-en-memoria.ts`** ahora respeta los `where` anidados, los rangos de fecha, el `in`, el orden de lista, `take` y `cursor`, y **corta el test si recibe un argumento o un filtro que no conoce**.
- Mutaciones: la función pura 8 de 8; el resumen 10 de 10; el historial 10 de 10; el detalle 5 de 5; contra Postgres 7 de 7. Dos se detectan solo por los argumentos de la consulta, no por la respuesta (el `groupBy` sin el `in`, y los movimientos sin el filtro de turno). En el e2e, la mutación del filtro de turno del resumen al principio solo la atrapaba el caso 2, por arrastre de datos del caso 1: se sumó al caso 1 un pago en una caja de otro turno.
- Números: unitarios **112 suites y 2698 tests** (36 skipped); e2e **9 suites y 143 tests**; rutas **135 → 138**. Cobertura de `src/caja`: 100 % de líneas. Lo único sin cubrir en lo nuevo son los dos `?? ''` defensivos del comparador de `resumen.service.ts:101`.

**El 409 del cierre en el CI (PR #463).** El primer run (`43082470775`) falló en los casos 8 y 9a de `cierre.e2e-spec.ts` (de A2, no de B1) con el cierre en 409. Con un solo cierre por ronda, ese 409 solo puede ser el genérico: un P2034 que sobrevive al único reintento de `runSerializableTransaction`. **No se reprodujo en local:** 0 de 300 rondas por caso, con Postgres a `--cpus=0.5`, ni antes ni después del arreglo. El arreglo (`db2ba34`, solo el test): `comoTerminoElCierre` acepta el 409 genérico solo si el turno y sus cajas siguen abiertos y sin arqueo, y después un cierre sin carrera tiene que dar 200 con la cuenta exacta; el caso 7 acepta `[409, 409]` con las mismas condiciones. Tres mutaciones del service lo respaldan (M1 y M2 pasan por la rama nueva; M3, el que commitea y después da 409, hace fallar los tres casos). El segundo run (`43090550370`) quedó en verde. **PR #463 mergeado como `3fcb2f0`.**

**Cosas que conviene recordar:**
- `turbo test` y `turbo test:coverage` con todas las apps juntas siguen dando timeouts de 5 s por carga (web-admin `invitar-dueno` e `invitar-root`; esta vez también web-cliente `AsistenteDeLaCarta`). Aislados pasan siempre.
- El e2e sin `--forceExit` avisa "Jest did not exit one second after"; ya pasaba en A1 y termina con exit 0.
- `sed -i` en los archivos con CRLF los reescribe enteros: para cambios a mano usar Edit o un script que respete el fin de línea.
- `git rev-parse --short` acepta una sola revisión.

**#357 B2, paso 0 (solo lectura).** Reconocimiento del filtro por mozo en `GET /mesas` y `GET /sessions/activas`. Lo principal:
- Hoy los dos endpoints usan `@RequiereRolEn(..., SALON)` y **no reciben el usuario**. Sumar `@UsuarioActual()` rompe solo dos asserts de specs de endpoints (`toHaveBeenCalledWith(REST)`), en `sessions-salon-endpoints.spec.ts:44` y `mesas-endpoints.spec.ts:82`.
- Una cuenta tiene **a lo sumo una membresía por restaurante** (`@@unique([usuarioId, restauranteId])`): "MOZO y JEFE_SALON a la vez" no existe. La única combinación posible es OWNER por la marca más MOZO.
- El filtro entra en el mismo `findMany` como condición sobre `asignacionesTurno` (mesa sin asignación en un turno abierto, o asignada a su `Mozo`). Sin turno abierto no filtra solo. Costo: 2 consultas de roles para todos (o 0 si `MembresiaGuard` los dejara en el request) y 1 más (`mozoDe`) para el MOZO.
- Lo afecta en web-staff: `MesasPage`, `TomaPedidosPage` (un mozo no podría tomar pedidos de una mesa de otro) y `PagosMozo` (ni cobrarla). web-admin no cambia.
- Siguen mostrando mesas ajenas (fuera de B2): `GET /pedidos`, `GET /waiter-calls`, `GET /sessions/pagadas` e `historial`, y `GET /payments/sesiones`. En tiempo real, `order:new` agrega pedidos ajenos en `PedidosPage`.
- Falta en el fixture un helper que cree una cuenta MOZO con su perfil `Mozo` en la misma cuenta.

**Pendiente al retomar** (en este orden)
0. **Mirar el CI (`43096423473`) y el Deploy — Staging (`43096423535`) de `3fcb2f0` en `main`**: a las 20:36 UTC seguían en `queued`, sin jobs.
1. **Las 6 decisiones de Coty para B2** (con mi recomendación):
   1. ¿Se filtra con OWNER (marca) + MOZO? Recomendado: no; filtrar solo si el único rol es MOZO.
   2. ¿Una asignación a un mozo dado de baja cuenta como asignada? Recomendado: no, tratarla como mesa sin asignar (si no, nadie con rol MOZO la ve).
   3. ¿Se acepta que un mozo no pueda tomar pedidos ni cobrar mesas de otro desde web-staff? Recomendado: sí (decisión 6 de #355); el JEFE_SALON ve todo.
   4. ¿Los roles se vuelven a pedir con `rolesEnRestaurante` o los deja el guard en el request? Recomendado: volver a pedirlos y no tocar `MembresiaGuard`.
   5. ¿Los endpoints que siguen mostrando mesas ajenas quedan afuera? Recomendado: sí, como límite conocido del PR.
   6. ¿B2 toca web-staff? Recomendado: no, solo backend.
2. **B2 en un solo PR (`Closes #357`):** el helper de visibilidad con sus unitarios; los dos endpoints con `@UsuarioActual()` y la visibilidad como parámetro opcional de los services; el e2e con dos mozos (más el helper del fixture); verificación, borrador y, con el ok, push.
3. **Para #358, ya decidido o anotado:** el cobro tiene que ser serializable y **leer la `TurnoCaja` adentro** (el 9c lo demuestra); el `turnoCajaId` se pone al aprobar (también en `confirmarEfectivo`); `mercadopago` nunca va a una caja. Hay que repetir el 9b contra el cobro real. Falta decidir a qué caja va un cobro con 2 cajas abiertas y si un cobro sin turno abierto se rechaza.
4. **Siguen:** el checklist de staging del #454 (decide el PR C), los del #450 y el #453, la pasada combinada de staging antes de #358, y los pendientes anteriores.

### 12/11/2026: datos del IPI (latencia de WebSocket, Sonar, axe), PR de accesibilidad y la cola trabada de `main`

Pedido de Coty: tres datos para el informe final, sin cambiar código de producción (salvo el PR de los 4 code smells), con fecha, commit y comando de cada uno.

**1. Latencia de `order:new` (RNF-07, meta < 500 ms).** Script nuevo `scripts/latencia-ws/` (lib pura + tests + `main.mjs`), con la infraestructura del E2E de staging: mismas variables y guardas (`erroresDeDestino`), mesa de `e2e.e2e_preparar` y limpieza con `e2e.e2e_limpiar`. Un socket como el de web-staff (`/ws`, solo websocket, token del mozo de prueba) hace `cocina:join`; los pedidos van de a uno y se emparejan por id; perdido = no llega en 10 s.
- Corrida del 12/11 18:24 UTC, staging en `560e81e`, script en `7cb11e5`, 100 pedidos: **0 perdidos**; respuesta del POST → evento **p50 −1 ms, p95 0,9 ms, máx 321 ms** (86 de 100 llegan antes que la respuesta: el servidor emite antes de responder); envío → evento p50 435, p95 668, máx 891 (incluye la red local → Railway). Limpieza: 1 mesa, 1 sesión, 100 pedidos y 100 ítems. Reporte: `docs/calidad/mediciones/latencia-ws-2026-11-12.json`.
- Una corrida anterior (18:23) falló por timeout antes de crear la mesa; `e2e_limpiar` con su marcador dio `mesa_encontrada: false`.
- **Contraseña de `e2e_staging` cambiada** (no estaba guardada en ningún lado): `ALTER ROLE` en el SQL Editor de staging, URL por el Session pooler `aws-1-us-east-2.pooler.supabase.com` (el `aws-0-sa-east-1` del repo no es el de staging) y secreto `E2E_STAGING_DB_URL_LECTURA` actualizado por Coty a las 18:42 UTC. La URL local está en `privado/.env.latencia`.

**2. SonarCloud** (API, 12/11 16:34 UTC; último análisis de `main` del 11/11 13:48 UTC sobre `560e81e`): gate OK (95,9 % de cobertura nueva); cobertura de líneas global 87,8 %; backend 98,2 %, web-auth 95,7 %, web-staff 92,0 %, web-cliente 86,1 %, web-admin 85,3 %, ui 65,0 %, auth-client 100 %. Del CI `43031652147` (artifacts): 4750 tests unitarios aprobados, 36 omitidos (backend), 0 fallidos; e2e del backend 123/123; cobertura del backend en el artifact 96,05 % (Sonar excluye `*.module.ts`, `main.ts` y `*.dto.ts`).

**3a. PR #464 (`d454eaa`, mergeado como `daec229`, 18:46 UTC):** los 4 code smells (S6853 en la etiqueta de `EditarPedidoModal`; S6848 en `SesionCard`, que pasa a `<button>`, y en los fondos de los dos modales: `role="presentation"`, la ventana es `dialog` con `aria-modal` y `aria-labelledby`, y Escape cierra con `useCerrarConEscape`). Gate OK con 100 % nuevo y 0 issues. En `main` quedan **56 issues de accesibilidad** de Sonar en otros archivos.

**3b. axe** (`scripts/accesibilidad/`, axe-core 4.14, WCAG 2.0 a 2.2 A y AA, Chrome): corrida del 12/11 18:27 UTC sobre `560e81e`, script en `c338d2e`. 30 de 32 pantallas (Pedidos e Historial de web-admin redirigen con el OWNER: hace falta un GERENTE). **31 observaciones sobre 214 elementos**: 1.4.3 contraste (serious) 25/208 y 4.1.2 botón de ícono sin nombre (critical) 6/6 (las 5 pantallas del mozo y Mesas de web-admin). web-auth 0, web-cliente 10, web-admin 10, web-staff 11. Ninguna corregida. Reporte: `docs/calidad/mediciones/axe-2026-11-12.json`. Recorridos para VoiceOver y TalkBack: `docs/calidad/accesibilidad-recorridos-lector.md`.

**E2E de staging, últimos 5 (deploys `43031652217` a `42234276007`):** todos `ok` y sin reintentos; `msApi` promedio: abrir sesión 355, pedido 323, pedido de efectivo 400, confirmar efectivo 650 ms.

**La cola trabada de `main`:** el CI `43096423473` y el deploy `43096423535` de `3fcb2f0` se crearon el 11/11 20:30 UTC, entre dos incidentes de GitHub (Webhooks 20:22–20:26; Actions crítico 20:48–21:21), y quedaron en `queued` con 0 jobs. Cancel ("completed"), force-cancel (409 "not queued yet") y DELETE (403) fallan: quedan ahí hasta un ticket a soporte. No bloquean nada; el merge del #464 disparó runs nuevos.

**Cosas que conviene recordar:**
- `.env.smoke` tiene URLs viejas de Vercel; para el navegador hay que usar `<app>.staging.menyu-app.com` (la cookie compartida solo anda ahí).
- En el restaurante E2E quedaron dos mesas viejas: `e2e-40341820981-1` y `-2`.
- El `!` de Claude Code no tiene terminal interactiva (`read` no anda) y bash se come las `\` de las rutas sin comillas.

**Pendiente al retomar** (en este orden)
0. Mirar el CI `43283316209` y el deploy de staging `43283316327` de `daec229` (el E2E del deploy es la primera prueba del secreto nuevo).
1. Mergear el #465 (scripts, reportes y recorridos), que quedó abierto.
2. Decidir qué hacer con las 31 observaciones de axe y los 56 issues de Sonar; revisar Pedidos e Historial de web-admin con un GERENTE; la prueba con VoiceOver y TalkBack.
3. Lo pendiente del 11/11: las 6 decisiones de B2 (#357) y lo demás de esa lista.

### 12/11/2026 (tarde): más datos para el informe (issues, versión en producción, CI y accesibilidad)

Pedido de Coty, solo lectura (`gh`, artifacts del CI, API pública de SonarCloud y los reportes ya versionados). No se cambió código ni se corrió ninguna medición.

**Latencia de `order:new`, lo que el reporte no tiene.** Del mismo reporte (`docs/calidad/mediciones/latencia-ws-2026-11-12.json`):
- **p99**, calculado a partir de las 100 muestras con el mismo percentil del script (rango más cercano): respuesta → evento **299,8 ms**; envío → evento **769,4 ms**.
- Hay tres valores atípicos en respuesta → evento: el pedido 59 (+299,8), el 62 (+321) y el 86 (−301,7). El resto está entre −20,4 y +5,4 ms. Los 100 POST dieron 201.
- El JSON no guarda el commit del script (`7cb11e5` sale de esta bitácora) ni el comando. El comando documentado es `node --env-file=<variables> scripts/latencia-ws/main.mjs [--pedidos 100]`; para que el reporte quede en `docs/calidad/mediciones/` hace falta `LATENCIA_REPORTE`, o se movió después. Para el informe, el comando literal lo tiene que confirmar Coty.
- RNF-07 se cumple con la medida desde la respuesta (p95 0,9 ms). Con la medida desde el envío (p95 668 ms, con la red local → Railway) no: el informe tiene que decir cuál de las dos es la de RNF-07.
- La limpieza (`mesa_encontrada: true`; 1 mesa, 1 sesión, 1 cliente, 100 pedidos y 100 ítems) es lo que informó `e2e_limpiar`: no se comprobó con otra consulta.

**Issues del plan (estado al 12/11 ~19 UTC).** **Los 21 están abiertos y ningún PR cerró ninguno:** #112, #128, #129, #135, #137, #139, #140, #141, #142, #143, #145, #146, #147, #149, #152, #344, #357, #358, #359, #360 y #361. PRs mergeados que los citan sin cerrarlos:
- #357: #460 (10/11, schema), #461 (10/11, A1), #462 (11/11, A2) y #463 (11/11, B1, "parte 3 de 4").
- #358: los mismos #460 a #463 (no tiene un PR propio). #361: el #460. #360: el #453 (04/11) y el #454 (05/11), que son de pagos.
- La búsqueda de `gh` también devuelve PRs para #112, #135, #141, #143 y #149, pero ninguno los cita: son falsos positivos de la búsqueda de texto.

**Versión en producción: v1.4.0.** Tag del 27/10 19:59 ART (`94fe19f`); "Deploy — Production" del **28/10 17:39 UTC**. En GitHub Releases el último es v1.0.5: de v1.0.6 a v1.4.0 hay solo tags. **No tiene la caja ni el asistente** (ni `src/caja` ni `src/asistente` en el tag); los dos están solo en `main`. Y la caja tampoco está completa en `main`: falta la parte 4 de #357 (B2) y #358 a #361.

**Último CI en verde de `main`: `43283316209` (`daec229`, 12/11 18:46 UTC).** El de `92904e0` (`43284777010`) seguía corriendo; ese commit no toca `apps/` ni `packages/`.

| Paquete | Ejecutados | Aprobados | Omitidos | Fallidos | Cobertura de líneas |
|---|---|---|---|---|---|
| backend (unitarios) | 2734 | 2698 | 36 | 0 | 96,16 % (3841/3994) |
| backend (e2e) | 143 | 143 | 0 | 0 | — |
| web-cliente | 768 | 768 | 0 | 0 | 86,08 % |
| web-admin | 860 | 860 | 0 | 0 | 85,26 % |
| web-staff | 211 | 211 | 0 | 0 | 92,01 % |
| web-auth | 93 | 93 | 0 | 0 | 95,68 % |
| auth-client | 84 | 84 | 0 | 0 | 100 % |
| ui | 44 | 44 | 0 | 0 | 65,72 % |
| **Total unitarios** | **4794** | **4758** | **36** | **0** | |

- La cobertura sale de los `coverage-summary.json` de los artifacts. La del backend no coincide con Sonar (98,2 %), porque Sonar excluye `*.module.ts`, `main.ts` y `*.dto.ts`.
- 4758 aprobados contra los 4750 de `560e81e`: son los 8 tests nuevos de `packages/ui` y web-admin del #464.
- Jest avisó "A worker process has failed to exit gracefully" en los unitarios del backend; no hizo fallar el CI.

**axe: 0 de las 31 observaciones corregidas. No se volvió a correr.** El único cambio de UI después de la corrida es el #464, que no toca ninguna:
- No cambia ninguna clase de color, así que no corrige ninguna de las 25 de contraste.
- Los 6 `button-name` son botones de ícono del header (las 5 pantallas del mozo; en Historial es `header > button`) y uno de Mesas de web-admin. El #464 cambió la tarjeta del historial y los modales, no esos botones.
- Historial de web-admin se salteó con el OWNER, y los modales no se abren en la corrida.
- Además, faltan las variables para correrlo: `privado/.env.latencia` tiene solo `E2E_STAGING_DB_URL_LECTURA`, y `.env.smoke` tiene las URLs viejas de Vercel.

**SonarCloud: 63 issues abiertos con la etiqueta `accessibility`** en `main` (análisis del 12/11 18:50 UTC, sobre `daec229`):
- Por regla: S6848 47, S6853 8, S9379 (`autofocus`) 7 y S6852 1.
- Por app: web-admin 44, web-cliente 10, web-staff 7 y ui 2.
- Los 4 del #464 figuran como FIXED en ese análisis.
- **Los 56 de la entrada anterior no cuentan los 7 de S9379** (63 − 7 = 56). Para el informe hay que decidir si se cuentan.

**Lo que se resolvió del pendiente anterior:**
- El CI `43283316209` y el Deploy — Staging de `daec229` terminaron en verde. El job E2E del deploy no se miró por separado.
- El #465 se mergeó (`92904e0`), y su Deploy — Staging también terminó en verde: `/health` de staging responde con `92904e0`.

**Pendiente al retomar** (en este orden)
0. Mirar el CI `43284777010` de `92904e0`, que seguía corriendo.
1. Decidir qué hacer con las 31 observaciones de axe y los 63 issues de Sonar (o 56 sin `autofocus`); revisar Pedidos e Historial de web-admin con un GERENTE; la prueba con VoiceOver y TalkBack. Para volver a correr axe, juntar las variables en un archivo de `privado/`.
2. Para el informe: confirmar el comando literal de la latencia y cuál de las dos medidas es la de RNF-07.
3. Lo pendiente del 11/11: las 6 decisiones de B2 (#357) y lo demás de esa lista.

### 12/11/2026 (noche): #357 B2, pasos 1 y 2 (rama `feat/caja-filtro-por-mozo`)

Pasos chicos con el ok de Coty en cada uno, sin push. Cada commit con los archivos por nombre; esta bitácora y `discovery.module.ts` siguen fuera. Sin Postgres en estos dos pasos: el e2e es el paso 3.

**Las 6 decisiones de B2 (Coty, sobre el paso 0 del 11/11):**
- Un solo PR, `Closes #357`.
- Se ve todo si los roles de la cuenta en el restaurante incluyen OWNER, GERENTE o JEFE_SALON. Cualquier otro caso se filtra: MOZO, y también un rol inesperado (falla del lado del filtro). Decide el **rol de la membresía**, nunca `Mozo.esJefeSalon`.
- "Asignada" = una `AsignacionTurno` de un turno abierto (`cerradoEn` null) cuyo mozo está activo. La de un mozo dado de baja cuenta como mesa sin asignar.
- Sin turno abierto, o con un turno sin asignaciones, ninguna mesa está asignada: se ve todo.
- Un MOZO sin perfil activo (`mozoDe` da null) ve solo las mesas sin asignar.
- Los roles se piden con `AccesoService.rolesEnRestaurante`, sin tocar `MembresiaGuard` ni `AccesoService`; `mozoDe` solo se llama si hay que filtrar.

**La base de la rama.** El pedido decía `3fcb2f0`, pero `origin/main` ya estaba en `92904e0` (se habían mergeado #464 y #465, que no tocan `apps/backend`). La rama salió de `92904e0` y Coty aprobó esa base, sin rebase.

**Paso 1, `5c87690`: `caja/visibilidad-de-mesas.ts`** (funciones planas, sin provider ni módulo).
- `VisibilidadDeMesas` (`todas` o `del-mozo` con `mozoId` o null), `decidirVisibilidad` (pura), `ASIGNADA` (constante exportada), `dondeMesaVisible` (el fragmento de `Prisma.MesaWhereInput`) y `visibilidadDeMesas` (async: pide los roles y, solo si hay que filtrar, el mozo).
- Se comprobó con el typecheck, en un archivo temporal ya borrado, que el fragmento se esparce en el `where` de `mesa.findMany` y en el `mesa` de `sesionMesa.findMany`. Para asegurar que `tsc` revisaba ese archivo se le metió un error a propósito. Ninguno de los dos `where` tiene un `OR` propio que se pueda pisar.
- 25 tests. Mutaciones: las 9 pedidas mueren. Se sumaron dos (M8b, el `OR` con el id fijo `'mozo-1'`, y M10, `decidirVisibilidad` con el id fijo): **M8b sobrevivía** porque los tests usaban un solo id de mozo. Con casos para `mozo-2` mueren las dos.

**Paso 2, `5023417`: el filtro en `GET /mesas` y `GET /sessions/activas`.**
- Los dos controllers reciben `@UsuarioActual()` y lo pasan como segundo argumento, obligatorio en los services (olvidarlo no puede apagar el filtro sin avisar). Los guards no cambian.
- En sesiones el fragmento va **dentro de `mesa`**, no al nivel de la sesión.
- El `@ApiOperation` de `/sessions/activas` y los comentarios dicen que el filtro es **de vista, no de seguridad**.
- Specs: los de endpoints verifican también la cuenta que llamó. `mesas.service.spec` usa `accesoDeTest()` con `jest.spyOn` para los casos que el mundo de test no tiene (MOZO sin perfil, OWNER + MOZO); `sessions.consultas.spec` suma `rolesEnRestaurante` y `mozoDe` a su doble. `test/caja-en-memoria.ts` no se tocó.
- 16 tests nuevos (8 por service) y 7 modificados.
- Mutaciones: las 12 mueren. El fragmento al nivel de la sesión ni compila (`SesionMesaWhereInput` no tiene `asignacionesTurno`); con un cast para que compile, lo mata un test.
- Docs: `docs/auth/specs/auth.md` (las dos filas de la matriz) y `doc.md` (el resumen y la sección de `GET /api/mesas`). `Documentacion/` no se tocó: son resúmenes históricos.
- Números: unitarios **113 suites y 2739 tests** (36 skipped). `rutas-por-autenticacion.spec.ts` pasa sin cambios (controla un piso, no compara contra 138 exacto).

**Cosas que conviene recordar:**
- `ts-jest` compila con chequeo de tipos: una mutación que no tipa muere por el compilador, no por un test. Para saber si un test la mata, hay que repetirla con un cast.
- El backend no tiene lint (`"lint": "echo ... lint pendiente"`).
- Un heredoc largo en el Bash de Claude Code se cortó a la mitad sin error claro (solo el aviso "here-document ... delimited by end-of-file"): para scripts largos, escribirlos con Write.
- Las ediciones de los archivos con CRLF se hicieron con un script de perl que respeta el fin de línea y exige que cada texto a reemplazar aparezca una sola vez.

**Lo que se resolvió del pendiente anterior:** el CI `43284777010` de `92904e0` terminó en verde (19:03 UTC).

**Pendiente al retomar** (en este orden)
1. **B2, paso 3:** el e2e contra Postgres con dos mozos (falta en el fixture el helper que crea una cuenta MOZO con su `Mozo` en la misma cuenta). Después, verificación, PR en borrador y, con el ok, push.
2. **Límites conocidos de B2**, para anotar en el PR: siguen mostrando mesas ajenas `GET /pedidos`, `GET /waiter-calls`, `GET /sessions/pagadas` e `historial`, `GET /payments/sesiones` y, en tiempo real, `order:new` en `PedidosPage`. En web-staff un mozo no va a poder tomar pedidos ni cobrar mesas de otro; B2 no toca web-staff.
3. **Para #358:** lo anotado el 11/11 (cobro serializable que lea la `TurnoCaja` adentro, a qué caja va un cobro con 2 cajas abiertas, cobro sin turno abierto).
4. **Del informe:** las 31 observaciones de axe y los 63 issues de Sonar (o 56 sin `autofocus`); el comando literal de la latencia y cuál medida es la de RNF-07.
5. **Siguen:** los checklists de staging del #454, #450 y #453, y la pasada combinada de staging antes de #358.

### 13/11/2026: #357 B2, paso 3 (e2e) y paso 4 (PR #466 en borrador)

Pasos chicos con el ok de Coty en cada uno. Cada commit con los archivos por nombre; esta bitácora y `discovery.module.ts` siguen fuera. Docker Desktop estaba apagado y se levantó a mano.

**B2 completo, en tres commits** (rama `feat/caja-filtro-por-mozo`, desde `92904e0`):
- **`5c87690`, el helper** `caja/visibilidad-de-mesas.ts`: 25 tests y 11 mutaciones muertas (detalle en la entrada del 12/11, noche).
- **`5023417`, el cableado** en `GET /mesas` y `GET /sessions/activas`: 16 tests nuevos y 7 modificados, y 12 mutaciones (11 planeadas, de las que una no compila, más su variante con cast). Unitarios: **113 suites y 2739 tests** (36 skipped).
- **`24e35d3`, el e2e** contra Postgres (`caja/filtro-por-mozo.e2e-spec.ts`, 11 tests, casos a a k) y el helper `personalConPerfil(rol, restauranteId, { nombre?, activo? })` del fixture, que crea en la misma cuenta el `Usuario`, la membresía y el perfil `Mozo`. `limpiar()` no necesitó cambios: ya borraba las asignaciones antes que los mozos, y los mozos antes que las membresías y los usuarios.

**Paso 3, el e2e.**
- Postgres descartable `menyu-e2e-b2-p3` (`postgres:17.6`, puerto 55474), migraciones desde cero y `docker rm -f` al final. Después de cada corrida, incluidas las que cayeron por timeout, se contaron las filas de todas las tablas: solo quedaba `_prisma_migrations`.
- Cada test arma su propio mundo (marca, restaurante R, m1 a m5, Ana y Beto como MOZO, un OWNER, un GERENTE, una JEFE_SALON, una caja y sesiones en m1, m3 y m5) y abre el turno por HTTP. Cada caso se mira en los dos endpoints: los ids por conjunto, y el orden contra la lista del GERENTE. Las sesiones llevan `iniciadaEn` distintos, porque `/sessions/activas` ordena por ahí y un empate dejaría el orden librado a Postgres.
- La baja del mozo (caso h) se hace como en la app: `DELETE /restaurantes/:id/personal/:membresiaId`. El test verifica que el perfil queda `activo: false` y sus 2 asignaciones siguen en el turno.
- e2e completo: **10 suites y 154 tests** (eran 9 y 143).
- **Mutaciones del e2e, 10 de 10 muertas**, ninguna por el compilador (casos que fallan): sin el spread en mesas, a c d f g i j; sin el spread en sesiones, ídem; `ASIGNADA` sin `mozo: { activo: true }`, h; `ASIGNADA` sin `turno: { cerradoEn: null }`, d f; la rama `some` sin el turno abierto, f; `none` por `some`, a c d e f g h i j; el `OR` sin la rama `some`, a d f g h; `ROLES_QUE_VEN_TODO` sin JEFE_SALON, b; sin OWNER, b c j; `visibilidadDeMesas` siempre `'todas'`, a c d f g i j. Script en el scratchpad, con copia aparte y `cmp` después de restaurar.

**La desviación del QR en Jest.** La primera corrida dio 4 de 11 rojos por el timeout de 30 s, y una corrida tardó 250 s. Medido: `GET /mesas` tardaba ~5,5 s y `/sessions/activas` u otro endpoint, ~30 ms. La causa es `QRCode.toDataURL`: dentro de Jest cada QR tarda **~1,1 s** (fuera de Jest, de 6 a 25 ms), y `GET /mesas` genera uno por mesa. No es la red (con `127.0.0.1` en lugar de `localhost` daba igual). En el spec, `toDataURL` es un `jest.spyOn` en 10 de los 11 casos; el caso a restaura el real para la última consulta (las 3 mesas de Ana) y exige un PNG, con un timeout de 60 s. El archivo quedó en ~26 s.

**El hallazgo del mozo dado de baja.** La baja desde Personal borra la membresía y deja el `Mozo` en `activo: false`, pero sus asignaciones siguen en el turno abierto. Si "asignada" no mirara si el mozo está activo, esas mesas quedarían invisibles para todos los que tienen rol MOZO hasta que alguien las reasigne. Por eso `ASIGNADA` exige `mozo: { activo: true }`, y el caso h lo prueba (la mutación que lo saca solo la atrapa ese caso).

**Paso 4, el PR #466** (borrador, `Closes #357`).
- Antes del push: `origin/main` seguía en `92904e0` (sin commits nuevos), salían exactamente los 3 commits y `landing/` no tenía diferencias contra `main`.
- Cuerpo en `.git/PR-B2-cuerpo.md`, con el formato del #463. Las mutaciones del cableado son 12, no 13: 11 planeadas (M3 no compila) más M3b.
- CI del PR: run `43456351501` en verde. CI 6m11s; E2E 1m05s, con 10 suites y 154 tests y `filtro-por-mozo.e2e-spec.ts` en PASS (el log no es verbose: los 11 salen de 154 − 143); SonarCloud con el gate OK: cobertura nueva 100 % (23 líneas), duplicación 0,0 %, 0 issues, 0 hotspots y ratings A. **No apareció el check "Workers Builds: menyu"**, que en #463 y #465 sí estaba. Cuerpo completado con Sonar (`gh pr edit --body-file`) y verificado con `gh pr view --json body`.

**Cosas que conviene recordar:**
- Dentro de Jest, `QRCode.toDataURL` tarda ~1,1 s por QR: un e2e que pida `GET /mesas` con varias mesas pasa el timeout si no lo reemplaza.
- `export A=x B=$A` en una sola línea deja `B` vacío (se expande antes de asignar). Con `DIRECT_URL` vacío, dotenv no lo pisa con el del `.env` y la guarda de `jest.e2e.config.js` cortó con "DIRECT_URL no apunta a un Postgres local": la guarda funcionó.
- `jest -t` con `pnpm test:e2e -- …` no filtró; con `pnpm exec jest --config jest.e2e.config.js --runInBand <archivo> -t "<nombre>"`, sí.

**Lo que se resolvió del pendiente anterior:** el paso 3 de B2 (el e2e con dos mozos y el helper del fixture) está en `24e35d3`, y los límites conocidos de B2 quedaron anotados en el cuerpo del PR #466.

**Pendiente al retomar** (en este orden)
1. **PR #466:** la revisión de Coty (mergear y sacar el borrador lo hace ella). Averiguar por qué no corrió Workers Builds. Al mergear, actualizar la fila de B2 en "Estado actual".
2. **La pasada combinada por staging antes de #358**, con los checklists del #454 (decide el PR C), #450 y #453.
3. **Para #358:** el cobro serializable que lea la `TurnoCaja` adentro de la transacción; a qué caja va un cobro con 2 cajas abiertas; qué pasa con un cobro sin turno abierto.
4. **#359 (web-staff):** lo que B2 deja afuera: avisar en `TomaPedidosPage` y `PagosMozo` por qué un mozo no ve una mesa, y si se filtran `GET /pedidos`, `GET /waiter-calls`, `GET /sessions/pagadas` e `historial`, `GET /payments/sesiones` y `order:new` en `PedidosPage`.
5. **Del informe:** las 31 observaciones de axe y los 63 issues de Sonar (o 56 sin `autofocus`); el comando literal de la latencia y cuál medida es la de RNF-07.

### 16/11/2026: #358 partes A y B mergeadas (#470 y #471), PR 0 de #359 mergeado (#472) y PR 1 de #359, etapa 1

**Lo que pasó entre el 13 y hoy.** El #466 (#357 B2) se mergeó el 14/11 a las 09:35 ART (`d5c7450`) y cerró #357. Antes, el 13/11 a la noche, se había mergeado el #469 (accesibilidad de web-cliente).

**#358, parte A: los cobros del personal van a una caja del turno (PR #470, mergeado 10:50 ART, `7a502d9`).**
- `PATCH /sessions/:id/cobro` y `POST /payments/confirmar-efectivo` leen la caja dentro de su transacción serializable, antes de cualquier escritura, y le ponen `turnoCajaId` al pago. Lo hace el helper `caja/caja-del-cobro.ts`. Los mensajes viven en `caja/conflictos.ts`.
- Los 400 del cobro:
  - sin turno abierto: "No hay un turno abierto", sin escribir nada;
  - con 2 cajas y sin `cajaId`: "Hay más de una caja abierta: indicá en cuál se cobra";
  - con una caja que no está abierta: "La caja no está abierta en este turno".
- `cajaId` y `propina` son opcionales. La propina va aparte del monto y no cambia el total de la sesión. Un P2034 que sobrevive al reintento sale como el 409 genérico ("Otra operación modificó esto al mismo tiempo; probá de nuevo").
- El E2E de staging abre el turno en el paso 3b y lo cierra en el 5b.
- Sin migración y sin rutas nuevas. CI de `main` `43879611515` y deploy de staging `43879611457` en verde.

**#358, parte B: Mercado Pago a la caja del turno (PR #471, mergeado 14:20 ART, `87a183e`).**
- **La preferencia:** sin turno abierto responde 400 ("El restaurante no está recibiendo pagos por Mercado Pago en este momento").
- **El webhook:** aprueba en la caja abierta más antigua. Sin turno, aprueba igual pero sin caja y con la marca `aprobado-sin-turno`.
- **El resumen del turno** muestra los Mercado Pago de sus cajas.
- **Números:** unitarios 2783 → **2806**, e2e 171 → **183**, y 26 mutaciones muertas.
- CI `43917383346` y deploy `43917383644` en verde.
- **#358 sigue abierto:** la parte C son los frontends (#359 web-staff y #360 web-admin).

**#359, PR 0: las lecturas para web-staff (PR #472, mergeado 16:03 ART, `a52385f`).** Solo backend y sin migración (`prisma migrate diff --exit-code` da 0). Hecho en tres etapas, cada una con el ok de Coty.
- **`GET /cajas/abiertas?restauranteId=`**, del grupo SALON, así que también lo ve el MOZO. Responde `{ cajas: [{ cajaId, nombre }] }`, por nombre y con desempate por id. `cajaId` es el `Caja.id`, el que acepta el cobro. Vacío = no hay turno abierto. No expone fondo, turno ni quién abrió.
- **`GET /turnos/preparacion?restauranteId=`**, del grupo CAJA. Responde `{ mozos, mesas, precarga }`, para que el JEFE_SALON pueda armar y reasignar el turno: `GET /mozos` es solo de ADMINISTRACION. `precargar` salió de `apertura.service.ts` a `precarga-de-asignaciones.ts`, y la apertura y la preparación usan la misma función.
- **Números:**

  | | Antes | Después |
  |---|---|---|
  | Unitarios (suites / tests) | 114 / 2806 | **116 / 2832** |
  | e2e (suites / tests) | 12 / 183 | **13 / 189** |
  | Rutas | 138 | **140** |

  0 CR en los blobs. **21 de 21 mutaciones muertas**, ninguna por el compilador; 7 las mata solo el unitario, y el cuerpo del PR explica por qué.
- **Decisión de Coty en la etapa 2:** el desempate por id en el orden de los mozos se queda.
- Cuerpo del PR en `C:\dev\personal\Tesis\PR-359-0-cuerpo.md`. CI `43935297337` y deploy `43935297488` en verde.

**#359, PR 1: el cobro con caja y propina en web-staff (rama `feat/web-staff-cobro-con-caja`, sin push).** Solo frontend, en 3 etapas con reporte en cada una.
- **La base de la rama.** La rama estaba en `87a183e`. Como no tenía commits propios, se adelantó a `a52385f`, el `main` con el #472.
- **Partida, sobre ese `main` limpio:**
  - web-staff: typecheck 0, **14 archivos / 211 tests**;
  - `@menyu/types`: typecheck 0, sin tests (su `test` es un `echo`).
- **Etapa 1, terminada:**
  - **`d05c193`, los tipos:** `CajaAbierta` y `CajasAbiertas` en `packages/types/src/caja.types.ts`, exportados desde `index.ts`.
  - **`67eab43`, web-staff:**
    - **La API:** `api.cajas.abiertas(restauranteId)`, y el body de `registrarCobro` suma `cajaId?` y `propina?`.
    - **`utils/propina.ts`:** `parsearPropina`.
      - Vacía o 0 no se manda.
      - Acepta coma o punto, hasta 2 decimales, sin separador de miles y con un tope de 99.999.999,99.
      - Hay un mensaje distinto para cada error.
    - **`utils/cajaDelCobro.ts`:** `cajaDelCobro(cajas, elegida)` devuelve `{ sinTurno, mostrarSelector, cajaId?, falta }`.
      - Con `null` o con una sola caja no se manda `cajaId`.
      - Con `[]`, `sinTurno`.
      - Con 2 o más, va la elegida solo si sigue abierta.
      - En el mismo archivo están `cajaRecordada` y `recordarCaja`, que usan `localStorage` (`menyu-staff-caja-id:<restauranteId>`) con try/catch.
    - **`store/cajasStore.ts`:**
      - un error (de red, 403 o 404) deja `null`, y el cobro no se bloquea;
      - un contador de pedidos hace que una respuesta vieja no pise la nueva;
      - al cambiar de restaurante, `cajas` vuelve a `null`;
      - el hook `useCajasAbiertas(restauranteId)` nunca devuelve las cajas de otro restaurante.
  - **Tests:** web-staff pasó a **17 archivos / 261 tests**, +50:

    | Archivo | Tests |
    |---|---|
    | `propina.spec.ts` | 24 |
    | `cajaDelCobro.spec.ts` | 10 |
    | `cajasStore.spec.ts` | 14 |
    | `api.sesion.spec.ts` | 2 |

    Cobertura de los tres archivos nuevos: 100 %. Lint con `--max-warnings 0` limpio y typecheck 0.
  - **La carpeta:** la lógica pura va en `src/utils/` y no en `src/lib/`, por la convención de web-admin y web-cliente.
- **Lo que falta:**
  - **Etapa 2:** el `CobroModal`, con el aviso sin turno, el selector "Caja" (`role="radiogroup"`), la propina y los errores 400 y 409, y `PagosMozo`, con el banner sin turno y "Registrar pago" deshabilitado.
  - **Etapa 3:** `AvisoDeMesasFiltradas` en `MesasPage`, `TomaPedidosPage` y `PagosMozo`, las mutaciones, los chequeos finales y el cuerpo en `C:\dev\personal\Tesis\PR-359-1-cuerpo.md`.

**Cosas que conviene recordar:**
- **El typecheck de web-staff resuelve `@menyu/types` contra `dist/`**, que está en el `.gitignore`. En local, después de tocar los tipos, hay que correr `pnpm --filter @menyu/types build`; si no, da TS2305 (no exported member). En el CI lo hace turbo, por `^build`.
- **Agregar una línea con `printf >>` a un archivo CRLF** deja fines de línea mezclados. Se normalizó con python.
- **Un heredoc de Bash con backticks** cortó con "unexpected EOF". Los scripts de mutaciones van con Write.
- **Con el mock de Prisma, `toHaveBeenCalledWith(<proxy>)`** rompe con "b[IteratorSymbol] is not a function". Hay que comparar `mock.calls[0][0]` con `toBe`.

**Lo que se resolvió del pendiente anterior:**
- El #466 se mergeó: #357 quedó cerrado.
- Para #358, el cobro serializable que lee la caja adentro, la caja con 2 abiertas y el cobro sin turno quedaron resueltos en el #470.
- De #359, quedó resuelto saber si hay turno y qué cajas hay sin ser del grupo CAJA (#472).

**Pendiente al retomar** (en este orden)
1. **PR 1 de #359:** el ok de Coty sobre la etapa 1 y, después, las etapas 2 y 3. Sin push hasta que lo pida.
2. **Producción no se taggea** hasta tener #359 y #360: sin turno abierto, el comensal no puede pagar con Mercado Pago.
3. **#359, PRs 2 y 3:** abrir y cerrar el turno desde web-staff, con `GET /turnos/preparacion`. Después, **#360** (web-admin: el selector de caja y la propina).
4. **Límites de #358 que quedan anotados:**
   - un pago `aprobado-sin-turno` solo se asigna a una caja por SQL;
   - el cierre del turno no avisa de los Mercado Pago pendientes.
5. **Siguen de antes:**
   - si se filtran por mozo `GET /pedidos`, `GET /waiter-calls`, `GET /sessions/pagadas` e `historial`, `GET /payments/sesiones` y `order:new` en `PedidosPage`;
   - por qué no corrió Workers Builds en el #466;
   - la pasada combinada por staging, con los checklists del #454, #450 y #453, más la prueba manual de #358 y #359;
   - del informe: las 31 observaciones de axe, los issues de Sonar, y el comando de la latencia con cuál medida es la de RNF-07.

### 18/11/2026: #359 completo en `main` (PR 1 a 4: #473 a #476), #360 PR 1 mergeado (#477) y #360 PR 2 terminado, sin push

**Lo que se mergeó hoy** (todo con "Refs #359" o "Refs #360"; los cuerpos de los PR están en `C:\dev\personal\Tesis\PR-*-cuerpo.md`):

| Hora (ART) | PR | Merge | Qué |
|---|---|---|---|
| 09:53 | #473 | `9246505` | #359 PR 1: el cobro con caja y propina en web-staff |
| 11:01 | #474 | `25852b5` | #359 PR 2: abrir el turno, verlo y reasignar sus mesas (`/mozo/caja`) |
| 15:03 | #475 | `0f65830` | #359 PR 3: movimientos de caja |
| 16:37 | #476 | `df7e1ab` | #359 PR 4: cierre del turno con arqueo ciego, resultado y resumen |
| 19:10 | #477 | `ed08818` | #360 PR 1: el cobro de web-admin con caja, propina, aviso sin turno y Mercado Pago pendiente |

**#359 en web-staff, PR por PR.** Todo frontend, sin tocar el backend. Cada PR se hizo en 3 etapas, con informe y el ok de Coty en cada una.
- **#473, el cobro con caja y propina.** Selector de caja (sin preselección, se recuerda en `localStorage`), propina con `parsearPropina`, aviso sin turno y la advertencia de Mercado Pago pendiente. web-staff terminó en **18 archivos / 315 tests**.
- **#474, abrir, ver y reasignar el turno.** `/mozo/caja` para OWNER, GERENTE y JEFE_SALON (guard `SoloCaja`). Apertura con cajas (hasta 2) y fondo, mesas por mozo (`AsignacionDeMesas`), observaciones. La reasignación pide la preparación cada vez y arranca desde las asignaciones del turno. web-staff: 18 / 315 → **25 / 446**. 25 mutaciones, todas muertas.
- **#475, movimientos de caja.** Ingresos y egresos con confirmación (no se editan ni se borran), lista por caja que no parpadea al releer, el foco en cada paso. El error sin respuesta no se reintenta solo. `formatearMonto` pasó a 2 decimales cuando hay centavos. web-staff: 25 / 446 → **27 / 511**. 35 mutaciones, todas muertas.
- **#476, cierre del turno.** Arqueo ciego (sin esperado ni sumas antes de cerrar), confirmación, mesas abiertas como aviso (no bloquean), el error ambiguo resuelto releyendo el turno (5xx, sin respuesta o un 200 ilegible), el resultado en pantalla con el resumen por método, por mozo y Mercado Pago aparte. `formatearMonto` con negativos (`-$50`). web-staff: 27 / 511 → **31 / 637**. 37 mutaciones, todas muertas.
- **#359 sigue abierto en GitHub:** los cuatro PR usaron "Refs". Falta la pasada manual en staging.

**#360 PR 1 (#477): el cobro de web-admin.**
- **La lógica pura del cobro pasó a `@menyu/ui/caja`** (subpath nuevo): `leerMonto`, `MONTO_MAXIMO`, `parsearPropina`, `cajaDelCobro`, `MENSAJE_OPERACION_SIMULTANEA` y `MENSAJES_DE_TURNO_CAMBIADO`. Web-staff la importa de ahí. La caja recordada (`localStorage`) quedó en web-staff, en `utils/cajaRecordada.ts`. Los specs se movieron sin cambiar aserciones.
- **`PagosPage`** lee las cajas abiertas (solo el GERENTE) al montar, al cambiar de restaurante o de rol, en el polling de 30 s, al abrir el cobro y tras un 400 de cajas que cambiaron. Si falla, queda en `null` (falla abierta). Muestra el aviso sin turno. El cobro elige caja con 2 abiertas, suma propina y maneja la advertencia de Mercado Pago. Componentes nuevos en `pages/admin/pagos/`.
- **Números:** web-admin 49 / 860 → **49 / 890**; ui 5 / 44 → **9 / 94**; web-staff 31 / 637 → **29 / 590** (staff + ui: 681 → 684). 42 mutaciones: 40 muertas, 1 la atrapa el compilador y 1 equivalente.

**#360 PR 2: el ABM de cajas (rama `feat/web-admin-abm-de-cajas`, 7 commits, HEAD `ad7c389`, sin push ni PR).**
- **Pantalla Cajas** (`/admin/cajas`, OWNER y GERENTE, con `RoleGuard` y la entrada en Configuración): lista con activas e inactivas, alta, renombrar en la fila, activar y desactivar con confirmación. La caja abierta en el turno no se puede desactivar. Las cajas no se borran.
- **Archivos** en `pages/admin/cajas/`: `CajasPage`, `FilaDeCaja`, `FormularioDeAlta`, `CampoDeNombre` (el campo con sus botones al lado y el error debajo), `nombre.ts` y `errores.ts`. API: `api.cajas.listar`, `crear` y `actualizar`.
- **El último commit (`ad7c389`) arregló el layout:** con el error a la vista, los botones bajaban. Hay dos tests que fijan la estructura (jsdom no tiene layout).
- **Números:** web-admin 49 / 890 → **52 / 943**; ui y web-staff sin cambios. 100 % de líneas y ramas en lo nuevo. 43 mutaciones: 42 muertas y 1 equivalente (la ruta sin `RoleGuard`: `SoloAdministracion` ya filtra y `RolDeAdmin` es solo OWNER y GERENTE). Build de web-admin OK.
- **Cuerpo del PR** en `C:\dev\personal\Tesis\PR-360-2-cuerpo.md`, listo para revisar.

**Cosas que conviene recordar:**
- **Nunca `git stash`** (pedido de Coty). Para comparar con `main`: `git show main:ruta` o un `git worktree` (con `pnpm install --frozen-lockfile --offline` y `pnpm --filter @menyu/types build`), y después borrarlo.
- **Contar los `\r` con node** (bytes 13 de `git cat-file -p` y de `git diff`): `grep $'\r'` dentro de bucles o de `$(...)` en Git Bash dio números falsos más de una vez.
- **`vi.clearAllMocks()` no vacía las respuestas `mockReturnValueOnce`** que un test no usó, y pasan al siguiente. Los specs nuevos usan `vi.resetAllMocks()`.
- **Los títulos de `it.each` con `$` en los textos** se rompen en vitest (salen como `undefined`): el texto esperado va solo en la aserción.
- **Warnings de `act()` que ya estaban:** 122 en `PagosPage.spec` y 343 en todo web-admin. La vara es no sumar ninguno.
- **Test inestable en `main`:** `CajaPage.spec` "mientras lee las mesas y los mozos muestra que está cargando" se pasa de tiempo con la máquina cargada (por ejemplo, durante las mutaciones). Corrido solo, pasa.
- **`Input` y `Button` de `@menyu/ui` no aceptan `ref`** en sus tipos: el foco se maneja con `autoFocus`.
- **`@menyu/ui` no tiene lint ni typecheck** (sus scripts son `echo` y el CI no los corre): se chequea con `tsc --noEmit -p packages/ui`.
- **`apps/web-admin/.env` cambia una rama de cobertura** de `PagosPage.tsx` (`WS_URL ?? ''`): en un worktree sin `.env` sale cubierta.
- **Largo de textos:** el backend cuenta con `isLength` de validator, que resta los pares sustitutos. El front cuenta con `.length`, que es igual o más estricto.
- **En los reemplazos con `String.replace`, un `$'` o un `` $` `` en el texto nuevo se interpreta:** usar `split(a).join(b)`.

**Pendiente al retomar** (en este orden)
1. **#360 PR 2:** que Coty revise la rama `feat/web-admin-abm-de-cajas` y el cuerpo; push y PR solo cuando lo pida.
2. **#360 PR 3:** los turnos en web-admin (el historial).
3. **#361:** los tests de turnos y caja.
4. **La pasada manual en staging** de todo #359 (cobro, apertura, movimientos y cierre) y de #360, con Mercado Pago real. Después, cerrar #359 (y #358, cuyo frontend era #359 y #360).
5. **Producción no se taggea** hasta tener #359 y #360 completos.
6. **Límites anotados en los cuerpos de los PR** (para decidir si se hacen después): sin tiempo real ni polling en caja y cajas; el botón "Registrar pago" de web-admin no se deshabilita sin turno; `PagosPage.tsx` sigue siendo grande (794 líneas); el resultado del cierre se ve una sola vez (el historial llega con #360 PR 3).
7. **Siguen de antes:**
   - los límites de #358 (un pago `aprobado-sin-turno` solo se asigna a una caja por SQL; el cierre no avisa de los Mercado Pago pendientes);
   - si se filtran por mozo `GET /pedidos`, `GET /waiter-calls`, `GET /sessions/pagadas` e `historial`, `GET /payments/sesiones` y `order:new` en `PedidosPage`;
   - por qué no corrió Workers Builds en el #466;
   - la pasada combinada por staging con los checklists del #454, #450 y #453;
   - del informe: las 31 observaciones de axe, los issues de Sonar y el comando de la latencia con cuál medida es la de RNF-07.

### 19/11/2026: #360 PR 2 (#478) y PR 3 (#480) mergeados: el ABM de cajas y el historial de turnos en web-admin

**Lo que se mergeó hoy** (todo con "Refs #360"; los cuerpos están en `C:\dev\personal\Tesis\PR-360-2-cuerpo.md` y `PR-360-3-cuerpo.md`):

| Hora (ART) | PR | Merge | Qué | CI y deploy de staging en `main` |
|---|---|---|---|---|
| 09:19 | #478 | `7d33e5d` | #360 PR 2: el ABM de cajas (`/admin/cajas`) | `44522782812` y `44522783206`, en verde |
| 11:14 | #480 | `ccd6c04` | #360 PR 3: el historial y el detalle de los turnos de caja (`/admin/turnos`) | `44541662085` y `44541662270`, en verde |

Los dos con el gate de Sonar `OK`, 100 % de cobertura nueva y 0 % de duplicación. En el #480 pasaron los 5 checks: CI, e2e, SonarCloud (los dos) y Workers Builds. También entraron hoy #479 y #481 ("Feat/a11y cliente"), que no son de este trabajo (CI y deploy de `6597109` en verde).

**#360 PR 3 (#480): rama `feat/web-admin-turnos-de-caja`, desde `7d33e5d`.** 16 commits (head `89c96c9`), 44 archivos, +1967 −119. Solo frontend, sin tocar el backend. Se hizo en 4 etapas, con informe y el ok de Coty en cada una.
- **Decisiones (T1 a T7):**
  - las dos rutas llevan `RoleGuard` OWNER y GERENTE, y la entrada "Turnos de caja" va en Operación, después de "Caja";
  - todo es de solo lectura, con un botón "Actualizar";
  - el turno abierto usa arqueo ciego: no muestra arqueo, ni totales, ni resumen, y no se pide `/resumen`;
  - las fechas van con el año (`dd/mm/aaaa hh:mm`);
  - las sumas de dinero se hacen en centavos enteros;
  - hay una sola tabla para todo (`TablaDeDatos`);
  - specs nuevos sin tests vacíos y con `vi.resetAllMocks()`; los warnings de `act()` se quedan en 343, y los specs de ui importan de `vitest`.
- **Etapa 1: tipos, ui y API.**
  - Los tipos del historial van en `@menyu/types`: `PaginaDeTurnos`, `TurnoDelHistorial`, `CajaDelHistorial` y `TotalesDeMovimientos`.
  - Lo puro de web-staff pasó a `@menyu/ui/caja`: `formato.ts` y `mesas.ts` (con `git mv`) y el nuevo `arqueo.ts`, que tiene la clasificación y el texto de la diferencia y sale de `utils/cierre.ts`. Ninguna aserción cambió, y ui + web-staff suman 684 tests antes y después (94 + 590 → 123 + 561).
  - En ui se sumó `formatearFechaHoraCompleta`.
  - La API nueva es `api.turnos.listar(restauranteId, cursor?)`, `detalle(id)` y `resumen(id)`.
  - El comentario de `@menyu/ui/caja` se corrigió en un commit aparte (`5731492`).
- **Etapa 2: la lista (`/admin/turnos`).**
  - Muestra los turnos del más nuevo al más viejo, con "Cargar más" (cursor inclusivo), "Actualizar" y las diferencias del arqueo con palabras, sin color.
  - Las lecturas viejas se descartan con un contador (`useRef`) y con el estado atado a `restauranteId`.
  - El código está en `pages/admin/turnos/`, con la lógica pura en `historial.ts`.
- **Etapa 3: el detalle (`/admin/turnos/:id`).**
  - Muestra las cajas con su arqueo y sus movimientos, el resumen de cobros (por método, por mozo y Mercado Pago aparte) y las mesas agrupadas por mozo.
  - Antes de escribirlo, los bloques que se repetían con la lista pasaron a componentes compartidos (`8711f37` y `cf7254c`): el encabezado, las observaciones, la línea "Nombre · Fondo inicial", el aviso sin arqueo, el spinner y el error con "Reintentar". Los 19 tests de `TurnosPage.spec` pasaron sin tocarlos.
  - El commit del detalle (`5018c77`) se enmendó localmente antes del push: `.at(-1)` no existe en el `lib` de web-admin y se cambió por `.pop()`.
- **Etapa 4: verificación.**
  - Cobertura del 100 % de líneas y ramas en lo nuevo.
  - 96 mutaciones: 95 muertas y 1 equivalente (`formatearMonto` redondea a centavos).
    - La #6 (la suma en centavos) sobrevivió al principio y la mató un test nuevo (`0b150f7`): 4,35 + 0,01 + 0,01 tienen que dar exactamente 4,37.
    - En 11 mutaciones hubo que reformularlas porque no compilaban.
  - El chunk principal de web-admin pasa de 562,37 a 578,08 kB (+15,7 kB). El aviso de Vite de más de 500 kB ya estaba en `main`.
- **Números:** web-admin pasa de 52 / 943 a **55 / 1018**, ui de 9 / 94 a **12 / 127** y web-staff de 29 / 590 a **27 / 561**. Los warnings de `act()` siguen en 343.

**Cosas que conviene recordar** (además de las del 18/11):
- **Un `$0` en el título de un `it.each` vitest lo lee como variable**, aunque esté adentro de un objeto. El título quedó `'con %j'` (`89c96c9`).
- **Para sumar plata en centavos, `Math.round(monto * 100)` en cada término**: `4.35 * 100` no da entero en flotante.
- **`git worktree remove` falla en Windows con "Filename too long"** (por `node_modules`). Lo que funcionó: `robocopy <vacía> <worktree> /MIR`, después `rmdir` y `git worktree prune`.
- **No hay `tsc` global:** se corre con `pnpm --filter @menyu/ui exec tsc --noEmit -p .`.
- **Las mutaciones se corrieron con un arnés propio** (está en el scratchpad de la sesión, no en el repo). Para cada mutación: aplicarla, correr `tsc --noEmit` y vitest con el reporter JSON, restaurar el archivo y comprobarlo con `cmp`. La cobertura de las líneas agregadas sale de cruzar `lcov.info` con `git diff -U0`.

**Pendiente al retomar** (en este orden)
1. **#361:** los tests de turnos y caja.
2. **La pasada manual en staging** de todo #359 (cobro, apertura, movimientos y cierre) y de #360 (cobro de web-admin, cajas y turnos), con Mercado Pago real. Después, cerrar #359 y #360 (los dos siguen abiertos porque los PR usaron "Refs"), y también #358.
3. **Producción no se taggea** hasta tener esa pasada.
4. **Límites anotados en el cuerpo del #480:**
   - el historial no se actualiza solo (no hay polling ni tiempo real);
   - Mercado Pago real sin probar en staging;
   - el chunk de web-admin.
   Siguen los del 18/11: el botón "Registrar pago" sin turno y `PagosPage.tsx` grande.
5. **Siguen de antes:** el punto 7 del pendiente del 18/11.
6. **Local:** la rama `feat/web-admin-turnos-de-caja` ya está mergeada y se puede borrar. `discovery.module.ts` y `Claude outputs/` siguen con cambios sin commitear que no son de este trabajo.
