import { fireEvent, render, screen } from '@testing-library/react'
import { api } from '../../../services/api'
import { ReportesPage } from './ReportesPage'

let restauranteActual: string | null = 'rest-1'
vi.mock('../../../store/contextStore', () => ({
  useContextStore: (selector: (s: { selectedRestauranteId: string | null }) => unknown) => selector({ selectedRestauranteId: restauranteActual }),
}))
vi.mock('../../../services/api', () => ({
  api: { reportes: { ventasHoy: vi.fn(), topItems: vi.fn(), ventasPorDia: vi.fn() } },
}))

const reportes = vi.mocked(api.reportes)

const RESUMEN = { total: 1234567, cantidadPedidos: 42, ticketPromedio: 29394, cantidadSesiones: 17 }
const TOP = [
  { itemId: 'i1', nombre: 'Milanesa', cantidad: 30, total: 450000, categoriaId: 'c1', categoriaNombre: 'Principales' },
  { itemId: 'i2', nombre: 'Agua', cantidad: 15, total: 30000, categoriaId: null, categoriaNombre: null },
]
const POR_DIA = [
  { fecha: '2026-10-18', total: 80000, pedidos: 5 },
  { fecha: '2026-10-10', total: 20000, pedidos: 1 },
  { fecha: '2026-10-01', total: 1, pedidos: 1 },
]

async function abrir() {
  render(<ReportesPage />)
  await vi.waitFor(() => expect(screen.getByText('PEDIDOS').nextElementSibling?.textContent).not.toBe('–'))
}

const kpi = (titulo: string) => screen.getByText(titulo).nextElementSibling?.textContent
/** Las barras del gráfico (una por día) y sus etiquetas de fecha. */
const barras = () => Array.from(screen.getByText('Ventas por día').parentElement!.nextElementSibling!.children) as HTMLElement[]
/** Las etiquetas de fecha visibles (las intermedias quedan con visibility: hidden). */
const etiquetas = () => (Array.from(screen.getByText('Ventas por día').parentElement!.nextElementSibling!.nextElementSibling!.children) as HTMLElement[])
  .filter((e) => e.style.visibility === 'visible')
  .map((e) => e.textContent)

beforeEach(() => {
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
  vi.useFakeTimers({ now: new Date(2026, 9, 18, 12, 0), shouldAdvanceTime: true })
  reportes.ventasHoy.mockResolvedValue(RESUMEN as never)
  reportes.topItems.mockResolvedValue(TOP as never)
  reportes.ventasPorDia.mockResolvedValue(POR_DIA as never)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ReportesPage', () => {
  it('sin restaurante elegido pide elegir uno y no consulta', () => {
    restauranteActual = null

    render(<ReportesPage />)

    expect(screen.getByText('Seleccioná un restaurante para ver los reportes')).toBeInTheDocument()
    expect(reportes.ventasHoy).not.toHaveBeenCalled()
  })

  it('arranca en el último mes: pide resumen, top 10 y ventas por día de los últimos 30 días', async () => {
    await abrir()

    expect(reportes.ventasHoy).toHaveBeenCalledWith('rest-1', '2026-09-19', '2026-10-18')
    expect(reportes.topItems).toHaveBeenCalledWith('rest-1', 10, '2026-09-19', '2026-10-18')
    expect(reportes.ventasPorDia).toHaveBeenCalledWith('rest-1', '2026-09-19', '2026-10-18')
    expect(screen.getByText('Últimos 30 días')).toBeInTheDocument()
  })

  it('muestra los indicadores en pesos y cantidades', async () => {
    await abrir()

    expect(kpi('VENTAS TOTALES')).toBe('$1.234.567')
    expect(kpi('PEDIDOS')).toBe('42')
    expect(kpi('TICKET PROMEDIO')).toBe('$29.394')
    expect(kpi('MESAS ATENDIDAS')).toBe('17')
  })

  it('mientras carga muestra guiones', () => {
    reportes.ventasHoy.mockReturnValue(new Promise(() => {}))

    render(<ReportesPage />)

    expect(kpi('VENTAS TOTALES')).toBe('–')
  })

  it('el gráfico tiene una barra por día, proporcional a la venta, con etiquetas cada 7 días', async () => {
    await abrir()

    const dias = barras()
    expect(dias).toHaveLength(30)
    expect(dias[29].style.height).toBe('100%')
    expect(dias[21].style.height).toBe('25%')
    expect(dias[12].style.height).toBe('2%') // una venta mínima igual se ve
    expect(dias[0].style.height).toBe('4px')
    expect(etiquetas()).toEqual(['19/09', '26/09', '03/10', '10/10', '17/10'])
  })

  it('al pasar sobre un día con ventas muestra la fecha y el total', async () => {
    await abrir()

    fireEvent.mouseEnter(barras()[29])
    expect(screen.getByText(/18\/10\/2026/)).toHaveTextContent('18/10/2026$80.000')
    fireEvent.mouseLeave(barras()[29])
    expect(screen.queryByText(/18\/10\/2026/)).not.toBeInTheDocument()

    fireEvent.mouseEnter(barras()[0])
    expect(screen.queryByText(/19\/09\/2026/)).not.toBeInTheDocument()
  })

  it('el top muestra cada plato con su categoría, unidades y total, con la barra relativa al primero', async () => {
    await abrir()

    expect(screen.getByText('Milanesa')).toBeInTheDocument()
    expect(screen.getByText('Principales')).toBeInTheDocument()
    expect(screen.getByText('30')).toBeInTheDocument()
    expect(screen.getByText('$450.000')).toBeInTheDocument()
    expect(screen.getByText('$30.000')).toBeInTheDocument()
    const relleno = (nombre: string) =>
      (screen.getByText(nombre).closest('div[style*="flex-direction"], div')!.parentElement!.parentElement!.querySelector('div[style*="linear-gradient(90deg"]') as HTMLElement).style.width
    expect(relleno('Milanesa')).toBe('100%')
    expect(relleno('Agua')).toBe('50%')
  })

  it.each([
    ['Hoy', '2026-10-18', 'Hoy', 1],
    ['Última semana', '2026-10-12', 'Últimos 7 días', 7],
    ['Últimos 3 meses', '2026-07-21', 'Últimos 90 días', 90],
    ['Último año', '2025-10-19', 'Últimos 365 días', 365],
  ])('"%s" pide desde %s y muestra %s', async (periodo, desde, subtitulo, dias) => {
    await abrir()

    fireEvent.mouseEnter(screen.getByRole('button', { name: periodo }))
    fireEvent.mouseLeave(screen.getByRole('button', { name: periodo }))
    fireEvent.click(screen.getByRole('button', { name: periodo }))

    await vi.waitFor(() => expect(reportes.ventasHoy).toHaveBeenLastCalledWith('rest-1', desde, '2026-10-18'))
    expect(screen.getByText(subtitulo, { selector: 'span' })).toBeInTheDocument()
    expect(barras()).toHaveLength(dias)
  })

  it('con 14 días o menos etiqueta todos los días', async () => {
    await abrir()

    fireEvent.click(screen.getByRole('button', { name: 'Última semana' }))

    await vi.waitFor(() => expect(etiquetas()).toHaveLength(7))
  })

  it('si algo falla muestra lo que llegó: sin top dice que no hay datos y el resumen queda en 0', async () => {
    reportes.ventasHoy.mockRejectedValue(new Error('caído'))
    reportes.topItems.mockRejectedValue(new Error('caído'))
    reportes.ventasPorDia.mockRejectedValue(new Error('caído'))

    await abrir()

    expect(kpi('VENTAS TOTALES')).toBe('$0')
    expect(kpi('PEDIDOS')).toBe('0')
    expect(screen.getByText('Sin datos para el período')).toBeInTheDocument()
    expect(barras().every((b) => b.style.height === '4px')).toBe(true)
  })
})
