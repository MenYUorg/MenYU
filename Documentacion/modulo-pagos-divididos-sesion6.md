# Módulo Pagos Divididos — Sesión 6: `/dividir/cantidad`, `/dividir/mensaje`, pago de mesa completa con Mercado Pago, modal en `PagarPage` y alta/baja de comensales en `EtiquetarPedidosPage`

**Equipo:** De Marcos · Ojeda · Strumia Carrara
**Fecha:** 12-13 de septiembre de 2026
**Rama:** `feat/division-pagos-ui`
**Contexto de arranque:** backend de división de pagos mergeado (PR #345). El frontend de `web-cliente` no tenía nada de lo que describe `Documentacion/contexto-division-pagos.md` todavía: ni las pantallas de `/dividir/*`, ni el modal en `PagarPage`, ni el alta/baja de comensales manuales en `EtiquetarPedidosPage`. Esta sesión construyó los cinco ítems pendientes de ese documento, en orden, con diagnóstico y diseño antes de cada bloque y diff mostrado antes de aplicar (con caídas del propio proceso en el medio — ver §8).

---

## Índice

1. [`/dividir/cantidad` — selector de cantidad](#1-dividircantidad--selector-de-cantidad)
2. [Backend: Mercado Pago con `comensalId: null`, y el agujero de doble cobro](#2-backend-mercado-pago-con-comensalid-null-y-el-agujero-de-doble-cobro)
3. [`/dividir/mensaje` — generador de mensaje](#3-dividirmensaje--generador-de-mensaje)
4. [`PagarPage`: modal "Dividir la cuenta" y pago de mesa completa](#4-pagarpage-modal-dividir-la-cuenta-y-pago-de-mesa-completa)
5. [Bug encontrado y arreglado: "Armar mensaje" con el modo ya fijado pedía la cantidad de nuevo](#5-bug-encontrado-y-arreglado-armar-mensaje-con-el-modo-ya-fijado-pedía-la-cantidad-de-nuevo)
6. [`EtiquetarPedidosPage`: alta/baja de comensales manuales y `?destino=`](#6-etiquetarpedidospage-alta-baja-de-comensales-manuales-y-destino)
7. [Gaps de tipos encontrados y cerrados sobre la marcha](#7-gaps-de-tipos-encontrados-y-cerrados-sobre-la-marcha)
8. [Incidentes de entorno/proceso](#8-incidentes-de-entornoproceso)
9. [Estado de git y qué falta](#9-estado-de-git-y-qué-falta)

---

## 1. `/dividir/cantidad` — selector de cantidad

Nuevo: `apps/web-cliente/src/pages/dividir/CantidadComensalesPage.tsx`, ruteado en `App.tsx` dentro de `ComensalRequiredRoute`.

Diseño acordado en la sesión, con tres correcciones sobre la primera propuesta:

- **El preview de "cada persona paga" usa `Math.max(cantidad, comensalesRegistrados)`** — no la cantidad elegida a secas —, replicando el divisor real que calcula el backend (`Math.max(cantidadComensales, comensales.length)`). Si el usuario elige menos que los comensales ya registrados, se avisa "Se va a dividir entre N porque ya hay M personas registradas" en vez de mostrar un monto que no va a coincidir con lo que se cobra.
- **Número tocable en vez de solo stepper**: tocar el número del medio lo convierte en un `<input type="number">` con foco automático, para no depender de + / − en mesas grandes. Tope duro de 99.
- **Congelamiento se detecta al montar** (`api.sesiones.saldo` da `totalCobrado`), no recién al confirmar: si `destino=pagar` y la sesión ya tiene un pago aprobado, el CTA queda deshabilitado desde el arranque con el aviso, en vez de dejar que el usuario elija y se choque con el 409 al final. El manejo del 409 se deja igual como red para la ventana entre el mount y el submit.

**Bug encontrado en la propia sesión, antes de mergear nada:** con `destino=mensaje`, el valor inicial de `cantidad` se calculaba con `Math.max(comensales.length, 1)` sin mirar el `destino` — heredaba el piso de la rama `pagar` por error de copy-paste del primer borrador. Se corrigió para que en `mensaje` arranque siempre en 1, sin atarse a los comensales registrados (coherente con que esa rama no toca el backend).

**Segundo bug, post-Parte 3 (ver §5):** el divisor efectivo (`Math.max(cantidad, comensalesRegistrados)`) se aplicaba también en la rama `mensaje`, cuando ahí no corresponde — en `mensaje` no hay backend de por medio, es `total/N` puro con el N que el usuario eligió. Se corrigió acotando el `Math.max` a `destino === 'pagar'`.

## 2. Backend: Mercado Pago con `comensalId: null`, y el agujero de doble cobro

`crearPreferenciaMercadoPago` (`payments.service.ts`) exigía `comensalId: string` no nulable y hacía `comensal.findUnique({ where: { id: comensalId } })` sin chequear null — el pago de "mesa completa" con tarjeta era literalmente imposible, rompiendo el caso de uso central de `/dividir/mensaje` ("pago todo yo con tarjeta, después mando el mensaje para que me transfieran").

**Cambios:**
- `crearPreferenciaMercadoPago(sesionId, comensalId: string | null, modo, origin)` — con `comensalId === null`: salta la validación de comensal, usa `saldoPendienteSesion` en vez de `montoParaComensal`, no resuelve ni fija `modoDivision`.
- El `upsert` sobre la unique compuesta `(sesionId, comensalId)` no sirve con `comensalId: null` (Postgres trata cada `NULL` como distinto, la unique no aplica). Se reemplazó, solo para la rama `null`, por `findFirst` + `update`/`create` manual — buscando por `{ sesionId, comensalId: null }` sin filtrar por `metodo`, para replicar a mano la misma invariante "una fila por slot" que la unique le da gratis al caso con comensal real.
- Controller y `api.ts` (`solicitarEfectivo`, `pagarConMercadoPago`) ensanchados a `comensalId: string | null` / `modo: ... | null`.

**Riesgo real encontrado en diseño, antes de escribir código:** `saldoPendienteSesion` solo resta pagos `'aprobado'`, nunca los `'pendiente'`. Si Ana tiene un pago individual pendiente ($2650 de $5300) y alguien pide "pagar toda la cuenta", se crea un segundo pago pendiente por $5300 — si los dos se aprueban, la sesión cobra $7950 sobre una cuenta de $5300. Confirmado que nada río abajo (`confirmarEfectivo`, el webhook de MP) lo frena: ninguno mira pagos `pendiente` antes de aprobar, ninguno chequea si la sesión ya está `cerrada`.

**Fix:** helper `assertSinPagoEnConflicto(tx, sesionId, comensalId)` en `payments.service.ts`, llamado dentro de la misma transacción antes de crear cada pago (en las cuatro ramas: `solicitarEfectivo` y `crearPreferenciaMercadoPago`, con y sin comensal). Bloquea con `409 ConflictException` en las dos direcciones (mesa completa vs. individual) si existe un pago `pendiente` "del otro lado" dentro de una ventana de tiempo reciente:

```ts
private static readonly VENTANA_CONFLICTO_MP_MS = 5 * 60 * 1000
private static readonly VENTANA_CONFLICTO_EFECTIVO_MS = 30 * 60 * 1000
```

Ventanas distintas a propósito: un checkout de MP se resuelve en minutos; un efectivo pendiente espera legítimamente a que el mozo se acerque, y en una mesa llena eso supera los 5 minutos — con una sola ventana corta, el bloqueo se caía solo mientras el problema de fondo seguía ahí.

**Límite aceptado y dejado afuera de esta sesión:** el `findFirst` + `create` para el caso `null` no es atómico como la unique constraint sí lo es para el caso con comensal — dos requests casi simultáneos podrían crear dos filas. Arreglarlo bien necesita un índice parcial (`WHERE comensal_id IS NULL`) y una migración nueva; fuera de alcance.

**Probado con curl contra la base local** (documentado en el chat, no en un archivo aparte): las dos direcciones del bloqueo, y el caso del pendiente envejecido más allá de su ventana dejando de bloquear — incluyendo confirmar que la ventana de MP (5 min) y la de efectivo (30 min) actúan independientes una de la otra.

## 3. `/dividir/mensaje` — generador de mensaje

Nuevo: `apps/web-cliente/src/pages/dividir/MensajePage.tsx`.

**Detección de rama:** por query param, no por inferencia de ausencia. `?cantidad=N` → partes iguales; `?modo=por_consumo` (sin `cantidad`) → por consumo; ninguno de los dos → pantalla de error explícito ("No se pudo determinar cómo armar el mensaje"), en vez de asumir "por consumo" en silencio. Esto fija el contrato que `/etiquetar` tiene que respetar al navegar acá (ver §6).

**Montos:**
- Partes iguales: `saldoPendiente / cantidad` (no `totalSesion` — si ya se cobró algo, no hay que pedir de más).
- Por consumo: los montos por comensal salen de `api.comensales.calcularPorConsumo` (backend, en centavos), nunca calculados a mano en el cliente. Las viñetas por ítem sí llevan precio real (`"1x Provoleta — $2300.00"`, o `"(compartido entre 2)"` si el ítem tiene más de una etiqueta) — el precio es el del ítem completo, no una fracción inventada, así no hay drift con el monto por persona que sí viene del backend.
- Si `totalCobrado > 0`, el mensaje agrega líneas "Ya cobrado" / "Falta cobrar", y en la rama por consumo una advertencia aparte: los montos por comensal de `calcularPorConsumo` son la parte de cada uno sobre el **total**, no descuentan lo que esa persona ya pagó (no hay endpoint que exponga pagos por comensal al cliente — no se inventó uno).
- Huérfanos: bloque `⚠️ Sin asignar todavía ($X)` con la lista de ítems sin etiquetar, para no ocultar plata que nadie está cubriendo.

**Portapapeles:** `navigator.clipboard.writeText` (disponible en `localhost` igual que en HTTPS, por la spec de Secure Contexts) con fallback a `document.execCommand('copy')` sobre un textarea oculto, y si los dos fallan, el mensaje queda visible en un textarea legible para copiar a mano — nunca se miente con un "¡Copiado!" si no se pudo confirmar.

**Pago de mesa completa:** dos botones, **"Pagar toda la cuenta en efectivo"** / **"Pagar toda la cuenta con Mercado Pago"** — nunca "Pagar" a secas, llaman directo a `api.payments.*` con `comensalId: null`, sin pasar por `pagoStore` (que está pensado para "pagar mi parte", con el comensal actual). Deshabilitados desde el mount si `saldoPendiente <= 0`. El 409 de conflicto de la Parte 2 llega acá con su mensaje tal cual. Tras confirmar, la pantalla se queda igual mostrando el estado ("El mozo se va a acercar a la mesa a cobrar el total") — MP sí redirige afuera, como ya hacía `PagarPage`, porque eso es inherente al checkout externo.

**Ajuste de UX post-implementación:** el `<textarea>` con el mensaje tenía `rows` fijo en 12, y con una mesa de 2 por consumo (con compartidos y huérfanos) ya cortaba el mensaje a la mitad, obligando a scrollear dentro del textarea sin verlo. Se subió a 20 filas — el punto de la pantalla es poder leer el mensaje completo antes de copiarlo.

**Bug de red encontrado en la sesión:** `useEtiquetado(sesionId)` se llama con `sesionId=''` a propósito en la rama que no la necesita (partes iguales / inválido), para dejar el hook inerte — pero el hook igual disparaba `GET /api/sesiones//comensales` (doble slash, 404). Se arregló en el hook mismo (§6, es compartido con `EtiquetarPedidosPage`): si `sesionId` es falsy, no llama a nada y queda en `loading:false, error:null`.

## 4. `PagarPage`: modal "Dividir la cuenta" y pago de mesa completa

Reestructuración más grande de la sesión. `PagarPage` tenía un selector de modo **inline** (agregado en trabajo previo a esta sesión) que había que sacar, reemplazándolo por un botón + modal.

**Dos hallazgos antes de escribir código:**

1. **`elegirModo` desde `CantidadComensalesPage` ya era código muerto.** El mount de `PagarPage` llama `resetPago()` — que pisa `modoElegido` a `null` — **antes** de leer nada; como cada navegación a `/pagar` remonta el componente, cualquier `elegirModo(...)` que `CantidadComensalesPage` hubiera seteado antes de navegar se perdía apenas se pintaba la pantalla. Esto ya pasaba con el selector inline (nunca se notó porque el selector volvía a fijar el modo localmente igual) y se iba a heredar tal cual al nuevo flujo si no se tocaba.
   **Fix:** la comunicación entre pantallas pasa a ser explícita por URL: `CantidadComensalesPage` navega a `/pagar?modo=partes_iguales` (en vez de tocar el store y navegar a `/pagar` pelado); `PagarPage` lee `?modo=` en su propio mount, **después** de `resetPago()`, y recién ahí llama `elegirModo`. Mismo contrato para cuando se cablee `/etiquetar` → `/pagar?modo=por_consumo`.
2. **`divisionPagosHabilitada` se pedía y se tiraba.** `cargarDivision` ya llamaba a `calcularPartesIguales`/`calcularPorConsumo`, que ya traen `divisionPagosHabilitada` en la respuesta, pero el store nunca lo guardaba. Se agregó al shape de `PagoStore` y se captura en `cargarDivision`, sin ninguna llamada nueva.

**Diseño final de `PagarPage`:**

- **Nada elegido** (`modoDivision === null && modoElegido === null`): tarjeta "Total a pagar" con `saldoPendiente` (no el total client-side de siempre — ese sigue igual para la tabla de ítems, deuda técnica ya anotada, no tocada). Botón **"Dividir la cuenta"** (o **"Armar mensaje"** directo, saltando el nivel raíz del modal, si `divisionPagosHabilitada` es `false` — un menú de un solo ítem es peor que ningún menú). Botones de pago: **"Pagar toda la cuenta en efectivo"** / **"Pagar toda la cuenta con Mercado Pago"**, `comensalId: null`, directo a `api.payments.*` sin pasar por `pagoStore`, deshabilitados si `saldoPendiente <= 0`.
- **Modo conocido** (`modoDivision ?? modoElegido`): tarjeta "Tu parte" (el título de la tarjeta cambia según el estado — así el monto nunca se ve ambiguo entre "total" y "mi parte") con "División: X" + el monto de `pagoStore`. Botón directo **"Armar mensaje"**. Botones de pago vuelven a "Llamar al mozo para pagar" / "Pagar con Mercado Pago" — sin cambios, siguen pagando la parte del comensal actual vía `pagoStore`.
- **Modal**: overlay inline dentro de `PagarPage.tsx` (mismo patrón visual que ya usa `App.tsx` para `GraciasCard`, sin librería), dos niveles con un solo estado (`menuAbierto: null | 'raiz' | 'dispositivo' | 'mensaje'`).

## 5. Bug encontrado y arreglado: "Armar mensaje" con el modo ya fijado pedía la cantidad de nuevo

Al probar el estado "modo conocido" de `PagarPage`, con `modoActivo === 'partes_iguales'` y divisor real 2, tocar "Armar mensaje" mandaba a `/dividir/cantidad?destino=mensaje` — que arranca en `cantidad = 1` sin mirar nada. Tocar "Continuar" sin más generaba un mensaje "entre 1: $5300.00" mientras la propia `PagarPage`, un scroll más arriba, decía "Tu parte: $2650.00". No hacía falta que el usuario eligiera mal: era el comportamiento por defecto de seguir de largo.

**Fix:** se agregó `divisorPartesIguales` al `pagoStore` (capturado de `calcularPartesIguales().divisor`, mismo patrón que `divisionPagosHabilitada` — el dato ya viajaba en la respuesta, no hizo falta ninguna llamada nueva). Con el modo ya fijado, `irArmarMensaje` navega **directo** a `/dividir/mensaje?cantidad=<divisorReal>`, sin pasar por el selector. El botón "Armar mensaje" queda deshabilitado (mismo tratamiento visual que el resto de los botones deshabilitados de la pantalla) mientras `divisorPartesIguales` sea `null` — evita un botón tocable que no hace nada si `cargarDivision` todavía no terminó.

**Decisión de diseño, no implementada:** llegar a `/dividir/cantidad?destino=mensaje` con el modo ya fijado tipeando la URL a mano (o volviendo con el botón atrás del navegador) sigue mostrando el selector libre, sin blindaje. Evaluado y descartado a propósito: requeriría reacoplar esa pantalla a `pagoStore`/una llamada nueva a `obtenerModoDivision` para un caso de borde que ya no es alcanzable por la navegación normal de la app.

## 6. `EtiquetarPedidosPage`: alta/baja de comensales manuales y `?destino=`

**Alta:** barra de "Comensales" nueva, arriba de la lista de ítems — antes no existía ningún roster visible fuera de los chips repetidos por ítem. Chip **"+ Agregar"** despliega un input inline (máx. 40 caracteres, mismo límite que el backend); llama a `api.comensales.crear(sesionId, nombre, false, comensalIdActual)` — el backend ya soportaba `creadoPorComensalId`, no hizo falta tocar nada del lado del servidor.

**Baja:** solo los chips creados por el comensal actual (`creadoPorComensalId === comensalIdActual`) muestran una "×". Tap → confirmación inline de dos pasos (el chip se convierte en "¿Borrar? ✓ / ✕"), no `window.confirm()` — no se usa en ningún otro lado del código. Los auto-registrados y los creados por otra persona nunca muestran "×", ni siquiera para intentarlo (el backend los rechazaría con 400/403 igual, pero no tiene sentido ofrecer una acción que va a fallar siempre).

**Trace verificado antes de escribir código:** si alguien crea etiquetas manuales, pierde el `sessionStorage` y después reclama su nombre con el PIN, ¿sigue pudiendo borrarlas? Sí — `reclamarComensal` busca por `(sesionId, nombreNormalizado)` y devuelve la fila **existente** (no crea una nueva), así que el `id` que recupera es el mismo que tenía antes; `creadoPorComensalId` de sus etiquetas sigue apuntando a un id válido y suyo. El diseño cierra a nivel de datos. Queda anotado que esto depende de que el futuro reclamo con PIN en `ElegirNombrePage` (ítem 5, sin construir) efectivamente guarde el `id` que devuelve el reclamo — no hay nada que verificar del lado del frontend todavía porque esa pantalla no existe.

**`?destino=` cableado**, cerrando el ítem 3 del documento de contexto:
- `?destino=pagar` → CTA "Continuar" al fondo, navega a `/pagar?modo=por_consumo` — **deshabilitado mientras haya ítems sin etiquetar**, con el mensaje nombrando cuáles (`"Faltan etiquetar: Provoleta, Agua Mineral"`, no solo "etiquetá todos") porque quien se topa con el bloqueo no es necesariamente quien puede resolverlo.
- `?destino=mensaje` → mismo botón, navega a `/dividir/mensaje?modo=por_consumo`, sin bloquear por huérfanos — esa pantalla ya los maneja explícitamente.
- Sin `destino` → sin CTA, la pantalla se comporta exactamente igual que antes de esta sesión.

**Motivo del bloqueo por huérfanos en `destino=pagar`:** si se navegara a `/pagar?modo=por_consumo` con huérfanos pendientes, `pagoStore.cargarDivision` computa `montoPorConsumo = 'no_disponible'` (ya era así desde antes de esta sesión) y los botones de pago quedan deshabilitados **sin ninguna nota explicando por qué** — un callejón sin salida silencioso. Se decidió mostrar el bloqueo antes, en el origen, en vez de dejar que el usuario llegue a una pantalla con botones muertos.

## 7. Gaps de tipos encontrados y cerrados sobre la marcha

`api.ts` no exponía `creadoPorComensalId` en ningún lado (`comensales.listar`, `comensales.crear`, el `comensal` anidado de `listarEtiquetasDeItem`) aunque el backend ya lo devuelve siempre (`findMany`/`create` sin `select`). Sin esto no había forma de saber, en el cliente, qué chips son borrables. Se ensanchó el tipo en los tres lugares, más la interfaz `Comensal` de `useEtiquetado.ts`, y se agregó el cuarto parámetro opcional `creadoPorComensalId?: string` a `api.comensales.crear`.

`useEtiquetado` ganó dos acciones nuevas (`agregarComensal`, `borrarComensal`), mismo patrón que `etiquetar`/`desetiquetar` (llamar API, `await refetch()`), leyendo el comensal actual de `useComensalStore.getState().comensalId` adentro del hook para no cambiar su firma (`useEtiquetado(sesionId)`).

## 8. Incidentes de entorno/proceso

- Docker Desktop estaba apagado al arrancar la sesión; se inició desde la terminal antes de poder levantar Postgres.
- **`TaskStop` reportó éxito matando un `npx nest start` en background, pero el proceso de Node real siguió vivo** ocupando el puerto 3000. Las primeras pruebas curl de la Parte 2 (backend, comensalId null) pegaron contra ese proceso huérfano y dieron resultados inconsistentes (un 500 en la rama de MP, un 201 que no debería haber pasado en la rama de efectivo) — no eran bugs de código, eran dos versiones del proceso respondiendo a la vez. Se resolvió matando el PID a mano vía `taskkill /F` después de encontrarlo con `netstat`; con una instancia limpia las cuatro pruebas de conflicto pasaron correctas. Documentado para no perder tiempo de nuevo si vuelve a pasar.
- La extensión Claude in Chrome no estaba conectada cuando se pidió verificar algo en consola del navegador directamente — no se pudo destrabar desde la sesión, quedó pendiente de que el equipo la revise si hace falta usarla.
- **Proceso de mostrar diffs antes de aplicar:** en el tramo final de la sesión (Parte de `EtiquetarPedidosPage`) se aplicó un cambio con `Edit` antes de mostrar el diff pedido explícitamente, pese a que ya había pasado antes en la misma sesión y a que había una nota de memoria guardada al respecto. Se revirtió el cambio aplicado de más, se reforzó la nota de memoria (`feedback_diff_antes_de_aplicar.md`, en la carpeta de memoria del asistente, fuera del repo) y se repitió el diff correctamente en texto antes de volver a aplicar.

## 9. Estado de git y qué falta

Nada de esta sesión está commiteado (los commits los hace Coty). `git status` al cierre:

```
 M .claude/settings.local.json
 M apps/backend/src/comensales/comensales.module.ts
 M apps/backend/src/comensales/division.service.ts
 M apps/backend/src/payments/payments.controller.ts
 M apps/backend/src/payments/payments.service.ts
 M apps/web-cliente/src/App.tsx
 M apps/web-cliente/src/hooks/useEtiquetado.ts
 M apps/web-cliente/src/pages/entrada/ElegirNombrePage.tsx
 M apps/web-cliente/src/pages/etiquetado/EtiquetarPedidosPage.tsx
 M apps/web-cliente/src/pages/pago/PagarPage.tsx
 M apps/web-cliente/src/services/api.ts
 M apps/web-cliente/src/store/pagoStore.ts
?? apps/backend/src/comensales/sesion-saldo.controller.ts
?? apps/web-cliente/src/pages/dividir/            (CantidadComensalesPage.tsx, MensajePage.tsx)
?? apps/web-cliente/src/theme.ts
```

(`comensales.module.ts`, `division.service.ts`, `ElegirNombrePage.tsx` y `sesion-saldo.controller.ts` venían de sesiones/trabajo previos a esta, no se tocaron en esta sesión.)

`npx tsc --noEmit` pasó limpio en backend y frontend después de cada bloque. No se corrieron tests automatizados nuevos esta sesión (no hay suite para estas pantallas todavía).

| Item | Prioridad |
|---|---|
| Probar en el navegador todo lo construido esta sesión — quedó verificado por lectura de código + curl contra la base local, pero no click a click en la UI (pendiente para la próxima sesión, según lo último que pidió Coty) | Alta |
| Commitear todo lo de esta sesión | Alta |
| Ítem 5 del documento de contexto: reclamo con PIN en `ElegirNombrePage` (si `crearComensal` da 409, revelar campo de PIN) — sigue sin construir | Alta |
| Bloque `web-staff`: el mozo tiene que ver todas las cuentas de la mesa y poder cobrar una sola — sin arrancar | Alta |
| Ventana de carrera del `findFirst`+`create` para pagos con `comensalId: null` (Parte 2) — necesita índice parcial `WHERE comensal_id IS NULL` + migración nueva | Media |
| Los 8+ endpoints de `ComensalesController` siguen sin ningún guard (anotado desde antes de esta sesión, no tocado) | Alta (heredado) |
| `GraciasCard.tsx` con su propia copia de la paleta, fuera de la migración a `theme.ts` (heredado) | Baja |
| El segundo diálogo de `App.tsx` ("Sesión finalizada") sigue siendo código muerto, nunca se dispara (heredado, confirmado de nuevo esta sesión) | Baja |
