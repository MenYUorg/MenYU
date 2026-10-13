import { Injectable } from '@nestjs/common'
import { StorageService } from './storage.service'

export type CarpetaLogo = 'marcas' | 'restaurantes'

const BUCKET_POR_DEFECTO = 'logos'

@Injectable()
export class LogosService {
  constructor(private readonly storage: StorageService) {}

  // El nombre del bucket se puede cambiar por entorno (por ejemplo, uno de desarrollo).
  private get bucket(): string {
    return process.env.SUPABASE_LOGOS_BUCKET || BUCKET_POR_DEFECTO
  }

  /** Sube (o reemplaza) el logo y devuelve su URL pública. */
  async subir(carpeta: CarpetaLogo, id: string, file: Express.Multer.File): Promise<string> {
    const url = await this.storage.uploadFile(
      this.bucket,
      `${carpeta}/${id}`,
      file.buffer,
      file.mimetype,
    )
    // El archivo se pisa siempre en el mismo path: la versión en la URL evita que el navegador
    // siga mostrando el logo anterior.
    return `${url}?v=${Date.now()}`
  }

  async eliminar(carpeta: CarpetaLogo, id: string): Promise<void> {
    await this.storage.deleteFile(this.bucket, `${carpeta}/${id}`)
  }
}
