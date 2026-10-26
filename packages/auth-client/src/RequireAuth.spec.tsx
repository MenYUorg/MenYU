import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tieneAcceso } from './apps'
import { clienteAuth } from './cliente'
import { irA, recargar } from './ir'
import { obtenerPerfil } from './perfil'
import { RequireAuth, usePerfil } from './RequireAuth'
import { crearAuthSimulado, perfil, sesion, type AuthSimulado } from './test/authSimulado'

vi.mock('./cliente', () => ({ clienteAuth: vi.fn() }))
vi.mock('./ir', () => ({ irA: vi.fn(), recargar: vi.fn() }))
vi.mock('./perfil', () => ({ obtenerPerfil: vi.fn() }))

let auth: AuthSimulado

function QuienSoy() {
  const { email } = usePerfil()
  return <p>Hola {email}</p>
}

function renderizar(puedeEntrar = (p: Parameters<typeof tieneAcceso>[0]) => tieneAcceso(p, 'admin')) {
  return render(
    <RequireAuth puedeEntrar={puedeEntrar} cargando={<p>Cargando…</p>}>
      <QuienSoy />
    </RequireAuth>,
  )
}

beforeEach(() => {
  vi.mocked(irA).mockClear()
  vi.mocked(recargar).mockClear()
  vi.mocked(obtenerPerfil).mockReset()
  vi.stubEnv('VITE_AUTH_URL', 'https://auth.menyu-app.com')
  auth = crearAuthSimulado(sesion('uid-1', 'token-1'))
  vi.mocked(clienteAuth).mockReturnValue({ auth } as never)
})
afterEach(() => vi.unstubAllEnvs())

describe('RequireAuth', () => {
  it('sin sesión va a web-auth con el redirect a esta pantalla', async () => {
    auth.sesion = null
    renderizar()

    await waitFor(() => expect(irA).toHaveBeenCalledTimes(1))
    const destino = new URL(vi.mocked(irA).mock.calls[0][0])
    expect(destino.origin + destino.pathname).toBe('https://auth.menyu-app.com/')
    expect(destino.searchParams.get('redirect')).toBe(window.location.href)
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
    expect(obtenerPerfil).not.toHaveBeenCalled()
  })

  it('con acceso muestra la app con el perfil, pidiéndolo con el token de la sesión', async () => {
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'ok', perfil: perfil(['OWNER']) })
    renderizar()

    expect(await screen.findByText('Hola a@menyu.com')).toBeInTheDocument()
    expect(obtenerPerfil).toHaveBeenCalledWith('token-1')
    expect(irA).not.toHaveBeenCalled()
  })

  it('si el backend rechaza el token (401), cierra la sesión local y va al login', async () => {
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'sesion-invalida' })
    renderizar()

    await waitFor(() => expect(irA).toHaveBeenCalled())
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(vi.mocked(irA).mock.calls[0][0]).toMatch(/^https:\/\/auth\.menyu-app\.com\/\?redirect=/)
  })

  it('una cuenta sin acceso a MenYU (403) va a "sin acceso" de web-auth', async () => {
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'sin-acceso' })
    renderizar()

    await waitFor(() => expect(irA).toHaveBeenCalledWith('https://auth.menyu-app.com/sin-acceso'))
  })

  it('con acceso a MenYU pero no a esta app, va a web-auth sin redirect (no hay loop)', async () => {
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'ok', perfil: perfil(['MOZO']) })
    renderizar()

    await waitFor(() => expect(irA).toHaveBeenCalledWith('https://auth.menyu-app.com/'))
    expect(screen.queryByText(/Hola/)).not.toBeInTheDocument()
  })

  it('si el backend no responde, ofrece reintentar sin cerrar la sesión', async () => {
    vi.mocked(obtenerPerfil)
      .mockResolvedValueOnce({ tipo: 'error' })
      .mockResolvedValueOnce({ tipo: 'ok', perfil: perfil(['GERENTE']) })
    renderizar()

    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Hola a@menyu.com')).toBeInTheDocument()
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(irA).not.toHaveBeenCalled()
  })

  it('el error se puede mostrar con la pantalla de la app', async () => {
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'error' })
    render(
      <RequireAuth puedeEntrar={() => true} error={(reintentar) => <button onClick={reintentar}>Otra vez</button>}>
        <QuienSoy />
      </RequireAuth>,
    )

    expect(await screen.findByRole('button', { name: 'Otra vez' })).toBeInTheDocument()
  })

  it('si no se puede leer la sesión, es un error con reintento', async () => {
    auth.getSession.mockRejectedValueOnce(new Error('cookie ilegible'))
    renderizar()

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos revisar a qué tenés acceso')
  })

  it('una vez adentro, si se cierra la sesión en otra app, al volver a la pestaña va al login', async () => {
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'ok', perfil: perfil(['OWNER']) })
    renderizar()
    await screen.findByText('Hola a@menyu.com')

    auth.sesion = null
    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(irA).toHaveBeenCalledTimes(1))
    expect(vi.mocked(irA).mock.calls[0][0]).toMatch(/^https:\/\/auth\.menyu-app\.com\/\?redirect=/)
  })

  it('una vez adentro, si en otra pestaña entró otra cuenta, recarga', async () => {
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'ok', perfil: perfil(['OWNER']) })
    renderizar()
    await screen.findByText('Hola a@menyu.com')

    auth.sesion = sesion('uid-2')
    // El listener de foco se registra en un efecto que puede correr después de que aparece el texto: se reintenta el foco.
    await waitFor(() => {
      window.dispatchEvent(new Event('focus'))
      expect(recargar).toHaveBeenCalledTimes(1)
    })
  })

  it('si se desmonta antes de que responda el backend, no actualiza nada', async () => {
    let responder: (valor: Awaited<ReturnType<typeof obtenerPerfil>>) => void = () => {}
    vi.mocked(obtenerPerfil).mockReturnValue(new Promise((resolve) => (responder = resolve)))
    const { unmount } = renderizar()
    await waitFor(() => expect(obtenerPerfil).toHaveBeenCalled())

    unmount()
    responder({ tipo: 'error' })
    await Promise.resolve()

    expect(irA).not.toHaveBeenCalled()
  })
})

describe('usePerfil', () => {
  it('fuera de RequireAuth avisa el error de uso', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<QuienSoy />)).toThrow('usePerfil() se usa dentro de <RequireAuth>')
  })
})
