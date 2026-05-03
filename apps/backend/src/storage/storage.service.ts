import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

@Injectable()
export class StorageService {
  private _client: SupabaseClient | null = null

  private get client(): SupabaseClient {
    if (!this._client) {
      this._client = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
    }
    return this._client
  }

  async uploadFile(bucket: string, path: string, buffer: Buffer, mimetype: string): Promise<string> {
    const { error } = await this.client.storage
      .from(bucket)
      .upload(path, buffer, { contentType: mimetype, upsert: true })

    if (error) throw new InternalServerErrorException(`Error al subir imagen: ${error.message}`)

    const { data } = this.client.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  async deleteFile(bucket: string, path: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([path])
    if (error) throw new InternalServerErrorException(`Error al eliminar imagen: ${error.message}`)
  }
}
