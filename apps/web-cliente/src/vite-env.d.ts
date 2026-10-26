/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_WS_URL?: string
  /** web-auth, la pantalla de ingreso de MenYU: la del personal y la de la cuenta del cliente (Fases 4 y 4b). */
  readonly VITE_AUTH_URL?: string
  // La cuenta opcional del cliente (Fase 4b), que lee @menyu/auth-client. Sin ellas la app anda igual, sin cuentas.
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_AUTH_COOKIE_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
