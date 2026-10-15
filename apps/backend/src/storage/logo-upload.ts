import { FileValidator, MaxFileSizeValidator, ParseFilePipe } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'

// Tope de 2 MB: el bucket de Supabase tiene el mismo límite.
export const LOGO_MAX_BYTES = 2 * 1024 * 1024

export type FormatoLogo = 'image/png' | 'image/jpeg' | 'image/webp'

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Detecta el formato por los primeros bytes del archivo ("magic number"), sin fiarse del nombre ni del tipo declarado. */
export function detectarFormatoLogo(buffer: Buffer): FormatoLogo | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(FIRMA_PNG)) return 'image/png'
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

/** Acepta solo PNG, JPG y WebP, y que lo que declara el cliente coincida con el contenido real. */
class LogoTypeValidator extends FileValidator<Record<string, never>, Express.Multer.File> {
  constructor() {
    super({})
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file?.buffer) return false
    const formato = detectarFormatoLogo(file.buffer)
    return formato !== null && formato === file.mimetype
  }

  buildErrorMessage(): string {
    return 'El logo tiene que ser una imagen PNG, JPG o WebP'
  }
}

/** Interceptor del campo multipart "logo" (el archivo se queda en memoria). */
export const logoInterceptor = () =>
  FileInterceptor('logo', {
    storage: memoryStorage(),
    // Multer rechaza (413) los archivos que llegan al límite, así que se suma 1 para que 2 MB justos sean válidos.
    limits: { fileSize: LOGO_MAX_BYTES + 1 },
  })

/** Valida el archivo del logo: obligatorio, de hasta 2 MB y PNG, JPG o WebP. */
export const logoFilePipe = () =>
  new ParseFilePipe({
    validators: [
      // MaxFileSizeValidator solo acepta tamaños estrictamente menores: se suma 1 por lo mismo.
      new MaxFileSizeValidator({
        maxSize: LOGO_MAX_BYTES + 1,
        message: 'El logo no puede pesar más de 2 MB',
      }),
      new LogoTypeValidator(),
    ],
  })
