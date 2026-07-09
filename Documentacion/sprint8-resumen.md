# Sprint 8 — ★ MVP en Producción

**Sprint:** S8 · Issue épica #8  
**Equipo:** De Marcos (margarita0912) · Ojeda (lautiod) · Strumia Carrara (CotyStrumia)  
**Fecha:** Pendiente  
**Estado:** Todo

---

## Índice

1. [Objetivo del sprint](#1-objetivo-del-sprint)
2. [Actividades y responsables](#2-actividades-y-responsables)
3. [#82 — Tag v1.0.0 en el repositorio](#3-82--tag-v100-en-el-repositorio)
4. [#77 — Deploy Backend a PRODUCCIÓN](#4-77--deploy-backend-a-producción)
5. [#78 — Deploy Frontend a PRODUCCIÓN](#5-78--deploy-frontend-a-producción)
6. [#81 — Smoke test en producción: flujo completo](#6-81--smoke-test-en-producción-flujo-completo)
7. [#83 — Inicio planificación v2.0](#7-83--inicio-planificación-v20)
8. [Prerrequisitos para el deploy a producción](#8-prerrequisitos-para-el-deploy-a-producción)

---

## 1. Objetivo del sprint

Hacer el primer release del MVP en producción: crear el tag `v1.0.0`, ejecutar el pipeline de deploy, validar el flujo completo con un smoke test, y arrancar la planificación de la versión 2.0.

---

## 2. Actividades y responsables

| # | Actividad | Responsable | Estado |
|---|---|---|---|
| #82 | Tag v1.0.0 en el repositorio | Ojeda | Todo |
| #77 | Deploy Backend a PRODUCCIÓN | Ojeda | Todo |
| #78 | Deploy Frontend a PRODUCCIÓN | Ojeda | Todo |
| #81 | Smoke test en producción: flujo completo | Ojeda | Todo |
| #83 | Inicio planificación v2.0 | Strumia Carrara + Ojeda | Todo |

---

## 3. #82 — Tag v1.0.0 en el repositorio

**Responsable:** Ojeda

El pipeline de producción se activa exclusivamente mediante un tag semántico (ver `deploy-production.yml`). El primer release del MVP se tagueará como `v1.0.0`.

```bash
git checkout main
git pull origin main
git tag v1.0.0
git push origin v1.0.0
```

El tag dispara automáticamente `deploy-production.yml`, que corre CI completo y luego despliega backend y frontends.

---

## 4. #77 — Deploy Backend a PRODUCCIÓN

**Responsable:** Ojeda

**Infraestructura:** Railway (servicio `menyu-backend-production`).

**Prerrequisitos antes del deploy:**
- Variables de entorno de producción configuradas en Railway (ver sección 8).
- Migraciones automáticas en el paso de deploy: `prisma migrate deploy` debe correr antes del arranque del proceso.
- `CORS_ORIGINS` apuntando a los dominios de producción de Vercel.

**Proceso:** activado por el tag `v1.0.0`. GitHub Actions corre el CI y luego ejecuta el deploy a Railway production via CLI.

---

## 5. #78 — Deploy Frontend a PRODUCCIÓN

**Responsable:** Ojeda

**Infraestructura:** Vercel — tres proyectos separados:

| App | Dominio de producción |
|---|---|
| web-cliente | `menu.menyu.com` (o equivalente) |
| web-staff | `staff.menyu.com` |
| web-admin | `admin.menyu.com` |

**Variables de entorno en Vercel (ambiente Production):**

| Variable | web-cliente | web-staff | web-admin |
|---|---|---|---|
| `VITE_API_URL` | `https://menyuapi-production.up.railway.app/api` | ídem | ídem |
| `VITE_WS_URL` | — | `https://menyuapi-production.up.railway.app` | — |

**Proceso:** el step `vercel deploy --prod --prebuilt` en `deploy-production.yml` promueve el build a producción en los tres proyectos.

---

## 6. #81 — Smoke test en producción: flujo completo

**Responsable:** Ojeda

Validación manual del flujo end-to-end en el ambiente de producción real:

1. Login con admin ROOT → verificar que el JWT se emite correctamente.
2. Crear una marca + restaurante + mesa → verificar que los QRs se generan.
3. Abrir sesión de mesa desde `web-cliente` via QR o PIN.
4. Navegar el menú → agregar ítems al carrito → confirmar pedido.
5. Verificar que el pedido aparece en `CocinaPage` (web-staff) en tiempo real.
6. Avanzar el pedido a "Listo" → verificar que el mozo lo ve.
7. Marcar como "Entregado".
8. Iniciar pago con Mercado Pago → verificar redirect a MP checkout.
9. Verificar que el webhook cierra la sesión al confirmar el pago.

El smoke test no es automatizado — es una checklist manual que confirma que el sistema funciona en producción antes de comunicarlo a usuarios reales.

---

## 7. #83 — Inicio planificación v2.0

**Responsables:** Strumia Carrara + Ojeda

Con el MVP en producción, arrancar la planificación de la versión 2.0 que incluye:

- **Motor de recomendaciones:** Python + FastAPI + pandas/numpy + OpenAI API. Sugiere ítems al comensal según historial de pedidos y preferencias declaradas.
- **Programa de fidelización:** puntos por compra, canje de beneficios.
- **Pagos divididos:** split de la cuenta entre múltiples comensales de la misma sesión.
- **Chatbot:** asistente conversacional para el comensal (consultas sobre el menú, alergias, etc.).
- **Integración de impresoras física:** completar el módulo de conexión ESC/POS iniciado en S7.

---

## 8. Prerrequisitos para el deploy a producción

Checklist de acciones necesarias antes de ejecutar el tag `v1.0.0`:

| Item | Responsable | Estado |
|---|---|---|
| Sprint 7 completado (#238, #74, #211, #76) | — | Pendiente |
| `ENCRYPTION_KEY` generada y cargada en Railway production | Ojeda | Pendiente |
| `JWT_SECRET` seguro en Railway production (≥ 64 bytes) | Ojeda | Pendiente |
| `CORS_ORIGINS` con dominios de producción en Railway | Ojeda | Pendiente |
| `MP_SUCCESS_URL` apuntando a URL de producción (no localhost) | Strumia Carrara | Pendiente |
| `MP_WEBHOOK_URL` configurada en la app de Mercado Pago | Ojeda | Pendiente |
| Validación de firma del webhook MP (`x-signature`) | Strumia Carrara | Pendiente |
| Endpoints `/auth/dev/*` desactivados en producción | Strumia Carrara | Pendiente |
| `prisma migrate deploy` en el step de deploy de Railway | Ojeda | Pendiente |
| `DATABASE_URL` y `DIRECT_URL` de producción en Railway | Ojeda | Pendiente |
| Smoke test en staging aprobado | Ojeda | Pendiente |

---

*MenYU · De Marcos · Ojeda · Strumia Carrara · 2026*
