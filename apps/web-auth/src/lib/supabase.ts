import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente de Supabase Auth de web-auth. PKCE es el flujo que fuerza @supabase/ssr, que llega en la Fase 4 con
// @menyu/auth-client y la cookie de dominio compartido; hasta entonces la sesión queda en localStorage.
// Los links de invitación y de recuperación traen un token_hash que se canjea con verifyOtp, así que no dependen del
// flujo (plantillas de mail: docs/auth/VariablesACambiar.md).

let cliente: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!cliente) {
    const url = import.meta.env.VITE_SUPABASE_URL
    const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    if (!url || !clave) {
      throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY (apps/web-auth/.env.example)')
    }
    cliente = createClient(url, clave, { auth: { flowType: 'pkce' } })
  }
  return cliente
}
