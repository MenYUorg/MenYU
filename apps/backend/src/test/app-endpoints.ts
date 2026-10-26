import * as request from 'supertest'
import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  Provider,
  Type,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { accesoDeTest } from './acceso-de-test'

export { CUENTAS, MOZOS, MUNDO } from './acceso-de-test'

/**
 * App de Nest con un controller real para tests de endpoints (rutas, guards, roles y validación).
 *
 * - SupabaseAuthGuard se reemplaza: toma la cuenta del header `x-test-usuario` (opción `cuenta`). Sin
 *   header, 401; con `SIN_USUARIO`, 403, como una cuenta de Supabase sin `Usuario` en la base.
 * - MembresiaGuard y RootGuard son los reales. AccesoService responde con las membresías de `CUENTAS`
 *   en `MUNDO`, sin base (`acceso-de-test.ts`; los services se mockean en cada test).
 * - SessionAuthGuard es el real: para la sesión de mesa se firma un JWT real con un secreto de test.
 * - El ValidationPipe es el mismo que en main.ts.
 */

/** Una cuenta de Supabase sin `Usuario` (por ejemplo, del registro público): SupabaseAuthGuard da 403. */
export const SIN_USUARIO = 'sin-usuario'

/** Lo que haría SupabaseAuthGuard con el token de la cuenta. */
const supabaseDeTest = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest()
    const header = req.headers['x-test-usuario']
    if (!header) throw new UnauthorizedException('Token de Supabase requerido')
    if (header === SIN_USUARIO) throw new ForbiddenException('Tu cuenta no tiene acceso')
    req.usuario = JSON.parse(header as string)
    return true
  },
}

/**
 * Tokens del JWT propio que no son de una sesión de mesa (el del login legacy de un mozo, el de un cliente sin
 * mesa): SessionAuthGuard los rechaza aunque estén bien firmados.
 */
export const USUARIOS = {
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

export interface OpcionesPedido {
  /** Cuenta del personal con token de Supabase (SupabaseAuthGuard). */
  cuenta?: UsuarioAutenticado | typeof SIN_USUARIO
  /** Payload firmado como token de la sesión de mesa del comensal (SessionAuthGuard). */
  sesion?: object
  body?: object
  query?: Record<string, string | string[]>
}

export interface AppDeEndpoints {
  pedir(metodo: 'get' | 'post' | 'patch' | 'put' | 'delete', ruta: string, opciones?: OpcionesPedido): request.Test
  cerrar(): Promise<void>
}

/** `providers` va después de los del helper: un test puede reemplazar AccesoService. */
export async function crearAppDeEndpoints(controller: Type, providers: Provider[]): Promise<AppDeEndpoints> {
  const moduleRef = await Test.createTestingModule({
    controllers: [controller],
    providers: [
      { provide: AccesoService, useValue: accesoDeTest() },
      ...providers,
      { provide: JwtService, useValue: jwtDeTest },
    ],
  })
    .overrideGuard(SupabaseAuthGuard)
    .useValue(supabaseDeTest)
    .compile()

  const app: INestApplication = moduleRef.createNestApplication()
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  await app.init()

  return {
    pedir(metodo, ruta, { cuenta, sesion, body, query } = {}) {
      let req = request(app.getHttpServer())[metodo](ruta)
      if (cuenta) req = req.set('x-test-usuario', typeof cuenta === 'string' ? cuenta : JSON.stringify(cuenta))
      if (sesion) req = req.set('Authorization', `Bearer ${jwtDeTest.sign(sesion)}`)
      if (query) req = req.query(query)
      return body ? req.send(body) : req
    },
    cerrar: () => app.close(),
  }
}
