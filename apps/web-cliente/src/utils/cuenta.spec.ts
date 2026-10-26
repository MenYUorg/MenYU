import {
  clienteAuthSimulado,
  cuentaDePrueba,
  sesionDeSupabase,
  signOutSimulado,
  tokenDeAccesoSimulado,
} from '../test/authClient'
import {
  cerrarSesionDeLaCuenta,
  comparteLaSesionDeWebAuth,
  cuentaDeSesion,
  hayCookieDeSesion,
  nombreParaSaludo,
  olvidarElLoginAnterior,
  tokenParaAbrirMesa,
  urlDeIngreso,
} from './cuenta'

// La cuenta opcional del cliente (Fase 4b), simulada por src/test/authClient.ts. Desde la Fase 5 es la única: el login
// de `/auth`, con su token en localStorage, se retiró.

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
    expect(cuentaDeSesion(sinNada)).toEqual({ nombre: 'Cliente', email: '' })
  })
})

describe('tokenParaAbrirMesa', () => {
  it('con sesión de Supabase, su token', async () => {
    cuentaDePrueba.session = sesionDeSupabase({ token: 'token-de-supabase' })

    await expect(tokenParaAbrirMesa()).resolves.toBe('token-de-supabase')
  })

  it('si no se puede leer la sesión (un deploy sin sus variables), undefined', async () => {
    tokenDeAccesoSimulado.mockRejectedValueOnce(new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY'))

    await expect(tokenParaAbrirMesa()).resolves.toBeUndefined()
  })

  it('sin cuenta, undefined: entra como invitado', async () => {
    await expect(tokenParaAbrirMesa()).resolves.toBeUndefined()
  })

  // El token del login de `/auth` quedó en el navegador de quien lo usó antes de la Fase 5. Ya no identifica a nadie
  // (el backend solo verifica los de Supabase), así que no se manda.
  it('un token del login anterior que quedó en el localStorage no se manda', async () => {
    localStorage.setItem('menyu_access_token', 'token.del.login.anterior')

    await expect(tokenParaAbrirMesa()).resolves.toBeUndefined()
  })
})

describe('olvidarElLoginAnterior', () => {
  it('borra los tokens que dejó el login de /auth', () => {
    localStorage.setItem('menyu_access_token', 'a')
    localStorage.setItem('menyu_refresh_token', 'r')
    localStorage.setItem('otra_clave', 'se queda')

    olvidarElLoginAnterior()

    expect(localStorage.getItem('menyu_access_token')).toBeNull()
    expect(localStorage.getItem('menyu_refresh_token')).toBeNull()
    expect(localStorage.getItem('otra_clave')).toBe('se queda')
  })

  it('sin localStorage (modo privado) no tira error', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('acceso denegado') },
    })

    expect(() => olvidarElLoginAnterior()).not.toThrow()

    if (original) Object.defineProperty(window, 'localStorage', original)
  })
})

describe('cerrarSesionDeLaCuenta', () => {
  it('cierra la sesión de Supabase, solo en este navegador', async () => {
    cuentaDePrueba.session = sesionDeSupabase()

    await cerrarSesionDeLaCuenta()

    expect(signOutSimulado).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('sin Supabase configurado (o si falla la llamada) no tira error', async () => {
    clienteAuthSimulado.mockImplementationOnce(() => {
      throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY')
    })

    await expect(cerrarSesionDeLaCuenta()).resolves.toBeUndefined()
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

describe('hayCookieDeSesion', () => {
  it.each([
    ['la cookie de @supabase/ssr', 'sb-proyecto-test-auth-token=eyJ...'],
    ['partida en varias, como cuando es grande', 'sb-proyecto-test-auth-token.0=eyJ...; sb-proyecto-test-auth-token.1=abc'],
    ['con otras cookies antes', 'otra=1; sb-abc-auth-token=eyJ...'],
    ['con espacios de más', 'otra=1;   sb-abc-auth-token=eyJ...'],
  ])('%s: sí', (_caso, cookies) => {
    expect(hayCookieDeSesion(cookies)).toBe(true)
  })

  it.each([
    ['sin cookies', ''],
    ['otras cookies', 'preferencia=oscuro; _ga=GA1.1.123'],
    // Que no sea el principio de un nombre de cookie: así no se confunde con el valor de otra.
    ['nombrada dentro del valor de otra', 'otra=sb-abc-auth-token'],
  ])('%s: no', (_caso, cookies) => {
    expect(hayCookieDeSesion(cookies)).toBe(false)
  })
})
