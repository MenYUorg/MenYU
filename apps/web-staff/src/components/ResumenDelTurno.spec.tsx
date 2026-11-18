import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ResumenDeTurno } from '@menyu/types'
import { api, ApiError } from '../services/api'
import { ResumenDelTurno } from './ResumenDelTurno'

vi.mock('../services/api', async () => {
  const { ApiError } = await vi.importActual<typeof import('../services/api')>('../services/api')
  return { ApiError, api: { turnos: { resumen: vi.fn() } } }
})

const turnosApi = vi.mocked(api.turnos)

const DESDE = new Date(2026, 10, 18, 12, 0).toISOString()
const HASTA = new Date(2026, 10, 18, 23, 30).toISOString()

const cobros = (cantidad: number, monto: number, propina: number) => ({ cantidad, monto, propina })

const RESUMEN: ResumenDeTurno = {
  turno: { id: 'turno-1', abiertoEn: DESDE, cerradoEn: HASTA },
  porMetodo: [
    { metodo: 'efectivo', ...cobros(3, 10000, 1000) },
    { metodo: 'debito', ...cobros(1, 3300, 0) },
    { metodo: 'credito', ...cobros(0, 0, 0) },
    { metodo: 'transferencia', ...cobros(1, 1320.5, 150) },
  ],
  porMozo: [
    { mozoId: 'ana', mozoNombre: 'Ana', ...cobros(3, 12000, 900) },
    { mozoId: null, mozoNombre: null, ...cobros(2, 2620.5, 250) },
  ],
  total: cobros(5, 14620.5, 1150),
  mercadoPago: {
    desde: DESDE, hasta: HASTA, ...cobros(2, 8000, 500),
    pagos: [
      { id: 'p1', mesaNumero: '7', cajaId: 'c-barra', cajaNombre: 'Barra', monto: 5000, propina: 500, fechaCobro: new Date(2026, 10, 18, 21, 5).toISOString(), requiereRevision: false },
      { id: 'p2', mesaNumero: '2', cajaId: null, cajaNombre: null, monto: 3000, propina: 0, fechaCobro: new Date(2026, 10, 18, 22, 40).toISOString(), requiereRevision: true },
    ],
  },
}

const SIN_COBROS: ResumenDeTurno = {
  ...RESUMEN,
  porMetodo: RESUMEN.porMetodo.map((f) => ({ ...f, ...cobros(0, 0, 0) })),
  porMozo: [],
  total: cobros(0, 0, 0),
  mercadoPago: { desde: DESDE, hasta: HASTA, ...cobros(0, 0, 0), pagos: [] },
}

function pendiente<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

const filas = (titulo: string) =>
  within(screen.getByRole('table', { name: titulo })).getAllByRole('row').map((f) => [...f.querySelectorAll('th, td')].map((c) => c.textContent))

async function montar(turnoId = 'turno-1') {
  const vista = render(<ResumenDelTurno turnoId={turnoId} />)
  expect(screen.getByRole('status')).toHaveTextContent('Cargando el resumen del turno…')
  await act(async () => {})
  return vista
}

beforeEach(() => {
  vi.resetAllMocks()
  turnosApi.resumen.mockResolvedValue(RESUMEN)
})

describe('ResumenDelTurno', () => {
  it('mientras lee lo dice, y pide el resumen del turno', async () => {
    await montar()

    expect(turnosApi.resumen).toHaveBeenCalledWith('turno-1')
    expect(screen.getByRole('heading', { name: 'Resumen del turno' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('lo cobrado por método, con la propina en su columna (nunca sumada al monto) y el total', async () => {
    await montar()

    expect(filas('Cobrado por método')).toEqual([
      ['Método', 'Cobros', 'Monto', 'Propina'],
      ['Efectivo', '3', '$10.000', '$1.000'],
      ['Débito', '1', '$3.300', '$0'],
      ['Crédito', '0', '$0', '$0'],
      ['Transferencia', '1', '$1.320,50', '$150'],
      ['Total', '5', '$14.620,50', '$1.150'],
    ])
    const total = within(screen.getByRole('table', { name: 'Cobrado por método' })).getAllByRole('rowgroup')[2]
    expect(total.tagName).toBe('TFOOT')
  })

  it('lo cobrado por mozo, en el orden de la API, con los cobros sin mozo como "Sin mozo"', async () => {
    await montar()

    expect(filas('Cobrado por mozo')).toEqual([
      ['Mozo', 'Cobros', 'Monto', 'Propina'],
      ['Ana', '3', '$12.000', '$900'],
      ['Sin mozo', '2', '$2.620,50', '$250'],
    ])
  })

  it('Mercado Pago aparte: aclara que no entra al arqueo, la franja, los totales y cada pago', async () => {
    await montar()

    expect(screen.getByRole('heading', { name: 'Mercado Pago' })).toBeInTheDocument()
    expect(screen.getByText('No entra al arqueo: se acredita en la cuenta de Mercado Pago, no en la caja.')).toBeInTheDocument()
    expect(screen.getByText('Del 18/11 12:00 al 18/11 23:30')).toBeInTheDocument()
    expect(screen.getByText(/^2 cobros: \$8\.000, y \$500 de propina aparte$/)).toBeInTheDocument()
    const pagos = within(screen.getByRole('list', { name: 'Pagos con Mercado Pago' })).getAllByRole('listitem').map((p) => p.textContent)
    expect(pagos).toEqual([
      'Mesa 7 · 18/11 21:05 · Barra · $5.000 · propina $500',
      'Mesa 2 · 18/11 22:40 · Sin caja · $3.000 · propina $0 · Requiere revisión',
    ])
  })

  it('con un solo pago de Mercado Pago lo dice en singular', async () => {
    turnosApi.resumen.mockResolvedValue({
      ...RESUMEN,
      mercadoPago: { ...RESUMEN.mercadoPago, ...cobros(1, 5000, 500), pagos: [RESUMEN.mercadoPago.pagos[0]] },
    })
    await montar()

    expect(screen.getByText(/^1 cobro: \$5\.000, y \$500 de propina aparte$/)).toBeInTheDocument()
  })

  it('sin cobros lo dice: ni tabla por mozo ni pagos de Mercado Pago', async () => {
    turnosApi.resumen.mockResolvedValue(SIN_COBROS)
    await montar()

    expect(screen.getByText('No hubo cobros en las cajas de este turno.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Cobrado por mozo' })).not.toBeInTheDocument()
    expect(screen.getByText('No hubo cobros con Mercado Pago.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Pagos con Mercado Pago' })).not.toBeInTheDocument()
    expect(filas('Cobrado por método')[5]).toEqual(['Total', '0', '$0', '$0'])
  })

  it('si falla muestra el error con "Reintentar", que lo vuelve a leer', async () => {
    turnosApi.resumen.mockRejectedValueOnce(new ApiError('Turno no encontrado', 404))
    await montar()

    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('Turno no encontrado')

    fireEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }))
    expect(screen.getByRole('status')).toHaveTextContent('Cargando el resumen del turno…')
    await act(async () => {})

    expect(screen.getByRole('table', { name: 'Cobrado por método' })).toBeInTheDocument()
    expect(turnosApi.resumen).toHaveBeenCalledTimes(2)
  })

  it('un error sin mensaje muestra uno genérico', async () => {
    turnosApi.resumen.mockRejectedValueOnce('se cortó')
    await montar()

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo leer el resumen del turno')
  })

  it('una lectura vieja que llega tarde no pisa a la nueva', async () => {
    const vieja = pendiente<ResumenDeTurno>()
    turnosApi.resumen.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce(SIN_COBROS)
    const { rerender } = render(<ResumenDelTurno turnoId="turno-1" />)

    rerender(<ResumenDelTurno turnoId="turno-2" />)
    await act(async () => {})
    expect(screen.getByText('No hubo cobros en las cajas de este turno.')).toBeInTheDocument()

    await act(async () => { vieja.resolver(RESUMEN) })

    expect(turnosApi.resumen).toHaveBeenLastCalledWith('turno-2')
    expect(screen.getByText('No hubo cobros en las cajas de este turno.')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Cobrado por mozo' })).not.toBeInTheDocument()
  })

  it('un error viejo que llega tarde tampoco la pisa', async () => {
    const vieja = pendiente<ResumenDeTurno>()
    turnosApi.resumen.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce(SIN_COBROS)
    const { rerender } = render(<ResumenDelTurno turnoId="turno-1" />)
    rerender(<ResumenDelTurno turnoId="turno-2" />)
    await act(async () => {})

    await act(async () => { vieja.rechazar(new Error('tarde')) })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('No hubo cobros en las cajas de este turno.')).toBeInTheDocument()
  })
})
