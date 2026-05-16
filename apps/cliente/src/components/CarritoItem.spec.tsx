import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { useCarritoStore } from '../stores/useCarritoStore'
import { CarritoItem } from './CarritoItem'

jest.mock('../stores/useCarritoStore')

const mockStore = useCarritoStore as jest.MockedFunction<typeof useCarritoStore>

const mockQuitarItem = jest.fn()
const mockActualizarCantidad = jest.fn()

function setupStore(cantidad: number) {
  const state = {
    items: [{ id: '1', nombre: 'Empanada', precio: 500, cantidad }],
    quitarItem: mockQuitarItem,
    actualizarCantidad: mockActualizarCantidad,
  }
  mockStore.mockImplementation((selector: any) => selector(state))
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('CarritoItem', () => {
  describe('renderizado', () => {
    it('muestra el nombre del ítem', () => {
      setupStore(2)
      const item = { id: '1', nombre: 'Empanada', precio: 500, cantidad: 2 }
      const { getByText } = render(<CarritoItem item={item} />)
      expect(getByText('Empanada')).toBeTruthy()
    })

    it('muestra el precio unitario', () => {
      setupStore(2)
      const item = { id: '1', nombre: 'Empanada', precio: 500, cantidad: 2 }
      const { getByText } = render(<CarritoItem item={item} />)
      expect(getByText('$500.00 c/u')).toBeTruthy()
    })

    it('muestra el subtotal calculado (precio × cantidad)', () => {
      setupStore(3)
      const item = { id: '1', nombre: 'Empanada', precio: 500, cantidad: 3 }
      const { getByText } = render(<CarritoItem item={item} />)
      expect(getByText('Subtotal: $1500.00')).toBeTruthy()
    })

    it('muestra los controles de cantidad y el botón "Eliminar"', () => {
      setupStore(2)
      const item = { id: '1', nombre: 'Empanada', precio: 500, cantidad: 2 }
      const { getByText } = render(<CarritoItem item={item} />)
      expect(getByText('+')).toBeTruthy()
      expect(getByText('−')).toBeTruthy()
      expect(getByText('Eliminar')).toBeTruthy()
    })
  })

  describe('acción incrementar', () => {
    it('llama a actualizarCantidad con cantidad + 1 al presionar "+"', () => {
      setupStore(2)
      const item = { id: '1', nombre: 'Empanada', precio: 500, cantidad: 2 }
      const { getByText } = render(<CarritoItem item={item} />)

      fireEvent.press(getByText('+'))

      expect(mockActualizarCantidad).toHaveBeenCalledWith('1', 3)
    })
  })

  describe('acción decrementar', () => {
    it('llama a actualizarCantidad con cantidad - 1 al presionar "−" cuando cantidad > 1', () => {
      setupStore(4)
      const item = { id: '1', nombre: 'Empanada', precio: 500, cantidad: 4 }
      const { getByText } = render(<CarritoItem item={item} />)

      fireEvent.press(getByText('−'))

      expect(mockActualizarCantidad).toHaveBeenCalledWith('1', 3)
      expect(mockQuitarItem).not.toHaveBeenCalled()
    })

    it('llama a quitarItem al presionar "−" cuando cantidad es 1', () => {
      setupStore(1)
      const item = { id: '1', nombre: 'Empanada', precio: 500, cantidad: 1 }
      const { getByText } = render(<CarritoItem item={item} />)

      fireEvent.press(getByText('−'))

      expect(mockQuitarItem).toHaveBeenCalledWith('1')
      expect(mockActualizarCantidad).not.toHaveBeenCalled()
    })
  })

  describe('acción eliminar', () => {
    it('llama a quitarItem al presionar "Eliminar"', () => {
      setupStore(3)
      const item = { id: '1', nombre: 'Empanada', precio: 500, cantidad: 3 }
      const { getByText } = render(<CarritoItem item={item} />)

      fireEvent.press(getByText('Eliminar'))

      expect(mockQuitarItem).toHaveBeenCalledWith('1')
      expect(mockQuitarItem).toHaveBeenCalledTimes(1)
    })
  })
})
