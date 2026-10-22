import { render, screen } from '@testing-library/react'
import type { PerfilUsuario } from '@menyu/types'
import {
  membresiaDeMarca,
  membresiaDeRestaurante,
  perfilDeCocina,
  perfilDeGerente,
  perfilDeJefeSalon,
  perfilDeMozo,
  perfilDeOwner,
  perfilDePrueba,
  reiniciarSesionDePrueba,
  sesionDePrueba,
} from './test/authClient'
import * as socketService from './services/socket'
import { useContextoStore } from './store/contextoStore'
import { App } from './App'

// La sesión se simula: acá se prueba a qué vista llega cada rol, no el login (RequireAuth tiene sus tests en el paquete).
vi.mock('@menyu/auth-client', async () => (await import('./test/authClient')).moduloSimulado())
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))

// Se reemplazan las pantallas a las que puede terminar llegando cada rol: acá importa el ruteo, no su contenido.
vi.mock('./pages/cocina/CocinaPage', () => ({ CocinaPage: () => 'Pantalla de cocina' }))
vi.mock('./pages/mozo/MozoPanel', () => ({ MozoPanel: () => 'Panel del mozo' }))
vi.mock('./pages/mozo/MesasPage', () => ({ MesasPage: () => 'Pantalla de mesas' }))
vi.mock('./pages/mozo/PagosMozo', () => ({ PagosMozo: () => 'Pantalla de cobros' }))
vi.mock('./pages/mozo/TomaPedidosPage', () => ({ TomaPedidosPage: () => 'Pantalla de toma de pedidos' }))
vi.mock('./pages/mozo/PedidosPage', () => ({ PedidosPage: () => 'Pantalla de pedidos' }))
vi.mock('./pages/mozo/HistorialPage', () => ({ HistorialPage: () => 'Pantalla de historial' }))
vi.mock('./components/MozoNotifications', () => ({ MozoNotifications: () => null }))
// El selector tiene su propio spec: acá importa si se llega a él, no qué muestra.
vi.mock('./pages/selector/SelectorPage', () => ({ SelectorPage: () => 'Pantalla del selector' }))
vi.mock('./services/socket', () => ({ cerrarSesion: vi.fn(), disconnect: vi.fn() }))

beforeEach(() => {
  reiniciarSesionDePrueba()
  localStorage.clear()
  useContextoStore.setState({ restaurantes: [], restauranteId: null, perfil: null })
})

function abrir(ruta: string, perfil: PerfilUsuario) {
  sesionDePrueba.perfil = perfil
  window.history.pushState({}, '', ruta)
  return render(<App />)
}

describe('a dónde entra cada rol', () => {
  it('el MOZO va derecho al panel del mozo', async () => {
    abrir('/', perfilDeMozo())

    expect(await screen.findByText('Panel del mozo')).toBeInTheDocument()
  })

  it('el JEFE_SALON también va al panel del mozo', async () => {
    abrir('/', perfilDeJefeSalon())

    expect(await screen.findByText('Panel del mozo')).toBeInTheDocument()
  })

  it('COCINA va derecho a la cocina', async () => {
    abrir('/', perfilDeCocina())

    expect(await screen.findByText('Pantalla de cocina')).toBeInTheDocument()
  })

  it.each([
    ['el OWNER', perfilDeOwner()],
    ['el GERENTE', perfilDeGerente()],
  ])('%s ve las dos vistas, así que pasa por el selector', async (_quien, perfil) => {
    abrir('/', perfil)

    expect(await screen.findByText('Pantalla del selector')).toBeInTheDocument()
  })

  it('una dirección que no existe lleva a la vista del rol, no a un login (web-staff ya no tiene uno)', async () => {
    abrir('/cualquier-cosa', perfilDeMozo())

    expect(await screen.findByText('Panel del mozo')).toBeInTheDocument()
  })

  it('la preferencia de la URL elige el restaurante antes de que la redirección la borre', async () => {
    const perfil = perfilDePrueba({
      membresias: [
        membresiaDeRestaurante('MOZO', 'rest-1'),
        membresiaDeRestaurante('MOZO', 'rest-2'),
      ],
    })

    abrir('/?restauranteId=rest-2', perfil)

    expect(await screen.findByText('Panel del mozo')).toBeInTheDocument()
    expect(useContextoStore.getState().restauranteId).toBe('rest-2')
  })
})

describe('los guards de cada vista', () => {
  it('COCINA no entra a las rutas del mozo: vuelve a la cocina', async () => {
    abrir('/mozo/mesas', perfilDeCocina())

    expect(await screen.findByText('Pantalla de cocina')).toBeInTheDocument()
    expect(screen.queryByText('Pantalla de mesas')).not.toBeInTheDocument()
  })

  it('COCINA tampoco entra a los cobros', async () => {
    abrir('/mozo/pagos', perfilDeCocina())

    expect(await screen.findByText('Pantalla de cocina')).toBeInTheDocument()
    expect(screen.queryByText('Pantalla de cobros')).not.toBeInTheDocument()
  })

  it('el MOZO no entra a la cocina: vuelve a su panel', async () => {
    abrir('/cocina', perfilDeMozo())

    expect(await screen.findByText('Panel del mozo')).toBeInTheDocument()
    expect(screen.queryByText('Pantalla de cocina')).not.toBeInTheDocument()
  })

  it('el GERENTE entra a las dos vistas', async () => {
    abrir('/cocina', perfilDeGerente())
    expect(await screen.findByText('Pantalla de cocina')).toBeInTheDocument()

    abrir('/mozo/pedidos', perfilDeGerente())
    expect(await screen.findByText('Pantalla de pedidos')).toBeInTheDocument()
  })

  it('sin restaurante elegido, una ruta de mozo lleva al selector', async () => {
    const perfil = perfilDePrueba({
      membresias: [
        membresiaDeRestaurante('MOZO', 'rest-1'),
        membresiaDeRestaurante('MOZO', 'rest-2'),
      ],
    })

    abrir('/mozo/mesas', perfil)

    expect(await screen.findByText('Pantalla del selector')).toBeInTheDocument()
    expect(screen.queryByText('Pantalla de mesas')).not.toBeInTheDocument()
  })
})

describe('quien no trabaja en ningún restaurante disponible', () => {
  it('ve el aviso en lugar de las pantallas y puede cerrar sesión', async () => {
    const ownerSinSucursales = perfilDePrueba({ membresias: [membresiaDeMarca('marca-1', [])] })

    abrir('/mozo', ownerSinSucursales)

    expect(await screen.findByText('Todavía no tenés un restaurante asignado')).toBeInTheDocument()
    expect(screen.queryByText('Panel del mozo')).not.toBeInTheDocument()

    screen.getByRole('button', { name: 'Cerrar sesión' }).click()
    // `cerrarSesion` desconecta el socket y recién después llama al logout de @menyu/auth-client.
    expect(socketService.cerrarSesion).toHaveBeenCalledTimes(1)
  })
})
