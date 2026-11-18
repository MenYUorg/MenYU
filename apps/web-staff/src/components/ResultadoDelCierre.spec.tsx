import { fireEvent, render, screen, within } from '@testing-library/react'
import type { FilaDeArqueo } from '@menyu/types'
import type { ResultadoDelCierre as Resultado } from '../utils/cierre'
import { ResultadoDelCierre } from './ResultadoDelCierre'

const CERRADO = new Date(2026, 10, 18, 23, 30).toISOString()

const fila = (metodo: FilaDeArqueo['metodo'], esperado: number, declarado: number, diferencia: number): FilaDeArqueo => ({
  metodo, esperado, declarado, diferencia,
})

const RESULTADO: Resultado = {
  turnoId: 'turno-1',
  cerradoEn: CERRADO,
  arqueos: [
    {
      cajaId: 'c-barra', cajaNombre: 'Barra', fondoInicial: 5000,
      metodos: [fila('efectivo', 6350, 6300, -50), fila('debito', 3300, 3300, 0), fila('credito', 2500, 2500.5, 0.5), fila('transferencia', 0, 0, 0)],
    },
    {
      cajaId: 'c-terraza', cajaNombre: 'Terraza', fondoInicial: 0,
      metodos: [fila('efectivo', -200, 0, 200), fila('debito', 0, 0, 0), fila('credito', 0, 0, 0), fila('transferencia', 0, 0, 0)],
    },
  ],
  mesasAbiertas: [
    { mesaId: 'm7', mesaNumero: '7', iniciadaEn: new Date(2026, 10, 18, 21, 5).toISOString() },
    { mesaId: 'm2', mesaNumero: '2', iniciadaEn: new Date(2026, 10, 18, 22, 40).toISOString() },
  ],
}

const onNuevoTurno = vi.fn()

const montar = (resultado: Resultado = RESULTADO) => render(<ResultadoDelCierre resultado={resultado} onNuevoTurno={onNuevoTurno} />)

const filas = (caja: string) =>
  within(screen.getByRole('table', { name: `Arqueo de la caja «${caja}»` })).getAllByRole('row').map((f) =>
    [...f.querySelectorAll('th, td')].map((c) => c.textContent))

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ResultadoDelCierre', () => {
  it('dice que el turno se cerró y cuándo, con el foco en el encabezado', () => {
    montar()

    expect(screen.getByRole('heading', { name: 'Turno cerrado' })).toHaveFocus()
    expect(screen.getByText('Cerrado el 18/11 23:30')).toBeInTheDocument()
  })

  it('una tabla por caja, en el orden del resultado, con el esperado, lo declarado y la diferencia con palabras', () => {
    montar()

    expect(screen.getAllByRole('table').map((t) => t.querySelector('caption')?.textContent)).toEqual([
      'Arqueo de la caja «Barra»',
      'Arqueo de la caja «Terraza»',
    ])
    expect(filas('Barra')).toEqual([
      ['Método', 'Esperado', 'Declarado', 'Diferencia'],
      ['Efectivo', '$6.350', '$6.300', 'Faltan $50'],
      ['Débito', '$3.300', '$3.300', 'Sin diferencia'],
      ['Crédito', '$2.500', '$2.500,50', 'Sobran $0,50'],
      ['Transferencia', '$0', '$0', 'Sin diferencia'],
    ])
    expect(screen.getAllByRole('columnheader').every((th) => th.getAttribute('scope') === 'col')).toBe(true)
    expect(screen.getAllByRole('rowheader').every((th) => th.getAttribute('scope') === 'row')).toBe(true)
    expect(screen.getByText('Fondo inicial: $5.000')).toBeInTheDocument()
  })

  it('un esperado de efectivo negativo se muestra con su signo, y la diferencia sin signo', () => {
    montar()

    expect(filas('Terraza')[1]).toEqual(['Efectivo', '-$200', '$0', 'Sobran $200'])
    expect(screen.getByText('Fondo inicial: $0')).toBeInTheDocument()
  })

  it('avisa las mesas que quedaron abiertas y desde cuándo, en el orden del resultado', () => {
    montar()

    expect(screen.getByRole('alert')).toHaveTextContent('Quedaron mesas abiertas. Sin un turno abierto no se pueden cobrar hasta que se abra uno nuevo.')
    const mesas = within(screen.getByRole('list', { name: 'Mesas que quedaron abiertas' })).getAllByRole('listitem').map((m) => m.textContent)
    expect(mesas).toEqual(['Mesa 7 · desde 18/11 21:05', 'Mesa 2 · desde 18/11 22:40'])
  })

  it('sin mesas abiertas no avisa nada', () => {
    montar({ ...RESULTADO, mesasAbiertas: [] })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('si no se supo de las mesas abiertas, lo dice', () => {
    montar({ ...RESULTADO, mesasAbiertas: null })

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo comprobar si quedaron mesas abiertas.')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('"Abrir un turno nuevo" avisa a la pantalla', () => {
    montar()

    fireEvent.click(screen.getByRole('button', { name: 'Abrir un turno nuevo' }))

    expect(onNuevoTurno).toHaveBeenCalledTimes(1)
  })
})
