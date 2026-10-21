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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
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
 * - JwtAuthGuard (legacy, hasta que sus controllers pasen a Supabase en las entregas 4.3 y 4.4) se
 *   reemplaza igual: toma el usuario del header `x-test-user` (opción `usuario`).
 * - SessionAuthGuard, RolesGuard y TipoGuard son los reales. Para el de sesión se firma un JWT real
 *   con un secreto de test.
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

// ── Legacy (JWT propio), hasta las entregas 4.3 y 4.4 ──────────────────────

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
  /** Cuenta del personal con token de Supabase (SupabaseAuthGuard). */
  cuenta?: UsuarioAutenticado | typeof SIN_USUARIO
  /** Usuario del JWT legacy de staff o de un comensal (JwtAuthGuard). */
  usuario?: object
  /** Payload de la sesión de mesa del comensal (SessionAuthGuard). */
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
    .overrideGuard(JwtAuthGuard)
    .useValue(autenticacionFalsa)
    .compile()

  const app: INestApplication = moduleRef.createNestApplication()
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  await app.init()

  return {
    pedir(metodo, ruta, { cuenta, usuario, sesion, body, query } = {}) {
      let req = request(app.getHttpServer())[metodo](ruta)
      if (cuenta) req = req.set('x-test-usuario', typeof cuenta === 'string' ? cuenta : JSON.stringify(cuenta))
      if (usuario) req = req.set('x-test-user', JSON.stringify(usuario))
      if (sesion) req = req.set('Authorization', `Bearer ${jwtDeTest.sign(sesion)}`)
      if (query) req = req.query(query)
      return body ? req.send(body) : req
    },
    cerrar: () => app.close(),
  }
}
