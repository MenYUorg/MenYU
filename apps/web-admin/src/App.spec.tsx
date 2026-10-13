import { render, screen } from '@testing-library/react'
import { App } from './App'

let usuario: { rol: string; email: string } | null = null

// La sesión se simula: acá se prueba a qué pantalla llega cada rol, no el login.
vi.mock('@menyu/auth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@menyu/auth')>()
  const { Outlet } = await import('react-router-dom')
  const { createElement } = await import('react')
  return {
    ...original,
    useAuth: () => ({ user: usuario, logout: vi.fn() }),
    ProtectedRoute: () => createElement(Outlet),
  }
})

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

function abrir(ruta: string, rol: string) {
  usuario = { rol, email: `${rol.toLowerCase()}@menyu.com` }
  window.history.pushState({}, '', ruta)
  return render(<App />)
}

describe('rutas del panel de administración', () => {
  describe('/admin/marca (logo y dirección)', () => {
    it('el OWNER entra', () => {
      abrir('/admin/marca', 'OWNER')

      expect(screen.getByText('Pantalla de marca y sucursales')).toBeInTheDocument()
    })

    it('el ROOT no entra: vuelve a su pantalla de inicio', () => {
      abrir('/admin/marca', 'ROOT')

      expect(screen.queryByText('Pantalla de marca y sucursales')).not.toBeInTheDocument()
      expect(screen.getByText('Pantalla de dashboard')).toBeInTheDocument()
    })

    it('el GERENTE no entra: vuelve a su pantalla de inicio', () => {
      abrir('/admin/marca', 'GERENTE')

      expect(screen.queryByText('Pantalla de marca y sucursales')).not.toBeInTheDocument()
      expect(screen.getByText('Pantalla de mesas del gerente')).toBeInTheDocument()
    })
  })
})
