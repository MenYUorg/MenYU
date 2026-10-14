import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigationType } from 'react-router-dom'
import { api } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'
import { crearSesionAbierta } from '../../test/fixtures'
import CheckInRedirectPage from './CheckInRedirectPage'

vi.mock('../../services/api', () => ({
  api: { sessions: { open: vi.fn() } },
}))

const abrir = vi.mocked(api.sessions.open)

function Destino({ nombre }: { nombre: string }) {
  return <p>{nombre} ({useNavigationType()})</p>
}

// El QR impreso de una mesa lleva este link.
const LINK_DE_LA_MESA = '/check-in?restaurantId=rest-1&tableCode=qr-1'

function renderCheckIn(url = LINK_DE_LA_MESA, { estricto = false } = {}) {
  const arbol = (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/check-in" element={<CheckInRedirectPage />} />
        <Route path="/menu" element={<Destino nombre="menú" />} />
        <Route path="/" element={<Destino nombre="inicio" />} />
      </Routes>
    </MemoryRouter>
  )
  return render(estricto ? <StrictMode>{arbol}</StrictMode> : arbol)
}

describe('CheckInRedirectPage', () => {
  beforeEach(() => {
    abrir.mockReset()
    sessionStorage.clear()
    useSessionStore.getState().clear()
    useSessionStore.setState({ loading: false, error: null })
  })

  it('abre la mesa con el código del link y va al menú sin dejar el link en el historial', async () => {
    abrir.mockResolvedValue(crearSesionAbierta())

    renderCheckIn()

    expect(await screen.findByText('menú (REPLACE)')).toBeInTheDocument()
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(abrir).toHaveBeenCalledWith({ qrToken: 'qr-1' })
  })

  it('un link sin código de mesa vuelve al inicio sin llamar al servidor', async () => {
    renderCheckIn('/check-in?restaurantId=rest-1')

    expect(await screen.findByText('inicio (REPLACE)')).toBeInTheDocument()
    expect(abrir).not.toHaveBeenCalled()
  })

  it('si ya hay una sesión abierta va directo al menú sin abrir otra', async () => {
    useSessionStore.setState({ sesionId: 'ses-0', restauranteId: 'rest-1' })

    renderCheckIn()

    expect(await screen.findByText('menú (REPLACE)')).toBeInTheDocument()
    expect(abrir).not.toHaveBeenCalled()
  })

  it('si la mesa no se puede abrir vuelve al inicio', async () => {
    abrir.mockRejectedValue(new Error('Mesa no encontrada'))

    renderCheckIn()

    expect(await screen.findByText('inicio (REPLACE)')).toBeInTheDocument()
    expect(screen.queryByText(/^menú/)).not.toBeInTheDocument()
  })

  it('el anfitrión de una mesa en modo seguro ve el código antes de entrar al menú', async () => {
    abrir.mockResolvedValue(crearSesionAbierta({ esAnfitrion: true, modoSesion: 'seguro', codigoSesion: '731' }))

    renderCheckIn()

    expect(await screen.findByText('¡Sos el anfitrión de la mesa!')).toBeInTheDocument()
    expect(screen.getByText('731')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver el menú' }))

    expect(screen.getByText('menú (REPLACE)')).toBeInTheDocument()
  })

  it('una mesa en modo seguro con anfitrión pide el código y entra con el correcto', async () => {
    abrir.mockRejectedValueOnce(new Error('Esta mesa requiere código de sesión para unirse'))
    abrir.mockResolvedValueOnce(crearSesionAbierta({ modoSesion: 'seguro' }))

    renderCheckIn()

    expect(await screen.findByText('Mesa en modo seguro')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '042' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unirme a la mesa' }))

    expect(await screen.findByText('menú (REPLACE)')).toBeInTheDocument()
    expect(abrir).toHaveBeenLastCalledWith({ qrToken: 'qr-1', codigoSesion: '042' })
  })

  it('"Volver" en la pantalla del código lleva al inicio', async () => {
    abrir.mockRejectedValue(new Error('Esta mesa requiere código de sesión para unirse'))

    renderCheckIn()
    fireEvent.click(await screen.findByRole('button', { name: '← Volver' }))

    expect(await screen.findByText('inicio (REPLACE)')).toBeInTheDocument()
  })

  it('en desarrollo (StrictMode corre el efecto dos veces) abre la sesión una sola vez', async () => {
    abrir.mockResolvedValue(crearSesionAbierta())

    renderCheckIn(LINK_DE_LA_MESA, { estricto: true })

    await waitFor(() => expect(screen.getByText('menú (REPLACE)')).toBeInTheDocument())
    expect(abrir).toHaveBeenCalledTimes(1)
  })
})
