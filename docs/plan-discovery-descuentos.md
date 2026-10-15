# Plan: logo y dirección, descuentos y Discovery de restaurantes

**Estado:** en ejecución: `fix/endpoints-get-id`, `feat/logo-direccion` (Fases 1.0 y 1, PR #364), `feat/descuentos` (Fases 2, 3 y 4, PR #365) y la Fase 5 de `feat/discovery` (API pública, con los mockups; PR #366) ya están en `main`. En la rama `feat/discovery` están hechas las Fases 6 y 7 (Discovery como home, restaurante, ingreso a mesa, escáner, `/check-in`, carta en modo vista y el header con logo y menú lateral) y de la Fase 8 el seed, la documentación y la verificación contra el backend real. Falta el PR contra `main`, el QA en staging y en celulares reales (`docs/checklist-qa-staging.md`) y el tag de producción, que decide el equipo · **Actualizado:** 2026-10-14 · **Base:** `main` al 2026-10-13 (merge ae36522)
**Equipo:** De Marcos, Ojeda, Strumia Carrara

Este documento es la referencia del trabajo: qué se construye, qué decidimos, cómo se parte en ramas y fases y cómo se prueba cada una. Si una decisión cambia, se actualiza acá (sección 3) y se anota en la fase afectada.

## Índice

1. [Qué vamos a construir](#1-qué-vamos-a-construir)
2. [Reglas que valen para todo](#2-reglas-que-valen-para-todo)
3. [Decisiones acordadas](#3-decisiones-acordadas)
4. [Diseño técnico](#4-diseño-técnico)
5. [Ramas, orden de merge y commits](#5-ramas-orden-de-merge-y-commits)
6. [Fases (detalle y checklists)](#6-fases-detalle-y-checklists)
7. [Estrategia de tests](#7-estrategia-de-tests)
8. [Cómo probar en celular](#8-cómo-probar-en-celular)
9. [Riesgos y notas operativas](#9-riesgos-y-notas-operativas)
10. [Pendientes y su resolución](#10-pendientes-y-su-resolución)
- [Apéndice A: permisos de ROOT en el código existente](#apéndice-a-permisos-de-root-en-el-código-existente)
- [Apéndice B: backlog diferido](#apéndice-b-backlog-diferido)

---

## 1. Qué vamos a construir

| # | Funcionalidad | Resumen |
|---|---|---|
| 1 | Logo y dirección | Cada marca tiene logo. Cada restaurante puede tener logo propio (reemplaza al de la marca) y tiene dirección. Se cargan desde web-admin y solo los modifica el OWNER de su marca. |
| 2 | Descuentos en ítems | OWNER y GERENTE (este solo en sus restaurantes asignados) ponen ítems en descuento cargando el precio nuevo (se calcula el %) o el % (se calcula el precio). El precio se redondea a peso entero, el % no se guarda, el descuento dura hasta que alguien lo saque a mano y aplica solo al precio base (los extras se cobran a precio normal). |
| 3 | Sección "Descuentos" en el menú del cliente | Mismo estilo que Recomendaciones. Cada plato muestra el precio original tachado y chico, el precio con descuento y un círculo naranja con el % arriba a la derecha de la foto. |
| 4 | Discovery de restaurantes | Nueva página inicial de web-cliente (reemplaza a la landing actual): todos los restaurantes con logo y dirección, productos en oferta, buscador (ofertas que coinciden, restaurantes que coinciden y restaurantes con platos que coinciden, en ese orden; ignora acentos) y login. |
| 5 | Pantalla del restaurante | Al tocar un restaurante: "Ingresar a una mesa" (QR o PIN) o "Ver la carta". |
| 6 | Carta en modo vista | Igual al menú de pedido, sin botones de pedir ni detalle de ítems, con buscador y descuentos visibles. En el menú hamburguesa: iniciar sesión e ingresar a una mesa como invitado (QR o PIN). |
| 7 | Logo en el header del menú | En modo mesa y en modo carta el header muestra el logo del restaurante; si no tiene, el de la marca; si tampoco, el de MenYu. |

**Fuera de alcance:** fidelización (no entra en la tesis y no se usa para decidir nada), Mercado Pago (lo informa el equipo por su cuenta), vigencia o programación de descuentos, descuentos en lote por marca, auditoría de quién cambió un descuento, orden por cercanía, paginación del Discovery, logos en SVG y la revisión de permisos de ROOT en el código existente (ver [Apéndice A](#apéndice-a-permisos-de-root-en-el-código-existente)).

---

## 2. Reglas que valen para todo

### 2.1 Permisos (regla de ROOT)

ROOT hace administración general: crear y eliminar marcas, restaurantes y usuarios OWNER y GERENTE. **No** decide sobre marcas ni restaurantes y **no** accede a sus datos privados. No es un bypass: en código nuevo no se lo incluye en `@Roles(...)` ni en los chequeos de pertenencia. La regla también está en `CLAUDE.md` (sección "Roles de administración").

| Acción | OWNER | GERENTE | ROOT |
|---|---|---|---|
| Logo de marca, logo y dirección de restaurante | ✔ su marca | ✘ | ✘ |
| Poner o sacar descuentos | ✔ su marca | ✔ restaurantes asignados | ✘ |

Consecuencias en el código nuevo:

- `@Roles('OWNER')` o `@Roles('OWNER', 'GERENTE')` a nivel de método. Pisa el `@Roles('ROOT', ...)` que tienen a nivel de clase varios controllers existentes.
- Chequeo de pertenencia nuevo, sin ROOT, en `apps/backend/src/common/`. No se reutilizan los helpers existentes, que tienen `if (user.rol === 'ROOT') return`.
- Un test "ROOT → 403" por cada endpoint nuevo.
- En las apps, ROOT no ve las pantallas ni los botones nuevos.
- Los permisos de ROOT del código existente no se tocan en este plan (Apéndice A).
- La lectura del logo y la dirección es pública (se muestran en Discovery). La restricción es sobre modificarlos.

### 2.2 Estética: web-cliente se ve como web-cliente

Discovery, la pantalla del restaurante, la pantalla de ingreso a mesa y la carta tienen que verse como parte de la app actual, no como algo nuevo. Reglas:

1. **Colores:** solo los de `apps/web-cliente/src/theme.ts` (`C`). No hay hex sueltos en páginas nuevas. Si falta un token (por ejemplo `navySoft` o `textMuted`), se agrega a `theme.ts`. Si dos pantallas existentes difieren en un tono parecido, manda `theme.ts`.

   | Token | Valor | Uso |
   |---|---|---|
   | `orange` / `orangeHover` | `#E8563A` / `#d34a30` | acción primaria, precios, acentos |
   | `orangeSoft` | `#FDE5DF` | avisos, círculos de íconos |
   | `navy` | `#2D3561` | títulos, header del menú, chips activos |
   | `bg` | `#F7F7F8` | fondo de página |
   | `text` / `textSub` / `gray` | `#1A1A2E` / `#6B7280` / `#9CA3AF` | texto principal, secundario, apagado |
   | `border` / `borderInput` | `#E5E7EB` / `#DDDDE0` | cards y divisores / inputs |
   | `white` | `#FFFFFF` | tarjetas, headers claros |

2. **Tipografía:** Montserrat (títulos, botones, precios; 700 y 800) e Inter (texto; 400, 500 y 600), ya cargadas en `index.html`. Referencias: título de pantalla 26–28px/800 navy (`EntradaPage`, `IngresoManualPage`), subtítulo 14–15px Inter `textSub`, nombre de plato 13px/700, precio 14px/700 naranja, encabezado de sección 13px/800 en mayúsculas con `letterSpacing: 0.1em` y subrayado naranja de 2px (como en `ClienteMenuPage`).
3. **Formas:** cards con radio 12 y borde de 1px; botón principal ancho completo con radio 14 (naranja, texto blanco, Montserrat 700); botones secundarios con radio 10; inputs con radio 10 y borde `borderInput`; chips y buscador en píldora (radio 999); modales y tarjetas grandes con radio 16.
4. **Espaciado:** gutter de 14px en listas y menú; 24px en pantallas centradas de entrada; `AppHeader` de 60px fijo; grillas con gap de 10px; secciones separadas 28px.
5. **Componentes que se reutilizan** (no se reinventan): `AppHeader` (logo + Ingresar/Registrarme), `Spinner` y `MenuItemImage` de `@menyu/ui`, la tarjeta de plato (`ItemCard`, que se extrae de `ClienteMenuPage`), el buscador en píldora, los chips de sección, el banner de error (fondo `orangeSoft`, borde naranja), el drawer del menú y `AnfitrionScreen` / `CodigoSesionScreen`.
6. **Íconos:** mismo criterio que hoy. Emojis chicos en el menú (🔍 🥗 🛒 🔔) y SVG de trazo en las pantallas de entrada (como el ícono de QR).
7. **Estilos:** `style={{}}` con tokens, como el resto de web-cliente. Tailwind solo para layout responsive (grillas, `max-w-*`, breakpoints), como ya hace `ClienteMenuPage` con `grid-cols-2 md:grid-cols-4`.
8. **Verificación:** antes de aprobar cada pantalla nueva se la compara lado a lado con `EntradaPage` (pantallas centradas) y `ClienteMenuPage` (listas y cards).

web-admin y web-staff: las pantallas nuevas siguen el estilo de las pantallas existentes de cada app (misma paleta de marca).

### 2.3 Responsive y mobile-first

Principios:

- **web-cliente** se diseña primero para celular (es el 99% del uso). Base: 360×640. Después se adapta a tablet y escritorio: columna centrada con ancho máximo en pantallas de entrada y formularios, y grillas que suman columnas en listas.
- **web-staff y web-admin** pueden usarse desde la computadora, pero también tienen que funcionar bien en celular.
- En todos los casos la pantalla se adapta al tamaño del dispositivo sin romper la estética ni el funcionamiento.
- **Alcance:** todo lo que se crea o modifica en este plan. Las pantallas existentes que no se tocan quedan en el backlog (P2).

Breakpoints de referencia (los de Tailwind): `sm` 640, `md` 768, `lg` 1024, `xl` 1280.

Reglas de implementación:

- Layout con clases responsive de Tailwind (los estilos inline no soportan media queries); el aspecto visual con tokens.
- `100dvh` en lugar de `100vh` en pantallas completas.
- Áreas táctiles de al menos 44×44 px. Inputs con `font-size` de al menos 16px (si no, iOS hace zoom al enfocar).
- Sin scroll horizontal de página. El scroll horizontal solo dentro de carruseles o tablas contenidas.
- Texto largo (nombres, direcciones): elipsis o wrap sin romper la card.
- Imágenes con proporción fija (sin saltos de layout) y fallback de logo con iniciales.
- Elementos fijos abajo (botón de carrito, bottom sheets) respetan el safe-area (`env(safe-area-inset-bottom)`).
- Modales con alto máximo y scroll interno.
- Estados de carga, vacío y error usables en todos los anchos.

**Checklist responsive estándar** (se aplica en cada fase con UI):

- [ ] Anchos 360×640, 390×844, 768×1024, 1280×800 y 1920×1080 (DevTools).
- [ ] Celular en vertical y horizontal (web-cliente).
- [ ] Sin scroll horizontal de página en ningún ancho.
- [ ] Textos largos y logos raros (muy anchos, muy altos, sin logo) no rompen cards ni header.
- [ ] Botones y links se tocan cómodo (44 px o más); los inputs no provocan zoom en iOS.
- [ ] Con el teclado abierto, el input activo y el botón principal siguen visibles.
- [ ] Zoom del navegador al 200% y texto grande del sistema: sigue usable.
- [ ] Estados cargando, vacío, error y sin conexión se ven bien.
- [ ] Una pasada en un celular real (Android o iPhone) al cierre de la fase (ver sección 8).
- [ ] Admin y staff a 360 px: formularios apilados, tablas en cards o con scroll contenido, menú lateral que no tapa el contenido.

### 2.4 Base de datos y migraciones

- Todo cambio de modelo es aditivo y nullable.
- Cada rama desarrolla y prueba sus migraciones contra la base local de Docker (`apps/backend/README.md`) con `prisma migrate dev`. Para el CHECK y la extensión se usa `--create-only` y se edita el SQL a mano antes de aplicarla. Nunca contra QA.
- QA (Supabase) recibe las migraciones solo al mergear a `main`: Railway corre `prisma migrate deploy` al arrancar.
- No se corre `migrate deploy` ni `db seed` a mano contra QA (impacta a todo el equipo). Contra QA solo comandos de lectura, como `migrate status`.
- Una migración por cambio de modelo, con timestamp posterior a la última de `main`.

---

## 3. Decisiones acordadas

| ID | Decisión |
|---|---|
| D1 | Logo y dirección: solo el OWNER de su marca. ROOT y GERENTE no. |
| D2 | Dirección: columna nullable (hay filas viejas), obligatoria al guardar desde la pantalla nueva y en `CreateRestauranteDto`. Discovery muestra "Dirección no cargada" si falta. |
| D3 | Logos: bucket público nuevo `logos` (QA y prod), con nombre configurable por variable de entorno (`SUPABASE_LOGOS_BUCKET`) para usar uno de desarrollo. PNG, JPG o WebP de hasta 2 MB. Sin SVG. La URL guardada lleva `?v=<timestamp>` para romper el caché. |
| D4 | Cambiar el precio base de un ítem con descuento activo: error 400 si el nuevo precio base es menor o igual al precio con descuento. Si no, el descuento queda y el % se recalcula. |
| D5 | Porcentaje: enteros de 1 a 99. Redondeo al peso más cercano (.5 hacia arriba). Si el redondeo deja el precio igual al base, error. |
| D6 | Los descuentos también aplican en la Toma de pedidos (web-staff y web-admin): precio vigente, tachado y badge. Sin la sección completa. |
| D7 | Orden de secciones del menú: Descuentos → Recomendaciones → categorías. |
| D8 | Tocar un producto en oferta (Discovery) abre la pantalla del restaurante. |
| D9 | Búsqueda de Discovery: en el servidor, "contiene", sin distinguir mayúsculas **ni acentos** (extensión `unaccent` en la migración de la Fase 5), mínimo 2 letras, también matchea el nombre de la marca, sin paginación (50 restaurantes y 30 ofertas, ofertas por % mayor). |
| D10 | Sesión de mesa: queda como hoy (no se vincula a la cuenta). |
| D11 | Se valida que el QR o PIN corresponda al restaurante elegido (el backend acepta `restauranteId` junto con `tableCode`). |
| D12 | Se retira `/ingresar-pin` (marca → sucursal → PIN): la ruta redirige a `/` y el PIN se pide dentro del restaurante elegido. |
| D13 | Se suma Testing Library (`@testing-library/react` y `jest-dom`) en web-cliente y web-admin, y en web-staff para la Toma de pedidos (Fase 4). |
| D14 | Mockups HTML de Discovery y de la pantalla del restaurante, aprobados antes de implementar la Fase 6. Mobile primero y escritorio (sección 6, Fase 6). |
| D15 | Migraciones: se desarrollan contra la base local y QA las recibe al mergear (sección 2.4 y 9). |
| D16 | Regla de ROOT (sección 2.1). |
| D17 | Fidelización fuera de alcance. |
| D18 | Mercado Pago no se toca. |
| D19 | `GET /marcas/:id` y `GET /restaurantes/:id` se arreglan en una rama aparte, antes de la Fase 1. |
| D20 | Logo del header del menú: restaurante → marca → MenYu. El logo reemplaza a las iniciales y funciona como ese mismo botón (al tocarlo abre el drawer); MenYu queda solo como último fallback (P5, confirmado viendo el header real). |
| D21 | Estética y responsive (secciones 2.2 y 2.3). |
| D22 | Ramas y commits (sección 5). |
| D23 | Home de Discovery: debajo del buscador va el atajo "Escanear el QR de mi mesa" (centrado en celular). Abre el escáner sin elegir restaurante antes, porque el QR ya identifica la mesa. |
| D24 | La pantalla del restaurante muestra sus ofertas y carga sus datos con `GET /discovery/restaurantes/:id` (público), así también anda al entrar por un link o al recargar. |
| D25 | Ingreso a mesa: lo principal es el QR. El PIN no se ofrece de entrada: queda detrás de un texto chico ("¿Pasó algo con tu cámara? Ingresá el PIN de tu mesa") y recién al tocarlo se abre el campo. |
| D26 | El escáner anda desde el celular (Chrome en Android y Safari en iPhone): pide el permiso de la cámara, usa el lector nativo del navegador si lo tiene (`BarcodeDetector`) y uno propio si no (Safari no lo tiene). Si se rechaza el permiso o la cámara no anda, muestra un mensaje claro, recomienda escanear el QR con la cámara del celular (el QR es un link a `/check-in` que la app de cámara abre directo, sin pedirle nada a la página) y ofrece la opción del PIN (desde el home, la de elegir el restaurante). |
| D27 | `AppHeader` en celular: el logo conserva su proporción (24 px de alto debajo de 385 px), botones más chicos con área de toque de 44 px y más espacio entre el logo y los botones. Con sesión, "Hola, [nombre]" arriba y "Cerrar sesión" debajo. El nombre se muestra entero, tal cual viene en el token: hoy el cliente se guarda en un único campo `nombre` y no se adivina dónde termina el nombre y empieza el apellido (si algún día el apellido viniera en otro campo, no se muestra); si no entra, pasa a la línea de abajo y el header crece (nunca se corta con "..."). Cambio del 2026-10-14: antes decía "si el nombre es largo, solo el primer nombre". Toca las pantallas existentes que usan el header. |
| D31 | Logo: sobre fondo oscuro se usa la imagen real `LogoParaOscuro.png` (está en `public/` de web-cliente, web-staff y web-admin) en lugar de armarlo con texto; sobre fondo claro, el logo normal (`logo.png`). Lo dibuja el componente `LogoMenYuOscuro` de `@menyu/ui`, que recorta el aire transparente del PNG y recibe el alto de las letras. Pedido el 2026-10-14. Reemplaza el logo armado a mano en la tarjeta del modo seguro de web-cliente, el menú lateral de web-admin, los tres headers de web-staff y los mockups. |
| D28 | `.gitignore` ignora cualquier `.env*` salvo `.env.example`: tienen credenciales (por ejemplo `apps/backend/.env.backup`). |
| D29 | Resultados de la búsqueda de Discovery: primero las ofertas que coinciden, después los restaurantes que coinciden por nombre y al final los restaurantes que tienen platos que coinciden. Este último grupo muestra solo el restaurante, igual que la lista general: ni los nombres de los platos ni la cantidad (con muchos platos quedaría muy largo), y la API tampoco los devuelve. |
| D30 | Pantallas de `/check-in` (adonde llega la cámara del celular con el QR de la mesa): mientras abre la sesión muestra "Abriendo tu mesa…" (hoy queda en blanco) y, si falla, un aviso con la opción del PIN (hoy vuelve al inicio sin decir nada). Si el QR no abre una mesa, la salida principal es el PIN del restaurante del link; si no hubo conexión, "Reintentar". Pedido el 2026-10-14; mockups en `docs/mockups/checkin.html` (aprobados el 2026-10-14). |

---

## 4. Diseño técnico

### 4.1 Base de datos

Todo es aditivo y nullable:

| Cambio | Fase |
|---|---|
| `marca.logo_url TEXT NULL` | 1 |
| `restaurante.logo_url TEXT NULL` | 1 |
| `item_menu.precio_descuento INTEGER NULL` más `CHECK (precio_descuento IS NULL OR (precio_descuento > 0 AND precio_descuento < precio_base))` | 2 |
| `CREATE EXTENSION IF NOT EXISTS unaccent` | 5 |

- `precio_descuento` es entero: los pesos enteros quedan garantizados por el tipo. El porcentaje nunca se guarda.
- El CHECK y la extensión no se pueden expresar en `schema.prisma`: la migración se crea con `prisma migrate dev --create-only` contra la base local y se edita el SQL a mano antes de aplicarla.

### 4.2 API

| Endpoint | Quién | Fase | Notas |
|---|---|---|---|
| `POST /marcas/:id/logo`, `DELETE /marcas/:id/logo` | OWNER de esa marca | 1 | multipart `logo` |
| `POST /restaurantes/:id/logo`, `DELETE /restaurantes/:id/logo` | OWNER de su marca | 1 | multipart `logo` |
| `PATCH /restaurantes/:id` (campo `direccion`) | OWNER de su marca | 1 | GERENTE y ROOT reciben 403 si envían `direccion`. Los demás campos no cambian. |
| `PUT /items/:id/descuento` | OWNER, GERENTE asignado | 2 | `{ precioDescuento }` o `{ porcentaje }` (exactamente uno) |
| `DELETE /items/:id/descuento` | OWNER, GERENTE asignado | 2 | quita el descuento |
| `PATCH /items/:id` (campo `precioBase`) | existente | 2 | aplica D4 |
| `GET /menu/:restauranteId` | público | 2 y 7 | Fase 2: `precioDescuento`, `porcentajeDescuento`, `precioVigente` en cada ítem y `descuentos[]`. Fase 7: `restaurante.logoUrl` ya resuelto. |
| `GET /discovery` | público | 5 | restaurantes y ofertas |
| `GET /discovery/buscar?q=` | público | 5 | ofertas, restaurantes y restaurantes con platos, en el orden en que se muestran (D29) |
| `GET /discovery/restaurantes/:id` | público | 5 | un restaurante activo con sus ofertas (hasta 30); 404 si no existe, no está activo o el id no es un UUID (D24) |
| `POST /sessions/open` | público | 6 | `restauranteId` opcional junto con `tableCode` (D11) |

Reglas de los endpoints públicos nuevos: `select` explícito (nunca devolver filas completas), solo restaurantes y marcas activos, solo ítems disponibles, límites duros y mínimo de 2 caracteres en la búsqueda.

### 4.3 Precio y cobro

- `precio = round(base × (100 − %) / 100)` y `% = round((1 − precio / base) × 100)`. Válido con 1 ≤ % ≤ 99 y 0 < precio < base.
- `precioVigente = precioDescuento ?? precioBase`.
- Cobro: `precioUnitario = precioVigente + extras`. Los extras se cobran a precio normal.
- Hoy hay tres cálculos que parten de `precioBase`: `orders.service.ts` (`create`) y `pedidos.service.ts` (`confirmar` y `crearStaff`). Los tres pasan a usar `precioVigente`, sin cambiar el comportamiento actual de `QUITAR` de cada camino.
- Pagos, división por comensal y reportes leen `precioUnitario` del pedido (un snapshot), así que no cambian.
- El backend entrega todo calculado. web-cliente y web-staff no calculan precios ni porcentajes. Solo el formulario de web-admin tiene una función local para la vista previa en vivo (precio ↔ %), con los mismos casos de test que la del backend.

### 4.4 Tipos (`@menyu/types`)

- `Marca.logoUrl` y `Restaurante.logoUrl` (`string | null`). De paso se saca `qrBaseUrl` de `Restaurante`: la columna se eliminó en la migración `drop_qr_base_url`.
- `ItemMenu` y `MenuPublicoItem`: `precioDescuento`, `porcentajeDescuento`, `precioVigente`.
- `MenuPublico`: `descuentos` y `restaurante.logoUrl`.
- Nuevos: `DiscoveryRestaurante`, `DiscoveryOferta`, `DiscoveryResponse`, `DiscoveryRestauranteDetalle`, `DiscoveryBusquedaResponse` y `UpdateItemDescuentoRequest`.

### 4.5 Componentes compartidos (`@menyu/ui`)

- `DescuentoBadge`: círculo naranja chico con el %. Lo posiciona el padre (arriba a la derecha de la foto).
- `PrecioConDescuento`: precio original tachado y chico, más precio vigente. Variantes para tarjeta, fila de lista y detalle. El formato de precio es configurable: web-cliente mantiene el actual y web-admin usa `es-AR`.
- `precioVigenteDe` y `tieneDescuento`: leen los datos que manda el backend (nunca calculan) y los usan las tres apps.
- `ItemMenuFila`: fila de plato de la Toma de pedidos (foto con círculo, nombre, precio con tachado y botón +), compartida por web-staff y web-admin.

### 4.6 web-cliente

Rutas nuevas, todas públicas (fuera de `SesionRequiredRoute` y de `ComensalRequiredRoute`):

| Ruta | Pantalla |
|---|---|
| `/` | `DiscoveryPage` (reemplaza a `EntradaPage`) |
| `/restaurante/:restauranteId` | opciones del restaurante |
| `/restaurante/:restauranteId/mesa` | ingreso a mesa del restaurante (QR o PIN) |
| `/restaurante/:restauranteId/carta` | carta en modo vista |
| `/ingresar-pin` | redirige a `/` (D12) |
| `/check-in` | se mantiene (es la URL que codifican los QR impresos); mientras abre la mesa muestra "Abriendo tu mesa…" y, si falla, un aviso con la opción del PIN (D30) |

- Login desde Discovery o desde la carta: `AppHeader` y drawer ya navegan a `/auth`. Se suma `?volver=<ruta>` para volver a donde estaba el usuario. Sin ese parámetro vuelve a `/`.
- El ingreso a mesa sigue terminando en `/menu`. Ese guard ya redirige a `/elegir-nombre` (comensales) si falta el nombre. Los puntos de entrada nuevos no deben saltearlo.
- Piezas extraídas (Fase 6, commit 1): `components/QrScanner.tsx` (estaba dentro de `EntradaPage`), `utils/qr.ts` (`extractQrToken`) y el hook `hooks/useEntrarAMesa.tsx`: abre la sesión y resuelve lo que sigue (al menú, pantalla del anfitrión o del código de la mesa en modo seguro); devuelve `{ entrar, cargando, pantalla }` y estaba copiado en `EntradaPage`, `IngresoManualPage` y `CheckInRedirectPage`.
- Escáner (D26, Fase 6, commit 2): `QrScanner` lee con el `BarcodeDetector` del navegador si existe y sabe leer QR (Chrome en Android) y, si no, con un lector propio: `jsqr` sobre el cuadrado central del cuadro del video (lo que se ve en el recuadro), de 640 px como máximo y una lectura por vez (`utils/lectorQr.ts`; Safari en iPhone no tiene `BarcodeDetector`). `jsqr` va en un chunk aparte de unos 47 KB comprimidos: solo se descarga si hace falta, y recién cuando la cámara arranca. El video lleva `playsinline` y `muted`; pide la cámara trasera (`facingMode: { ideal: 'environment' }`) al abrirse, que es al tocar "Escanear QR"; la apaga al leer, cancelar, reintentar o cerrarse, y si se corta sola. Estados (los del mockup): pidiendo permiso, escaneando, permiso rechazado (con cómo habilitarlo en Chrome y Safari), cámara que no responde (sin cámara, en uso o que no arranca) y navegador sin cámara (sin `getUserMedia`: página sin HTTPS o el navegador de otra app). Todos los fallos recomiendan escanear con la cámara del celular y ofrecen la alternativa que le pasa la pantalla que lo abre (`alternativa`): el PIN de la mesa o, desde el home, "Elegir mi restaurante".
- Header (D27): `AppHeader` pasa a usar clases de Tailwind para lo que cambia con el ancho (los estilos en línea no tienen media queries). Con sesión muestra "Hola, [nombre]" (el campo `nombre` del token entero, sin adivinar apellidos: ver D27) y el botón "Cerrar sesión" debajo en celular. El token se decodifica con `utils/jwt.ts` (UTF-8): con `atob` y `JSON.parse` solos los acentos salían rotos ("González" se veía "GonzÃ¡lez").
- Restaurante e ingreso a mesa (Fase 6, commit 4): las dos pantallas leen el restaurante de `discoveryStore.detalle` (el último pedido por id con `GET /discovery/restaurantes/:id`: sirve entrando por un link y al recargar; si se pasa de un restaurante a otro no se muestra el anterior mientras llega el nuevo; si la actualización falla quedan los datos de antes, salvo un 404, que lo marca como no encontrado). El ingreso a mesa manda siempre el restaurante elegido: el QR como `tableCode` + `restauranteId` (si la mesa es de otro restaurante, el servidor responde 409 y la pantalla lo dice con el nombre del restaurante) y el PIN con `restauranteId`. Para distinguir "esa mesa no existe o no es de este restaurante" de "no hay conexión", `sessionStore.errorStatus` guarda el código HTTP del último error (`null` si no hubo respuesta) y `useEntrarAMesa` se lo pasa a `alFallar({ status })`; el commit 5 (`/check-in`) usa lo mismo. `?pin` abre el campo del PIN y `?pin=qr` lo abre con el aviso de que el QR no abrió la mesa (a donde va a llevar `/check-in`). "Ver la carta" no está hasta la Fase 7. Componentes nuevos en `components/discovery/`: `Banner` (error o aviso), `BotonGrande`, `VolverEnlace`, `EsqueletosRestaurante`; `TarjetaOferta` suma `sinRestaurante` y `fija` (sin link).
- `/check-in` (Fase 6, commit 5): `CheckInRedirectPage` tiene tres estados (`abriendo`, `qr` y `red`) y decide el aviso por el código que le pasa `useEntrarAMesa` (`alFallar({ status })`): `null`, 429 o 5xx es `red` (reintentar puede andar); cualquier otro código es `qr`. Las pantallas viven en `components/CheckInScreens.tsx` y usan el `Shell` de `SesionSeguraModals`.
- `ClienteMenuPage` se parte en componentes (header, buscador con dietas, chips, secciones, `ItemCard`, drawer) con un `modo` (`mesa` o `carta`). **Hecho (Fase 7, carta):** la lógica vive en `components/menu/MenuView.tsx` (`modo` y `restauranteId`); `ClienteMenuPage` (la mesa, con el restaurante de la sesión) y `CartaPage` (`/restaurante/:id/carta`, con el de la dirección) son dos pantallas finas sobre ella. Piezas en `components/menu/`: `MenuHeader` (con `MozoYMesa`, solo en la mesa), `MenuDrawer`, `BarraBusqueda` (buscador y dietas), `ChipsSecciones`, `SeccionesMenu`, `BotonCarrito` (solo en la mesa), la paleta `CM` (el gris de borde del menú de siempre) y el tipo `ModoMenu`. `ItemCard` sin `onPress` es de solo lectura: sin "+", sin cursor de mano y sin resaltado.
- Carta en modo vista (Fase 7): sin "+", carrito, "Mozo", mesa ni detalle (tocar una tarjeta no hace nada), con buscador, dietas, chips y las secciones Descuentos, recomendaciones y categorías, con el círculo del porcentaje y el precio tachado. Es pública (fuera de `SesionRequiredRoute`). Menú lateral de la carta: "Ingresar a una mesa" (primario, a `/restaurante/:id/mesa`), "Volver al inicio" (al home de MenYU) y, arriba, "Iniciar sesión" y "Crear cuenta gratis" con `?volver=<la carta>`; las filas de pedido (etiquetar, mis pedidos, pagar) y "Mis puntos" son solo de la mesa, y el saludo con el nombre del comensal también (en la carta puede quedar el nombre de una mesa anterior). Un restaurante que no existe (404) muestra "No encontramos este restaurante"; cualquier otra falla, "No se pudo cargar el menú" con "Reintentar" y "Volver al restaurante". "Ver la carta" en la pantalla del restaurante (botón secundario, con su ayuda).
- `?volver=` (Fase 7): `AuthPage` vuelve ahí al iniciar sesión o registrarse y, sin él, a `/menu` si hay mesa o a `/`. Solo acepta rutas de la app (`utils/rutaInterna.ts`: empieza con una sola `/`, sin barra invertida ni caracteres de control, hasta 500 caracteres): un `volver` a otro sitio se ignora, para que un link armado no mande a la persona a otro lado justo después de poner su clave. No cambia el ingreso de admin y mozo, que siguen redirigiendo a su app.
- `publicMenuStore` (Fase 7): guarda el menú del último restaurante pedido y nunca mezcla dos: al pedir el de otro restaurante el anterior se saca mientras llega el nuevo, una respuesta (o error) de un pedido que ya no es el último se descarta, y `errorStatus` guarda el código HTTP para distinguir un 404 de una falla. `menuEsDe(menu, id)` compara los ids sin importar mayúsculas (son UUID: si no, un link con el id en mayúsculas pediría el menú una y otra vez).
- Stores: `discoveryStore` nuevo y `publicMenuStore` indexado por `restauranteId` (hoy no vuelve a pedir el menú si ya hay uno cargado y mostraría el del restaurante anterior).

### 4.7 web-admin y web-staff

- web-admin: pantalla "Marca y sucursales" (Fase 1), botón y modal de descuento en la lista del menú (Fase 3), precio vigente en Toma de pedidos (Fase 4), y el shell responsive (Fase 1.0).
- web-staff: precio vigente en Toma de pedidos del mozo (Fase 4).

---

## 5. Ramas, orden de merge y commits

| Rama | Fases | Depende de |
|---|---|---|
| `fix/endpoints-get-id` | arreglo previo de los `GET /:id` | — |
| `feat/logo-direccion` | 1.0 y 1 | `fix/endpoints-get-id` ya mergeada (toca los mismos services) |
| `feat/descuentos` | 2, 3 y 4 | — |
| `feat/discovery` | 5, 6, 7 y 8 (cierre) | `feat/logo-direccion` y `feat/descuentos` ya mergeadas |

```text
main ─► fix/endpoints-get-id ─► merge ─► feat/logo-direccion ─┐
main ─► feat/descuentos ─────────────────────────────────────┴─► merge ─► feat/discovery ─► merge
```

- `feat/descuentos` agrupa las fases 2, 3 y 4 para que el estado intermedio (se muestra un precio y se cobra otro) nunca llegue a `main`.
- `feat/logo-direccion` y `feat/descuentos` son independientes entre sí, pero se hacen de a una, en el orden de la tabla: nadie más del equipo trabaja en paralelo sobre estas ramas.
- `feat/discovery` necesita los logos y las direcciones (Fase 1) y los descuentos con sus componentes (Fases 2 a 4): arranca cuando las otras dos ya están en `main`. Los mockups de la Fase 6 se preparan y se aprueban antes de empezar esa rama.

**Commits:**

- Estilo del historial (Conventional Commits en español). Sufijo `[Fase N]` para seguir el avance con `git log --grep "Fase 2"`. Ejemplo: `feat(descuentos): núcleo de descuentos, BD, API y cobro [Fase 2]`.
- Un commit por fase como mínimo. Si la fase es grande se parte por capa (BD, backend, apps).
- Cada commit deja `typecheck`, `lint` y tests en verde.
- Commits previstos:

| Rama | Commits |
|---|---|
| `fix/endpoints-get-id` | 1 (fix y test) |
| `feat/logo-direccion` | Fase 1.0: 1 · Fase 1: 3 (BD, backend, web-admin y tipos) |
| `feat/descuentos` | Fase 2: 2 (BD, backend y tipos) · Fase 3: 1 · Fase 4: 2 (ui y web-cliente, staff y admin) |
| `feat/discovery` | Fase 5: 2 · Fase 6: 7 (refactor, mockup de `/check-in`, escáner, servidor de desarrollo para túneles, Discovery con el header, restaurante y mesa, pantallas de `/check-in`) · Fase 7: 2 (carta, logo en header) · Fase 8: 1 |

**Flujo de cada rama:** se trabaja la rama completa y, al terminar, se entregan los comandos de commit (uno por fase) y de push, que ejecuta el equipo. Después: PR (se abre desde la web de GitHub; conviene en borrador hasta que el CI esté verde), `git merge origin/main` antes de empezar la rama siguiente si `main` avanzó, merge a `main` y prueba en QA con el checklist. El tag de producción lo decide el equipo.

**Definición de terminado de cada fase:** `pnpm typecheck`, `pnpm lint` (los frontends corren con `--max-warnings 0`), `pnpm test`, `pnpm build`, checklist de la fase completo (incluido el responsive estándar si hay UI) y commit hecho.

---

## 6. Fases (detalle y checklists)

Tamaños relativos (no son horas): Fase 0 S · fix S · 1.0 M · 1 M · 2 M · 3 S–M · 4 M · 5 S–M · 6 L · 7 M–L · 8 S.

### Fase 0: línea base y prerrequisitos (sin commit de código)

- [x] `main` verde (2026-10-10): `pnpm typecheck`, `pnpm lint` y `pnpm test` sin errores ni fallas preexistentes (api 154 tests, web-admin 9, web-cliente 22, web-staff 18).
- [x] Cliente de Prisma regenerado: `pnpm --filter @menyu/api exec prisma generate`. Hay que repetirlo después de cada pull que cambie `schema.prisma`: el script `dev` no lo ejecuta y, si falta, el backend no compila y la web muestra `ERR_CONNECTION_REFUSED`.
- [x] Docker Desktop encendido y base local lista: `docker compose up -d`, `npx prisma migrate deploy`, `pnpm prisma db seed` (ver `apps/backend/README.md`).
- [x] `apps/backend/.env` apuntando a la base local (`localhost:5433`) y con `NODE_ENV=development`. La configuración anterior (Supabase) quedó en `.env.qa`, ignorado por git.
- [x] Backend, web-cliente, web-admin y web-staff levantan en local y se puede ingresar a una mesa con un PIN del seed.
- [x] Bucket `logos` creado en QA y prod: público, límite de 2 MB y solo PNG, JPEG y WebP. Para desarrollo hay un bucket aparte, `logos-dev`, en el proyecto de Supabase de QA (staging), que es al que apunta el `.env` local (nunca debe apuntar a producción). El nombre del bucket es configurable (`SUPABASE_LOGOS_BUCKET`); subir un logo desde local con el bucket por defecto pisa el de QA (ver `apps/backend/README.md`).
- [ ] Definir quién prueba en celular real (Android o iPhone) y con qué dispositivos.

### Rama `fix/endpoints-get-id`

**Qué:** `GET /marcas/:id` y `GET /restaurantes/:id` incluyen relaciones que no existen en el schema (`items` en marca, `itemSucursal` en restaurante) y fallan en runtime. Se quitan.

- Cambios: se sacan las relaciones inexistentes y los `include` de detalle se exportan (`MARCA_DETAIL_INCLUDE`, `RESTAURANTE_DETAIL_INCLUDE`) para poder validarlos. No se reemplazan por `items`: los ítems se piden con `GET /items?restauranteId=`.
- Tests:
  - `includes-contract.spec.ts` (nuevo): valida los `include` de detalle contra el schema (`Prisma.dmmf`) y que el validador detecta el caso original.
  - `restaurante.service.spec.ts` (nuevo): `findOne` de OWNER de su marca, OWNER de otra marca, GERENTE asignado, GERENTE no asignado y restaurante inactivo.
  - `marca.service.spec.ts` (extendido): `findOne` pide el `include` de detalle y un GERENTE no tiene acceso.
- No cambia permisos, y no se agregan casos de ROOT (P8: solo los includes).
- Checklist:
  - [x] `GET /marcas/:id` y `GET /restaurantes/:id` con el OWNER del seed dan 200 y datos (verificado contra la base local: antes 500, ahora 200).
  - [x] Sin token 401 y mozo 403, igual que antes.
  - [x] OWNER de otra marca recibe 403 y GERENTE asignado ve su restaurante sin acceso a marcas (cubierto por tests unitarios; el seed no tiene GERENTE ni una segunda marca).
  - [ ] CI verde en el PR.

### Rama `feat/logo-direccion`

#### Fase 1.0: shell responsive de web-admin (aprobada en P1)

**Por qué:** la pantalla nueva vive dentro del layout de admin, que hoy tiene un sidebar fijo de 220 px (56 px colapsado) y ninguna media query. En un celular de 360 px, cualquier pantalla nueva queda inusable aunque sea responsive.

- Debajo de `md` (768 px): sidebar oculto por defecto, botón hamburguesa en la barra superior que abre un drawer con overlay, se cierra al navegar, contenido a ancho completo. El selector de marca y restaurante va dentro del drawer. En escritorio no cambia nada.
- Tests: hook de media query y apertura y cierre del drawer (Testing Library).
- Checklist: responsive estándar en 360, 390, 768 y 1280; navegar por todas las secciones del admin con el drawer; el estado abierto o cerrado en escritorio se mantiene.
- **Estado (2026-10-10): hecha.**
  - Implementado: `useMediaQuery`, sidebar que pasa a drawer debajo de 768 px (overlay, se cierra al navegar, con Escape y al agrandar la pantalla), botón de hamburguesa de 44 px, `100dvh` y áreas de toque de 44 px en el drawer. En escritorio no cambia nada y el estado colapsado se sigue guardando. Se sumó Testing Library a web-admin (D13).
  - Tests: `useMediaQuery.spec` (5) y `AdminLayout.spec` (11): apertura y cierre del drawer, navegación, Escape, cambio de ancho y estado guardado en escritorio.
  - [x] Verificado con Playwright en Edge a 360, 768 y 1280 px (capturas y chequeo de scroll horizontal): sin desborde.
  - [ ] Pendiente de prueba manual: 390 px y recorrer todas las secciones existentes del admin con el drawer. Esas pantallas no se rediseñaron (P2) y algunas siguen estrechas en 360 px.

#### Fase 1: logo y dirección

- **BD:** `logo_url` en `marca` y `restaurante`.
- **Backend:**
  - Endpoints de logo (sección 4.2) reutilizando `StorageService`. Bucket por variable de entorno, path `marcas/<id>` y `restaurantes/<id>`, validación de tipo y tamaño (D3).
  - `PATCH /restaurantes/:id`: `direccion` solo OWNER, con trim, no vacía y máximo 200 caracteres. `CreateRestauranteDto.direccion` pasa a obligatoria (D2).
  - Chequeo de pertenencia sin ROOT (2.1).
- **Tipos:** `logoUrl` en `Marca` y `Restaurante`. Se saca `qrBaseUrl`.
- **web-admin:** pantalla "Marca y sucursales" (`/admin/marca`, solo OWNER, con ítem en el menú lateral y `RoleGuard`).
  - Logo de la marca: subir y quitar.
  - Por sucursal: logo propio (si no tiene, se avisa que usa el de la marca) y dirección editable.
  - Celular: una card por sucursal apilada. Escritorio: grilla de 2 columnas.
- **Seed:** un GERENTE asignado al restaurante del seed, una segunda marca con su OWNER y un restaurante sin logo, y direcciones.
- **Tests:**
  - Backend: `marca.service.spec` (logo: OWNER propio ok, OWNER de otra marca 403, GERENTE 403, ROOT 403) y `restaurante.service.spec` nuevo (dirección: OWNER ok, GERENTE 403, OWNER de otra marca 403, ROOT 403; logo).
  - Frontend: `RoleGuard` de la pantalla (OWNER entra, GERENTE y ROOT no), validación de archivo (tipo y tamaño) y fixtures de `contextStore.spec` con `logoUrl`.
- **Checklist:**
  - [x] OWNER sube, cambia y quita logo de marca y de restaurante. Verificado contra el backend real y la base local con un Storage simulado (63 verificaciones por API, incluidos el 413 de más de 2 MB y los 403 de ROOT, GERENTE y OWNER de otra marca) y desde la pantalla con Playwright. Después se probó contra el Supabase real (bucket `logos-dev` del proyecto de QA, al que apunta el `.env` local) y funcionó.
  - [x] Un restaurante sin logo propio usa el de la marca: la API devuelve el `logoUrl` propio de cada restaurante y el de la marca (en `marca`), y la pantalla de admin muestra el heredado. La resolución final (restaurante → marca → MenYu) la hacen Discovery (Fase 5) y el header del menú (Fase 7).
  - [x] OWNER guarda la dirección. GERENTE y ROOT reciben 403 por API y no ven la pantalla ni el ítem del menú.
  - [x] Subir un logo nuevo se refleja sin recargar con Ctrl+F5 (`?v=`): comprobado en el navegador con un Storage que sirve el archivo con caché de 1 hora; la URL cambia y la pantalla muestra el logo nuevo.
  - [x] Archivo inválido (SVG, PDF, más de 2 MB) muestra un error claro, en el cliente antes de subir y en el servidor.
  - [x] Responsive estándar de la pantalla nueva a 360, 768 y 1280 px: sin scroll horizontal y con todos los controles de al menos 44 px.
  - [ ] Subir un archivo desde un celular real (galería o cámara).
  - [x] Crear el bucket `logos-dev` en Supabase y definir `SUPABASE_LOGOS_BUCKET=logos-dev` en el `.env` local antes de probar subidas desde local. `logos-dev` está en el proyecto de QA (staging), que es el que usa el `.env` local.
  - [ ] CI verde en el PR.
- **Estado (2026-10-10): hecha** (a la espera de los tres pendientes de arriba).
  - Implementado:
    - **BD:** migración `add_logo_url_marca_restaurante`.
    - **Backend:** `LogosService`, `storage/logo-upload.ts` (interceptor y validación del archivo), `common/assert-owner-access.ts` (OWNER de la marca, sin ROOT), `POST` y `DELETE` en `/marcas/:id/logo` y `/restaurantes/:id/logo`, regla de la dirección en `PATCH /restaurantes/:id` y `direccion` obligatoria en `CreateRestauranteDto`.
    - **Tipos:** `logoUrl` en `Marca` y `Restaurante`, `LogoResponse`, y `direccion` obligatoria al crear. Se sacó `qrBaseUrl`.
    - **web-admin:** `/admin/marca` ("Marca y sucursales", solo OWNER) con `RoleGuard` (extraído a `components/RoleGuard.tsx`), ítem "Marca y sucursales" en el menú del OWNER y validación del archivo en el cliente (`utils/logo.ts`).
    - **Seed:** `gerente@menyu.com`, "Marca Seed 2" con `owner2@menyu.com`, "Restaurante Seed 2" con una mesa (PIN 9995) y direcciones.
    - **Documentación:** `doc.md`, `apps/backend/README.md`, `apps/backend/.env.example` y `Documentacion/datos-de-prueba-local.md`.
  - Decisiones de implementación:
    - El tipo de archivo se valida por la firma (magic number) del contenido, con un detector propio. No se usa `FileTypeValidator` de Nest porque depende de `file-type` (ESM) y no corre bajo Jest. Además, el tipo que declara el cliente tiene que coincidir con el contenido.
    - Multer y `MaxFileSizeValidator` rechazan los archivos que *llegan* al límite, así que ambos se configuran con 2 MB + 1 byte: uno de exactamente 2 MB es válido y uno de 2 MB + 1 byte da 413.
    - En tablet (768 a 1279 px) cada sucursal ocupa una columna porque el menú lateral deja poco ancho: las dos columnas empiezan en 1280 px.
  - Tests: api 277 (15 suites) y web-admin 114 (9 archivos), todos en verde, con `typecheck` y `lint` limpios. Nuevos en backend: `assert-owner-access`, `logos.service`, `logo-upload`, `logo-endpoints` (supertest con el `RolesGuard` real: ROOT, GERENTE y sin sesión), `direccion.dto.spec` (trim, no vacía, 200 caracteres y que `null` no pase en el `PATCH`), `marca.service` y `restaurante.service`. Nuevos en web-admin: `logo`, `RoleGuard`, rutas de `App` (ROOT y GERENTE no entran a `/admin/marca`), `LogoUploader`, `DireccionField`, `MarcaPage` y los casos de `AdminLayout`.

### Rama `feat/descuentos`

#### Fase 2: núcleo (BD, API, tipos y cobro)

- **BD:** `item_menu.precio_descuento INTEGER NULL` y el CHECK. Seed con un par de descuentos de ejemplo.
- **Backend:**
  - Util puro `descuento.util.ts` con las fórmulas y validaciones (4.3).
  - `PUT` y `DELETE /items/:id/descuento` con permisos sin ROOT (2.1) y `menu:updated` por socket.
  - `ItemsService.update` aplica D4 al cambiar `precioBase`.
  - `serializeItem` y `MenuService` devuelven `precioDescuento`, `porcentajeDescuento` y `precioVigente`, y `GET /menu/:id` suma `descuentos[]` (solo disponibles, mismo orden que Recomendaciones).
  - Los tres cálculos de cobro usan `precioVigente`.
- **Tipos:** ver 4.4.
- **Tests:**
  - `descuento.util.spec`: tabla de redondeo y bordes (1%, 99%, precio que no cambia al redondear, base 0, 100%).
  - `items.service.spec` nuevo: OWNER y GERENTE asignado ok, GERENTE de otro restaurante 403, OWNER de otra marca 403, ROOT 403, modo precio y modo porcentaje, ambos a la vez (400), quitar, cambio de `precioBase` (D4) y `menu:updated`.
  - `menu.service.spec` extendido: `descuentos[]`, ítems no disponibles, % derivado, números y no strings.
  - `orders.service.spec` extendido: descuento más extra a precio normal; sin descuento igual que hoy.
  - `pedidos.service.spec` extendido: `confirmar` y `crearStaff` con y sin descuento.
- **Checklist (Swagger o curl contra la base local):**
  - [x] Poner descuento por precio y por %; el % y el precio derivados coinciden con la tabla.
  - [x] `GET /menu/:id` muestra el descuento y `descuentos[]`.
  - [x] Crear un pedido: `precioUnitario` = precio con descuento + extras a precio normal.
  - [x] Cambiar el precio base con descuento activo respeta D4.
  - [x] ROOT recibe 403.
- **Estado (2026-10-13): hecha.**
  - Implementado:
    - **BD:** migración `add_precio_descuento_item_menu`: columna `precio_descuento INTEGER NULL` y el CHECK `item_menu_precio_descuento_check`, editado a mano sobre la migración generada con `--create-only`. Seed: Milanesa Napo ($4200 → $3360, 20%) y Cerveza Artesanal ($2600 → $1950, 25%). El seed solo las carga si el ítem no tiene descuento, así que volver a correrlo no pisa uno cargado a mano.
    - **Backend:** `items/descuento.util.ts` (fórmulas en centavos enteros, validaciones y `derivarDescuento`); `PUT` y `DELETE /items/:id/descuento` (el DTO exige exactamente uno de `precioDescuento` o `porcentaje`); D4 en `ItemsService.update`; `serializeItem` y `MenuService` con los tres campos derivados, y `descuentos[]` en el menú público (solo ítems disponibles, ordenados por categoría y nombre, con los mismos filtros que el resto del menú); los tres cálculos de cobro con `precioVigente`; `menu:updated` por socket al poner, cambiar o sacar un descuento.
    - **Permisos:** `assertOwnerOGerenteDeRestaurante` en `common/assert-owner-access.ts` (OWNER de la marca o GERENTE asignado, sin ROOT). En los endpoints, `@Roles(OWNER, GERENTE)` a nivel de método pisa el `@Roles` de la clase, que incluye a ROOT.
    - **Tipos:** `precioDescuento`, `porcentajeDescuento` y `precioVigente` en `ItemMenu` y `MenuPublicoItem`, `MenuPublico.descuentos` y `UpdateItemDescuentoRequest`.
    - **Documentación:** `doc.md`, `apps/backend/README.md` y `Documentacion/datos-de-prueba-local.md`.
  - Decisiones de implementación:
    - `DELETE` es idempotente: sacar un descuento que no existe devuelve el ítem tal cual (200) y no avisa por socket.
    - D4 se extiende: además de rechazar un precio base menor o igual al precio con descuento, rechaza el que dejaría el porcentaje fuera de 1–99 (por ejemplo, una suba grande que baje el descuento a menos de 1%). Es el mismo 400 y no se cambia nada.
    - Un descuento guardado que no sea válido contra el precio base (no debería pasar, por el CHECK y por D4) se ignora: el ítem se muestra y se cobra a precio base.
    - Precios y porcentajes salen siempre como números, no como strings de Decimal.
  - Tests: api 472 (20 suites), todos en verde, con `typecheck` y `lint` limpios. Nuevos: `descuento.util.spec` (tabla de redondeo y bordes), `items.service.spec` y `descuento-endpoints.spec` (supertest con el `RolesGuard` real: OWNER y GERENTE pasan, ROOT y mozo reciben 403, sin sesión 401, y validación del body). Extendidos: `menu.service.spec`, `orders.service.spec`, `pedidos.service.spec` y `assert-owner-access.spec`.
  - Verificado con un script e2e local contra el backend real y la base local (no está en CI): 72 verificaciones, incluidos permisos, D4, el cobro de un pedido real y el aviso `menu:updated` por socket.

#### Fase 3: carga de descuentos en web-admin

- En cada fila de la lista del menú (`AdminMenuPage`): botón "Descuento" que abre un modal con dos campos enlazados (precio nuevo ↔ %), vista previa y "Quitar descuento". La fila muestra precio tachado, precio vigente y un chip "-X%". Aviso en `ItemFormModal` al editar el precio base con descuento activo.
- OWNER y GERENTE ven el botón. ROOT no.
- `api.ts` y `menuStore`: `setDescuento` y `quitarDescuento`.
- **Tests:** helper de vista previa (mismos vectores que el util del backend), `menuStore` (actualiza el ítem o propaga el error) y el modal con Testing Library (los dos modos, bordes y el botón no visible para ROOT).
- **Checklist:**
  - [x] Como OWNER y como GERENTE (este solo ve sus restaurantes asignados). En el navegador el botón "Descuento" aparece para OWNER y GERENTE y no para ROOT; por API, un GERENTE de otro restaurante recibe 403.
  - [x] Cargar por precio y por %, con redondeo visible en la vista previa.
  - [x] Quitar el descuento.
  - [x] Responsive estándar: el modal y la fila a 360 px (la fila no desborda y los botones se tocan bien). Verificado con Playwright en Edge a 360, 768 y 1280 px: sin scroll horizontal y, en celular, con todos los controles de al menos 44 px.
  - [ ] Una pasada en un celular real (sección 8).
- **Estado (2026-10-13): hecha.**
  - Implementado (web-admin):
    - `utils/descuento.ts`: precio ↔ % para la vista previa en vivo, con los mismos casos que el util del backend, y `motivoPrecioBaseIncompatible` (mismo criterio que D4).
    - `api.items.setDescuento` y `quitarDescuento`, y las acciones del `menuStore`.
    - `DescuentoModal`: dos campos enlazados (precio ↔ %), vista previa con aviso de redondeo y "Quitar descuento".
    - `ItemRow`: la fila de la lista, extraída de `AdminMenuPage` junto con `ToggleSwitch`. Muestra precio tachado, precio vigente, chip "-X%" y el botón "Descuento" (solo OWNER y GERENTE), con áreas de toque de 44 px en celular.
    - `AvisoPrecioConDescuento` en `ItemFormModal`; el formulario no deja guardar un precio base que invalide el descuento activo.
  - Tests: web-admin sube de 114 a 281 con esta fase (293 con la Fase 4). Nuevos: `descuento.spec` (81: los mismos vectores que el backend), `DescuentoModal.spec` (37), `ItemRow.spec` (16), `AdminMenuPage.spec` (15: botón según rol, modal, tachado y 360 px), `AvisoPrecioConDescuento.spec` (11) y `menuStore.spec` (7).

#### Fase 4: visualización (web-cliente, web-staff y Toma de pedidos de admin)

- **`@menyu/ui`:** `DescuentoBadge` y `PrecioConDescuento`.
- **web-cliente:**
  - Sección "Descuentos" con el mismo estilo, chip y scroll-spy que Recomendaciones, primera en el orden (D7).
  - La tarjeta muestra el círculo naranja arriba a la derecha de la foto, el precio original tachado y chico, y el precio vigente.
  - `ItemDetailPage` usa `precioVigente + extras`.
  - El carrito (guardado en localStorage) se **reprecia** al abrirlo y ante `menu:updated`; si no, mostraría un total distinto del que cobra el servidor.
  - `getItemById` también busca en descuentos y recomendados (hoy un ítem sin categoría no abre su detalle).
- **web-staff y web-admin (Toma de pedidos):** cálculo con `precioVigente` y tachado más badge (D6).
- **Tests:** `publicMenuStore.getItemById`, util de repricing del carrito, `calcPrecio` de staff y de admin, y la tarjeta con y sin descuento (Testing Library).
- **Checklist:**
  - [x] Con el menú abierto en el cliente, poner o sacar un descuento en admin y ver el cambio (socket): la tarjeta aparece y desaparece sin recargar.
  - [x] Pedir un ítem con descuento y un extra: coinciden el total del carrito, el de Pagar y lo que guardó el servidor. "Mis pedidos" no muestra importes.
  - [x] Un descuento sacado con el ítem ya en el carrito: el carrito se corrige y avisa, también en vivo con el carrito abierto.
  - [x] Toma de pedidos de mozo y de gerente muestran y cobran el precio con descuento (el servidor guardó el precio con descuento más el extra en los dos casos).
  - [x] Responsive estándar de lo nuevo: tarjeta con badge y precio tachado a 360 px (el badge no tapa el nombre), grilla de 2 columnas en celular y 4 desde 768 px, filas de Toma de pedidos que caben en 360 px, modal de web-admin a pantalla completa en celular y barra inferior del detalle del plato con el precio entero (verificada entre 320 y 1280 px).
  - [ ] Una pasada en un celular real (sección 8).
- **Estado (2026-10-13): hecha.**
  - Implementado:
    - **`@menyu/ui`:** `DescuentoBadge`, `PrecioConDescuento`, los helpers `precioVigenteDe` y `tieneDescuento` (una sola definición para las tres apps) e `ItemMenuFila`, la fila de plato de la Toma de pedidos, que estaba copiada tres veces en web-staff y tres en web-admin.
    - **web-cliente:** sección "Descuentos" (primera, con su chip y el scroll-spy), `ItemCard` extraída de `ClienteMenuPage`, `ItemDetailPage` con `precioVigente + extras` y el círculo y el tachado, `utils/repreciarCarrito.ts` y `carritoStore` (`repreciar` y `avisoPrecios`), `publicMenuStore` (reprecia el carrito en cada `fetchMenu`, que también corre ante `menu:updated`; `getItemById` busca en categorías, recomendados y descuentos) y `CarritoPage` (pide el menú al abrirse y avisa si cambió algún precio).
    - **web-staff y web-admin (Toma de pedidos):** `ItemMenuFila` en las tres listas (recomendados y categorías), círculo y precio tachado en el modal, y el total parte de `precioVigente`. Los tipos locales ganan los tres campos como opcionales: si la API todavía no los manda, se cobra a precio base.
  - Decisiones de implementación:
    - El que cobra sigue siendo el backend: el carrito y la comanda muestran `precioVigente + extras` y el servidor recalcula con el mismo criterio.
    - El aviso de precios no se guarda en el navegador (solo los ítems del carrito): es de una sola vez.
    - Testing Library también en web-staff (D13 la preveía solo en web-cliente y web-admin), para probar la Toma de pedidos del mozo.
    - El modal de Toma de pedidos de web-admin ya no deja lugar al menú lateral debajo de 768 px: desde la Fase 1.0 el menú es un drawer y el modal quedaba angosto y corrido a la derecha.
    - La barra inferior de `ItemDetailPage` (cantidad y botón "Agregar al pedido") se apila cuando no entran en una fila (menos de ~460 px): a 360 px el rótulo se partía en tres líneas y el precio quedaba cortado, con o sin descuento. Se resolvió con `flex-wrap` y una base de 300 px para el botón. A 320 px el rótulo ocupa dos líneas, pero el precio se ve completo.
  - Tests: web-cliente sube de 22 a 113, web-staff de 18 a 28 y web-admin suma 12 (Toma de pedidos). Nuevos en web-cliente: `precio.spec`, `repreciarCarrito.spec`, `publicMenuStore.spec`, `ItemCard.spec`, `ClienteMenuPage.spec` (orden de secciones, buscador y chips), `ItemDetailPage.spec`, `CarritoPage.spec` y los casos de repricing de `carritoStore.spec`. Las cuentas de la Toma de pedidos (`calcPrecio`) se prueban por la pantalla (`TomaPedidosPage.spec` en web-staff y en web-admin): filas, modal, extras, cantidad y total de la comanda. Cada regla se verificó rompiéndola a propósito: los tests fallan.
  - Verificado en el navegador (Edge, backend y base locales): 69 verificaciones sobre web-cliente a 360, 768 y 1280 px (orden de secciones, círculos, tachado, columnas, detalle con extra, carrito, aviso en vivo por socket, cobro, Pagar), y Toma de pedidos de mozo y de gerente (filas, modal, total y el precio que guarda el servidor al enviar a cocina). Después, 24 verificaciones más de la barra inferior del detalle a 320, 360, 390, 412, 430, 480, 500, 768 y 1280 px: el precio queda completo dentro del botón y del viewport, también con un total largo ($61200.00).
  - Hallazgos preexistentes que no se tocaron (fuera de lo que modifica este plan, P2):
    - web-staff a 360 px: el bloque de usuario del `PageHeader` hace que la página mida unos 435 px, y los modales (incluido el de Toma de pedidos) quedan cortados a la derecha.
    - web-admin, Toma de pedidos a 360 px: la grilla de mesas se pasa del ancho.
    - web-cliente, scroll-spy: en pantallas altas (1280 × 800) el chip activo al abrir el menú es el de la categoría siguiente y no el de Descuentos, porque gana la última sección visible.

### Rama `feat/discovery`

#### Fase 5: Discovery, API pública

- **BD:** migración con `CREATE EXTENSION IF NOT EXISTS unaccent` (D9).
- **Backend:** módulo `discovery/` (module, controller y service) público, con las reglas de 4.2.
  - `GET /discovery`: restaurantes (id, nombre, dirección, `logoUrl` = restaurante ?? marca, marca, cantidad de ofertas) y ofertas (ítem con precios y %, más el restaurante), ordenadas por % mayor, hasta 50 y 30.
  - `GET /discovery/buscar?q=`: `{ ofertas, restaurantes, restaurantesConPlatos }`, en el orden en que se muestran (D29). Los restaurantes de los dos grupos tienen la misma forma que en el listado (sin nombres de platos ni cantidades). Consulta con `$queryRaw` y `unaccent(...)`, escapando `%` y `_` del texto buscado.
  - `GET /discovery/restaurantes/:id` (D24): `{ restaurante, ofertas }` de un restaurante visible, para la pantalla del restaurante.
- **Tipos:** los de Discovery (4.4).
- **Tests:** `discovery.service.spec` (fallback de logo, solo activos, solo disponibles, tres grupos de búsqueda, `q` corta, límites, escape de comodines y que el `select` no incluya campos sensibles) y un e2e local de búsqueda con acentos ("cafe" encuentra "Café") contra la base local (no corre en CI).
- **Checklist (contra la base local):**
  - [x] Listado: restaurantes activos de marcas activas con logo (el propio o el de la marca), dirección (o `null`) y cantidad de ofertas.
  - [x] Ofertas ordenadas por porcentaje mayor, solo platos disponibles, con precios y porcentaje ya calculados.
  - [x] Búsqueda con y sin acentos ("cafe" encuentra "Café", "nandu" y "ñandú" encuentran "Ñandú"), con mayúsculas y por nombre de marca.
  - [x] `q` de 1 letra, vacía, de solo espacios, de más de 60 caracteres o repetida: 400.
  - [x] `q` con `%`, `_` o una barra invertida: se busca como texto y no trae todo. Un intento de inyección SQL no hace nada.
  - [ ] En QA (staging), después de mergear: la migración crea la extensión y `/api/discovery/buscar?q=cafe` responde.
- **Estado (2026-10-14): hecha.**
  - Implementado:
    - **BD:** migración `enable_unaccent` (`CREATE EXTENSION IF NOT EXISTS unaccent`), aplicada a la base local con `migrate deploy`.
    - **Backend:** módulo `discovery/` público (sin guards): `GET /api/discovery`, `GET /api/discovery/buscar?q=` y `GET /api/discovery/restaurantes/:id`. Primero consultas `$queryRaw` que devuelven solo ids (con `unaccent(...) ILIKE` en la búsqueda, solo activos y disponibles, con su orden y su tope) y después `findMany` con `select` explícito para armar los datos. El listado y el restaurante por id no usan `unaccent`: andan aunque la extensión falte.
    - **Tipos:** `DiscoveryRestaurante`, `DiscoveryOferta`, `DiscoveryResponse`, `DiscoveryRestauranteDetalle` y `DiscoveryBusquedaResponse` en `@menyu/types`.
    - **Documentación:** `doc.md` (sección Discovery) y `apps/backend/README.md`.
  - Decisiones de implementación:
    - `q` se recorta y tiene que tener de 2 a 60 caracteres (se cuentan caracteres, no unidades de UTF-16) y no puede llevar el carácter nulo; si no, 400 en lugar de una respuesta vacía. Los comodines `%` y `_` y la barra se escapan: el texto se busca tal cual.
    - Un restaurante aparece en un solo grupo: si coincide su nombre o el de su marca va en `restaurantes`; si no, y tiene algún plato disponible que coincide, en `restaurantesConPlatos`. Ese grupo no informa qué platos coincidieron ni cuántos (la consulta solo pregunta si existe alguno, con `EXISTS`): con muchos platos el resultado quedaría larguísimo y la pantalla no los muestra (D29).
    - Los grupos salen en el orden en que se muestran: ofertas, restaurantes y restaurantes con platos.
    - Restaurantes ordenados por nombre y ofertas por porcentaje mayor (desempate por nombre), con los topes de 50 y 30.
    - `GET /discovery/restaurantes/:id`: un id sin forma de UUID (o con el carácter nulo) responde 404, igual que un restaurante que no existe, no está activo o tiene la marca inactiva. Trae hasta 30 ofertas de ese restaurante por porcentaje mayor.
  - Tests: api 552 (22 suites), todos en verde, con `typecheck` limpio. Nuevos: `discovery.service.spec` (logo restaurante → marca → `null`, solo activos y disponibles, topes, `select` sin datos sensibles, los tres grupos, el restaurante por id, el SQL de cada consulta y el escape de comodines) y `discovery-endpoints.spec` (supertest con el `ValidationPipe` real: endpoints públicos, validación de `q` y de `:id`). Cada regla se verificó rompiéndola a propósito (45 mutaciones): los tests fallan.
  - Verificado con un script e2e local contra un backend temporal y la base local (no está en CI): 88 verificaciones con filas propias (acentos, restaurante inactivo, marca inactiva, plato no disponible y un token de Mercado Pago que no tiene que filtrarse). Las filas se borran al terminar y la base queda con los mismos conteos.

#### Fase 6: Discovery como home, pantalla del restaurante y entrada a mesa

**Mockups primero (D14):** HTML estático (en `docs/mockups/`) con la estética de 2.2 y el layout mobile primero. Se aprueban antes de escribir la implementación.

- Pantallas: Discovery (home con ofertas y lista), Discovery buscando (los tres grupos), estados cargando, vacío y error, pantalla del restaurante, ingreso a mesa (QR, con el PIN escondido) y escáner de QR (permiso, errores y PIN), más el header.
- Cada pantalla a 360, 768 y 1280 px (el header y las de celular también a 320 y 390).
- Casos límite: restaurante sin logo, nombre y dirección largos, sin ofertas, muchas ofertas, sin dirección cargada.
- **Estado de los mockups (2026-10-14): aprobados, con los ajustes de la revisión.** Abrir `docs/mockups/index.html` en el navegador (ver `docs/mockups/README.md`): 44 vistas a 320, 360, 390, 768 y 1280 px (más "los tres a la vez"), con los estados cargando, vacío, error y sin resultados, los casos límite y los estados del escáner. El buscador del mockup funciona con datos de ejemplo. Verificado en Edge a 320, 360, 390, 768, 1280 y 1920 px: sin scroll horizontal, controles nuevos y botones del header con área de toque de 44 px o más, y comparados lado a lado con `EntradaPage` e `IngresoManualPage`. Lo que se decidió al revisarlos (D23 a D27):
  - Atajo "Escanear el QR de mi mesa" en el home, debajo del buscador y centrado en celular.
  - Las ofertas del restaurante dentro de su pantalla, con `GET /discovery/restaurantes/:id` (hecho en la Fase 5).
  - Header en celular: el logo sin deformarse (hoy, a 360 px, pasa de 141 a 116 px de ancho), botones más chicos y con más aire; con sesión, saludo arriba y "Cerrar sesión" debajo, y el nombre entero (si no entra, pasa a la línea de abajo; D27).
  - Ingreso a mesa con el QR como única opción a la vista: el PIN queda detrás de "¿Pasó algo con tu cámara? Ingresá el PIN de tu mesa".
  - Escáner que pide permiso, anda en Chrome (Android) y Safari (iPhone) y, si el permiso se rechaza o la cámara no anda, muestra un mensaje claro, recomienda escanear con la cámara del celular y ofrece la opción del PIN.
  - Resultados de la búsqueda (D29): primero las ofertas que coinciden, después los restaurantes que coinciden por nombre y al final los restaurantes con platos que coinciden. Estos últimos se ven igual que en la lista general, sin los nombres de los platos ni la cantidad; la API ya no los devuelve.
  - Sin cambios: esqueletos de carga en lugar del `Spinner` (que es índigo), restaurantes de la A a la Z y ofertas por % mayor.

Implementación en commits, de a uno (varios archivos se tocan en más de un commit, así que se entrega un commit, se hace y recién ahí se sigue con el próximo):

1. **Refactor sin cambio visible (hecho):** extraer `QrScanner` y el hook `useEntrarAMesa` y usarlos en las tres pantallas de ingreso (`EntradaPage`, `IngresoManualPage` y `CheckInRedirectPage`). Test de regresión: anfitrión en modo seguro, código requerido y error.
2. **Escáner que anda en el celular (D26) (hecho):** respaldo con `jsqr` cuando no hay `BarcodeDetector` (Safari en iPhone), permiso de la cámara, estados de error con la recomendación de escanear con la cámara del celular y la opción del PIN, y cámara apagada al terminar. Tests con un `getUserMedia` y un lector simulados, y un QR de mesa real decodificado con `jsqr`. Dependencia nueva: `jsqr` (también cambia `pnpm-lock.yaml`). Va acompañado de dos commits chicos: el mockup de `/check-in` (D30, en `docs/mockups/`) y el servidor de desarrollo de web-cliente listo para probar con un túnel HTTPS (`server.allowedHosts` y proxy de `/api` y `/socket.io`; sección 8).
3. **`DiscoveryPage` en `/`** (reemplaza a `EntradaPage`):
   - Header: `AppHeader` con los cambios para celular (D27). **Ya está hecho** (2026-10-14, junto con el ajuste del logo y del nombre; ver el estado de más abajo).
   - Buscador en píldora con debounce.
   - Atajo "Escanear el QR de mi mesa" debajo del buscador, centrado (D23). Abre el escáner y, al leer el QR, la sesión.
   - Carrusel de ofertas con scroll horizontal contenido (celular).
   - Lista de restaurantes: 1 columna en celular, 2 en tablet, 3 en escritorio.
   - Resultados de búsqueda en tres grupos, en este orden: ofertas, restaurantes y restaurantes con platos que coinciden (estos con la misma tarjeta que la lista general) (D29).
   - Estados cargando, vacío y error.
   - Login: tras iniciar sesión vuelve a `/`. `discoveryStore` nuevo.
   - **Hecho (2026-10-14):** ver el estado del commit 3 más abajo.
4. **Pantalla del restaurante y ingreso a mesa:**
   - `/restaurante/:id` con "Ingresar a una mesa", las ofertas del restaurante y "Ver la carta" (este último oculto hasta la Fase 7). Carga sus datos con `GET /discovery/restaurantes/:id` (D24).
   - `/restaurante/:id/mesa` con "Escanear QR" como única opción a la vista y, debajo, el texto chico "¿Pasó algo con tu cámara? Ingresá el PIN de tu mesa" que abre el campo del PIN (D25). Sin marca ni sucursal.
   - Backend chico: `POST /sessions/open` valida `restauranteId` junto con `tableCode` (D11). De paso, resuelve la mesa antes de crear al cliente invitado: hoy cada PIN o QR equivocado deja creado un cliente "Invitado" (`resolveClienteId` corre antes que `resolveMesa`).
   - `/ingresar-pin` redirige a `/` (D12).
5. **Pantallas de `/check-in` (D30) (hecho):** "Abriendo tu mesa…" mientras abre la sesión (hoy queda en blanco) y, si falla, un aviso con la opción del PIN (hoy vuelve a `/` sin decir nada): si el QR no abre una mesa, la salida principal es el PIN del restaurante del link (lleva a `/restaurante/:id/mesa` con el campo del PIN abierto); si no hubo conexión, "Reintentar". Va después del commit 4 porque la opción del PIN lleva a la pantalla de ingreso a mesa que se crea ahí.
- **Tests:** `discoveryStore` (carga, búsqueda, ignorar respuestas viejas), `useEntrarAMesa`, `QrScanner` (lector nativo, respaldo, permiso rechazado, sin cámara y sin soporte), `AppHeader` (nombre entero, sin adivinar apellidos, y sin y con sesión), `DiscoveryPage`, pantalla del restaurante y de ingreso a mesa (el PIN no se ve hasta tocar el texto; Testing Library), `sessions.service.spec` (QR con restaurante distinto da error; sin `restauranteId` igual que hoy; no se crea el invitado si la mesa no existe).
- **Checklist:**
  - [x] Home → buscar → restaurante → QR → "Elegir nombre" → menú de mesa. Con el backend real, por tramos y con la cámara falsa (2026-10-14).
  - [x] Home → "Escanear el QR de mi mesa" → QR → "Elegir nombre" → menú de mesa. Con el backend real y la cámara falsa (2026-10-14).
  - [x] Ingreso con PIN desde el texto chico: solo después de tocarlo aparece el campo.
  - [x] QR o PIN de otro restaurante: mensaje claro y no se crea la sesión. Con el backend real: 409 con el QR y 404 con el PIN, sin sesión y sin "Invitado" de más (2026-10-14).
  - [x] Modo seguro: anfitrión (muestra el código) y comensal (pide el código). Con el backend real (2026-10-14).
  - [x] Login desde Discovery y vuelta a `/`. Con el backend real (2026-10-14).
  - [x] Tocar una oferta abre la pantalla de su restaurante (D8). Entrar por el link de un restaurante y recargar la pantalla también funciona (D24). Con el backend real (2026-10-14).
  - [x] Header a 320, 360 y 390 px, sin y con sesión (nombre largo: entero, en dos líneas), sin el logo deformado, en todas las pantallas que lo usan.
  - [ ] Responsive estándar en las pantallas nuevas, con el teclado abierto en el buscador y en el PIN.
  - [ ] Escáner en un celular real con Chrome (Android): pide el permiso, lee el QR; al rechazar el permiso, mensaje claro, recomendación de la cámara del celular y PIN.
  - [ ] Escáner en un celular real con Safari (iPhone): lo mismo, con el lector propio (requiere HTTPS, sección 8).
  - [ ] Escanear el QR de una mesa con la cámara del celular (la app de cámara, no la web) abre la mesa por `/check-in`, en Android y en iPhone: es la salida que se recomienda cuando falla el escáner de la web.
  - [x] `/check-in`: "Abriendo tu mesa…" mientras abre; con un QR que no existe, el aviso con el PIN (sin volver al inicio en silencio); sin conexión, "Reintentar". Con el backend real, el 404 y el "Reintentar" (2026-10-14); "Abriendo tu mesa…" se vio con la API simulada.
- **Estado (2026-10-14): hecha** (los cinco commits están hechos y probados con el backend real; falta la pasada en celulares reales).
  - **Commit 1 (refactor):** las tres pantallas usan `useEntrarAMesa` y `QrScanner`; `/check-in` abre la sesión una sola vez aunque StrictMode corra el efecto dos veces; los avisos de error de `EntradaPage` e `IngresoManualPage` ya no muestran, al segundo intento, el del intento anterior. Tests: web-cliente 158 (antes 113); 50 mutaciones detectadas; pasada real en Edge contra el Vite y el backend locales (16 verificaciones con las mesas 100 y 101 del seed, base local sin cambios).
  - **Commit 2 (escáner):** `QrScanner` con los cinco estados del mockup y `utils/lectorQr.ts` (lector nativo o `jsqr`). Tests: web-cliente 207; el lector decodifica un QR de mesa real (versión 7, 45 × 45) con la librería real, también con 4 píxeles por módulo; 53 mutaciones detectadas. Pasada real en Edge con una cámara falsa que muestra el QR de la mesa 101 (40 verificaciones): sin `BarcodeDetector` (como Safari) lee con `jsqr` y abre la mesa en medio segundo, el chunk de `jsqr` se descarga solo si hace falta, la cámara queda apagada al leer y al cancelar, con lector nativo no se descarga `jsqr`, y los estados de permiso rechazado, cámara que no responde y navegador sin cámara se ven como el mockup a 320, 360 y 390 px, sin scroll horizontal y con botones de 44 px o más. También se probó el bundle de producción (`vite build`) y la configuración del túnel (proxy de `/api`, `/socket.io` con WebSocket y hosts de `trycloudflare.com`). **Falta la pasada en celulares reales** (Android con cable e iPhone con túnel; sección 8).
  - **Commit 3 (home de Discovery) hecho (2026-10-14):** `DiscoveryPage` en `/` reemplaza a `EntradaPage` (se borró con su spec). `api.discovery` (`listar` y `buscar`; el de restaurante por id va con el commit 4), `discoveryStore` (listado que conserva lo de antes si se actualiza o falla; búsqueda con número de pedido: una respuesta que llega después de otra más nueva, o de borrar la búsqueda, se descarta; 2 caracteres como mínimo contados como caracteres y no como unidades de UTF-16), componentes en `components/discovery/` (`LogoRestaurante` con iniciales si falta o falla el logo, `TarjetaRestaurante`, `TarjetaOferta` —la del menú con el restaurante y sin "+"—, `CarruselOfertas` con flechas solo desde 1024 px, `BloqueEstado`, `EsqueletosHome`), `TituloSeccion` y el color `error` en `theme.ts`. Buscador con espera de 300 ms (Enter busca enseguida), grupos de resultados en el orden de D29, "Buscando…" con los resultados anteriores atenuados, estados cargando, vacío, sin ofertas y error de carga y de búsqueda. El atajo "Escanear el QR de mi mesa" abre el escáner con la alternativa "Elegir mi restaurante" (cierra el escáner, borra la búsqueda y sube a la lista); si el QR no abre una mesa avisa debajo del atajo (ese aviso no estaba en el mockup). Tocar un restaurante o una oferta va a `/restaurante/:id`, que se crea en el commit 4: hasta entonces vuelve a `/`. `/ingresar-pin` sigue andando hasta el commit 4 pero ya no hay link a esa pantalla desde la home. Tests: web-cliente 307 (store 22, tarjetas y carrusel 21, pantalla 28); 48 mutaciones detectadas. Pasada en Edge contra el Vite local con la API simulada con los datos del mockup, a 360, 768 y 1280 px y en 14 escenarios (normal, con sesión, sin ofertas, vacío, muchas, casos límite, cargando, error, y cuatro búsquedas): sin desbordes, parecido al mockup, y el atajo leyendo el QR de la mesa 101 con la cámara falsa. Con el backend real se probó después (2026-10-14, ver la Fase 8).
  - **Commit 4 (restaurante e ingreso a mesa) hecho (2026-10-14):** `/restaurante/:restauranteId` (`RestaurantePage`: logo, nombre, dirección o "Dirección no cargada", "Ingresar a una mesa" y las ofertas del restaurante sin link y sin repetir el nombre; "Ver la carta" queda para la Fase 7) y `/restaurante/:restauranteId/mesa` (`IngresoMesaPage`: "Ingresando a …", "Escanear QR" como único botón y el PIN detrás de "¿Pasó algo con tu cámara? Ingresá el PIN de tu mesa"; `?pin` lo abre y `?pin=qr` lo abre con el aviso de que el QR no abrió la mesa). Se entra por un link o se recarga: el restaurante se pide por id. `/ingresar-pin` redirige a `/` reemplazando la entrada del historial (D12) y se borró `IngresoManualPage` con su spec. **Backend:** `POST /sessions/open` con `tableCode` y `restauranteId` responde 409 "Ese QR no es de este restaurante" si la mesa es de otro restaurante (D11), y resuelve la mesa antes de crear al cliente "Invitado" (un QR o PIN equivocado ya no deja un cliente de más). Mensajes de la pantalla según el código HTTP (`sessionStore.errorStatus` → `alFallar({ status })`): 409 "Ese QR no es de {restaurante}. Escaneá el QR de una de sus mesas.", otro error con el QR "No pudimos abrir tu mesa con ese QR. Probá de nuevo o ingresá el PIN de tu mesa.", PIN "PIN incorrecto o mesa no encontrada en {restaurante}…" y sin conexión "No pudimos conectarnos…" (no se culpa al QR ni al PIN). Tests: web-cliente 389 (restaurante 16, ingreso a mesa 30, `discoveryStore` 36, `sessionStore` 15, `useEntrarAMesa` 20, rutas de `App` 5, `api` 8, tarjetas 23); api 573 (23 suites; `sessions.service.spec` 42 y el nuevo `sessions-open-endpoint.spec` con el `ValidationPipe` real); typecheck y lint limpios; 49 mutaciones detectadas (cada una la caza el test que corresponde). Pasada en Edge contra el Vite local con la API simulada como el backend nuevo y la cámara falsa mostrando el QR de la mesa 101 (26 verificaciones): el QR de otro restaurante muestra el aviso con el nombre, cierra el escáner y no abre sesión; el del restaurante correcto y el PIN correcto abren la sesión; PIN solo con números, vacío no llama al servidor; `?pin` y `?pin=qr`; `/ingresar-pin` → `/` sin dejar entrada en el historial; ofertas del home → restaurante, recarga, restaurante inexistente y cámara sin permiso → PIN; además 22 escenarios a 360, 768 y 1280 px sin desbordes y parecidos al mockup (sin "Ver la carta", a propósito). El 409 y el orden invitado/mesa se probaron después contra el backend y la base reales (2026-10-14, ver la Fase 8).
  - **Commit 5 (pantallas de `/check-in`, D30) hecho (2026-10-14):** `CheckInRedirectPage` ya no queda en blanco ni vuelve a `/` en silencio. Mientras abre muestra "Abriendo tu mesa…" (`AbriendoMesaScreen`, con el spinner de `Girando`, que se sacó de `DiscoveryPage` para compartirlo) y, si no se puede, `CheckInFalloScreen` (en `components/CheckInScreens.tsx`, sobre la misma tarjeta azul de `SesionSeguraModals`, cuyo `Shell` ahora recibe `subtitulo`; las pantallas del modo seguro conservan el suyo): **el servidor respondió que esa mesa no existe** (404, 400, 409) o **el link no trae `tableCode`** (se avisa sin llamar al servidor) → "No pudimos abrir tu mesa" con el PIN como botón principal (lleva a `/restaurante/:restaurantId/mesa?pin=qr`: campo del PIN abierto y aviso de que el QR no abrió la mesa) y "Ir al inicio", sin "Reintentar" (daría lo mismo); **sin respuesta del servidor** (sin conexión, 5xx o 429) → "No pudimos conectarnos" con "Reintentar" como botón principal (vuelve a abrir con el mismo código, mostrando "Abriendo tu mesa…"), el PIN como segunda salida y "Ir al inicio". Si el link no trae `restaurantId` no se sabe de quién es la mesa: en lugar del PIN se ofrece "Elegir mi restaurante" (lleva a `/`) con su explicación. Los links reemplazan la entrada del historial, así "atrás" no vuelve a abrir el link del QR. Con una sesión ya abierta sigue yendo al menú sin pintar el error. Usa `errorStatus` del commit 4. Tests: web-cliente 413 (24 archivos; `CheckInRedirectPage` 32); 35 mutaciones detectadas (3 de ellas obligaron a sumar tests: el color del botón principal, el subtítulo vacío y no pintar el error con una sesión abierta); typecheck y lint limpios. Pasada en Edge contra el Vite local con la API simulada (14 verificaciones: abriendo, QR inexistente → PIN → mesa abierta, "atrás", sin conexión → Reintentar → abre, 500, link sin código y sin restaurante, modo seguro) y las 7 pantallas a 320, 360 y 768 px comparadas con `docs/mockups/checkin.html`: sin desbordes, botones de 44 px o más y parecidas al mockup. Al llegar con `?pin=qr` el campo del PIN no toma el foco solo (igual que el mockup). Con el backend real se probó después (2026-10-14, ver la Fase 8); **falta la pasada en celulares reales.**
  - **Ajustes pedidos al revisar el commit 2 (2026-10-14):**
    - **Logo real (D31):** `LogoMenYuOscuro` en `@menyu/ui` (recorta el aire transparente del PNG; recibe el alto de las letras; variante `soloU` para lugares angostos) reemplaza al logo armado con texto en la tarjeta del modo seguro de web-cliente (anfitrión, código de la mesa y la futura `/check-in`), el menú lateral de web-admin (abierto: logo completo; cerrado: solo la U con el tenedor), los tres headers de web-staff (`PageHeader`, `MozoPanel` y `SelectorPage`) y los mockups. Queda sin cambiar el "powered by" del drawer del menú (fondo claro; pasarlo a `logo.png` sumaría 1,5 MB al menú: queda para la Fase 7, con el logo liviano). Tests de `LogoMenYuOscuro` y de que la tarjeta lleve el logo real.
    - **Header con sesión (D27):** `AppHeader` hecho completo con Tailwind (logo de 28, 24 y 20 px de alto según el ancho y siempre con su proporción, botones chicos con área de toque de 44 px, saludo arriba y "Cerrar sesión" debajo en celular) y el nombre entero, sin primer nombre ni "...". Medido en Edge a 320, 360, 390, 768 y 1280 px con 5 nombres (sin sesión, corto, con apellido, largo y una palabra larguísima): sin desbordes, logo sin deformar, 60 px de alto (71 y 86 si el nombre ocupa dos o tres líneas) y área de toque de 44 px en todos los botones. `utils/jwt.ts` decodifica el token en UTF-8: antes los acentos salían rotos. El saludo del drawer del menú ("¡Hola, X!") sigue usando la primera palabra del nombre (no se tocó la regla, solo la decodificación). Tests: web-cliente pasa a 241 (`AppHeader` 15, `jwt` 9, `LogoMenYuOscuro` 8 y el saludo del drawer 2); web-staff (28) y web-admin (293) sin cambios; 22 mutaciones detectadas. Pasada en Edge de las pantallas reales (logo en el modo seguro, el menú lateral de admin y los tres headers de staff, con la API simulada porque Postgres estaba apagado). Pendiente de decidir: en el menú lateral cerrado de web-admin el botón de expandir se monta sobre el logo (ya pasaba con el cuadro naranja anterior; con el tenedor real se nota más).

#### Fase 7: carta en modo vista y logo en el header

- **Carta:**
  - Ruta `/restaurante/:id/carta`, fuera de los guards.
  - Se extraen de `ClienteMenuPage` los componentes comunes y se usa `modo`.
  - En `carta`: sin botón "+", sin carrito, sin "Mozo", sin pill de mesa, tarjetas no clickeables (sin detalle). Con buscador, dietas y secciones Descuentos, Recomendaciones y categorías.
  - Drawer en `carta`: Iniciar sesión, Crear cuenta e **Ingresar a una mesa como invitado** (QR o PIN, hacia `/restaurante/:id/mesa`). El login vuelve a la carta (`?volver=`).
  - Drawer en `mesa`: se mantienen las filas actuales (Etiquetar pedidos, Mis pedidos, Pagar la cuenta).
  - `publicMenuStore` indexado por `restauranteId`.
- **Logo en el header (ambos modos):**
  - `GET /menu/:id` devuelve `restaurante.logoUrl` ya resuelto (restaurante → marca → null).
  - El logo reemplaza a las iniciales y es ese mismo botón: al tocarlo abre el drawer, como hoy el botón de iniciales. Se conserva el indicador de hamburguesa que hoy tiene ese botón para que se entienda que abre un menú. Si no hay logo de restaurante ni de marca, se muestra el de MenYu (P5, confirmado viendo el header real).
  - El logo va dentro de un contenedor blanco redondeado con `object-fit: contain` (los logos de los restaurantes tienen colores arbitrarios y el de MenYu tiene el tenedor navy, que se perdería sobre el fondo navy).
  - Se agrega una versión liviana del logo de MenYu (el `logo.png` actual pesa 1,5 MB).
  - **Mockup y cambios pedidos al revisarlo (2026-10-14):** `docs/mockups/menu-header.html` (también en el visor, grupo "Header del menú"). Se pidió: (1) **mesa con código**: "Mesa N" y "PIN xxx" en sus mismos pills, **uno arriba del otro**, para que el nombre del restaurante gane lugar; sin código, solo el pill de la mesa como hoy; **"Mozo" no se achica** (se descartó la propuesta de dejarlo como campana sola); (2) **menú lateral** con el restaurante arriba (logo grande, nombre y **dirección** bien clara) y una **animación corta y suave al abrir en la que el logo se agranda junto con el nombre**, que se apaga con `prefers-reduced-motion`; (3) sin estar en una mesa (carta): iniciar sesión o registrarse, ingresar a la mesa o **volver al inicio de MenYU**; en la mesa, las filas de hoy; (4) con sesión iniciada, el **saludo con el nombre completo** reemplaza a iniciar sesión y registrarse; (5) **"Cerrar sesión" solo si no está en una mesa o si su mesa todavía no pidió nada** (decidido: cuenta cualquier pedido de la mesa que no esté anulado); (6) la carta no cambia (un solo scroll, el buscador solo filtra), y el header no puede quedar demasiado alto en el celular.
- **Tests (Testing Library):**
  - En `carta` no hay botón "+", ni carrito, ni navegación al detalle; sí hay badge y tachado.
  - El buscador filtra y el drawer ofrece las opciones.
  - La ruta no redirige a `/` sin sesión.
  - El store no mezcla restaurantes.
  - El header muestra restaurante, marca o MenYu según corresponda, y al tocar el logo se abre el drawer.
  - Regresión: el modo `mesa` se comporta igual que antes.
  - Backend: `menu.service.spec` con `restaurante.logoUrl` resuelto.
- **Checklist:**
  - [x] Sin sesión: abrir la carta, buscar, ver descuentos, tocar una tarjeta (no pasa nada). Con el backend real (2026-10-14).
  - [x] Drawer: iniciar sesión y volver a la carta; ingresar a una mesa como invitado. Con el backend real (2026-10-14).
  - [ ] Header con logo de restaurante, de marca y sin ninguno, en `mesa` y en `carta`. Con el backend real, en la carta: los tres; en la mesa: el de la marca (2026-10-14). Falta verlo con logos reales del Storage de staging.
  - [x] Cambiar entre la carta de dos restaurantes no mezcla menús. Con el backend real (2026-10-14).
  - [ ] Responsive estándar: carta y header (con logos anchos y altos) en todos los anchos.
- **Estado (2026-10-14): hecha** (commit 6, la carta, y commit 7, el logo en el header y el menú lateral; falta la pasada en celulares reales).
  - **Carta en modo vista (commit 6):** `/restaurante/:restauranteId/carta` (`CartaPage`) y el botón "Ver la carta" de la pantalla del restaurante; el menú de la mesa y la carta comparten `MenuView` (ver 4.6). Menú lateral de la carta, `?volver=` en el login (con `rutaInterna`) y `publicMenuStore` por restaurante, con el código HTTP del error. Antes de partir `ClienteMenuPage` se le sumaron 18 tests de caracterización del modo mesa (mozo, mesa y código, "+", carrito, menú lateral, dietas): pasaban contra el código viejo y siguen pasando. Tests: web-cliente 538 (28 archivos; `CartaPage` 29, `MenuDrawer` 19, `ClienteMenuPage` 38, `AuthPage` 14, `publicMenuStore` 25, `rutaInterna` 21 e `ItemCard` 15); 65 mutaciones (la comprobación dejó 11 sin matar: se sumaron tests para 7, 1 con el truco de mirar qué se pintó en el camino, y 3 eran capas repetidas de `rutaInterna`, de las que se sacó la repetida); typecheck y lint limpios. Pasada en Edge contra el Vite local con la API simulada (27 verificaciones): restaurante → "Ver la carta" → carta sin "+", carrito, mozo ni mesa; el descuento con su círculo y el precio tachado; tocar una tarjeta no hace nada; buscador, dietas y "sin resultados"; menú lateral con "Ingresar a una mesa" y "Volver al restaurante"; iniciar sesión desde la carta y volver a la carta (con el saludo); un `volver` a otro sitio se ignora; restaurante inexistente; de una carta a otra sin mezclar menús; y el menú de la mesa igual que antes (mozo, "Mesa 5", código, "+", carrito y filas del pedido). Restaurante y carta sin desbordes a 360, 768 y 1280 px, y la pantalla del restaurante con "Ver la carta" igual al mockup. **Decisiones chicas que conviene mirar:** la fila del menú lateral dice "Ingresar a una mesa" (el plan decía "como invitado") y se sumó "Volver al restaurante" (la carta no tenía cómo volver salvo con "atrás"); el menú lateral de la carta no usa el nombre del comensal de una mesa anterior. Sin cambios en el backend. Con el backend real se probó después (2026-10-14, ver la Fase 8); falta la pasada en celulares reales.
- **Header con logo y menú lateral nuevo (2026-10-14, commit 7), hecho:**
  - **Backend:** `GET /menu/:id` devuelve `restaurante.direccion` y `restaurante.logoUrl` ya resuelto (el propio del restaurante, si no el de su marca, si no `null`); tipo `MenuPublico` y `doc.md` actualizados. api 579 tests (`menu.service.spec` 31: el logo propio, el de la marca, ninguno, la marca sin datos, la dirección y el `select` pedido a la base).
  - **Header (`MenuHeader`):** el logo del restaurante (o el de MenYU) reemplaza a las iniciales y es el mismo botón del menú lateral (cuadro blanco de 40 px que se toca como uno de 44, con las tres rayitas, `aria-label="Abrir el menú"`); el nombre puede ocupar dos líneas; en la mesa con código, "Mesa N" y "PIN xxx" apilados (más bajos, sin cambiar el color ni el borde) y sin código solo la mesa como hoy; "Mozo" igual que antes. Medido en Edge a 320, 360 y 390 px: el header de la mesa con código mide 70 px (sin código y en la carta, 64) y el nombre "La Parrilla del Puerto" entra en dos líneas. `ImagenLogo`: el logo entero (`object-fit: contain`); si no hay logo o no carga, el de MenYU (`public/logo-u.png`, la U con el tenedor, 25 KB, recortada del `logo.png` de 1,5 MB).
  - **Menú lateral (`MenuDrawer`):** arriba el restaurante (logo de 72 px, nombre y dirección; sin dirección no se muestra nada), con una animación de 0,3 s al abrir (el logo pasa de 55 % a su tamaño y el nombre entra un instante después) que se apaga con "reducir movimiento"; después la cuenta (invitado: saludo e iniciar sesión o crear cuenta; con cuenta: "¡Hola, {nombre completo}!" y el email, y "Cerrar sesión" si se puede) y las filas (mesa: las de siempre; carta: "Ingresar a una mesa" y "Volver al inicio"). Se sacó el círculo con el ícono o la inicial de la persona para que la cabeza no crezca de más (mide 315 px en un celular de 320 × 568, y todo entra sin desplazarse; el panel igual se puede desplazar).
  - **"Cerrar sesión" (`usePuedeCerrarSesion`):** hoy la app no guardaba si la mesa pidió algo; se consulta `GET /orders` (los pedidos de la mesa) cada vez que se abre el menú lateral, solo si hay cuenta y una mesa abierta. Se ofrece si no hay una mesa abierta o si la mesa **no tiene ningún pedido que no esté anulado**. Mientras no se sabe (carga o falla la consulta) no se ofrece. Una mesa abierta cuenta aunque se esté mirando la carta de otro restaurante.
  - **Tests:** web-cliente 612 (30 archivos; `MenuDrawer` 39, `MenuHeader` 18, `usePuedeCerrarSesion` 21, `CartaPage` 35, `ClienteMenuPage` 47); 62 mutaciones detectadas (5 obligaron a sumar tests); typecheck y lint limpios. Pasada en Edge contra el Vite local con la API simulada (34 verificaciones): pills apilados y "Mozo" de 74 × 34 a 320, 360 y 390 px; logo propio, el de MenYU y el que no carga; botón de 40 px con área de toque de 44; la animación (el logo empieza más chico y el nombre invisible, y termina en su tamaño) y que con "reducir movimiento" no hay animación; la regla de "Cerrar sesión" (carta sin mesa, mesa sin pedidos, mesa con pedidos y mesa con solo un pedido anulado); la carta con su único scroll y el buscador filtrando.
  - **Mockup actualizado:** `menu-header.html` con las vistas "Los logos", "Mesa con código", "Menú lateral" (mesa y carta, con un botón para ver la animación) y "Pantalla"; en el visor, grupo "Header del menú".
  - **Pendiente (no hecho a propósito):** la animación es un crecimiento simple del logo; no vuela desde el botón del header hasta el menú (haría falta medir posiciones y sumaría casos raros). Con el backend real se probó después (2026-10-14, ver la Fase 8); falta la pasada en celulares reales.

#### Fase 8: cierre

- [x] **Seed final: sin cambios.** El seed ya tiene lo que pedía esta fase: dos restaurantes con dirección (el de "Marca Seed", cuyo logo se sube desde web-admin, y "Restaurante Seed 2", sin logo propio ni de marca y sin menú, que sirve para ver la carta vacía) y dos platos en descuento (Milanesa Napo y Cerveza Artesanal). Los logos no van en el seed: necesitan el Storage y se suben desde web-admin. **Comprobado desde cero (2026-10-14):** una base descartable en el mismo Postgres de Docker, con las 31 migraciones aplicadas por `prisma migrate deploy` (incluida `enable_unaccent`), el seed corrido dos veces (la segunda no cambia nada) y el e2e por API contra un backend temporal en el puerto 3001 (73 verificaciones, entre ellas que las ofertas sean Cerveza Artesanal con 25 % y Milanesa Napo con 20 %, en ese orden). La base y el backend temporales se borraron.
- [x] **Documentación:** `CLAUDE.md` (módulo `discovery`, una sección "Discovery, logo, dirección y descuentos" con las rutas de la API, de web-cliente y de web-admin, el alcance de la v1.0 con Discovery y sin combos, y la regla de ROOT en lugar de "bypass total"), `Documentacion/Doc_DB.md` (`logo_url` en `marca` y `restaurante`, `precio_descuento` en `item_menu` y la extensión `unaccent`; se sacó `qr_base_url`, que ya no existe) y `Documentacion/datos-de-prueba-local.md` (cómo se entra a una mesa ahora, los ids de los restaurantes, el link del QR y el modo seguro; los usuarios nuevos del seed ya estaban y la línea de ROOT ya decía "administración general").
- [x] **Verificación contra el backend y la base reales (2026-10-14)**, de lo que había quedado "por probar" en los commits 3 a 7. Con el backend de :3000 ya en el build nuevo, el Vite de :5176 y Docker prendido, sin API simulada:
  - **API (71 verificaciones):** `GET /discovery` (los dos restaurantes con su dirección, el logo de la marca y `null` donde no hay, ordenado y sin campos de Mercado Pago); `/discovery/buscar` (sin `q`, con 1 carácter, mayúsculas y acentos con `unaccent` de verdad —"PROVOLETÁ" encuentra Provoleta—, `%%` buscado como texto y sin resultados); `/discovery/restaurantes/:id` (200, 404 y un id que no es UUID también da 404); `GET /menu/:id` con `direccion` y `logoUrl` resuelto (restaurante → marca → `null`); `POST /sessions/open` (el QR de otro restaurante da 409 con el mensaje exacto; un QR inexistente, un PIN que no existe y el PIN de otro restaurante dan 404; sin datos 400; **ninguno de esos casos deja un "Invitado" de más ni ocupa la mesa**; el QR con `restauranteId`, el QR solo y el PIN entran a la misma sesión; con una cuenta, la sesión queda a nombre de la cuenta); `GET /orders` (vacío, con el pedido, con el pedido anulado y visto por los dos comensales de la mesa) y el cierre de la mesa, que la deja libre.
  - **Navegador, Edge a 360 px (86 verificaciones):** el home con los datos reales y el buscador con acentos; la pantalla del restaurante y un restaurante que no existe; la carta de los dos restaurantes con el logo de la marca y con el de MenYU, con el menú lateral mostrando la dirección y sin "Cerrar sesión"; el PIN de otro restaurante (aviso y sin sesión) y el PIN correcto (mesa 100); `/check-in` con un QR real, con un QR que no existe (404 real, con el PIN como salida y sin "Reintentar") y sin conexión, con "Reintentar" que abre la mesa; **el escáner con la cámara falsa**: el QR de la mesa 101 estando en el restaurante equivocado (409 real y aviso con el nombre) y en el correcto (abre la mesa), y el atajo del home; el modo seguro (el anfitrión con su código, el segundo comensal con un código equivocado y con el correcto, y los pills "Mesa N" y "PIN xxx" apilados); una oferta del home abre su restaurante y recargar funciona; iniciar sesión desde el home y desde el menú lateral de la carta (vuelve a la carta); la carta sin sesión (Descuentos, sin "+" ni "Mozo", tocar una tarjeta no hace nada y el buscador filtra); de la carta de un restaurante a la de otro sin mezclar menús; el logo propio del restaurante gana sobre el de la marca; y la regla de "Cerrar sesión" con una cuenta de verdad (sin mesa, mesa sin pedidos, mesa con un pedido y con el único pedido anulado).
  - Cada corrida sacó una foto de la base antes y limpió después (las filas nuevas y el estado de las mesas; el logo de prueba se restauró): sin residuos. En la mesa solo se vio con el backend real el logo de la marca; el propio y el de MenYU se vieron en la carta (es la misma pieza).
  - **Hallazgo (ya estaba antes de esta rama):** web-cliente no manda el token de la cuenta en `POST /sessions/open`, así que quien inició sesión y entra a una mesa queda como "Invitado" en la sesión del servidor (el saludo del menú sale del token, no de la sesión). No afecta a lo de este plan: la regla de "Cerrar sesión" consulta los pedidos de la mesa. Anotado en el Apéndice B.
- [ ] **QA en staging y en celulares reales:** `docs/checklist-qa-staging.md` reúne lo que solo se puede probar ahí (la extensión `unaccent` en Supabase, el Storage de logos, la cámara de verdad en Android y en iPhone, el teclado abierto y el responsive en pantallas reales). Se corre después de mergear (sección 8, camino 5).
- [ ] Recién ahí, el tag de producción (lo decide el equipo).

---

## 7. Estrategia de tests

- **Backend:** Jest con Nest Testing y Prisma mockeado, como los specs existentes (`menu.service.spec`, `orders.service.spec`, `marca.service.spec`). Todo lo nuevo corre en CI. Cada endpoint nuevo tiene su test de permisos, incluido "ROOT → 403".
- **e2e:** no se suman e2e contra bases compartidas. Solo el e2e local de búsqueda con acentos (Fase 5), que corre contra la base local y no está en CI.
- **Frontend:** Vitest con jsdom. Se suma Testing Library (D13) para las reglas de UI que hoy solo se verificarían a mano (carta sin botones, badge, header con logo).
- **Responsive:** jsdom no calcula layout, así que el responsive se verifica con el checklist estándar (2.3) en cada fase con UI.
- **Fixtures a actualizar:** `menu.service.spec`, `orders.service.spec` y `contextStore.spec` (los tipos ganan campos).

---

## 8. Cómo probar en celular

1. **DevTools (device toolbar):** primera pasada en cada fase, con los anchos del checklist.
2. **Celular real contra el entorno local, por la red (HTTP):** sirve para todo menos la cámara.
   - Levantar el frontend con `--host` (por ejemplo `pnpm --filter @menyu/web-cliente dev -- --host`).
   - Poner en `VITE_API_URL` la IP de la PC (`http://<IP>:3000/api`).
   - Agregar `http://<IP>:5176` a `CORS_ORIGINS` del backend y permitir los puertos en el firewall de Windows.
   - Limitación: el navegador solo da la cámara en HTTPS (o en `localhost`). Por esta vía solo se prueba el ingreso con PIN.
3. **Android con cable USB (la cámara anda, sin HTTPS):** para el navegador, `localhost` es un sitio seguro, y con el cable el celular puede tener su propio `localhost` apuntando a la PC.
   - En el celular: Ajustes → Acerca del teléfono → tocar 7 veces "Número de compilación" → Opciones de desarrollador → activar "Depuración por USB".
   - En la PC: instalar las platform-tools de Android (`winget install Google.PlatformTools`, o el zip "SDK Platform-Tools" de developer.android.com), conectar el cable, aceptar el cartel del celular y comprobar con `adb devices` que aparece.
   - Con el backend y web-cliente andando (si no conecta, levantar web-cliente con `--host`): `adb reverse tcp:5176 tcp:5176` y `adb reverse tcp:3000 tcp:3000`.
   - En Chrome del celular abrir `http://localhost:5176`: usa el mismo `VITE_API_URL=http://localhost:3000/api` y el mismo CORS que en la PC.
4. **iPhone (o Android sin cable): hace falta HTTPS.** Antes de mergear, con un túnel HTTPS hacia la PC (Cloudflare Quick Tunnel). Para que alcance un solo túnel, `apps/web-cliente/vite.config.ts` permite los nombres de host de `trycloudflare.com` (`server.allowedHosts`) y reenvía `/api` y `/socket.io` (con WebSocket) al backend (`http://localhost:3000`, o el que diga `BACKEND_URL`). Pasos:
   - Instalar el túnel una vez: `winget install Cloudflare.cloudflared`.
   - Con el backend andando en el puerto 3000, levantar **otro** web-cliente que le hable a su mismo servidor (`VITE_API_URL=/api`; no hace falta CORS). En PowerShell: `$env:VITE_API_URL='/api'; pnpm --filter @menyu/web-cliente dev --port 5177`. En Git Bash hay que desactivar la conversión de rutas, si no `/api` se transforma en `C:/Program Files/Git/api`: `MSYS_NO_PATHCONV=1 VITE_API_URL=/api pnpm --filter @menyu/web-cliente dev --port 5177`. El web-cliente de siempre (puerto 5176) no se toca.
   - En otra terminal: `cloudflared tunnel --url http://localhost:5177`. Imprime una dirección `https://….trycloudflare.com`: se abre en el iPhone (o en cualquier celular).
   - La dirección cambia cada vez que se vuelve a abrir el túnel. Al terminar, cerrar el túnel y el servidor del puerto 5177.
   Después de mergear, es el camino 5.
5. **Celular real contra QA (HTTPS):** después de mergear la rama a `main` (el deploy de staging corre al pushear). Es el camino más simple para iPhone y para la pasada final. La Preview de Vercel de un PR no trae backend propio: usa el backend que tenga configurado (QA), que no tiene los endpoints nuevos hasta mergear; sirve para revisar estética y responsive de pantallas que no dependen de la API nueva.
6. **Qué QR escanear:** el de una mesa, que se ve en web-admin (Mesas) y se puede mostrar en otra pantalla o imprimir. Lo que codifica es un link `…/check-in?restaurantId=…&tableCode=…`; el escáner de la app solo usa `tableCode` y no mira el dominio, así que sirve el QR de cualquier mesa del entorno que se esté probando.
7. **Qué se prueba con el escáner (cada celular):** al tocar "Escanear QR" el navegador pide el permiso; con "Permitir" lee el QR y abre la sesión; con "No permitir" (y también si se rechaza antes) aparece el mensaje claro con cómo habilitarlo, la recomendación de escanear con la cámara del celular y la opción del PIN (esa recomendación también hay que seguirla de verdad: el QR escaneado con la app de cámara tiene que abrir la mesa); con la cámara tapada o en uso por otra app, el mensaje de cámara que no responde; y el ingreso con PIN desde el texto chico. Navegadores a cubrir: Chrome en Android y Safari en iPhone.

---

## 9. Riesgos y notas operativas

- **Ramas largas:** `feat/descuentos` y `feat/discovery` viven varias semanas mientras `main` sigue avanzando. Mitigación: PR en borrador, `git merge origin/main` al empezar cada fase.
- **Orden de merge:** `feat/discovery` no puede empezar a codificarse hasta que las otras dos estén en `main`. Los mockups sí se hacen antes.
- **Migraciones y base de datos:**
  - Se desarrollan contra la base local (Docker). QA las recibe al mergear, porque Railway corre `prisma migrate deploy` al arrancar.
  - No se corre `migrate deploy` ni `db seed` a mano contra QA (impacta a todo el equipo; ver `apps/backend/README.md`).
  - `feat/logo-direccion` y `feat/descuentos` tocan `schema.prisma` en modelos distintos: el conflicto se resuelve al mergear.
- **Storage:** crear el bucket `logos` en QA y prod antes de probar. En local usar un bucket de desarrollo; si no, subir un logo local pisa el de QA para el mismo ID (los IDs del seed son fijos). El `.env` local tiene que apuntar a QA (staging), nunca a producción.
- **Caché de logos:** el archivo se pisa en el mismo path, por eso la URL guardada lleva `?v=<timestamp>`.
- **Precio mostrado vs cobrado:** se evita agrupando 2, 3 y 4 en una sola rama y reprecificando el carrito (Fase 4).
- **`unaccent`:** validar en QA que la extensión se crea y que `unaccent()` resuelve sin calificar el schema (en Supabase suele vivir en `extensions`). Las consultas van por `$queryRaw`: escapar `%` y `_` y cubrir con el e2e local.
- **Assets pesados:** `logo.png` pesa 1,5 MB y `favicon.png` 4,9 MB (por app) y `LogoParaOscuro.png` 644 KB (2172 × 724 px, con borde transparente y algo de ruido en los bordes de las letras). El header del menú usa una versión liviana (Fase 7). Una versión del logo para fondo oscuro de unos 600 px de ancho pesaría una fracción.
- **Escáner QR:** el lector nativo (`BarcodeDetector`) no existe en Safari (iPhone) ni en Chrome de escritorio: ahí lee `jsqr`, que se descarga aparte (unos 47 KB comprimidos) solo cuando hace falta (D26). La cámara solo anda en HTTPS o `localhost` (ver sección 8). Un navegador dentro de otra app (el de Instagram, WhatsApp, etc.) puede no dar la cámara: se cubre con el estado "navegador sin cámara", la recomendación de escanear con la cámara del celular y el PIN. `jsqr` no tiene dependencias y es de licencia Apache-2.0; su última versión (1.4.0) es de abril de 2021.
- **`pnpm add` en un árbol con servidores andando:** ya dejó `node_modules` roto una vez. Para sumar `jsqr` el lockfile se generó en una copia descartable (`pnpm install --lockfile-only`) y el paquete se vinculó a mano en el árbol de trabajo; quien lo baje desde el repositorio solo tiene que correr `pnpm install`.
- **`.env.*` con credenciales:** `.gitignore` ignora cualquier `.env*` salvo `.env.example` (D28). Eso solo evita commitearlos: `apps/backend/.env.backup` sigue en disco con credenciales de producción y hay que borrarlo.
- **Código existente de permisos:** el chequeo de pertenencia está duplicado en varios services (más el helper compartido `common/assert-staff-access.ts`), todos con bypass de ROOT. El código nuevo no lo reutiliza (2.1).

---

## 10. Pendientes y su resolución

Todos los pendientes se resolvieron el 2026-10-09 con la opción por defecto. P5 se confirmó después, viendo el header real.

| ID | Pregunta | Resolución |
|---|---|---|
| P1 | ¿Entra el shell responsive de web-admin (sidebar → drawer en pantallas chicas) como Fase 1.0? | Sí, al inicio de `feat/logo-direccion`. |
| P2 | Alcance del responsive en pantallas existentes de admin y staff. | Solo lo que se crea o modifica en este plan. El resto, al backlog. |
| P3 | ¿En qué commit o rama se commitea este documento? | Primer commit de `fix/endpoints-get-id` (`docs: plan de discovery, descuentos y logo`). |
| P4 | `fix/bugs-varios` (con la regla de ROOT en `CLAUDE.md`, commit `0a59f91`) todavía no está en `main`. ¿Se mergea antes de arrancar las ramas `feat`? | Sí; si no, se cherry-pickea el commit a `fix/endpoints-get-id`. |
| P5 | Logo en el header: hoy el header del menú no muestra el logo de MenYu sino un botón con las iniciales del restaurante (abre el drawer). ¿El logo reemplaza ese botón, con el de MenYu como fallback en lugar de las iniciales? ¿Hay un isotipo cuadrado con fondo transparente? | Confirmado viendo el header real: el logo reemplaza a las iniciales y funciona como ese mismo botón (abre el drawer), dentro de un contenedor blanco. Fallback: wordmark de MenYu en una pastilla blanca más ancha. |
| P6 | ¿El buscador del menú del cliente también ignora acentos (hoy no lo hace)? | Sí, normalizando en el cliente. |
| P7 | La fila "Mis puntos" del drawer y la línea de fidelización de `CLAUDE.md` (v2.0). | Sacar la fila al extraer el drawer y ajustar la línea a "fuera del alcance de la tesis". |
| P8 | En `fix/endpoints-get-id`: ¿solo se arreglan los includes o también se saca a ROOT de esos dos endpoints? | Solo los includes. |
| P9 | Opcional: script de Playwright (ya está en web-cliente) con capturas y chequeo de overflow horizontal en 360, 768 y 1280. Manual, fuera de CI. | No, queda el checklist manual. |

---

## Apéndice A: permisos de ROOT en el código existente

Relevado el 2026-10-06 y re-verificado parcialmente el 2026-10-08. **No se cambia nada en este plan**: es la lista para decidir qué se hace con la regla de 2.1. El módulo de pagos se reescribió después del relevamiento y hay que re-revisarlo (Mercado Pago lo informa el equipo por su cuenta).

Hoy `common/assert-staff-access.ts` centraliza el chequeo para sesiones y pagos. El resto (items, categorías, ingredientes, clasificaciones, mozos, mesas, pedidos, restaurante y admin-restaurante) tiene su propia copia con `if (user.rol === 'ROOT') return`. Si se decide excluir a ROOT, conviene centralizar todo en un solo servicio de acceso.

| Área | Qué puede hacer ROOT hoy | Sugerencia |
|---|---|---|
| Marca: editar | Cambiar nombre y slug de cualquier marca | Decidir |
| Listados | `GET /marcas` y `GET /restaurantes` devuelven las filas completas | Dejar, con campos mínimos |
| Detalle | `GET /marcas/:id` y `GET /restaurantes/:id`: gerentes (emails), mozos, mesas con QR y PIN, categorías, menús, ingredientes | Quitar (ver P8) |
| Restaurante: editar | Nombre, modo de sesión y nombre de la sección de recomendados | Quitar |
| Menú | CRUD completo de ítems (precios, imágenes, ingredientes), categorías, ingredientes y clasificaciones | Quitar |
| Mesas | Alta, ver QR y PIN, regenerar QR, cambiar PIN, borrar | Quitar |
| Mozos | Crear, editar (incluida la contraseña) y borrar mozos; asignar mesas | Quitar |
| Cuentas admin | Crear y borrar OWNER y GERENTE (lo permite la regla). Además `PATCH /admins/:id` cambia email y contraseña de cualquier admin, OWNER incluido | Decidir: dejar crear y borrar, quitar el cambio de credenciales ajenas |
| Gerentes ↔ restaurantes | Asignar y desasignar gerentes a cualquier restaurante | Quitar (decisión del OWNER) |
| Reportes | Ventas, ticket promedio y top de ítems de cualquier restaurante | Quitar |
| Sesiones y caja | Abrir y cerrar mesas, ver la sesión activa con totales, historial y registrar cobros | Quitar |
| Pedidos | Crear pedidos como staff, ver ediciones y editar o anular pedidos (OWNER no puede, ROOT sí) | Quitar |

Frontend: ROOT entra a web-admin y ve Dashboard, Mesas, Menú, Mozos, Reportes y Auditoría (esta última da 403 en la API, que es solo OWNER). Hay `isOwner = OWNER || ROOT` y `canEdit = GERENTE || ROOT` en varias pantallas, y el selector de contexto carga todas las marcas y restaurantes. Hoy no hay pantalla para crear ni eliminar marcas y restaurantes (solo API): si se le quita todo lo anterior, ROOT queda sin nada que hacer en web-admin y habría que planificar una consola mínima.

Falta código para lo que sí corresponde a ROOT: `POST /admins` solo crea GERENTE y, cuando lo usa ROOT, sin marca. Debería recibir `rol` y `marcaId`.

Documentación que lo describe como acceso libre: `Documentacion/modulo-menu.md` y `Documentacion/datos-de-prueba-local.md`.

---

## Apéndice B: backlog diferido

- Los endpoints `/auth/dev/*` no tienen guards: crean admins con el rol que se pida y devuelven tokens de ROOT. Confirmar que no están en el build de producción y eliminarlos antes de taguear.
- Varios endpoints no validan pertenencia entre marcas (reportes, `GET /pedidos`, `GET /pedidos/auditoria`, edición de pedidos, alta de mesas, `GET /waiter-calls`): un OWNER o GERENTE de otra marca podría leer u operar otro restaurante.
- `PedidosService.confirmar` resta el precio extra en `QUITAR` y los otros dos cálculos de cobro no. `POST /pedidos` no parece usarse desde web-cliente (usa `/orders`).
- `Documentacion/Doc_DB.md` describe `item_sucursal`, que ya no existe.
- Responsive de las pantallas existentes de admin y staff que este plan no toca.
- Inputs existentes con `font-size` menor a 16px (zoom en iOS al enfocar).
- Peso de `favicon.png` (4,9 MB por app).
- La carta de un restaurante sin menú (y el menú de una mesa de ese restaurante) dice "No hay ítems en esta categoría", el texto del estado vacío de siempre, pensado para una categoría sin platos. En la carta pública, donde un visitante puede llegar a un restaurante sin carta cargada, convendría un texto propio ("Este restaurante todavía no cargó su carta"). Se vio con "Restaurante Seed 2" contra el backend real; no se cambió porque la Fase 7 ya estaba hecha.
- `web-cliente` no manda el token de la cuenta en `POST /sessions/open` (`api.sessions.open`): quien inició sesión y entra a una mesa queda como cliente "Invitado" en la sesión del servidor, aunque el backend lo soporta (`resolveClienteId` lee el `Authorization`). Ya era así antes de este plan. Si algún día la mesa tiene que quedar a nombre de la cuenta (por ejemplo, para un historial del comensal), hay que mandar el token y decidir qué pasa si vence a mitad de la sesión.
