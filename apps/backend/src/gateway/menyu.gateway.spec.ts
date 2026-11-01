import { Logger } from '@nestjs/common'
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants'
import { Namespace, Socket } from 'socket.io'
import { AccesoDelSocket } from './acceso-del-socket.service'
import { MenyuGateway } from './menyu.gateway'

// El gateway de Socket.io (DT-08): quién entra a qué sala y a qué salas va cada evento. AccesoDelSocket, el Namespace
// y los sockets son dobles; la verificación de tokens y roles está en acceso-del-socket.service.spec.ts.

const R1 = '6f1c2a40-1111-4a1b-9c3d-000000000001'
const R2 = '6f1c2a40-1111-4a1b-9c3d-000000000002'
const TOKEN = 'token-secreto-del-handshake'

type SocketFalso = Socket & { salas: Set<string>; join: jest.Mock; leave: jest.Mock; emit: jest.Mock }

function crearSocket(auth: Record<string, unknown> = { token: TOKEN }, id = 's1'): SocketFalso {
  const salas = new Set<string>()
  return {
    id,
    handshake: { auth },
    data: {},
    salas,
    join: jest.fn((sala: string | string[]) => [sala].flat().forEach((s) => salas.add(s))),
    leave: jest.fn((sala: string) => salas.delete(sala)),
    emit: jest.fn(),
  } as unknown as SocketFalso
}

let acceso: { personal: jest.Mock; comensal: jest.Mock; sigueAutorizado: jest.Mock }
let emitir: jest.Mock
let hacia: jest.Mock
let gateway: MenyuGateway
let logs: { warn: jest.SpyInstance; debug: jest.SpyInstance; error: jest.SpyInstance; log: jest.SpyInstance }

beforeEach(() => {
  acceso = {
    personal: jest.fn(async () => ({ ok: true, usuarioId: 'usuario-1' })),
    comensal: jest.fn(() => null),
    sigueAutorizado: jest.fn(async () => true),
  }
  emitir = jest.fn()
  hacia = jest.fn((_salas: string | string[]) => ({ emit: emitir }))
  gateway = new MenyuGateway(acceso as unknown as AccesoDelSocket)
  gateway.server = { to: hacia, sockets: new Map() } as unknown as Namespace
  logs = {
    warn: jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {}),
    debug: jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {}),
    error: jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {}),
    log: jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {}),
  }
})

afterEach(() => jest.restoreAllMocks())

/** Todo lo que el gateway mandó al log, para afirmar que el token no aparece. */
function todoElLog(): string {
  return Object.values(logs)
    .flatMap((espia) => espia.mock.calls.flat())
    .map(String)
    .join('\n')
}

describe('MenyuGateway', () => {
  it('registra las conexiones y desconexiones en debug, sin el token', () => {
    const socket = crearSocket()

    gateway.handleConnection(socket)
    gateway.handleDisconnect(socket)

    expect(logs.debug).toHaveBeenNthCalledWith(1, 'conectado: s1')
    expect(logs.debug).toHaveBeenNthCalledWith(2, 'desconectado: s1')
    expect(todoElLog()).not.toContain(TOKEN)
  })

  describe('CORS del socket', () => {
    const origen = Reflect.getMetadata(GATEWAY_OPTIONS, MenyuGateway).cors.origin as (
      origin: string | undefined,
      callback: (error: Error | null, permitido?: boolean) => void,
    ) => void

    afterEach(() => restaurarCorsOrigins())

    it.each([
      ['un origen de la lista', 'https://staff.menyu-app.com', true],
      ['localhost', 'http://localhost:5175', true],
      ['sin origen (no es un navegador)', undefined, true],
      ['otro sitio', 'https://malicioso.example.com', false],
    ])('%s: %s', (_caso, origin, permitido) => {
      process.env.CORS_ORIGINS = 'https://staff.menyu-app.com,https://admin.menyu-app.com'
      const callback = jest.fn()

      origen(origin, callback)

      expect(callback).toHaveBeenCalledWith(null, permitido)
    })
  })

  describe('mozo:join y cocina:join (el personal)', () => {
    it('mozo:join aceptado: entra a salon: y queda registrado como personal', async () => {
      const socket = crearSocket()

      const respuesta = await gateway.unirseAlSalon({ restauranteId: R1 }, socket)

      expect(acceso.personal).toHaveBeenCalledWith(TOKEN, R1, 'salon')
      expect(respuesta).toEqual({ ok: true })
      expect([...socket.salas]).toEqual([`salon:${R1}`])
      expect(socket.data.personal).toEqual({ usuarioId: 'usuario-1', restauranteId: R1, salas: ['salon'] })
    })

    it('cocina:join aceptado: entra a cocina:', async () => {
      const socket = crearSocket()

      const respuesta = await gateway.unirseALaCocina({ restauranteId: R1 }, socket)

      expect(acceso.personal).toHaveBeenCalledWith(TOKEN, R1, 'cocina')
      expect(respuesta).toEqual({ ok: true })
      expect([...socket.salas]).toEqual([`cocina:${R1}`])
    })

    it('en el mismo restaurante puede estar en las dos salas', async () => {
      const socket = crearSocket()

      await gateway.unirseAlSalon({ restauranteId: R1 }, socket)
      await gateway.unirseALaCocina({ restauranteId: R1 }, socket)
      await gateway.unirseAlSalon({ restauranteId: R1 }, socket)

      expect([...socket.salas].sort()).toEqual([`cocina:${R1}`, `salon:${R1}`])
      expect(socket.data.personal.salas).toEqual(['salon', 'cocina'])
    })

    it('rechazado: ack "No autorizado", no entra a nada y el motivo queda solo en el log', async () => {
      acceso.personal.mockResolvedValueOnce({ ok: false, motivo: 'sin-rol' })
      const socket = crearSocket()

      const respuesta = await gateway.unirseAlSalon({ restauranteId: R1 }, socket)

      expect(respuesta).toEqual({ ok: false, error: 'No autorizado' })
      expect(socket.join).not.toHaveBeenCalled()
      expect(socket.data.personal).toBeUndefined()
      expect(logs.warn).toHaveBeenCalledWith(`join rechazado: socket s1, mozo:join, restaurante "${R1}", motivo sin-rol`)
      expect(todoElLog()).not.toContain(TOKEN)
    })

    it('el mismo texto para todos los motivos', async () => {
      for (const motivo of ['sin-token', 'restaurante-invalido', 'token-invalido', 'usuario-inactivo', 'error-de-verificacion']) {
        acceso.personal.mockResolvedValueOnce({ ok: false, motivo })
        expect(await gateway.unirseALaCocina({ restauranteId: R1 }, crearSocket())).toEqual({ ok: false, error: 'No autorizado' })
      }
    })

    it('cambiar de restaurante saca al socket de las salas del anterior', async () => {
      const socket = crearSocket()
      await gateway.unirseAlSalon({ restauranteId: R1 }, socket)
      await gateway.unirseALaCocina({ restauranteId: R1 }, socket)

      await gateway.unirseAlSalon({ restauranteId: R2 }, socket)

      expect(socket.leave).toHaveBeenCalledWith(`salon:${R1}`)
      expect(socket.leave).toHaveBeenCalledWith(`cocina:${R1}`)
      expect([...socket.salas]).toEqual([`salon:${R2}`])
      expect(socket.data.personal).toEqual({ usuarioId: 'usuario-1', restauranteId: R2, salas: ['salon'] })
    })

    it('un join rechazado a otro restaurante no lo saca del que ya tenía', async () => {
      const socket = crearSocket()
      await gateway.unirseAlSalon({ restauranteId: R1 }, socket)
      acceso.personal.mockResolvedValueOnce({ ok: false, motivo: 'sin-rol' })

      expect(await gateway.unirseAlSalon({ restauranteId: R2 }, socket)).toEqual({ ok: false, error: 'No autorizado' })

      expect(socket.leave).not.toHaveBeenCalled()
      expect([...socket.salas]).toEqual([`salon:${R1}`])
    })

    it.each([
      ['sin token', {}],
      ['con un token que no es texto', { token: 42 }],
      ['con un token vacío', { token: '' }],
    ])('%s: le pasa undefined a AccesoDelSocket', async (_caso, auth) => {
      await gateway.unirseAlSalon({ restauranteId: R1 }, crearSocket(auth))

      expect(acceso.personal).toHaveBeenCalledWith(undefined, R1, 'salon')
    })

    it.each([
      ['sin payload', undefined],
      ['con un payload que no es un objeto', 'rest'],
      ['con un restauranteId que no es texto', { restauranteId: { $ne: null } }],
    ])('%s: AccesoDelSocket recibe lo que vino y el log no rompe', async (_caso, payload) => {
      acceso.personal.mockResolvedValueOnce({ ok: false, motivo: 'restaurante-invalido' })

      expect(await gateway.unirseAlSalon(payload, crearSocket())).toEqual({ ok: false, error: 'No autorizado' })
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('motivo restaurante-invalido'))
    })
  })

  describe('session:join (el comensal)', () => {
    it('con el JWT de mesa entra a su sesión y a la carta del restaurante del token, ignorando el del payload', () => {
      acceso.comensal.mockReturnValueOnce({ sesionId: 'ses-1', restauranteId: R1 })
      const socket = crearSocket()

      const respuesta = gateway.unirseALaSesion({ restauranteId: R2 }, socket)

      expect(acceso.comensal).toHaveBeenCalledWith(TOKEN)
      expect(respuesta).toEqual({ ok: true, sesion: true })
      expect([...socket.salas].sort()).toEqual([`menu:${R1}`, 'sesion:ses-1'])
    })

    it('sin token entra solo a la carta del restaurante del payload', () => {
      const socket = crearSocket({})

      const respuesta = gateway.unirseALaSesion({ restauranteId: R1 }, socket)

      expect(acceso.comensal).toHaveBeenCalledWith(undefined)
      expect(respuesta).toEqual({ ok: true, sesion: false })
      expect([...socket.salas]).toEqual([`menu:${R1}`])
    })

    it('con un token que no es de mesa (o del personal) también entra solo a la carta', () => {
      const socket = crearSocket()

      expect(gateway.unirseALaSesion({ restauranteId: R1 }, socket)).toEqual({ ok: true, sesion: false })
      expect([...socket.salas]).toEqual([`menu:${R1}`])
      expect(socket.data.personal).toBeUndefined()
    })

    it.each([
      ['que no es UUID', { restauranteId: 'rest-1' }],
      ['ausente', {}],
      ['que no es texto', { restauranteId: 7 }],
    ])('sin sesión y con un restauranteId %s: no entra a nada', (_caso, payload) => {
      const socket = crearSocket({})

      expect(gateway.unirseALaSesion(payload, socket)).toEqual({ ok: false, error: 'No autorizado' })
      expect(socket.join).not.toHaveBeenCalled()
      expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('session:join'))
    })
  })

  describe('ruteo de cada evento', () => {
    const pedido = { id: 'ped-1', sesionId: 'ses-1' }
    const llamado = { llamadoId: 'll-1', sesionId: 'ses-1', mesaNumero: '4', motivo: 'general' }
    const quierePagar = { sesionId: 'ses-1', mesaId: 'm-1', mesaNumero: '4', totalAcumulado: 2500 }
    const cobro = { sesionId: 'ses-1', mesaId: 'm-1', mesaNumero: '4' }

    it.each([
      ['order:new', (g: MenyuGateway) => g.emitOrderNew(R1, pedido), [`salon:${R1}`, `cocina:${R1}`], pedido],
      ['order:edited', (g: MenyuGateway) => g.emitOrderEdited(R1, pedido), [`salon:${R1}`, `cocina:${R1}`], pedido],
      ['order:updated', (g: MenyuGateway) => g.emitOrderUpdated(R1, pedido), [`salon:${R1}`, `cocina:${R1}`, 'sesion:ses-1'], pedido],
      ['waiter:called', (g: MenyuGateway) => g.emitMozoCalled(R1, llamado), `salon:${R1}`, llamado],
      ['sesion:quierePagar', (g: MenyuGateway) => g.emitQuierePagar(R1, quierePagar), `salon:${R1}`, quierePagar],
      ['sesion:cobrada', (g: MenyuGateway) => g.emitSesionCobrada(R1, cobro), [`salon:${R1}`, 'sesion:ses-1'], cobro],
      ['sesion:cerrada', (g: MenyuGateway) => g.emitSesionCerrada(R1, 'ses-1'), [`salon:${R1}`, 'sesion:ses-1'], { sesionId: 'ses-1' }],
      ['menu:updated', (g: MenyuGateway) => g.emitMenuUpdated(R1), `menu:${R1}`, { restauranteId: R1 }],
    ])('%s va a %j, en una sola llamada', (evento, emitirEvento, salas, datos) => {
      emitirEvento(gateway)

      expect(hacia).toHaveBeenCalledTimes(1)
      expect(hacia).toHaveBeenCalledWith(salas)
      expect(emitir).toHaveBeenCalledWith(evento, datos)
    })

    it.each([
      ['sin sesionId', { id: 'ped-1' }],
      ['con sesionId null (pedido del mozo sin sesión)', { id: 'ped-1', sesionId: null }],
    ])('order:updated %s va solo al personal', (_caso, pedidoSinSesion) => {
      gateway.emitOrderUpdated(R1, pedidoSinSesion as { sesionId?: string | null })

      expect(hacia).toHaveBeenCalledWith([`salon:${R1}`, `cocina:${R1}`])
    })
  })
})

/** `process.env.CORS_ORIGINS` solo lo pisa el bloque de CORS: se vuelve a como estaba. */
const corsOriginal = process.env.CORS_ORIGINS
function restaurarCorsOrigins() {
  if (corsOriginal === undefined) delete process.env.CORS_ORIGINS
  else process.env.CORS_ORIGINS = corsOriginal
}
