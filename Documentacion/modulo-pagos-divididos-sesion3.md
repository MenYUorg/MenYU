# Módulo Pagos Divididos — Sesión 3: endpoint `division/modo` + selector de modo de división en `web-cliente`

**Equipo:** De Marcos · Ojeda · Strumia Carrara
**Fecha:** 6 de agosto de 2026
**Rama:** `feat/divPagos`
**Contexto:** continúa de `modulo-pagos-divididos-sesion2.md` (4-5/8), que dejó el backend fijando `SesionMesa.modoDivision` en el primer intento de pago, pero sin ninguna forma de que el frontend *consultara* ese modo antes de decidir qué mostrar, y con `pagoStore.ts`/`PagarPage.tsx` todavía en el contrato viejo (`pedidoId`+`monto` en vez de `comensalId`+`modo`) — marcado como el ítem de prioridad "Alta" más urgente de esa sesión.

---

## Índice

1. [Qué existía al empezar](#1-qué-existía-al-empezar)
2. [Backend: `GET division/modo`](#2-backend-get-divisionmodo)
3. [Frontend — `api.ts`: `ApiError` + métodos de `comensales` y `payments`](#3-frontend--apits-apierror--métodos-de-comensales-y-payments)
4. [Frontend — `pagoStore.ts` reescrito: estado de división y montos](#4-frontend--pagostorets-reescrito-estado-de-división-y-montos)
5. [Frontend — `PagarPage.tsx` reescrito: selector "Tu parte"](#5-frontend--pagarpagetsx-reescrito-selector-tu-parte)
6. [Verificación](#6-verificación)
7. [Archivos tocados](#7-archivos-tocados)
8. [Estado de git y qué falta](#8-estado-de-git-y-qué-falta)

---

## 1. Qué existía al empezar

`SesionMesa.modoDivision` ya se leía y se fijaba desde `PaymentsService` (Sesión 2), pero:

- No había ningún endpoint para **consultar** ese valor sin pasar por un cálculo de monto — el frontend no tenía forma de saber, antes de mostrar nada, si la sesión ya tenía modo decidido.
- `apps/web-cliente/src/services/api.ts` solo exponía `comensales.crear` — nada de `listar`, `calcularPartesIguales`, `calcularPorConsumo` (existían en el backend desde la Sesión 1, nunca se habían cableado).
- `pagoStore.ts` y `PagarPage.tsx` seguían mandando `{ pedidoId, monto }` al backend, un contrato que `PaymentsController` ya no acepta desde la Sesión 2 (espera `{ comensalId, modo }`) — el flujo de pago estaba roto de punta a punta en el cliente.

---

## 2. Backend: `GET division/modo`

**`apps/backend/src/comensales/division.service.ts`** — nuevo método, mismo patrón que sus dos vecinos (`calcularPartesIguales`/`calcularPorConsumo`):

```ts
async obtenerModoDivision(sesionId: string): Promise<{ modoDivision: 'partes_iguales' | 'por_consumo' | null }> {
  const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: sesionId } })
  if (!sesion) {
    throw new NotFoundException('Sesión no encontrada')
  }
  return { modoDivision: sesion.modoDivision as 'partes_iguales' | 'por_consumo' | null }
}
```

**`apps/backend/src/comensales/comensales.controller.ts`** — nueva ruta `GET 'division/modo'` → `obtenerModoDivision(@Param('sesionId') sesionId: string)`, con su `@ApiOperation`/`@ApiResponse`.

Ruta final: `GET /api/sesiones/:sesionId/comensales/division/modo`.

**Verificado en vivo, no solo con `tsc`:** se levantó el backend con `nest start` (sin `--watch`, para no repetir el incidente de proceso zombie de Windows ya documentado) y se confirmó en el log de arranque:

```
[RouterExplorer] Mapped {/api/sesiones/:sesionId/comensales/division/modo, GET} route
```

y con una request real contra un `sesionId` inexistente:

```json
{"message":"Sesión no encontrada","error":"Not Found","statusCode":404}
```

— confirma que la ruta llega hasta el handler nuevo (no un 404 genérico de "ruta no encontrada"). El proceso se mató por PID real (`taskkill /PID ... /F`) al terminar, no por el wrapper de la shell, para asegurarse de no dejar nada corriendo en el puerto 3000.

---

## 3. Frontend — `api.ts`: `ApiError` + métodos de `comensales` y `payments`

**`ApiError`** (nuevo, exportado): `req()` lanzaba siempre `new Error(message)`, sin exponer el status HTTP. Hacía falta poder distinguir un `400` (ítems sin etiquetar, un estado esperado) de cualquier otro error real para `calcularPorConsumo`. Se agregó:

```ts
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
```

`req()` ahora lanza `ApiError` en vez de `Error` plano. Como `ApiError extends Error`, todo el código existente que hace `e instanceof Error` en el resto de la app sigue funcionando sin tocarlo — cambio aditivo, no rompe nada.

**`comensales`** — se agregaron los tres métodos que faltaban desde la Sesión 1, más el nuevo de hoy:

| Método | Ruta |
|---|---|
| `listar(sesionId)` | `GET /sesiones/:sesionId/comensales` |
| `calcularPartesIguales(sesionId)` | `GET /sesiones/:sesionId/comensales/division/partes-iguales` |
| `calcularPorConsumo(sesionId)` | `GET /sesiones/:sesionId/comensales/division/por-consumo` |
| `obtenerModoDivision(sesionId)` | `GET /sesiones/:sesionId/comensales/division/modo` |

**`payments`** — dos métodos nuevos junto al ya existente `initiate` (que sigue siendo el endpoint muerto marcado en memoria como pendiente de limpiar, no se tocó):

```ts
solicitarEfectivo: (sesionId: string, comensalId: string, modo: 'partes_iguales' | 'por_consumo') =>
  req<{ pagoId: string; sesionId: string; estado: string }>(
    'POST', '/payments/solicitar-efectivo', { sesionId, comensalId, modo },
  ),
pagarConMercadoPago: (sesionId: string, comensalId: string, modo: 'partes_iguales' | 'por_consumo') =>
  req<{ initPoint: string; preferenceId: string }>(
    'POST', '/payments/mercadopago/crear-preferencia', { sesionId, comensalId, modo },
  ),
```

Esto centraliza el manejo de errores de pago vía `ApiError`/`req()` igual que el resto de la app, en vez de duplicar `fetch` + parseo de error a mano en `pagoStore.ts` (que es justamente lo que tenía el archivo viejo).

---

## 4. Frontend — `pagoStore.ts` reescrito: estado de división y montos

Reescritura completa. Estado nuevo:

| Campo | Tipo | Qué representa |
|---|---|---|
| `estado` | agrega `'cargando_division'` a los estados existentes | |
| `modoDivision` | `'partes_iguales' \| 'por_consumo' \| null` | el modo ya fijado en la sesión (viene de `obtenerModoDivision`) |
| `modoElegido` | `'partes_iguales' \| 'por_consumo' \| null` | lo que el usuario actual eligió en pantalla — solo relevante si `modoDivision` todavía es `null` |
| `montoPartesIguales` | `number \| null` | la parte de *este* comensal si se dividiera en partes iguales |
| `montoPorConsumo` | `number \| null \| 'no_disponible'` | ídem por consumo; `'no_disponible'` = hay ítems sin etiquetar (backend devolvió 400), no es un error |
| `miMonto` | `number \| null` | el monto final a cobrar, derivado — ver abajo |

**`calcularMiMonto`** (helper de módulo, no parte del store): `modo = modoDivision ?? modoElegido`, y devuelve `montoPartesIguales`, `montoPorConsumo` (o `null` si es `'no_disponible'`), o `null` si no hay modo todavía. Se recalcula tanto en `cargarDivision` como en `elegirModo`.

**`cargarDivision(sesionId)`**: primero `obtenerModoDivision` (si falla, error real, corta ahí). Después, en paralelo (`Promise.all`), `calcularPartesIguales` y `calcularPorConsumo` — pero el segundo lleva un `.catch()` propio que intercepta específicamente `ApiError` con `status === 400` y lo resuelve a `'no_disponible'` en vez de dejar que rechace el `Promise.all` (cualquier otro status sí se re-lanza y cae en el catch general como error real). De ambos arrays de resultados se busca la entrada de `useComensalStore.getState().comensalId` — el store nunca guarda el array completo, solo el monto de este comensal.

**`elegirModo(modo)`**: setter simple, sin guard explícito — es inerte una vez que `modoDivision` está fijado porque `calcularMiMonto` prioriza `modoDivision` sobre `modoElegido` en la derivación.

**`solicitarEfectivo(sesionId)` / `pagarConMercadoPago(sesionId)`**: nueva firma, sin `jwt`/`pedidoId`/`monto`. Resuelven `comensalId` desde `useComensalStore.getState()` y `modo` desde `modoDivision ?? modoElegido`; si falta cualquiera de los dos, error sin llamar al backend. Usan `api.payments.solicitarEfectivo`/`pagarConMercadoPago` (ver §3) en vez de `fetch` crudo.

**Nota dejada en el código:** el caso `comensalId === null` (pago de la mesa completa, pensado para el flujo del mozo) queda explícitamente sin cablear desde esta pantalla — un comentario en ambos métodos lo marca para no perderlo de vista.

---

## 5. Frontend — `PagarPage.tsx` reescrito: selector "Tu parte"

Se mantuvo toda la estructura visual (header navy, `bottomPanel` fijo, paleta `C`, misma tabla de ítems) y se agregó una sección nueva ("Tu parte") entre la tabla de ítems y el `bottomPanel`:

- **`estadoPago === 'cargando_division'`** → `Spinner` + "Calculando tu parte...".
- **`modoDivision === null`** (nadie decidió el modo todavía) → dos cards tipo radio:
  - "Partes iguales" — siempre seleccionable, muestra `montoPartesIguales`.
  - "Por consumo" — si `montoPorConsumo === 'no_disponible'`, queda deshabilitada (`opacity: 0.5`, `cursor: not-allowed`) con el texto "No disponible: hay ítems sin etiquetar todavía"; si no, muestra el monto y es clickeable.
  - Click en una opción habilitada → `usePagoStore.getState().elegirModo(modo)`. Debajo, si ya hay `miMonto` (el usuario recién eligió), aparece "Total a pagar" grande.
- **`modoDivision !== null`** (ya decidido) → sin selector, solo texto informativo ("División: partes iguales" / "por consumo") + `miMonto` grande y destacado.

El monto que habilita los botones de pago pasó de `total` (de toda la mesa) a `miMonto`: si es `null`, ambos botones quedan `disabled` (opacidad reducida, `cursor: not-allowed`). `handleEfectivo`/`handleMercadoPago` llaman a `usePagoStore.getState().solicitarEfectivo(sesionId)`/`pagarConMercadoPago(sesionId)` — sin `pedidoId` ni `monto`.

**Qué se mantuvo igual, a propósito:** `api.orders.list(jwt)` sigue trayendo todos los pedidos de la mesa para mostrar el desglose completo en la tabla "Cuenta de la mesa" — sigue siendo información de contexto útil, simplemente dejó de ser lo que se paga. `jwt` se sigue usando solo para eso, ya no para pagar. El `useEffect` de montaje ahora depende de `[sesionId]` (antes `[]`) porque además de `resetPago()` dispara `cargarDivision(sesionId)` condicional a que exista `sesionId`.

---

## 6. Verificación

- `npx tsc --noEmit` en `apps/backend` — 0 errores (endpoint nuevo).
- Backend levantado en vivo (`nest start`, sin `--watch`) — ruta confirmada en el log de arranque y con una request real (§2). Proceso terminado por PID explícito al final.
- `npx tsc -b --force` en `apps/web-cliente` — 0 errores tras los tres cambios (`api.ts`, `pagoStore.ts`, `PagarPage.tsx`). Se detectaron y descartaron dos falsos positivos del caché del TS server del IDE en el camino (mismo patrón que ya había pasado con el cliente de Prisma en la Sesión 2) — el `tsc` real en frío siempre dio la palabra final.
- **Nota de tooling:** `npx tsc -b --force` no funciona corrido desde la raíz del monorepo (no hay `tsconfig.json` de referencias ahí, y `npx` termina resolviendo un paquete `tsc` de npm que no tiene nada que ver con TypeScript). Hay que correrlo scoped a cada app (`apps/backend`, `apps/web-cliente`), que sí tienen su propio `tsconfig.json` y `typescript` como devDependency.
- No hubo testing e2e real contra staging en esta sesión (a diferencia de la Sesión 1) — todo lo de hoy se verificó con tipos + la ruta backend en vivo, no con un flujo de pago completo de punta a punta.

---

## 7. Archivos tocados

| Archivo | Cambio |
|---|---|
| `apps/backend/src/comensales/division.service.ts` | +`obtenerModoDivision` |
| `apps/backend/src/comensales/comensales.controller.ts` | +`GET division/modo` |
| `apps/web-cliente/src/services/api.ts` | +`ApiError`; +`comensales.listar/calcularPartesIguales/calcularPorConsumo/obtenerModoDivision`; +`payments.solicitarEfectivo/pagarConMercadoPago` |
| `apps/web-cliente/src/store/pagoStore.ts` | reescrito completo — estado de división, `cargarDivision`, `elegirModo`, `solicitarEfectivo`/`pagarConMercadoPago` con nueva firma |
| `apps/web-cliente/src/pages/pago/PagarPage.tsx` | reescrito completo — sección "Tu parte", botones atados a `miMonto` |

---

## 8. Estado de git y qué falta

**Nada de esto está commiteado todavía** — los cinco archivos de la tabla de arriba están modificados sin commit al cierre de esta sesión (`git status` limpio de conflictos, sin nada pendiente de pull: se bajó el merge `76d2a63` que había quedado atrasado en la Sesión 2).

| Item | Prioridad |
|---|---|
| **Commitear y pushear** lo de esta sesión — sigue sin commit | Alta |
| **Probar el flujo completo end-to-end** (elegir nombre → ver "Tu parte" → elegir modo → pagar) contra el backend real, con más de un comensal en la misma sesión — nada de esto se probó en vivo todavía, solo tipos + la ruta nueva aislada | Alta |
| **UI de etiquetado de ítems por comensal** (pendiente desde Sesión 2) — sigue sin la cual `calcularPorConsumo` va a devolver `'no_disponible'` siempre en la práctica, para cualquier sesión real | Alta |
| **Tests automatizados** (pendiente desde Sesión 1) — sigue sin ninguno | Alta |
| **Caso `comensalId === null`** (pago de mesa completa desde el flujo del mozo) — marcado con comentario en `pagoStore.ts`, sin cablear desde ninguna pantalla | Media |
| **Guards en `ComensalesController`** (pendiente desde Sesión 1) — sigue sin auth propia | Media |
| **Drift de `sesion_mesa.cliente_id`** (pendiente desde Sesión 1) — sin resolver | Media |
