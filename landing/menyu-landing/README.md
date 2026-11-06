# Landing de MenYU

Sitio estático de una sola página para `menyu-app.com`, pensado para Cloudflare Pages.
Sin build, sin dependencias, sin framework: lo que está acá es lo que se publica.

## Estructura

```
index.html      la página
styles.css      tokens y estilos (ver DESIGN.md)
main.js         secuencia del hero, ciclo de la comanda, nav pegada
fonts/          Archivo e Inter variables, self-hosted
img/            logos, favicons y el QR
DESIGN.md       la dirección visual y los tokens. Leer antes de tocar estilos.
```

## Publicar en Cloudflare Pages

Subida directa: arrastrar esta carpeta (sin `node_modules`, `preview/` ni
`build-preview.mjs`) a un proyecto nuevo de Pages. No hay comando de build ni
directorio de salida que configurar.

Desde Git: build command vacío, output directory la raíz del proyecto.

## Pendiente antes de salir a producción

1. **Destino del formulario.** Es una línea, en `main.js`:

   ```js
   var DESTINO = '';            // ← acá
   var CLAVE_WEB3FORMS = '';
   ```

   - **Web3Forms** (sin backend): pedir la access key en web3forms.com con el mail
     donde querés recibir los leads, y poner
     `DESTINO = 'https://api.web3forms.com/submit'` más la key en `CLAVE_WEB3FORMS`.
   - **Endpoint propio**: `DESTINO = '/api/contacto'`, dejando `CLAVE_WEB3FORMS`
     vacía, y un handler que reciba el JSON. Como el sitio está desplegado como
     Worker, el handler va en el mismo Worker (no en `functions/`, que es de Pages).

   El formulario manda un POST con JSON: `nombre`, `restaurante`, `email`,
   `telefono` y `mensaje`. Con la key de Web3Forms agrega además `access_key`,
   `subject` y `from_name`. Mientras `DESTINO` esté vacío, el formulario avisa
   que todavía no está conectado en vez de fingir que el mensaje llegó.

2. **Email de contacto.** El pie usa `hola@menyu-app.com`, que todavía no existe.
   Cloudflare Email Routing lo resuelve gratis reenviando a una casilla real.

3. **Nombres del equipo.** El pie dice "De Marcos, Ojeda y Strumia Carrara".
   Completar con los nombres de pila.

4. **URLs absolutas de Open Graph.** `index.html` tiene `og:url` y `og:image`
   apuntando a `menyu.dantelojeda05.workers.dev`. Al mudar la landing al dominio
   propio hay que cambiar las dos: una URL relativa no sirve, varios lectores de
   previsualización no la resuelven.

5. **Capturas reales.** Las secciones "Cómo funciona" y "Panel" describen las
   pantallas pero no las muestran. Van capturas de staging con el seed cargado.

## La imagen de Open Graph

`img/og.png` (1200×630) se genera a partir de `og-template.html`, que usa las
mismas fuentes y tokens que la página. Para rehacerla después de un cambio de
copy o de marca: servir la carpeta y tomarle una captura de 1200×630 a ese
archivo. El template no se publica; es solo la fuente de la imagen.

## Verificado

- Sin desborde horizontal ni errores de consola a 375, 768, 834 y 1440 px.
- Todo alcanzable por teclado, con foco visible en cada control.
- Con `prefers-reduced-motion: reduce` la página salta al estado final y
  mantiene el contenido completo.
- El QR decodifica a `https://mesa.menyu-app.com`.
- Contrastes AA: navy 13.3:1, gris 6.1:1 y coral-texto 5.1:1 sobre blanco.
  El coral de marca (3.1:1) nunca se usa como texto.
- Encabezados sin saltos de nivel.
- Formulario: los cuatro caminos (validación, sin destino, respuesta 200 y
  respuesta 500) probados por estilo computado, no por atributo. Al enviar bien,
  el foco pasa a la confirmación; al fallar, el formulario conserva lo escrito.

## Una trampa a tener presente

`[hidden] { display: none !important }` en `styles.css` es necesario: sin esa
regla, cualquier `display: flex` de una clase le gana al `display: none` que el
navegador aplica a `[hidden]`, y un elemento marcado como oculto se sigue viendo.
Es lo que pasaba con el formulario y su confirmación. Si agregás un elemento que
se muestre y se oculte por atributo, verificá el estilo computado, no el atributo.
