import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Pedido } from '@menyu/types'
import { api, type PedidoRico } from '../../services/api'
import * as impresora from '../../services/impresora'
import * as socketService from '../../services/socket'
import { membresiaDeRestaurante, perfilDeCocina, perfilDePrueba, reiniciarSesionDePrueba } from '../../test/authClient'
import { montarContexto, reiniciarContexto } from '../../test/contexto'
import { CocinaPage } from './CocinaPage'

let conectada = false

vi.mock('@menyu/auth-client', async () => (await import('../../test/authClient')).moduloSimulado())
vi.mock('../../services/api', () => ({ api: { pedidos: { getByRestaurante: vi.fn(), cambiarEstado: vi.fn() } } }))
vi.mock('../../services/impresora', () => ({
  conectarImpresora: vi.fn(),
  impresoraConectada: vi.fn(() => conectada),
  imprimirPedido: vi.fn(() => Promise.resolve()),
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
      { id: `${id}-1`, itemId: 'a', cantidad: 2, cantidadEditada: null, precioUnitario: 1000, notas: 'bien cocida', item: { nombre: 'Milanesa' }, mods: [mod('QUITAR', 'Cebolla'), mod('AGREGAR', 'Queso', 2), mod('AGREGAR', 'Huevo'), mod('QUITAR')] },
      { id: `${id}-2`, itemId: 'b', cantidad: 1, cantidadEditada: null, precioUnitario: 500, notas: '  ', item: { nombre: 'Agua' }, mods: [] },
    ],
    ...extra,
  }
}

const EN_PREP = pedido('prep-1', 'en_preparacion')
const EDITADO = pedido('edit-2', 'en_preparacion', {
  createdAt: hace(25),
  items: [
    { id: 'e1', itemId: 'a', cantidad: 3, cantidadEditada: 1, precioUnitario: 500, notas: null, item: { nombre: 'Empanada' }, mods: [] },
    { id: 'e2', itemId: 'b', cantidad: 1, cantidadEditada: 0, precioUnitario: 800, notas: 'fría', item: { nombre: 'Gaseosa' }, mods: [mod('AGREGAR', 'Limón')] },
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
      expect(impresoraMock.imprimirPedido).toHaveBeenCalledTimes(2)
      expect(tonos.slice(0, 2)).toEqual([523, 659])
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
