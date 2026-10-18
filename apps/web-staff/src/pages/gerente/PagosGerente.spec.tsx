import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api, type SesionActivaItem, type SesionPagadaItem } from '../../services/api'
import * as socketService from '../../services/socket'
import { PagosGerente } from './PagosGerente'

let usuario: { nombre?: string; email?: string; restauranteId?: string } | null = { nombre: 'Gero Gerente', restauranteId: 'rest-1' }
let restauranteStore: string | null = 'rest-store'

vi.mock('@menyu/auth', () => ({ useAuth: () => ({ user: usuario }) }))
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))
vi.mock('../../store/mozoStore', () => ({
  useMozoStore: (selector: (s: { restauranteId: string | null }) => unknown) => selector({ restauranteId: restauranteStore }),
}))
vi.mock('../../services/api', () => ({ api: { sesiones: { getActivas: vi.fn(), getPagadas: vi.fn() } } }))

const alQuierePagar: { fn?: (d: { sesionId: string }) => void } = {}
const alCobrada: { fn?: (d: { sesionId: string }) => void } = {}
const desuscribir = { quiere: vi.fn(), cobrada: vi.fn() }
vi.mock('../../services/socket', () => ({
  joinRestauranteComoMozo: vi.fn(),
  onSesionQuierePagar: vi.fn((fn) => { alQuierePagar.fn = fn; return desuscribir.quiere }),
  onSesionCobrada: vi.fn((fn) => { alCobrada.fn = fn; return desuscribir.cobrada }),
}))

// El modal de cobro tiene su propio spec: acá solo importa qué recibe y qué devuelve.
vi.mock('../../components/CobroModal', () => ({
  CobroModal: ({ sesion, cobradoPor, onClose, onDone }: { sesion: SesionActivaItem; cobradoPor: { gerenteNombre: string }; onClose: () => void; onDone: (mesa: string) => void }) => (
    <div role="dialog">
      <p>Cobrar mesa {sesion.mesaNumero} como {cobradoPor.gerenteNombre}</p>
      <button onClick={onClose}>cerrar modal</button>
      <button onClick={() => onDone(sesion.mesaNumero)}>cobro hecho</button>
    </div>
  ),
}))

const activasApi = vi.mocked(api.sesiones.getActivas)
const pagadasApi = vi.mocked(api.sesiones.getPagadas)

const ACTIVA_4: SesionActivaItem = { id: 'ses-4', mesaId: 'm4', mesaNumero: '4', tiempoTranscurrido: 75, cantidadItems: 3, cantidadPersonas: 2, totalAcumulado: 12500, quierePagar: true }
const ACTIVA_7: SesionActivaItem = { id: 'ses-7', mesaId: 'm7', mesaNumero: '7', tiempoTranscurrido: 45, cantidadItems: 1, cantidadPersonas: 1, totalAcumulado: 900, quierePagar: false }
const PAGADA_EF = { id: 'p1', mesaNumero: '2', totalCobrado: 5000, metodoPago: 'efectivo', cobradoPorNombre: 'Ana', referenciaExterna: null, fechaCobro: new Date().toISOString() } as SesionPagadaItem
const PAGADA_MP = { id: 'p2', mesaNumero: '3', totalCobrado: 7000.5, metodoPago: 'mercadopago', cobradoPorNombre: null, referenciaExterna: '987', fechaCobro: null } as SesionPagadaItem

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/gerente/pagos']}>
      <Routes>
        <Route path="/gerente/pagos" element={<PagosGerente />} />
        <Route path="/mozo" element={<p>panel del mozo</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const tarjeta = (mesa: string) => screen.getByText(`Mesa ${mesa}`).closest('div[style*="border-radius: 10"]') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  usuario = { nombre: 'Gero Gerente', restauranteId: 'rest-1' }
  restauranteStore = 'rest-store'
  activasApi.mockResolvedValue([ACTIVA_4, ACTIVA_7])
  pagadasApi.mockResolvedValue([PAGADA_EF, PAGADA_MP])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('PagosGerente', () => {
  it('sin restaurante no consulta ni se une al socket', () => {
    usuario = null
    restauranteStore = null

    abrir()

    expect(activasApi).not.toHaveBeenCalled()
    expect(socketService.joinRestauranteComoMozo).not.toHaveBeenCalled()
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('sin restaurante en el usuario usa el guardado; el encabezado vuelve al panel', async () => {
    usuario = { email: 'gero@menyu.com' }
    abrir()

    await screen.findByText('Mesa 4')
    expect(activasApi).toHaveBeenCalledWith('rest-store')
    expect(screen.getByText('gero@menyu.com')).toBeInTheDocument()
    fireEvent.click(document.querySelector('.lucide-chevron-left')!.closest('button')!)
    expect(screen.getByText('panel del mozo')).toBeInTheDocument()
  })

  describe('pendientes de cobro', () => {
    it('lista las sesiones con tiempo, ítems, personas, total y quién quiere pagar', async () => {
      abrir()

      expect(await screen.findByText('Mesa 4')).toBeInTheDocument()
      expect(within(tarjeta('4')).getByText('1h 15m · 3 ítems · 2 pers.')).toBeInTheDocument()
      expect(within(tarjeta('4')).getByText('$12.500')).toBeInTheDocument()
      expect(within(tarjeta('4')).getByText('Quiere pagar')).toBeInTheDocument()
      expect(within(tarjeta('7')).getByText('45 min · 1 ítem · 1 pers.')).toBeInTheDocument()
      expect(within(tarjeta('7')).queryByText('Quiere pagar')).not.toBeInTheDocument()
      expect(screen.getByText('Pendientes de cobro').nextElementSibling?.textContent).toBe('2')
    })

    it('sin sesiones, o si la consulta falla, dice que no hay mesas activas', async () => {
      activasApi.mockRejectedValue(new Error('caído'))
      pagadasApi.mockRejectedValue(new Error('caído'))

      abrir()

      expect(await screen.findByText('Sin mesas activas')).toBeInTheDocument()
      expect(await screen.findByText('Sin cobros registrados')).toBeInTheDocument()
    })

    it('cada 30 s vuelve a pedir las activas; el botón de actualizar pide todo', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      abrir()
      await screen.findByText('Mesa 4')

      await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
      expect(activasApi).toHaveBeenCalledTimes(2)

      fireEvent.click(document.querySelector('header .lucide-refresh-cw')!.closest('button')!)
      expect(activasApi).toHaveBeenCalledTimes(3)
      expect(pagadasApi).toHaveBeenLastCalledWith('rest-1', 'hoy')
    })
  })

  describe('historial', () => {
    it('muestra los cobros de hoy con método, quién cobró, referencia y hora', async () => {
      abrir()

      expect(await screen.findByText('Mesa 2')).toBeInTheDocument()
      expect(pagadasApi).toHaveBeenCalledWith('rest-1', 'hoy')
      expect(screen.getByText('efectivo')).toBeInTheDocument()
      expect(screen.getByText('Ana')).toBeInTheDocument()
      expect(screen.getByText('$7.000,5')).toBeInTheDocument()
      expect(screen.getByText('Mercado Pago')).toBeInTheDocument()
      expect(screen.getByText('#987')).toBeInTheDocument()
      expect(screen.getByText('—')).toBeInTheDocument()
    })

    it('"Ayer" pide los cobros de ayer', async () => {
      abrir()
      await screen.findByText('Mesa 2')

      fireEvent.click(screen.getByRole('button', { name: 'Ayer' }))

      await vi.waitFor(() => expect(pagadasApi).toHaveBeenLastCalledWith('rest-1', 'ayer'))
    })
  })

  describe('tiempo real', () => {
    it('se une como mozo; "quiere pagar" marca la mesa y "cobrada" la saca; al salir se desuscribe', async () => {
      const { unmount } = abrir()
      await screen.findByText('Mesa 7')

      expect(socketService.joinRestauranteComoMozo).toHaveBeenCalledWith('rest-1')
      act(() => alQuierePagar.fn!({ sesionId: 'ses-7' }))
      expect(within(tarjeta('7')).getByText('Quiere pagar')).toBeInTheDocument()
      act(() => alCobrada.fn!({ sesionId: 'ses-4' }))
      expect(screen.queryByText('Mesa 4')).not.toBeInTheDocument()

      unmount()
      expect(desuscribir.quiere).toHaveBeenCalled()
      expect(desuscribir.cobrada).toHaveBeenCalled()
    })
  })

  describe('registrar un pago', () => {
    it('abre el cobro como el gerente; al terminar recarga y avisa por 2,5 s', async () => {
      abrir()
      await screen.findByText('Mesa 4')
      vi.useFakeTimers({ shouldAdvanceTime: true })

      fireEvent.click(within(tarjeta('4')).getByRole('button', { name: 'Registrar pago' }))
      expect(screen.getByText('Cobrar mesa 4 como Gero Gerente')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'cobro hecho' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Pago registrado · Mesa 4')).toBeInTheDocument()
      expect(activasApi).toHaveBeenCalledTimes(2)

      fireEvent.click(within(tarjeta('7')).getByRole('button', { name: 'Registrar pago' }))
      fireEvent.click(screen.getByRole('button', { name: 'cobro hecho' }))
      expect(screen.getByText('Pago registrado · Mesa 7')).toBeInTheDocument()

      await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
      expect(screen.queryByText(/Pago registrado/)).not.toBeInTheDocument()
    })

    it('cerrar el modal no registra nada; sin nombre usa "Gerente"', async () => {
      usuario = { restauranteId: 'rest-1' }
      abrir()
      await screen.findByText('Mesa 4')

      fireEvent.click(within(tarjeta('4')).getByRole('button', { name: 'Registrar pago' }))
      expect(screen.getByText('Cobrar mesa 4 como Gerente')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'cerrar modal' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText(/Pago registrado/)).not.toBeInTheDocument()
    })
  })
})
