import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'
import { crearSesionAbierta } from '../../test/fixtures'
import { IngresoManualPage } from './IngresoManualPage'

vi.mock('../../services/api', () => ({
  api: {
    sessions: { open: vi.fn() },
    marca: { publicas: vi.fn(), restaurantes: vi.fn() },
  },
}))

const abrir = vi.mocked(api.sessions.open)

function renderIngreso() {
  return render(
    <MemoryRouter initialEntries={['/ingresar-pin']}>
      <Routes>
        <Route path="/ingresar-pin" element={<IngresoManualPage />} />
        <Route path="/menu" element={<p>pantalla del menú</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

// El header también tiene un botón "Ingresar" (al login), así que el del formulario se busca por su tipo.
const botonIngresar = () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!

/** Elige la marca (que tiene una sola sucursal, así que queda elegida sola) y espera a que cargue. */
async function elegirRestaurante() {
  const selector = await screen.findByRole('combobox')
  await screen.findByRole('option', { name: 'La Parrilla' })
  fireEvent.change(selector, { target: { value: 'marca-1' } })
  await waitFor(() => expect(api.marca.restaurantes).toHaveBeenCalledWith('marca-1'))
  await waitFor(() => expect(botonIngresar()).toBeEnabled())
}

const escribirPin = (pin: string) =>
  fireEvent.change(screen.getByPlaceholderText('Ej: 1234'), { target: { value: pin } })
const ingresar = () => fireEvent.click(botonIngresar())

describe('IngresoManualPage', () => {
  beforeEach(() => {
    abrir.mockReset()
    sessionStorage.clear()
    useSessionStore.getState().clear()
    useSessionStore.setState({ loading: false, error: null })
    vi.mocked(api.marca.publicas).mockResolvedValue([{ id: 'marca-1', nombre: 'La Parrilla', restaurantesActivos: 1 }])
    vi.mocked(api.marca.restaurantes).mockResolvedValue([{ id: 'rest-1', nombre: 'La Parrilla Centro', direccion: null }])
  })

  it('con el restaurante y el PIN abre la sesión y va al menú', async () => {
    abrir.mockResolvedValue(crearSesionAbierta())
    renderIngreso()

    await elegirRestaurante()
    escribirPin('1234')
    ingresar()

    expect(await screen.findByText('pantalla del menú')).toBeInTheDocument()
    expect(abrir).toHaveBeenCalledWith({ pin: '1234', restauranteId: 'rest-1' })
  })

  it('sin PIN no llama al servidor y lo pide', async () => {
    renderIngreso()

    await elegirRestaurante()
    ingresar()

    expect(await screen.findByText('Ingresá el PIN de tu mesa.')).toBeInTheDocument()
    expect(abrir).not.toHaveBeenCalled()
  })

  it('con un PIN que no corresponde a ninguna mesa muestra el aviso', async () => {
    abrir.mockRejectedValue(new Error('Mesa no encontrada'))
    renderIngreso()

    await elegirRestaurante()
    escribirPin('0000')
    ingresar()

    expect(await screen.findByText('PIN incorrecto o mesa no encontrada. Verificá e intentá de nuevo.')).toBeInTheDocument()
    expect(screen.queryByText('pantalla del menú')).not.toBeInTheDocument()
  })

  it('una mesa en modo seguro con anfitrión pide el código y entra con el PIN y el restaurante elegidos', async () => {
    abrir.mockRejectedValueOnce(new Error('Esta mesa requiere código de sesión para unirse'))
    abrir.mockResolvedValueOnce(crearSesionAbierta({ modoSesion: 'seguro' }))
    renderIngreso()

    await elegirRestaurante()
    escribirPin('1234')
    ingresar()
    expect(await screen.findByText('Mesa en modo seguro')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '042' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unirme a la mesa' }))

    expect(await screen.findByText('pantalla del menú')).toBeInTheDocument()
    expect(abrir).toHaveBeenLastCalledWith({ pin: '1234', restauranteId: 'rest-1', codigoSesion: '042' })
  })
})
