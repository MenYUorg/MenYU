import { Body, Controller, ExecutionContext, ForbiddenException, Get, Logger, Post, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../../test/app-endpoints'
import { MembresiaGuard, ORIGEN_RESTAURANTE_KEY, ROLES_MEMBRESIA_KEY } from '../guards/membresia.guard'
import { RootGuard } from '../guards/root.guard'
import { AccesoService } from '../supabase/acceso.service'
import { UsuarioAutenticado } from '../supabase/usuario-autenticado'
import { Personal } from './personal.decorator'
import { RequiereRol, RequiereRolEn } from './requiere-rol.decorator'
import { RequiereRoot } from './requiere-root.decorator'
import { UsuarioActual } from './usuario-actual.decorator'

// Los decoradores de la entrega 4.2 (docs/auth/specs/auth.md) sobre rutas que solo existen acá, con el helper de
// endpoints: SupabaseAuthGuard simulado por cuenta, MembresiaGuard y RootGuard reales.

@Controller('prueba')
class PruebaController {
  @Get('restaurantes/:restauranteId')
  @RequiereRol('OWNER', 'GERENTE')
  porDefecto() {
    return { ok: true }
  }

  @Get('mesas/:id')
  @RequiereRolEn({ param: 'id' }, 'OWNER', 'GERENTE', 'MOZO')
  porParametro() {
    return { ok: true }
  }

  @Get('listado')
  @RequiereRolEn({ query: 'restauranteId' }, 'GERENTE')
  porQuery() {
    return { ok: true }
  }

  @Post('alta')
  @RequiereRolEn({ body: 'restauranteId' }, 'OWNER')
  porBody(@Body() body: unknown) {
    return body
  }

  @Get('mal-declarada/:id')
  @RequiereRol('OWNER')
  sinElParametro() {
    return { ok: true }
  }

  @Get('sin-roles/:restauranteId')
  @RequiereRol()
  sinRoles() {
    return { ok: true }
  }

  @Get('items/:id')
  @Personal()
  deUnRecurso(@UsuarioActual() usuario: UsuarioAutenticado) {
    return { usuarioId: usuario.id }
  }

  @Get('root')
  @RequiereRoot()
  deRoot(@UsuarioActual() usuario: UsuarioAutenticado) {
    return { usuarioId: usuario.id }
  }
}

@Controller('prueba-clase/:restauranteId')
@RequiereRol('OWNER')
class ConRolEnElControllerController {
  @Get()
  ver() {
    return { ok: true }
  }
}

describe('@RequiereRol, @RequiereRolEn, @Personal y @RequiereRoot', () => {
  let api: AppDeEndpoints
  let apiDeClase: AppDeEndpoints

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    api = await crearAppDeEndpoints(PruebaController, [])
    apiDeClase = await crearAppDeEndpoints(ConRolEnElControllerController, [])
  })

  afterAll(async () => {
    await api.cerrar()
    await apiDeClase.cerrar()
    jest.restoreAllMocks()
  })

  const RUTAS_PROTEGIDAS: Array<[string, 'get' | 'post', string]> = [
    ['@RequiereRol', 'get', `/prueba/restaurantes/${MUNDO.REST_1}`],
    ['@RequiereRolEn param', 'get', `/prueba/mesas/${MUNDO.REST_1}`],
    ['@RequiereRolEn query', 'get', `/prueba/listado?restauranteId=${MUNDO.REST_1}`],
    ['@RequiereRolEn body', 'post', '/prueba/alta'],
    ['@Personal', 'get', '/prueba/items/item-1'],
    ['@RequiereRoot', 'get', '/prueba/root'],
  ]

  describe('autenticación (todas las variantes)', () => {
    it.each(RUTAS_PROTEGIDAS)('%s: sin token, 401', async (_variante, metodo, ruta) => {
      const res = await api.pedir(metodo, ruta, { body: { restauranteId: MUNDO.REST_1 } })

      expect(res.status).toBe(401)
    })

    it.each(RUTAS_PROTEGIDAS)('%s: cuenta de Supabase sin Usuario, 403', async (_variante, metodo, ruta) => {
      const res = await api.pedir(metodo, ruta, { cuenta: SIN_USUARIO, body: { restauranteId: MUNDO.REST_1 } })

      expect(res.status).toBe(403)
    })
  })

  describe('@RequiereRol (restaurante de :restauranteId)', () => {
    it.each([
      ['el OWNER de la marca (cubre la sucursal)', CUENTAS.OWNER_A, MUNDO.REST_1, 200],
      ['el OWNER de la marca, en otra sucursal sin personal propio', CUENTAS.OWNER_A, MUNDO.REST_2, 200],
      ['el GERENTE de su restaurante', CUENTAS.GERENTE, MUNDO.REST_1, 200],
      ['el OWNER de otra marca', CUENTAS.OWNER_B, MUNDO.REST_1, 403],
      ['el GERENTE en otro restaurante de la misma marca', CUENTAS.GERENTE, MUNDO.REST_2, 403],
      ['un rol que no está en la lista (MOZO)', CUENTAS.MOZO, MUNDO.REST_1, 403],
      ['ROOT (no es un bypass)', CUENTAS.ROOT, MUNDO.REST_1, 403],
      ['un Usuario sin membresías', CUENTAS.SIN_MEMBRESIAS, MUNDO.REST_1, 403],
      ['un restaurante que no existe', CUENTAS.OWNER_A, 'no-existe', 403],
    ])('%s: %i', async (_caso, cuenta, restauranteId, estado) => {
      const res = await api.pedir('get', `/prueba/restaurantes/${restauranteId}`, { cuenta })

      expect(res.status).toBe(estado)
    })

    it('a nivel de controller vale para todas sus rutas', async () => {
      const deLaMarca = await apiDeClase.pedir('get', `/prueba-clase/${MUNDO.REST_1}`, { cuenta: CUENTAS.OWNER_A })
      const gerente = await apiDeClase.pedir('get', `/prueba-clase/${MUNDO.REST_1}`, { cuenta: CUENTAS.GERENTE })

      expect(deLaMarca.status).toBe(200)
      expect(gerente.status).toBe(403)
    })

    it('una ruta sin el parámetro que declara falla cerrado (403), aunque el usuario tenga el rol', async () => {
      const res = await api.pedir('get', `/prueba/mal-declarada/${MUNDO.REST_1}`, { cuenta: CUENTAS.OWNER_A })

      expect(res.status).toBe(403)
    })

    it('sin roles no deja pasar a nadie (403)', async () => {
      const res = await api.pedir('get', `/prueba/sin-roles/${MUNDO.REST_1}`, { cuenta: CUENTAS.OWNER_A })

      expect(res.status).toBe(403)
    })
  })

  describe('@RequiereRolEn', () => {
    it('{ param: "id" } toma el restaurante de :id', async () => {
      const mozo = await api.pedir('get', `/prueba/mesas/${MUNDO.REST_1}`, { cuenta: CUENTAS.MOZO })
      const cocina = await api.pedir('get', `/prueba/mesas/${MUNDO.REST_1}`, { cuenta: CUENTAS.COCINA })

      expect(mozo.status).toBe(200)
      expect(cocina.status).toBe(403)
    })

    describe('{ query: "restauranteId" }', () => {
      it('con el rol en el restaurante de la query: 200', async () => {
        const res = await api.pedir('get', '/prueba/listado', { cuenta: CUENTAS.GERENTE, query: { restauranteId: MUNDO.REST_1 } })

        expect(res.status).toBe(200)
      })

      it('sin el rol en el restaurante de la query: 403', async () => {
        const res = await api.pedir('get', '/prueba/listado', { cuenta: CUENTAS.GERENTE, query: { restauranteId: MUNDO.REST_2 } })

        expect(res.status).toBe(403)
      })

      it.each([
        ['sin restauranteId', {}],
        ['vacío', { restauranteId: '' }],
        ['repetido (llega como lista)', { restauranteId: [MUNDO.REST_1, MUNDO.REST_2] }],
      ])('%s: 400', async (_caso, query) => {
        const res = await api.pedir('get', '/prueba/listado', { cuenta: CUENTAS.GERENTE, query })

        expect(res.status).toBe(400)
        expect(res.body.message).toBe('Falta restauranteId en la query')
      })

      it('no lo toma del body', async () => {
        const res = await api.pedir('get', '/prueba/listado', { cuenta: CUENTAS.GERENTE, body: { restauranteId: MUNDO.REST_1 } })

        expect(res.status).toBe(400)
      })
    })

    describe('{ body: "restauranteId" }', () => {
      it('con el rol en el restaurante del body: 201', async () => {
        const res = await api.pedir('post', '/prueba/alta', { cuenta: CUENTAS.OWNER_A, body: { restauranteId: MUNDO.REST_2 } })

        expect(res.status).toBe(201)
      })

      it('el OWNER de otra marca: 403', async () => {
        const res = await api.pedir('post', '/prueba/alta', { cuenta: CUENTAS.OWNER_B, body: { restauranteId: MUNDO.REST_1 } })

        expect(res.status).toBe(403)
      })

      it.each([
        ['sin restauranteId', {}],
        ['un número', { restauranteId: 1 }],
        ['un objeto', { restauranteId: { id: MUNDO.REST_1 } }],
      ])('%s: 400', async (_caso, body) => {
        const res = await api.pedir('post', '/prueba/alta', { cuenta: CUENTAS.OWNER_A, body })

        expect(res.status).toBe(400)
        expect(res.body.message).toBe('Falta restauranteId en el body')
      })

      it('no lo toma de la query', async () => {
        const res = await api.pedir('post', '/prueba/alta', { cuenta: CUENTAS.OWNER_A, query: { restauranteId: MUNDO.REST_1 } })

        expect(res.status).toBe(400)
      })
    })
  })

  describe('@Personal', () => {
    it.each([
      ['ROOT', CUENTAS.ROOT],
      ['un Usuario sin membresías', CUENTAS.SIN_MEMBRESIAS],
      ['el MOZO', CUENTAS.MOZO],
    ])('solo autentica (el rol lo exige el service): %s pasa', async (_caso, cuenta) => {
      const res = await api.pedir('get', '/prueba/items/item-1', { cuenta })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ usuarioId: cuenta.id })
    })
  })

  describe('@RequiereRoot', () => {
    it('una cuenta ROOT: 200', async () => {
      const res = await api.pedir('get', '/prueba/root', { cuenta: CUENTAS.ROOT })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ usuarioId: CUENTAS.ROOT.id })
    })

    it.each([
      ['el OWNER', CUENTAS.OWNER_A],
      ['un Usuario sin membresías', CUENTAS.SIN_MEMBRESIAS],
    ])('%s: 403', async (_caso, cuenta) => {
      const res = await api.pedir('get', '/prueba/root', { cuenta })

      expect(res.status).toBe(403)
    })
  })
})

describe('los guards solos fallan cerrado', () => {
  function contexto(request: object, handler: () => void = () => undefined): ExecutionContext {
    return {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext
  }

  it('MembresiaGuard sin SupabaseAuthGuard antes (sin usuario en la request): 403 sin consultar', async () => {
    // Arrange
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const acceso = { rolesEnRestaurante: jest.fn() }
    const guard = new MembresiaGuard(new Reflector(), acceso as unknown as AccesoService)
    class Ruta {
      @SetMetadata(ROLES_MEMBRESIA_KEY, ['OWNER'])
      @SetMetadata(ORIGEN_RESTAURANTE_KEY, { param: 'restauranteId' })
      manejador() {}
    }

    // Act + Assert
    await expect(
      guard.canActivate(contexto({ params: { restauranteId: MUNDO.REST_1 } }, Ruta.prototype.manejador)),
    ).rejects.toThrow(ForbiddenException)
    expect(acceso.rolesEnRestaurante).not.toHaveBeenCalled()
    jest.restoreAllMocks()
  })

  it.each([
    ['sin usuario en la request', {}],
    ['con un usuario que no es ROOT', { usuario: { ...CUENTAS.OWNER_A } }],
    ['con esRoot que no es true', { usuario: { ...CUENTAS.OWNER_A, esRoot: 'true' } }],
  ])('RootGuard %s: 403', (_caso, request) => {
    expect(() => new RootGuard().canActivate(contexto(request))).toThrow(ForbiddenException)
  })
})
