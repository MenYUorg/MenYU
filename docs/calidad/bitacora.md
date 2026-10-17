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

## Pendientes

1. **Cambiar el código nuevo de `main`** en SonarCloud (Administration → New Code) a "Number of days" o "Reference branch". Hoy la referencia queda fija en el análisis automático del 17/10 (`7072d67`), que tuvo otro alcance y no tuvo cobertura, y como no se manda `projectVersion` nunca avanza. Después del cambio, verificar por API en el próximo análisis de `main` (`api/qualitygates/project_status?projectKey=MenYUorg_MenYU&branch=main`, campo `periods`).
2. **Subir los umbrales del gate el 23/10/2026.**
3. **Confirmar la Deployment Protection de las previews de Vercel** (queda a cargo del equipo). En el run `39032870161` los tres frontends respondieron 200, así que hoy no hay protección que bloquee el smoke.
4. **Producción:** commiteado en `ci/smoke-production` (`fcc6b39`), falta pushear y abrir el PR. Antes del primer smoke de producción hay que cargar las variables de repo `PROD_WEB_ADMIN_URL`, `PROD_WEB_CLIENTE_URL` y `PROD_WEB_STAFF_URL` (las URLs de admin y staff las pasa Constanza).
5. Opcionales que salieron en el camino:
   - Fijar la versión de `@railway/cli` en los workflows (hoy `@latest` en el `variable set` y en el `up`).
   - Revisar en Railway (Settings → Healthcheck Path) si el servicio tiene healthcheck en `/health`. No cambia nada hoy, porque `/health` responde siempre 200.
   - Revisar la vulnerabilidad de `apps/backend/src/mesas/mesas.service.ts:141`: el PIN de mesa se genera con `Math.random()`. Es la única de las 6 vulnerabilidades (regla S2245) que puede ser un riesgo real. La de `sessions.service.ts:761` depende de para qué se usa ese código. Las 4 de los frontends son ids de UI.
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

- Commit `fcc6b39` sobre `main` (`beb2d18`). **Sin pushear todavía.**
- `deploy-production.yml`:
  - **`check-ci`** (primer job): consulta con `gh api` el check "CI — typecheck, lint, test, build" del commit del tag y toma el run más reciente de GitHub Actions. Si está en cola o en curso, espera (cada 20 s, hasta 15 min). Si terminó sin `success` o no hay run, falla enseguida y no se despliega. Es la decisión D10 del plan en PDF del equipo (no está en el repo): producción solo con el CI del mismo SHA en verde. Pide solo `checks: read`.
  - **`deploy-production`**: `needs: check-ci` y solo en push de tag. Setea `APP_COMMIT_SHA` con `--skip-deploys` antes del `railway up`, con los secretos de producción.
  - **`smoke-production`**: lee `VITE_API_URL` del `vercel pull --environment=production` de web-cliente, espera el SHA en `/health` y corre `scripts/smoke`. Los frontends de producción tienen URL estable (`--prod`): salen de las variables de repo `PROD_WEB_ADMIN_URL`, `PROD_WEB_CLIENTE_URL` y `PROD_WEB_STAFF_URL`.
  - **`workflow_dispatch`**: corre solo `check-ci` y el smoke, sin desplegar, para probar antes de la demo. Hay que lanzarlo desde el tag desplegado ("Use workflow from"): el smoke espera el SHA de ese ref.
- `scripts/smoke/`: `STAGING_API_URL` pasa a `SMOKE_API_URL` y los mensajes dejan de nombrar a staging. Staging no cambia: la variable solo pasa por `$GITHUB_ENV`.
- Validado con `yaml.safe_load`, `actionlint` 1.7.12 (exit 0 en los 3 workflows) y una simulación del loop de `check-ci` (en cola → en curso → success, failure, cancelled, sin run y timeout).
- Se decidió no pasar el smoke a un workflow reutilizable por ahora (queda repetido entre staging y producción).
- Producción hoy responde el `/health` viejo (`{"status":"ok"}`, último tag `v1.0.5`): un `workflow_dispatch` antes de taggear una versión con el `/health` nuevo falla en la espera del SHA.

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
