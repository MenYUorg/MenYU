# Bitácora — implementación desatendida del asistente de mesa

> La escriben los trabajadores (una entrada por fase) y el orquestador (línea base, cierres, detenciones, informe final), según `docs/asistente/specs/orquestacion.md`.

## Línea base (orquestador, 2026-11-01)

- **Commit de partida:** `4f45e4d` (main, "Merge pull request #448"). Rama de trabajo: `feat/asistente`, creada desde ahí.
- **Primer commit de la rama:** `6b49068` — una línea pendiente de la spec (key de producción de Gemini, Fase 0) que estaba sin commitear en el árbol; se commiteó aparte para que los commits de las fases queden limpios.
- **Estado del árbol:** limpio salvo `.claude/settings.local.json` (permisos locales para esta corrida; queda sin commitear a propósito — **no incluirlo en ningún commit de fase**).
- **Precondiciones:** Fase 0 verificada (`apps/backend/.env` con `GOOGLE_GENERATIVE_AI_API_KEY` y todas las `ASISTENTE_*`; llamada de prueba a `gemini-3.1-flash-lite` respondió HTTP 200). Base local levantada (`menyu-postgres`, healthy, puerto 5433). `pnpm install` sin errores. Typecheck: 7/7 tareas OK. Tests: 8/8 tareas OK (p. ej. web-admin 852 tests, 48 archivos). Agentes `revisor`, `trabajador-back` y `trabajador-front` presentes en `.claude/agents/`.
- **Presupuesto de llamadas reales:** tope de la corrida 200. Usadas: 1 (llamada de prueba de la precondición). **Restante: 199.**
- **Override de `.env`:** `ASISTENTE_MAX_PREGUNTAS_DIA` pasó de **300** (valor original, restaurar al cierre) a **50** durante la corrida.
- **Ambigüedad menor resuelta por el orquestador:** el árbol no estaba 100 % limpio al arrancar (precondición 2): tenía dos cambios claramente intencionales de preparación de la corrida (la línea de la spec ya mencionada y los permisos de `.claude/settings.local.json`). Se decidió no frenar: la spec se commiteó como primer commit de la rama y los permisos quedan locales.

---

## Fase 1 — Modelo de datos (Prisma) (2026-11-01)
Estado: completada
Plan y "A verificar" resueltos: en las subsecciones "Plan" y "A verificar en plan mode" de abajo, escritas antes de tocar código.

### Plan (escrito antes de tocar código)

1. `schema.prisma`: los cuatro enums (`@@map` en snake_case, como `rol`), los nueve campos opcionales en `ItemMenu`, y los modelos `InformacionLocal` (1:1 con `Restaurante`), `PreguntaFrecuente` y `RegistroAsistente`, con sus relaciones inversas en `Restaurante` y `SesionMesa`.
2. Una migración (`<fecha>_asistente_modelo_de_datos`) con `prisma migrate dev --create-only`, revisar el SQL (solo `CREATE TYPE`, `ADD COLUMN`, `CREATE TABLE`, índices y FKs: nada que toque datos existentes), comentarlo como las migraciones recientes y aplicarla con `prisma migrate dev` contra `menyu-postgres` (localhost:5433).
3. Seed: Restaurante Seed con `InformacionLocal` completa y `asistenteHabilitado=true` (estacionamiento en `null`), los campos nuevos en casi todos los platos (cada valor de cada enum al menos una vez; Rabas sin nada), descripciones, dos platos recomendados, un plato vegano nuevo y 5 FAQs. Restaurante Seed 2 queda sin `InformacionLocal` (asistente apagado). Idempotente y sin pisar lo editado a mano, con el patrón del seed actual (`upsert` con `update: {}` y `updateMany` con guarda, como los descuentos).
4. Verificar: migración limpia, seed dos veces, consulta a la base, typecheck y lint del CI, tests del backend.

### "A verificar en plan mode", resueltos leyendo el código

- **Modelo del plato:** `ItemMenu` (tabla `item_menu`). Ningún archivo de `src/` usa el tipo `ItemMenu` de Prisma de forma explícita, así que sumarle escalares no rompe el typecheck.
- **Convenciones del schema:** nombres de campo en español y camelCase, columnas en snake_case con `@map`, tablas con `@@map` en singular snake_case, ids `String @id @default(uuid())`, enums con `@@map` en snake_case (`rol`). Timestamps: `createdAt @map("created_at")` en 12 modelos (incluidos los más nuevos: `Usuario`, `Membresia`, `HistorialRoot`) contra `creadoEn` en 2 (`MozoMesa`, `PedidoEdicion`); `updatedAt @updatedAt @map("updated_at")` en `Pedido`. Los CHECK que Prisma no expresa van a mano en la migración, comentados. RLS solo en las tablas de permisos (`usuario`, `membresia`); las demás tablas no tienen.
- **Platos recomendados por el dueño (S9):** `ItemMenu.recomendadoEn DateTime?` (migración `20260701120000`): recomendado = `recomendadoEn` no nulo (`items.service.ts` lo expone como `esRecomendado`; `menu.service.ts` arma la sección `recomendados` con eso). El contexto de la Fase 4 lo lee de ahí: no se duplica.
- **Seed actual:** `prisma/seed.ts`, idempotente, con UUIDs fijos, `upsert` con `update: {}` (re-seedear no pisa lo editado desde el panel) y `updateMany` con guarda para los descuentos. Restaurante Seed tiene 9 platos en 3 categorías, sin descripciones ni recomendados. Se corre con `prisma db seed` (`package.json#prisma.seed`).
- **Migraciones sin mergear:** la única rama sin mergear con una migración es `origin/fix/356-mozo-id-desde-jwt` (`20261014222232_add_admin_id_to_pago`), anterior a la última de `main` (`20261025120000_fase5_login_legacy`). La fecha de hoy (20261101…) es posterior a todas: no hay choque.
- **Base local:** `DATABASE_URL` y `DIRECT_URL` apuntan a `localhost:5433/menyu` (`menyu-postgres` de `apps/backend/docker-compose.yml`). `prisma migrate status`: 36 migraciones, al día.
- **CI (`.github/workflows/ci.yml`):** `prisma generate`, `turbo typecheck` (api, web-admin, web-cliente, web-staff, web-auth, auth-client), `turbo lint` (el del backend es un `echo`), `turbo test` y los tests de `scripts/`. `prisma/` está fuera de `sonar.sources`.

### Hallazgo para el checkpoint de Lauti: `ClasificacionDieta` ya existe

El repo ya tiene un catálogo de dietas: `ClasificacionDieta` + `ItemClasificacion` (módulo `src/clasificaciones/`, pestaña en web-admin y el filtro "Dietas" de la carta de web-cliente). Es un catálogo **global** de nombres libres (lo edita el OWNER o el GERENTE de cualquier restaurante, "deuda de la entrega 4.3"); en la base local está vacío. La spec pide `etiquetasDietarias EtiquetaDietaria[]` (array de enum) y la decisión 4 de la planificación supone que las etiquetas y filtros visibles son trabajo futuro, sin mencionar este catálogo. No es una contradicción que impida implementar (la spec fija el tipo y no hay decisión cerrada que lo contradiga), así que se implementa como dice la spec. Argumento a favor de mantenerlo así: un vocabulario cerrado por plato es lo que necesita la regla 4 ("sin TACC": repetir lo declarado), y el catálogo global lo puede renombrar cualquier dueño de otra marca. Queda para Lauti decidir si a futuro se unifican, y para la Fase 4 si el contexto suma también las clasificaciones del catálogo.

### Qué se hizo

- `apps/backend/prisma/schema.prisma`: enums `TamanioPorcion`, `Temperatura`, `NivelPicante` y `EtiquetaDietaria` (tipos `tamanio_porcion`, `temperatura`, `nivel_picante`, `etiqueta_dietaria`); los nueve campos en `ItemMenu` con los nombres de la spec; modelos `InformacionLocal`, `PreguntaFrecuente` y `RegistroAsistente`, con las relaciones inversas en `Restaurante` y `SesionMesa`.
- Migración `20261101151932_asistente_modelo_de_datos`: solo `CREATE TYPE`, `ALTER TABLE item_menu ADD COLUMN` (todas nullable), `CREATE TABLE`, índices y FKs, con un encabezado comentado. No toca datos existentes: verificado en la base antes del seed (9 ítems, todos con `etiquetas_dietarias = '{}'` y el resto en null).
- `apps/backend/prisma/seed.ts` (Restaurante Seed, `22222222-2222-4222-a222-222222222222`):
  - `InformacionLocal` con `asistenteHabilitado=true`, horarios, formas de pago, wifi sí, pet friendly no, accesible sí, opciones para chicos sí y **estacionamiento en null**.
  - Datos del plato en 9 de los 10 platos. Cada valor de cada enum aparece al menos una vez: porción INDIVIDUAL (Empanada, Hamburguesa, Bife, Bowl), PARA_COMPARTIR (Provoleta, Vino), PARA_N_PERSONAS (Milanesa, 2 personas); temperatura CALIENTE, FRIO (Bowl, Agua, Cerveza), AMBIENTE (Vino); picante NADA, SUAVE (Provoleta), MEDIO (Empanada), ALTO (Hamburguesa); etiquetas VEGETARIANO (Provoleta, Bowl), VEGANO (Bowl), SIN_TACC (Provoleta, Bife, Bowl), SIN_LACTOSA (Bife, Bowl). **Rabas sin nada** (ni descripción).
  - Descripciones en 8 platos (solo si no tenían), Provoleta y Bife de Chorizo recomendados (`recomendadoEn`), un plato nuevo (Bowl de Quinoa, 3900, Principales) y 5 FAQs (reservas, delivery, celíacos, cumpleaños, cubierto).
  - Restaurante Seed 2 (`eeeeeeee-0002-4002-a002-000000000002`) queda sin `InformacionLocal`: asistente apagado.
  - Idempotente con los patrones del seed: `upsert` con `update: {}` y `updateMany` con guarda (los datos del plato entran solo si el plato no tiene ninguno; las descripciones, solo si es null).

### Decisiones tomadas por ambigüedad

1. **`createdAt` en lugar de `creadoEn`** (y `updatedAt` en `PreguntaFrecuente`). La spec dice "nombres propuestos… siguiendo el esquema actual" y deja las convenciones como "A verificar": el schema usa `createdAt @map("created_at")` en 12 modelos (los más nuevos incluidos) contra 2 con `creadoEn`. Quedó anotado en la sección de la Fase 1 de la spec para que las Fases 4 y 5 usen `createdAt`.
2. **`RegistroAsistente.createdAt` es `timestamptz(3)`**, como `HistorialRoot` (la otra tabla de log): el tope diario cuenta desde el inicio del día UTC y así no depende de la zona horaria de la sesión de la base. El resto de los timestamps nuevos siguen el `TIMESTAMP(3)` habitual.
3. **`InformacionLocal` con `id` propio y `restauranteId @unique`** ("FK única" de la spec), sin timestamps (la spec no los lista). El upsert de la Fase 2 va por `where: { restauranteId }`.
4. **`onDelete`:** las tres tablas borran en cascada con su restaurante (precedente: `Membresia`). En la app los restaurantes se dan de baja con `activo`, así que solo importa para limpiezas de tests como `sessions.e2e-spec.ts`, que borra restaurantes. `RegistroAsistente.sesionMesaId` es `SetNull`: el registro sobrevive si se borrara la sesión.
5. **`etiquetasDietarias @default([])`**: las filas existentes quedan en `{}` (= sin etiquetas declaradas). La columna es nullable, como genera Prisma las listas; el default evita nulls.
6. **Sin CHECK en la base para "porcionPersonas solo con PARA_N_PERSONAS"**: queda en el comentario del schema y se valida en la Fase 2 (DTO/service). Un CHECK haría fallar con 500 un PATCH que cambie `tamanioPorcion` sin limpiar `porcionPersonas`.
7. **Índice extra `pregunta_frecuente(restaurante_id, created_at)`**: el contexto lee las FAQs del restaurante, ordenadas por creación, en cada pregunta. Los tres índices de `RegistroAsistente` son los de la spec.
8. **"Al menos uno con cada enum"** se leyó como cada valor de cada enum (la lectura más fuerte, mejor para el set de la Fase 7).
9. **Lo que suma el seed además de lo pedido:** descripciones, dos recomendados y un plato vegano. La carta no tenía nada vegano ni recomendados, y la Fase 7 necesita poder evaluar "¿tienen algo vegano?" y "¿qué me recomendás?".
10. **Sin RLS en las tablas nuevas**, como todas las tablas salvo las de permisos (`usuario`, `membresia`). `registro_asistente` no guarda datos personales. Si se quisiera cerrar a la Data API de Supabase, es una migración de una línea por tabla.
11. **`ClasificacionDieta`**: se implementó `etiquetasDietarias` como pide la spec (ver "Hallazgo para el checkpoint de Lauti" arriba).

Commit: `feat(db): modelo de datos del asistente de mesa (Fase 1)`. El hash lo registra el orquestador al cierre: un commit no puede contener su propio hash.

### Verificación

- typecheck ✓: el comando del CI (`turbo typecheck` de api, web-admin, web-cliente, web-staff, web-auth, auth-client), 7/7. El seed, que el `tsc` del backend no incluye (`rootDir: src`) y que corre con `--transpile-only`, se chequeó aparte con un tsconfig temporal: sin errores.
- lint ✓: el comando del CI, 5/5 (el del backend sigue siendo un `echo`).
- tests ✓: backend 2021 pasan y 36 se saltean, en 84 suites. Los 36 son los 3 `*.base.spec.ts`, que piden `TEST_DATABASE_URL`; se corrieron aparte contra la base local ya migrada y pasaron los 39 tests, en transacciones revertidas, sin dejar filas (verificado). Los frontends, en verde desde la caché de turbo (web-admin 48 archivos, web-cliente 42, web-staff 14, web-auth 9, auth-client 10, ui 5). Tests de `scripts/`: 78/78. No se agregaron tests: la fase no los pide.
- "Terminado cuando", punto por punto:
  1. `prisma migrate dev` corre limpio en la base local ✓: aplicó `20261101151932_asistente_modelo_de_datos` contra `localhost:5433/menyu` (la base shadow volvió a correr las 37 migraciones sin error). Una segunda corrida responde "Already in sync".
  2. El seed deja los datos descritos ✓: verificado con consultas a la base (lo de "Qué se hizo"). Corrido dos veces: el estado de la base es idéntico (diff vacío), sin duplicados.
  3. typecheck y tests del backend pasan ✓.

Llamadas reales al modelo: 0.

### Para el revisor / fases siguientes

- **Checklist del revisor:** servicios tri-estado = `Boolean?` sin default en `InformacionLocal`; `asistenteHabilitado Boolean @default(false)`; etiquetas = array del enum `etiqueta_dietaria` con default `{}`; los tres índices de `registro_asistente` en la migración; la migración solo agrega cosas (ver el SQL).
- **Fase 2:** `items.service.ts` arma las respuestas del panel con `...rest` del ítem, así que los campos nuevos ya salen en las respuestas del panel: falta que el DTO los acepte (enums con `IsEnum`, el array con `IsEnum({ each: true })`, `null` para limpiar) y validar lo de `porcionPersonas`. La carta pública (`menu.service.ts`, `serializeItem`) arma el ítem campo por campo y no cambió (decisión 4). `asistenteHabilitado` se lee de `InformacionLocal`: sin fila = `false`.
- **Fase 4:** el contexto marca "Recomendado por el local" con `recomendadoEn` no nulo; `porcionPersonas` solo cuenta con `PARA_N_PERSONAS`; decidir si el contexto suma también las clasificaciones de `ClasificacionDieta`. Para probar a mano: Restaurante Seed tiene el asistente prendido; Restaurante Seed 2, apagado (403 `asistente_deshabilitado`); la mesa 99 (QR `TEST-QR-SEED-002`, PIN 9998) da token de sesión de mesa en Restaurante Seed.
- **Fase 5:** el campo es `createdAt` (timestamptz) y el índice `(createdAt)` es el del contador diario.
- **Base local de otra sesión:** en una base ya seedeada, `prisma migrate dev` + `prisma db seed` cargan todo lo nuevo; las guardas dejan pasar los datos porque las columnas nuevas arrancan vacías.
- **Fuera de alcance, sin tocar:** Prisma avisa que `package.json#prisma` (donde está el comando del seed) está deprecado y que se va en Prisma 7; hoy `prisma db seed` lo sigue tomando aunque exista `prisma.config.ts`. Habría que pasarlo a `migrations.seed` de `prisma.config.ts` antes de subir a Prisma 7.

## Cierre de la Fase 1 (orquestador, 2026-11-01)

- **Veredicto del revisor:** APROBADA CON OBSERVACIONES. Bloqueantes: ninguno. Rondas de corrección: 0.
- **Commit de la fase:** `16c69b9`. Criterio "Terminado cuando" y checklist "Revisor:" verificados punto por punto (migración limpia, seed completo, typecheck y tests del backend en verde, alcance correcto).
- **Llamadas reales acumuladas:** 1 de 200 (solo la prueba de precondición). **Restante: 199.**
- **Observaciones del revisor no aplicadas** (quedan anotadas para las fases siguientes y para Lauti):
  1. La spec todavía dice `creadoEn` en las líneas de `RegistroAsistente` (~89), índices (~98) y tabla de límites (~122); el campo real es `createdAt`. **El orquestador lo pasará explícito en los prompts de las Fases 4 y 5.**
  2. `apps/backend/README.md` ("9 ítems") y `Documentacion/datos-de-prueba-local.md` quedaron desactualizados respecto del seed nuevo (10 ítems, recomendados, descripciones, asistente prendido). Pendiente menor de docs.
  3. **`ClasificacionDieta` duplicada** (decisión para Lauti en el checkpoint): el filtro "Dietas" de la carta sale del catálogo global y el asistente va a leer `etiquetasDietarias`; pueden divergir. Decidir antes de la Fase 4 si el contexto suma también el catálogo.
  4. La Fase 2 tiene que validar `@IsInt() @Min(1)` en `porcionPersonas` y `tiempoPreparacionMin`, y definir qué pasa con `porcionPersonas` cuando `tamanioPorcion` deja de ser `PARA_N_PERSONAS`. **Se pasará en el prompt de la Fase 2.**
  5. Menores sin acción: `etiquetas_dietarias` admite NULL por SQL directo (impacto despreciable); la cascada de `RegistroAsistente` con el restaurante baja el contador diario si un e2e borra restaurantes (tenido en cuenta).
- **Checkpoint de la orquestación:** la corrida se frena acá para pedirle a Lauti el visto bueno del schema antes de la Fase 2.

## Checkpoint del schema — resuelto (orquestador, 2026-11-01)

Lauti dio el **visto bueno al schema de la Fase 1** tal como está (incluidas las decisiones `createdAt`, timestamptz, cascadas y validaciones de rango en la Fase 2). Además decidió sobre el hallazgo de `ClasificacionDieta`: **el contexto de la Fase 4 incluye también las clasificaciones del catálogo global de cada plato, aclarando su origen**, además de `etiquetasDietarias`. La corrida sigue desatendida con las Fases 2–7.

---

## Fase 2 — API de administración (2026-11-01)
Estado: completada
Plan y "A verificar" resueltos: en las subsecciones "Plan" y "A verificar en plan mode" de abajo, escritas antes de tocar código.

### Plan (escrito antes de tocar código)

1. **Plato (`PATCH /items/:id`):** `UpdateItemDto` suma los nueve campos (`@IsEnum` para los tres enums, `@IsArray` + `@IsEnum({ each: true })` para las etiquetas, `@IsInt() @Min(1)` + un `@Max` de dominio para `porcionPersonas` y `tiempoPreparacionMin`, textos con tope y sin carácter nulo). `null` borra cada campo (`@IsOptional()` deja pasar null). `ItemsService.update`: etiquetas `null` → `[]` (la columna es una lista; vacía = sin etiquetas) y sin repetidas; `porcionPersonas` se borra al guardar si el plato queda con un tamaño que no es `PARA_N_PERSONAS`. Las respuestas del panel ya traen los campos (`serializeItem` hace `...rest`).
2. **Información del local:** módulo nuevo `src/informacion-local/` con `GET` y `PUT /restaurantes/:restauranteId/informacion-local` (upsert parcial, flag incluido) y `select` explícito. Sin fila, `GET` devuelve todo en null y el flag en `false`.
3. **Preguntas frecuentes:** módulo nuevo `src/preguntas-frecuentes/` con `GET`, `POST`, `PUT /:id` y `DELETE /:id` bajo `/restaurantes/:restauranteId/preguntas-frecuentes`. Editar o borrar una de otro restaurante → 404.
4. **Permisos:** `@RequiereRol(...ADMINISTRACION)` a nivel de controller, como `PersonalController` (mismo par de guards, `SupabaseAuthGuard` + `MembresiaGuard`, y el mismo grupo de roles que la edición de la carta). No hace falta tocar `rutas-por-autenticacion.spec.ts`: no son rutas `@Personal()`.
5. **Carta pública (`GET /menu/:restauranteId`):** `restaurante.asistenteHabilitado` (de `InformacionLocal`; sin fila, `false`).
6. **`@menyu/types`:** los enums como uniones, `InformacionLocal`, `PreguntaFrecuente`, los campos nuevos (opcionales) en `ItemMenu` y `asistenteHabilitado` en `MenuPublico`, para que las Fases 3 y 6 no los dupliquen.
7. **Swagger:** `@ApiTags`/`@ApiOperation`/`@ApiResponse` en los controllers nuevos y `@ApiProperty` con `enum`/`nullable` en los DTOs.
8. **Tests (1 feliz + error principal por módulo):** info local (PUT guarda y GET la devuelve; rol sin permiso → 403), plato (los campos nuevos se guardan; enum inválido → 400), FAQs (alta y listado; baja de una de otro restaurante → 404/403) y el flag en la carta pública.
9. **Verificación con curl contra local** sin tocar staging: backend de la rama en otro puerto con `SUPABASE_URL` apuntando a un JWKS local (servidor de prueba en el scratchpad, que firma tokens para el `supabaseUserId` ficticio del OWNER del seed y el del MOZO). Al terminar, dejar los datos del seed como estaban (las Fases 4 y 7 dependen de ellos).

### "A verificar en plan mode", resueltos leyendo el código

- **Guards de la edición de la carta:** desde la entrega 4.3 de auth, todo sobre Supabase. Las rutas de un restaurante usan `@RequiereRolEn({ body | query }, ...ADMINISTRACION)` (`POST`/`GET /items`, `/categorias`) o `@RequiereRol(...ADMINISTRACION)` con `:restauranteId` (`PersonalController`); las de un recurso, `@Personal()` + `AccesoService.exigirRol(..., ADMINISTRACION)` en el service (`PATCH /items/:id`). `ADMINISTRACION` = OWNER (de la marca) y GERENTE (del restaurante), en `auth/roles-del-personal.ts`. Solo el borrado de ítems y categorías es solo OWNER (el de ingredientes es ADMINISTRACION). No queda nada del `@Roles` legacy.
- **Endpoint de edición del plato:** `PATCH /items/:id` (`ItemsController.update` → `ItemsService.update`), con `UpdateItemDto`. `ValidationPipe({ whitelist: true, transform: true })` global: un campo sin decorador se descarta en silencio (por eso el test feliz del endpoint comprueba que los campos lleguen al service).
- **Endpoint público de la carta:** `GET /menu/:restauranteId` (`MenuService.getMenuPublico`). Lo usan las dos vistas de web-cliente (mesa y carta desde Discovery), las dos con `MenuView` y `api.menu` (`services/api.ts`). Arma la respuesta campo por campo, así que el flag hay que sumarlo explícito. `GET /discovery/restaurantes/:id` no lo necesita (no muestra la carta).
- **Swagger:** `DocumentBuilder` en `main.ts`, plugin `@nestjs/swagger` en `nest-cli.json`; los DTOs igual declaran `@ApiProperty` explícito.
- **Tests de endpoints:** `crearAppDeEndpoints` (`src/test/app-endpoints.ts`) con las cuentas de `CUENTAS` y el `MUNDO` de `acceso-de-test.ts`; `crearPrismaMock` para los services.
- **Migración:** esta fase no agrega ninguna (el schema de la Fase 1 alcanza).
- **CI:** `turbo typecheck`, `turbo lint` (el del backend es un `echo`) y `turbo test`, más los tests de `scripts/`.

### Qué se hizo

- **Plato:** `items/dto/update-item.dto.ts` suma los nueve campos con Swagger (`enum`, `nullable`, topes). `items.service.ts` (`update`): etiquetas `null` → `[]` y sin repetidas, y `porcionPersonasCoherente` borra `porcionPersonas` si el tamaño que queda no es `PARA_N_PERSONAS`.
- **Información del local:** `src/informacion-local/` (module, controller, service, `dto/update-informacion-local.dto.ts`). `GET` y `PUT /restaurantes/:restauranteId/informacion-local`, `select` explícito sin el `id` de la fila; la respuesta lleva `restauranteId`.
- **Preguntas frecuentes:** `src/preguntas-frecuentes/` (module, controller, service, `dto/pregunta-frecuente.dto.ts`). `GET`, `POST` (201), `PUT /:id` y `DELETE /:id` (204) en `/restaurantes/:restauranteId/preguntas-frecuentes`; el restaurante sale siempre de la ruta.
- **Textos libres:** `src/common/texto-libre.ts` con `TextoOpcional(max)` (recorta; vacío o `null` borra) y `TextoObligatorio(max)`, los dos con `SinCaracterNulo` (Postgres no acepta el carácter nulo: sería un 500).
- **Carta pública:** `menu.service.ts` suma `informacionLocal: { select: { asistenteHabilitado: true } }` y devuelve `restaurante.asistenteHabilitado` (sin fila, `false`); la descripción de Swagger de `GET /menu/:restauranteId` lo menciona.
- **`AppModule`** registra `InformacionLocalModule` y `PreguntasFrecuentesModule`.
- **`@menyu/types`:** `asistente.types.ts` nuevo (los cuatro enums como uniones, `DatosDelPlatoParaElAsistente`, `InformacionLocal`, `PreguntaFrecuente`), `ItemMenu extends Partial<DatosDelPlatoParaElAsistente>` y `MenuPublico.restaurante.asistenteHabilitado?`.
- **Tests (27 nuevos):** `informacion-local-endpoints.spec.ts` y `preguntas-frecuentes-endpoints.spec.ts` (ruta, `ValidationPipe` y service reales; la base, en memoria con `crearPrismaMock`); en `items.service.spec.ts`, "update — datos para el asistente"; en `items-endpoints.spec.ts`, "PATCH /items/:id: los datos para el asistente"; en `menu.service.spec.ts`, el flag (y los dos tests que fijan la forma exacta de la respuesta y del `select`, actualizados).
- Sin migración y sin dependencias nuevas.

### Decisiones tomadas por ambigüedad

1. **Rutas anidadas en `/restaurantes/:restauranteId/…`** con `@RequiereRol(...ADMINISTRACION)` a nivel de controller, como `PersonalController`, y no planas como las de la carta (`/items?restauranteId=`): es el mismo par de guards y el mismo grupo de roles, y la información del local es 1:1 con el restaurante. Al tener `MembresiaGuard`, no van en la lista de `@Personal()` de `rutas-por-autenticacion.spec.ts` (el spec pasa sin tocarlo).
2. **Dos módulos de primer nivel** (`informacion-local`, `preguntas-frecuentes`), como los de la carta (uno por entidad). `src/asistente/` queda para la Fase 4 (contexto, proveedor y registro).
3. **Todo con `ADMINISTRACION` (OWNER y GERENTE), también el flag y el borrado de FAQs.** La Fase 2 pide "exactamente los mismos roles que la edición de la carta"; el borrado solo del OWNER de ítems y categorías protege la historia de pedidos y la estructura de la carta (el de ingredientes ya es `ADMINISTRACION`). "Que el dueño prende" (decisión 3) se leyó en sentido amplio.
4. **`PUT` de la información del local = upsert parcial:** lo que no viene no cambia y `null` lo borra. Así el switch puede mandar solo `{ asistenteHabilitado }` y el formulario, el resto. `asistenteHabilitado: null` da 400 (la columna no admite null).
5. **Edición de FAQ con `PUT` y las dos partes obligatorias:** un solo DTO para alta y edición (una FAQ se edita como par). Una FAQ de otro restaurante da 404 desde el propio (no se revela si existe) y 403 desde el ajeno (el guard).
6. **`porcionPersonas` (pedido del revisor de la Fase 1):** se borra al guardar si el plato queda con un tamaño que no es `PARA_N_PERSONAS` o sin tamaño, aunque venga en el body (no es un 400: el formulario puede mandar todo su estado sin limpiar a mano). `PARA_N_PERSONAS` sin `porcionPersonas` se acepta (N sin declarar). Si no se manda ninguno de los dos campos, no se toca.
7. **Topes `@Max` además de `@IsInt() @Min(1)`:** 100 personas y 600 minutos. Sin tope, un entero fuera de `int4` llega a Prisma y da 500.
8. **Topes de los textos** (detalle de la porción 100, acompañamiento 200, información adicional 500, horarios 500, formas de pago 200, pregunta 200, respuesta 1000): van al prompt en cada pregunta, así que también acotan el contexto. Recortados y, en los opcionales, vacío = `null`.
9. **Etiquetas:** `null` → `[]` (Prisma no admite null en una lista) y una repetida se guarda una vez (no es un 400).
10. **`POST /items` no acepta los campos nuevos:** la spec habla del "endpoint de edición" y el formulario de web-admin ya hace llamadas después del alta (imagen, clasificaciones, ingredientes). Ojo: el `ValidationPipe` los descartaría en silencio.
11. **Tipos en `@menyu/types`,** para que las Fases 3 y 6 no los dupliquen (regla del CLAUDE.md). Los campos del plato van opcionales en `ItemMenu` y `asistenteHabilitado` opcional en `MenuPublico.restaurante`, para no romper los fixtures de web-admin y web-cliente (el backend siempre los manda). No se tocaron los `*Request` de `api/requests.ts`: están desactualizados y nadie los usa (web-admin define los suyos en `services/api.ts`).
12. **Sin `menu:updated`** al cambiar la información del local o las FAQs: de la carta pública solo cambia el flag; si la Fase 6 lo necesita, lo decide ahí.
13. **Verificación con un JWKS local** y no con el login del Supabase de staging que usa `docs/probar-consola-root.md`: así no se tocó staging (ver la receta abajo).

Commit: `feat(api): API de administración del asistente de mesa (Fase 2)`. El hash lo registra el orquestador al cierre (un commit no puede contener su propio hash).

### Verificación

- typecheck ✓: el comando del CI (`turbo typecheck` de api, web-admin, web-cliente, web-staff, web-auth y auth-client), 7/7, con `@menyu/types` recompilado.
- lint ✓: el comando del CI, 5/5 (el del backend sigue siendo un `echo`).
- tests ✓: backend 2048 pasan y 36 se saltean, en 86 suites (eran 2021 en 84: +27 tests, +2 suites). Los 36 son los 3 `*.base.spec.ts` (acceso, usuarios e historial de ROOT, que esta fase no toca), que piden `TEST_DATABASE_URL`. Frontends en verde (web-admin 48 archivos, web-cliente 42, web-staff 14, web-auth 9, auth-client 10, ui 5). Tests de `scripts/`: 78/78. Cobertura del código nuevo y cambiado: 100 % de líneas (`informacion-local`, `preguntas-frecuentes`, `texto-libre.ts`, `items.service.ts`, `menu.service.ts`).
- "Terminado cuando", punto por punto:
  1. **Los tests pasan** ✓ (arriba). Los seis que pide la fase: info local, `PUT` guarda y `GET` la devuelve, y rol sin permiso → 403 (MOZO, JEFE_SALON, COCINA, ROOT, OWNER de otra marca, GERENTE de otra sucursal); plato, los campos nuevos se guardan, y enum inválido → 400 (más `porcionPersonas` y `tiempoPreparacionMin` en 0, con decimales o como texto); FAQs, alta y listado (con edición y baja), y baja de una de otro restaurante → 404 desde el propio y 403 desde el ajeno.
  2. **Con curl contra local, se cargaron y quedaron en la base** ✓, verificado con `psql` en `menyu-postgres`:
     - Información del local: alta en Restaurante Seed 2, que no tenía fila (GERENTE, upsert create), y `PUT` parcial en Restaurante Seed (OWNER; cambió solo lo enviado). El MOZO recibe 403 en `GET` y `PUT`; sin token, 401; `asistenteHabilitado: null`, 400. `GET /api/menu/:id` devolvió `asistenteHabilitado: true` para Seed y `false` para Seed 2.
     - Una FAQ en Restaurante Seed (con espacios de más, recortados), editada con `PUT`; listada (6); borrarla desde Seed 2 → 404; el MOZO → 403; respuesta vacía → 400.
     - Los nueve campos en un plato del seed (Rabas): guardados tal cual, con las etiquetas sin repetir; `temperatura: "TIBIO"` → 400, `porcionPersonas: 0` → 400, el MOZO → 403; al pasarlo a `INDIVIDUAL`, `porcionPersonas` quedó en null. Con el body desde un archivo UTF-8, los acentos llegan bien a la base (`ó` = `c3 b3`).
     - Después se dejó el seed como estaba: Rabas con todo en `null` vía `PATCH` (las etiquetas en `[]`: prueba que `null` borra), la información de Seed vuelta a sus valores vía `PUT` (con `estacionamiento: null`), la FAQ borrada vía `DELETE` (204) y la fila de prueba de Seed 2 borrada con `psql` (la API no borra la información del local). Un snapshot antes y después de `informacion_local`, `pregunta_frecuente` y los platos de Restaurante Seed da **sin diferencias**.
  3. **Swagger** ✓: `/docs-json` lista las seis rutas nuevas, los enums en `UpdateItemDto` y los DTOs nuevos.

Llamadas reales al modelo: 0.

### Para el revisor / fases siguientes

- **Receta para probar con curl en local sin Supabase** (no toca staging): un JWKS propio con una clave ES256 y tokens firmados para los `supabaseUserId` que ya están en la base local. `SupabaseAuthGuard` verifica la firma, `iss` = `<SUPABASE_URL>/auth/v1` y `aud` = `authenticated`, así que alcanza con levantar el backend con `SUPABASE_URL` apuntando a ese servidor:

  ```js
  // jwks-local.js (fuera del repo). node jwks-local.js → escribe token-<cuenta>.txt y sirve el JWKS en :54999
  const jose = require('<repo>/apps/backend/node_modules/jose'), http = require('http'), fs = require('fs')
  const URL_BASE = 'http://localhost:54999'
  const CUENTAS = { owner: 'ffffffff-0002-4002-a002-000000000002', mozo: 'd8f4bdff-7b9a-4596-9ecc-21b2d3c44d06' }
  ;(async () => {
    const { publicKey, privateKey } = await jose.generateKeyPair('ES256')
    const jwk = { ...(await jose.exportJWK(publicKey)), kid: 'local-1', alg: 'ES256', use: 'sig' }
    for (const [nombre, sub] of Object.entries(CUENTAS)) {
      const token = await new jose.SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: 'local-1' })
        .setSubject(sub).setIssuer(`${URL_BASE}/auth/v1`).setAudience('authenticated')
        .setIssuedAt().setExpirationTime('2h').sign(privateKey)
      fs.writeFileSync(`token-${nombre}.txt`, token)
    }
    http.createServer((req, res) => req.url === '/auth/v1/.well-known/jwks.json'
      ? res.end(JSON.stringify({ keys: [jwk] }))
      : (res.writeHead(404), res.end())).listen(54999)
  })()
  ```

  Backend: `cd apps/backend && npx nest build && PORT=3100 SUPABASE_URL=http://localhost:54999 node dist/main.js` (no pisa el `.env`: dotenv no reemplaza variables ya definidas). `owner@menyu.com` del seed (`supabaseUserId` ficticio `ffffffff-0002-…`) es OWNER de Marca Seed; el MOZO de Restaurante Seed es `mozo-supabase.pruebas-auth@…` (`d8f4bdff-…`), vinculado en esta base local (en otra puede no estar). En Windows, mandar los bodies con acentos desde un archivo (`--data-binary @body.json`): Git Bash le pasa a `curl.exe` los argumentos en otra codificación y llegan como `�`.
- **Fase 3 (web-admin):**
  - Para borrar un campo hay que mandar `null` (o `""` en los textos); `undefined` no lo toca. Hoy el formulario del plato manda `descripcion: descripcion.trim() || undefined`, así que **la descripción no se puede borrar desde el panel** (preexistente, fuera de alcance; no repetir el patrón con los campos nuevos).
  - En el alta de un plato, los datos para el asistente van en un `PATCH /items/:id` después del `POST` (el `POST` los descarta).
  - El switch puede mandar solo `{ asistenteHabilitado }` al `PUT` de la información del local. La edición de una FAQ es `PUT` con las dos partes.
  - Los tipos están en `@menyu/types` (`InformacionLocal`, `PreguntaFrecuente`, `TamanioPorcion`…); los inputs se definen en `services/api.ts`, como el resto de web-admin.
  - Errores de validación: 400 con `message` como lista (los de class-validator, en inglés), como el resto de la API.
- **Fase 4 (contexto):** la cantidad de FAQs por restaurante no tiene tope (los textos sí); si el contexto crece, decidir ahí. Sin fila de `InformacionLocal`, el asistente está apagado. La API mantiene `porcionPersonas` coherente con `PARA_N_PERSONAS`, pero lo cargado por SQL o por el seed no pasa por ahí: que el contexto igual lo muestre solo con ese tamaño.
- **Fase 6 (web-cliente):** el flag llega en `GET /menu/:restauranteId` como `restaurante.asistenteHabilitado`; en `MenuPublico` es opcional (si se vuelve obligatorio, actualizar `crearMenu` de `src/test/fixtures.ts`).
- **Fuera de alcance, sin tocar:** la matriz por ruta de `docs/auth/specs/auth.md` no lista las rutas nuevas; `CreateItemRequest` y `UpdateItemRequest` de `@menyu/types` están desactualizados y sin uso.

## Cierre de la Fase 2 (orquestador, 2026-11-01)

- **Veredicto del revisor:** APROBADA CON OBSERVACIONES. Bloqueantes: ninguno. Rondas de corrección: 0.
- **Commit de la fase:** `caec562`. "Terminado cuando" y checklist "Revisor:" verificados con curl contra local (permisos 401/403 en las 7 operaciones, `null` borra, flag en la carta pública, base restaurada idéntica).
- **Llamadas reales acumuladas:** 1 de 200. **Restante: 199.**
- **Observaciones no aplicadas / decisiones del orquestador:**
  1. **Más tests que los ~6 de la spec (27, en tablas `it.each`).** Decisión del orquestador: se quedan — son rápidos, y el gate de SonarCloud sobre código nuevo favorece la cobertura (regla del proyecto). No se lanza corrección por esto.
  2. **El GERENTE también puede prender `asistenteHabilitado`** (la definición dice "el dueño"). Coherente con "mismos roles que la edición de la carta", pero prender el flag habilita gasto y hay precedente de campos solo-OWNER (dirección, logo). **Queda para confirmación de Lauti en el informe final.**
  3. **FAQs sin tope de cantidad** — se pasa al prompt de la Fase 4 (afecta tamaño del contexto y TPM del free tier).
  4. La matriz por ruta de `docs/auth/specs/auth.md` no incluye las 6 rutas nuevas (doc, menor).
  5. **`porcionPersonas` se descarta sin aviso si el plato no es `PARA_N_PERSONAS`** — se pasa al prompt de la Fase 3 (ocultar/limpiar el campo en el formulario).

---

## Fase 3 — Formularios en web-admin (2026-11-01)
Estado: completada. La retomó un segundo trabajador después de la pausa del orquestador; ver "Retomada después de la pausa", al final de esta entrada.
Plan y "A verificar" resueltos: en las subsecciones "Plan" y "A verificar en plan mode" de abajo, escritas antes de tocar código.

### "A verificar en plan mode", resueltos leyendo el código

- **Rutas y secciones de web-admin:** `App.tsx` monta todo `/admin/*` dentro de `SoloAdministracion` + `AdminLayout` (`Shell` con el menú de `NAV_BY_ROL` y el título de `SECTION_TITLES`). Las pantallas de OWNER y GERENTE van sin `RoleGuard` (`/admin/menu`, `/admin/tables`, `/admin/mozos`); las de un solo rol, con `RoleGuard`. "Configuración" es una sección del menú solo del OWNER, con una sola pantalla: **Marca y sucursales** (`/admin/marca`, `RoleGuard OWNER`), que es por marca y muestra todas las sucursales. No hay una pantalla de configuración del restaurante, y el GERENTE no tiene sección de configuración. La API del asistente es `ADMINISTRACION` (OWNER y GERENTE) y por restaurante, así que meterlo en Marca y sucursales dejaría afuera al GERENTE.
- **El restaurante de cada pantalla** sale de `useContextStore().selectedRestauranteId` (el selector del menú lateral); el rol, de `useRolActual()`.
- **Formulario del plato:** `pages/admin/menu/ItemFormModal.tsx`, un modal con estilos en línea (`labelSt`, `inputSt`), `useState` por campo y sin librería de formularios. Guarda con `useMenuStore().updateItem` (`PATCH /items/:id`) y, en el alta, `createItem` (`POST /items`) seguido de llamadas sueltas (imagen, clasificaciones, ingredientes) que tragan sus errores. El catálogo de dietas (`ClasificacionDieta`) ya se muestra como chips ("Dietas / Restricciones") si el catálogo tiene algo.
- **Patrones de formulario más nuevos:** `pages/admin/marca/` (`estilos.ts` con los tokens `C`, botones de 44 px, `tarjeta`, `tituloSeccion`, `textoAyuda`; `DireccionField.tsx` con `role="alert"`/`role="status"`, fuente de 16 px en los campos para que iOS no haga zoom, `mensajeDeError`). `menu/ToggleSwitch.tsx` es el interruptor de la app (`role="switch"`).
- **Cliente HTTP:** `services/api.ts` (`req` → `pedirJson`, token de `tokenDeAcceso()`, `ApiError` con el `message` del servidor si es un texto; si es la lista de class-validator queda `Error 400`). Los inputs de cada endpoint se definen ahí (`CreateItemInput`, `UpdateItemInput`). Los tipos de respuesta ya están en `@menyu/types` (`InformacionLocal`, `PreguntaFrecuente`, `DatosDelPlatoParaElAsistente` y los enums).
- **Framework de tests:** Vitest + Testing Library (`@testing-library/react`, `user-event`, `jest-dom`) en jsdom. Los specs de pantallas simulan `@menyu/auth-client` con `test/authClient.ts` y, o bien `services/api` (`ItemFormModal.spec.tsx`, `MarcaPage.spec.tsx`), o bien `fetch` con el `api` real (`api.root.spec.ts`, `PagosPage.spec.tsx`).
- **CI:** `turbo typecheck`, `turbo lint` (web-admin: `eslint . --max-warnings 0`, con `react-refresh/only-export-components`: un `.tsx` no puede exportar funciones que no sean componentes) y `turbo test`.
- **Para la receta del revisor:** la base local ya tiene las cuentas de staging `owner-supabase.pruebas-auth@menyu-app.com` (OWNER de Marca Seed) y `gerente-supabase.pruebas-auth@menyu-app.com` (GERENTE de Restaurante Seed), con su `supabase_user_id`; `apps/backend/.env` apunta `SUPABASE_URL` al Supabase de staging (solo autentica) y tiene el `CORS_ORIGIN_PATTERNS` de `*.menyu.local`; `apps/web-admin/.env.local` y `apps/web-auth/.env.local` existen con `VITE_API_URL=/api` y la cookie en `.menyu.local`.

### Plan (escrito antes de tocar código)

1. **Cliente HTTP (`services/api.ts`):** `UpdateItemInput` suma `Partial<DatosDelPlatoParaElAsistente>`; `api.asistente` con `informacion` (`GET`), `guardarInformacion` (`PUT`, upsert parcial) y `preguntas.listar|crear|editar|borrar` sobre `/restaurantes/:restauranteId/…`. Inputs definidos ahí, tipos de respuesta de `@menyu/types`.
2. **Datos del plato en `ItemFormModal`:** un bloque "Datos para el asistente" al final del formulario, en un componente aparte (`DatosAsistenteFields.tsx`) con la lógica pura en `datosAsistente.ts` (estado del formulario ↔ `DatosDelPlatoParaElAsistente`). Selects con una opción "Sin dato" para tamaño, temperatura y picante; "Para cuántas personas" **solo visible con "Para N personas"** (al elegir otro tamaño se vacía y se manda `null`: lo que se ve es lo que se guarda, por el aviso del revisor de la Fase 2); textos con el `maxLength` del backend; minutos y personas validados en el cliente (enteros, 1–600 y 1–100) antes de llamar a la API; etiquetas como chips (ninguna = sin etiquetas). Vaciar cualquier campo manda `null` (no `undefined`). Edición: un solo `PATCH` con todo. Alta: `POST` y después un `PATCH` con los datos del asistente si hay alguno (el `POST` los descarta); si ese `PATCH` falla, el modal queda abierto con el error y "Crear plato" reintenta solo el `PATCH` (no crea un plato repetido).
3. **Pantalla nueva "Asistente" (`/admin/asistente`, OWNER y GERENTE):** en el menú, sección "Configuración" (la del OWNER suma "Asistente" debajo de "Marca y sucursales"; el GERENTE pasa a tener la sección, solo con "Asistente"). Por restaurante elegido, en tres tarjetas:
   - **Interruptor** del asistente con una línea que explica qué prende; guarda al tocarlo (`PUT { asistenteHabilitado }`) y vuelve atrás si falla.
   - **Información del local:** horarios y formas de pago (vacío = `null`) y los cinco servicios en **tri-estado** con un grupo de radios "Sin dato / Sí / No" (nunca un checkbox), con "Sin dato" dibujado distinto (vacío, borde punteado) de una respuesta declarada, y una línea que explica qué hace el asistente con cada uno. Botón "Guardar información" habilitado solo con cambios.
   - **Preguntas frecuentes:** lista por fecha de creación, alta, edición en el lugar y borrado con confirmación.
   - Errores con el mensaje del servidor (un 403 trae "No tenés permiso para esta acción"); un 500 o un 400 sin texto, con un mensaje propio.
4. **Diseño:** cargada la skill `frontend-design`, con los tokens de web-admin (`C` de `marca/estilos.ts`, Montserrat para títulos, Inter para el texto, tarjetas blancas de borde gris y radio 16, botones de 44 px). Lo único que se destaca es el tri-estado; el resto, igual que Marca y sucursales. Primero el celular (filas que bajan de línea, campos de 16 px).
5. **Tests (feliz + error por formulario):** `ItemFormModal.spec.tsx` (los datos del asistente se cargan y se mandan con `null` al vaciar, con "para cuántas personas" oculto/limpio según el tamaño; y la API falla → se ve el mensaje) y `AsistentePage.spec.tsx` con `fetch` simulado y el `api` real (información del local + interruptor: `GET` y `PUT` con el cuerpo exacto; FAQs: alta y listado; y los errores 403/500 → mensaje). Se ajusta el test existente que fija el cuerpo exacto del `PATCH` del plato.
6. **Verificación:** typecheck, lint y tests del CI para web-admin (y `@menyu/types` sin cambios). El "terminado cuando" (cargar desde la pantalla y verlo en la base) queda para el revisor con la receta; yo no tengo navegador.

> **[PAUSA DEL ORQUESTADOR — 2026-11-01]** Corrida pausada a pedido de Lauti (apagado de la máquina) mientras el trabajador de la Fase 3 completaba su entrega. Estado exacto: implementación completa en el árbol (ver archivos del commit WIP `wip(web-admin)`), la entrada de bitácora de arriba quedó con el plan y los "A verificar" pero **sin** las secciones de estado/verificación/receta, y **no se sabe si typecheck, lint y tests llegaron a correr**. Al retomar: un `trabajador-front` continúa la Fase 3 desde este WIP (verificar todo de cero, completar la entrada de bitácora con la receta para el revisor y hacer el commit final de la fase); después sigue el ciclo normal (revisión con navegador). Fases 1 y 2 cerradas y aprobadas; presupuesto usado: 1 de 200. `ASISTENTE_MAX_PREGUNTAS_DIA` sigue en 50 (original 300, restaurar al cierre).

### Retomada después de la pausa (trabajador-front, 2026-11-01)

Arranqué de cero sobre el WIP `c734431`. El árbol estaba limpio salvo `.claude/settings.local.json`, que queda local y fuera del commit a propósito. Leí la spec, la definición, el CLAUDE.md y la bitácora entera. Después revisé cada archivo del WIP contra el plan de arriba y contra la spec de la Fase 3, incluido lo que el revisor de la Fase 2 dejó para esta fase (`porcionPersonas` oculto y vacío fuera de `PARA_N_PERSONAS`; `null` borra, `undefined` no).

El plan estaba implementado completo, y typecheck, lint y tests de web-admin ya pasaban sobre el WIP (49 archivos, 859 tests). Corregí dos cosas, que están en "Ajustes al retomar".

### Qué se hizo (WIP `c734431` más los ajustes de este commit)

- **Cliente HTTP (`services/api.ts`):**
  - `UpdateItemInput extends Partial<DatosDelPlatoParaElAsistente>`.
  - `api.asistente` con `informacion` (`GET`), `guardarInformacion` (`PUT`, con `GuardarInformacionLocalInput`) y `preguntas.listar|crear|editar|borrar` (con `PreguntaFrecuenteInput`), sobre `/restaurantes/:restauranteId/informacion-local` y `/preguntas-frecuentes`.
  - Los tipos de respuesta salen de `@menyu/types`, sin duplicarlos.
- **`utils/mensajeDeError.ts`:** `mensajeDeLaApi(err, porDefecto)` muestra el mensaje de la API solo si es un 4xx con texto ("No tenés permiso para esta acción"). En los demás casos muestra el mensaje propio de cada pantalla: un 5xx ("Internal server error"), un 400 de class-validator (que llega como "Error 400") o un error de red.
- **Datos del plato (`pages/admin/menu/`):**
  - `datosAsistente.ts` tiene la lógica pura: las opciones de cada enum con su texto, los topes del backend, el formulario a partir del ítem, `conTamanio`, `errorDatosAsistente`, `datosParaGuardar` (los nueve campos, con `null` en los vacíos) y `hayDatosAsistente`.
  - `DatosAsistenteFields.tsx` es el bloque "Datos para el asistente", un `fieldset` con `legend` al final del formulario:
    - Tamaño, temperatura y picante son selects con "Sin dato" como primera opción.
    - "¿Para cuántas personas?" aparece solo con "Para N personas", y elegir otro tamaño lo vacía.
    - Detalle, acompañamiento e información adicional llevan el `maxLength` del backend; la información adicional, también un contador.
    - Las etiquetas dietarias son chips con `aria-pressed`. Si el formulario también muestra el catálogo "Dietas / Restricciones", una línea aclara que son cosas distintas.
  - `estilosFormulario.ts`: `labelSt`, `inputSt` y `chipSt`, movidos de `ItemFormModal` sin cambios para que el bloque nuevo use los mismos estilos.
  - `ItemFormModal.tsx`:
    - En la edición manda un solo `PATCH` con los nueve campos.
    - En el alta manda el `POST` y, solo si hay algún dato del asistente, un `PATCH` después. Si ese `PATCH` falla, el modal queda abierto con el aviso "El plato se creó, pero sus datos para el asistente no se guardaron…". El botón pasa a decir "Guardar datos del asistente" y reintenta solo el `PATCH`, sin crear un plato repetido.
    - Valida las cantidades antes de llamar a la API.
    - El select de Categoría ganó `htmlFor`, y "Dietas / Restricciones" pasó a ser un `role="group"` con nombre: sus chips se llaman igual que algunas etiquetas nuevas ("Sin TACC", "Vegetariano").
- **Pantalla Asistente (`pages/admin/asistente/`, ruta `/admin/asistente`):**
  - **Ruta y menú:** `App.tsx` la monta sin `RoleGuard`, como Menú, Mesas y Personal. `AdminLayout.tsx` la agrega a la sección "CONFIGURACIÓN": el OWNER ve Marca y sucursales y Asistente; el GERENTE, que antes no tenía la sección, ve solo Asistente. La barra superior dice "Asistente".
  - **`AsistentePage.tsx`:** carga en paralelo la información y las preguntas del restaurante elegido. Muestra "Cargando…" mientras tanto y, si falla, el error con un botón "Reintentar". Al cambiar de restaurante, los formularios arrancan de cero y una respuesta atrasada del restaurante anterior no pisa nada.
  - **`InterruptorDelAsistente.tsx`:**
    - Usa el `ToggleSwitch` de la app, con 44 px de alto.
    - Una línea explica qué prende ("Suma a la carta de <restaurante> un chat… no toma pedidos ni llama al mozo").
    - El estado también va en texto: "Prendido: los clientes ven el asistente en la carta." o "Apagado: …".
    - Guarda al tocarlo, mandando solo `{ asistenteHabilitado }`. Si falla, queda como estaba y muestra el error.
  - **`InformacionLocalForm.tsx`:**
    - Horarios (con contador), formas de pago y los cinco servicios.
    - El `PUT` manda los textos vacíos como `null` y nunca incluye el interruptor.
    - "Guardar información" se habilita solo si hay cambios. Mientras tanto avisa "Tenés cambios sin guardar." y, al guardar, "Información guardada".
  - **`ServicioTriestado.tsx`:** cada servicio es un grupo de tres radios de verdad ("Sin dato / Sí / No"):
    - `role="radiogroup"`, se elige con las flechas y el foco se ve.
    - Sí o No elegidos se ven llenos, en el azul de la marca. "Sin dato" elegido es un casillero blanco con borde punteado.
    - Nunca es un checkbox.
  - **`PreguntasFrecuentes.tsx`:**
    - La lista, por fecha de creación.
    - Editar en el lugar, con "Cancelar", y borrar con `window.confirm`, como el plato.
    - Alta con "Agregar pregunta": vacía el formulario y avisa "Pregunta agregada". La respuesta tiene contador.
    - Sin preguntas, un texto que sugiere por cuáles empezar.
  - `informacionLocal.ts` pasa el formulario a `InformacionLocal` y tiene los topes. `estilos.ts` tiene los campos de 44 px de alto y 16 px de letra, como `DireccionField` de Marca y sucursales, para que iOS no haga zoom. Los tokens salen de `marca/estilos.ts`.
- **Tests (7, en dos archivos):**
  - `ItemFormModal.spec.tsx`:
    - Feliz: carga lo guardado y el `PATCH` lleva el cuerpo exacto. Vaciar un campo manda `null`, y pasar de "Para N personas" a "Individual" oculta la cantidad y manda `porcionPersonas: null`.
    - Error: en el alta, el `PATCH` responde 500. Aparece el aviso propio, no "Internal server error", y reintentar guarda sin volver a crear el plato.
    - Se ajustaron los tests que ya existían: el que fija el cuerpo exacto del `PATCH`, y los que buscaban "Sin TACC" sin distinguir los dos grupos de chips.
  - `AsistentePage.spec.tsx`, con el `api` real y `fetch` simulado, para ver el método, la ruta y el cuerpo exactos:
    - Información del local, feliz: el `PUT` lleva el tri-estado y los textos vacíos en `null`.
    - Interruptor, feliz: manda solo el flag.
    - Información del local, error: un 403 muestra el mensaje de la API y no da nada por guardado.
    - Preguntas frecuentes, feliz: lista y alta.
    - Preguntas frecuentes, error: un 500 muestra el mensaje propio y no agrega la pregunta.
- **Spec:** la Fase 3 marcada como hecha, con su "Cómo quedó". **CLAUDE.md:** la línea de la Fase 3 en "Asistente de mesa".

### Ajustes al retomar (en este commit)

1. **Las dos cantidades del plato pasaron de `type="number"` a `type="text" inputMode="numeric"`**, igual que los campos del descuento (`DescuentoModal`).
   - Con `type="number"`, si se escribe algo que no es un número (Firefox deja escribir "15 min"; Chrome, "1e"), el campo devuelve un valor vacío. El formulario lo habría guardado como "sin dato" sin avisar, con el texto todavía a la vista.
   - Ahora lo frena `errorDatosAsistente` ("El tiempo de preparación va en minutos enteros, de 1 a 600."), y en el celular sigue saliendo el teclado numérico.
   - El test feliz ahora espera `'2'` en lugar de `2`.
2. **`AsistentePage` sin restaurante elegido** (una marca sin sucursales) mostraba "Cargando…" para siempre. Ahora dice "Seleccioná un restaurante para configurar su asistente.", como Personal.

### Decisiones tomadas por ambigüedad

1. **Una pantalla propia, `/admin/asistente`, en la sección Configuración**, y no adentro de Marca y sucursales. Esa pantalla es solo del OWNER y es por marca; la API del asistente es de OWNER y GERENTE y es por restaurante. Por eso el GERENTE ahora tiene una sección Configuración, solo con Asistente.
2. **El interruptor guarda al tocarlo, por separado del formulario.** Manda solo `{ asistenteHabilitado }`, el upsert parcial de la Fase 2. Así, prenderlo o apagarlo no guarda la información del local a medio escribir, y tampoco la descarta. El GERENTE también lo ve y lo puede tocar, igual que en la API; falta que Lauti lo confirme (observación 2 del cierre de la Fase 2).
3. **El tri-estado son tres radios segmentados, "Sin dato / Sí / No".** "Sin dato" va primero porque es el estado inicial de todo, y se dibuja como un casillero vacío de borde punteado para que no se confunda con "No". La línea de ayuda dice qué responde el asistente en cada caso.
4. **El formulario del plato manda siempre los nueve campos**, con `null` en los vacíos y `[]` en las etiquetas. Así vaciar un campo lo borra sin tener que llevar la cuenta de qué cambió. La información del local también manda todos sus campos, salvo el interruptor.
5. **"¿Para cuántas personas?" existe solo con "Para N personas".** Elegir otro tamaño lo vacía y se manda `null`: la API lo borraría igual, pero así lo que se ve es lo que se guarda. Si un plato tiene una cantidad cargada por SQL sin ese tamaño, no se muestra y se borra al guardar.
6. **Las cantidades se validan en el cliente con los topes del backend** (1 a 100 personas, 1 a 600 minutos). Los 400 de class-validator llegan en inglés y como lista, y la pantalla los mostraría como "Error 400".
7. **Los errores muestran el mensaje de la API solo si le sirve al dueño** (`mensajeDeLaApi`). Para el resto hay un mensaje propio, con voseo y qué hacer ("Probá de nuevo en un rato"). La edición del plato sigue mostrando `e.message`, como antes de esta fase.
8. **En el alta, el `PATCH` de los datos va solo si hay algún dato, y su error se muestra.** Los errores de la imagen, las clasificaciones y los ingredientes se siguen descartando como antes, pero este no: el dueño creería que los datos del asistente quedaron guardados.
9. **Las etiquetas dietarias van aparte de "Dietas / Restricciones"**, el catálogo global que filtra la carta. Si el catálogo aparece en el formulario, la ayuda aclara que son cosas distintas. Lauti decidió en el checkpoint que el asistente usa las dos.
10. **Estilos.** El bloque del plato usa los estilos del modal, con letra de 13 px como el resto del formulario. La pantalla nueva usa los de Marca y sucursales:
    - los colores de `C`;
    - tarjetas blancas con borde y radio 16;
    - Montserrat en los títulos e Inter en el texto;
    - botones y campos de 44 px, con letra de 16 px en los campos.

    No hay librerías nuevas. Lo único que se destaca es el tri-estado.
11. **Cantidad de tests: un feliz y un error por formulario** (plato, información del local y preguntas frecuentes). El interruptor tiene solo el feliz, porque el "terminado cuando" pide verificar que "prende y apaga el flag". Su caso de error usa el mismo `PUT` y el mismo `mensajeDeLaApi` que ya cubre el test del 403 de la información.

Commits: el WIP `c734431` (la implementación, commiteada en la pausa) más `feat(web-admin): formularios del asistente de mesa (Fase 3)` (los ajustes, la bitácora y la verificación). El hash del segundo lo anota el orquestador al cierre, porque un commit no puede contener su propio hash.

### Verificación

- typecheck ✓: el comando del CI (`turbo typecheck` de api, web-admin, web-cliente, web-staff, web-auth y auth-client), 7/7.
- lint ✓: el comando del CI, 5/5. web-admin corre con `--max-warnings 0`; el lint del backend sigue siendo un `echo`.
- tests ✓: el comando del CI (`turbo test` de api, web-admin, web-cliente, web-staff, web-auth, ui y auth-client), 8/8 tareas. web-admin: 859 tests en 49 archivos (eran 852 en 48 en la línea base: +7 tests y +1 archivo). api: 2048 pasan y 36 se saltean, en 86 suites (los 3 `*.base.spec.ts`, que piden `TEST_DATABASE_URL`; esta fase no toca el backend). web-cliente 759, web-staff 211, web-auth 93, auth-client 80, ui 41. Tests de `scripts/`: 78/78. Una aclaración: en la primera corrida, con todas las suites en paralelo, falló por tiempo `authClientDiferido.spec.ts` de web-cliente (corre ESLint adentro del test y tardó 46 s). Esta fase no toca web-cliente; el test pasa solo en 1,8 s, y el mismo comando del CI con `--concurrency=1` dio todo en verde. Es un test lento cuando la máquina está cargada, no una regresión.
- Cobertura del código nuevo: 96,5 % de líneas y 88,9 % de ramas, medida sobre los archivos de `asistente/`, `datosAsistente.ts`, `DatosAsistenteFields.tsx`, `ItemFormModal.tsx` y `mensajeDeError.ts`. Lo que falta cubrir es sobre todo editar y borrar una pregunta y el "Reintentar" de la carga, que entran en la receta del revisor.
- Sin dependencias nuevas y sin tocar el backend. No se agregó ninguna key ni variable `VITE_*`.
- "Terminado cuando", punto por punto:
  1. **Desde web-admin en local se cargan la información del local, una FAQ y los campos de un plato** → queda **para el revisor** (necesita navegador). Sin navegador ya está verificado lo siguiente:
     - Los tests fijan el método, la ruta y el cuerpo exacto de cada llamada: el `PUT` de la información (con `null` en lo vaciado y el tri-estado), el `POST` de la FAQ y el `PATCH` del plato con los nueve campos.
     - Esos mismos cuerpos ya se probaron con curl contra la base local en la Fase 2.
  2. **Se verifican en la base** → queda **para el revisor**, con las consultas de la receta.
  3. **El switch prende y apaga el flag** → queda **para el revisor**, en el navegador. El test ya fija que manda `PUT { asistenteHabilitado: true }` y que la pantalla muestra el estado que devuelve la API.
- Checklist del revisor de la fase (tri-estado claro, vaciar un campo lo borra, textos en el tono de web-admin): lo comprueba él en el navegador. Desde el código ya se ve que son radios y no un checkbox, que todo lo vaciado se manda como `null` y no `undefined` (lo cubren los tests felices) y que todos los textos van con voseo.

Llamadas reales al modelo: 0.

### Receta para el revisor

Se levanta el backend de la rama contra la base local (`menyu-postgres`, ya migrada y con el seed), y el Supabase de staging se usa solo para autenticar. No toca staging: las cuentas de prueba ya están en la base local con su `supabase_user_id`.

`apps/backend/.env`, `apps/web-admin/.env.local` y `apps/web-auth/.env.local` ya están listos (`VITE_API_URL=/api`, la cookie en `.menyu.local`). Es el mismo procedimiento de "Probar la entrega 4.5 en local" de `docs/auth/usuarios-prueba-staging.md`.

**1. Servidores:** tres terminales, desde la raíz del repo, y después el chequeo de puertos.

```bash
pnpm --filter @menyu/api dev                                                          # API en http://localhost:3000
pnpm --filter @menyu/web-auth exec vite --host 127.0.0.1 --strictPort --port 5173     # login
pnpm --filter @menyu/web-admin exec vite --host 127.0.0.1 --strictPort --port 5174    # panel
netstat -ano | grep -E ':(3000|5173|5174) .*LISTENING'                                # tienen que aparecer los tres
```

- No usar `pnpm --filter <app> dev -- --host 127.0.0.1`: no le pasa el flag a Vite, que queda escuchando solo en `[::1]`.
- Con `--strictPort`, si un Vite viejo tiene el puerto, el nuevo falla en lugar de elegir otro.

**2. Navegador:** `playwright-cli`, corrido desde el scratchpad, con `playwright-cli open --config=<config>.json`. El config lleva:
- `channel: "chrome"`, sin `browserName`;
- `browser.launchOptions.args: ["--host-resolver-rules=MAP *.menyu.local 127.0.0.1"]`, porque la máquina no tiene `*.menyu.local` en el archivo hosts.

**3. Cuentas:** las contraseñas están en `docs/auth/.env.usuarios-staging`; no imprimirlas.
- OWNER de Marca Seed: `STAGING_AUTH_OWNER_EMAIL` / `STAGING_AUTH_OWNER_PASSWORD` (`owner-supabase.pruebas-auth@menyu-app.com`).
- GERENTE de Restaurante Seed: `STAGING_AUTH_GERENTE_EMAIL` / `STAGING_AUTH_GERENTE_PASSWORD` (`gerente-supabase.pruebas-auth@menyu-app.com`).
- Varias: `STAGING_AUTH_VARIAS_EMAIL` / `STAGING_AUTH_VARIAS_PASSWORD`. Es OWNER de Marca Seed y GERENTE de Restaurante Seed 2.
- Se entra por `http://auth.menyu.local:5173`, que redirige a `http://admin.menyu.local:5174/admin`.
- Restaurante Seed (`22222222-2222-4222-a222-222222222222`) tiene el asistente prendido, el estacionamiento sin dato y 5 FAQs. Restaurante Seed 2, de Marca Seed 2, no tiene información cargada.

**4. Antes de tocar nada, guardar el estado de los datos.** Las Fases 4 y 7 dependen del seed, y volver a correr el seed no pisa lo editado, así que hay que dejarlo como estaba a mano. En Git Bash:

```bash
Q="select row_to_json(i)::text from informacion_local i union all select json_build_object('pregunta', pregunta, 'respuesta', respuesta)::text from pregunta_frecuente union all select row_to_json(x)::text from (select nombre, tamanio_porcion, porcion_personas, porcion_detalle, temperatura, nivel_picante, acompanamiento, tiempo_preparacion_min, etiquetas_dietarias, info_adicional from item_menu) x order by 1"
docker exec menyu-postgres psql -U menyu -d menyu -At -c "$Q" > estado-antes.txt   # 16 líneas: 1 información, 5 FAQs, 10 platos
```

Al terminar, correr la misma consulta hacia `estado-despues.txt`; `diff estado-antes.txt estado-despues.txt` tiene que dar vacío.

**5. Flujos:** cada uno en **viewport móvil** (`playwright-cli resize 390 844`) y en **escritorio** (`resize 1280 800`). En el celular, el menú lateral se abre como un panel deslizable.

- **A. Pantalla Asistente:** con el OWNER, en `http://admin.menyu.local:5174/admin/asistente` o desde Configuración → Asistente.
  1. **Carga lo del seed:**
     - El interruptor está prendido y dice "Prendido: los clientes ven el asistente en la carta.".
     - Horarios y formas de pago, cargados.
     - Wifi Sí, Pet friendly No, Accesible Sí y Opciones para chicos Sí.
     - **Estacionamiento en "Sin dato"**: un casillero blanco con borde punteado, distinto de un "No" lleno.
     - "Guardar información", deshabilitado.
  2. **Tri-estado:**
     - Poner Estacionamiento en Sí y guardar: tiene que aparecer "Información guardada". En la base, `select estacionamiento from informacion_local where restaurante_id = '22222222-2222-4222-a222-222222222222'` da `t`.
     - Volver a "Sin dato" y guardar: tiene que dar **NULL**, no `f`.
     - Probarlo también con el teclado (Tab hasta el grupo y después las flechas). El foco se tiene que ver.
  3. **Vaciar borra:** copiar las formas de pago, vaciar el campo y guardar. `formas_pago` tiene que quedar en NULL. Después volver a escribirlas tal cual y guardar.
  4. **Interruptor:**
     - Apagarlo: `asistente_habilitado` queda en `f`, y `curl -s http://localhost:3000/api/menu/22222222-2222-4222-a222-222222222222` trae `"asistenteHabilitado":false`.
     - Prenderlo de nuevo: `t` y `true`.
     - Tocarlo con cambios sin guardar en el formulario de abajo: esos cambios tienen que seguir ahí.
  5. **FAQ:**
     - Agregar una: aparece "Pregunta agregada" y la pregunta queda última.
     - Editarla en el lugar y tocar "Guardar cambios". En la base, `select pregunta, respuesta from pregunta_frecuente where restaurante_id = '22222222-2222-4222-a222-222222222222' order by created_at` la muestra editada.
     - Borrarla (pide confirmación) y comprobar que desapareció de la base.
  6. **Cambio de restaurante** (opcional, con la cuenta Varias): pasar de Restaurante Seed a Restaurante Seed 2 en el menú lateral.
     - La pantalla se recarga vacía: todo en "Sin dato", el interruptor apagado y el texto de "sin preguntas".
     - No guardar nada ahí: crearía una fila en `informacion_local` que la API no puede borrar.
- **B. Datos del plato:** con el OWNER, en Menú, editar un plato y bajar hasta el bloque "Datos para el asistente", al final del modal.
  1. **Rabas** (no tiene ningún dato en el seed):
     - Elegir "Para N personas" en Tamaño: tiene que aparecer "¿Para cuántas personas?".
     - Cargar 3 personas, Temperatura Caliente, Picante Suave, un acompañamiento, 15 minutos, las etiquetas Sin TACC y Vegano y una información adicional, y guardar.
     - Verlo en la base: `select tamanio_porcion, porcion_personas, temperatura, nivel_picante, acompanamiento, tiempo_preparacion_min, etiquetas_dietarias, info_adicional from item_menu where id = 'bbbbbbbb-0003-4003-a003-000000000003'`.
  2. **Cambio de tamaño:** reabrir Rabas; tiene que mostrar lo guardado. Cambiar Tamaño a "Individual": la cantidad de personas desaparece. Guardar: `porcion_personas` queda en NULL y `tamanio_porcion` en `INDIVIDUAL`.
  3. **Validación:** escribir "15 min" en el tiempo de preparación y guardar. Tiene que aparecer "El tiempo de preparación va en minutos enteros, de 1 a 600." y no tiene que salir ningún `PATCH`.
  4. **Vaciar borra** (y de paso deja Rabas como en el seed): poner todo en "Sin dato", vaciar los textos, desmarcar las etiquetas y guardar. Rabas tiene que quedar con todo en NULL y `etiquetas_dietarias = {}`.
  5. **Milanesa Napo** (en el seed: "Para N personas", 2): tiene que abrir con "¿Para cuántas personas?" en 2. Cerrar sin guardar.
  6. **Alta:** crear un plato con "Nuevo plato", con nombre, precio, categoría y algún dato del asistente. En la base, el plato tiene que tener esos datos (el `PATCH` sale después del `POST`). Después borrarlo con "Eliminar plato", para que el diff del paso 4 dé vacío.
  7. **En el celular:** el bloque se acomoda en una columna, y el modal se puede recorrer hasta el botón de guardar.
- **C. GERENTE:**
  - Ve Configuración → Asistente y no ve Marca y sucursales.
  - Carga la pantalla y puede guardar; por ejemplo, cambiar un servicio y después volverlo a su valor.
  - También ve el interruptor y lo puede tocar, igual que en la API. Esto está pendiente de confirmación de Lauti.
- **D. Tono:** comparar los textos de la pantalla y del bloque del plato con los de Marca y sucursales y Personal: voseo y sin tecnicismos.

### Para fases siguientes

- **Fase 6 (web-cliente):** no necesita nada más de web-admin. El flag se prende en esta pantalla y llega en `GET /menu/:restauranteId` como `restaurante.asistenteHabilitado`. El paso A.4 de la receta (apagar el interruptor) sirve para comprobar que el botón del chat no aparezca.
- **Fase 4 (contexto):** lo que carga el dueño llega sin espacios en los costados y con `null` en lo vacío. "Sin dato" en un servicio es `null`, y el contexto no tiene que mostrarlo. El panel sigue sin poner un tope a la cantidad de preguntas frecuentes.
- **Problemas anteriores a esta fase, fuera de alcance:**
  - La descripción del plato no se puede borrar desde el panel: si queda vacía manda `undefined` (anotado en la Fase 2).
  - La edición del plato muestra el `e.message` crudo ante un 5xx.
- **Para Lauti:** el GERENTE ve y puede tocar el interruptor, igual que en la API (observación 2 del cierre de la Fase 2). Si el flag pasa a ser solo del OWNER, en web-admin alcanza con mostrar el interruptor deshabilitado según `useRolActual()`.
