import { INestApplication } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import * as request from 'supertest'
import { JwtStrategy } from '../auth/strategies/jwt.strategy'
import { CryptoService } from '../common/crypto.service'
import { PrismaService } from '../prisma/prisma.service'
import { MercadoPagoOAuthController } from './mercado-pago-oauth.controller'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'

// Conectar la cuenta de Mercado Pago de un restaurante, de punta a punta por HTTP: el JWT de login es real
// y Prisma, el cifrado y el intercambio del código con Mercado Pago son dobles.
describe('conexión de la cuenta de Mercado Pago', () => {
  const entorno = process.env
  const fetchOriginal = global.fetch
  const SECRETO = 'secreto-de-test'
  const prisma = {
    admin: { findUnique: jest.fn() },
    restaurante: { findUnique: jest.fn(), update: jest.fn() },
    adminRestaurante: { findUnique: jest.fn() },
  }
  const crypto = { encrypt: jest.fn((t: string) => `cifrado(${t})`), decrypt: jest.fn() }
  const fetchMock = jest.fn()
  let app: INestApplication
  let jwt: JwtService

  const OWNER = { sub: 'owner-1', email: 'owner@test', tipo: 'admin', rol: 'OWNER' }
  const MOZO = { sub: 'mozo-1', email: 'mozo@test', tipo: 'mozo', restauranteId: 'rest-1' }
  const login = (usuario: object) => `Bearer ${jwt.sign(usuario)}`

  const conectar = (autorizacion?: string) => {
    const pedido = request(app.getHttpServer()).get('/payments/mercadopago/oauth/conectar').query({ restauranteId: 'rest-1' })
    return autorizacion ? pedido.set('Authorization', autorizacion) : pedido
  }
  const callback = (state: string) =>
    request(app.getHttpServer()).get('/payments/mercadopago/oauth/callback').query({ code: 'codigo-oauth', state })

  /** El state que el servidor pone en la URL de autorización. */
  const stateEmitido = async () => {
    const res = await conectar(login(OWNER))
    return new URL(res.body.url as string).searchParams.get('state') as string
  }

  beforeAll(async () => {
    process.env = {
      ...entorno,
      JWT_SECRET: SECRETO,
      MP_CLIENT_ID: 'cliente-123',
      MP_CLIENT_SECRET: 'secreto-mp',
      BASE_URL: 'https://api.menyu.test',
      FRONTEND_ADMIN_URL: 'https://admin.menyu.test',
    }
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: SECRETO, signOptions: { expiresIn: '8h' } })],
      controllers: [MercadoPagoOAuthController],
      providers: [
        MercadoPagoOAuthService,
        JwtStrategy,
        { provide: PrismaService, useValue: prisma },
        { provide: CryptoService, useValue: crypto },
      ],
    }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
    jwt = moduleRef.get(JwtService)
  })

  afterAll(async () => {
    await app.close()
    process.env = entorno
  })

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'APP_USR-acceso', refresh_token: 'TG-refresco', user_id: 1, expires_in: 3600 }),
    })
    // El OWNER es de la marca del restaurante.
    prisma.admin.findUnique.mockResolvedValue({ id: 'owner-1', marcaId: 'marca-1' })
    prisma.restaurante.findUnique.mockResolvedValue({ id: 'rest-1', marcaId: 'marca-1' })
    prisma.restaurante.update.mockResolvedValue({})
  })

  afterEach(() => {
    global.fetch = fetchOriginal
    jest.restoreAllMocks()
  })

  describe('conectar', () => {
    it('sin sesión iniciada responde 401', async () => {
      const res = await conectar()

      expect(res.status).toBe(401)
    })

    it('el OWNER de la marca recibe la URL de autorización, con un state que no es el id del restaurante', async () => {
      const res = await conectar(login(OWNER))

      expect(res.status).toBe(200)
      const url = new URL(res.body.url as string)
      expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com/authorization')
      expect(url.searchParams.get('redirect_uri')).toBe('https://api.menyu.test/payments/mercadopago/oauth/callback')
      expect(url.searchParams.get('state')).toBeTruthy()
      expect(url.searchParams.get('state')).not.toBe('rest-1')
    })

    it('un OWNER de otra marca recibe 403', async () => {
      prisma.restaurante.findUnique.mockResolvedValue({ id: 'rest-1', marcaId: 'marca-2' })

      const res = await conectar(login(OWNER))

      expect(res.status).toBe(403)
    })

    it('un mozo recibe 403', async () => {
      const res = await conectar(login(MOZO))

      expect(res.status).toBe(403)
    })
  })

  describe('callback', () => {
    it('con el state que emitió el servidor guarda la cuenta en ese restaurante y vuelve al admin', async () => {
      const state = await stateEmitido()

      const res = await callback(state)

      expect(res.status).toBe(302)
      expect(res.headers['location']).toBe('https://admin.menyu.test/configuracion/pagos?mp=conectado')
      expect(prisma.restaurante.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rest-1' } }))
    })

    it.each([
      ['el id del restaurante', () => 'rest-1'],
      ['un JWT de login', () => jwt.sign(OWNER)],
      ['un JWT firmado con la clave de login y los datos del restaurante', () => jwt.sign({ restauranteId: 'rest-1', adminId: 'owner-1' })],
    ])('con %s como state responde 400 y no guarda nada', async (_, state) => {
      const res = await callback(state())

      expect(res.status).toBe(400)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(prisma.restaurante.update).not.toHaveBeenCalled()
    })

    it('con un state vencido (más de 10 minutos) responde 400 y no guarda nada', async () => {
      const state = await stateEmitido()
      const ahora = Date.now()
      jest.spyOn(Date, 'now').mockReturnValue(ahora + 11 * 60 * 1000)

      const res = await callback(state)

      expect(res.status).toBe(400)
      expect(prisma.restaurante.update).not.toHaveBeenCalled()
    })
  })
})
