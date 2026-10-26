import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { compartirLaSesionDeWebAuth } from '../../test/authClient'
import { irA } from '../../utils/navegar'
import { RedirigirAWebAuth } from './RedirigirAWebAuth'

vi.mock('../../utils/navegar', () => ({ irA: vi.fn() }))

// `/auth` era el login y el registro de esta app (el JWT propio). La Fase 5 lo retiró: la ruta queda solo para que un
// link o un marcador viejo lleve a web-auth, que es el único ingreso de MenYU.
function abrir(ruta: string) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/auth" element={<RedirigirAWebAuth />} />
      </Routes>
    </MemoryRouter>,
  )
  return vi.mocked(irA).mock.calls[0]?.[0] as string | undefined
}

const origen = () => window.location.origin

describe('RedirigirAWebAuth (la ruta /auth)', () => {
  beforeEach(() => {
    vi.mocked(irA).mockClear()
    compartirLaSesionDeWebAuth()
  })
  afterEach(() => vi.unstubAllEnvs())

  it('manda al ingreso de web-auth', () => {
    const url = abrir('/auth')

    expect(url).toBe(`https://auth.menyu-app.com/?redirect=${encodeURIComponent(`${origen()}/`)}`)
  })

  it('con ?tab=register, al registro', () => {
    const url = abrir('/auth?tab=register')

    expect(url).toBe(`https://auth.menyu-app.com/crear-cuenta?redirect=${encodeURIComponent(`${origen()}/`)}`)
  })

  it('conserva el ?volver= como la vuelta, ya absoluta', () => {
    const url = abrir('/auth?volver=%2Frestaurante%2Fr-1%2Fcarta%3Fq%3D1')

    expect(url).toBe(
      `https://auth.menyu-app.com/?redirect=${encodeURIComponent(`${origen()}/restaurante/r-1/carta?q=1`)}`,
    )
  })

  // Sin esto, un link armado a propósito mandaría a la persona a otro sitio después de iniciar sesión.
  it.each([
    ['otro sitio', '/auth?volver=https%3A%2F%2Fevil.example.com'],
    ['sin protocolo', '/auth?volver=%2F%2Fevil.example.com'],
    ['con barra invertida', '/auth?volver=%2F%5Cevil.example.com'],
  ])('descarta un ?volver= que no es una ruta de la app (%s) y vuelve al inicio', (_caso, ruta) => {
    const url = abrir(ruta)

    expect(url).toBe(`https://auth.menyu-app.com/?redirect=${encodeURIComponent(`${origen()}/`)}`)
  })
})
