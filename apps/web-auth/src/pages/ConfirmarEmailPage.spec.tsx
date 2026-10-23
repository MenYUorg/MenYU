import { obtenerPerfil } from '@menyu/auth-client'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { irA } from '../lib/navegar'
import { FUTURO_ROUTER } from '../test/router'
import { crearSupabaseSimulado, PERFIL_MOZO, sesion } from '../test/supabaseSimulado'
import { ConfirmarEmailPage } from './ConfirmarEmailPage'

const cliente = vi.hoisted(() => ({ actual: null as ReturnType<typeof crearSupabaseSimulado> | null }))
vi.mock('@menyu/auth-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@menyu/auth-client')>()),
  clienteAuth: () => cliente.actual,
  obtenerPerfil: vi.fn(),
}))
vi.mock('../lib/navegar', () => ({ irA: vi.fn() }))

const MESA = 'https://mesa.menyu-app.com/restaurante/r-1/mesa'
const REDIRECT = `redirect=${encodeURIComponent(MESA)}`

function UrlActual() {
  const { pathname, search } = useLocation()
  return <output data-testid="url">{`${pathname}${search}`}</output>
}

function renderizar(url: string) {
  render(
    <MemoryRouter initialEntries={[url]} future={FUTURO_ROUTER}>
      <Routes>
        <Route
          path="/confirmar-email"
          element={
            <>
              <ConfirmarEmailPage />
              <UrlActual />
            </>
          }
        />
        <Route path="/sin-acceso" element={<p>pantalla sin acceso</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function confirmar(nombre = 'Confirmar y entrar') {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: nombre }))
  })
}

describe('ConfirmarEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cliente.actual = crearSupabaseSimulado()
    const auth = cliente.actual.auth
    auth.getSession.mockResolvedValue({ data: { session: null } })
    auth.verifyOtp.mockImplementation(async () => {
      auth.getSession.mockResolvedValue({ data: { session: sesion('ana@gmail.com') } })
      return { data: { session: sesion('ana@gmail.com') }, error: null }
    })
    // Una cuenta de cliente no tiene `Usuario`: /auth/me responde 403.
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'sin-acceso' })
  })

  it('saca el token de la barra pero deja el redirect, y no lo canjea hasta que se toca el botón', () => {
    renderizar(`/confirmar-email?${REDIRECT}&token_hash=pkce_abc&type=email`)

    expect(screen.getByTestId('url')).toHaveTextContent(`/confirmar-email?${REDIRECT}`)
    expect(screen.getByRole('heading', { name: 'Confirmá tu email' })).toBeInTheDocument()
    expect(cliente.actual!.auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('al confirmar canjea el token y la cuenta de cliente vuelve a web-cliente', async () => {
    renderizar(`/confirmar-email?${REDIRECT}&token_hash=pkce_abc&type=email`)
    await confirmar()

    expect(cliente.actual!.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'pkce_abc', type: 'email' })
    expect(obtenerPerfil).toHaveBeenCalledWith('token-de-prueba')
    expect(irA).toHaveBeenCalledWith(MESA)
  })

  it('acepta el type "signup", el nombre anterior del mismo canje', async () => {
    renderizar(`/confirmar-email?${REDIRECT}&token_hash=abc&type=signup`)
    await confirmar()

    expect(cliente.actual!.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'signup' })
  })

  it('si la cuenta además es del personal (tiene Usuario), el redirect a web-cliente igual vale', async () => {
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'ok', perfil: PERFIL_MOZO })
    renderizar(`/confirmar-email?${REDIRECT}&token_hash=abc&type=email`)
    await confirmar()

    expect(irA).toHaveBeenCalledWith(MESA)
  })

  it('un link vencido o usado dice que no sirve y ofrece ingresar o crear la cuenta de nuevo', async () => {
    cliente.actual!.auth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: new AuthApiError('Email link is invalid or has expired', 403, 'otp_expired'),
    })
    renderizar(`/confirmar-email?${REDIRECT}&token_hash=abc&type=email`)
    await confirmar()

    expect(screen.getByRole('heading', { name: 'Este link ya no sirve' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('El link venció o ya se usó.')
    expect(screen.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', `/?${REDIRECT}`)
    expect(screen.getByRole('link', { name: 'Crear la cuenta' })).toHaveAttribute('href', `/crear-cuenta?${REDIRECT}`)
    expect(irA).not.toHaveBeenCalled()
  })

  it('si el canje no devuelve sesión, el link no sirve', async () => {
    cliente.actual!.auth.verifyOtp.mockResolvedValue({ data: { session: null }, error: null })
    renderizar(`/confirmar-email?token_hash=abc&type=email`)
    await confirmar()

    expect(screen.getByRole('heading', { name: 'Este link ya no sirve' })).toBeInTheDocument()
  })

  it('sin red el link sigue sirviendo: muestra el error y deja reintentar', async () => {
    cliente.actual!.auth.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })
    renderizar(`/confirmar-email?${REDIRECT}&token_hash=abc&type=email`)
    await confirmar()

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos conectarnos')
    await confirmar()
    expect(cliente.actual!.auth.verifyOtp).toHaveBeenCalledTimes(2)
    expect(irA).toHaveBeenCalledWith(MESA)
  })

  it('una excepción del canje se muestra como error', async () => {
    cliente.actual!.auth.verifyOtp.mockRejectedValue(new TypeError('Failed to fetch'))
    renderizar(`/confirmar-email?token_hash=abc&type=email`)
    await confirmar()

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos conectarnos')
  })

  it('si el backend no responde después del canje, reintentar no vuelve a gastar el token', async () => {
    vi.mocked(obtenerPerfil).mockResolvedValueOnce({ tipo: 'error' })
    renderizar(`/confirmar-email?${REDIRECT}&token_hash=abc&type=email`)
    await confirmar()

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos revisar a qué tenés acceso')
    await confirmar('Probar de nuevo')

    expect(cliente.actual!.auth.verifyOtp).toHaveBeenCalledTimes(1)
    expect(irA).toHaveBeenCalledWith(MESA)
  })

  it('si el backend rechaza la sesión del canje, la cuenta ya quedó confirmada: ofrece ingresar', async () => {
    vi.mocked(obtenerPerfil).mockResolvedValue({ tipo: 'sesion-invalida' })
    renderizar(`/confirmar-email?${REDIRECT}&token_hash=abc&type=email`)
    await confirmar()

    expect(screen.getByRole('heading', { name: 'Tu cuenta está confirmada' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Tu sesión venció. Ingresá de nuevo.')
    expect(screen.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', `/?${REDIRECT}`)
  })

  it('sin token (por ejemplo, al volver atrás) pide abrir el link del mail', () => {
    renderizar(`/confirmar-email?${REDIRECT}`)

    expect(screen.getByRole('heading', { name: 'Abrí el link del mail' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', `/?${REDIRECT}`)
  })
})
