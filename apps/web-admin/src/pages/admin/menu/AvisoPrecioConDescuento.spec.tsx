import { render, screen } from '@testing-library/react'
import { AvisoPrecioConDescuento } from './AvisoPrecioConDescuento'

function renderAviso(precioTexto: string, porcentajeDescuento: number | null = 25) {
  return render(
    <AvisoPrecioConDescuento precioDescuento={1500} porcentajeDescuento={porcentajeDescuento} precioTexto={precioTexto} />,
  )
}

describe('AvisoPrecioConDescuento', () => {
  it('explica que el plato tiene un descuento activo y cuál es', () => {
    renderAviso('2000')

    expect(screen.getByText(/Este plato tiene un descuento activo/)).toHaveTextContent('$1.500')
    expect(screen.getByText(/Este plato tiene un descuento activo/)).toHaveTextContent('(-25%)')
    expect(screen.getByText(/el porcentaje se recalcula/)).toBeInTheDocument()
  })

  it('si no se conoce el porcentaje actual, igual muestra el precio con descuento', () => {
    renderAviso('2000', null)

    const aviso = screen.getByText(/Este plato tiene un descuento activo/)
    expect(aviso).toHaveTextContent('$1.500')
    expect(aviso).not.toHaveTextContent('%)')
  })

  it('con un precio base válido muestra en qué porcentaje queda el descuento', () => {
    renderAviso('3000') // 1500 sobre 3000 = 50%

    expect(screen.getByText(/pasa a ser de/)).toHaveTextContent('Con este precio base el descuento pasa a ser de -50%.')
  })

  it.each(['1500', '1000', '0'])(
    'un precio base de %s (menor o igual al precio con descuento) muestra el motivo',
    (precio) => {
      renderAviso(precio)

      expect(screen.getByText(/tiene que ser mayor al precio con descuento \(\$1\.500\)/)).toBeInTheDocument()
      expect(screen.queryByText(/pasa a ser de/)).not.toBeInTheDocument()
    },
  )

  it('si el descuento quedaría por debajo del 1%, lo avisa', () => {
    renderAviso('1501')

    expect(screen.getByText(/dejaría de ser válido/)).toBeInTheDocument()
  })

  it.each(['', 'abc', '-5'])('con el campo en "%s" no calcula nada', (precio) => {
    renderAviso(precio)

    expect(screen.queryByText(/pasa a ser de/)).not.toBeInTheDocument()
    expect(screen.queryByText(/dejaría de ser válido/)).not.toBeInTheDocument()
    expect(screen.queryByText(/tiene que ser mayor al precio con descuento \(/)).not.toBeInTheDocument()
  })

  it('acepta precios con decimales en el precio base', () => {
    renderAviso('1999.5')

    expect(screen.getByText(/pasa a ser de/)).toBeInTheDocument()
  })
})
