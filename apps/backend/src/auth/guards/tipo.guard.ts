import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { UserTipo } from '../auth.service'
import { TIPOS_KEY } from '../decorators/requires-tipo.decorator'

@Injectable()
export class TipoGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const tipos = this.reflector.getAllAndOverride<UserTipo[]>(TIPOS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!tipos?.length) return true

    const { user } = context.switchToHttp().getRequest()

    if (!tipos.includes(user?.tipo)) {
      throw new ForbiddenException('No tenés permiso para acceder a este recurso')
    }

    return true
  }
}
