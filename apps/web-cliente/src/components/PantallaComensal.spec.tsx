import { fireEvent, render, screen } from '@testing-library/react'
import { axe } from '../test/axe'
import { EncabezadoPantalla, InsigniaMesa, MarcoPantalla } from './PantallaComensal'

const encabezado = (extra: Partial<Parameters<typeof EncabezadoPantalla>[0]> = {}) => (
  <EncabezadoPantalla titulo="Carrito" onVolver={() => {}} etiquetaVolver="Volver al menú" {...extra} />
)

describe('EncabezadoPantalla', () => {
  it('el título es el <h1> y la flecha es un botón con nombre que llama a onVolver', () => {
    const onVolver = vi.fn()
    render(encabezado({ onVolver }))

    expect(screen.getByRole('heading', { level: 1, name: 'Carrito' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver al menú' }))
    expect(onVolver).toHaveBeenCalledTimes(1)
  })

  it('lo que va a la derecha se muestra; sin nada queda un espacio para centrar el título', () => {
    const { container, rerender } = render(encabezado({ derecha: <InsigniaMesa numero={5} /> }))
    expect(screen.getByText('Mesa 5')).toBeInTheDocument()

    rerender(encabezado())
    expect(screen.queryByText(/Mesa/)).not.toBeInTheDocument()
    expect(container.querySelector('header > div')).toHaveStyle({ width: '38px' })
  })

  describe('el área de toque de la flecha (WCAG 2.5.8)', () => {
    it('se toca como un botón de 44 × 44 px', () => {
      render(encabezado())

      expect(screen.getByRole('button', { name: 'Volver al menú' })).toHaveStyle({ minWidth: '44px', minHeight: '44px' })
    })

    it('los márgenes negativos compensan el área de más: en el encabezado ocupa 27 × 26 px, como antes, y la flecha no se corre', () => {
      render(encabezado())
      const flecha = screen.getByRole('button', { name: 'Volver al menú' })

      // Ancho: 44 (mínimo) - 8 (margen izquierdo) - 9 (margen derecho) = 27. Alto: 44 - 9 - 9 = 26. Y el relleno de la izquierda
      // (8) cancela el margen izquierdo (-8): la flecha queda a 16 px del borde, como antes.
      expect(flecha).toHaveStyle({ margin: '-9px -9px -9px -8px', padding: '0 0 0 8px' })
    })
  })

  describe('inerte', () => {
    it('por defecto no lo es', () => {
      render(encabezado())

      expect(screen.getByRole('banner')).not.toHaveAttribute('inert')
    })

    it('con un diálogo abierto, el encabezado queda inerte (sin foco ni lectura)', () => {
      render(encabezado({ inerte: true }))

      expect(screen.getByRole('banner', { hidden: true })).toHaveAttribute('inert')
    })
  })

  it('no tiene violaciones de accesibilidad (axe)', async () => {
    const { container } = render(<MarcoPantalla ancho={480} encabezado={encabezado({ derecha: <InsigniaMesa numero={5} /> })}><p>contenido</p></MarcoPantalla>)

    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('InsigniaMesa', () => {
  it.each([[5, 'Mesa 5'], ['12', 'Mesa 12'], [null, 'Mesa'], [undefined, 'Mesa']])('con %s dice "%s"', (numero, texto) => {
    render(<InsigniaMesa numero={numero} />)

    expect(screen.getByText(texto)).toBeInTheDocument()
  })
})

describe('MarcoPantalla', () => {
  it('pone el encabezado afuera del <main> y el contenido adentro', () => {
    render(<MarcoPantalla ancho={520} encabezado={encabezado()}><p>contenido</p></MarcoPantalla>)

    expect(screen.getByRole('main')).toContainElement(screen.getByText('contenido'))
    expect(screen.getByRole('main')).not.toContainElement(screen.getByRole('banner'))
  })
})
