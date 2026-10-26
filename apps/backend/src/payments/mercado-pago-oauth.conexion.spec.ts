import { JwtService } from '@nestjs/jwt'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { CryptoService } from '../common/crypto.service'
import { PrismaService } from '../prisma/prisma.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { MercadoPagoOAuthController } from './mercado-pago-oauth.controller'
import { MercadoPagoOAuthService } from './mercado-pago-oauth.service'

// Conectar la cuenta de Mercado Pago de un restaurante, de punta a punta por HTTP: el service y el state firmado son
// reales; la cuenta de Supabase, Prisma, el cifrado y el intercambio del código con Mercado Pago son dobles.
describe('conexión de la cuenta de Mercado Pago', () => {
  const entorno = process.env
  const fetchOriginal = global.fetch
  const SECRETO = 'secreto-de-test'
  const REST = MUNDO.REST_1
  const prisma = { restaurante: { update: jest.fn() } }
  const crypto = { encrypt: jest.fn((t: string) => `cifrado(${t})`), decrypt: jest.fn() }
  const fetchMock = jest.fn()
  const jwtDeLogin = new JwtService({ secret: SECRETO })
  let api: AppDeEndpoints

  const conectar = (cuenta?: UsuarioAutenticado | typeof SIN_USUARIO) =>
    api.pedir('get', '/payments/mercadopago/oauth/conectar', { cuenta, query: { restauranteId: REST } })
  const callback = (state: string) => api.pedir('get', '/payments/mercadopago/oauth/callback', { query: { code: 'codigo-oauth', state } })

  /** El state que el servidor pone en la URL de autorización. */
  const stateEmitido = async () => {
    const res = await conectar(CUENTAS.OWNER_A)
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
    api = await crearAppDeEndpoints(MercadoPagoOAuthController, [
      MercadoPagoOAuthService,
      { provide: PrismaService, useValue: prisma },
      { provide: CryptoService, useValue: crypto },
    ])
  })

  afterAll(async () => {
    await api.cerrar()
    process.env = entorno
  })

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'APP_USR-acceso', refresh_token: 'TG-refresco', user_id: 1, expires_in: 3600 }),
    })
    prisma.restaurante.update.mockResolvedValue({})
  })

  afterEach(() => {
    global.fetch = fetchOriginal
    jest.restoreAllMocks()
  })

  describe('conectar (OWNER o GERENTE del restaurante)', () => {
    it('sin token responde 401, y una cuenta de Supabase sin Usuario 403', async () => {
      expect((await conectar()).status).toBe(401)
      expect((await conectar(SIN_USUARIO)).status).toBe(403)
    })

    it.each([
      ['el OWNER de la marca', CUENTAS.OWNER_A],
      ['el GERENTE del restaurante', CUENTAS.GERENTE],
    ])('%s recibe la URL de autorización, con un state que no es el id del restaurante y lleva su cuenta', async (_caso, cuenta) => {
      const res = await conectar(cuenta)

      expect(res.status).toBe(200)
      const url = new URL(res.body.url as string)
      expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com/authorization')
      expect(url.searchParams.get('redirect_uri')).toBe('https://api.menyu.test/payments/mercadopago/oauth/callback')
      const state = url.searchParams.get('state') as string
      expect(state).not.toBe(REST)
      const datos = jwtDeLogin.verify(state, { secret: `${SECRETO}:mp-oauth-state`, audience: 'mp-oauth-state' })
      expect(datos).toMatchObject({ restauranteId: REST, usuarioId: cuenta.id })
    })

    it.each([
      ['el OWNER de otra marca', CUENTAS.OWNER_B],
      ['el MOZO', CUENTAS.MOZO],
      ['ROOT (no es un bypass)', CUENTAS.ROOT],
    ])('%s recibe 403', async (_caso, cuenta) => {
      const res = await conectar(cuenta)

      expect(res.status).toBe(403)
    })
  })

  describe('callback', () => {
    it('con el state que emitió el servidor guarda la cuenta en ese restaurante y vuelve al admin', async () => {
      const state = await stateEmitido()

      const res = await callback(state)

      expect(res.status).toBe(302)
      expect(res.headers['location']).toBe('https://admin.menyu.test/configuracion/pagos?mp=conectado')
      expect(prisma.restaurante.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: REST } }))
    })

    it.each([
      ['el id del restaurante', () => REST],
      ['un JWT de login', () => jwtDeLogin.sign({ sub: 'owner-1', tipo: 'admin', rol: 'OWNER' })],
      ['un JWT firmado con la clave de login y los datos del restaurante', () => jwtDeLogin.sign({ restauranteId: REST, usuarioId: 'u-1' })],
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
