import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Rol } from '@prisma/client'
import { AccesoService } from '../supabase/acceso.service'
import { RequestConUsuario } from '../supabase/usuario-autenticado'

// Distinta de la de @Roles ('roles'), que sigue en uso hasta la Fase 5. Las escribe @RequiereRol.
export const ROLES_MEMBRESIA_KEY = 'roles-membresia'
export const ORIGEN_RESTAURANTE_KEY = 'origen-restaurante'

/** De dónde sale el id del restaurante: un parámetro de la ruta, la query o el body, con su nombre. */
export type OrigenDelRestaurante = { param: string } | { query: string } | { body: string }

const SIN_PERMISO = 'No tenés permiso para esta acción'

/**
 * Exige uno de los roles de `@RequiereRol` en el restaurante que indica su origen (por defecto,
 * `:restauranteId`). Una membresía OWNER de la marca cubre todos sus restaurantes. Corre después de
 * SupabaseAuthGuard.
 *
 * Falla cerrado: una ruta mal declarada (sin roles, sin origen o sin el parámetro) da 403 y se loguea;
 * sin el id en la query o el body, 400.
 *
 * Para rutas de un recurso (`/items/:id`), `@Personal()`: el service resuelve el restaurante y le
 * pregunta a AccesoService.
 */
@Injectable()
export class MembresiaGuard implements CanActivate {
  private readonly logger = new Logger(MembresiaGuard.name)

  constructor(
    private readonly reflector: Reflector,
    private readonly acceso: AccesoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const objetivos = [context.getHandler(), context.getClass()]
    const roles = this.reflector.getAllAndOverride<Rol[]>(ROLES_MEMBRESIA_KEY, objetivos)
    const origen = this.reflector.getAllAndOverride<OrigenDelRestaurante>(ORIGEN_RESTAURANTE_KEY, objetivos)
    const request = context.switchToHttp().getRequest<RequestConUsuario>()

    if (!roles?.length || !origen || !request.usuario) {
      return this.malDeclarada(request, 'necesita roles, el origen del restaurante y SupabaseAuthGuard antes')
    }

    const restauranteId = valorDe(request, origen)
    if (typeof restauranteId !== 'string' || restauranteId === '') {
      if ('param' in origen) return this.malDeclarada(request, `la ruta no tiene el parámetro :${origen.param}`)
      const [donde, nombre] = 'query' in origen ? ['la query', origen.query] : ['el body', origen.body]
      throw new BadRequestException(`Falta ${nombre} en ${donde}`)
    }

    const rolesDelUsuario = await this.acceso.rolesEnRestaurante(request.usuario.id, restauranteId)
    if (!rolesDelUsuario.some((rol) => roles.includes(rol))) throw new ForbiddenException(SIN_PERMISO)
    return true
  }

  private malDeclarada(request: RequestConUsuario, problema: string): never {
    this.logger.error(`${request.method} ${request.url}: @RequiereRol ${problema}`)
    throw new ForbiddenException(SIN_PERMISO)
  }
}

function valorDe(request: RequestConUsuario, origen: OrigenDelRestaurante): unknown {
  if ('param' in origen) return request.params?.[origen.param]
  if ('query' in origen) return request.query?.[origen.query]
  return (request.body as Record<string, unknown> | undefined)?.[origen.body]
}
