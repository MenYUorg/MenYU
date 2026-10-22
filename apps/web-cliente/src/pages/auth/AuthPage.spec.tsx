import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'
import { crearTokenJwt } from '../../test/fixtures'
import { AuthPage } from './AuthPage'

vi.mock('../../services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../services/api')>()),
  api: { auth: { login: vi.fn(), register: vi.fn() } },
}))

const login = vi.mocked(api.auth.login)
const registrar = vi.mocked(api.auth.register)

const TOKEN_CLIENTE = crearTokenJwt({ tipo: 'cliente', nombre: 'Ana' })
const TOKEN_ADMIN = crearTokenJwt({ tipo: 'admin', nombre: 'Dueña' })
const TOKEN_MOZO = crearTokenJwt({ tipo: 'mozo', nombre: 'Pedro' })

function Destino({ nombre }: { nombre: string }) {
  const { pathname, search } = useLocation()
  return <p>{nombre}: {pathname}{search}</p>
}

function renderAuth(url = '/auth') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<Destino nombre="inicio" />} />
        <Route path="/menu" element={<Destino nombre="menú" />} />
        <Route path="/restaurante/:restauranteId/carta" element={<Destino nombre="carta" />} />
        <Route path="*" element={<Destino nombre="otra" />} />
      </Routes>
    </MemoryRouter>,
  )
}

const ingresar = (email = 'ana@mail.com', clave = 'clave1234') => {
  fireEvent.change(screen.getByPlaceholderText('tu@email.com'), { target: { value: email } })
  fireEvent.change(screen.getByPlaceholderText('Tu contraseña'), { target: { value: clave } })
  fireEvent.click(document.querySelector('button[type="submit"]') as HTMLButtonElement)
}

const registrarse = () => {
  fireEvent.change(screen.getByPlaceholderText('Tu nombre'), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByPlaceholderText('tu@email.com'), { target: { value: 'ana@mail.com' } })
  fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'clave1234' } })
  fireEvent.change(screen.getByPlaceholderText('Repetí tu contraseña'), { target: { value: 'clave1234' } })
  fireEvent.click(document.querySelector('button[type="submit"]') as HTMLButtonElement)
}

describe('AuthPage', () => {
  beforeEach(() => {
    login.mockReset().mockResolvedValue({ accessToken: TOKEN_CLIENTE, refreshToken: 'refresh' } as never)
    registrar.mockReset().mockResolvedValue({ accessToken: TOKEN_CLIENTE, refreshToken: 'refresh' } as never)
    localStorage.clear()
    sessionStorage.clear()
    useSessionStore.getState().clear()
  })

  afterEach(() => localStorage.clear())

  describe('a dónde vuelve después de iniciar sesión', () => {
    it('sin "volver" y sin mesa abierta, al inicio', async () => {
      renderAuth()

      ingresar()

      expect(await screen.findByText('inicio: /')).toBeInTheDocument()
    })

    it('sin "volver" y con una mesa abierta, al menú de la mesa', async () => {
      useSessionStore.setState({ sesionId: 'ses-1' })
      renderAuth()

      ingresar()

      expect(await screen.findByText('menú: /menu')).toBeInTheDocument()
    })

    it('con "volver" vuelve ahí (la carta pide iniciar sesión y vuelve a la carta)', async () => {
      renderAuth('/auth?volver=%2Frestaurante%2Frest-1%2Fcarta')

      ingresar()

      expect(await screen.findByText('carta: /restaurante/rest-1/carta')).toBeInTheDocument()
      expect(login).toHaveBeenCalledWith('ana@mail.com', 'clave1234')
    })

    it('"volver" gana sobre la mesa abierta', async () => {
      useSessionStore.setState({ sesionId: 'ses-1' })
      renderAuth('/auth?volver=%2Frestaurante%2Frest-1%2Fcarta')

      ingresar()

      expect(await screen.findByText('carta: /restaurante/rest-1/carta')).toBeInTheDocument()
    })

    it('"volver" con otro sitio se ignora: no se manda a la persona a otro lado después de poner su clave', async () => {
      renderAuth('/auth?volver=https%3A%2F%2Fotro.com%2Frobo')

      ingresar()

      expect(await screen.findByText('inicio: /')).toBeInTheDocument()
    })

    it.each([
      ['//otro.com', '%2F%2Fotro.com'],
      ['/\\otro.com', '%2F%5Cotro.com'],
      ['javascript:alert(1)', 'javascript%3Aalert(1)'],
    ])('"volver" con %s también se ignora', async (_, codificado) => {
      renderAuth(`/auth?volver=${codificado}`)

      ingresar()

      expect(await screen.findByText('inicio: /')).toBeInTheDocument()
    })

    it('guarda la sesión del cliente antes de volver', async () => {
      renderAuth('/auth?volver=%2Frestaurante%2Frest-1%2Fcarta')

      ingresar()

      await screen.findByText(/^carta:/)
      expect(localStorage.getItem('menyu_access_token')).toBe(TOKEN_CLIENTE)
      expect(localStorage.getItem('menyu_refresh_token')).toBe('refresh')
    })

    it('si las credenciales son incorrectas se queda y avisa (no vuelve)', async () => {
      login.mockRejectedValue(new Error('Credenciales inválidas'))
      renderAuth('/auth?volver=%2Frestaurante%2Frest-1%2Fcarta')

      ingresar()

      expect(await screen.findByText('Credenciales inválidas')).toBeInTheDocument()
      expect(screen.queryByText(/^carta:/)).not.toBeInTheDocument()
    })
  })

  // El personal entra por web-auth (docs/auth/specs/auth.md, Fase 4). Antes se le guardaban los tokens legacy y se le
  // pasaban por la URL a web-admin o web-staff, que ya no los leen: terminaban en el historial de los dos dominios.
  describe('si la cuenta es del personal', () => {
    let location: Location

    beforeEach(() => {
      location = { ...window.location, hostname: 'mesa.menyu.local', protocol: 'http:', href: 'http://mesa.menyu.local/auth' } as Location
      vi.stubGlobal('location', location)
      vi.stubEnv('VITE_AUTH_URL', 'http://auth.menyu.local:5173')
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.unstubAllEnvs()
    })

    it.each([
      ['un admin', TOKEN_ADMIN],
      ['un mozo', TOKEN_MOZO],
    ])('con %s avisa y lo manda a web-auth, sin tokens', async (_quien, token) => {
      login.mockResolvedValue({ accessToken: token, refreshToken: 'refresh' } as never)
      renderAuth()

      ingresar('pedro@menyu.com')

      expect(await screen.findByRole('status')).toHaveTextContent('El ingreso de MenYU está en otra pantalla')
      expect(location.href).toBe('http://auth.menyu.local:5173')
      expect(screen.getByRole('link', { name: 'Ir al ingreso de MenYU' })).toHaveAttribute('href', 'http://auth.menyu.local:5173')
    })

    it('no guarda los tokens legacy ni los pasa por la URL', async () => {
      login.mockResolvedValue({ accessToken: TOKEN_MOZO, refreshToken: 'refresh' } as never)
      renderAuth()

      ingresar('pedro@menyu.com')

      await screen.findByRole('status')
      expect(localStorage.getItem('menyu_access_token')).toBeNull()
      expect(localStorage.getItem('menyu_refresh_token')).toBeNull()
      expect(location.href).not.toContain('token')
    })
  })

  describe('al registrarse', () => {
    it('sin "volver", al inicio', async () => {
      renderAuth('/auth?tab=register')

      registrarse()

      expect(await screen.findByText('inicio: /')).toBeInTheDocument()
      expect(registrar).toHaveBeenCalledWith('Ana', 'ana@mail.com', 'clave1234', undefined)
    })

    it('con "volver", vuelve ahí', async () => {
      renderAuth('/auth?tab=register&volver=%2Frestaurante%2Frest-1%2Fcarta')

      registrarse()

      expect(await screen.findByText('carta: /restaurante/rest-1/carta')).toBeInTheDocument()
    })

    it('con "volver" a otro sitio, lo ignora', async () => {
      renderAuth('/auth?tab=register&volver=https%3A%2F%2Fotro.com')

      registrarse()

      expect(await screen.findByText('inicio: /')).toBeInTheDocument()
    })
  })

  it('cambiar de pestaña conserva el "volver" (de "Ingresar" a "Registrarme")', async () => {
    renderAuth('/auth?volver=%2Frestaurante%2Frest-1%2Fcarta')

    fireEvent.click(screen.getByRole('button', { name: 'Registrarme' }))
    registrarse()

    await waitFor(() => expect(screen.getByText('carta: /restaurante/rest-1/carta')).toBeInTheDocument())
  })
})
