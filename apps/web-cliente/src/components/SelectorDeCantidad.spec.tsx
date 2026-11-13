import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { axe } from '../test/axe'
import { useAnunciadorStore } from '../utils/anunciador'
import { SelectorDeCantidad } from './SelectorDeCantidad'

type Props = Parameters<typeof SelectorDeCantidad>[0]

/** El selector con su estado, como lo usa la pantalla del detalle (que guarda la cantidad). */
function ConEstado({ inicial = 0, ...props }: Partial<Props> & { inicial?: number }) {
  const [valor, setValor] = useState(inicial)
  return (
    <div>
      <SelectorDeCantidad nombre="Cheddar" {...props} valor={valor} onCambiar={setValor} />
    </div>
  )
}

const restar = (nombre = 'Cheddar') => screen.getByRole('button', { name: `Restar ${nombre}` })
const sumar = (nombre = 'Cheddar') => screen.getByRole('button', { name: `Sumar ${nombre}` })
const anunciado = () => useAnunciadorStore.getState().mensaje

beforeEach(() => {
  useAnunciadorStore.setState({ mensaje: '', numero: 0 })
})

describe('SelectorDeCantidad', () => {
  describe('los botones dicen qué cuentan', () => {
    it('se llaman "Sumar {nombre}" y "Restar {nombre}", y el signo es decorativo', () => {
      render(<ConEstado nombre="Hamburguesa doble" />)

      expect(sumar('Hamburguesa doble')).toBeInTheDocument()
      expect(restar('Hamburguesa doble')).toBeInTheDocument()
      expect(sumar('Hamburguesa doble').querySelector('[aria-hidden="true"]')).toHaveTextContent('+')
      expect(restar('Hamburguesa doble').querySelector('[aria-hidden="true"]')).toHaveTextContent('−')
    })

    it('muestra la cantidad en el medio', () => {
      render(<ConEstado inicial={2} />)

      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('dos selectores en la misma pantalla se distinguen por su nombre', () => {
      render(<><ConEstado nombre="Cheddar" /><ConEstado nombre="Panceta" /></>)

      expect(sumar('Cheddar')).toBeInTheDocument()
      expect(sumar('Panceta')).toBeInTheDocument()
    })
  })

  describe('al cambiar', () => {
    it('suma y resta de a uno y muestra el valor nuevo', () => {
      render(<ConEstado inicial={1} />)

      fireEvent.click(sumar())
      fireEvent.click(sumar())
      expect(screen.getByText('3')).toBeInTheDocument()

      fireEvent.click(restar())
      expect(screen.getByText('2')).toBeInTheDocument()
    })

    it('anuncia el valor nuevo con el nombre: "Cheddar: 1"', () => {
      render(<ConEstado />)

      fireEvent.click(sumar())

      expect(anunciado()).toBe('Cheddar: 1')
    })

    it('también al restar, y cada cambio se anuncia aparte', () => {
      render(<ConEstado inicial={2} />)

      fireEvent.click(restar())
      expect(anunciado()).toBe('Cheddar: 1')
      fireEvent.click(restar())
      expect(anunciado()).toBe('Cheddar: 0')

      expect(useAnunciadorStore.getState().numero).toBe(2)
    })

    it('le pasa a la pantalla la cantidad nueva', () => {
      const alCambiar = vi.fn()
      render(<SelectorDeCantidad nombre="Cheddar" valor={4} onCambiar={alCambiar} />)

      fireEvent.click(sumar())
      fireEvent.click(restar())

      expect(alCambiar).toHaveBeenNthCalledWith(1, 5)
      expect(alCambiar).toHaveBeenNthCalledWith(2, 3)
    })
  })

  describe('en el mínimo y en el máximo', () => {
    it('en el mínimo (0 por defecto) "Restar" queda atenuado, no hace nada y no anuncia', () => {
      const alCambiar = vi.fn()
      render(<SelectorDeCantidad nombre="Cheddar" valor={0} onCambiar={alCambiar} />)

      expect(restar()).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(restar())

      expect(alCambiar).not.toHaveBeenCalled()
      expect(anunciado()).toBe('')
    })

    it('un mínimo distinto (1) también corta ahí', () => {
      const alCambiar = vi.fn()
      render(<SelectorDeCantidad nombre="Hamburguesa" valor={1} minimo={1} onCambiar={alCambiar} />)

      expect(restar('Hamburguesa')).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(restar('Hamburguesa'))

      expect(alCambiar).not.toHaveBeenCalled()
    })

    it('en el máximo "Sumar" queda atenuado, no hace nada y no anuncia', () => {
      const alCambiar = vi.fn()
      render(<SelectorDeCantidad nombre="Cheddar" valor={3} maximo={3} onCambiar={alCambiar} />)

      expect(sumar()).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(sumar())

      expect(alCambiar).not.toHaveBeenCalled()
      expect(anunciado()).toBe('')
    })

    it('entre el mínimo y el máximo los dos botones están activos', () => {
      render(<ConEstado inicial={1} maximo={3} />)

      expect(restar()).toHaveAttribute('aria-disabled', 'false')
      expect(sumar()).toHaveAttribute('aria-disabled', 'false')
    })

    it('sin máximo, "Sumar" nunca se apaga', () => {
      render(<ConEstado inicial={500} />)

      expect(sumar()).toHaveAttribute('aria-disabled', 'false')
    })

    it('el botón no se deshabilita (`disabled`): quien lo toca no pierde el foco al llegar al límite', async () => {
      const usuario = userEvent.setup()
      render(<ConEstado inicial={2} maximo={3} />)

      await usuario.click(sumar())

      expect(sumar()).toHaveAttribute('aria-disabled', 'true')
      expect(sumar()).not.toBeDisabled()
      expect(sumar()).toHaveFocus()
    })

    it('se ve atenuado cuando está inactivo', () => {
      render(<ConEstado inicial={0} maximo={3} />)

      expect(restar()).toHaveStyle({ opacity: '0.3', cursor: 'not-allowed' })
      expect(sumar()).toHaveStyle({ opacity: '1', cursor: 'pointer' })
    })
  })

  describe('el estilo', () => {
    it('por defecto: botones de 32 × 32 px y número de 28 px de ancho', () => {
      render(<ConEstado inicial={1} />)

      expect(sumar()).toHaveStyle({ width: '32px', height: '32px' })
      expect(screen.getByText('1')).toHaveStyle({ width: '28px' })
    })

    it('se puede pedir un botón más alto, otro símbolo, otro estilo del número y del botón', () => {
      render(
        <ConEstado
          inicial={1}
          altoDelBoton={44}
          tamanoDelSimbolo={18}
          estiloDelNumero={{ width: undefined, minWidth: 22, fontWeight: 800 }}
          estiloDelBoton={{ borderRadius: 8 }}
        />,
      )

      expect(sumar()).toHaveStyle({ width: '32px', height: '44px', fontSize: '18px', borderRadius: '8px' })
      expect(screen.getByText('1')).toHaveStyle({ minWidth: '22px', fontWeight: '800' })
      expect(screen.getByText('1').style.width).toBe('')
    })
  })

  it('no tiene violaciones de accesibilidad (axe), en el medio y en los límites', async () => {
    const { container, rerender } = render(<SelectorDeCantidad nombre="Cheddar" valor={1} maximo={3} onCambiar={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()

    rerender(<SelectorDeCantidad nombre="Cheddar" valor={0} maximo={3} onCambiar={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()

    rerender(<SelectorDeCantidad nombre="Cheddar" valor={3} maximo={3} onCambiar={() => {}} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
