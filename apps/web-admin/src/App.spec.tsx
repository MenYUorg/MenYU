import { render, screen } from '@testing-library/react'
import type { PerfilUsuario } from '@menyu/types'
import {
  membresiaDeMarca,
  membresiaDeRestaurante,
  perfilDePrueba,
  reiniciarSesionDePrueba,
  sesionDePrueba,
} from './test/authClient'
import { App } from './App'

// La sesión se simula: acá se prueba a qué pantalla llega cada rol, no el login (RequireAuth tiene sus tests en el paquete).
vi.mock('@menyu/auth-client', async () => (await import('./test/authClient')).moduloSimulado())

// Se reemplazan solo el layout y las pantallas a las que puede terminar llegando cada rol.
vi.mock('./pages/admin/AdminLayout', async () => {
  const { Outlet } = await import('react-router-dom')
  const { createElement } = await import('react')
  return { AdminLayout: () => createElement(Outlet) }
})
vi.mock('./pages/admin/marca/MarcaPage', () => ({ MarcaPage: () => 'Pantalla de marca y sucursales' }))
vi.mock('./pages/admin/dashboard/DashboardPage', () => ({ DashboardPage: () => 'Pantalla de dashboard' }))
vi.mock('./pages/admin/gerente/GerenceMesasPage', () => ({
  GerenceMesasPage: () => 'Pantalla de mesas del gerente',
}))
vi.mock('./pages/admin/tables/TablesPage', () => ({ TablesPage: () => 'Pantalla de mesas del dueño' }))
// La consola de ROOT se carga con React.lazy: se reemplaza por una pantalla que dice en qué dirección quedó.
vi.mock('./pages/root/RootRoutes', async () => {
  const { useLocation } = await import('react-router-dom')
  const { createElement } = await import('react')
  function ConsolaFalsa() {
    return createElement('p', null, `Consola de ROOT en ${useLocation().pathname}`)
  }
  return { default: ConsolaFalsa }
})

const OWNER = perfilDePrueba({ email: 'owner@menyu.com', membresias: [membresiaDeMarca('marca-1')] })
const GERENTE = perfilDePrueba({ email: 'gerente@menyu.com', membresias: [membresiaDeRestaurante('GERENTE', 'rest-1')] })
const ROOT = perfilDePrueba({ email: 'root@menyu.com', esRoot: true })

beforeEach(reiniciarSesionDePrueba)

function abrir(ruta: string, perfil: PerfilUsuario) {
  sesionDePrueba.perfil = perfil
  window.history.pushState({}, '', ruta)
  return render(<App />)
}

describe('rutas del panel de administración', () => {
  describe('/admin/marca (logo y dirección)', () => {
    it('el OWNER entra', () => {
      abrir('/admin/marca', OWNER)

      expect(screen.getByText('Pantalla de marca y sucursales')).toBeInTheDocument()
    })

    it('el ROOT no entra: vuelve a su pantalla de inicio, la consola de ROOT', async () => {
      abrir('/admin/marca', ROOT)

      expect(await screen.findByText('Consola de ROOT en /root')).toBeInTheDocument()
      expect(screen.queryByText('Pantalla de marca y sucursales')).not.toBeInTheDocument()
    })

    it('el GERENTE no entra: vuelve a su pantalla de inicio', () => {
      abrir('/admin/marca', GERENTE)

      expect(screen.queryByText('Pantalla de marca y sucursales')).not.toBeInTheDocument()
      expect(screen.getByText('Pantalla de mesas del gerente')).toBeInTheDocument()
    })
  })

  it('una dirección que no existe lleva al panel, no al login (web-admin ya no tiene login propio)', () => {
    abrir('/cualquier-cosa', OWNER)

    expect(screen.getByText('Pantalla de dashboard')).toBeInTheDocument()
  })

  it('las mesas las atiende la pantalla del rol: el OWNER ve la suya y el GERENTE la del gerente', () => {
    abrir('/admin/tables', OWNER)
    expect(screen.getByText('Pantalla de mesas del dueño')).toBeInTheDocument()

    abrir('/admin/tables', GERENTE)
    expect(screen.getByText('Pantalla de mesas del gerente')).toBeInTheDocument()
  })
})

describe('rutas de la consola de ROOT (/root)', () => {
  it('el ROOT entra y ve la consola', async () => {
    abrir('/root/marcas', ROOT)

    expect(await screen.findByText('Consola de ROOT en /root/marcas')).toBeInTheDocument()
  })

  it('el ROOT que entra por /admin termina en la consola', async () => {
    abrir('/admin', ROOT)

    expect(await screen.findByText('Consola de ROOT en /root')).toBeInTheDocument()
  })

  it('el OWNER no entra: vuelve a su dashboard y nunca se monta la consola', () => {
    abrir('/root/marcas', OWNER)

    expect(screen.getByText('Pantalla de dashboard')).toBeInTheDocument()
    expect(screen.queryByText(/Consola de ROOT/)).not.toBeInTheDocument()
  })

  it('el GERENTE no entra: vuelve a sus mesas y nunca se monta la consola', () => {
    abrir('/root/historial', GERENTE)

    expect(screen.getByText('Pantalla de mesas del gerente')).toBeInTheDocument()
    expect(screen.queryByText(/Consola de ROOT/)).not.toBeInTheDocument()
  })

  it('una cuenta ROOT que además es dueña de una marca entra a las dos partes', async () => {
    const rootQueEsDuena = perfilDePrueba({
      email: 'root-y-duena@menyu.com',
      esRoot: true,
      membresias: [membresiaDeMarca('marca-1')],
    })

    abrir('/admin/marca', rootQueEsDuena)
    expect(screen.getByText('Pantalla de marca y sucursales')).toBeInTheDocument()

    abrir('/root/marcas', rootQueEsDuena)
    expect(await screen.findByText('Consola de ROOT en /root/marcas')).toBeInTheDocument()
  })
})
