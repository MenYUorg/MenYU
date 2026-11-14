import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
