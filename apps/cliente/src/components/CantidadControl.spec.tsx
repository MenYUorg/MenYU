import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { useCarritoStore } from '../stores/useCarritoStore'
import { CantidadControl } from './CantidadControl'

jest.mock('../stores/useCarritoStore')

const mockStore = useCarritoStore as jest.MockedFunction<typeof useCarritoStore>

const onIncrement = jest.fn()
const onDecrement = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
})

describe('CantidadControl', () => {
  describe('renderizado', () => {
    it('muestra la cantidad leída del store', () => {
      mockStore.mockReturnValue(3)

      const { getByText } = render(
        <CantidadControl itemId="item-1" onIncrement={onIncrement} onDecrement={onDecrement} />,
      )

      expect(getByText('3')).toBeTruthy()
    })

    it('muestra 0 si el store devuelve 0', () => {
      mockStore.mockReturnValue(0)

      const { getByText } = render(
        <CantidadControl itemId="item-1" onIncrement={onIncrement} onDecrement={onDecrement} />,
      )

      expect(getByText('0')).toBeTruthy()
    })

    it('muestra los botones "+" y "−"', () => {
      mockStore.mockReturnValue(1)

      const { getByText } = render(
        <CantidadControl itemId="item-1" onIncrement={onIncrement} onDecrement={onDecrement} />,
      )

      expect(getByText('+')).toBeTruthy()
      expect(getByText('−')).toBeTruthy()
    })
  })

  describe('interacciones', () => {
    it('llama a onIncrement al presionar "+"', () => {
      mockStore.mockReturnValue(2)

      const { getByText } = render(
        <CantidadControl itemId="item-1" onIncrement={onIncrement} onDecrement={onDecrement} />,
      )

      fireEvent.press(getByText('+'))

      expect(onIncrement).toHaveBeenCalledTimes(1)
      expect(onDecrement).not.toHaveBeenCalled()
    })

    it('llama a onDecrement al presionar "−"', () => {
      mockStore.mockReturnValue(2)

      const { getByText } = render(
        <CantidadControl itemId="item-1" onIncrement={onIncrement} onDecrement={onDecrement} />,
      )

      fireEvent.press(getByText('−'))

      expect(onDecrement).toHaveBeenCalledTimes(1)
      expect(onIncrement).not.toHaveBeenCalled()
    })

    it('llama a onIncrement varias veces al presionar "+" varias veces', () => {
      mockStore.mockReturnValue(1)

      const { getByText } = render(
        <CantidadControl itemId="item-1" onIncrement={onIncrement} onDecrement={onDecrement} />,
      )

      fireEvent.press(getByText('+'))
      fireEvent.press(getByText('+'))
      fireEvent.press(getByText('+'))

      expect(onIncrement).toHaveBeenCalledTimes(3)
    })
  })
})
