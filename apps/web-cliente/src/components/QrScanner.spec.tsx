import { act, fireEvent, render, screen } from '@testing-library/react'
import { QrScanner } from './QrScanner'

const PISTA = () => ({ stop: vi.fn() })

function instalarCamara(getUserMedia?: () => Promise<MediaStream>) {
  const pista = PISTA()
  const flujo = { getTracks: () => [pista] } as unknown as MediaStream
  const pedirCamara = vi.fn(getUserMedia ?? (() => Promise.resolve(flujo)))
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: pedirCamara }, configurable: true })
  return { pista, flujo, pedirCamara }
}

function instalarLector(resultados: Array<{ rawValue: string }>) {
  const detect = vi.fn(() => Promise.resolve(resultados))
  const crear = vi.fn()
  class LectorFalso {
    detect = detect
    constructor(opciones?: unknown) {
      crear(opciones)
    }
  }
  Object.defineProperty(window, 'BarcodeDetector', { value: LectorFalso, configurable: true, writable: true })
  return { detect, crear }
}

describe('QrScanner (lector nativo del navegador)', () => {
  beforeEach(() => {
    // jsdom no reproduce video: el cuadro "está listo" para que el lector lo mire.
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'mediaDevices')
    Reflect.deleteProperty(window, 'BarcodeDetector')
  })

  it('pide la cámara trasera y avisa con el contenido del QR cuando el lector lo encuentra', async () => {
    vi.useFakeTimers()
    const { pedirCamara, pista } = instalarCamara()
    const { crear } = instalarLector([{ rawValue: 'https://menyu.app/check-in?tableCode=abc' }])
    const onDetected = vi.fn()

    render(<QrScanner onDetected={onDetected} onCancel={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    expect(pedirCamara).toHaveBeenCalledWith({ video: { facingMode: 'environment' } })
    expect(crear).toHaveBeenCalledWith({ formats: ['qr_code'] })
    expect(onDetected).toHaveBeenCalledTimes(1)
    expect(onDetected).toHaveBeenCalledWith('https://menyu.app/check-in?tableCode=abc')
    expect(pista.stop).toHaveBeenCalled()
  })

  it('no mira el cuadro hasta que el video está listo', async () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(1)
    instalarCamara()
    const { detect } = instalarLector([{ rawValue: 'https://menyu.app/check-in?tableCode=abc' }])
    const onDetected = vi.fn()

    render(<QrScanner onDetected={onDetected} onCancel={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    expect(detect).not.toHaveBeenCalled()
    expect(onDetected).not.toHaveBeenCalled()
  })

  it('mientras el lector no encuentra nada sigue mirando sin avisar', async () => {
    vi.useFakeTimers()
    const { pista } = instalarCamara()
    const { detect } = instalarLector([])
    const onDetected = vi.fn()

    render(<QrScanner onDetected={onDetected} onCancel={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })

    expect(detect.mock.calls.length).toBeGreaterThan(1)
    expect(onDetected).not.toHaveBeenCalled()
    expect(pista.stop).not.toHaveBeenCalled()
  })

  it('si dos lecturas quedan pendientes a la vez, avisa una sola vez', async () => {
    vi.useFakeTimers()
    instalarCamara()
    const { detect } = instalarLector([])
    const terminar: Array<() => void> = []
    detect.mockImplementation(
      () => new Promise<Array<{ rawValue: string }>>((resolver) => { terminar.push(() => resolver([{ rawValue: 'abc' }])) }),
    )
    const onDetected = vi.fn()

    render(<QrScanner onDetected={onDetected} onCancel={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(800) })
    expect(terminar.length).toBeGreaterThan(1)

    await act(async () => { terminar.forEach((resolver) => resolver()) })

    expect(onDetected).toHaveBeenCalledTimes(1)
  })

  it('al cerrar el escáner apaga la cámara', async () => {
    vi.useFakeTimers()
    const { pista } = instalarCamara()
    instalarLector([])

    const { unmount } = render(<QrScanner onDetected={vi.fn()} onCancel={vi.fn()} />)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(pista.stop).not.toHaveBeenCalled()

    unmount()

    expect(pista.stop).toHaveBeenCalled()
  })

  it('si se cierra antes de que la cámara responda, la apaga cuando llega', async () => {
    let entregar: (flujo: MediaStream) => void = () => {}
    const pista = PISTA()
    const flujo = { getTracks: () => [pista] } as unknown as MediaStream
    instalarCamara(() => new Promise<MediaStream>((resolver) => { entregar = resolver }))
    instalarLector([])

    const { unmount } = render(<QrScanner onDetected={vi.fn()} onCancel={vi.fn()} />)
    unmount()
    await act(async () => { entregar(flujo) })

    expect(pista.stop).toHaveBeenCalled()
  })

  it('"Cancelar" avisa a la pantalla', () => {
    instalarCamara()
    instalarLector([])
    const onCancel = vi.fn()

    render(<QrScanner onDetected={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('si el navegador no tiene lector de QR, lo dice y no pide la cámara', () => {
    const { pedirCamara } = instalarCamara()

    render(<QrScanner onDetected={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByText('Tu navegador no soporta el escáner QR. Usá Chrome o ingresá con PIN.')).toBeInTheDocument()
    expect(pedirCamara).not.toHaveBeenCalled()
  })

  it('si la cámara no se puede abrir, lo dice', async () => {
    instalarCamara(() => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')))
    instalarLector([])

    render(<QrScanner onDetected={vi.fn()} onCancel={vi.fn()} />)

    expect(await screen.findByText('No se pudo acceder a la cámara.')).toBeInTheDocument()
  })
})
