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
9. **Sin excepciones a propósito en los tests nuevos:** no se desactivan reglas de axe para que un test pase (la única regla desactivada es `color-contrast`, en el helper; ver la decisión 15). Si una pantalla tiene una violación real, se arregla en la etapa que corresponda o se consulta.
10. **Quién commitea:** los commits, el push y el PR los hace Margarita (en PowerShell, con mensajes en español con el formato del repo: `feat(web-cliente): …`, `test(web-cliente): …`, `docs(a11y): …`). Al cerrar cada etapa se entregan los comandos listos, sin firmas ni menciones a la herramienta.

## Material de partida

- **Auditoría:** `docs/a11y/auditoria-general.md` (12/11/2026, sobre el commit `3fcb2f0`). Se actualizó el 13/11 con una segunda parte (el flujo del comensal con lector de pantalla) y una tercera (decisiones y plan). Es el informe que se va marcando etapa por etapa; en la etapa 8 se le suman los hallazgos del asistente.
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

Decididas el 13/11/2026, al revisar la etapa 1:

14. **Nombre de la auditoría:** `docs/a11y/auditoria-general.md` (el que usa este plan), con la versión actualizada del 13/11.
15. **Etiqueta del mensaje de `MensajePage`:** el título visible ("Mensaje para el grupo") pasa a ser un `<label>` asociado al `<textarea>`, no un `aria-label` (WCAG 2.5.3: el nombre accesible tiene que contener el texto visible). **No se dejan violaciones excluidas a propósito en los tests nuevos:** la única regla desactivada es `color-contrast`, en el helper, y la cubre el test de contraste de la etapa 6.
16. **Anillo de foco del `<h1>`:** se quita solo en los títulos que reciben el foco por código (`h1[tabindex='-1']:focus`), con un estilo acotado a ese caso. Botones, enlaces y campos mantienen el foco visible.
17. **Asistente de la carta (C8):** entra como etapa 8, con una auditoría primero y los arreglos después.

## Línea base

Medida el 13/11/2026 sobre `92904e0` (Node 24.15; ver la nota en la bitácora sobre un error del entorno que hace perder el reporte de un archivo):

| | Archivos de test | Tests | Líneas | Ramas | Funciones |
| --- | --- | --- | --- | --- | --- |
| web-cliente | 44 | 768 | 86,08 % | 91,23 % | 79,90 % |
| `packages/ui` | 5 | 44 | 65,72 % | 96,90 % | 92,30 % |

Archivos de web-cliente con poca cobertura que se van a tocar: `pages/entrada/ElegirNombrePage.tsx` (21 %), `pages/carrito/CarritoPage.tsx` (54 %), `App.tsx` (54 %) y `pages/menu/ItemDetailPage.tsx` (75 %).

## Etapas

Las rutas son relativas a `apps/web-cliente/src/` salvo que digan otra cosa.

### Etapa 1. Base compartida — hecha y revisada (13/11/2026)

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
- [x] **Ajustes tras la revisión (13/11):**
  - La auditoría actualizada pasa a `docs/a11y/auditoria-general.md` (decisión 14).
  - `MensajePage`: el título visible es la etiqueta del `<textarea>` y se sacó la excepción del test de axe (decisión 15).
  - `src/index.css`: sin anillo de foco en los `<h1>` enfocados por código, con un test que exige que sea la única regla que quita el contorno (decisión 16).
  - Etapa 8 (asistente) agregada al plan (decisión 17).

**Cerrada.** El quality gate de SonarCloud pasó (ver la bitácora).

### Etapa 2. Formato de precios — hecha y revisada (13/11/2026)

- [x] `utils/precio.ts`: `formatearPrecio` con `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`: "$ 9.000" si el número es entero y "$ 1.234,50" si tiene centavos. Detalles que no estaban en el plan:
  - Se **redondea a centavos antes de decidir** si es entero: el ruido de la coma flotante (`3000.0000000004`) no se escribe "$ 3.000,00", y `2999.999` es "$ 3.000".
  - Lo que se redondea a cero no queda como "-$ 0" (se normaliza el cero negativo).
  - Los dos `Intl.NumberFormat` (sin y con centavos) se crean una vez, a nivel del módulo: construirlos es caro y esto corre en cada render.
  - El espacio entre el "$" y el número es un espacio no separable (U+00A0): el precio no se corta entre dos líneas.
- [x] Los 13 `toFixed(2)` sueltos pasan a usar `formatearPrecio` (en web-cliente no queda ningún `toFixed` fuera de los tests). Las líneas del plan estaban corridas 2 lugares en `CarritoPage` por los `<main>` de la etapa 1 (440 y 551 son ahora 442 y 553).
  - `pages/carrito/CarritoPage.tsx`: 4 (el total de cada ítem de la confirmación, el subtotal, el total de cada ítem de la lista y el total)
  - `pages/menu/ItemDetailPage.tsx`: 2 (el precio del extra, "+$ 150,50", y el total del botón)
  - `pages/dividir/MensajePage.tsx`: 1 (el helper `fmt`, que arma el mensaje para el grupo; ahora es `const fmt = formatearPrecio`)
  - `pages/dividir/CantidadComensalesPage.tsx`: 1
  - `pages/etiquetado/EtiquetarPedidosPage.tsx`: 1
  - `pages/pago/PagarPage.tsx`: 4
- [x] **El mensaje que copia «Copiar mensaje» lleva espacios comunes** (decisión de la revisión, 13/11): en `MensajePage`, `fmt` reemplaza el espacio no separable por uno común al armar el texto, sin tocar `formatearPrecio`. En pantalla, el resto de los precios sigue con el no separable. Dos tests verifican que ni el texto del campo ni lo que va al portapapeles tengan U+00A0.
- [x] Tests de `formatearPrecio` (`utils/precio.spec.ts`, de 1 test a 19): enteros, cero, montos grandes, centavos, que 1.234,50 no pase a "$ 1.235", la parte de una cuenta dividida (6500 entre 3 = "$ 2.166,67"), el redondeo a centavos, negativos y el cero negativo, y que el espacio sea no separable. Se sumaron 3 tests en las pantallas: la cuenta dividida con centavos en `CantidadComensalesPage` (6000 entre 7) y en el mensaje de `MensajePage` (6500 entre 3), y un extra con centavos en el detalle.
- [x] Las 57 cadenas "$9000.00" de los tests (en 10 specs; `precio.spec.ts` se reescribió entero) pasaron al formato nuevo:
  - Con los matchers que normalizan los espacios (`getByText`, `toHaveTextContent`) se escribe un espacio común: "$ 1.500". jest-dom y Testing Library convierten el U+00A0 del DOM en un espacio común antes de comparar.
  - Con las comparaciones exactas (`toBe`, `toEqual` sobre el `textContent` de la cuenta de `/pagar`, el monto por persona y el texto del mensaje para el grupo) se escribe el escape `\u00a0`, que se ve en el código ("$\u00a01.500"), no el carácter. El lint (`no-irregular-whitespace`) rechaza el espacio no separable suelto fuera de un string.

### Etapa 3. Bloqueantes — hecha (13/11/2026) y mergeada (PR #468)

**Menú lateral** (`components/menu/MenuDrawer.tsx`). Hoy "Mis pedidos" y "Etiquetar pedidos" solo se abren desde acá y no se pueden activar con lector.

- [x] Las opciones eran `<div>` clickeables (líneas 9-16 y las filas de 188-191): ahora son `<button type="button">` (`DrawerRow`). Se eligió botón y no enlace porque las filas son acciones que cierran el menú y navegan (`ir()`), como "Iniciar sesión". El ícono de cada fila es decorativo (`aria-hidden`): el nombre del botón es solo el texto ("Mis pedidos", no "📋 Mis pedidos"). Eso **adelanta** de la etapa 4 el ítem "ocultar 🏷️, 📋 y 💳 del menú lateral", porque la fila se reescribió acá y no tenía sentido tocarla dos veces.
  - "Mis puntos" (que solo dice "Próximamente" y no hace nada) es un botón **deshabilitado**: el lector lo anuncia como no disponible, y no se puede activar ni cierra el menú.
- [x] Cerrado (líneas 104-110), el panel se ocultaba solo con `transform`: ahora lleva `inert` cuando `abierto` es `false`, así sale del árbol de accesibilidad y no recibe foco. Verificado en Edge: con el menú cerrado, el primer Tab cae en "Abrir el menú" (antes, en "Iniciar sesión").
- [x] Abierto, se comporta como diálogo:
  - El panel tiene `role="dialog"`, `aria-modal="true"`, el nombre "Menú de {restaurante}" y `tabIndex={-1}`: al abrir, el foco entra al panel (el lector lo anuncia como diálogo con su nombre). Sin anillo en ese contenedor (no es un control; los botones de adentro conservan el suyo).
  - Fondo inerte: `MenuView` pone `inert` al encabezado y al `<main>` mientras el menú está abierto. El anunciador no se ve afectado (está en el `<body>`, fuera de `#root`).
  - Esc cierra, con `useCerrarConEscape`. El hook escucha siempre, así que se actúa solo si el menú está abierto. **Para reusarlo se exporta desde el índice de `@menyu/ui`** (una línea en `packages/ui/src/index.ts`: antes solo lo usaban componentes internos del paquete). Por tocar `packages/ui` se corrieron las suites de ui, web-admin y web-staff (ver la bitácora).
  - El foco vuelve a "Abrir el menú" al cerrar: el menú recuerda qué tenía el foco al abrirse y se lo devuelve (si se cierra porque se eligió una opción y se navega a otra pantalla, el foco lo lleva al `<h1>` de la pantalla nueva `SeguimientoDeRuta`).
  - **Sumado fuera del plan: un botón "Cerrar el menú".** Cerrar con el fondo oscuro solo se podía tocando (un `<div>`), y Esc no existe en un celular con TalkBack o VoiceOver: quien usa lector en el celular no tenía cómo cerrar el menú sin elegir una opción. Es el primer botón del panel, invisible hasta que recibe el foco con teclado (entonces aparece abajo, sobre el pie: arriba tapaba el nombre del restaurante). El fondo oscuro pasó a `aria-hidden`, igual que el del asistente.
- [x] `components/menu/MenuHeader.tsx:137`: "Abrir el menú" expone `aria-expanded` (y `aria-haspopup="dialog"`). El encabezado acepta `inerte` (lo usa `MenuView`).

**Filtro de dietas** (`components/menu/BarraBusqueda.tsx`):

- [x] Las opciones (líneas 141-155) eran `<div>` sin rol ni estado, y la elegida solo se marcaba con "✓": ahora son casillas de verdad (`<input type="checkbox">`) dentro de un `<label>` que ocupa toda la fila, con el nombre "Vegano, 2 platos" (`aria-label`; el lector dice "marcada" o "no marcada"). La casilla del navegador queda oculta (`sr-only`) y el recuadro de al lado, que es lo que se ve, muestra el foco con teclado (`peer-focus-visible`: contorno de 2 px) y la tilde; es decorativo. El número suelto de cada fila también. El nombre se fijó con `aria-label` y no con texto oculto dentro del `<label>` porque el motor de nombres separa los dos `<span>` con un espacio ("Vegano , 2 platos") y otros navegadores podrían hacerlo distinto.
- [x] El botón "🥗 Dietas ▾" (líneas 95-108) leía el emoji y la flecha: ahora se llama **"Filtrar por dietas"** (y "Filtrar por dietas, 1 filtro activo" / "2 filtros activos"), con `aria-expanded` y `aria-controls` (el panel, un `role="group"` con el nombre "Filtros de dieta"), y el emoji, la flecha y el número que se ven son `aria-hidden`. **Se desvió del plan en una palabra:** el plan decía "Filtrar por dieta" y se usó el plural, "dietas", para que el nombre contenga el texto que se ve en el botón, "Dietas" (WCAG 2.5.3, lo mismo que se hizo con la etiqueta de `MensajePage`).
- [x] Al aplicar o limpiar (líneas 49 y 55): se anuncia cuántos platos quedan ("12 platos", "1 plato" o "Ningún plato coincide") y el foco vuelve al botón de dietas. `MenuView` calcula `cantidadDePlatos` (los platos de las categorías con la búsqueda y las dietas aplicadas) y `BarraBusqueda` anuncia cuando cambia el conjunto de dietas, sin anunciar al montarse ni al abrir el panel o marcar casillas. El texto sale de `utils/textoDePlatos.ts`, que reusa la búsqueda en la etapa 4.
- [x] Sumado: Esc cierra el desplegable y devuelve el foco al botón (era un panel que solo se cerraba tocando afuera). El foco queda en el botón al abrirlo (patrón de despliegue: el panel es lo que sigue en el orden de lectura).

### Etapa 4. Menú, detalle y discovery — hecha (13/11/2026) y mergeada (PR #469)

**Menú:**

- [x] `components/menu/BarraBusqueda.tsx:65`: el buscador se llama "Buscar platos" (`aria-label`) y anuncia "N platos" o "Ningún plato coincide" con `utils/textoDePlatos.ts`, la `cantidadDePlatos` que ya calculaba `MenuView` y `anunciar()`. Se anuncia **600 ms después de la última letra** (un anuncio por letra no se entiende) y **solo si el texto cambió**: seguir escribiendo sin que cambie la cantidad no lo repite, y tampoco repite lo que acaba de anunciar el filtro de dietas (el botón "Limpiar filtros" limpia las dos cosas juntas). Si el componente se desmonta durante la pausa, no anuncia.
- [x] `BarraBusqueda.tsx:80`: el botón "×" se llama "Borrar búsqueda" (el signo es decorativo) y, al borrar, el foco vuelve al campo (el botón desaparece al quedar sin texto: sin esto el foco se perdía).
- [x] `components/menu/ChipsSecciones.tsx:23`: los chips son una `<nav aria-label="Secciones del menú">` y el de la sección que se está viendo dice `aria-current="true"`. Al tocar uno, `MenuView` desplaza a la sección (como antes) y lleva el foco a su `<h2>` con `enfocarEncabezado` (nuevo, en `utils/enfocarTitulo.ts`: le pone `tabindex="-1"` y usa `focus({ preventScroll: true })`, para no cortar la animación del desplazamiento). La regla de `index.css` que quita el contorno de los títulos enfocados por código se amplió de `h1` a **`h1` y `h2`** con `tabindex="-1"` (misma decisión 16, mismo test que exige que sea la única regla que quita el contorno).
- [x] `components/ItemCard.tsx:76`: el botón se llama **"Ver {plato}"** (decisión 3) y el "+" es decorativo.
- [x] `ItemCard.tsx:42`: la foto es decorativa (`alt=""`; `MenuItemImage` de `packages/ui` ya acepta un `alt` vacío, no hizo falta tocarlo).
- [x] `ItemCard.tsx:20`, revisado: la tarjeta tiene un `onClick` en un `<div>` para quien usa el dedo o el mouse, y para el teclado y el lector el control es el botón de adentro (con él alcanza, como decía el plan). El `<div>` pasa a `role="presentation"`: dice que no es un control (y es lo que acepta la regla de `jsx-a11y` de la etapa 7 para un clic sin teclado en un elemento así). Alternativa descartada: hacer que el botón cubra toda la tarjeta (`::after` sobre el `<div>`), que quita el `onClick` pero obliga a reescribir los tests que tocan la tarjeta.
- [x] `components/menu/MenuHeader.tsx:66-80`: el botón del mozo anuncia "Avisamos al mozo" o "No pudimos avisar al mozo. Probá de nuevo." y **no se deshabilita**: pasó de `disabled` a `aria-disabled` mientras no se puede volver a llamar (los toques de más ya los ignoraba el manejador). Quien lo toca no pierde el foco. El nombre sigue siendo el texto que se ve ("Mozo", "Llamando…", "¡En camino!", "Error"), con la campana oculta.
- [x] `components/menu/BotonCarrito.tsx:8` y `:23`: el botón se llama **"Ver carrito, N ítems"** ("1 ítem" en singular) y N **suma unidades** (3 hamburguesas son 3, no 1 línea). El número que se ve en el círculo también pasó a contar unidades, para que lo que se ve y lo que se dice coincidan (WCAG 2.5.3). Es un cambio visual chico: antes mostraba la cantidad de platos distintos. El círculo crece (`minWidth`) si el número tiene dos cifras.
- [x] `App.tsx:57-62`: cuando el restaurante cambia el menú con la mesa abierta, se vuelve a pedir y, **cuando llegó**, se anuncia "El menú se actualizó". Si no se pudo traer (error, o el menú no llegó), no lo dice.
- [x] Emojis decorativos ocultos: 🔍 y 🔔 (los de 🥗, ▾ y el menú lateral ya lo estaban desde la etapa 3).

**Detalle** (`pages/menu/ItemDetailPage.tsx`):

- [x] Línea 241: el interruptor de ingrediente es un `role="switch"` con `aria-checked` (activado es "incluida") y el nombre **"Cebolla, incluida" / "Cebolla, quitada"**, como decía el plan.
- [x] Líneas 292, 302, 363 y 373: los "−" y "+" usan el componente compartido **`components/SelectorDeCantidad.tsx`** (nuevo): botones "Sumar {nombre}" y "Restar {nombre}", y al cambiar anuncia "{nombre}: {valor nuevo}" ("Cheddar: 1", "Hamburguesa doble: 2"). En el mínimo y el máximo no usa `disabled` (le sacaría el foco a quien acaba de tocar): usa `aria-disabled`, se ve atenuado y no hace nada. Lo vuelve a usar el carrito en la etapa 5. El estilo de cada uso (el alto del botón, el ancho del número) se pasa por props, así no se movió ningún píxel.
- [x] Líneas 214, 225 y 271: "Personalizá tu plato" es un `<h2>` y "Quitar ingredientes" y "Agregar extras" son `<h3>`.
- [x] Línea 236: el alérgeno se dice con texto: el emoji ⚠️ queda a la vista (decorativo para el lector) y se suma "(contiene alérgeno)" solo para el lector.
- [x] Línea 327: "Nota para cocina" es el `<label>` del campo (`htmlFor` e `id`), con el emoji oculto.
- [x] Línea 361: "Cant." pasa a "Cantidad".
- [x] Línea 418: al agregar, anuncia **"Se agregó {plato} al carrito"** (o "Se guardaron los cambios de {plato}" si se estaba editando uno del carrito). **Se desvió de la redacción del plan** ("Hamburguesa doble agregada al carrito"): "agregada" o "agregado" depende del género de cada plato ("Flan agregada" no se puede) y no hay forma de flexionar los nombres; la forma impersonal sirve para todos.
- [x] Línea 436: el 🛒 del botón es decorativo.
- [x] Línea 147: la foto es decorativa.
- [x] Línea 154: el botón "←" se llama "Volver" (la flecha es decorativa).

**Discovery:**

- [x] `pages/discovery/DiscoveryPage.tsx:115`: cuando llegan los resultados de lo que se escribió, se anuncia cuántos hay ("2 ofertas y 3 restaurantes", "1 oferta", "No encontramos nada para “xyz”") con `utils/textoDeResultados.ts`. Los restaurantes son los de nombre que coincide más los que tienen platos que coinciden (en pantalla se ven igual). No anuncia con menos de 2 letras ni mientras llega la respuesta, ni cuando falla (el error ya es una alerta).
- [x] `DiscoveryPage.tsx:138`: "Buscando…" es una región de estado **siempre montada**: un único `<p role="status">` que, sin buscar, está vacío y `sr-only`, y al buscar pasa a mostrar el giro y "Buscando…" (ya no hay dos párrafos distintos según el caso).
- [x] `components/discovery/TarjetaOferta.tsx:27`: la foto de la oferta es decorativa.

### Etapa 5. Carrito, pedidos, PIN, nombre y pago — hecha (19/11/2026), a la espera de revisión

**Carrito** (`pages/carrito/CarritoPage.tsx`):

- [x] Confirmación: "¡Pedido enviado a cocina!" pasa a `<h1>`, el círculo con el "✓" es decorativo (`aria-hidden`) y **el foco va al título** con `enfocarElTitulo()`, en un efecto cuando `exito` pasa a verdadero (no cambia la ruta, así que no lo hace `SeguimientoDeRuta`). "Pedido #ABC123" se lee "Pedido ABC123": el "#" queda oculto.
- [x] "Quitar" se llama **"Quitar {plato}"** (`aria-label`, que contiene el texto visible). El tamaño del botón es de la etapa 6.
- [x] Los "−" y "+" usan **`SelectorDeCantidad`** con `minimo={1}`, con el mismo aspecto de antes (símbolo de 18 px, número de 14). Dicen "Sumar/Restar {plato}", anuncian "{plato}: N" y en 1 no se deshabilitan (`aria-disabled`).
- [x] Los extras se escriben en palabras: **"Con Cheddar, 2"** (los "Sin Cebolla" ya estaban en palabras). El separador " · " entre modificaciones se dejó.
- [x] El aviso de precios actualizados es una región `role="status"` **siempre montada** (un `<span>`) dentro de un contenedor que, sin aviso, es `sr-only` (no suma el espacio de la lista) y, con aviso, toma el aspecto de la tarjeta. "Entendido" queda fuera de la región, para que no se lea como parte del aviso.
- [x] El nombre del plato es un `<button>` con el nombre **"Editar {plato}"** (lleva al detalle para cambiarlo, como antes).
- [x] Sumado, no estaba en el plan: el error de "Confirmar pedido" tiene `role="alert"` (no se leía), y la nota se lee "Nota para cocina: …" con el 📝 oculto.

**Mis pedidos:**

- [x] `pages/pedidos/MisPedidosPage.tsx`: los textos y el color de la decisión 2, en `utils/estadoDelPedido.ts` (`TEXTO_DEL_ESTADO`): "Enviado a cocina", "En preparación", "Listo para servir", "Entregado" y "Cancelado", todos con el mismo distintivo (fondo `#FDE5DF`, texto `#B8432C`). "Listo" ya no se confunde con "En preparación".
- [x] La barra de progreso es decorativa (`aria-hidden`).
- [x] El número se lee "Pedido ABC123": "Pedido " solo para el lector (`sr-only`) y el "#" solo para la vista.
- [x] `hooks/usePedidosCliente.ts`: cuando llega por el socket un pedido de la sesión que cambió de estado, anuncia **"Tu pedido de {plato} está {estado}"** ("Tu pedido de Hamburguesa doble está listo para servir"; con varios platos, el primero y cuántos más: "Hamburguesa y 2 más"). No anuncia si el estado es el mismo, si es de otra sesión ni si es un pedido que esta pantalla no tenía.
- [x] `App.tsx` y `components/GraciasCard.tsx`: la tarjeta de agradecimiento que aparece cuando el local cierra o cobra la sesión es un **diálogo de alerta** (`role="alertdialog"`, modal, con nombre y descripción), el foco va a su título y **la pantalla de abajo queda inerte**. `GraciasCard` recibe `comoDialogo`: como diálogo su título es un `<h2>`; en `/pago/exitoso` es el `<h1>` de la página. No se cierra con Esc (la única salida es "Salir": cerrarlo sin salir dejaría al comensal en una mesa que ya no existe).

**PIN** (`pages/restaurante/IngresoMesaPage.tsx`):

- [x] El campo **no se deshabilita** al enviar: pasa a `readOnly` y conserva el foco. Si el envío fue por el botón (que sí se deshabilita), después del error el foco vuelve al campo.
- [x] Con un error del PIN el campo queda **`aria-invalid`** (solo si el PIN no sirve: con un 429, un 403 o sin conexión no está inválido) y **asociado al texto del error** con `aria-describedby` (el `Banner` de error ahora acepta un `id`). También cuando se toca "Ingresar con PIN" con el campo vacío.
- [ ] **Descartado (19/11, decisión de Margarita): el PIN sigue como estaba**, detrás del texto chico "¿Pasó algo con tu cámara? Ingresá el PIN de tu mesa" (la decisión D12 de Discovery). Se había hecho como un botón grande del mismo nivel que "Escanear QR" y no gustó cómo se veía, así que se deshizo. Para quien usa lector el texto ya es un botón con nombre, que dice si despliega algo (`aria-expanded`, `aria-controls`) y lleva el foco al campo al abrirlo; lo que cambia es que se ve y se encuentra menos que el QR. Si más adelante se quiere subirle la visibilidad sin cambiar el diseño, hay que consultarlo.

**Nombre** (`pages/entrada/ElegirNombrePage.tsx`):

- [x] "Tu nombre" es el `<label>` del campo (`htmlFor` e `id`); el campo ya no se anuncia por "Ej: Juan" (el texto de ejemplo queda como `placeholder`).
- [x] Sin `autoFocus`: el foco va al título al llegar desde otra pantalla (`SeguimientoDeRuta`).
- [x] "Continuar" queda activo. Con el campo vacío (o con solo espacios) anuncia **"Escribí tu nombre para continuar."** como alerta, deja el campo inválido y asociado al error, y le devuelve el foco. Mientras se envía queda `aria-disabled` (no `disabled`, para no perder el foco).

**Pago** (`pages/pago/`):

- [x] `PagarPage.tsx`: la cuenta es una **`<table>` real** con nombre ("Cuenta de la mesa"), encabezados de columna (`ÍTEM`, `CANT.`, `P. UNIT.`, `TOTAL`, con el nombre entero solo para el lector: "Cantidad", "Precio unitario"), el plato como encabezado de fila y el subtotal en el `<tfoot>`. "Cuenta de la mesa" y "Total a pagar" pasaron a `<h2>`.
- [x] El "Generador de mensaje" es un **diálogo** (`role="dialog"`, modal, con nombre): el foco entra a él al abrirlo y vuelve a "Armar mensaje" al cerrarlo, Esc lo cierra (`useCerrarConEscape`), y el encabezado, la cuenta y las opciones de pago quedan inertes mientras tanto. El fondo tocable (para el mouse y el dedo) es `role="presentation"`.
- [x] `PagoFallidoPage.tsx` y `PagoPendientePage.tsx`: los emojis ❌ y ⏳ ocultos y el título pasa a `<h1>`. `GraciasCard.tsx`: el título pasa a `<h1>` en `/pago/exitoso` (y `<h2>` como diálogo, ver arriba); el tilde es decorativo.
- [x] Sumado, no estaba en el plan: el error de pagar tiene `role="alert"`, el ✅ del efectivo queda oculto y se anuncia "El mozo se va a acercar a la mesa a cobrar el total." (los botones que se tocaron desaparecen y el foco se pierde).

**Etiquetar y dividir:**

- [x] `pages/etiquetado/EtiquetarPedidosPage.tsx`: el chip de comensal expone **`aria-pressed`** y su nombre dice el plato ("Marga, Hamburguesa doble", que empieza con el texto que se ve). Mientras se guarda queda `aria-disabled` en vez de `disabled`: un botón deshabilitado pierde el foco y el lector no diría el estado nuevo.
- [x] Sin `autoFocus` en el campo del nombre del comensal: "+ Agregar" le lleva el foco (porque la persona lo pidió) y, al agregar o cancelar, el foco vuelve a "+ Agregar" (el botón se había ido). El campo tiene su nombre ("Nombre del comensal") y el error de agregar o borrar es `role="alert"`.
- [x] `pages/dividir/CantidadComensalesPage.tsx`: el botón con el número se llama **"3 comensales, editar cantidad"** (empieza con el número que se ve), "Sumar comensal" y "Restar comensal" no se deshabilitan en los límites (`aria-disabled`), y al cambiar la cantidad (con los botones o escribiéndola) se anuncia **"3 comensales: cada persona paga $ 2.000"**. El campo para escribir tiene su nombre y, con Enter, el foco vuelve al botón con el número.

**Piezas compartidas** (nuevas o tocadas):

- `hooks/useFocoDelDialogo.ts`: el foco de un diálogo (entra al abrirse y vuelve a lo que lo tenía al cerrarse). Lo usan el menú lateral (que tenía la misma lógica escrita adentro), el "Generador de mensaje" y la tarjeta de gracias.
- `utils/estadoDelPedido.ts`: los textos de cada estado y la frase del anuncio.
- `EncabezadoPantalla` acepta `inerte` y `Banner` acepta `id`.

### Etapa 6. Contraste, foco visible y tamaños — web-cliente y `packages/ui` hechos (19/11/2026), a la espera de revisión; admin y staff, propuesta abajo

**web-cliente:**

- [x] **Un solo coral y un solo gris de texto** (decisiones 9 y 10). Los valores viven en `packages/ui/src/colores.ts` (`CORAL` `#CC4A31`, `CORAL_OSCURO` `#B8432C`, `CORAL_SUAVE` `#FDE5DF` y `GRIS_TEXTO` `#6B7280`) y `src/theme.ts` los toma de ahí: ni una pantalla ni un componente define el suyo. Las 9 paletas sueltas (`AppHeader`, `GraciasCard`, `ItemCard`, `SesionSeguraModals`, `CarritoPage`, `ItemDetailPage`, `MisPedidosPage`, `components/menu/paleta.ts` y los literales de `App.tsx`) importan el tema. Las clases de Tailwind que escribían el coral a mano (`focus:border-[#E8563A]`, `hover:!bg-[#d34a30]`, `bg-orange-500` en las pantallas de pago, que era el naranja de Tailwind `#f97316` y no el de la marca) pasaron a `coral`, `coral-oscuro` y `navy`, definidos en `tailwind.config.js` con los mismos valores. Las sombras con `rgba(232,86,58,…)` pasaron al coral nuevo. Se sumó el token **`orangeText`** (`#B8432C`): el coral como texto sobre el rosado (3,8:1 con el coral solo) o sobre el gris de la página (4,3:1).
- [x] **Test unitario de contraste** (`src/theme.spec.ts`, 26 tests): 15 pares de colores del tema (texto blanco sobre coral, precio coral sobre blanco, coral oscuro sobre rosado y sobre el gris de la página, gris sobre blanco y sobre el gris de la página, error sobre blanco y sobre rosado, etc.) tienen que llegar a 4,5:1 con `razonDeContraste` (nuevo en `@menyu/ui`, con su propio spec); el test comprueba también que el tema salga de `@menyu/ui`, que `tailwind.config.js` tenga los mismos valores, y **que ningún archivo de `src` vuelva a escribir `#E8563A`, `#d34a30`, `#9CA3AF`, `rgba(232, 86, 58, …)`, `orange-500` ni `text-gray-400`** (una lista de patrones prohibidos que recorre el código).
- [x] **Gris de texto** `#9CA3AF` → `#6B7280` (2,5:1 → 4,8:1) en todos los textos (hora y resumen de Mis pedidos, "P. UNIT." y precios de la cuenta, "Total" y modificaciones del carrito, "Ingresando a", rótulos, "×" del buscador, el precio tachado). El rojo de "Quitar" (`#EF4444`, 3,8:1) pasa a `#DC2626` (4,8:1).
- [x] **Foco visible** (WCAG 2.4.7). `src/index.css` tiene una regla global (`@layer base`) para todo control (enlace con `href`, botón, campo, interruptor, casilla y lo que tenga `tabindex` distinto de -1): contorno azul marino de 2 px separado 2 px, con un **aro blanco** entre el control y el contorno, para que se vea igual sobre blanco, sobre el azul de los encabezados y sobre una foto (los estilos en línea, como la sombra del "+" de la tarjeta, lo pisan: en ese caso queda el contorno). **No toca a los elementos con `tabindex="-1"`** (los títulos y los contenedores de los diálogos): el `<h1>` y el `<h2>` siguen sin anillo (decisión 16) y `src/estilos.spec.ts` sigue exigiendo que la regla de los títulos sea la **única** que quita el contorno. Los campos dejaron de tener `outline: 'none'` en línea (buscador del menú, nombre, PIN, nota del plato, código de la mesa, buscador de Discovery y pregunta del asistente): antes mostraban solo un cambio de borde, o nada (el buscador del menú). Quedan cuatro `outline: none`, todos en contenedores que reciben el foco por código (menú lateral, diálogo del mensaje, escáner y panel del asistente).
- [x] **Tamaños táctiles** (WCAG 2.5.8): sin cambiar lo que se ve ni mover nada (se midió la posición de todos los controles de 11 pantallas antes y después: solo cambiaron las cajas de estos cuatro).
  - "Quitar" del carrito, de 35 × 18 a 51 × 44 (**era el único debajo del mínimo**, y el botón "Editar {plato}", que sumé en la etapa 5, tenía 21 de alto: ahora 33). Se logra con relleno y márgenes negativos que se compensan.
  - La flecha de volver de las pantallas con encabezado azul (27 × 26) se toca como una de 44 × 44.
  - El "+" de la tarjeta del plato (28 × 28) se toca como uno de 44 × 44 con un `::after` invisible (el mismo recurso que ya usan los botones del header).
  - **Quedan debajo de 44 y arriba de 24** (cumplen el mínimo de AA): los "−" y "+" del carrito y del detalle (32 × 32), el interruptor de ingredientes (44 × 24), los chips de sección y de comensal (34 de alto), los botones del encabezado del menú ("Mozo", "Dietas", 34 a 40 de alto) y "Ingresar" y "Registrarme" (30, que ya tienen un `::after` de 44). Hacerlos de 44 cambia cómo se ven o se pisaría el área de los vecinos; no se tocaron.

**`packages/ui`:**

- [x] `DescuentoBadge.tsx` (fondo y sombra) y `PrecioConDescuento.tsx` (el precio con descuento y el tachado) usan `CORAL` y `GRIS_TEXTO`, con specs nuevos (`DescuentoBadge.spec.tsx`, `PrecioConDescuento.spec.tsx`: de 0 % a 100 % de cobertura). Se suman `colores.ts` y `contraste.ts` (con los suyos) y salen de `@menyu/ui`. Las suites de web-admin (943 tests) y web-staff (590) pasan sin cambios.

**Admin y staff** (propuesta, **no se tocó**):

- [ ] El coral o el gris de antes aparece en **105 líneas de 23 archivos de web-admin**, en **52 líneas de 20 archivos de web-staff** y en 22 líneas más de `packages/ui` (`HistorialSesiones`, `EditarPedidoModal` y `ItemMenuFila`, que usan los dos). Los tests ya cubren esas líneas: **83 % en web-admin** (87 de 105; el punto flojo es `AdminMenuPage.tsx`, con 7 de 22), **100 % en web-staff** y 21 de 22 en `packages/ui`. Es decir, Sonar pasaría el 80 % en un PR que solo reemplaza los literales por `CORAL`, `CORAL_OSCURO` y `GRIS_TEXTO` (con los mismos tests).
- [ ] **Propuesta: un PR aparte** ("contraste de admin y staff"), porque son ~180 líneas en ~45 archivos de dos apps que revisa otra persona, y no cambia nada de lo del comensal. Mientras tanto, admin y staff usan el coral nuevo solo en los distintivos y precios con descuento de `packages/ui`; el resto sigue con el de antes.
- [ ] Hay que decidir si el PR aparte se hace en esta etapa o después.

### Etapa 7. Cierre

- [ ] `eslint-plugin-jsx-a11y` (configuración `recommended`) en el `eslint.config.js` de web-cliente, con todo en verde. El lint corre con `--max-warnings 0`.
- [ ] Correr el axe de Coty sobre staging y anotar el resultado en la bitácora.
- [ ] Prueba con los dos celulares siguiendo los recorridos C1 a C7, con los resultados en la tabla de registro de `docs/calidad/accesibilidad-recorridos-lector.md`. **C8 no va acá:** se prueba en la etapa 8.
- [ ] Marcar en `docs/a11y/auditoria-general.md` qué hallazgo se resolvió en qué etapa, y cerrar este documento (cuando también esté hecha la etapa 8).

### Etapa 8. Asistente de la carta (C8)

El asistente no se auditó, así que la etapa tiene dos partes: **primero auditar, después arreglar**. Va después del cierre de la etapa 7 y tiene su propio punto de control.

**Auditoría.** Mismos criterios que en el resto del plan: axe, teclado y árbol de accesibilidad en viewport de celular (390 px), con el stream de respuestas simulado. Se escribe la transcripción de cómo lo leería un lector y se anotan los hallazgos con archivo:línea, criterio WCAG y gravedad en `docs/a11y/auditoria-general.md`. **Se frena y se muestran los hallazgos antes de arreglar nada.** Qué mirar:

- [ ] **Botón que abre el asistente** (`components/asistente/BotonDelAsistente.tsx`): tiene que tener nombre y decir si el panel está abierto.
- [ ] **Panel** (`PanelDelAsistente.tsx`, `role="dialog"` en la línea 291): al abrir, el foco entra; Esc cierra (con `useCerrarConEscape`); al cerrar, el foco vuelve al botón; el fondo queda inerte.
- [ ] **Respuesta que llega de a poco** (`role="log"` en la línea 394): es lo más importante de C8. Un `role="log"` anuncia cada cambio, así que la respuesta se puede leer en pedazos, repetida o nunca. Tiene que leerse **entera una sola vez, al terminar**. Mientras llega, se anuncia algo como "El asistente está respondiendo".
- [ ] **Campo de la pregunta y botón de enviar:** label, nombre del botón, y que se pueda enviar con Enter.
- [ ] **Errores y límites** (`avisos.ts`): tienen que anunciarse.
- [ ] **Contraste y tamaños:** ya los cubre la etapa 6; se verifican acá.

**Arreglos.** Lo que salga de la auditoría, con tests en `AsistenteDeLaCarta.spec.tsx` (anuncios, foco y lectura de la respuesta completa) y un chequeo de axe del panel abierto. Se respeta la regla de `CLAUDE.md`: el panel, su store y el lector del stream se cargan con `React.lazy` y no se importan de forma estática desde la carta.

**Celulares.** Se prueba C8 con los dos teléfonos y se carga el resultado en la tabla de registro de `docs/calidad/accesibilidad-recorridos-lector.md`. La prueba de la etapa 7 no incluye C8.

Verificación previa de las líneas (13/11): `PanelDelAsistente.tsx:291` es `role="dialog"` (con `aria-modal="true"` y `inert={!visible}`, líneas 292 y 295) y `:394` es `role="log"`; hay un `role="status"` en la 572 y un manejo de foco propio en las ~312-315. `BotonDelAsistente.tsx` ya carga el panel con `lazy` (línea 107). El panel no usa `useCerrarConEscape`. Todo eso es lectura del código, no auditoría: lo que cuenta es lo que se mida en la etapa.

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
| 7 | C1 a C7, con la prueba en los dos celulares. |
| 8 | C8 (asistente de la carta): se anuncia como diálogo, y la respuesta que llega de a poco se lee entera una sola vez, al terminar. Se prueba en los dos celulares dentro de esta etapa. |

## Hallazgos fuera del plan

Cosas que aparecieron al trabajar y que el plan no mencionaba. Los dos primeros se decidieron el 13/11 y se resolvieron dentro de la etapa 1; los otros dos quedan abiertos.

1. **Resuelto (13/11): `MensajePage`, el `<textarea>` con el mensaje armado no tenía etiqueta** (axe: `label`). El título visible, "Mensaje para el grupo", era un `<p>`: ahora es un `<label htmlFor>` asociado al `<textarea>` (con `id`), así el lector dice lo mismo que se ve (WCAG 2.5.3). Se sacó la excepción del test de axe de esa pantalla y se sumó un test del nombre accesible. Sin `aria-label`: un nombre distinto del texto visible no cumple 2.5.3.
2. **Resuelto (13/11): anillo de foco en el `<h1>`.** Al llevar el foco al título en cada cambio de pantalla, el navegador dibujaba su anillo alrededor. Ahora `src/index.css` lo quita solo de los `<h1>` que reciben el foco por código: `h1[tabindex='-1']:focus { outline: none }`. Es un título, no un control, y WCAG 2.4.7 no pide indicador ahí. Botones, enlaces y campos mantienen el foco visible. Un test (`src/estilos.spec.ts`) comprueba que esa sea la **única** regla de la hoja que quita el contorno, y se verificó en Edge real: el título queda con `outline-style: none` y un botón enfocado con Tab muestra su anillo (`auto`).
3. **Título de la pestaña sin restaurante al entrar directo a una pantalla de la mesa** (por ejemplo `/pedidos` recién abierto): dice "Mis pedidos · MenYU" hasta que se carga el menú. Hoy solo `/menu`, `/carrito` y el detalle piden el menú. No es un error de accesibilidad, solo un título menos completo.
4. **Zona con scroll de la carta que no se puede enfocar con teclado** (la auditoría sugiere `tabIndex={0}`): no se puede comprobar en jsdom. Para verificarlo en el axe de staging (etapa 7); los navegadores recientes ya hacen enfocables los contenedores con scroll que no tienen nada enfocable adentro.

5. **El buscador del menú no encuentra con más de una palabra** (hallazgo de la etapa 4, previo a ella). `matchesBusqueda` en `MenuView.tsx` compara el texto buscado entero con el comienzo de cada palabra del nombre del plato, así que "plato 1" o "pizza muzz" no coinciden con "Plato 1" ni con "Pizza muzzarella": da "Ningún plato coincide" aunque el plato exista. No es de accesibilidad. Afecta a todos los comensales. **Resuelto (19/11):** el texto se parte en palabras y cada una tiene que ser el comienzo de alguna palabra del nombre, en cualquier orden (`utils/coincideConLaBusqueda.ts`, con sus tests). Queda aparte, sin tocar, que la búsqueda del menú distingue acentos y la de Discovery no.

6. **Resuelto (19/11, en la etapa 5): el Enter que confirma la cantidad de comensales volvía a abrir el campo** (`CantidadComensalesPage`). Al devolverle el foco al botón con el número durante el `keydown` de Enter, el navegador le mandaba también el "keypress" al botón, que se activaba. Se cancela el `keydown` (`preventDefault`). Solo se vio en Edge real: en jsdom no pasa, y el test comprueba que el evento se cancela.
7. **`SessionGuard` (`App.tsx`) tiene un modal "Sesión finalizada" que nunca se muestra:** `sesionCerrada` empieza en `false` y nada la pone en `true` (solo se llama a `setSesionCerrada(false)`). Es código muerto: lo que se ve cuando el local cierra la sesión es la tarjeta de gracias. No se tocó. Hay que decidir si se borra.
8. **Resuelto (19/11, en la etapa 6): ajustes de color y tamaño de las pantallas de la etapa 5**, que habían quedado para esta etapa: el gris `#9CA3AF` de los textos chicos (hora y resumen de Mis pedidos, "P. UNIT." y precios unitarios de la cuenta, "Total" del carrito), el coral `#E8563A` de los precios y de la barra de progreso, el rojo de "Quitar" (`#EF4444`) y el tamaño de los botones "Quitar", "Entendido" y los de las tarjetas.

9. **Los bordes de los campos de web-cliente no llegan al 3:1 de WCAG 1.4.11** (`#DDDDE0` sobre blanco da 1,4:1; el 3,2:1 que cuenta la auditoría es el `#8A8FA5` del preset de web-auth). Sale del trabajo de la etapa 6, que no lo tocó: oscurecer los bordes cambia cómo se ve cada campo (nombre, PIN, buscadores, nota del plato). Hay que decidir si se hace, y con qué color.

## Preguntas abiertas

Las del cierre de la etapa 1 se respondieron el 13/11 (ver las decisiones 14 a 17). Hoy no hay preguntas abiertas.
