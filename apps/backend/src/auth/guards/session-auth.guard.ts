import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
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

const esId = (valor: unknown): valor is string => typeof valor === 'string' && valor !== ''

/**
 * Verifica el token de la sesión de mesa del comensal (el que firma `POST /sessions/open`). La cuenta de cliente
 * (`/auth/login`) y el invitado (`/auth/guest`) firman con el mismo secreto y también son `tipo: 'cliente'`, pero no
 * tienen sesión: sin `sesionId`, `mesaId` y `restauranteId` no es un token de mesa. Antes se aceptaban, y `GET /orders`
 * con un token de invitado devolvía los pedidos de toda la base (Prisma ignora un filtro `undefined`).
 */
export function verificarSesionDeMesa(
  jwt: JwtService,
  authHeader: string | undefined,
  siNoEsCliente = 'Este recurso requiere una sesión de cliente',
): SessionJwtPayload {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedException('Session JWT requerido')
  }

  let payload: Partial<Omit<SessionJwtPayload, 'tipo'>> & { tipo?: unknown }
  try {
    payload = jwt.verify(authHeader.slice(7))
  } catch {
    throw new UnauthorizedException('Session JWT inválido o expirado')
  }

  if (payload.tipo !== 'cliente') {
    throw new UnauthorizedException(siNoEsCliente)
  }
  if (!esId(payload.sub) || !esId(payload.sesionId) || !esId(payload.mesaId) || !esId(payload.restauranteId)) {
    throw new UnauthorizedException('Este recurso requiere una sesión de mesa')
  }
  return payload as SessionJwtPayload
}

/** Un comensal solo actúa sobre su propia sesión de mesa: 403 si la que pide no es la de su token. */
export function exigirSuSesion(payload: SessionJwtPayload, sesionId: unknown): void {
  if (sesionId !== payload.sesionId) {
    throw new ForbiddenException('Esa sesión de mesa no es la tuya')
  }
}

/**
 * Exige el token de la sesión de mesa y lo deja en `request.sessionUser`. Si la ruta nombra una sesión (`:sesionId` o
 * `sesionId` en el body), tiene que ser la del token.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest()
    const payload = verificarSesionDeMesa(this.jwt, request.headers?.authorization)

    for (const sesionId of [request.params?.sesionId, request.body?.sesionId]) {
      if (sesionId !== undefined) exigirSuSesion(payload, sesionId)
    }

    request.sessionUser = payload
    return true
  }
}
