# Sprint 1 — Fundaciones

**Sprint:** S1 · Issue épica #1  
**Equipo:** De Marcos (margarita0912) · Ojeda (lautiod) · Strumia Carrara (CotyStrumia)  
**Fecha:** 24–30 de abril de 2026  
**Estado:** Done

---

## Índice

1. [Objetivo del sprint](#1-objetivo-del-sprint)
2. [Actividades y responsables](#2-actividades-y-responsables)
3. [#26 — Inicializar monorepo con Turborepo + pnpm workspaces](#3-26--inicializar-monorepo-con-turborepo--pnpm-workspaces)
4. [#27 — Crear paquete @menyu/types con entidades base](#4-27--crear-paquete-menyutypes-con-entidades-base)
5. [#28 — Definir schema Prisma completo y migrar a Supabase](#5-28--definir-schema-prisma-completo-y-migrar-a-supabase)
6. [#29 — Inicializar apps/backend (NestJS)](#6-29--inicializar-appsbackend-nestjs)
7. [#30 — Inicializar apps/cliente (Expo)](#7-30--inicializar-appscliente-expo)
8. [#31 — Inicializar apps/cocina, apps/admin y apps/mozo](#8-31--inicializar-appscocina-appsadmin-y-appsmozo)
9. [#32 — CI/CD: Despliegue automático del backend desde Railway](#9-32--cicd-despliegue-automático-del-backend-desde-railway)
10. [#33 — Documentar schema de base de datos](#10-33--documentar-schema-de-base-de-datos)
11. [#34 — Inicio redacción de tesis](#11-34--inicio-redacción-de-tesis)
12. [Decisiones de diseño transversales](#12-decisiones-de-diseño-transversales)

---

## 1. Objetivo del sprint

Levantar la infraestructura base del proyecto desde cero: monorepo funcional, tipos compartidos, schema de base de datos completo, todas las apps inicializadas con su stack correspondiente, y pipeline de deploy automático del backend. Al cierre del sprint el repositorio debía tener una estructura estable sobre la cual todos los sprints siguientes pudieran construir sin refactorizar la base.

---

## 2. Actividades y responsables

| # | Actividad | Responsable |
|---|---|---|
| #26 | Inicializar monorepo con Turborepo + pnpm workspaces | De Marcos |
| #27 | Crear paquete @menyu/types con entidades base | De Marcos |
| #28 | Definir schema Prisma completo y migrar a Supabase | Strumia Carrara |
| #29 | Inicializar apps/backend (NestJS) | Strumia Carrara |
| #30 | Inicializar apps/cliente (Expo) | Strumia Carrara |
| #31 | Inicializar apps/cocina, apps/admin y apps/mozo | Strumia Carrara + Ojeda |
| #32 | CI/CD: Despliegue automático backend desde Railway | Ojeda |
| #33 | Documentar schema de base de datos en /docs/schema.md | Ojeda |
| #34 | Inicio redacción de tesis | Strumia Carrara + Ojeda |

---

## 3. #26 — Inicializar monorepo con Turborepo + pnpm workspaces

**Responsable:** De Marcos  
**PR:** feat/inicializar — commit `tarea 1 del sprint 1 lista` (24/04/2026)

### Qué se hizo

Se configuró la base del monorepo que contiene todas las apps y paquetes del proyecto:

- **`pnpm-workspace.yaml`** — declara `apps/*` y `packages/*` como workspaces.
- **`turbo.json`** — pipelines `build`, `dev`, `typecheck`, `lint`, `test` con dependencias entre tareas.
- **`package.json` raíz** — scripts globales (`pnpm dev`, `pnpm build`, `pnpm typecheck`).
- **`.gitignore`** — reglas para node_modules, .env, dist, build, .turbo.
- **`CLAUDE.md`** — contexto inicial del proyecto para asistencia con IA.
- **Estructura de carpetas vacías** para las 5 apps (`admin`, `backend`, `cliente`, `cocina`, `mozo`) y los 3 paquetes (`config`, `types`, `ui`), cada uno con su `package.json` placeholder.
- **`packages/config/`** — configs base de TypeScript para los distintos stacks:
  - `tsconfig.base.json` — configuración común
  - `tsconfig.expo.json` — para apps React Native
  - `tsconfig.nestjs.json` — para el backend NestJS
  - `tsconfig.react.json` — para apps React web

### Decisiones

**Turborepo como build orchestrator:** permite correr `pnpm dev` desde la raíz y levantar todas las apps en paralelo. La caché de Turborepo evita re-builds innecesarios cuando no hay cambios en un paquete.

**pnpm en lugar de npm/yarn:** menor footprint de disco (hard links), lockfile reproducible (`--frozen-lockfile` en CI), y soporte nativo para workspaces.

**Configs TypeScript en `packages/config/`:** cada app extiende la config correspondiente a su stack en lugar de mantener un `tsconfig.json` propio completo. Cambiar una regla base la propaga a todas las apps que la extienden.

---

## 4. #27 — Crear paquete @menyu/types con entidades base

**Responsable:** De Marcos  
**PR:** feat/inicializar — mismo commit que #26

### Qué se hizo

Se creó el paquete `packages/types/` (`@menyu/types`) como fuente única de verdad para los tipos TypeScript del dominio:

- **`packages/types/src/index.ts`** — tipos base iniciales:
  ```typescript
  export type EstadoPedido = 'PENDIENTE' | 'EN_PREPARACION' | 'LISTO' | 'ENTREGADO' | 'CANCELADO'
  export type EstadoSesion = 'ABIERTA' | 'CERRADA' | 'PAGANDO'
  export type EstadoLlamado = 'PENDIENTE' | 'ATENDIDO'
  export type RolUsuario = 'ADMIN' | 'MOZO' | 'COCINA' | 'CLIENTE'
  ```
- **`packages/types/package.json`** — configurado como paquete interno con exports desde `src/index.ts`.
- **`packages/types/tsconfig.json`** — extiende `tsconfig.base.json`.

El paquete se dejó marcado como "se irá completando sprint a sprint" — la intención era ir agregando interfaces a medida que cada módulo se implementara.

### Decisiones

**Tipos de dominio en un paquete separado desde el día 1:** cualquier app del monorepo puede importar `@menyu/types` sin depender de otra app. Esto evita que, por ejemplo, el frontend copie definiciones del backend o que dos apps definan `EstadoPedido` de forma diferente.

**Union types de string en lugar de enums de TypeScript:** los enums de TypeScript generan código JavaScript extra en runtime. Los union types de string son puramente en tiempo de compilación y son más livianos y compatibles con JSON.

---

## 5. #28 — Definir schema Prisma completo y migrar a Supabase

**Responsable:** Strumia Carrara  
**Commit:** `listo conexion en supabase y inicializar nestjs` (24/04/2026)

### Qué se hizo

Se diseñó y aplicó el schema completo de la base de datos para v1.0 (366 líneas de `schema.prisma`), cubriendo todas las entidades del dominio desde el inicio:

**Módulos cubiertos por el schema:**
- Marca y Restaurante (multi-tenant)
- Usuarios: Admin, Mozo, Cliente
- Mesas y Sesiones
- Menú: ItemMenu, CategoriaMenu, SubcategoriaMenu, Ingrediente, ItemIngrediente, ItemSucursal, Menu, MenuItem
- Pedidos: Pedido, PedidoItem, PedidoItemMod
- Pagos: Pago
- Llamados: LlamadoMozo
- Comandas: Comanda

**16 tablas en total** para v1.0.

**Configuración de Prisma:**
- `schema.prisma` con `provider = "postgresql"` y `url = env("DATABASE_URL")`
- `prisma.config.ts` con configuración del generador
- Primera migración: `20260424200600_init/migration.sql` (382 líneas de SQL)
- Migración aplicada exitosamente en Supabase

### Decisiones

**Schema completo desde el sprint 1 en lugar de incremental:** se definió todo el schema de v1.0 al inicio para que la BD tuviera consistencia referencial desde el comienzo. Los módulos se implementan sprint a sprint, pero las tablas ya existen. Esto evita migraciones complejas que modifiquen estructuras existentes con datos.

**UUIDs en todos los IDs:** `@id @default(uuid())`. Más seguros que integers secuenciales (no son predecibles), no hay colisión en merges de datos y son compatibles con generación en el cliente.

**Precios como `Decimal(10, 2)`** en lugar de `Float`: los floats de IEEE 754 tienen errores de precisión con decimales. Decimal garantiza exactitud en operaciones monetarias.

**`snake_case` en BD via `@map()`:** PostgreSQL es case-insensitive y usa snake_case por convención. Prisma mapea automáticamente a camelCase en el código TypeScript. No hay que escribir transformaciones manuales.

**ItemMenu scoped a Marca, no a Restaurante:** el catálogo de platos es compartido entre sucursales de la misma cadena. La disponibilidad y precio local se gestionan con `ItemSucursal`.

---

## 6. #29 — Inicializar apps/backend (NestJS)

**Responsable:** Strumia Carrara  
**Commit:** `listo conexion en supabase y inicializar nestjs` (24/04/2026)

### Qué se hizo

Se convirtió el placeholder de `apps/backend/` en un proyecto NestJS funcional con conexión real a la BD:

- **`nest-cli.json`** — configuración del compilador NestJS.
- **`tsconfig.json`** — extiende `@menyu/config/tsconfig.nestjs.json`, strict mode activado.
- **`src/main.ts`** — bootstrap de la app, puerto 3000, prefijo global `/api`.
- **`src/app.module.ts`** — módulo raíz, importa `PrismaModule`.
- **`src/prisma/prisma.module.ts`** y **`prisma.service.ts`** — servicio Prisma decorado con `@Global()` para estar disponible en todos los módulos sin imports explícitos.
- **`apps/backend/.env.example`** — variables requeridas documentadas.
- **`package.json`** actualizado con dependencias: `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@prisma/client`, `prisma`.

### Decisiones

**`PrismaModule` global:** NestJS tiene inyección de dependencias por módulo. Sin `@Global()`, cada módulo futuro (auth, pedidos, etc.) tendría que importar `PrismaModule` explícitamente. Con `@Global()`, `PrismaService` está disponible en cualquier módulo desde el inicio.

---

## 7. #30 — Inicializar apps/cliente (Expo)

**Responsable:** Strumia Carrara  
**PR:** #181 (`feat/inicializar-apps-cliente`) · commit `tarea de init cliente` (24/04/2026)

### Qué se hizo

Se convirtió el placeholder en un proyecto Expo React Native funcional con la estructura de carpetas completa del flujo de la app:

- **`apps/cliente/app.json`** — configuración Expo (nombre, slug, scheme).
- **`babel.config.js`** — `babel-preset-expo`.
- **`tsconfig.json`** — extiende `tsconfig.expo.json`.
- **`src/app/`** — layouts de Expo Router file-based:
  - `_layout.tsx` — layout raíz
  - `(auth)/_layout.tsx` — grupo de rutas de autenticación
  - `(session)/_layout.tsx` — grupo de rutas de sesión activa
- **`src/features/`** — módulos de funcionalidad (placeholders con index.ts):
  - `auth/`, `qr-scanner/`, `menu/`, `cart/`, `payment/`, `waiter-call/`, `session/`
- **`src/components/`** — carpetas: `ui/`, `layout/`, `menu/`, `order/`
- **`src/store/`** — placeholders: `cartStore.ts`, `sessionStore.ts`, `userStore.ts`
- **`src/services/`** — placeholders: `api.ts`, `socket.ts`

### Decisiones

**Expo Router (file-based routing):** cada archivo en `app/` es una ruta. Los grupos `(auth)` y `(session)` permiten tener layouts distintos para el flujo de login vs. el flujo de mesa activa, sin afectar la URL del navegador (en web) ni la navegación nativa.

**Estructura `features/` desde el inicio:** cada feature encapsula su lógica (hooks, componentes, servicios) en su propio directorio. Evita que la app crezca como un monolito de componentes sin cohesión.

---

## 8. #31 — Inicializar apps/cocina, apps/admin y apps/mozo

**Responsables:** Strumia Carrara (cocina + admin) · Ojeda (mozo)  
**PRs:** #182 (`feat/inicializar-cocina-admin`) · #183 (`feat/continuacion-init-mozo`)  
**Commits:** `tarea 3, cocina y admin inicializados, mozo parcial` (CotyStrumia) + `feat: init-mozo completo` (lautiod) — 24/04/2026

### Qué se hizo

#### apps/cocina y apps/admin (Strumia Carrara)

Ambas apps React + Vite + TailwindCSS inicializadas con la misma estructura base:

- `index.html` — entry point con `<div id="root">`.
- `src/main.tsx` — `ReactDOM.createRoot`, importa `index.css`.
- `src/App.tsx` — componente raíz placeholder.
- `src/index.css` — directivas Tailwind (`@tailwind base/components/utilities`).
- `postcss.config.js` — configuración de PostCSS + Tailwind.
- `package.json` — Vite, React, TypeScript, TailwindCSS.
- Estructura de carpetas: `pages/` (dashboard, menu, payments, staff), `components/` (charts, forms, tables, ui), `store/`, `services/`.

#### apps/mozo (Ojeda)

App Expo React Native inicializada (completando lo que Strumia Carrara había dejado parcial):

- **`src/app/`** — Expo Router:
  - `(auth)/login.tsx` — pantalla de login del mozo
  - `(panel)/index.tsx` — pantalla principal del panel
- **`src/features/`** — `notifications/`, `orders/`, `tables/`, `waiter-calls/`
- **`src/components/`** — `ui/`, `layout/`, `order/`
- **`src/services/`**, **`src/store/`** — placeholders

### Decisiones

**React + Vite + Tailwind para cocina y admin** (web apps): son interfaces usadas en computadoras/tablets fijas, no en dispositivos móviles. No necesitan capacidades nativas. Vite tiene HMR instantáneo, Tailwind evita escribir CSS custom.

**Expo para mozo** (app nativa): el mozo se mueve por el salón y necesita recibir push notifications con la pantalla bloqueada. Eso requiere capacidades nativas (Expo Notifications). Una web app no puede hacer esto de forma confiable.

**Separación cocina / mozo en apps distintas**: roles con necesidades de UI completamente diferentes. Cocina: tablet fija, muchos pedidos al mismo tiempo, vista de kanban. Mozo: celular en mano, notificaciones, vista compacta.

---

## 9. #32 — CI/CD: Despliegue automático del backend desde Railway

**Responsable:** Ojeda  
**Commit:** `railway & dockerfile` — 30/04/2026

### Qué se hizo

Se configuró la infraestructura de deploy del backend:

- **`apps/backend/Dockerfile`** — imagen multi-stage:
  1. Stage `deps`: instala dependencias con pnpm
  2. Stage `build`: compila TypeScript + genera cliente Prisma
  3. Stage `runner`: imagen final slim con solo los artefactos compilados
- **`.dockerignore`** — excluye `node_modules`, `.env`, `dist`, archivos de desarrollo.
- **`railway.toml`** — configuración del servicio Railway: builder Dockerfile, healthcheck en `/api/health`, restart policy.
- **`apps/backend/.env.example`** — documentación de las variables requeridas:
  - `DATABASE_URL` — connection string Supabase (con pooler)
  - `DIRECT_URL` — connection string directo para migraciones
  - `JWT_SECRET`
  - `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`

Los workflows de GitHub Actions (ci.yml, deploy-staging.yml, deploy-production.yml) se configuraron en el sprint correspondiente del CI/CD formal, pero las bases del Dockerfile y Railway se dejaron listas en este sprint.

### Decisiones

**Railway para el backend:** plataforma PaaS con soporte nativo de Docker y variables de entorno por ambiente. Deploy automático al pushear un tag de versión. Más simple que configurar un servidor propio o usar AWS/GCP para el alcance del proyecto.

**Dockerfile multi-stage:** la imagen final de producción no incluye devDependencies, archivos de test ni el código TypeScript fuente. Solo el JavaScript compilado. Esto reduce el tamaño de la imagen y la superficie de ataque.

**`DIRECT_URL` separado de `DATABASE_URL`:** Supabase expone dos endpoints: un connection pooler (PgBouncer, para la app en runtime) y una conexión directa (para migraciones Prisma que requieren una conexión persistente). Prisma tiene soporte específico para esta configuración con el campo `directUrl` en el datasource.

---

## 10. #33 — Documentar schema de base de datos

**Responsable:** Ojeda  
**Commit:** `Add files via upload` — `Documentacion.md` (529 líneas) — 24/04/2026  
**Archivo actual:** `Documentacion/Doc_DB.md`

### Qué se hizo

Se redactó la documentación completa del schema de base de datos:

- **Visión general** del sistema multi-tenant con Marca como entidad raíz.
- **Convenciones** del proyecto: IDs, timestamps, nombres, precios, soft delete, foreign keys.
- **Estructura de tablas por módulo:** Marca/Sucursales, Usuarios, Mesas/Sesiones, Menú, Pedidos/Pagos — con descripción de cada columna relevante.
- **Enums implícitos** (estados almacenados como strings).
- **Relaciones clave** entre entidades con cardinalidad.
- **Decisiones de diseño** justificadas.
- **Tablas v2.0 planificadas** (motor de recomendaciones, fidelización).

### Decisiones

**Documentar el schema en el sprint de fundaciones y no después:** el schema define el contrato entre todos los módulos. Documentarlo al inicio sirve como referencia para todos los integrantes al implementar sus módulos correspondientes.

---

## 11. #34 — Inicio redacción de tesis

**Responsables:** Strumia Carrara + Ojeda  
**Estado:** iniciado en S1, continúa durante todo el proyecto

### Qué se hizo

- Estructura inicial del documento de tesis académica (ODS390-2026).
- Primeras secciones: introducción, contexto del problema, descripción del sistema.
- División de responsabilidades de redacción entre los integrantes del equipo.

---

## 12. Decisiones de diseño transversales

Estas decisiones se tomaron en S1 y afectan a todos los sprints siguientes:

| Decisión | Justificación |
|---|---|
| Monorepo único para todas las apps | Un solo `git clone`, builds orquestados, tipos compartidos sin publicar a npm |
| `@menyu/types` como fuente única de verdad para tipos | Evita que distintas apps definan el mismo tipo de forma diferente |
| Schema de BD completo desde el sprint 1 | Consistencia referencial desde el inicio; evita migraciones disruptivas con datos |
| TypeScript strict en todas las apps | Sin `any` salvo justificación; errores en compilación en lugar de runtime |
| Convención `snake_case` en BD, `camelCase` en código | Prisma mapea automáticamente; no hay transformaciones manuales en el código |
| Supabase para PostgreSQL | DB managed sin administrar infraestructura; incluye Storage para imágenes |
| Railway para el backend | PaaS con deploy automático vía Docker; adecuado para el alcance del proyecto |
| `.env.example` como documentación de variables | Cualquier integrante puede levantar el proyecto localmente sin preguntar qué variables necesita |

---

*MenYU · De Marcos · Ojeda · Strumia Carrara · 2026*
