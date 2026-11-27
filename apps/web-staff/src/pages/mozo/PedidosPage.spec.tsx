import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { io } from 'socket.io-client'
import { api, type PedidoRico } from '../../services/api'
import * as impresora from '../../services/impresora'
import { membresiaDeRestaurante, perfilDeOwner, perfilDePrueba, reiniciarSesionDePrueba } from '../../test/authClient'
import { montarContexto, reiniciarContexto } from '../../test/contexto'
import { useContextoStore } from '../../store/contextoStore'
import { PedidosPage } from './PedidosPage'

const perfilCon = (rol: 'MOZO' | 'JEFE_SALON' | 'GERENTE') =>
  perfilDePrueba({ nombre: 'Ana Pérez', membresias: [membresiaDeRestaurante(rol, 'rest-1')] })

let conectada = false

vi.mock('@menyu/auth-client', async () => (await import('../../test/authClient')).moduloSimulado())
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))
vi.mock('../../services/api', () => ({
  api: { pedidos: { getByRestaurante: vi.fn(), cambiarEstado: vi.fn(), editarItem: vi.fn() }, comandas: { listar: vi.fn() } },
}))
vi.mock('../../services/impresora', () => ({
  impresoraConectada: vi.fn(() => conectada),
  imprimirPedido: vi.fn(() => Promise.resolve()),
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
const comandasApi = vi.mocked(api.comandas)
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
      { id: `${id}-1`, itemId: 'it-1', cantidad: 2, cantidadEditada: null, precioUnitario: 1000, notas: 'bien cocida', comandaId: null, listoEn: null, item: { nombre: 'Milanesa' }, mods: [mod('QUITAR', 'Cebolla'), mod('AGREGAR', 'Queso', 2), mod('AGREGAR', 'Huevo'), mod('QUITAR')] },
      { id: `${id}-2`, itemId: 'it-2', cantidad: 1, cantidadEditada: null, precioUnitario: 500, notas: null, comandaId: null, listoEn: null, item: { nombre: 'Agua' }, mods: [] },
    ],
    ...extra,
  }
}

const PENDIENTE = pedido('pendiente-1', 'pendiente')
const EN_PREP = pedido('enprep-2', 'en_preparacion', {
  createdAt: hace(25),
  items: [
    { id: 'ep-1', itemId: 'it-3', cantidad: 3, cantidadEditada: 1, precioUnitario: 500, notas: null, comandaId: null, listoEn: null, item: { nombre: 'Empanada' }, mods: [] },
    { id: 'ep-2', itemId: 'it-4', cantidad: 1, cantidadEditada: 0, precioUnitario: 800, notas: 'fría', comandaId: null, listoEn: null, item: { nombre: 'Gaseosa' }, mods: [mod('AGREGAR', 'Limón')] },
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
  reiniciarSesionDePrueba()
  reiniciarContexto()
  montarContexto(perfilCon('MOZO'))
  conectada = false
  vi.clearAllMocks()
  comandasApi.listar.mockReset()
  comandasApi.listar.mockResolvedValue([])
  socket.handlers.clear()
})

describe('PedidosPage (mozo)', () => {
  it.each([
    ['MOZO', true],
    ['JEFE_SALON', true],
    ['GERENTE', true],
  ] as const)('%s ve "Editar pedido": %s', async (rol, loVe) => {
    reiniciarContexto()
    montarContexto(perfilCon(rol))

    await abrirCon()

    const boton = within(tarjeta('1')).queryByRole('button', { name: 'Editar pedido' })
    expect(boton === null).toBe(!loVe)
  })

  it('el OWNER no ve "Editar pedido": el backend no lo deja editar', async () => {
    reiniciarContexto()
    montarContexto(perfilDeOwner('rest-1'))

    await abrirCon()

    expect(within(tarjeta('1')).queryByRole('button', { name: 'Editar pedido' })).not.toBeInTheDocument()
  })

  it('sin restaurante no consulta ni se conecta; el encabezado vuelve al panel', () => {
    reiniciarContexto()

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

  describe('tiempo real', () => {
    it('se conecta con el token, entra a la sala y se desconecta al salir', async () => {
      pedidosApi.getByRestaurante.mockResolvedValue([] as never)
      const { unmount } = abrir()

      expect(io).toHaveBeenCalledWith(expect.stringMatching(/\/ws$/), { transports: ['websocket'], auth: expect.any(Function) })
      recibir('connect')
      expect(socket.emit).toHaveBeenCalledWith('cocina:join', { restauranteId: 'rest-1' })

      unmount()
      expect(socket.disconnect).toHaveBeenCalled()
    })

    it('un pedido nuevo aparece una vez; uno actualizado cambia de columna o se va', async () => {
      await abrirCon([PENDIENTE], [], [])
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

  describe('sin impresora (se imprime en Cocina)', () => {
    it.each(['pendiente', 'en_preparacion'] as const)('un order:new %s no imprime y el pedido se agrega a la lista', async (estado) => {
      await abrirCon([PENDIENTE], [], [])
      const nuevo = pedido('nuevo-7', estado)

      recibir('order:new', nuevo)

      expect(screen.getAllByText('Mesa 7')).toHaveLength(1)
      expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()
    })

    it.each([false, true])('no hay botón "Conectar impresora" ni "Test" ni indicador "Impresora" (impresoraConectada: %s)', async (estaConectada) => {
      conectada = estaConectada
      await abrirCon()

      expect(screen.queryByRole('button', { name: 'Conectar impresora' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Test' })).not.toBeInTheDocument()
      expect(screen.queryByText('Impresora')).not.toBeInTheDocument()
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

describe('PedidosPage (mozo): avisos "Barra: listo" por comanda (#344)', () => {
  const AHORA = '2026-11-26T15:00:00.000Z'
  const comanda = (id: string, nombre: string, activa = true) => ({ id, restauranteId: 'rest-1', nombre, activa })
  const COCINA = comanda('c-coc', 'Cocina')
  const BARRA = comanda('c-bar', 'Barra')
  const POSTRES = comanda('c-pos', 'Postres')
  const VIEJA = comanda('c-vie', 'Antigua', false)

  const linea = (id: string, nombre: string, comandaId: string | null, extra: Partial<PedidoRico['items'][number]> = {}) =>
    ({ id, itemId: id, cantidad: 1, cantidadEditada: null, precioUnitario: 100, notas: null, comandaId, listoEn: null, item: { nombre }, mods: [], ...extra }) as PedidoRico['items'][number]
  const marcada = (id: string, nombre: string, comandaId: string | null) => linea(id, nombre, comandaId, { listoEn: AHORA })
  const enPrep = (id: string, items: PedidoRico['items']) => pedido(id, 'en_preparacion', { items })
  // Mesa 4: la barra ya terminó (cerveza y gin marcadas); la cocina, no.
  const BARRA_LISTA = () => enPrep('mesa-4', [linea('a1', 'Milanesa', 'c-coc'), marcada('a2', 'Cerveza', 'c-bar'), marcada('a3', 'Gin', 'c-bar')])

  async function abrirConComandas(comandas: ReturnType<typeof comanda>[], pedidosEnPrep: PedidoRico[], otros: { pendientes?: PedidoRico[]; listos?: PedidoRico[] } = {}) {
    comandasApi.listar.mockResolvedValue(comandas)
    await abrirCon(otros.pendientes ?? [], pedidosEnPrep, otros.listos ?? [])
    await act(async () => {})
  }

  const chips = (mesa: string) => within(tarjeta(mesa)).queryAllByRole('listitem').map((li) => li.textContent)

  describe('qué avisa', () => {
    it('una comanda con todas sus líneas marcadas muestra su chip, aunque la cocina siga pendiente', async () => {
      await abrirConComandas([COCINA, BARRA], [BARRA_LISTA()])

      expect(within(tarjeta('4')).getByText('Barra: listo')).toBeInTheDocument()
      expect(chips('4')).toEqual(['Barra: listo'])
    })

    it('con una línea de esa comanda todavía pendiente no hay chip', async () => {
      await abrirConComandas([COCINA, BARRA], [enPrep('mesa-4', [marcada('a1', 'Cerveza', 'c-bar'), linea('a2', 'Gin', 'c-bar')])])

      expect(chips('4')).toEqual([])
    })

    it('sin nada marcado no hay chips', async () => {
      await abrirConComandas([COCINA, BARRA], [enPrep('mesa-4', [linea('a1', 'Milanesa', 'c-coc'), linea('a2', 'Cerveza', 'c-bar')])])

      expect(screen.queryByRole('list', { name: 'Comandas listas' })).not.toBeInTheDocument()
    })

    it('la comanda de cocina no genera chip, aunque todo lo suyo esté marcado', async () => {
      await abrirConComandas([COCINA, BARRA], [enPrep('mesa-4', [marcada('a1', 'Milanesa', 'c-coc'), linea('a2', 'Cerveza', 'c-bar')])])

      expect(chips('4')).toEqual([])
      expect(screen.queryByText('Cocina: listo')).not.toBeInTheDocument()
    })

    it('la de cocina se reconoce por el nombre sin mayúsculas ni espacios, también con otro id', async () => {
      const cocinaConOtroNombre = comanda('c-k', '  COCINA ')
      await abrirConComandas([cocinaConOtroNombre, BARRA], [enPrep('mesa-4', [marcada('a1', 'Milanesa', 'c-k'), marcada('a2', 'Cerveza', 'c-bar')])])

      expect(chips('4')).toEqual(['Barra: listo'])
    })

    it('con dos comandas listas muestra los dos chips, ordenados por nombre', async () => {
      await abrirConComandas([COCINA, POSTRES, BARRA], [enPrep('mesa-4', [marcada('a1', 'Flan', 'c-pos'), marcada('a2', 'Cerveza', 'c-bar'), linea('a3', 'Milanesa', 'c-coc')])])

      expect(chips('4')).toEqual(['Barra: listo', 'Postres: listo'])
    })

    it('una comanda inactiva no genera chip', async () => {
      await abrirConComandas([COCINA, BARRA, VIEJA], [enPrep('mesa-4', [marcada('a1', 'Viejo', 'c-vie'), linea('a2', 'Milanesa', 'c-coc')])])

      expect(chips('4')).toEqual([])
    })

    it('las líneas eliminadas no cuentan: no bloquean la comanda ni alcanzan para avisarla', async () => {
      await abrirConComandas([COCINA, BARRA], [
        enPrep('mesa-4', [marcada('a1', 'Cerveza', 'c-bar'), linea('a2', 'Gin', 'c-bar', { cantidadEditada: 0 })]),
        enPrep('mesa-5', [marcada('b1', 'Cerveza', 'c-bar'), linea('b2', 'Milanesa', 'c-coc')].map((i) => (i.id === 'b1' ? { ...i, cantidadEditada: 0 } : i))),
      ])

      expect(chips('4')).toEqual(['Barra: listo'])
      expect(chips('5')).toEqual([])
    })

    it('solo en las tarjetas "En preparación": ni pendientes ni listos muestran chips', async () => {
      const marcadas = (id: string, estado: string) => pedido(id, estado, { items: [marcada(`${id}-1`, 'Cerveza', 'c-bar')] })
      await abrirConComandas([COCINA, BARRA], [BARRA_LISTA()], { pendientes: [marcadas('pen-5', 'pendiente')], listos: [marcadas('lis-6', 'listo')] })

      expect(chips('4')).toEqual(['Barra: listo'])
      expect(chips('5')).toEqual([])
      expect(chips('6')).toEqual([])
    })
  })

  describe('la lista de comandas', () => {
    it('sin comandas no hay chips', async () => {
      await abrirConComandas([], [BARRA_LISTA()])

      expect(within(tarjeta('4')).getByText(/Cerveza/)).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Comandas listas' })).not.toBeInTheDocument()
    })

    it('si GET /comandas falla no hay chips y el tablero se ve igual', async () => {
      comandasApi.listar.mockRejectedValue(new Error('caído'))
      await abrirCon([], [BARRA_LISTA()], [])
      await act(async () => {})

      expect(screen.getByText('Mesa 4')).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Comandas listas' })).not.toBeInTheDocument()
      expect(screen.queryByText(/No se pudieron cargar/)).not.toBeInTheDocument()
    })

    it('pide las comandas del restaurante del contexto', async () => {
      await abrirConComandas([BARRA], [BARRA_LISTA()])

      expect(comandasApi.listar).toHaveBeenCalledWith('rest-1')
    })

    it('"Actualizar" vuelve a pedir las comandas', async () => {
      await abrirConComandas([], [BARRA_LISTA()])
      expect(chips('4')).toEqual([])
      comandasApi.listar.mockResolvedValue([COCINA, BARRA])

      await act(async () => { fireEvent.click(document.querySelector('header .lucide-refresh-cw')!.closest('button')!) })

      expect(comandasApi.listar).toHaveBeenCalledTimes(2)
      expect(chips('4')).toEqual(['Barra: listo'])
    })

    it('si "Actualizar" no puede traerlas, conserva la última lista buena', async () => {
      await abrirConComandas([COCINA, BARRA], [BARRA_LISTA()])
      comandasApi.listar.mockRejectedValue(new Error('caído'))

      await act(async () => { fireEvent.click(document.querySelector('header .lucide-refresh-cw')!.closest('button')!) })

      expect(chips('4')).toEqual(['Barra: listo'])
    })

    it('la respuesta de un restaurante anterior no pisa la lista del actual', async () => {
      reiniciarContexto()
      montarContexto(perfilDePrueba({
        nombre: 'Ana Pérez',
        membresias: [membresiaDeRestaurante('MOZO', 'rest-1'), membresiaDeRestaurante('MOZO', 'rest-2')],
      }), 'rest-1')
      let resolverVieja!: (v: ReturnType<typeof comanda>[]) => void
      const vieja = new Promise<ReturnType<typeof comanda>[]>((ok) => { resolverVieja = ok })
      comandasApi.listar.mockImplementation(((r: string) => (r === 'rest-1' ? vieja : Promise.resolve([COCINA, BARRA]))) as never)
      const ambas = enPrep('mesa-4', [linea('a1', 'Milanesa', 'c-coc'), marcada('a2', 'Cerveza', 'c-bar'), marcada('a3', 'Flan', 'c-pos')])
      await abrirCon([], [ambas], [])

      act(() => { useContextoStore.setState({ restauranteId: 'rest-2' }) })
      await vi.waitFor(() => expect(chips('4')).toEqual(['Barra: listo']))
      await act(async () => resolverVieja([COCINA, POSTRES]))

      expect(chips('4')).toEqual(['Barra: listo'])
    })
  })

  describe('en tiempo real', () => {
    it('un order:updated con la barra marcada hace aparecer el chip y otro con algo pendiente lo hace desaparecer', async () => {
      const antes = enPrep('mesa-4', [linea('a1', 'Milanesa', 'c-coc'), linea('a2', 'Cerveza', 'c-bar')])
      await abrirConComandas([COCINA, BARRA], [antes])
      expect(chips('4')).toEqual([])

      recibir('order:updated', { ...antes, items: [antes.items[0], { ...antes.items[1], listoEn: AHORA }] })
      expect(chips('4')).toEqual(['Barra: listo'])

      recibir('order:updated', { ...antes, items: [...antes.items.slice(0, 1), { ...antes.items[1], listoEn: AHORA }, linea('a3', 'Gin', 'c-bar')] })
      expect(chips('4')).toEqual([])
    })

    it('al cerrarse el pedido (listo) el chip se va con la tarjeta de "En preparación"', async () => {
      const lista = BARRA_LISTA()
      await abrirConComandas([COCINA, BARRA], [lista])
      expect(chips('4')).toEqual(['Barra: listo'])

      recibir('order:updated', { ...lista, estado: 'listo' })

      expect(chips('4')).toEqual([])
    })

    it('no suena ni usa aria-live: el chip es información de la tarjeta, no un aviso', async () => {
      const audio = vi.fn()
      vi.stubGlobal('AudioContext', audio)
      const antes = enPrep('mesa-4', [linea('a1', 'Milanesa', 'c-coc'), linea('a2', 'Cerveza', 'c-bar')])
      await abrirConComandas([COCINA, BARRA], [antes])

      recibir('order:updated', { ...antes, items: [antes.items[0], { ...antes.items[1], listoEn: AHORA }] })

      expect(chips('4')).toEqual(['Barra: listo'])
      expect(audio).not.toHaveBeenCalled()
      expect(tarjeta('4').querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull()
      vi.unstubAllGlobals()
    })
  })
})
