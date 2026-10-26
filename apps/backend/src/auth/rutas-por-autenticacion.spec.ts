import { Controller, Get, SetMetadata, UseGuards } from '@nestjs/common'
import { AppModule } from '../app.module'
import { guardsDe, metadatoDe, RutaDeLaApp, rutasDe, rutasDeLaApp } from '../test/rutas'
import { RequiereRol, RequiereRolEn } from './decorators/requiere-rol.decorator'
import { RequiereRoot } from './decorators/requiere-root.decorator'
import { MembresiaGuard, ORIGEN_RESTAURANTE_KEY, OrigenDelRestaurante, ROLES_MEMBRESIA_KEY } from './guards/membresia.guard'
import { RootGuard } from './guards/root.guard'
import { SessionAuthGuard } from './guards/session-auth.guard'
import { SupabaseAuthGuard } from './guards/supabase-auth.guard'

/**
 * Recorre el enrutador de TODA la aplicación (entrega 4.2 de docs/auth/specs/auth.md). Cada ruta es pública (con la lista de
 * abajo), de la sesión de mesa (SessionAuthGuard) o del personal con el token de Supabase (SupabaseAuthGuard), y ninguna mezcla
 * dos sistemas: es la garantía de "no mezclar los dos sistemas en un mismo endpoint" (CLAUDE.md).
 *
 * La Fase 5 borró el JWT legacy del personal (JwtAuthGuard, RolesGuard, TipoGuard, `@Roles` y `@RequiresTipo`): ya no hay
 * con qué declarar una ruta así.
 */

/** Sin autenticación, a propósito. */
const PUBLICAS = [
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

/**
 * Con el token de Supabase pero sin MembresiaGuard ni RootGuard (`@Personal()`): el rol lo pide el service, con el
 * restaurante o la marca del recurso. Para sumar una, revisar que el service llame a AccesoService antes de leer o escribir.
 */
const CON_PERMISO_EN_EL_SERVICE = [
  // El perfil de la propia cuenta y la invitación (el permiso, con puedeInvitar).
  'GET /auth/me',
  'POST /auth/invitaciones',
  // Marcas: OWNER de la marca. GET /marcas y GET /restaurantes, por las membresías.
  'GET /marcas',
  'GET /marcas/:id',
  'PATCH /marcas/:id',
  'POST /marcas/:id/logo',
  'DELETE /marcas/:id/logo',
  'GET /restaurantes',
  // La carta, con el restaurante del ítem, la categoría o el ingrediente. El catálogo de clasificaciones, en algún restaurante.
  'GET /items/:id',
  'PATCH /items/:id',
  'DELETE /items/:id',
  'PUT /items/:id/descuento',
  'DELETE /items/:id/descuento',
  'POST /items/:id/imagen',
  'DELETE /items/:id/imagen',
  'POST /items/:itemId/ingredientes',
  'PATCH /items/:itemId/ingredientes/:id',
  'DELETE /items/:itemId/ingredientes/:id',
  'GET /categorias/:id',
  'PATCH /categorias/:id',
  'DELETE /categorias/:id',
  'GET /ingredientes/:id',
  'PATCH /ingredientes/:id',
  'DELETE /ingredientes/:id',
  'POST /clasificaciones',
  'PATCH /clasificaciones/:id',
  'DELETE /clasificaciones/:id',
  'POST /clasificaciones/items/:itemId',
  'DELETE /clasificaciones/items/:itemId/:clasificacionId',
  // Mesas y mozos, con el restaurante de la mesa o del mozo.
  'GET /mesas/:id',
  'PATCH /mesas/:id',
  'DELETE /mesas/:id',
  'POST /mesas/:id/regenerar-qr',
  'PATCH /mesas/:id/pin',
  'GET /mozos/:id',
  'PATCH /mozos/:id',
  'POST /mozos/:mozoId/mesas',
  'DELETE /mozos/:mozoId/mesas/:mesaId',
  'GET /mozos/:mozoId/mesas',
  'GET /mozos/:mozoId/llamados-hoy',
  // El salón, con el restaurante de la mesa, la sesión, el pedido, el pago o el llamado.
  'POST /sessions/open-staff',
  'POST /sessions/mesa/:mesaId/cerrar',
  'GET /sessions/mesa/:mesaId/activa',
  'PATCH /sessions/:id/cobro',
  'POST /payments/confirmar-efectivo',
  'POST /pedidos/staff',
  'PATCH /pedidos/:id/editar',
  'GET /pedidos/:id/ediciones',
  'PATCH /pedidos/:id/estado',
  'PATCH /waiter-calls/:id/atender',
]

const texto = (r: RutaDeLaApp) => `${r.metodo} ${r.ruta}`
const ordenadas = (lista: string[]) => [...lista].sort((a, b) => a.localeCompare(b))
const tiene = (r: RutaDeLaApp, guard: unknown) => guardsDe(r).includes(guard)

/** Los sistemas de autenticación que usa una ruta. */
function sistemasDe(r: RutaDeLaApp): string[] {
  const sistemas: string[] = []
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

/** RootGuard es de la consola: solo en /root/*. Y la consola solo deja entrar a ROOT. */
function problemasDeRoot(r: RutaDeLaApp): string[] {
  const deLaConsola = r.ruta.startsWith('/root/')
  if (tiene(r, RootGuard) && !deLaConsola) return [`${texto(r)}: RootGuard fuera de /root`]
  if (deLaConsola && !tiene(r, RootGuard)) return [`${texto(r)}: en /root sin RootGuard`]
  if (deLaConsola && tiene(r, MembresiaGuard)) return [`${texto(r)}: en /root con MembresiaGuard`]
  return []
}

describe('el enrutador: un solo sistema de autenticación por ruta', () => {
  const rutas = rutasDeLaApp(AppModule)
  const textos = rutas.map(texto)

  it('recorre los controllers de toda la aplicación (si no, los demás tests de acá no prueban nada)', () => {
    // Hoy son 121. El número exacto no importa: el tope es para que un recorrido vacío o cortado no pase inadvertido.
    expect(rutas.length).toBeGreaterThan(110)
    expect(textos).toEqual(expect.arrayContaining(['GET /auth/me', 'POST /sessions/close', 'GET /discovery', 'GET /root/historial']))
  })

  it('las listas de este archivo no tienen rutas que no existen ni repetidas', () => {
    const listadas = [...PUBLICAS, ...CON_PERMISO_EN_EL_SERVICE]

    expect(listadas.filter((t) => !textos.includes(t))).toEqual([])
    expect(listadas.filter((t, i) => listadas.indexOf(t) !== i)).toEqual([])
  })

  it('cada ruta es pública, de la sesión de mesa o del personal con Supabase', () => {
    const sinClasificar = rutas.filter((r) => sistemasDe(r).length === 0 && !PUBLICAS.includes(texto(r)))

    expect(sinClasificar.map(texto)).toEqual([])
  })

  it('las rutas públicas no tienen ningún guard', () => {
    const conGuards = rutas.filter((r) => PUBLICAS.includes(texto(r)) && guardsDe(r).length > 0)

    expect(conGuards.map(texto)).toEqual([])
  })

  it('ninguna ruta mezcla dos sistemas (sesión de mesa, Supabase)', () => {
    const mezcladas = rutas.filter((r) => sistemasDe(r).length > 1)

    expect(mezcladas.map((r) => `${texto(r)}: ${sistemasDe(r).join(' + ')}`)).toEqual([])
  })

  it('las rutas del personal que solo autentican (@Personal) son exactamente las de la lista: el rol lo pide su service', () => {
    const soloAutentican = rutas.filter(
      (r) => tiene(r, SupabaseAuthGuard) && !tiene(r, MembresiaGuard) && !tiene(r, RootGuard),
    )

    expect(ordenadas(soloAutentican.map(texto))).toEqual(ordenadas(CON_PERMISO_EN_EL_SERVICE))
  })

  it('MembresiaGuard y RootGuard siempre corren después de SupabaseAuthGuard', () => {
    expect(rutas.flatMap(problemasDeOrden)).toEqual([])
  })

  it('cada @RequiereRol tiene roles y el restaurante sale de un lugar que existe en la ruta', () => {
    expect(rutas.flatMap(problemasDeRequiereRol)).toEqual([])
  })

  it('RootGuard solo está en /root, y las rutas de /root lo exigen', () => {
    expect(rutas.flatMap(problemasDeRoot)).toEqual([])
  })

  describe('las comprobaciones detectan una ruta mal declarada si alguien la agregara', () => {
    @Controller('mal')
    class MalDeclarado {
      @Get('mezcla') @UseGuards(SessionAuthGuard, SupabaseAuthGuard) mezcla() {}
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
      @Get('sin-guards') sinGuards() {}
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

    it('dos sistemas en la misma ruta', () => {
      expect(sistemasDe(ruta(malas, 'GET /mal/mezcla'))).toEqual(['sesión de mesa', 'Supabase'])
    })

    it('una ruta sin ningún guard no se clasifica (y tiene que estar en PUBLICAS)', () => {
      expect(sistemasDe(ruta(malas, 'GET /mal/sin-guards'))).toEqual([])
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
