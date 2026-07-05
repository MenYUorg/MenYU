# Sprint 7 — Estabilización MVP

**Sprint:** S7 · Issue épica #7  
**Equipo:** De Marcos (margarita0912) · Ojeda (lautiod) · Strumia Carrara (CotyStrumia)  
**Fecha:** Junio 2026  
**Estado:** Todo / In Progress

---

## Índice

1. [Objetivo del sprint](#1-objetivo-del-sprint)
2. [Actividades y responsables](#2-actividades-y-responsables)
3. [#280 — Seguridad: Almacenamiento datos sensibles MercadoPago](#3-280--seguridad-almacenamiento-datos-sensibles-mercadopago)
4. [#76 — Revisión de seguridad: variables de entorno y CORS básico](#4-76--revisión-de-seguridad-variables-de-entorno-y-cors-básico)
5. [#247 — Documentación del MVP para Gestión de Proyectos](#5-247--documentación-del-mvp-para-gestión-de-proyectos)
6. [#238 — Revisión de UI y embellecimiento](#6-238--revisión-de-ui-y-embellecimiento)
7. [#74 — README del monorepo con instrucciones de setup](#7-74--readme-del-monorepo-con-instrucciones-de-setup)
8. [#211 — Testing: Cobertura de Unit Tests](#8-211--testing-cobertura-de-unit-tests)
9. [#250 — Conexión de impresora](#9-250--conexión-de-impresora)

---

## 1. Objetivo del sprint

Estabilizar el MVP antes del deploy a producción: completar la documentación técnica y académica, mejorar la cobertura de tests, revisar la seguridad de variables y CORS, pulir la UI, y preparar la integración con impresoras de cocina.

---

## 2. Actividades y responsables

| # | Actividad | Responsable | Estado |
|---|---|---|---|
| #280 | Seguridad: Almacenamiento datos sensibles MercadoPago | Strumia Carrara | **Done** |
| #76 | Revisión de seguridad: variables de entorno y CORS básico | Ojeda | In Progress |
| #247 | Documentación del MVP para Gestión de Proyectos | Strumia Carrara + Ojeda | In Progress |
| #238 | Revisión de UI y embellecimiento | De Marcos | In Progress |
| #74 | README del monorepo con instrucciones de setup | Ojeda | Todo |
| #211 | Testing: Cobertura de Unit Tests | Ojeda | Todo |
| #250 | Conexión de impresora | Strumia Carrara | Todo |

---

## 3. #280 — Seguridad: Almacenamiento datos sensibles MercadoPago

**Responsable:** Strumia Carrara  
**Commit:** `2ea8f23` — 01/06/2026  
**Estado:** Done

### Qué se hizo

Los tokens OAuth de cada restaurante (`mpAccessToken`, `mpRefreshToken`) se guardaban en texto plano en la tabla `restaurante`. Si la base de datos se filtrara, cualquier atacante tendría acceso inmediato a las cuentas de MP de todos los restaurantes.

**`src/common/crypto.service.ts`** (nuevo):
- Encriptación **AES-256-CBC** con IV aleatorio por operación.
- `encrypt(text): string` → cifra y retorna en base64 (`iv:encrypted`).
- `decrypt(encrypted): string` → extrae IV y descifra.
- La clave se lee de `ENCRYPTION_KEY` en el entorno. Nunca hardcodeada.

**`payments.service.ts`** actualizado:
- Al guardar el callback de OAuth: `crypto.encrypt(access_token)` antes de persistir.
- Al usar el token para crear una preferencia: `crypto.decrypt(mpAccessToken)` antes de pasarlo al SDK de MP.

**`scripts/migrate-mp-tokens.ts`** (nuevo):
- Script one-shot para encriptar los tokens existentes en la DB sin truncar datos.
- Busca todos los restaurantes con `mpAccessToken` no nulo, encripta y actualiza.

**Variable de entorno nueva:** `ENCRYPTION_KEY` — clave de 32 bytes en hex para AES-256. Documentada en `.env.example` con instrucciones de generación.

---

## 4. #76 — Revisión de seguridad: variables de entorno y CORS básico

**Responsable:** Ojeda  
**Estado:** In Progress

### Qué está hecho

**CORS con lista blanca dinámica** (`main.ts`):
- Array estático `CORS_ORIGINS` para desarrollo local (puertos 8081, 19006, 5173–5176, 4173).
- Variable `CORS_ORIGINS` en el entorno para producción/staging (comma-separated).
- Variable `CORS_ORIGIN_PATTERNS` para regex — cubre las Preview URLs dinámicas de Vercel (`^https://.*\.vercel\.app$`).
- En Railway staging y producción se configura `CORS_ORIGINS` con los dominios reales de Vercel.

**`.env.example`** completo con comentarios:
- Cada variable documentada con descripción y ejemplo de valor.
- Indicación de cómo generar `JWT_SECRET` y `ENCRYPTION_KEY` via `crypto.randomBytes`.
- Diferenciación entre `DATABASE_URL` (pooler, para la app) y `DIRECT_URL` (directo, para migraciones).

### Pendiente

- Revisión formal de que ninguna variable sensible esté en logs, commits o responses de la API.
- Validación de que `JWT_SECRET`, `ENCRYPTION_KEY` y tokens de MP tienen valores seguros en todos los ambientes (no placeholders).
- Verificar que los endpoints de desarrollo (`/auth/dev/*`) estén desactivados en producción.

---

## 5. #247 — Documentación del MVP para Gestión de Proyectos

**Responsables:** Strumia Carrara + Ojeda  
**Estado:** In Progress

### Qué está hecho

**Resúmenes de sprint** (este conjunto de archivos):
- `sprint1-resumen.md` al `sprint7-resumen.md` — documentación técnica de cada sprint con qué se construyó, decisiones de diseño y problemas resueltos.

**Resumen de contribuciones por integrante:**
- `devops-resumen-ojeda.md` — contribuciones de Ojeda al DevOps/CI-CD.
- Resumen De Marcos (documento externo provisto por la integrante).

**Documentación modular** (sesiones previas de Coty):
- `modulo-usuarios-y-autenticacion.md`, `modulo-menu.md`, `modulo-pedidos-y-cocina-kanban.md`, `modulo-waiter-calls-y-mozo-panel.md`, `modulo-pagos.md`, `modulo-pagos-sesion2.md`, `modulo-carrito.md`, `modulo-carrito-ui.md`, `modulo-carrito-tests.md`.

**Workflow de desarrollo** (`WORKFLOW.md`):
- Flujo de ramas, PR, CI, staging y producción.
- Tabla de secrets de GitHub Actions.
- Instrucciones de setup local.

**Documentación de la base de datos** (`Doc_DB.md`):
- Schema completo, convenciones, relaciones entre tablas, decisiones de diseño.

### Pendiente

- Documentación académica de los casos de uso en el formato requerido por la cátedra (CU completos con plantilla de la materia).
- Diagrama de arquitectura del sistema.
- Manual de usuario básico para el panel admin.

---

## 6. #238 — Revisión de UI y embellecimiento

**Responsable:** De Marcos  
**Estado:** In Progress

### Qué está hecho

Ronda de correcciones de lint, warnings de ESLint y ajustes visuales menores en las tres apps web como parte del proceso de estabilización:

- `fix(web-admin)`: eliminación de variables no usadas y dependencias innecesarias en `PagosPage` y `MozosPage`.
- `fix(web-staff)`: corrección de errores TypeScript en `PagosGerente`, `MesasPage` y `MozoPanel`. Eliminación de variables sin usar en `CocinaPage` y `TomaPedidosPage`.
- `fix(web-cliente)`: correcciones de advertencias ESLint en `App.tsx` e `ItemDetailPage.tsx`.

### Pendiente

- Revisión sistemática de consistencia visual entre las tres apps (espaciados, tamaños de fuente, colores).
- Ajustes de responsividad para resoluciones no cubiertas en el desarrollo.
- Accesibilidad básica (atributos `aria-*` en elementos interactivos clave).

---

## 7. #74 — README del monorepo con instrucciones de setup

**Responsable:** Ojeda  
**Estado:** Todo

### Estado actual

El README existe pero es mínimo: nombre del proyecto, integrantes y mención del CI/CD. No hay instrucciones de setup.

### Alcance planificado

- Requisitos de sistema (Node.js ≥ 20, pnpm ≥ 10).
- Pasos de instalación: `pnpm install`, `prisma generate`, `prisma migrate deploy`.
- Variables de entorno requeridas (referencia a `.env.example`).
- Comandos de desarrollo: `pnpm dev`, apps individuales con `--filter`.
- Tabla de puertos por app.
- Cómo correr los tests.
- Cómo deployar a staging y producción.

---

## 8. #211 — Testing: Cobertura de Unit Tests

**Responsable:** Ojeda  
**Estado:** Todo

### Estado actual de tests

| App | Tests existentes | Qué cubren |
|---|---|---|
| `@menyu/api` (backend) | ~98 tests unitarios | AuthService, UsersService, MarcaService, SessionsService, MesasService |
| `@menyu/api` (e2e) | 9 tests de integración | Flujo de apertura de sesión end-to-end |
| `@menyu/cliente` | 42 tests | useCarritoStore, CantidadControl, MenuItemCard, CarritoItem |

### Módulos sin tests

Los módulos implementados en sprints recientes no tienen cobertura de tests:
- `PedidosService`, `WaiterCallsService`, `PaymentsService`.
- `ItemsService`, `IngredientesService`, `CategoriasService`.
- `ReportesService`, `AdminRestauranteService`.

### Alcance planificado

Ampliar la cobertura de tests unitarios para los módulos críticos del MVP, priorizando el flujo de pedidos y pagos.

---

## 9. #250 — Conexión de impresora

**Responsable:** Strumia Carrara  
**Estado:** Todo

### Contexto

El panel de cocina (`apps/web-staff` — `CocinaPage`) recibe pedidos en tiempo real via WebSocket. La siguiente fase es imprimir automáticamente cada comanda al recibirla, para que la cocina no dependa de tener la pantalla siempre visible.

### Alcance planificado

- Integración con impresoras de red (ESC/POS sobre TCP/IP).
- Configuración de IP y puerto de la impresora en `config/printerConfig.ts`.
- Servicio `printer.ts` con método `printComanda(pedido)`.
- La lógica de impresión vivirá en el frontend de cocina (no en el backend), ya que la impresora está en la red local del restaurante y el backend está en Railway.
- Trigger: al recibir el evento `order:new`, imprimir automáticamente.

---

*MenYU · De Marcos · Ojeda · Strumia Carrara · 2026*
