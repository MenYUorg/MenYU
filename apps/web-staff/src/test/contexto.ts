import type { PerfilUsuario } from '@menyu/types'
import { useContextoStore } from '../store/contextoStore'
import { sesionDePrueba } from './authClient'

/**
 * Deja la sesión y el contexto listos para los specs de pantallas: el perfil que devuelve `usePerfil()` y el
 * restaurante elegido. Usa el store de verdad, así que los permisos de la interfaz salen de las membresías, como en la
 * app. Va con `vi.mock('@menyu/auth-client', …)` y `moduloSimulado()`.
 */
export function montarContexto(perfil: PerfilUsuario, restauranteId?: string): void {
  sesionDePrueba.perfil = perfil
  useContextoStore.getState().cargarContexto(perfil, { restauranteId: restauranteId ?? null })
}

/** Deja el contexto sin restaurante: lo que ve una pantalla antes de que la persona elija uno. */
export function reiniciarContexto(): void {
  localStorage.removeItem('menyu-staff-restaurante-id')
  useContextoStore.setState({ restaurantes: [], restauranteId: null, perfil: null })
}
