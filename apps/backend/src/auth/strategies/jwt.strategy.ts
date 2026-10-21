import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JwtPayload } from '../auth.service'

// JwtAuthGuard es del personal. Los tokens de comensal (sesión de mesa, cuenta de cliente e invitado) firman con el
// mismo JWT_SECRET, pero no entran: antes, cualquiera con un token de POST /auth/guest leía GET /pedidos y
// GET /waiter-calls de cualquier restaurante.
const TIPOS_DEL_PERSONAL: ReadonlyArray<JwtPayload['tipo']> = ['admin', 'mozo']

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    })
  }

  validate(payload: JwtPayload): JwtPayload {
    if (!payload.sub || !TIPOS_DEL_PERSONAL.includes(payload.tipo)) {
      throw new UnauthorizedException()
    }
    return payload
  }
}
