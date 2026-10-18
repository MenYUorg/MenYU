import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { crearLector } from '../utils/lectorQr'
import { QrScanner } from './QrScanner'

// El lector (nativo o jsqr) se prueba aparte en lectorQr.spec: acá es un doble que dice qué "ve" la cámara.
vi.mock('../utils/lectorQr', () => ({ crearLector: vi.fn() }))

const crearLectorMock = vi.mocked(crearLector)
const leer = vi.fn<(video: HTMLVideoElement) => Promise<string | null>>()

/** Pista de video falsa: se puede "cortar" como cuando otra aplicación toma la cámara. */
function crearPista() {
  const oyentes = new Set<() => void>()
  return {
    stop: vi.fn(),
    addEventListener: vi.fn((tipo: string, oyente: () => void) => { if (tipo === 'ended') oyentes.add(oyente) }),
    removeEventListener: vi.fn((tipo: string, oyente: () => void) => { if (tipo === 'ended') oyentes.delete(oyente) }),
    cortar: () => oyentes.forEach((oyente) => oyente()),
  }
}

function crearFlujo() {
  const pista = crearPista()
  const flujo = { getTracks: () => [pista], getVideoTracks: () => [pista] } as unknown as MediaStream
  return { pista, flujo }
}

/** `navigator.mediaDevices` falso. Sin argumento entrega una cámara que anda. */
function instalarCamara(abrir?: () => Promise<MediaStream>) {
  const { pista, flujo } = crearFlujo()
  const pedirCamara = vi.fn(abrir ?? (() => Promise.resolve(flujo)))
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: pedirCamara }, configurable: true })
  return { pista, flujo, pedirCamara }
}

const rechazo = (nombre: string) => () => Promise.reject(new DOMException('mensaje del navegador', nombre))

const alternativa = () => ({ texto: 'Ingresar el PIN de mi mesa', onElegir: vi.fn() })

function renderEscaner(props: Partial<React.ComponentProps<typeof QrScanner>> = {}) {
  const propios = { onDetected: vi.fn(), onCancel: vi.fn(), alternativa: alternativa(), ...props }
  return { ...render(<QrScanner {...propios} />), ...propios }
}

const avanzar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

/** Con el tiempo simulado: abre el escáner y deja que la cámara responda y empiece a leer (React dibuja al terminar el act). */
async function abrirYEmpezar(props: Partial<React.ComponentProps<typeof QrScanner>> = {}) {
  const abierto = renderEscaner(props)
  await avanzar(0)
  return abierto
}
const dialogo = () => screen.getByRole('dialog')
const estado = () => dialogo().getAttribute('data-estado')
const boton = (nombre: string) => screen.getByRole('button', { name: nombre })

describe('QrScanner', () => {
  beforeEach(() => {
    // jsdom no reproduce video: el cuadro "está listo" para que se lea.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4)
    leer.mockReset().mockResolvedValue(null)
    crearLectorMock.mockReset().mockResolvedValue({ leer })
  })

  afterEach(() => {
    // Desmontar antes de restaurar los mocks: si un efecto del video quedó pendiente, corre todavía con `play` simulado.
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'mediaDevices')
  })

  describe('al abrirse', () => {
    it('pide la cámara trasera (la que haya si no tiene) sin audio', () => {
      const { pedirCamara } = instalarCamara(() => new Promise<MediaStream>(() => {}))

      renderEscaner()

      expect(pedirCamara).toHaveBeenCalledTimes(1)
      expect(pedirCamara).toHaveBeenCalledWith({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
    })

    it('mientras se decide el permiso explica qué hacer y solo ofrece cancelar', () => {
      instalarCamara(() => new Promise<MediaStream>(() => {}))

      renderEscaner()

      expect(estado()).toBe('esperando')
      expect(screen.getByRole('heading', { name: 'Permití el acceso a la cámara' })).toBeInTheDocument()
      expect(screen.getByText(/tocá "Permitir"/)).toBeInTheDocument()
      expect(screen.getByRole('img', { name: 'Esperando el permiso' })).toBeInTheDocument()
      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancelar'])
    })

    it('es un diálogo con nombre', () => {
      instalarCamara(() => new Promise<MediaStream>(() => {}))

      renderEscaner()

      expect(screen.getByRole('dialog', { name: 'Permití el acceso a la cámara' })).toHaveAttribute('aria-modal', 'true')
    })

    it('prepara el lector recién cuando la cámara arranca (sin cámara no hace falta)', async () => {
      let entregar: (flujo: MediaStream) => void = () => {}
      const { flujo } = crearFlujo()
      instalarCamara(() => new Promise<MediaStream>((resolver) => { entregar = resolver }))

      renderEscaner()
      expect(crearLectorMock).not.toHaveBeenCalled()

      await act(async () => { entregar(flujo) })

      expect(crearLectorMock).toHaveBeenCalledTimes(1)
    })

    it('si se rechaza el permiso no se prepara el lector', async () => {
      renderEscanerConRechazo('NotAllowedError')
      await screen.findByRole('heading', { name: 'No pudimos usar tu cámara' })

      expect(crearLectorMock).not.toHaveBeenCalled()
    })

    it('con el permiso muestra la imagen de la cámara con las instrucciones', async () => {
      const { flujo } = instalarCamara()

      renderEscaner()

      expect(await screen.findByRole('heading', { name: 'Apuntá la cámara al QR de la mesa' })).toBeInTheDocument()
      expect(screen.getByText(/Mantené el celular firme/)).toBeInTheDocument()
      expect(estado()).toBe('escaneando')
      const video = screen.getByLabelText('Imagen de la cámara') as HTMLVideoElement
      expect(video.srcObject).toBe(flujo)
      expect(video).toHaveAttribute('playsinline')
      expect(video.muted).toBe(true)
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled()
      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancelar'])
    })
  })

  describe('lectura del QR', () => {
    beforeEach(() => { vi.useFakeTimers() })

    it('avisa con el texto del QR cuando el lector lo encuentra y apaga la cámara', async () => {
      const { pista } = instalarCamara()
      leer.mockResolvedValueOnce(null).mockResolvedValueOnce('https://menyu.app/check-in?tableCode=abc')
      const { onDetected } = await abrirYEmpezar()

      await avanzar(1000)

      expect(onDetected).toHaveBeenCalledTimes(1)
      expect(onDetected).toHaveBeenCalledWith('https://menyu.app/check-in?tableCode=abc')
      expect(pista.stop).toHaveBeenCalled()
    })

    it('después de leer no sigue leyendo', async () => {
      instalarCamara()
      leer.mockResolvedValue('abc')
      await abrirYEmpezar()

      await avanzar(3000)

      expect(leer).toHaveBeenCalledTimes(1)
    })

    it('mientras no hay un QR sigue mirando, sin avisar y con la cámara prendida', async () => {
      const { pista } = instalarCamara()
      const { onDetected } = await abrirYEmpezar()

      await avanzar(1000)

      expect(leer.mock.calls.length).toBeGreaterThan(3)
      expect(onDetected).not.toHaveBeenCalled()
      expect(pista.stop).not.toHaveBeenCalled()
    })

    it('no empieza una lectura nueva mientras la anterior sigue pendiente', async () => {
      instalarCamara()
      const terminar: Array<(texto: string | null) => void> = []
      leer.mockImplementation(() => new Promise((resolver) => { terminar.push(resolver) }))
      const { onDetected } = await abrirYEmpezar()

      await avanzar(2000)
      expect(leer).toHaveBeenCalledTimes(1)

      await act(async () => { terminar[0]?.(null) })
      await avanzar(500)
      expect(leer.mock.calls.length).toBeGreaterThan(1)
      expect(onDetected).not.toHaveBeenCalled()
    })

    it('si una lectura pendiente termina cuando ya se cerró, no avisa', async () => {
      instalarCamara()
      let terminar: (texto: string | null) => void = () => {}
      leer.mockImplementation(() => new Promise((resolver) => { terminar = resolver }))
      const { onDetected, unmount } = await abrirYEmpezar()
      await avanzar(300)

      unmount()
      await act(async () => { terminar('abc') })

      expect(onDetected).not.toHaveBeenCalled()
    })

    it('no mira el cuadro hasta que el video está listo', async () => {
      vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(1)
      instalarCamara()
      const { onDetected } = await abrirYEmpezar()

      await avanzar(1000)

      expect(leer).not.toHaveBeenCalled()
      expect(onDetected).not.toHaveBeenCalled()
    })

    it('un cuadro que no se pudo leer no corta el escaneo', async () => {
      instalarCamara()
      leer.mockRejectedValueOnce(new Error('cuadro inválido')).mockResolvedValueOnce('abc')
      const { onDetected } = await abrirYEmpezar()

      await avanzar(1000)

      expect(onDetected).toHaveBeenCalledWith('abc')
    })

    it('si el lector no se puede preparar, avisa que el navegador no puede y apaga la cámara', async () => {
      const { pista } = instalarCamara()
      crearLectorMock.mockReset().mockRejectedValue(new Error('no se pudo descargar'))
      await abrirYEmpezar()

      await avanzar(500)

      expect(estado()).toBe('sin-soporte')
      expect(pista.stop).toHaveBeenCalled()
    })
  })

  describe('la cámara nunca queda prendida', () => {
    it('al cerrar el escáner se apaga', async () => {
      const { pista } = instalarCamara()
      const { unmount } = renderEscaner()
      await screen.findByRole('heading', { name: 'Apuntá la cámara al QR de la mesa' })
      expect(pista.stop).not.toHaveBeenCalled()

      unmount()

      expect(pista.stop).toHaveBeenCalled()
    })

    it('si se cierra antes de que la cámara responda, se apaga cuando llega', async () => {
      let entregar: (flujo: MediaStream) => void = () => {}
      const { pista, flujo } = crearFlujo()
      instalarCamara(() => new Promise<MediaStream>((resolver) => { entregar = resolver }))
      const { unmount } = renderEscaner()

      unmount()
      await act(async () => { entregar(flujo) })

      expect(pista.stop).toHaveBeenCalled()
    })

    it('si la cámara se corta sola (otra aplicación la tomó), lo avisa y la apaga', async () => {
      const { pista } = instalarCamara()
      renderEscaner()
      await screen.findByRole('heading', { name: 'Apuntá la cámara al QR de la mesa' })
      // El aviso de corte se engancha en un efecto posterior al título: esperar a que esté antes de cortar.
      await vi.waitFor(() => expect(pista.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function)))

      act(() => pista.cortar())

      expect(estado()).toBe('sin-camara')
      expect(screen.getByRole('heading', { name: 'La cámara no responde' })).toBeInTheDocument()
      expect(pista.stop).toHaveBeenCalled()
    })

    it('si el video no arranca, avisa que la cámara no responde y la apaga', async () => {
      const { pista } = instalarCamara()
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('bloqueado', 'NotAllowedError'))

      renderEscaner()

      expect(await screen.findByRole('heading', { name: 'La cámara no responde' })).toBeInTheDocument()
      expect(pista.stop).toHaveBeenCalled()
    })

    it('un video que se reemplaza mientras arranca (AbortError) no es una falla', async () => {
      instalarCamara()
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('interrumpido', 'AbortError'))

      renderEscaner()

      expect(await screen.findByRole('heading', { name: 'Apuntá la cámara al QR de la mesa' })).toBeInTheDocument()
      await act(async () => {})
      expect(estado()).toBe('escaneando')
    })

    it('si la pantalla vuelve a renderizar con funciones nuevas, la cámara no se reinicia y se avisa a la última', async () => {
      vi.useFakeTimers()
      const { pedirCamara } = instalarCamara()
      const primera = vi.fn()
      const segunda = vi.fn()
      const props = { onCancel: vi.fn(), alternativa: alternativa() }
      const { rerender } = render(<QrScanner {...props} onDetected={primera} />)
      await avanzar(0)

      rerender(<QrScanner onCancel={vi.fn()} alternativa={alternativa()} onDetected={segunda} />)
      leer.mockResolvedValue('abc')
      await avanzar(500)

      expect(pedirCamara).toHaveBeenCalledTimes(1)
      expect(primera).not.toHaveBeenCalled()
      expect(segunda).toHaveBeenCalledWith('abc')
    })
  })

  describe('si la cámara no se puede usar', () => {
    const verConsejo = () => {
      expect(screen.getByText('Otra opción:')).toBeInTheDocument()
      expect(screen.getByText(/abrí la cámara de tu celular/)).toBeInTheDocument()
    }

    describe('permiso rechazado', () => {
      it.each(['NotAllowedError', 'PermissionDeniedError'])('%s: mensaje claro, cómo habilitarlo, la cámara del celular y el PIN', async (nombre) => {
        const { alternativa: salida } = renderEscanerConRechazo(nombre)

        expect(await screen.findByRole('heading', { name: 'No pudimos usar tu cámara' })).toBeInTheDocument()
        expect(estado()).toBe('denegado')
        expect(screen.getByText(/Parece que no le diste permiso a MenYU/)).toBeInTheDocument()
        verConsejo()
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Reintentar', salida.texto, 'Cancelar'])
      })

      it('explica cómo habilitar la cámara en Chrome (Android) y en Safari (iPhone)', async () => {
        renderEscanerConRechazo('NotAllowedError')
        await screen.findByRole('heading', { name: 'No pudimos usar tu cámara' })

        const ayuda = screen.getByText('¿Cómo lo habilito?').closest('details') as HTMLElement
        expect(within(ayuda).getByText('Chrome (Android):')).toBeInTheDocument()
        expect(within(ayuda).getByText('Safari (iPhone):')).toBeInTheDocument()
        expect(within(ayuda).getByText(/Configuración del sitio web/)).toBeInTheDocument()
      })
    })

    describe('sin cámara, en uso o que no arranca', () => {
      it.each(['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'AbortError', 'AlgoRaro'])(
        '%s: la cámara no responde, con la cámara del celular y el PIN (sin la ayuda del permiso)',
        async (nombre) => {
          const { alternativa: salida } = renderEscanerConRechazo(nombre)

          expect(await screen.findByRole('heading', { name: 'La cámara no responde' })).toBeInTheDocument()
          expect(estado()).toBe('sin-camara')
          expect(screen.getByText(/la está usando otra aplicación/)).toBeInTheDocument()
          verConsejo()
          expect(screen.queryByText('¿Cómo lo habilito?')).not.toBeInTheDocument()
          expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Reintentar', salida.texto, 'Cancelar'])
        },
      )
    })

    describe('navegador o página sin cámara', () => {
      it('sin mediaDevices (una página sin HTTPS, o el navegador de otra app): no pide nada y ofrece el PIN sin "Reintentar"', () => {
        const salida = alternativa()
        renderEscaner({ alternativa: salida })

        expect(estado()).toBe('sin-soporte')
        expect(screen.getByRole('heading', { name: 'Este navegador no puede usar la cámara' })).toBeInTheDocument()
        expect(screen.getByText(/Probá desde Chrome \(Android\) o Safari \(iPhone\)/)).toBeInTheDocument()
        verConsejo()
        expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([salida.texto, 'Cancelar'])
        expect(crearLectorMock).not.toHaveBeenCalled()
      })

      it.each(['SecurityError', 'TypeError'])('%s al pedir la cámara también es un navegador sin cámara', async (nombre) => {
        renderEscanerConRechazo(nombre)

        expect(await screen.findByRole('heading', { name: 'Este navegador no puede usar la cámara' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
      })
    })

    it('"Reintentar" vuelve a pedir la cámara y, si ahora anda, escanea', async () => {
      const { flujo } = crearFlujo()
      const { pedirCamara } = instalarCamara(rechazo('NotAllowedError'))
      renderEscaner()
      await screen.findByRole('heading', { name: 'No pudimos usar tu cámara' })

      pedirCamara.mockImplementation(() => Promise.resolve(flujo))
      fireEvent.click(boton('Reintentar'))

      expect(await screen.findByRole('heading', { name: 'Apuntá la cámara al QR de la mesa' })).toBeInTheDocument()
      expect(pedirCamara).toHaveBeenCalledTimes(2)
    })

    it('"Reintentar" mientras la cámara sigue fallando vuelve a mostrar el mensaje', async () => {
      const { pedirCamara } = instalarCamara(rechazo('NotReadableError'))
      renderEscaner()
      await screen.findByRole('heading', { name: 'La cámara no responde' })

      fireEvent.click(boton('Reintentar'))
      expect(estado()).toBe('esperando')

      expect(await screen.findByRole('heading', { name: 'La cámara no responde' })).toBeInTheDocument()
      expect(pedirCamara).toHaveBeenCalledTimes(2)
    })

    it('la alternativa avisa a la pantalla', async () => {
      const salida = alternativa()
      renderEscanerConRechazo('NotAllowedError', { alternativa: salida })
      await screen.findByRole('heading', { name: 'No pudimos usar tu cámara' })

      fireEvent.click(boton(salida.texto))

      expect(salida.onElegir).toHaveBeenCalledTimes(1)
    })

    it('la alternativa puede traer una línea de ayuda debajo del botón (desde el home, "Elegir mi restaurante")', async () => {
      renderEscanerConRechazo('NotFoundError', {
        alternativa: { texto: 'Elegir mi restaurante', ayuda: 'Elegí tu restaurante en la lista e ingresá con el PIN de tu mesa.', onElegir: vi.fn() },
      })

      expect(await screen.findByRole('button', { name: 'Elegir mi restaurante' })).toBeInTheDocument()
      expect(screen.getByText('Elegí tu restaurante en la lista e ingresá con el PIN de tu mesa.')).toBeInTheDocument()
    })

    it('sin línea de ayuda no se muestra ninguna', async () => {
      renderEscanerConRechazo('NotFoundError')
      await screen.findByRole('heading', { name: 'La cámara no responde' })

      expect(screen.queryByText(/Elegí tu restaurante/)).not.toBeInTheDocument()
    })
  })

  describe('cancelar', () => {
    it('"Cancelar" avisa a la pantalla mientras se espera el permiso', () => {
      instalarCamara(() => new Promise<MediaStream>(() => {}))
      const { onCancel } = renderEscaner()

      fireEvent.click(boton('Cancelar'))

      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('y mientras escanea', async () => {
      instalarCamara()
      const { onCancel } = renderEscaner()
      await screen.findByRole('heading', { name: 'Apuntá la cámara al QR de la mesa' })

      fireEvent.click(boton('Cancelar'))

      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('y cuando falla la cámara', async () => {
      const { onCancel } = renderEscanerConRechazo('NotAllowedError')
      await screen.findByRole('heading', { name: 'No pudimos usar tu cámara' })

      fireEvent.click(boton('Cancelar'))

      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('la tecla Escape también cierra', () => {
      instalarCamara(() => new Promise<MediaStream>(() => {}))
      const { onCancel } = renderEscaner()

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('otras teclas no cierran', () => {
      instalarCamara(() => new Promise<MediaStream>(() => {}))
      const { onCancel } = renderEscaner()

      fireEvent.keyDown(window, { key: 'Enter' })

      expect(onCancel).not.toHaveBeenCalled()
    })
  })
})

/** Un escáner cuya cámara se rechaza con ese error. Devuelve también la alternativa que se le pasó. */
function renderEscanerConRechazo(nombre: string, props: Partial<React.ComponentProps<typeof QrScanner>> = {}) {
  instalarCamara(rechazo(nombre))
  const salida = alternativa()
  return { ...renderEscaner({ alternativa: salida, ...props }), alternativa: props.alternativa ?? salida }
}
