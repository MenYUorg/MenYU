# Landing de MenYU

Sitio estático de una sola página para `menyu-app.com`, servido como Worker de
Cloudflare con Static Assets. Sin build, sin dependencias, sin framework: lo que
está acá es lo que se publica.

## Estructura

```
index.html      la página
styles.css      tokens y estilos (ver DESIGN.md)
main.js         secuencia del hero, ciclo de la comanda, nav pegada, formulario
fonts/          Archivo e Inter variables, self-hosted
img/            logos, favicons y el QR
.assetsignore   lo que vive acá pero NO se publica (este README, DESIGN.md…)
DESIGN.md       la dirección visual y los tokens. Leer antes de tocar estilos.
```

La config del deploy está un nivel más arriba, en `../wrangler.jsonc`.

## Publicar

La publica **Cloudflare Workers Builds**, conectado al repo por Git: construye
con `../wrangler.jsonc` y publica sola. No hay que subir nada a mano.

> **Cuidado: publica en producción cualquier rama que se pushee, no solo
> `main`.** Observado el 2026-11-06: una rama sin mergear quedó en vivo. Si vas
> a pushear una rama que toca `landing/`, dalo por publicado.

Después de cada merge a `main` que toque `landing/`, el workflow
`smoke-landing.yml` espera a que Cloudflare publique ese commit y verifica lo
que quedó en vivo. No despliega nada: solo mira.

Desde `landing/` (no desde acá) se puede además:

```bash
npx wrangler@4.158.0 dev                # la sirve en local, igual que en producción
npx wrangler@4.158.0 deploy --dry-run   # valida la config sin publicar
npx wrangler@4.158.0 deploy             # publica a mano, si Cloudflare falla
```

`wrangler dev` es la forma correcta de probarla en local: respeta
`.assetsignore` y el manejo de 404, cosa que un servidor estático cualquiera no
hace.

El dominio público es **`menyu-app.com`**: es un *custom domain* del Worker,
apuntado desde el DNS de Cloudflare. `www.menyu-app.com` redirige con 301 a la
raíz, así que la URL canónica es sin `www` (es lo que dice el `og:url`). La URL
vieja `menyu.dantelojeda05.workers.dev` sigue viva y sirve exactamente lo mismo.

El Worker se llama `menyu`. **Cambiarle el nombre en `wrangler.jsonc` no lo
renombra**: publica un Worker nuevo en otra URL y deja el viejo andando.

## El formulario de contacto

Está conectado a **Web3Forms** y la configuración entera vive en el HTML, en el
`<form>` de `index.html`:

```html
<form ... method="post" action="https://api.web3forms.com/submit" novalidate>
  <input type="hidden" name="access_key" value="…">
```

- El `action` es el destino, y `access_key` la key de la cuenta de Web3Forms (se
  pide en web3forms.com con el mail donde querés recibir los leads). Esa key es
  pública por diseño: viaja en el cliente y se ve en el fuente.
- `main.js` lee el destino de ahí (`form.getAttribute('action')`): no hay nada
  que configurar en el JS.
- **Endpoint propio**: cambiar el `action` a `/api/contacto` y borrar el
  `access_key`. Como el sitio está desplegado como Worker, el handler va en el
  mismo Worker (no en `functions/`, que es de Pages).

El envío es un POST con JSON: `nombre`, `restaurante`, `email`, `telefono` y
`mensaje`, más `access_key`, `from_name` y `subject`. Sin JavaScript, el `action`
hace el POST nativo y Web3Forms responde con su propia confirmación.

El resultado se juzga por el campo `success` del body, no solo por el status:
Web3Forms puede responder 200 con `success: false` (una key sin verificar, por
ejemplo), y eso no es un envío que llegó. Cuando algo falla, la pantalla muestra
el aviso rojo y la consola el motivo real.

### El honeypot es un checkbox, y tiene que seguir siéndolo

El campo anti-bot es `botcheck`, el honeypot nativo de Web3Forms: si llega
tildado, Web3Forms descarta el envío del lado del servidor.

Antes era un `<input type="text" name="apellido-2">` oculto con `clip-path`, y
`main.js` descartaba el envío en el cliente si venía con contenido. No funcionó:
el autofill de Chrome reconocía "apellido" como el campo *surname* y lo rellenaba
igual —ignora `autocomplete="off"` en campos de nombre, y `clip-path` no esconde
nada del autofill—, así que el formulario se descartaba **en silencio**, sin
request ni mensaje. El autofill de perfil no puede tildar un checkbox.

De ahí salen dos reglas: el honeypot no vuelve a ser un campo de texto, y el
cliente no descarta envíos sin decirlo.

## Pendiente antes de salir a producción

1. **Email de contacto.** El pie usa `hola@menyu-app.com`, que todavía no existe.
   Cloudflare Email Routing lo resuelve gratis reenviando a una casilla real.

2. **Nombres del equipo.** El pie dice "De Marcos, Ojeda y Strumia Carrara".
   Completar con los nombres de pila.

3. **Capturas reales.** Las secciones "Cómo funciona" y "Panel" describen las
   pantallas pero no las muestran. Van capturas de staging con el seed cargado.

## La imagen de Open Graph

`img/og.png` (1200×630) se genera a partir de `og-template.html`, que usa las
mismas fuentes y tokens que la página. Para rehacerla después de un cambio de
copy o de marca: abrir ese archivo en el navegador y tomarle una captura de
1200×630. No es una página, así que no se publica: está en `.assetsignore`, y
por eso `wrangler dev` tampoco lo sirve. Abrilo directo desde el disco.

## Verificado

- Sin desborde horizontal ni errores de consola a 375, 768, 834 y 1440 px.
- Todo alcanzable por teclado, con foco visible en cada control.
- Con `prefers-reduced-motion: reduce` la página salta al estado final y
  mantiene el contenido completo.
- El QR decodifica a `https://mesa.menyu-app.com`.
- Contrastes AA: navy 13.3:1, gris 6.1:1 y coral-texto 5.1:1 sobre blanco.
  El coral de marca (3.1:1) nunca se usa como texto.
- Encabezados sin saltos de nivel.
- Formulario, contra la API de Web3Forms de verdad y por estilo computado, no por
  atributo: envío correcto (`POST` 200 con `success: true`, confirmación en
  pantalla y el foco en ella), validación sin request de red, fallo de la API
  (aviso rojo, botón repuesto, lo escrito intacto y el motivo real de Web3Forms
  en la consola), honeypot tildado (lo descarta el servidor: "Honeypot Error") y
  envío sin JavaScript (POST nativo a la página de éxito de Web3Forms).

## Una trampa a tener presente

`[hidden] { display: none !important }` en `styles.css` es necesario: sin esa
regla, cualquier `display: flex` de una clase le gana al `display: none` que el
navegador aplica a `[hidden]`, y un elemento marcado como oculto se sigue viendo.
Es lo que pasaba con el formulario y su confirmación. Si agregás un elemento que
se muestre y se oculte por atributo, verificá el estilo computado, no el atributo.
