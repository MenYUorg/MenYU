import * as request from 'supertest'
import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { ItemsController } from './items.controller'
import { ItemsService } from './items.service'

const USUARIOS = {
  OWNER: { sub: 'owner-1', tipo: 'admin', rol: 'OWNER' },
  GERENTE: { sub: 'gerente-1', tipo: 'admin', rol: 'GERENTE' },
  ROOT: { sub: 'root-1', tipo: 'admin', rol: 'ROOT' },
  MOZO: { sub: 'mozo-1', tipo: 'mozo', restauranteId: 'rest-1' },
}

// Reemplaza al guard de JWT: toma el usuario de un header de prueba. El RolesGuard, los roles de cada endpoint
// y la validación del body son los reales, que es lo que se quiere verificar.
const autenticacionFalsa = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest()
    const header = req.headers['x-test-user']
    if (!header) throw new UnauthorizedException()
    req.user = JSON.parse(header as string)
    return true
  },
}

describe('endpoints de descuento de ítems', () => {
  let app: INestApplication
  const mockItems = {
    setDescuento: jest.fn(),
    removeDescuento: jest.fn(),
    update: jest.fn(),
  }
  const RESULTADO = { id: 'item-1', precioDescuento: 1200, porcentajeDescuento: 20, precioVigente: 1200 }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ItemsController],
      providers: [{ provide: ItemsService, useValue: mockItems }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(autenticacionFalsa)
      .compile()

    app = moduleRef.createNestApplication()
    // Igual que main.ts
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockItems.setDescuento.mockResolvedValue(RESULTADO)
    mockItems.removeDescuento.mockResolvedValue({ ...RESULTADO, precioDescuento: null })
    mockItems.update.mockResolvedValue({ id: 'item-1' })
  })

  function poner(usuario: object | null, body: unknown) {
    let req = request(app.getHttpServer()).put('/items/item-1/descuento')
    if (usuario) req = req.set('x-test-user', JSON.stringify(usuario))
    return req.send(body as object)
  }

  function quitar(usuario: object | null) {
    let req = request(app.getHttpServer()).delete('/items/item-1/descuento')
    if (usuario) req = req.set('x-test-user', JSON.stringify(usuario))
    return req
  }

  describe('PUT /items/:id/descuento', () => {
    it('el OWNER pone un descuento por precio', async () => {
      const res = await poner(USUARIOS.OWNER, { precioDescuento: 1200 })

      expect(res.status).toBe(200)
      expect(res.body).toEqual(RESULTADO)
      expect(mockItems.setDescuento).toHaveBeenCalledWith(
        'item-1',
        { precioDescuento: 1200 },
        expect.objectContaining({ rol: 'OWNER' }),
      )
    })

    it('el GERENTE pone un descuento por porcentaje', async () => {
      const res = await poner(USUARIOS.GERENTE, { porcentaje: 20 })

      expect(res.status).toBe(200)
      expect(mockItems.setDescuento).toHaveBeenCalledWith(
        'item-1',
        { porcentaje: 20 },
        expect.objectContaining({ rol: 'GERENTE' }),
      )
    })

    it('ROOT recibe 403 aunque el body sea válido (no es un bypass)', async () => {
      const res = await poner(USUARIOS.ROOT, { precioDescuento: 1200 })

      expect(res.status).toBe(403)
      expect(mockItems.setDescuento).not.toHaveBeenCalled()
    })

    it('un mozo recibe 403', async () => {
      const res = await poner(USUARIOS.MOZO, { precioDescuento: 1200 })

      expect(res.status).toBe(403)
      expect(mockItems.setDescuento).not.toHaveBeenCalled()
    })

    it('sin sesión recibe 401', async () => {
      const res = await poner(null, { precioDescuento: 1200 })

      expect(res.status).toBe(401)
      expect(mockItems.setDescuento).not.toHaveBeenCalled()
    })

    describe('validación del body', () => {
      it.each([
        ['precio con decimales', { precioDescuento: 1199.5 }],
        ['precio cero', { precioDescuento: 0 }],
        ['precio negativo', { precioDescuento: -5 }],
        ['precio como texto', { precioDescuento: '1200' }],
        ['porcentaje 0', { porcentaje: 0 }],
        ['porcentaje 100', { porcentaje: 100 }],
        ['porcentaje con decimales', { porcentaje: 12.5 }],
        ['porcentaje como texto', { porcentaje: '20' }],
      ])('%s → 400 y no llega al servicio', async (_caso, body) => {
        const res = await poner(USUARIOS.OWNER, body)

        expect(res.status).toBe(400)
        expect(mockItems.setDescuento).not.toHaveBeenCalled()
      })

      it('descarta los campos que no corresponden (no se puede cambiar el precio base por acá)', async () => {
        const res = await poner(USUARIOS.OWNER, { porcentaje: 20, precioBase: 1, disponible: false })

        expect(res.status).toBe(200)
        expect(mockItems.setDescuento).toHaveBeenCalledWith('item-1', { porcentaje: 20 }, expect.anything())
      })

      it('acepta los extremos válidos: 1% y 99%, y un precio de $1', async () => {
        expect((await poner(USUARIOS.OWNER, { porcentaje: 1 })).status).toBe(200)
        expect((await poner(USUARIOS.OWNER, { porcentaje: 99 })).status).toBe(200)
        expect((await poner(USUARIOS.OWNER, { precioDescuento: 1 })).status).toBe(200)
      })
    })
  })

  describe('DELETE /items/:id/descuento', () => {
    it.each([
      ['OWNER', USUARIOS.OWNER],
      ['GERENTE', USUARIOS.GERENTE],
    ])('el %s quita el descuento', async (_rol, usuario) => {
      const res = await quitar(usuario)

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ precioDescuento: null })
      expect(mockItems.removeDescuento).toHaveBeenCalledWith('item-1', expect.objectContaining({ rol: usuario.rol }))
    })

    it.each([
      ['ROOT', USUARIOS.ROOT],
      ['un mozo', USUARIOS.MOZO],
    ])('%s recibe 403', async (_nombre, usuario) => {
      const res = await quitar(usuario)

      expect(res.status).toBe(403)
      expect(mockItems.removeDescuento).not.toHaveBeenCalled()
    })

    it('sin sesión recibe 401', async () => {
      const res = await quitar(null)

      expect(res.status).toBe(401)
      expect(mockItems.removeDescuento).not.toHaveBeenCalled()
    })
  })

  describe('el resto de los endpoints de ítems no cambia', () => {
    it('ROOT sigue pudiendo editar un ítem (PATCH): la restricción es solo de los descuentos', async () => {
      const res = await request(app.getHttpServer())
        .patch('/items/item-1')
        .set('x-test-user', JSON.stringify(USUARIOS.ROOT))
        .send({ nombre: 'Nuevo nombre' })

      expect(res.status).toBe(200)
      expect(mockItems.update).toHaveBeenCalled()
    })
  })
})
