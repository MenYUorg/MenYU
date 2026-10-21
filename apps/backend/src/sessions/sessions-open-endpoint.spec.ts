import * as request from 'supertest'
import { ConflictException, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { MembresiaGuard } from '../auth/guards/membresia.guard'
import { SessionAuthGuard } from '../auth/guards/session-auth.guard'
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard'
import { SessionsController } from './sessions.controller'
import { SessionsService } from './sessions.service'

// `POST /sessions/open` es público (el comensal todavía no tiene sesión). Acá se prueba lo que pone el controller y
// la validación del body (con el mismo ValidationPipe que main.ts): que `restauranteId` pase junto con `tableCode` y
// que el 409 del servicio llegue como 409. La lógica de la mesa se prueba en sessions.service.spec.
describe('POST /sessions/open', () => {
  let app: INestApplication
  const mockSessions = { open: jest.fn() }
  const SESION = { sesionId: 'ses-1', mesaId: 'mesa-1', restauranteId: 'rest-1', jwt: 'jwt', numeroMesa: '5' }
  const permitir = { canActivate: () => true }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [{ provide: SessionsService, useValue: mockSessions }],
    })
      // Los guards de los demás endpoints del controller no se usan acá.
      .overrideGuard(SupabaseAuthGuard).useValue(permitir)
      .overrideGuard(MembresiaGuard).useValue(permitir)
      .overrideGuard(SessionAuthGuard).useValue(permitir)
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockSessions.open.mockResolvedValue(SESION)
  })

  const abrir = (body: unknown) => request(app.getHttpServer()).post('/sessions/open').send(body as object)

  it('es público: responde sin iniciar sesión', async () => {
    const res = await abrir({ tableCode: 'qr-1' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(SESION)
    expect(mockSessions.open).toHaveBeenCalledWith({ tableCode: 'qr-1' }, undefined)
  })

  it('el código del QR y el restaurante elegido llegan juntos al servicio (D11)', async () => {
    const res = await abrir({ tableCode: 'qr-1', restauranteId: 'rest-1' })

    expect(res.status).toBe(200)
    expect(mockSessions.open).toHaveBeenCalledWith({ tableCode: 'qr-1', restauranteId: 'rest-1' }, undefined)
  })

  it('el PIN llega con el restaurante', async () => {
    const res = await abrir({ pin: '4821', restauranteId: 'rest-1' })

    expect(res.status).toBe(200)
    expect(mockSessions.open).toHaveBeenCalledWith({ pin: '4821', restauranteId: 'rest-1' }, undefined)
  })

  it('el código de sesión del modo seguro sigue pasando', async () => {
    await abrir({ tableCode: 'qr-1', restauranteId: 'rest-1', codigoSesion: '042' })

    expect(mockSessions.open).toHaveBeenCalledWith({ tableCode: 'qr-1', restauranteId: 'rest-1', codigoSesion: '042' }, undefined)
  })

  it('le pasa al servicio el header de autorización (para reconocer al cliente que ya inició sesión)', async () => {
    await abrir({ tableCode: 'qr-1' }).set('Authorization', 'Bearer token-de-prueba')

    expect(mockSessions.open).toHaveBeenCalledWith({ tableCode: 'qr-1' }, 'Bearer token-de-prueba')
  })

  it('un QR de otro restaurante (el servicio lanza conflicto) responde 409 con el mensaje', async () => {
    mockSessions.open.mockRejectedValue(new ConflictException('Ese QR no es de este restaurante'))

    const res = await abrir({ tableCode: 'qr-1', restauranteId: 'rest-2' })

    expect(res.status).toBe(409)
    expect(res.body.message).toBe('Ese QR no es de este restaurante')
  })

  it('una mesa que no existe responde 404', async () => {
    mockSessions.open.mockRejectedValue(new NotFoundException('Mesa no encontrada'))

    const res = await abrir({ pin: '0000', restauranteId: 'rest-1' })

    expect(res.status).toBe(404)
  })

  it('un campo que no es del DTO se descarta antes de llegar al servicio', async () => {
    await abrir({ tableCode: 'qr-1', restauranteId: 'rest-1', clienteId: 'otro-cliente', activo: true })

    expect(mockSessions.open).toHaveBeenCalledWith({ tableCode: 'qr-1', restauranteId: 'rest-1' }, undefined)
  })

  it.each([
    ['tableCode', { tableCode: 123 }],
    ['restauranteId', { tableCode: 'qr-1', restauranteId: 42 }],
    ['pin', { pin: 4821, restauranteId: 'rest-1' }],
  ])('un %s que no es texto da 400 y no llega al servicio', async (_campo, body) => {
    const res = await abrir(body)

    expect(res.status).toBe(400)
    expect(mockSessions.open).not.toHaveBeenCalled()
  })
})
