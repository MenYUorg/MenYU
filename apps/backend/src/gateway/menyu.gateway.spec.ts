import { Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants'
import { errors } from 'jose'
import { Namespace, Socket } from 'socket.io'
import { AccesoService } from '../auth/supabase/acceso.service'
import { VerificadorTokenSupabase } from '../auth/supabase/verificador-token.service'
import { PrismaService } from '../prisma/prisma.service'
import { accesoDeTest, CUENTAS, MUNDO } from '../test/acceso-de-test'
import { AccesoDelSocket } from './acceso-del-socket.service'
import {
  intervaloDeRevalidacion,
  MenyuGateway,
  REVALIDACION_MAXIMA_MS,
  REVALIDACION_MINIMA_MS,
  REVALIDACION_POR_DEFECTO_MS,
} from './menyu.gateway'

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

let acceso: { personal: jest.Mock; personalYaAutenticado: jest.Mock; comensal: jest.Mock; sigueAutorizado: jest.Mock }
let emitir: jest.Mock
let hacia: jest.Mock
let gateway: MenyuGateway
let logs: { warn: jest.SpyInstance; debug: jest.SpyInstance; error: jest.SpyInstance; log: jest.SpyInstance }

beforeEach(() => {
  acceso = {
    personal: jest.fn(async () => ({ ok: true, usuarioId: 'usuario-1' })),
    comensal: jest.fn(() => null),
    sigueAutorizado: jest.fn(async () => true),
    personalYaAutenticado: jest.fn(async (usuarioId: string) => ({ ok: true, usuarioId })),
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

afterEach(() => {
  gateway.onModuleDestroy()
  jest.restoreAllMocks()
})

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
      acceso.personalYaAutenticado.mockResolvedValueOnce({ ok: false, motivo: 'sin-rol' })

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

  describe('revalidación del acceso del personal', () => {
    const revalidacionOriginal = process.env.WS_REVALIDACION_MS

    afterEach(() => {
      jest.useRealTimers()
      if (revalidacionOriginal === undefined) delete process.env.WS_REVALIDACION_MS
      else process.env.WS_REVALIDACION_MS = revalidacionOriginal
    })

    /** Un socket del personal ya unido a esas salas de R1, en la lista de sockets del Namespace. */
    async function socketDelPersonal(id: string, salas: ('salon' | 'cocina')[] = ['salon']): Promise<SocketFalso> {
      const socket = crearSocket({ token: TOKEN }, id)
      for (const sala of salas) {
        await (sala === 'salon' ? gateway.unirseAlSalon : gateway.unirseALaCocina).call(gateway, { restauranteId: R1 }, socket)
      }
      ;(gateway.server.sockets as Map<string, Socket>).set(id, socket)
      return socket
    }

    it.each([
      ['sin la variable', undefined, REVALIDACION_POR_DEFECTO_MS],
      ['vacía', '', REVALIDACION_POR_DEFECTO_MS],
      ['que no es un número', 'diez minutos', REVALIDACION_POR_DEFECTO_MS],
      ['con un valor válido', '5000', 5000],
      ['con decimales', '1500.7', 1500],
      ['por debajo del mínimo', '10', REVALIDACION_MINIMA_MS],
      ['negativa', '-5', REVALIDACION_MINIMA_MS],
      ['por encima del máximo', '99999999999', REVALIDACION_MAXIMA_MS],
      ['enorme', '1e20', REVALIDACION_MAXIMA_MS],
    ])('WS_REVALIDACION_MS %s: %s', (_caso, valor, esperado) => {
      expect(intervaloDeRevalidacion(valor)).toBe(esperado)
    })

    it('el intervalo se crea al iniciar el módulo, con unref, y OnModuleDestroy lo limpia', () => {
      jest.useFakeTimers()
      const programar = jest.spyOn(global, 'setInterval')

      gateway.onModuleInit()
      expect(jest.getTimerCount()).toBe(1)
      expect(programar).toHaveBeenCalledWith(expect.any(Function), REVALIDACION_POR_DEFECTO_MS)

      gateway.onModuleDestroy()
      expect(jest.getTimerCount()).toBe(0)
    })

    it('el intervalo no retiene el proceso (unref)', () => {
      gateway.onModuleInit()
      const intervalo = (gateway as unknown as { revalidacion: NodeJS.Timeout }).revalidacion

      expect(intervalo.hasRef()).toBe(false)
      gateway.onModuleDestroy()
    })

    it('quien pierde el rol sale de la sala y recibe acceso:revocado en la próxima pasada', async () => {
      jest.useFakeTimers()
      process.env.WS_REVALIDACION_MS = '1000'
      const socket = await socketDelPersonal('s1')
      acceso.sigueAutorizado.mockResolvedValue(false)
      gateway.onModuleInit()

      await jest.advanceTimersByTimeAsync(1000)

      expect(acceso.sigueAutorizado).toHaveBeenCalledWith('usuario-1', R1, 'salon')
      expect(socket.leave).toHaveBeenCalledWith(`salon:${R1}`)
      expect(socket.salas.size).toBe(0)
      expect(socket.emit).toHaveBeenCalledWith('acceso:revocado', { restauranteId: R1 })
      expect(socket.data.personal).toBeUndefined()
      expect(todoElLog()).not.toContain(TOKEN)
    })

    it('si pierde solo el salón, sigue en la cocina y recibe un solo aviso', async () => {
      const socket = await socketDelPersonal('s1', ['salon', 'cocina'])
      acceso.sigueAutorizado.mockImplementation(async (_u: string, _r: string, sala: string) => sala === 'cocina')

      await gateway.revalidar()

      expect([...socket.salas]).toEqual([`cocina:${R1}`])
      expect(socket.data.personal.salas).toEqual(['cocina'])
      expect(socket.emit).toHaveBeenCalledTimes(1)
      expect(socket.emit).toHaveBeenCalledWith('acceso:revocado', { restauranteId: R1 })
    })

    it('quien sigue autorizado no nota nada', async () => {
      const socket = await socketDelPersonal('s1', ['salon', 'cocina'])

      await gateway.revalidar()

      expect(socket.leave).not.toHaveBeenCalled()
      expect(socket.emit).not.toHaveBeenCalled()
      expect(socket.salas.size).toBe(2)
    })

    it('chequea cada (usuario, restaurante, sala) una sola vez por pasada', async () => {
      await socketDelPersonal('s1')
      await socketDelPersonal('s2')

      await gateway.revalidar()

      expect(acceso.sigueAutorizado).toHaveBeenCalledTimes(1)
    })

    it('los sockets que no son del personal (comensales) no se revisan', async () => {
      const comensal = crearSocket({}, 'c1')
      gateway.unirseALaSesion({ restauranteId: R1 }, comensal)
      ;(gateway.server.sockets as Map<string, Socket>).set('c1', comensal)

      await gateway.revalidar()

      expect(acceso.sigueAutorizado).not.toHaveBeenCalled()
      expect([...comensal.salas]).toEqual([`menu:${R1}`])
    })

    it('un error de base no revoca a nadie: lo loguea y reintenta en la próxima pasada', async () => {
      jest.useFakeTimers()
      process.env.WS_REVALIDACION_MS = '1000'
      const socket = await socketDelPersonal('s1')
      acceso.sigueAutorizado.mockRejectedValueOnce(new Error("Can't reach database server"))
      gateway.onModuleInit()

      await jest.advanceTimersByTimeAsync(1000)

      expect(socket.leave).not.toHaveBeenCalled()
      expect(socket.emit).not.toHaveBeenCalled()
      expect(logs.error).toHaveBeenCalledWith(expect.stringContaining("Can't reach database server"))

      acceso.sigueAutorizado.mockResolvedValueOnce(false)
      await jest.advanceTimersByTimeAsync(1000)

      expect(acceso.sigueAutorizado).toHaveBeenCalledTimes(2)
      expect(socket.emit).toHaveBeenCalledWith('acceso:revocado', { restauranteId: R1 })
    })

    it('si el socket pasó a otro restaurante durante el chequeo, no se lo saca del nuevo', async () => {
      const socket = await socketDelPersonal('s1')
      acceso.sigueAutorizado.mockImplementationOnce(async () => {
        await gateway.unirseAlSalon({ restauranteId: R2 }, socket)
        return false
      })

      await gateway.revalidar()

      expect([...socket.salas]).toEqual([`salon:${R2}`])
      expect(socket.emit).not.toHaveBeenCalled()
    })

    it('una pasada no arranca si la anterior sigue corriendo', async () => {
      await socketDelPersonal('s1')
      let liberar!: (sigue: boolean) => void
      acceso.sigueAutorizado.mockImplementationOnce(() => new Promise<boolean>((resolve) => (liberar = resolve)))

      const primera = gateway.revalidar()
      await gateway.revalidar()
      liberar(true)
      await primera

      expect(acceso.sigueAutorizado).toHaveBeenCalledTimes(1)
    })
  })
})

// El token del handshake no cambia mientras vive la conexión y el de Supabase vence a la hora: se exige en el primer
// join y los siguientes se apoyan en esa identidad. Acá AccesoDelSocket es el real, con el verificador y la base dobles.
describe('MenyuGateway: los joins de un socket ya autenticado', () => {
  const TOKEN_DEL_MOZO = 'token-del-mozo'
  const TOKEN_DEL_OWNER = 'token-del-owner'
  const vencido = () => new errors.JWTExpired('"exp" claim timestamp check failed', {})

  let verificar: jest.Mock
  let activos: Set<string>
  let buscarUsuario: jest.Mock
  let accesoReal: AccesoService
  let conAcceso: MenyuGateway

  beforeEach(() => {
    const deToken: Record<string, string> = {
      [TOKEN_DEL_MOZO]: CUENTAS.MOZO.supabaseUserId,
      [TOKEN_DEL_OWNER]: CUENTAS.OWNER_A.supabaseUserId,
    }
    verificar = jest.fn(async (token: string) => {
      if (deToken[token]) return deToken[token]
      throw new errors.JWSSignatureVerificationFailed()
    })
    activos = new Set([CUENTAS.MOZO.id, CUENTAS.OWNER_A.id])
    buscarUsuario = jest.fn(async ({ where }: { where: { supabaseUserId?: string; id?: string } }) => {
      const cuenta = Object.values(CUENTAS).find((c) => c.supabaseUserId === where.supabaseUserId || c.id === where.id)
      return cuenta ? { id: cuenta.id, activo: activos.has(cuenta.id) } : null
    })
    accesoReal = accesoDeTest()
    conAcceso = new MenyuGateway(
      new AccesoDelSocket(
        { verificar } as unknown as VerificadorTokenSupabase,
        { usuario: { findUnique: buscarUsuario } } as unknown as PrismaService,
        accesoReal,
        new JwtService({ secret: 'secreto-de-test' }),
      ),
    )
    conAcceso.server = { to: jest.fn(() => ({ emit: jest.fn() })), sockets: new Map() } as unknown as Namespace
  })

  it('primer join con el token vencido: rechazado', async () => {
    verificar.mockRejectedValueOnce(vencido())
    const socket = crearSocket({ token: TOKEN_DEL_MOZO })

    expect(await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_1 }, socket)).toEqual({ ok: false, error: 'No autorizado' })
    expect(socket.salas.size).toBe(0)
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('motivo token-invalido'))
  })

  it('primer join con un token inválido: rechazado', async () => {
    const socket = crearSocket({ token: 'token-falsificado' })

    expect(await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_1 }, socket)).toEqual({ ok: false, error: 'No autorizado' })
    expect(socket.data.personal).toBeUndefined()
  })

  it('segundo join a otra sala con el token ya vencido: ok, sin volver a verificar el token', async () => {
    const socket = crearSocket({ token: TOKEN_DEL_MOZO })
    await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_1 }, socket)
    verificar.mockRejectedValue(vencido())

    expect(await conAcceso.unirseALaCocina({ restauranteId: MUNDO.REST_1 }, socket)).toEqual({ ok: true })

    expect(verificar).toHaveBeenCalledTimes(1)
    expect([...socket.salas].sort()).toEqual([`cocina:${MUNDO.REST_1}`, `salon:${MUNDO.REST_1}`])
  })

  it('segundo join a otro restaurante donde tiene rol, con el token ya vencido: ok y sale del anterior', async () => {
    const socket = crearSocket({ token: TOKEN_DEL_OWNER })
    await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_1 }, socket)
    verificar.mockRejectedValue(vencido())

    expect(await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_2 }, socket)).toEqual({ ok: true })

    expect(verificar).toHaveBeenCalledTimes(1)
    expect([...socket.salas]).toEqual([`salon:${MUNDO.REST_2}`])
    expect(socket.data.personal).toEqual({ usuarioId: CUENTAS.OWNER_A.id, restauranteId: MUNDO.REST_2, salas: ['salon'] })
  })

  it('segundo join a un restaurante donde no tiene rol: rechazado y conserva sus salas', async () => {
    const socket = crearSocket({ token: TOKEN_DEL_MOZO })
    await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_1 }, socket)

    expect(await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_B }, socket)).toEqual({ ok: false, error: 'No autorizado' })

    expect([...socket.salas]).toEqual([`salon:${MUNDO.REST_1}`])
    expect(socket.data.personal.restauranteId).toBe(MUNDO.REST_1)
    expect(socket.leave).not.toHaveBeenCalled()
  })

  it('segundo join con un restauranteId que no es UUID: rechazado sin tocar la base', async () => {
    const socket = crearSocket({ token: TOKEN_DEL_MOZO })
    await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_1 }, socket)
    buscarUsuario.mockClear()

    expect(await conAcceso.unirseALaCocina({ restauranteId: 'rest-1' }, socket)).toEqual({ ok: false, error: 'No autorizado' })
    expect(buscarUsuario).not.toHaveBeenCalled()
  })

  it('con el usuario desactivado entre un join y el siguiente: rechazado', async () => {
    const socket = crearSocket({ token: TOKEN_DEL_MOZO })
    await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_1 }, socket)
    activos.delete(CUENTAS.MOZO.id)

    expect(await conAcceso.unirseALaCocina({ restauranteId: MUNDO.REST_1 }, socket)).toEqual({ ok: false, error: 'No autorizado' })
    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('motivo usuario-inactivo'))
    expect([...socket.salas]).toEqual([`salon:${MUNDO.REST_1}`])
  })

  it('un error de base en el segundo join: rechazado, sin salir de sus salas', async () => {
    const socket = crearSocket({ token: TOKEN_DEL_MOZO })
    await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_1 }, socket)
    buscarUsuario.mockRejectedValueOnce(new Error("Can't reach database server"))

    expect(await conAcceso.unirseALaCocina({ restauranteId: MUNDO.REST_1 }, socket)).toEqual({ ok: false, error: 'No autorizado' })

    expect(logs.warn).toHaveBeenCalledWith(expect.stringContaining('motivo error-de-verificacion'))
    expect(logs.error).toHaveBeenCalledWith(expect.stringContaining("Can't reach database server"))
    expect([...socket.salas]).toEqual([`salon:${MUNDO.REST_1}`])
    expect(socket.leave).not.toHaveBeenCalled()
  })

  it('después de perder todas las salas por la revalidación, el próximo join vuelve a exigir un token válido', async () => {
    const socket = crearSocket({ token: TOKEN_DEL_MOZO })
    await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_1 }, socket)
    ;(conAcceso.server.sockets as Map<string, Socket>).set(socket.id, socket)
    const perdioElRol = jest.spyOn(accesoReal, 'rolesEnRestaurante').mockResolvedValueOnce([])

    await conAcceso.revalidar()
    expect(socket.data.personal).toBeUndefined()
    expect(socket.emit).toHaveBeenCalledWith('acceso:revocado', { restauranteId: MUNDO.REST_1 })

    // Le devuelven el rol, pero el token del handshake ya venció.
    perdioElRol.mockRestore()
    verificar.mockRejectedValue(vencido())

    expect(await conAcceso.unirseAlSalon({ restauranteId: MUNDO.REST_1 }, socket)).toEqual({ ok: false, error: 'No autorizado' })
    expect(verificar).toHaveBeenCalledTimes(2)
    expect(socket.salas.size).toBe(0)
  })
})

/** `process.env.CORS_ORIGINS` solo lo pisa el bloque de CORS: se vuelve a como estaba. */
const corsOriginal = process.env.CORS_ORIGINS
function restaurarCorsOrigins() {
  if (corsOriginal === undefined) delete process.env.CORS_ORIGINS
  else process.env.CORS_ORIGINS = corsOriginal
}
