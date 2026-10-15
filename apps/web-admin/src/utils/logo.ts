// Mismos límites que valida el backend (apps/backend/src/storage/logo-upload.ts) y el bucket "logos" de Supabase.
export const LOGO_MAX_BYTES = 2 * 1024 * 1024

export const LOGO_TIPOS_ACEPTADOS: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']

/** Valor para el atributo accept del input de archivo. */
export const LOGO_ACCEPT = LOGO_TIPOS_ACEPTADOS.join(',')

/**
 * Revisa el archivo antes de subirlo, para avisar enseguida sin esperar al servidor.
 * Devuelve el motivo del rechazo, o null si el archivo sirve como logo.
 * El backend vuelve a validar todo: esto solo mejora la experiencia.
 */
export function validarLogo(archivo: { type: string; size: number }): string | null {
  if (!LOGO_TIPOS_ACEPTADOS.includes(archivo.type)) {
    return 'El logo tiene que ser una imagen PNG, JPG o WebP'
  }
  if (archivo.size === 0) {
    return 'El archivo está vacío'
  }
  if (archivo.size > LOGO_MAX_BYTES) {
    return 'El logo no puede pesar más de 2 MB'
  }
  return null
}
