# Cierre de la migración de auth

## Contexto

La implementación de `docs/auth/specs/auth.md` está completa y revisada. El informe de la revisión integral

está en `docs/auth/review/auth-review-2026-10-27.md`: leelo entero antes de empezar, junto con la spec y

`CLAUDE.md`. Esta sesión existe para dejar auth **cerrada**: la Fase 5 en producción con su ✅, los dos

hallazgos que tocan al comensal corregidos, la documentación sin rastros del login borrado, y la regla más

frágil protegida en CI.

Arrancá en plan mode. Presentame el plan por etapas y esperá mi confirmación antes de la Etapa 1. Después,

**una confirmación mía antes de cada etapa** y **un commit por etapa**, en una rama `chore/cierre-auth`.

Si algo de lo que sigue contradice `CLAUDE.md`, prevalece `CLAUDE.md` y avisame.

## Fuera de alcance (no lo toques aunque lo veas)

Los pendientes C4 y C5 del informe (CORS, `redirect`, comentarios viejos, `BAJA_CORTA_EL_LOGIN`, texto

duplicado, `apps/cliente/`, clave `prisma`, `.env.example`, topes de los specs), los umbrales de cobertura,

`--passWithNoTests`, Sonar sobre `packages/types`, y la sección 7 del informe. Van en una sesión de limpieza

posterior. Si encontrás algo nuevo, anotalo en un bloque "Para la sesión de limpieza" al final; no lo arregles.

## Etapa 1 — `/check-in` de web-cliente (C6 del informe)

Un archivo principal, dos cambios, con su test cada uno:

1. **Reenviar el `restaurantId` del QR en `POST /sessions/open`.** `CheckInRedirectPage.tsx` ya lee el valor

   pero solo lo usa para la pantalla de fallo; el hook `useEntrarAMesa` ya acepta el campo y el backend ya

   valida el cruce (409 si la mesa es de otro restaurante). Mismo cambio en `DiscoveryPage.tsx`.

2. **No confiar en un `menyu_sesion_id` de `sessionStorage` sin comprobar que la sesión siga activa.** Hoy,

   con un id de una sesión ya cerrada, el check-in no emite ningún `open` y deja a la persona en una sesión

   muerta. Elegí la opción más simple que cumpla: dejar que el `open` decida y usar el id guardado solo como

   optimización, o validar contra `GET /sessions/mesa/:mesaId/activa`. Decime cuál elegiste y por qué.

## Etapa 2 — Proteger la carga diferida y sacar el JWT del repo

1. **Regla de ESLint en `apps/web-cliente`** (`no-restricted-imports`) que prohíba el import de valor de

   `@menyu/auth-client` y `@supabase/supabase-js`, permitiendo `import type`. Es la regla de `CLAUDE.md` que

   la revisión de la Fase 5 encontró violada dos veces y que nada automático protege. Verificá que

   `authClientDiferido.ts` siga siendo el único punto de carga y que la regla lo excluya de forma explícita,

   no por casualidad. Comprobá que `pnpm lint` pasa y que un import estático de prueba falla.

2. **Borrar `verify-carrito.js` y `verify-carrito.mjs`** y su referencia en `.claude/settings.json`. Traen un

   JWT de sesión de mesa en un repo público (ya triageado en `docs/calidad/bitacora.md`). Confirmá con grep

   que nada más los referencia.

3. **Agregar `'coverage'` al `ignores`** de `eslint.config.js` en web-admin, web-staff y web-cliente, como ya

   tiene web-auth. Es una línea por app y evita un falso rojo documentado.

## Etapa 3 — Documentación: retirar el login borrado de lo que se lee en presente (C2 del informe)

Solo documentación, sin tocar código. Objetivo: que el criterio 2 del "Terminado cuando" de la Fase 5 se

cumpla en su lectura literal. Los lugares exactos, con línea, están en §4.2 I1, I2, I3, I9 e I10 del informe;

usá esa lista como checklist y marcá cada uno al terminarlo. En resumen:

1. `doc.md` (API Reference de la raíz): reemplazar `POST /api/auth/login`, `/register` y `/refresh` por

   `GET /auth/me` y `POST /auth/invitaciones` con el esquema Bearer de Supabase.

2. `docs/plan-consola-root.md`: la tabla de rutas describe cinco rutas borradas; reemplazarla por la de la

   spec (4.4) o marcar la sección como planificación histórica, de forma explícita.

3. `Documentacion/Doc_DB.md`, `modulo-usuarios-y-autenticacion.md`, `modulo-menu.md`,

   `datos-de-prueba-local.md`, `docs/calidad/e2e-supabase.md`, `docs/auth/VariablesACambiar.md`: corregir o

   fechar como histórico. Los resúmenes de sprint y las bitácoras **no se tocan**.

4. `docs/checklist-qa-staging.md`: corregir "los tres frontends", y crear `docs/auth/checklist-staging.md`

   con la lista de verificación de auth como archivo propio, con casilleros, sumando los casos de la Fase 5

   y los 12 casos de la §3.7 del informe.

5. `CLAUDE.md`: todo lo listado en I9 **salvo** la línea "(migración en curso)", que se cambia en la Etapa 5.

   Agregá además la nota de M26 (la cookie se parte en `.0`/`.1` con cuentas de cliente) donde se documenta

   la cookie, y las dos trampas de desarrollo de M14 y M19 en `WORKFLOW.md`.

6. `auth.md`: ampliar la excepción del criterio 2 con `menyu_refresh_token`, y corregir los 7 puntos de spec

   desactualizada de la §3.5.

Antes de commitear, corré el grep de los 8 patrones del criterio 2 sobre todo el repo y pegame el resultado:

tienen que quedar solo las excepciones que la spec lista y los documentos fechados como históricos.

## Etapa 4 — Release de la Fase 5 a producción (la hago yo; vos preparás y esperás)

**Nunca ejecutes nada contra producción.** Esta etapa es mía; tu trabajo es dejarme todo listo y verificar

después. Prepará y mostrame:

1. Las consultas SQL para correr en el Supabase de **producción** sobre `pg_views`, `pg_policies` y `pg_proc`

   buscando referencias a `admin`, `admin_restaurante`, `refresh_token`, `password_hash` y `debeCambiarPassword`.

   Es la clase de objeto que ningún grep ve y que ya rompió el E2E de staging.

2. El comando o SQL para exportar fuera del repo `admin`, `admin_restaurante`, `refresh_token` y los

   `password_hash` de `mozo` y `cliente`, antes de cualquier deploy.

3. Mi checklist manual, en este orden, para que lo vaya marcando:

   - [ ] Respaldo hecho y guardado fuera del repo.

   - [ ] Las consultas de arriba no devuelven nada (o lo resolvimos antes de seguir).

   - [ ] Railway producción sigue desconectado de GitHub.

   - [ ] En SonarCloud, la referencia de "código nuevo" movida para que mida la Fase 5, y el quality gate en verde.

   - [ ] `JWT_SECRET` rotado en Railway staging y producción.

   - [ ] Decidido qué hacer con la cuenta de cliente de prueba de staging (`menyuprueba2+rev2710@gmail.com`):

         sumarla a `docs/auth/.env.usuarios-staging` o borrarla del Supabase de staging.

   - [ ] `tableCode` de la mesa 1 sumado a `docs/auth/usuarios-prueba-staging.md`.

   - [ ] Tag creado y deploy terminado.

4. La verificación posterior al deploy, que corrés vos cuando te confirme que el tag está: smoke de

   producción, `GET /health` devolviendo el SHA del tag, los cinco endpoints del login respondiendo 404 y

   `GET /auth/me` sin token respondiendo 401. Si no tenés red para hacerlo, dame los `curl` exactos.

Esperá mi "listo" con el checklist completo antes de pasar a la Etapa 5.

## Etapa 5 — Cierre

1. Marcar la Fase 5 con ✅ y la fecha en `auth.md`, igual que las fases anteriores.

2. `CLAUDE.md`: cambiar "(migración en curso)" por el estado final.

3. Sumar al final de `docs/auth/review/auth-review-2026-10-27.md` una sección "Cierre" con la fecha, el tag

   de producción y qué pendientes del informe quedaron para la sesión de limpieza.

4. Lanzar el subagente `revisor` sobre el diff completo de la rama con la consigna de siempre, más esta

   pregunta explícita: "¿quedó algún cambio de comportamiento fuera de la Etapa 1?" La respuesta esperada es no.

5. Abrir el PR con el resumen por etapa y pasarme el link.

