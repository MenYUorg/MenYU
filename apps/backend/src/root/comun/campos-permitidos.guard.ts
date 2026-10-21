import { BadRequestException, CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

const CAMPOS_PERMITIDOS_KEY = 'root:campos-permitidos'

interface CamposPermitidosMeta {
  campos: readonly string[]
  motivo?: string
}

/**
 * Declara qué campos admite el cuerpo de una ruta. Si llega otro, la ruta responde 400 en vez de ignorarlo en silencio.
 *
 * Por qué hace falta: el `ValidationPipe` global es `whitelist: true`, que descarta los campos de más SIN avisar. Para ROOT eso
 * engaña: si manda `direccion` o `logoUrl` al editar un restaurante, la respuesta sería 200 y creería que lo cambió. Es un guard
 * (no un pipe) porque los guards corren ANTES que los pipes: el pipe global ya habría borrado el campo cuando llegara el pedido.
 */
export const CamposPermitidos = (campos: readonly string[], motivo?: string) =>
  SetMetadata(CAMPOS_PERMITIDOS_KEY, { campos, motivo } satisfies CamposPermitidosMeta)

@Injectable()
export class CamposPermitidosGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.get<CamposPermitidosMeta | undefined>(CAMPOS_PERMITIDOS_KEY, context.getHandler())
    if (!meta) return true

    const body: unknown = context.switchToHttp().getRequest().body
    // Sin cuerpo (o con algo que no es un objeto) no hay campos de más: lo que falte lo dice la validación del DTO.
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return true

    const demas = Object.keys(body).filter((campo) => !meta.campos.includes(campo))
    if (demas.length) {
      const admitidos = meta.campos.join(', ')
      throw new BadRequestException(
        `ROOT no puede enviar: ${demas.join(', ')}. Los campos admitidos son: ${admitidos}.${meta.motivo ? ` ${meta.motivo}` : ''}`,
      )
    }
    return true
  }
}
