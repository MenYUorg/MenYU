import { StrictMode } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Pedido } from '@menyu/types'
import { api, type PedidoRico } from '../../services/api'
import * as impresora from '../../services/impresora'
import * as socketService from '../../services/socket'
import { membresiaDeRestaurante, perfilDeCocina, perfilDePrueba, reiniciarSesionDePrueba } from '../../test/authClient'
import { useContextoStore } from '../../store/contextoStore'
import { montarContexto, reiniciarContexto } from '../../test/contexto'
import { CocinaPage } from './CocinaPage'

let conectada = false

vi.mock('@menyu/auth-client', async () => (await import('../../test/authClient')).moduloSimulado())
vi.mock('../../services/api', () => ({
  api: { pedidos: { getByRestaurante: vi.fn(), cambiarEstado: vi.fn() }, comandas: { listar: vi.fn() } },
}))
vi.mock('../../services/impresora', () => ({
  conectarImpresora: vi.fn(),
  impresoraConectada: vi.fn(() => conectada),
  imprimirPedido: vi.fn(() => Promise.resolve()),
  testPrint: vi.fn(() => Promise.resolve()),
}))

const oyentes: { nuevo?: (p: Pedido) => void; actualizado?: (p: Pedido) => void; editado?: (p: Pedido) => void } = {}
const desuscribir = { nuevo: vi.fn(), actualizado: vi.fn(), editado: vi.fn() }
vi.mock('../../services/socket', () => ({
  joinRestauranteComoCocina: vi.fn(),
  cerrarSesion: vi.fn(),
  onPedidoNuevo: vi.fn((fn) => { oyentes.nuevo = fn; return desuscribir.nuevo }),
  onPedidoActualizado: vi.fn((fn) => { oyentes.actualizado = fn; return desuscribir.actualizado }),
  onPedidoEditado: vi.fn((fn) => { oyentes.editado = fn; return desuscribir.editado }),
}))

function Destino() {
  return <p>destino {useLocation().pathname}</p>
}

/** La pantalla necesita un Router: su encabezado puede llevar al selector. */
const conRouter = () => (
  <MemoryRouter initialEntries={['/cocina']}>
    <Routes>
      <Route path="/cocina" element={<CocinaPage />} />
      <Route path="*" element={<Destino />} />
    </Routes>
  </MemoryRouter>
)

const pedidosApi = vi.mocked(api.pedidos)
const comandasApi = vi.mocked(api.comandas)
const impresoraMock = vi.mocked(impresora)

/** AudioContext falso: registra cada tono que suena. */
const tonos: number[] = []
class AudioFalso {
  currentTime = 0
  destination = {}
  createOscillator() {
    const osc = { type: '', frequency: { value: 0 }, connect: vi.fn(), start: vi.fn(() => tonos.push(osc.frequency.value)), stop: vi.fn() }
    return osc
  }
  createGain() {
    return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }
  }
  close() { return Promise.resolve() }
}

const hace = (minutos: number) => new Date(Date.now() - minutos * 60000).toISOString()
const mod = (accion: string, nombre?: string, cantidad?: number) =>
  ({ pedidoItemId: 'x', itemIngredienteId: 'ii', accion, cantidad, itemIngrediente: nombre ? { ingrediente: { nombre } } : undefined }) as unknown as PedidoRico['items'][number]['mods'][number]

function pedido(id: string, estado: string, extra: Partial<PedidoRico> = {}): PedidoRico {
  return {
    id,
    sesionId: 's',
    mesaId: 'm',
    estado,
    createdAt: hace(5),
    updatedAt: hace(5),
    mesa: { numero: id.slice(-1) },
    pagado: false,
    items: [
      { id: `${id}-1`, itemId: 'a', cantidad: 2, cantidadEditada: null, precioUnitario: 1000, notas: 'bien cocida', comandaId: null, listoEn: null, item: { nombre: 'Milanesa' }, mods: [mod('QUITAR', 'Cebolla'), mod('AGREGAR', 'Queso', 2), mod('AGREGAR', 'Huevo'), mod('QUITAR')] },
      { id: `${id}-2`, itemId: 'b', cantidad: 1, cantidadEditada: null, precioUnitario: 500, notas: '  ', comandaId: null, listoEn: null, item: { nombre: 'Agua' }, mods: [] },
    ],
    ...extra,
  }
}

const EN_PREP = pedido('prep-1', 'en_preparacion')
const EDITADO = pedido('edit-2', 'en_preparacion', {
  createdAt: hace(25),
  items: [
    { id: 'e1', itemId: 'a', cantidad: 3, cantidadEditada: 1, precioUnitario: 500, notas: null, comandaId: null, listoEn: null, item: { nombre: 'Empanada' }, mods: [] },
    { id: 'e2', itemId: 'b', cantidad: 1, cantidadEditada: 0, precioUnitario: 800, notas: 'fría', comandaId: null, listoEn: null, item: { nombre: 'Gaseosa' }, mods: [mod('AGREGAR', 'Limón')] },
  ],
})
const LISTO = pedido('listo-3', 'listo')

async function abrir(enPrep = [EN_PREP, EDITADO], listos = [LISTO]) {
  pedidosApi.getByRestaurante.mockImplementation((_r: string, f?: { estado?: string }) =>
    Promise.resolve(f?.estado === 'en_preparacion' ? enPrep : listos) as never,
  )
  const vista = render(conRouter())
  await vi.waitFor(() => expect(screen.getByRole('button', { name: /Actualizar/ })).toBeEnabled())
  return vista
}

const tarjeta = (mesa: string) => screen.getByText(`Mesa ${mesa}`).closest('div[style*="box-sizing: border-box"]') as HTMLElement
const como = (p: PedidoRico) => p as unknown as Pedido
const recibir = (canal: keyof typeof oyentes, p: PedidoRico) => act(() => { oyentes[canal]!(como(p)) })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  comandasApi.listar.mockReset()
  comandasApi.listar.mockResolvedValue([])
  reiniciarSesionDePrueba()
  reiniciarContexto()
  montarContexto(perfilDeCocina('rest-1'))
  conectada = false
  tonos.length = 0
  vi.stubGlobal('AudioContext', AudioFalso)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('CocinaPage', () => {
  it('con varios restaurantes, "Cambiar de restaurante" vuelve al selector', async () => {
    reiniciarContexto()
    montarContexto(perfilDePrueba({
      nombre: 'Cocina de Prueba',
      membresias: [
        membresiaDeRestaurante('COCINA', 'rest-1'),
        membresiaDeRestaurante('COCINA', 'rest-2'),
      ],
    }), 'rest-1')
    await abrir()

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar de restaurante' }))

    expect(screen.getByText('destino /selector')).toBeInTheDocument()
  })

  it('con un solo restaurante no ofrece cambiarlo', async () => {
    await abrir()

    expect(screen.queryByRole('button', { name: 'Cambiar de restaurante' })).not.toBeInTheDocument()
  })

  it('"Salir" desconecta el socket y cierra la sesión', async () => {
    await abrir()

    fireEvent.click(screen.getByRole('button', { name: /Salir/ }))

    expect(socketService.cerrarSesion).toHaveBeenCalledTimes(1)
  })

  it('sin restaurante elegido no consulta ni se une a la cocina', () => {
    reiniciarContexto()

    render(conRouter())

    expect(pedidosApi.getByRestaurante).not.toHaveBeenCalled()
    expect(socketService.joinRestauranteComoCocina).not.toHaveBeenCalled()
  })

  it('consulta el restaurante del contexto, que sale de la membresía', async () => {
    await abrir()

    expect(pedidosApi.getByRestaurante).toHaveBeenCalledWith('rest-1', { estado: 'en_preparacion' })
  })

  describe('tablero', () => {
    it('muestra en preparación y listos con ítems, modificaciones, notas, urgencia y el contador', async () => {
      await abrir()

      expect(pedidosApi.getByRestaurante.mock.calls.map(([, f]) => f?.estado)).toEqual(['en_preparacion', 'listo'])
      const card = tarjeta('1')
      expect(within(card).getByText('En preparación')).toBeInTheDocument()
      expect(within(card).getByText('2× Milanesa')).toBeInTheDocument()
      expect(within(card).getByText('sin Cebolla')).toBeInTheDocument()
      expect(within(card).getByText('+2 Queso')).toBeInTheDocument()
      expect(within(card).getByText('+1 Huevo')).toBeInTheDocument()
      expect(within(card).getByText('📝 bien cocida')).toBeInTheDocument()
      const alerta = '.lucide-triangle-alert, .lucide-alert-triangle'
      expect(card.querySelector(alerta)).toBeNull()
      expect(tarjeta('2').querySelector(alerta)).not.toBeNull()
      expect(within(tarjeta('3')).getByText('Listo')).toBeInTheDocument()
      expect(within(tarjeta('3')).queryByRole('button')).not.toBeInTheDocument()
      expect(screen.getByText('Cocina').nextElementSibling?.textContent).toBe('2')
    })

    it('un pedido editado muestra lo que quedó y lo quitado', async () => {
      await abrir()

      const card = tarjeta('2')
      expect(within(card).getByText('En preparación · Editado')).toBeInTheDocument()
      expect(within(card).getByText('1× Empanada')).toBeInTheDocument()
      expect(within(card).getByText('2× Empanada')).toBeInTheDocument()
      expect(within(card).getByText('1× Gaseosa')).toBeInTheDocument()
      expect(within(card).queryByText('📝 fría')).not.toBeInTheDocument()
    })

    it('las columnas vacías dicen "Sin pedidos" y el contador no aparece', async () => {
      await abrir([], [])

      expect(screen.getAllByText('Sin pedidos')).toHaveLength(2)
      expect(screen.getByText('Cocina').nextElementSibling?.tagName).not.toBe('SPAN')
    })

    it('si la carga falla lo dice; "Actualizar" vuelve a pedir', async () => {
      pedidosApi.getByRestaurante.mockRejectedValueOnce(new Error('caído'))
      render(conRouter())
      expect(await screen.findByText('No se pudieron cargar los pedidos.')).toBeInTheDocument()

      pedidosApi.getByRestaurante.mockResolvedValue([EN_PREP] as never)
      fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }))
      expect(screen.getByRole('button', { name: /Actualizando…/ })).toBeDisabled()
      expect(await screen.findAllByText('Mesa 1')).not.toHaveLength(0)
      expect(screen.queryByText('No se pudieron cargar los pedidos.')).not.toBeInTheDocument()
    })
  })

  describe('impresora', () => {
    it('"Conectar impresora" la conecta; si falla lo registra', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      impresoraMock.conectarImpresora.mockRejectedValueOnce(new Error('sin bluetooth')).mockResolvedValueOnce()
      await abrir()

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Conectar impresora' })) })
      expect(error).toHaveBeenCalledWith('No se pudo conectar la impresora.')
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Conectar impresora' })) })
      expect(screen.getByText('Impresora')).toBeInTheDocument()
      error.mockRestore()
    })

    it('si ya estaba conectada lo muestra de entrada', async () => {
      conectada = true
      await abrir()

      expect(screen.getByText('Impresora')).toBeInTheDocument()
    })

    it('conectada muestra "Test", que imprime la prueba; sin conectar no aparece', async () => {
      // Montaje dentro de act asincrono (abrir queda igual para los tests viejos): las cargas resuelven dentro de act.
      const montar = async () => {
        pedidosApi.getByRestaurante.mockResolvedValue([] as never)
        let vista!: ReturnType<typeof render>
        await act(async () => { vista = render(conRouter()) })
        await screen.findByRole('button', { name: /Actualizar/ })
        return vista
      }
      const { unmount } = await montar()
      expect(screen.queryByRole('button', { name: 'Test' })).not.toBeInTheDocument()
      unmount()

      conectada = true
      await montar()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Test' })) })
      expect(impresoraMock.testPrint).toHaveBeenCalledTimes(1)
    })
  })

  describe('tiempo real', () => {
    it('se une como cocina; al salir se desuscribe', async () => {
      const { unmount } = await abrir()

      expect(socketService.joinRestauranteComoCocina).toHaveBeenCalledWith('rest-1')
      unmount()
      expect(desuscribir.nuevo).toHaveBeenCalled()
      expect(desuscribir.actualizado).toHaveBeenCalled()
      expect(desuscribir.editado).toHaveBeenCalled()
    })

    it('un pedido nuevo en preparación suena, se imprime y aparece una vez; uno pendiente se ignora', async () => {
      await abrir([], [])
      const nuevo = pedido('nuevo-4', 'en_preparacion')

      recibir('nuevo', nuevo)
      recibir('nuevo', nuevo)
      recibir('nuevo', pedido('pend-5', 'pendiente'))

      expect(screen.getAllByText('Mesa 4')).toHaveLength(1)
      expect(screen.queryByText('Mesa 5')).not.toBeInTheDocument()
      // el segundo order:new del mismo pedido ya no suena ni imprime: se imprime una sola vez al entrar
      expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
      expect(tonos).toEqual([523, 659])
    })

    it('sin AudioContext no suena pero igual muestra el pedido', async () => {
      vi.stubGlobal('AudioContext', undefined)
      await abrir([], [])

      recibir('nuevo', pedido('nuevo-4', 'en_preparacion'))

      expect(screen.getByText('Mesa 4')).toBeInTheDocument()
      expect(tonos).toHaveLength(0)
    })

    it('un actualizado entra (con sonido si es nuevo), cambia de columna o se va', async () => {
      await abrir([EN_PREP], [])

      recibir('actualizado', pedido('mozo-6', 'en_preparacion'))
      expect(screen.getByText('Mesa 6')).toBeInTheDocument()
      expect(tonos).toEqual([523, 659])

      recibir('actualizado', { ...EN_PREP, estado: 'listo' })
      expect(within(tarjeta('1')).getByText('Listo')).toBeInTheDocument()

      recibir('actualizado', { ...EN_PREP, estado: 'entregado' })
      expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument()
    })

    it('un pedido editado se reemplaza con un doble beep; uno que no está se ignora', async () => {
      await abrir([EN_PREP], [])

      recibir('editado', { ...EN_PREP, items: [{ ...EN_PREP.items[0], cantidadEditada: 1 }, EN_PREP.items[1]] })
      expect(within(tarjeta('1')).getByText('En preparación · Editado')).toBeInTheDocument()
      expect(tonos).toEqual([440, 440])

      recibir('editado', pedido('otro-7', 'en_preparacion'))
      expect(screen.queryByText('Mesa 7')).not.toBeInTheDocument()
    })

    it('uno anulado queda tachado en preparación 3 minutos y después se va', async () => {
      await abrir([EN_PREP], [])
      vi.useFakeTimers({ shouldAdvanceTime: true })

      recibir('editado', { ...EN_PREP, estado: 'anulado' })
      recibir('editado', { ...EN_PREP, estado: 'anulado' })
      const card = tarjeta('1')
      expect(within(card).getByText('Anulado')).toBeInTheDocument()
      expect(within(card).getByText('2× Milanesa')).toHaveStyle({ textDecoration: 'line-through' })
      expect(within(card).queryByText('sin Cebolla')).not.toBeInTheDocument()
      expect(within(card).queryByRole('button')).not.toBeInTheDocument()
      expect(tonos.slice(0, 3)).toEqual([659, 523, 392])

      await act(async () => { await vi.advanceTimersByTimeAsync(180000) })
      expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument()
    })
  })

  describe('avanzar', () => {
    it('"Listo" lo pasa a listo con la respuesta del servidor; si ya no es de cocina lo saca', async () => {
      pedidosApi.cambiarEstado
        .mockResolvedValueOnce({ ...EN_PREP, estado: 'listo' } as never)
        .mockResolvedValueOnce({ ...EDITADO, estado: 'entregado' } as never)
      await abrir()

      fireEvent.click(within(tarjeta('1')).getByRole('button', { name: 'Listo' }))
      await vi.waitFor(() => expect(within(tarjeta('1')).getByText('Listo')).toBeInTheDocument())
      expect(pedidosApi.cambiarEstado).toHaveBeenCalledWith('prep-1', 'listo')

      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Listo' }))
      await vi.waitFor(() => expect(screen.queryByText('Mesa 2')).not.toBeInTheDocument())
    })

    it('si falla vuelve al estado anterior', async () => {
      pedidosApi.cambiarEstado.mockRejectedValue(new Error('caído'))
      await abrir()

      fireEvent.click(within(tarjeta('1')).getByRole('button', { name: 'Listo' }))

      await vi.waitFor(() => expect(within(tarjeta('1')).getByRole('button', { name: 'Listo' })).toBeEnabled())
      expect(within(tarjeta('1')).getByText('En preparación')).toBeInTheDocument()
    })
  })
})

describe('CocinaPage: pestañas por comanda', () => {
  const COCINA = { id: 'c-coc', restauranteId: 'rest-1', nombre: 'Cocina', activa: true }
  const BARRA = { id: 'c-bar', restauranteId: 'rest-1', nombre: 'Barra', activa: true }
  const VIEJA = { id: 'c-vie', restauranteId: 'rest-1', nombre: 'Antigua', activa: false }
  const CLAVE = 'menyu-staff-comanda:rest-1'

  const linea = (id: string, nombre: string, comandaId: string | null, extra: Partial<PedidoRico['items'][number]> = {}) =>
    ({ id, itemId: id, cantidad: 1, cantidadEditada: null, precioUnitario: 100, notas: null, comandaId, item: { nombre }, mods: [], ...extra }) as PedidoRico['items'][number]

  const SOLO_COCINA = pedido('coc-1', 'en_preparacion', { items: [linea('a1', 'Milanesa', 'c-coc')] })
  // Mesa 2: lo de Barra (Cerveza) y lo sin comanda (Agua) se ve; Milanesa y Papas (vigentes) cuentan como ocultos y Flan (eliminado) no.
  const MIXTO = pedido('mix-2', 'en_preparacion', {
    items: [
      linea('b1', 'Cerveza', 'c-bar'),
      linea('b2', 'Milanesa', 'c-coc'),
      linea('b3', 'Agua', null),
      linea('b4', 'Flan', 'c-coc', { cantidadEditada: 0 }),
      linea('b5', 'Papas', 'c-coc', { cantidad: 3, cantidadEditada: 2 }),
    ],
  })
  const SOLO_BARRA = pedido('bar-3', 'listo', { items: [linea('c1', 'Gin', 'c-bar')] })

  async function abrirCon(comandas: (typeof COCINA)[], enPrep = [SOLO_COCINA, MIXTO], listos = [SOLO_BARRA]) {
    comandasApi.listar.mockResolvedValue(comandas)
    const vista = await abrir(enPrep, listos)
    await act(async () => {})
    return vista
  }

  const grupo = () => screen.getByRole('group', { name: 'Filtrar por comanda' })
  const boton = (nombre: string) => within(grupo()).getByRole('button', { name: nombre })
  const elegir = (nombre: string) => fireEvent.click(boton(nombre))

  it('sin comandas no hay grupo de filtro y se ve todo', async () => {
    await abrirCon([])
    expect(screen.queryByRole('group', { name: 'Filtrar por comanda' })).not.toBeInTheDocument()
    expect(comandasApi.listar).toHaveBeenCalledWith('rest-1')
    expect(screen.getByText('Mesa 1')).toBeInTheDocument()
    expect(screen.getByText('Mesa 2')).toBeInTheDocument()
  })

  it('con todas las comandas inactivas tampoco hay grupo', async () => {
    await abrirCon([VIEJA])
    expect(screen.queryByRole('group', { name: 'Filtrar por comanda' })).not.toBeInTheDocument()
  })

  it('muestra "Todas" más las activas por nombre; la inactiva no aparece; "Todas" arranca presionada', async () => {
    await abrirCon([COCINA, VIEJA, BARRA])

    const nombres = within(grupo()).getAllByRole('button').map((b) => b.textContent)
    expect(nombres).toEqual(['Todas', 'Barra', 'Cocina'])
    expect(boton('Todas')).toHaveAttribute('aria-pressed', 'true')
    expect(boton('Barra')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('en "Barra" solo se listan los pedidos con algo visible y de cada uno sus ítems visibles', async () => {
    await abrirCon([COCINA, BARRA])

    elegir('Barra')

    expect(boton('Barra')).toHaveAttribute('aria-pressed', 'true')
    expect(boton('Todas')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument()
    const mixto = tarjeta('2')
    expect(within(mixto).getByText('1× Cerveza')).toBeInTheDocument()
    expect(within(mixto).getByText('1× Agua')).toBeInTheDocument()
    expect(within(mixto).queryByText(/Milanesa/)).not.toBeInTheDocument()
    expect(within(mixto).queryByText(/Papas/)).not.toBeInTheDocument()
    expect(within(mixto).queryByText(/Flan/)).not.toBeInTheDocument()
    expect(within(mixto).getByText('+2 de otras comandas')).toBeInTheDocument()
    expect(within(tarjeta('3')).queryByText(/de otras comandas/)).not.toBeInTheDocument()
  })

  it('una línea oculta eliminada no suma al "+N de otras comandas"', async () => {
    const soloEliminada = pedido('eli-4', 'en_preparacion', {
      items: [linea('d1', 'Cerveza', 'c-bar'), linea('d2', 'Flan', 'c-coc', { cantidadEditada: 0 })],
    })
    await abrirCon([COCINA, BARRA], [soloEliminada], [])

    elegir('Barra')

    expect(within(tarjeta('4')).getByText('1× Cerveza')).toBeInTheDocument()
    expect(within(tarjeta('4')).queryByText(/de otras comandas/)).not.toBeInTheDocument()
  })

  it('los ítems sin comanda o con comanda inactiva se ven en cualquier pestaña', async () => {
    const raros = pedido('raro-5', 'en_preparacion', {
      items: [linea('e1', 'Soda', 'c-vie'), linea('e2', 'Pan', null), linea('e3', 'Asado', 'c-coc')],
    })
    await abrirCon([COCINA, BARRA, VIEJA], [raros], [])

    elegir('Barra')

    const card = tarjeta('5')
    expect(within(card).getByText('1× Soda')).toBeInTheDocument()
    expect(within(card).getByText('1× Pan')).toBeInTheDocument()
    expect(within(card).queryByText(/Asado/)).not.toBeInTheDocument()
    expect(within(card).getByText('+1 de otras comandas')).toBeInTheDocument()
  })

  it('los contadores del encabezado y de las columnas cuentan solo lo visible', async () => {
    await abrirCon([COCINA, BARRA])
    const contador = (estado: string) =>
      screen.getAllByText(estado).map((e) => e.parentElement as HTMLElement).find((c) => (c.textContent ?? '').startsWith(estado) && !(c.textContent ?? '').includes('Mesa'))!
    const encabezado = () => within(screen.getByRole('banner'))

    expect(encabezado().getByText('2')).toBeInTheDocument()
    expect(contador('En preparación')).toHaveTextContent('En preparación2')
    expect(contador('Listo')).toHaveTextContent('Listo1')

    elegir('Cocina')
    expect(encabezado().getByText('2')).toBeInTheDocument()
    expect(contador('Listo')).toHaveTextContent('Listo0')

    elegir('Barra')
    expect(encabezado().getByText('1')).toBeInTheDocument()
    expect(contador('En preparación')).toHaveTextContent('En preparación1')
    expect(contador('Listo')).toHaveTextContent('Listo1')
  })

  describe('persistencia', () => {
    it('al elegir se guarda; "Todas" borra la clave', async () => {
      await abrirCon([COCINA, BARRA])

      elegir('Barra')
      expect(localStorage.getItem(CLAVE)).toBe('c-bar')

      elegir('Todas')
      expect(localStorage.getItem(CLAVE)).toBeNull()
    })

    it('al volver a montar arranca con la pestaña guardada', async () => {
      const { unmount } = await abrirCon([COCINA, BARRA])
      elegir('Barra')
      unmount()

      await abrirCon([COCINA, BARRA])

      expect(boton('Barra')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument()
    })

    it('si la guardada ya no está activa arranca en "Todas" y no toca la clave', async () => {
      localStorage.setItem(CLAVE, 'c-vie')

      await abrirCon([COCINA, BARRA, VIEJA])

      expect(boton('Todas')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('Mesa 1')).toBeInTheDocument()
      expect(localStorage.getItem(CLAVE)).toBe('c-vie')
    })
  })

  describe('si fallan las comandas', () => {
    it('si "listar" rechaza no hay grupo, se ven todos los pedidos y no hay banner de error', async () => {
      comandasApi.listar.mockRejectedValue(new Error('caído'))
      await abrir([SOLO_COCINA, MIXTO], [SOLO_BARRA])
      await act(async () => {})

      expect(screen.queryByRole('group', { name: 'Filtrar por comanda' })).not.toBeInTheDocument()
      expect(screen.getByText('Mesa 1')).toBeInTheDocument()
      expect(screen.getByText('Mesa 2')).toBeInTheDocument()
      expect(screen.getByText('Mesa 3')).toBeInTheDocument()
      expect(screen.queryByText('No se pudieron cargar los pedidos.')).not.toBeInTheDocument()
    })

    it('"Actualizar" con la segunda petición fallida conserva las pestañas de la primera', async () => {
      comandasApi.listar.mockResolvedValueOnce([COCINA, BARRA]).mockRejectedValueOnce(new Error('caído'))
      await abrir([SOLO_COCINA, MIXTO], [SOLO_BARRA])
      await act(async () => {})
      expect(grupo()).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }))
      await vi.waitFor(() => expect(comandasApi.listar).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(screen.getByRole('button', { name: /Actualizar/ })).toBeEnabled())
      await act(async () => {})

      expect(within(grupo()).getAllByRole('button').map((b) => b.textContent)).toEqual(['Todas', 'Barra', 'Cocina'])
      expect(screen.queryByText('No se pudieron cargar los pedidos.')).not.toBeInTheDocument()
    })
  })

  it('un pedido nuevo por socket sin ítems visibles en la pestaña no se lista, y sí en "Todas"', async () => {
    await abrirCon([COCINA, BARRA], [], [])
    elegir('Barra')

    recibir('nuevo', pedido('sock-6', 'en_preparacion', { items: [linea('f1', 'Milanesa', 'c-coc')] }))
    expect(screen.queryByText('Mesa 6')).not.toBeInTheDocument()

    elegir('Todas')
    expect(screen.getByText('Mesa 6')).toBeInTheDocument()
  })

  describe('badge "Editado"', () => {
    const conEdicion = (id: string, editaBarra: boolean) =>
      pedido(id, 'en_preparacion', {
        items: [
          linea('g1', 'Cerveza', 'c-bar', editaBarra ? { cantidad: 2, cantidadEditada: 1 } : {}),
          linea('g2', 'Milanesa', 'c-coc', editaBarra ? {} : { cantidad: 2, cantidadEditada: 1 }),
        ],
      })

    it('una edición solo en un ítem de otra comanda no lo muestra en la pestaña filtrada, y sí en "Todas"', async () => {
      await abrirCon([COCINA, BARRA], [conEdicion('ed-7', false)], [])

      elegir('Barra')
      expect(within(tarjeta('7')).getByText('En preparación')).toBeInTheDocument()
      expect(within(tarjeta('7')).queryByText(/Editado/)).not.toBeInTheDocument()

      elegir('Todas')
      expect(within(tarjeta('7')).getByText('En preparación · Editado')).toBeInTheDocument()
    })

    it('una edición en un ítem de la comanda propia sí lo muestra', async () => {
      await abrirCon([COCINA, BARRA], [conEdicion('ed-8', true)], [])

      elegir('Barra')

      expect(within(tarjeta('8')).getByText('En preparación · Editado')).toBeInTheDocument()
    })
  })

  describe('respuestas viejas de comandas', () => {
    const diferida = <T,>() => {
      let resolver!: (v: T) => void
      const promesa = new Promise<T>((r) => { resolver = r })
      return { promesa, resolver }
    }
    const montarDosRestaurantes = () => {
      reiniciarContexto()
      montarContexto(perfilDePrueba({
        nombre: 'Cocina de Prueba',
        membresias: [membresiaDeRestaurante('COCINA', 'rest-1'), membresiaDeRestaurante('COCINA', 'rest-2')],
      }), 'rest-1')
    }
    const botones = () => within(grupo()).getAllByRole('button').map((b) => b.textContent)

    it('la respuesta de un restaurante anterior no pisa la lista del actual (carga al cambiar)', async () => {
      montarDosRestaurantes()
      const a = diferida<(typeof COCINA)[]>()
      comandasApi.listar.mockImplementation(((r: string) => (r === 'rest-1' ? a.promesa : Promise.resolve([BARRA]))) as never)
      await abrir([], [])

      act(() => { useContextoStore.setState({ restauranteId: 'rest-2' }) })
      await vi.waitFor(() => expect(botones()).toEqual(['Todas', 'Barra']))
      await act(async () => { a.resolver([COCINA, VIEJA]) })

      expect(botones()).toEqual(['Todas', 'Barra'])
    })

    it('tampoco con "Actualizar": la respuesta tardía del restaurante anterior se descarta', async () => {
      montarDosRestaurantes()
      const a2 = diferida<(typeof COCINA)[]>()
      comandasApi.listar
        .mockResolvedValueOnce([COCINA])
        .mockImplementation(((r: string) => (r === 'rest-1' ? a2.promesa : Promise.resolve([BARRA]))) as never)
      await abrir([], [])
      await act(async () => {})

      fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }))
      await vi.waitFor(() => expect(comandasApi.listar).toHaveBeenCalledTimes(2))
      act(() => { useContextoStore.setState({ restauranteId: 'rest-2' }) })
      await vi.waitFor(() => expect(botones()).toEqual(['Todas', 'Barra']))
      await act(async () => { a2.resolver([COCINA, VIEJA]) })

      expect(botones()).toEqual(['Todas', 'Barra'])
    })
  })

  describe('respuestas viejas de pedidos', () => {
    const pendiente = <T,>() => {
      let resolver!: (v: T) => void
      let rechazar!: (e: unknown) => void
      const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
      return { promesa, resolver, rechazar }
    }
    const DE_A = pedido('ra-1', 'en_preparacion')
    const DE_B = pedido('rb-2', 'en_preparacion')

    // El restaurante A (rest-1) queda pendiente, una promesa por estado; el B (rest-2) responde enseguida.
    const montarConA = () => {
      reiniciarContexto()
      montarContexto(perfilDePrueba({
        nombre: 'Cocina de Prueba',
        membresias: [membresiaDeRestaurante('COCINA', 'rest-1'), membresiaDeRestaurante('COCINA', 'rest-2')],
      }), 'rest-1')
      const aEnPrep = pendiente<PedidoRico[]>()
      const aListos = pendiente<PedidoRico[]>()
      pedidosApi.getByRestaurante.mockImplementation(((r: string, f?: { estado?: string }) => {
        if (r === 'rest-1') return f?.estado === 'en_preparacion' ? aEnPrep.promesa : aListos.promesa
        return Promise.resolve(f?.estado === 'en_preparacion' ? [DE_B] : [])
      }) as never)
      render(conRouter())
      return { aEnPrep, aListos }
    }

    it('éxito: la respuesta tardía del restaurante anterior no pisa los pedidos del actual', async () => {
      const { aEnPrep, aListos } = montarConA()

      act(() => { useContextoStore.setState({ restauranteId: 'rest-2' }) })
      await vi.waitFor(() => expect(screen.getByText('Mesa 2')).toBeInTheDocument())
      await act(async () => { aEnPrep.resolver([DE_A]); aListos.resolver([]) })

      expect(screen.getByText('Mesa 2')).toBeInTheDocument()
      expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument()
    })

    it('error: el rechazo tardío del restaurante anterior no muestra el banner ni pisa los pedidos del actual', async () => {
      const { aEnPrep, aListos } = montarConA()

      act(() => { useContextoStore.setState({ restauranteId: 'rest-2' }) })
      await vi.waitFor(() => expect(screen.getByText('Mesa 2')).toBeInTheDocument())
      await act(async () => { aEnPrep.rechazar(new Error('caído')); aListos.resolver([]) })

      expect(screen.queryByText('No se pudieron cargar los pedidos.')).not.toBeInTheDocument()
      expect(screen.getByText('Mesa 2')).toBeInTheDocument()
    })
  })

  describe('socket y pestañas', () => {
    const ped = (id: string, items: PedidoRico['items'], estado = 'en_preparacion') => pedido(id, estado, { items })

    it('cambiar de pestaña no vuelve a suscribirse ni a unirse', async () => {
      await abrirCon([COCINA, BARRA])

      elegir('Barra')
      elegir('Cocina')
      elegir('Todas')

      expect(socketService.onPedidoNuevo).toHaveBeenCalledTimes(1)
      expect(socketService.onPedidoActualizado).toHaveBeenCalledTimes(1)
      expect(socketService.onPedidoEditado).toHaveBeenCalledTimes(1)
      expect(socketService.joinRestauranteComoCocina).toHaveBeenCalledTimes(1)
    })

    describe('sonido', () => {
      it('un pedido nuevo sin ítems visibles no suena y se guarda (aparece en "Todas"); con visibles suena', async () => {
        await abrirCon([COCINA, BARRA], [], [])
        elegir('Barra')

        recibir('nuevo', ped('so-6', [linea('h1', 'Milanesa', 'c-coc')]))
        expect(tonos).toHaveLength(0)
        expect(screen.queryByText('Mesa 6')).not.toBeInTheDocument()

        recibir('nuevo', ped('so-7', [linea('h2', 'Cerveza', 'c-bar')]))
        expect(tonos).toEqual([523, 659])

        elegir('Todas')
        expect(screen.getByText('Mesa 6')).toBeInTheDocument()
      })

      it('un actualizado que entra sin ítems visibles no suena; con visibles suena', async () => {
        await abrirCon([COCINA, BARRA], [], [])
        elegir('Barra')

        recibir('actualizado', ped('ac-6', [linea('i1', 'Milanesa', 'c-coc')]))
        expect(tonos).toHaveLength(0)

        recibir('actualizado', ped('ac-7', [linea('i2', 'Cerveza', 'c-bar')]))
        expect(tonos).toEqual([523, 659])
      })

      it('un anulado sin ítems visibles no suena; con visibles suena', async () => {
        await abrirCon([COCINA, BARRA], [SOLO_COCINA, MIXTO], [])
        elegir('Barra')

        recibir('editado', { ...SOLO_COCINA, estado: 'anulado' })
        expect(tonos).toHaveLength(0)

        recibir('editado', { ...MIXTO, estado: 'anulado' })
        expect(tonos).toEqual([659, 523, 392])
      })

      it('una edición que suma un ítem de Barra a un pedido solo de Cocina suena "editado" en Barra', async () => {
        await abrirCon([COCINA, BARRA], [SOLO_COCINA], [])
        elegir('Barra')
        expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument()

        recibir('editado', { ...SOLO_COCINA, items: [...SOLO_COCINA.items, linea('a2', 'Cerveza', 'c-bar')] })

        expect(tonos).toEqual([440, 440])
        expect(within(tarjeta('1')).getByText('1× Cerveza')).toBeInTheDocument()
      })

      it('una edición de un pedido que sigue solo con Cocina no suena en Barra', async () => {
        await abrirCon([COCINA, BARRA], [SOLO_COCINA], [])
        elegir('Barra')

        recibir('editado', { ...SOLO_COCINA, items: [{ ...SOLO_COCINA.items[0], cantidad: 2, cantidadEditada: 1 }] })

        expect(tonos).toHaveLength(0)
        expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument()
      })
    })

    describe('impresión', () => {
      const MEZCLA = () => ped('im-6', [
        linea('j1', 'Cerveza', 'c-bar'),
        linea('j2', 'Milanesa', 'c-coc'),
        linea('j3', 'Agua', null),
        linea('j4', 'Soda', 'c-vie'),
      ])

      it('en una pestaña filtrada imprime solo los ítems visibles, en una copia', async () => {
        await abrirCon([COCINA, BARRA, VIEJA], [], [])
        elegir('Barra')
        const nuevo = MEZCLA()

        recibir('nuevo', nuevo)

        expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
        const impreso = impresoraMock.imprimirPedido.mock.calls[0][0] as PedidoRico
        expect(impreso.items.map((i) => i.id)).toEqual(['j1', 'j3', 'j4'])
        expect(impreso.id).toBe('im-6')
        expect(nuevo.items).toHaveLength(4)
      })

      it('en "Todas" imprime el pedido completo', async () => {
        await abrirCon([COCINA, BARRA, VIEJA], [], [])
        const nuevo = MEZCLA()

        recibir('nuevo', nuevo)

        expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
        expect(impresoraMock.imprimirPedido.mock.calls[0][0]).toEqual(nuevo)
      })

      it('sin ítems visibles no imprime', async () => {
        await abrirCon([COCINA, BARRA], [], [])
        elegir('Barra')

        recibir('nuevo', ped('im-7', [linea('k1', 'Milanesa', 'c-coc')]))

        expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()
      })
    })

    describe('pedido sin ítems', () => {
      it('en "Todas" se lista y suena "nuevo", pero no se imprime: no hay ítems para el ticket', async () => {
        await abrirCon([COCINA, BARRA], [], [])

        recibir('nuevo', ped('vz-5', []))

        expect(screen.getByText('Mesa 5')).toBeInTheDocument()
        expect(tonos).toEqual([523, 659])
        expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()
      })

      it('en una pestaña filtrada no se lista, no suena ni se imprime', async () => {
        await abrirCon([COCINA, BARRA], [], [])
        elegir('Barra')

        recibir('nuevo', ped('vz-6', []))

        expect(screen.queryByText('Mesa 6')).not.toBeInTheDocument()
        expect(tonos).toHaveLength(0)
        expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()
      })
    })
  })

  describe('imprimir al entrar a cocina', () => {
    // Variante de abrirCon solo para estos tests: monta DENTRO de un act asincrono para que las cargas del montaje
    // (fetchAll/fetchComandas) resuelvan dentro de act y no avisen. abrirCon queda igual para los tests viejos.
    async function abrirEnAct(comandas: (typeof COCINA)[], enPrep = [SOLO_COCINA, MIXTO], listos = [SOLO_BARRA]) {
      comandasApi.listar.mockResolvedValue(comandas)
      pedidosApi.getByRestaurante.mockImplementation((_r: string, f?: { estado?: string }) =>
        Promise.resolve(f?.estado === 'en_preparacion' ? enPrep : listos) as never,
      )
      await act(async () => { render(conRouter()) })
      await screen.findByRole('button', { name: /Actualizar/ })
    }
    const ped = (id: string, items: PedidoRico['items'], estado = 'en_preparacion') => pedido(id, estado, { items })
    const impresos = () => impresoraMock.imprimirPedido.mock.calls.map((c) => c[0] as PedidoRico)
    const idsImpresos = () => impresos().map((p) => p.items.map((i) => i.id))
    const MEZCLADO = () => ped('en-6', [linea('p1', 'Milanesa', 'c-coc'), linea('p2', 'Cerveza', 'c-bar'), linea('p3', 'Agua', null)])

    it('el del comensal llega pendiente (ni se lista, ni suena, ni imprime) y al pasar a preparación entra una vez', async () => {
      await abrirEnAct([COCINA, BARRA], [], [])
      const pendiente = ped('cm-6', [linea('q1', 'Milanesa', 'c-coc')], 'pendiente')

      recibir('nuevo', pendiente)
      expect(screen.queryByText('Mesa 6')).not.toBeInTheDocument()
      expect(tonos).toHaveLength(0)
      expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()

      const enPrep = { ...pendiente, estado: 'en_preparacion' }
      recibir('actualizado', enPrep)
      expect(screen.getByText('Mesa 6')).toBeInTheDocument()
      expect(tonos).toEqual([523, 659])
      expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
      expect(impresoraMock.imprimirPedido.mock.calls[0][0]).toEqual(enPrep)
    })

    it('un pedido mixto que entra: la pantalla en Barra imprime solo la bebida y lo sin comanda', async () => {
      localStorage.setItem(CLAVE, 'c-bar')
      await abrirEnAct([COCINA, BARRA], [], [])

      recibir('actualizado', MEZCLADO())

      expect(idsImpresos()).toEqual([['p2', 'p3']])
      expect(impresos()[0].id).toBe('en-6')
    })

    it('el mismo pedido mixto en otro dispositivo, con la pestaña Cocina, imprime solo el plato y lo sin comanda', async () => {
      localStorage.setItem(CLAVE, 'c-coc')
      await abrirEnAct([COCINA, BARRA], [], [])

      recibir('actualizado', MEZCLADO())

      expect(idsImpresos()).toEqual([['p1', 'p3']])
    })

    it('el mismo pedido mixto en "Todas" imprime el pedido completo', async () => {
      await abrirEnAct([COCINA, BARRA], [], [])
      const mezclado = MEZCLADO()

      recibir('actualizado', mezclado)

      expect(impresoraMock.imprimirPedido.mock.calls[0][0]).toEqual(mezclado)
    })

    it('al entrar, en "Todas", no imprime las líneas eliminadas (cantidad vigente 0)', async () => {
      const conQuitada = () => ped('en-7', [
        linea('q1', 'Milanesa', 'c-coc'), linea('q2', 'Flan', 'c-coc', { cantidadEditada: 0 }), linea('q3', 'Cerveza', 'c-bar'),
      ])
      await abrirEnAct([COCINA, BARRA], [], [])

      recibir('actualizado', conQuitada())

      expect(idsImpresos()).toEqual([['q1', 'q3']])
    })

    it('si al omitir las líneas eliminadas no queda ninguna, el pedido entra (se lista y suena) pero no imprime', async () => {
      localStorage.setItem(CLAVE, 'c-bar')
      await abrirEnAct([COCINA, BARRA], [], [])

      recibir('actualizado', ped('en-8', [linea('r1', 'Cerveza', 'c-bar', { cantidadEditada: 0 }), linea('r2', 'Milanesa', 'c-coc')]))

      expect(screen.getByText('Mesa 8')).toBeInTheDocument()
      expect(tonos).toEqual([523, 659])
      expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()
    })

    it('un order:updated repetido, seguido o dentro del mismo act, imprime y suena una sola vez', async () => {
      await abrirEnAct([COCINA, BARRA], [], [])
      const p = ped('rp-6', [linea('r1', 'Milanesa', 'c-coc')])

      recibir('actualizado', p)
      recibir('actualizado', { ...p })
      act(() => { oyentes.actualizado!(como(p)); oyentes.actualizado!(como(p)) })

      expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
      expect(tonos).toEqual([523, 659])
    })

    it('dos order:updated dentro del mismo act de un pedido nuevo imprimen una sola vez', async () => {
      await abrirEnAct([COCINA, BARRA], [], [])
      const p = ped('rp-7', [linea('r2', 'Milanesa', 'c-coc')])

      act(() => { oyentes.actualizado!(como(p)); oyentes.actualizado!(como(p)) })

      expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
      expect(tonos).toEqual([523, 659])
    })

    it('uno que fetchAll ya cargó y pasa a listo ni imprime ni suena', async () => {
      await abrirEnAct([COCINA, BARRA], [SOLO_COCINA], [])

      recibir('actualizado', { ...SOLO_COCINA, estado: 'listo' })

      expect(within(tarjeta('1')).getByText('Listo')).toBeInTheDocument()
      expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()
      expect(tonos).toHaveLength(0)
    })

    it('el order:updated que acompaña a una edición que cierra el pedido (#344) no suena ni reimprime', async () => {
      await abrirEnAct([COCINA, BARRA], [SOLO_COCINA], [])
      // Se eliminó lo que faltaba y lo demás ya estaba marcado: la edición lo cierra.
      const cerrado = {
        ...SOLO_COCINA,
        estado: 'listo',
        items: [linea('a1', 'Milanesa', 'c-coc', { listoEn: '2026-11-26T15:00:00Z' }), linea('a2', 'Flan', 'c-coc', { cantidadEditada: 0 })],
      }
      recibir('editado', cerrado)
      const tonosDeLaEdicion = tonos.length

      recibir('actualizado', cerrado)
      recibir('actualizado', { ...cerrado })

      expect(within(tarjeta('1')).getByText('Listo · Editado')).toBeInTheDocument()
      expect(tonos).toHaveLength(tonosDeLaEdicion)
      expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()
    })

    it('order:new en preparación (toma del mozo) imprime una vez; ni el updated a listo ni un order:new repetido reimprimen', async () => {
      await abrirEnAct([COCINA, BARRA], [], [])
      const p = ped('tm-6', [linea('s1', 'Milanesa', 'c-coc')])

      recibir('nuevo', p)
      recibir('actualizado', { ...p, estado: 'listo' })
      recibir('nuevo', p)

      expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
      expect(tonos).toEqual([523, 659])
    })

    it('si entra directo en listo suena pero no imprime', async () => {
      await abrirEnAct([COCINA, BARRA], [], [])

      recibir('actualizado', ped('dl-6', [linea('t1', 'Milanesa', 'c-coc')], 'listo'))

      expect(screen.getByText('Mesa 6')).toBeInTheDocument()
      expect(tonos).toEqual([523, 659])
      expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()
    })

    it('sin ítems visibles en la pestaña no suena ni imprime, y al cambiar a la pestaña con ítems tampoco imprime', async () => {
      await abrirEnAct([COCINA, BARRA], [], [])
      elegir('Barra')

      recibir('nuevo', ped('sv-6', [linea('u1', 'Milanesa', 'c-coc')]))
      recibir('actualizado', ped('sv-7', [linea('u2', 'Milanesa', 'c-coc')]))
      expect(tonos).toHaveLength(0)
      expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()

      elegir('Cocina')
      expect(screen.getByText('Mesa 6')).toBeInTheDocument()
      recibir('actualizado', ped('sv-6', [linea('u1', 'Milanesa', 'c-coc')]))
      expect(tonos).toHaveLength(0)
      expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()
    })

    it('con StrictMode (updaters y efectos doble) un pedido que entra por order:updated imprime y suena una sola vez', async () => {
      pedidosApi.getByRestaurante.mockResolvedValue([] as never)
      comandasApi.listar.mockResolvedValue([COCINA, BARRA])
      await act(async () => { render(<StrictMode>{conRouter()}</StrictMode>) })
      await vi.waitFor(() => expect(screen.getByRole('button', { name: /Actualizar/ })).toBeEnabled())

      recibir('actualizado', ped('sm-6', [linea('v1', 'Milanesa', 'c-coc')]))

      expect(screen.getByText('Mesa 6')).toBeInTheDocument()
      expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
      expect(tonos).toEqual([523, 659])
    })

    describe('reimprimir', () => {
      const botonDe = (mesa: string) => within(tarjeta(mesa)).getByRole('button', { name: `Reimprimir pedido de la mesa ${mesa}` })
      const botones = () => screen.queryAllByRole('button', { name: /^Reimprimir pedido/ })
      const clic = (b: HTMLElement) => act(async () => { fireEvent.click(b) })

      it('en Barra reimprime solo la bebida y lo sin comanda', async () => {
        conectada = true
        localStorage.setItem(CLAVE, 'c-bar')
        await abrirEnAct([COCINA, BARRA], [MEZCLADO()], [])

        await clic(botonDe('6'))

        expect(idsImpresos()).toEqual([['p2', 'p3']])
      })

      it('con la pestaña Cocina reimprime solo el plato y lo sin comanda', async () => {
        conectada = true
        localStorage.setItem(CLAVE, 'c-coc')
        await abrirEnAct([COCINA, BARRA], [MEZCLADO()], [])

        await clic(botonDe('6'))

        expect(idsImpresos()).toEqual([['p1', 'p3']])
      })

      it('en "Todas" reimprime el pedido completo', async () => {
        conectada = true
        const mezclado = MEZCLADO()
        await abrirEnAct([COCINA, BARRA], [mezclado], [])

        await clic(botonDe('6'))

        expect(impresos()).toEqual([mezclado])
      })

      it('no reimprime las líneas eliminadas de un pedido editado', async () => {
        conectada = true
        const editado = ped('ed-4', [
          linea('q1', 'Milanesa', 'c-coc'), linea('q2', 'Flan', 'c-coc', { cantidadEditada: 0 }), linea('q3', 'Cerveza', 'c-bar'),
        ])
        await abrirEnAct([COCINA, BARRA], [editado], [])

        await clic(botonDe('4'))

        expect(idsImpresos()).toEqual([['q1', 'q3']])
      })

      it('si en la pestaña todas las líneas visibles están eliminadas, el pedido se ve pero no hay botón', async () => {
        conectada = true
        localStorage.setItem(CLAVE, 'c-bar')
        const quitada = ped('qu-3', [linea('r1', 'Cerveza', 'c-bar', { cantidadEditada: 0 }), linea('r2', 'Milanesa', 'c-coc')])
        await abrirEnAct([COCINA, BARRA], [quitada], [])

        expect(screen.getByText('Mesa 3')).toBeInTheDocument()
        expect(botones()).toHaveLength(0)
      })

      it('el botón nombra la mesa y no aparece en la columna "Listo"', async () => {
        conectada = true
        const listo = ped('li-7', [linea('l1', 'Gin', 'c-bar')], 'listo')
        await abrirEnAct([COCINA, BARRA], [MEZCLADO()], [listo])

        expect(botones().map((b) => b.getAttribute('aria-label'))).toEqual(['Reimprimir pedido de la mesa 6'])
        expect(screen.getByText('Mesa 7')).toBeInTheDocument()
        expect(within(tarjeta('7')).queryByRole('button', { name: /Reimprimir/ })).not.toBeInTheDocument()
      })

      it('un pedido sin ítems visibles en la pestaña no se ve y no tiene botón', async () => {
        conectada = true
        localStorage.setItem(CLAVE, 'c-bar')
        await abrirEnAct([COCINA, BARRA], [ped('so-1', [linea('s1', 'Milanesa', 'c-coc')])], [])

        expect(screen.queryByText('Mesa 1')).not.toBeInTheDocument()
        expect(botones()).toHaveLength(0)
      })

      it('un pedido anulado, tachado en preparación, no tiene botón', async () => {
        conectada = true
        const mezclado = MEZCLADO()
        await abrirEnAct([COCINA, BARRA], [mezclado], [])
        expect(botones()).toHaveLength(1)

        recibir('editado', { ...mezclado, estado: 'anulado' })

        expect(within(tarjeta('6')).getByText('Anulado')).toBeInTheDocument()
        expect(botones()).toHaveLength(0)
      })

      it('sin impresora conectada el botón queda aria-disabled, explica por qué y no imprime', async () => {
        await abrirEnAct([COCINA, BARRA], [MEZCLADO()], [])
        const boton = botonDe('6')

        expect(boton).toHaveAttribute('aria-disabled', 'true')
        expect(boton).not.toBeDisabled()
        expect(boton).toHaveAccessibleDescription('Conectá la impresora para reimprimir')
        // el texto va por aria-describedby y no solo por el title, que no lo leen todos los lectores
        expect(document.getElementById(boton.getAttribute('aria-describedby') ?? '')).toHaveTextContent('Conectá la impresora para reimprimir')
        await clic(boton)

        expect(impresoraMock.imprimirPedido).not.toHaveBeenCalled()
      })

      it('al conectar la impresora el botón se habilita y deja de explicar', async () => {
        await abrirEnAct([COCINA, BARRA], [MEZCLADO()], [])
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Conectar impresora' })) })

        expect(botonDe('6')).toHaveAttribute('aria-disabled', 'false')
        expect(botonDe('6')).not.toHaveAccessibleDescription()
        await clic(botonDe('6'))
        expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
      })

      it('se puede reimprimir las veces que haga falta, sin sonar ni cambiar el estado del pedido', async () => {
        conectada = true
        await abrirEnAct([COCINA, BARRA], [MEZCLADO()], [])

        await clic(botonDe('6'))
        await clic(botonDe('6'))
        await clic(botonDe('6'))

        expect(idsImpresos()).toEqual([['p1', 'p2', 'p3'], ['p1', 'p2', 'p3'], ['p1', 'p2', 'p3']])
        expect(tonos).toHaveLength(0)
        expect(pedidosApi.cambiarEstado).not.toHaveBeenCalled()
        expect(within(tarjeta('6')).getByText('En preparación')).toBeInTheDocument()
      })

      it('no altera el registro de entradas: un order:updated del mismo pedido no imprime ni suena, y uno nuevo sí', async () => {
        conectada = true
        const mezclado = MEZCLADO()
        await abrirEnAct([COCINA, BARRA], [mezclado], [])
        await clic(botonDe('6'))
        expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)

        recibir('actualizado', mezclado)
        expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
        expect(tonos).toHaveLength(0)

        recibir('actualizado', ped('nu-5', [linea('n1', 'Milanesa', 'c-coc')]))
        expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(2)
        expect(tonos).toEqual([523, 659])
      })

      it('reimprimir un pedido no hace que otro que entra después imprima de más: entra una vez', async () => {
        conectada = true
        await abrirEnAct([COCINA, BARRA], [MEZCLADO()], [])
        await clic(botonDe('6'))

        const nuevo = ped('nu-5', [linea('n1', 'Milanesa', 'c-coc')])
        recibir('actualizado', nuevo)
        recibir('actualizado', nuevo)

        expect(idsImpresos()).toEqual([['p1', 'p2', 'p3'], ['n1']])
      })

      it('mientras imprime no admite otro clic; al terminar se puede volver a reimprimir', async () => {
        conectada = true
        let terminar!: () => void
        impresoraMock.imprimirPedido.mockImplementationOnce(() => new Promise<void>((resolver) => { terminar = resolver }))
        await abrirEnAct([COCINA, BARRA], [MEZCLADO()], [])

        await clic(botonDe('6'))
        await clic(botonDe('6'))
        expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(1)
        expect(botonDe('6')).toHaveAttribute('aria-disabled', 'true')

        await act(async () => { terminar() })
        expect(botonDe('6')).toHaveAttribute('aria-disabled', 'false')
        await clic(botonDe('6'))
        expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(2)
      })

      it('si falla la impresión avisa en la tarjeta, sigue usable y el aviso se limpia al reintentar', async () => {
        conectada = true
        impresoraMock.imprimirPedido.mockRejectedValueOnce(new Error('USB desconectado'))
        await abrirEnAct([COCINA, BARRA], [MEZCLADO(), ped('ot-2', [linea('o1', 'Milanesa', 'c-coc')])], [])

        await clic(botonDe('6'))

        expect(within(tarjeta('6')).getByRole('alert')).toHaveTextContent('No se pudo imprimir. Revisá la impresora.')
        expect(screen.getAllByRole('alert')).toHaveLength(1)
        expect(botonDe('6')).toHaveAttribute('aria-disabled', 'false')
        await clic(botonDe('6'))
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('confirmación de "Listo"', () => {
    const TEXTO_2_COCINA = 'Vas a marcar listo todo el pedido, incluidos 2 ítems de Cocina'
    const listo = (mesa: string) => within(tarjeta(mesa)).getByRole('button', { name: 'Listo' })

    beforeEach(() => {
      pedidosApi.cambiarEstado.mockImplementation(((id: string, estado: string) =>
        Promise.resolve({ ...MIXTO, id, estado })) as never)
    })

    it('con ítems ocultos pide confirmar: muestra el texto y no avanza', async () => {
      await abrirCon([COCINA, BARRA])
      elegir('Barra')

      fireEvent.click(listo('2'))

      expect(within(tarjeta('2')).getByText(TEXTO_2_COCINA)).toBeInTheDocument()
      expect(within(tarjeta('2')).getByRole('group', { name: /Confirmar/ })).toBeInTheDocument()
      expect(within(tarjeta('2')).queryByRole('button', { name: 'Listo' })).not.toBeInTheDocument()
      expect(pedidosApi.cambiarEstado).not.toHaveBeenCalled()
    })

    it('"Confirmar" avanza el pedido a listo', async () => {
      await abrirCon([COCINA, BARRA])
      elegir('Barra')
      fireEvent.click(listo('2'))

      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Confirmar' }))

      await vi.waitFor(() => expect(pedidosApi.cambiarEstado).toHaveBeenCalledWith('mix-2', 'listo'))
      expect(pedidosApi.cambiarEstado).toHaveBeenCalledTimes(1)
    })

    it('"Cancelar" vuelve al botón "Listo" sin avanzar', async () => {
      await abrirCon([COCINA, BARRA])
      elegir('Barra')
      fireEvent.click(listo('2'))

      fireEvent.click(within(tarjeta('2')).getByRole('button', { name: 'Cancelar' }))

      expect(listo('2')).toBeInTheDocument()
      expect(screen.queryByText(TEXTO_2_COCINA)).not.toBeInTheDocument()
      expect(pedidosApi.cambiarEstado).not.toHaveBeenCalled()
    })

    it('en "Todas" avanza directo', async () => {
      await abrirCon([COCINA, BARRA])

      fireEvent.click(listo('2'))

      await vi.waitFor(() => expect(pedidosApi.cambiarEstado).toHaveBeenCalledWith('mix-2', 'listo'))
      expect(screen.queryByText(/Vas a marcar listo/)).not.toBeInTheDocument()
    })

    it('un pedido solo de la comanda elegida avanza directo', async () => {
      await abrirCon([COCINA, BARRA])
      elegir('Cocina')

      fireEvent.click(listo('1'))

      await vi.waitFor(() => expect(pedidosApi.cambiarEstado).toHaveBeenCalledWith('coc-1', 'listo'))
      expect(screen.queryByText(/Vas a marcar listo/)).not.toBeInTheDocument()
    })

    it('si los ocultos están todos eliminados avanza directo', async () => {
      const soloEliminada = pedido('eli-4', 'en_preparacion', {
        items: [linea('d1', 'Cerveza', 'c-bar'), linea('d2', 'Flan', 'c-coc', { cantidadEditada: 0 })],
      })
      await abrirCon([COCINA, BARRA], [soloEliminada], [])
      elegir('Barra')

      fireEvent.click(listo('4'))

      await vi.waitFor(() => expect(pedidosApi.cambiarEstado).toHaveBeenCalledWith('eli-4', 'listo'))
      expect(screen.queryByText(/Vas a marcar listo/)).not.toBeInTheDocument()
    })

    it('cambiar de pestaña con la confirmación abierta la descarta', async () => {
      await abrirCon([COCINA, BARRA])
      elegir('Barra')
      fireEvent.click(listo('2'))
      expect(screen.getByText(TEXTO_2_COCINA)).toBeInTheDocument()

      elegir('Cocina')

      expect(screen.queryByText(/Vas a marcar listo/)).not.toBeInTheDocument()
      expect(listo('2')).toBeInTheDocument()
      elegir('Barra')
      expect(screen.queryByText(/Vas a marcar listo/)).not.toBeInTheDocument()
      expect(pedidosApi.cambiarEstado).not.toHaveBeenCalled()
    })

    it('con ocultos de dos comandas nombra las dos', async () => {
      const POSTRES = { id: 'c-pos', restauranteId: 'rest-1', nombre: 'Postres', activa: true }
      const tres = pedido('tre-5', 'en_preparacion', {
        items: [linea('l1', 'Flan', 'c-pos'), linea('l2', 'Cerveza', 'c-bar'), linea('l3', 'Milanesa', 'c-coc')],
      })
      await abrirCon([COCINA, BARRA, POSTRES], [tres], [])
      elegir('Postres')

      fireEvent.click(listo('5'))

      expect(within(tarjeta('5')).getByText('Vas a marcar listo todo el pedido, incluidos 2 ítems de Barra y Cocina')).toBeInTheDocument()
    })
  })
})
