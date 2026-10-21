import { AuthApiError } from '@supabase/supabase-js'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FUTURO_ROUTER } from '../test/router'
import { crearSupabaseSimulado, sesion } from '../test/supabaseSimulado'
import { VolverDeGooglePage } from './VolverDeGooglePage'

const cliente = vi.hoisted(() => ({ actual: null as ReturnType<typeof crearSupabaseSimulado> | null }))
vi.mock('@menyu/auth-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@menyu/auth-client')>()),
  clienteAuth: () => cliente.actual,
  obtenerPerfil: vi.fn(),
}))

function PantallaDeIngreso() {
  const { search } = useLocation()
  return <p>pantalla de ingreso {search}</p>
}

function renderizar(url: string) {
  render(
    <MemoryRouter initialEntries={[url]} future={FUTURO_ROUTER}>
      <Routes>
        <Route path="/google" element={<VolverDeGooglePage />} />
        <Route path="/" element={<PantallaDeIngreso />} />
      </Routes>
    </MemoryRouter>,
  )
}

const REDIRECT = 'redirect=https%3A%2F%2Fadmin.menyu-app.com%2Fadmin'

describe('VolverDeGooglePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cliente.actual = crearSupabaseSimulado()
    cliente.actual.auth.getSession.mockResolvedValue({ data: { session: sesion('mozo@gmail.com') } })
  })

  it('con la sesión abierta sigue a ingresar conservando el redirect', async () => {
    renderizar(`/google?${REDIRECT}&code=codigo-1`)

    expect(await screen.findByText(`pantalla de ingreso ?${REDIRECT}`)).toBeInTheDocument()
    expect(cliente.actual!.auth.initialize).toHaveBeenCalled()
  })

  it('si la persona canceló en Google lo dice y deja volver con el redirect', async () => {
    renderizar(`/google?${REDIRECT}&error=access_denied`)

    expect(await screen.findByRole('alert')).toHaveTextContent('Cancelaste el ingreso con Google.')
    expect(screen.getByRole('link', { name: 'Volver a ingresar' })).toHaveAttribute('href', `/?${REDIRECT}`)
    expect(cliente.actual!.auth.initialize).not.toHaveBeenCalled()
  })

  it('un rechazo de Supabase con access_denied no se confunde con cancelar', async () => {
    renderizar('/google?error=access_denied&error_code=user_banned&error_description=User+is+banned')

    expect(await screen.findByRole('alert')).toHaveTextContent('Tu cuenta está suspendida.')
  })

  it('si el canje falla muestra el error', async () => {
    cliente.actual!.auth.initialize.mockResolvedValue({
      error: new AuthApiError('invalid flow state, no valid flow state found', 404, 'flow_state_not_found'),
    })

    renderizar('/google?code=codigo-2')

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos terminar el ingreso con Google.')
  })

  it('sin sesión después del canje (se empezó en otro navegador) muestra el error', async () => {
    cliente.actual!.auth.getSession.mockResolvedValue({ data: { session: null } })

    renderizar('/google?code=codigo-3')

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos terminar el ingreso con Google.')
  })
})
