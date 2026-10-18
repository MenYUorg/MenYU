import { act, render, screen, within } from '@testing-library/react'
import { api } from '../../../services/api'
import { DashboardPage } from './DashboardPage'

let restauranteActual: string | null = 'rest-1'
vi.mock('../../../store/contextStore', () => ({
  useContextStore: (selector: (s: { selectedRestauranteId: string | null }) => unknown) => selector({ selectedRestauranteId: restauranteActual }),
}))
vi.mock('../../../services/api', () => ({
  api: {
    reportes: { ventasHoy: vi.fn(), ventasPorHora: vi.fn(), topItems: vi.fn() },
    mesas: { list: vi.fn() },
  },
}))

const reportes = vi.mocked(api.reportes)
const listarMesas = vi.mocked(api.mesas.list)

const mesa = (id: string, numero: string, estado: string) => ({ id, numero, estado }) as never

async function abrir() {
  const vista = render(<DashboardPage />)
  await vi.waitFor(() => expect(kpi('PEDIDOS')).not.toBe('–'))
  return vista
}

const kpi = (titulo: string) => screen.getByText(titulo).nextElementSibling?.textContent
/** Alturas de las barras de 12 a 22 h. */
const barras = () => (Array.from(screen.getByText('Ventas por hora').parentElement!.nextElementSibling!.children) as HTMLElement[]).map((b) => b.style.height)

beforeEach(() => {
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
  reportes.ventasHoy.mockResolvedValue({ total: 154300, cantidadPedidos: 12, ticketPromedio: 12858 } as never)
  reportes.ventasPorHora.mockResolvedValue([{ hora: 13, total: 40000 }, { hora: 20, total: 100000 }, { hora: 21, total: 1 }, { hora: 3, total: 999999 }] as never)
  reportes.topItems.mockResolvedValue([
    { itemId: 'i1', nombre: 'Milanesa', cantidad: 9, total: 90000 },
    { itemId: 'i2', nombre: 'Agua', cantidad: 4, total: 8000 },
  ] as never)
  listarMesas.mockResolvedValue([mesa('m1', '1', 'libre'), mesa('m2', '2', 'ocupada'), mesa('m3', '3', 'ocupada')])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DashboardPage', () => {
  it('sin restaurante elegido no consulta y muestra guiones', () => {
    restauranteActual = null

    render(<DashboardPage />)

    expect(reportes.ventasHoy).not.toHaveBeenCalled()
    expect(kpi('VENTAS DEL DÍA')).toBe('–')
    expect(screen.getByText('Cargando mesas…')).toBeInTheDocument()
  })

  it('muestra los indicadores del día y cuántas mesas están ocupadas', async () => {
    await abrir()

    expect(reportes.ventasHoy).toHaveBeenCalledWith('rest-1')
    expect(reportes.topItems).toHaveBeenCalledWith('rest-1', 5)
    expect(kpi('VENTAS DEL DÍA')).toBe('$154.300')
    expect(kpi('PEDIDOS')).toBe('12')
    expect(kpi('MESAS OCUPADAS')).toBe('2/3')
    expect(kpi('TICKET PROMEDIO')).toBe('$12.858')
    expect(screen.queryByText(/Algunos datos no pudieron cargarse/)).not.toBeInTheDocument()
  })

  it('el estado de mesas pinta cada mesa libre u ocupada', async () => {
    await abrir()

    const seccion = screen.getByText('Estado de mesas').parentElement!.parentElement as HTMLElement
    const tile = (n: string) => within(seccion).getByText(n, { selector: 'span' }).parentElement as HTMLElement
    expect(tile('1')).toHaveTextContent('1Libre')
    expect(tile('2')).toHaveTextContent('2Ocupada')
  })

  it('sin mesas lo dice', async () => {
    listarMesas.mockResolvedValue([])

    await abrir()

    expect(screen.getByText('No hay mesas configuradas')).toBeInTheDocument()
  })

  it('el gráfico va de 12 a 22 h, proporcional a la hora con más ventas (las de fuera de rango no cuentan)', async () => {
    await abrir()

    const alturas = barras()
    expect(alturas).toHaveLength(11)
    expect(alturas[1]).toBe('40%')
    expect(alturas[8]).toBe('100%')
    expect(alturas[9]).toBe('4%') // una venta mínima igual se ve
    expect(alturas[0]).toBe('0%')
    expect(screen.getByText('12h')).toBeInTheDocument()
    expect(screen.getByText('22h')).toBeInTheDocument()
  })

  it('el top 5 completa con guiones los lugares vacíos', async () => {
    await abrir()

    expect(screen.getByText('Milanesa')).toBeInTheDocument()
    expect(screen.getByText('×9')).toBeInTheDocument()
    expect(screen.getByText('×4')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(3)
  })

  it('si algo falla avisa que reintenta y muestra lo que llegó en 0', async () => {
    reportes.ventasHoy.mockRejectedValue(new Error('caído'))
    reportes.ventasPorHora.mockRejectedValue(new Error('caído'))
    reportes.topItems.mockRejectedValue(new Error('caído'))
    listarMesas.mockRejectedValue(new Error('caído'))

    await abrir()

    expect(screen.getByText('Algunos datos no pudieron cargarse. Reintentando en 30s.')).toBeInTheDocument()
    expect(kpi('VENTAS DEL DÍA')).toBe('$0')
    expect(kpi('MESAS OCUPADAS')).toBe('0/0')
    expect(screen.getAllByText('—')).toHaveLength(5)
  })

  it('cada 30 s vuelve a consultar sin volver a mostrar la carga; si las mesas fallan en el reintento, quedan las de antes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await abrir()
    listarMesas.mockRejectedValue(new Error('caído'))
    reportes.ventasHoy.mockReturnValue(new Promise(() => {}))

    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })

    expect(reportes.ventasPorHora).toHaveBeenCalledTimes(2)
    expect(kpi('PEDIDOS')).toBe('12')
    expect(kpi('MESAS OCUPADAS')).toBe('2/3')
  })

  it('al salir deja de consultar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { unmount } = await abrir()

    unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })

    expect(reportes.ventasPorHora).toHaveBeenCalledTimes(1)
  })
})
