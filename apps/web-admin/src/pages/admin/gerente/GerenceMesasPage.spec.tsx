import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api, type MesaConQr, type SesionActiva } from '../../../services/api'
import { GerenceMesasPage } from './GerenceMesasPage'

let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth', () => ({ TOKEN_KEY: 'menyu_token' }))

vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({ selectedRestauranteId: restauranteActual }),
}))

vi.mock('../../../services/api', () => ({
  api: {
    mesas: { list: vi.fn(), regenerarQr: vi.fn() },
    sessions: { mesaActiva: vi.fn(), cerrarMesa: vi.fn() },
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
const sesionesApi = vi.mocked(api.sessions)

const mesa = (id: string, numero: string, estado = 'libre'): MesaConQr => ({
  id,
  restauranteId: 'rest-1',
  numero,
  qrToken: `qr-${id}`,
  pin: `48${numero}`,
  estado,
  activo: true,
  qrImage: `data:image/png;base64,${id}`,
})

const sesion = (sesionId: string, extra: Partial<SesionActiva> = {}): SesionActiva => ({
  sesionId,
  creadaEn: new Date(Date.now() - 75 * 60000).toISOString(),
  cantidadClientes: 3,
  totalAcumulado: 12500,
  llamadoActivo: null,
  pedidos: [
    {
      id: 'abcd1234',
      estado: 'en_preparacion',
      createdAt: new Date().toISOString(),
      items: [
        { id: 'i1', cantidad: 2, precioUnitario: 1000, itemNombre: 'Milanesa', modificaciones: [{ ingredienteNombre: 'Cebolla', tipo: 'QUITAR' }, { ingredienteNombre: 'Queso', tipo: 'AGREGAR' }] },
      ],
    },
    { id: 'zzzz9999', estado: 'raro', createdAt: new Date().toISOString(), items: [] },
  ],
  ...extra,
})

const LIBRE = mesa('m1', '1')
const OCUPADA = mesa('m2', '2', 'ocupada')
const CON_LLAMADO = mesa('m3', '3', 'ocupada')

function abrir(ruta = '/admin/mesas') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/admin/mesas" element={<GerenceMesasPage />} />
        <Route path="/admin/pedidos" element={<p>pantalla de pedidos</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrirConMesas(mesas: MesaConQr[] = [LIBRE, OCUPADA, CON_LLAMADO], ruta?: string) {
  mesasApi.list.mockResolvedValue(mesas)
  abrir(ruta)
  await screen.findByText(`${mesas.length} mesas · ${mesas.filter((m) => m.estado === 'ocupada').length} ocupadas`)
}

const tile = (numero: string) => screen.getByText(numero, { selector: 'span' }).closest('div[style*="cursor: pointer"]') as HTMLElement
const kpi = (titulo: string) => screen.getByText(titulo).nextElementSibling?.textContent
const recibir = (evento: string, dato?: unknown) => act(() => { socket.handlers.get(evento)!(dato) })

beforeEach(() => {
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
  socket.handlers.clear()
  localStorage.setItem('menyu_token', 'jwt-de-test')
  sesionesApi.mesaActiva.mockImplementation((id: string) =>
    Promise.resolve(id === 'm2' ? sesion('ses-2') : sesion('ses-3', { cantidadClientes: 1, totalAcumulado: 900, llamadoActivo: { id: 'll-1', motivo: 'general' } })),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('GerenceMesasPage', () => {
  it('sin restaurante elegido pide elegir uno y no se conecta', () => {
    restauranteActual = null

    abrir()

    expect(screen.getByText('Seleccioná un restaurante para ver las mesas')).toBeInTheDocument()
    expect(io).not.toHaveBeenCalled()
  })

  describe('vista general', () => {
    it('muestra los indicadores y las mesas con su sesión y el llamado pendiente', async () => {
      await abrirConMesas()
      await within(tile('2')).findByText('3 clientes')

      expect(kpi('Total mesas')).toBe('3')
      expect(kpi('Ocupadas')).toBe('2')
      expect(kpi('Llamados activos')).toBe('1')
      expect(kpi('Acumulado total')).toBe('$13.400')
      expect(within(tile('1')).getByText('Mesa disponible')).toBeInTheDocument()
      expect(within(tile('2')).getByText('1h 15m')).toBeInTheDocument()
      expect(within(tile('3')).getByText('1 cliente')).toBeInTheDocument()
      expect(within(tile('3')).getByText('Llamado al mozo')).toBeInTheDocument()
    })

    it('mientras carga lo dice; sin mesas lo avisa', async () => {
      mesasApi.list.mockResolvedValue([])

      abrir()

      expect(screen.getByText('Cargando mesas...')).toBeInTheDocument()
      expect(await screen.findByText('Sin mesas asignadas a este restaurante.')).toBeInTheDocument()
    })

    it('si la carga falla muestra el error', async () => {
      mesasApi.list.mockRejectedValueOnce(new Error('Sin conexión')).mockRejectedValueOnce('raro')

      const { unmount } = abrir()
      expect(await screen.findByText('Sin conexión')).toBeInTheDocument()
      unmount()

      abrir()
      expect(await screen.findByText('Error al cargar mesas')).toBeInTheDocument()
    })

    it('si el servidor dice que la mesa ocupada no tiene sesión, la tarjeta queda en "Cargando..."', async () => {
      sesionesApi.mesaActiva.mockResolvedValue(null as never)
      await abrirConMesas([OCUPADA])

      expect(within(tile('2')).getByText('Cargando...')).toBeInTheDocument()
      expect(kpi('Acumulado total')).toBe('$0')
    })

    it('cada 30 s vuelve a pedir las sesiones de las mesas ocupadas', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      await abrirConMesas()
      await vi.waitFor(() => expect(sesionesApi.mesaActiva).toHaveBeenCalledTimes(2))

      await act(async () => { await vi.advanceTimersByTimeAsync(30000) })

      expect(sesionesApi.mesaActiva).toHaveBeenCalledTimes(4)
    })
  })

  describe('tiempo real', () => {
    it('se conecta con el token y entra a la sala; al salir se desconecta', async () => {
      mesasApi.list.mockResolvedValue([])
      const { unmount } = abrir()

      expect(io).toHaveBeenCalledWith(expect.stringMatching(/\/ws$/), { auth: { token: 'jwt-de-test' }, transports: ['websocket'] })
      recibir('connect')
      expect(socket.emit).toHaveBeenCalledWith('cocina:join', { restauranteId: 'rest-1' })

      unmount()
      expect(socket.disconnect).toHaveBeenCalled()
    })

    it('un llamado marca la mesa y muestra un aviso que se va solo a los 5 s o con la X', async () => {
      await abrirConMesas()
      await within(tile('2')).findByText('3 clientes')
      vi.useFakeTimers({ shouldAdvanceTime: true })

      recibir('waiter:called', { llamadoId: 'll-2', sesionId: 'ses-2', mesaNumero: '2', motivo: 'pedir_cuenta' })
      expect(within(tile('2')).getByText('pedir_cuenta')).toBeInTheDocument()
      expect(kpi('Llamados activos')).toBe('2')
      const aviso = screen.getByText('Mesa 2').closest('div[style*="position: fixed"]') as HTMLElement
      expect(within(aviso).getByText('pedir_cuenta')).toBeInTheDocument()

      await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
      expect(screen.queryByText('Mesa 2')).not.toBeInTheDocument()

      recibir('waiter:called', { llamadoId: 'll-3', sesionId: 'otra', mesaNumero: '9', motivo: 'general' })
      const otro = screen.getByText('Mesa 9').closest('div[style*="position: fixed"]') as HTMLElement
      expect(within(otro).getByText('Llamado al mozo')).toBeInTheDocument()
      fireEvent.click(within(otro).getByRole('button'))
      expect(screen.queryByText('Mesa 9')).not.toBeInTheDocument()
    })

    it.each(['sesion:cerrada', 'session:closed'])('"%s" libera la mesa de esa sesión', async (evento) => {
      await abrirConMesas()
      await within(tile('2')).findByText('3 clientes')

      recibir(evento, { sesionId: 'ses-2' })

      expect(within(tile('2')).getByText('Libre')).toBeInTheDocument()
      expect(kpi('Ocupadas')).toBe('1')
      recibir(evento, { sesionId: 'no-existe' })
      expect(kpi('Ocupadas')).toBe('1')
    })
  })

  describe('detalle de una mesa', () => {
    async function abrirMesa(numero = '2') {
      await abrirConMesas()
      await within(tile('2')).findByText('3 clientes')
      fireEvent.click(tile(numero))
      await screen.findByText('Pedidos de la sesión')
    }

    it('muestra tiempo, pedidos, total y comensales, y los pedidos con sus ítems', async () => {
      await abrirMesa()

      expect(screen.getByText('1h 15m')).toBeInTheDocument()
      expect(screen.getByText('2 pedidos')).toBeInTheDocument()
      expect(screen.getByText('$12.500')).toBeInTheDocument()
      expect(screen.getByText('3 comensales')).toBeInTheDocument()
      expect(screen.getByText('#ABCD')).toBeInTheDocument()
      expect(screen.getByText('● En preparación')).toBeInTheDocument()
      expect(screen.getByText('● Pendiente')).toBeInTheDocument()
      expect(screen.getByText('2× Milanesa')).toBeInTheDocument()
      expect(screen.getByText('sin Cebolla')).toBeInTheDocument()
      expect(screen.getByText('+ Queso')).toBeInTheDocument()
    })

    it('con un comensal y un pedido usa el singular; con llamado lo muestra', async () => {
      await abrirMesa('3')

      expect(screen.getByText('1 comensal')).toBeInTheDocument()
      expect(screen.getAllByText('Llamado al mozo').length).toBeGreaterThan(0)
    })

    it('una mesa libre no deja ver pedidos ni cerrar sesión', async () => {
      await abrirConMesas()
      fireEvent.click(tile('1'))

      expect(screen.getByText('Mesa disponible')).toBeInTheDocument()
      expect(screen.getAllByText('—')).toHaveLength(4)
      expect(screen.getByRole('button', { name: /Ver pedidos/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: /Cerrar sesión/ })).toBeDisabled()
    })

    it('una sesión sin pedidos lo dice; mientras carga también', async () => {
      sesionesApi.mesaActiva.mockResolvedValue(sesion('ses-2', { pedidos: [] }))
      await abrirConMesas([OCUPADA])
      fireEvent.click(tile('2'))

      expect(await screen.findByText('Sin pedidos aún.')).toBeInTheDocument()
    })

    it('"Ver pedidos" lleva a la pantalla de pedidos; "← Volver" vuelve a la grilla', async () => {
      await abrirMesa()

      fireEvent.click(screen.getByRole('button', { name: '← Volver' }))
      expect(screen.getByText('Total mesas')).toBeInTheDocument()

      fireEvent.click(tile('2'))
      fireEvent.click(screen.getByRole('button', { name: /Ver pedidos/ }))
      expect(screen.getByText('pantalla de pedidos')).toBeInTheDocument()
    })

    it('cerrar la sesión pide confirmación; al confirmar libera la mesa y vuelve a la grilla', async () => {
      sesionesApi.cerrarMesa.mockResolvedValue({ ok: true } as never)
      await abrirMesa()

      fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText('¿Cerrar sesión de mesa 2?')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }))
      fireEvent.click(screen.getByText('¿Cerrar sesión de mesa 2?').closest('div[style*="position: fixed"]') as HTMLElement)
      expect(screen.queryByText('¿Cerrar sesión de mesa 2?')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Cerrar sesión/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Sí, cerrar' }))

      expect(await screen.findByText('Total mesas')).toBeInTheDocument()
      expect(sesionesApi.cerrarMesa).toHaveBeenCalledWith('m2')
      expect(within(tile('2')).getByText('Libre')).toBeInTheDocument()
    })

    it('"QR y PIN" muestra el PIN y el QR, imprime y regenera (no con la mesa ocupada)', async () => {
      const abrirVentana = vi.spyOn(window, 'open').mockImplementation(() => null)
      mesasApi.regenerarQr.mockResolvedValue({ ...LIBRE, qrImage: 'data:nuevo' })
      await abrirConMesas()
      fireEvent.click(tile('1'))

      fireEvent.click(screen.getByRole('button', { name: /QR y PIN/ }))
      expect(screen.getByText('481')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /Imprimir QR/ }))
      expect(abrirVentana).toHaveBeenCalledWith(LIBRE.qrImage, '_blank')

      fireEvent.click(screen.getByRole('button', { name: /Regenerar QR/ }))
      await vi.waitFor(() => expect(screen.getByAltText('QR Mesa 1')).toHaveAttribute('src', 'data:nuevo'))
      expect(mesasApi.regenerarQr).toHaveBeenCalledWith('m1')

      fireEvent.click(screen.getByAltText('QR Mesa 1').closest('div[style*="position: fixed"]') as HTMLElement)
      expect(screen.queryByAltText('QR Mesa 1')).not.toBeInTheDocument()
      abrirVentana.mockRestore()
    })

    it('con la mesa ocupada no deja regenerar el QR; la X cierra el modal', async () => {
      await abrirMesa()

      fireEvent.click(screen.getByRole('button', { name: /QR y PIN/ }))
      expect(screen.getByRole('button', { name: /Regenerar QR/ })).toBeDisabled()
      const modal = screen.getByAltText('QR Mesa 2').parentElement as HTMLElement
      fireEvent.click(within(modal).getAllByRole('button')[0])
      expect(screen.queryByAltText('QR Mesa 2')).not.toBeInTheDocument()
    })

    it('con ?mesaId abre directo esa mesa', async () => {
      await abrirConMesas([LIBRE, OCUPADA], '/admin/mesas?mesaId=m1')

      expect(await screen.findByText('Pedidos de la sesión')).toBeInTheDocument()
      expect(screen.getByText('Mesa disponible')).toBeInTheDocument()
    })
  })
})
