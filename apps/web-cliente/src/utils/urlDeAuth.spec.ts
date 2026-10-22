import { urlDeAuth } from './urlDeAuth'

describe('urlDeAuth', () => {
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

  it('sin la variable y con un dominio desconocido (un preview de Vercel), va a producción', () => {
    expect(urlDeAuth('menyu-cliente-git-rama.vercel.app', 'https:')).toBe('https://auth.menyu-app.com')
  })
})
