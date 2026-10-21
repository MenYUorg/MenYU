import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { obtenerPerfil } from '../lib/api'
import { irA } from '../lib/navegar'
import { crearSupabaseSimulado, sesion } from '../test/supabaseSimulado'

const cliente = vi.hoisted(() => ({ actual: null as ReturnType<typeof crearSupabaseSimulado> | null }))
vi.mock('../lib/supabase', () => ({ supabase: () => cliente.actual }))
vi.mock('../lib/api', () => ({ obtenerPerfil: vi.fn() }))
vi.mock('../lib/navegar', () => ({ irA: vi.fn() }))

// La App entera, para comprobar también la ruta: Google y su bot la visitan sin sesión, y no tiene que redirigir a nadie.
function abrir(ruta: string) {
  window.history.pushState({}, '', ruta)
  render(<App />)
}

describe('/privacidad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cliente.actual = crearSupabaseSimulado()
  })

  it('se ve sin sesión, sin revisar la sesión ni llamar a /auth/me', () => {
    cliente.actual!.auth.getSession.mockResolvedValue({ data: { session: null } })
    abrir('/privacidad')

    expect(screen.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Qué datos recibimos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/')
    expect(cliente.actual!.auth.getSession).not.toHaveBeenCalled()
    expect(obtenerPerfil).not.toHaveBeenCalled()
  })

  it('con una sesión abierta tampoco la lee ni redirige', async () => {
    cliente.actual!.auth.getSession.mockResolvedValue({ data: { session: sesion() } })
    abrir('/privacidad')
    // Que termine cualquier efecto asincrónico que pudiera redirigir antes de mirar.
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 0))
    })

    expect(screen.getByRole('heading', { level: 1, name: 'Política de privacidad' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/privacidad')
    expect(cliente.actual!.auth.getSession).not.toHaveBeenCalled()
    expect(obtenerPerfil).not.toHaveBeenCalled()
    expect(irA).not.toHaveBeenCalled()
  })
})
