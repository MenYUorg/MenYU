import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api, type PedidoRico } from '../../services/api'
import * as impresora from '../../services/impresora'
import { PedidosPage } from './PedidosPage'

let restauranteActual: string | null = 'rest-1'
let conectada = false

vi.mock('@menyu/auth', () => ({ useAuth: () => ({ user: { nombre: 'Ana Pérez' } }) }))
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))
vi.mock('../../store/mozoStore', () => ({ useMozoStore: () => ({ restauranteId: restauranteActual }) }))
vi.mock('../../services/api', () => ({
  getToken: () => 'jwt-de-test',
  api: { pedidos: { getByRestaurante: vi.fn(), cambiarEstado: vi.fn(), editarItem: vi.fn() } },
}))
vi.mock('../../services/impresora', () => ({
  conectarImpresora: vi.fn(),
  impresoraConectada: vi.fn(() => conectada),
  imprimirPedido: vi.fn(() => Promise.resolve()),
  testPrint: vi.fn(() => Promise.resolve()),
}))

/** Socket falso: guarda los handlers para poder "recibir" eventos del servidor. */
const socket = {
  handlers: new Map<string, (dato?: unknown) => void>(),
  on: vi.fn((evento: string, fn: (dato?: unknown) => void) => { socket.handlers.set(evento, fn) }),
  emit: vi.fn(),
  disconnect: vi.fn(),
}
vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }))

const pedidosApi = vi.mocked(api.pedidos)
const impresoraMock = vi.mocked(impresora)

const hace = (minutos: number) => new Date(Date.now() - minutos * 60000).toISOString()
const mod = (accion: string, nombre?: string, cantidad?: number) =>
  ({ pedidoItemId: 'x', itemIngredienteId: 'ii', accion, cantidad, itemIngrediente: nombre ? { ingrediente: { nombre } } : undefined }) as unknown as PedidoRico['items'][number]['mods'][number]

function pedido(id: string, estado: string, extra: Partial<PedidoRico> = {}): PedidoRico {
  return {
    id,
    sesionId: 'ses-1',
    mesaId: 'mesa-1',
    estado,
    createdAt: hace(5),
    updatedAt: hace(5),
    mesa: { numero: id.slice(-1) },
    pagado: false,
    items: [
      { id: `${id}-1`, itemId: 'it-1', cantidad: 2, cantidadEditada: null, precioUnitario: 1000, notas: 'bien cocida', item: { nombre: 'Milanesa' }, mods: [mod('QUITAR', 'Cebolla'), mod('AGREGAR', 'Queso', 2), mod('AGREGAR', 'Huevo'), mod('QUITAR')] },
      { id: `${id}-2`, itemId: 'it-2', cantidad: 1, cantidadEditada: null, precioUnitario: 500, notas: null, item: { nombre: 'Agua' }, mods: [] },
    ],
    ...extra,
  }
}

const PENDIENTE = pedido('pendiente-1', 'pendiente')
const EN_PREP = pedido('enprep-2', 'en_preparacion', {
  createdAt: hace(25),
  items: [
    { id: 'ep-1', itemId: 'it-3', cantidad: 3, cantidadEditada: 1, precioUnitario: 500, notas: null, item: { nombre: 'Empanada' }, mods: [] },
    { id: 'ep-2', itemId: 'it-4', cantidad: 1, cantidadEditada: 0, precioUnitario: 800, notas: 'fría', item: { nombre: 'Gaseosa' }, mods: [mod('AGREGAR', 'Limón')] },
  ],
})
const LISTO = pedido('listo-3', 'listo')

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/mozo/pedidos']}>
      <Routes>
        <Route path="/mozo/pedidos" element={<PedidosPage />} />
        <Route path="/mozo" element={<p>panel del mozo</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrirCon(pendientes = [PENDIENTE], enPrep = [EN_PREP], listos = [LISTO]) {
  pedidosApi.getByRestaurante.mockImplementation((_r: string, filtros?: { estado?: string }) =>
    Promise.resolve(filtros?.estado === 'pendiente' ? pendientes : filtros?.estado === 'en_preparacion' ? enPrep : listos) as never,
  )
  abrir()
  await screen.findAllByText(/^Mesa /)
}

const tarjeta = (mesa: string) => screen.getByText(`Mesa ${mesa}`).closest('div[style*="box-sizing: border-box"]') as HTMLElement
const recibir = (evento: string, dato?: unknown) => act(() => { socket.handlers.get(evento)!(dato) })
const modalEdicion = () => screen.getByText(/^Editar pedido #/).closest('div[style*="position: fixed"]') as HTMLElement

beforeEach(() => {
  restauranteActual = 'rest-1'
  conectada = false
  vi.clearAllMocks()
  socket.handlers.clear()
})

describe('PedidosPage (mozo)', () => {
  it('sin restaurante no consulta ni se conecta; el encabezado vuelve al panel', () => {
    restauranteActual = null

    abrir()

    expect(pedidosApi.getByRestaurante).not.toHaveBeenCalled()
    expect(io).not.toHaveBeenCalled()
    fireEvent.click(document.querySelector('.lucide-chevron-left')!.closest('button')!)
    expect(screen.getByText('panel del mozo')).toBeInTheDocument()
  })

  describe('tablero', () => {
    it('pide las tres columnas y muestra ítems, modificaciones, notas y la urgencia', async () => {
      await abrirCon()

      expect(pedidosApi.getByRestaurante.mock.calls.map(([, f]) => f?.estado)).toEqual(['pendiente', 'en_preparacion', 'listo'])
      const card = tarjeta('1')
      expect(within(card).getByText('Pendiente')).toBeInTheDocument()
      expect(within(card).getByText('2× Milanesa')).toBeInTheDocument()
      expect(within(card).getByText('sin Cebolla')).toBeInTheDocument()
      expect(within(card).getByText('+2 Queso')).toBeInTheDocument()
      expect(within(card).getByText('+1 Huevo')).toBeInTheDocument()
      expect(within(card).getByText('📝 bien cocida')).toBeInTheDocument()
      expect(within(card).getByText(/· 5min/)).toBeInTheDocument()
      const alerta = '.lucide-triangle-alert, .lucide-alert-triangle'
      expect(card.querySelector(alerta)).toBeNull()
      expect(tarjeta('2').querySelector(alerta)).not.toBeNull()
    })

    it('un pedido editado muestra lo que quedó, lo quitado y "Editado"', async () => {
      await abrirCon()

      const card = tarjeta('2')
      expect(within(card).getByText('En preparación · Editado')).toBeInTheDocument()
      expect(within(card).getByText('1× Empanada')).toBeInTheDocument()
      expect(within(card).getByText('2× Empanada')).toBeInTheDocument()
      expect(within(card).getByText('1× Gaseosa')).toBeInTheDocument()
      expect(within(card).queryByText('📝 fría')).not.toBeInTheDocument()
    })

    it('las columnas vacías dicen "Sin pedidos"', async () => {
      await abrirCon([PENDIENTE], [], [])

      expect(screen.getAllByText('Sin pedidos')).toHaveLength(2)
    })

    it('si la carga falla lo dice; actualizar vuelve a pedir', async () => {
      pedidosApi.getByRestaurante.mockRejectedValueOnce(new Error('caído'))
      abrir()
      expect(await screen.findByText('No se pudieron cargar los pedidos.')).toBeInTheDocument()

      pedidosApi.getByRestaurante.mockResolvedValue([PENDIENTE] as never)
      fireEvent.click(document.querySelector('header .lucide-refresh-cw')!.closest('button')!)
      expect(await screen.findAllByText('Mesa 1')).not.toHaveLength(0)
      expect(screen.queryByText('No se pudieron cargar los pedidos.')).not.toBeInTheDocument()
    })
  })

  describe('impresora', () => {
    it('"Conectar impresora" la conecta y muestra el estado con el botón de prueba', async () => {
      impresoraMock.conectarImpresora.mockResolvedValue()
      await abrirCon()

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Conectar impresora' })) })
      expect(screen.getByText('Impresora')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Test' }))
      expect(impresoraMock.testPrint).toHaveBeenCalled()
    })

    it('si no se puede conectar lo registra y sigue ofreciendo conectar', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      impresoraMock.conectarImpresora.mockRejectedValue(new Error('sin bluetooth'))
      await abrirCon()

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Conectar impresora' })) })

      expect(error).toHaveBeenCalledWith('No se pudo conectar la impresora.')
      expect(screen.getByRole('button', { name: 'Conectar impresora' })).toBeInTheDocument()
      error.mockRestore()
    })

    it('si ya estaba conectada arranca mostrando el estado', async () => {
      conectada = true
      await abrirCon()

      expect(screen.getByRole('button', { name: 'Test' })).toBeInTheDocument()
    })
  })

  describe('tiempo real', () => {
    it('se conecta con el token, entra a la sala y se desconecta al salir', async () => {
      pedidosApi.getByRestaurante.mockResolvedValue([] as never)
      const { unmount } = abrir()

      expect(io).toHaveBeenCalledWith(expect.stringMatching(/\/ws$/), { auth: { token: 'jwt-de-test' }, transports: ['websocket'] })
      recibir('connect')
      expect(socket.emit).toHaveBeenCalledWith('cocina:join', { restauranteId: 'rest-1' })

      unmount()
      expect(socket.disconnect).toHaveBeenCalled()
    })

    it('un pedido nuevo se imprime y aparece una vez; uno actualizado cambia de columna o se va', async () => {
      await abrirCon([PENDIENTE], [], [])
      const nuevo = pedido('nuevo-4', 'pendiente')

      recibir('order:new', nuevo)
      recibir('order:new', nuevo)
      expect(screen.getAllByText('Mesa 4')).toHaveLength(1)
      expect(impresoraMock.imprimirPedido).toHaveBeenCalledWith(nuevo)

      recibir('order:updated', { ...nuevo, estado: 'listo' })
      expect(within(tarjeta('4')).getByText('Listo')).toBeInTheDocument()
      recibir('order:updated', pedido('otro-5', 'en_preparacion'))
      expect(screen.getByText('Mesa 5')).toBeInTheDocument()
      recibir('order:updated', { ...nuevo, estado: 'entregado' })
      expect(screen.queryByText('Mesa 4')).not.toBeInTheDocument()
    })
  })

  describe('avanzar y entregar', () => {
    it('avanza con la respuesta del servidor; si el servidor lo terminó lo saca; si falla vuelve', async () => {
      pedidosApi.cambiarEstado
        .mockResolvedValueOnce({ ...PENDIENTE, estado: 'en_preparacion' } as never)
        .mockResolvedValueOnce({ ...EN_PREP, estado: 'entregado' } as never)
        .mockRejectedValueOnce(new Error('caído'))
      await abrirCon([PENDIENTE], [EN_PREP], [])

      fireEvent.click(within(tarjeta('1')).getByRole('button', { name: 'En preparación' }))
      await vi.waitFor(() => expect(within(tarjeta('1')).getByText('En preparación')).toBeInTheDocument())
      expect(pedidosApi.cambiarEstado).toHaveBeenCalledWith('pendiente-1', 'en_preparacion')

      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Listo' }))
      await vi.waitFor(() => expect(screen.queryByText('Mesa 2')).not.toBeInTheDocument())

      fireEvent.click(within(tarjeta('1')).getByRole('button', { name: 'Listo' }))
      await vi.waitFor(() => expect(within(tarjeta('1')).getByRole('button', { name: 'Listo' })).toBeEnabled())
      expect(within(tarjeta('1')).getByText('En preparación')).toBeInTheDocument()
    })

    it('"Entregar" lo saca del tablero; si falla vuelve; un listo no se edita', async () => {
      pedidosApi.cambiarEstado.mockResolvedValueOnce({} as never).mockRejectedValueOnce(new Error('caído'))
      await abrirCon()
      expect(within(tarjeta('3')).queryByRole('button', { name: 'Editar pedido' })).not.toBeInTheDocument()

      fireEvent.click(within(tarjeta('3')).getByRole('button', { name: /Entregar/ }))
      expect(screen.queryByText('Mesa 3')).not.toBeInTheDocument()
      expect(pedidosApi.cambiarEstado).toHaveBeenCalledWith('listo-3', 'entregado')
      await act(async () => {}) // termina el primer cambio de estado

      recibir('order:new', LISTO)
      fireEvent.click(within(tarjeta('3')).getByRole('button', { name: /Entregar/ }))
      expect(screen.queryByText('Mesa 3')).not.toBeInTheDocument()
      expect(await screen.findByText('Mesa 3')).toBeInTheDocument()
    })
  })

  describe('editar', () => {
    it('arranca con las cantidades actuales y respeta 0 y la cantidad actual', async () => {
      await abrirCon()
      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Editar pedido' }))
      const modal = modalEdicion()

      expect(within(modal).getByText('Editar pedido #ENPREP-2')).toBeInTheDocument()
      const [menos1, menos2] = within(modal).getAllByRole('button', { name: '−' })
      expect(within(modal).getAllByRole('button', { name: '+' })[0]).toBeDisabled()
      expect(menos2).toBeDisabled()
      fireEvent.click(menos1)
      expect(within(modal).getByText('Esto anulará el pedido completo.')).toBeInTheDocument()
      fireEvent.click(within(modal).getAllByRole('button', { name: '+' })[0])
      expect(within(modal).queryByText('Esto anulará el pedido completo.')).not.toBeInTheDocument()
    })

    it('guarda y reemplaza el pedido; si quedó anulado lo saca', async () => {
      pedidosApi.editarItem
        .mockResolvedValueOnce({ ...PENDIENTE, items: [{ ...PENDIENTE.items[0], cantidadEditada: 1 }, PENDIENTE.items[1]] } as never)
        .mockResolvedValueOnce({ ...EN_PREP, estado: 'anulado' } as never)
      await abrirCon()

      fireEvent.click(within(tarjeta('1')).getByRole('button', { name: 'Editar pedido' }))
      fireEvent.click(within(modalEdicion()).getAllByRole('button', { name: '−' })[0])
      fireEvent.change(within(modalEdicion()).getByPlaceholderText('Describí el motivo de la edición…'), { target: { value: ' Pidió uno ' } })
      fireEvent.click(within(modalEdicion()).getByRole('button', { name: 'Guardar edición' }))
      expect(await within(tarjeta('1')).findByText('Pendiente · Editado')).toBeInTheDocument()
      expect(pedidosApi.editarItem).toHaveBeenCalledWith('pendiente-1', { justificacion: 'Pidió uno', ediciones: [{ pedidoItemId: 'pendiente-1-1', cantidadNueva: 1 }] })

      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Editar pedido' }))
      fireEvent.click(within(modalEdicion()).getAllByRole('button', { name: '−' })[0])
      fireEvent.change(within(modalEdicion()).getByPlaceholderText('Describí el motivo de la edición…'), { target: { value: 'Anular' } })
      fireEvent.click(within(modalEdicion()).getByRole('button', { name: 'Guardar edición' }))
      await vi.waitFor(() => expect(screen.queryByText('Mesa 2')).not.toBeInTheDocument())
    })

    it('más de 50 palabras no deja guardar; los errores del servidor se muestran', async () => {
      pedidosApi.editarItem.mockRejectedValueOnce(new Error('Ya tiene un cobro')).mockRejectedValueOnce('raro')
      await abrirCon()
      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Editar pedido' }))
      const modal = modalEdicion()
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

    it('un pedido pagado no se puede editar; se cierra con "Cancelar", la X o tocando afuera', async () => {
      await abrirCon([{ ...PENDIENTE, pagado: true }], [EN_PREP], [])

      fireEvent.click(within(tarjeta('1')).getByRole('button', { name: 'Editar pedido' }))
      expect(screen.getByText('Este pedido ya fue pagado y no puede editarse.')).toBeInTheDocument()
      fireEvent.click(modalEdicion().querySelector('.lucide-x')!.closest('button')!)
      expect(screen.queryByText(/^Editar pedido #/)).not.toBeInTheDocument()

      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Editar pedido' }))
      fireEvent.click(within(modalEdicion()).getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText(/^Editar pedido #/)).not.toBeInTheDocument()

      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Editar pedido' }))
      fireEvent.click(modalEdicion())
      expect(screen.queryByText(/^Editar pedido #/)).not.toBeInTheDocument()
    })
  })
})
