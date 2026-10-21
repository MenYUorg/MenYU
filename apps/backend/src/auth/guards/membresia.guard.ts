import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Rol } from '@prisma/client'
import { AccesoService } from '../supabase/acceso.service'
import { RequestConUsuario } from '../supabase/usuario-autenticado'

// Distinta de la de @Roles ('roles'), que sigue en uso hasta la Fase 5. La escribe @RequiereRol.
export const ROLES_MEMBRESIA_KEY = 'roles-membresia'

/**
 * Exige uno de los roles de `@RequiereRol` en el restaurante de la ruta (`:restauranteId`). Una
 * membresía OWNER de la marca cubre todos sus restaurantes. Corre después de SupabaseAuthGuard.
 *
 * Para rutas de un recurso (`/items/:id`), el service resuelve el restaurante y le pregunta a
 * AccesoService.
 */
@Injectable()
export class MembresiaGuard implements CanActivate {
  private readonly logger = new Logger(MembresiaGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly acceso: AccesoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES_MEMBRESIA_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    const request = context.switchToHttp().getRequest<RequestConUsuario>()
    const restauranteId = request.params?.restauranteId

    // Falla cerrado: una ruta mal declarada no deja pasar a nadie.
    if (!roles?.length || typeof restauranteId !== 'string' || !request.usuario) {
      this.logger.error(`${request.method} ${request.url}: @RequiereRol necesita roles y el parámetro :restauranteId`)
      throw new ForbiddenException('No tenés permiso para esta acción')
    }

    const rolesDelUsuario = await this.acceso.rolesEnRestaurante(request.usuario.id, restauranteId)
    if (!rolesDelUsuario.some((rol) => roles.includes(rol))) {
      throw new ForbiddenException('No tenés permiso para esta acción')
    }
    return true
  }
}
