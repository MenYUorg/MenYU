import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { cuentaDePrueba, sesionDeSupabase, signOutSimulado } from '../test/authClient'
import { crearTokenJwt } from '../test/fixtures'
import { irA } from '../utils/navegar'
import { AppHeader } from './AppHeader'

vi.mock('../utils/navegar', () => ({ irA: vi.fn() }))

const TOKEN_KEY = 'menyu_access_token'
const REFRESH_KEY = 'menyu_refresh_token'

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <p>ruta: {pathname}{search}</p>
}

function renderHeader(props: React.ComponentProps<typeof AppHeader> = {}, ruta = '/menu') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppHeader {...props} />
      <Routes>
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** La cuenta del login de `/auth` de web-cliente: un token de cliente en localStorage. */
const iniciarSesion = (payload: Record<string, unknown>) =>
  localStorage.setItem(TOKEN_KEY, crearTokenJwt({ tipo: 'cliente', ...payload }))

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(irA).mockClear()
    vi.stubEnv('VITE_AUTH_URL', 'https://auth.menyu-app.com')
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

    it('el token de una cuenta del personal (del login anterior) no cuenta como sesión', () => {
      localStorage.setItem(TOKEN_KEY, crearTokenJwt({ tipo: 'admin', nombre: 'Gerente' }))

      renderHeader()

      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
      expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
    })

    it('un token vencido del login anterior no cuenta como sesión (la mesa se abriría como invitado)', () => {
      iniciarSesion({ nombre: 'Marina', exp: Math.floor(Date.now() / 1000) - 60 })

      renderHeader()

      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
    })

    it('un token roto cuenta como sin sesión', () => {
      localStorage.setItem(TOKEN_KEY, 'no-es-un-token')

      renderHeader()

      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
    })

    it('un token sin nombre cuenta como sin sesión', () => {
      iniciarSesion({ sub: 'cli-1', tipo: 'cliente' })

      renderHeader()

      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
    })
  })

  describe('con sesión iniciada', () => {
    it('saluda por el nombre y ofrece cerrar sesión en lugar de Ingresar y Registrarme', () => {
      iniciarSesion({ nombre: 'Marina' })

      renderHeader()

      expect(screen.getByText('Hola, Marina')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ingresar' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Registrarme' })).not.toBeInTheDocument()
    })

    it('un nombre con apellido en el mismo campo se muestra entero: no se adivina cuál es el apellido', () => {
      iniciarSesion({ nombre: 'Marina González' })

      renderHeader()

      expect(screen.getByText('Hola, Marina González')).toBeInTheDocument()
    })

    it('un nombre largo se muestra entero', () => {
      iniciarSesion({ nombre: 'Marina González de la Fuente' })

      renderHeader()

      expect(screen.getByText('Hola, Marina González de la Fuente')).toBeInTheDocument()
    })

    it('los acentos y la Ñ salen bien (el nombre viaja en UTF-8 dentro del token)', () => {
      iniciarSesion({ nombre: 'Ñandú Gómez' })

      renderHeader()

      expect(screen.getByText('Hola, Ñandú Gómez')).toBeInTheDocument()
    })

    it('si el apellido viniera en otro campo, no se muestra: solo el nombre', () => {
      iniciarSesion({ nombre: 'Marina', apellido: 'González' })

      renderHeader()

      expect(screen.getByText('Hola, Marina')).toBeInTheDocument()
      expect(screen.queryByText(/González/)).not.toBeInTheDocument()
    })

    it('un nombre con dos nombres de pila se muestra con los dos', () => {
      iniciarSesion({ nombre: 'Marina Beatriz', apellido: 'González' })

      renderHeader()

      expect(screen.getByText('Hola, Marina Beatriz')).toBeInTheDocument()
    })

    it('se emprolijan los espacios de más', () => {
      iniciarSesion({ nombre: '  Marina    González ' })

      renderHeader()

      // Testing Library ya ignora los espacios de más al buscar texto: se compara el texto tal cual.
      expect(screen.getByText(/^Hola, /).textContent).toBe('Hola, Marina González')
    })

    it('el nombre nunca se corta con "..." (se parte en líneas)', () => {
      iniciarSesion({ nombre: 'Superlargonombredeusuariosinespaciosparaprobarelcorte' })

      renderHeader()

      const saludo = screen.getByText(/^Hola, Superlargo/)
      expect(saludo.style.textOverflow).toBe('')
      expect(saludo.style.whiteSpace).toBe('')
      expect(saludo.style.overflowWrap).toBe('anywhere')
    })

    it('"Cerrar sesión" borra los tokens y vuelve al inicio', async () => {
      iniciarSesion({ nombre: 'Marina' })
      localStorage.setItem(REFRESH_KEY, 'refresh')

      renderHeader()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
      })

      expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
      expect(localStorage.getItem(REFRESH_KEY)).toBeNull()
      expect(screen.getByText('ruta: /')).toBeInTheDocument()
    })
  })

  describe('con la cuenta de Supabase (web-auth, Fase 4b)', () => {
    it('saluda con el nombre que eligió al registrarse', () => {
      cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana Pérez' })

      renderHeader()

      expect(screen.getByText('Hola, Ana Pérez')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ingresar' })).not.toBeInTheDocument()
    })

    it('con Google, el nombre de Google; sin ninguno, el email', () => {
      cuentaDePrueba.session = sesionDeSupabase({ metadatos: { full_name: 'Ana María Pérez', name: 'Ana' } })
      const { unmount } = renderHeader()
      expect(screen.getByText('Hola, Ana María Pérez')).toBeInTheDocument()
      unmount()

      cuentaDePrueba.session = sesionDeSupabase({ email: 'ana@gmail.com', metadatos: {} })
      renderHeader()
      expect(screen.getByText('Hola, ana@gmail.com')).toBeInTheDocument()
    })

    it('mientras se lee la sesión no muestra "Ingresar" (no parpadea a quien ya entró) ni el saludo', () => {
      cuentaDePrueba.cargando = true

      renderHeader()

      expect(screen.queryByRole('button', { name: 'Ingresar' })).not.toBeInTheDocument()
      expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
    })

    it('mientras se lee, la cuenta del login anterior ya se muestra', () => {
      cuentaDePrueba.cargando = true
      iniciarSesion({ nombre: 'Marina' })

      renderHeader()

      expect(screen.getByText('Hola, Marina')).toBeInTheDocument()
    })

    it('le gana a la del login anterior si están las dos', () => {
      iniciarSesion({ nombre: 'Marina' })
      cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })

      renderHeader()

      expect(screen.getByText('Hola, Ana')).toBeInTheDocument()
    })

    it('"Cerrar sesión" la cierra (y la del login anterior) y la persona se queda en web-cliente, en el inicio', async () => {
      cuentaDePrueba.session = sesionDeSupabase({ nombre: 'Ana' })
      iniciarSesion({ nombre: 'Marina' })

      renderHeader()
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
      })

      expect(signOutSimulado).toHaveBeenCalledWith({ scope: 'local' })
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
      expect(irA).not.toHaveBeenCalled()
      expect(screen.getByText('ruta: /')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
    })
  })

  it('con "hideAuthButtons" no muestra ni los botones ni el saludo', () => {
    iniciarSesion({ nombre: 'Marina' })

    renderHeader({ hideAuthButtons: true })

    expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ingresar' })).not.toBeInTheDocument()
  })

  it('el logo lleva al inicio', () => {
    renderHeader({}, '/auth')

    fireEvent.click(screen.getByRole('img', { name: 'MenYU' }))

    expect(screen.getByText('ruta: /')).toBeInTheDocument()
  })
})
