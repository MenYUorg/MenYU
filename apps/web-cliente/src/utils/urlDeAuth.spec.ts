import { urlDeAuth } from './urlDeAuth'

describe('urlDeAuth', () => {
  // Sin la variable: el `.env.local` de desarrollo la define, y acá se prueba justamente el camino en que falta.
  beforeEach(() => vi.stubEnv('VITE_AUTH_URL', ''))
  afterEach(() => vi.unstubAllEnvs())

  it('usa VITE_AUTH_URL cuando está, sin barra final', () => {
    vi.stubEnv('VITE_AUTH_URL', 'https://auth.staging.menyu-app.com//')

    expect(urlDeAuth('mesa.menyu-app.com')).toBe('https://auth.staging.menyu-app.com')
  })

  it.each([
    ['mesa.menyu-app.com', 'https://auth.menyu-app.com'],
    ['mesa.staging.menyu-app.com', 'https://auth.staging.menyu-app.com'],
  ])('sin la variable, en %s sale del dominio propio', (hostname, esperada) => {
    expect(urlDeAuth(hostname, 'https:')).toBe(esperada)
  })

  it('sin la variable, en desarrollo apunta al puerto de web-auth', () => {
    expect(urlDeAuth('mesa.menyu.local', 'http:')).toBe('http://auth.menyu.local:5173')
    expect(urlDeAuth('localhost', 'http:')).toBe('http://localhost:5173')
  })

  // Los dominios viejos de Vercel siguen activos: un staging o un preview que cayera en el default iría al login de
  // producción. Vercel nombra los previews por rama y también por hash.
  it.each([
    'menyu-cliente-staging.vercel.app',
    'menyu-cliente-git-rama-men-yu-s-projects.vercel.app',
    'menyu-cliente-k3f9zq1xa-men-yu-s-projects.vercel.app',
  ])('sin la variable, %s va al auth de staging', (hostname) => {
    expect(urlDeAuth(hostname, 'https:')).toBe('https://auth.staging.menyu-app.com')
  })

  it('sin la variable, el dominio viejo de producción va a producción', () => {
    expect(urlDeAuth('menyu-cliente.vercel.app', 'https:')).toBe('https://auth.menyu-app.com')
  })
})
