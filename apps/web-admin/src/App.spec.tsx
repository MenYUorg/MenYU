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
// La consola de ROOT se carga con React.lazy: se reemplaza por una pantalla que dice en qué dirección quedó.
vi.mock('./pages/root/RootRoutes', async () => {
  const { useLocation } = await import('react-router-dom')
  const { createElement } = await import('react')
  function ConsolaFalsa() {
    return createElement('p', null, `Consola de ROOT en ${useLocation().pathname}`)
  }
  return { default: ConsolaFalsa }
})

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

    it('el ROOT no entra: vuelve a su pantalla de inicio, la consola de ROOT', async () => {
      abrir('/admin/marca', 'ROOT')

      expect(await screen.findByText('Consola de ROOT en /root')).toBeInTheDocument()
      expect(screen.queryByText('Pantalla de marca y sucursales')).not.toBeInTheDocument()
    })

    it('el GERENTE no entra: vuelve a su pantalla de inicio', () => {
      abrir('/admin/marca', 'GERENTE')

      expect(screen.queryByText('Pantalla de marca y sucursales')).not.toBeInTheDocument()
      expect(screen.getByText('Pantalla de mesas del gerente')).toBeInTheDocument()
    })
  })
})

describe('rutas de la consola de ROOT (/root)', () => {
  it('el ROOT entra y ve la consola', async () => {
    abrir('/root/marcas', 'ROOT')

    expect(await screen.findByText('Consola de ROOT en /root/marcas')).toBeInTheDocument()
  })

  it('el ROOT que entra por /admin termina en la consola', async () => {
    abrir('/admin', 'ROOT')

    expect(await screen.findByText('Consola de ROOT en /root')).toBeInTheDocument()
  })

  it('el OWNER no entra: vuelve a su dashboard y nunca se monta la consola', () => {
    abrir('/root/marcas', 'OWNER')

    expect(screen.getByText('Pantalla de dashboard')).toBeInTheDocument()
    expect(screen.queryByText(/Consola de ROOT/)).not.toBeInTheDocument()
  })

  it('el GERENTE no entra: vuelve a sus mesas y nunca se monta la consola', () => {
    abrir('/root/historial', 'GERENTE')

    expect(screen.getByText('Pantalla de mesas del gerente')).toBeInTheDocument()
    expect(screen.queryByText(/Consola de ROOT/)).not.toBeInTheDocument()
  })
})
