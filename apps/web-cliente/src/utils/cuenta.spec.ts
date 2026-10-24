import {
  clienteAuthSimulado,
  cuentaDePrueba,
  sesionDeSupabase,
  signOutSimulado,
  tokenDeAccesoSimulado,
} from '../test/authClient'
import { crearTokenJwt } from '../test/fixtures'
import {
  cerrarSesionDeLaCuenta,
  comparteLaSesionDeWebAuth,
  cuentaDelLoginAnterior,
  cuentaDeSesion,
  destinoDeIngreso,
  nombreParaSaludo,
  tokenParaAbrirMesa,
  urlDeIngreso,
} from './cuenta'

// La cuenta opcional del cliente (Fase 4b): la de Supabase, simulada por src/test/authClient.ts, y la del login de
// `/auth`, con su token en localStorage.

const TOKEN_KEY = 'menyu_access_token'
const enUnaHora = () => Math.floor(Date.now() / 1000) + 3600
const iniciarSesionAnterior = (payload: Record<string, unknown>) => {
  const token = crearTokenJwt({ sub: 'cli-1', tipo: 'cliente', exp: enUnaHora(), ...payload })
  localStorage.setItem(TOKEN_KEY, token)
  return token
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
})

describe('nombreParaSaludo', () => {
  it('el texto tal cual, con los espacios emprolijados', () => {
    expect(nombreParaSaludo('  Marina    González ')).toBe('Marina González')
  })

  it.each([[''], ['   '], [42], [null], [undefined]])('%j no es un nombre', (valor) => {
    expect(nombreParaSaludo(valor)).toBeNull()
  })
})

describe('cuentaDeSesion (Supabase)', () => {
  it('el nombre que eligió al registrarse en web-auth', () => {
    expect(cuentaDeSesion(sesionDeSupabase({ nombre: 'Ana Pérez', email: 'ana@gmail.com' }))).toEqual({
      nombre: 'Ana Pérez',
      email: 'ana@gmail.com',
      origen: 'supabase',
    })
  })

  it('con Google: full_name y, si no, name', () => {
    expect(cuentaDeSesion(sesionDeSupabase({ metadatos: { full_name: 'Ana María', name: 'Ana' } })).nombre).toBe('Ana María')
    expect(cuentaDeSesion(sesionDeSupabase({ metadatos: { name: 'Ana' } })).nombre).toBe('Ana')
  })

  it('sin nombre, el email; sin email, "Cliente"', () => {
    expect(cuentaDeSesion(sesionDeSupabase({ email: 'ana@gmail.com', metadatos: {} })).nombre).toBe('ana@gmail.com')

    const sinNada = sesionDeSupabase({ metadatos: {} })
    sinNada.user.email = undefined
    expect(cuentaDeSesion(sinNada)).toEqual({ nombre: 'Cliente', email: '', origen: 'supabase' })
  })
})

describe('cuentaDelLoginAnterior', () => {
  it('un token de cliente con nombre', () => {
    iniciarSesionAnterior({ nombre: 'Marina', email: 'marina@mail.com' })

    expect(cuentaDelLoginAnterior()).toEqual({ nombre: 'Marina', email: 'marina@mail.com', origen: 'anterior' })
  })

  it('sin email, queda vacío', () => {
    iniciarSesionAnterior({ nombre: 'Marina' })

    expect(cuentaDelLoginAnterior()?.email).toBe('')
  })

  it.each([
    ['sin token', () => undefined],
    ['sin nombre', () => iniciarSesionAnterior({})],
    ['de una cuenta del personal', () => iniciarSesionAnterior({ tipo: 'mozo', nombre: 'Mozo' })],
    ['vencido', () => iniciarSesionAnterior({ nombre: 'Marina', exp: Math.floor(Date.now() / 1000) - 60 })],
  ])('%s: no hay cuenta', (_caso, preparar) => {
    preparar()

    expect(cuentaDelLoginAnterior()).toBeNull()
  })
})

describe('tokenParaAbrirMesa', () => {
  it('con sesión de Supabase, su token (aunque también haya uno del login anterior)', async () => {
    iniciarSesionAnterior({ nombre: 'Marina' })
    cuentaDePrueba.session = sesionDeSupabase({ token: 'token-de-supabase' })

    await expect(tokenParaAbrirMesa()).resolves.toBe('token-de-supabase')
  })

  it('sin sesión de Supabase, el del login anterior', async () => {
    const token = iniciarSesionAnterior({ nombre: 'Marina' })

    await expect(tokenParaAbrirMesa()).resolves.toBe(token)
  })

  it('si no se puede leer la sesión de Supabase (un deploy sin sus variables), sigue con el del login anterior', async () => {
    const token = iniciarSesionAnterior({ nombre: 'Marina' })
    tokenDeAccesoSimulado.mockRejectedValueOnce(new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY'))

    await expect(tokenParaAbrirMesa()).resolves.toBe(token)
  })

  it('sin ninguna cuenta, undefined: entra como invitado', async () => {
    await expect(tokenParaAbrirMesa()).resolves.toBeUndefined()
  })
})

describe('cerrarSesionDeLaCuenta', () => {
  it('cierra las dos: la de Supabase (solo esta sesión) y la del login anterior', async () => {
    iniciarSesionAnterior({ nombre: 'Marina' })
    localStorage.setItem('menyu_refresh_token', 'refresh')
    cuentaDePrueba.session = sesionDeSupabase()

    await cerrarSesionDeLaCuenta()

    expect(signOutSimulado).toHaveBeenCalledWith({ scope: 'local' })
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    expect(localStorage.getItem('menyu_refresh_token')).toBeNull()
  })

  it('sin Supabase configurado (o si falla la llamada) igual cierra la del login anterior, sin error', async () => {
    iniciarSesionAnterior({ nombre: 'Marina' })
    clienteAuthSimulado.mockImplementationOnce(() => {
      throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY')
    })

    await expect(cerrarSesionDeLaCuenta()).resolves.toBeUndefined()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })
})

describe('urlDeIngreso', () => {
  beforeEach(() => vi.stubEnv('VITE_AUTH_URL', 'https://auth.menyu-app.com/'))

  it('ingresar: la pantalla de ingreso de web-auth, con la vuelta', () => {
    expect(urlDeIngreso('ingresar', 'https://mesa.menyu-app.com/restaurante/r-1/carta')).toBe(
      'https://auth.menyu-app.com/?redirect=https%3A%2F%2Fmesa.menyu-app.com%2Frestaurante%2Fr-1%2Fcarta',
    )
  })

  it('crear: el registro de web-auth, con la vuelta', () => {
    expect(urlDeIngreso('crear', 'https://mesa.menyu-app.com/')).toBe(
      'https://auth.menyu-app.com/crear-cuenta?redirect=https%3A%2F%2Fmesa.menyu-app.com%2F',
    )
  })

  it('una vuelta con su propia query no se mezcla con la de web-auth', () => {
    const url = new URL(urlDeIngreso('ingresar', 'https://mesa.menyu-app.com/check-in?restaurantId=r-1&tableCode=qr-1'))

    expect(url.searchParams.get('redirect')).toBe('https://mesa.menyu-app.com/check-in?restaurantId=r-1&tableCode=qr-1')
    expect([...url.searchParams.keys()]).toEqual(['redirect'])
  })

  it('sin decirle a dónde volver, vuelve a la pantalla actual', () => {
    expect(new URL(urlDeIngreso('ingresar')).searchParams.get('redirect')).toBe(window.location.href)
  })
})

describe('comparteLaSesionDeWebAuth', () => {
  const conLasVariables = (dominio = '.menyu-app.com') => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'clave-publica')
    vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', dominio)
  }

  it.each(['mesa.menyu-app.com', 'mesa.staging.menyu-app.com', 'menyu-app.com'])('en %s sí (bajo el dominio de la cookie)', (host) => {
    conLasVariables()

    expect(comparteLaSesionDeWebAuth(host)).toBe(true)
  })

  it.each(['menyu-cliente.vercel.app', 'menyu-cliente-staging.vercel.app', 'mesa.menyu-app.com.otro.com', 'otromenyu-app.com'])(
    'en %s no (un dominio viejo de Vercel, o uno que solo se le parece)',
    (host) => {
      conLasVariables()

      expect(comparteLaSesionDeWebAuth(host)).toBe(false)
    },
  )

  it('el dominio de staging no cubre producción', () => {
    conLasVariables('.staging.menyu-app.com')

    expect(comparteLaSesionDeWebAuth('mesa.staging.menyu-app.com')).toBe(true)
    expect(comparteLaSesionDeWebAuth('mesa.menyu-app.com')).toBe(false)
  })

  it.each(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_AUTH_COOKIE_DOMAIN'])('sin %s no', (variable) => {
    conLasVariables()
    vi.stubEnv(variable, '')

    expect(comparteLaSesionDeWebAuth('mesa.menyu-app.com')).toBe(false)
  })
})

describe('destinoDeIngreso', () => {
  const ubicacion = (hostname: string) => ({
    hostname,
    pathname: '/restaurante/r-1/carta',
    search: '?q=1',
    href: `https://${hostname}/restaurante/r-1/carta?q=1`,
  })

  beforeEach(() => {
    vi.stubEnv('VITE_AUTH_URL', 'https://auth.menyu-app.com')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto.supabase.co')
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'clave-publica')
    vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', '.menyu-app.com')
  })

  it('con la sesión compartida, web-auth con la vuelta a esta pantalla', () => {
    expect(destinoDeIngreso('crear', ubicacion('mesa.menyu-app.com'))).toEqual({
      tipo: 'web-auth',
      url: `https://auth.menyu-app.com/crear-cuenta?redirect=${encodeURIComponent('https://mesa.menyu-app.com/restaurante/r-1/carta?q=1')}`,
    })
  })

  it('en un dominio viejo de Vercel, el login de /auth de esta app, también con la vuelta', () => {
    expect(destinoDeIngreso('ingresar', ubicacion('menyu-cliente.vercel.app'))).toEqual({
      tipo: 'login-anterior',
      ruta: `/auth?volver=${encodeURIComponent('/restaurante/r-1/carta?q=1')}`,
    })
    expect(destinoDeIngreso('crear', ubicacion('menyu-cliente.vercel.app'))).toEqual({
      tipo: 'login-anterior',
      ruta: `/auth?tab=register&volver=${encodeURIComponent('/restaurante/r-1/carta?q=1')}`,
    })
  })

  it('sin decirle dónde está, usa la pantalla actual', () => {
    vi.stubEnv('VITE_AUTH_COOKIE_DOMAIN', window.location.hostname)

    expect(destinoDeIngreso('ingresar')).toEqual({ tipo: 'web-auth', url: urlDeIngreso('ingresar', window.location.href) })
  })
})
