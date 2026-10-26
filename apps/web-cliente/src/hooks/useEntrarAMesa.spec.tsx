import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigationType } from 'react-router-dom'
import { api, ApiError } from '../services/api'
import { useSessionStore } from '../store/sessionStore'
import { crearSesionAbierta } from '../test/fixtures'
import { useEntrarAMesa, type DatosEntrada } from './useEntrarAMesa'

vi.mock('../services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../services/api')>()),
  api: { sessions: { open: vi.fn() } },
}))

const abrir = vi.mocked(api.sessions.open)

type Opciones = Parameters<typeof useEntrarAMesa>[0]

/** Página mínima que usa el hook como lo hacen las pantallas reales: si hay una pantalla propia, la muestra. */
function Arnes({ datos, opciones }: { datos: DatosEntrada; opciones?: Opciones }) {
  const { entrar, cargando, pantalla } = useEntrarAMesa(opciones)
  if (pantalla) return pantalla
  return (
    <button disabled={cargando} onClick={() => void entrar(datos)}>
      Entrar
    </button>
  )
}

function Menu() {
  return <p>menú ({useNavigationType()})</p>
}

function renderArnes(datos: DatosEntrada, opciones?: Opciones) {
  return render(
    <MemoryRouter initialEntries={['/entrada']}>
      <Routes>
        <Route path="/entrada" element={<Arnes datos={datos} opciones={opciones} />} />
        <Route path="/menu" element={<Menu />} />
      </Routes>
    </MemoryRouter>,
  )
}

const QR: DatosEntrada = { qrToken: 'qr-1' }
const PIN: DatosEntrada = { pin: '1234', restauranteId: 'rest-1' }

const tocarEntrar = () => fireEvent.click(screen.getByRole('button', { name: 'Entrar' }))
const exigeCodigo = () => new Error('Esta mesa requiere código de sesión para unirse')

describe('useEntrarAMesa', () => {
  beforeEach(() => {
    abrir.mockReset()
    sessionStorage.clear()
    useSessionStore.getState().clear()
    useSessionStore.setState({ loading: false, error: null })
  })

  describe('mesa en modo abierto', () => {
    it('con el código del QR abre la sesión y va al menú', async () => {
      abrir.mockResolvedValue(crearSesionAbierta())
      renderArnes(QR)

      tocarEntrar()

      expect(await screen.findByText(/^menú/)).toBeInTheDocument()
      expect(abrir).toHaveBeenCalledTimes(1)
      expect(abrir).toHaveBeenCalledWith({ qrToken: 'qr-1' })
      expect(useSessionStore.getState().sesionId).toBe('ses-1')
    })

    it('con el código del QR y el restaurante elegido manda los dos (la mesa tiene que ser de ese restaurante)', async () => {
      abrir.mockResolvedValue(crearSesionAbierta())
      renderArnes({ qrToken: 'qr-1', restauranteId: 'rest-1' })

      tocarEntrar()

      expect(await screen.findByText(/^menú/)).toBeInTheDocument()
      expect(abrir).toHaveBeenCalledWith({ qrToken: 'qr-1', restauranteId: 'rest-1' })
    })

    it('con el PIN y el restaurante abre la sesión y va al menú', async () => {
      abrir.mockResolvedValue(crearSesionAbierta())
      renderArnes(PIN)

      tocarEntrar()

      expect(await screen.findByText(/^menú/)).toBeInTheDocument()
      expect(abrir).toHaveBeenCalledWith({ pin: '1234', restauranteId: 'rest-1' })
    })

    it('el anfitrión de una mesa en modo abierto va directo al menú', async () => {
      abrir.mockResolvedValue(crearSesionAbierta({ esAnfitrion: true, modoSesion: 'abierto' }))
      renderArnes(QR)

      tocarEntrar()

      expect(await screen.findByText(/^menú/)).toBeInTheDocument()
      expect(screen.queryByText('¡Sos el anfitrión de la mesa!')).not.toBeInTheDocument()
    })

    it('agrega una entrada al historial', async () => {
      abrir.mockResolvedValue(crearSesionAbierta())
      renderArnes(QR)

      tocarEntrar()

      expect(await screen.findByText('menú (PUSH)')).toBeInTheDocument()
    })

    it('con "reemplazar", el menú reemplaza la entrada actual', async () => {
      abrir.mockResolvedValue(crearSesionAbierta())
      renderArnes(QR, { reemplazar: true })

      tocarEntrar()

      expect(await screen.findByText('menú (REPLACE)')).toBeInTheDocument()
    })
  })

  describe('mesa en modo seguro', () => {
    it('el anfitrión ve el código de la mesa y después sigue al menú', async () => {
      abrir.mockResolvedValue(crearSesionAbierta({ esAnfitrion: true, modoSesion: 'seguro', codigoSesion: '731' }))
      renderArnes(QR)

      tocarEntrar()

      expect(await screen.findByText('¡Sos el anfitrión de la mesa!')).toBeInTheDocument()
      expect(screen.getByText('731')).toBeInTheDocument()
      expect(screen.queryByText(/^menú/)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Ver el menú' }))

      expect(screen.getByText('menú (PUSH)')).toBeInTheDocument()
    })

    it('el botón "Ver el menú" del anfitrión también respeta "reemplazar"', async () => {
      abrir.mockResolvedValue(crearSesionAbierta({ esAnfitrion: true, modoSesion: 'seguro' }))
      renderArnes(QR, { reemplazar: true })

      tocarEntrar()
      fireEvent.click(await screen.findByRole('button', { name: 'Ver el menú' }))

      expect(screen.getByText('menú (REPLACE)')).toBeInTheDocument()
    })

    it('si la mesa ya tiene anfitrión pide el código y, con el correcto, entra con los mismos datos del QR', async () => {
      abrir.mockRejectedValueOnce(exigeCodigo())
      abrir.mockResolvedValueOnce(crearSesionAbierta({ modoSesion: 'seguro' }))
      renderArnes(QR)

      tocarEntrar()
      expect(await screen.findByText('Mesa en modo seguro')).toBeInTheDocument()

      fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '042' } })
      fireEvent.click(screen.getByRole('button', { name: 'Unirme a la mesa' }))

      expect(await screen.findByText(/^menú/)).toBeInTheDocument()
      expect(abrir).toHaveBeenCalledTimes(2)
      expect(abrir).toHaveBeenLastCalledWith({ qrToken: 'qr-1', codigoSesion: '042' })
    })

    it('con el PIN, el reintento con el código conserva el PIN y el restaurante', async () => {
      abrir.mockRejectedValueOnce(exigeCodigo())
      abrir.mockResolvedValueOnce(crearSesionAbierta({ modoSesion: 'seguro' }))
      renderArnes(PIN)

      tocarEntrar()
      await screen.findByText('Mesa en modo seguro')
      fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '042' } })
      fireEvent.click(screen.getByRole('button', { name: 'Unirme a la mesa' }))

      await screen.findByText(/^menú/)
      expect(abrir).toHaveBeenLastCalledWith({ pin: '1234', restauranteId: 'rest-1', codigoSesion: '042' })
    })

    it('mientras envía el código informa que se está uniendo', async () => {
      abrir.mockRejectedValueOnce(exigeCodigo())
      let terminar: (valor: ReturnType<typeof crearSesionAbierta>) => void = () => {}
      abrir.mockReturnValueOnce(new Promise((resolver) => { terminar = resolver }))
      renderArnes(QR)

      tocarEntrar()
      await screen.findByText('Mesa en modo seguro')
      fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '042' } })
      fireEvent.click(screen.getByRole('button', { name: 'Unirme a la mesa' }))

      expect(await screen.findByRole('button', { name: 'Uniéndome…' })).toBeDisabled()

      terminar(crearSesionAbierta({ modoSesion: 'seguro' }))

      expect(await screen.findByText(/^menú/)).toBeInTheDocument()
    })

    it('con un código incorrecto sigue en la pantalla del código y muestra el error del servidor', async () => {
      abrir.mockRejectedValueOnce(exigeCodigo())
      abrir.mockRejectedValueOnce(new Error('Código de sesión incorrecto'))
      renderArnes(QR)

      tocarEntrar()
      await screen.findByText('Mesa en modo seguro')
      fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '999' } })
      fireEvent.click(screen.getByRole('button', { name: 'Unirme a la mesa' }))

      expect(await screen.findByText('Código de sesión incorrecto')).toBeInTheDocument()
      expect(screen.getByText('Mesa en modo seguro')).toBeInTheDocument()
      expect(screen.queryByText(/^menú/)).not.toBeInTheDocument()
    })

    it('con demasiados códigos incorrectos (429) muestra el mensaje del servidor y sigue en la pantalla del código', async () => {
      abrir.mockRejectedValueOnce(exigeCodigo())
      abrir.mockRejectedValueOnce(new ApiError('Demasiados intentos fallidos. Probá de nuevo en 15 minutos.', 429))
      renderArnes(QR)

      tocarEntrar()
      await screen.findByText('Mesa en modo seguro')
      fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '999' } })
      fireEvent.click(screen.getByRole('button', { name: 'Unirme a la mesa' }))

      expect(await screen.findByText('Demasiados intentos fallidos. Probá de nuevo en 15 minutos.')).toBeInTheDocument()
      expect(screen.getByText('Mesa en modo seguro')).toBeInTheDocument()
    })

    it('"Volver" cierra la pantalla del código y avisa a la página', async () => {
      abrir.mockRejectedValueOnce(exigeCodigo())
      const alVolver = vi.fn()
      renderArnes(QR, { alVolver })

      tocarEntrar()
      fireEvent.click(await screen.findByRole('button', { name: '← Volver' }))

      expect(screen.queryByText('Mesa en modo seguro')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
      expect(alVolver).toHaveBeenCalledTimes(1)
    })
  })

  describe('cuando no se puede entrar', () => {
    it('avisa a la página, no navega y se puede volver a intentar', async () => {
      abrir.mockRejectedValueOnce(new Error('Mesa no encontrada'))
      const alFallar = vi.fn()
      renderArnes(QR, { alFallar })

      tocarEntrar()

      await waitFor(() => expect(alFallar).toHaveBeenCalledTimes(1))
      expect(screen.queryByText(/^menú/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled()

      abrir.mockResolvedValueOnce(crearSesionAbierta())
      tocarEntrar()

      expect(await screen.findByText(/^menú/)).toBeInTheDocument()
      expect(alFallar).toHaveBeenCalledTimes(1)
    })

    it('sin conexión también avisa a la página, sin código HTTP ni mensaje', async () => {
      abrir.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      const alFallar = vi.fn()
      renderArnes(PIN, { alFallar })

      tocarEntrar()

      await waitFor(() => expect(alFallar).toHaveBeenCalledTimes(1))
      expect(alFallar).toHaveBeenCalledWith({ status: null, mensaje: null })
    })

    it.each([
      ['la mesa es de otro restaurante', 409],
      ['la mesa no existe', 404],
      ['el servidor falla', 500],
      ['hubo demasiados intentos', 429],
    ])('cuando %s, la página recibe el código HTTP (%i) y el mensaje del servidor', async (_, status) => {
      abrir.mockRejectedValueOnce(new ApiError('no se pudo', status))
      const alFallar = vi.fn()
      renderArnes(QR, { alFallar })

      tocarEntrar()

      await waitFor(() => expect(alFallar).toHaveBeenCalledTimes(1))
      expect(alFallar).toHaveBeenCalledWith({ status, mensaje: 'no se pudo' })
    })

    it('el código es el del último intento: después de un 409, una caída de red llega como sin código', async () => {
      abrir.mockRejectedValueOnce(new ApiError('Ese QR no es de este restaurante', 409))
      abrir.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      const alFallar = vi.fn()
      renderArnes(QR, { alFallar })

      tocarEntrar()
      await waitFor(() => expect(alFallar).toHaveBeenCalledTimes(1))
      tocarEntrar()
      await waitFor(() => expect(alFallar).toHaveBeenCalledTimes(2))

      expect(alFallar).toHaveBeenNthCalledWith(1, { status: 409, mensaje: 'Ese QR no es de este restaurante' })
      expect(alFallar).toHaveBeenNthCalledWith(2, { status: null, mensaje: null })
    })
  })

  it('mientras abre la sesión informa que está cargando', async () => {
    let terminar: (valor: ReturnType<typeof crearSesionAbierta>) => void = () => {}
    abrir.mockReturnValue(new Promise((resolver) => { terminar = resolver }))
    renderArnes(QR)

    tocarEntrar()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled())

    terminar(crearSesionAbierta())

    expect(await screen.findByText(/^menú/)).toBeInTheDocument()
  })
})
