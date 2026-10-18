import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { io } from 'socket.io-client'
import { api, type PedidoAdmin } from '../../../services/api'
import { PedidosPage } from './PedidosPage'

let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth', () => ({ TOKEN_KEY: 'menyu_token' }))

vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({ selectedRestauranteId: restauranteActual }),
}))

vi.mock('../../../services/api', () => ({
  api: { pedidos: { list: vi.fn(), cambiarEstado: vi.fn(), editar: vi.fn() } },
}))

/** Socket falso: guarda los handlers para poder "recibir" eventos del servidor. */
const socket = {
  handlers: new Map<string, (dato?: unknown) => void>(),
  on: vi.fn((evento: string, fn: (dato?: unknown) => void) => { socket.handlers.set(evento, fn) }),
  emit: vi.fn(),
  disconnect: vi.fn(),
}
vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }))

const listar = vi.mocked(api.pedidos.list)
const cambiarEstado = vi.mocked(api.pedidos.cambiarEstado)
const editar = vi.mocked(api.pedidos.editar)

const hace = (minutos: number) => new Date(Date.now() - minutos * 60000).toISOString()
const mod = (accion: string, nombre: string, cantidad?: number) =>
  ({ accion, cantidad, itemIngrediente: { ingrediente: { nombre } } }) as unknown as PedidoAdmin['items'][number]['mods'][number]

function pedido(id: string, estado: string, extra: Partial<PedidoAdmin> = {}): PedidoAdmin {
  return {
    id,
    sesionId: 'ses-1',
    estado,
    createdAt: hace(5),
    updatedAt: hace(5),
    mesa: { numero: id.slice(-1) },
    pago: null,
    items: [
      { id: `${id}-1`, cantidad: 2, cantidadEditada: null, precioUnitario: 1000, notas: 'bien cocida', item: { nombre: 'Milanesa' }, mods: [mod('QUITAR', 'Cebolla'), mod('AGREGAR', 'Queso', 2), mod('AGREGAR', 'Huevo')] },
      { id: `${id}-2`, cantidad: 1, cantidadEditada: null, precioUnitario: 500, notas: '  ', item: { nombre: 'Agua' }, mods: [] },
    ],
    ...extra,
  }
}

const PENDIENTE = pedido('pendiente-1', 'pendiente')
const EN_PREP = pedido('enprep-2', 'en_preparacion', {
  createdAt: hace(25),
  items: [
    { id: 'ep-1', cantidad: 3, cantidadEditada: 1, precioUnitario: 500, notas: null, item: { nombre: 'Empanada' }, mods: [] },
    { id: 'ep-2', cantidad: 1, cantidadEditada: 0, precioUnitario: 800, notas: 'fría', item: { nombre: 'Gaseosa' }, mods: [mod('AGREGAR', 'Limón')] },
  ],
})
const LISTO = pedido('listo-3', 'listo')

async function abrir(pendientes = [PENDIENTE], enPrep = [EN_PREP], listos = [LISTO]) {
  listar.mockImplementation((_r: string, estado: string) =>
    Promise.resolve(estado === 'pendiente' ? pendientes : estado === 'en_preparacion' ? enPrep : listos),
  )
  render(<PedidosPage />)
  await screen.findAllByText(/^Mesa /)
}

const tarjeta = (mesa: string) => screen.getByText(`Mesa ${mesa}`).closest('div[style*="padding: 14px 16px"]') as HTMLElement
const recibir = (evento: string, dato?: unknown) => act(() => { socket.handlers.get(evento)!(dato) })

beforeEach(() => {
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
  socket.handlers.clear()
  localStorage.setItem('menyu_token', 'jwt-de-test')
})

describe('PedidosPage', () => {
  it('sin restaurante elegido no consulta ni se conecta', () => {
    restauranteActual = null

    render(<PedidosPage />)

    expect(screen.getByText('Seleccioná un restaurante para ver los pedidos.')).toBeInTheDocument()
    expect(listar).not.toHaveBeenCalled()
    expect(io).not.toHaveBeenCalled()
  })

  describe('tablero', () => {
    it('pide las tres columnas y muestra cada pedido con sus ítems, modificaciones y notas', async () => {
      await abrir()

      expect(listar.mock.calls.map(([, estado]) => estado)).toEqual(['pendiente', 'en_preparacion', 'listo'])
      const pendiente = tarjeta('1')
      expect(within(pendiente).getByText('Pendiente')).toBeInTheDocument()
      expect(within(pendiente).getByText('2× Milanesa')).toBeInTheDocument()
      expect(within(pendiente).getByText('sin Cebolla')).toBeInTheDocument()
      expect(within(pendiente).getByText('+2 Queso')).toBeInTheDocument()
      expect(within(pendiente).getByText('+1 Huevo')).toBeInTheDocument()
      expect(within(pendiente).getByText('📝 bien cocida')).toBeInTheDocument()
      expect(within(pendiente).getByText(/· 5min/)).toBeInTheDocument()
    })

    it('un pedido editado muestra lo que quedó, lo quitado tachado y "Editado"', async () => {
      await abrir()

      const card = tarjeta('2')
      expect(within(card).getByText('En preparación · Editado')).toBeInTheDocument()
      expect(within(card).getByText('1× Empanada')).toBeInTheDocument()
      expect(within(card).getByText('2× Empanada')).toBeInTheDocument()
      expect(within(card).getByText('1× Gaseosa')).toBeInTheDocument()
      expect(within(card).queryByText('📝 fría')).not.toBeInTheDocument()
      expect(within(card).getByText(/· 25min/)).toBeInTheDocument()
      // A los 20 minutos o más el pedido se marca como urgente; el de 5 minutos no.
      const alerta = '.lucide-triangle-alert, .lucide-alert-triangle'
      expect(card.querySelector(alerta)).not.toBeNull()
      expect(tarjeta('1').querySelector(alerta)).toBeNull()
    })

    it('las columnas vacías dicen "Sin pedidos"', async () => {
      await abrir([PENDIENTE], [], [])

      expect(screen.getAllByText('Sin pedidos')).toHaveLength(2)
    })

    it('si la carga falla lo dice; "Actualizar" vuelve a pedir', async () => {
      listar.mockRejectedValueOnce(new Error('caído'))
      render(<PedidosPage />)

      expect(await screen.findByText('No se pudieron cargar los pedidos.')).toBeInTheDocument()

      listar.mockResolvedValue([PENDIENTE])
      fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }))
      expect(await screen.findAllByText('Mesa 1')).not.toHaveLength(0)
      expect(screen.queryByText('No se pudieron cargar los pedidos.')).not.toBeInTheDocument()
    })
  })

  describe('tiempo real', () => {
    it('se conecta con el token, entra a la sala del restaurante y se desconecta al salir', async () => {
      listar.mockResolvedValue([])
      const { unmount } = render(<PedidosPage />)

      expect(io).toHaveBeenCalledWith(expect.stringMatching(/\/ws$/), { auth: { token: 'jwt-de-test' }, transports: ['websocket'] })
      recibir('connect')
      expect(socket.emit).toHaveBeenCalledWith('cocina:join', { restauranteId: 'rest-1' })

      unmount()
      expect(socket.disconnect).toHaveBeenCalled()
    })

    it('un pedido nuevo aparece (sin duplicarse); uno actualizado cambia de columna o se va', async () => {
      await abrir([PENDIENTE], [], [])
      const nuevo = pedido('nuevo-4', 'pendiente')

      recibir('order:new', nuevo)
      recibir('order:new', nuevo)
      expect(screen.getAllByText('Mesa 4')).toHaveLength(1)

      recibir('order:updated', { ...nuevo, estado: 'listo' })
      expect(within(tarjeta('4')).getByText('Listo')).toBeInTheDocument()

      recibir('order:updated', pedido('otro-5', 'en_preparacion'))
      expect(screen.getByText('Mesa 5')).toBeInTheDocument()

      recibir('order:updated', { ...nuevo, estado: 'entregado' })
      expect(screen.queryByText('Mesa 4')).not.toBeInTheDocument()
    })
  })

  describe('avanzar y entregar', () => {
    it('avanza un pendiente a "En preparación" con la respuesta del servidor', async () => {
      cambiarEstado.mockResolvedValue({ ...PENDIENTE, estado: 'en_preparacion' })
      await abrir()

      fireEvent.click(within(tarjeta('1')).getByRole('button', { name: 'En preparación' }))

      await vi.waitFor(() => expect(within(tarjeta('1')).getByText('En preparación')).toBeInTheDocument())
      expect(cambiarEstado).toHaveBeenCalledWith('pendiente-1', 'en_preparacion')
    })

    it('si el servidor lo dio por terminado lo saca; si falla vuelve al estado anterior', async () => {
      cambiarEstado.mockResolvedValueOnce({ ...EN_PREP, estado: 'entregado' }).mockRejectedValueOnce(new Error('caído'))
      await abrir()

      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Listo' }))
      await vi.waitFor(() => expect(screen.queryByText('Mesa 2')).not.toBeInTheDocument())

      fireEvent.click(within(tarjeta('1')).getByRole('button', { name: 'En preparación' }))
      await vi.waitFor(() => expect(within(tarjeta('1')).getByRole('button', { name: 'En preparación' })).toBeEnabled())
      expect(within(tarjeta('1')).getByText('Pendiente')).toBeInTheDocument()
    })

    it('"Marcar entregado" lo saca del tablero; si falla vuelve', async () => {
      cambiarEstado.mockResolvedValueOnce({ ...LISTO, estado: 'entregado' }).mockRejectedValueOnce(new Error('caído'))
      await abrir()

      fireEvent.click(within(tarjeta('3')).getByRole('button', { name: /Marcar entregado/ }))
      expect(screen.queryByText('Mesa 3')).not.toBeInTheDocument()
      expect(cambiarEstado).toHaveBeenCalledWith('listo-3', 'entregado')
      await act(async () => {}) // termina el primer cambio de estado (el botón vuelve a habilitarse)

      recibir('order:new', LISTO)
      fireEvent.click(within(tarjeta('3')).getByRole('button', { name: /Marcar entregado/ }))
      expect(screen.queryByText('Mesa 3')).not.toBeInTheDocument()
      expect(await screen.findByText('Mesa 3')).toBeInTheDocument()
    })

    it('un pedido listo no se puede editar', async () => {
      await abrir()

      expect(within(tarjeta('3')).queryByRole('button', { name: 'Editar pedido' })).not.toBeInTheDocument()
    })
  })

  describe('editar', () => {
    async function abrirEdicion(mesa = '2') {
      await abrir()
      fireEvent.click(within(tarjeta(mesa)).getByRole('button', { name: 'Editar pedido' }))
      return screen.getByText(/^Editar pedido #/).closest('div[style*="position: fixed"]') as HTMLElement
    }

    it('arranca con las cantidades actuales y respeta 0 y la cantidad actual', async () => {
      const modal = await abrirEdicion()

      expect(within(modal).getByText('Editar pedido #ENPREP-2')).toBeInTheDocument()
      expect(within(modal).getByText('Ítem anulado')).toBeInTheDocument()
      const [menos1, menos2] = within(modal).getAllByRole('button', { name: '−' })
      expect(within(modal).getAllByRole('button', { name: '+' })[0]).toBeDisabled()
      expect(menos2).toBeDisabled()

      fireEvent.click(menos1)
      expect(within(modal).getByText('Esto anulará el pedido completo.')).toBeInTheDocument()
      fireEvent.click(within(modal).getAllByRole('button', { name: '+' })[0])
      expect(within(modal).queryByText('Esto anulará el pedido completo.')).not.toBeInTheDocument()
    })

    it('guarda y reemplaza el pedido en el tablero; si quedó anulado lo saca', async () => {
      editar
        .mockResolvedValueOnce({ ...PENDIENTE, items: [{ ...PENDIENTE.items[0], cantidadEditada: 1 }, PENDIENTE.items[1]] } as never)
        .mockResolvedValueOnce({ ...EN_PREP, estado: 'anulado' } as never)
      let modal = await abrirEdicion('1')

      fireEvent.click(within(modal).getAllByRole('button', { name: '−' })[0])
      fireEvent.change(within(modal).getByPlaceholderText('Describí el motivo de la edición…'), { target: { value: ' Pidió uno ' } })
      expect(within(modal).getByText('2/50 palabras')).toBeInTheDocument()
      fireEvent.click(within(modal).getByRole('button', { name: 'Guardar edición' }))
      expect(await within(tarjeta('1')).findByText('Pendiente · Editado')).toBeInTheDocument()
      expect(editar).toHaveBeenCalledWith('pendiente-1', { justificacion: 'Pidió uno', ediciones: [{ pedidoItemId: 'pendiente-1-1', cantidadNueva: 1 }] })

      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Editar pedido' }))
      modal = screen.getByText(/^Editar pedido #/).closest('div[style*="position: fixed"]') as HTMLElement
      fireEvent.click(within(modal).getAllByRole('button', { name: '−' })[0])
      fireEvent.change(within(modal).getByPlaceholderText('Describí el motivo de la edición…'), { target: { value: 'Anular' } })
      fireEvent.click(within(modal).getByRole('button', { name: 'Guardar edición' }))
      await vi.waitFor(() => expect(screen.queryByText('Mesa 2')).not.toBeInTheDocument())
    })

    it('más de 50 palabras no deja guardar; los errores del servidor se muestran', async () => {
      editar.mockRejectedValueOnce(new Error('Ya tiene un cobro')).mockRejectedValueOnce('raro')
      const modal = await abrirEdicion()
      const motivo = within(modal).getByPlaceholderText('Describí el motivo de la edición…')

      fireEvent.click(within(modal).getAllByRole('button', { name: '−' })[0])
      fireEvent.change(motivo, { target: { value: Array(51).fill('x').join(' ') } })
      expect(within(modal).getByRole('button', { name: 'Guardar edición' })).toBeDisabled()

      fireEvent.change(motivo, { target: { value: 'Motivo' } })
      fireEvent.click(within(modal).getByRole('button', { name: 'Guardar edición' }))
      expect(await within(modal).findByText('Ya tiene un cobro')).toBeInTheDocument()
      fireEvent.click(within(modal).getByRole('button', { name: 'Guardar edición' }))
      expect(await within(modal).findByText('Error al editar pedido')).toBeInTheDocument()
    })

    it('un pedido pagado no se puede editar', async () => {
      await abrir([{ ...PENDIENTE, pago: { estado: 'aprobado' } }], [], [])
      fireEvent.click(within(tarjeta('1')).getByRole('button', { name: 'Editar pedido' }))

      expect(screen.getByText('Este pedido ya fue pagado y no puede editarse.')).toBeInTheDocument()
    })

    it('se cierra con "Cancelar" y tocando afuera', async () => {
      const modal = await abrirEdicion()

      fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText(/^Editar pedido #/)).not.toBeInTheDocument()

      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Editar pedido' }))
      fireEvent.click(screen.getByText(/^Editar pedido #/).closest('div[style*="position: fixed"]') as HTMLElement)
      expect(screen.queryByText(/^Editar pedido #/)).not.toBeInTheDocument()
    })
  })
})
