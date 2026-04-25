import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/requires-rol.decorator'

@Injectable()
export class RolGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!roles?.length) return true

    const { user } = context.switchToHttp().getRequest()

    if (!roles.includes(user?.rol)) {
      throw new ForbiddenException('No tenés el rol necesario para esta acción')
    }

    return true
  }
}
