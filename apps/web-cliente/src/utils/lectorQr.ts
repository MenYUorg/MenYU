/** Lee el QR que se ve en el cuadro actual de un video. */
export interface LectorQr {
  /** Texto del QR, o `null` si en este cuadro no hay ninguno. */
  leer: (video: HTMLVideoElement) => Promise<string | null>
}

interface DetectorNativo {
  detect: (origen: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>
}

interface DetectorNativoClase {
  new (opciones?: { formats?: string[] }): DetectorNativo
  getSupportedFormats?: () => Promise<string[]>
}

// Se lee el cuadrado central del cuadro (lo que se ve en el recuadro del escáner) a este tamaño como máximo: alcanza para
// un QR de mesa y mantiene barata cada lectura en un celular.
const LADO_MAXIMO = 640

/** `BarcodeDetector` del navegador (Chrome en Android); `null` si no existe o no sabe leer QR (Safari no lo tiene). */
async function crearLectorNativo(): Promise<LectorQr | null> {
  const Detector = (window as unknown as { BarcodeDetector?: DetectorNativoClase }).BarcodeDetector
  if (!Detector) return null
  try {
    const formatos = await Detector.getSupportedFormats?.()
    if (formatos && !formatos.includes('qr_code')) return null
    const detector = new Detector({ formats: ['qr_code'] })
    return { leer: async (video) => (await detector.detect(video))[0]?.rawValue ?? null }
  } catch {
    return null
  }
}

/** Lector propio (`jsqr`). Se descarga recién cuando hace falta: los navegadores con lector nativo no lo bajan. */
async function crearLectorPropio(): Promise<LectorQr> {
  const { default: jsQR } = await import('jsqr')
  const lienzo = document.createElement('canvas')
  const contexto = lienzo.getContext('2d', { willReadFrequently: true })
  if (!contexto) throw new Error('El navegador no puede dibujar en un canvas')

  return {
    leer: async (video) => {
      const ancho = video.videoWidth
      const alto = video.videoHeight
      if (!ancho || !alto) return null

      const lado = Math.min(ancho, alto)
      const destino = Math.min(lado, LADO_MAXIMO)
      if (lienzo.width !== destino) {
        lienzo.width = destino
        lienzo.height = destino
      }
      contexto.drawImage(video, (ancho - lado) / 2, (alto - lado) / 2, lado, lado, 0, 0, destino, destino)
      const imagen = contexto.getImageData(0, 0, destino, destino)
      return jsQR(imagen.data, destino, destino, { inversionAttempts: 'dontInvert' })?.data ?? null
    },
  }
}

/**
 * Elige cómo leer: el lector del navegador si lo tiene y, si no (o si falla), el propio. Con el del navegador, un
 * error al leer (por ejemplo, un Android sin los servicios de Google) pasa de ahí en más al lector propio.
 */
export async function crearLector(): Promise<LectorQr> {
  const nativo = await crearLectorNativo()
  if (!nativo) return crearLectorPropio()

  let propio: LectorQr | null = null
  return {
    leer: async (video) => {
      if (!propio) {
        try {
          return await nativo.leer(video)
        } catch {
          propio = await crearLectorPropio()
        }
      }
      return propio.leer(video)
    },
  }
}
