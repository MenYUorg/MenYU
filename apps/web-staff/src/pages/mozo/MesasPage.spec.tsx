import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Mesa } from '@menyu/types'
import { io } from 'socket.io-client'
import { api, type SesionActivaRico, type WaiterCallRico } from '../../services/api'
import { MesasPage } from './MesasPage'

let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth', () => ({ useAuth: () => ({ user: { nombre: 'Ana Pérez' } }) }))
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))
vi.mock('../../store/mozoStore', () => ({ useMozoStore: () => ({ restauranteId: restauranteActual }) }))
vi.mock('../../services/api', () => ({
  api: {
    mesas: { getAll: vi.fn() },
    sesiones: { getActiva: vi.fn(), cerrar: vi.fn() },
    waiterCalls: { getAll: vi.fn() },
  },
}))

/** Socket falso: guarda los handlers para poder "recibir" eventos del servidor. */
const socket = {
  handlers: new Map<string, (dato?: unknown) => void>(),
  on: vi.fn((evento: string, fn: (dato?: unknown) => void) => { socket.handlers.set(evento, fn) }),
  emit: vi.fn(),
  disconnect: vi.fn(),
}
vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }))

const mesasApi = vi.mocked(api.mesas)
const sesionesApi = vi.mocked(api.sesiones)
const llamadosApi = vi.mocked(api.waiterCalls)

const mesa = (id: string, numero: string, estado = 'libre') => ({ id, numero, estado, restauranteId: 'rest-1' }) as unknown as Mesa

const sesion = (sesionId: string, extra: Partial<SesionActivaRico> = {}): SesionActivaRico => ({
  sesionId,
  creadaEn: new Date(Date.now() - 75 * 60000).toISOString(),
  cantidadClientes: 3,
  totalAcumulado: 12500,
  llamadoActivo: null,
  pedidos: [
    {
      id: 'abcdef12',
      estado: 'listo',
      createdAt: new Date().toISOString(),
      items: [{ id: 'i1', cantidad: 2, precioUnitario: 1000, itemNombre: 'Milanesa', modificaciones: [{ ingredienteNombre: 'Cebolla', tipo: 'quitar' }, { ingredienteNombre: 'Queso', tipo: 'AGREGAR' }] }],
    },
    { id: 'zzzzzz99', estado: 'raro', createdAt: new Date().toISOString(), items: [] },
  ],
  ...extra,
})

const llamado = (mesaNumero: string): WaiterCallRico => ({
  id: `ll-${mesaNumero}`, sesionId: 's', mozoId: null, estado: 'pendiente', motivo: 'general', createdAt: new Date().toISOString(), sesion: { mesa: { numero: mesaNumero } },
})

const LIBRE = mesa('m1', '1')
const OCUPADA = mesa('m2', '2', 'ocupada')

function Destino() {
  const { pathname, search } = useLocation()
  return <p>destino {pathname}{search}</p>
}

function abrir(ruta = '/mozo/mesas') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/mozo/mesas" element={<MesasPage />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrirConMesas(mesas: Mesa[] = [LIBRE, OCUPADA], ruta?: string) {
  mesasApi.getAll.mockResolvedValue(mesas)
  abrir(ruta)
  await screen.findByText(mesas[0].numero, { selector: 'span' })
}

const tile = (numero: string) => screen.getByText(numero, { selector: 'span' }).closest('div[style*="cursor: pointer"]') as HTMLElement
const recibir = (evento: string, dato?: unknown) => act(() => { socket.handlers.get(evento)!(dato) })

beforeEach(() => {
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
  socket.handlers.clear()
  llamadosApi.getAll.mockResolvedValue([])
  sesionesApi.getActiva.mockResolvedValue(sesion('ses-2'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('MesasPage (mozo)', () => {
  it('sin restaurante no consulta ni se conecta; el encabezado vuelve al panel', () => {
    restauranteActual = null

    abrir()

    expect(mesasApi.getAll).not.toHaveBeenCalled()
    expect(io).not.toHaveBeenCalled()
    fireEvent.click(document.querySelector('.lucide-chevron-left')!.closest('button')!)
    expect(screen.getByText('destino /mozo')).toBeInTheDocument()
  })

  describe('grilla', () => {
    it('muestra las mesas con la sesión de las ocupadas y el aviso de llamado', async () => {
      llamadosApi.getAll.mockResolvedValue([llamado('2')])
      await abrirConMesas()

      expect(within(tile('1')).getByText('Libre')).toBeInTheDocument()
      expect(within(tile('1')).getByText('Mesa disponible')).toBeInTheDocument()
      expect(await within(tile('2')).findByText('3 clientes')).toBeInTheDocument()
      expect(within(tile('2')).getByText('1h 15m')).toBeInTheDocument()
      expect(within(tile('2')).getByText('$12.500')).toBeInTheDocument()
      expect(await within(tile('2')).findByText('Llamado al mozo')).toBeInTheDocument()
    })

    it('una ocupada sin sesión dice "Cargando..."; con un cliente y minutos', async () => {
      sesionesApi.getActiva.mockResolvedValueOnce(null as never).mockResolvedValueOnce(sesion('ses-3', { cantidadClientes: 1, creadaEn: new Date(Date.now() - 5 * 60000).toISOString() }))
      await abrirConMesas([OCUPADA, mesa('m3', '3', 'ocupada')])

      expect(within(tile('2')).getByText('Cargando...')).toBeInTheDocument()
      expect(within(tile('3')).getByText('1 cliente')).toBeInTheDocument()
      expect(within(tile('3')).getByText('5 min')).toBeInTheDocument()
    })

    it('mientras carga lo dice; sin mesas lo avisa; si los llamados fallan no pasa nada', async () => {
      llamadosApi.getAll.mockRejectedValue(new Error('caído'))
      mesasApi.getAll.mockResolvedValue([])

      abrir()

      expect(screen.getByText('Cargando mesas...')).toBeInTheDocument()
      expect(await screen.findByText('Sin mesas asignadas a este restaurante.')).toBeInTheDocument()
    })

    it('si la carga falla muestra el error', async () => {
      mesasApi.getAll.mockRejectedValueOnce(new Error('Sin conexión')).mockRejectedValueOnce('raro')

      const { unmount } = abrir()
      expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
      unmount()

      abrir()
      expect(await screen.findByText('Error al cargar mesas')).toBeInTheDocument()
    })

    it('cada 30 s vuelve a pedir sesiones y llamados', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await abrirConMesas()
      await vi.waitFor(() => expect(sesionesApi.getActiva).toHaveBeenCalledTimes(1))

      await act(async () => { await vi.advanceTimersByTimeAsync(30000) })

      expect(sesionesApi.getActiva).toHaveBeenCalledTimes(2)
      expect(llamadosApi.getAll).toHaveBeenCalledTimes(2)
    })
  })

  describe('tiempo real', () => {
    it('se conecta sin token, entra como mozo, recarga los llamados y se desconecta al salir', async () => {
      mesasApi.getAll.mockResolvedValue([])
      const { unmount } = abrir()

      expect(io).toHaveBeenCalledWith(expect.stringMatching(/\/ws$/), { transports: ['websocket'] })
      recibir('connect')
      expect(socket.emit).toHaveBeenCalledWith('mozo:join', { restauranteId: 'rest-1' })
      recibir('waiter:called')
      expect(llamadosApi.getAll).toHaveBeenCalledTimes(2)

      unmount()
      expect(socket.disconnect).toHaveBeenCalled()
    })

    it.each(['sesion:cerrada', 'session:closed'])('"%s" libera la mesa de esa sesión', async (evento) => {
      await abrirConMesas()
      await within(tile('2')).findByText('3 clientes')

      recibir(evento, { sesionId: 'ses-2' })

      expect(within(tile('2')).getByText('Libre')).toBeInTheDocument()
      recibir(evento, { sesionId: 'otra' })
      expect(within(tile('1')).getByText('Libre')).toBeInTheDocument()
    })
  })

  describe('detalle', () => {
    async function abrirMesa(numero = '2') {
      await abrirConMesas()
      await within(tile('2')).findByText('3 clientes')
      fireEvent.click(tile(numero))
    }

    it('una mesa ocupada muestra tiempo, clientes, total y los pedidos con sus ítems', async () => {
      await abrirMesa()

      expect(await screen.findByText('Pedidos de la sesión')).toBeInTheDocument()
      expect(screen.getByText('Mesa 2')).toBeInTheDocument()
      expect(screen.getByText('#ABCDEF')).toBeInTheDocument()
      expect(screen.getByText('● Listo')).toBeInTheDocument()
      expect(screen.getByText('● Pendiente')).toBeInTheDocument()
      expect(screen.getByText('sin Cebolla')).toBeInTheDocument()
      expect(screen.getByText('+ Queso')).toBeInTheDocument()
    })

    it('mientras carga la sesión lo dice; sin pedidos o sin sesión también', async () => {
      let entregar: (s: SesionActivaRico | null) => void = () => {}
      await abrirConMesas()
      sesionesApi.getActiva.mockReturnValueOnce(new Promise((r) => { entregar = r }))

      fireEvent.click(tile('2'))
      expect(screen.getByText('Cargando sesión...')).toBeInTheDocument()
      await act(async () => { entregar(sesion('ses-2', { pedidos: [] })) })
      expect(screen.getByText('Sin pedidos aún.')).toBeInTheDocument()
    })

    it('si no se puede leer la sesión dice que no hay información', async () => {
      await abrirConMesas()
      sesionesApi.getActiva.mockRejectedValueOnce(new Error('403'))

      fireEvent.click(tile('2'))

      expect(await screen.findByText('Sin información de sesión.')).toBeInTheDocument()
    })

    it('una mesa libre no deja cerrar; "Tomar pedido" lleva a la toma con la mesa; volver regresa', async () => {
      await abrirConMesas()
      fireEvent.click(tile('1'))

      expect(screen.getByText('Mesa disponible')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Cerrar sesión/ })).toBeDisabled()
      fireEvent.click(document.querySelector('.lucide-chevron-left')!.closest('button')!)
      expect(screen.getByText('Mesa disponible', { selector: 'span, p' })).toBeInTheDocument()

      fireEvent.click(tile('1'))
      fireEvent.click(screen.getByRole('button', { name: /Tomar pedido/ }))
      expect(screen.getByText('destino /mozo/toma-pedidos?mesaId=m1')).toBeInTheDocument()
    })

    it('cerrar la sesión pide confirmación; si se cancela no hace nada', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false)
      await abrirMesa()

      fireEvent.click(await screen.findByRole('button', { name: /Cerrar sesión/ }))

      expect(window.confirm).toHaveBeenCalledWith('¿Cerrar la sesión de Mesa 2?')
      expect(sesionesApi.cerrar).not.toHaveBeenCalled()
    })

    it('al confirmar cierra la sesión, libera la mesa y vuelve a la grilla', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      sesionesApi.cerrar.mockResolvedValue({ ok: true } as never)
      await abrirMesa()

      fireEvent.click(await screen.findByRole('button', { name: /Cerrar sesión/ }))

      await vi.waitFor(() => expect(within(tile('2')).getByText('Libre')).toBeInTheDocument())
      expect(sesionesApi.cerrar).toHaveBeenCalledWith('m2')
    })

    it('si cerrar falla avisa con el error', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      const aviso = vi.spyOn(window, 'alert').mockImplementation(() => {})
      sesionesApi.cerrar.mockRejectedValueOnce(new Error('Tiene un cobro pendiente')).mockRejectedValueOnce('raro')
      await abrirMesa()
      await screen.findByText('Pedidos de la sesión')

      fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }))
      await vi.waitFor(() => expect(aviso).toHaveBeenCalledWith('Tiene un cobro pendiente'))
      fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }))
      await vi.waitFor(() => expect(aviso).toHaveBeenCalledWith('Error al cerrar sesión'))
    })

    it('si la sesión abierta en el detalle se cierra por socket, se limpia', async () => {
      await abrirMesa()
      await screen.findByText('Pedidos de la sesión')

      recibir('sesion:cerrada', { sesionId: 'ses-2' })

      expect(screen.getByText('Sin información de sesión.')).toBeInTheDocument()
    })

    it('con ?mesaId abre esa mesa directamente', async () => {
      await abrirConMesas([LIBRE, OCUPADA], '/mozo/mesas?mesaId=m2')

      expect(await screen.findByText('Pedidos de la sesión')).toBeInTheDocument()
    })
  })
})
