import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'
import { crearSesionAbierta } from '../../test/fixtures'
import { EntradaPage } from './EntradaPage'

vi.mock('../../services/api', () => ({
  api: { sessions: { open: vi.fn() } },
}))

// El escáner real usa la cámara; acá solo importa lo que la pantalla hace con lo que él entrega.
vi.mock('../../components/QrScanner', () => ({
  QrScanner: ({ onDetected, onCancel }: { onDetected: (raw: string) => void; onCancel: () => void }) => (
    <div>
      <button onClick={() => onDetected('https://menyu.app/check-in?restaurantId=rest-1&tableCode=qr-9')}>Leer QR de prueba</button>
      <button onClick={onCancel}>Cerrar escáner</button>
    </div>
  ),
}))

const abrir = vi.mocked(api.sessions.open)

function renderEntrada() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<EntradaPage />} />
        <Route path="/menu" element={<p>pantalla del menú</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const escanear = () => fireEvent.click(screen.getByRole('button', { name: 'Escanear QR' }))

describe('EntradaPage', () => {
  beforeEach(() => {
    abrir.mockReset()
    sessionStorage.clear()
    useSessionStore.getState().clear()
    useSessionStore.setState({ loading: false, error: null })
  })

  it('"Escanear QR" abre el escáner y se puede cerrar', () => {
    renderEntrada()

    expect(screen.queryByText('Leer QR de prueba')).not.toBeInTheDocument()
    escanear()
    expect(screen.getByText('Leer QR de prueba')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar escáner' }))

    expect(screen.queryByText('Leer QR de prueba')).not.toBeInTheDocument()
  })

  it('al leer el QR abre la sesión con el código de la mesa y va al menú', async () => {
    abrir.mockResolvedValue(crearSesionAbierta())
    renderEntrada()

    escanear()
    fireEvent.click(screen.getByText('Leer QR de prueba'))

    expect(await screen.findByText('pantalla del menú')).toBeInTheDocument()
    expect(abrir).toHaveBeenCalledWith({ qrToken: 'qr-9' })
  })

  it('si la sesión no se puede abrir muestra el aviso y se puede volver a escanear', async () => {
    abrir.mockRejectedValue(new Error('Mesa no encontrada'))
    renderEntrada()

    escanear()
    fireEvent.click(screen.getByText('Leer QR de prueba'))

    expect(await screen.findByText('No se pudo abrir la sesión. Intentá de nuevo.')).toBeInTheDocument()
    expect(screen.queryByText('Leer QR de prueba')).not.toBeInTheDocument()

    escanear()

    expect(screen.queryByText('No se pudo abrir la sesión. Intentá de nuevo.')).not.toBeInTheDocument()
    expect(screen.getByText('Leer QR de prueba')).toBeInTheDocument()
  })

  it('una mesa en modo seguro con anfitrión pide el código y vuelve a la pantalla con "Volver"', async () => {
    abrir.mockRejectedValue(new Error('Esta mesa requiere código de sesión para unirse'))
    renderEntrada()

    escanear()
    fireEvent.click(screen.getByText('Leer QR de prueba'))
    fireEvent.click(await screen.findByRole('button', { name: '← Volver' }))

    expect(screen.getByRole('button', { name: 'Escanear QR' })).toBeInTheDocument()
  })
})
