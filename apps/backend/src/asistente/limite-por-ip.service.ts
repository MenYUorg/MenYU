import { Inject, Injectable } from '@nestjs/common'
import { normalizeIp, ThrottlerStorage } from '@nestjs/throttler'
import type { ConfiguracionDelAsistente } from './configuracion'
import { errorDelAsistente } from './errores'

/** El nombre del contador en el storage del throttler. */
const CONTADOR = 'asistente-ip'

/**
 * El límite por IP de las preguntas sin token de mesa (la carta vista desde Discovery): `ASISTENTE_THROTTLE_LIMITE`
 * cada `ASISTENTE_THROTTLE_TTL` segundos, con el storage de `@nestjs/throttler`. Al pasarse, el bloqueo dura una
 * ventana entera, como en el guard del throttler. Con token de mesa no se aplica: el salón comparte el wifi, y ahí manda
 * el límite por sesión.
 *
 * Lo llama AsistenteService, y no un guard, porque la validez del token la decide el service: así se aplica solo a los
 * pedidos sin una sesión válida, y solo cuentan los que pasaron las validaciones (los mismos que se registran).
 *
 * La IP es `req.ip`, que respeta el `trust proxy` de main.ts (`common/trust-proxy.ts`). El contador vive en memoria del
 * proceso, como `LimiteIntentos`: un reinicio lo borra, y con varias réplicas cada una cuenta por separado. El tope de
 * gasto real es el diario, que está en Postgres.
 */
@Injectable()
export class LimitePorIpService {
  constructor(@Inject(ThrottlerStorage) private readonly contadores: ThrottlerStorage) {}

  /** Cuenta la pregunta; si la IP se pasó del límite, `429 limite_ip`. */
  async exigir(
    ip: string | undefined,
    { limitePorIp, ventanaPorIpSegundos }: Pick<ConfiguracionDelAsistente, 'limitePorIp' | 'ventanaPorIpSegundos'>,
  ): Promise<void> {
    const ventanaMs = ventanaPorIpSegundos * 1000
    // Sin IP (la conexión ya se cerró), todas comparten un mismo contador: se limita de más, nunca de menos.
    const clave = `${CONTADOR}:${normalizeIp(ip ?? '') || 'desconocida'}`
    const { isBlocked, timeToBlockExpire } = await this.contadores.increment(
      clave,
      ventanaMs,
      limitePorIp,
      ventanaMs,
      CONTADOR,
    )
    if (isBlocked) {
      const minutos = Math.max(1, Math.ceil(timeToBlockExpire / 60))
      throw errorDelAsistente(
        'limite_ip',
        `Hiciste muchas preguntas seguidas. Probá de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`,
      )
    }
  }
}
