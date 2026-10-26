import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { RequestConUsuario } from '../supabase/usuario-autenticado'

/**
 * Exige una cuenta ROOT (`Usuario.esRoot`). Corre después de SupabaseAuthGuard, que deja el usuario
 * en la request: sin él, falla cerrado. Solo para las rutas de la consola (`/root/*`).
 */
@Injectable()
export class RootGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestConUsuario>()
    if (request.usuario?.esRoot !== true) throw new ForbiddenException('Solo una cuenta ROOT puede hacer esto')
    return true
  }
}
