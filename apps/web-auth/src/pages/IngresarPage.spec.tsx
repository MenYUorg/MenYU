import { AuthApiError } from '@supabase/supabase-js'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerPerfil } from '../lib/api'
import { irA } from '../lib/navegar'
import { FUTURO_ROUTER } from '../test/router'
import { crearSupabaseSimulado, PERFIL_MOZO, sesion } from '../test/supabaseSimulado'
import { IngresarPage } from './IngresarPage'

const cliente = vi.hoisted(() => ({ actual: null as ReturnType<typeof crearSupabaseSimulado> | null }))
vi.mock('../lib/supabase', () => ({ supabase: () => cliente.actual }))
vi.mock('../lib/api', () => ({ obtenerPerfil: vi.fn() }))
vi.mock('../lib/navegar', () => ({ irA: vi.fn() }))

function renderizar(url = '/') {
  render(
    <MemoryRouter initialEntries={[url]} future={FUTURO_ROUTER}>
      <Routes>
        <Route path="/" element={<IngresarPage />} />
        <Route path="/sin-acceso" element={<p>pantalla sin acceso</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function ingresar(email: string, contrasena: string) {
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: contrasena } })
  // El submit sigue con promesas (login, /auth/me): act espera a que terminen.
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
  })
}

describe('IngresarPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cliente.actual = crearSupabaseSimulado()
    cliente.actual.auth.getSession.mockResolvedValue({ data: { session: null } })
  })

  it('con email y contraseña correctos va a la app del rol', async () => {
    const auth = cliente.actual!.auth
    auth.signInWithPassword.mockImplementation(async () => {
      auth.getSession.mockResolvedValue({ data: { session: sesion() } })
      return { error: null }
    })
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'ok', perfil: PERFIL_MOZO })

    renderizar()
    await ingresar('mozo@menyu.com', 'secreta123')

    await waitFor(() => expect(irA).toHaveBeenCalledWith('http://localhost:5175/mozo?restauranteId=rest-1'))
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: 'mozo@menyu.com', password: 'secreta123' })
    expect(obtenerPerfil).toHaveBeenCalledWith('token-de-prueba')
  })

  it('con credenciales inválidas muestra el error', async () => {
    cliente.actual!.auth.signInWithPassword.mockResolvedValue({
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    })

    renderizar()
    await ingresar('mozo@menyu.com', 'mala')

    expect(await screen.findByRole('alert')).toHaveTextContent('El email o la contraseña no son correctos.')
    expect(await screen.findByRole('button', { name: 'Ingresar' })).toBeEnabled()
    expect(obtenerPerfil).not.toHaveBeenCalled()
  })

  it('una cuenta sin acceso (403) va a la pantalla de sin acceso', async () => {
    cliente.actual!.auth.getSession.mockResolvedValue({ data: { session: sesion('cliente@gmail.com') } })
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'sin-acceso' })

    renderizar('/?redirect=https%3A%2F%2Fadmin.menyu-app.com%2F')

    expect(await screen.findByText('pantalla sin acceso')).toBeInTheDocument()
    expect(irA).not.toHaveBeenCalled()
  })
})
