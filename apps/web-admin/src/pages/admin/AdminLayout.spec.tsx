import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'
import { restaurarPantalla, simularPantalla } from '../../test/pantalla'

let rolActual = 'OWNER'

vi.mock('@menyu/auth', () => ({
  useAuth: () => ({ user: { rol: rolActual, email: 'usuario@menyu.com' }, logout: vi.fn() }),
}))

vi.mock('../../store/contextStore', () => ({
  useContextStore: () => ({
    marcas: [{ id: 'marca-1', nombre: 'Marca Seed' }],
    selectedMarcaId: 'marca-1',
    restaurantes: [{ id: 'rest-1', nombre: 'Restaurante Seed' }],
    selectedRestauranteId: 'rest-1',
    setRestaurante: vi.fn(),
    loadContext: vi.fn(),
  }),
}))

const CELULAR = 360
const ESCRITORIO = 1280

function renderLayout(ruta = '/admin/menu') {
  return render(
    <MemoryRouter
      initialEntries={[ruta]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/admin/menu" element={<div>Contenido del menú</div>} />
          <Route path="/admin/tables" element={<div>Contenido de mesas</div>} />
          <Route path="/admin/marca" element={<div>Contenido de marca</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminLayout', () => {
  beforeEach(() => {
    localStorage.clear()
    rolActual = 'OWNER'
  })

  afterEach(restaurarPantalla)

  describe('en celular', () => {
    it('muestra el menú cerrado y un botón para abrirlo', () => {
      simularPantalla(CELULAR)

      renderLayout()

      expect(screen.getByTestId('sidebar')).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('button', { name: 'Colapsar menú' })).not.toBeInTheDocument()
      expect(screen.getByText('Contenido del menú')).toBeInTheDocument()
    })

    it('el botón hamburguesa abre el drawer con la navegación', async () => {
      simularPantalla(CELULAR)
      const user = userEvent.setup()
      renderLayout()

      await user.click(screen.getByRole('button', { name: 'Abrir menú' }))

      expect(screen.getByTestId('sidebar')).toHaveAttribute('aria-hidden', 'false')
      expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('link', { name: 'Mesas' })).toBeVisible()
    })

    it('el botón de cerrar cierra el drawer', async () => {
      simularPantalla(CELULAR)
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByRole('button', { name: 'Abrir menú' }))

      await user.click(screen.getByRole('button', { name: 'Cerrar menú' }))

      expect(screen.getByTestId('sidebar')).toHaveAttribute('aria-hidden', 'true')
    })

    it('tocar el overlay cierra el drawer', async () => {
      simularPantalla(CELULAR)
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByRole('button', { name: 'Abrir menú' }))

      await user.click(screen.getByTestId('drawer-overlay'))

      expect(screen.getByTestId('sidebar')).toHaveAttribute('aria-hidden', 'true')
    })

    it('Escape cierra el drawer', async () => {
      simularPantalla(CELULAR)
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByRole('button', { name: 'Abrir menú' }))

      await user.keyboard('{Escape}')

      expect(screen.getByTestId('sidebar')).toHaveAttribute('aria-hidden', 'true')
    })

    it('navegar desde el drawer cambia de pantalla y lo cierra', async () => {
      simularPantalla(CELULAR)
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByRole('button', { name: 'Abrir menú' }))

      await user.click(screen.getByRole('link', { name: 'Mesas' }))

      expect(screen.getByText('Contenido de mesas')).toBeInTheDocument()
      expect(screen.getByTestId('sidebar')).toHaveAttribute('aria-hidden', 'true')
    })

    it('si se agranda la pantalla con el drawer abierto, pasa al layout de escritorio', async () => {
      const pantalla = simularPantalla(CELULAR)
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByRole('button', { name: 'Abrir menú' }))

      act(() => pantalla.cambiarAncho(ESCRITORIO))

      expect(screen.queryByRole('button', { name: 'Abrir menú' })).not.toBeInTheDocument()
      expect(screen.queryByTestId('drawer-overlay')).not.toBeInTheDocument()
      expect(screen.getByTestId('sidebar')).toHaveAttribute('aria-hidden', 'false')
    })
  })

  describe('en escritorio', () => {
    it('muestra el sidebar fijo, sin hamburguesa ni overlay', () => {
      simularPantalla(ESCRITORIO)

      renderLayout()

      expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '220px' })
      expect(screen.getByRole('link', { name: 'Mesas' })).toBeVisible()
      expect(screen.queryByRole('button', { name: 'Abrir menú' })).not.toBeInTheDocument()
      expect(screen.queryByTestId('drawer-overlay')).not.toBeInTheDocument()
    })

    it('colapsar el sidebar reduce el ancho y recuerda la elección', async () => {
      simularPantalla(ESCRITORIO)
      const user = userEvent.setup()
      renderLayout()

      await user.click(screen.getByRole('button', { name: 'Colapsar menú' }))

      expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '56px' })
      expect(localStorage.getItem('menyu-sidebar-open')).toBe('false')
    })

    it('respeta el sidebar colapsado que quedó guardado', () => {
      localStorage.setItem('menyu-sidebar-open', 'false')
      simularPantalla(ESCRITORIO)

      renderLayout()

      expect(screen.getByTestId('sidebar')).toHaveStyle({ width: '56px' })
    })

    it('el estado colapsado guardado no afecta al drawer en celular', async () => {
      localStorage.setItem('menyu-sidebar-open', 'false')
      simularPantalla(CELULAR)
      const user = userEvent.setup()
      renderLayout()

      await user.click(screen.getByRole('button', { name: 'Abrir menú' }))

      expect(screen.getByRole('link', { name: 'Mesas' })).toBeVisible()
    })
  })

  describe('Marca y sucursales (logo y dirección)', () => {
    it('el OWNER ve el acceso en el menú y lo puede abrir', async () => {
      simularPantalla(ESCRITORIO)
      const user = userEvent.setup()
      renderLayout()

      const enlace = screen.getByRole('link', { name: 'Marca y sucursales' })
      expect(enlace).toHaveAttribute('href', '/admin/marca')

      await user.click(enlace)

      expect(screen.getByText('Contenido de marca')).toBeInTheDocument()
    })

    it('el título de la pantalla es "Marca y sucursales"', () => {
      simularPantalla(ESCRITORIO)

      renderLayout('/admin/marca')

      expect(screen.getByRole('heading', { name: 'Marca y sucursales' })).toBeInTheDocument()
    })

    it('también se llega desde el menú del celular', async () => {
      simularPantalla(CELULAR)
      const user = userEvent.setup()
      renderLayout()
      await user.click(screen.getByRole('button', { name: 'Abrir menú' }))

      await user.click(screen.getByRole('link', { name: 'Marca y sucursales' }))

      expect(screen.getByText('Contenido de marca')).toBeInTheDocument()
    })

    it.each(['GERENTE', 'ROOT'])('el %s no ve el acceso', (rol) => {
      rolActual = rol
      simularPantalla(ESCRITORIO)

      renderLayout()

      expect(screen.queryByRole('link', { name: 'Marca y sucursales' })).not.toBeInTheDocument()
    })
  })
})
