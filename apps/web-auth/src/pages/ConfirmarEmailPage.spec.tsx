import { obtenerPerfil } from '@menyu/auth-client'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  describe('con la plantilla por defecto de Supabase (vuelve con ?code=)', () => {
    it('canjea el código al llegar, sin botón, y la cuenta vuelve a web-cliente', async () => {
      const auth = cliente.actual!.auth
      auth.initialize.mockImplementation(async () => {
        auth.getSession.mockResolvedValue({ data: { session: sesion('ana@gmail.com') } })
        return { error: null }
      })

      renderizar(`/confirmar-email?${REDIRECT}&code=codigo-pkce`)

      await waitFor(() => expect(irA).toHaveBeenCalledWith(MESA))
      expect(auth.initialize).toHaveBeenCalledTimes(1)
      expect(auth.verifyOtp).not.toHaveBeenCalled()
      // El `?code=` no se saca de la barra: lo lee el cliente de Supabase.
      expect(screen.getByTestId('url')).toHaveTextContent('code=codigo-pkce')
    })

    it('mientras canjea muestra que está confirmando', () => {
      cliente.actual!.auth.initialize.mockReturnValue(new Promise(() => undefined))

      renderizar(`/confirmar-email?${REDIRECT}&code=codigo-pkce`)

      expect(screen.getByText('Confirmando tu cuenta…')).toBeInTheDocument()
    })

    it('en otro navegador (sin el verificador PKCE) no hay sesión: la cuenta igual quedó confirmada, ofrece ingresar', async () => {
      cliente.actual!.auth.initialize.mockResolvedValue({ error: new AuthApiError('flow state', 404, 'flow_state_not_found') })

      renderizar(`/confirmar-email?${REDIRECT}&code=codigo-pkce`)

      expect(await screen.findByRole('heading', { name: 'Tu cuenta está confirmada' })).toBeInTheDocument()
      // Solo el redirect: el código ya no sirve.
      expect(screen.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', `/?${REDIRECT}`)
      expect(irA).not.toHaveBeenCalled()
    })

    it('si el canje lanza, también ofrece ingresar', async () => {
      cliente.actual!.auth.initialize.mockRejectedValue(new TypeError('Failed to fetch'))

      renderizar(`/confirmar-email?code=codigo-pkce`)

      expect(await screen.findByRole('heading', { name: 'Tu cuenta está confirmada' })).toBeInTheDocument()
    })

    it('si el backend no responde después del canje, "Probar de nuevo" no vuelve a canjear', async () => {
      const auth = cliente.actual!.auth
      auth.initialize.mockImplementation(async () => {
        auth.getSession.mockResolvedValue({ data: { session: sesion('ana@gmail.com') } })
        return { error: null }
      })
      vi.mocked(obtenerPerfil).mockResolvedValueOnce({ tipo: 'error' })

      renderizar(`/confirmar-email?${REDIRECT}&code=codigo-pkce`)
      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos revisar a qué tenés acceso')
      await confirmar('Probar de nuevo')

      expect(auth.initialize).toHaveBeenCalledTimes(1)
      expect(irA).toHaveBeenCalledWith(MESA)
    })
  })

  it.each([
    ['en la query', `/confirmar-email?${REDIRECT}&error=access_denied&error_code=otp_expired`, 'El link venció o ya se usó.'],
    ['en el hash', `/confirmar-email?${REDIRECT}#error=access_denied&error_code=otp_expired`, 'El link venció o ya se usó.'],
    ['sin un código conocido', `/confirmar-email?${REDIRECT}&error=server_error`, 'No pudimos confirmar tu cuenta con este link.'],
  ])('si Supabase vuelve con un error %s, el link no sirve', (_donde, url, mensaje) => {
    renderizar(url)

    expect(screen.getByRole('heading', { name: 'Este link ya no sirve' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(mensaje)
    expect(screen.getByTestId('url')).toHaveTextContent(`/confirmar-email?${REDIRECT}`)
    expect(screen.getByTestId('url')).not.toHaveTextContent('error')
  })

  it('sin token (por ejemplo, al volver atrás) pide abrir el link del mail', () => {
    renderizar(`/confirmar-email?${REDIRECT}`)

    expect(screen.getByRole('heading', { name: 'Abrí el link del mail' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', `/?${REDIRECT}`)
  })
})
