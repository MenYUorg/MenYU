import { AuthApiError } from '@supabase/supabase-js'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerPerfil } from '../lib/api'
import { irA } from '../lib/navegar'
import { crearSupabaseSimulado, PERFIL_MOZO, sesion } from '../test/supabaseSimulado'
import { DefinirContrasenaPage } from './DefinirContrasenaPage'

const cliente = vi.hoisted(() => ({ actual: null as ReturnType<typeof crearSupabaseSimulado> | null }))
vi.mock('../lib/supabase', () => ({ supabase: () => cliente.actual }))
vi.mock('../lib/api', () => ({ obtenerPerfil: vi.fn() }))
vi.mock('../lib/navegar', () => ({ irA: vi.fn() }))

function renderizar(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/invitacion" element={<DefinirContrasenaPage modo="invitacion" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('DefinirContrasenaPage (invitación)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cliente.actual = crearSupabaseSimulado()
  })

  it('canjea el link, guarda la contraseña y sigue a la app del rol', async () => {
    const auth = cliente.actual!.auth
    auth.verifyOtp.mockResolvedValue({ data: { user: sesion().user, session: sesion() }, error: null })
    auth.updateUser.mockResolvedValue({ data: { user: sesion().user }, error: null })
    auth.getSession.mockResolvedValue({ data: { session: sesion() } })
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'ok', perfil: PERFIL_MOZO })

    renderizar('/invitacion?token_hash=hash-1&type=invite')

    expect(await screen.findByText(/Te invitaron a MenYU con mozo@menyu.com/)).toBeInTheDocument()
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-1', type: 'invite' })

    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'una-contrasena' } })
    fireEvent.change(screen.getByLabelText('Repetí la contraseña'), { target: { value: 'una-contrasena' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y entrar' }))

    await waitFor(() => expect(irA).toHaveBeenCalledWith('http://localhost:5175/mozo?restauranteId=rest-1'))
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'una-contrasena' })
  })

  it('con un link vencido lo explica y no muestra el formulario', async () => {
    cliente.actual!.auth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('Email link is invalid or has expired', 403, 'otp_expired'),
    })

    renderizar('/invitacion?token_hash=hash-vencido&type=invite')

    expect(await screen.findByRole('alert')).toHaveTextContent('El link venció o ya se usó.')
    expect(screen.queryByRole('button', { name: 'Guardar y entrar' })).not.toBeInTheDocument()
  })
})
