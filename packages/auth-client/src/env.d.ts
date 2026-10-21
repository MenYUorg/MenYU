/// <reference types="vite/client" />

// Variables que lee el paquete. Vite las fija al construir cada app (docs/auth/VariablesACambiar.md, Fase 4).
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_AUTH_COOKIE_DOMAIN?: string
  readonly VITE_AUTH_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
