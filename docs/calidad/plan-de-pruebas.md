# Plan de pruebas — MenYU

| Versión | Fecha | Qué cambia |
|---|---|---|
| 0.1 | 16/10/2026 | Primera versión: metas de Nivel 3, punto de partida, decisiones técnicas, riesgos (R1–R7), cronograma. |
| 0.2 | 24/10/2026 | Agrega criterios de entrada y salida por nivel de prueba, referencias a la matriz ISO/IEC 25010 y a la trazabilidad, y el estado final de los riesgos (R1–R9). |

## 1. Alcance

Este plan cubre el Trabajo Práctico Integrador de Calidad de Software aplicado a MenYU: una aplicación de pedidos y pagos por QR, multi-tenant (varios restaurantes y marcas), con backend en NestJS/Prisma/Postgres (Supabase), cuatro frontends (web-cliente, web-admin, web-staff, web-auth) y la integración de cobro con MercadoPago. Se declara **Nivel 3 (prototipo avanzado)**.

Quedan fuera de este plan — y así constan en Jira como riesgo residual, no como pendientes ocultos — el contrato de MercadoPago con payloads reales de `merchant_order` y `payment` (SCRUM-39) y la prueba de esfuerzo sostenido de k6 más allá del stress ejecutado (SCRUM-43); los dos pasan a la tesis.

## 2. Estrategia

Pirámide de pruebas: la mayoría de los tests son unitarios, con un número menor pero crítico de pruebas de integración y de sistema sobre el servicio desplegado. Antes de cualquier nivel corren el typecheck, el lint y el análisis estático de SonarCloud en cada pull request. El pipeline bloquea merges sin CI verde, mide cobertura y duplicación con un quality gate propio, y cada deploy — a staging y a producción — termina con un smoke automático que verifica el SHA servido.

## 3. Entornos

| Entorno | Qué corre ahí | Quién lo toca |
|---|---|---|
| Local y runner de CI | Tests unitarios y de integración (Jest, Vitest, Testing Library) | En cada PR y push a main, sin servicios externos |
| CI, Postgres efímero | E2E del backend (job `e2e-backend`) | En cada PR; check requerido del ruleset de main desde el 23/10 |
| Staging (Railway, Vercel, Supabase) | Smoke post-deploy, pruebas manuales de aceptación, k6, E2E contra Supabase | Después de cada deploy a staging; nunca producción |
| Producción | Solo el smoke, después de un tag `vX.Y.Z` con CI verde del mismo SHA | Solo por tag, nunca pruebas de carga ni E2E |

## 4. Niveles de prueba: criterios de entrada y de salida

| Nivel | Entra cuando… | Sale (pasa) cuando… | Evidencia |
|---|---|---|---|
| **Unitario** | Hay código nuevo o modificado en un PR | Todos los tests unitarios del paquete afectado pasan y el quality gate de SonarCloud aprueba cobertura de código nuevo ≥ 80 % | CI de ese PR en verde; 3.990 tests en main al 22/10 |
| **Integración** | El nivel unitario pasó en el mismo PR | Los endpoints del backend (controladores, guards, validación HTTP) responden según el contrato esperado, con MercadoPago controlado por dobles | Specs de `supertest` en verde; PR #393 |
| **Sistema (E2E) en CI** | Hay un PR contra main | El spec e2e del backend (`POST /api/sessions/open`) pasa contra un Postgres efímero del runner | Job `e2e-backend` en verde; check requerido del ruleset de main y de check-ci para producción |
| **Sistema (E2E) en staging** | El deploy a staging terminó y `/health` informa el SHA del commit desplegado | El flujo completo (QR, sesión, pedido, cobro en efectivo, confirmación del mozo, cierre) corre contra Supabase de staging con datos marcados por corrida (`e2e-run_id`) y persistencia verificada con un usuario de solo lectura, sin dejar datos sin marcar | Run del workflow de E2E contra staging, en verde |
| **Sistema, no funcional (carga)** | Hay un ambiente de staging sano y el equipo fue avisado | k6 corre contra staging (nunca producción) y cumple sus umbrales propios de p95 y de tasa de error | Run de `carga-k6.yml`, en verde, con los cuatro umbrales cumplidos |
| **Aceptación** | Un PR cambia una pantalla o un flujo visible | La prueba manual en staging, guiada por el caso de prueba de Jira, no muestra diferencias con el resultado esperado | Caso de prueba de Jira en Finalizado, con la fecha y el resultado |

## 5. Referencia a la matriz de calidad (ISO/IEC 25010)

La matriz completa de características de calidad (idoneidad funcional, fiabilidad, eficiencia de desempeño, compatibilidad, usabilidad, seguridad, mantenibilidad, portabilidad), con su evidencia y su estado, está en el informe de calidad, sección "Calidad del producto según ISO/IEC 25010". Las tres características priorizadas para MenYU son seguridad (aislamiento multi-tenant y la conexión con MercadoPago), idoneidad funcional (que un cobro o un webhook mal calculado es el riesgo R1) y fiabilidad (smoke, `/health` con SHA, despliegue por tag).

## 6. Trazabilidad: requisito → caso de prueba → defecto

La trazabilidad vive en Jira, proyecto SCRUM: cada defecto registrado (Error A a N, SCRUM-58 a 67, 80 y los que siguen) está enlazado con "se relaciona con" a su caso de prueba (CP-1 a CP-14, SCRUM-48 a 57, 81 y los que siguen), y cada caso de prueba documenta el archivo y el `describe › it` exacto del test de regresión. El detalle completo, con los PRs y los commits en rojo y en verde de cada defecto, está en el informe de calidad, secciones "Defectos encontrados" y "Anexo".

## 7. Riesgos: estado final

Probabilidad (P) e impacto (I) de 1 a 5; exposición = P × I (alta desde 15, media de 10 a 14, baja por debajo de 10). R1, R3 y R4 son riesgos de producto; R6 es de infraestructura; R2, R5, R7, R8 y R9 son de proyecto.

| ID | Riesgo | P | I | Exposición | Estado final |
|---|---|---|---|---|---|
| R1 | Cobro y webhook de MercadoPago casi sin cobertura | 4 | 5 | 20, alta | Cerrado: cobertura de payments/proveedor/webhook en 98,9–100 %; el contrato con payloads reales pasa a la tesis |
| R2 | No llegar al 80 % de cobertura | 4 | 4 | 16, alta | Cerrado: 86,9 % en main (22/10), gate de código nuevo en 80 % desde el 23/10 |
| R3 | Deploy a producción sin CI verde | 3 | 5 | 15, alta | Cerrado: mitigado en el workflow, ejercitado en 4 tags; v1.2.0 (23/10) ya pasó con el check E2E exigido |
| R4 | El E2E de staging deja datos o toca datos reales | 3 | 4 | 12, media | **En revisión (24/10):** se decidió volver a tomar la implementación del E2E contra Supabase de staging, con bases separadas de producción, marcador por corrida (`e2e-run_id`) y usuario de solo lectura. Se actualiza este renglón cuando termine. |
| R5 | La documentación se acumula al final | 4 | 3 | 12, media | Cerrado: informe, plan de pruebas y matrices escritos antes de la entrega |
| R6 | Fallas de infraestructura en Railway vuelven inestable el smoke y el E2E | 3 | 3 | 9, baja | Materializado el 21/10 (incidente de Railway); mitigado con la espera del SHA en `/health` antes del smoke; sin impacto en los despliegues posteriores |
| R7 | El plan Free de SonarCloud no permite un gate propio | 3 | 3 | 9, baja | Cerrado: umbrales propios en el gate (#373) |
| R8 | La cuota diaria de Vercel frena los deploys | 3 | 4 | 12, media | Mitigado: `turbo-ignore`, exclusión de rutas y PRs más grandes |
| R9 | La duplicación no baja del 5 % | 3 | 4 | 12, media | Cerrado: 2,3 % en main (22/10), con tres refactores |

Además, por decisión de alcance tomada y documentada, quedan como riesgo residual aceptado: el contrato de MercadoPago con payloads reales (R1, parcial) y la prueba de esfuerzo sostenido más allá del stress (ver informe, sección "Pruebas de carga y entrega").

## 8. Referencias

- Informe de calidad completo: doc "Informe de calidad de software: MenYU" en Claude Docs.
- Jira, proyecto SCRUM: SCRUM-18 (defectos), SCRUM-37 (E2E del backend con Postgres efímero), SCRUM-38 (E2E contra Supabase de staging), SCRUM-43 (carga), SCRUM-47 (duplicación); épicas SCRUM-5 a 13.
- `docs/calidad/bitacora.md` y `docs/calidad/plan-rollback.md`, en el repo.
- Diseño original del E2E contra Supabase: `docs/calidad/e2e-supabase.md`.
