import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigationType } from 'react-router-dom'
import { api, ApiError } from '../../services/api'
import { useSessionStore } from '../../store/sessionStore'
import { crearSesionAbierta } from '../../test/fixtures'
import CheckInRedirectPage from './CheckInRedirectPage'

vi.mock('../../services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../services/api')>()),
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
        <Route path="/restaurante/:restauranteId/mesa" element={<Destino nombre="ingreso a mesa" />} />
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

  it('abre la mesa con el código y el restaurante del link y va al menú sin dejar el link en el historial', async () => {
    abrir.mockResolvedValue(crearSesionAbierta())

    renderCheckIn()

    expect(await screen.findByText('menú (REPLACE)')).toBeInTheDocument()
    expect(abrir).toHaveBeenCalledTimes(1)
    // Con el restaurante, el servidor comprueba que la mesa sea de ese restaurante (409 si no).
    expect(abrir).toHaveBeenCalledWith({ qrToken: 'qr-1', restauranteId: 'rest-1' })
  })

  it('un link sin restaurante abre la mesa solo con el código', async () => {
    abrir.mockResolvedValue(crearSesionAbierta())

    renderCheckIn('/check-in?tableCode=qr-1')

    expect(await screen.findByText('menú (REPLACE)')).toBeInTheDocument()
    expect(abrir.mock.calls[0]?.[0]).toStrictEqual({ qrToken: 'qr-1' })
  })

  it('un link sin código de mesa lo dice sin llamar al servidor (ni mostrar "Abriendo tu mesa…")', () => {
    renderCheckIn('/check-in?restaurantId=rest-1')

    expect(screen.getByRole('heading', { name: 'No pudimos abrir tu mesa' })).toBeInTheDocument()
    expect(screen.queryByText('Abriendo tu mesa…')).not.toBeInTheDocument()
    expect(abrir).not.toHaveBeenCalled()
  })

  describe('con una sesión guardada y el código de la mesa en el link', () => {
    beforeEach(() => {
      // Puede ser una sesión que ya se cerró: el id guardado no lo dice.
      useSessionStore.setState({ sesionId: 'ses-0', restauranteId: 'rest-1', codigoSesion: '999', modoSesion: 'seguro' })
    })

    it('igual abre la mesa (si la sesión ya se cerró, el servidor abre otra), sin el código de sesión guardado', async () => {
      abrir.mockResolvedValue(crearSesionAbierta({ sesionId: 'ses-1' }))

      renderCheckIn()

      expect(await screen.findByText('menú (REPLACE)')).toBeInTheDocument()
      expect(abrir).toHaveBeenCalledTimes(1)
      expect(abrir.mock.calls[0]?.[0]).toStrictEqual({ qrToken: 'qr-1', restauranteId: 'rest-1' })
      expect(useSessionStore.getState().sesionId).toBe('ses-1')
    })

    it('si no se puede abrir, dice por qué en lugar de mandar al menú de la sesión guardada', async () => {
      abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))

      renderCheckIn()

      expect(await screen.findByRole('heading', { name: 'No pudimos abrir tu mesa' })).toBeInTheDocument()
      expect(screen.queryByText(/^menú/)).not.toBeInTheDocument()
    })
  })

  it('con una sesión ya abierta y un link sin código de mesa también va al menú (sin mostrar el error)', async () => {
    useSessionStore.setState({ sesionId: 'ses-0', restauranteId: 'rest-1' })

    renderCheckIn('/check-in?restaurantId=rest-1')

    expect(await screen.findByText('menú (REPLACE)')).toBeInTheDocument()
    expect(screen.queryByText('No pudimos abrir tu mesa')).not.toBeInTheDocument()
  })

  it('con una sesión abierta y un link sin código de mesa ni siquiera llega a pintar el error: pasa de largo hacia el menú', async () => {
    useSessionStore.setState({ sesionId: 'ses-0', restauranteId: 'rest-1' })
    // `render` junta todos los cuadros en uno solo: lo que se pintó en el camino se ve en lo que se fue agregando al DOM.
    const pintado: string[] = []
    const anotar = (registros: MutationRecord[]) => registros.forEach((r) => r.addedNodes.forEach((n) => pintado.push(n.textContent ?? '')))
    const observador = new MutationObserver(anotar)
    observador.observe(document.body, { childList: true, subtree: true })

    renderCheckIn('/check-in?restaurantId=rest-1')
    await screen.findByText('menú (REPLACE)')
    anotar(observador.takeRecords())
    observador.disconnect()

    expect(pintado.join(' | ')).not.toContain('No pudimos abrir tu mesa')
  })

  describe('mientras abre la mesa', () => {
    it('muestra "Abriendo tu mesa…" (antes quedaba en blanco) y no un error', () => {
      abrir.mockReturnValue(new Promise(() => {}))

      renderCheckIn()

      expect(screen.getByText('Abriendo tu mesa…')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Esto tarda solo unos segundos.')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('al abrirse, la pantalla se va y sigue el menú', async () => {
      abrir.mockResolvedValue(crearSesionAbierta())

      renderCheckIn()
      expect(screen.getByText('Abriendo tu mesa…')).toBeInTheDocument()

      expect(await screen.findByText('menú (REPLACE)')).toBeInTheDocument()
      expect(screen.queryByText('Abriendo tu mesa…')).not.toBeInTheDocument()
    })
  })

  describe('cuando el QR no abre una mesa (el servidor responde que no)', () => {
    it.each([
      ['la mesa no existe', 404],
      ['el pedido es inválido', 400],
      ['la mesa es de otro restaurante', 409],
    ])('%s (%i): lo dice, ofrece el PIN como salida principal y no ofrece reintentar', async (_, status) => {
      abrir.mockRejectedValue(new ApiError('no se pudo', status))

      renderCheckIn()

      expect(await screen.findByRole('heading', { name: 'No pudimos abrir tu mesa' })).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('El QR no corresponde a una mesa activa')
      expect(screen.getByRole('link', { name: 'Ingresar con el PIN de mi mesa' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
      // Dejó de decir "Abriendo tu mesa…": ya no se está abriendo.
      expect(screen.queryByText('Abriendo tu mesa…')).not.toBeInTheDocument()
      expect(screen.queryByText(/^menú/)).not.toBeInTheDocument()
    })

    it('el PIN lleva a la pantalla de ingreso a mesa del restaurante del link, con el campo abierto por haber fallado el QR', async () => {
      abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))
      renderCheckIn()

      const enlace = await screen.findByRole('link', { name: 'Ingresar con el PIN de mi mesa' })

      expect(enlace).toHaveAttribute('href', '/restaurante/rest-1/mesa?pin=qr')
      fireEvent.click(enlace)
      // Reemplaza la entrada: "atrás" desde ahí no vuelve a abrir el link del QR.
      expect(screen.getByText('ingreso a mesa (REPLACE)')).toBeInTheDocument()
    })

    it('el id del restaurante del link se escribe seguro en la dirección', async () => {
      abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))
      renderCheckIn('/check-in?restaurantId=a%2Fb%3Fc&tableCode=qr-1')

      const enlace = await screen.findByRole('link', { name: 'Ingresar con el PIN de mi mesa' })

      expect(enlace).toHaveAttribute('href', '/restaurante/a%2Fb%3Fc/mesa?pin=qr')
    })

    it('sin restaurante en el link no se sabe de quién es la mesa: hay que elegirlo en la lista', async () => {
      abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))
      renderCheckIn('/check-in?tableCode=qr-1')

      const enlace = await screen.findByRole('link', { name: 'Elegir mi restaurante' })

      expect(enlace).toHaveAttribute('href', '/')
      expect(screen.getByText('Elegí tu restaurante en la lista e ingresá con el PIN de tu mesa.')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Ingresar con el PIN de mi mesa' })).not.toBeInTheDocument()
    })

    it('"Ir al inicio" vuelve al inicio sin dejar el link en el historial', async () => {
      abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))
      renderCheckIn()

      fireEvent.click(await screen.findByRole('link', { name: 'Ir al inicio' }))

      expect(screen.getByText('inicio (REPLACE)')).toBeInTheDocument()
    })

    it('el PIN es el botón naranja (el principal) y no hay un párrafo vacío bajo el logo', async () => {
      abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))
      renderCheckIn()

      const pin = await screen.findByRole('link', { name: 'Ingresar con el PIN de mi mesa' })

      expect(pin).toHaveStyle({ backgroundColor: 'rgb(232, 86, 58)' })
      // La tarjeta es: franja con el logo y, después, el aviso. Sin subtítulo, la franja queda con solo el logo.
      const franja = screen.getByRole('alert').parentElement?.firstElementChild as HTMLElement
      expect(franja.querySelector('p')).toBeNull()
    })

    it('un link sin código de mesa ofrece lo mismo: el PIN y no reintentar', () => {
      renderCheckIn('/check-in?restaurantId=rest-1')

      expect(screen.getByRole('link', { name: 'Ingresar con el PIN de mi mesa' })).toHaveAttribute('href', '/restaurante/rest-1/mesa?pin=qr')
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
    })
  })

  describe('cuando el restaurante está dado de baja (el servidor responde 403)', () => {
    beforeEach(() => {
      abrir.mockRejectedValue(new ApiError('Este restaurante no está disponible', 403))
    })

    it('lo dice, no culpa al QR y no ofrece ni el PIN ni reintentar (con el PIN daría lo mismo)', async () => {
      renderCheckIn()

      expect(await screen.findByRole('heading', { name: 'Este restaurante no está disponible' })).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Por ahora no se pueden abrir mesas en este restaurante')
      expect(screen.queryByText('No pudimos abrir tu mesa')).not.toBeInTheDocument()
      expect(screen.queryByText(/El QR no corresponde/)).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Ingresar con el PIN de mi mesa' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Elegir mi restaurante' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
      expect(screen.queryByText('Abriendo tu mesa…')).not.toBeInTheDocument()
    })

    it('la salida es un solo "Ir al inicio", el botón naranja (el principal), que no deja el link en el historial', async () => {
      renderCheckIn()

      const salida = await screen.findByRole('link', { name: 'Ir al inicio' })

      expect(screen.getAllByRole('link', { name: 'Ir al inicio' })).toHaveLength(1)
      expect(salida).toHaveStyle({ backgroundColor: 'rgb(232, 86, 58)' })
      fireEvent.click(salida)
      expect(screen.getByText('inicio (REPLACE)')).toBeInTheDocument()
    })

    it('es lo mismo sin restaurante en el link (no hace falta saber de quién era la mesa)', async () => {
      renderCheckIn('/check-in?tableCode=qr-1')

      expect(await screen.findByRole('heading', { name: 'Este restaurante no está disponible' })).toBeInTheDocument()
    })

    it('un 500 no se confunde con una baja: sigue ofreciendo reintentar', async () => {
      abrir.mockRejectedValue(new ApiError('Error 500', 500))
      renderCheckIn()

      expect(await screen.findByRole('heading', { name: 'No pudimos conectarnos' })).toBeInTheDocument()
      expect(screen.queryByText('Este restaurante no está disponible')).not.toBeInTheDocument()
    })
  })

  describe('cuando no hubo respuesta del servidor', () => {
    it.each([
      ['sin conexión', new TypeError('Failed to fetch')],
      ['el servidor falla (500)', new ApiError('Error 500', 500)],
      ['el servidor falla (503)', new ApiError('Error 503', 503)],
      ['demasiados pedidos (429)', new ApiError('Too many requests', 429)],
    ])('%s: avisa que no pudo conectarse, con "Reintentar" primero y el PIN como segunda salida', async (_, error) => {
      abrir.mockRejectedValue(error)

      renderCheckIn()

      expect(await screen.findByRole('heading', { name: 'No pudimos conectarnos' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ingresar con el PIN de mi mesa' })).toBeInTheDocument()
      expect(screen.queryByText('No pudimos abrir tu mesa')).not.toBeInTheDocument()
    })

    it('"Reintentar" es el botón naranja (el principal) y el PIN queda como botón blanco con borde', async () => {
      abrir.mockRejectedValue(new TypeError('Failed to fetch'))
      renderCheckIn()

      const reintentar = await screen.findByRole('button', { name: 'Reintentar' })
      const pin = screen.getByRole('link', { name: 'Ingresar con el PIN de mi mesa' })

      expect(reintentar).toHaveStyle({ backgroundColor: 'rgb(232, 86, 58)' })
      expect(pin).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' })
    })

    it('"Reintentar" vuelve a abrir con el mismo código, mientras tanto muestra "Abriendo tu mesa…" y al abrirse sigue el menú', async () => {
      abrir.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      let terminar: (valor: ReturnType<typeof crearSesionAbierta>) => void = () => {}
      abrir.mockReturnValueOnce(new Promise((resolver) => { terminar = resolver }))
      renderCheckIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

      expect(screen.getByText('Abriendo tu mesa…')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
      expect(abrir).toHaveBeenCalledTimes(2)
      expect(abrir).toHaveBeenLastCalledWith({ qrToken: 'qr-1', restauranteId: 'rest-1' })

      terminar(crearSesionAbierta())

      expect(await screen.findByText('menú (REPLACE)')).toBeInTheDocument()
    })

    it('si el reintento también falla, vuelve a mostrar el aviso (y se puede volver a reintentar)', async () => {
      abrir.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      abrir.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      renderCheckIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

      expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
      expect(abrir).toHaveBeenCalledTimes(2)
    })

    it('si el reintento responde que esa mesa no existe, pasa al aviso del QR (sin "Reintentar")', async () => {
      abrir.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      abrir.mockRejectedValueOnce(new ApiError('Mesa no encontrada', 404))
      renderCheckIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

      expect(await screen.findByRole('heading', { name: 'No pudimos abrir tu mesa' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
    })

    it('después de reintentar, una mesa en modo seguro sigue por su pantalla del código', async () => {
      abrir.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      abrir.mockRejectedValueOnce(new Error('Esta mesa requiere código de sesión para unirse'))
      renderCheckIn()

      fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

      expect(await screen.findByText('Mesa en modo seguro')).toBeInTheDocument()
    })

    it('el PIN lleva a la pantalla de ingreso a mesa del restaurante del link', async () => {
      abrir.mockRejectedValue(new TypeError('Failed to fetch'))
      renderCheckIn()

      fireEvent.click(await screen.findByRole('link', { name: 'Ingresar con el PIN de mi mesa' }))

      expect(screen.getByText('ingreso a mesa (REPLACE)')).toBeInTheDocument()
    })

    it('sin restaurante en el link, "Elegir mi restaurante" lleva a la lista', async () => {
      abrir.mockRejectedValue(new TypeError('Failed to fetch'))
      renderCheckIn('/check-in?tableCode=qr-1')

      fireEvent.click(await screen.findByRole('link', { name: 'Elegir mi restaurante' }))

      expect(screen.getByText('inicio (REPLACE)')).toBeInTheDocument()
    })
  })

  it('el anfitrión de una mesa en modo seguro ve el código antes de entrar al menú', async () => {
    abrir.mockResolvedValue(crearSesionAbierta({ esAnfitrion: true, modoSesion: 'seguro', codigoSesion: '731' }))

    renderCheckIn()

    expect(await screen.findByText('¡Sos el anfitrión de la mesa!')).toBeInTheDocument()
    // La tarjeta del modo seguro conserva su subtítulo de siempre.
    expect(screen.getByText('Abriendo tu mesa…')).toBeInTheDocument()
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
    expect(abrir).toHaveBeenLastCalledWith({ qrToken: 'qr-1', restauranteId: 'rest-1', codigoSesion: '042' })
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

  it('en desarrollo (StrictMode), si falla, también se pide una sola vez y se muestra un solo aviso', async () => {
    abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))

    renderCheckIn(LINK_DE_LA_MESA, { estricto: true })

    expect(await screen.findByRole('heading', { name: 'No pudimos abrir tu mesa' })).toBeInTheDocument()
    expect(abrir).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})
