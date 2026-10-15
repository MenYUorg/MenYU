# Resumen de aportes — Infraestructura y DevOps
**MenYU · Ojeda, Dante Lautaro**

---

## 1. Resumen narrativo

Durante esta etapa del proyecto me encargué de diseñar e implementar la infraestructura de integración y despliegue continuo (CI/CD) del sistema MenYU. El trabajo comenzó con un análisis del estado del repositorio y la definición de un flujo profesional que separara claramente las etapas de validación, staging y producción, sin sobreingenierizar con herramientas innecesarias para el alcance académico del proyecto.

Se definió e implementó un pipeline de tres workflows en GitHub Actions: uno de integración continua que valida cada Pull Request, uno de despliegue automático a staging ante cada merge a main, y uno de despliegue a producción activado exclusivamente mediante un tag de versión semántica. Se configuraron ambientes separados en Railway (backend), Vercel (frontends) y Supabase (base de datos), con variables de entorno diferenciadas por ambiente.

Se resolvieron múltiples problemas técnicos durante la implementación: conflictos de versión de pnpm en el runner de CI, generación del cliente Prisma en entornos sin acceso a base de datos, ausencia de ESLint y Vitest en los proyectos frontend, configuración de CORS para Preview URLs dinámicas de Vercel, y un mismatch en el nombre del enum `RolAdmin` entre Prisma y PostgreSQL que afectaba tanto staging como producción.

Adicionalmente, se configuró la integración con Mercado Pago para el ambiente de staging, incluyendo el flujo OAuth que permite a cada restaurante conectar su propia cuenta de MP, y se analizaron los endpoints del módulo de pagos para planificar las pruebas de integración.

---

## 2. Decisiones técnicas tomadas

- Adoptar un flujo de tres workflows (CI, staging, production) sin sobreingenierizar con entornos intermedios adicionales.
- Producción se despliega únicamente de forma intencional mediante tag `v*.*.*`, nunca automáticamente por un merge.
- Vercel Preview Deployments se mantienen activos para ramas de feature; se desactiva el autodeploy automático a Production mediante Ignored Build Step.
- Railway desactiva el autodeploy desde GitHub para que los deploys sean exclusivamente controlados por los workflows.
- El deploy de frontends se realiza mediante Vercel CLI desde GitHub Actions usando el flujo `vercel pull → vercel build → vercel deploy --prebuilt`, que es el flujo oficial recomendado por Vercel para CI/CD.
- Se agregan 3 reintentos automáticos (nick-fields/retry@v3) en los steps de Railway y Vercel para tolerar fallos transitorios de red.
- `prisma generate` se mueve al script `build` del backend, eliminando el `postinstall` que fallaba en el Dockerfile de Railway porque el schema no estaba disponible en la etapa de instalación.
- Para staging se usan credenciales de producción de Mercado Pago (CLIENT_ID y CLIENT_SECRET), ya que MP no provee Client Secret en el entorno de pruebas.
- Los tokens OAuth de cada restaurante se guardan encriptados en la base de datos, no como variables de entorno.
- Se decide usar una URL fija de staging (rama main de Vercel) para las URLs de retorno de MP, en lugar de URLs dinámicas de Preview.

---

## 3. Configuraciones realizadas

**Monorepo:**
- Normalización de scripts (`typecheck`, `lint`, `test`, `build`) en todos los packages y apps activas.
- Configuración de `turbo.json` con tareas `lint`, `typecheck`, `test` y `build` y sus dependencias correctas.
- Instalación y configuración de ESLint 9 (flat config) en `web-admin`, `web-cliente` y `web-staff`.
- Instalación de Vitest con `--passWithNoTests` en las tres apps web.
- Agregado de `@@map("rol_admin")` al enum `RolAdmin` en el schema de Prisma para compatibilidad con PostgreSQL.
- Agregado de `@ApiBearerAuth()` en los controllers faltantes para que Swagger envíe el header Authorization correctamente.

**GitHub Actions:**
- Creación de `.github/workflows/ci.yml`, `deploy-staging.yml` y `deploy-production.yml`.
- Configuración de branch protection rules en GitHub: require PR, require status checks, block force pushes.
- Carga de 9 secrets: tokens de Railway (staging y prod), service IDs de Railway (staging y prod), token de Vercel, Org ID y Project IDs de los tres frontends.
- Agregado de step explícito de `prisma generate` en CI con variables dummy para no requerir conexión a base de datos.

**Railway:**
- Configuración del servicio `menyu-backend-staging` con variables de entorno separadas de producción.
- Desactivación de autodeploy desde GitHub en ambos servicios.
- Configuración de `DATABASE_URL` y `DIRECT_URL` con el formato correcto del pooler de Supabase.

**Supabase:**
- Creación del proyecto `menyu-staging` con base de datos separada.
- Ejecución de `prisma migrate deploy` en staging y aplicación de la migración `fix_rol_admin_enum_map`.

**Vercel:**
- Configuración de variables de entorno `VITE_API_URL` y `VITE_WS_URL` por ambiente (Production, Preview, Development) en los tres proyectos.
- Configuración del Ignored Build Step para cancelar deploys automáticos a Production.

**Mercado Pago:**
- Creación de cuentas de prueba (vendedor y comprador).
- Configuración de Redirect URI en la app MenYU de MP.
- Carga de variables MP en Railway staging.
- Validación del flujo OAuth completo en staging (connect → callback → token guardado en DB).

**Documentación:**
- Creación de `.github/WORKFLOW.md` documentando el flujo completo del equipo.
- Creación de `apps/backend/.env.example` completo con todas las variables necesarias y comentarios.

---

## 4. Pendientes técnicos

| Pendiente | Prioridad | Cuándo |
|---|---|---|
| Migraciones automáticas de Prisma en `deploy-production.yml` | Alta | Antes del primer tag |
| Configurar `CORS_ORIGINS` en Railway production | Alta | Antes del primer tag |
| Probar flujo completo de pago MP en staging (`POST /payments/initiate`, webhook, status) | Alta | Sprint actual |
| Validación de firma del webhook de MP (`x-signature`) | Media | Antes de producción |
| Notificación automática en PR cuando hay cambios en migraciones de Prisma | Media | Sprint siguiente |
| Primer tag `v1.0.0` y deploy a producción | Alta | Cuando el equipo tenga versión estable |
| Turbo Remote Cache para acelerar CI | Baja | Sprint 15-16 |
| Notificaciones de deploy al equipo (Discord/Slack) | Baja | Sprint 15-16 |

---

## 5. Versión corta para presentación o informe

**Infraestructura y DevOps — aportes de Ojeda**

- Diseñé e implementé el pipeline de CI/CD completo del proyecto sobre GitHub Actions, Railway y Vercel.
- Definí un flujo de tres ambientes: preview por rama, staging automático en cada merge a main, y producción exclusivamente por tag de versión.
- Configuré branch protection en GitHub: todo cambio pasa por Pull Request con CI verde antes de poder mergearse.
- Resolví problemas de compatibilidad entre el monorepo Turborepo y los entornos de CI/CD: generación de Prisma Client, configuración de ESLint y Vitest, mismatch de enums PostgreSQL.
- Configuré ambientes separados en Railway (backend), Vercel (3 frontends) y Supabase (base de datos) para staging y producción.
- Validé el flujo OAuth de Mercado Pago en staging: cada restaurante puede conectar su propia cuenta de MP y los tokens se guardan encriptados en la base de datos.
- Documenté el flujo de trabajo del equipo en `WORKFLOW.md` y el entorno de desarrollo en `.env.example`.
- **Pendiente:** migraciones automáticas en deploy, configuración de CORS en producción y primer release `v1.0.0`.
