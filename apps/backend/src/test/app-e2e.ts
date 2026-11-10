import 'reflect-metadata'
import * as request from 'supertest'
import { ExecutionContext, ForbiddenException, INestApplication, Logger, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AppModule } from '../app.module'
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard'
import { PrismaService } from '../prisma/prisma.service'
import { pipeDeValidacion } from './app-endpoints'

/**
 * La app entera (AppModule) contra el Postgres de los e2e, para pedirle cosas por HTTP como el personal.
 *
 * - SupabaseAuthGuard es lo único que se reemplaza: el usuario sale del header `x-test-usuario`, con el id de un
 *   `Usuario` real de la base, y se arma igual que el guard real (sin header, 401; sin `Usuario` activo, 403).
 * - MembresiaGuard, AccesoService y los services son los reales, con la base real.
 * - El ValidationPipe es el de main.ts. Sin el prefijo `/api`, como los otros e2e.
 */
export interface AppE2e {
  prisma: PrismaService
  pedir(metodo: 'get' | 'post' | 'patch' | 'put' | 'delete', ruta: string, opciones?: OpcionesE2e): request.Test
  cerrar(): Promise<void>
}

export interface OpcionesE2e {
  /** El `Usuario.id` de quien pide. */
  usuarioId?: string
  body?: object
  query?: Record<string, string>
}

export async function crearAppE2e(): Promise<AppE2e> {
  // El guard corre después de compilar el módulo: para entonces ya tiene el PrismaService de la app.
  let prismaDelGuard: PrismaService | undefined

  // Lo que hace SupabaseAuthGuard después de verificar el token, con el usuario del header en vez del del token.
  const supabaseDeLaBase = {
    async canActivate(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest()
      const id = req.headers['x-test-usuario']
      if (typeof id !== 'string' || id === '') throw new UnauthorizedException('Token de Supabase requerido')
      const usuario = await prismaDelGuard?.usuario.findUnique({
        where: { id },
        select: { id: true, supabaseUserId: true, email: true, nombre: true, esRoot: true, activo: true },
      })
      if (!usuario?.activo) throw new ForbiddenException('Tu cuenta no tiene acceso')
      const { activo: _activo, ...datos } = usuario
      req.usuario = datos
      return true
    },
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(SupabaseAuthGuard)
    .useValue(supabaseDeLaBase)
    .compile()
  const app: INestApplication = moduleRef.createNestApplication()
  app.useGlobalPipes(pipeDeValidacion())
  // init y no listen: supertest usa el server sin abrir un puerto.
  await app.init()
  const prisma = moduleRef.get(PrismaService)
  prismaDelGuard = prisma

  return {
    prisma,
    pedir(metodo, ruta, { usuarioId, body, query } = {}) {
      let req = request(app.getHttpServer())[metodo](ruta)
      if (usuarioId) req = req.set('x-test-usuario', usuarioId)
      if (query) req = req.query(query)
      return body ? req.send(body) : req
    },
    cerrar: () => app.close(),
  }
}

// Para las carreras de los e2e: cómo terminaron las rondas y cuántas veces reintentó runSerializableTransaction por un
// P2034. Se imprime solo con E2E_DISTRIBUCION=1; si no, el e2e no imprime nada.

/** Imprime solo con E2E_DISTRIBUCION=1. */
export function mostrarDistribucion(texto: string): void {
  if (process.env.E2E_DISTRIBUCION === '1') console.log(texto)
}

/** Suma 1 a la clave de un conteo. */
export function contar(conteo: Record<string, number>, clave: string): void {
  conteo[clave] = (conteo[clave] ?? 0) + 1
}

/**
 * Cuenta, por contexto ('abrirTurno', 'reasignarMesas'…), los reintentos que loguea runSerializableTransaction. Espía
 * Logger.prototype.warn sin taparlo; se deshace con jest.restoreAllMocks().
 */
export function contarReintentos() {
  const total: Record<string, number> = {}
  const warn = Logger.prototype.warn
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(function (this: Logger, mensaje: unknown, ...resto: unknown[]) {
    const contexto = /^\[(\w+)\] Conflicto de transacción serializable/.exec(String(mensaje))?.[1]
    if (contexto) contar(total, contexto)
    return warn.call(this, mensaje, ...resto)
  })
  return {
    total,
    /** Una foto del conteo, para medir un caso con `desde`. */
    foto: () => ({ ...total }),
    /** Los reintentos desde la foto, como texto. */
    desde: (antes: Record<string, number>) =>
      JSON.stringify(Object.fromEntries(Object.entries(total).map(([k, v]) => [k, v - (antes[k] ?? 0)]))),
  }
}
