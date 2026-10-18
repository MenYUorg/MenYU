import { HttpException, HttpStatus } from '@nestjs/common'

export interface OpcionesLimiteIntentos {
  /** Fallos dentro de la ventana que activan el bloqueo. */
  maxFallos: number
  /** La ventana arranca con el primer fallo; al vencer, el conteo vuelve a cero. */
  ventanaMs: number
  /** Cuánto dura el bloqueo una vez alcanzado maxFallos. */
  bloqueoMs: number
}

interface Registro {
  fallos: number
  desde: number
  bloqueadoHasta: number | null
}

/**
 * Cuenta intentos fallidos por clave (un restaurante, una mesa) y bloquea con 429 al llegar al máximo.
 *
 * Solo cuenta fallos: un acierto no reinicia el contador (si no, quien conoce un valor válido podría
 * intercalarlo para seguir probando). Las entradas vencidas se purgan en cada fallo.
 *
 * Limitación: el contador vive en memoria del proceso. Con varias instancias del backend cada una
 * cuenta por separado (el límite efectivo se multiplica por la cantidad de réplicas) y un reinicio
 * lo borra.
 */
export class LimiteIntentos {
  private readonly registros = new Map<string, Registro>()

  constructor(private readonly opciones: OpcionesLimiteIntentos) {}

  /** Responde 429 si la clave está bloqueada. */
  verificar(clave: string): void {
    const bloqueadoHasta = this.registros.get(clave)?.bloqueadoHasta
    const ahora = Date.now()
    if (bloqueadoHasta && ahora < bloqueadoHasta) {
      const minutos = Math.ceil((bloqueadoHasta - ahora) / 60_000)
      throw new HttpException(
        `Demasiados intentos fallidos. Probá de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  registrarFallo(clave: string): void {
    const ahora = Date.now()
    this.purgarVencidos(ahora)
    const registro = this.registros.get(clave) ?? { fallos: 0, desde: ahora, bloqueadoHasta: null }
    registro.fallos += 1
    if (registro.fallos >= this.opciones.maxFallos) registro.bloqueadoHasta = ahora + this.opciones.bloqueoMs
    this.registros.set(clave, registro)
  }

  /** Cantidad de claves con fallos registrados (para tests y monitoreo). */
  get claves(): number {
    return this.registros.size
  }

  private purgarVencidos(ahora: number): void {
    for (const [clave, registro] of this.registros) {
      const ventanaVencida = ahora - registro.desde >= this.opciones.ventanaMs
      const sinBloqueo = registro.bloqueadoHasta === null || ahora >= registro.bloqueadoHasta
      if (ventanaVencida && sinBloqueo) this.registros.delete(clave)
    }
  }
}
