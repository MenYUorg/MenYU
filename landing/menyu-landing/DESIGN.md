# DESIGN.md — Landing de MenYU

Documento de dirección visual para la landing pública (`menyu-app.com`), HTML estático servido desde Cloudflare Pages. Toda página o sección nueva se construye con estos tokens y estas reglas. Si algo no está acá, se decide una vez y se agrega.

---

## 1. La dirección: el tiempo, no el plato

**Tesis.** MenYU no se vende mostrando comida apetitosa — eso lo pone el restaurante. Se vende mostrando el tiempo que nadie pierde: el comensal no espera al mozo para ver la carta, no lo espera para pedir, no lo espera para pagar. La landing tiene que hacer sentir esa agilidad, no afirmarla.

**Consecuencia de diseño.** La página *demuestra* el flujo en lugar de describirlo. El héroe no es una foto de un plato: es la secuencia real del producto corriendo —escanear → pedir → la comanda aparece en cocina → cambia de estado— con su propio cronómetro. Los estados son los de verdad (`PENDIENTE → EN_PREPARACIÓN → LISTO → ENTREGADO`), así que lo que se ve en la landing es lo que se ve en el producto.

**Esto descarta,** de forma explícita:

- Fotografía gastronómica como protagonista. Puede aparecer, chica y subordinada, dentro de capturas de la app.
- El patrón "hero centrado + tres tarjetas de features iguales".
- Métricas, logos de clientes y testimonios inventados. MenYU todavía no tiene clientes; escribir "+200 restaurantes" es mentira y en una defensa es el primer lugar donde te pinchan. El espacio que ocuparía la prueba social lo ocupa **prueba funcional**: el flujo corriendo, los estados reales, el QR que de verdad se puede escanear.

**El motivo gráfico** sale del logo: la U es simultáneamente plato y tenedor. Esa doble lectura —el contenedor y la herramienta— se repite en la página como recurso: contenedores con una base curva, y líneas verticales finas (las púas) como marcas de ritmo, separadores y escalas de tiempo.

---

## 2. Color

Los tokens de marca vienen de `packages/ui/tailwind-preset.cjs` y no se tocan: la landing tiene que ser el mismo producto. Lo que se agrega acá son los roles y dos valores derivados que el producto no necesitaba.

| Token | Valor | Rol |
|---|---|---|
| `--navy` | `#242C58` | Color de acción y de texto principal. Relleno de botones primarios, títulos, superficies oscuras inmersivas. |
| `--navy-hover` | `#323B6E` | Hover de superficies y botones navy. |
| `--coral` | `#ED6A4F` | Color de marca. Superficies grandes, acentos gráficos, el punto "en vivo", rellenos detrás de tipografía display. **Nunca texto, nunca relleno de botón con etiqueta.** |
| `--coral-texto` | `#C43F26` | Derivado nuevo. El coral cuando necesita ser legible: etiquetas, links de acento, números destacados. |
| `--coral-suave` | `#FDE7E1` | Fondo de sección cálido, badges, destacados sutiles. |
| `--gris` | `#5D6178` | Texto secundario, bajadas, pies de figura. |
| `--borde` | `#8A8FA5` | Bordes de campos y controles. |
| `--linea` | `#E1E3EA` | Divisorias, bordes de tarjeta. |
| `--fondo` | `#F5F6F9` | Fondo de sección alternado. |
| `--blanco` | `#FFFFFF` | Fondo base. |
| `--error` | `#B3261E` | Validación de formulario. |
| `--error-suave` | `#FCEEEC` | Fondo de error. |

**Contrastes verificados** (sobre blanco, salvo donde se aclara):

- `navy` 13.3:1 · `gris` 6.1:1 · `coral-texto` 5.1:1 — todos pasan AA para texto normal.
- `coral` 3.1:1 — **falla** para texto. Solo superficies, gráficos y tipografía display ≥ 32px (donde alcanza 3:1).
- Blanco sobre `coral` 3.1:1 — **falla**. Un botón coral con texto blanco no es accesible: por eso el botón primario es navy.
- `coral` sobre `navy` 4.3:1 — pasa para texto grande, no para cuerpo. Sirve para titulares y acentos sobre fondo oscuro.
- Blanco sobre `navy` 13.3:1 · `coral-suave` sobre `navy` 11.2:1 — las secciones inmersivas navy son seguras.

**Sin modo oscuro.** La landing es solo clara, igual que el producto. No se definen tokens dark ni se respeta `prefers-color-scheme`.

---

## 3. Tipografía

Dos familias. Una sola novedad respecto del producto, y es deliberada: la landing necesita una voz que Inter no tiene.

**Archivo** (variable, ejes `wght` 100–900 y `wdth` 62–125, OFL) — títulos y elementos operativos.
**Inter** (400/500/600) — todo el texto corrido. Es la del producto y se queda.

Archivo da tres voces con una sola familia, y eso sostiene la dirección: expandida para la afirmación, condensada para lo operativo (comandas, cronómetros, etiquetas de estado), normal para el resto. Montserrat no viaja a la landing; queda como fuente de títulos dentro de la app.

**Las dos se sirven self-hosted en `woff2` desde `/fonts`, nunca desde el CDN de Google.** Es el cambio más barato que existe para el LCP de una página estática. `font-display: swap` y `<link rel="preload">` para el corte display.

### Escala

| Token | Tamaño | Línea | Familia / ajustes |
|---|---|---|---|
| `--t-display-xl` | `clamp(3rem, 8vw, 6.5rem)` | 0.95 | Archivo 800, `wdth` 112, tracking `-0.03em` |
| `--t-display` | `clamp(2.25rem, 5vw, 4rem)` | 1.0 | Archivo 800, `wdth` 108, tracking `-0.025em` |
| `--t-h2` | `clamp(1.75rem, 3.5vw, 2.75rem)` | 1.1 | Archivo 700, `wdth` 100, tracking `-0.02em` |
| `--t-h3` | `1.5rem` | 1.25 | Archivo 600, tracking `-0.01em` |
| `--t-body-lg` | `1.1875rem` | 1.6 | Inter 400 — bajadas |
| `--t-body` | `1.0625rem` | 1.65 | Inter 400 — cuerpo (17px) |
| `--t-small` | `0.9375rem` | 1.5 | Inter 400 — pies, legales |
| `--t-op` | `0.8125rem` | 1.2 | Archivo 600, `wdth` 85, `uppercase`, tracking `0.08em` — etiquetas de estado, comandas, cronómetros, rótulos de sección |

Cuerpo nunca por debajo de 17px. Medida de línea entre 60 y 75 caracteres (`max-width: 68ch` en bloques de texto). Números en tablas y cronómetros con `font-variant-numeric: tabular-nums`, sin excepción: un dígito que cambia de ancho arruina la sensación de precisión que busca toda la página.

---

## 4. Espaciado y grilla

Escala de 4: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128`. Nada fuera de la escala.

- Ancho de contenido: `1200px` máximo, con `padding` lateral de `24px` en mobile y `48px` desde `768px`.
- Bloques de texto: `68ch`.
- Ritmo entre secciones: `clamp(80px, 10vw, 128px)` de padding vertical. Las secciones inmersivas navy pueden ir a `160px` para que el cambio de fondo respire.
- Grilla de 12 columnas con `gap: 24px` desde `768px`. Abajo de eso, una columna.

**Nada se centra por defecto.** El centrado se reserva para el hero y para un cierre; el resto va alineado a la izquierda. Tres secciones centradas seguidas es la firma visual de una página generada.

---

## 5. Forma, profundidad y movimiento

**Radio:** `--r-sm: 4px` (campos, badges) · `--r-md: 10px` (tarjetas, botones) · `--r-lg: 20px` (contenedores grandes, capturas) · `--r-full: 999px` (puntos de estado, píldoras). Los elementos "operativos" —comandas, etiquetas de estado— usan `--r-sm`: tienen que verse como un ticket, no como una tarjeta blanda.

**Sombras:** dos, y nada más.
`--sh-card: 0 1px 2px rgba(36,44,88,.06), 0 4px 12px rgba(36,44,88,.05)`
`--sh-lift: 0 2px 4px rgba(36,44,88,.08), 0 12px 32px rgba(36,44,88,.10)` (solo hover de elementos interactivos)
Sin glassmorphism, sin `backdrop-filter`, sin sombras de color.

**Movimiento.** Es parte del argumento, no decoración, así que tiene reglas propias.

- Duraciones: `--d-rapido: 140ms` (hover, foco) · `--d-medio: 240ms` (entradas, cambios de estado) · `--d-largo: 600ms` (transiciones de la secuencia del hero).
- Easing: `--e-salida: cubic-bezier(0.16, 1, 0.3, 1)` para entradas y cambios de estado; `linear` para cronómetros y barras de progreso, que tienen que leerse como tiempo real y no como animación.
- Solo se animan `transform` y `opacity`. Nada que dispare layout.
- Las secuencias arrancan con `IntersectionObserver` cuando entran en viewport, no al cargar.
- **`prefers-reduced-motion: reduce` no apaga el contenido:** la secuencia salta a su estado final y la página sigue contando la historia completa, en estático. Si la página deja de tener sentido sin movimiento, el movimiento estaba haciendo el trabajo que le tocaba al texto.

---

## 6. Componentes

**Botón primario** — relleno `navy`, texto blanco, `--r-md`, `padding: 14px 28px`, Archivo 600 `wdth` 100. Hover: `navy-hover` + `translateY(-1px)` + `--sh-lift`. Foco: `outline: 2px solid var(--coral-texto); outline-offset: 2px`. Disabled: `opacity .5`, sin cursor pointer.

**Botón secundario** — fondo transparente, borde `1.5px` `navy`, texto `navy`. Hover: fondo `coral-suave`. Mismo foco.

**Botón quiet** — solo texto `navy` con subrayado en hover. Para acciones terciarias.

**Links en texto** — `coral-texto`, subrayado con `text-underline-offset: 3px`. Hover: `navy`.

**Inputs** — borde `1.5px` `borde`, `--r-sm`, `padding: 12px 14px`, texto 17px (menos de 16px provoca zoom en iOS). Foco: borde `navy` + `outline: 2px solid var(--coral-texto)`. Error: borde `error`, fondo `error-suave`, mensaje debajo con el ícono, nunca solo color.

**Tarjeta** — fondo blanco, borde `1px` `linea`, `--r-md`, `--sh-card`. Si hay varias, **no pueden ser todas iguales**: distinto peso, distinto tamaño o distinto contenido. Una grilla de tres tarjetas idénticas está prohibida por esta guía.

**Navegación** — barra superior simple, logo a la izquierda (`logo.webp` sobre claro, `logo-oscuro.webp` sobre navy), links a la derecha, un solo CTA primario. Se vuelve `sticky` con fondo blanco y borde inferior `linea` después de `80px` de scroll. Abajo de `900px` los links de sección se ocultan y la barra queda en logo + CTA: con cuatro anclas en una página única, un menú desplegable agrega interacción y superficie de accesibilidad sin agregar alcance.

**Pie** — fondo `navy`, texto `linea`, logo oscuro, links a las apps (`mesa.`, `admin.`, `staff.`), contacto, `/privacidad`, y la línea del proyecto académico (UCC, ODS390-2026, el equipo). El pie es el lugar honesto para decir qué es MenYU hoy.

### Componentes de firma

Estos tres son lo que diferencia la página y se diseñan con el mismo cuidado que los botones.

**Secuencia del hero** — la cadena escanear → pedir → cocina → listo, corriendo en loop, con el cronómetro acumulado al lado. Usa `--t-op` para las etiquetas y los colores de estado de abajo.

**Comanda** — la réplica fiel del ticket que ve la cocina. `--r-sm`, borde `linea`, tipografía `--t-op`, números tabulares. Cambia de estado en vivo.

**Punto en vivo** — círculo de `8px` en `coral`, `--r-full`, con un halo que pulsa a 2s. Es el único elemento que se mueve de forma permanente en la página y marca que lo que se está viendo es tiempo real.

### Colores de estado del pedido

Mapeo fijo, el mismo que usa el producto:

| Estado | Color | Fondo |
|---|---|---|
| `PENDIENTE` | `--gris` | `--fondo` |
| `EN_PREPARACIÓN` | `--coral-texto` | `--coral-suave` |
| `LISTO` | `#1B6B4A` | `#E6F4EE` |
| `ENTREGADO` | `--navy` | `--linea` |

Ninguno se distingue solo por color: cada uno lleva su etiqueta en `--t-op`.

---

## 7. Imágenes e íconos

- **Íconos:** Lucide, trazo `1.5px`, tamaño `20px` o `24px`, alineados ópticamente al texto. Un solo set. **Emoji como ícono está prohibido.**
- **Capturas del producto:** son la imagen principal de la página. Reales, de staging con el seed cargado, en `--r-lg` con borde `linea`. Sin mockups de laptop flotando en perspectiva.
- **Fotografía de comida:** solo dentro de las capturas, donde ya vive en el producto. Nunca a sangre como fondo de sección.
- **Formato:** todo en `webp` con `width`/`height` explícitos para que no haya layout shift, y `loading="lazy"` abajo del pliegue.
- **El QR del hero tiene que ser escaneable de verdad** y llevar a `mesa.menyu-app.com`. Un QR decorativo en una página sobre QR es exactamente el detalle que un jurado prueba con el teléfono.

---

## 8. Lo que esta guía prohíbe

Lista corta, para revisar antes de dar algo por terminado:

1. Gradiente violeta-azul, o cualquier gradiente que no sea coral/navy de la marca.
2. Glassmorphism y `backdrop-filter`.
3. Tres tarjetas de feature idénticas en fila.
4. Todas las secciones centradas.
5. Emoji haciendo de ícono.
6. Texto con gradiente.
7. Tailwind por CDN, y fuentes desde el CDN de Google.
8. Métricas, testimonios, logos de clientes o cualquier prueba social inventada.
9. Coral como color de texto sobre blanco, o botón coral con texto blanco.
10. Que la página deje de tener sentido con el movimiento desactivado.

---

## 9. Tokens CSS

```css
:root {
  /* color */
  --navy: #242C58;
  --navy-hover: #323B6E;
  --coral: #ED6A4F;
  --coral-texto: #C43F26;
  --coral-suave: #FDE7E1;
  --gris: #5D6178;
  --borde: #8A8FA5;
  --linea: #E1E3EA;
  --fondo: #F5F6F9;
  --blanco: #FFFFFF;
  --error: #B3261E;
  --error-suave: #FCEEEC;

  /* estados del pedido */
  --estado-listo: #1B6B4A;
  --estado-listo-bg: #E6F4EE;

  /* tipografía */
  --f-display: 'Archivo', system-ui, sans-serif;
  --f-texto: 'Inter', system-ui, sans-serif;
  --t-display-xl: clamp(3rem, 8vw, 6.5rem);
  --t-display: clamp(2.25rem, 5vw, 4rem);
  --t-h2: clamp(1.75rem, 3.5vw, 2.75rem);
  --t-h3: 1.5rem;
  --t-body-lg: 1.1875rem;
  --t-body: 1.0625rem;
  --t-small: 0.9375rem;
  --t-op: 0.8125rem;

  /* espaciado */
  --s-1: 4px;   --s-2: 8px;   --s-3: 12px;  --s-4: 16px;  --s-5: 24px;
  --s-6: 32px;  --s-7: 48px;  --s-8: 64px;  --s-9: 96px;  --s-10: 128px;
  --ancho-contenido: 1200px;
  --ancho-texto: 68ch;
  --ritmo-seccion: clamp(80px, 10vw, 128px);

  /* forma */
  --r-sm: 4px; --r-md: 10px; --r-lg: 20px; --r-full: 999px;
  --sh-card: 0 1px 2px rgba(36,44,88,.06), 0 4px 12px rgba(36,44,88,.05);
  --sh-lift: 0 2px 4px rgba(36,44,88,.08), 0 12px 32px rgba(36,44,88,.10);

  /* movimiento */
  --d-rapido: 140ms; --d-medio: 240ms; --d-largo: 600ms;
  --e-salida: cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

---

## 10. Pendiente de decidir

- **Destino del CTA.** La página estática no recibe datos por sí sola. Opciones, de menor a mayor esfuerzo: Google Form embebido, Cloudflare Pages Function que postea al backend de Railway, o `mailto:`.
- **Corte de Archivo.** Si el variable completo pesa de más, se sirve una instancia estática de los dos anchos en uso (112 y 85) en lugar del archivo con ejes.
- **Referencias reales.** Esta dirección se decidió a partir de la marca, el producto y el argumento de venta, **no** comparando sitios reales: UXKIN no está conectado en esta sesión.
