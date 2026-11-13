# Bitácora: accesibilidad de web-cliente (WCAG 2.2 AA)

Registro, etapa por etapa, de lo que se hizo para la accesibilidad del flujo del comensal: qué cambió y por qué, los tests, la cobertura antes y después, el quality gate de SonarCloud, los problemas y cómo se resolvieron, lo que quedó pendiente y qué recorridos de [`docs/calidad/accesibilidad-recorridos-lector.md`](../calidad/accesibilidad-recorridos-lector.md) deberían andar. El plan, con las decisiones y las etapas, está en [`plan-cliente.md`](plan-cliente.md).

## Estado actual

| Etapa | Estado |
| --- | --- |
| 1. Base compartida | Hecha (13/11/2026), a la espera de revisión. PR en borrador por abrir |
| 2. Formato de precios | Pendiente |
| 3. Bloqueantes (menú lateral y filtro de dietas) | Pendiente |
| 4. Menú, detalle y discovery | Pendiente |
| 5. Carrito, pedidos, PIN, nombre y pago | Pendiente |
| 6. Contraste, foco visible y tamaños | Pendiente |
| 7. Cierre (lint, axe de Coty, celulares) | Pendiente |

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

Estado: hecha, a la espera de revisión.

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

135 tests nuevos (768 → 903), en 53 archivos (44 → 53):

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

Pendiente: se anota cuando corra el PR (borrador).

- Cobertura del código nuevo: _
- Duplicación: _
- Confiabilidad, seguridad y mantenibilidad: _
- Hotspots: _

### Verificación en el navegador

Además de los tests, se miró la app en Edge real (390 × 844, API simulada, un Vite propio en el puerto 5199): la carta, el menú de la mesa, "Mis pedidos" vacío y el carrito vacío. Resultados: un solo `<main>` por pantalla, la página no se desplaza (solo la zona de secciones de la carta, 669 px visibles con 3169 de contenido), los títulos de pestaña son "Carta · Lupulus Casa Matriz", "Menú · …", "Carrito · …" y "Mis pedidos · MenYU", al abrir una pantalla por dirección el foco queda en el `<body>` y al navegar dentro de la app queda en el `<h1>`. Las capturas no cambiaron respecto de lo que se esperaba (el único cambio visual es el anillo de foco del título al navegar).

### Problemas y cómo se resolvieron

- **`main` local 158 commits atrás de `origin/main`.** La rama se creó con `git switch -c feat/a11y-cliente --no-track origin/main` (sin seguimiento, para que un `git push` sin argumentos no apunte a `main`). Los 10 archivos borrados que tenía el árbol (el login legacy) ya no existen en `origin/main`, así que no hubo conflicto.
- **`.git/index.lock` viejo** (vacío, del 27/10, sin ningún proceso de git corriendo): se borró para poder cambiar de rama.
- **`pnpm add` con `--filter` dejó incompleto el almacén de `node_modules`** (faltaba `@supabase/ssr`, y el typecheck de web-cliente fallaba en `packages/auth-client`). Se arregló con `pnpm install --frozen-lockfile` en la raíz. Ojo: las notas del proyecto dicen no correr `pnpm add` con el árbol en uso; si había un Vite o el backend corriendo, hay que reiniciarlos.
- **`packages/types/dist` viejo** (de octubre): faltaban exports del asistente. Se recompiló con `pnpm --filter @menyu/types build` (la carpeta no se versiona).
- **Error del entorno con Node 24 y OneDrive:** además del error de `lru-cache` de la línea base, una de las corridas de cobertura falló con `EBUSY` (OneDrive bloqueó un archivo de `node_modules`) y perdió el reporte de un spec. Se repitió y dio 53 de 53 archivos y 903 de 903 tests.
- **vitest-axe y `document.documentElement`:** `axe(document.documentElement)` falla ("The node to be removed is not a child of this node") porque vitest-axe vuelve a insertar el HTML como texto. Se usa `axe(document.body)` (cubre también el anunciador, que está en el `<body>`) y `axe(container)` en las pantallas. Las reglas que solo corren sobre la página entera (`landmark-one-main`, `page-has-heading-one`) se comprueban con los tests por rol (`getByRole('main')`, `getByRole('heading', { level: 1 })`).
- **Un `<textarea>` que se cuela entre tests:** el respaldo de "copiar" de `MensajePage` agrega un `<textarea>` fuera de pantalla y lo saca después de `document.execCommand('copy')`, que jsdom no tiene: ahí lanza y el `<textarea>` queda en el `<body>` para los tests siguientes. Los tests nuevos de esa pantalla buscan el `<textarea readonly>` dentro del `<main>` y no `getByRole('textbox')`.
- **Hallazgo real de axe en `MensajePage`:** el `<textarea>` del mensaje armado no tiene etiqueta (`label`). No está en el plan; el test de axe de esa pantalla desactiva solo esa regla, con un comentario, y el hallazgo está en "Hallazgos fuera del plan" de `plan-cliente.md`.

### Pendiente

- Abrir el PR como borrador y anotar el resultado de SonarCloud (arriba).
- **Para decidir** (detalle en `plan-cliente.md`, "Hallazgos fuera del plan" y "Preguntas abiertas"): la etiqueta del `<textarea>` de `MensajePage`; el anillo de foco que el navegador dibuja alrededor del `<h1>` al navegar; si se renombra la auditoría a `auditoria-general.md`; y si el asistente (C8) entra en el plan.
- **Sin `<h1>` todavía** (etapa 5): `/pago/exitoso`, `/pago/fallido`, `/pago/pendiente` y la confirmación del carrito ("¡Pedido enviado a cocina!"). En esas pantallas el foco no se mueve al navegar hasta que lo tengan.
- El spec nuevo de `ElegirNombrePage` busca el campo por su placeholder ("Ej: Juan"): hay que ajustarlo en la etapa 5, cuando el label se asocie al campo.

### Recorridos con lector (C1 a C8)

Ninguno completo todavía. Desde esta etapa debería cumplirse el punto 1 de "En cada pantalla" (al llegar se anuncia el título o el encabezado principal) en las pantallas de C1 a C7, salvo las que figuran arriba como sin `<h1>` (resultado del pago de C7 y confirmación de C4). El anunciador de la región viva ya existe, pero todavía nadie lo usa: los anuncios de C1, C4, C5 y C6 llegan en las etapas 3 a 5.
