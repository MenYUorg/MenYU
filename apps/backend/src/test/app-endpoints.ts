import * as request from 'supertest'
import { ExecutionContext, INestApplication, Provider, Type, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

/**
 * App de Nest con un controller real para tests de endpoints (rutas, guards, roles y validación).
 *
 * - JwtAuthGuard se reemplaza: toma el usuario del header `x-test-user` (sin header, 401).
 * - SessionAuthGuard, RolesGuard y TipoGuard son los reales. Para el de sesión se firma un JWT real
 *   con un secreto de test.
 * - El ValidationPipe es el mismo que en main.ts.
 */

export const USUARIOS = {
  OWNER: { sub: 'owner-1', tipo: 'admin', rol: 'OWNER' },
  GERENTE: { sub: 'gerente-1', tipo: 'admin', rol: 'GERENTE' },
  ROOT: { sub: 'root-1', tipo: 'admin', rol: 'ROOT' },
  MOZO: { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' },
  CLIENTE: { sub: 'cliente-1', tipo: 'cliente' },
} as const

export const SESION_CLIENTE = {
  sub: 'cliente-1',
  tipo: 'cliente',
  sesionId: 'sesion-1',
  mesaId: 'mesa-1',
  restauranteId: 'rest-1',
} as const

const jwtDeTest = new JwtService({ secret: 'secreto-de-test' })

const autenticacionFalsa = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest()
    const header = req.headers['x-test-user']
    if (!header) throw new UnauthorizedException()
    req.user = JSON.parse(header as string)
    return true
  },
}

export interface OpcionesPedido {
  /** Usuario del JWT de staff o de un comensal (JwtAuthGuard). */
  usuario?: object
  /** Payload de la sesión de mesa del comensal (SessionAuthGuard). */
  sesion?: object
  body?: object
  query?: Record<string, string>
}

export interface AppDeEndpoints {
  pedir(metodo: 'get' | 'post' | 'patch' | 'put' | 'delete', ruta: string, opciones?: OpcionesPedido): request.Test
  cerrar(): Promise<void>
}

export async function crearAppDeEndpoints(controller: Type, providers: Provider[]): Promise<AppDeEndpoints> {
  const moduleRef = await Test.createTestingModule({
    controllers: [controller],
    providers: [...providers, { provide: JwtService, useValue: jwtDeTest }],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue(autenticacionFalsa)
    .compile()

  const app: INestApplication = moduleRef.createNestApplication()
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  await app.init()

  return {
    pedir(metodo, ruta, { usuario, sesion, body, query } = {}) {
      let req = request(app.getHttpServer())[metodo](ruta)
      if (usuario) req = req.set('x-test-user', JSON.stringify(usuario))
      if (sesion) req = req.set('Authorization', `Bearer ${jwtDeTest.sign(sesion)}`)
      if (query) req = req.query(query)
      return body ? req.send(body) : req
    },
    cerrar: () => app.close(),
  }
}
