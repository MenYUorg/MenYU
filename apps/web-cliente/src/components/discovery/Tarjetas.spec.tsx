import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { crearOferta, crearRestaurante } from '../../test/fixtures'
import { iniciales } from '../../utils/iniciales'
import { CarruselOfertas } from './CarruselOfertas'
import { LogoRestaurante } from './LogoRestaurante'
import { TarjetaOferta } from './TarjetaOferta'
import { TarjetaRestaurante } from './TarjetaRestaurante'

const enRouter = (ui: React.ReactNode) =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={ui} />
        <Route path="/restaurante/:id" element={<p>pantalla del restaurante</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('iniciales', () => {
  it.each([
    ['La Parrilla del Puerto', 'LP'],
    ['Café Almendra', 'CA'],
    ['Ñandú Cocina Regional', 'ÑC'],
    ['Mesa', 'M'],
    ['  Burger   Lab  ', 'BL'],
    ['', ''],
  ])('"%s" → "%s"', (nombre, esperado) => {
    expect(iniciales(nombre)).toBe(esperado)
  })
})

describe('LogoRestaurante', () => {
  it('con logo muestra la imagen', () => {
    const { container } = render(<LogoRestaurante nombre="La Parrilla" logoUrl="https://x/logo.png" />)

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://x/logo.png')
  })

  it('sin logo muestra las iniciales', () => {
    const { container } = render(<LogoRestaurante nombre="La Parrilla del Puerto" logoUrl={null} />)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('LP')).toBeInTheDocument()
  })

  it('si la imagen no carga, pasa a las iniciales', () => {
    const { container } = render(<LogoRestaurante nombre="La Parrilla del Puerto" logoUrl="https://x/roto.png" />)

    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('LP')).toBeInTheDocument()
  })

  it('es un cuadrado del tamaño pedido y el logo entra entero (sin recortarse)', () => {
    const { container } = render(<LogoRestaurante nombre="X" logoUrl="https://x/logo.png" tamano={96} />)

    expect(container.firstElementChild).toHaveStyle({ width: '96px', height: '96px' })
    expect(container.querySelector('img')).toHaveStyle({ objectFit: 'contain' })
  })
})

describe('TarjetaRestaurante', () => {
  it('muestra el nombre y la dirección y lleva a la pantalla del restaurante', () => {
    enRouter(<TarjetaRestaurante restaurante={crearRestaurante({ id: 'abc', nombre: 'Pizzería Don Vito', direccion: 'Av. Corrientes 2840' })} />)

    const enlace = screen.getByRole('link')
    expect(enlace).toHaveAttribute('href', '/restaurante/abc')
    expect(screen.getByRole('heading', { name: 'Pizzería Don Vito' })).toBeInTheDocument()
    expect(screen.getByText('Av. Corrientes 2840')).toBeInTheDocument()

    fireEvent.click(enlace)
    expect(screen.getByText('pantalla del restaurante')).toBeInTheDocument()
  })

  it('sin dirección cargada lo dice', () => {
    enRouter(<TarjetaRestaurante restaurante={crearRestaurante({ direccion: null })} />)

    expect(screen.getByText('Dirección no cargada')).toBeInTheDocument()
  })

  it('con ofertas muestra cuántas (en singular y en plural) y sin ofertas no muestra nada', () => {
    const { unmount } = enRouter(<TarjetaRestaurante restaurante={crearRestaurante({ cantidadOfertas: 1 })} />)
    expect(screen.getByText('1 oferta')).toBeInTheDocument()
    unmount()

    const { unmount: segundo } = enRouter(<TarjetaRestaurante restaurante={crearRestaurante({ cantidadOfertas: 3 })} />)
    expect(screen.getByText('3 ofertas')).toBeInTheDocument()
    segundo()

    enRouter(<TarjetaRestaurante restaurante={crearRestaurante({ cantidadOfertas: 0 })} />)
    expect(screen.queryByText(/oferta/)).not.toBeInTheDocument()
  })

  it('un nombre sin espacios larguísimo se puede partir (no rompe la tarjeta)', () => {
    enRouter(<TarjetaRestaurante restaurante={crearRestaurante({ nombre: 'Superlargonombredelrestauranteparaprobarelcortedepalabras' })} />)

    expect(screen.getByRole('heading')).toHaveStyle({ overflowWrap: 'anywhere' })
  })
})

describe('TarjetaOferta', () => {
  it('muestra el nombre, el restaurante, el porcentaje y los dos precios', () => {
    const { container } = enRouter(
      <TarjetaOferta oferta={crearOferta({ nombre: 'Pizza muzzarella', restaurante: { id: 'rest-9', nombre: 'Pizzería Don Vito' }, precioBase: 6800, precioDescuento: 4760, precioVigente: 4760, porcentajeDescuento: 30 })} />,
    )

    expect(screen.getByText('Pizza muzzarella')).toBeInTheDocument()
    expect(screen.getByText('Pizzería Don Vito')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '30% de descuento' })).toHaveTextContent('-30%')
    expect(container.querySelector('s')).toHaveTextContent('$6800.00')
    expect(screen.getByText('$4760.00')).toBeInTheDocument()
  })

  it('tocarla abre la pantalla de su restaurante (no la de otro)', () => {
    enRouter(<TarjetaOferta oferta={crearOferta({ restaurante: { id: 'rest-9', nombre: 'Pizzería Don Vito' } })} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', '/restaurante/rest-9')
  })

  it('no tiene botón "+" (no se pide desde acá)', () => {
    enRouter(<TarjetaOferta oferta={crearOferta()} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('sin foto muestra el placeholder de la app', () => {
    enRouter(<TarjetaOferta oferta={crearOferta({ imagenUrl: null, nombre: 'Papas rústicas' })} />)

    expect(screen.getByRole('img', { name: 'Papas rústicas' })).toBeInTheDocument()
  })

  it('un descuento del 99 % y uno del 1 % se ven completos', () => {
    const { unmount } = enRouter(<TarjetaOferta oferta={crearOferta({ porcentajeDescuento: 99, precioBase: 125000, precioDescuento: 1250, precioVigente: 1250 })} />)
    expect(screen.getByRole('img', { name: '99% de descuento' })).toBeInTheDocument()
    unmount()

    enRouter(<TarjetaOferta oferta={crearOferta({ porcentajeDescuento: 1, precioBase: 9000, precioDescuento: 8910, precioVigente: 8910 })} />)
    expect(screen.getByRole('img', { name: '1% de descuento' })).toBeInTheDocument()
  })
})

describe('CarruselOfertas', () => {
  const ofertas = [crearOferta({ id: 'o1', nombre: 'Uno' }), crearOferta({ id: 'o2', nombre: 'Dos' }), crearOferta({ id: 'o3', nombre: 'Tres' })]

  it('muestra todas las ofertas en el orden en que llegan', () => {
    enRouter(<CarruselOfertas ofertas={ofertas} />)

    expect(screen.getAllByRole('link').map((a) => a.textContent)).toEqual([
      expect.stringContaining('Uno'),
      expect.stringContaining('Dos'),
      expect.stringContaining('Tres'),
    ])
  })

  it('las flechas (que solo se ven en escritorio) desplazan el carrusel', () => {
    enRouter(<CarruselOfertas ofertas={ofertas} />)
    const pista = screen.getByTestId('carrusel-ofertas')
    Object.defineProperty(pista, 'clientWidth', { value: 500, configurable: true })
    const scrollBy = vi.fn()
    pista.scrollBy = scrollBy

    fireEvent.click(screen.getByRole('button', { name: 'Más ofertas' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ofertas anteriores' }))

    expect(scrollBy).toHaveBeenNthCalledWith(1, { left: 400, behavior: 'smooth' })
    expect(scrollBy).toHaveBeenNthCalledWith(2, { left: -400, behavior: 'smooth' })
  })
})
