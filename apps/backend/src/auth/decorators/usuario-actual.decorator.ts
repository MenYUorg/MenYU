import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { UsuarioAutenticado } from '../supabase/usuario-autenticado'

/** El usuario que dejó SupabaseAuthGuard. Para el del JWT legacy está `@CurrentUser`. */
export const UsuarioActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UsuarioAutenticado => {
    return ctx.switchToHttp().getRequest().usuario
  },
)
