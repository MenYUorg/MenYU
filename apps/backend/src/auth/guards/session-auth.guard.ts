import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

export interface SessionJwtPayload {
  sub: string
  tipo: 'cliente'
  sesionId: string
  mesaId: string
  restauranteId: string
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const authHeader: string | undefined = request.headers?.authorization

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Session JWT requerido')
    }

    let payload: SessionJwtPayload
    try {
      payload = this.jwt.verify<SessionJwtPayload>(authHeader.slice(7))
    } catch {
      throw new UnauthorizedException('Session JWT inválido o expirado')
    }

    if (payload.tipo !== 'cliente') {
      throw new UnauthorizedException('Este recurso requiere una sesión de cliente')
    }

    request.sessionUser = payload
    return true
  }
}
