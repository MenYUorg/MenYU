/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_WS_URL?: string
  /** web-auth, la pantalla de ingreso del personal (docs/auth/VariablesACambiar.md, Fase 4). */
  readonly VITE_AUTH_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
