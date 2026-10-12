# Contexto — Eliminación del pago por comensal (MenYU)

Documento para retomar el trabajo. Leelo entero antes de tocar código.

---

## Decisión de producto

Se elimina el pago por comensal ("Dividir en dispositivo"). La división de la cuenta queda **solo como generador de mensaje**. El etiquetado de ítems por comensal **se mantiene** porque el mensaje por consumo lo necesita.

## Dónde estamos

**Rama:** `refactor/remove-per-diner-payment`, en `62013da` (= `origin/main`, que ya incluye `feat/cobro-por-comensal`: PR #348 y #349).

**Nada está commiteado.** Todo está en stage, archivo por archivo (nunca `git add -A`). Reglas vigentes: un archivo por vez, diff completo antes de aplicar, nada de commits sin pedirlo, tocar solo lo pedido.

**Alcance hecho:** solo `apps/web-cliente` (más `turbo.json`, ver abajo). Backend y web-staff **todavía no se tocaron**.

> Ojo: el `main` **local** puede estar desactualizado respecto de `origin/main`. Hacé `git fetch` y comparé contra `origin/main`, no contra `main`.

### Cambios en stage (6 archivos, +92 / −646)

| Archivo | Cambio |
|---|---|
| `web-cliente/src/pages/pago/PagarPage.tsx` | Se elimina el submenú "Dividir en dispositivo", la lectura de `?modo=`, `elegirModo`, el `bottomContent` por comensal y `tuParteContent`. La tarjeta pasa a `Total a pagar` fijo (`totalAPagarContent`), el botón dice siempre "Armar mensaje" y abre el modal directo en la vista de mensaje (`modalMensajeAbierto`, booleano). Queda el pago de mesa completa y la entrada al generador. El botón "Partes iguales" navega a `/dividir/cantidad` (sin `?destino=`). |
| `web-cliente/src/store/pagoStore.ts` | **Eliminado** entero. Tras el cambio de `PagarPage` no tenía ningún usuario ni `.spec`. |
| `web-cliente/src/pages/dividir/CantidadComensalesPage.tsx` | Solo queda la rama mensaje: ya no lee `?destino=`, no llama `setCantidadComensales` ni `comensales.listar`, no tiene `congelada`/`confirmando`/`errorConfirmar`/piso dinámico. Arranca en 1 (`CANTIDAD_MIN`), máx. 99, navega a `/dividir/mensaje?cantidad=N`. |
| `web-cliente/src/pages/etiquetado/EtiquetarPedidosPage.tsx` | Se elimina la rama `destino=pagar` (navigate a `/pagar?modo=`, guard de huérfanos, aviso "Faltan etiquetar"). `destino` queda `'mensaje' \| null`. |
| `web-cliente/src/services/api.ts` | Se borran `setCantidadComensales`, `calcularPartesIguales`, `obtenerModoDivision` (sin ningún llamador, verificado por grep). `calcularPorConsumo` y las de etiquetas quedan. |
| `turbo.json` | `"remoteCache": { "enabled": false }` (ver sección Vercel). |

### Lo que NO se tocó (se queda)

`ElegirNombrePage`, `comensalStore`, `useEtiquetado`, `MensajePage`, `api.comensales.calcularPorConsumo`, `api.sesiones.saldo`, y los pagos de mesa completa de `PagarPage` (`handlePagarTodoEfectivo`, `handlePagarTodoMercadoPago`).

### Verificación

`pnpm turbo typecheck build test`: 21/21 tareas OK, 154 tests del backend en verde. Ningún archivo de `web-cliente` quedó sin importador (salvo los dos `*.spec.ts`, que ejecuta vitest).

---

## Pendientes conocidos

1. **Bug de "Por consumo" (a tratar aparte, NO mezclar con el refactor).** El botón "Por consumo" del modal (`PagarPage.tsx`, `navigate('/dividir/mensaje?modo=por_consumo')`) **saltea el etiquetado**. La rama `/etiquetar?destino=mensaje` existe en `EtiquetarPedidosPage` pero **nada navega a ella**. Con cero etiquetas, `MensajePage` no bloquea ni da error: no muestra secciones por persona y lista todos los ítems como "Sin asignar todavía". Es comportamiento previo, no lo introdujo el refactor.
2. **Backend y web-staff:** falta eliminar lo que sostenía el pago por comensal. Inventario completo (con archivo y línea) en el informe de la sesión; resumen:
   - `Pago.comensalId`, la relación `Comensal.pagos`, el `@@unique([sesionId, comensalId])` y la FK `pago_comensal_id_fkey` (`ON DELETE SET NULL`).
   - `PaymentsService`: `cobrarComensal`, `estadoComensales`, `montoParaComensal`, `resolverModoDivision`, `assertSinPagoEnConflicto` y las ramas `comensalId !== null` de `solicitarEfectivo` / `crearPreferenciaMercadoPago`. Endpoints `GET/POST payments/sesiones/:id/comensales[/cobrar]`.
   - `ComensalesService`: `comensalTienePagoAprobado`, `sesionEstaCongelada` (casi todo pierde sentido; `sesionEstaCongelada` solo cubriría cobros parciales manuales), `setCantidadComensales` + endpoint `PATCH cantidad-comensales`, `tienePagoAprobado` de `reclamar`.
   - `DivisionService`: `calcularPartesIguales`, `obtenerModoDivision` + endpoint `division/modo`. **`calcularPorConsumo` y `obtenerSaldo`/`calcularTotalSesion` se quedan** (los usa `MensajePage`).
   - `SesionMesa.modoDivision` y `cantidadComensales`, `Restaurante.divisionPagosHabilitada`.
   - `registrarCobro` (`sessions.service.ts`): la parte que cancela pagos pendientes de comensales.
   - web-staff: `CobroModal.tsx` (lista por comensal, `mostrarLista`, `cobrarComensal`), tipos y llamadas de `api.ts`. web-admin: tipo `pagos[].comensalId` en `PagosPage.tsx`.
3. **Datos existentes (importante para la migración).** La migración `20260722175451_split_pagos_comensales` hizo backfill: **cada `pago` histórico recibió un `Comensal` ficticio llamado `'Invitado'`** (uno por pago) y `comensal_id` no nulo. Al eliminar la columna esos `Comensal` quedan huérfanos de pago, y se pierde la trazabilidad de quién pagó qué en pagos individuales reales. No verifiqué cómo se resolvieron los `'Invitado'` duplicados frente al unique `comensal(sesion_id, nombre_normalizado)` de la migración `20260906183320`. Hay que contar filas por entorno antes de migrar.
4. **API del cliente.** `api.payments.solicitarEfectivo` y `pagarConMercadoPago` siguen recibiendo `comensalId` y `modo`, siempre llamados con `(null, null)`. Cambiar la firma depende del backend. `api.comensales.reclamar` sigue tipando `tienePagoAprobado`, y `divisionPagosHabilitada` sigue en el tipo de respuesta de `calcularPorConsumo`.
5. **Código sin uso en web-cliente, anterior al refactor:** `api.payments.initiate` y `api.comensales.reclamar` no tienen ningún llamador.
6. **Inconsistencia de estados de pedido.** Se escribe `'anulado'` (`pedidos.service.ts:471`), pero los filtros de total usan `estado: { not: 'cancelado' }` (`division.service.ts:103,212`, `sessions.service.ts:274`) y nada escribe `'cancelado'` en un Pedido. Esos filtros no excluyen nada hoy.

---

## Investigación abierta: "$0" en la tarjeta del mozo

**Síntoma:** en local, el mozo ve `$0` en la tarjeta de una mesa activa que tenía pedidos confirmados. El comensal venía del flujo "dividir por consumo" sin etiquetar.

**Qué se confirmó (solo lectura, sin reproducir):**

- **Cadena del número:** `PagosMozo.tsx:88` (`sesion.totalAcumulado`) ← `fetchActivas` (`:132`) ← `api.sesiones.getActivas` (`web-staff/api.ts:362`, `GET /sessions/activas`) ← `SessionsController.getSessionesActivas` (`sessions.controller.ts:91`) ← `SessionsService.getSessionesActivas` (`sessions.service.ts:332-375`).
- **Cálculo:** suma `precioUnitario × (cantidadEditada ?? cantidad)` de **todos** los pedidos de la sesión. **No filtra por estado de pedido** (incluye `pendiente`, `anulado`, etc.). **No depende de etiquetas, comensales ni `modoDivision`**: la query ni los incluye.
- **Estado de un pedido recién confirmado:** `'pendiente'` (`orders.service.ts:68`). Queda dentro del cálculo.
- **Asociación a sesión:** `POST /orders` toma `sesionId`/`mesaId`/`restauranteId`/`clienteId` **del JWT de sesión**, no del body (`orders.service.ts:44`). Exige sesión `activa` (400 si no) y JWT válido de tipo `cliente` (401 si no). No puede crearse un Pedido sin `sesionId`. Sí podría quedar en una sesión distinta de la que mira el mozo si el JWT del comensal es de otra sesión activa; no verifiqué si `sessions.open` impide dos sesiones activas por mesa.
- **La rama no lo causó:** `git diff origin/main...HEAD` está vacío (sin commits propios) y lo staged solo toca web-cliente + `turbo.json`. El código de los puntos anteriores es idéntico al de `origin/main`.
- **`CobroModal`:** `mostrarLista = estado !== null && divisionPagosHabilitada && modoDivision !== null && cantidadComensales !== null`. Con `mostrarLista` verdadero muestra `Total/Cobrado/Saldo` de `GET payments/sesiones/:id/comensales`; con falso muestra `Total a cobrar: sesion.totalAcumulado` (el número de la tarjeta). Con el cliente actual nadie escribe `modoDivision` ni `cantidadComensales` en sesiones nuevas, así que `mostrarLista` es falso; en sesiones viejas que los traigan, las **filas por comensal** muestran `$0` en `por_consumo` sin etiquetas (solo muestran `—` si `monto` es `null`), pero el total del encabezado sigue correcto.

**Candidatos (hipótesis, sin confirmar):**

1. **Tarjeta desactualizada.** `PagosMozo` carga la lista al montar, cada 30 s y tras un cobro. **No escucha `order:new` / `order:updated` / `order:edited`** (solo `sesion:quierePagar` y `sesion:cobrada`), y un fallo del fetch se traga en silencio. Una sesión que se cargó sin pedidos queda en `$0` hasta el próximo polling. Es la única explicación respaldada directamente por el código.
2. **Pedidos en otra sesión** (JWT del comensal de otra sesión activa).
3. **Ítems con `precioUnitario` 0** (p. ej. `precioBase` 0 en datos de prueba).

**Cómo distinguirlos (sin tocar código):** mirar el texto de la misma tarjeta (`"N ítems"`, `PagosMozo.tsx:70`). "0 ítems" apunta a (1) o (2); recargar la pantalla los separa (si aparece el total, era (1)). "N ítems con $0" solo puede ser (3), porque `cantidadItems` también usa `cantidadEditada ?? cantidad`.

---

## Vercel: "No Output Directory named dist found"

**Síntoma:** los deploys de `main` (`62013da`) y de `feat/cobro-por-comensal` (`e7e3c6b`) fallan igual: el build de `@menyu/web-cliente` aparece como `cache hit, replaying logs` (≈750 ms, sin compilar) y después Vercel dice que no encuentra `dist`.

**Qué se descartó:** `turbo.json` declara `outputs: ["dist/**"]`, Vite usa el `dist` por defecto, `tsc -b` no emite (`noEmit`), y los tres `vercel.json` solo tienen rewrites. En local, borrar `dist` y forzar un cache hit lo restaura completo, así que turbo restaura outputs bien.

**Sospecha (no probada):** los workflows de deploy (`deploy-staging.yml`, y presumiblemente producción) corren `turbo build` y después `vercel build` en el mismo job. Ese `vercel build` usa el Remote Cache de Vercel y puede estar escribiendo artefactos desde otro entorno, que luego replayan los builds de Git sin `dist/**`. Efecto secundario sospechado: el `turbo build` previo no tiene las variables `VITE_*` del entorno de Vercel, y si el hash no las distingue el bundle podría reutilizarse sin ellas.

**Cambio aplicado (apuesta, sin confirmar):** `"remoteCache": { "enabled": false }` en `turbo.json`, en stage junto con el refactor. Cada build de Vercel compilaría de cero.

**Cuando se pushee:**
- Si el deploy pasa: era el cache remoto.
- Si sigue fallando: revisar en Vercel → Settings → Build & Development que **Root Directory** sea `apps/web-cliente` y **Output Directory** esté vacío o sea `dist`. Alternativa sin código: Redeploy desmarcando "Use existing Build Cache".
- `turbo.json` conviene separarlo del refactor en su propio commit (`git restore --staged turbo.json` antes de commitear el refactor).

---

## Siguiente paso sugerido

1. Resolver el origen del `$0` (empezar por el candidato 1: recargar y mirar "N ítems").
2. Tratar el bug de "Por consumo" en un cambio aparte.
3. Backend y web-staff: preparar el plan de eliminación (inventario del punto 2 de pendientes + la migración con cuidado del backfill de `'Invitado'`).
4. Decidir cómo commitear lo staged (refactor web-cliente y `turbo.json` por separado).
