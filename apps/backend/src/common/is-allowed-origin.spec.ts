import { isAllowedOrigin } from './is-allowed-origin'

// La lista de orígenes de CORS (también decide las back_urls de Mercado Pago).
describe('isAllowedOrigin', () => {
  const entorno = process.env

  afterEach(() => {
    process.env = entorno
  })

  const con = (variables: Record<string, string | undefined>) => {
    process.env = { ...entorno, CORS_ORIGINS: undefined, CORS_ORIGIN_PATTERNS: undefined, ...variables }
  }

  it('sin origen (pedidos que no son del navegador) y localhost se permiten siempre', () => {
    con({ CORS_ORIGINS: 'https://menyu-cliente.vercel.app' })

    expect(isAllowedOrigin(undefined)).toBe(true)
    expect(isAllowedOrigin('http://localhost:9999')).toBe(true)
  })

  it('con CORS_ORIGINS permite solo esos orígenes (con espacios alrededor de las comas)', () => {
    con({ CORS_ORIGINS: 'https://menyu-cliente.vercel.app, https://menyu-admin.vercel.app' })

    expect(isAllowedOrigin('https://menyu-admin.vercel.app')).toBe(true)
    expect(isAllowedOrigin('https://otro-sitio.example')).toBe(false)
  })

  it('CORS_ORIGIN_PATTERNS permite por expresión regular (las previews de Vercel)', () => {
    con({ CORS_ORIGINS: 'https://menyu-cliente.vercel.app', CORS_ORIGIN_PATTERNS: '^https://menyu-cliente-[a-z0-9]+-men-yu\\.vercel\\.app$' })

    expect(isAllowedOrigin('https://menyu-cliente-abc123-men-yu.vercel.app')).toBe(true)
    expect(isAllowedOrigin('https://menyu-cliente-abc123-otro.vercel.app')).toBe(false)
  })

  it('sin CORS_ORIGINS usa los orígenes locales por defecto', () => {
    con({})

    expect(isAllowedOrigin('https://menyu-cliente.vercel.app')).toBe(false)
  })
})
