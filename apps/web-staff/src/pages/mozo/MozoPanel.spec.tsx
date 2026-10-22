import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Pedido } from '@menyu/types'
import { api, type PedidoRico, type WaiterCallRico } from '../../services/api'
import * as socketService from '../../services/socket'
import type { Rol } from '@menyu/types'
import { membresiaDeMarca, perfilDePrueba, reiniciarSesionDePrueba } from '../../test/authClient'
import { montarContexto, reiniciarContexto } from '../../test/contexto'
import { MozoPanel } from './MozoPanel'

/** El perfil de prueba: un restaurante llamado "La Parrilla" en la marca "Grupo Sabores". */
const perfilEnLaParrilla = (rol: Rol, nombre = 'Ana Pérez', email = 'ana@menyu.com') =>
  perfilDePrueba({
    nombre,
    email,
    membresias: rol === 'OWNER'
      ? [membresiaDeMarca('marca-1', [{ id: 'rest-1', nombre: 'La Parrilla' }], 'Grupo Sabores')]
      : [{
          id: `mem-${rol}`,
          rol,
          marca: null,
          restaurante: { id: 'rest-1', nombre: 'La Parrilla', marcaId: 'marca-1', marca: { id: 'marca-1', nombre: 'Grupo Sabores' } },
        }],
  })

vi.mock('@menyu/auth-client', async () => (await import('../../test/authClient')).moduloSimulado())
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))

vi.mock('../../services/api', () => ({
  api: {
    waiterCalls: { getAll: vi.fn(), atender: vi.fn() },
    pedidos: { getByRestaurante: vi.fn(), cambiarEstado: vi.fn() },
  },
}))

const alLlamar: { fn?: (d: { llamadoId: string; sesionId: string; mesaNumero: string; motivo: string }) => void } = {}
const alActualizar: { fn?: (p: Pedido) => void } = {}
const desuscribir = { llamado: vi.fn(), pedido: vi.fn() }
vi.mock('../../services/socket', () => ({
  joinRestauranteComoMozo: vi.fn(),
  cerrarSesion: vi.fn(),
  onMozoCalled: vi.fn((fn) => { alLlamar.fn = fn; return desuscribir.llamado }),
  onPedidoActualizado: vi.fn((fn) => { alActualizar.fn = fn; return desuscribir.pedido }),
}))

const llamadosApi = vi.mocked(api.waiterCalls)
const pedidosApi = vi.mocked(api.pedidos)

const hace = (minutos: number) => new Date(Date.now() - minutos * 60000).toISOString()

const llamado = (id: string, mesa: string, motivo: string | null, minutos: number): WaiterCallRico => ({
  id, sesionId: `ses-${mesa}`, mozoId: null, estado: 'pendiente', motivo, createdAt: hace(minutos), sesion: { mesa: { numero: mesa } },
})

const pedidoListo = (id: string, mesa: string, minutos: number): PedidoRico => ({
  id,
  sesionId: `ses-${mesa}`,
  mesaId: `m-${mesa}`,
  estado: 'listo',
  createdAt: hace(minutos + 10),
  updatedAt: hace(minutos),
  mesa: { numero: mesa },
  items: [
    { id: `${id}-1`, cantidad: 2, cantidadEditada: 1, item: { nombre: 'Milanesa' } },
    { id: `${id}-2`, cantidad: 1, cantidadEditada: null, item: { nombre: 'Agua' } },
  ] as unknown as PedidoRico['items'],
})

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/mozo']}>
      <Routes>
        <Route path="/mozo" element={<MozoPanel />} />
        <Route path="/mozo/:pantalla" element={<p>pantalla de destino</p>} />
        <Route path="*" element={<p>fuera del panel</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const tarjeta = (mesa: string) => screen.getByText(`Mesa ${mesa}`).parentElement!.parentElement as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  reiniciarSesionDePrueba()
  reiniciarContexto()
  montarContexto(perfilEnLaParrilla('MOZO'))
  llamadosApi.getAll.mockResolvedValue([])
  pedidosApi.getByRestaurante.mockResolvedValue([])
})

describe('MozoPanel', () => {
  describe('encabezado', () => {
    it('saluda al mozo, muestra sus iniciales, la marca y el restaurante', async () => {
      abrir()

      expect(screen.getByText('Hola, Ana Pérez 👋')).toBeInTheDocument()
      expect(screen.getByText('AP')).toBeInTheDocument()
      expect(screen.getByText('GS')).toBeInTheDocument()
      expect(screen.getByText('Grupo Sabores')).toBeInTheDocument()
      expect(screen.getByText('La Parrilla')).toBeInTheDocument()
      expect(await screen.findByText('Sin alertas pendientes')).toBeInTheDocument()
    })

    it('sin nombre usa el email; sin restaurante elegido, la marca y el restaurante quedan en guiones', () => {
      reiniciarContexto()
      montarContexto(perfilEnLaParrilla('MOZO', '', 'juan.gomez@menyu.com'))
      reiniciarContexto()

      abrir()

      expect(screen.getByText('Hola, juan.gomez@menyu.com 👋')).toBeInTheDocument()
      expect(screen.getByText('JG')).toBeInTheDocument()
      expect(screen.getByText('M')).toBeInTheDocument()
      expect(screen.getAllByText('—')).toHaveLength(2)
    })

    it.each([
      ['MOZO', 'Mozo'],
      ['JEFE_SALON', 'Jefe de salón'],
      ['GERENTE', 'Gerente'],
      ['OWNER', 'Dueño'],
    ] as const)('el rol del encabezado sale de la membresía: %s muestra "%s"', (rol, etiqueta) => {
      reiniciarContexto()
      montarContexto(perfilEnLaParrilla(rol))

      abrir()

      expect(screen.getByText(etiqueta)).toBeInTheDocument()
    })

    it('consulta el restaurante del contexto, que sale de la membresía', () => {
      abrir()

      expect(llamadosApi.getAll).toHaveBeenCalledWith('rest-1')
    })

    it('con un solo restaurante no ofrece cambiarlo', () => {
      abrir()

      expect(screen.queryByRole('button', { name: 'Cambiar de restaurante' })).not.toBeInTheDocument()
    })

    it('con varios, "Cambiar de restaurante" vuelve al selector', () => {
      reiniciarContexto()
      montarContexto(perfilDePrueba({
        nombre: 'Ana Pérez',
        membresias: [
          membresiaDeMarca('marca-1', [{ id: 'rest-1', nombre: 'La Parrilla' }, { id: 'rest-2', nombre: 'Palermo' }], 'Grupo Sabores'),
        ],
      }), 'rest-1')
      abrir()

      fireEvent.click(screen.getByRole('button', { name: 'Cambiar de restaurante' }))

      expect(screen.getByText('fuera del panel')).toBeInTheDocument()
    })

    it('"Salir" cierra la sesión', () => {
      abrir()

      fireEvent.click(screen.getByRole('button', { name: /Salir/ }))

      // `cerrarSesion` desconecta el socket y recién después llama al logout de @menyu/auth-client.
      expect(socketService.cerrarSesion).toHaveBeenCalledTimes(1)
    })

    it('sin restaurante no consulta nada ni se une al socket', () => {
      reiniciarContexto()

      abrir()

      expect(llamadosApi.getAll).not.toHaveBeenCalled()
      expect(pedidosApi.getByRestaurante).not.toHaveBeenCalled()
      expect(socketService.joinRestauranteComoMozo).not.toHaveBeenCalled()
    })
  })

  describe('alertas', () => {
    it('lista los llamados y los pedidos listos del restaurante del mozo', async () => {
      llamadosApi.getAll.mockResolvedValue([llamado('ll-1', '4', 'pedir_cuenta', 0), llamado('ll-2', '7', 'general', 75)])
      pedidosApi.getByRestaurante.mockResolvedValue([pedidoListo('p-1', '9', 12)])

      abrir()

      expect(await screen.findByText('Tenés alertas pendientes')).toBeInTheDocument()
      expect(llamadosApi.getAll).toHaveBeenCalledWith('rest-1')
      expect(pedidosApi.getByRestaurante).toHaveBeenCalledWith('rest-1', { estado: 'listo' })
      expect(screen.getByText('Llamados pendientes')).toBeInTheDocument()
      expect(screen.getByText('🧾 Pedir cuenta · ahora')).toBeInTheDocument()
      expect(screen.getByText('🔔 Asistencia · 1h 15m')).toBeInTheDocument()
      expect(screen.getByText('Listos para entregar')).toBeInTheDocument()
      expect(screen.getByText('1× Milanesa')).toBeInTheDocument()
      expect(screen.getByText('1× Agua')).toBeInTheDocument()
      expect(screen.getByText('Listo hace 12 min')).toBeInTheDocument()
    })

    it('si las consultas fallan sigue sin alertas', async () => {
      llamadosApi.getAll.mockRejectedValue(new Error('caído'))
      pedidosApi.getByRestaurante.mockRejectedValue(new Error('caído'))

      abrir()

      await vi.waitFor(() => expect(pedidosApi.getByRestaurante).toHaveBeenCalled())
      expect(screen.getByText('Sin alertas pendientes')).toBeInTheDocument()
    })

    it('"Atendido" marca el llamado y lo saca (también si el servidor falla)', async () => {
      llamadosApi.getAll.mockResolvedValue([llamado('ll-1', '4', null, 3), llamado('ll-2', '7', null, 5)])
      llamadosApi.atender.mockResolvedValueOnce({} as never).mockRejectedValueOnce(new Error('caído'))
      abrir()
      await screen.findByText('Mesa 4')

      fireEvent.click(within(tarjeta('4')).getByRole('button', { name: /Atendido/ }))
      await vi.waitFor(() => expect(screen.queryByText('Mesa 4')).not.toBeInTheDocument())
      expect(llamadosApi.atender).toHaveBeenCalledWith('ll-1')

      fireEvent.click(within(tarjeta('7')).getByRole('button', { name: /Atendido/ }))
      expect(within(tarjeta('7')).getByRole('button', { name: /Guardando…/ })).toBeDisabled()
      expect(await screen.findByText('Sin alertas pendientes')).toBeInTheDocument()
    })

    it.each([
      ['MOZO', true],
      ['JEFE_SALON', true],
      ['GERENTE', false],
      ['OWNER', false],
    ] as const)('%s ve el botón "Atendido": %s', async (rol, loVe) => {
      reiniciarContexto()
      montarContexto(perfilEnLaParrilla(rol))
      llamadosApi.getAll.mockResolvedValue([llamado('ll-1', '4', null, 3)])
      abrir()
      await screen.findByText('Mesa 4')

      // Atender necesita el `Mozo` de la cuenta: a un OWNER o GERENTE el backend le responde 403 (matriz de la 4.3).
      const boton = within(tarjeta('4')).queryByRole('button', { name: /Atendido/ })
      expect(boton === null).toBe(!loVe)
    })

    it('la cuenta que es dueña y además mozo del restaurante puede atender', async () => {
      reiniciarContexto()
      montarContexto(perfilDePrueba({
        nombre: 'Varias',
        membresias: [
          membresiaDeMarca('marca-1', [{ id: 'rest-1', nombre: 'La Parrilla' }], 'Grupo Sabores'),
          { id: 'mem-mozo', rol: 'MOZO', marca: null, restaurante: { id: 'rest-1', nombre: 'La Parrilla', marcaId: 'marca-1', marca: { id: 'marca-1', nombre: 'Grupo Sabores' } } },
        ],
      }))
      llamadosApi.getAll.mockResolvedValue([llamado('ll-1', '4', null, 3)])
      abrir()
      await screen.findByText('Mesa 4')

      expect(within(tarjeta('4')).getByRole('button', { name: /Atendido/ })).toBeInTheDocument()
    })

    it('"Entregado" pasa el pedido a entregado y lo saca (también si el servidor falla)', async () => {
      pedidosApi.getByRestaurante.mockResolvedValue([pedidoListo('p-1', '9', 1), pedidoListo('p-2', '8', 2)])
      pedidosApi.cambiarEstado.mockResolvedValueOnce({} as never).mockRejectedValueOnce(new Error('caído'))
      abrir()
      await screen.findByText('Mesa 9')

      fireEvent.click(within(tarjeta('9')).getByRole('button', { name: /Entregado/ }))
      await vi.waitFor(() => expect(screen.queryByText('Mesa 9')).not.toBeInTheDocument())
      expect(pedidosApi.cambiarEstado).toHaveBeenCalledWith('p-1', 'entregado')

      fireEvent.click(within(tarjeta('8')).getByRole('button', { name: /Entregado/ }))
      expect(await screen.findByText('Sin alertas pendientes')).toBeInTheDocument()
    })
  })

  describe('tiempo real', () => {
    it('se une como mozo y suma los llamados nuevos', async () => {
      abrir()
      await screen.findByText('Sin alertas pendientes')

      expect(socketService.joinRestauranteComoMozo).toHaveBeenCalledWith('rest-1')
      act(() => alLlamar.fn!({ llamadoId: 'll-9', sesionId: 'ses-3', mesaNumero: '3', motivo: 'pedir_cuenta' }))

      expect(screen.getByText('Mesa 3')).toBeInTheDocument()
      expect(screen.getByText('🧾 Pedir cuenta · ahora')).toBeInTheDocument()
    })

    it('un pedido que pasa a listo aparece una sola vez; si cambia a otro estado se va', async () => {
      abrir()
      await screen.findByText('Sin alertas pendientes')
      const listo = { ...pedidoListo('p-5', '5', 0), estado: 'listo' } as unknown as Pedido

      act(() => alActualizar.fn!(listo))
      act(() => alActualizar.fn!(listo))
      expect(screen.getAllByText('Mesa 5')).toHaveLength(1)

      act(() => alActualizar.fn!({ ...listo, estado: 'entregado' } as Pedido))
      expect(screen.queryByText('Mesa 5')).not.toBeInTheDocument()
    })

    it('al salir de la pantalla se desuscribe', async () => {
      const { unmount } = abrir()
      await screen.findByText('Sin alertas pendientes')

      unmount()

      expect(desuscribir.llamado).toHaveBeenCalled()
      expect(desuscribir.pedido).toHaveBeenCalled()
    })
  })

  it.each([
    ['Hacer pedido'],
    ['Pedidos'],
    ['Pagos'],
    ['Mesas'],
    ['Historial'],
  ])('el acceso rápido "%s" navega a su pantalla', async (titulo) => {
    abrir()
    await screen.findByText('Sin alertas pendientes')

    const tarjetaNav = screen.getByText(titulo).closest('div[style*="cursor: pointer"]') as HTMLElement
    fireEvent.mouseEnter(tarjetaNav)
    fireEvent.mouseLeave(tarjetaNav)
    fireEvent.click(tarjetaNav)

    expect(screen.getByText('pantalla de destino')).toBeInTheDocument()
  })
})
