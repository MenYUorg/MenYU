import { tokenDeAcceso } from './sesion'

/** Lo que socket.io-client manda en el handshake (opción `auth`). */
export interface DatosDelSocket {
  token?: string
}

/**
 * Para la opción `auth` de socket.io-client: socket.io la llama en cada (re)conexión, así que el token es siempre el
 * vigente. Sin sesión, o si no se pudo leer, entrega `{}`: el callback se llama siempre, o el socket no conecta.
 */
export function authDelSocket(cb: (datos: DatosDelSocket) => void): void {
  tokenDeAcceso().then(
    (token) => cb(token ? { token } : {}),
    () => cb({}),
  )
}
