# Módulo Pagos — Sesión 4: MP funcionando end-to-end local + planificación de deploy a Railway (rama `fix/mp`)

**Equipo:** De Marcos · Ojeda · Strumia Carrara
**Fechas:** 13 de julio de 2026 (lunes) y 15 de julio de 2026 (miércoles)
**Rama:** `fix/mp`
**Contexto:** continúa de `modulo-pagos-sesion3.md`, que había quedado bloqueada esperando las contraseñas de los test users de Mercado Pago para poder completar un pago aprobado de punta a punta.

---

## Índice

1. [Lunes 13/7 — Se destrabó el bloqueo, pago aprobado end-to-end](#1-lunes-137--se-destrabó-el-bloqueo-pago-aprobado-end-to-end)
2. [Frontend web-cliente construido](#2-frontend-web-cliente-construido)
3. [Miércoles 15/7 — Planificación de deploy a Railway](#3-miércoles-157--planificación-de-deploy-a-railway)
4. [Decisión de diseño: back_urls dinámicas por Origin en vez de FRONTEND_URL fija](#4-decisión-de-diseño-back_urls-dinámicas-por-origin-en-vez-de-frontend_url-fija)
5. [Implementación realizada hoy (código)](#5-implementación-realizada-hoy-código)
6. [Qué falta para la próxima sesión](#6-qué-falta-para-la-próxima-sesión)

---

## 1. Lunes 13/7 — Se destrabó el bloqueo, pago aprobado end-to-end

El bloqueo de la sesión 3 (contraseñas enmascaradas de los test users de MP) se resolvió y se logró un **pago aprobado de punta a punta en local**, incluyendo el webhook cerrando la `SesionMesa` correctamente.

Para poder probar sin la restricción de `live_mode: true` (que en sesión 3 causaba el error 2034 "Invalid users involved" con tarjetas de test), se reemplazó temporalmente el `mpAccessToken` del restaurante de prueba (`b3f8e097-6300-4592-9add-b2cf1f2b0c22`, "Restaurante Nueva") por el token de un vendedor de test de Mercado Pago.

**Decisión tomada:** no se restauró el token real de producción después de la prueba. Se confirmó que el backend local (`apps/backend`, `DATABASE_URL` en `.env`) apunta a la base de **staging**, no a producción — así que dejar el token de test conectado es el estado correcto/deseado para seguir desarrollando, no una pérdida de dato productivo. (Igualmente, un pago real contra Mercado Pago con tarjeta real sigue moviendo dinero real independientemente de qué DB de MenYu esté conectada — la separación staging/prod es sobre la base de datos, no sobre el modo de Mercado Pago.)

---

## 2. Frontend web-cliente construido

La sesión 3 había detectado que `apps/web-cliente` no tenía ningún flujo de MP real para reactivar (solo un método `payments.initiate` muerto y un texto de copy mal atado al estado de efectivo). Esta sesión lo construyó:

| Archivo | Cambio |
|---|---|
| `store/pagoStore.ts` | +`pagarConMercadoPago(sesionId, pedidoId, monto)` — llama a `POST /payments/mercadopago/crear-preferencia` y redirige a `initPoint`. Nuevo estado `mp_redirigiendo` en el store. |
| `pages/pago/PagarPage.tsx` | +botón "Pagar con Mercado Pago" junto al de "Llamar al mozo para pagar"; spinner con texto "Conectando con Mercado Pago..." atado correctamente al nuevo estado `mp_redirigiendo` (ya no al de efectivo). |
| `pages/pago/PagoExitosoPage.tsx` | Reescrita: antes era una pantalla con contador regresivo de 30s a `/menu`; ahora reusa el nuevo componente `GraciasCard` con mensaje de pago acreditado y limpia la sesión (`useSessionStore().clear()`) al salir. |
| `components/GraciasCard.tsx` (nuevo) | Componente extraído del bloque de "¡Gracias por su visita!" que antes vivía inline en `App.tsx` (`SessionGuard`) — ahora se reusa entre el cierre de sesión normal y la pantalla de pago exitoso de MP. |
| `App.tsx` | `SessionGuard` ahora usa `<GraciasCard subtitulo=... onSalir=... />` en vez del bloque de JSX/estilos inline duplicado. |

---

## 3. Miércoles 15/7 — Planificación de deploy a Railway

Con MP funcionando en local, el siguiente paso es desplegar a Railway (ya existe `railway.toml` + `apps/backend/Dockerfile`, y Railway ya está en producción para el resto del backend — no es un setup desde cero).

**Problema detectado:** Vercel genera una URL de preview distinta por cada rama pusheada (patrón `https://menyu-cliente-git-<rama>-men-yu-s-projects.vercel.app`). El equipo usa esa URL de preview como ambiente de **QA** — no hay URL fija hasta que el trabajo llega a producción. La rama que se usa para QA es la rama de feature activa en cada momento (hoy `fix/mp`), y se mergea cuando termina.

Esa URL de preview **es estable mientras no cambie el nombre de la rama** (no cambia por cada push), pero si se hardcodea como variable fija en Railway (`FRONTEND_URL`, `MP_SUCCESS_URL`, etc.), habría que actualizarla a mano en Railway cada vez que se empieza a testear una rama nueva.

---

## 4. Decisión de diseño: back_urls dinámicas por Origin en vez de FRONTEND_URL fija

**Alternativas evaluadas:**
- **(A) Variable fija en Railway**, actualizada a mano por rama — simple pero manual, fácil de olvidar.
- **(B) URL dinámica**, derivada del header `Origin` del request al crear la preferencia, validado contra la misma whitelist que ya usa CORS (`CORS_ORIGINS`/`CORS_ORIGIN_PATTERNS`) — cero pasos manuales al cambiar de rama de QA.

**Se eligió (B).**

Sobre las credenciales de Mercado Pago para el ambiente de QA en Railway: se decidió reusar la **misma app/credenciales** (`MP_CLIENT_ID`/`MP_CLIENT_SECRET`) que ya se venían usando en sesión 3, en vez de registrar una segunda app de MP separada para QA. Queda pendiente verificar en el dashboard de MP si el `redirect_uri` registrado en esa app admite agregar el dominio de Railway QA (probablemente hoy solo tiene el de ngrok de sesión 3) — ver punto 6.

**Seguridad de usar el `Origin`:** el header lo controla el cliente y en teoría es spoofeable, pero como se valida contra la whitelist de CORS antes de usarlo, el peor caso es que alguien fuerce el redirect hacia otro dominio *ya autorizado* nuestro — no hacia un dominio arbitrario (no es un open redirect).

---

## 5. Implementación realizada hoy (código)

| Archivo | Cambio |
|---|---|
| `apps/backend/src/common/is-allowed-origin.ts` (nuevo) | Helper `isAllowedOrigin(origin)` — extrae la lógica de validación que antes vivía inline en `main.ts`, para reusarla también en el flujo de pagos. |
| `apps/backend/src/main.ts` | Refactor: usa `isAllowedOrigin` en el callback de `enableCors` en vez de la lógica duplicada. |
| `apps/backend/src/payments/payments.controller.ts` | `crearPreferenciaMP` ahora toma `@Headers('origin')` y lo pasa al service. |
| `apps/backend/src/payments/payments.service.ts` | `crearPreferenciaMercadoPago` recibe el `origin`, lo limpia de trailing slash, lo valida con `isAllowedOrigin` (método privado `resolveFrontendOrigin`), y si es válido arma `successUrl`/`failureUrl`/`pendingUrl` dinámicas (`${origin}/pago/exitoso`, etc.) para pasarle al provider. Si no hay origin o no matchea, cae al fallback existente de `FRONTEND_URL` (ya soportado por `mercado-pago.provider.ts`, que toma `successUrl` como override opcional) y loguea con `Logger.debug` el motivo del fallback (sin header vs. no matchea whitelist), para poder diferenciarlos rápido en los logs de Railway. |

`payment-provider.interface.ts` y `mercado-pago.provider.ts` **no se tocaron** — ya soportaban `successUrl`/`failureUrl`/`pendingUrl` como overrides opcionales desde sesión 3, solo faltaba que algo se los pasara.

Verificado con `pnpm --filter @menyu/api exec tsc --noEmit` — sin errores.

**No se tocó:** `.env.example`, variables de Railway, ni el dashboard de Mercado Pago — eso queda para la próxima sesión (pasos B y C de abajo).

---

## 6. Qué falta para la próxima sesión

| Item | Prioridad |
|---|---|
| **(B)** Configurar el environment de QA en Railway: `DATABASE_URL`/`DIRECT_URL` (staging), `JWT_SECRET`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, `MP_ENCRYPTION_KEY`, `MP_CLIENT_ID`/`MP_CLIENT_SECRET` (los mismos de siempre), `MP_REDIRECT_URI` (fijo, dominio de Railway), `BASE_URL` (fijo, dominio de Railway, reemplaza a ngrok) | Alta |
| **(B)** Corregir `CORS_ORIGIN_PATTERNS` — el placeholder actual en `.env.example` (`.*-menyu\.vercel\.app`) no matchea el dominio real del team de Vercel (`men-yu-s-projects.vercel.app`). Al escribir el patrón nuevo, cuidar que los `.` estén escapados (`\.`) — un regex sin escapar ahí afecta qué URLs quedan "autorizadas" para redirect, no solo para CORS | Alta |
| **(B)** Dejar `FRONTEND_URL` con un valor funcional (no vacía) aunque sea solo fallback — evitar un `undefined` en la URL de redirect de MP si en algún caso no llega `Origin` | Media |
| **(C)** Verificar en el dashboard de MP (app `7614597750511204`) si el `redirect_uri` registrado admite agregar el dominio de Railway QA, o si hay que reemplazar el de ngrok | Alta — bloqueante para probar OAuth en Railway |
| Probar el flujo completo contra Railway: conectar OAuth con el restaurante de prueba, crear preferencia desde el preview de Vercel de `fix/mp`, confirmar que `successUrl` se arma con el `Origin` correcto y que el webhook cierra la sesión | Alta |
| Pendiente de sesiones anteriores, sin resolver aún: campos huérfanos `Restaurante.mpAccessToken`/`mpRefreshToken`/`mpUserId` — ya en uso real ahora, así que dejan de estar huérfanos, pero falta confirmar que el modelo en `schema.prisma` no necesita más ajustes para Railway | Baja |
| Pendiente de sesión 3: reemplazar/eliminar `api.payments.initiate` viejo en `web-cliente/src/services/api.ts`, decidir si limpiar los pedidos de prueba huérfanos, resolver el drift de `qr_base_url` | Baja |
