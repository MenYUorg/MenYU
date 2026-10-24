import { Inject, Injectable } from '@nestjs/common'
import { createRemoteJWKSet, decodeProtectedHeader, JWTPayload, jwtVerify, JWTVerifyGetKey } from 'jose'

/** Claves públicas del proyecto de Supabase (JWKS). Los tests lo reemplazan por un JWKS local. */
export const JWKS_SUPABASE = Symbol('JWKS_SUPABASE')

/** El `sub` de un token de Supabase. Las columnas `supabase_user_id` son `uuid`: otra cosa ni se busca. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Errores de jose que vienen de no poder bajar el JWKS, no de un token malo.
export const FALLAS_DEL_JWKS = new Set(['ERR_JWKS_TIMEOUT', 'ERR_JWKS_INVALID', 'ERR_JOSE_GENERIC'])

/** Las JWT Signing Keys asimétricas del proyecto. El JWT propio (`JWT_SECRET`) es HS256. */
const ALGORITMOS_DE_SUPABASE = ['ES256', 'RS256']

/**
 * Si el encabezado del token dice que lo firmó Supabase. No verifica nada: solo elige con qué verificarlo donde
 * conviven los dos tokens del comensal (`POST /sessions/open`, hasta la Fase 5).
 */
export function esTokenDeSupabase(token: string): boolean {
  try {
    return ALGORITMOS_DE_SUPABASE.includes(decodeProtectedHeader(token).alg ?? '')
  } catch {
    return false
  }
}

/** Falta `SUPABASE_URL`: no se puede verificar ningún token. */
export class SupabaseNoConfiguradoError extends Error {
  constructor() {
    super('SUPABASE_URL no está definida')
  }
}

/** `SUPABASE_URL` sin barra final, o null si no está definida. */
export function urlDeSupabase(): string | null {
  return process.env.SUPABASE_URL?.trim().replace(/\/+$/, '') || null
}

/**
 * JWKS remoto del proyecto. jose lo descarga en el primer uso y lo cachea. Sin `SUPABASE_URL` la app
 * arranca igual (el resto de la API no lo necesita) y cada verificación falla.
 */
export function crearJwksDeSupabase(): JWTVerifyGetKey | null {
  const url = urlDeSupabase()
  return url ? createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`)) : null
}

@Injectable()
export class VerificadorTokenSupabase {
  constructor(@Inject(JWKS_SUPABASE) private readonly jwks: JWTVerifyGetKey | null) {}

  /**
   * Verifica firma (con las JWT Signing Keys asimétricas, no con el secret legacy), vencimiento, issuer
   * y audience. Devuelve el id del usuario de Supabase (`sub`). Si algo falla, lanza el error de jose.
   */
  async verificar(token: string): Promise<string> {
    return (await this.claims(token)).sub as string
  }

  /** Como `verificar`, pero devuelve todos los claims (el email y `user_metadata`, para la cuenta de cliente). */
  async claims(token: string): Promise<JWTPayload> {
    const url = urlDeSupabase()
    if (!this.jwks || !url) throw new SupabaseNoConfiguradoError()

    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: `${url}/auth/v1`,
      audience: 'authenticated',
      algorithms: ALGORITMOS_DE_SUPABASE,
      requiredClaims: ['sub', 'exp'],
    })
    return payload
  }
}
