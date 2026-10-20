# Flujo de trabajo — MenYU

Descripción del flujo de desarrollo, integración continua y despliegue para el equipo.

---

## Índice

1. [Ramas](#1-ramas)
2. [Flujo de un cambio](#2-flujo-de-un-cambio)
3. [Pipelines de GitHub Actions](#3-pipelines-de-github-actions)
4. [Ambientes](#4-ambientes)
5. [Cómo deployar a producción](#5-cómo-deployar-a-producción)
6. [Correr el proyecto localmente](#6-correr-el-proyecto-localmente)

---

## 1. Ramas

El repositorio tiene una única rama protegida: `main`.

| Tipo | Prefijo | Ejemplo |
|---|---|---|
| Nueva funcionalidad | `feat/` | `feat/modulo-pagos` |
| Corrección de bug | `fix/` | `fix/sesion-mesa` |
| Infraestructura / config | `chore/` | `chore/update-deps` |

**Reglas de `main`:**
- No se puede pushear directo —> todo cambio entra por Pull Request.
- El CI debe pasar en verde antes de poder mergear.
- No se requiere aprobación de otro miembro (equipo pequeño con disponibilidad variable).

---

## 2. Flujo de un cambio

```
1. Crear rama desde main
   git checkout -b feat/nombre-corto

2. Desarrollar y commitear
   git add .
   git commit -m "feat: descripción del cambio"
   git push origin feat/nombre-corto

3. Abrir Pull Request → main en GitHub
   → Vercel genera una Preview URL automática para revisar el cambio visualmente
   → ci.yml se dispara automáticamente

4. CI pasa en verde → mergear el PR
   → deploy-staging.yml se dispara
   → Backend se despliega en Railway staging
   → Frontends se despliegan en Vercel (ambiente preview)

5. Validar en staging que todo funciona correctamente

6. Cuando el equipo decide lanzar → crear tag de versión
   → deploy-production.yml se dispara
   → Backend se despliega en Railway producción
   → Frontends se despliegan en Vercel producción
```

---

## 3. Pipelines de GitHub Actions

El repositorio tiene 3 workflows en `.github/workflows/`:

### `ci.yml` — Integración continua
**Trigger:** Pull Request hacia `main`

Corre los siguientes checks en orden sobre las apps activas (`@menyu/api`, `@menyu/web-admin`, `@menyu/web-cliente`, `@menyu/web-staff`):

| Paso | Comando | Qué verifica |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | Dependencias reproducibles |
| Generate | `prisma generate` | Tipos de Prisma disponibles |
| Typecheck | `turbo run typecheck` | Sin errores de TypeScript |
| Lint | `turbo run lint` | Sin errores ni warnings de ESLint |
| Test | `turbo run test` | Tests unitarios en verde |
| Build | `turbo run build` | Compila correctamente |

Si cualquier paso falla, el merge queda bloqueado.

---

### `deploy-staging.yml` — Despliegue a staging
**Trigger:** Push a `main` (merge de PR)

1. Corre los mismos checks que CI
2. Despliega el backend a **Railway staging**
3. Hace un deploy *preview* con la CLI en los proyectos de Vercel originales (`menyu-cliente`, `menyu-admin` y `menyu-staff`): no toca producción y es el que usa el smoke
4. Smoke de solo lectura contra staging

Los frontends de staging con dominio fijo (`menyu-*-staging`) no los despliega este workflow: los construye Vercel desde Git en cada merge a `main` (ver "Frontends en Vercel", más abajo).

---

### `deploy-production.yml` — Despliegue a producción
**Trigger:** Tag con formato `v*.*.*`

1. Corre los mismos checks que CI
2. Despliega el backend a **Railway producción**
3. Despliega los frontends a **Vercel** (ambiente production, flag `--prod`)

---

## 4. Ambientes

| Ambiente | Trigger | Backend | Frontend | Base de datos |
|---|---|---|---|---|
| **Preview** | Push a rama `feat/*` | — | — (Vercel no construye ramas) | — |
| **Staging** | Merge a `main` | Railway staging | Proyectos `menyu-*-staging` de Vercel | Supabase staging |
| **Producción** | Tag `v*.*.*` | Railway prod | Vercel production | Supabase prod |

Las variables de entorno de cada ambiente están configuradas en Railway y en Vercel por separado. Nunca se comparten datos entre staging y producción.

### Frontends en Vercel: qué proyecto se construye cuándo

| Proyecto | Es | Cuándo se actualiza |
|---|---|---|
| `menyu-cliente`, `menyu-admin`, `menyu-staff` | Producción (`menyu-cliente.vercel.app`, `menyu-admin.vercel.app`, `menyu-staff.vercel.app`) | **Solo con el tag** `v*.*.*`, con la CLI (`deploy-production.yml`). **Nunca desde Git.** En cada merge a `main`, `deploy-staging.yml` además les hace un deploy *preview* con la CLI (no toca producción). |
| `menyu-cliente-staging`, `menyu-admin-staging`, `menyu-staff-staging` | Staging, con dominio fijo (`<proyecto>.vercel.app`) | **Cada merge a `main`**, desde Git, si cambió la app o un paquete del que depende (`turbo-ignore`). |

**Cómo se logra la diferencia.** Los `apps/web-*/vercel.json` son los mismos para el proyecto de producción y el de staging de cada app: dejan construir solo `main` (`git.deploymentEnabled`) y corren `scripts/vercel/ignorar-build.sh` como `ignoreCommand`. El script decide por el nombre del proyecto (el principio de `VERCEL_URL`): en cualquier proyecto que **no** sea de staging cancela todo build de Git; en los de staging construye si hubo cambios, y el primer deploy de `main` de un proyecto nuevo siempre construye. Los deploys de la CLI no pasan por ahí.

**Crear un proyecto de staging nuevo (a mano en Vercel):**

1. *Add New → Project*, importar `MenYUorg/MenYU` con el nombre exacto `menyu-<app>-staging`. De ese nombre sale el dominio `menyu-<app>-staging.vercel.app`, y el login entre apps (`resolveAppUrl` y `resolveLoginUrl`) depende de él.
2. *Settings → General:* Root Directory `apps/web-<app>`, "Include source files outside of the Root Directory" activado, y el resto (framework, comandos, Node) igual que `menyu-cliente-staging`.
3. *Settings → Git:* rama de producción `main`.
4. *Settings → Environment Variables*, en el entorno Production: `VITE_API_URL=https://menyu-backend-staging.up.railway.app/api` (y `VITE_WS_URL` sin `/api`, si se quiere; si no está, la app lo deduce de la otra).
5. *Settings → Deployment Protection:* igual que `menyu-cliente-staging` (sin login de Vercel).
6. En Railway (backend de staging), sumar `https://menyu-<app>-staging.vercel.app` a `CORS_ORIGINS`.

---

## 5. Cómo deployar a producción

El deploy a producción es **siempre intencional**, nunca ocurre de forma automática por un merge.

```bash
# Asegurate de estar en main y tener los últimos cambios
git checkout main
git pull origin main

# Crear el tag de versión (seguir semver: vMAJOR.MINOR.PATCH)
git tag v1.0.0

# Pushear el tag — esto dispara deploy-production.yml
git push origin v1.0.0
```

**Convención de versiones (semver):**

| Cambio | Versión | Ejemplo |
|---|---|---|
| Bug fix | PATCH | `v1.0.0` → `v1.0.1` |
| Nueva funcionalidad | MINOR | `v1.0.0` → `v1.1.0` |
| Cambio que rompe compatibilidad | MAJOR | `v1.0.0` → `v2.0.0` |

---

## 6. Correr el proyecto localmente

**Requisitos:**
- Node.js >= 20
- pnpm >= 10
- Archivo `.env` en `apps/backend/` con las variables del `.env.example`

```bash
# Instalar dependencias
pnpm install

# Generar el cliente de Prisma
cd apps/backend && npx prisma generate && cd ../..

# Correr migraciones (primera vez o cuando hay cambios en el schema)
cd apps/backend && npx prisma migrate deploy && cd ../..

# Levantar todos los servicios en paralelo
pnpm dev
```

Cada app corre en su propio puerto:

| App | Puerto |
|---|---|
| Backend (NestJS) | `3000` |
| web-admin | `5173` |
| web-cliente | `5174` |
| web-staff | `5175` |

---

## Secrets de GitHub Actions

Los secrets están configurados en **Settings → Secrets and variables → Actions** del repositorio. Nunca se commitean al repo.

| Secret | Descripción |
|---|---|
| `RAILWAY_TOKEN_STAGING` | Token de Railway para staging |
| `RAILWAY_TOKEN_PROD` | Token de Railway para producción |
| `RAILWAY_SERVICE_ID_STAGING` | ID del servicio backend en Railway staging |
| `RAILWAY_SERVICE_ID_PROD` | ID del servicio backend en Railway producción |
| `VERCEL_TOKEN` | Token de Vercel |
| `VERCEL_ORG_ID` | ID de la organización en Vercel |
| `VERCEL_PROJECT_ID_ADMIN` | ID del proyecto web-admin en Vercel |
| `VERCEL_PROJECT_ID_CLIENTE` | ID del proyecto web-cliente en Vercel |
| `VERCEL_PROJECT_ID_STAFF` | ID del proyecto web-staff en Vercel |

---

*MenYU · De Marcos · Ojeda · Strumia Carrara · 2026*
