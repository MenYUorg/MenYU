# Checklist de QA en staging: logo y dirección, descuentos y Discovery

Se corre **después de mergear `feat/discovery` a `main`**: el deploy de staging arranca el backend con `prisma migrate deploy`. Las decisiones están en `docs/plan-discovery-descuentos.md` (D1 a D31) y los datos de prueba locales en `Documentacion/datos-de-prueba-local.md`.

**Qué ya se probó y qué falta.** Con el backend y la base locales, en Edge de escritorio, ya pasaron la API, las pantallas y el escáner con una cámara falsa (ver el estado de la Fase 8 del plan). Esta lista es lo que **solo se puede probar en staging y en celulares reales**: la extensión `unaccent` en Supabase, el Storage de logos, el escáner con cámara de verdad, Safari en iPhone, el teclado abierto y el responsive en pantallas reales. No hace falta repetir todo lo demás: si algo falla, es un hallazgo nuevo.

**Auth va aparte.** La lista de verificación del login, el SSO entre apps y la cuenta de cliente es [`docs/auth/checklist-staging.md`](auth/checklist-staging.md).

**Cómo se usa.** Tildar cada ítem y anotar el dispositivo y el navegador. Un ítem que falla se anota con qué se vio y qué se esperaba.

| | Dispositivo | Navegador |
|---|---|---|
| Celular 1 | | Chrome (Android) |
| Celular 2 | | Safari (iPhone) |
| Escritorio | | |

---

## 0. Preparación

- [ ] El deploy terminó (backend en Railway y los cuatro frontends en Vercel) y las migraciones están aplicadas.
- [ ] `GET <API>/api/discovery/buscar?q=cafe` responde 200 (no 500). Si falla, la extensión `unaccent` no está o no resuelve en Supabase (suele vivir en el esquema `extensions`; ver riesgos en el plan).
- [ ] El bucket `logos` existe en el Storage de staging y es público (límite de 2 MB, PNG, JPEG y WebP).
- [ ] **No se corre el seed en staging.** Datos que tienen que existir, cargados desde web-admin con el OWNER de staging:
  - [ ] Tres restaurantes activos: uno con logo propio, uno sin logo propio de una marca que sí tiene logo, y uno sin ningún logo. Los tres con dirección.
  - [ ] Uno con dos o más platos en descuento y otro sin ofertas.
  - [ ] Uno con menú vacío (para ver la carta vacía).
  - [ ] Una mesa por restaurante, con su QR (en pantalla o impreso).
  - [ ] Un restaurante en modo seguro y otro en modo abierto (web-admin, Mesas).
  - [ ] Un usuario GERENTE asignado a un solo restaurante, y un ROOT.

## 1. Logo y dirección (web-admin)

- [ ] El OWNER entra a "Marca y sucursales", sube el logo de la marca y el de una sucursal desde el celular (galería y cámara) y se ve sin recargar.
- [ ] Un archivo inválido (SVG, PDF o de más de 2 MB) muestra un error claro.
- [ ] Quitar un logo vuelve al de la marca y, si tampoco hay, al de MenYu.
- [ ] El OWNER edita la dirección y se guarda.
- [ ] GERENTE y ROOT no ven "Marca y sucursales" ni pueden cambiar la dirección.
- [ ] Un logo nuevo se ve actualizado en web-cliente sin Ctrl+F5.

## 2. Descuentos (web-admin, web-cliente, web-staff)

- [ ] OWNER y GERENTE cargan un descuento por precio y otro por porcentaje; el redondeo se ve en la vista previa. ROOT no ve el botón.
- [ ] Un descuento se saca y se vuelve a poner; con el menú abierto en un celular, la tarjeta aparece y desaparece sin recargar.
- [ ] Un pedido con un plato en descuento y un extra: el total del carrito, el de "Pagar la cuenta" y la comanda en cocina coinciden (extra a precio normal).
- [ ] Un descuento que se saca con el plato ya en el carrito: el carrito se corrige y avisa.
- [ ] La Toma de pedidos de un mozo y la de un gerente muestran y cobran el precio con descuento.
- [ ] El pago con Mercado Pago con un plato en descuento lo prueba el equipo por su cuenta.

## 3. Discovery (`/`)

- [ ] El home lista los restaurantes (de la A a la Z) con su logo, dirección y cantidad de ofertas, y las ofertas por porcentaje mayor.
- [ ] Buscar con y sin acentos y con mayúsculas ("cafe" encuentra "Café"): salen primero las ofertas, después los restaurantes y al final los restaurantes con platos que coinciden.
- [ ] Una búsqueda sin resultados y con una sola letra no rompen la pantalla.
- [ ] Tocar una oferta o un restaurante abre su pantalla; abrir el link de un restaurante y recargar también funciona.
- [ ] Con el teclado abierto en el buscador la pantalla no queda cortada.
- [ ] Iniciar sesión desde el header vuelve al home con el saludo (nombre entero, sin cortarse en 320 px).

## 4. Ingresar a una mesa

- [ ] **Android (Chrome):** "Escanear el QR de mi mesa" pide el permiso de la cámara, lee el QR y abre la mesa.
- [ ] **iPhone (Safari):** lo mismo, con el lector de respaldo.
- [ ] Rechazar el permiso de la cámara: mensaje claro, recomendación de escanear con la cámara del celular y la opción del PIN.
- [ ] Escanear el QR de una mesa **con la app de cámara del celular** (no con la web) abre la mesa por `/check-in`, en Android y en iPhone.
- [ ] `/check-in` con un QR que no existe: aviso con el PIN, sin volver al inicio en silencio. Sin conexión: "Reintentar".
- [ ] El PIN desde el texto chico "¿Pasó algo con tu cámara?": el campo aparece solo al tocarlo, y con el teclado abierto se ve el botón.
- [ ] QR o PIN de otro restaurante: mensaje con el nombre del restaurante y no se crea la sesión.
- [ ] Con una cuenta iniciada, la mesa queda a nombre de la cuenta (en la base, `sesion_mesa.cliente_id` es el id de la cuenta y no aparece un "Invitado" nuevo). Sin cuenta, o con la sesión vencida, entra como invitado y sin error.
- [ ] Modo seguro: el anfitrión ve el código de 3 dígitos; el segundo comensal lo pide y un código equivocado da error.

## 5. Carta en modo vista (`/restaurante/:id/carta`)

- [ ] Sin sesión: abrir la carta, buscar, ver Descuentos y tocar una tarjeta (no pasa nada; no hay "+", carrito, "Mozo" ni mesa).
- [ ] La carta es un solo scroll y el buscador solo filtra los platos.
- [ ] Un restaurante sin menú dice "Este restaurante todavía no cargó su carta".
- [ ] Pasar de la carta de un restaurante a la de otro no mezcla menús.

## 6. Header y menú lateral del menú

- [ ] Header con logo propio, con el de la marca y con el de MenYu, en la mesa y en la carta; el logo es el botón que abre el menú lateral (área de toque de 44 px).
- [ ] En una mesa con código (modo seguro), "Mesa N" y "PIN xxx" van uno arriba del otro y "Mozo" no se achica; el header no se vuelve demasiado alto (nombre largo incluido) en 320, 360 y 390 px.
- [ ] El menú lateral muestra el logo grande, el nombre y la dirección del restaurante, con la animación corta al abrir; con "reducir movimiento" activado no hay animación.
- [ ] Sin sesión: Iniciar sesión y Crear cuenta. Con sesión: "¡Hola, {nombre completo}!".
- [ ] "Cerrar sesión" aparece si no hay mesa o si la mesa todavía no pidió nada; con un pedido en la mesa (no anulado) no aparece.
- [ ] Desde la carta: "Iniciar sesión" vuelve a la carta; "Ingresar a una mesa" y "Volver al inicio" llevan a donde dicen.

## 7. Responsive estándar

- [ ] Las pantallas nuevas (home, restaurante, ingreso a mesa, escáner, `/check-in`, carta, header y menú lateral) a 320, 360, 390, 768 y 1280 px: sin scroll horizontal, controles de 44 px o más y nada cortado con el teclado abierto.
- [ ] web-admin: "Marca y sucursales" y el modal de descuento en el celular.

## 8. Cierre

- [ ] CI verde en el PR de `feat/discovery` (y en los anteriores, si no estaban).
- [ ] El tag de producción lo decide el equipo, recién después de esta lista.
