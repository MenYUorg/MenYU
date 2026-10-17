# Línea base de calidad (SonarCloud)

Es el **"antes"** de la mejora que mide el TP de Calidad de Software (Nivel 3). Los números salen del primer análisis de SonarCloud que corrió el CI sobre `main`, con el alcance de `sonar-project.properties` (el `src/` de las 4 apps, sin `packages/`). Se tomaron por la API pública de SonarCloud, sin token.

| Dato | Valor |
|---|---|
| Fecha del análisis | 17/10/2026 02:29:29 UTC (16/10/2026 23:29, hora de Argentina) |
| Commit analizado | `3a7e23d471b49992738fa20a93e753abc1ea9cf3` (merge del PR #371) |
| Run del CI | [`38994955520`](https://github.com/MenYUorg/MenYU/actions/runs/38994955520) (push a `main`) |
| Proyecto | [`MenYUorg_MenYU`](https://sonarcloud.io/summary/overall?id=MenYUorg_MenYU) en la organización `menyuorg` |

---

## 1. Resumen del proyecto

| Métrica | Valor |
|---|---|
| Cobertura de líneas | **36,1 %** |
| Cobertura de Sonar (líneas y ramas) | 40,0 % |
| Cobertura de ramas | 71,4 % |
| Líneas a cubrir / sin cubrir | 26.274 / 16.776 |
| Bugs | 3 (los 3 MAJOR) |
| Vulnerabilidades | 6 (las 6 MAJOR) |
| Security hotspots | 0 (100 % revisados) |
| Code smells | 109 (87 MAJOR, 22 MINOR) |
| Duplicación | 8,5 % |
| Líneas de código (ncloc) | 35.529 (39.395 líneas físicas, 269 archivos) |
| Confiabilidad / Seguridad / Mantenibilidad | C / C / A (deuda técnica: 494 min) |

No hay bugs ni vulnerabilidades BLOCKER ni CRITICAL. Las notas C de confiabilidad y seguridad salen de que hay al menos un bug y una vulnerabilidad MAJOR.

## 2. Cobertura por app

| App | ncloc | Cobertura de líneas | Cobertura de Sonar | Líneas a cubrir | Líneas sin cubrir |
|---|---:|---:|---:|---:|---:|
| backend | 7.671 | 47,3 % | 46,4 % | 2.390 | 1.259 |
| web-admin | 14.478 | 28,0 % | 31,2 % | 12.374 | 8.906 |
| web-cliente | 7.666 | 63,4 % | 67,8 % | 6.700 | 2.453 |
| web-staff | 5.714 | 13,6 % | 15,2 % | 4.810 | 4.158 |
| **Total** | **35.529** | **36,1 %** | **40,0 %** | **26.274** | **16.776** |

- **Cobertura de líneas** (`line_coverage`): líneas cubiertas sobre líneas a cubrir.
- **Cobertura de Sonar** (`coverage`): combina líneas y ramas: (líneas cubiertas + condiciones cubiertas) / (líneas a cubrir + condiciones a cubrir).

## 3. Quality gate

Estado: **OK**. No falla ninguna condición. Las cuatro son sobre código nuevo:

| Condición | Falla si | Valor | Estado |
|---|---|---|---|
| Confiabilidad del código nuevo | es peor que A | A | OK |
| Seguridad del código nuevo | es peor que A | A | OK |
| Mantenibilidad del código nuevo | es peor que A | A | OK |
| Security hotspots revisados en código nuevo | menos de 100 % | 100 % | OK |

El código nuevo se mide desde la versión anterior (`previous_version`). La referencia es el análisis automático que hizo SonarCloud al importar el repo (17/10/2026 00:10 UTC, commit `7072d67`). Ese análisis tuvo otro alcance y no tuvo cobertura. Entre los dos commits solo cambió la configuración del CI, así que **no hay líneas nuevas a cubrir y no hay cobertura de código nuevo**. Revisar la definición del gate y la del código nuevo es parte del PR del quality gate.

## 4. Istanbul (backend) y v8 (frontends): no se comparan entre apps

- **backend** mide con Jest y el instrumentador **Istanbul**: cuenta como "a cubrir" solo las sentencias ejecutables.
- **web-admin, web-cliente y web-staff** miden con Vitest y el proveedor **v8**: cuenta casi todas las líneas del archivo, JSX incluido. En web-admin son 12.374 líneas a cubrir sobre 14.478 ncloc, y hay archivos con más líneas sin cubrir que ncloc (`web-staff/src/services/impresora.ts`: 77 sin cubrir, 60 ncloc). v8 también mide las ramas de otra forma, y por eso los frontends muestran ramas altas (57 % a 93 %) y líneas bajas.

**Consecuencia:** los porcentajes sirven para comparar el antes y el después **dentro de cada app**. Los de apps distintas no se comparan entre sí, y el total del proyecto mezcla los dos criterios.

## 5. Brecha hasta el 80 % de cobertura de líneas

**La métrica del objetivo del 80 % es la cobertura de líneas** (`line_coverage`), no la cobertura de Sonar que combina líneas y ramas.

Líneas que faltan cubrir = ⌈0,8 × líneas a cubrir⌉ − líneas cubiertas, con las líneas a cubrir de hoy. Si se agrega código, el objetivo se mueve.

| App | Líneas a cubrir | Cubiertas hoy | Objetivo 80 % | Faltan |
|---|---:|---:|---:|---:|
| backend | 2.390 | 1.131 | 1.912 | **781** |
| web-admin | 12.374 | 3.468 | 9.900 | **6.432** |
| web-cliente | 6.700 | 4.247 | 5.360 | **1.113** |
| web-staff | 4.810 | 652 | 3.848 | **3.196** |
| **Total** | **26.274** | **9.498** | **21.020** | **11.522** |

## 6. Archivos con más líneas sin cubrir, por app

> **Foto del commit `3a7e23d`.** Son los 15 archivos de cada app con más líneas sin cubrir en ese análisis. Las rutas son relativas al `src/` de cada app y las coberturas están en %.

### backend

| Sin cubrir | ncloc | Cobertura de líneas | Cobertura de Sonar | Archivo |
|---:|---:|---:|---:|---|
| 108 | 671 | 49,5 | 46,1 | `sessions/sessions.service.ts` |
| 70 | 543 | 61,1 | 54,7 | `pedidos/pedidos.service.ts` |
| 69 | 176 | 6,8 | 4,0 | `comensales/comensales.service.ts` |
| 67 | 136 | 0,0 | 0,0 | `mozos/mozos.service.ts` |
| 51 | 239 | 58,9 | 56,4 | `items/items.service.ts` |
| 50 | 100 | 0,0 | 0,0 | `clasificaciones/clasificaciones.service.ts` |
| 46 | 102 | 0,0 | 0,0 | `waiter-calls/waiter-calls.service.ts` |
| 42 | 76 | 0,0 | 0,0 | `admins/admins.service.ts` |
| 40 | 84 | 0,0 | 0,0 | `ingredientes/ingredientes.service.ts` |
| 39 | 101 | 7,1 | 3,8 | `payments/providers/mercado-pago.provider.ts` |
| 38 | 78 | 0,0 | 0,0 | `categorias/categorias.service.ts` |
| 36 | 402 | 75,8 | 72,4 | `payments/payments.service.ts` |
| 33 | 71 | 0,0 | 0,0 | `admin-restaurante/admin-restaurante.service.ts` |
| 29 | 108 | 0,0 | 0,0 | `mozos/mozos.controller.ts` |
| 28 | 78 | 0,0 | 0,0 | `mesas/mesas.controller.ts` |

### web-admin

| Sin cubrir | ncloc | Cobertura de líneas | Cobertura de Sonar | Archivo |
|---:|---:|---:|---:|---|
| 1.182 | 1.417 | 1,6 | 1,6 | `pages/admin/mozos/MozosPage.tsx` |
| 909 | 1.073 | 1,5 | 1,5 | `pages/admin/gerente/HistorialSesionesPage.tsx` |
| 816 | 1.220 | 26,1 | 27,8 | `pages/admin/menu/AdminMenuPage.tsx` |
| 751 | 871 | 0,0 | 0,0 | `pages/admin/gerente/HistorialPage.tsx` |
| 670 | 817 | 2,9 | 2,9 | `pages/admin/tables/TablesPage.tsx` |
| 643 | 776 | 6,1 | 6,1 | `pages/admin/gerente/PedidosPage.tsx` |
| 628 | 743 | 0,0 | 0,0 | `pages/admin/gerente/GerenceMesasPage.tsx` |
| 525 | 669 | 6,3 | 6,2 | `pages/admin/pagos/PagosPage.tsx` |
| 448 | 519 | 2,8 | 2,8 | `pages/admin/auditoria/AuditoriaPage.tsx` |
| 411 | 831 | 44,2 | 45,5 | `pages/admin/menu/ItemFormModal.tsx` |
| 389 | 476 | 5,4 | 5,4 | `pages/admin/reportes/ReportesPage.tsx` |
| 345 | 398 | 0,0 | 0,0 | `pages/admin/dashboard/DashboardPage.tsx` |
| 212 | 1.015 | 74,7 | 72,0 | `pages/admin/gerente/TomaPedidosPage.tsx` |
| 187 | 211 | 0,0 | 0,0 | `pages/admin/menu/ItemsTab.tsx` |
| 175 | 458 | 37,7 | 37,7 | `services/api.ts` |

### web-cliente

| Sin cubrir | ncloc | Cobertura de líneas | Cobertura de Sonar | Archivo |
|---:|---:|---:|---:|---|
| 434 | 496 | 1,8 | 1,8 | `pages/etiquetado/EtiquetarPedidosPage.tsx` |
| 375 | 429 | 1,8 | 1,8 | `pages/pago/PagarPage.tsx` |
| 304 | 340 | 2,9 | 2,9 | `pages/dividir/MensajePage.tsx` |
| 257 | 648 | 56,7 | 56,0 | `pages/carrito/CarritoPage.tsx` |
| 198 | 253 | 14,7 | 14,7 | `pages/pedidos/MisPedidosPage.tsx` |
| 193 | 220 | 4,5 | 4,5 | `pages/dividir/CantidadComensalesPage.tsx` |
| 102 | 137 | 20,9 | 20,9 | `pages/entrada/ElegirNombrePage.tsx` |
| 90 | 429 | 75,3 | 73,6 | `pages/menu/ItemDetailPage.tsx` |
| 87 | 117 | 5,4 | 5,4 | `hooks/useEtiquetado.ts` |
| 86 | 216 | 48,8 | 51,9 | `services/api.ts` |
| 86 | 181 | 48,5 | 49,7 | `App.tsx` |
| 61 | 74 | 9,0 | 9,0 | `components/GraciasCard.tsx` |
| 39 | 57 | 15,2 | 15,2 | `hooks/usePedidosCliente.ts` |
| 20 | 45 | 45,9 | 48,7 | `store/comensalStore.ts` |
| 19 | 25 | 9,5 | 9,5 | `pages/pago/PagoPendientePage.tsx` |

### web-staff

| Sin cubrir | ncloc | Cobertura de líneas | Cobertura de Sonar | Archivo |
|---:|---:|---:|---:|---|
| 566 | 636 | 0,0 | 0,0 | `pages/mozo/MozoPanel.tsx` |
| 547 | 633 | 0,0 | 0,0 | `pages/mozo/HistorialPage.tsx` |
| 432 | 486 | 0,0 | 0,0 | `pages/mozo/MesasPage.tsx` |
| 417 | 467 | 0,0 | 0,0 | `pages/mozo/PedidosPage.tsx` |
| 358 | 390 | 0,0 | 0,0 | `pages/cocina/CocinaPage.tsx` |
| 317 | 378 | 0,0 | 0,0 | `pages/gerente/PagosGerente.tsx` |
| 299 | 346 | 0,0 | 0,0 | `pages/selector/SelectorPage.tsx` |
| 247 | 291 | 0,0 | 0,0 | `components/CobroModal.tsx` |
| 217 | 259 | 0,0 | 0,0 | `pages/mozo/PagosMozo.tsx` |
| 176 | 737 | 72,3 | 69,8 | `pages/mozo/TomaPedidosPage.tsx` |
| 170 | 193 | 0,0 | 0,0 | `components/MozoNotifications.tsx` |
| 109 | 307 | 0,0 | 0,0 | `services/api.ts` |
| 77 | 60 | 0,0 | 0,0 | `services/impresora.ts` |
| 63 | 64 | 0,0 | 0,0 | `services/socket.ts` |
| 58 | 240 | 69,3 | 68,4 | `components/PageHeader.tsx` |

## 7. Bugs y vulnerabilidades abiertos

> **Foto del commit `3a7e23d`.** Son todos los bugs y vulnerabilidades abiertos en ese análisis. Todos son MAJOR. Las rutas son relativas a `apps/`.

### Bugs (3)

| Archivo:línea | Regla | Severidad | Mensaje |
|---|---|---|---|
| `backend/src/discovery/dto/buscar-discovery.dto.ts:18` | `typescript:S6324` | MAJOR | Remove this control character. |
| `backend/src/main.ts:32` | `typescript:S9383` | MAJOR | Promises must be awaited, end with a call to .catch, end with a call to .then with a rejection handler or be explicitly marked as ignored with the `void` operator. |
| `backend/src/sessions/sessions.service.ts:40` | `typescript:S6959` | MAJOR | Add an initial value to this "reduce()" call. |

### Vulnerabilidades (6)

| Archivo:línea | Regla | Severidad | Mensaje |
|---|---|---|---|
| `backend/src/mesas/mesas.service.ts:141` | `typescript:S2245` | MAJOR | Make sure that using this pseudorandom number generator is safe here. |
| `backend/src/sessions/sessions.service.ts:761` | `typescript:S2245` | MAJOR | Make sure that using this pseudorandom number generator is safe here. |
| `web-admin/src/pages/admin/gerente/TomaPedidosPage.tsx:125` | `typescript:S2245` | MAJOR | Make sure that using this pseudorandom number generator is safe here. |
| `web-admin/src/pages/admin/gerente/TomaPedidosPage.tsx:125` | `typescript:S2245` | MAJOR | Make sure that using this pseudorandom number generator is safe here. |
| `web-staff/src/pages/mozo/TomaPedidosPage.tsx:68` | `typescript:S2245` | MAJOR | Make sure that using this pseudorandom number generator is safe here. |
| `web-staff/src/store/notificationStore.ts:25` | `typescript:S2245` | MAJOR | Make sure that using this pseudorandom number generator is safe here. |

`TomaPedidosPage.tsx:125` de web-admin figura dos veces porque esa línea llama dos veces a `Math.random()`.
