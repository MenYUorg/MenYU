# Auditoría de accesibilidad — MenYU

Nov 12, 2026 · @Margarita

## Resumen

Hoy las apps no cumplen WCAG 2.2 AA, pero la base está bien y la mayoría de los arreglos son mecánicos. Los problemas que más pesan son el contraste del coral con texto blanco, unos 43 botones de solo ícono sin nombre y el foco que no se ve en varios inputs. web-auth pasó axe sin ninguna violación.

Revisé el commit `3fcb2f0` (11/11/2026) de `main` con tres métodos:

- **Análisis estático** con `eslint-plugin-jsx-a11y` (modo strict) sobre web-admin, web-cliente, web-staff, web-auth y `packages/ui`, más un script propio para encontrar botones de solo ícono.
- **axe-core en el navegador** sobre 11 pantallas de web-cliente y web-auth, en Chrome con viewport de celular (390 px). Como el backend de Railway no era accesible desde mi entorno, simulé las respuestas de la API con datos de prueba.
- **Prueba de teclado** en `/menu`: recorrido con Tab y reflow a 320 px de ancho.

web-admin y web-staff no se pudieron renderizar porque piden sesión de Supabase, así que de esas dos solo hay análisis estático.

| App | Hallazgos del lint (ubicaciones) | Pantallas con axe | Resultado de axe |
| --- | --- | --- | --- |
| web-admin | 52 | — | sin probar en navegador |
| web-cliente | 12 | 8 | contraste en todas; falta `<main>` y `<h1>` en 5 |
| web-staff | 7 | — | sin probar en navegador |
| packages/ui | 6 | (dentro de las otras) | — |
| web-auth | 0 | 3 | sin violaciones |

## Problemas que bloquean el uso con teclado

Estos son los que impiden o dificultan usar la app sin mouse, que es lo que más se nota en una prueba manual.

**1. El menú lateral de web-cliente recibe foco estando cerrado** (WCAG 2.4.3 Orden del foco). En `/menu`, los dos primeros Tab caen en "Iniciar sesión" y "Crear cuenta gratis", que están dentro del drawer escondido. El panel se oculta solo con `transform: translateX(-100%)` en `components/menu/MenuDrawer.tsx:104-110`, así que sus botones siguen siendo enfocables. Se arregla agregando `inert` (o `visibility: hidden`) al panel cuando `abierto` es `false`.

**2. Inputs sin indicador de foco visible** (WCAG 2.4.7 Foco visible). Hay 29 usos de `outline: 'none'` en estilos inline repartidos en 19 archivos. Los estilos inline no pueden definir `:focus`, así que el reemplazo no existe salvo en los 5 archivos que usan `onFocus` para cambiar el borde. En la prueba de teclado, el buscador de `/menu` quedó sin outline ni sombra; solo cambia el borde de 1 px a coral. Los que más pesan:

- `web-admin/.../menu/AdminMenuPage.tsx` (7)
- `web-admin/.../mozos/MozosPage.tsx`, `ItemFormModal.tsx`, `gerente/TomaPedidosPage.tsx` y `web-staff/.../mozo/TomaPedidosPage.tsx` (2 cada uno)

**3. Elementos clickeables que no son botones** (WCAG 2.1.1 Teclado). El lint encontró `<div onClick>` y `<p onClick>` sin `tabIndex` ni `onKeyDown`. La mayoría son el fondo oscuro de los modales (ver la sección de modales). Los que sí son acciones reales:

| Archivo:línea | Qué es | ¿Hay otra forma de hacerlo con teclado? |
| --- | --- | --- |
| `web-cliente/src/components/menu/BarraBusqueda.tsx:141` | chips del filtro de dietas | no |
| `web-cliente/src/components/menu/MenuDrawer.tsx:15` | opciones del menú lateral | no |
| `web-cliente/src/pages/carrito/CarritoPage.tsx:386` | nombre del plato en el carrito (lleva al detalle) | no |
| `web-cliente/src/components/ItemCard.tsx:20` | tarjeta del plato | sí, el botón "+" hace lo mismo |
| `web-staff/src/pages/mozo/MesasPage.tsx:86` | tarjeta de mesa | no |
| `web-staff/src/pages/mozo/MozoPanel.tsx:243` | accesos del panel (`role="button"` sin `tabIndex`) | no |
| `web-staff/src/pages/mozo/TomaPedidosPage.tsx:95` y `:338` | ítems para cargar y editar el pedido | no |
| `web-admin/.../gerente/GerenceMesasPage.tsx:204` | tarjeta de mesa | no |
| `web-admin/.../gerente/TomaPedidosPage.tsx:140` y `:461` | ítems del pedido | no |
| `web-admin/.../mozos/MozosPage.tsx:217` y `:377` | tarjeta de mozo y asignar | no |
| `web-admin/.../tables/TablesPage.tsx:61` | tarjeta de mesa | no |
| `web-admin/.../menu/ItemFormModal.tsx:530` | zona para subir la foto | no |
| `web-admin/.../menu/ItemFormModal.tsx:803` y `:817` | elegir o crear ingrediente | no |
| `packages/ui/src/historial/HistorialSesiones.tsx:374` | fila del historial | no |
| `web-admin/.../menu/AdminMenuPage.tsx:480` | reordenar categorías arrastrando | no (drag and drop sin alternativa) |

El arreglo en casi todos es cambiar el `<div>` por `<button type="button">` y sacarle los estilos por defecto. Para el reordenar categorías alcanza con botones de subir y bajar.

## Contraste de color

El coral `#E8563A` con texto blanco da 3,6:1 y no llega al 4,5:1 que pide WCAG 1.4.3 para texto normal. Es el fallo que axe encontró en las 8 pantallas de web-cliente, porque está en los botones principales, en los badges de descuento y en los precios.

| Combinación | Ratio | Mínimo AA | Resultado | Dónde aparece |
| --- | --- | --- | --- | --- |
| blanco sobre `#E8563A` (coral) | 3,61 | 4,5 | falla | "Agregar al pedido", "Crear plato" / "Guardar cambios" en ItemFormModal, "+ Agregar plato" en AdminMenuPage, badge `-20%` (DescuentoBadge), botón "+" de ItemMenuFila |
| `#E8563A` sobre blanco | 3,61 | 4,5 | falla | precios en descuento del menú |
| `#E8563A` sobre `#FDE5DF` | 2,99 | 4,5 | falla | etiqueta "+$800" de extras, iniciales del restaurante sin logo |
| `#9CA3AF` (gray-400) sobre blanco | 2,54 | 4,5 | falla | precio tachado, rótulos chicos; 75 usos en el código |
| blanco sobre `#ED6A4F` (coral del preset) | 3,10 | 4,5 | falla | el preset ya lo advierte en un comentario |
| `#8A8FA5` (borde de campos) sobre blanco | 3,20 | 3 (no-texto) | pasa | bordes de inputs |
| `#6B7280` (gray-500) sobre blanco | 4,83 | 4,5 | pasa | textos secundarios |
| `#242C58` / `#2D3561` (navy) sobre blanco | 11,7 a 13,3 | 4,5 | pasa | títulos y texto |

La salida más simple es oscurecer el coral de los fondos con texto: `#C2412A` da 5,1:1 con blanco y sigue siendo de la misma familia. Para el gris de textos chicos, pasar de gray-400 a gray-500 (`#6B7280`).

## Botones de solo ícono sin nombre

Hay 43 botones que muestran solo un ícono (`<X />`, `<Plus />`, `<Trash2 />`) o un símbolo (`×`, `+`, `−`, `←`) sin `aria-label`. Un lector de pantalla los anuncia como "botón" sin más, o lee el símbolo literal ("multiplicado por", "más"). Incumple WCAG 4.1.2 Nombre, función, valor. axe no los marca cuando el botón tiene un símbolo de texto, por eso los busqué con un script aparte.

| Tipo de botón | Cantidad | Ejemplos (archivo:línea) | `aria-label` sugerido |
| --- | --- | --- | --- |
| `Cerrar o quitar (X o ×)` | 24 | `packages/ui/src/Modal.tsx:27`, `TablesPage.tsx:322, 472, 622`, `ItemFormModal.tsx:493`, `AdminMenuPage.tsx:757, 853, 1054, 1142`, `CobroModal.tsx:98`, `EditarPedidoModal.tsx:363`, `HistorialSesiones.tsx:324` | "Cerrar" |
| Sumar y restar cantidad (`+` / `−`) | 14 | `ItemDetailPage.tsx:292, 302, 363, 373`, `CarritoPage.tsx:457, 485`, `TomaPedidosPage.tsx` de staff (254, 260, 302, 304) y de admin (353, 359, 403, 409) | "Sumar una unidad de {plato}" / "Restar…" |
| Volver (`←`, `<ChevronLeft />`) | 2 | `ItemDetailPage.tsx:154`, `web-staff/src/components/PageHeader.tsx:57` | "Volver" |
| Otros | 3 | `TablesPage.tsx:760` (`<Settings />`), `ItemFormModal.tsx:756` (`<Trash2 />`), `BarraBusqueda.tsx:80` (`×` que borra la búsqueda) | "Configurar mesa", "Quitar ingrediente", "Borrar búsqueda" |

El `Modal` de `packages/ui` es el que más rinde: se usa en varias pantallas y un solo `aria-label="Cerrar"` arregla todas. Al ícono adentro conviene ponerle `aria-hidden="true"`.

## Formularios, modales y estructura de página

**Labels sin asociar** (WCAG 1.3.1 y 3.3.2). En 9 lugares hay un `<label>` visible pero sin `htmlFor`, así que el lector de pantalla no lo conecta con su campo. Se arregla con `htmlFor` + `id`, o metiendo el input dentro del label.

- `web-admin/.../menu/ItemFormModal.tsx:585, 591, 635, 652` (nombre, descripción, precio, ingredientes)
- `web-admin/.../menu/ItemIngredientesPanel.tsx:172`
- `web-admin/.../tables/TablesPage.tsx:481` (número de mesa)
- `web-cliente/src/pages/entrada/ElegirNombrePage.tsx:91` ("Tu nombre")
- `web-cliente/src/pages/menu/ItemDetailPage.tsx:319` (nota para cocina)
- `packages/ui/src/editar-pedido/EditarPedidoModal.tsx:265` (justificación)

El buscador del menú (`BarraBusqueda.tsx:65`) no tiene label, solo placeholder. axe lo acepta, pero lo correcto es un `aria-label="Buscar platos"`.

**Modales.** Casi todos se arman a mano con un `<div>` de fondo que cierra al hacer click. Eso solo no es un problema, pero a la mayoría les falta lo demás:

- `role="dialog"` y `aria-modal="true"`. Solo `DescuentoModal`, el `Dialogo` de la consola ROOT, `QrScanner` y los dos componentes del asistente usan `role="dialog"`.
- Cerrar con Esc. El manejo de la tecla aparece en 7 archivos; el `Modal` compartido de `packages/ui` y los modales hechos a mano de mesas, mozos, pagos y toma de pedidos no lo tienen.
- Mantener el foco adentro mientras está abierto y devolverlo al botón que lo abrió al cerrar.

Lo más eficiente es arreglar el `Modal` de `packages/ui` (o pasar a `<dialog>` nativo, que trae Esc y foco resueltos) y migrar los modales hechos a mano a ese componente.

**`autoFocus`** aparece en 12 inputs. No es un error en sí; en modales está bien. Conviene sacarlo de `ElegirNombrePage.tsx:95`, porque en celular abre el teclado apenas carga la pantalla y el lector de pantalla se saltea el título.

**Estructura de página.** En web-cliente, axe marcó que no hay un elemento `<main>` en `/menu`, `/menu/:id`, `/carrito`, `/elegir-nombre` y la carta pública, y que no hay `<h1>` en `/menu`, `/carrito` y la carta. Son violaciones de nivel moderado. Se arreglan envolviendo el contenido en `<main>` y usando el nombre del restaurante o el título de la pantalla como `<h1>`. En la carta pública también hay una zona con scroll que no se puede enfocar con teclado; con `tabIndex={0}` alcanza.

## Lo que ya está bien

- Las 4 apps tienen `<html lang="es">`, título de pestaña y un viewport que no bloquea el zoom.
- web-auth pasó axe sin violaciones en login, crear cuenta y recuperar contraseña: sus botones y campos tienen foco visible con `focus-visible:ring`.
- No hay imágenes sin `alt`: la foto del plato usa el nombre del plato como texto alternativo.
- A 320 px de ancho el menú no genera scroll horizontal (WCAG 1.4.10 Reflow).
- Ya hay regiones `role="status"`, `role="alert"` y `aria-live` en avisos, carga y errores (más de 30 usos), así que los mensajes dinámicos se anuncian.
- Los botones de agregar plato del menú tienen `aria-label` con el nombre del plato ("Agregar Hamburguesa doble"), y en `/menu` todos los botones que reciben foco muestran outline.
- La paleta de texto principal (navy y `#5D6178`) pasa de sobra, y el borde de los campos del preset ya está calculado a 3:1.

## Plan de arreglos

Ordenado por impacto sobre el trabajo que lleva. Los primeros cuatro resuelven la mayor parte de lo que encontró axe y casi todo lo que se nota con teclado.

- [ ] Oscurecer el coral de fondos con texto blanco (`#E8563A` → `#C2412A`) y pasar los textos en gray-400 a gray-500.
- [ ] Agregar `inert` al panel de `MenuDrawer` cuando está cerrado.
- [ ] Arreglar el `Modal` de `packages/ui`: `role="dialog"`, `aria-modal`, `aria-labelledby`, Esc, foco atrapado y `aria-label="Cerrar"`.
- [ ] Poner `aria-label` a los 43 botones de solo ícono, empezando por los de web-cliente.
- [ ] Cambiar los `<div onClick>` de acciones reales por `<button>` (tabla de la sección de teclado).
- [ ] Reemplazar `outline: 'none'` inline por una clase con `focus-visible:ring`, como ya hace web-auth.
- [ ] Asociar los 9 labels con `htmlFor` y ponerle `aria-label` al buscador.
- [ ] Agregar `<main>` y `<h1>` en las pantallas de web-cliente.
- [ ] Migrar los modales hechos a mano al `Modal` compartido.
- [ ] Botones de subir y bajar para reordenar categorías sin arrastrar.

**Para que no vuelva a pasar**, conviene sumar `eslint-plugin-jsx-a11y` a la config de ESLint de las apps (`...jsxA11y.flatConfigs.recommended.rules`). Como el lint corre con `--max-warnings 0`, va a fallar con los hallazgos de este informe; conviene activarlo primero en web-auth (que ya pasa) y web-cliente, y sumar web-admin y web-staff a medida que se arreglan.

**Para repetir la verificación**: correr axe DevTools o Lighthouse en Chrome sobre cada pantalla con datos reales, sobre todo web-admin y web-staff, que acá no se pudieron renderizar. Y hacer una pasada manual: recorrer cada flujo solo con teclado (Tab, Enter, Esc) y una vez con VoiceOver en el celular sobre web-cliente, que es la app que usa el comensal.

# Segunda parte: web-cliente con lector de pantalla

Hoy una persona ciega no puede usar web-cliente de punta a punta. Puede entrar a la mesa por PIN, recorrer el menú y armar un pedido, pero hay tres cortes: **Mis pedidos** y **Etiquetar pedidos** solo se abren desde el menú lateral, cuyas opciones no son botones; el filtro de dietas tampoco es usable; y casi ninguna acción se anuncia (agregar al carrito, resultados de búsqueda, pedido enviado, cambio de estado).

Mismo commit (`3fcb2f0`), mismo método que la primera parte, más el árbol de accesibilidad de Playwright en Chrome con viewport de celular (390 px) y la API simulada. Para detectar anuncios registré cada cambio dentro de regiones `aria-live`, `role="status"` y `role="alert"`. Lo que depende de cómo pronuncia TalkBack o VoiceOver está marcado como *verificar en dispositivo*.

## Rutas de web-cliente

El router (`apps/web-cliente/src/App.tsx:161-190`) tiene 20 rutas. La primera parte pasó axe por 8 pantallas, pero no hizo prueba de teclado ni de lector en ninguna. El discovery sí estaba entre esas 8: lo que faltaba era revisarlo con lector, que está acá.

| Ruta | Pantalla | Primera parte | Esta parte |
| --- | --- | --- | --- |
| `/` | Discovery (home de restaurantes) | solo axe | lector |
| `/restaurante/:id` | Ficha del restaurante | solo axe | lector |
| `/restaurante/:id/mesa` | Ingreso por QR o PIN | solo axe | lector, errores de PIN |
| `/restaurante/:id/carta` | Carta pública sin mesa | axe | no (fuera del flujo pedido) |
| `/check-in?restaurantId&tableCode` | Destino del QR impreso | no | axe, teclado, lector |
| `/elegir-nombre` | Nombre del comensal | axe | lector |
| `/menu` | Menú con sesión (incluye "Recomendaciones del chef") | axe | lector, búsqueda, filtros, mozo |
| `/menu/:itemId` | Detalle y personalización | axe | lector, toggles, cantidades |
| `/carrito` | Carrito | axe, vacío | con ítems, confirmación, lector |
| `/pedidos` | Mis pedidos (estado del pedido) | no | axe, teclado, lector |
| `/pagar` | Pagar la cuenta | no | axe, teclado, lector |
| `/pago/exitoso`, `/pago/fallido`, `/pago/pendiente` | Vuelta de Mercado Pago | no | axe, teclado, lector |
| `/etiquetar` | Etiquetar qué pidió cada uno | no | axe, teclado, lector |
| `/dividir/cantidad`, `/dividir/mensaje` | Dividir la cuenta | no | axe, teclado, lector |
| `/auth`, `/ingresar-pin`, `*` | Redirecciones | — | no tienen pantalla propia |

Dos aclaraciones. Las recomendaciones del chef no son una ruta: son la sección `recomendados` del menú, con el nombre que configura el restaurante, y quedan dentro de `/menu`; la rama `feat-recomendaciones` no está en `main` y no la audité. El escáner de QR (`components/QrScanner.tsx`) necesita cámara, así que no lo pude abrir; igual una persona ciega va a entrar por PIN o por el link del QR que le pase alguien.

## Resultados de las pantallas que faltaban

Las 10 pantallas nuevas repiten los fallos de la primera parte (contraste del coral y gray-400, sin `<main>` ni `<h1>`) y suman dos problemas propios: la tabla de la cuenta en `/pagar` no es una tabla, y el estado "listo" de un pedido no se distingue de "en preparación". Con teclado, todas las acciones de estas pantallas se alcanzan y tienen foco visible.

| Pantalla | axe (violaciones) | Teclado | Lo nuevo que encontré |
| --- | --- | --- | --- |
| `/check-in` sin código | contraste (1), sin `<main>` | ok | El error usa `role="alert"` y tiene `<h1>`: está bien resuelto |
| `/check-in` con QR | — | ok | Abre la mesa y pasa a `/elegir-nombre` sin anunciar nada |
| `/pedidos` | contraste (6), sin `<main>`, sin `<h1>` | ok | "Listo" se muestra como "En preparación"; solo cambia la barra de progreso |
| `/pagar` | contraste (10), sin `<main>`, sin `<h1>` | ok | La cuenta es una grilla de `<div>`: el lector lee "ÍTEM CANT. P. UNIT. TOTAL Hamburguesa doble 2 $9000.00…" de corrido |
| `/pago/exitoso` | contraste (1), sin `<main>`, sin `<h1>` | ok | El check es un ícono sin texto; el título es un párrafo |
| `/pago/fallido`, `/pago/pendiente` | contraste (2), sin `<main>`, sin `<h1>` | ok | Los emojis ❌ y ⏳ van en un párrafo propio y se leen; "Volver al menú" mide 98×20 px |
| `/etiquetar` | contraste (4), sin `<main>`, sin `<h1>` | ok | Los chips de comensal son botones, pero "etiquetado" se nota solo por el color |
| `/dividir/cantidad` | contraste (3), `label-content-name-mismatch`, sin `<main>`, sin `<h1>` | ok | El botón con el número dice "Editar cantidad" sin el valor; el total por persona cambia sin anunciarse |
| `/dividir/mensaje` | contraste (1), sin `<main>`, sin `<h1>` | ok | — |

Del lint con `jsx-a11y`, lo que cae en estas pantallas ya está en la primera parte: el nombre clickeable del carrito (`CarritoPage.tsx:386`), el fondo del modal de pago (`PagarPage.tsx:251` y `:260`) y el `autoFocus` de `EtiquetarPedidosPage.tsx:329`.

Problemas con archivo y línea:

| Archivo:línea | Problema | WCAG | Gravedad | Arreglo sugerido |
| --- | --- | --- | --- | --- |
| `pages/pedidos/MisPedidosPage.tsx:21` | El estado `listo` tiene la etiqueta "En preparación"; la única diferencia es la barra al 100 %, que no tiene rol ni valor | 1.3.1, 1.4.1 | dificulta | Darle a "listo" su propia etiqueta (por ejemplo "Listo para servir") o confirmar si es a propósito (ver preguntas) |
| `pages/pedidos/MisPedidosPage.tsx:110` | La barra de progreso es un `<div>` sin `role="progressbar"` | 1.3.1 | menor | Si la etiqueta ya dice el estado, marcar la barra como decorativa; si no, darle rol y valor |
| `pages/pago/PagarPage.tsx:309` | La cuenta de la mesa está armada con `<div>` en vez de una tabla | 1.3.1 | dificulta | Usar una tabla real con encabezados, o una lista donde cada ítem se lea como "Hamburguesa doble, 2 unidades, 9000 pesos cada una, total 18000" |
| `pages/pago/PagoFallidoPage.tsx:8`, `PagoPendientePage.tsx:8` | Emoji decorativo en un párrafo propio | 1.1.1 | menor | Ocultarlo del lector |
| `pages/pago/PagoFallidoPage.tsx:9`, `PagoPendientePage.tsx:9` | El título de la pantalla es un párrafo | 1.3.1, 2.4.6 | menor | Hacerlo `<h1>` |
| `pages/etiquetado/EtiquetarPedidosPage.tsx:61` | El chip del comensal marca "etiquetado" solo con color de borde y fondo | 1.4.1, 4.1.2 | dificulta | Exponer el estado como botón presionado y que el nombre diga a qué plato se refiere ("Marga, Hamburguesa doble") |

## El flujo del comensal, pantalla por pantalla

Cada transcripción es lo que leería el lector deslizando de a un elemento, de arriba hacia abajo, armada desde el árbol de accesibilidad. El formato es *texto, rol, estado*. Cómo pronuncia cada lector los emojis, los símbolos y los precios con `$` y `.00` cambia entre TalkBack y VoiceOver: eso queda para verificar en dispositivo. Las rutas de archivo son relativas a `apps/web-cliente/src/` salvo que digan otra cosa.

### 1. Discovery (`/`)

Es la pantalla mejor resuelta de la app: tiene `<main>`, `<h1>`, región de búsqueda, encabezados por sección y precios con contexto.

1. "MenYU, botón" (el logo del encabezado)
2. "Ingresar, botón" · "Registrarme, botón"
3. "Descubrí dónde comer, encabezado nivel 1"
4. "Ofertas y restaurantes. Elegí uno para ver su carta o ingresar a tu mesa."
5. "Buscar restaurantes o platos, campo de búsqueda"
6. "Escanear el QR de mi mesa, botón"
7. "Ofertas, encabezado nivel 2"
8. "Pinta IPA 20% de descuento Pinta IPA Lupulus Casa Matriz Antes $4000.00, ahora $3200.00, enlace"
9. "Restaurantes, encabezado nivel 2"
10. "Lupulus Casa Matriz Chacabuco 100 1 oferta, enlace" (y uno igual por restaurante)

Al buscar "pinta" aparecen "Resultados para pinta" y las secciones filtradas, pero el lector no anuncia nada: la persona sigue parada en el campo sin saber que la lista cambió ni cuántos resultados hay.

| Archivo:línea | Problema | WCAG | Gravedad | Arreglo sugerido |
| --- | --- | --- | --- | --- |
| `pages/discovery/DiscoveryPage.tsx:115` | Los resultados de la búsqueda cambian sin anuncio y sin cantidad | 4.1.3 | dificulta | Anunciar en una región viva cuántas ofertas y restaurantes coinciden, o que no hay resultados |
| `pages/discovery/DiscoveryPage.tsx:138` | "Buscando…" tiene `role="status"`, pero la región aparece junto con el texto, y muchos lectores no anuncian una región recién insertada | 4.1.3 | menor | Dejar la región siempre presente y cambiar solo su texto. Verificar en dispositivo |
| `components/discovery/TarjetaOferta.tsx:27` | La foto tiene `alt` igual al nombre, que ya está escrito: el enlace dice "Pinta IPA" dos veces | 1.1.1 | menor | Marcar la foto como decorativa, porque el nombre ya está en el texto |
| `components/AppHeader.tsx` | Logo (141×28 px), "Ingresar" (69×30) y "Registrarme" (92×30) pasan los 24 px pero no llegan a 44 | 2.5.8 | menor | Llevar el alto táctil a 44 px |

### 2. Ficha del restaurante (`/restaurante/:id`)

1. Los mismos tres botones del encabezado
2. "Volver, enlace"
3. "Lupulus Casa Matriz, encabezado nivel 1" · "Chacabuco 100"
4. "Ingresar a una mesa, enlace" · "Escaneá el QR o ingresá el PIN de tu mesa."
5. "Ver la carta, enlace" · "Mirá los platos y los precios sin ingresar a una mesa."
6. "Ofertas de este restaurante, encabezado nivel 2"
7. "Pinta IPA, imagen" · "20% de descuento, imagen" · "Pinta IPA" · "Antes $4000.00, ahora $3200.00"

No encontré problemas propios. Solo se repite lo de la foto con `alt` duplicado (punto 7) y el título de pestaña, que es el mismo en toda la app (ver problemas que se repiten).

### 3. Ingreso a la mesa por PIN (`/restaurante/:id/mesa`)

El camino por PIN se puede completar con lector: el campo tiene label, el error se anuncia como alerta y, al abrir el panel, el foco va directo al campo. Lo que falla es qué pasa con el foco después de un error.

1. "Volver, enlace"
2. "Ingresando a Lupulus Casa Matriz"
3. "Ingresar a una mesa, encabezado nivel 1"
4. "Escaneá el código QR de tu mesa para ver el menú y hacer pedidos."
5. "Escanear QR, botón"
6. "¿Pasó algo con tu cámara? Ingresá el PIN de tu mesa, botón, contraído"

Al activar el punto 6, el foco salta al campo:

7. "PIN de mesa, campo de texto, Ej: 1234" (teclado numérico)
8. "Ingresar con PIN, botón"

Con un PIN equivocado se anuncia la alerta "PIN incorrecto o mesa no encontrada en Lupulus Casa Matriz. Verificá e intentá de nuevo.", pero el foco queda en la nada (en el `<body>`): para corregir hay que volver a buscar el campo deslizando. Con el PIN correcto la app pasa a "¿Cómo te llamás?" sin anunciar que entró a la mesa.

| Archivo:línea | Problema | WCAG | Gravedad | Arreglo sugerido |
| --- | --- | --- | --- | --- |
| `pages/restaurante/IngresoMesaPage.tsx:189` | El campo se deshabilita mientras se envía; al deshabilitarse pierde el foco y no lo recupera después del error | 2.4.3, 3.3.1 | dificulta | No deshabilitar el campo durante el envío, o devolverle el foco cuando vuelve el error |
| `pages/restaurante/IngresoMesaPage.tsx:200` | El campo no queda marcado como inválido ni conectado al mensaje de error; el error se marca con el borde coral | 3.3.1, 1.4.1 | menor | Marcar el campo como inválido y asociarle el texto del error, para que se escuche al volver al campo |
| `pages/restaurante/IngresoMesaPage.tsx:159-170` | El PIN aparece como plan B ("¿Pasó algo con tu cámara?") y después del QR. Para una persona ciega es el camino principal | 2.4.6 | menor | Ofrecer "Ingresar con PIN" como opción del mismo nivel que "Escanear QR" |

### 4. Elegir nombre (`/elegir-nombre`)

El `autoFocus` pone el foco directo en el campo, así que el lector arranca en el punto 5 y se saltea la pregunta. Verificar en dispositivo desde dónde empieza a leer cada lector.

1. Los tres botones del encabezado
2. "¿Cómo te llamás?, encabezado nivel 1"
3. "Así te reconocemos en la mesa y sabemos qué pediste vos."
4. "Tu nombre" (texto suelto)
5. "Ej: Juan, campo de texto"
6. "Continuar, botón, atenuado"

| Archivo:línea | Problema | WCAG | Gravedad | Arreglo sugerido |
| --- | --- | --- | --- | --- |
| `pages/entrada/ElegirNombrePage.tsx:91` | El label "Tu nombre" no está asociado: el campo se anuncia por el placeholder, "Ej: Juan" | 1.3.1, 3.3.2 | dificulta | Asociar el label al campo |
| `pages/entrada/ElegirNombrePage.tsx:95` | `autoFocus` hace que el lector se saltee el título y la explicación | 2.4.3 | menor | Sacar el `autoFocus` y llevar el foco al título al entrar |
| `pages/entrada/`ElegirNombrePage.tsx:105 | "Continuar" está atenuado sin decir por qué | 3.3.2 | menor | Dejarlo activo y, si el nombre está vacío, anunciar el error al tocarlo |

### 5. Menú (`/menu`)

Es la pantalla con más problemas. Lo primero que lee el lector es el menú lateral cerrado, con opciones que no se pueden activar. El filtro de dietas no es usable. Y ni la búsqueda, ni los filtros, ni llamar al mozo anuncian lo que pasó. Lo bueno: hay un encabezado por sección para saltar con gestos, y los precios con descuento ya dicen "Antes… ahora…" gracias a `packages/ui/src/PrecioConDescuento.tsx:65`.

1. "Lupulus Casa Matriz Chacabuco 100 ¡Hola, Marga! Estás navegando como invitado" (esto está dentro del menú lateral cerrado)
2. "Iniciar sesión, botón" · "Crear cuenta gratis, botón" (también del menú lateral cerrado)
3. "🏷️ Etiquetar pedidos 📋 Mis pedidos 💳 Pagar la cuenta v1.0 powered by MENY" (texto, no botones; los emojis se leen con su nombre)
4. "Abrir el menú, botón"
5. "Lupulus Casa Matriz" · "🔔 Mozo, botón" · "Mesa 5"
6. "🔍" · "Buscar platos..., campo de texto"
7. "🥗 Dietas ▾, botón"
8. "Descuentos, botón" · "Recomendaciones del chef, botón" · "Hamburguesas, botón" · "Cervezas, botón"
9. "Descuentos, encabezado nivel 2"
10. "Pinta IPA, imagen" · "20% de descuento, imagen" · "Pinta IPA" · "Pan brioche, doble medallón y salsa de la casa" · "Antes $4000.00, ahora $3200.00" · "Agregar Pinta IPA, botón"
11. "Recomendaciones del chef, encabezado nivel 2" y sus platos, igual que el punto 10
12. "Hamburguesas, encabezado nivel 2", "Cervezas, encabezado nivel 2" y sus platos
13. "🛒 1, botón" (solo si el carrito tiene algo)

Lo que pasa en cada acción:

- **Buscar "hambur":** la lista se filtra y no se anuncia nada. Con "zzz" aparece "No hay platos que coincidan" y "Limpiar filtros", tampoco anunciado. El botón para borrar la búsqueda se lee "×".
- **Dietas:** el botón no dice si está abierto. El panel muestra "Filtros de dieta" y después "Vegano 2 Sin TACC 1" como texto suelto: las opciones son `<div>`, sin rol ni estado. La elegida solo suma una "✓" visual. Al tocar "Aplicar (1)" el panel se cierra, el foco queda en la nada y el botón pasa a decir "🥗 Dietas 1", sin anunciar cuántos platos quedaron.
- **Chip de sección ("Cervezas"):** la pantalla se desplaza a la sección, pero el foco y el lector se quedan en el chip. La persona no se entera de que algo se movió.
- **Mozo:** el botón pasa a "🔔 ¡En camino!" y se deshabilita. El foco se pierde, no hay anuncio, y a los 3 segundos vuelve a decir "Mozo".
- **Menú lateral abierto:** el foco se queda en "Abrir el menú", el resto de la pantalla se sigue leyendo detrás, Esc no lo cierra y las tres opciones siguen siendo `<div>`. **Mis pedidos** y **Etiquetar pedidos** solo se abren desde acá, así que para el lector no existen.

| Archivo:línea | Problema | WCAG | Gravedad | Arreglo sugerido |
| --- | --- | --- | --- | --- |
| `components/menu/MenuDrawer.tsx:9-16` (y filas en `:188-191`) | Las opciones del menú lateral son `<div>` clickeables: "Mis pedidos", "Etiquetar pedidos" y "Pagar la cuenta" no se pueden activar con lector ni teclado | 2.1.1, 4.1.2 | **bloquea** | Hacer cada opción un botón o un enlace |
| `components/menu/MenuDrawer.tsx:104-110` | Cerrado, el menú lateral se lee primero; abierto, no se comporta como diálogo, no toma el foco y no cierra con Esc | 1.3.2, 2.4.3 | dificulta | Sacarlo del árbol cuando está cerrado; abierto, tratarlo como diálogo: foco adentro, fondo oculto, Esc para cerrar y foco de vuelta al botón |
| `components/menu/MenuHeader.tsx:137` | "Abrir el menú" no dice si el menú está abierto o cerrado | 4.1.2 | menor | Exponer el estado expandido |
| `components/menu/BarraBusqueda.tsx:141-155` | Las opciones de dieta son `<div>`: no tienen rol ni estado y la elegida solo se marca con "✓" | 2.1.1, 4.1.2, 1.4.1 | **bloquea** | Hacerlas casillas o botones que digan si están marcados ("Vegano, 2 platos, marcado") |
| `components/menu/BarraBusqueda.tsx:95-108` | "🥗 Dietas ▾" lee el emoji y la flecha, no dice si el panel está abierto y después dice "Dietas 1" sin contexto | 4.1.2, 1.1.1 | dificulta | Nombre limpio ("Filtrar por dieta, 1 activo"), estado expandido y emojis ocultos |
| `components/menu/BarraBusqueda.tsx:49` y `:55` | Aplicar o limpiar dietas cambia la lista sin anuncio y el foco se pierde | 4.1.3, 2.4.3 | dificulta | Anunciar cuántos platos quedan y devolver el foco al botón "Dietas" |
| `components/menu/BarraBusqueda.tsx:65` | El buscador filtra sin anunciar resultados ni el estado vacío | 4.1.3 | dificulta | Región viva con "N platos" o "Ningún plato coincide" |
| `components/menu/BarraBusqueda.tsx:80` | Borrar búsqueda se lee "×" (ya estaba en la primera parte) | 4.1.2 | dificulta | Nombre "Borrar búsqueda" |
| `components/menu/ChipsSecciones.tsx:23` | El chip de sección desplaza la pantalla pero no mueve el foco ni dice cuál está activo | 2.4.3, 4.1.2 | dificulta | Llevar el foco al encabezado de la sección elegida |
| `components/ItemCard.tsx:76` | El botón se llama "Agregar Pinta IPA" pero abre el detalle: quien lo toca cree que ya lo agregó | 2.4.6, 3.2.4 | dificulta | Que el nombre diga lo que hace ("Ver Pinta IPA" o "Elegir Pinta IPA") |
| `components/ItemCard.tsx:42` | La foto tiene el mismo `alt` que el nombre escrito debajo | 1.1.1 | menor | Foto decorativa |
| `components/menu/MenuHeader.tsx:66-80` | Llamar al mozo cambia el texto y deshabilita el botón: el foco se pierde y no se anuncia ni el éxito ni el error | 4.1.3, 2.4.3 | dificulta | Anunciar "Avisamos al mozo" o el error, sin deshabilitar el botón |
| `components/menu/BotonCarrito.tsx:8` y `:23` | El botón del carrito se lee "🛒 1", y el número cuenta líneas, no unidades | 4.1.2, 1.1.1 | dificulta | Nombre "Ver carrito, 3 ítems" con el total de unidades |
| `App.tsx:57-62` | Si el restaurante cambia el menú, se recarga sin aviso y el lector puede quedar en un elemento que ya no existe | 4.1.3 | menor | Avisar "El menú se actualizó" |

Tamaños táctiles: los botones "+" de cada plato miden 28×28 px y los chips de sección 34 px de alto. Pasan el mínimo de 24 pero no llegan a 44.

### 6. Detalle y personalización (`/menu/:itemId`)

Se puede personalizar y agregar el plato, pero a ciegas: los controles no dicen a qué ingrediente se refieren, las cantidades cambian en silencio y al agregar la app salta al carrito sin confirmar nada.

1. "Hamburguesa doble, imagen"
2. "←, botón"
3. "Hamburguesa doble, encabezado nivel 1"
4. "Pan brioche, doble medallón y salsa de la casa"
5. "Sin TACC"
6. "Personalizá tu plato"
7. "Quitar ingredientes Sin costo Cebolla" (todo junto)
8. "Quitar, botón"
9. "Agregar extras Opcional Cheddar +$800.00"
10. "−, botón, atenuado" · "0" · "+, botón"
11. "📝 Nota para cocina" · "(opcional), campo de texto"
12. "Cant." · "−, botón, atenuado" · "1" · "+, botón"
13. "🛒 Agregar al pedido $9000.00, botón"

Lo que pasa en cada acción:

- **Quitar la cebolla:** el botón pasa a llamarse "Restaurar". El foco se queda ahí, así que el lector probablemente lea el nombre nuevo (verificar en dispositivo), pero nunca dice "cebolla".
- **Sumar Cheddar o la cantidad:** el "0" pasa a "1" y el total del botón final cambia, pero no se anuncia nada.
- **Agregar al pedido:** la app pasa directo al carrito, el foco cae en la nada y no hay ningún "Agregado".

| Archivo:línea | Problema | WCAG | Gravedad | Arreglo sugerido |
| --- | --- | --- | --- | --- |
| `pages/menu/ItemDetailPage.tsx:241` | El interruptor de ingrediente se llama "Quitar"/"Restaurar" sin decir de qué ingrediente, y no expone estado | 4.1.2 | dificulta | Que se lea como interruptor con el ingrediente y su estado: "Cebolla, incluida" / "Cebolla, quitada" |
| `pages/menu/ItemDetailPage.tsx:292`, `:302`, `:363`, `:373` | "−" y "+" sin contexto, y el número que cambian no se anuncia (los nombres ya estaban en la primera parte) | 4.1.2, 4.1.3 | dificulta | Nombres como "Sumar Cheddar" y anunciar el valor nuevo ("Cheddar: 1") |
| `pages/menu/ItemDetailPage.tsx:214`, `:225`, `:271` | "Personalizá tu plato", "Quitar ingredientes" y "Agregar extras" se ven como títulos pero no son encabezados | 1.3.1 | menor | Hacerlos encabezados de nivel 2 y 3 para poder saltar entre bloques |
| `pages/menu/ItemDetailPage.tsx:236` | El alérgeno se marca solo con el emoji ⚠️ al lado del nombre | 1.1.1, 1.4.1 | dificulta | Escribirlo: "Cebolla (contiene alérgeno)" |
| `pages/menu/ItemDetailPage.tsx:327` | "📝 Nota para cocina" no está asociado al campo, que se anuncia "(opcional)" | 1.3.1, 3.3.2 | dificulta | Asociar el label y ocultar el emoji |
| `pages/menu/ItemDetailPage.tsx:361` | "Cant." abreviado | 2.4.6 | menor | "Cantidad" |
| `pages/menu/ItemDetailPage.tsx:418` | Después de agregar se navega al carrito sin confirmar que se agregó | 4.1.3 | dificulta | Anunciar "Hamburguesa doble agregada al carrito" antes de navegar, o al llegar |
| `pages/menu/ItemDetailPage.tsx:436` | El botón final lee el emoji 🛒 | 1.1.1 | menor | Ocultar el emoji |
| `pages/menu/ItemDetailPage.tsx:147` | La foto repite el nombre que está en el `<h1>` | 1.1.1 | menor | Foto decorativa |

Tamaños táctiles: el interruptor mide 44×24 y los "−"/"+" de extras 32×32. Todos pasan los 24 px, ninguno llega a 44 de alto.

### 7. Carrito y confirmación (`/carrito`)

1. "Volver al menú, botón"
2. "Carrito" (texto, no encabezado) · "Mesa 5"
3. "Hamburguesa doble, imagen" · "Hamburguesa doble" · "+ Cheddar ×1" · "$19600.00"
4. "−, botón" · "2" · "+, botón" · "Quitar, botón"
5. "Total $19600.00"
6. "Seguir pidiendo, botón" · "Confirmar pedido, botón"
7. "El cobro se realizará al finalizar tu visita."

Al confirmar, toda la pantalla se reemplaza y el foco cae en la nada:

1. "✓"
2. "¡Pedido enviado a cocina!"
3. "Pedido #PED-3"
4. "Resumen" · "1× Hamburguesa doble $9800.00 Subtotal $9800.00"
5. "Volver al menú, botón" · "Pedir la cuenta, botón"

| Archivo:línea | Problema | WCAG | Gravedad | Arreglo sugerido |
| --- | --- | --- | --- | --- |
| `pages/carrito/CarritoPage.tsx:123-133` | La confirmación no se anuncia, no tiene encabezado y el foco no va a ella. Es el momento más importante del flujo | 4.1.3, 2.4.3 | dificulta | Llevar el foco al título "Pedido enviado a cocina", hacerlo `<h1>` y ocultar el "✓" |
| `pages/carrito/CarritoPage.tsx:516` | "Quitar" no dice qué plato quita y mide 35×18 px | 2.5.8, 4.1.2 | dificulta | "Quitar Hamburguesa doble" con al menos 24 px de alto (ideal 44) |
| `pages/carrito/CarritoPage.tsx:457`, `:485` | "−"/"+" sin el nombre del plato y la cantidad nueva no se anuncia | 4.1.2, 4.1.3 | dificulta | "Restar una Hamburguesa doble" y anunciar "Hamburguesa doble: 1" |
| `pages/carrito/CarritoPage.tsx:363` | Los extras se escriben "+ Cheddar ×1": el lector lee los símbolos (verificar en dispositivo) | 1.3.1 | menor | Escribirlo en palabras: "Con Cheddar, 1" |
| `components/PantallaComensal.tsx:56` | El título del encabezado ("Carrito", "Mis pedidos", "Pagar la cuenta") es un `<span>`, por eso estas pantallas no tienen `<h1>` | 1.3.1, 2.4.6 | dificulta | Hacerlo `<h1>`: arregla todas las pantallas que usan este encabezado de una vez |
| `pages/carrito/CarritoPage.tsx:324` | El aviso de precios actualizados usa `role="status"`, pero aparece junto con el texto | 4.1.3 | menor | Región siempre presente. Verificar en dispositivo |

### 8. Mis pedidos y cambios en vivo (`/pedidos`)

1. "Volver al menú, botón"
2. "Mis pedidos" (texto)
3. "#PED-1 En preparación"
4. "Enviado a las 12:01 p. m."
5. "2× Hamburguesa doble"
6. Lo mismo por cada pedido

Cuando cocina cambia un pedido, llega por WebSocket y la tarjeta se actualiza sin anuncio. No pude disparar el WebSocket en la prueba, así que esto sale de leer el código.

| Archivo:línea | Problema | WCAG | Gravedad | Arreglo sugerido |
| --- | --- | --- | --- | --- |
| `hooks/usePedidosCliente.ts:60-63` | El estado nuevo del pedido llega por WebSocket y se pinta sin anuncio | 4.1.3 | dificulta | Anunciar "Tu pedido de Hamburguesa doble está listo" en una región viva educada |
| `App.tsx:72-86` | Cuando el local cierra o cobra la sesión, aparece una tarjeta de agradecimiento por encima de todo: no es un diálogo, no toma el foco y no se anuncia | 4.1.3, 2.4.3 | dificulta | Tratarla como diálogo de alerta con el foco en el mensaje |
| `pages/pedidos/MisPedidosPage.tsx:71` | El número de pedido se lee letra por letra ("numeral P E D…"; verificar en dispositivo) | — | menor | Anteponer "Pedido" y separar el código |

## Problemas que se repiten

Siete patrones explican casi todo lo de esta segunda parte. Si se resuelven como piezas compartidas (un anunciador, un encabezado de pantalla, un botón de cantidad), se arreglan muchas pantallas de una vez.

| Patrón | Dónde aparece | WCAG | Gravedad | Arreglo sugerido |
| --- | --- | --- | --- | --- |
| **El cambio de pantalla no se nota.** El `<title>` es "MenYu" en las 20 rutas, y al navegar el foco cae en el `<body>` o se queda donde estaba | todas: no hay ningún `document.title` en `apps/web-cliente/src` | 2.4.2, 2.4.3 | dificulta | Un título por pantalla ("Carrito · Lupulus Casa Matriz") y, en cada cambio de ruta, llevar el foco al `<h1>`. Verificar en dispositivo desde dónde empieza a leer cada lector |
| **Las acciones no se anuncian.** Solo hay alertas para errores; agregar, cambiar cantidad, filtrar, buscar, llamar al mozo y enviar el pedido pasan en silencio | menú, detalle, carrito, pedidos, discovery | 4.1.3 | dificulta | Una sola región viva educada, montada desde el arranque en `App.tsx`, y una función para mandarle mensajes desde cualquier pantalla |
| **Faltan `<h1>` y `<main>`** | 11 de las 17 pantallas no tienen \`\<h1>\` y 14 no tienen \`\<main>\`; incluye todas las que usan `PantallaComensal.tsx:56` | 1.3.1, 2.4.1 | dificulta | Que el encabezado compartido use `<h1>` y que cada pantalla envuelva su contenido en `<main>` |
| **Controles sin contexto ni estado.** "−", "+", "Quitar", "Restaurar", "×", "←", chips sin estado presionado | detalle, carrito, menú, etiquetar, dividir | 4.1.2 | dificulta | Un componente de cantidad compartido que reciba el nombre del plato y anuncie el valor, y botones de alternar que expongan si están activos |
| **Emojis y símbolos que se leen.** 🔍 🥗 ▾ 🔔 🛒 📝 🏷️ 📋 💳 ⚠️ ✓ ❌ ⏳ × | menú, detalle, carrito, pagos | 1.1.1 | menor (⚠️ dificulta, porque carga información) | Ocultar los decorativos y reemplazar por texto los que dicen algo |
| **Fotos con `alt` igual al nombre de al lado** | tarjetas de discovery, menú, detalle, carrito | 1.1.1 | menor | Foto decorativa cuando el nombre ya está escrito |
| **Estado solo por color** | etiquetar (chip activo), pedidos ("listo" = barra llena), PIN (borde coral), dietas (✓) | 1.4.1 | dificulta | Que el estado también esté en texto o en el atributo de estado |

**Mobile.** No encontré bloqueos de zoom: el viewport permite pellizcar (primera parte), y con el texto al 200 % el detalle no genera scroll horizontal. La app no bloquea la orientación (no hay manifest ni restricción) y en horizontal el menú funciona, aunque el encabezado, el buscador y los chips ocupan casi la mitad del alto. Tamaños táctiles: el único por debajo de 24 px es "Quitar" del carrito (35×18). Entre 24 y 44 px hay muchos: los "+" de las tarjetas (28×28), los "−"/"+" del detalle y el carrito (32×32), el interruptor de ingrediente (44×24), los chips de sección y de comensal (32-34 de alto), las flechas de volver (29×26) y los botones del encabezado (28-30 de alto). Sobre sonido: no hay audio ni vibración en el código, así que nada depende solo del sonido.

## Checklist para probar con TalkBack y VoiceOver

Unos 20 minutos por lector. Sirve para confirmar lo que esta auditoría marcó como *verificar en dispositivo* y, después de los arreglos, como prueba de aceptación.

**Preparar.** Levantá web-cliente contra el backend de producción y abrila desde el celular con el túnel de Cloudflare, igual que en `docs/plan-discovery-descuentos.md`:

```powershell
# Terminal 1: la app, reenviando /api al backend de producción
$env:BACKEND_URL = "https://menyuapi-production.up.railway.app"
$env:VITE_API_URL = "/api"
pnpm --filter @menyu/web-cliente dev

# Terminal 2: el túnel; abrí en el celular la dirección https://….trycloudflare.com que imprime
cloudflared tunnel --url http://localhost:5176
```

Necesitás el PIN de una mesa de prueba de Lupulus Casa Matriz. Para prender el lector:

- **TalkBack (Android):** Ajustes → Accesibilidad → TalkBack, o mantener apretados los dos botones de volumen unos 3 segundos si el atajo está activo.
- **VoiceOver (iPhone):** Ajustes → Accesibilidad → VoiceOver, o triple clic en el botón lateral si está configurado.

**Gestos básicos.** Para TalkBack y VoiceOver son iguales: deslizar un dedo a la derecha o a la izquierda pasa al elemento siguiente o al anterior, y doble toque activa. Para saltar por encabezados, en VoiceOver girá dos dedos (rotor) hasta "Encabezados" y deslizá hacia abajo. En TalkBack elegí "Encabezados" como control de lectura y deslizá hacia abajo; el gesto para cambiar de control depende de la versión.

| # | Pantalla | Qué hacer | Qué debería escuchar | Qué probablemente escuches hoy |
| --- | --- | --- | --- | --- |
| 1 | Discovery | Abrir la URL y deslizar desde arriba | "Descubrí dónde comer, encabezado" y la búsqueda | Lo mismo: está bien |
| 2 | Discovery | Escribir "pinta" en el buscador | La cantidad de resultados | Nada |
| 3 | Ficha | Doble toque en "Ingresar a una mesa" | El título de la pantalla nueva | Depende de dónde quede el foco: anotalo |
| 4 | Mesa | Doble toque en "Ingresá el PIN de tu mesa" | "PIN de mesa, campo de texto" | Lo mismo: está bien |
| 5 | Mesa | Escribir un PIN equivocado y enviar | El error, y el foco de vuelta en el campo | El error; después el foco no está en el campo |
| 6 | Elegir nombre | Entrar con el PIN correcto | "¿Cómo te llamás?" y "Tu nombre, campo de texto" | "Ej: Juan, campo de texto", sin el título |
| 7 | Menú | Deslizar desde arriba | Nombre del restaurante, mesa y buscador | El contenido del menú lateral cerrado primero |
| 8 | Menú | Saltar por encabezados | Una sección por categoría | Lo mismo: está bien |
| 9 | Menú | Abrir "Dietas" y elegir "Vegano" | "Vegano, casilla, marcada" | Probablemente no lo puedas activar: anotá qué pasa |
| 10 | Menú | Abrir el menú lateral y activar "Mis pedidos" | Que abra Mis pedidos | Probablemente no se pueda activar |
| 11 | Menú | Doble toque en "Mozo" | "Avisamos al mozo" | Nada, o "¡En camino!" si el foco se queda: anotalo |
| 12 | Detalle | Doble toque en el "+" de un plato | "Hamburguesa doble, encabezado" | Anotá desde dónde arranca a leer |
| 13 | Detalle | Quitar un ingrediente | "Cebolla, quitada" | "Restaurar" |
| 14 | Detalle | Sumar un extra | "Cheddar: 1" | Nada |
| 15 | Detalle | "Agregar al pedido" | "Agregado al carrito" | Nada; ya estás en el carrito |
| 16 | Carrito | Restar uno con "−" | "Hamburguesa doble: 1" | "menos" o nada |
| 17 | Carrito | "Confirmar pedido" | "Pedido enviado a cocina" | Nada: buscá deslizando si llegás al mensaje |
| 18 | Mis pedidos | Esperar a que cocina cambie el estado desde web-staff | El estado nuevo | Nada |
| 19 | Todas | Pellizcar para hacer zoom al 200 % y girar el teléfono | Nada se corta ni se superpone | Debería andar: anotá si algo se corta |

En cada fila anotá también cómo pronuncia los precios ("$9000.00"), los emojis y los símbolos "×", "−" y "+".

## Preguntas abiertas

- [ ] **¿Cómo consigue el PIN una persona ciega?** Hoy está impreso en la mesa. Aunque la pantalla de PIN sea accesible, alguien tiene que leérselo. ¿Lo dice el mozo al sentarla, va en braille, o se acepta como límite del sistema?
- [ ] **¿"Listo" mostrado como "En preparación" es a propósito?** En `MisPedidosPage.tsx:21` los dos estados tienen la misma etiqueta. Si la idea es no avisar "listo" hasta que se entregue, hay que decidir qué se le dice al lector.
- [ ] **¿El "+" de la tarjeta tiene que agregar directo o abrir el detalle?** Hoy abre el detalle con el nombre "Agregar…". Hay que elegir entre cambiar el nombre o cambiar lo que hace.
- [ ] **¿Qué nivel de verbosidad querés en los anuncios?** Por ejemplo, si al cambiar una cantidad alcanza con "1" o tiene que ser "Cheddar: 1, total 9800 pesos".
- [ ] **¿Cómo se leen los precios?** Hoy se muestran como "$9000.00". Formato argentino ("$ 9.000") o "9000 pesos" para el lector es una decisión de producto; conviene probarlo en dispositivo antes de elegir.
- [ ] **¿Se incluye el escáner de QR?** No lo pude probar sin cámara. Si va al alcance de la tesis, hay que revisarlo en un celular real.
- [ ] **¿Se audita la rama `feat-recomendaciones`?** No está en `main`. Si cambia la sección "Recomendaciones del chef", conviene revisarla cuando se mergee.
- [ ] **¿Alcance de la tesis: WCAG 2.2 AA completo o el flujo del comensal?** Define si los arreglos del panel admin y de staff de la primera parte entran en el mismo plan.

# Tercera parte: decisiones y plan

Nov 13, 2026

El alcance queda en el flujo del comensal de web-cliente. De las 13 preguntas, el coral quedó decidido (propuesta mínima) y quedan para Margarita cuatro cosas: la etiqueta de "Listo" (2), confirmar que admin y staff vean el coral y el gris nuevos por el cambio en `packages/ui` (10), con qué celulares se prueba (13) y el permiso de escritura en el repo (14).

Todo lo medido hoy es sobre `main` en `92904e0` (12/11). Desde la auditoría (`3fcb2f0`) entraron 10 commits de Coty con arreglos de accesibilidad en modales de `packages/ui` (usados por admin y staff), un script de axe para staging (`scripts/accesibilidad/`) y la guía de recorridos con lector (`docs/calidad/accesibilidad-recorridos-lector.md`). Ninguno toca `apps/web-cliente`, así que los hallazgos y las líneas de la auditoría siguen valiendo.

## Decisiones

| # | Tema | Decisión | Nota |
| --- | --- | --- | --- |
| 1 | PIN para personas ciegas | Fuera del alcance de la web; se documenta en el IPI como límite (lo dice el mozo, o braille en la mesa) | — |
| 3 | "+" de la tarjeta | Sigue abriendo el detalle y pasa a llamarse "Ver {plato}" | Agregar directo salteaba la personalización |
| 4 | Verbosidad de los anuncios | Cortos: "Cheddar: 1", "Hamburguesa doble agregada al carrito", sin repetir el total | — |
| 5 | Formato de precios | Formato argentino con `Intl.NumberFormat('es-AR')` | Dos ajustes en la nota de abajo |
| 6 | Escáner de QR | Fuera de alcance | Las personas ciegas entran por PIN |
| 7 | `feat-recomendaciones` | Se revisa cuando se mergee | — |
| 8 | Alcance | Solo el flujo del comensal en web-cliente. Admin y staff, solo lo que cambie por tocar un componente compartido | — |
| 10 | `packages/ui` | **Corregida:** web-cliente no usa `Modal` (solo lo usan admin y staff). Lo que sí hay que tocar es `DescuentoBadge` (coral fijo) y `PrecioConDescuento` (coral por defecto y precio tachado en gris `#9CA3AF`, a 2,5:1). Recomiendo cambiar los valores por defecto en ui, no pasar props desde el cliente | **A confirmar:** admin y staff usan esos dos componentes en 8 archivos, así que verían el coral nuevo y el gris más oscuro. También les arregla el contraste y mantiene la marca pareja entre apps. Se corren sus suites |
| 11 | Tests | `vitest-axe` en componentes y `eslint-plugin-jsx-a11y` solo en web-cliente | Ver "Tests y calidad" |
| 12 | Rama | `feat/a11y-cliente` | Sigue la convención del repo (`feat/asistente`, `fix/a11y-code-smells`) |

**Nota sobre los precios (5).** Hay dos ajustes:

- **No afecta a admin ni a staff.** `PrecioConDescuento` recibe el formateador por prop (`formatear`); cada app pasa el suyo. Basta con cambiar `formatearPrecio` en `apps/web-cliente/src/utils/precio.ts`.
- **No se puede cortar a 0 decimales siempre.** Los precios son `Decimal(10,2)` y la división de la cuenta genera centavos: con `maximumFractionDigits: 0`, $1.234,50 se mostraría $1.235. La regla es sin decimales si el número es entero ("$ 9.000") y con dos si no ("$ 1.234,50").

Hoy hay 13 formateos sueltos con `toFixed(2)` en 6 archivos de web-cliente (carrito, detalle, pagar, etiquetar y las dos pantallas de dividir) que no pasan por `formatearPrecio`; se unifican todos. Hay 57 precios escritos como "$9000.00" en 12 archivos de test que hay que actualizar. `Intl` separa el signo con un espacio no separable, así que los tests tienen que comparar contra `formatearPrecio(...)` o contra ese espacio.

## Abiertas

| # | Tema | Qué encontré | Quién decide |
| --- | --- | --- | --- |
| 2 | "Listo" se muestra como "En preparación" | Es un cambio a propósito, no un bug que se coló. El 24/05 (`64aa7cd`) el estado `listo` decía "Listo para retirar" en verde. El 30/05 (`c671b45`, junto con la pantalla de mesas del gerente) pasó a "En preparación" en coral, cambiando a la vez el texto, el color del badge y el de la barra. Los dos commits son de Margarita. La explicación más probable es que "retirar" no encaja con el servicio en mesa, pero el commit no lo dice | Margarita: dejarlo, o ponerle una etiqueta propia como "Listo para servir" |
| 9 | Coral | **Decidido el 13/11: propuesta mínima.** `#CC4A31` como coral principal, `#B8432C` para el texto coral sobre el rosado `#FDE5DF` y para el hover de los botones | Margarita (resuelto) |
| 13 | Celular | La guía de Coty pide iPhone con VoiceOver (Safari) y Android con TalkBack (Chrome), porque el comensal no elige el dispositivo. Recomiendo los dos | El equipo, según qué teléfonos tengan |
| 14 | Escritura en el repo | Para crear `feat/a11y-cliente` y abrir el PR como borrador necesito permiso de escritura; si no, paso parches | Margarita |

## El coral: cuánto se nota

Con la propuesta mínima (`#CC4A31`), el cambio solo se nota comparando: el coral queda un poco más profundo, en la misma familia, y una persona que entra a la app no lo ve distinto. El `#C2412A` del informe se nota más y tira a ladrillo. El logo no cambia en ninguna de las dos, porque es una imagen.

No hay forma de evitar el cambio. Medí los 29 textos que usan coral en cinco pantallas (discovery, menú, detalle, carrito y mis pedidos), y los 29 fallan hoy. Ninguno califica como "texto grande" (24 px, o 18,66 px en negrita), que solo pide 3:1: todos miden entre 11 y 17 px. Agrandar la letra no alcanza.

|  | Hoy | Propuesta mínima | Propuesta del informe |
| --- | --- | --- | --- |
| Coral principal (botones, badges, precios) | `#E8563A`, 3,6:1 con blanco | `#CC4A31`, 4,6:1 | `#C2412A`, 5,1:1 |
| Texto coral sobre el rosado `#FDE5DF` ("+$800", "1 oferta", "En preparación") | 3,0:1 | `#B8432C`, 4,5:1 | `#B8432C`, 4,5:1 |
| Hover de los botones | `#D34A30` | uno más oscuro que el principal, por ejemplo `#B8432C` | ídem |
| Diferencia con el coral de hoy (ΔE) | — | 9 | 12 |
| Textos que pasan, de 29 | 0 | 29 | 29 |

Un ΔE de 9 se nota con los dos colores al lado, pero no cuando se ve uno solo. Con un ΔE de 12, la diferencia se ve aunque no estén juntos.

El rosado de fondo necesita su propio tono de texto: ni `#CC4A31` (3,8:1) ni `#C2412A` (4,3:1) llegan a 4,5 sobre `#FDE5DF`. Los bordes, el subrayado de las secciones y las barras pueden quedar con el coral de hoy, porque no son texto. Igual recomiendo cambiar todo junto, para no tener dos corales casi iguales en la misma pantalla.

Hoy el coral se define por separado en 9 paletas (`theme.ts`, `components/menu/paleta.ts` y siete componentes y pantallas con su propia constante `C`), y además aparece escrito a mano en otros 7 lugares (clases de Tailwind y estilos en línea). Con el cambio se unifica en `theme.ts`, lo que además baja la duplicación que mide Sonar.

**Recomendación para el equipo:** la propuesta mínima, `#CC4A31` más `#B8432C` para el texto sobre rosado. Las capturas de abajo usan datos de prueba; el gris es la foto de ejemplo.

&#91;image: Menú: hoy, propuesta mínima y propuesta del informe\]

&#91;image: Detalle del plato: hoy, propuesta mínima y propuesta del informe\]

&#91;image: Carrito: hoy, propuesta mínima y propuesta del informe\]

## Tests y calidad

Para no perder cobertura ni calidad, cada etapa trae sus propios tests y cierra con el quality gate en verde; no se deja todo para el final. El riesgo concreto está en tres lugares: `packages/ui`, donde `DescuentoBadge` y `PrecioConDescuento` tienen 0 % en su propia suite; los archivos del cliente con cobertura baja que vamos a tocar; y el contraste, que los tests de componentes no pueden medir.

**Qué usa hoy web-cliente (pregunta 11).** Vitest 3.2.7 con jsdom, Testing Library (`react`, `user-event` y `jest-dom`) y cobertura con `@vitest/coverage-v8`, que manda el lcov a SonarCloud. Los tests son `.spec.tsx` al lado del código y los helpers están en `src/test/`.

**Línea base (`92904e0`, 13/11):**

| Paquete | Archivos de test | Tests | Líneas | Ramas | Funciones |
| --- | --- | --- | --- | --- | --- |
| web-cliente | 44 | 768 | 86,1 % | 91,4 % | 80,1 % |
| packages/ui | 5 | 44 | 65,7 % | 96,9 % | 92,3 % |

**El quality gate de SonarCloud** mide solo el código nuevo de cada PR: cobertura de 80 % o más, duplicación de 5 % o menos, calificación A en confiabilidad, seguridad y mantenibilidad, y todos los hotspots revisados. Que el total no baje no alcanza: cada línea que se toque tiene que quedar cubierta.

**Dónde está el riesgo:**

| Archivo | Cobertura de líneas hoy | Qué vamos a tocar |
| --- | --- | --- |
| `packages/ui/src/DescuentoBadge.tsx` | 0 % en la suite de ui | El color de fondo, si el equipo aprueba el coral |
| `packages/ui/src/PrecioConDescuento.tsx` | 0 % en la suite de ui | El coral por defecto y el gris del precio tachado. El formato del precio no se toca acá |
| `apps/web-cliente/src/pages/entrada/ElegirNombrePage.tsx` | 20,9 % | Label, foco, `<h1>` |
| `apps/web-cliente/src/pages/carrito/CarritoPage.tsx` | 53,6 % | Confirmación, cantidades, "Quitar", precios |
| `apps/web-cliente/src/App.tsx` | 54,4 % | Anunciador, título por pantalla, foco al navegar |
| `apps/web-cliente/src/pages/menu/ItemDetailPage.tsx` | 75,3 % | Ingredientes, cantidades, anuncios, precios |

Cada app mide solo su propio `src/`, así que los tests de web-cliente que usan `DescuentoBadge` o `PrecioConDescuento` no suman cobertura en `packages/ui`. Al tocarlos hay que agregarles su `.spec.tsx` en `packages/ui`, cosa que además sube la cobertura de ui.

**Reglas para cada etapa:**

1. Cada comportamiento nuevo lleva su test: qué anuncia, a dónde va el foco, qué nombre, rol y estado tiene cada control. Se testea con Testing Library por rol y nombre (`getByRole('button', { name: 'Quitar Cebolla' })`), que es como lo usa un lector.
2. Un chequeo de axe por pantalla tocada, con `vitest-axe`. Lo probé aparte con Vitest 3.2.7 y jsdom y funciona, pero está en 0.1.0 y no se actualiza. En jsdom la regla de contraste queda incompleta y tira errores de canvas, así que el helper la desactiva.
3. El contraste se cubre con un test unitario que calcula el ratio de cada par de colores de `theme.ts` (texto y fondo) y falla debajo de 4,5:1. Se suma el script de axe de Coty sobre staging (`scripts/accesibilidad/main.mjs`), que sí lo mide en un navegador.
4. Antes de cerrar cada etapa: `pnpm typecheck`, el lint, el build y los tests con cobertura de web-cliente y de ui. Si se tocó `packages/ui`, también las suites de web-admin y web-staff. Se anota la cobertura antes y después.
5. Se reusa lo que ya existe en vez de duplicarlo: `useCerrarConEscape` de `packages/ui` (lo agregó Coty el 12/11), un solo componente de cantidad y un solo anunciador. Eso mantiene la duplicación abajo del 5 %.
6. `eslint-plugin-jsx-a11y` entra al final: el lint corre con `--max-warnings 0` y fallaría mientras queden `<div onClick>` sin arreglar.

## Plan por etapas

Es el plan de Margarita con cuatro ajustes: las herramientas de test entran en la etapa 1 para que cada etapa las use, el formato de precios pasa a una etapa propia y temprana, la etapa de "tests" del final queda solo para el lint y la prueba en el celular, y en `packages/ui` se toca `DescuentoBadge` en vez de `Modal`. Cada etapa es un prompt, termina con el diff para revisar y deja una entrada en la bitácora.

| Etapa | Qué entra | Tests que suma | Toca `packages/ui` |
| --- | --- | --- | --- |
| 1. Base compartida | Anunciador global (una región viva montada desde el arranque en `App.tsx`), título por pantalla con foco al `<h1>` al navegar, `<h1>` en `PantallaComensal`, `<main>` en todas las pantallas. Helper de axe en `src/test/` y `vitest-axe` como dependencia de desarrollo. `docs/a11y/` con el plan y la bitácora | Anunciador, título y foco en cada cambio de ruta, axe por pantalla | No |
| 2. Formato de precios | `formatearPrecio` con `Intl.NumberFormat('es-AR')` (sin decimales si es entero), y los 13 formateos sueltos pasan a usarlo | `formatearPrecio` con enteros, centavos, cero y negativos; las 57 cadenas de los tests | No |
| 3. Bloqueantes | Menú lateral como diálogo con botones reales (reusa `useCerrarConEscape`), filtro de dietas con casillas | Abrir, cerrar con Esc, foco adentro y de vuelta, "Mis pedidos" activable; casillas con estado | No |
| 4. Menú y detalle | Búsqueda y filtros anunciados, chips de sección, botón del mozo, "Ver {plato}", ingredientes como interruptores con estado, un componente de cantidad compartido, emojis ocultos, alts decorativos | Lo que anuncia cada acción; nombre, rol y estado de cada control | No |
| 5. Carrito, pedidos, PIN y pago | Foco en la confirmación, cambios por WebSocket anunciados, foco después del error de PIN, label de "Tu nombre", tabla de la cuenta en `/pagar`, chips de etiquetar con estado, dividir; la etiqueta de "Listo" según la decisión 2 | Anuncios, foco y estados; sube la cobertura de `ElegirNombrePage` y `CarritoPage` | No |
| 6. Visual | Coral nuevo en un solo token, texto sobre rosado, hover, gris del tachado, targets de 44 px | Test de contraste sobre los tokens; specs de `DescuentoBadge` y `PrecioConDescuento` en ui; suites de admin y staff | Sí |
| 7. Cierre | `eslint-plugin-jsx-a11y` en web-cliente, axe de Coty sobre staging, la prueba en el celular anotada en el registro de `docs/calidad/accesibilidad-recorridos-lector.md` y el informe actualizado | El lint en el CI | No |

El coral ya está decidido (propuesta mínima, 13/11), así que la etapa 6 se puede adelantar si conviene: no pisa a las otras.

**Documentación de cada etapa.** Siguiendo lo que ya hace el repo (`docs/asistente/specs/bitacora.md`, `docs/calidad/bitacora.md`):

- `docs/a11y/plan-cliente.md`: alcance, decisiones numeradas y etapas. Es esta tercera parte, pasada al repo.
- `docs/a11y/bitacora.md`: una entrada por etapa con qué cambió, qué tests se sumaron, la cobertura antes y después, el resultado de Sonar en el PR y lo que quedó pendiente.
- `docs/a11y/auditoria-general.md`: el informe, con cada hallazgo marcado como resuelto en la etapa que lo arregla.

**Rama y PR.** `feat/a11y-cliente`, con el PR abierto como borrador desde la etapa 1 para ver el quality gate en cada push, como se hizo en la migración de auth.
