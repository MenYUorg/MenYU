import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../services/api'
import { paginaDeHistorial } from '../../test/root'
import { restaurarPantalla, simularPantalla } from '../../test/pantalla'
import { logoutSimulado, perfilDeRoot, reiniciarSesionDePrueba, sesionDePrueba } from '../../test/authClient'
import RootRoutes from './RootRoutes'

vi.mock('@menyu/auth-client', async () => (await import('../../test/authClient')).moduloSimulado())
vi.mock('../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/api')>()
  const { apiFalsa } = await import('../../test/root')
  return { ...original, api: apiFalsa }
})

function renderConsola(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/* Igual que en App.tsx: la consola cuelga de /root/*, y sus rutas se leen desde ahí. */}
      <Routes>
        <Route path="/root/*" element={<RootRoutes />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  reiniciarSesionDePrueba()
  sesionDePrueba.perfil = perfilDeRoot()
  simularPantalla(1280)
  vi.mocked(api.root.marcas.listar).mockResolvedValue([])
  vi.mocked(api.root.historial.listar).mockResolvedValue(paginaDeHistorial([]))
  vi.mocked(api.root.cuentas.listar).mockResolvedValue([])
})

afterEach(restaurarPantalla)

describe('RootRoutes', () => {
  it('/root lleva a Marcas', async () => {
    renderConsola('/root')

    expect(await screen.findByText('Todavía no hay marcas activas')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Marcas', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Marcas y restaurantes')).toBeInTheDocument()
  })

  it('/root/historial muestra el historial con su título', async () => {
    renderConsola('/root/historial')

    expect(await screen.findByText('Todavía no hay acciones registradas')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Historial', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Todo lo que hizo cada ROOT')).toBeInTheDocument()
  })

  it('una dirección que no existe vuelve a Marcas', async () => {
    renderConsola('/root/algo-que-no-existe')

    expect(await screen.findByText('Todavía no hay marcas activas')).toBeInTheDocument()
  })

  it('el menú tiene solo lo que ROOT puede usar hoy, en sus dos grupos', async () => {
    renderConsola('/root/marcas')
    await screen.findByText('Todavía no hay marcas activas')

    const menu = within(screen.getByTestId('sidebar'))
    expect(menu.getByText('ADMINISTRACIÓN')).toBeInTheDocument()
    expect(menu.getByText('SISTEMA')).toBeInTheDocument()
    expect(menu.getByRole('link', { name: 'Marcas' })).toHaveAttribute('href', '/root/marcas')
    expect(menu.getByRole('link', { name: 'Historial' })).toHaveAttribute('href', '/root/historial')
    expect(menu.getAllByRole('link')).toHaveLength(2)
  })

  it('no trae nada del panel del dueño: ni menú, ni mesas, ni pedidos, ni selector de restaurante', async () => {
    renderConsola('/root/marcas')
    await screen.findByText('Todavía no hay marcas activas')

    for (const nombre of ['Menú', 'Mesas', 'Mozos', 'Pedidos', 'Pagos', 'Reportes', 'Dashboard']) {
      expect(screen.queryByRole('link', { name: nombre })).not.toBeInTheDocument()
    }
    expect(screen.getByText('Cuenta ROOT · sin acceso a los datos de las marcas')).toBeInTheDocument()
  })

  it('muestra la cuenta y cierra la sesión', async () => {
    renderConsola('/root/marcas')
    await screen.findByText('Todavía no hay marcas activas')

    expect(screen.getAllByText('root@menyu.com').length).toBeGreaterThan(0)
    await userEvent.click(screen.getAllByRole('button', { name: /Cerrar sesión/ })[0])

    expect(logoutSimulado).toHaveBeenCalledTimes(1)
  })

  it('navegar por el menú cambia de pantalla', async () => {
    renderConsola('/root/marcas')
    await screen.findByText('Todavía no hay marcas activas')

    await userEvent.click(within(screen.getByTestId('sidebar')).getByRole('link', { name: 'Historial' }))

    expect(await screen.findByText('Todavía no hay acciones registradas')).toBeInTheDocument()
  })

  it('en celular el menú arranca cerrado', async () => {
    simularPantalla(360)
    renderConsola('/root/marcas')
    await screen.findByText('Todavía no hay marcas activas')

    expect(screen.getByTestId('sidebar')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toBeInTheDocument()
  })
})
