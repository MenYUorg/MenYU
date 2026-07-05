# Sprint 4 — Carrito

**Sprint:** S4 · Issue épica #4  
**Equipo:** De Marcos (margarita0912) · Ojeda (lautiod) · Strumia Carrara (CotyStrumia)  
**Fecha:** Mayo 2026  
**Estado:** Done

---

## Índice

1. [Objetivo del sprint](#1-objetivo-del-sprint)
2. [Actividades y responsables](#2-actividades-y-responsables)
3. [#51 — Store Zustand: useCarritoStore](#3-51--store-zustand-usecarritostore)
4. [#52 — Lógica de agregar/quitar ítems al carrito (UI)](#4-52--lógica-de-agregarquitar-ítems-al-carrito-ui)
5. [#53 — Modificadores de ingredientes: agregar/quitar con delta de precio](#5-53--modificadores-de-ingredientes-agregarquitar-con-delta-de-precio)
6. [#54 — Actualización de precio total en tiempo real (frontend)](#6-54--actualización-de-precio-total-en-tiempo-real-frontend)
7. [#56 — Bug fixing: auth y sesión (deuda S2-S3)](#7-56--bug-fixing-auth-y-sesión-deuda-s2-s3)
8. [#57 — Swagger: endpoints de pedidos documentados](#8-57--swagger-endpoints-de-pedidos-documentados)
9. [#232 — Integrar pipeline a Railway y Vercel con GitHub Actions](#9-232--integrar-pipeline-a-railway-y-vercel-con-github-actions)
10. [#234 — CI/CD Vercel, despliegue de frontends](#10-234--cicd-vercel-despliegue-de-frontends)
11. [#55 — Tests de menú y carrito](#11-55--tests-de-menú-y-carrito)
12. [Decisiones de diseño transversales](#12-decisiones-de-diseño-transversales)
13. [Problemas encontrados y resoluciones](#13-problemas-encontrados-y-resoluciones)

---

## 1. Objetivo del sprint

Implementar el flujo completo del carrito de compras con modificadores de ingredientes y delta de precio, conectar la lógica con el backend de pedidos, resolver la deuda técnica de roles y sesiones de sprints anteriores, y poner en producción el pipeline de CI/CD completo con Railway + Vercel.

---

## 2. Actividades y responsables

| # | Actividad | Responsable |
|---|---|---|
| #51 | Store Zustand: useCarritoStore | Strumia Carrara |
| #52 | Lógica de agregar/quitar ítems al carrito (UI) | Strumia Carrara |
| #54 | Actualización de precio total en tiempo real (frontend) | De Marcos |
| #53 | Modificadores de ingredientes: agregar/quitar con delta de precio | De Marcos |
| #57 | Swagger: endpoints de pedidos documentados | Ojeda |
| #232 | Integrar pipeline a Railway y Vercel con GitHub Actions | Ojeda |
| #234 | CI/CD Vercel, despliegue frontends | Ojeda |
| #55 | Tests de menú y carrito | Strumia Carrara + De Marcos |
| #56 | Bug fixing: auth y sesión (deuda S2-S3) | De Marcos |

---

## 3. #51 — Store Zustand: useCarritoStore

**Responsable:** Strumia Carrara  
**Documentación detallada:** `Documentacion/modulo-carrito.md`

### Qué se hizo

Se creó el store de carrito en `apps/cliente` (app Expo) y el tipo compartido en `@menyu/types`:

**`packages/types/src/cart.types.ts`:**
```typescript
export interface ItemCarrito {
  id: string
  nombre: string
  precio: number
  cantidad: number
  imagenUrl?: string
}
```

**`apps/cliente/src/stores/useCarritoStore.ts`** — Zustand sin persist (carrito en memoria):

| Acción | Comportamiento |
|---|---|
| `agregarItem(item)` | Si existe: +1 en cantidad. Si no: inserta con cantidad 1. El caller no pasa cantidad. |
| `quitarItem(itemId)` | Elimina el ítem completo sin importar la cantidad |
| `actualizarCantidad(id, n)` | Si n ≤ 0: elimina. Si n > 0: actualiza. |
| `vaciarCarrito()` | Resetea a `[]` |
| `total()` | Suma de `precio × cantidad` por ítem |
| `cantidadTotal()` | Suma de todas las cantidades (para el badge del ícono) |

### Decisiones

**Sin persist:** el carrito es estado en memoria. Si el cliente cierra la app a mitad de un pedido, pierde lo que tenía — aceptable en el contexto de una sesión de mesa activa donde el pedido se envía rápido.

**`Omit<ItemCarrito, 'cantidad'>` en `agregarItem`:** el componente de menú no sabe cuántas unidades hay en el carrito. Esa es responsabilidad del store.

**`total()` y `cantidadTotal()` como getters internos:** usan `get()` de Zustand en el momento de la llamada. No son hooks externos — se acceden igual que las acciones.

---

## 4. #52 — Lógica de agregar/quitar ítems al carrito (UI)

**Responsable:** Strumia Carrara  
**Documentación detallada:** `Documentacion/modulo-carrito-ui.md`

### Qué se hizo

Se implementaron los componentes UI que conectan el menú con el store del carrito:

**`CantidadControl`** — UI pura. Botones `−` y `+` con la cantidad del store. No tiene lógica de negocio: recibe `onIncrement` y `onDecrement` del padre. Selector granular para evitar re-renders de todos los ítems cuando cambia la cantidad de uno solo.

**`MenuItemCard`** — tarjeta horizontal del menú. Alterna entre dos estados:
- Cantidad 0 → botón "Agregar"
- Cantidad > 0 → reemplaza el botón por `CantidadControl`. Decrementar a 1 llama `quitarItem` (no `actualizarCantidad(id, 0)`).

**`CarritoItem`** — tarjeta en la pantalla del carrito. Muestra precio unitario, subtotal (naranja), controles de cantidad y botón "Eliminar" (rojo).

**`MenuScreen`** — datos mockeados, footer con "Ver carrito · N ítems" visible solo si `cantidadTotal > 0`.

**`CarritoScreen`** — estado vacío o lista con total + botones "Confirmar pedido" (placeholder, conectado en sprint siguiente) y "Vaciar carrito".

**Paleta de estilos:** naranja `#D4621A` como color primario, siguiendo la identidad visual de `check-in.tsx`.

---

## 5. #53 — Modificadores de ingredientes: agregar/quitar con delta de precio

**Responsable:** De Marcos  
**Contexto (SESIÓN 04):** la lógica de cálculo existía en `ItemDetailPage.tsx` pero no había store de carrito ni flujo de confirmación conectado.

### Auditoría previa

Antes de implementar se auditó el estado del código:

- El botón "Agregar al carrito" no tenía `onClick` conectado; `cartStore.ts` no existía.
- `sessionStore.ts` descartaba el campo `jwt` devuelto por `/sessions/open` — bloqueante para crear pedidos (el JWT de sesión es el que autoriza `POST /api/orders`).
- El `sessionId` viaja en el JWT del header `Authorization`, no en el body del pedido.

### Implementación

**`apps/web-cliente/src/pages/menu/ItemDetailPage.tsx`** — rediseño completo con sistema visual nuevo:
- Interfaz renovada para la visualización del ítem con imagen, precio y descripción.
- Cada ingrediente del ítem muestra su tipo de modificación: `esRemovible` (botón "Quitar / Restaurar") o `esAgregable` (controles +/− con precio extra).
- Ingredientes no modificables muestran badge "Fijo".
- Botón "Agregar al carrito" conectado a `handleAddToCart`.

**Cálculo del `precioUnitario` con delta:**
```
precioUnitario = precioBase
  + Σ(precioExtra × cantidad de mods AGREGAR)
  - Σ(precioExtra de mods QUITAR)
```

El precio se calcula en el frontend al armar la tarjeta. El backend lo recalcula de forma independiente al crear el pedido (snapshot).

**`cartStore.ts` (nuevo) en `apps/web-cliente`:**
- Zustand con persistencia en `localStorage`.
- Tipo local `ItemCarritoUI` con campos: `cartId` (ID único dentro del carrito), `itemMenuId`, `nombre`, `precioUnitario`, `cantidad`, `notas?`, `mods[]` (`{ itemIngredienteId, accion: 'AGREGAR'|'QUITAR', cantidad }`).
- Acción `removeItem(itemMenuId, modsKey)` — elimina por combinación de ítem + modificaciones, permitiendo el mismo ítem con distintas modificaciones como entradas separadas.

---

## 6. #54 — Actualización de precio total en tiempo real (frontend)

**Responsable:** De Marcos  
**Contexto:** misma sesión de implementación que #53.

### Qué se hizo

**`apps/web-cliente/src/pages/menu/ClienteMenuPage.tsx`** — rediseño con botón flotante del carrito:
- Botón fijo (`position: fixed`) en la parte inferior de la pantalla, visible solo si hay ítems en el carrito.
- Muestra la cantidad total de ítems y el precio acumulado en tiempo real.
- Al presionar navega a `/carrito`.

**`apps/web-cliente/src/pages/carrito/CarritoPage.tsx`** — carrito completo:
- Lista de ítems con nombre, precio unitario, subtotal y botón "Quitar".
- Controles +/− de cantidad por ítem.
- Total general actualizado en tiempo real al cambiar cantidades.
- Botón "Confirmar pedido" → llama `POST /api/orders` con el JWT de sesión.
- Al confirmar exitosamente: `vaciarCarrito()` y navega a pantalla de éxito.

**`apps/web-cliente/src/pages/carrito/ConfirmacionPage.tsx`** — pantalla post-pedido:
- Confirmación visual del pedido enviado.
- Botones "Seguir pidiendo" (→ `/menu`) y "Pedir la cuenta" (→ `/pago`).

**`sessionStore.ts` — fix:**
- Se agregó campo `jwt` con persistencia en `sessionStorage`.
- El JWT de sesión que devuelve `/sessions/open` ahora se guarda correctamente.

**`api.ts` — correcciones:**
- Tipo de retorno de `sessions.open` corregido para incluir `jwt`.
- Nuevo método `api.orders.create(jwt, items)` para enviar el pedido al backend con el JWT de sesión en el header `Authorization`.

---

## 7. #56 — Bug fixing: auth y sesión (deuda S2-S3)

**Responsable:** De Marcos  
**Contexto (SESIÓN 03 — Roles, Subcategorías y Casos de Uso):** sesión con tres objetivos: documentar casos de uso, corregir el sistema de roles de administrador, y simplificar el modelo de menú.

### Sistema de roles — corrección (PR #244 `feat/roles-gerente`)

**Problema:** el campo `rol` en `Admin` era un `String` libre. El rol `ADMIN` no pasaba ningún guard. No existía mecanismo para asignar gerentes a restaurantes específicos.

**Corrección:**
- El rol pasó de `String` libre a enum de PostgreSQL `rol_admin` con valores `ROOT`, `OWNER`, `GERENTE` (renombrando `ADMIN` → `GERENTE`).
- Se creó la tabla `AdminRestaurante` como pivot `admin ↔ restaurante`. Un GERENTE puede estar asignado a múltiples restaurantes.
- Se actualizó la lógica de ownership en 8 services para el tercer nivel (GERENTE ve solo sus restaurantes asignados).
- Se creó el módulo `admin-restaurante/` con endpoints de asignación/desasignación.

**Archivos clave:**
```
src/admin-restaurante/
  admin-restaurante.module.ts
  admin-restaurante.controller.ts   ← POST /admin-restaurante/asignar
  admin-restaurante.service.ts

apps/admin/src/pages/gerentes/GerentesPage.tsx  ← UI de asignación de gerentes
```

**Fix de `@@map("rol_admin")` en el enum — Ojeda (commit `961ca8a`):**
La migración creó el enum en PostgreSQL como `rol_admin` (snake_case). El schema de Prisma lo definía como `RolAdmin` sin `@@map`, lo que causaba que el cliente generado intentara insertar valores de tipo `"RolAdmin"` — tipo inexistente en la DB. Ojeda identificó el problema a nivel de compatibilidad Prisma/PostgreSQL, agregó `@@map("rol_admin")` y corrió `prisma generate`. Este fix fue necesario tanto en staging como en producción antes de poder desplegar.

### Eliminación de subcategorías (PR #256 `feat/remove-subcategorias`)

**Problema:** el modelo original tenía tres niveles (`Categoría → Subcategoría → Ítem`). En la práctica los restaurantes no necesitaban ese nivel de profundidad; la UI resultaba compleja y los endpoints de subcategorías generaban overhead.

**Cambio:**
- Se eliminaron los endpoints y la lógica de subcategorías del backend y del panel admin.
- El modelo simplificado usa un único nivel: `Categoría → Ítem`.
- La tabla `subcategoria_menu` se conserva en la DB (no se corrió migración destructiva) pero está fuera de la lógica de negocio.
- Se actualizó `menu.service.ts`, `categorias.service.ts` y el panel admin (`CategoriasTab.tsx`, `ItemsTab.tsx`).

### Documentación de casos de uso (contexto académico)

En paralelo con las correcciones técnicas, De Marcos documentó seis casos de uso en formato académico para la tesis (Estado, Archivos, Tests existentes, Precondición, Flujo principal, Flujos alternativos, Postcondición, Actor):

| Caso de uso | Tests asociados |
|---|---|
| CU5 — Apertura de sesión por QR o PIN | 15 unitarios + 9 e2e |
| CU6 — Creación de mesa con QR y PIN | 11 tests |
| CU7 — Navegación del menú público | 18 tests |
| CU — Gestión de usuarios | 15 tests |
| CU — Gestión de marcas | 13 tests |
| CU — Gestión avanzada de mesas | 17 tests |

**Estado al cierre de la sesión:** 98 tests pasando, typecheck limpio en backend y frontends.

---

## 8. #57 — Swagger: endpoints de pedidos documentados

**Responsable:** Ojeda  
**Commits:** `fix: add @ApiBearerAuth() to controllers missing Swagger auth decorator`

### Qué se hizo

Se completó la cobertura de Swagger para los endpoints que quedaron sin documentar en el sprint anterior:

- Decoradores `@ApiOperation`, `@ApiResponse`, `@ApiBody` a los controllers de `pedidos/`, `waiter-calls/`, `sessions/` y `orders/`.
- `@ApiBearerAuth()` agregado a todos los controllers protegidos que lo faltaban.
- Con esto todos los endpoints del backend tienen documentación accesible en `/docs`.

---

## 9. #232 — Integrar pipeline a Railway y Vercel con GitHub Actions

**Responsable:** Ojeda  
**Commit:** `chore: setup CI/CD workflows and normalize scripts` (1555a30)

### Qué se hizo

Se crearon los tres workflows de GitHub Actions que definen el pipeline completo del proyecto:

**`.github/workflows/ci.yml`** — trigger: Pull Request hacia `main`:

| Paso | Comando | Qué verifica |
|---|---|---|
| Install | `pnpm install --frozen-lockfile` | Dependencias reproducibles |
| Generate | `prisma generate` | Tipos de Prisma disponibles |
| Typecheck | `turbo run typecheck` | Sin errores TypeScript |
| Lint | `turbo run lint` | Sin errores ESLint |
| Test | `turbo run test` | Tests unitarios en verde |
| Build | `turbo run build` | Compila sin errores |

Si cualquier paso falla, el merge queda bloqueado.

**`.github/workflows/deploy-staging.yml`** — trigger: push a `main` (merge de PR):
1. Corre los mismos checks que CI.
2. Despliega el backend a Railway staging.
3. Despliega los frontends a Vercel (ambiente preview).

**`.github/workflows/deploy-production.yml`** — trigger: tag con formato `v*.*.*`:
1. Corre los mismos checks que CI.
2. Despliega el backend a Railway producción.
3. Despliega los frontends a Vercel (flag `--prod`).

**Normalización de scripts** en todos los `package.json` de las apps activas:
- Scripts `build`, `typecheck`, `lint`, `test` definidos uniformemente para que `turbo run` los encuentre en todas las apps.
- `turbo.json` actualizado con las tareas `lint`, `typecheck`, `test` y sus dependencias correctas.

**ESLint 9 (flat config)** instalado y configurado en `web-admin`, `web-cliente` y `web-staff`. Las tres apps partían sin ESLint; el CI fallaba en el step de lint porque el comando no existía.

**Vitest** instalado con `--passWithNoTests` en las tres apps web. Sin `--passWithNoTests`, la suite fallaba con error si no había archivos de test — bloqueando el CI aunque los checks de TypeScript y lint pasaran.

**`prisma generate` con variables dummy en CI:** la generación del cliente de Prisma en el runner de CI requería las variables de entorno de la DB (no disponibles en CI). Se agregó un step explícito con variables placeholder antes del build, eliminando la dependencia de conexión real a la base de datos en la etapa de compilación.

**Branch protection rules** configuradas en GitHub Settings:
- Require Pull Request antes de mergear a `main`.
- Require status checks passing (CI verde).
- Block force pushes.

### Decisiones

**Deploy a producción solo via tag:** nunca ocurre de forma automática por un merge a `main`. Requiere una acción explícita (`git tag v1.0.0 && git push origin v1.0.0`). Separa el merge del deploy intencional.

**Deploy de frontends via `vercel pull → vercel build → vercel deploy --prebuilt`:** flujo oficial recomendado por Vercel para CI/CD. Permite que Vercel descargue la configuración del proyecto, buildee localmente, y suba los artefactos ya compilados — más predecible que dejar que Vercel buildee en su infraestructura.

**Autodeploy de Railway y Vercel desactivado desde GitHub:** los deploys son exclusivamente controlados por los workflows de GitHub Actions. Sin esta configuración, un push directo podría triggear un deploy paralelo al del workflow.

**Ambientes aislados:** staging y producción tienen variables de entorno distintas en Railway y Vercel. Los datos de staging nunca se comparten con producción.

---

## 10. #234 — CI/CD Vercel, despliegue de frontends

**Responsable:** Ojeda  
**PRs:** #277, #278, #292, #293 (`test/ci-workflow`) + commits `chore: add Vercel retry logic`, `chore: add retry logic to Railway deploy steps`

### Qué se hizo

Se iteró sobre el pipeline para resolver fallas intermitentes en el deploy:

**Retry logic en steps de Railway:**
```yaml
- name: Deploy to Railway
  uses: ...
  with:
    retry-max: 3
    retry-delay: 30
```

**Retry logic en steps de Vercel:**
Mismo patrón para los tres proyectos de Vercel (web-admin, web-cliente, web-staff). Los timeouts de red en Railway y Vercel causaban fallas esporádicas que no eran errores de código.

**Pinning de versión de Vercel CLI:**
- `vercel@47.2.2` → luego `vercel@54.6.1` — la versión `54.7.0` introdujo un bug que rompía los deploys. Se fijó a la última versión estable conocida.

**`.env.example` completo** (`apps/backend/.env.example`):
- Se documentaron todas las variables de entorno requeridas en producción: Railway, Supabase, JWT, Mercado Pago, CORS, URLs.
- Referencia para configurar nuevos ambientes sin preguntar qué variables faltan.

**Secrets de GitHub Actions** cargados en el repositorio (9 secrets):
- `RAILWAY_TOKEN_STAGING`, `RAILWAY_TOKEN_PROD`, `RAILWAY_SERVICE_ID_STAGING`, `RAILWAY_SERVICE_ID_PROD`
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID_ADMIN`, `VERCEL_PROJECT_ID_CLIENTE`, `VERCEL_PROJECT_ID_STAFF`

**Ambientes en Railway:**
- Servicio `menyu-backend-staging` con variables de entorno separadas de producción (DB de staging, JWT_SECRET distinto, URLs de Vercel preview).
- Autodeploy desde GitHub desactivado en ambos servicios. Los deploys son exclusivamente por workflow.
- `DATABASE_URL` y `DIRECT_URL` configurados con el formato correcto del pooler de Supabase (parámetro `pgbouncer=true` en la URL de pooler, `sslmode=require`).

**Ambientes en Supabase:**
- Proyecto `menyu-staging` con base de datos separada e independiente de producción.
- `prisma migrate deploy` corrido en staging para aplicar todas las migraciones.
- Migración `fix_rol_admin_enum_map` aplicada manualmente (por el mismatch del enum).

**Ambientes en Vercel:**
- Variables de entorno `VITE_API_URL` y `VITE_WS_URL` configuradas por ambiente (Production, Preview, Development) en los tres proyectos de forma independiente.
- **Ignored Build Step** configurado para cancelar deploys automáticos a Production: Vercel no construye la rama `main` automáticamente — solo lo hace cuando el workflow de GitHub Actions lo invoca explícitamente.

**Mercado Pago — staging:**
- Creación de cuentas de prueba (vendedor y comprador) en el sandbox de MP.
- Redirect URI registrada en la app MenYU de MP.
- Variables `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_ACCESS_TOKEN`, `MP_REDIRECT_URI` cargadas en Railway staging.
- Validación del flujo OAuth completo en staging: connect → callback → token guardado en DB encriptado.
- Decisión: se usan credenciales de producción de MP (CLIENT_ID y CLIENT_SECRET) para staging, ya que MP no provee Client Secret en el entorno de pruebas. Los tokens OAuth de cada restaurante se guardan encriptados en la DB, no como variables de entorno globales.

---

## 11. #55 — Tests de menú y carrito

**Responsables:** Strumia Carrara + De Marcos  
**Documentación detallada (parte Coty):** `Documentacion/modulo-carrito-tests.md`

### Tests del carrito — Strumia Carrara

Se implementó la infraestructura de testing completa para `apps/cliente` (no existía) y 4 suites de tests:

| Suite | Tests |
|---|---|
| `useCarritoStore.spec.ts` | 22 |
| `CantidadControl.spec.tsx` | 6 |
| `MenuItemCard.spec.tsx` | 9 |
| `CarritoItem.spec.tsx` | 5 |
| **Total** | **42** |

La configuración de Jest fue **no trivial** por la combinación pnpm monorepo + Expo 53 + Jest 30. Se resolvieron 4 problemas de compatibilidad:
- `rootDir` movido a la raíz del monorepo para resolver el scope check de Jest 30.
- `configFile` explícito en el transform para forzar `babel-preset-expo` en todos los módulos.
- Mock vacío para `expo/src/winter` para evitar el lazy getter que activaba el security check de Jest 30.
- `transformIgnorePatterns` ajustado para la estructura de `node_modules/.pnpm/` de pnpm.

### Tests de sesiones (correcciones) — De Marcos

Se corrigieron las suites de tests existentes para reflejar los cambios del sprint:
- `sessions.service.spec.ts` — actualización de mocks faltantes (MenyuGateway, métodos de Prisma).
- Alineación con los cambios de roles y ownership de los services actualizados.

---

## 12. Decisiones de diseño transversales

| Decisión | Contexto |
|---|---|
| `RolAdmin` como enum PostgreSQL en lugar de String libre | String libre era inconsistente: el mismo rol podía escribirse de tres formas distintas sin error |
| Tabla `AdminRestaurante` como pivot | Un GERENTE puede gestionar múltiples restaurantes; la relación no cabe en un campo simple |
| Subcategorías eliminadas del negocio (tabla conservada en DB) | Simplifica la UI y los endpoints sin necesidad de una migración destructiva |
| `cartStore` en localStorage (web-cliente) | A diferencia del carrito en Expo (memoria), en la web el usuario puede recargar la página accidentalmente |
| Deploy a producción solo via tag semántico | Separa claramente los deploys intencionales de los merges de features |
| Retry logic en Railway y Vercel | Los servicios cloud tienen timeouts de red esporádicos — sin retry, un fallo de red descarta todo el deploy |

---

## 13. Problemas encontrados y resoluciones

### Puerto 5176 de web-cliente no estaba en los origins de CORS

**Síntoma:** requests del frontend de web-cliente al backend eran bloqueados con error CORS.

**Causa:** `main.ts` del backend listaba los puertos de las apps web (5173, 5174, 5175), pero `web-cliente` había sido movida al puerto 5176.

**Resolución:** se actualizó el array de origins en `main.ts` para incluir `http://localhost:5176`.

### CI falló con `TS: Property 'orders' does not exist`

**Síntoma:** el CI en GitHub Actions rechazó el merge de `feat/delta-precio` con un error de TypeScript en `api.ts`.

**Causa:** conflicto de merge pendiente entre la rama de features y `main`. La rama tenía `api.orders.create()` pero `main` tenía una versión anterior del archivo sin ese namespace.

**Resolución:** se resolvió el conflicto de merge actualizando la rama con `main` antes de volver a correr el CI.

### Fallas esporádicas en deploys de Railway y Vercel

**Síntoma:** los deploys fallaban con timeouts de red de forma aleatoria, no relacionados con el código.

**Causa:** los servicios cloud tienen SLAs que no garantizan tiempos de respuesta constantes. Un timeout durante el deploy de Railway o Vercel cancela todo el workflow.

**Resolución:** retry logic con 3 intentos y delay de 30s entre intentos. Las fallas de red son transitorias y el segundo o tercer intento suele tener éxito.

### Vercel CLI 54.7.0 — bug de deploy

**Síntoma:** los deploys de Vercel fallaban sistemáticamente con la última versión del CLI.

**Causa:** bug introducido en `vercel@54.7.0`.

**Resolución:** se fijó la versión del CLI a `vercel@54.6.1` (la anterior al bug) en todos los workflows.

---

*MenYU · De Marcos · Ojeda · Strumia Carrara · 2026*
