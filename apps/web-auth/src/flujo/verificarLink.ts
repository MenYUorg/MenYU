import type { AuthResponse } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// El token_hash de los links de invitación y de recuperación se puede canjear una sola vez. En desarrollo, StrictMode
// corre los efectos dos veces: el segundo verifyOtp fallaría con otp_expired. Por eso se guarda la promesa por token.
const verificaciones = new Map<string, Promise<AuthResponse>>()

export function verificarLink(tokenHash: string, tipo: 'invite' | 'recovery'): Promise<AuthResponse> {
  let verificacion = verificaciones.get(tokenHash)
  if (!verificacion) {
    verificacion = supabase().auth.verifyOtp({ token_hash: tokenHash, type: tipo })
    verificaciones.set(tokenHash, verificacion)
  }
  return verificacion
}
