# Orquestación — implementación desatendida del asistente de mesa

> Ubicación: `docs/asistente/specs/orquestacion.md`. Este documento lo ejecuta la **sesión principal** de Claude Code (el orquestador) de punta a punta.
> Spec a implementar: `docs/asistente/specs/asistente.md` (Fases 1 a 7). La Fase 0 es manual y tiene que estar hecha antes de arrancar.
> Agentes: `trabajador-back`, `trabajador-front` y `revisor`, definidos en `.claude/agents/`.

## Objetivo y alcance

Implementar las Fases 1 a 7 de la spec del asistente en la rama `feat/asistente`, sin intervención humana, con un commit por fase revisado por el `revisor`. **Nunca:** merge a `main`, push a `main`, deploy, tocar staging o producción, ni operar paneles externos. El resultado queda en la rama, con bitácora, para que Lauti lo audite y decida el merge.

## Rol del orquestador

Coordinás; **no editás código ni corrés migraciones vos**. Tu trabajo: verificar precondiciones, lanzar un trabajador por fase, preparar y lanzar la revisión, administrar las rondas de corrección, mantener el presupuesto y cerrar con un informe. Las únicas escrituras propias admitidas: la bitácora (secciones del orquestador), `.env` local (overrides de presupuesto) y levantar/bajar servidores de desarrollo.

## Precondiciones (verificar todas; si alguna falla, frenar y reportar sin empezar)

1. **Fase 0 hecha:** `apps/backend/.env` tiene la key del proveedor y las variables `ASISTENTE_*`; una llamada mínima de prueba al modelo responde (cuenta para el presupuesto).
2. Árbol limpio sobre `main` actualizado (`git status`, `git pull`). Crear `feat/asistente` desde ahí.
3. `.claude/agents/` contiene `revisor`, `trabajador-back` y `trabajador-front`.
4. Base local levantada (`docker compose` de `apps/backend`), `pnpm install` sin errores, typecheck y tests del repo en verde **antes** de tocar nada (línea base).
5. Anotar en la bitácora la línea base: commit de partida, estado de tests, fecha.

## Asignación de fases

| Fase | Agente | Revisión con navegador |
| --- | --- | --- |
| 1 — Modelo de datos | trabajador-back | No |
| 2 — API de administración | trabajador-back | No |
| 3 — Formularios web-admin | trabajador-front | **Sí** |
| 4 — Endpoint del asistente | trabajador-back | No |
| 5 — Límites de uso | trabajador-back | No |
| 6 — Chat web-cliente | trabajador-front | **Sí** |
| 7 — Set de prueba y evaluación | trabajador-back | No |

## Ciclo por fase

1. **Lanzar el trabajador** con este prompt (ajustando N):
   > Ejecutá la Fase N de `docs/asistente/specs/asistente.md` según tu protocolo. Leé antes la spec completa, el documento de definición, el CLAUDE.md y `docs/asistente/specs/bitacora.md`. Presupuesto de llamadas reales restante: X. Al terminar: un commit y tu entrada de bitácora.
2. **Al terminar el trabajador:** leer su entrada de bitácora. Si quedó `detenida`, saltar a Detención.
3. **Preparar la revisión:** para las fases 3 y 6, levantar los servidores que pida la "receta para el revisor" de la bitácora (comandos de dev del monorepo — verificarlos en los `package.json`/turbo, no inventarlos). Para el resto, nada.
4. **Lanzar el `revisor`** con: el hash del commit, la sección de la fase en la spec (incluido su checklist "Revisor:") y la entrada de bitácora. Pedirle veredicto en dos listas: **bloqueantes** (incumplimientos de la spec o bugs) y **sugerencias** (no bloquean).
5. **Si hay bloqueantes:** lanzar un trabajador de la misma especialidad a corregirlos (commit de corrección + ampliación de la entrada de bitácora) y volver a revisar. **Máximo 2 rondas de corrección por fase**; si a la tercera sigue habiendo bloqueantes, Detención.
6. **Cerrar la fase:** verificar que quedó marcada como hecha en la spec, anotar en la bitácora el cierre (rondas usadas, sugerencias no aplicadas) y pasar a la siguiente.

<!-- CHECKPOINT OPCIONAL (recomendado). Para una corrida 100 % desatendida, borrá este bloque. -->
**Checkpoint tras la Fase 1:** después de cerrarla, frenar y pedirle a Lauti el visto bueno del schema antes de seguir. Un error acá se arrastra por todas las fases siguientes y es el más barato de corregir ahora.
<!-- FIN DEL CHECKPOINT -->

## Reglas de autonomía

- **Ambigüedad menor** (un "A verificar" con más de una lectura razonable, un detalle que la spec no fija): el trabajador decide razonable y lo deja anotado en la bitácora. No se frena por esto.
- **Se frena siempre** ante: contradicción entre el código real y una decisión cerrada de la spec; cualquier acción irreversible fuera de la rama; tocar `main`, staging, producción o paneles externos; superar el presupuesto; tercera falla del mismo problema; precondición rota a mitad de corrida (p. ej., la base local caída y no recuperable).
- Frenar **no** es improvisar una alternativa: es dejar el estado escrito y terminar con un informe claro.

## Presupuesto de llamadas reales al modelo

- Durante toda la corrida, `ASISTENTE_MAX_PREGUNTAS_DIA=50` en el `.env` local (anotar el valor original y restaurarlo al cierre).
- **Tope de la corrida: 200 llamadas reales** entre smokes de las fases 4–6 y la corrida de la Fase 7. El orquestador lleva la cuenta en la bitácora con lo que reporta cada trabajador y pasa el restante en cada prompt.
- La Fase 7 estima sus llamadas **antes** de correr el script (preguntas × modelos con key disponible) y no corre si no entra en el restante.
- Al superar el tope: Detención.

## Bitácora

`docs/asistente/specs/bitacora.md`. Los trabajadores escriben su entrada por fase (formato en sus definiciones); el orquestador escribe: línea base, cierre de cada fase (veredicto del revisor, rondas, llamadas acumuladas), toda detención y el informe final. La bitácora y el plan son el único traspaso entre sesiones: ningún trabajador hereda contexto de otro.

## Detención y recuperación

- **Detención:** registrar en la bitácora qué fase, qué pasó, qué se probó y qué decisión necesita Lauti. Dejar el árbol limpio (lo commiteado, commiteado; lo que no, revertido con `git restore`/`clean` **solo** de los archivos de la fase detenida). Terminar con el informe de lo completado hasta ahí.
- **Sesión caída a mitad de una fase** (al retomar): `git status` primero, después la bitácora. Si el estado es claro, un trabajador continúa la fase; si no, revertir lo no commiteado de esa fase y rehacerla de cero. Nunca revertir commits ya revisados.

## Adaptaciones explícitas respecto de la spec

La spec pide cosas pensadas para sesiones con Lauti presente; en modo desatendido se adaptan así (dejarlo así, no "corregirlo"):

1. **"Arrancando en plan mode"** → cada trabajador escribe su plan y la resolución de los "A verificar" en la bitácora antes de tocar código.
2. **Verificación en navegador del "terminado cuando" de las Fases 3 y 6** → la hace el `revisor` (tiene Chrome), siguiendo la receta del trabajador. Un punto de "terminado cuando" verificado por el revisor vale como cumplido.
3. **Revisión manual de la Fase 7 (≈75 respuestas)** → el `revisor` pre-marca correcta/incorrecta con el comportamiento esperado del set; el resultado queda en la bitácora como **"pre-evaluado por IA, pendiente de validación de Lauti"**. La elección de modelo basada en eso es provisoria.

## Cierre de la corrida

1. Restaurar el `.env` (valores originales), bajar servidores levantados.
2. `push` de `feat/asistente` a `origin` (solo la rama; el PR y el merge son de Lauti).
3. Última entrada de bitácora + actualización de `CLAUDE.md`: estado del asistente, decisiones tomadas en la corrida, llamadas consumidas.
4. **Informe final para Lauti:** fases completadas y detenidas, decisiones tomadas por ambigüedad (lista completa), sugerencias del revisor no aplicadas, y los pendientes humanos: validar la evaluación de la Fase 7, revisar y mergear la rama, probar en staging, cargar las variables en Railway de producción cuando toque, y prender el flag del restaurante del piloto.
