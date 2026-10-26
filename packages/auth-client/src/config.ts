// Lo que el paquete lee del entorno de cada app (docs/auth/specs/auth.md, Fase 4). Se lee al usarlo, no al importar,
// para que una app que no llama a una función no necesite su variable (web-auth no usa VITE_AUTH_URL).

export function credencialesDeSupabase(): { url: string; clave: string } {
  const url = import.meta.env.VITE_SUPABASE_URL
  const clave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !clave) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY (docs/auth/VariablesACambiar.md)')
  }
  return { url, clave }
}

/**
 * `.menyu-app.com`, `.staging.menyu-app.com` o `.menyu.local`: con ese dominio todas las apps ven la misma sesión. Sin
 * la variable la cookie queda solo para el host actual (un preview de Vercel, por ejemplo, que no comparte sesión).
 */
export function dominioDeLaCookie(): string | undefined {
  return import.meta.env.VITE_AUTH_COOKIE_DOMAIN || undefined
}

/** La URL de web-auth, sin barra final: `https://auth.menyu-app.com`. */
export function urlDeAuth(): string {
  const url = import.meta.env.VITE_AUTH_URL
  if (!url) throw new Error('Falta VITE_AUTH_URL (docs/auth/VariablesACambiar.md)')
  return url.replace(/\/+$/, '')
}

/** La API, con el prefijo `/api`. En local, `/api` va al proxy de Vite. */
export function urlDeLaApi(): string {
  return import.meta.env.VITE_API_URL ?? '/api'
}
