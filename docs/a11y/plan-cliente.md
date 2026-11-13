# Plan de accesibilidad de web-cliente (MenYU)

Este es el plan para llevar el flujo del comensal (`apps/web-cliente`) a WCAG 2.2 nivel AA, más el contraste de colores en `packages/ui`, web-admin y web-staff. Sale de la auditoría `docs/a11y/` (ver "Material de partida") y de las decisiones de abajo. **Es la fuente de verdad del trabajo:** se actualiza a medida que se avanza (se tachan las tareas hechas, se anota lo que cambió y por qué, y se marca lo pendiente). El registro de cada etapa está en [`bitacora.md`](bitacora.md).

Rama: `feat/a11y-cliente`, creada desde `origin/main` en `92904e0` (13/11/2026). El PR se abre como borrador desde la etapa 1 para ver el quality gate de SonarCloud en cada push.

## Cómo se trabaja

1. **Una etapa por vez.** Al terminar una etapa se frena, se revisa el diff y recién después se sigue con la siguiente. No se mezclan etapas.
2. **Cada comportamiento nuevo lleva su test en la misma etapa:** qué anuncia, a dónde va el foco y qué nombre, rol y estado tiene cada control. Se testea con Testing Library por rol y nombre (`getByRole('button', { name: 'Quitar Cebolla' })`).
3. **axe en cada pantalla que se toca:** `expect(await axe(container)).toHaveNoViolations()`, con el helper de `src/test/axe.ts` (sin la regla `color-contrast`, que en jsdom no anda). El contraste se prueba con un test unitario sobre `theme.ts` (etapa 6).
4. **Sin duplicar:** un solo anunciador, un solo componente de cantidad, `useCerrarConEscape` (de `packages/ui`) para Esc.
5. **Antes de cerrar cada etapa:** `pnpm typecheck`; lint, tests con cobertura y build de web-cliente; tests de `packages/ui`; y, si se tocó `packages/ui`, también las suites de web-admin y web-staff. Los números van a la bitácora.
6. **Quality gate de SonarCloud** (solo mide el código nuevo del PR): cobertura de 80 % o más, duplicación de 5 % o menos, calificación A en confiabilidad, seguridad y mantenibilidad, y hotspots revisados. Cada línea que se toca tiene que quedar cubierta.
7. **Dependencias:** solo `vitest-axe` (etapa 1) y `eslint-plugin-jsx-a11y` (etapa 7), de desarrollo y solo en web-cliente. Cualquier otra se consulta antes.
8. **Reglas de `CLAUDE.md`:** ningún archivo de web-cliente importa `@menyu/auth-client` de forma estática (solo `utils/authClientDiferido.ts`, con `import()`) y el panel del asistente se carga con `React.lazy`.
9. **Quién commitea:** los commits, el push y el PR los hace Margarita (en PowerShell, con mensajes en español con el formato del repo: `feat(web-cliente): …`, `test(web-cliente): …`, `docs(a11y): …`). Al cerrar cada etapa se entregan los comandos listos, sin firmas ni menciones a la herramienta.

## Material de partida

- **Auditoría:** `docs/a11y/Auditoría de accesibilidad — MenYU.md` (12/11/2026, sobre el commit `3fcb2f0`). El plan original la llama `auditoria-general.md`: está en el repo con otro nombre. Pendiente decidir si se renombra (ver "Preguntas abiertas").
- **Trabajo de Coty mergeado el 12/11** y que se cruza con este:
  - `useCerrarConEscape` en `packages/ui/src/useCerrarConEscape.ts`: se reusa, no se duplica.
  - El script de axe sobre staging: `scripts/accesibilidad/main.mjs`.
  - La guía de recorridos con lector: `docs/calidad/accesibilidad-recorridos-lector.md` (C1 a C8 para el comensal). **No se editan los recorridos**: solo se cargan resultados en su tabla de registro (etapa 7).
- **Estándar:** WCAG 2.2 nivel AA.

### Verificación de las líneas citadas (13/11/2026)

La auditoría se hizo sobre `3fcb2f0`; `origin/main` está en `92904e0`. Entre los dos, el único cambio en `apps/web-cliente` y `packages/ui` es el PR #464 (`fix(ui)`, modales y tarjeta del historial, que agrega `useCerrarConEscape`): **`apps/web-cliente` no cambió**, así que las líneas citadas coinciden. Se comprobó cada una el 13/11. Diferencias a tener en cuenta:

| Cita del plan | Qué se encontró |
| --- | --- |
| `PantallaComensal.tsx:56` (título en un `<span>`) | El `<span>` empieza en la línea 48; la 56 es `{titulo}`. Es el mismo lugar. |
| `usePedidosCliente.ts:60-63` (cambio de estado por WebSocket) | El handler `order:updated` está unas líneas más abajo (~62-65). Verificar al llegar a la etapa 5. |
| "13 `toFixed(2)` sueltos" | Son 13 (carrito 4, detalle 2, mensaje 1, cantidad 1, etiquetar 1, pagar 4), más el de `formatearPrecio` en `utils/precio.ts`, que es el que se cambia. |
| "11 de 17 pantallas sin `<h1>`, 14 sin `<main>`" | Antes de la etapa 1, `<h1>` estaba en 8 archivos y `<main>` en 5. El detalle por pantalla está en la etapa 1. |

El resto de las líneas de las etapas 2 a 5 (menú lateral, filtro de dietas, detalle, carrito, mis pedidos, PIN, nombre, pago, etiquetar y dividir) coincide con lo que dice el plan.

## Decisiones tomadas

1. **PIN para personas ciegas:** fuera del alcance de la web. Se documenta en el IPI como límite (el mozo le dice el PIN, o braille en la mesa).
2. **Estados del pedido** (`pages/pedidos/MisPedidosPage.tsx`), todos con el mismo color de badge (fondo `#FDE5DF`, texto `#B8432C`). La barra de progreso no cambia, y la confirmación del carrito sigue diciendo "¡Pedido enviado a cocina!".

   | Estado en el backend | Texto que ve el cliente |
   | --- | --- |
   | `pendiente` | Enviado a cocina |
   | `en_preparacion` | En preparación |
   | `listo` | Listo para servir |
   | `entregado` | Entregado |
   | `anulado` | Cancelado |

3. **"+" de la tarjeta del plato:** sigue abriendo el detalle y pasa a llamarse "Ver {plato}".
4. **Anuncios:** cortos ("Cheddar: 1", "Hamburguesa doble agregada al carrito"), sin repetir el total.
5. **Precios:** formato argentino con `Intl.NumberFormat('es-AR')`, sin decimales si el número es entero ("$ 9.000") y con dos si no ("$ 1.234,50"). Se cambia `formatearPrecio` en `utils/precio.ts`; admin y staff no cambian, porque `PrecioConDescuento` recibe el formateador por prop.
6. **Escáner de QR:** fuera de alcance.
7. **Recomendaciones del chef:** ya están en `main` (PR #328) y son una sección de `/menu`; sus problemas se arreglan con los del menú.
8. **Alcance:** la accesibilidad completa del flujo del comensal en web-cliente. De admin y staff, solo el contraste.
9. **Coral (propuesta mínima):**
   - `#CC4A31` como coral principal, en lugar de `#E8563A` (pasa de 3,6:1 a 4,6:1 con blanco).
   - `#B8432C` para el texto coral sobre el rosado `#FDE5DF` y para el hover de los botones (hoy `#d34a30`).
   - En web-cliente se unifica en un solo token en `theme.ts`; hoy está definido en 9 paletas (`theme.ts`, `components/menu/paleta.ts` y constantes `C` sueltas) y escrito a mano en 7 lugares más.
10. **Contraste en `packages/ui`, admin y staff:**
    - En `packages/ui` se cambian los valores por defecto de `DescuentoBadge` (coral fijo, línea 21) y `PrecioConDescuento` (coral por defecto, línea 55, y precio tachado en gris `#9CA3AF`, línea 71). Web-cliente no usa `Modal`: no se toca.
    - En admin y staff se cambia el coral y el gris de texto `#9CA3AF` (pasa a `#6B7280`, 4,8:1). Nada más de accesibilidad en esas apps.
11. **Tests:** `vitest-axe` en componentes y `eslint-plugin-jsx-a11y` solo en web-cliente.
12. **Rama:** `feat/a11y-cliente`.
13. **Celulares:** se prueba con iPhone y VoiceOver (Safari) y con Android y TalkBack (Chrome).

## Línea base

Medida el 13/11/2026 sobre `92904e0` (Node 24.15; ver la nota en la bitácora sobre un error del entorno que hace perder el reporte de un archivo):

| | Archivos de test | Tests | Líneas | Ramas | Funciones |
| --- | --- | --- | --- | --- | --- |
| web-cliente | 44 | 768 | 86,08 % | 91,23 % | 79,90 % |
| `packages/ui` | 5 | 44 | 65,72 % | 96,90 % | 92,30 % |

Archivos de web-cliente con poca cobertura que se van a tocar: `pages/entrada/ElegirNombrePage.tsx` (21 %), `pages/carrito/CarritoPage.tsx` (54 %), `App.tsx` (54 %) y `pages/menu/ItemDetailPage.tsx` (75 %).

## Etapas

Las rutas son relativas a `apps/web-cliente/src/` salvo que digan otra cosa.

### Etapa 1. Base compartida — hecha (13/11/2026), a la espera de revisión

- [x] `docs/a11y/plan-cliente.md` y `docs/a11y/bitacora.md`.
- [x] `vitest-axe` 0.1.0 como dependencia de desarrollo (versión exacta, como las demás librerías de test) y el helper `test/axe.ts`, que corre axe sin `color-contrast`. Registrado en `test/setup.ts`; los tipos de los matchers, en `test/vitest-axe.d.ts` (la librería los declara para el espacio de nombres viejo de Vitest).
- [x] **Anunciador global.** `components/Anunciador.tsx` (región `role="status"`, `aria-live="polite"`, `aria-atomic="true"`) montada en `App.tsx` desde el arranque, y `utils/anunciador.ts` con `anunciar(mensaje)` para mandarle mensajes desde cualquier pantalla.
  - Se pinta en el `<body>` con un portal, para que el menú lateral o el asistente puedan volver inerte el resto de la página sin tragarse los anuncios (etapa 3).
  - El texto va en un `<span key={n}>`: un mensaje igual al anterior ("Cheddar: 1" dos veces) vuelve a agregarse a la región y se lee de nuevo.
  - Se vacía a los 6 segundos, para que un texto viejo no quede a la vista al recorrer la página.
- [x] **Título por pantalla.** `components/SeguimientoDeRuta.tsx` (dentro del router, no pinta nada) pone `document.title`. Formato "{Pantalla} · {Restaurante}", o "{Pantalla} · MenYU" cuando todavía no se sabe de qué restaurante es. El nombre de cada pantalla está en `utils/pantallas.ts`:

  | Ruta | Título |
  | --- | --- |
  | `/` | Descubrir restaurantes |
  | `/restaurante/:id` | Restaurante |
  | `/restaurante/:id/mesa` | Ingresar a una mesa |
  | `/restaurante/:id/carta` | Carta |
  | `/check-in` | Ingreso a la mesa |
  | `/elegir-nombre` | Tu nombre |
  | `/menu` | Menú |
  | `/menu/:itemId` | el nombre del plato (respaldo: "Detalle del plato") |
  | `/carrito` | Carrito |
  | `/pedidos` | Mis pedidos |
  | `/pagar` | Pagar la cuenta |
  | `/pago/exitoso`, `/fallido`, `/pendiente` | Pago exitoso, Pago fallido, Pago pendiente |
  | `/etiquetar` | Etiquetar pedidos |
  | `/dividir/cantidad`, `/dividir/mensaje` | Cantidad de comensales, Armar mensaje |
  | `/auth`, `/ingresar-pin` y las desconocidas (redirigen) | MenYU |

  El restaurante sale de la dirección (`/restaurante/:id/…`) o, en las pantallas de la mesa, de la sesión; el nombre, del menú ya pedido o de Discovery (`hooks/useTituloDeLaPantalla.ts`). El título de `index.html` pasó de "MenYu" a "MenYU".
- [x] **Foco al cambiar de ruta.** El mismo componente lleva el foco al `<h1>` de la pantalla nueva (`utils/enfocarTitulo.ts`: le pone `tabindex="-1"` y lo enfoca). Si la pantalla pide datos antes de pintar su título, espera a que aparezca (hasta 4 s); si la persona toca o escribe antes, deja de esperar. En la primera carga no se mueve, y quedarse en la misma ruta (cambia solo la búsqueda de la dirección) tampoco.
- [x] **`<h1>`.** `PantallaComensal.tsx`: el título pasa de `<span>` a `<h1>` (carrito, mis pedidos, etiquetar, pagar y las dos de dividir). En `/menu` y en la carta pública, el `<h1>` es el nombre del restaurante (`MenuHeader.tsx`). Además, para que ninguna pantalla quede sin título:
  - `BloqueEstado` acepta `nivelDelTitulo={1}` y lo usan las pantallas en las que el bloque es toda la pantalla ("No encontramos este restaurante" en el restaurante, el ingreso a mesa y la carta, y "No pudimos cargar el restaurante").
  - Los estados "No se pudo cargar el menú" (menú, carta y detalle) e "Ítem no encontrado" pasan a `<h1>` (con `fontWeight: 400`, igual que antes se veían).
  - `Shell` (entrada a la mesa) tiene `subtituloEsTitulo`: "Abriendo tu mesa…" de `/check-in` es el `<h1>`. "¡Sos el anfitrión de la mesa!" y "Mesa en modo seguro" pasan de `<p>` a `<h1>`.
  - **Todavía sin `<h1>`:** `/pago/exitoso`, `/pago/fallido` y `/pago/pendiente` y la confirmación del carrito ("¡Pedido enviado a cocina!"). Son de la etapa 5.
- [x] **`<main>`** en todas las pantallas que no lo tenían: `MarcoPantalla` (mis pedidos, etiquetar, pagar y las dos de dividir), los tres estados del carrito, el detalle del plato (y sus estados de carga y error), el menú y la carta (el buscador, las secciones y los botones flotantes; el encabezado queda afuera), el nombre, los tres resultados del pago y `Shell`. El `<main>` de `MarcoPantalla` y del carrito lleva `flex: 1` y `display: flex` para no mover nada de lugar; se comprobó en Edge real (390 px): la página no se desplaza y la carta sigue desplazándose por su zona interna.
- [x] Tests: ver la bitácora. Cobertura de web-cliente: 86,08 % → 92,43 %.

**Lo que queda de esta etapa:** abrir el PR como borrador y anotar el resultado de SonarCloud en la bitácora.

### Etapa 2. Formato de precios

- [ ] `utils/precio.ts`: `formatearPrecio` con `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`, sin decimales si el número es entero y con dos si no.
- [ ] Los 13 `toFixed(2)` sueltos pasan a usar `formatearPrecio`:
  - `pages/carrito/CarritoPage.tsx`, líneas 185, 197, 440 y 551
  - `pages/menu/ItemDetailPage.tsx`, líneas 286 y 441
  - `pages/dividir/MensajePage.tsx`, línea 21
  - `pages/dividir/CantidadComensalesPage.tsx`, línea 162
  - `pages/etiquetado/EtiquetarPedidosPage.tsx`, línea 51
  - `pages/pago/PagarPage.tsx`, líneas 222, 345, 351 y 376
- [ ] Tests de `formatearPrecio`: enteros, centavos, cero y montos grandes.
- [ ] Actualizar los precios escritos como "$9000.00" en los tests (57 en 12 archivos, según el plan; con los tests nuevos de la etapa 1 son más). `Intl` pone un espacio no separable (U+00A0) después del "$": comparar contra `formatearPrecio(...)` o contra ese espacio. Ojo con los tests nuevos de la etapa 1 que mencionan precios.

### Etapa 3. Bloqueantes

**Menú lateral** (`components/menu/MenuDrawer.tsx`). Hoy "Mis pedidos" y "Etiquetar pedidos" solo se abren desde acá y no se pueden activar con lector.

- [ ] Las opciones son `<div>` clickeables (líneas 9-16 y las filas de 188-191): pasan a ser botones o enlaces reales.
- [ ] Cerrado (líneas 104-110), el panel se oculta solo con `transform`, así que se sigue leyendo primero y recibe foco. Cerrado tiene que quedar fuera del árbol de accesibilidad (`inert`).
- [ ] Abierto, se comporta como diálogo: foco adentro, fondo inerte, cierre con Esc (`useCerrarConEscape`) y foco de vuelta a "Abrir el menú". **Ojo:** el fondo inerte no puede incluir al anunciador (por eso se pinta en el `<body>`, fuera de `#root`).
- [ ] `components/menu/MenuHeader.tsx:137`: "Abrir el menú" expone si está expandido.

**Filtro de dietas** (`components/menu/BarraBusqueda.tsx`):

- [ ] Las opciones (líneas 141-155) son `<div>` sin rol ni estado, y la elegida solo se marca con "✓". Pasan a casillas que digan si están marcadas ("Vegano, 2 platos, marcada").
- [ ] El botón "🥗 Dietas ▾" (líneas 95-108) lee el emoji y la flecha. Pasa a un nombre limpio ("Filtrar por dieta, 1 activo"), con estado expandido y emojis ocultos.
- [ ] Al aplicar o limpiar (líneas 49 y 55): anunciar cuántos platos quedan y devolver el foco al botón de dietas.

### Etapa 4. Menú, detalle y discovery

**Menú:**

- [ ] `components/menu/BarraBusqueda.tsx:65`: el buscador lleva `aria-label="Buscar platos"` y anuncia "N platos" o "Ningún plato coincide".
- [ ] `BarraBusqueda.tsx:80`: el botón "×" pasa a llamarse "Borrar búsqueda".
- [ ] `components/menu/ChipsSecciones.tsx:23`: el chip de sección lleva el foco al encabezado de esa sección y expone cuál está activo.
- [ ] `components/ItemCard.tsx:76`: el botón pasa a "Ver {plato}" (decisión 3).
- [ ] `ItemCard.tsx:42`: la foto es decorativa (`alt=""`), porque el nombre ya está escrito al lado.
- [ ] `ItemCard.tsx:20`: la tarjeta tiene un `onClick` en un `<div>`; con el botón alcanza para teclado, pero revisarlo.
- [ ] `components/menu/MenuHeader.tsx:66-80`: el botón del mozo anuncia "Avisamos al mozo" o el error, sin deshabilitarse (hoy el foco se pierde).
- [ ] `components/menu/BotonCarrito.tsx:8` y `:23`: hoy se lee "🛒 1" y el número cuenta líneas. Pasa a "Ver carrito, N ítems", sumando unidades.
- [ ] `App.tsx:57-62`: si el menú se recarga porque el restaurante lo cambió, anunciar "El menú se actualizó".
- [ ] Ocultar los emojis decorativos: 🔍, 🥗, ▾, 🔔, y 🏷️, 📋 y 💳 del menú lateral.

**Detalle** (`pages/menu/ItemDetailPage.tsx`):

- [ ] Línea 241: el interruptor de ingrediente dice "Quitar"/"Restaurar" sin nombrar el ingrediente. Pasa a `role="switch"` con el estado ("Cebolla, incluida" / "Cebolla, quitada").
- [ ] Líneas 292, 302, 363 y 373: los "−" y "+" usan **un componente de cantidad compartido** (se reusa en el carrito en la etapa 5), con nombre ("Sumar Cheddar", "Restar Hamburguesa doble") y que anuncia el valor nuevo ("Cheddar: 1").
- [ ] Líneas 214, 225 y 271: "Personalizá tu plato", "Quitar ingredientes" y "Agregar extras" pasan a ser encabezados.
- [ ] Línea 236: el alérgeno se escribe en texto ("contiene alérgeno"); hoy es solo el emoji ⚠️.
- [ ] Línea 327: "📝 Nota para cocina" se asocia al campo, que hoy se anuncia como "(opcional)". Emoji oculto.
- [ ] Línea 361: "Cant." pasa a "Cantidad".
- [ ] Línea 418: al agregar, anunciar "{plato} agregado al carrito" (hoy navega al carrito en silencio).
- [ ] Línea 436: ocultar el 🛒 del botón.
- [ ] Línea 147: foto decorativa, porque el nombre está en el `<h1>`.
- [ ] Línea 154: el botón "←" pasa a llamarse "Volver".

**Discovery:**

- [ ] `pages/discovery/DiscoveryPage.tsx:115`: anunciar cuántas ofertas y restaurantes coinciden, o que no hay resultados.
- [ ] `DiscoveryPage.tsx:138`: la región de "Buscando…" queda siempre montada y solo cambia su texto.
- [ ] `components/discovery/TarjetaOferta.tsx:27`: foto decorativa.

### Etapa 5. Carrito, pedidos, PIN, nombre y pago

**Carrito** (`pages/carrito/CarritoPage.tsx`):

- [ ] Líneas 123-133: después de confirmar, el foco va al título "¡Pedido enviado a cocina!", que pasa a `<h1>`, y se oculta el "✓". Hoy el foco cae en el `<body>` y no se anuncia nada.
- [ ] Línea 516: "Quitar" pasa a "Quitar {plato}" (hoy mide 35×18 px; ver etapa 6).
- [ ] Líneas 457 y 485: los "−" y "+" usan el componente de cantidad de la etapa 4.
- [ ] Línea 363: los extras se escriben en palabras ("Con Cheddar, 1"), no "+ Cheddar ×1".
- [ ] Línea 324: la región de "precios actualizados" queda siempre montada.
- [ ] Línea 386: el nombre clickeable del plato pasa a ser un botón o enlace.

**Mis pedidos:**

- [ ] `pages/pedidos/MisPedidosPage.tsx:18-23`: textos y color de la decisión 2.
- [ ] Línea 110: la barra de progreso es decorativa (`aria-hidden`), porque la etiqueta ya dice el estado.
- [ ] Línea 71: el número de pedido se lee como "Pedido {código}".
- [ ] `hooks/usePedidosCliente.ts` (~62-65): cuando llega un cambio de estado por WebSocket, anunciar "Tu pedido de {plato} está {estado}".
- [ ] `App.tsx:72-86`: la tarjeta de agradecimiento que aparece cuando se cierra la sesión pasa a ser un diálogo de alerta, con el foco en el mensaje. Ojo: `GraciasCard` también se usa en `/pago/exitoso`; el título será `<h1>` en la página y no en el diálogo.

**PIN** (`pages/restaurante/IngresoMesaPage.tsx`):

- [ ] Línea 189: hoy el campo se deshabilita durante el envío y pierde el foco. No deshabilitarlo, o devolverle el foco cuando vuelve el error.
- [ ] Línea 200: con error, el campo queda inválido (`aria-invalid`) y asociado al texto del error (`aria-describedby`). Hoy se marca solo con el borde coral.
- [ ] Líneas 159-170: "Ingresar con PIN" pasa a ser una opción del mismo nivel que "Escanear QR", no un texto escondido.

**Nombre** (`pages/entrada/ElegirNombrePage.tsx`):

- [ ] Línea 91: el label "Tu nombre" se asocia al campo, que hoy se anuncia como "Ej: Juan" (el spec nuevo de la etapa 1 busca el campo por su placeholder: ajustarlo).
- [ ] Línea 95: se saca el `autoFocus` y el foco va al título.
- [ ] Línea 105: "Continuar" queda activo; si el nombre está vacío, se anuncia el error al tocarlo.

**Pago** (`pages/pago/`):

- [ ] `PagarPage.tsx:309`: la cuenta pasa a ser una tabla real con encabezados, o una lista donde cada ítem se lea entero.
- [ ] `PagarPage.tsx:251` y `:260`: el fondo clickeable del modal.
- [ ] `PagoFallidoPage.tsx:8` y `PagoPendientePage.tsx:8`: emojis ❌ y ⏳ ocultos.
- [ ] `PagoFallidoPage.tsx:9`, `PagoPendientePage.tsx:9` y `components/GraciasCard.tsx`: el título pasa a `<h1>`.

**Etiquetar y dividir:**

- [ ] `pages/etiquetado/EtiquetarPedidosPage.tsx:61`: el chip de comensal expone si está presionado (`aria-pressed`) y su nombre incluye el plato ("Marga, Hamburguesa doble").
- [ ] `EtiquetarPedidosPage.tsx:329`: sacar el `autoFocus`.
- [ ] `pages/dividir/CantidadComensalesPage.tsx`: el botón con el número dice "Editar cantidad" sin el valor (axe marca `label-content-name-mismatch`), y el monto por persona cambia sin anunciarse.

### Etapa 6. Contraste, foco visible y tamaños

**web-cliente:**

- [ ] Un solo token de coral en `theme.ts` (decisión 9). Las demás paletas lo importan en vez de redefinirlo.
- [ ] Test unitario de contraste sobre los pares de colores de `theme.ts`.
- [ ] El gris de texto `#9CA3AF` pasa a `#6B7280`.
- [ ] **Foco visible** (WCAG 2.4.7): reemplazar los `outline: 'none'` en línea por un indicador de foco visible, como hace web-auth con `focus-visible:ring`. Por ejemplo, el buscador del menú hoy no tiene ninguno. Acá se decide también qué pasa con el anillo del `<h1>` al que va el foco en cada cambio de pantalla (ver "Preguntas abiertas").
- [ ] **Tamaños táctiles** (WCAG 2.5.8, mínimo 24×24 px, ideal 44×44):
  - "Quitar" del carrito (35×18) es el único debajo del mínimo: obligatorio.
  - Llevar a 44 si se puede: los "+" de las tarjetas (28×28), los "−"/"+" del detalle y del carrito (32×32), el interruptor (44×24), los chips de sección y de comensal (32-34 de alto), las flechas de volver (29×26) y los botones del encabezado (28-30 de alto).

**`packages/ui`:**

- [ ] `DescuentoBadge.tsx:21` y `PrecioConDescuento.tsx:55` y `:71`, con specs nuevos en `packages/ui` (hoy tienen 0 % de cobertura en esa suite).

**Admin y staff:**

- [ ] Coral y gris de texto.
- [ ] Hoy el coral aparece 50 veces en 19 archivos de admin y 24 en 11 de staff; el gris como texto, 53 en 17 y 11 en 7.
- [ ] Ningún test compara colores, pero Sonar cuenta cada línea cambiada como código nuevo. **Al empezar la etapa, medir la cobertura de esos archivos y proponer cómo seguir.** Por defecto, va en un PR aparte. Si la cobertura de esas líneas pasa el 80 % y el diff queda prolijo, puede ir en el mismo.

### Etapa 7. Cierre

- [ ] `eslint-plugin-jsx-a11y` (configuración `recommended`) en el `eslint.config.js` de web-cliente, con todo en verde. El lint corre con `--max-warnings 0`.
- [ ] Correr el axe de Coty sobre staging y anotar el resultado en la bitácora.
- [ ] Prueba con los dos celulares siguiendo los recorridos C1 a C8, con los resultados en la tabla de registro de `docs/calidad/accesibilidad-recorridos-lector.md`.
- [ ] Marcar en la auditoría qué hallazgo se resolvió en qué etapa, y cerrar este documento.

## Recorridos con lector (C1 a C8) por etapa

Estimación de qué recorridos de `docs/calidad/accesibilidad-recorridos-lector.md` deberían andar al terminar cada etapa (se ajusta con lo que se vea en las pruebas):

| Etapa | Qué debería andar |
| --- | --- |
| 1 | El punto 1 de "En cada pantalla" (se anuncia el título o el encabezado principal al llegar) en las pantallas de C1 a C7. Ningún recorrido completo todavía. |
| 2 | Los precios se leen como importes ("nueve mil pesos"), en todos los recorridos. |
| 3 | C5 y C7 se pueden empezar (se llega a "Mis pedidos" y a "Etiquetar" desde el menú lateral); el filtro de dietas de C1. |
| 4 | C1 y C6 completos; C4 hasta agregar el plato; la búsqueda anuncia cuántos resultados hay. |
| 5 | C2, C3, C4, C5 y C7 completos. |
| 6 | Transversal: contraste, foco visible y tamaños de toque, en todos. |
| 7 | Todos, con la prueba en los dos celulares. **C8 (asistente) no tiene etapa en este plan:** el panel ya tiene `role="dialog"`, pero no se revisó (preguntar si se incluye). |

## Hallazgos fuera del plan (a decidir)

Cosas que aparecieron al trabajar y que el plan no menciona. No se tocaron.

1. **`MensajePage`: el `<textarea>` con el mensaje armado no tiene etiqueta** (axe: `label`). Arreglo mínimo: `aria-label="Mensaje para compartir"`. Mientras tanto, el test de axe de esa pantalla desactiva solo esa regla, con un comentario que apunta acá.
2. **Anillo de foco en el `<h1>`.** Al llevar el foco al título en cada cambio de pantalla, el navegador dibuja su anillo de foco alrededor (se ve cuando el foco llega por código o por teclado). Es correcto para accesibilidad, pero es un cambio visual. Opción: dejarlo, o quitarlo solo en los títulos (`h1[tabindex="-1"]:focus { outline: none }`), que no son controles.
3. **Título de la pestaña sin restaurante al entrar directo a una pantalla de la mesa** (por ejemplo `/pedidos` recién abierto): dice "Mis pedidos · MenYU" hasta que se carga el menú. Hoy solo `/menu`, `/carrito` y el detalle piden el menú. No es un error de accesibilidad, solo un título menos completo.
4. **Zona con scroll de la carta que no se puede enfocar con teclado** (la auditoría sugiere `tabIndex={0}`): no se puede comprobar en jsdom. Para verificarlo en el axe de staging (etapa 7); los navegadores recientes ya hacen enfocables los contenedores con scroll que no tienen nada enfocable adentro.

## Preguntas abiertas

- ¿Se renombra `Auditoría de accesibilidad — MenYU.md` a `auditoria-general.md`, como la llama el plan? (hoy no está en git)
- Hallazgos 1 y 2 de arriba: ¿se arreglan (y en qué etapa) o se dejan?
- ¿El asistente (C8) entra en este plan?
