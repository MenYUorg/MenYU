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

Rama `chore/cierre-auth`, sobre `897bab7` (Etapa 1). Solo configuración de ESLint de las tres apps, un spec en
web-cliente, los dos `verify-carrito.*` y una línea de `.claude/settings.json`.

**Hecho**

1. La regla de la carga diferida, en `apps/web-cliente/eslint.config.js`:
   - `:36` `@typescript-eslint/no-restricted-imports` con `allowTypeImports: true` sobre `@menyu/auth-client` y
     `@supabase/supabase-js` (`:9`): prohíbe el import de valor (y el `export … from`) en **todos** los archivos,
     también en `authClientDiferido.ts`. Los `import type` pasan.
   - `:43` `no-restricted-syntax` con el selector `ImportExpression[source.value='…']` para los mismos dos
     paquetes: ataja el `import()` dinámico, que la regla de arriba no mira.
   - `:53-56` la excepción declarada: un bloque con `files: ['src/utils/authClientDiferido.ts']` apaga solo
     `no-restricted-syntax`. Es el único archivo que puede hacer el `import()` (`authClientDiferido.ts:16`).
   - Antes de escribirla, grep en `apps/web-cliente`: el único import de valor era ese `import()`; el resto es
     `import type` (`utils/cuenta.ts:1`, `hooks/useSesionDiferida.ts:1-2`, `test/authClient.ts:1`), tipos
     `typeof import(…)` (`useSesionDiferida.ts:32`, `test/authClient.ts:144,147`, que son `TSImportType` y la
     regla no toca) y el string de `vi.mock` (`test/setup.ts:6`). Nada de eso cambió.
   - Prueba a mano (revertida antes del commit): un `src/utils/pruebaCarga.ts` con imports de valor de los dos
     paquetes, dos `import type` y dos `import()`, más un import de valor agregado en `authClientDiferido.ts`.
     `eslint` dio 5 errores (los tres estáticos, uno de ellos en `authClientDiferido.ts:2`, y los dos `import()`);
     los `import type` y el `import()` del cargador, ninguno.
   - Test: `apps/web-cliente/src/utils/authClientDiferido.spec.ts` corre `ESLint.lintText` con la config de la
     app. `:19` deja pasar los `import type` y el `import()` del cargador; `:31` ataja los dos imports de valor (en
     una página y en `authClientDiferido.ts`) y el `import()` en otro archivo. Con la config de `897bab7` el
     segundo test falla (`expected [] to deeply equal [ …(2) ]`).
     Reforzado tras la revisión: el `import()` de `@supabase/supabase-js` también, y en `src/utils/cuenta.ts`, para
     que pongan el spec en rojo sacar ese selector o ampliar la excepción a `src/utils/**` (probadas las dos a mano).
2. `git rm` de `verify-carrito.js` y `verify-carrito.mjs` (raíz) y borrada la entrada
   `"Bash(node verify-carrito.mjs)"` de `.claude/settings.json` (era la `:7`; el resto del archivo, igual, y
   sigue siendo JSON válido). `git grep verify-carrito` después: solo menciones históricas en
   `docs/auth/review/auth-review-2026-10-27.md` (`:321,427,655,934`), `docs/calidad/bitacora.md` (`:35,72`),
   esta bitácora (primera entrada de limpieza) y el plan; ninguna funcional.
3. `'coverage'` en el `ignores` de `apps/web-admin/eslint.config.js:8`, `apps/web-staff/eslint.config.js:8` y
   `apps/web-cliente/eslint.config.js:17`. Con una copia del `coverage/` real de web-auth en cada app, antes del
   cambio `eslint . --max-warnings 0` daba exit 1 en las tres ("3 problems (0 errors, 3 warnings)", los "Unused
   eslint-disable directive" de `lcov-report/*.js`); después, exit 0 en las tres. Las copias se borraron.

**Decisiones**

- **La regla estática no exceptúa a `authClientDiferido.ts`; la excepción es la del `import()`.** Apagar
  `no-restricted-imports` en ese archivo sería una excepción de nombre (la regla no mira `import()`) que dejaría
  sin control el archivo donde un import estático es más tentador. Así la excepción está declarada y cubre justo
  lo que tiene que cubrir, y "único punto de carga" lo chequea el lint, no solo la costumbre.
- **Un spec que corre ESLint**, aunque el plan pedía solo correr el lint: la regla es la protección, y si alguien
  la sacara de la config nada se pondría en rojo. El `cwd` es la raíz de la app, con `dirname` y `resolve` sobre
  `import.meta.url`, así no depende de desde dónde se corra. No uso `new URL('../..', import.meta.url)`: Vite lo
  reescribe como la URL de un asset y deja de ser `file:`.
- `paths` con los dos nombres exactos, sin `patterns`: `@menyu/auth-client` exporta solo `"."` y web-cliente no
  usa subrutas de supabase-js. `@supabase/ssr` no va: no es dependencia de web-cliente.

**No aplica / no hecho**

- Ningún punto quedó como "no aplica": los tres diagnósticos seguían vigentes sobre `897bab7`.
- **El JWT sigue en la historia de git** (repo público): sacarlo pide reescribir la historia y un `--force`,
  fuera de las reglas. Según `docs/calidad/bitacora.md:35` es de desarrollo, apunta a `localhost`, sin datos
  personales, y venció el 26/05/2026.
- La regla mira los archivos de web-cliente, no los paquetes que importa: si `@menyu/ui` (u otro del workspace)
  importara `@menyu/auth-client` de forma estática, el lint no lo vería. Hoy ninguno lo hace (grep en
  `packages/ui` y `packages/types`: vacío). Ver limpieza.
- Sin `vite build` ni prueba en el navegador: no cambió código de la app, solo config de lint y un spec.

**Para la sesión de limpieza:** son las dos entradas "(Etapa 2)" del bloque general, al final.

**Verificaciones** (antes del commit, con el spec ya escrito)

- `pnpm typecheck`: exit 0, `Tasks: 10 successful, 10 total` (`@menyu/web-cliente:typecheck: cache miss`).
- `pnpm lint`: exit 0, `Tasks: 9 successful, 9 total`. Con la config nueva, las tres apps corrieron sin cache
  (`@menyu/web-admin:lint`, `@menyu/web-staff:lint` y `@menyu/web-cliente:lint: cache miss, executing`); en la
  segunda corrida, con el spec, web-cliente volvió a correr y web-admin y web-staff repitieron ese mismo hash.
  `@menyu/api` sigue con "lint pendiente", como en la Etapa 1.
- `pnpm --filter @menyu/web-cliente test`: exit 0, `Test Files 42 passed (42)`, `Tests 759 passed (759)` (41 y
  757 en la Etapa 1, más el spec nuevo con 2 tests).
- `pnpm prisma generate`: no hizo falta, no se tocó el backend.

## Etapa 3 — Documentación

Rama `chore/cierre-auth`, sobre `2afe8db` (Etapa 2). Solo documentación: ningún archivo de `apps/`, `packages/`,
`scripts/`, configuración ni `package.json`. Las líneas son las del archivo después del cambio.

**Hecho** (la checklist de §4.2 I1, I2, I3, I9, I10, §3.5, §3.7, M3, M14, M19 y M26 del informe)

1. `docs/auth/specs/auth.md`
   - M3: `:581`, el criterio 2 de la Fase 5 suma `menyu_refresh_token` y nombra todo lo demás que el grep
     encuentra y no cuenta (ver Decisiones): el test de la regex de `includes-contract.spec.ts`, el `refresh_token`
     del OAuth de Mercado Pago y lo que narra el pasado.
   - Los 7 puntos de §3.5: `:156` (F3-07: `/sin-acceso` no cierra la sesión sola, ofrece "Ir a MenYU"), `:524`
     (`/privacidad` rige desde el 26 de octubre), `:442` (F47-05: actualización funcional, no ref), `:581` (el 4, M3),
     `:293` (la fila de `DELETE /mozos/:id`, tachada), `:275` (el tercer `*.base.spec.ts`, `historial-root`) y `:577`
     (el tercer lugar que carga `cargarAuthClient()`, `cerrarSesionDeLaCuenta`).
   - M26: `:19`, en la decisión del SSO, la cookie partida en `…auth-token.0`/`.1`.
   - `:104` (Fase 0) pasa a pasado (decía "hoy" que `admin`, `mozo` y `cliente` guardan `password_hash`).
   - I3: `:472` y `:612`, el puntero a la lista nueva; la lista de la Fase 4 queda en su lugar, como la de esa fase.
2. `doc.md` (I1). `:13-38` la sección Global reescrita: sin login propio, los tres tipos de ruta (token de Supabase,
   token de sesión de mesa, pública), los códigos y los roles por `Membresia` con los grupos de
   `roles-del-personal.ts`. Borrados los 5 endpoints del login, el `TokenPair` y el payload del JWT; `:65` dice que
   responden 404. `GET /auth/me` y `POST /auth/invitaciones` ya estaban y no se duplicaron. También: `:133` (el seed
   no da credenciales), `:293-309` Marcas y `:371-384` Restaurantes sin `POST`/`DELETE` (están en `/root` desde la
   4.3), `:448`, `:797`, `:932`, `:1157`, `:1234-1245` y `:1321-1366` con los roles reales (Mesas, Categorías, Items,
   Ingredientes, Clasificaciones, Mozos), `:563` y `:598` el token de `POST /sessions/open` y `/sessions/close`, y
   Mozos sin `POST`/`DELETE` ni `password`. Ninguna mención a `password_hash` quedaba; quedaron 0 hits del grep.
3. `docs/plan-consola-root.md` (I2): `:7` encabezado de planificación histórica para todo lo de cuentas y
   contraseñas (secciones 3, 7 con 7.1 y 7.2, 8.1, 9, 10, 11 y 13), con el puntero a lo vigente; `:150` el aviso de la
   sección 7 dice que la tabla no es la API vigente; `:54` "va a retirar" → "retiró".
4. `Documentacion/Doc_DB.md:9` y `:97`, `modulo-usuarios-y-autenticacion.md:7` (y `:177`, "sigue activo hasta la Fase
   5" → "la Fase 5 borró") y `modulo-menu.md:7`: encabezado de documento histórico. `datos-de-prueba-local.md`:
   corregido (`:1` título sin "credenciales", `:13-24` la sección Usuarios con lo que crea el seed hoy, sin contraseñas,
   y el `/auth` de web-cliente como redirect).
5. `docs/calidad/e2e-supabase.md:73` y `:149` sin la contraseña de `cliente`; `docs/auth/VariablesACambiar.md:94`
   (sin `admin` ni contraseñas; el `curl` de verificación pasa de `admin`, que ya no existe, a `cliente`), `:136` y
   `:146` ("Ingresar" va a web-auth, no al `/auth` de la app).
6. `docs/checklist-qa-staging.md:21` "los cuatro frontends" y `:7` el puntero; **nuevo**
   `docs/auth/checklist-staging.md`, con casilleros: los 7 casos de la Fase 4 (el 6, al día con la Fase 5), los de
   navegador del criterio 4 de la Fase 5, lo que la Fase 5 dejó sin verificar (con SonarCloud y el SQL del E2E si se
   instala en producción) y los casos de la pasada de §3.7, más la tabla de pasadas (2026-10-23 y 2026-10-27).
7. `CLAUDE.md` (I9 sin `:116`, más M26): `:59-90` el árbol del backend contra el `ls` de `apps/backend/src/`
   (`restaurante/`, `mesas/`, los 15 módulos que faltaban, `scripts/`; sin los `gateway.ts` por módulo, que no
   existen: el gateway es `gateway/menyu.gateway.ts`); `:96-110` el de `packages/types` con `permisos.ts`,
   `cart.types.ts`, `discovery.types.ts`, `root.types.ts` e `historial.types.ts`; `:125` la fila de Mozo con
   `JEFE_SALON`; `:157` la nota de M26; `:225` "las cuatro apps".
8. `Documentacion/WORKFLOW.md` (I10, M14, M19): `:46-48` sin la Preview URL por PR (vale `:127`); `:67` cinco
   workflows, y `:109-122` las secciones de `e2e-staging.yml` y `carga-k6.yml`; `:92` con `menyu-auth` y `:94` el
   paso del E2E; `:146` sin `resolveAppUrl`/`resolveLoginUrl` (el nombre importa por `ignorar-build.sh`; el login sale
   de `VITE_AUTH_URL` y de la cookie); `:184` Node >= 22; `:212-215` "Trampas de desarrollo" con M14 y M19.
9. **Correcciones que salieron de la revisión** (el revisor aprobó sin bloqueantes; van en el mismo commit, con
   `--amend`):
   - `WORKFLOW.md:119`: `pnpm carga:*` con `-f confirmar=si`, como `README.md:23,26` y `docs/calidad/k6.md:176`
     (sin él no carga staging: `confirmar` es obligatorio).
   - `docs/plan-consola-root.md:9` ya no se presenta como la referencia vigente, y el encabezado de `:7` nombra
     también las secciones 5 y 12.
   - `doc.md:371`: la baja de un restaurante es `POST /api/root/restaurantes/:id/baja`.
   - Encabezado histórico fechado en dos notas de sesión que describían el login en presente y no estaban en la
     lista del plan: `Documentacion/modulo-pedidos-y-cocina-kanban.md:7` y `sesion-integracion-carrito-menu.md:6`.
   - `CLAUDE.md:59` suma `fix-removibles.ts`, y `docs/auth/checklist-staging.md:69`, la salvedad del caso de Google.

**Decisiones**

- **Corregir o histórico, por documento.** Corregidos los que se usan como referencia viva: `doc.md`,
  `datos-de-prueba-local.md`, `e2e-supabase.md`, `VariablesACambiar.md`, los dos checklists, `CLAUDE.md` y
  `WORKFLOW.md`. Fechados como históricos los que son el registro de un sprint o un plan, donde corregir es reescribir:
  `Doc_DB.md` (schema del Sprint 1), `modulo-usuarios-y-autenticacion.md` (el login de abril, entero) y
  `modulo-menu.md` (mayo, `apps/admin/`).
- **`plan-consola-root.md`: histórico, no reemplazar la tabla.** Es un plan con la narración de sus etapas; la API
  vigente ya está en `doc.md` ("ROOT console") y en "4.4, cómo quedó". Reemplazar solo la tabla dejaba 7.1, 7.2, 10, 11
  y 13 hablando de contraseñas; un encabezado arriba y otro en la sección 7 los cubre con tres cambios.
- **En `doc.md` también los roles por sección y las rutas borradas.** La sección Global nueva contradecía los "`Bearer`
  + role `ROOT` or `OWNER`" de cada sección y los `POST`/`DELETE` de marcas, restaurantes y mozos (el de mozos con
  contraseña): son el modelo de permisos del login borrado, y es lo más expuesto del repo. Los roles salen de los
  decoradores de cada controller y de `roles-del-personal.ts`.
- **El criterio 2 nombra lo que narra el pasado.** Con solo `menyu_refresh_token`, las migraciones y los resúmenes de
  sprint igual lo romperían en su lectura literal. El texto nuevo lista las categorías con sus archivos, para que el
  grep sea verificable contra la spec.
- **Texto nuevo sin los 8 patrones** (salvo el criterio, que los tiene que nombrar): los encabezados históricos dicen
  "las contraseñas" o "la de los refresh tokens", así no suman hits.
- **La lista de staging marca cada caso por su origen** (`[F4-n]`, `[F5]`, `[R]`) en lugar de renumerar. §3.7 dice
  "12 casos" pero describe 6 de la regresión del SSO y 7 viñetas de la Fase 5: están los 13.
- `CLAUDE.md`: se cambió por pedido del plan (I9); la línea `:116` "(migración en curso)" queda para la Etapa 5.

**No aplica / no hecho**

- Ningún punto quedó como "no aplica": todos los diagnósticos seguían vigentes sobre `2afe8db` (las líneas se
  movieron un poco; las de `CLAUDE.md` y `WORKFLOW.md` coincidían).
- No se tocaron los resúmenes de sprint, las bitácoras, el informe de revisión ni el plan: narran el pasado.
- M14 quedó solo en `WORKFLOW.md`, como pide el plan (el informe proponía `WORKFLOW.md` o `CLAUDE.md`).
- Sin prueba en el navegador: no cambió código.

**Para la sesión de limpieza:** son las entradas "(Etapa 3)" del bloque general, al final.

**Verificaciones** (antes del commit)

- `pnpm typecheck`: exit 0, `Tasks: 10 successful, 10 total` (`Cached: 10 cached`: ningún paquete cambió).
- `pnpm lint`: exit 0, `Tasks: 9 successful, 9 total` (`Cached: 9 cached`).
- Suites y `prisma generate`: no aplican, no se tocó código.
- El grep de los 8 patrones del criterio 2 sobre todo el árbol (sin `node_modules`, `dist`, `coverage` ni `.git`):
  147 líneas: las 144 de antes en los archivos versionados, menos las 6 corregidas, más las 5 de esta entrada y las 4 del plan, que no está
  versionado. Todas en las categorías que el criterio exceptúa, ninguna fuera de ellas; `doc.md`,
  `e2e-supabase.md` y `VariablesACambiar.md` pasaron a 0. La clasificación completa está en el reporte de la etapa.

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
- (Etapa 2) **La regla de la carga diferida no ve los paquetes del workspace.** Mira los archivos de
  web-cliente; un import estático de `@menyu/auth-client` dentro de `@menyu/ui` (o de otro paquete que importe
  la app) devolvería supabase-js al bundle principal sin que el lint diga nada. Hoy no pasa. Lo cubriría la otra
  opción del informe (I5): un test que lea el bundle construido y falle si el chunk de entrada trae supabase-js.
- (Etapa 2) **web-cliente declara `@supabase/supabase-js` como dependencia directa** (`package.json:19`) y solo
  lo usa en `import type`. Ver si alcanza con los tipos que llegan por `@menyu/auth-client`, o pasarlo a
  `devDependencies`.
- (Etapa 3) **`doc.md` sigue atrasado en lo que no es auth:** documenta las rutas de subcategorías
  (`/api/categorias/:categoriaId/subcategorias` y `/api/categorias/subcategorias/:id`), que ningún controller tiene;
  `:139` dice que las pantallas de dueños y cuentas ROOT (E2b) "are still to come", y están desde el 2026-10-22; y no
  documenta pedidos, pagos, llamados, comensales, Personal ni reportes.
- (Etapa 3) **Credenciales del seed viejo en notas de sesión** que no estaban en la lista de la etapa:
  `Documentacion/contexto-division-pagos.md:31` (`root@menyu.com`/`root1234` y compañía, sin fecha) y
  `Documentacion/sesion-pedidos-kanban-flujo-completo.md:372` (mayo de 2026). Ya no sirven (la Fase 5 borró `admin`
  y las contraseñas), pero se leen como vigentes. Fecharlos o sacar las credenciales.
- (Etapa 3) **`WORKFLOW.md:90` y `:103` dicen que los deploys "corren los mismos checks que CI"**: `deploy-staging.yml`
  y `deploy-production.yml` solo tienen el paso `Build`.
- (Etapa 3) **Dos notas viejas de la spec:** `auth.md:742` dice que `pnpm lint` de web-admin falla con una carpeta
  `coverage/` (la Etapa 2 lo resolvió en las tres apps), y `auth.md:80`, que "hoy las apps corren en
  `menyu-*.vercel.app`".
- (Etapa 3) **`docs/plan-consola-root.md` quedó como historia en lo de cuentas.** Si se quiere que vuelva a ser la
  referencia de la consola que `CLAUDE.md` dice que es, hay que reescribir las secciones 3, 7, 10, 11 y 13 sobre
  Supabase.
