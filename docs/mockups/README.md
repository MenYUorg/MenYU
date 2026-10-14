# Mockups de Discovery (Fase 6)

Prototipos en HTML de las pantallas nuevas de `web-cliente`: el home con ofertas y restaurantes, la búsqueda, la pantalla del restaurante, el ingreso a una mesa con QR (el PIN queda escondido) y el escáner de QR con sus estados (si falla, recomienda escanear con la cámara del celular o usar el PIN). Fueron aprobados antes de implementar la Fase 6 (decisión D14 de [`../plan-discovery-descuentos.md`](../plan-discovery-descuentos.md)). No forman parte de ninguna app ni del build.

## Cómo verlos

Abrí **`index.html`** en el navegador (doble clic, no hace falta servidor). Tiene:

- La lista de pantallas y estados a la izquierda (cargando, vacío, error, sin resultados, la cámara que falla y los casos límite).
- Un selector de ancho: celular (320, 360 y 390), tablet (768), escritorio (1280) o los tres a la vez.
- **Decisiones tomadas**: lo que se acordó sobre los mockups.

El buscador del home funciona con los datos de ejemplo (ignora acentos y mayúsculas, como la búsqueda real) y en el ingreso a mesa el texto chico del PIN se puede tocar. Cada pantalla también se abre sola con el botón "Abrir sola" para probarla con las herramientas del navegador.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | El visor. |
| `header.html` | El header, sin sesión y con sesión (nombre corto, con apellido, largo y larguísimo). |
| `discovery.html` | Home y búsqueda. `?estado=` `normal`, `cargando`, `error`, `vacio`, `sin-ofertas`, `muchas`, `limite`, `buscando`, `error-busqueda`; `?q=` el texto buscado; `?usuario=` con sesión iniciada. |
| `restaurante.html` | Pantalla del restaurante. `?id=` `parrilla`, `fiore`, `burger-palermo`, `almendra`, `kaori`, `rincon`, `larga`, `mesa7`; `?estado=` `cargando`, `error`. |
| `mesa.html` | Ingreso a una mesa. `?id=` igual que arriba; `?estado=` `pin`, `pin-escrito`, `abriendo`, `error-pin`, `error-qr`, `pin-desde-camara`, `cargando`, `error`. |
| `escaner.html` | El escáner de QR (cámara). `?origen=` `mesa` (con `?id=`) o `home`; `?estado=` `esperando`, `escaneando`, `denegado`, `sin-camara`, `sin-soporte`. |
| `mockups.css` | Estilos. Los colores son los de `apps/web-cliente/src/theme.ts`; las medidas son las de `EntradaPage`, `IngresoManualPage`, `AppHeader`, `ClienteMenuPage` e `ItemCard`. |
| `mockups.js` | Datos de ejemplo (todo inventado) y piezas de HTML compartidas. |

Usan el logo real de `apps/web-cliente/public/` y el placeholder de `packages/ui`, por eso hay que verlos dentro del repositorio. Las tipografías (Montserrat e Inter) se cargan desde Google Fonts: sin conexión se ven con la fuente del sistema. La imagen de la cámara del escáner es de mentira.

## Después

Cuando la Fase 6 esté implementada, esta carpeta se puede borrar o dejar como referencia del diseño aprobado.
