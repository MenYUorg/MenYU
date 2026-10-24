import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { errors } from 'jose'
import { PrismaService } from '../../prisma/prisma.service'
import {
  FALLAS_DEL_JWKS,
  SupabaseNoConfiguradoError,
  UUID,
  VerificadorTokenSupabase,
} from '../supabase/verificador-token.service'

/**
 * Valida el access token de Supabase y resuelve el `Usuario` de nuestra base. Tener sesión en Supabase
 * no alcanza (el registro público está abierto): sin `Usuario` activo, 403.
 *
 * - Sin token, token inválido, de otro proyecto o vencido: 401.
 * - Sin `Usuario` o inactivo: 403.
 * - No se pudo bajar el JWKS: 503 (el token puede ser válido).
 *
 * Deja el usuario en `request.usuario` (no en `request.user`, que es el del JWT legacy).
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name)

  constructor(
    private readonly verificador: VerificadorTokenSupabase,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader: string | undefined = request.headers?.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token de Supabase requerido')
    }

    const supabaseUserId = await this.verificar(authHeader.slice(7))
    if (!UUID.test(supabaseUserId)) throw new UnauthorizedException('Token inválido')

    const usuario = await this.prisma.usuario.findUnique({
      where: { supabaseUserId },
      select: { id: true, supabaseUserId: true, email: true, nombre: true, esRoot: true, activo: true },
    })
    if (!usuario?.activo) throw new ForbiddenException('Tu cuenta no tiene acceso')

    const { activo: _activo, ...datos } = usuario
    request.usuario = datos
    return true
  }

  private async verificar(token: string): Promise<string> {
    try {
      return await this.verificador.verificar(token)
    } catch (error) {
      if (error instanceof errors.JWTExpired) throw new UnauthorizedException('Token vencido')
      if (error instanceof SupabaseNoConfiguradoError) {
        this.logger.error(error.message)
        throw new InternalServerErrorException('La autenticación no está configurada')
      }
      if (!(error instanceof errors.JOSEError) || FALLAS_DEL_JWKS.has(error.code)) {
        this.logger.error(`No se pudo obtener el JWKS de Supabase: ${(error as Error).message}`)
        throw new ServiceUnavailableException('No se pudo verificar el token')
      }
      throw new UnauthorizedException('Token inválido')
    }
  }
}
