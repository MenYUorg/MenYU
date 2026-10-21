import * as request from 'supertest'
import { Controller, Get, INestApplication, UnauthorizedException, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'
import { JwtPayload } from '../auth.service'
import { JwtStrategy } from './jwt.strategy'

// JwtAuthGuard es del personal: los tokens de comensal (sesión de mesa, invitado y cuenta de cliente) firman con el mismo
// JWT_SECRET pero no entran (hotfix del token de invitado: antes leían GET /pedidos y GET /waiter-calls).

const SECRETO = 'secreto-de-test-de-la-estrategia'

const ADMIN = { sub: 'admin-1', tipo: 'admin', rol: 'OWNER' }
const MOZO = { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' }
const INVITADO = { sub: 'cliente-invitado', tipo: 'cliente', nombre: 'Invitado' }
const SESION_DE_MESA = { sub: 'cliente-1', tipo: 'cliente', sesionId: 'sesion-1', mesaId: 'mesa-1', restauranteId: 'rest-1' }

@Controller('del-personal')
@UseGuards(JwtAuthGuard)
class DelPersonalController {
  @Get()
  ver() {
    return { ok: true }
  }
}

describe('JwtStrategy', () => {
  const secretoOriginal = process.env.JWT_SECRET
  let app: INestApplication
  const jwt = new JwtService({ secret: SECRETO })

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRETO
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [DelPersonalController],
      providers: [JwtStrategy],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    process.env.JWT_SECRET = secretoOriginal
  })

  const pedir = (payload: object) =>
    request(app.getHttpServer()).get('/del-personal').set('Authorization', `Bearer ${jwt.sign(payload)}`)

  describe('detrás de JwtAuthGuard', () => {
    it.each([
      ['un admin', ADMIN],
      ['un mozo', MOZO],
    ])('%s entra (200)', async (_caso, payload) => {
      expect((await pedir(payload)).status).toBe(200)
    })

    it.each([
      ['de invitado (POST /auth/guest)', INVITADO],
      ['de la sesión de mesa', SESION_DE_MESA],
      ['sin tipo', { sub: 'x' }],
      ['con un tipo que no existe', { sub: 'x', tipo: 'root' }],
    ])('un token %s no entra (401)', async (_caso, payload) => {
      expect((await pedir(payload)).status).toBe(401)
    })
  })

  describe('validate', () => {
    it('devuelve el payload del personal tal cual', () => {
      const estrategia = new JwtStrategy()

      expect(estrategia.validate(MOZO as JwtPayload)).toEqual(MOZO)
    })

    it('rechaza un token sin sub', () => {
      const estrategia = new JwtStrategy()

      expect(() => estrategia.validate({ tipo: 'admin' } as JwtPayload)).toThrow(UnauthorizedException)
    })
  })
})
