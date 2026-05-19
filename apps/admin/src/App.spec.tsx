import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'
import { useAuthStore } from './store/authStore'

vi.mock('./store/authStore', () => ({ useAuthStore: vi.fn() }))
vi.mock('./pages/login/LoginPage', () => ({ LoginPage: () => <div>LoginPage</div> }))
vi.mock('./components/layout/Layout', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('./pages/menu/MenuPage', () => ({ MenuPage: () => <div>MenuPage</div> }))

function mockStore(overrides: object = {}) {
  vi.mocked(useAuthStore).mockReturnValue({
    isLoggedIn: false,
    user: null,
    logout: vi.fn().mockResolvedValue(undefined),
    loadContext: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as never)
}

describe('App', () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra LoginPage cuando no hay sesión activa', () => {
    mockStore({ isLoggedIn: false })
    render(<App />)
    expect(screen.getByText('LoginPage')).toBeInTheDocument()
  })

  it('muestra acceso denegado si el usuario logueado no es admin', () => {
    mockStore({ isLoggedIn: true, user: { sub: 'u1', tipo: 'mozo' } })
    render(<App />)
    expect(screen.getByText(/no tiene acceso/i)).toBeInTheDocument()
  })

  it('muestra el panel si el usuario es admin', () => {
    mockStore({ isLoggedIn: true, user: { sub: 'u1', tipo: 'admin' } })
    render(<App />)
    expect(screen.getByText('MenuPage')).toBeInTheDocument()
  })
})
