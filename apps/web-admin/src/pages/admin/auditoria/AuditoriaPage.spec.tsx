import { fireEvent, render, screen, within } from '@testing-library/react'
import { api, type EdicionAuditoria } from '../../../services/api'
import { AuditoriaPage } from './AuditoriaPage'

let restauranteActual: string | null = 'rest-1'

vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({ selectedRestauranteId: restauranteActual }),
}))
vi.mock('../../../services/api', () => ({ api: { pedidos: { auditoria: vi.fn() } } }))

const auditoria = vi.mocked(api.pedidos.auditoria)

const haceDias = (dias: number) => {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  d.setHours(12, 30, 0, 0)
  return d.toISOString()
}

const EDICION_MOZO: EdicionAuditoria = {
  id: 'ed-1',
  pedidoId: 'abcdef1234',
  mesaNumero: '4',
  pedidoEstado: 'pendiente',
  esAnulacion: false,
  justificacion: 'Se cargó de más',
  creadoEn: haceDias(0),
  editor: { nombre: 'Ana Pérez', tipo: 'mozo' },
  itemsEliminados: [{ id: 'x1', itemNombre: 'Empanada', cantidadAntes: 3, cantidadDespues: 1, precioUnitario: 500 }],
}
const ANULACION_GERENTE: EdicionAuditoria = {
  id: 'ed-2',
  pedidoId: 'zzzz9999',
  mesaNumero: '12',
  pedidoEstado: 'anulado',
  esAnulacion: true,
  justificacion: 'El cliente se fue',
  creadoEn: haceDias(2),
  editor: { nombre: 'gerente', tipo: 'gerente' },
  itemsEliminados: [{ id: 'x2', itemNombre: 'Gaseosa', cantidadAntes: 2, cantidadDespues: 0, precioUnitario: 800 }],
}
const ENTREGADO = { ...EDICION_MOZO, id: 'ed-3', mesaNumero: '7', pedidoEstado: 'entregado', editor: { nombre: 'Ana Pérez', tipo: 'mozo' } }

async function abrir(ediciones: EdicionAuditoria[] = [EDICION_MOZO, ANULACION_GERENTE, ENTREGADO]) {
  auditoria.mockResolvedValue(ediciones)
  render(<AuditoriaPage />)
  await vi.waitFor(() => expect(screen.queryByText('Cargando ediciones…')).not.toBeInTheDocument())
}

const kpi = (titulo: string) => screen.getByText(titulo).parentElement?.textContent?.replace(titulo, '')
const tarjeta = (mesa: string) => screen.getByText(`Mesa ${mesa}`).closest('div[style*="border-left"]') as HTMLElement
const fecha = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

beforeEach(() => {
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
})

describe('AuditoriaPage', () => {
  it('sin restaurante elegido no consulta', () => {
    restauranteActual = null

    render(<AuditoriaPage />)

    expect(auditoria).not.toHaveBeenCalled()
    expect(screen.getByText('Auditoría de ediciones')).toBeInTheDocument()
  })

  it('pide las ediciones de hoy y muestra los indicadores', async () => {
    await abrir()

    const hoy = fecha(new Date())
    expect(auditoria).toHaveBeenCalledWith('rest-1', hoy, hoy)
    expect(kpi('Total ediciones')).toBe('3')
    expect(kpi('Anulaciones')).toBe('1')
    expect(kpi('Editores únicos')).toBe('2')
  })

  it('una edición del mozo muestra mesa, pedido, estado, editor, el cambio con su impacto y el motivo', async () => {
    await abrir()

    const card = tarjeta('4')
    expect(within(card).getByText('#ABCDEF12')).toBeInTheDocument()
    expect(within(card).getByText('pendiente')).toBeInTheDocument()
    expect(within(card).getByText('AP')).toBeInTheDocument()
    expect(within(card).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(card).getByText('Mozo')).toBeInTheDocument()
    expect(within(card).getByText('3× → 1× Empanada')).toBeInTheDocument()
    expect(within(card).getByText('-$1.000,00')).toBeInTheDocument()
    expect(within(card).getByText('"Se cargó de más"')).toBeInTheDocument()
  })

  it('una anulación del gerente muestra el ítem anulado y la fecha si no es de hoy', async () => {
    await abrir()

    const card = tarjeta('12')
    expect(within(card).getByText('anulado')).toBeInTheDocument()
    expect(within(card).getByText('GE')).toBeInTheDocument()
    expect(within(card).getByText('Gerente')).toBeInTheDocument()
    expect(within(card).getByText('2× Gaseosa')).toBeInTheDocument()
    expect(within(card).getByText('-$1.600,00')).toBeInTheDocument()
    const dia = new Date(ANULACION_GERENTE.creadoEn).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    expect(within(card).getByText(dia)).toBeInTheDocument()
    expect(within(tarjeta('7')).getByText('entregado')).toBeInTheDocument()
  })

  it('cada período pide su rango', async () => {
    await abrir()

    for (const periodo of ['Ayer', 'Última semana', 'Último mes']) {
      fireEvent.click(screen.getByRole('button', { name: periodo }))
      await vi.waitFor(() => expect(screen.queryByText('Cargando ediciones…')).not.toBeInTheDocument())
    }

    const rangos = auditoria.mock.calls.map(([, desde, hasta]) => [desde, hasta])
    expect(new Set(rangos.map((r) => r.join('|'))).size).toBe(4)
    expect(rangos[1][0]).toBe(rangos[1][1])
    expect(rangos[3][1]).toBe(fecha(new Date()))
  })

  it.each([
    ['la mesa', '12', ['Mesa 12']],
    ['el editor', 'GERENTE', ['Mesa 12']],
    ['el ítem', 'empanada', ['Mesa 4', 'Mesa 7']],
  ])('busca por %s', async (_, texto, esperadas) => {
    await abrir()

    fireEvent.change(screen.getByPlaceholderText('Buscar por mesa, editor o ítem...'), { target: { value: texto } })

    expect(screen.getAllByText(/^Mesa \d+$/).map((e) => e.textContent)).toEqual(esperadas)
  })

  it('sin ediciones lo dice y los indicadores quedan en 0', async () => {
    await abrir([])

    expect(screen.getByText('No hay ediciones registradas en este período.')).toBeInTheDocument()
    expect(kpi('Total ediciones')).toBe('0')
  })

  it('si la consulta falla muestra el error y deja la lista vacía', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    auditoria.mockRejectedValueOnce(new Error('Sin acceso')).mockRejectedValueOnce('raro')

    render(<AuditoriaPage />)
    expect(await screen.findByText('Sin acceso')).toBeInTheDocument()
    expect(screen.getByText('No hay ediciones registradas en este período.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ayer' }))
    expect(await screen.findByText('Error al cargar ediciones')).toBeInTheDocument()
    expect(error).toHaveBeenCalledWith('[AuditoriaPage] error al cargar ediciones:', expect.anything())
    error.mockRestore()
  })
})
