// Sesión compartida entre las apps de MenYU (docs/auth/specs/auth.md, Fase 4).
export { clienteAuth, opcionesDeCookie } from './cliente'
export { urlDeAuth, urlDeLaApi } from './config'
export { appDeUrl, appsDelPerfil, puedeIrA, tieneAcceso, type App } from './apps'
export { irAlLogin, irASinAcceso, irASuApp, logout, urlDeLogin } from './navegacion'
export { obtenerPerfil, type ResultadoPerfil } from './perfil'
export { RequireAuth, usePerfil, type RequireAuthProps } from './RequireAuth'
export {
  alVolverALaPestana,
  INTERVALO_DE_REVALIDACION_MS,
  useRevalidarSesion,
  type AccionesDeRevalidacion,
} from './revalidacion'
export { renovarSesion, tokenDeAcceso } from './sesion'
export { useSession, type EstadoSesion } from './useSession'
