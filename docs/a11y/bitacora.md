# Bitácora: accesibilidad de web-cliente (WCAG 2.2 AA)

Registro, etapa por etapa, de lo que se hizo para la accesibilidad del flujo del comensal: qué cambió y por qué, los tests, la cobertura antes y después, el quality gate de SonarCloud, los problemas y cómo se resolvieron, lo que quedó pendiente y qué recorridos de [`docs/calidad/accesibilidad-recorridos-lector.md`](../calidad/accesibilidad-recorridos-lector.md) deberían andar. El plan, con las decisiones y las etapas, está en [`plan-cliente.md`](plan-cliente.md).

## Estado actual

| Etapa | Estado |
| --- | --- |
| 1. Base compartida | Hecha y revisada (13/11/2026). Quality gate de SonarCloud: passed. Con los ajustes de la revisión (etiqueta de `MensajePage`, foco del `<h1>`) |
| 2. Formato de precios | Hecha (13/11/2026), a la espera de revisión |
| 3. Bloqueantes (menú lateral y filtro de dietas) | Pendiente |
| 4. Menú, detalle y discovery | Pendiente |
| 5. Carrito, pedidos, PIN, nombre y pago | Pendiente |
| 6. Contraste, foco visible y tamaños | Pendiente |
| 7. Cierre (lint, axe de Coty, celulares C1 a C7) | Pendiente |
| 8. Asistente de la carta (C8): auditar y después arreglar | Pendiente (agregada el 13/11/2026) |

Rama `feat/a11y-cliente`, desde `origin/main` en `92904e0`.

## Línea base (13/11/2026)

Medida sobre `92904e0`, con `pnpm --filter @menyu/web-cliente test:coverage` y `pnpm --filter @menyu/ui test:coverage`.

| | Archivos | Tests | Líneas | Ramas | Funciones |
| --- | --- | --- | --- | --- | --- |
| web-cliente | 44 | 768 | 86,08 % | 91,23 % | 79,90 % |
| `packages/ui` | 5 | 44 | 65,72 % | 96,90 % | 92,30 % |

El plan decía 86,1 % / 91,4 % / 80,1 % para web-cliente. La diferencia (0,2 puntos) es del entorno: con Node 24.15 (el repo pide Node 22 o más), `src/utils/authClientDiferido.spec.ts` (el test que corre ESLint por dentro) deja un error no capturado de `lru-cache` ("exports is not defined in ES module scope") y Vitest pierde el reporte de `src/components/menu/MesaSinCarta.spec.tsx` en la corrida completa. Ese archivo pasa solo (8 tests): 760 + 8 = 768, que es el número del plan. Hay que tenerlo en cuenta al comparar números entre máquinas.

---

## Etapa 1: base compartida (13/11/2026)

Estado: hecha y revisada. Los ajustes pedidos en la revisión están en "Ajustes tras la revisión", más abajo.

### Qué cambió

**Infraestructura de tests**

- `apps/web-cliente/package.json` y `pnpm-lock.yaml`: `vitest-axe` 0.1.0 (versión exacta, como las otras librerías de test de la app). El lockfile también intercambió el sufijo de peers de `jiti` entre dos apps; no cambia ninguna versión.
- `src/test/axe.ts`: `axe`, ya configurado sin la regla `color-contrast` (en jsdom queda incompleta y tira errores del canvas).
- `src/test/setup.ts`: registra el matcher `toHaveNoViolations`.
- `src/test/vitest-axe.d.ts`: los tipos del matcher para Vitest 3 (vitest-axe 0.1.0 los declara para el espacio de nombres viejo, `Vi`).

**Anunciador global**

- `src/utils/anunciador.ts` (store de zustand + `anunciar(mensaje)`) y `src/components/Anunciador.tsx` (la región viva). Montado en `App.tsx` desde el arranque, antes de `SessionGuard`.
- Pintado en el `<body>` con un portal: así, en la etapa 3, el menú lateral puede volver inerte el resto de la página sin tragarse los anuncios.
- Mensajes iguales seguidos se leen las dos veces (el texto va en un `<span key={n}>` que se reemplaza), y la región se vacía a los 6 segundos.

**Título por pantalla y foco al navegar**

- `src/utils/pantallas.ts`: el nombre de cada ruta y el formato "{Pantalla} · {Restaurante}" (o "· MenYU" mientras no se sepa el restaurante).
- `src/hooks/useTituloDeLaPantalla.ts`: arma el título. El restaurante sale de la dirección o de la sesión; el nombre, del menú pedido o de Discovery; en el detalle, la pantalla es el nombre del plato.
- `src/utils/enfocarTitulo.ts`: enfoca el `<h1>` (le pone `tabindex="-1"` por código) y, si todavía no existe, espera a que la pantalla lo pinte (hasta 4 s; deja de esperar si la persona toca o escribe).
- `src/components/SeguimientoDeRuta.tsx`: aplica las dos cosas. Compara con la ruta anterior (y no con "la primera vez") para que StrictMode no cuente como navegación el segundo montaje de desarrollo. En la primera carga y al cambiar solo la búsqueda de la dirección, no mueve el foco.
- `index.html`: el título inicial pasa de "MenYu" a "MenYU".

**`<h1>` y `<main>`**

- `PantallaComensal.tsx`: el título de la barra azul pasa de `<span>` a `<h1>` (`margin: 0`); `MarcoPantalla` envuelve el contenido en `<main>` (con `flex: 1` y `display: flex` para que lo de adentro se reparta el alto como antes).
- `MenuHeader.tsx`: el nombre del restaurante es el `<h1>` del menú y de la carta. `MenuView.tsx`: el buscador, las secciones y los botones flotantes van dentro de un `<main>`; el encabezado queda afuera. Los estados de carga y error del menú también tienen `<main>`, y "No se pudo cargar el menú" es `<h1>`.
- `CarritoPage.tsx`: `<main>` en los tres estados (confirmado, vacío y lista; en la lista incluye la barra de abajo con el total).
- `ItemDetailPage.tsx`: `<main>` en el contenido y en los estados de carga, error ("No se pudo cargar el menú", ahora `<h1>`) y "Ítem no encontrado" (ahora `<h1>`).
- `ElegirNombrePage.tsx`, `PagoExitosoPage.tsx`, `PagoFallidoPage.tsx`, `PagoPendientePage.tsx`: `<main>`.
- `BloqueEstado.tsx`: nueva prop `nivelDelTitulo` (1 o 2; por defecto 2). Con `1` lo usan `RestaurantePage` (2 estados), `IngresoMesaPage` y `MenuView` (carta que no existe), donde el bloque es toda la pantalla.
- `SesionSeguraModals.tsx` y `CheckInScreens.tsx`: `Shell` es un `<main>`; con la nueva prop `subtituloEsTitulo`, "Abriendo tu mesa…" de `/check-in` es el `<h1>`; "¡Sos el anfitrión de la mesa!" y "Mesa en modo seguro" pasan de `<p>` a `<h1>`.

Los estilos en línea de cada título se dejaron como estaban (ya fijaban fuente, tamaño, color y margen), así que visualmente no cambia nada, salvo el anillo de foco del `<h1>` (ver "Pendiente").

### Tests

138 tests nuevos (768 → 906), en 54 archivos (44 → 54). Los 3 últimos (el nombre accesible del mensaje de `MensajePage` y los 2 de `estilos.spec.ts`) son de los ajustes de la revisión:

- **Archivos nuevos:** `utils/anunciador.spec.ts` (5), `components/Anunciador.spec.tsx` (7), `utils/pantallas.spec.ts` (25), `utils/enfocarTitulo.spec.ts` (11), `components/SeguimientoDeRuta.spec.tsx` (15), `components/discovery/BloqueEstado.spec.tsx` (6), `components/PantallasDeEntrada.spec.tsx` (11), `pages/entrada/ElegirNombrePage.spec.tsx` (6; la pantalla no tenía spec), `pages/pago/PagoResultadoPages.spec.tsx` (8; tampoco).
- **Bloques "estructura de la pantalla (accesibilidad)"** en los specs de: carta, menú de la mesa, detalle, carrito, mis pedidos, pagar, etiquetar, cantidad de comensales, mensaje, restaurante e ingreso a mesa, más 2 tests en `MenuHeader.spec.tsx` y 6 en `App.spec.tsx` (título, foco, anuncio y axe sobre el `<body>` entero).
- Qué verifican: nombre y nivel del `<h1>`, que el `<main>` contenga lo que tiene que contener (y no el encabezado), el título de la pestaña, a dónde va el foco al navegar (y que no se mueve en la primera carga ni al cambiar solo la búsqueda), que un anuncio repetido vuelve a leerse y que la región se vacía, y axe (sin `color-contrast`) en cada pantalla tocada.

### Cobertura

| | Antes | Después |
| --- | --- | --- |
| web-cliente, líneas | 86,08 % | 92,43 % |
| web-cliente, ramas | 91,23 % | 92,12 % |
| web-cliente, funciones | 79,90 % | 82,92 % |
| `packages/ui`, líneas | 65,72 % | 65,72 % (no se tocó) |
| web-admin, web-staff | sin tocar | sin tocar |

Por archivo (después): los archivos nuevos (`Anunciador`, `SeguimientoDeRuta`, `useTituloDeLaPantalla`, `anunciador`, `pantallas`, `enfocarTitulo`) y `PantallaComensal`, `BloqueEstado`, `CheckInScreens`, `PagoExitoso`, `PagoFallido`, `PagoPendiente`, `RestaurantePage` e `IngresoMesaPage` están al 100 % de líneas. De los archivos de poca cobertura que había que tocar: `ElegirNombrePage.tsx` 21 % → 100 %, `CarritoPage.tsx` 54 % → 91,4 %, `ItemDetailPage.tsx` 75 % → 79,4 %, `App.tsx` 54,4 % → 55,5 % (las líneas que se tocaron están cubiertas; el resto de `App.tsx` es el cierre de sesión de la etapa 5).

### Quality gate de SonarCloud

**Passed: «All conditions passed»** (captura del Project health dashboard, 13/11/2026). La captura no dice si es la de la rama o la del PR, y los números que muestra son del código completo, no del código nuevo:

- Cobertura (código completo): 88,9 %.
- Duplicación (código completo): 2,0 %.
- Issues abiertos y confirmados (código completo): 93.
- Cobertura, duplicación, calificaciones y hotspots del código nuevo: no se ven en la captura. Como el gate pasó con todas sus condiciones (80 % de cobertura o más, 5 % de duplicación o menos, calificación A y hotspots revisados), se dan por cumplidas. Falta anotar los valores exactos si interesan.
- Los 93 issues son del proyecto entero: no se comparó con el valor de `main` para saber si el PR sumó alguno.

### Verificación en el navegador

Además de los tests, se miró la app en Edge real (390 × 844, API simulada, un Vite propio en el puerto 5199): la carta, el menú de la mesa, "Mis pedidos" vacío y el carrito vacío. Resultados: un solo `<main>` por pantalla, la página no se desplaza (solo la zona de secciones de la carta, 669 px visibles con 3169 de contenido), los títulos de pestaña son "Carta · Lupulus Casa Matriz", "Menú · …", "Carrito · …" y "Mis pedidos · MenYU", al abrir una pantalla por dirección el foco queda en el `<body>` y al navegar dentro de la app queda en el `<h1>`. Las capturas no cambiaron respecto de lo que se esperaba (el único cambio visual es el anillo de foco del título al navegar).

### Ajustes tras la revisión (13/11/2026)

Las respuestas de Margarita a las preguntas abiertas de la primera entrega:

- **Auditoría renombrada y actualizada.** `docs/a11y/auditoria-general.md` es la versión del 13/11 (con la segunda parte, el flujo del comensal con lector, y la tercera, decisiones y plan), copiada desde Descargas. Se sacó la versión vieja del repo (no estaba en git y es idéntica a la que sigue en Descargas). Decisión 14.
- **`MensajePage`: etiqueta del mensaje armado.** El título visible, "Mensaje para el grupo", era un `<p>`; ahora es un `<label htmlFor="mensaje-para-el-grupo">` (con `display: block`, para que se vea igual) asociado al `<textarea id="mensaje-para-el-grupo">`. Se usó un `<label>` y no un `aria-label` para que el lector diga lo mismo que se ve (WCAG 2.5.3). Se **sacó la excepción** de la regla `label` del test de axe y se sumó un test del nombre accesible. Ya no queda ninguna regla de axe desactivada en los tests de web-cliente, salvo `color-contrast` en el helper (decisión 15). El `id` es fijo porque hay un solo mensaje por pantalla.
- **Foco del `<h1>`.** `src/index.css` quita el contorno solo de `h1[tabindex='-1']:focus`, que es lo que `enfocarElTitulo` le pone al título (WCAG 2.4.7 no pide indicador en un elemento con el que no se interactúa). `src/estilos.spec.ts` (2 tests) exige que esa sea la **única** regla de la hoja que quita el contorno y que el selector no alcance a un `<h1>` con otro `tabindex` ni a un botón con `tabindex="-1"`. Se verificó en Edge real (390 px): al cambiar de pantalla el `<h1>` queda enfocado con `outline-style: none`, y un botón enfocado con Tab conserva su anillo (`outline-style: auto`). La etapa 6 tiene que respetarlo si agrega un estilo global de foco visible.
- **Etapa 8.** El asistente de la carta (C8) entra al plan como etapa 8, con una auditoría primero y los arreglos después; la prueba con celulares de la etapa 7 pasa a ser solo de C1 a C7.
- **Números después de los ajustes:** 54 archivos y 906 tests, y la misma cobertura que antes de los ajustes: líneas 92,43 %, ramas 92,12 %, funciones 82,92 %. Typecheck y lint en verde.

### Problemas y cómo se resolvieron

- **`main` local 158 commits atrás de `origin/main`.** La rama se creó con `git switch -c feat/a11y-cliente --no-track origin/main` (sin seguimiento, para que un `git push` sin argumentos no apunte a `main`). Los 10 archivos borrados que tenía el árbol (el login legacy) ya no existen en `origin/main`, así que no hubo conflicto.
- **`.git/index.lock` viejo** (vacío, del 27/10, sin ningún proceso de git corriendo): se borró para poder cambiar de rama.
- **`pnpm add` con `--filter` dejó incompleto el almacén de `node_modules`** (faltaba `@supabase/ssr`, y el typecheck de web-cliente fallaba en `packages/auth-client`). Se arregló con `pnpm install --frozen-lockfile` en la raíz. Ojo: las notas del proyecto dicen no correr `pnpm add` con el árbol en uso; si había un Vite o el backend corriendo, hay que reiniciarlos.
- **`packages/types/dist` viejo** (de octubre): faltaban exports del asistente. Se recompiló con `pnpm --filter @menyu/types build` (la carpeta no se versiona).
- **Error del entorno con Node 24 y OneDrive:** además del error de `lru-cache` de la línea base, una de las corridas de cobertura falló con `EBUSY` (OneDrive bloqueó un archivo de `node_modules`) y perdió el reporte de un spec. Se repitió y dio 53 de 53 archivos y 903 de 903 tests.
- **vitest-axe y `document.documentElement`:** `axe(document.documentElement)` falla ("The node to be removed is not a child of this node") porque vitest-axe vuelve a insertar el HTML como texto. Se usa `axe(document.body)` (cubre también el anunciador, que está en el `<body>`) y `axe(container)` en las pantallas. Las reglas que solo corren sobre la página entera (`landmark-one-main`, `page-has-heading-one`) se comprueban con los tests por rol (`getByRole('main')`, `getByRole('heading', { level: 1 })`).
- **Un `<textarea>` que se cuela entre tests:** el respaldo de "copiar" de `MensajePage` agrega un `<textarea>` fuera de pantalla y lo saca después de `document.execCommand('copy')`, que jsdom no tiene: ahí lanza y el `<textarea>` queda en el `<body>` para los tests siguientes. Los tests nuevos de esa pantalla buscan el `<textarea readonly>` dentro del `<main>` y no `getByRole('textbox')`.
- **Hallazgo real de axe en `MensajePage`:** el `<textarea>` del mensaje armado no tenía etiqueta (`label`). No estaba en el plan; en la primera entrega el test de axe de esa pantalla desactivaba solo esa regla, a la espera de decisión. **Resuelto en la revisión** (ver "Ajustes tras la revisión"): se arregló la pantalla y se sacó la excepción.

### Pendiente

- Si interesa, anotar los valores del código nuevo del PR y comparar los 93 issues con los de `main` (ver «Quality gate»).
- Los dos hallazgos fuera del plan que quedan abiertos (título de la pestaña sin restaurante al entrar directo a una pantalla de la mesa, y la zona con scroll de la carta) están en `plan-cliente.md`.
- **Sin `<h1>` todavía** (etapa 5): `/pago/exitoso`, `/pago/fallido`, `/pago/pendiente` y la confirmación del carrito ("¡Pedido enviado a cocina!"). En esas pantallas el foco no se mueve al navegar hasta que lo tengan.
- El spec nuevo de `ElegirNombrePage` busca el campo por su placeholder ("Ej: Juan"): hay que ajustarlo en la etapa 5, cuando el label se asocie al campo.

### Recorridos con lector (C1 a C8)

Ninguno completo todavía. Desde esta etapa debería cumplirse el punto 1 de "En cada pantalla" (al llegar se anuncia el título o el encabezado principal) en las pantallas de C1 a C7, salvo las que figuran arriba como sin `<h1>` (resultado del pago de C7 y confirmación de C4). El anunciador de la región viva ya existe, pero todavía nadie lo usa: los anuncios de C1, C4, C5 y C6 llegan en las etapas 3 a 5.


---

## Etapa 2: formato de precios (13/11/2026)

Estado: hecha, a la espera de revisión. Va sobre la rama de la etapa 1, con sus ajustes de la revisión todavía sin commitear (el archivo `MensajePage` tiene los dos cambios).

### Qué cambió

- `src/utils/precio.ts`: `formatearPrecio` usa `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`. Entero: "$ 9.000". Con centavos: "$ 1.234,50" (no se puede cortar siempre en 0 decimales: los precios son `Decimal(10,2)` y dividir una cuenta genera centavos). Antes de decidir se redondea a centavos, así el ruido de la coma flotante no agrega ",00", y el cero negativo se normaliza. Hay dos formateadores creados una vez a nivel del módulo.
- Los 13 `toFixed(2)` sueltos pasan a `formatearPrecio`: `CarritoPage` (4), `ItemDetailPage` (2), `MensajePage` (1, el helper `fmt` del mensaje para el grupo), `CantidadComensalesPage` (1), `EtiquetarPedidosPage` (1) y `PagarPage` (4). Con la tarjeta del plato, el descuento y la oferta de Discovery, que ya recibían `formatearPrecio` por prop (`PrecioConDescuento`), todo el precio que muestra web-cliente sale de una sola función. Admin y staff no cambian: pasan su propio formateador.
- Las 57 cadenas "$9000.00" de los tests, en 10 specs, al formato nuevo (ver el plan, etapa 2, para cuándo lleva espacio común y cuándo `\u00a0`). `precio.spec.ts` se reescribió.

### Tests

21 tests nuevos (906 → 927; 18 en `precio.spec.ts` y 3 en pantallas), en los mismos 54 archivos:

- `utils/precio.spec.ts`: de 1 test de `formatearPrecio` a 19 (enteros, cero, montos grandes de hasta mil millones, centavos, 6500 entre 3, que 1.234,50 no pase a "$ 1.235", el redondeo a centavos, negativos, el cero negativo y el espacio no separable). Es el spec que fija el formato con los caracteres exactos.
- Una prueba con centavos en tres pantallas: `CantidadComensalesPage` (6000 entre 7 = "$ 857,14"), `MensajePage` (el mensaje con "$ 2.166,67 cada uno") y `ItemDetailPage` (un extra de 150,50: la etiqueta "+$ 150,50" y el total del botón "$ 1.150,50").
### Cobertura

| | Fin de la etapa 1 | Después |
| --- | --- | --- |
| web-cliente, archivos / tests | 54 / 906 | 54 / 927 |
| web-cliente, líneas | 92,43 % | 92,44 % |
| web-cliente, ramas | 92,12 % | 92,08 % |
| web-cliente, funciones | 82,92 % | 82,88 % |
| `packages/ui`, web-admin, web-staff | sin tocar | sin tocar |

Las ramas y las funciones se mueven unas centésimas de una corrida a otra; no hay un archivo que haya bajado. Por archivo: `utils/precio.ts` 100 % en líneas y ramas, `CantidadComensalesPage`, `MensajePage`, `EtiquetarPedidosPage` y `PagarPage` al 100 % de líneas, `CarritoPage` 91,4 % (las líneas que se tocaron son las de los totales, que ejecutan los tests de la lista y de la confirmación) e `ItemDetailPage` 79,4 % (las líneas del extra y del total las cubren los tests de los extras).

### Quality gate de SonarCloud

Pendiente: se anota cuando corra el PR.

### Verificación en el navegador

Se miró la carta en Edge real (390 px): "$ 1.000", "$ 1.010"… con el espacio no separable, sin cortes de línea ni cambios de alto en las tarjetas.

### Problemas y cómo se resolvieron

- **Corrida completa con 565 tests rotos ("Invalid hook call", "Cannot read properties of null (reading 'useState')"), sin que tuviera que ver con los precios.** La causa fue la letra de la unidad: las corridas que fallaron arrancaron con el directorio actual como `c:/Users/…` (minúscula; la línea `RUN` de Vitest lo muestra) y las que pasaron como `C:/Users/…`. Con la letra en minúscula, Vite carga `react` por dos rutas distintas (la real de `node_modules`, que sale en mayúscula, y la de la raíz del proyecto) y hay dos copias de React. Los subconjuntos de tests pasaban, la corrida completa no, y de forma determinista. **Se corre con la ruta en mayúscula:** `cd "C:/Users/…/apps/web-cliente"` en Git Bash, o `Set-Location 'C:\Users\…'` en PowerShell.
- **`EBUSY` de OneDrive:** sigue bloqueando archivos de `node_modules` en la corrida completa, y a veces tira abajo la corrida entera o pierde el reporte de un archivo (en la cobertura: 53 de 54 archivos). Ayuda bajar los workers (`--maxWorkers=3`); si pasa, se repite hasta una corrida sin `EBUSY`. La de este cierre salió limpia a la tercera.
- **El editor convirtió `\u00a0` en el carácter real:** al escribir tests con el escape `\u00a0` dentro de un string, el carácter quedó como un espacio no separable de verdad (invisible en el código, y uno cayó en un comentario, donde el lint lo rechazó). Se pasaron los 26 a escape con un script. Hoy no queda ningún U+00A0 suelto en `apps/web-cliente/src`.

### Pendiente

- **El mensaje para el grupo lleva espacios no separables.** El texto que copia "Copiar mensaje" en `MensajePage` ahora dice "Total de la cuenta: $ 6.500" con un U+00A0 entre el "$" y el número (el plan pedía pasar los 13 formateos a `formatearPrecio`). Se ve igual y WhatsApp lo muestra bien, pero conviene saber que es un carácter distinto del espacio si alguien lo pega en un SMS o en un lugar que no lo soporte. Si molesta, se cambia solo ahí por un espacio común.
- Cómo lee cada lector los precios nuevos ("$ 9.000"): pendiente de la prueba en celulares (etapa 7). La auditoría lo dejó como "verificar en dispositivo".

### Recorridos con lector (C1 a C8)

Desde esta etapa los precios de todos los recorridos tienen formato de importe ("$ 9.000" en vez de "$9000.00"). Qué dice el lector con eso depende del dispositivo y se mide en la etapa 7.
