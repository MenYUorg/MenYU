import { authService, TOKEN_KEY, REFRESH_KEY } from './authService'

let enCurso: Promise<string | null> | null = null

/**
 * Renueva el par de tokens con el refresh token guardado y devuelve el access
 * token nuevo, o null si no se pudo. El refresh token rota (cada uso revoca el
 * anterior): dos renovaciones simultáneas harían fallar a la segunda, así que
 * todas las llamadas comparten la que está en curso.
 *
 * Si falla no borra los tokens guardados: decidir que la sesión venció le
 * corresponde al REST (401 + refresh fallido), no a quien llama a esto.
 */
export function refrescarTokens(): Promise<string | null> {
  if (enCurso) return enCurso
  const refresh = localStorage.getItem(REFRESH_KEY)
  if (!refresh) return Promise.resolve(null)

  enCurso = authService
    .refresh(refresh)
    .then((tokens) => {
      localStorage.setItem(TOKEN_KEY, tokens.accessToken)
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken)
      return tokens.accessToken
    })
    .catch(() => null)
    .finally(() => {
      enCurso = null
    })
  return enCurso
}

/** Lo mínimo de un Socket de socket.io-client que usa este helper (evita depender del paquete). */
export interface SocketReconectable {
  on(evento: 'disconnect', cb: (motivo: string) => void): unknown
  connect(): unknown
}

const VENTANA_REINTENTO_MS = 30_000

/**
 * El gateway rechaza una conexión desconectando desde el servidor (token
 * vencido, mozo dado de baja, ROOT, o un error interno al autenticar, como un
 * fallo pasajero de la base). El motivo es 'io server disconnect' y socket.io
 * NO reintenta solo. Acá se renueva el token y se vuelve a conectar; el `auth`
 * del socket debe ser una función para que tome el token nuevo.
 *
 * El socket NUNCA cierra la sesión: un rechazo del servidor no prueba que la
 * sesión venció. Cuando no hay forma de reconectar (el refresh falla, o el
 * servidor rechaza de nuevo dentro de la ventana) el socket queda desconectado
 * y se llama a `onSinTiempoReal` para avisar; la app sigue funcionando con
 * REST, que es quien decide si la sesión venció.
 */
export function reconectarSiRechazaElServidor(
  socket: SocketReconectable,
  onSinTiempoReal: () => void,
): void {
  let ultimoIntento = 0
  socket.on('disconnect', (motivo) => {
    if (motivo !== 'io server disconnect') return

    const ahora = Date.now()
    if (ahora - ultimoIntento < VENTANA_REINTENTO_MS) {
      onSinTiempoReal()
      return
    }
    ultimoIntento = ahora

    void refrescarTokens().then((token) => {
      if (token) socket.connect()
      else onSinTiempoReal()
    })
  })
}
