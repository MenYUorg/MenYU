import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerPerfil } from '../lib/api'
import { irA } from '../lib/navegar'
import { FUTURO_ROUTER } from '../test/router'
import { crearSupabaseSimulado, PERFIL_MOZO, sesion } from '../test/supabaseSimulado'
import { DefinirContrasenaPage } from './DefinirContrasenaPage'

const cliente = vi.hoisted(() => ({ actual: null as ReturnType<typeof crearSupabaseSimulado> | null }))
vi.mock('../lib/supabase', () => ({ supabase: () => cliente.actual }))
vi.mock('../lib/api', () => ({ obtenerPerfil: vi.fn() }))
vi.mock('../lib/navegar', () => ({ irA: vi.fn() }))

function renderizar(url: string) {
  render(
    <MemoryRouter initialEntries={[url]} future={FUTURO_ROUTER}>
      <Routes>
        <Route path="/invitacion" element={<DefinirContrasenaPage modo="invitacion" />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function guardar(contrasena: string) {
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: contrasena } })
  fireEvent.change(screen.getByLabelText('Repetí la contraseña'), { target: { value: contrasena } })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y entrar' }))
  })
}

describe('DefinirContrasenaPage (invitación)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cliente.actual = crearSupabaseSimulado()
  })

  it('canjea el link al guardar la contraseña y sigue a la app del rol', async () => {
    const auth = cliente.actual!.auth
    auth.verifyOtp.mockResolvedValue({ data: { user: sesion().user, session: sesion() }, error: null })
    auth.updateUser.mockResolvedValue({ data: { user: sesion().user }, error: null })
    auth.getSession.mockResolvedValue({ data: { session: sesion() } })
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'ok', perfil: PERFIL_MOZO })

    renderizar('/invitacion?token_hash=hash-1&type=invite')
    expect(screen.getByText('Creá tu contraseña')).toBeInTheDocument()
    expect(auth.verifyOtp).not.toHaveBeenCalled() // abrir el link no lo gasta

    await guardar('una-contrasena')

    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'invite' })
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'una-contrasena' })
    expect(irA).toHaveBeenCalledWith('http://localhost:5175/mozo?restauranteId=rest-1')
  })

  it('con un link vencido lo explica y saca el formulario', async () => {
    cliente.actual!.auth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('Email link is invalid or has expired', 403, 'otp_expired'),
    })

    renderizar('/invitacion?token_hash=hash-vencido&type=invite')
    await guardar('una-contrasena')

    expect(screen.getByRole('alert')).toHaveTextContent('El link venció o ya se usó.')
    expect(screen.queryByRole('button', { name: 'Guardar y entrar' })).not.toBeInTheDocument()
  })

  it('sin conexión deja el formulario para reintentar', async () => {
    cliente.actual!.auth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })

    renderizar('/invitacion?token_hash=hash-2&type=invite')
    await guardar('una-contrasena')

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos conectarnos')
    expect(screen.getByRole('button', { name: 'Guardar y entrar' })).toBeEnabled()
  })
})
