import { Inject, Injectable } from '@nestjs/common'
import { createRemoteJWKSet, jwtVerify, JWTVerifyGetKey } from 'jose'

/** Claves públicas del proyecto de Supabase (JWKS). Los tests lo reemplazan por un JWKS local. */
export const JWKS_SUPABASE = Symbol('JWKS_SUPABASE')

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
    const url = urlDeSupabase()
    if (!this.jwks || !url) throw new SupabaseNoConfiguradoError()

    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: `${url}/auth/v1`,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
      requiredClaims: ['sub', 'exp'],
    })
    return payload.sub as string
  }
}
