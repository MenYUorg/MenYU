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

Rama `chore/cierre-auth`, sobre `16b350f` (Etapa 3). Un solo archivo nuevo, `docs/auth/review/release-fase5.md`, y
esta entrada. Ningún comando contra staging ni producción: ni SQL, ni `curl`, ni `gh`, ni Railway, Supabase o Sonar.

**Hecho** (los cuatro puntos de la etapa, en `release-fase5.md`)

1. Las consultas (sección 1), para el SQL Editor del Supabase de producción, cada una con su resultado esperado:
   - 1.1, el estado de `_prisma_migrations`: la última es `20261021141707_fase4_autoria_usuario` y no hay ninguna
     fallida (con una, P3009 antes de llegar a la nueva).
   - 1.2, el texto de `pg_views`, `pg_matviews`, `pg_proc` (con `pg_get_functiondef`) y `pg_policies`.
   - 1.3, `pg_depend`: lo que haría fallar los `DROP` sin `CASCADE`.
   - 1.4, `cron.job`.
   - Al final, cómo leer una fila y los falsos positivos.
   - El SQL de la migración es la tabla de arriba del documento, línea por línea (`migration.sql:11-35`).
2. El respaldo (sección 2), con los conteos de 2.1 y dos opciones:
   - A, el SQL Editor y una descarga CSV por consulta.
   - B, `pg_dump --table` de las tres tablas y `psql \copy` de las columnas.
   - Dónde guardarlo: fuera del repo y de OneDrive, cifrado o borrado. Advierte que trae hashes y emails.
3. El checklist (sección 3), con los 8 casilleros en el orden del plan, cada uno con el cómo.
4. La verificación posterior (sección 4):
   - `/health` con el SHA, con `esperar-sha.mjs` y con `curl`.
   - Los cinco `POST` esperando 404 y `GET /api/auth/me` esperando 401, con su cuerpo exacto
     (`supabase-auth.guard.ts:43-45`).
   - Swagger.
   - El smoke tal como lo corre el workflow (`deploy-production.yml:232-244`), su re-ejecución por `workflow_dispatch`
     y el equivalente local.
   - El SQL de 4.6, que corre el usuario.
   - Al final, "Si algo falla".

**Decisiones**

- **Dos tipos de consulta, texto y `pg_depend`.** El texto encuentra las funciones `plpgsql`, que no dejan dependencia y
  se rompen después, como `e2e.e2e_limpiar`. `pg_depend` encuentra lo que haría fallar la migración en el momento:
  vistas, políticas, FK de otras tablas (`pg_constraint`), tipos, y el `WHEN` o el `UPDATE OF` de un disparador. Así
  cubre `pg_constraint` y los disparadores sin una consulta aparte para cada uno.
- **Lo que sumé a lo pedido:**
  - `_prisma_migrations`: una migración fallida frena el deploy, como el 2026-10-20.
  - `pg_matviews`: `pg_views` no trae las vistas materializadas.
  - `pg_get_functiondef` en lugar de `prosrc`: también trae las funciones `BEGIN ATOMIC`.
  - `cron.job`: su SQL es texto que ningún catálogo relaciona con las tablas.
- **Lo que no sumé:** `information_schema`, que filtra por privilegios y para las vistas no agrega nada a `pg_depend`.
- **Patrones de palabra entera (`\m…\M`).** Así `admin` no encuentra `admin_restaurante`, `supabase_admin` ni
  `mp_refresh_token`. Sumé `admin_id` y `rol_admin`, que la migración también borra (líneas 18 y 27), y
  `debeCambiarPassword` va como `debe_?cambiar_?password`: en la base es `admin.debe_cambiar_password`
  (`20261020150000_consola_root_historial/migration.sql:6`).
- **Las consultas descuentan lo que borra la propia migración**, para que "esperado: 0 filas" sea literal:
  `admin_proteger_ultimo_root()` (que nombra a `admin`), los disparadores y las FK de las tres tablas y la FK de
  `pedido_edicion` a `admin`.
- **El respaldo suma `pedido_edicion.admin_id`.** No está en la lista del plan, pero la migración lo borra (línea 18) y
  sin él el respaldo de `admin` no dice quién editó cada pedido.
- **Opción A primero:** no hay que instalar nada. En esta máquina no hay `pg_dump` ni `psql`. La B usa `cygpath -m`,
  porque los clientes de Windows no entienden `/c/Users/…`.
- **`/health` va sin `/api`.** La consigna decía `/api/health`, pero `main.ts:18` excluye `health` del prefijo, y así
  lo usa el smoke (`scripts/smoke/lib.mjs:41-43,69`).
- **v1.4.0.**
  - MAJOR no: la API no tiene consumidores fuera de MenYU, cada fase de auth fue MINOR y "v2.0" es el alcance del
    producto en `CLAUDE.md`.
  - PATCH tampoco: el release cambia comportamiento.
- **El tag va sobre `main`, no sobre esta rama.** `main` es lo que se verificó en staging el 2026-10-27, y la Etapa 1
  cambia web-cliente probada solo con tests.
- **Orden de la verificación: primero el SHA.** Con v1.3.0 todavía atendiendo, `POST /api/auth/guest` con `{}` crea un
  cliente invitado en producción (su `GuestDto` es todo opcional en v1.3.0). Por la misma razón, el chequeo después de
  rotar `JWT_SECRET` usa `/auth/login`, que con `{}` da 400 en v1.3.0: si diera 404, Railway habría construido `main`.
- **`tableCode`:** el casillero dice lo del plan. Debajo, una recomendación: `usuarios-prueba-staging.md:6` deja el PIN
  fuera del repo público y el `tableCode` abre la misma mesa, así que el valor iría en `.env.usuarios-staging` como
  `STAGING_MESA_TABLE_CODE` y el doc nombraría la variable. Decide el usuario.

**No aplica / no hecho**

- **Las consultas no se corrieron en Supabase.** Las validó el revisor el 2026-10-28 en un PostgreSQL local (PGlite
  18.3) con las migraciones de v1.3.0 y objetos señuelo; de esa revisión salieron las correcciones del `--amend`:
  - los tipos array y el `DISTINCT` en 1.3;
  - el filtro de las políticas de las tres tablas en 1.2;
  - la excepción de los `CHECK` y las `RULE`;
  - volver a correr 1.1 después de rotar `JWT_SECRET`;
  - los access tokens del login anterior;
  - qué funciones dejan dependencia;
  - `PGCLIENTENCODING`.

  La corrida previa en staging que pide el documento solo prueba que parsean en Supabase. El respaldo se omitió por
  decisión del usuario, porque los datos son de prueba. Railway producción quedó sin source el 2026-10-28.
- El estado de producción, sin la migración aplicada, sale de la spec y del informe; no lo verifiqué. Lo confirma 1.1.
- Ningún punto quedó como "no aplica": el release sigue pendiente y la migración, el workflow y el smoke son los
  que describe el plan.
- **Queda para el usuario:** los 8 casilleros de la sección 3 y el SQL de 4.6. **Queda para el orquestador**, cuando el
  usuario confirme el tag: 4.1 a 4.5.

**Para la sesión de limpieza:** son las entradas "(Etapa 4)" del bloque general, al final.

**Verificaciones** (antes del commit)

- `pnpm typecheck`: exit 0, `Tasks: 10 successful, 10 total` (`Cached: 10 cached`: ningún paquete cambió).
- `pnpm lint`: exit 0, `Tasks: 9 successful, 9 total` (`Cached: 9 cached`).
- Suites y `prisma generate`: no aplican, no se tocó código.
- Las referencias `archivo:línea` del documento, contra el árbol de `16b350f` (y de `v1.3.0` para
  `apps/web-cliente/src/services/api.ts:202,206`). `git ls-tree`: 35 migraciones en `v1.3.0` y 36 en `main`; la única
  nueva es la de la Fase 5.

## Etapa 5 — Cierre

Rama `chore/cierre-auth`, sobre `b0ba087` (Etapa 4). Solo documentación: `auth.md`, `CLAUDE.md`, el informe,
`release-fase5.md`, `usuarios-prueba-staging.md` y esta bitácora. Tras la revisión final se sumaron también el plan y
los dos archivos de `.claude/agents/`, que estaban sin versionar (punto 6). Son los puntos 1 a 3 del plan; el 4 (el
`revisor`) y el 5 (el PR) son del orquestador.

**El release**

Lo hizo el usuario el 2026-10-28. Los datos son los que verificaron él y el orquestador; no los volví a correr. Lo que sí
comprobé: `git rev-parse 'v1.4.0^{commit}'` y `git ls-remote origin 'refs/tags/v1.4.0*'` dan
`94fe19f85de311d525ca2bec7fd73da8fd70dbb2` (es un tag liviano).

- **Tag y deploy:** `v1.4.0` sobre `main` en `94fe19f`.
  - Run `40737755116` de "Deploy — Production", con los tres jobs en verde.
  - El smoke se volvió a correr: su espera de 8 min venció porque un incidente de Railway ("deployments stuck in
    initializing") demoró el build unos 15 min, y se resolvió solo.
- **Consultas previas** (sección 1, SQL Editor, 2026-10-28):
  - Staging, de control: 1.1 con la Fase 5 aplicada y 0 fallidas; 1.2 y 1.3 en 0 filas; 1.4 sin pg_cron (el error
    esperado).
  - Producción: 1.1 con `20261021141707_fase4_autoria_usuario` arriba, sin la Fase 5 y 0 fallidas; 1.2 en 0 filas; 1.3
    en 0 filas; 1.4 sin pg_cron.
- **Verificación posterior** (sección 4), toda en verde:
  - 4.1: `/health` con `"sha":"94fe19f…"` y `db: ok`.
  - 4.2: los cinco endpoints del login en 404.
  - 4.3: `GET /api/auth/me` sin token en 401.
  - 4.4: `/docs-json` solo con `/api/auth/invitaciones` y `/api/auth/me`.
  - 4.5: el smoke local, 6/6 OK.
  - 4.6: `migracion_ok=1`; `admin`, `admin_restaurante`, `refresh_token`, `rol_admin` y
    `admin_proteger_ultimo_root()` en NULL; `columnas=0`.
- **Lo demás del checklist:**
  - Railway producción, sin source desde el 2026-10-28.
  - `JWT_SECRET`, rotado en staging y en producción el 2026-10-28: el reinicio se verificó en los dos y el chequeo
    previo al deploy dio 400 en `/auth/login`. La rotación fue unos 30 min antes de las consultas de la sección 1, así
    que la 1.1 de producción, que dio limpio, se corrió después de rotar, como pedía el casillero. Esto lo confirmó el
    orquestador tras la revisión.

**Hecho**

1. `docs/auth/specs/auth.md`:
   - `:560`: el ✅ de la Fase 5 con su fecha, "verificada en staging y en producción desde v1.4.0 (2026-10-28)".
   - `:658-661`: el bloque "Fase 5 en producción" en "Para tener en cuenta", como el de las Fases 4 y 4b (`:653`): antes
     del tag, después del deploy y el gate de SonarCloud.
2. `CLAUDE.md`:
   - `:135`: "(migración en curso)" pasa a "(migración terminada)".
   - `:136`: la Fase 5 "está en `main` (PR #438), verificada en staging el 2026-10-27 y en producción desde v1.4.0
     (2026-10-28)".
   - `:176` (punto 6).

   Nada más del archivo cambió.
3. `docs/auth/review/auth-review-2026-10-27.md:991-1047`: la sección "Cierre (2026-10-28)", con:
   - el tag con su SHA;
   - el antes y el después del deploy;
   - las tres desviaciones y el "Invitado" de más;
   - lo que cerró la rama y lo que queda para limpieza.
4. `docs/auth/review/release-fase5.md`, tildados con la fecha y el resultado:
   - `:318`, las consultas;
   - `:328`, SonarCloud, tachado como salteado con el motivo;
   - `:346`, `JWT_SECRET`;
   - `:378`, la cuenta, borrada;
   - `:391`, el `tableCode`;
   - `:403`, el tag y el deploy.

   Del resto del texto solo cambiaron las dos referencias del punto 6.
5. `docs/auth/usuarios-prueba-staging.md:7`: el `tableCode` de la mesa 1 está en `STAGING_MESA_TABLE_CODE`, al lado
   de `STAGING_MESA_PIN` y `STAGING_RESTAURANTE_ID`. Va también el link del `/check-in`, armado con las dos variables y
   sin ningún valor. El doc no nombra `menyuprueba2+rev2710` (grep: 0) y no le sumé nada de esa cuenta.
6. **Correcciones de la revisión final.** El `revisor` aprobó la rama sin bloqueantes y confirmó que no hay cambios de
   comportamiento fuera de la Etapa 1. Las observaciones van en el mismo commit, con `--amend`:
   - `auth.md:584`: una salvedad en el criterio 5. Quedó cumplido en parte: el gate pasó contra *Previous version* del
     17/10, B2 sigue abierto y el ✅ es decisión del usuario del 2026-10-28.
   - El "Cierre" del informe:
     - "C1, salvo el gate y el respaldo (omitido)";
     - M26 y M8 entre lo que cerró la Etapa 3 (M8, por `auth.md:577`, que documenta el tercer punto de carga como
       intencional);
     - en §5, la mitad de Mercado Pago del casillero de la rotación (las credenciales de `.claude/settings.local.json`),
       que nadie evaluó.
   - `CLAUDE.md:176`: sin "Durante la migración". Los dominios viejos siguen activos y no se dan de baja.
   - `release-fase5.md:346-349`: la 1.1 de producción se corrió después de rotar `JWT_SECRET`.
   - `release-fase5.md:26` y `:549`: `auth.md:743` pasa a `auth.md:747`. El bloque de producción que sumó esta etapa
     (`auth.md:658-661`) corrió cuatro líneas el incidente del 2026-10-20.
   - `docs/auth/review/plan-cierre-auth.md` entra al repo, sin el formato pegado de texto enriquecido, con el contenido
     igual:
     - los links `[x](http://x)` y el `mailto:` vuelven a su texto (25);
     - `\*`, `\[` y `\]` pierden la barra (48, 8 y 8).
   - `.claude/agents/revisor.md` (`model: inherit` pasa a `model: Opus`, un cambio que ya estaba en el árbol) y
     `.claude/agents/trabajador.md` entran al repo sin cambios míos, por indicación del orquestador: los decidió el
     usuario.

**Decisiones**

- **Del usuario** (las anoto como las recibí):
  - El respaldo, omitido: los datos de producción eran de prueba.
  - SonarCloud, salteado: su cuenta no es administradora de `MenYUorg` en SonarCloud. El gate sigue midiendo contra
    *Previous version* del 17/10 y la Fase 5 no se midió sola.
  - La cuenta `menyuprueba2+rev2710@gmail.com`, borrada del Supabase de staging. De las dos opciones del casillero
    eligió borrarla, no sumarla al `.env`.
  - El `tableCode`, en `.env.usuarios-staging` como `STAGING_MESA_TABLE_CODE`, que era la recomendación de la Etapa 4.
- **La fecha del ✅ es 2026-10-26**, la de "5, cómo quedó" y la aprobación del `revisor`; la verificación en staging y
  la producción van después, con el formato de la 4b (`auth.md:500`). La de staging es §3.7 del informe (2026-10-27).
- **El bloque de producción en la spec** sigue lo que hicieron las fases anteriores (`:648` y `:653`). Dice que el gate
  pasó contra *Previous version*, pero en "Para tener en cuenta" (`:658-661`), no junto al ✅.
  - En el primer commit escribí que eso estaba "junto al ✅", y no era así.
  - La salvedad junto al criterio 5 (`:584`) se sumó tras la revisión final, para que nadie lea el ✅ como B2 cerrado.
  - El informe (B2) decía que sin el gate la fase no se podía marcar. El ✅ va por el plan y por la decisión del
    usuario, y ahora lo dicen el criterio, el bloque y el cierre.
- **La salvedad va en la misma línea del criterio 5**, no en una nueva. Una línea más correría `auth.md:611` y `:614`,
  que cita `release-fase5.md`. Las referencias que el bloque de `:658-661` corrió en documentos que narran el pasado no
  se tocaron: la `auth.md:742` de la entrada de limpieza de la Etapa 3 hoy es la `:746`, y la `:739` del informe es de
  `63c512e`.
- **`CLAUDE.md` dice "(migración terminada)", sin versión.** Las fases llegaron a producción en tres releases (v1.1.0,
  v1.3.0 y v1.4.0), y el párrafo ya da la de cada una.
- **El gate "pasó en el CI de `94fe19f`"** lo deduzco así: el `check-ci` del run exige en verde el job "CI — typecheck,
  lint, test, build" del commit (`deploy-production.yml:59-89`), y ese job tiene el paso de SonarCloud sin condición y
  con `sonar.qualitygate.wait=true` (`ci.yml:116-122`).

**No aplica / no hecho**

- Ningún punto quedó como "no aplica". Los diagnósticos seguían vigentes sobre `b0ba087`:
  - `CLAUDE.md:135` decía "(migración en curso)";
  - la Fase 5 de `auth.md:560` no tenía ✅;
  - el informe no tenía cierre;
  - en `release-fase5.md` quedaban seis casilleros sin tildar.
- No corrí nada contra staging ni producción. Lo único remoto fue el `git ls-remote` a GitHub.
- En el primer commit anoté que no me constaba que la 1.1 se hubiera vuelto a correr después de rotar `JWT_SECRET`.
  Tras la revisión el orquestador lo confirmó (ver "El release").
- Del plan saqué solo los links y los escapes. Las líneas en blanco dobles del pegado quedaron como estaban: la consigna
  nombraba esos dos arreglos.
- No tildé los casilleros de §5 del informe: el cierre dice cuáles cubrió el release. Tampoco toqué las secciones 1 y 4
  de `release-fase5.md`, que no tienen casilleros.
- **El archivo del scratchpad con la contraseña de la cuenta borrada sigue ahí**: `cuenta-nueva.txt`, en la ruta que da
  `auth-review-2026-10-27.md:782`. Comprobé que existe, sin abrirlo. El casillero pide borrarlo, pero está fuera del
  repo y lo hace el usuario: queda en limpieza. La cuenta ya no existe, así que la contraseña no abre nada.
- `auth.md:612` ("el quality gate de SonarCloud sigue pendiente") no cambió, porque sigue siendo cierto.

**Para la sesión de limpieza:** son las entradas "(Etapa 5)" del bloque general, al final.

**Verificaciones** (antes del commit)

- `pnpm typecheck`: exit 0, `Tasks: 10 successful, 10 total` (`Cached: 10 cached`: ningún paquete cambió).
- `pnpm lint`: exit 0, `Tasks: 9 successful, 9 total` (`Cached: 9 cached`). `@menyu/api` sigue con "lint pendiente".
- Suites y `prisma generate`: no aplican, no se tocó código.
- Que el valor de `STAGING_MESA_TABLE_CODE` no esté en el repo: lo leí del `.env` a una variable de shell sin imprimirlo
  (36 caracteres). `git grep -l -F` dio exit 1, sin archivos, y lo mismo `grep -l -F` sobre los nueve archivos del
  commit, ya con las correcciones de la revisión. `git check-ignore` confirma que `.gitignore:7` (`.env.*`) ignora `docs/auth/.env.usuarios-staging`, y las tres
  variables que nombra el doc están en ese archivo, una vez cada una (`grep -c`).
- `grep "migración en curso"` en todo el repo: queda solo en el plan, el informe y esta bitácora, que narran el pasado.
  "Durante la migración" ya no está en `CLAUDE.md` (grep: exit 1).
- Después de las correcciones de la revisión, otra vez: `pnpm typecheck` exit 0 (10/10, cached) y `pnpm lint` exit 0
  (9/9, cached).

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
- (Etapa 4) **`/health` siempre dice `"version": "0.0.1"`.** La toma de `apps/backend/package.json:3`, que nadie sube,
  así que no dice qué release corre: solo sirve el `sha`. O se sube la versión con cada tag, o se saca el campo.
- (Etapa 4) **`Documentacion/WORKFLOW.md:101,129,137` dicen que el tag es `v*.*.*`.** El filtro real
  (`deploy-production.yml:7`) es `v[0-9]+.[0-9]+.[0-9]+`: un `v1.4.0-rc.1` no despliega.
- (Etapa 4) **No está escrito qué hace Railway si el backend nuevo no levanta.** La migración corre al arrancar
  (`apps/backend/Dockerfile:70`) y `railway.toml` no define `healthcheckPath`, así que no sé si el deploy anterior sigue
  atendiendo mientras el nuevo falla. Ya figura como opcional en `docs/calidad/bitacora.md:33`; con una migración
  destructiva, conviene confirmarlo.
- (Etapa 4) **`migration.sql:4-5` de la Fase 5 atribuye el respaldo a la "decisión 3"**, pero es la 4
  (`auth.md:573`). No se corrige: cambiar una migración aplicada cambia su checksum.
- (Etapa 5) **Un `Cliente` "Invitado" de más en producción.** En la verificación del release, se corrió un
  `POST /api/auth/guest` con `{}` antes de que el SHA nuevo estuviera servido, con v1.3.0 todavía atendiendo, y creó un
  `Cliente` "Invitado". No tiene sesión asociada, así que es inocuo. Es lo que advertía la sección 4.1 de
  `release-fase5.md`; si molesta, se borra con SQL.
- (Etapa 5) **SonarCloud no midió la Fase 5 sola (B2 del informe).** Mover la referencia de "código nuevo" pide una
  cuenta administradora de `MenYUorg` en SonarCloud. El procedimiento está en `release-fase5.md:328-345`. Después,
  decidir qué definición queda (pendiente 1 de `docs/calidad/bitacora.md`).
- (Etapa 5) **El encabezado de "Para tener en cuenta" de la spec** (`auth.md:646`) dice "Observaciones que dejaron las
  Fases 0 a 3b (2026-10-20 y 2026-10-21)", pero la sección ya tiene también las de la 4, la 4b y la 5.
- (Etapa 5) **Pendiente del usuario: borrar `cuenta-nueva.txt`**, el archivo del scratchpad de la revisión con la
  contraseña de `menyuprueba2+rev2710@gmail.com`. La ruta está en `auth-review-2026-10-27.md:782`. La cuenta ya se borró
  del Supabase de staging, pero el casillero de `release-fase5.md:378` pide borrar el archivo también, y el 2026-10-28
  seguía ahí.
