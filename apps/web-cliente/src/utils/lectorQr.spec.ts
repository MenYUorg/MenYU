import jsQR from 'jsqr'
import { pixelesDelQr, QR_DE_MESA } from '../test/qrMesa'
import { crearLector } from './lectorQr'

// jsqr real, pero espiado: en casi todos los tests se le dice qué devolver; en los de "QR de verdad" se lo deja leer.
vi.mock('jsqr', async (importOriginal) => {
  const original = await importOriginal<typeof import('jsqr')>()
  return { default: vi.fn(original.default) }
})

const leerQr = vi.mocked(jsQR)

const video = (ancho: number, alto: number) => ({ videoWidth: ancho, videoHeight: alto, readyState: 4 }) as unknown as HTMLVideoElement

/** jsdom no dibuja: el "canvas" es un doble que recuerda qué se le dibujó y entrega los píxeles que se le indiquen. */
function instalarLienzo(pixeles?: { data: Uint8ClampedArray; lado: number }) {
  const drawImage = vi.fn()
  const getImageData = vi.fn((_x: number, _y: number, ancho: number, alto: number) => ({
    data: pixeles?.data ?? new Uint8ClampedArray(ancho * alto * 4),
    width: ancho,
    height: alto,
  }))
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => ({ drawImage, getImageData })) as never,
  )
  return { drawImage, getImageData, getContext }
}

/** `BarcodeDetector` falso: `detect` entrega lo que se le indique. */
function instalarDetectorNativo(opciones: { formatos?: string[] | null; detect?: () => Promise<Array<{ rawValue: string }>> } = {}) {
  const detect = vi.fn(opciones.detect ?? (() => Promise.resolve([])))
  const crear = vi.fn()
  class DetectorFalso {
    detect = detect
    constructor(parametros?: unknown) {
      crear(parametros)
    }
    // `formatos: null` simula un Chrome viejo, que no sabe decir qué formatos lee.
    static getSupportedFormats = opciones.formatos === null ? undefined : () => Promise.resolve(opciones.formatos ?? ['qr_code'])
  }
  Object.defineProperty(window, 'BarcodeDetector', { value: DetectorFalso, configurable: true, writable: true })
  return { detect, crear }
}

describe('crearLector', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    leerQr.mockClear()
    Reflect.deleteProperty(window, 'BarcodeDetector')
  })

  describe('con el lector del navegador (BarcodeDetector)', () => {
    it('lo usa, le pide solo QR y devuelve el texto del primero que encuentra', async () => {
      const { detect, crear } = instalarDetectorNativo({
        detect: () => Promise.resolve([{ rawValue: 'primero' }, { rawValue: 'segundo' }]),
      })
      const lector = await crearLector()

      expect(await lector.leer(video(1280, 720))).toBe('primero')
      expect(crear).toHaveBeenCalledWith({ formats: ['qr_code'] })
      expect(detect).toHaveBeenCalledTimes(1)
      expect(leerQr).not.toHaveBeenCalled()
    })

    it('si no ve ningún QR devuelve null', async () => {
      instalarDetectorNativo({ detect: () => Promise.resolve([]) })
      const lector = await crearLector()

      expect(await lector.leer(video(1280, 720))).toBeNull()
    })

    it('un navegador que no informa los formatos que lee igual se usa', async () => {
      const { detect } = instalarDetectorNativo({ formatos: null, detect: () => Promise.resolve([{ rawValue: 'abc' }]) })
      const lector = await crearLector()

      expect(await lector.leer(video(1280, 720))).toBe('abc')
      expect(detect).toHaveBeenCalledTimes(1)
    })

    it('si no sabe leer QR, se usa el lector propio', async () => {
      const { detect, crear } = instalarDetectorNativo({ formatos: ['ean_13', 'code_128'] })
      const { drawImage } = instalarLienzo()
      leerQr.mockReturnValueOnce({ data: 'del lector propio' } as never)
      const lector = await crearLector()

      expect(await lector.leer(video(640, 480))).toBe('del lector propio')
      expect(drawImage).toHaveBeenCalledTimes(1)
      expect(crear).not.toHaveBeenCalled()
      expect(detect).not.toHaveBeenCalled()
    })

    it('si falla al leer, pasa al lector propio y sigue con ese', async () => {
      const { detect } = instalarDetectorNativo({ detect: () => Promise.reject(new Error('sin servicios de Google')) })
      instalarLienzo()
      leerQr.mockReturnValueOnce({ data: 'uno' } as never).mockReturnValueOnce({ data: 'dos' } as never)
      const lector = await crearLector()

      expect(await lector.leer(video(640, 480))).toBe('uno')
      expect(await lector.leer(video(640, 480))).toBe('dos')
      expect(detect).toHaveBeenCalledTimes(1)
    })
  })

  describe('lector propio (el navegador no tiene BarcodeDetector, como Safari en iPhone)', () => {
    it('lee el cuadrado central del cuadro, que es lo que se ve en el recuadro, achicado a 640', async () => {
      const { drawImage, getImageData } = instalarLienzo()
      const lector = await crearLector()
      const cuadro = video(1280, 720)

      await lector.leer(cuadro)

      expect(drawImage).toHaveBeenCalledWith(cuadro, 280, 0, 720, 720, 0, 0, 640, 640)
      expect(getImageData).toHaveBeenCalledWith(0, 0, 640, 640)
    })

    it('con el celular en vertical toma el cuadrado del medio del alto', async () => {
      const { drawImage } = instalarLienzo()
      const lector = await crearLector()
      const cuadro = video(720, 1280)

      await lector.leer(cuadro)

      expect(drawImage).toHaveBeenCalledWith(cuadro, 0, 280, 720, 720, 0, 0, 640, 640)
    })

    it('no agranda una imagen chica', async () => {
      const { drawImage, getImageData } = instalarLienzo()
      const lector = await crearLector()
      const cuadro = video(480, 360)

      await lector.leer(cuadro)

      expect(drawImage).toHaveBeenCalledWith(cuadro, 60, 0, 360, 360, 0, 0, 360, 360)
      expect(getImageData).toHaveBeenCalledWith(0, 0, 360, 360)
    })

    it('le pasa los píxeles a jsQR, sin probar colores invertidos, y devuelve lo que lee', async () => {
      instalarLienzo()
      leerQr.mockReturnValueOnce({ data: 'https://menyu.app/check-in?tableCode=abc' } as never)
      const lector = await crearLector()

      expect(await lector.leer(video(1280, 720))).toBe('https://menyu.app/check-in?tableCode=abc')
      expect(leerQr).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 640, 640, { inversionAttempts: 'dontInvert' })
    })

    it('si jsQR no encuentra nada devuelve null', async () => {
      instalarLienzo()
      leerQr.mockReturnValueOnce(null)
      const lector = await crearLector()

      expect(await lector.leer(video(1280, 720))).toBeNull()
    })

    it('un video que todavía no tiene tamaño no se lee', async () => {
      const { drawImage } = instalarLienzo()
      const lector = await crearLector()

      expect(await lector.leer(video(0, 0))).toBeNull()
      expect(drawImage).not.toHaveBeenCalled()
      expect(leerQr).not.toHaveBeenCalled()
    })

    it('el canvas se reutiliza entre lecturas', async () => {
      const { getContext } = instalarLienzo()
      const lector = await crearLector()

      await lector.leer(video(1280, 720))
      await lector.leer(video(1280, 720))

      expect(getContext).toHaveBeenCalledTimes(1)
    })

    it('si el navegador no puede dibujar en un canvas, no hay lector', async () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

      await expect(crearLector()).rejects.toThrow('canvas')
    })

    it('lee un QR de mesa de verdad (la librería real sobre los píxeles de un QR impreso)', async () => {
      const qr = pixelesDelQr(8)
      instalarLienzo(qr)
      const lector = await crearLector()

      expect(await lector.leer(video(qr.lado, qr.lado))).toBe(QR_DE_MESA.texto)
    })

    it('lo lee también con pocos píxeles por módulo, como se ve un QR chico en la cámara', async () => {
      const qr = pixelesDelQr(4)
      instalarLienzo(qr)
      const lector = await crearLector()

      expect(await lector.leer(video(qr.lado, qr.lado))).toBe(QR_DE_MESA.texto)
    })

    it('una imagen sin QR devuelve null', async () => {
      instalarLienzo({ data: new Uint8ClampedArray(400 * 400 * 4).fill(255), lado: 400 })
      const lector = await crearLector()

      expect(await lector.leer(video(400, 400))).toBeNull()
    })
  })
})
