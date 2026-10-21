import { Controller, Get, SetMetadata, UseGuards } from '@nestjs/common'
import { AppModule } from '../app.module'
import { Roles, ROLES_KEY } from '../common/decorators/roles.decorator'
import { RolesGuard } from '../common/guards/roles.guard'
import { guardsDe, metadatoDe, RutaDeLaApp, rutasDe, rutasDeLaApp } from '../test/rutas'
import { RequiereRol, RequiereRolEn } from './decorators/requiere-rol.decorator'
import { RequiereRoot } from './decorators/requiere-root.decorator'
import { RequiresTipo, TIPOS_KEY } from './decorators/requires-tipo.decorator'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { MembresiaGuard, ORIGEN_RESTAURANTE_KEY, OrigenDelRestaurante, ROLES_MEMBRESIA_KEY } from './guards/membresia.guard'
import { RootGuard } from './guards/root.guard'
import { SessionAuthGuard } from './guards/session-auth.guard'
import { SupabaseAuthGuard } from './guards/supabase-auth.guard'
import { TipoGuard } from './guards/tipo.guard'

/**
 * Recorre el enrutador de TODA la aplicación (entrega 4.2 de docs/auth/specs/auth.md). Cada ruta es pública (con la lista de
 * abajo), de la sesión de mesa (SessionAuthGuard) o del personal con el token de Supabase (SupabaseAuthGuard), y ninguna mezcla
 * dos sistemas: es la garantía de "no mezclar los dos sistemas en un mismo endpoint" (CLAUDE.md).
 *
 * Mientras dura la Fase 4, las rutas que todavía usan el JWT legacy están en PENDIENTES_4_3 y PENDIENTES_4_4, que tienen que
 * coincidir exactamente con las que lo usan: pasar una ruta a Supabase obliga a sacarla de acá, y no se puede sumar una ruta nueva
 * con el JWT legacy. Al cerrar la entrega 4.4 quedan vacías y se borran.
 */

/** Sin autenticación, a propósito. */
const PUBLICAS = [
  // Login legacy (JWT propio): se quita en la Fase 5.
  'POST /auth/login',
  'POST /auth/register',
  'POST /auth/guest',
  'POST /auth/refresh',
  'POST /auth/logout',
  // Discovery, la carta y la apertura de la sesión de mesa (QR o PIN).
  'GET /discovery',
  'GET /discovery/buscar',
  'GET /discovery/restaurantes/:id',
  'GET /marca/publicas',
  'GET /marca/:id/restaurantes',
  'GET /menu/:restauranteId',
  'GET /clasificaciones',
  'POST /sessions/open',
  // Del comensal: el service verifica a mano el token de la sesión de mesa.
  'GET /orders',
  'POST /orders',
  'POST /pedidos',
  'POST /waiter-calls',
  // Mercado Pago: el webhook y la vuelta del OAuth (con el `state` firmado).
  'POST /payments/webhook/mercadopago/restaurante/:restauranteId/pago/:pagoId',
  'GET /payments/mercadopago/oauth/callback',
  'GET /health',
]

/** Del personal sin guard: el service verifica a mano el JWT legacy (`waiter-calls.service.ts`). Entrega 4.3. */
const PENDIENTES_A_MANO = ['PATCH /waiter-calls/:id/atender']

/** Del personal con JwtAuthGuard, RolesGuard o TipoGuard. Pasan a Supabase en la entrega 4.3 (o se quitan, decisión 5). */
const PENDIENTES_4_3 = [
  'POST /marcas',
  'GET /marcas',
  'GET /marcas/:id',
  'PATCH /marcas/:id',
  'DELETE /marcas/:id',
  'POST /marcas/:id/logo',
  'DELETE /marcas/:id/logo',
  'POST /restaurantes',
  'GET /restaurantes',
  'GET /restaurantes/:id',
  'PATCH /restaurantes/:id',
  'DELETE /restaurantes/:id',
  'POST /restaurantes/:id/logo',
  'DELETE /restaurantes/:id/logo',
  'POST /mesas',
  'GET /mesas',
  'GET /mesas/:id',
  'PATCH /mesas/:id',
  'DELETE /mesas/:id',
  'POST /mesas/:id/regenerar-qr',
  'PATCH /mesas/:id/pin',
  'POST /sessions/open-staff',
  'POST /sessions/mesa/:mesaId/cerrar',
  'GET /sessions/mesa/:mesaId/activa',
  'GET /sessions/activas',
  'GET /sessions/pagadas',
  'GET /sessions/historial',
  'PATCH /sessions/:id/cobro',
  'POST /mozos',
  'GET /mozos',
  'GET /mozos/:id',
  'PATCH /mozos/:id',
  'DELETE /mozos/:id',
  'POST /mozos/:mozoId/mesas',
  'DELETE /mozos/:mozoId/mesas/:mesaId',
  'GET /mozos/:mozoId/mesas',
  'GET /mozos/:mozoId/llamados-hoy',
  'POST /admin-restaurante',
  'DELETE /admin-restaurante/:adminId/:restauranteId',
  'GET /admin-restaurante/:adminId',
  'GET /admin-restaurante',
  'GET /payments/sesiones',
  'POST /payments/confirmar-efectivo',
  'GET /payments/mercadopago/oauth/conectar',
  'GET /pedidos',
  'GET /pedidos/auditoria',
  'POST /pedidos/staff',
  'PATCH /pedidos/:id/editar',
  'GET /pedidos/:id/ediciones',
  'PATCH /pedidos/:id/estado',
  'GET /waiter-calls',
  'GET /reportes/ventas-hoy',
  'GET /reportes/ventas-por-hora',
  'GET /reportes/top-items',
  'GET /reportes/ventas-por-dia',
  'POST /admins',
  'GET /admins',
  'PATCH /admins/:id',
  'DELETE /admins/:id',
]

/** La consola de ROOT: pasa a `@RequiereRoot()` en la entrega 4.4. */
const PENDIENTES_4_4 = [
  'GET /root/marcas',
  'POST /root/marcas',
  'GET /root/marcas/:id',
  'PATCH /root/marcas/:id',
  'POST /root/marcas/:id/baja',
  'POST /root/marcas/:id/reactivar',
  'POST /root/marcas/:id/restaurantes',
  'PATCH /root/restaurantes/:id',
  'POST /root/restaurantes/:id/baja',
  'POST /root/restaurantes/:id/reactivar',
  'GET /root/duenos',
  'POST /root/marcas/:id/duenos',
  'PATCH /root/duenos/:id',
  'POST /root/duenos/:id/restablecer-password',
  'DELETE /root/duenos/:id',
  'GET /root/roots',
  'POST /root/roots',
  'POST /root/roots/:id/restablecer-password',
  'GET /root/historial',
]

const PENDIENTES = [...PENDIENTES_4_3, ...PENDIENTES_4_4]

const texto = (r: RutaDeLaApp) => `${r.metodo} ${r.ruta}`
const ordenadas = (lista: string[]) => [...lista].sort((a, b) => a.localeCompare(b))
const tiene = (r: RutaDeLaApp, guard: unknown) => guardsDe(r).includes(guard)

/** Los sistemas de autenticación que usa una ruta. `@Roles` o `@RequiresTipo` sin su guard también cuentan como legacy. */
function sistemasDe(r: RutaDeLaApp): string[] {
  const sistemas: string[] = []
  const legacy = [JwtAuthGuard, RolesGuard, TipoGuard].some((g) => tiene(r, g))
  if (legacy || [ROLES_KEY, TIPOS_KEY].some((clave) => metadatoDe(r, clave) !== undefined)) sistemas.push('JWT legacy')
  if (tiene(r, SessionAuthGuard)) sistemas.push('sesión de mesa')
  if (tiene(r, SupabaseAuthGuard)) sistemas.push('Supabase')
  return sistemas
}

/** MembresiaGuard y RootGuard leen `request.usuario`: tienen que correr después de SupabaseAuthGuard. */
function problemasDeOrden(r: RutaDeLaApp): string[] {
  const guards = guardsDe(r)
  const supabase = guards.indexOf(SupabaseAuthGuard)
  return [MembresiaGuard, RootGuard]
    .filter((g) => guards.includes(g) && (supabase === -1 || guards.indexOf(g) < supabase))
    .map((g) => `${texto(r)}: ${g.name} sin SupabaseAuthGuard antes`)
}

/** Una ruta con MembresiaGuard necesita roles y el origen del restaurante; si el origen es un parámetro, que la ruta lo tenga. */
function problemasDeRequiereRol(r: RutaDeLaApp): string[] {
  if (!tiene(r, MembresiaGuard)) return []
  const roles = metadatoDe<string[]>(r, ROLES_MEMBRESIA_KEY)
  const origen = metadatoDe<OrigenDelRestaurante>(r, ORIGEN_RESTAURANTE_KEY)
  if (!roles?.length) return [`${texto(r)}: @RequiereRol sin roles`]
  if (!origen) return [`${texto(r)}: sin el origen del restaurante`]
  if ('param' in origen && !r.ruta.split('/').includes(`:${origen.param}`)) return [`${texto(r)}: no tiene el parámetro :${origen.param}`]
  return []
}

/** RootGuard es de la consola: solo en /root/*. Y la consola, ya en Supabase, solo deja entrar a ROOT. */
function problemasDeRoot(r: RutaDeLaApp): string[] {
  const deLaConsola = r.ruta.startsWith('/root/')
  if (tiene(r, RootGuard) && !deLaConsola) return [`${texto(r)}: RootGuard fuera de /root`]
  if (deLaConsola && tiene(r, SupabaseAuthGuard) && !tiene(r, RootGuard)) return [`${texto(r)}: en /root sin RootGuard`]
  if (deLaConsola && tiene(r, MembresiaGuard)) return [`${texto(r)}: en /root con MembresiaGuard`]
  return []
}

describe('el enrutador: un solo sistema de autenticación por ruta', () => {
  const rutas = rutasDeLaApp(AppModule)
  const textos = rutas.map(texto)

  it('recorre los controllers de toda la aplicación (si no, los demás tests de acá no prueban nada)', () => {
    expect(rutas.length).toBeGreaterThan(140)
    expect(textos).toEqual(expect.arrayContaining(['GET /auth/me', 'POST /sessions/close', 'GET /discovery', 'GET /root/historial']))
  })

  it('las listas de este archivo no tienen rutas que no existen ni repetidas', () => {
    const listadas = [...PUBLICAS, ...PENDIENTES_A_MANO, ...PENDIENTES]

    expect(listadas.filter((t) => !textos.includes(t))).toEqual([])
    expect(listadas.filter((t, i) => listadas.indexOf(t) !== i)).toEqual([])
  })

  it('cada ruta es pública, de la sesión de mesa o del personal con Supabase (o está pendiente de la Fase 4)', () => {
    const sinClasificar = rutas.filter((r) => {
      const sistemas = sistemasDe(r)
      if (sistemas.length === 0) return !PUBLICAS.includes(texto(r)) && !PENDIENTES_A_MANO.includes(texto(r))
      if (sistemas.includes('JWT legacy')) return !PENDIENTES.includes(texto(r))
      return false
    })

    expect(sinClasificar.map(texto)).toEqual([])
  })

  it('las rutas públicas no tienen ningún guard', () => {
    const conGuards = rutas.filter((r) => PUBLICAS.includes(texto(r)) && guardsDe(r).length > 0)

    expect(conGuards.map(texto)).toEqual([])
  })

  it('las que usan el JWT legacy son exactamente las pendientes: al pasar una a Supabase, hay que sacarla de la lista', () => {
    const conLegacy = rutas.filter((r) => sistemasDe(r).includes('JWT legacy'))

    expect(ordenadas(conLegacy.map(texto))).toEqual(ordenadas(PENDIENTES))
  })

  it('las pendientes de la 4.4 son las de /root, y las de la 4.3 ninguna de /root', () => {
    expect(PENDIENTES_4_4.filter((t) => !t.split(' ')[1].startsWith('/root/'))).toEqual([])
    expect(PENDIENTES_4_3.filter((t) => t.split(' ')[1].startsWith('/root/'))).toEqual([])
  })

  it('ninguna ruta mezcla dos sistemas (JWT legacy, sesión de mesa, Supabase)', () => {
    const mezcladas = rutas.filter((r) => sistemasDe(r).length > 1)

    expect(mezcladas.map((r) => `${texto(r)}: ${sistemasDe(r).join(' + ')}`)).toEqual([])
  })

  it('MembresiaGuard y RootGuard siempre corren después de SupabaseAuthGuard', () => {
    expect(rutas.flatMap(problemasDeOrden)).toEqual([])
  })

  it('cada @RequiereRol tiene roles y el restaurante sale de un lugar que existe en la ruta', () => {
    expect(rutas.flatMap(problemasDeRequiereRol)).toEqual([])
  })

  it('RootGuard solo está en /root, y las rutas de /root que ya usan Supabase lo exigen', () => {
    expect(rutas.flatMap(problemasDeRoot)).toEqual([])
  })

  describe('las comprobaciones detectan una ruta mal declarada si alguien la agregara', () => {
    @Controller('mal')
    class MalDeclarado {
      @Get('legacy') @UseGuards(JwtAuthGuard) legacy() {}
      @Get('roles-sin-guard') @Roles('OWNER') rolesSinGuard() {}
      @Get('tipo-sin-guard') @RequiresTipo('mozo') tipoSinGuard() {}
      @Get('mezcla') @UseGuards(SessionAuthGuard, SupabaseAuthGuard) mezcla() {}
      @Get('legacy-y-supabase/:restauranteId') @UseGuards(RolesGuard) @RequiereRol('OWNER') legacyYSupabase() {}
      @Get('orden/:restauranteId')
      @SetMetadata(ROLES_MEMBRESIA_KEY, ['OWNER'])
      @SetMetadata(ORIGEN_RESTAURANTE_KEY, { param: 'restauranteId' })
      @UseGuards(MembresiaGuard, SupabaseAuthGuard)
      orden() {}
      @Get('root-solo') @UseGuards(RootGuard) rootSolo() {}
      @Get('sin-param/:id') @RequiereRol('OWNER') sinParametro() {}
      @Get('sin-roles/:restauranteId') @RequiereRol() sinRoles() {}
      @Get('root-fuera') @RequiereRoot() rootFuera() {}
      @Get('bien/:restauranteId') @RequiereRol('OWNER') bien() {}
      @Get('bien-query') @RequiereRolEn({ query: 'restauranteId' }, 'GERENTE') bienPorQuery() {}
    }

    @Controller('root/prueba')
    class ConsolaMalDeclarada {
      @Get('sin-root') @UseGuards(SupabaseAuthGuard) sinRoot() {}
      @Get('con-membresia/:restauranteId') @RequiereRoot() @RequiereRol('OWNER') conMembresia() {}
      @Get('bien') @RequiereRoot() bien() {}
    }

    const malas = rutasDe(MalDeclarado)
    const consola = rutasDe(ConsolaMalDeclarada)
    const ruta = (lista: RutaDeLaApp[], t: string) => lista.find((r) => texto(r) === t) as RutaDeLaApp

    it('el JWT legacy, también con @Roles o @RequiresTipo sueltos', () => {
      expect(sistemasDe(ruta(malas, 'GET /mal/legacy'))).toEqual(['JWT legacy'])
      expect(sistemasDe(ruta(malas, 'GET /mal/roles-sin-guard'))).toEqual(['JWT legacy'])
      expect(sistemasDe(ruta(malas, 'GET /mal/tipo-sin-guard'))).toEqual(['JWT legacy'])
    })

    it('dos sistemas en la misma ruta', () => {
      expect(sistemasDe(ruta(malas, 'GET /mal/mezcla'))).toEqual(['sesión de mesa', 'Supabase'])
      expect(sistemasDe(ruta(malas, 'GET /mal/legacy-y-supabase/:restauranteId'))).toEqual(['JWT legacy', 'Supabase'])
    })

    it('MembresiaGuard antes de SupabaseAuthGuard, y RootGuard sin él', () => {
      expect(malas.flatMap(problemasDeOrden)).toEqual([
        'GET /mal/orden/:restauranteId: MembresiaGuard sin SupabaseAuthGuard antes',
        'GET /mal/root-solo: RootGuard sin SupabaseAuthGuard antes',
      ])
    })

    it('@RequiereRol sin roles o con un parámetro que la ruta no tiene', () => {
      expect(malas.flatMap(problemasDeRequiereRol)).toEqual([
        'GET /mal/sin-param/:id: no tiene el parámetro :restauranteId',
        'GET /mal/sin-roles/:restauranteId: @RequiereRol sin roles',
      ])
    })

    it('RootGuard fuera de /root, /root sin RootGuard y /root con MembresiaGuard', () => {
      expect([...malas, ...consola].flatMap(problemasDeRoot)).toEqual([
        'GET /mal/root-solo: RootGuard fuera de /root',
        'GET /mal/root-fuera: RootGuard fuera de /root',
        'GET /root/prueba/sin-root: en /root sin RootGuard',
        'GET /root/prueba/con-membresia/:restauranteId: en /root con MembresiaGuard',
      ])
    })

    it('las rutas bien declaradas no dan problemas', () => {
      const bien = [ruta(malas, 'GET /mal/bien/:restauranteId'), ruta(malas, 'GET /mal/bien-query'), ruta(consola, 'GET /root/prueba/bien')]

      expect(bien.map(sistemasDe)).toEqual([['Supabase'], ['Supabase'], ['Supabase']])
      expect(bien.flatMap((r) => [...problemasDeOrden(r), ...problemasDeRequiereRol(r), ...problemasDeRoot(r)])).toEqual([])
    })
  })
})
