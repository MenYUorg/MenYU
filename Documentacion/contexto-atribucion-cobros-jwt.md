# Contexto — Atribución de cobros desde el JWT (MenYU, issue #356)

Documento para retomar el trabajo. Leelo entero antes de tocar código.

---

## Problema

Issue **#356** (`[S13] Caja: atribución confiable de cobros`), prerrequisito del módulo de caja: el responsable de un cobro lo decidía el cliente.

- `confirmarEfectivo` no validaba acceso al restaurante: cualquier staff autenticado podía confirmar el pago de otro restaurante conociendo el `pagoId`.
- `confirmarEfectivo` y `registrarCobro` guardaban el `mozoId` que venía en el body, sin validar que existiera ni que fuera del restaurante (un id inexistente rompía la FK `pago.mozo_id` con un 500; uno de otro local se guardaba igual).
- Si cobraba un admin, no quedaba ningún rastro estructurado de quién fue.
- `GET /payments/sesiones` tampoco validaba acceso al `restauranteId` pedido.

> El issue también nombra `cobrarComensal`: ya no existe (lo eliminó la migración `20261012212600_eliminar_pago_por_comensal`), ese punto quedó obsoleto.

## Regla vigente

La autoría **sale del JWT**, nunca del body. Un único helper la decide: `resolveCobroAtribucion` (`apps/backend/src/common/resolve-cobro-atribucion.ts`), compartido por `SessionsService.registrarCobro` y `PaymentsService.confirmarEfectivo`.

| Quién llama | `mozoId` guardado | `adminId` guardado |
|---|---|---|
| **Mozo** | Siempre `user.sub`. El `mozoId` del body se ignora (ni se consulta la base). | `null` |
| **Admin** (ROOT / OWNER / GERENTE) | `body.mozoId` solo si viene **y** el mozo existe (si no: **400**) **y** es del restaurante de la sesión (si no: **403**). Si no viene (`undefined`, `null` o `''`): `null`. | Siempre `user.sub` |
| Otro `tipo` (p. ej. `cliente`) | — | 403 (guard defensivo; los controllers ya limitan a `admin`/`mozo`) |

El helper asume que el acceso al restaurante ya se validó con `assertStaffAccess`. En `registrarCobro` se resuelve **antes** de abrir la transacción: un `mozoId` inválido no deja nada a medias.

## Dónde estamos

**Rama:** `fix/356-mozo-id-desde-jwt`, **pusheada** a `origin` (con upstream). **No hay PR abierto todavía** (se abre desde `https://github.com/MenYUorg/MenYU/pull/new/fix/356-mozo-id-desde-jwt`).

**Base:** `7dc4888` (merge del PR #366, `feat/discovery`). Tres commits, cada uno compila y pasa tests por sí solo:

```
ba387a0 refactor(frontends): cobros atribuidos desde el JWT
e60828e feat(pagos): atribución de cobros desde el JWT
c158a79 fix(payments): valida acceso en confirmarEfectivo y getSesiones
```

### A — `c158a79` fix(payments): valida acceso en confirmarEfectivo y getSesiones

| Archivo | Cambio |
|---|---|
| `payments/payments.controller.ts` | `confirmarEfectivo` y `getSesiones` reciben `@CurrentUser() user: JwtPayload`. `confirmarEfectivo` ya no acepta `mozoId` en el body (`{ pagoId }`). |
| `payments/payments.service.ts` | `confirmarEfectivo(pagoId, user)`: carga `pago → sesion → mesa.restauranteId` y llama `assertStaffAccess` antes de la transacción (si el pago no existe o no es efectivo sigue siendo 404, antes del 403). `getSesiones(restauranteId, user)`: `assertStaffAccess` sobre el restaurante pedido y **400 `restauranteId requerido`** si falta. En este commit `confirmarEfectivo` guardaba `user.sub` solo si era mozo (provisorio, lo reemplaza B). |
| `payments/payments.service.spec.ts` | Tests de 403 para ambos, de 400 sin `restauranteId`, y de qué `mozoId` se guarda. |

Por qué el 400 en `getSesiones`: sin `restauranteId`, Prisma ignora el filtro `mesa: { restauranteId: undefined }` y un ROOT listaría las sesiones de **todos** los restaurantes.

### B — `e60828e` feat(pagos): atribución de cobros desde el JWT

| Archivo | Cambio |
|---|---|
| `prisma/schema.prisma` | `Pago.adminId String? @map("admin_id")`, relación `admin Admin? @relation(..., onDelete: SetNull)` y `Admin.pagos Pago[]`. |
| `prisma/migrations/20261014222232_add_admin_id_to_pago/migration.sql` | Ver abajo. |
| `common/resolve-cobro-atribucion.ts` (+ `.spec.ts`) | El helper de la regla. |
| `sessions/sessions.service.ts` | `registrarCobro` usa el helper y guarda `mozoId` + `adminId` (tanto al reutilizar el efectivo pendiente como al crear un pago nuevo). `getSessionesPagadas`: `cobradoPorNombre = pago.cobradoPorNombre ?? pago.mozo?.nombre ?? pago.admin?.email` (se incluye `admin: { select: { email } }`). |
| `payments/payments.service.ts` | `confirmarEfectivo` usa el helper y escribe `mozoId` y `adminId`. |

Migración (generada con `prisma migrate diff` contra una base Docker descartable con todas las migraciones aplicadas; luego `migrate deploy` en Docker y `migrate diff` Docker-vs-schema dio vacío):

```sql
-- AlterTable
ALTER TABLE "pago" ADD COLUMN     "admin_id" TEXT;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Columna nullable, sin backfill: los cobros históricos quedan con `admin_id = NULL`. Es segura sobre datos existentes.

> `Admin` **no tiene columna `nombre`** (solo `email`). Por eso la lectura cae a `admin.email`, consistente con el front, que muestra `nombre ?? email`.

### C — `ba387a0` refactor(frontends): cobros atribuidos desde el JWT

| Archivo | Cambio |
|---|---|
| `web-staff/src/components/CobroModal.tsx` | Se elimina el selector "Mozo / Gerente (yo)" (el `<select>` de mozo no tenía ninguna opción, así que el gerente solo podía usar "Gerente (yo)"). `CobradoPor` pasa a `{ modo: 'mozo' } \| { modo: 'gerente'; gerenteNombre }`. El bloque "Cobrado por" del gerente es un chip informativo, visible con cualquier método (antes se ocultaba en MP por la etiqueta). Ya no se envía `mozoId` ni `cobradoPorNombre` (tampoco la etiqueta `'Mercado Pago'`: el método ya figura al lado en los listados). |
| `web-staff/src/pages/mozo/PagosMozo.tsx`, `pages/gerente/PagosGerente.tsx` | Nuevos valores de `cobradoPor`. |
| `web-staff/src/services/api.ts` | `registrarCobro` sin `mozoId` en el body. |
| `web-admin/src/services/api.ts` | Se elimina el wrapper huérfano `pagos.confirmarEfectivo` (mandaba `{ sesionId }` cuando el backend espera `pagoId`, y no tenía ningún llamador). |

**Lo que NO se tocó:** el modal de cobro de `web-admin` (`PagosPage.tsx`) sigue mostrando el selector "Mozo que cobró" y mandando `mozoId`: es el caso admin que atribuye a un mozo, ahora validado por el backend.

## Verificación

- **Backend:** `pnpm typecheck` limpio; jest 23/23 suites, **576/576 tests** (antes 558; +18 nuevos). `prisma generate` OK, `migrate deploy` OK en Docker, `migrate diff` Docker-vs-schema: "No difference detected".
- **web-staff:** typecheck limpio, 28/28 tests, build OK.
- **web-admin:** typecheck limpio, 293/293 tests, build OK.
- **Tests nuevos del backend:**
  - Helper (6 casos): mozo sin/ con `mozoId` ajeno (se guarda el propio y no se consulta la base); admin sin `mozoId` (`undefined`/`null`/`''`); admin con mozo del restaurante; mozo inexistente → 400; mozo de otro restaurante → 403.
  - `registrarCobro` (6): mozo de otro restaurante → 403 sin tocar pagos; mozo con `mozoId` ajeno → se guarda el propio; admin sin/ con `mozoId`; efectivo pendiente reutilizado lleva la misma atribución; `mozoId` inválido falla antes de abrir la transacción.
  - `confirmarEfectivo`: mozo de otro restaurante → 403 sin transacción; mozo → `mozoId = sub, adminId = null`; admin → `adminId = sub, mozoId = null`.
  - `getSesiones`: mozo de otro restaurante → 403; sin `restauranteId` → 400; mozo propio → lista filtrada.
  - Lectura: `cobradoPorNombre` > `mozo.nombre` > `admin.email`, y el `include` trae al admin.

### Nota de entorno (para correr los tests de frontends)

La primera corrida de `web-staff` / `web-admin` falló por el entorno, no por el código: `packages/types/dist` estaba desactualizado (faltaban `LogoResponse`, `UpdateItemDescuentoRequest`, `qrBaseUrl`…) y no estaba instalado `@testing-library/jest-dom`. Se resuelve con:

```bash
pnpm install --frozen-lockfile
pnpm --filter @menyu/types build
```

`@menyu/types` se consume desde `dist/`, así que hay que reconstruirlo cuando cambian los tipos.

---

## Pendientes conocidos

1. **Abrir el PR** de `fix/356-mozo-id-desde-jwt` contra `main`. No se creó.
2. **`cobradoPorNombre`:** el campo se queda (decisión tomada), pero nada del front lo envía ya. Sigue en el schema y en `RegistrarCobroDto`. El último punto del #356 ("evaluar si hace falta") queda abierto: eliminarlo implicaría tocar el DTO, la lectura de `getSessionesPagadas` y una migración.
3. **Listado por pago sin fallback.** En `getSessionesPagadas`, el arreglo `pagos[]` de cada sesión sigue devolviendo `cobradoPorNombre: p.cobradoPorNombre` crudo (sin caer a mozo/admin); solo el nombre "principal" de la sesión de un único pago usa el fallback. Una sesión con varios pagos devuelve `metodoPago: 'mixto'` y `cobradoPorNombre: null`.
4. **Cliente viejo cacheado:** un `web-staff` anterior que aún mande `mozoId` en modo mozo no rompe nada (el backend lo ignora). Un `web-staff` anterior en modo gerente con la opción "Mozo" no podía seleccionar mozo de todos modos (el `<select>` estaba vacío).
5. **`web-admin`: `api.pagos.listSesiones` no tiene llamadores** (el grupo `pagos` quedó con solo esa función). No se tocó porque no estaba en el alcance; con el nuevo chequeo, quien la use debe pasar un `restauranteId`.
6. **`POST /payments/confirmar-efectivo` no tiene ningún llamador en los frontends.** El cobro efectivo se hace por `PATCH /sessions/:id/cobro`, que reutiliza el efectivo pendiente. El endpoint queda protegido y atribuido, pero sin uso aparente.
7. **Lint de `web-staff` y `web-admin`:** `eslint . --max-warnings 0` falla por 3 warnings de la carpeta generada `coverage/` (`sorter.js`, "Unused eslint-disable directive"), ajenos a este trabajo.
8. **Deploy:** hay una migración nueva (`add_admin_id_to_pago`). El `Dockerfile` del backend corre `prisma migrate deploy` al arrancar, así que se aplica sola en Railway.

---

## Investigación descartada: "las sesiones de mesa se cierran solas"

Antes de este trabajo se investigó (solo lectura) por qué las sesiones se cerraban en ~1,5 min sin pagar. **Se descartó: fue un error de uso.** Resultado técnico, por si sirve más adelante:

- No hay jobs ni crons (`@Cron`, `@Interval`, `ScheduleModule`, `setInterval`) ni lógica de sesión expirada en el backend; el JWT de sesión dura 12 h y `handleDisconnect` del gateway solo hace `console.log`.
- `web-cliente` nunca llama a `/sessions/close`.
- Con el backend local se verificó: una sesión abierta por la API permaneció `activa` 2 min 41 s sin ningún cierre.
- Lo que sí quedó confirmado: `POST /sessions/close` (JWT de comensal) y `POST /sessions/mesa/:id/cerrar` (admin/mozo) **cierran sin verificar pagos**.
