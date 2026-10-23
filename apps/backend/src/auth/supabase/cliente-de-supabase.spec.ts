import { InternalServerErrorException } from '@nestjs/common'
import { SupabaseAdminService } from './supabase-admin.service'
import { StorageService } from '../../storage/storage.service'

/**
 * Los dos servicios que construyen un cliente de `@supabase/supabase-js` con la service role key. Acá **no** se mockea
 * la librería: el `createClient` que corre es el de verdad, que es justo lo que falló en staging el 2026-10-22.
 *
 * Qué pasó: desde 2.117 (la alineó la entrega 4.1 de auth), `createClient` arma un `RealtimeClient` y éste exige el
 * WebSocket nativo. El contenedor corría Node 20, que no lo tiene, así que invitar personal y subir un logo
 * respondían 500 "Internal server error" con `Error: Node.js detected but native WebSocket not found`. Ningún test lo
 * vio porque todos simulan Supabase, y el CI tampoco, porque corría la misma versión de Node que el contenedor.
 *
 * Por eso este spec construye los clientes de verdad (no hay red: `createClient` no llama a nadie) y el CI corre en la
 * misma versión mayor de Node que el Dockerfile.
 */
describe('el cliente de Supabase se puede construir en este Node', () => {
  const entorno = process.env

  beforeEach(() => {
    process.env = { ...entorno }
  })

  afterAll(() => {
    process.env = entorno
  })

  it('el de la Admin API (invitaciones)', () => {
    process.env.SUPABASE_URL = 'https://proyecto.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-test'

    expect(() => new SupabaseAdminService().auth).not.toThrow()
  })

  it('el de Storage (logos)', () => {
    process.env.SUPABASE_URL = 'https://proyecto.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-de-test'

    const storage = new StorageService()

    expect(() => storage['client']).not.toThrow()
  })

  it('sin configurar, la Admin API lo dice en el error y no es un 500 genérico', () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    expect(() => new SupabaseAdminService().auth).toThrow(
      new InternalServerErrorException('Supabase no está configurado'),
    )
  })
})
