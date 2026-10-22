import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api, type SesionActivaItem } from '../../services/api'
import * as socketService from '../../services/socket'
import { perfilDeJefeSalon, perfilDeMozo, reiniciarSesionDePrueba } from '../../test/authClient'
import { montarContexto, reiniciarContexto } from '../../test/contexto'
import { PagosMozo } from './PagosMozo'

vi.mock('@menyu/auth-client', async () => (await import('../../test/authClient')).moduloSimulado())
vi.mock('../../services/api', () => ({
  api: { sesiones: { getActivas: vi.fn(), registrarCobro: vi.fn() } },
  ApiError: class extends Error {},
}))

const oyentes: { quierePagar?: (d: { sesionId: string }) => void; cobrada?: (d: { sesionId: string }) => void } = {}
const desuscribir = { quiere: vi.fn(), cobrada: vi.fn() }
vi.mock('../../services/socket', () => ({
  joinRestauranteComoMozo: vi.fn(),
  onSesionQuierePagar: vi.fn((fn) => { oyentes.quierePagar = fn; return desuscribir.quiere }),
  onSesionCobrada: vi.fn((fn) => { oyentes.cobrada = fn; return desuscribir.cobrada }),
}))

const activasApi = vi.mocked(api.sesiones.getActivas)
const cobroApi = vi.mocked(api.sesiones.registrarCobro)

const sesion = (id: string, mesaNumero: string, extra: Partial<SesionActivaItem> = {}): SesionActivaItem => ({
  id,
  mesaId: `mesa-${mesaNumero}`,
  mesaNumero,
  tiempoTranscurrido: 75,
  cantidadItems: 3,
  cantidadPersonas: 2,
  totalAcumulado: 12500,
  quierePagar: false,
  ...extra,
})

function Destino() {
  const { pathname, search } = useLocation()
  return <p>destino {pathname + search}</p>
}

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/mozo/pagos']}>
      <Routes>
        <Route path="/mozo/pagos" element={<PagosMozo />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrirCon(sesiones: SesionActivaItem[]) {
  activasApi.mockResolvedValue(sesiones)
  abrir()
  await screen.findByText(`Mesa ${sesiones[0].mesaNumero}`)
}

const tarjeta = (mesa: string) => screen.getByText(`Mesa ${mesa}`).closest('div[style*="border-left"]') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  reiniciarSesionDePrueba()
  reiniciarContexto()
  montarContexto(perfilDeMozo('rest-1'))
  activasApi.mockResolvedValue([])
  cobroApi.mockResolvedValue({ ok: true })
})

afterEach(() => vi.useRealTimers())

describe('PagosMozo', () => {
  it('sin restaurante elegido no consulta ni se une al socket', () => {
    reiniciarContexto()

    abrir()

    expect(activasApi).not.toHaveBeenCalled()
    expect(socketService.joinRestauranteComoMozo).not.toHaveBeenCalled()
  })

  it('lista las mesas pendientes de cobro del restaurante del contexto', async () => {
    await abrirCon([sesion('ses-1', '4'), sesion('ses-2', '7', { quierePagar: true })])

    expect(activasApi).toHaveBeenCalledWith('rest-1')
    expect(socketService.joinRestauranteComoMozo).toHaveBeenCalledWith('rest-1')
    expect(within(tarjeta('4')).getByText('$12.500')).toBeInTheDocument()
    expect(within(tarjeta('4')).getByText('1h 15m · 3 ítems · 2 pers.')).toBeInTheDocument()
    expect(within(tarjeta('7')).getByText('Quiere pagar')).toBeInTheDocument()
    expect(within(tarjeta('4')).queryByText('Quiere pagar')).not.toBeInTheDocument()
  })

  it('el encabezado muestra el nombre y el rol de la cuenta, no un "Mozo" fijo', async () => {
    reiniciarContexto()
    montarContexto(perfilDeJefeSalon('rest-1'))

    await abrirCon([sesion('ses-1', '4')])

    expect(screen.getByText('Jefe de Salón de Prueba')).toBeInTheDocument()
    expect(screen.getByText('Jefe de salón')).toBeInTheDocument()
  })

  it('sin mesas activas lo dice', async () => {
    abrir()

    expect(await screen.findByText('Sin mesas activas')).toBeInTheDocument()
  })

  it('cobra la mesa sin mandar mozoId: el backend lo deduce de la cuenta', async () => {
    await abrirCon([sesion('ses-1', '4')])

    fireEvent.click(within(tarjeta('4')).getByRole('button', { name: 'Registrar pago' }))
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }))
    fireEvent.click(screen.getByRole('button', { name: /Confirmar pago/ }))

    await vi.waitFor(() => expect(cobroApi).toHaveBeenCalledWith('ses-1', { metodoPago: 'efectivo' }))
    expect(await screen.findByText('Pago registrado · Mesa 4')).toBeInTheDocument()
    expect(activasApi).toHaveBeenCalledTimes(2)
  })

  it('se puede cerrar el modal sin cobrar', async () => {
    await abrirCon([sesion('ses-1', '4')])

    fireEvent.click(within(tarjeta('4')).getByRole('button', { name: 'Registrar pago' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByText(/Registrar pago · Mesa/)).not.toBeInTheDocument()
    expect(cobroApi).not.toHaveBeenCalled()
  })

  it('"Ver pedidos" abre la mesa en la pantalla de mesas', async () => {
    await abrirCon([sesion('ses-1', '4')])

    fireEvent.click(within(tarjeta('4')).getByRole('button', { name: 'Ver pedidos' }))

    expect(screen.getByText('destino /mozo/mesas?mesaId=mesa-4')).toBeInTheDocument()
  })

  it('por socket, una mesa que pide la cuenta se marca y una cobrada desaparece', async () => {
    await abrirCon([sesion('ses-1', '4'), sesion('ses-2', '7')])

    act(() => oyentes.quierePagar!({ sesionId: 'ses-1' }))
    expect(within(tarjeta('4')).getByText('Quiere pagar')).toBeInTheDocument()

    act(() => oyentes.cobrada!({ sesionId: 'ses-1' }))
    expect(screen.queryByText('Mesa 4')).not.toBeInTheDocument()
    expect(screen.getByText('Mesa 7')).toBeInTheDocument()
  })

  it('al salir deja de escuchar los eventos', async () => {
    activasApi.mockResolvedValue([sesion('ses-1', '4')])
    const { unmount } = abrir()
    await screen.findByText('Mesa 4')

    unmount()

    expect(desuscribir.quiere).toHaveBeenCalledTimes(1)
    expect(desuscribir.cobrada).toHaveBeenCalledTimes(1)
  })

  it('recarga las mesas cada 30 segundos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await abrirCon([sesion('ses-1', '4')])

    await act(async () => { vi.advanceTimersByTime(30_000) })

    expect(activasApi).toHaveBeenCalledTimes(2)
  })
})
