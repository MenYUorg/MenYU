import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { opcionesDeIngreso } from '../lib/destinos'
import { irA } from '../lib/navegar'
import { FUTURO_ROUTER } from '../test/router'
import { crearSupabaseSimulado, PERFIL_MOZO, sesion } from '../test/supabaseSimulado'
import { ElegirPage } from './ElegirPage'
import { OlvideContrasenaPage } from './OlvideContrasenaPage'
import { SinAccesoPage } from './SinAccesoPage'

const cliente = vi.hoisted(() => ({ actual: null as ReturnType<typeof crearSupabaseSimulado> | null }))
vi.mock('../lib/supabase', () => ({ supabase: () => cliente.actual }))
vi.mock('../lib/api', () => ({ obtenerPerfil: vi.fn() }))
vi.mock('../lib/navegar', () => ({ irA: vi.fn() }))

function renderizar(ruta: string, pantalla: ReactNode, estado?: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: ruta, state: estado }]} future={FUTURO_ROUTER}>
      <Routes>
        <Route path={ruta} element={pantalla} />
        <Route path="/" element={<p>pantalla de ingreso</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  cliente.actual = crearSupabaseSimulado()
  cliente.actual.auth.getSession.mockResolvedValue({ data: { session: sesion('cliente@gmail.com') } })
})

describe('ElegirPage', () => {
  it('lleva a la app del lugar elegido', async () => {
    const opciones = opcionesDeIngreso({ ...PERFIL_MOZO, esRoot: true })
    renderizar('/elegir', <ElegirPage />, { opciones })

    fireEvent.click(screen.getByRole('button', { name: /Restaurante/ }))

    expect(irA).toHaveBeenCalledWith('http://localhost:5175/mozo?restauranteId=rest-1')
  })
})

describe('SinAccesoPage', () => {
  it('muestra con qué cuenta entró y cierra la sesión', async () => {
    renderizar('/sin-acceso', <SinAccesoPage />)

    expect(await screen.findByText('Entraste como cliente@gmail.com.')).toBeInTheDocument()
    expect(screen.getByText('Si te invitaron con otro email, cerrá sesión y entrá con ese.')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    })

    expect(cliente.actual!.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(screen.getByText('pantalla de ingreso')).toBeInTheDocument()
  })
})

describe('OlvideContrasenaPage', () => {
  it('pide el mail y no dice si la cuenta existe', async () => {
    cliente.actual!.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
    renderizar('/olvide-contrasena', <OlvideContrasenaPage />)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' mozo@menyu.com ' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar el link' }))
    })

    expect(cliente.actual!.auth.resetPasswordForEmail).toHaveBeenCalledWith('mozo@menyu.com')
    expect(screen.getByRole('status')).toHaveTextContent('Si hay una cuenta con mozo@menyu.com')
  })
})
