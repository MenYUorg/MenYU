import { fireEvent, render, screen } from '@testing-library/react'
import { crearPlato, crearPlatoEnDescuento } from '../test/fixtures'
import { ItemCard } from './ItemCard'

describe('ItemCard', () => {
  describe('sin descuento', () => {
    it('muestra el nombre, la descripción y el precio', () => {
      render(<ItemCard item={crearPlato({ nombre: 'Milanesa', descripcion: 'Con papas fritas', precioBase: 1000 })} onPress={vi.fn()} />)

      expect(screen.getByText('Milanesa')).toBeInTheDocument()
      expect(screen.getByText('Con papas fritas')).toBeInTheDocument()
      expect(screen.getByText('$1000.00')).toBeInTheDocument()
    })

    it('no muestra el círculo del descuento ni un precio tachado', () => {
      const { container } = render(<ItemCard item={crearPlato()} onPress={vi.fn()} />)

      expect(screen.queryByRole('img', { name: /de descuento/ })).not.toBeInTheDocument()
      expect(container.querySelector('s')).toBeNull()
    })

    it('con una respuesta vieja del backend, sin campos de descuento, se ve igual', () => {
      const vieja = { ...crearPlato({ precioBase: 1000 }) } as Partial<ReturnType<typeof crearPlato>>
      delete vieja.precioDescuento
      delete vieja.porcentajeDescuento
      delete vieja.precioVigente

      const { container } = render(<ItemCard item={vieja as ReturnType<typeof crearPlato>} onPress={vi.fn()} />)

      expect(screen.getByText('$1000.00')).toBeInTheDocument()
      expect(container.querySelector('s')).toBeNull()
      expect(screen.queryByRole('img', { name: /de descuento/ })).not.toBeInTheDocument()
    })

    it('el precio base llega como texto (Decimal serializado) y el precio vigente como número', () => {
      render(<ItemCard item={crearPlato({ precioBase: '1250.00' as unknown as number, precioVigente: 1250 })} onPress={vi.fn()} />)

      expect(screen.getByText('$1250.00')).toBeInTheDocument()
    })
  })

  describe('con descuento', () => {
    const enDescuento = () => crearPlatoEnDescuento({ nombre: 'Hamburguesa', precioBase: 1000, precioDescuento: 800 })

    it('muestra el círculo con el porcentaje', () => {
      render(<ItemCard item={enDescuento()} onPress={vi.fn()} />)

      expect(screen.getByRole('img', { name: '20% de descuento' })).toHaveTextContent('-20%')
    })

    it('muestra el precio original tachado y el precio con descuento', () => {
      const { container } = render(<ItemCard item={enDescuento()} onPress={vi.fn()} />)

      expect(container.querySelector('s')).toHaveTextContent('$1000.00')
      expect(screen.getByText('$800.00')).toBeInTheDocument()
    })

    it('un lector de pantalla lee "Antes … ahora …"', () => {
      const { container } = render(<ItemCard item={enDescuento()} onPress={vi.fn()} />)

      expect(container).toHaveTextContent('Antes $1000.00, ahora $800.00')
    })

    it('el precio original tachado se lee bien aunque el precio base llegue como texto', () => {
      const plato = crearPlatoEnDescuento({ precioBase: '1000.00' as unknown as number, precioDescuento: 800 })
      const { container } = render(<ItemCard item={plato} onPress={vi.fn()} />)

      expect(container.querySelector('s')).toHaveTextContent('$1000.00')
    })

    it('el precio con descuento se escribe en naranja', () => {
      render(<ItemCard item={enDescuento()} onPress={vi.fn()} />)

      expect(screen.getByText('$800.00')).toHaveStyle({ color: '#E8563A' })
    })
  })

  describe('al tocar', () => {
    it('tocar la tarjeta llama a onPress una vez', () => {
      const onPress = vi.fn()
      render(<ItemCard item={crearPlato({ nombre: 'Milanesa' })} onPress={onPress} />)

      fireEvent.click(screen.getByText('Milanesa'))

      expect(onPress).toHaveBeenCalledTimes(1)
    })

    it('tocar el botón + llama a onPress una sola vez (no se propaga a la tarjeta)', () => {
      const onPress = vi.fn()
      render(<ItemCard item={crearPlato({ nombre: 'Milanesa' })} onPress={onPress} />)

      fireEvent.click(screen.getByRole('button', { name: 'Agregar Milanesa' }))

      expect(onPress).toHaveBeenCalledTimes(1)
    })
  })
})
