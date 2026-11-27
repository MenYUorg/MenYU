import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GRIS_TEXTO, razonDeContraste } from '@menyu/ui'
import { C } from './theme'

// Se lee del disco: Vitest no procesa los .css (un `?raw` devolvería el texto vacío). Sin `new URL(…, import.meta.url)`:
// Vite reescribe ese patrón como la URL de un asset.
const hojaDeEstilos = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'index.css'), 'utf8')

/** Los selectores de las reglas de la hoja que quitan el contorno (`outline: none` o `outline: 0`). */
function selectoresQueQuitanElContorno(css: string): string[] {
  // Sin comentarios ni directivas (`@tailwind base;`), que no son reglas y se pegarían al selector que sigue.
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[\w-]+[^{};]*;/g, '')
  const reglas = [...sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  return reglas
    .filter(([, , declaraciones]) => /outline\s*:\s*(none|0)\b/.test(declaraciones))
    .map(([, selector]) => selector.trim())
}

/** El bloque de declaraciones de la regla cuyo selector es exactamente `selector` (sin comentarios). */
function declaracionesDe(css: string, seleccion: (selector: string) => boolean): string | undefined {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@[\w-]+[^{};]*;/g, '')
  return [...sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, selector]) => seleccion(selector.trim()))?.[2]
}

describe('index.css: el anillo de foco de los controles (WCAG 2.4.7)', () => {
  const esLaReglaDelAnillo = (selector: string) => selector.endsWith(':focus-visible') && selector.startsWith(':is(')
  const declaraciones = declaracionesDe(hojaDeEstilos, esLaReglaDelAnillo)

  it('hay una regla de :focus-visible que dibuja un contorno de 2 px, separado, con un aro blanco entre el control y el contorno', () => {
    expect(declaraciones).toBeDefined()
    expect(declaraciones).toMatch(/outline\s*:\s*2px solid theme\('colors\.navy'\)/)
    expect(declaraciones).toMatch(/outline-offset\s*:\s*2px/)
    expect(declaraciones).toMatch(/box-shadow\s*:\s*0 0 0 2px #ffffff/i)
  })

  it('el selector alcanza a los controles (enlace con href, botón, campos, interruptor, casilla, tabindex 0) y no a lo demás', () => {
    const regla = [...hojaDeEstilos.matchAll(/(:is\([\s\S]*?\)):focus-visible\s*\{/g)][0][1]
    const crear = (html: string) => {
      const contenedor = document.createElement('div')
      contenedor.innerHTML = html
      document.body.append(contenedor)
      return contenedor
    }
    const contenedor = crear(`
      <a href="/x" id="enlace">e</a><a id="ancla">a</a><button id="boton">b</button><input id="campo"><textarea id="area"></textarea><select id="lista"></select>
      <div role="switch" id="interruptor" tabindex="0"></div><div role="checkbox" id="casilla" tabindex="0"></div><div id="foco0" tabindex="0"></div>
      <div id="contenedor" tabindex="-1"></div><h1 id="titulo" tabindex="-1">t</h1><h2 id="seccion" tabindex="-1">s</h2><p id="parrafo">p</p>
    `)
    try {
      const alcanza = (id: string) => contenedor.querySelector(`#${id}`)!.matches(regla)
      for (const id of ['enlace', 'boton', 'campo', 'area', 'lista', 'interruptor', 'casilla', 'foco0']) expect(alcanza(id), id).toBe(true)
      for (const id of ['ancla', 'contenedor', 'titulo', 'seccion', 'parrafo']) expect(alcanza(id), id).toBe(false)
    } finally {
      contenedor.remove()
    }
  })

  it('va dentro de @layer base (Tailwind la pone antes de sus utilidades; una clase igual no la pisa sin `!`: tiene más especificidad)', () => {
    expect(hojaDeEstilos).toMatch(/@layer base\s*\{\s*:is\(/)
  })
})

describe('index.css: el texto de ejemplo de los campos (WCAG 1.4.3)', () => {
  const declaraciones = declaracionesDe(hojaDeEstilos, (selector) => selector.replace(/\s+/g, ' ') === 'input::placeholder, textarea::placeholder')
  const color = declaraciones?.match(/color\s*:\s*(#[0-9a-f]{6})/i)?.[1]

  it('hay una regla para los campos de una línea y los de varias, y va en @layer base', () => {
    expect(declaraciones).toBeDefined()
    expect(hojaDeEstilos).toMatch(/@layer base\s*\{\s*input::placeholder/)
    expect(declaraciones).toMatch(/opacity\s*:\s*1\b/)
  })

  it('es el gris de los textos chicos de la app: un solo gris, y no el de fábrica de Tailwind', () => {
    expect(color?.toUpperCase()).toBe(GRIS_TEXTO)
  })

  it.each([
    ['blanco (el campo de nombre, de PIN y el de una pregunta con el foco)', C.white],
    ['el gris de la página (el buscador del menú y el campo de la pregunta al asistente)', C.bg],
  ])('llega a 4,5:1 sobre %s', (_donde, fondo) => {
    expect(razonDeContraste(GRIS_TEXTO, fondo)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('index.css: el foco visible', () => {
  it('solo quita el anillo de foco de los <h1> y <h2> que reciben el foco por código (tabindex -1)', () => {
    const selectores = selectoresQueQuitanElContorno(hojaDeEstilos)

    expect(selectores).toHaveLength(1)
    expect(selectores[0].split(',').map((s) => s.trim())).toEqual(["h1[tabindex='-1']:focus", "h2[tabindex='-1']:focus"])
  })

  it('el selector coincide con el <h1> y el <h2> a los que se les pone tabindex -1, y con nada más', () => {
    const titulo = document.createElement('h1')
    const seccion = document.createElement('h2')
    const tituloDelTab = document.createElement('h1')
    const subtitulo = document.createElement('h3')
    const boton = document.createElement('button')
    titulo.setAttribute('tabindex', '-1')
    seccion.setAttribute('tabindex', '-1')
    tituloDelTab.setAttribute('tabindex', '0')
    subtitulo.setAttribute('tabindex', '-1')
    boton.setAttribute('tabindex', '-1')
    const elementos = [titulo, seccion, tituloDelTab, subtitulo, boton]
    document.body.append(...elementos)

    try {
      const [selector] = selectoresQueQuitanElContorno(hojaDeEstilos)

      titulo.focus()
      expect(titulo.matches(selector)).toBe(true)
      seccion.focus()
      expect(seccion.matches(selector)).toBe(true)
      for (const otro of [tituloDelTab, subtitulo, boton]) {
        otro.focus()
        expect(otro.matches(selector)).toBe(false)
      }
    } finally {
      for (const elemento of elementos) elemento.remove()
    }
  })
})
