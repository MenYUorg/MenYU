import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { useCarritoStore } from '../stores/useCarritoStore'
import { MenuItemCard } from './MenuItemCard'

jest.mock('../stores/useCarritoStore')

const mockStore = useCarritoStore as jest.MockedFunction<typeof useCarritoStore>

const mockAgregarItem = jest.fn()
const mockQuitarItem = jest.fn()
const mockActualizarCantidad = jest.fn()

const itemBase = { id: '1', nombre: 'Milanesa napolitana', precio: 1200 }

function setupStore(cantidad: number) {
  const state = {
    items: cantidad > 0 ? [{ ...itemBase, cantidad }] : [],
    agregarItem: mockAgregarItem,
    quitarItem: mockQuitarItem,
    actualizarCantidad: mockActualizarCantidad,
  }
  mockStore.mockImplementation((selector: any) => selector(state))
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('MenuItemCard', () => {
  describe('renderizado', () => {
    it('muestra el nombre del ítem', () => {
      setupStore(0)
      const { getByText } = render(<MenuItemCard item={itemBase} />)
      expect(getByText('Milanesa napolitana')).toBeTruthy()
    })

    it('muestra el precio formateado', () => {
      setupStore(0)
      const { getByText } = render(<MenuItemCard item={itemBase} />)
      expect(getByText('$1200.00')).toBeTruthy()
    })

    it('muestra el botón "Agregar" cuando cantidad es 0', () => {
      setupStore(0)
      const { getByText, queryByText } = render(<MenuItemCard item={itemBase} />)
      expect(getByText('Agregar')).toBeTruthy()
      expect(queryByText('+')).toBeNull()
    })

    it('muestra CantidadControl cuando cantidad > 0', () => {
      setupStore(2)
      const { getByText, queryByText } = render(<MenuItemCard item={itemBase} />)
      expect(getByText('+')).toBeTruthy()
      expect(getByText('−')).toBeTruthy()
      expect(queryByText('Agregar')).toBeNull()
    })
  })

  describe('acción agregar (cantidad = 0)', () => {
    it('llama a agregarItem con el ítem al presionar "Agregar"', () => {
      setupStore(0)
      const { getByText } = render(<MenuItemCard item={itemBase} />)

      fireEvent.press(getByText('Agregar'))

      expect(mockAgregarItem).toHaveBeenCalledWith(itemBase)
      expect(mockAgregarItem).toHaveBeenCalledTimes(1)
    })
  })

  describe('acción incrementar (cantidad > 0)', () => {
    it('llama a actualizarCantidad con cantidad + 1 al presionar "+"', () => {
      setupStore(2)
      const { getByText } = render(<MenuItemCard item={itemBase} />)

      fireEvent.press(getByText('+'))

      expect(mockActualizarCantidad).toHaveBeenCalledWith('1', 3)
    })
  })

  describe('acción decrementar (cantidad > 0)', () => {
    it('llama a actualizarCantidad con cantidad - 1 al presionar "−" cuando cantidad > 1', () => {
      setupStore(3)
      const { getByText } = render(<MenuItemCard item={itemBase} />)

      fireEvent.press(getByText('−'))

      expect(mockActualizarCantidad).toHaveBeenCalledWith('1', 2)
      expect(mockQuitarItem).not.toHaveBeenCalled()
    })

    it('llama a quitarItem al presionar "−" cuando cantidad es 1', () => {
      setupStore(1)
      const { getByText } = render(<MenuItemCard item={itemBase} />)

      fireEvent.press(getByText('−'))

      expect(mockQuitarItem).toHaveBeenCalledWith('1')
      expect(mockActualizarCantidad).not.toHaveBeenCalled()
    })
  })
})
