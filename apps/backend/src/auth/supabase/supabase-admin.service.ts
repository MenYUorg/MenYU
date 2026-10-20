import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

/**
 * Admin API de Supabase Auth (invitar, buscar y borrar usuarios). Usa la service role key, que saltea
 * RLS: nunca sale del backend.
 */
@Injectable()
export class SupabaseAdminService {
  private _client: SupabaseClient | null = null

  get auth(): SupabaseClient['auth']['admin'] {
    if (!this._client) {
      const url = process.env.SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) throw new InternalServerErrorException('Supabase no está configurado')
      this._client = createClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    }
    return this._client.auth.admin
  }
}
