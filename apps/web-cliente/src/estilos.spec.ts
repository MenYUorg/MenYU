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
  it('solo quita el anillo de foco de los <h1> que reciben el foco por código (tabindex -1)', () => {
    expect(selectoresQueQuitanElContorno(hojaDeEstilos)).toEqual(["h1[tabindex='-1']:focus"])
  })

  it('el selector coincide con el <h1> al que enfocarElTitulo le pone tabindex -1, y con nada más', () => {
    const titulo = document.createElement('h1')
    const otroTitulo = document.createElement('h1')
    const boton = document.createElement('button')
    titulo.setAttribute('tabindex', '-1')
    otroTitulo.setAttribute('tabindex', '0')
    boton.setAttribute('tabindex', '-1')
    document.body.append(titulo, otroTitulo, boton)

    try {
      titulo.focus()
      const [selector] = selectoresQueQuitanElContorno(hojaDeEstilos)

      expect(titulo.matches(selector)).toBe(true)
      expect(otroTitulo.matches(selector)).toBe(false)
      boton.focus()
      expect(boton.matches(selector)).toBe(false)
    } finally {
      titulo.remove()
      otroTitulo.remove()
      boton.remove()
    }
  })
})
