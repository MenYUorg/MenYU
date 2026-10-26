import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api } from '../../../services/api'
import { reiniciarSesionDePrueba, sesionDePrueba } from '../../../test/authClient'
import { PagosPage } from './PagosPage'

let rolActual: 'OWNER' | 'GERENTE' | null = 'GERENTE'
let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())
vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({ selectedRestauranteId: restauranteActual }),
  useRolActual: () => rolActual,
}))
// `pedirJson` queda el real (pone el token de la sesión y maneja el 401); solo se simula el objeto `api`.
vi.mock('../../../services/api', async () => ({
  ...(await vi.importActual<typeof import('../../../services/api')>('../../../services/api')),
  api: { mozos: { list: vi.fn() } },
}))

/** Socket falso: guarda los handlers para poder "recibir" eventos del servidor. */
const socket = {
  handlers: new Map<string, (dato?: unknown) => void>(),
  on: vi.fn((evento: string, fn: (dato?: unknown) => void) => { socket.handlers.set(evento, fn) }),
  emit: vi.fn(),
  disconnect: vi.fn(),
}
vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }))

const listarMozos = vi.mocked(api.mozos.list)

const ACTIVA_4 = { id: 'ses-4', mesaId: 'm4', mesaNumero: '4', tiempoTranscurrido: 75, cantidadItems: 3, cantidadPersonas: 2, totalAcumulado: 12500, quierePagar: true }
const ACTIVA_7 = { id: 'ses-7', mesaId: 'm7', mesaNumero: '7', tiempoTranscurrido: 5, cantidadItems: 1, cantidadPersonas: 1, totalAcumulado: 900, quierePagar: false }
const PAGADA_EF = { id: 'p-1', mesaNumero: '2', totalCobrado: 5000, metodoPago: 'efectivo', cobradoPorNombre: 'Ana', referenciaExterna: null, fechaCobro: new Date().toISOString() }
const PAGADA_MP = { id: 'p-2', mesaNumero: '3', totalCobrado: 7000.5, metodoPago: 'mercadopago', cobradoPorNombre: null, referenciaExterna: '987', fechaCobro: null }
const PAGADA_VIEJA = { ...PAGADA_EF, id: 'p-3', mesaNumero: '9', fechaCobro: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString() }

/** Respuestas del servidor por ruta; cada llamada a fetch queda registrada. */
let respuestas: Record<string, () => Response>
const fetchMock = vi.fn<(url: string, opciones?: RequestInit) => Promise<Response>>((url) => {
  const ruta = Object.keys(respuestas).find((r) => url.includes(r))
  return Promise.resolve(ruta ? respuestas[ruta]() : new Response('{}', { status: 404 }))
})
const json = (cuerpo: unknown, status = 200) => () => new Response(JSON.stringify(cuerpo), { status })
const llamadas = (ruta: string) => fetchMock.mock.calls.filter(([url]) => url.includes(ruta)).map(([url]) => url)

function Destino() {
  const { pathname, search } = useLocation()
  return <p>destino {pathname}{search}</p>
}

async function abrir() {
  render(
    <MemoryRouter initialEntries={['/admin/pagos']}>
      <Routes>
        <Route path="/admin/pagos" element={<PagosPage />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  )
  await vi.waitFor(() => expect(llamadas('/sessions/pagadas').length).toBeGreaterThan(0))
}

const tarjeta = (mesa: string) => screen.getByText(`Mesa ${mesa}`).closest('div[style*="border-radius: 1"]') as HTMLElement
const recibir = (evento: string, dato?: unknown) => act(() => { socket.handlers.get(evento)!(dato) })

beforeEach(() => {
  rolActual = 'GERENTE'
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
  socket.handlers.clear()
  reiniciarSesionDePrueba()
  sesionDePrueba.token = 'jwt-de-test'
  respuestas = {
    '/sessions/activas': json([ACTIVA_4, ACTIVA_7]),
    '/sessions/pagadas': json([PAGADA_EF, PAGADA_MP]),
  }
  vi.stubGlobal('fetch', fetchMock)
  listarMozos.mockResolvedValue([{ id: 'mozo-1', nombre: 'Ana' }, { id: 'mozo-2', nombre: 'Luis' }] as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PagosPage (caja)', () => {
  it('sin restaurante elegido pide elegir uno y no consulta', () => {
    restauranteActual = null

    render(<MemoryRouter><PagosPage /></MemoryRouter>)

    expect(screen.getByText('Seleccioná un restaurante para ver la caja')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(io).not.toHaveBeenCalled()
  })

  describe('pendientes de cobro', () => {
    it('lista las mesas activas con tiempo, ítems, personas, total y el aviso de "Quiere pagar"', async () => {
      await abrir()

      expect(await screen.findByText('Mesa 4')).toBeInTheDocument()
      expect(llamadas('/sessions/activas')[0]).toMatch(/\/sessions\/activas\?restauranteId=rest-1$/)
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer jwt-de-test' } })
      expect(within(tarjeta('4')).getByText('1h 15m · 3 ítems · 2 pers.')).toBeInTheDocument()
      expect(within(tarjeta('4')).getByText('$12.500')).toBeInTheDocument()
      expect(within(tarjeta('4')).getByText('Quiere pagar')).toBeInTheDocument()
      expect(within(tarjeta('7')).getByText('5 min · 1 ítem · 1 pers.')).toBeInTheDocument()
      expect(within(tarjeta('7')).queryByText('Quiere pagar')).not.toBeInTheDocument()
    })

    it('sin mesas activas lo dice; si la consulta falla muestra el error del servidor', async () => {
      respuestas['/sessions/activas'] = json({ message: 'Sin acceso' }, 403)
      await abrir()
      expect(await screen.findByText('Sin acceso')).toBeInTheDocument()
      expect(screen.getByText('Sin mesas activas')).toBeInTheDocument()
    })

    it('un error sin mensaje dice el código', async () => {
      respuestas['/sessions/activas'] = () => new Response('no es json', { status: 500 })
      await abrir()
      expect(await screen.findByText('Error 500')).toBeInTheDocument()
    })

    it('si fetch falla del todo muestra el texto genérico', async () => {
      respuestas['/sessions/activas'] = () => { throw 'red caída' }
      await abrir()
      expect(await screen.findByText('Error al cargar sesiones activas')).toBeInTheDocument()
    })

    it('un OWNER ve las mesas pero no puede cobrar ni ve el aviso', async () => {
      rolActual = 'OWNER'
      await abrir()

      await screen.findByText('Mesa 4')
      expect(screen.queryByRole('button', { name: 'Registrar pago' })).not.toBeInTheDocument()
      expect(screen.queryByText('Quiere pagar')).not.toBeInTheDocument()
    })

    it('"Ver pedidos" lleva a la mesa', async () => {
      await abrir()

      await screen.findByText('Mesa 4')
      fireEvent.click(within(tarjeta('4')).getByRole('button', { name: 'Ver pedidos' }))

      expect(screen.getByText('destino /admin/tables?mesaId=m4')).toBeInTheDocument()
    })

    it('cada 30 s vuelve a pedir las activas', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await abrir()
      const antes = llamadas('/sessions/activas').length

      await act(async () => { await vi.advanceTimersByTimeAsync(30000) })

      expect(llamadas('/sessions/activas').length).toBe(antes + 1)
    })
  })

  describe('historial', () => {
    it('muestra los cobros con método, quién cobró, referencia de Mercado Pago y hora', async () => {
      await abrir()

      expect(await screen.findByText('Mesa 2')).toBeInTheDocument()
      expect(llamadas('/sessions/pagadas')[0]).toMatch(/\/sessions\/pagadas\?restauranteId=rest-1&fecha=hoy$/)
      expect(screen.getByText('efectivo')).toBeInTheDocument()
      expect(screen.getByText('Ana')).toBeInTheDocument()
      expect(screen.getByText('$7.000,5')).toBeInTheDocument()
      expect(screen.getByText('Mercado Pago')).toBeInTheDocument()
      expect(screen.getByText('#987')).toBeInTheDocument()
      expect(screen.getByText('—')).toBeInTheDocument()
    })

    it('el GERENTE elige entre hoy y ayer', async () => {
      await abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Ayer' }))

      await vi.waitFor(() => expect(llamadas('fecha=ayer').length).toBeGreaterThan(0))
      expect(screen.queryByRole('button', { name: 'Última semana' })).not.toBeInTheDocument()
    })

    it('un OWNER también ve la última semana (sin fecha) y se filtran los cobros de más de 7 días', async () => {
      rolActual = 'OWNER'
      respuestas['/sessions/pagadas'] = json([PAGADA_EF, PAGADA_MP, PAGADA_VIEJA])
      await abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Última semana' }))

      await vi.waitFor(() => expect(llamadas('/sessions/pagadas').some((u) => !u.includes('fecha='))).toBe(true))
      expect(await screen.findByText('Mesa 2')).toBeInTheDocument()
      expect(screen.queryByText('Mesa 9')).not.toBeInTheDocument()
      expect(screen.queryByText('Mesa 3')).not.toBeInTheDocument()
    })

    it('sin cobros, o si la consulta falla, dice que no hay', async () => {
      respuestas['/sessions/pagadas'] = json({}, 500)
      await abrir()

      expect(await screen.findByText('Sin cobros registrados')).toBeInTheDocument()
    })
  })

  describe('tiempo real', () => {
    it('se conecta y entra a la sala del restaurante; se desconecta al salir', async () => {
      const { unmount } = render(<MemoryRouter><PagosPage /></MemoryRouter>)

      expect(io).toHaveBeenCalledWith(expect.stringMatching(/\/ws$/), expect.objectContaining({ transports: ['websocket'] }))
      recibir('connect')
      expect(socket.emit).toHaveBeenCalledWith('cocina:join', { restauranteId: 'rest-1' })

      unmount()
      expect(socket.disconnect).toHaveBeenCalled()
    })

    it('"quiere pagar" marca la mesa (solo para el GERENTE); "cobrada" la saca y recarga el historial', async () => {
      await abrir()
      await screen.findByText('Mesa 7')

      recibir('sesion:quierePagar', { sesionId: 'ses-7' })
      expect(within(tarjeta('7')).getByText('Quiere pagar')).toBeInTheDocument()

      const antes = llamadas('/sessions/pagadas').length
      recibir('sesion:cobrada', { sesionId: 'ses-4' })
      expect(screen.queryByText('Mesa 4')).not.toBeInTheDocument()
      await vi.waitFor(() => expect(llamadas('/sessions/pagadas').length).toBe(antes + 1))
    })

    it('para un OWNER "quiere pagar" no cambia nada; "cobrada" en la semana pide sin fecha', async () => {
      rolActual = 'OWNER'
      await abrir()
      await screen.findByText('Mesa 7')
      fireEvent.click(screen.getByRole('button', { name: 'Última semana' }))

      recibir('sesion:quierePagar', { sesionId: 'ses-7' })
      expect(screen.queryByText('Quiere pagar')).not.toBeInTheDocument()

      respuestas['/sessions/pagadas'] = () => { throw new Error('caído') }
      recibir('sesion:cobrada', { sesionId: 'ses-4' })
      await vi.waitFor(() => expect(llamadas('/sessions/pagadas').filter((u) => !u.includes('fecha=')).length).toBeGreaterThan(1))
    })
  })

  describe('registrar un pago (GERENTE)', () => {
    async function abrirCobro() {
      await abrir()
      await screen.findByText('Mesa 4')
      fireEvent.click(within(tarjeta('4')).getByRole('button', { name: 'Registrar pago' }))
      return screen.getByText('Registrar pago · Mesa 4').closest('div[style*="position: fixed"]') as HTMLElement
    }

    it('muestra el total y los mozos; sin método no deja confirmar', async () => {
      const modal = await abrirCobro()

      expect(within(modal).getByText('$12.500')).toBeInTheDocument()
      expect(await within(modal).findByRole('option', { name: 'Luis' })).toBeInTheDocument()
      expect(listarMozos).toHaveBeenCalledWith('rest-1')
      expect(within(modal).getByRole('button', { name: 'Confirmar pago' })).toBeDisabled()
    })

    it('confirma con el método y el mozo, cierra, recarga y avisa por 2,5 s', async () => {
      respuestas['/sessions/ses-4/cobro'] = json({ ok: true })
      const modal = await abrirCobro()
      await within(modal).findByRole('option', { name: 'Luis' })
      vi.useFakeTimers({ shouldAdvanceTime: true })

      for (const metodo of ['Débito', 'Crédito', 'Transferencia', 'Efectivo']) {
        fireEvent.click(within(modal).getByRole('button', { name: metodo }))
      }
      fireEvent.change(within(modal).getByRole('combobox'), { target: { value: 'mozo-2' } })
      await act(async () => { fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar pago' })) })

      const [, opciones] = fetchMock.mock.calls.find(([url]) => url.includes('/cobro'))!
      expect(opciones).toMatchObject({ method: 'PATCH', headers: { 'Content-Type': 'application/json' } })
      expect(JSON.parse(opciones?.body as string)).toEqual({ metodoPago: 'efectivo', mozoId: 'mozo-2' })
      expect(screen.getByText('Pago registrado correctamente')).toBeInTheDocument()
      expect(screen.queryByText('Registrar pago · Mesa 4')).not.toBeInTheDocument()

      await act(async () => { await vi.advanceTimersByTimeAsync(2500) })
      expect(screen.queryByText('Pago registrado correctamente')).not.toBeInTheDocument()
    })

    it('sin mozo elegido manda null; dos cobros seguidos reinician el aviso', async () => {
      respuestas['/sessions/ses-4/cobro'] = () => new Response(null, { status: 204 })
      respuestas['/sessions/ses-7/cobro'] = json({ ok: true })
      let modal = await abrirCobro()
      fireEvent.click(within(modal).getByRole('button', { name: 'Efectivo' }))
      await act(async () => { fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar pago' })) })
      const [, opciones] = fetchMock.mock.calls.find(([url]) => url.includes('/ses-4/cobro'))!
      expect(JSON.parse(opciones?.body as string)).toEqual({ metodoPago: 'efectivo', mozoId: null })

      fireEvent.click(within(tarjeta('7')).getByRole('button', { name: 'Registrar pago' }))
      modal = screen.getByText('Registrar pago · Mesa 7').closest('div[style*="position: fixed"]') as HTMLElement
      fireEvent.click(within(modal).getByRole('button', { name: 'Débito' }))
      await act(async () => { fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar pago' })) })
      expect(screen.getByText('Pago registrado correctamente')).toBeInTheDocument()
    })

    it('al salir de la pantalla con el aviso visible, cancela el timer que lo oculta', async () => {
      respuestas['/sessions/ses-4/cobro'] = json({ ok: true })
      const modal = await abrirCobro()
      vi.useFakeTimers({ shouldAdvanceTime: true })
      fireEvent.click(within(modal).getByRole('button', { name: 'Efectivo' }))
      await act(async () => { fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar pago' })) })
      expect(screen.getByText('Pago registrado correctamente')).toBeInTheDocument()

      cleanup()
      const timersVivos = vi.getTimerCount()
      await vi.advanceTimersByTimeAsync(2500)

      expect(timersVivos).toBe(0)
    })

    it('si el servidor rechaza muestra el error y deja reintentar', async () => {
      respuestas['/sessions/ses-4/cobro'] = json({ message: 'La mesa ya fue cobrada' }, 409)
      const modal = await abrirCobro()

      fireEvent.click(within(modal).getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar pago' }))

      expect(await within(modal).findByText('La mesa ya fue cobrada')).toBeInTheDocument()
      expect(within(modal).getByRole('button', { name: 'Confirmar pago' })).toBeEnabled()
    })

    it('si falla la red muestra el genérico; si no se pueden cargar los mozos, el select queda vacío', async () => {
      listarMozos.mockRejectedValue(new Error('caído'))
      respuestas['/sessions/ses-4/cobro'] = () => { throw 'red' }
      const modal = await abrirCobro()

      fireEvent.click(within(modal).getByRole('button', { name: 'Efectivo' }))
      fireEvent.click(within(modal).getByRole('button', { name: 'Confirmar pago' }))

      expect(await within(modal).findByText('Error al registrar pago')).toBeInTheDocument()
      expect(within(modal).getAllByRole('option')).toHaveLength(1)
    })

    it('se cierra con "Cancelar", la X o tocando afuera', async () => {
      let modal = await abrirCobro()
      fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText('Registrar pago · Mesa 4')).not.toBeInTheDocument()

      fireEvent.click(within(tarjeta('4')).getByRole('button', { name: 'Registrar pago' }))
      modal = screen.getByText('Registrar pago · Mesa 4').closest('div[style*="position: fixed"]') as HTMLElement
      fireEvent.click(modal.querySelector('.lucide-x')!.closest('button')!)
      expect(screen.queryByText('Registrar pago · Mesa 4')).not.toBeInTheDocument()

      fireEvent.click(within(tarjeta('4')).getByRole('button', { name: 'Registrar pago' }))
      fireEvent.click(screen.getByText('Registrar pago · Mesa 4').closest('div[style*="position: fixed"]') as HTMLElement)
      expect(screen.queryByText('Registrar pago · Mesa 4')).not.toBeInTheDocument()
    })
  })
})
