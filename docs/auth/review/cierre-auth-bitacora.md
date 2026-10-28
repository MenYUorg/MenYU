# Bitácora del cierre de auth

Memoria compartida del plan `plan-cierre-auth.md`. Cada trabajador, al terminar su etapa, anota acá:
qué hizo, qué decisiones tomó y por qué, qué no hizo y por qué, y qué dejó para la sesión de limpieza.
El trabajador siguiente la lee antes de empezar. Nadie borra entradas anteriores.

## Etapa 1 — /check-in de web-cliente

Rama `chore/cierre-auth`, sobre `main` en `94fe19f`. Solo web-cliente; backend, `useEntrarAMesa` y
`services/api.ts` sin tocar.

**Hecho**

1. El `restaurantId` del QR viaja en `POST /sessions/open`, y el backend tira el 409 si la mesa es de otro
   restaurante (`sessions.service.ts:797-798`, ya estaba).
   - `apps/web-cliente/src/pages/entrada/CheckInRedirectPage.tsx:45`: `abrirLaMesa` manda
     `{ qrToken, restauranteId }` (o solo `{ qrToken }` si el link no trae restaurante). La usan el efecto
     (`:53`) y "Reintentar" (`:63`). Como `useEntrarAMesa` guarda lo que recibió, la pantalla del código
     del modo seguro también lo reenvía.
   - `apps/web-cliente/src/utils/qr.ts:22`: `leerQrDeMesa(raw)` da el código (con `extractQrToken`, sin
     cambios) y el `restaurantId` del link; un código suelto o un `restaurantId` vacío van sin restaurante.
   - `apps/web-cliente/src/pages/discovery/DiscoveryPage.tsx:77`: el escáner usa `leerQrDeMesa`.
2. Con `tableCode`, `/check-in` siempre llama a `entrar()`, aunque haya un `menyu_sesion_id` guardado
   (`CheckInRedirectPage.tsx:52-57`). El atajo al `/menu` con el id guardado queda solo para el link sin
   `tableCode`, que se comporta igual que antes (`CheckInRedirectPage.spec.tsx:100-123`, sin cambios).
   No se manda el `codigoSesion` guardado.
3. Tests:
   - `utils/qr.spec.ts:25-37`: con link y con código suelto o restaurante vacío.
   - `CheckInRedirectPage.spec.tsx`: `:45` reenvía el restaurante; `:56`, un link sin restaurante va
     solo con el código. `:73-98` reemplaza al viejo "si ya hay una sesión abierta va directo al menú sin
     abrir otra": con un `sesionId` y un `codigoSesion` guardados igual abre, sin el código, y queda en la
     sesión nueva; y si el open falla muestra el fallo en lugar del menú. Además, `:310` y `:394` ahora
     esperan el `restauranteId`.
   - `DiscoveryPage.spec.tsx`: `:365` reenvía el restaurante del link; `:377`, el 409 avisa y no va al
     menú.

**Decisiones**

- Punto 2, **opción A (que el `open` decida)**, decidida por el usuario. La opción B no se puede:
  `GET /sessions/mesa/:mesaId/activa` es `@Personal()` y el comensal no tiene ese token. El `open` ya hace lo
  que hace falta: con la sesión viva devuelve el mismo `sesionId` y con la sesión cerrada abre otra. Y no
  hay carrera, porque no hay un chequeo antes del `navigate` en el que la sesión se pueda cerrar.
- **Sin el `codigoSesion` guardado en ese `open`:** con una sesión nueva en modo seguro, el código viejo
  daría un 403 ("Código de sesión incorrecto"), y `estadoDelFallo(403)` lo mostraría como "restaurante dado
  de baja". Se acepta que, al volver a escanear la propia sesión viva en modo seguro, aparezca la pantalla
  del código.
- **Matiz al punto 2:** "con la sesión viva, unirse no cambia nada" vale solo **con cuenta**. Sin cuenta,
  `resolveClienteId` (`sessions.service.ts:755-762`) crea un `Cliente` "Invitado" nuevo en cada `open`, y
  `:236-245` lo suma como participante. El `sesionId` es el mismo, así que la decisión se sostiene, pero hay
  efectos (ver "Para la sesión de limpieza"). Escanear desde Discovery o desde `IngresoMesaPage` ya hacía
  esto; ahora `/check-in` hace lo mismo.
- **`esAnfitrion` al volver a unirse:** no depende de la cuenta. Toda unión a una sesión viva devuelve
  `esAnfitrion = esAnfitrionDeStaff` (`sessions.service.ts:234`), que es `false` en una sesión abierta por un
  cliente, con cuenta o sin ella: el anfitrión que vuelve a escanear queda con `esAnfitrion: false`. Hoy no
  se nota: solo lo lee `ElegirNombrePage` (`:30,45`), que no aparece si el comensal ya existe.
- `leerQrDeMesa` es una función aparte y `extractQrToken` no cambia: `IngresoMesaPage.tsx:89` la usa con el
  restaurante de la ruta, no con el del link.

**No aplica / no hecho**

- Ningún punto quedó como "no aplica": los diagnósticos seguían vigentes sobre `94fe19f`: `CheckInRedirectPage.tsx:46-50,56` y
  `DiscoveryPage.tsx:74-77`, como decía el plan.
- Probado solo con tests unitarios. No hubo prueba en el navegador ni contra staging.
- **C6 (M25) queda resuelto solo en parte.** `/check-in` ya no deja a la persona en una sesión muerta: el
  `open` abre una nueva. Pero esa sesión nueva hereda el `menyu_comensal_id` de la vieja, y las operaciones
  de comensal quedan rotas para esa persona (detalle en la segunda entrada "(Etapa 1)" de limpieza). La
  Etapa 5 lo tiene que tener en cuenta al cerrar C6. Arreglarlo es tocar `sessionStore` o el backend de
  comensales, y eso queda fuera del alcance de esta etapa.

**Para la sesión de limpieza:** son las dos entradas "(Etapa 1)" del bloque general, al final.

**Verificaciones** (antes del commit)

- `pnpm typecheck`: exit 0, `Tasks: 10 successful, 10 total`.
- `pnpm lint`: exit 0, `Tasks: 9 successful, 9 total`. En `@menyu/api` el lint dice "lint pendiente": no
  está configurado, no es de esta etapa.
- `pnpm --filter @menyu/web-cliente test`: exit 0, `Test Files 41 passed (41)`, `Tests 757 passed (757)`.
  Los avisos de `act(...)` de `DiscoveryPage.spec.tsx` ya estaban: el test nuevo da 3, igual que el que ya
  existía para el fallo del QR.
- `pnpm prisma generate`: no hizo falta, no se tocó el backend.

## Etapa 2 — Carga diferida + JWT fuera del repo

(pendiente)

## Etapa 3 — Documentación

(pendiente)

## Etapa 4 — Release Fase 5 (preparación)

(pendiente)

## Etapa 5 — Cierre

(pendiente)

## Para la sesión de limpieza

- `.claude/settings.json` tiene más entradas obsoletas además de la de `verify-carrito.mjs`: rutas de
  otra máquina (`c:/Users/marga/...`) y un curl con un UUID de restaurante (línea 6). (Detectado por el
  planificador, 2026-10-27.)
- (Etapa 1) **Volver a escanear sin cuenta, con la sesión viva, suma un "Invitado" de más.**
  `POST /sessions/open` crea un `Cliente` "Invitado" en cada llamada (`sessions.service.ts:760`) y lo agrega
  como participante (`:236-245`). Efectos:
  - `cantidadPersonas` sube en uno ("N pers." en `web-staff/.../PagosMozo.tsx:70`).
  - El JWT nuevo tiene otro `sub`, así que los pedidos siguientes quedan a nombre de otro `clienteId`.

  (`esAnfitrion: false` al volver a unirse no es de esta entrada: pasa con cuenta o sin ella, ver Decisiones
  de la Etapa 1.)

  Pasaba al escanear desde Discovery y desde `IngresoMesaPage`; desde la Etapa 1 también desde
  `/check-in`. Una solución posible: que el `open` reconozca al participante por el JWT de mesa que ya
  tiene. Eso toca backend y `services/api.ts`.
- (Etapa 1) **Una sesión nueva hereda el carrito y el comensal de la anterior.** Cuando el `open` abre una
  sesión nueva porque la guardada se había cerrado, `openSession` (`web-cliente/src/store/sessionStore.ts:50-72`)
  no vacía el carrito (persistido, `carritoStore.ts:40`) ni el `comensalStore` (`sessionStorage`,
  `comensalStore.ts:18-19`). La sesión nueva arranca con el carrito y el comensal de la vieja.

  Consecuencia concreta: se conserva el `menyu_comensal_id` viejo. `ComensalRequiredRoute` deja pasar sin
  pedir el nombre, porque hay un `comensalId`. Pero el backend rechaza las operaciones de comensal con ese id
  (`comensales.service.ts:184-187`, 404 "Comensal no encontrado en esta sesión"), así que para esa persona
  quedan rotos:
  - etiquetar y desetiquetar ítems (`:120`, `:148`);
  - borrar comensales (`:72`);
  - la división por consumo, que busca su parte por `comensalId` (`MensajePage.tsx:181`).

  `App.tsx` limpia solo si se dan dos cosas: que llegue `sesion:cerrada` o `sesion:cobrada` por el socket
  (`:49-54`, que muestra la tarjeta de Gracias) y que la persona toque "Salir" en esa tarjeta, que llama a
  `clear()` (`:85`). Si el socket estaba caído, o la persona no tocó "Salir", el id viejo queda guardado.
  (`handleAceptar`, `:64`, también llama a `clear()`, pero nada pone `sesionCerrada` en `true`.)

  Pasa en todos los ingresos, no solo en `/check-in`. Por esto C6 (M25) queda resuelto solo en parte (ver
  "No aplica / no hecho" de la Etapa 1). No lo probé de punta a punta.
