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
import { Rol } from '@prisma/client'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { PrismaService } from '../prisma/prisma.service'

/**
 * App de Nest con un controller real para tests de endpoints (rutas, guards, roles y validación).
 *
 * - SupabaseAuthGuard se reemplaza: toma la cuenta del header `x-test-usuario` (opción `cuenta`). Sin
 *   header, 401; con `SIN_USUARIO`, 403, como una cuenta de Supabase sin `Usuario` en la base.
 * - MembresiaGuard y RootGuard son los reales. AccesoService responde con las membresías de `CUENTAS`
 *   en `MUNDO`, sin base (los services se mockean en cada test).
 * - JwtAuthGuard (legacy, hasta que sus controllers pasen a Supabase en las entregas 4.3 y 4.4) se
 *   reemplaza igual: toma el usuario del header `x-test-user` (opción `usuario`).
 * - SessionAuthGuard, RolesGuard y TipoGuard son los reales. Para el de sesión se firma un JWT real
 *   con un secreto de test.
 * - El ValidationPipe es el mismo que en main.ts.
 */

/** Marcas y restaurantes de los tests de endpoints. Los ids son UUID porque varios DTOs lo exigen. */
export const MUNDO = {
  MARCA_A: '6f1c2a40-0000-4a1b-9c3d-00000000000a',
  MARCA_B: '6f1c2a40-0000-4a1b-9c3d-00000000000b',
  /** De la marca A, con su personal (GERENTE, JEFE_SALON, MOZO y COCINA). */
  REST_1: '6f1c2a40-1111-4a1b-9c3d-000000000001',
  /** De la marca A, sin personal propio: solo entra el OWNER de la marca. */
  REST_2: '6f1c2a40-1111-4a1b-9c3d-000000000002',
  /** De la marca B. */
  REST_B: '6f1c2a40-1111-4a1b-9c3d-0000000000b1',
} as const

const MARCA_DEL_RESTAURANTE: Record<string, string> = {
  [MUNDO.REST_1]: MUNDO.MARCA_A,
  [MUNDO.REST_2]: MUNDO.MARCA_A,
  [MUNDO.REST_B]: MUNDO.MARCA_B,
}

function cuenta(clave: string, numero: number, esRoot = false): UsuarioAutenticado {
  return {
    id: `usuario-${clave}`,
    supabaseUserId: `6f1c2a40-2222-4a1b-9c3d-${String(numero).padStart(12, '0')}`,
    email: `${clave}@menyu.test`,
    nombre: clave,
    esRoot,
  }
}

/** Cuentas con `Usuario` en la base (pasan SupabaseAuthGuard). Sus membresías, en `MEMBRESIAS`. */
export const CUENTAS = {
  /** Sin membresías: ROOT no es un bypass. */
  ROOT: cuenta('root', 1, true),
  OWNER_A: cuenta('owner-a', 2),
  OWNER_B: cuenta('owner-b', 3),
  GERENTE: cuenta('gerente', 4),
  JEFE_SALON: cuenta('jefe-salon', 5),
  MOZO: cuenta('mozo', 6),
  COCINA: cuenta('cocina', 7),
  /** Un `Usuario` activo sin ninguna membresía. */
  SIN_MEMBRESIAS: cuenta('sin-membresias', 8),
} as const

type Membresia = { rol: 'OWNER'; marcaId: string } | { rol: Exclude<Rol, 'OWNER'>; restauranteId: string }

const MEMBRESIAS: Record<string, Membresia[]> = {
  [CUENTAS.OWNER_A.id]: [{ rol: 'OWNER', marcaId: MUNDO.MARCA_A }],
  [CUENTAS.OWNER_B.id]: [{ rol: 'OWNER', marcaId: MUNDO.MARCA_B }],
  [CUENTAS.GERENTE.id]: [{ rol: 'GERENTE', restauranteId: MUNDO.REST_1 }],
  [CUENTAS.JEFE_SALON.id]: [{ rol: 'JEFE_SALON', restauranteId: MUNDO.REST_1 }],
  [CUENTAS.MOZO.id]: [{ rol: 'MOZO', restauranteId: MUNDO.REST_1 }],
  [CUENTAS.COCINA.id]: [{ rol: 'COCINA', restauranteId: MUNDO.REST_1 }],
}

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

// AccesoService no tiene base en estos tests: si un método que no se simula la usa, el error lo dice.
const sinBase = new Proxy(
  {},
  {
    get: (_destino, clave) => {
      throw new Error(`Los tests de endpoints no tienen base: AccesoService usó prisma.${String(clave)}`)
    },
  },
) as PrismaService

/** AccesoService con las membresías de `CUENTAS`. Lo demás (exigirRol, exigirOwnerDeMarca) es el código real. */
class AccesoDeTest extends AccesoService {
  constructor() {
    super(sinBase)
  }

  override async rolesEnRestaurante(usuarioId: string, restauranteId: string): Promise<Rol[]> {
    const marcaId = MARCA_DEL_RESTAURANTE[restauranteId]
    if (!marcaId) return []
    return (MEMBRESIAS[usuarioId] ?? [])
      .filter((m) => ('restauranteId' in m ? m.restauranteId === restauranteId : m.marcaId === marcaId))
      .map((m) => m.rol)
  }

  override async esOwnerDeMarca(usuarioId: string, marcaId: string): Promise<boolean> {
    return (MEMBRESIAS[usuarioId] ?? []).some((m) => m.rol === 'OWNER' && m.marcaId === marcaId)
  }
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
      { provide: AccesoService, useValue: new AccesoDeTest() },
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
