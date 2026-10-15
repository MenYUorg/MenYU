import type { DiscoveryRestauranteDetalle } from '@menyu/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api, ApiError } from '../../services/api'
import { reiniciarDiscoveryStore, useDiscoveryStore } from '../../store/discoveryStore'
import { useSessionStore } from '../../store/sessionStore'
import { crearRestaurante, crearSesionAbierta } from '../../test/fixtures'
import { IngresoMesaPage } from './IngresoMesaPage'

vi.mock('../../services/api', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../services/api')>()),
  api: { discovery: { restaurante: vi.fn() }, sessions: { open: vi.fn() } },
}))

// El escáner real usa la cámara y se prueba aparte: acá importa lo que la pantalla hace con lo que entrega.
vi.mock('../../components/QrScanner', () => ({
  QrScanner: ({ onDetected, onCancel, alternativa }: {
    onDetected: (raw: string) => void
    onCancel: () => void
    alternativa: { texto: string; onElegir: () => void }
  }) => (
    <div role="dialog" aria-label="Escáner de prueba">
      <button onClick={() => onDetected('https://menyu.app/check-in?restaurantId=parrilla&tableCode=qr-9')}>Leer QR de prueba</button>
      <button onClick={onCancel}>Cerrar escáner</button>
      <button onClick={alternativa.onElegir}>{alternativa.texto}</button>
    </div>
  ),
}))

const pedirRestaurante = vi.mocked(api.discovery.restaurante)
const abrir = vi.mocked(api.sessions.open)

const PARRILLA: DiscoveryRestauranteDetalle = {
  restaurante: crearRestaurante({ id: 'parrilla', nombre: 'La Parrilla del Puerto' }),
  ofertas: [],
}

function renderPagina(ruta = '/restaurante/parrilla/mesa') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/" element={<p>inicio</p>} />
        <Route path="/restaurante/:restauranteId" element={<p>pantalla del restaurante</p>} />
        <Route path="/restaurante/:restauranteId/mesa" element={<IngresoMesaPage />} />
        <Route path="/menu" element={<p>pantalla del menú</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const campoPin = () => screen.getByLabelText('PIN de mesa')
const escribirPin = (valor: string) => fireEvent.change(campoPin(), { target: { value: valor } })
const botonPin = () => screen.getByRole('button', { name: 'Ingresar con PIN' })
const textoDelPin = () => screen.getByRole('button', { name: /Ingresá el PIN de tu mesa/ })
const tocarEscanear = () => fireEvent.click(screen.getByRole('button', { name: 'Escanear QR' }))
const leerQr = () => fireEvent.click(screen.getByRole('button', { name: 'Leer QR de prueba' }))

/** Espera a que llegue el restaurante. */
const cargada = () => screen.findByText('La Parrilla del Puerto')

// Estas dos son síncronas a propósito: lo que pasa después del click (la respuesta del servidor) tiene que ocurrir
// mientras el test espera con `findBy`, que es lo que lo envuelve en `act`.

/** Abre el escáner y lee un QR. */
function escanear() {
  tocarEscanear()
  leerQr()
}

/** Abre el campo del PIN, escribe uno y lo envía. */
function ingresarPin(pin = '4821') {
  fireEvent.click(textoDelPin())
  escribirPin(pin)
  fireEvent.click(botonPin())
}

describe('IngresoMesaPage', () => {
  beforeEach(() => {
    reiniciarDiscoveryStore()
    pedirRestaurante.mockReset().mockResolvedValue(PARRILLA)
    abrir.mockReset()
    sessionStorage.clear()
    useSessionStore.getState().clear()
    useSessionStore.setState({ loading: false, error: null, errorStatus: null })
  })

  describe('al abrirse', () => {
    it('dice a qué restaurante se está entrando', async () => {
      renderPagina()

      expect(await screen.findByText('Ingresando a')).toBeInTheDocument()
      expect(screen.getByText('La Parrilla del Puerto')).toBeInTheDocument()
      expect(pedirRestaurante).toHaveBeenCalledWith('parrilla')
    })

    it('lo principal es escanear el QR: el campo del PIN no se ofrece de entrada', async () => {
      renderPagina()
      await screen.findByText('La Parrilla del Puerto')

      expect(screen.getByRole('heading', { level: 1, name: 'Ingresar a una mesa' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Escanear QR' })).toBeEnabled()
      expect(screen.queryByLabelText('PIN de mesa')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ingresar con PIN' })).not.toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('el PIN está detrás de un texto chico que avisa que se puede desplegar', async () => {
      renderPagina()
      await screen.findByText('La Parrilla del Puerto')

      expect(textoDelPin()).toHaveAttribute('aria-expanded', 'false')
      expect(textoDelPin()).toHaveAttribute('aria-controls', 'panel-pin')
    })

    it('mientras llega el restaurante muestra el recuadro en carga y ya se puede escanear', () => {
      pedirRestaurante.mockReturnValue(new Promise(() => {}))

      renderPagina()

      expect(screen.getByLabelText('Cargando el restaurante')).toHaveAttribute('aria-busy', 'true')
      expect(screen.getByRole('button', { name: 'Escanear QR' })).toBeEnabled()
    })

    it('si el store todavía guarda otro restaurante (el de antes), no dice que se ingresa a ese', () => {
      const pedidoOriginal = useDiscoveryStore.getState().cargarRestaurante
      // El pedido no hace nada: así el store sigue con el restaurante de antes, que es lo que se ve en el primer cuadro.
      useDiscoveryStore.setState({
        cargarRestaurante: vi.fn().mockResolvedValue(undefined),
        detalle: { id: 'vito', estado: 'listo', restaurante: crearRestaurante({ id: 'vito', nombre: 'Pizzería Don Vito' }), ofertas: [] },
      })
      const { unmount } = renderPagina()

      try {
        expect(screen.getByLabelText('Cargando el restaurante')).toBeInTheDocument()
        expect(screen.queryByText('Pizzería Don Vito')).not.toBeInTheDocument()
      } finally {
        unmount()
        useDiscoveryStore.setState({ cargarRestaurante: pedidoOriginal })
      }
    })

    it('"Volver" lleva a la pantalla del restaurante', async () => {
      renderPagina()

      fireEvent.click(await screen.findByRole('link', { name: 'Volver' }))

      expect(screen.getByText('pantalla del restaurante')).toBeInTheDocument()
    })
  })

  describe('el campo del PIN', () => {
    it('aparece al tocar el texto, con el foco puesto, y el texto desaparece', async () => {
      renderPagina()
      await screen.findByText('La Parrilla del Puerto')

      fireEvent.click(textoDelPin())

      expect(campoPin()).toBeInTheDocument()
      await waitFor(() => expect(campoPin()).toHaveFocus())
      expect(screen.queryByRole('button', { name: /Ingresá el PIN de tu mesa/ })).not.toBeInTheDocument()
      // Lo abrió la persona: no hay nada que explicar con un aviso.
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('con "?pin" se abre ya, sin aviso', async () => {
      renderPagina('/restaurante/parrilla/mesa?pin')

      expect(await screen.findByLabelText('PIN de mesa')).toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('con "?pin=qr" se abre ya y avisa que el QR no abrió la mesa', async () => {
      renderPagina('/restaurante/parrilla/mesa?pin=qr')

      expect(await screen.findByLabelText('PIN de mesa')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('No pudimos abrir tu mesa con el QR. Ingresá el PIN que aparece en tu mesa.')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('solo acepta números y hasta 6', async () => {
      renderPagina('/restaurante/parrilla/mesa?pin')
      await screen.findByLabelText('PIN de mesa')

      escribirPin('a4b8-2 1')

      expect(campoPin()).toHaveValue('4821')
      expect(campoPin()).toHaveAttribute('maxlength', '6')
      expect(campoPin()).toHaveAttribute('inputmode', 'numeric')
    })

    it('con el campo vacío no llama al servidor y pide el PIN', async () => {
      renderPagina('/restaurante/parrilla/mesa?pin')
      await screen.findByLabelText('PIN de mesa')

      fireEvent.click(botonPin())

      expect(screen.getByRole('alert')).toHaveTextContent('Ingresá el PIN de tu mesa.')
      expect(abrir).not.toHaveBeenCalled()
    })

    it('con un PIN abre la mesa de este restaurante y va al menú', async () => {
      abrir.mockResolvedValue(crearSesionAbierta())
      renderPagina()

      await cargada()
      ingresarPin('4821')

      expect(await screen.findByText('pantalla del menú')).toBeInTheDocument()
      expect(abrir).toHaveBeenCalledTimes(1)
      expect(abrir).toHaveBeenCalledWith({ pin: '4821', restauranteId: 'parrilla' })
    })

    it('un PIN incorrecto avisa con el nombre del restaurante y deja corregirlo', async () => {
      abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))
      renderPagina()

      await cargada()
      ingresarPin('0000')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'PIN incorrecto o mesa no encontrada en La Parrilla del Puerto. Verificá e intentá de nuevo.',
      )
      expect(screen.queryByText('pantalla del menú')).not.toBeInTheDocument()
      expect(campoPin()).toHaveValue('0000')
      expect(botonPin()).toBeEnabled()

      escribirPin('00001')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('el aviso de un PIN siempre habla del PIN, aunque el servidor conteste con un código raro (409)', async () => {
      abrir.mockRejectedValue(new ApiError('Conflicto', 409))
      renderPagina()

      await cargada()
      ingresarPin('0000')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'PIN incorrecto o mesa no encontrada en La Parrilla del Puerto. Verificá e intentá de nuevo.',
      )
      expect(screen.queryByText(/Ese QR no es de/)).not.toBeInTheDocument()
    })

    it('sin conexión no dice que el PIN está mal', async () => {
      abrir.mockRejectedValue(new TypeError('Failed to fetch'))
      renderPagina()

      await cargada()
      ingresarPin()

      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.')
      expect(screen.queryByText(/PIN incorrecto/)).not.toBeInTheDocument()
    })

    it('mientras abre la mesa deshabilita el campo y el botón', async () => {
      abrir.mockReturnValue(new Promise(() => {}))
      renderPagina()

      await cargada()
      ingresarPin()

      expect(await screen.findByRole('button', { name: 'Ingresando...' })).toBeDisabled()
      expect(campoPin()).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Escanear QR' })).toBeDisabled()
    })
  })

  describe('escanear el QR', () => {
    it('abre el escáner y lo cierra al cancelar sin tocar nada más', async () => {
      renderPagina()
      await screen.findByText('La Parrilla del Puerto')

      tocarEscanear()
      expect(screen.getByRole('dialog', { name: 'Escáner de prueba' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Cerrar escáner' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(abrir).not.toHaveBeenCalled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('con un QR lee el código de la mesa, lo manda junto con el restaurante y va al menú', async () => {
      abrir.mockResolvedValue(crearSesionAbierta())
      renderPagina()

      await cargada()
      escanear()

      expect(await screen.findByText('pantalla del menú')).toBeInTheDocument()
      expect(abrir).toHaveBeenCalledTimes(1)
      expect(abrir).toHaveBeenCalledWith({ qrToken: 'qr-9', restauranteId: 'parrilla' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('un QR de otro restaurante (409) lo dice con el nombre de este y no abre la mesa', async () => {
      abrir.mockRejectedValue(new ApiError('Ese QR no es de este restaurante', 409))
      renderPagina()

      await cargada()
      escanear()

      expect(await screen.findByRole('alert')).toHaveTextContent('Ese QR no es de La Parrilla del Puerto. Escaneá el QR de una de sus mesas.')
      expect(screen.queryByText('pantalla del menú')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Escanear QR' })).toBeEnabled()
      // El escáner se cerró al leer: el aviso no queda tapado por la cámara.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('un QR que no abre ninguna mesa (404) sugiere probar de nuevo o usar el PIN', async () => {
      abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))
      renderPagina()

      await cargada()
      escanear()

      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos abrir tu mesa con ese QR. Probá de nuevo o ingresá el PIN de tu mesa.')
    })

    it('sin conexión no culpa al QR', async () => {
      abrir.mockRejectedValue(new TypeError('Failed to fetch'))
      renderPagina()

      await cargada()
      escanear()

      expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.')
    })

    it('al volver a escanear el aviso anterior se va', async () => {
      abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))
      renderPagina()
      await cargada()
      escanear()
      await screen.findByRole('alert')

      tocarEscanear()

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('si la cámara no sirve, "Ingresar el PIN" cierra el escáner y abre el campo con el motivo', async () => {
      renderPagina()
      await screen.findByText('La Parrilla del Puerto')
      tocarEscanear()

      fireEvent.click(screen.getByRole('button', { name: 'Ingresar el PIN de mi mesa' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByLabelText('PIN de mesa')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('No pudimos usar tu cámara. Ingresá el PIN que aparece en tu mesa.')
      await waitFor(() => expect(campoPin()).toHaveFocus())
    })

    it('si el PIN falla estando abierto por "?pin=qr", el error reemplaza al aviso del motivo (no se muestran los dos)', async () => {
      abrir.mockRejectedValue(new ApiError('Mesa no encontrada', 404))
      renderPagina('/restaurante/parrilla/mesa?pin=qr')
      await screen.findByText('La Parrilla del Puerto')

      escribirPin('1234')
      fireEvent.click(botonPin())

      const aviso = await screen.findByRole('alert')
      expect(aviso).toHaveTextContent('PIN incorrecto')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  describe('mesa en modo seguro', () => {
    it('el anfitrión ve el código de la mesa antes de seguir al menú', async () => {
      abrir.mockResolvedValue(crearSesionAbierta({ esAnfitrion: true, modoSesion: 'seguro', codigoSesion: '731' }))
      renderPagina()

      await cargada()
      escanear()

      expect(await screen.findByText('¡Sos el anfitrión de la mesa!')).toBeInTheDocument()
      expect(screen.getByText('731')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Ver el menú' }))

      expect(screen.getByText('pantalla del menú')).toBeInTheDocument()
    })

    it('si la mesa pide código, entra con el correcto y conserva el QR y el restaurante', async () => {
      abrir.mockRejectedValueOnce(new Error('Esta mesa requiere código de sesión para unirse'))
      abrir.mockResolvedValueOnce(crearSesionAbierta({ modoSesion: 'seguro' }))
      renderPagina()

      await cargada()
      escanear()
      await screen.findByText('Mesa en modo seguro')
      fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '042' } })
      fireEvent.click(screen.getByRole('button', { name: 'Unirme a la mesa' }))

      expect(await screen.findByText('pantalla del menú')).toBeInTheDocument()
      expect(abrir).toHaveBeenLastCalledWith({ qrToken: 'qr-9', restauranteId: 'parrilla', codigoSesion: '042' })
    })

    it('con el PIN también: el reintento con el código conserva el PIN y el restaurante', async () => {
      abrir.mockRejectedValueOnce(new Error('Esta mesa requiere código de sesión para unirse'))
      abrir.mockResolvedValueOnce(crearSesionAbierta({ modoSesion: 'seguro' }))
      renderPagina()

      await cargada()
      ingresarPin('4821')
      await screen.findByText('Mesa en modo seguro')
      fireEvent.change(screen.getByPlaceholderText('000'), { target: { value: '042' } })
      fireEvent.click(screen.getByRole('button', { name: 'Unirme a la mesa' }))

      await screen.findByText('pantalla del menú')
      expect(abrir).toHaveBeenLastCalledWith({ pin: '4821', restauranteId: 'parrilla', codigoSesion: '042' })
    })
  })

  describe('cuando no se pudo cargar el restaurante', () => {
    it('uno que no existe (404) lo dice, ofrece volver al inicio y no deja entrar a ninguna mesa', async () => {
      pedirRestaurante.mockRejectedValue(new ApiError('Restaurante no encontrado', 404))

      renderPagina('/restaurante/no-existe/mesa')

      expect(await screen.findByText('No encontramos este restaurante')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Escanear QR' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText('PIN de mesa')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('link', { name: 'Volver' }))

      expect(screen.getByText('inicio')).toBeInTheDocument()
    })

    it('"Volver al inicio" también lleva al inicio', async () => {
      pedirRestaurante.mockRejectedValue(new ApiError('Restaurante no encontrado', 404))
      renderPagina('/restaurante/no-existe/mesa')

      fireEvent.click(await screen.findByRole('button', { name: 'Volver al inicio' }))

      expect(screen.getByText('inicio')).toBeInTheDocument()
    })

    it('sin conexión la pantalla sigue sirviendo para entrar, hablando de "este restaurante"', async () => {
      pedirRestaurante.mockRejectedValue(new TypeError('Failed to fetch'))
      abrir.mockRejectedValue(new ApiError('Ese QR no es de este restaurante', 409))
      renderPagina()
      await screen.findByText('Ingresando a')

      tocarEscanear()
      leerQr()

      const aviso = await screen.findByRole('alert')
      expect(within(aviso).getByText(/Ese QR no es de este restaurante\./)).toBeInTheDocument()
    })
  })
})
