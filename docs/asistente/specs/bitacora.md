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
