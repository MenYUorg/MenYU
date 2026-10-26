import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { compartirLaSesionDeWebAuth, cuentaDePrueba, sesionDeSupabase, signOutSimulado } from '../test/authClient'
import { irA } from '../utils/navegar'
import { AppHeader } from './AppHeader'

vi.mock('../utils/navegar', () => ({ irA: vi.fn() }))

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <p>ruta: {pathname}{search}</p>
}

function renderHeader(ruta = '/menu') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppHeader />
      <Routes>
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** La cuenta del cliente la abre web-auth (Fase 4b); desde la Fase 5 es la única. */
const iniciarSesion = (nombre: string) => {
  cuentaDePrueba.session = sesionDeSupabase({ nombre })
}

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(irA).mockClear()
    compartirLaSesionDeWebAuth()
  })
  afterEach(() => vi.unstubAllEnvs())

  describe('sin sesión iniciada', () => {
    it('ofrece Ingresar y Registrarme, y no saluda', () => {
      renderHeader()

      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Registrarme' })).toBeInTheDocument()
      expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
    })

    it('"Ingresar" lleva al ingreso de web-auth y "Registrarme" a su registro, los dos con la vuelta a esta pantalla', () => {
      // En jsdom la pantalla es la URL de la página (window.location), no la del MemoryRouter.
      const vuelta = new URLSearchParams({ redirect: window.location.href }).toString()
      renderHeader()

      fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
      expect(irA).toHaveBeenLastCalledWith(`https://auth.menyu-app.com/?${vuelta}`)

      fireEvent.click(screen.getByRole('button', { name: 'Registrarme' }))
      expect(irA).toHaveBeenLastCalledWith(`https://auth.menyu-app.com/crear-cuenta?${vuelta}`)
    })

    // La Fase 5 retiró el login de `/auth`: los botones van a web-auth esté donde esté la app. En un dominio viejo de
    // Vercel la cookie no llega, así que ahí la cuenta no es posible y la mesa se abre como invitado.
    it('van a web-auth también donde la app no comparte su sesión', () => {
      vi.stubEnv('VITE_SUPABASE_URL', '')
      renderHeader()

      fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

      expect(irA).toHaveBeenCalledWith(expect.stringContaining('https://auth.menyu-app.com/?'))
      expect(screen.getByText('ruta: /menu')).toBeInTheDocument()
    })

    it('un token del login anterior que quedó en el localStorage no cuenta como sesión', () => {
      localStorage.setItem('menyu_access_token', 'token.del.login.anterior')

      renderHeader()

      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
      expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
    })
  })

  describe('con sesión iniciada', () => {
    it('saluda por el nombre y ofrece cerrar sesión en lugar de Ingresar y Registrarme', async () => {
      iniciarSesion('Marina')

      renderHeader()

      expect(await screen.findByText('Hola, Marina')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ingresar' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Registrarme' })).not.toBeInTheDocument()
    })

    it('un nombre con apellido en el mismo campo se muestra entero: no se adivina cuál es el apellido', async () => {
      iniciarSesion('Marina González')

      renderHeader()

      expect(await screen.findByText('Hola, Marina González')).toBeInTheDocument()
    })

    it('un nombre largo se muestra entero', async () => {
      iniciarSesion('Marina González de la Fuente')

      renderHeader()

      expect(await screen.findByText('Hola, Marina González de la Fuente')).toBeInTheDocument()
    })

    it('los acentos y la Ñ salen bien', async () => {
      iniciarSesion('Ñandú Gómez')

      renderHeader()

      expect(await screen.findByText('Hola, Ñandú Gómez')).toBeInTheDocument()
    })

    it('se emprolijan los espacios de más', async () => {
      iniciarSesion('  Marina    González ')

      renderHeader()

      // Testing Library ya ignora los espacios de más al buscar texto: se compara el texto tal cual.
      expect((await screen.findByText(/^Hola, /)).textContent).toBe('Hola, Marina González')
    })

    it('el nombre nunca se corta con "..." (se parte en líneas)', async () => {
      iniciarSesion('Superlargonombredeusuariosinespaciosparaprobarelcorte')

      renderHeader()

      const saludo = await screen.findByText(/^Hola, Superlargo/)
      expect(saludo.style.textOverflow).toBe('')
      expect(saludo.style.whiteSpace).toBe('')
      expect(saludo.style.overflowWrap).toBe('anywhere')
    })

    it('con Google, el nombre de Google; sin ninguno, el email', async () => {
      cuentaDePrueba.session = sesionDeSupabase({ metadatos: { full_name: 'Ana María Pérez', name: 'Ana' } })
      const { unmount } = renderHeader()
      expect(await screen.findByText('Hola, Ana María Pérez')).toBeInTheDocument()
      unmount()

      cuentaDePrueba.session = sesionDeSupabase({ email: 'ana@gmail.com', metadatos: {} })
      renderHeader()
      expect(await screen.findByText('Hola, ana@gmail.com')).toBeInTheDocument()
    })

    it('mientras se lee la sesión no muestra "Ingresar" (no parpadea a quien ya entró) ni el saludo', () => {
      cuentaDePrueba.cargando = true

      renderHeader()

      expect(screen.queryByRole('button', { name: 'Ingresar' })).not.toBeInTheDocument()
      expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
    })

    it('"Cerrar sesión" la cierra y la persona se queda en web-cliente, en el inicio', async () => {
      iniciarSesion('Ana')

      renderHeader()
      const cerrar = await screen.findByRole('button', { name: 'Cerrar sesión' })
      await act(async () => {
        fireEvent.click(cerrar)
      })

      expect(signOutSimulado).toHaveBeenCalledWith({ scope: 'local' })
      expect(irA).not.toHaveBeenCalled()
      expect(screen.getByText('ruta: /')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
    })
  })

  it('el logo lleva al inicio', () => {
    renderHeader('/menu/abc')

    fireEvent.click(screen.getByRole('img', { name: 'MenYU' }))

    expect(screen.getByText('ruta: /')).toBeInTheDocument()
  })
})
