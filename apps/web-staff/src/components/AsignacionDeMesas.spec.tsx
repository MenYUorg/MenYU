import { fireEvent, render, screen } from '@testing-library/react'
import { AsignacionDeMesas } from './AsignacionDeMesas'

const MESAS = [{ id: 'm10', numero: '10' }, { id: 'm2', numero: '2' }]
const MOZOS = [{ id: 'ana', nombre: 'Ana' }]

const select = (numero: string) => screen.getByRole('combobox', { name: `Mozo de la mesa ${numero}` }) as HTMLSelectElement

describe('AsignacionDeMesas', () => {
  it('una mesa sin valor se muestra sin asignar', () => {
    render(<AsignacionDeMesas mesas={MESAS} mozos={MOZOS} valores={{ m10: 'ana' }} onChange={vi.fn()} />)

    expect(select('2').value).toBe('')
    expect(select('10').value).toBe('ana')
  })

  it('al cambiar un mozo avisa con todos los valores, sin perder los demás', () => {
    const onChange = vi.fn()
    render(<AsignacionDeMesas mesas={MESAS} mozos={MOZOS} valores={{ m10: 'ana', m2: '' }} onChange={onChange} />)

    fireEvent.change(select('2'), { target: { value: 'ana' } })

    expect(onChange).toHaveBeenCalledWith({ m10: 'ana', m2: 'ana' })
  })

  it('cada select se describe con el texto de ayuda', () => {
    render(<AsignacionDeMesas mesas={MESAS} mozos={MOZOS} valores={{}} onChange={vi.fn()} />)

    expect(select('2')).toHaveAccessibleDescription(
      'Con el turno abierto, cada mozo ve sus mesas y las que no tienen mozo asignado.',
    )
  })
})
