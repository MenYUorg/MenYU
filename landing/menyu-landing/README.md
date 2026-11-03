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

1. **Destino del formulario.** `index.html` → `<form id="form-contacto" action="#">`.
   El `action` es lo único que hay que cambiar; el markup y los estilos quedan igual.
   - Sin backend: Web3Forms o Formspree, pegando la URL en el `action`.
   - Con backend: una Cloudflare Pages Function en `functions/api/contacto.js` que
     postee a Railway, y `action="/api/contacto"`.
   - Hasta que apunte a algún lado, `main.js` corta el envío en vez de fingir que llegó.

2. **Email de contacto.** El pie usa `hola@menyu-app.com`, que todavía no existe.

3. **Nombres del equipo.** El pie dice "De Marcos, Ojeda y Strumia Carrara".
   Completar con los nombres de pila.

4. **Capturas reales.** Las secciones "Cómo funciona" y "Panel" describen las
   pantallas pero no las muestran. Van capturas de staging con el seed cargado.

## Verificado

- Sin desborde horizontal ni errores de consola a 390, 834 y 1440 px.
- Todo alcanzable por teclado, con foco visible en cada control.
- Con `prefers-reduced-motion: reduce` la página salta al estado final y
  mantiene el contenido completo.
- El QR decodifica a `https://mesa.menyu-app.com`.
- Contrastes AA: navy 13.3:1, gris 6.1:1 y coral-texto 5.1:1 sobre blanco.
  El coral de marca (3.1:1) nunca se usa como texto.
