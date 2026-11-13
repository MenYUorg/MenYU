import { act } from '@testing-library/react'
import { enfocarElTitulo, enfocarElTituloCuandoAparezca, enfocarEncabezado, MS_PARA_ENCONTRAR_EL_TITULO } from './enfocarTitulo'

function agregarTitulo(texto = 'Carrito'): HTMLHeadingElement {
  const titulo = document.createElement('h1')
  titulo.textContent = texto
  document.body.appendChild(titulo)
  return titulo
}

/** El observador de mutaciones avisa en una micro-tarea: se deja correr antes de mirar. */
const dejarCorrer = () => act(async () => { await Promise.resolve() })

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('enfocarElTitulo', () => {
  it('le da el foco al <h1> y lo deja fuera del orden del Tab', () => {
    const titulo = agregarTitulo()

    expect(enfocarElTitulo()).toBe(true)

    expect(document.activeElement).toBe(titulo)
    expect(titulo).toHaveAttribute('tabindex', '-1')
  })

  it('respeta el tabindex que el <h1> ya tenga', () => {
    const titulo = agregarTitulo()
    titulo.setAttribute('tabindex', '0')

    enfocarElTitulo()

    expect(titulo).toHaveAttribute('tabindex', '0')
  })

  it('sin <h1> no hace nada', () => {
    expect(enfocarElTitulo()).toBe(false)
    expect(document.activeElement).toBe(document.body)
  })

  it('con varios, enfoca el primero', () => {
    const primero = agregarTitulo('Uno')
    agregarTitulo('Dos')

    enfocarElTitulo()

    expect(document.activeElement).toBe(primero)
  })
})

describe('enfocarElTituloCuandoAparezca', () => {
  it('si el <h1> ya está, lo enfoca enseguida', () => {
    const titulo = agregarTitulo()

    enfocarElTituloCuandoAparezca()

    expect(document.activeElement).toBe(titulo)
  })

  it('si todavía no está, espera a que la pantalla lo pinte y lo enfoca', async () => {
    enfocarElTituloCuandoAparezca()
    expect(document.activeElement).toBe(document.body)

    const titulo = agregarTitulo()
    await dejarCorrer()

    expect(document.activeElement).toBe(titulo)
  })

  it('una vez que lo enfocó deja de mirar: un segundo <h1> no le saca el foco', async () => {
    enfocarElTituloCuandoAparezca()
    const primero = agregarTitulo('Uno')
    await dejarCorrer()

    document.body.prepend(document.createElement('h1'))
    await dejarCorrer()

    expect(document.activeElement).toBe(primero)
  })

  it('si el <h1> no aparece en el tiempo previsto, deja de esperar', async () => {
    vi.useFakeTimers()
    enfocarElTituloCuandoAparezca()

    act(() => { vi.advanceTimersByTime(MS_PARA_ENCONTRAR_EL_TITULO) })
    agregarTitulo()
    await dejarCorrer()

    expect(document.activeElement).toBe(document.body)
  })

  it('si la persona toca antes de que llegue, el foco ya es suyo y no se lo saca', async () => {
    enfocarElTituloCuandoAparezca()

    document.dispatchEvent(new Event('pointerdown'))
    agregarTitulo()
    await dejarCorrer()

    expect(document.activeElement).toBe(document.body)
  })

  it('lo mismo si escribe', async () => {
    enfocarElTituloCuandoAparezca()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    agregarTitulo()
    await dejarCorrer()

    expect(document.activeElement).toBe(document.body)
  })

  it('devuelve cómo cancelar la espera (cuando se sale de la pantalla antes de que llegue)', async () => {
    const cancelar = enfocarElTituloCuandoAparezca()

    cancelar()
    agregarTitulo()
    await dejarCorrer()

    expect(document.activeElement).toBe(document.body)
  })
})

describe('enfocarEncabezado', () => {
  it('le da el foco al encabezado y lo deja fuera del orden del Tab', () => {
    const encabezado = document.createElement('h2')
    document.body.appendChild(encabezado)

    enfocarEncabezado(encabezado)

    expect(document.activeElement).toBe(encabezado)
    expect(encabezado).toHaveAttribute('tabindex', '-1')
  })

  it('no mueve la pantalla: el desplazamiento lo hace quien llama (focus con preventScroll)', () => {
    const encabezado = document.createElement('h2')
    document.body.appendChild(encabezado)
    const foco = vi.spyOn(encabezado, 'focus')

    enfocarEncabezado(encabezado)

    expect(foco).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('respeta el tabindex que el encabezado ya tenga', () => {
    const encabezado = document.createElement('h2')
    encabezado.setAttribute('tabindex', '0')
    document.body.appendChild(encabezado)

    enfocarEncabezado(encabezado)

    expect(encabezado).toHaveAttribute('tabindex', '0')
  })

  it('sin encabezado (no hay sección, o no tiene título) no hace nada ni falla', () => {
    expect(() => enfocarEncabezado(null)).not.toThrow()
    expect(() => enfocarEncabezado(undefined)).not.toThrow()
    expect(document.activeElement).toBe(document.body)
  })
})
