# Plan: logo y dirección, descuentos y Discovery de restaurantes

**Estado:** en ejecución: Fase 0 y rama `fix/endpoints-get-id` terminadas (pendientes de commit, push y PR) · **Actualizado:** 2026-10-10 · **Base:** `main` al 2026-10-08
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
| 4 | Discovery de restaurantes | Nueva página inicial de web-cliente (reemplaza a la landing actual): todos los restaurantes con logo y dirección, productos en oferta, buscador (restaurantes, restaurantes con platos que coinciden y ofertas que coinciden; ignora acentos) y login. |
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
| D13 | Se suma Testing Library (`@testing-library/react` y `jest-dom`) en web-cliente y web-admin. |
| D14 | Mockups HTML de Discovery y de la pantalla del restaurante, aprobados antes de implementar la Fase 6. Mobile primero y escritorio (sección 6, Fase 6). |
| D15 | Migraciones: se desarrollan contra la base local y QA las recibe al mergear (sección 2.4 y 9). |
| D16 | Regla de ROOT (sección 2.1). |
| D17 | Fidelización fuera de alcance. |
| D18 | Mercado Pago no se toca. |
| D19 | `GET /marcas/:id` y `GET /restaurantes/:id` se arreglan en una rama aparte, antes de la Fase 1. |
| D20 | Logo del header del menú: restaurante → marca → MenYu. El logo reemplaza a las iniciales y funciona como ese mismo botón (al tocarlo abre el drawer); MenYu queda solo como último fallback (P5, confirmado viendo el header real). |
| D21 | Estética y responsive (secciones 2.2 y 2.3). |
| D22 | Ramas y commits (sección 5). |

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
| `GET /discovery/buscar?q=` | público | 5 | restaurantes, restaurantes con platos y ofertas |
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
- Nuevos: `DiscoveryRestaurante`, `DiscoveryOferta`, `DiscoveryResponse`, `DiscoveryBusquedaResponse` y `UpdateItemDescuentoRequest`.

### 4.5 Componentes compartidos (`@menyu/ui`)

- `DescuentoBadge`: círculo naranja chico con el %. Lo posiciona el padre (arriba a la derecha de la foto).
- `PrecioConDescuento`: precio original tachado y chico, más precio vigente. Variantes para tarjeta, fila de lista y detalle. El formato de precio es configurable: web-cliente mantiene el actual y web-admin usa `es-AR`.

### 4.6 web-cliente

Rutas nuevas, todas públicas (fuera de `SesionRequiredRoute` y de `ComensalRequiredRoute`):

| Ruta | Pantalla |
|---|---|
| `/` | `DiscoveryPage` (reemplaza a `EntradaPage`) |
| `/restaurante/:restauranteId` | opciones del restaurante |
| `/restaurante/:restauranteId/mesa` | ingreso a mesa del restaurante (QR o PIN) |
| `/restaurante/:restauranteId/carta` | carta en modo vista |
| `/ingresar-pin` | redirige a `/` (D12) |
| `/check-in` | se mantiene (es la URL que codifican los QR impresos) |

- Login desde Discovery o desde la carta: `AppHeader` y drawer ya navegan a `/auth`. Se suma `?volver=<ruta>` para volver a donde estaba el usuario. Sin ese parámetro vuelve a `/`.
- El ingreso a mesa sigue terminando en `/menu`. Ese guard ya redirige a `/elegir-nombre` (comensales) si falta el nombre. Los puntos de entrada nuevos no deben saltearlo.
- Piezas a extraer: `QrScanner` (hoy dentro de `EntradaPage`) y el hook `useEntrarAMesa` (abrir sesión + modo seguro con `AnfitrionScreen` / `CodigoSesionScreen`, hoy copiado en `EntradaPage`, `IngresoManualPage` y `CheckInRedirectPage`).
- `ClienteMenuPage` se parte en componentes (header, buscador con dietas, chips, secciones, `ItemCard`, drawer) con un `modo` (`mesa` o `carta`).
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
| `feat/discovery` | Fase 5: 2 · Fase 6: 3 (refactor, Discovery, restaurante y mesa) · Fase 7: 2 (carta, logo en header) · Fase 8: 1 |

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
- [x] Bucket `logos` creado en QA y prod: público, límite de 2 MB y solo PNG, JPEG y WebP. No hay uno de desarrollo: en la Fase 1 el nombre del bucket sigue siendo configurable (`SUPABASE_LOGOS_BUCKET`) y hay que decidir qué bucket usa el entorno local (D3).
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
  - [ ] OWNER sube, cambia y quita logo de marca y de restaurante.
  - [ ] Un restaurante sin logo propio usa el de la marca (verificable en la respuesta de la API).
  - [ ] OWNER guarda la dirección. GERENTE y ROOT reciben 403 por API y no ven la pantalla.
  - [ ] Subir un logo nuevo se refleja sin recargar con Ctrl+F5 (`?v=`).
  - [ ] Archivo inválido (SVG, PDF, más de 2 MB) muestra un error claro.
  - [ ] Responsive estándar en la pantalla nueva, incluyendo subir un archivo desde el celular.

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
  - `pedidos.service.spec` nuevo: `confirmar` y `crearStaff` con y sin descuento.
- **Checklist (Swagger o curl contra la base local):**
  - [ ] Poner descuento por precio y por %; el % y el precio derivados coinciden con la tabla.
  - [ ] `GET /menu/:id` muestra el descuento y `descuentos[]`.
  - [ ] Crear un pedido: `precioUnitario` = precio con descuento + extras a precio normal.
  - [ ] Cambiar el precio base con descuento activo respeta D4.
  - [ ] ROOT recibe 403.

#### Fase 3: carga de descuentos en web-admin

- En cada fila de la lista del menú (`AdminMenuPage`): botón "Descuento" que abre un modal con dos campos enlazados (precio nuevo ↔ %), vista previa y "Quitar descuento". La fila muestra precio tachado, precio vigente y un chip "-X%". Aviso en `ItemFormModal` al editar el precio base con descuento activo.
- OWNER y GERENTE ven el botón. ROOT no.
- `api.ts` y `menuStore`: `setDescuento` y `quitarDescuento`.
- **Tests:** helper de vista previa (mismos vectores que el util del backend), `menuStore` (actualiza el ítem o propaga el error) y el modal con Testing Library (los dos modos, bordes y el botón no visible para ROOT).
- **Checklist:**
  - [ ] Como OWNER y como GERENTE (este solo ve sus restaurantes asignados).
  - [ ] Cargar por precio y por %, con redondeo visible en la vista previa.
  - [ ] Quitar el descuento.
  - [ ] Responsive estándar: el modal y la fila a 360 px (la fila no desborda y los botones se tocan bien).

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
  - [ ] Con el menú abierto en el cliente, poner o sacar un descuento en admin y ver el cambio (socket).
  - [ ] Pedir un ítem con descuento y un extra: coincide el total del carrito, de Mis pedidos y de Pagar.
  - [ ] Un descuento sacado con el ítem ya en el carrito: el carrito se corrige.
  - [ ] Toma de pedidos de mozo y de gerente muestran y cobran el precio con descuento.
  - [ ] Responsive estándar: tarjeta con badge y precio tachado a 360 px (el badge no tapa el nombre, nombres largos no rompen), grilla de 2 columnas en celular y 4 en escritorio.

### Rama `feat/discovery`

#### Fase 5: Discovery, API pública

- **BD:** migración con `CREATE EXTENSION IF NOT EXISTS unaccent` (D9).
- **Backend:** módulo `discovery/` (module, controller y service) público, con las reglas de 4.2.
  - `GET /discovery`: restaurantes (id, nombre, dirección, `logoUrl` = restaurante ?? marca, marca, cantidad de ofertas) y ofertas (ítem con precios y %, más el restaurante), ordenadas por % mayor, hasta 50 y 30.
  - `GET /discovery/buscar?q=`: `{ restaurantes, restaurantesConPlatos, ofertas }`. Consulta con `$queryRaw` y `unaccent(...)`, escapando `%` y `_` del texto buscado.
- **Tipos:** los de Discovery (4.4).
- **Tests:** `discovery.service.spec` (fallback de logo, solo activos, solo disponibles, tres grupos de búsqueda, `q` corta, límites, escape de comodines y que el `select` no incluya campos sensibles) y un e2e local de búsqueda con acentos ("cafe" encuentra "Café") contra la base local (no corre en CI).
- **Checklist (curl contra la base local):** listado, ofertas ordenadas, búsqueda con y sin acentos, con mayúsculas, por nombre de marca, `q` de 1 letra, `q` con `%`.

#### Fase 6: Discovery como home, pantalla del restaurante y entrada a mesa

**Mockups primero (D14):** HTML estático (en `docs/mockups/`) con la estética de 2.2 y el layout mobile primero. Se aprueban antes de escribir la implementación.

- Pantallas: Discovery (home con ofertas y lista), Discovery buscando (los tres grupos), estados cargando, vacío y error, pantalla del restaurante, ingreso a mesa (QR y PIN).
- Cada pantalla a 360, 768 y 1280 px.
- Casos límite: restaurante sin logo, nombre y dirección largos, sin ofertas, muchas ofertas, sin dirección cargada.

Implementación en tres commits:

1. **Refactor sin cambio visible:** extraer `QrScanner` y el hook `useEntrarAMesa` y usarlos en `CheckInRedirectPage`. Test de regresión: anfitrión en modo seguro, código requerido y error.
2. **`DiscoveryPage` en `/`** (reemplaza a `EntradaPage`):
   - Header: `AppHeader`.
   - Buscador en píldora con debounce.
   - Carrusel de ofertas con scroll horizontal contenido (celular).
   - Lista de restaurantes: 1 columna en celular, 2 en tablet, 3 en escritorio.
   - Resultados de búsqueda en tres grupos.
   - Estados cargando, vacío y error.
   - Login: tras iniciar sesión vuelve a `/`. `discoveryStore` nuevo.
3. **Pantalla del restaurante y ingreso a mesa:**
   - `/restaurante/:id` con "Ingresar a una mesa" y "Ver la carta" (este último oculto hasta la Fase 7).
   - `/restaurante/:id/mesa` con "Escanear QR" y "Ingresar con PIN" (sin marca ni sucursal).
   - Backend chico: `POST /sessions/open` valida `restauranteId` junto con `tableCode` (D11).
   - `/ingresar-pin` redirige a `/` (D12).
- **Tests:** `discoveryStore` (carga, búsqueda, ignorar respuestas viejas), `useEntrarAMesa`, `DiscoveryPage` y pantalla del restaurante (Testing Library), `sessions.service.spec` (QR con restaurante distinto da error; sin `restauranteId` igual que hoy).
- **Checklist:**
  - [ ] Home → buscar → restaurante → QR o PIN → "Elegir nombre" → menú de mesa.
  - [ ] QR o PIN de otro restaurante: mensaje claro y no se crea la sesión.
  - [ ] Modo seguro: anfitrión (muestra el código) y comensal (pide el código).
  - [ ] Login desde Discovery y vuelta a `/`.
  - [ ] Tocar una oferta abre la pantalla de su restaurante (D8).
  - [ ] Responsive estándar en las cuatro pantallas, con el teclado abierto en el buscador y en el PIN.
  - [ ] Pasada con celular real, incluyendo el escaneo de QR (requiere HTTPS, sección 8).

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
- **Tests (Testing Library):**
  - En `carta` no hay botón "+", ni carrito, ni navegación al detalle; sí hay badge y tachado.
  - El buscador filtra y el drawer ofrece las opciones.
  - La ruta no redirige a `/` sin sesión.
  - El store no mezcla restaurantes.
  - El header muestra restaurante, marca o MenYu según corresponda, y al tocar el logo se abre el drawer.
  - Regresión: el modo `mesa` se comporta igual que antes.
  - Backend: `menu.service.spec` con `restaurante.logoUrl` resuelto.
- **Checklist:**
  - [ ] Sin sesión: abrir la carta, buscar, ver descuentos, tocar una tarjeta (no pasa nada).
  - [ ] Drawer: iniciar sesión y volver a la carta; ingresar a una mesa como invitado.
  - [ ] Header con logo de restaurante, de marca y sin ninguno, en `mesa` y en `carta`.
  - [ ] Cambiar entre la carta de dos restaurantes no mezcla menús.
  - [ ] Responsive estándar: carta y header (con logos anchos y altos) en todos los anchos.

#### Fase 8: cierre

- Seed final (restaurantes con y sin logo, direcciones, descuentos).
- Documentación: `CLAUDE.md` (módulo `discovery`, rutas nuevas), `Documentacion/datos-de-prueba-local.md` (usuarios nuevos del seed; la línea de ROOT dice "bypass total"), `Documentacion/Doc_DB.md` (columnas nuevas).
- QA de punta a punta en QA (staging) siguiendo los checklists de las fases 1 a 7, con celular real.
- Recién ahí, el tag de producción (lo decide el equipo).

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
2. **Celular real contra el entorno local (HTTP):**
   - Levantar el frontend con `--host` (por ejemplo `pnpm --filter @menyu/web-cliente dev -- --host`).
   - Poner en `VITE_API_URL` la IP de la PC (`http://<IP>:3000/api`).
   - Agregar `http://<IP>:5176` a `CORS_ORIGINS` del backend y permitir los puertos en el firewall de Windows.
   - Limitación: la cámara (escaneo de QR) exige HTTPS. Por HTTP solo se prueba el ingreso con PIN.
3. **Celular real contra QA (HTTPS):** después de mergear la rama a `main`. La Preview de Vercel de un PR no trae backend propio: usa el backend que tenga configurado (QA), que no tiene los endpoints nuevos hasta mergear. Sirve para revisar estética y responsive de pantallas que no dependen de la API nueva.
4. **Escaneo de QR:** el escáner depende de `BarcodeDetector`, que no está en todos los navegadores (el código ya avisa y ofrece el PIN). Probar en Chrome para Android.

---

## 9. Riesgos y notas operativas

- **Ramas largas:** `feat/descuentos` y `feat/discovery` viven varias semanas mientras `main` sigue avanzando. Mitigación: PR en borrador, `git merge origin/main` al empezar cada fase.
- **Orden de merge:** `feat/discovery` no puede empezar a codificarse hasta que las otras dos estén en `main`. Los mockups sí se hacen antes.
- **Migraciones y base de datos:**
  - Se desarrollan contra la base local (Docker). QA las recibe al mergear, porque Railway corre `prisma migrate deploy` al arrancar.
  - No se corre `migrate deploy` ni `db seed` a mano contra QA (impacta a todo el equipo; ver `apps/backend/README.md`).
  - `feat/logo-direccion` y `feat/descuentos` tocan `schema.prisma` en modelos distintos: el conflicto se resuelve al mergear.
- **Storage:** crear el bucket `logos` en QA y prod antes de probar. En local usar un bucket de desarrollo; si no, subir un logo local pisa el de QA para el mismo ID (los IDs del seed son fijos).
- **Caché de logos:** el archivo se pisa en el mismo path, por eso la URL guardada lleva `?v=<timestamp>`.
- **Precio mostrado vs cobrado:** se evita agrupando 2, 3 y 4 en una sola rama y reprecificando el carrito (Fase 4).
- **`unaccent`:** validar en QA que la extensión se crea y que `unaccent()` resuelve sin calificar el schema (en Supabase suele vivir en `extensions`). Las consultas van por `$queryRaw`: escapar `%` y `_` y cubrir con el e2e local.
- **Assets pesados:** `logo.png` pesa 1,5 MB y `favicon.png` 4,9 MB (por app). El header del menú usa una versión liviana (Fase 7).
- **Escáner QR:** depende de `BarcodeDetector` (ver sección 8).
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
