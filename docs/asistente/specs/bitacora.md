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
