import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FUTURO_ROUTER } from '../test/router'
import { crearSupabaseSimulado, sesion } from '../test/supabaseSimulado'
import { CrearCuentaPage } from './CrearCuentaPage'

const cliente = vi.hoisted(() => ({ actual: null as ReturnType<typeof crearSupabaseSimulado> | null }))
vi.mock('@menyu/auth-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@menyu/auth-client')>()),
  clienteAuth: () => cliente.actual,
}))

const MESA = 'https://mesa.menyu-app.com/restaurante/r-1/mesa'
// En jsdom la página corre en localhost: sin un redirect a web-cliente, el destino es su puerto local.
const INICIO_LOCAL = 'http://localhost:5176/'

function Ingreso() {
  const { search } = useLocation()
  return <p>pantalla de ingreso {search}</p>
}

function renderizar(url = '/crear-cuenta') {
  render(
    <MemoryRouter initialEntries={[url]} future={FUTURO_ROUTER}>
      <Routes>
        <Route path="/crear-cuenta" element={<CrearCuentaPage />} />
        <Route path="/" element={<Ingreso />} />
      </Routes>
    </MemoryRouter>,
  )
}

function completar({ nombre = 'Ana Pérez', email = 'ana@gmail.com', contrasena = 'secreta123', repetida = contrasena } = {}) {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: nombre } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: contrasena } })
  fireEvent.change(screen.getByLabelText('Repetí la contraseña'), { target: { value: repetida } })
}

async function crear() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
  })
}

describe('CrearCuentaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cliente.actual = crearSupabaseSimulado()
    cliente.actual.auth.signUp.mockResolvedValue({ data: { user: { id: 'uid-1' }, session: null }, error: null })
  })

  it('crea la cuenta con el nombre y el link de confirmación que vuelve a web-cliente', async () => {
    renderizar(`/crear-cuenta?redirect=${encodeURIComponent(MESA)}`)
    completar({ nombre: '  Ana   Pérez ', email: ' ana@gmail.com ' })
    await crear()

    expect(cliente.actual!.auth.signUp).toHaveBeenCalledWith({
      email: 'ana@gmail.com',
      password: 'secreta123',
      options: {
        data: { nombre: 'Ana Pérez' },
        emailRedirectTo: `${window.location.origin}/confirmar-email?redirect=${encodeURIComponent(MESA)}`,
      },
    })
    expect(screen.getByRole('status')).toHaveTextContent('Te mandamos un link a ana@gmail.com para confirmar tu cuenta')
    // Con la confirmación activa Supabase no dice si el email ya tenía cuenta, y la pantalla tampoco.
    expect(screen.getByText(/Si ya tenías una cuenta con ese email, no te llega otro link/)).toBeInTheDocument()
  })

  it('sin un redirect a web-cliente, el link vuelve al inicio de web-cliente (no a admin ni a staff)', async () => {
    renderizar(`/crear-cuenta?redirect=${encodeURIComponent('https://admin.menyu-app.com/admin')}`)
    completar()
    await crear()

    expect(cliente.actual!.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: `${window.location.origin}/confirmar-email?redirect=${encodeURIComponent(INICIO_LOCAL)}`,
        }),
      }),
    )
  })

  it.each([
    ['sin nombre', { nombre: '   ' }, 'Escribí tu nombre.'],
    ['con un nombre de más de 80 caracteres', { nombre: 'a'.repeat(81) }, 'Puede tener hasta 80 caracteres.'],
    ['sin email', { email: ' ' }, 'Escribí tu email.'],
    ['con una contraseña corta', { contrasena: 'corta' }, 'Tiene que tener al menos 8 caracteres.'],
    ['con contraseñas distintas', { repetida: 'otra-cosa-123' }, 'Las contraseñas no coinciden.'],
  ])('%s no llama a Supabase y lo marca en el campo', async (_caso, datos, mensaje) => {
    renderizar()
    completar(datos)
    await crear()

    expect(screen.getByText(mensaje)).toBeInTheDocument()
    expect(cliente.actual!.auth.signUp).not.toHaveBeenCalled()
  })

  it('un error de Supabase se muestra y deja reintentar', async () => {
    cliente.actual!.auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('Password is known to be weak', 422, 'weak_password'),
    })
    renderizar()
    completar()
    await crear()

    expect(screen.getByRole('alert')).toHaveTextContent('Esa contraseña es muy fácil de adivinar')
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeEnabled()
  })

  it('sin red muestra el mensaje de conexión', async () => {
    cliente.actual!.auth.signUp.mockRejectedValue(new AuthRetryableFetchError('Failed to fetch', 0))
    renderizar()
    completar()
    await crear()

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos conectarnos')
  })

  it('si Supabase abre la sesión en el acto (sin "Confirm email"), sigue al post-login con el redirect a web-cliente', async () => {
    cliente.actual!.auth.signUp.mockResolvedValue({ data: { user: { id: 'uid-1' }, session: sesion() }, error: null })
    renderizar(`/crear-cuenta?redirect=${encodeURIComponent(MESA)}`)
    completar()
    await crear()

    expect(screen.getByText(`pantalla de ingreso ?redirect=${encodeURIComponent(MESA)}`)).toBeInTheDocument()
  })

  it('con Google vuelve a /google con el redirect a web-cliente', async () => {
    renderizar()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    })

    expect(cliente.actual!.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/google?redirect=${encodeURIComponent(INICIO_LOCAL)}`,
        queryParams: { prompt: 'select_account' },
      },
    })
  })

  it('si no puede salir a Google muestra el error', async () => {
    cliente.actual!.auth.signInWithOAuth.mockRejectedValue(new AuthRetryableFetchError('Failed to fetch', 0))
    renderizar()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos conectarnos')
  })

  it('"Ingresá" vuelve al ingreso con el redirect de la pantalla, y enlaza la política de privacidad', () => {
    renderizar(`/crear-cuenta?redirect=${encodeURIComponent(MESA)}`)

    expect(screen.getByRole('link', { name: 'Ingresá' })).toHaveAttribute('href', `/?redirect=${encodeURIComponent(MESA)}`)
    expect(screen.getByRole('link', { name: 'política de privacidad' })).toHaveAttribute('href', '/privacidad')
  })
})
