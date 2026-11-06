import 'reflect-metadata'
import { randomUUID } from 'crypto'
import { AddressInfo } from 'net'
import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { Rol } from '@prisma/client'
import { errors } from 'jose'
import { io, Socket as SocketCliente } from 'socket.io-client'
import { AppModule } from '../app.module'
import { VerificadorTokenSupabase } from '../auth/supabase/verificador-token.service'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from './menyu.gateway'

// El gateway autenticado (DT-08) con socket.io real: la app entera en un puerto efímero y clientes de
// socket.io-client contra `/ws`, con el token en el handshake como los frontends. El verificador de Supabase es un
// doble que cambia cada token de prueba por su supabaseUserId (o lo da por vencido); lo demás es lo real: la base, los
// roles de AccesoService, el JWT de mesa y las salas de socket.io.
//
// Todo lo que crea esta corrida lleva su marcador (en el slug de las marcas y en el email de los usuarios), como en
// sessions.e2e-spec.ts: la limpieza borra solo eso.

const E2E_MARCADOR = process.env.GITHUB_RUN_ID
  ? `e2e-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}-gw-`
  : `e2e-local-${randomUUID().slice(0, 8)}-gw-`

/** El doble del verificador: token de prueba → supabaseUserId, y los que el test da por vencidos. */
const tokens = new Map<string, string>()
const vencidos = new Set<string>()
const verificar = jest.fn(async (token: string) => {
  if (vencidos.has(token)) throw new errors.JWTExpired('"exp" claim timestamp check failed', {})
  const supabaseUserId = tokens.get(token)
  if (!supabaseUserId) throw new errors.JWSSignatureVerificationFailed()
  return supabaseUserId
})
const vencer = (token: string) => vencidos.add(token)

type Respuesta = { ok: boolean; sesion?: boolean; error?: string }
type Recibido = { evento: string; datos: unknown }

describe('Gateway de Socket.io (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let gateway: MenyuGateway
  let url: string
  const jwtDeMesa = new JwtService({ secret: process.env.JWT_SECRET })
  const clientes: SocketCliente[] = []

  // El mundo de la corrida: la marca A con dos restaurantes y la marca B con uno.
  const R = { A1: '', A2: '', B: '' }
  const T = { MOZO_A: '', COCINA_A: '', OWNER_A: '', MOZO_REVOCADO: '', MOZO_VENCIDO: '' }
  const usuarioIdDe: Record<string, string> = {}

  async function crearMarca(nombre: string, restaurantes: number) {
    const marca = await prisma.marca.create({ data: { nombre, slug: `${E2E_MARCADOR}${randomUUID()}` } })
    const creados = []
    for (let i = 0; i < restaurantes; i++) {
      creados.push(await prisma.restaurante.create({ data: { nombre: `${nombre} ${i + 1}`, marcaId: marca.id } }))
    }
    return { marca, restaurantes: creados.map((r) => r.id) }
  }

  /** Un `Usuario` con su membresía y su token de prueba. */
  async function crearPersonal(clave: keyof typeof T, rol: Rol, donde: { restauranteId: string } | { marcaId: string }) {
    const supabaseUserId = randomUUID()
    const usuario = await prisma.usuario.create({
      data: { supabaseUserId, email: `${E2E_MARCADOR}${clave.toLowerCase()}@menyu.test`, nombre: clave },
    })
    await prisma.membresia.create({ data: { usuarioId: usuario.id, rol, ...donde } })
    T[clave] = `token-${clave}-${randomUUID()}`
    tokens.set(T[clave], supabaseUserId)
    usuarioIdDe[clave] = usuario.id
  }

  async function limpiar() {
    await prisma.membresia.deleteMany({ where: { usuario: { email: { startsWith: E2E_MARCADOR } } } })
    await prisma.usuario.deleteMany({ where: { email: { startsWith: E2E_MARCADOR } } })
    const marcaIds = (await prisma.marca.findMany({ where: { slug: { startsWith: E2E_MARCADOR } }, select: { id: true } })).map(
      (m) => m.id,
    )
    await prisma.restaurante.deleteMany({ where: { marcaId: { in: marcaIds } } })
    await prisma.marca.deleteMany({ where: { id: { in: marcaIds } } })
  }

  /** Un cliente de socket.io como los de los frontends: `/ws`, websocket y el token en `auth`. */
  async function conectar(token?: string): Promise<SocketCliente> {
    const socket = io(url, { transports: ['websocket'], auth: token ? { token } : {}, forceNew: true, reconnection: false })
    clientes.push(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve())
      socket.once('connect_error', reject)
    })
    return socket
  }

  function unirse(socket: SocketCliente, evento: string, restauranteId?: string): Promise<Respuesta> {
    return socket.timeout(5_000).emitWithAck(evento, restauranteId === undefined ? {} : { restauranteId })
  }

  /** Todo lo que le llega al socket, en orden. */
  function registrar(socket: SocketCliente): Recibido[] {
    const recibidos: Recibido[] = []
    socket.onAny((evento: string, datos: unknown) => recibidos.push({ evento, datos }))
    return recibidos
  }

  /**
   * Espera a que al socket le llegue todo lo emitido hasta acá. Los `emit*` escriben en la conexión antes de que el
   * cliente mande este join (inválido: sin restaurante, no cambia nada), y una conexión websocket no reordena: cuando
   * vuelve el ack, lo que tenía que llegar ya llegó. Así "no recibió X" se afirma sin esperar un tiempo arbitrario.
   */
  async function despuesDeLoPendiente(...sockets: SocketCliente[]) {
    for (const socket of sockets) await unirse(socket, 'session:join')
  }

  const eventos = (recibidos: Recibido[]) => recibidos.map((r) => r.evento)

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(VerificadorTokenSupabase)
      .useValue({ verificar })
      .compile()
    app = moduleRef.createNestApplication()
    // Como main.ts: sin adaptador propio, Nest usa el IoAdapter de @nestjs/platform-socket.io.
    await app.listen(0)
    url = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}/ws`
    prisma = moduleRef.get(PrismaService)
    gateway = moduleRef.get(MenyuGateway)

    const a = await crearMarca('E2E Gateway A', 2)
    const b = await crearMarca('E2E Gateway B', 1)
    ;[R.A1, R.A2] = a.restaurantes
    ;[R.B] = b.restaurantes

    await crearPersonal('MOZO_A', 'MOZO', { restauranteId: R.A1 })
    await crearPersonal('COCINA_A', 'COCINA', { restauranteId: R.A1 })
    await crearPersonal('OWNER_A', 'OWNER', { marcaId: a.marca.id })
    await crearPersonal('MOZO_REVOCADO', 'MOZO', { restauranteId: R.A1 })
    await crearPersonal('MOZO_VENCIDO', 'MOZO', { restauranteId: R.A1 })
  })

  afterEach(() => {
    for (const socket of clientes) socket.disconnect()
    clientes.length = 0
    verificar.mockClear()
  })

  afterAll(async () => {
    for (const socket of clientes) socket.disconnect()
    if (prisma) await limpiar()
    if (app) await app.close()
  })

  const llamado = () => ({ llamadoId: randomUUID(), sesionId: randomUUID(), mesaNumero: '4', motivo: 'general' })

  it('1. el mozo del restaurante A entra al salón de A y recibe waiter:called', async () => {
    const mozo = await conectar(T.MOZO_A)
    const recibidos = registrar(mozo)

    expect(await unirse(mozo, 'mozo:join', R.A1)).toEqual({ ok: true })
    const datos = llamado()
    gateway.emitMozoCalled(R.A1, datos)
    await despuesDeLoPendiente(mozo)

    expect(recibidos).toEqual([{ evento: 'waiter:called', datos }])
  })

  it('2. el mismo mozo no entra al restaurante B ni recibe sus eventos', async () => {
    const mozo = await conectar(T.MOZO_A)
    const recibidos = registrar(mozo)

    expect(await unirse(mozo, 'mozo:join', R.B)).toEqual({ ok: false, error: 'No autorizado' })
    expect(await unirse(mozo, 'cocina:join', R.B)).toEqual({ ok: false, error: 'No autorizado' })
    gateway.emitMozoCalled(R.B, llamado())
    gateway.emitOrderNew(R.B, { id: randomUUID() })
    await despuesDeLoPendiente(mozo)

    expect(recibidos).toEqual([])
  })

  it('3. sin token: los joins del personal se rechazan y no recibe nada', async () => {
    const intruso = await conectar()
    const recibidos = registrar(intruso)

    expect(await unirse(intruso, 'mozo:join', R.A1)).toEqual({ ok: false, error: 'No autorizado' })
    expect(await unirse(intruso, 'cocina:join', R.A1)).toEqual({ ok: false, error: 'No autorizado' })
    gateway.emitMozoCalled(R.A1, llamado())
    gateway.emitOrderNew(R.A1, { id: randomUUID() })
    gateway.emitQuierePagar(R.A1, { sesionId: randomUUID(), mesaId: randomUUID(), mesaNumero: '4', totalAcumulado: 100 })
    await despuesDeLoPendiente(intruso)

    expect(recibidos).toEqual([])
  })

  it('4. la cocina: mozo:join se rechaza, cocina:join entra; recibe order:new pero no waiter:called', async () => {
    const cocina = await conectar(T.COCINA_A)
    const recibidos = registrar(cocina)

    expect(await unirse(cocina, 'mozo:join', R.A1)).toEqual({ ok: false, error: 'No autorizado' })
    expect(await unirse(cocina, 'cocina:join', R.A1)).toEqual({ ok: true })
    const pedido = { id: randomUUID() }
    gateway.emitMozoCalled(R.A1, llamado())
    gateway.emitOrderNew(R.A1, pedido)
    await despuesDeLoPendiente(cocina)

    expect(recibidos).toEqual([{ evento: 'order:new', datos: pedido }])
  })

  it('5. el comensal con el JWT de mesa recibe lo de su sesión y la carta, y nada del personal ni de otra sesión', async () => {
    const sesionId = randomUUID()
    const otraSesion = randomUUID()
    const token = jwtDeMesa.sign({ sub: randomUUID(), tipo: 'cliente', sesionId, mesaId: randomUUID(), restauranteId: R.A1 })
    const comensal = await conectar(token)
    const recibidos = registrar(comensal)

    // El restaurante del payload se ignora: manda el del token.
    expect(await unirse(comensal, 'session:join', R.B)).toEqual({ ok: true, sesion: true })

    const suyo = { id: randomUUID(), sesionId, estado: 'listo' }
    gateway.emitOrderUpdated(R.A1, suyo)
    const deOtraSesion = { id: randomUUID(), sesionId: otraSesion, estado: 'listo' }
    gateway.emitOrderUpdated(R.A1, deOtraSesion)
    gateway.emitOrderNew(R.A1, { id: randomUUID(), sesionId })
    gateway.emitMozoCalled(R.A1, { ...llamado(), sesionId })
    gateway.emitQuierePagar(R.A1, { sesionId, mesaId: randomUUID(), mesaNumero: '4', totalAcumulado: 100 })
    gateway.emitSesionCerrada(R.A1, otraSesion)
    gateway.emitSesionCerrada(R.A1, sesionId)
    gateway.emitMenuUpdated(R.B)
    gateway.emitMenuUpdated(R.A1)
    await despuesDeLoPendiente(comensal)

    expect(recibidos).toEqual([
      { evento: 'order:updated', datos: suyo },
      { evento: 'sesion:cerrada', datos: { sesionId } },
      { evento: 'menu:updated', datos: { restauranteId: R.A1 } },
    ])
  })

  it('6. anónimo: session:join sin token solo recibe menu:updated', async () => {
    const anonimo = await conectar()
    const recibidos = registrar(anonimo)
    const sesionId = randomUUID()

    expect(await unirse(anonimo, 'session:join', R.A1)).toEqual({ ok: true, sesion: false })
    const deUnaSesion = { id: randomUUID(), sesionId }
    gateway.emitOrderUpdated(R.A1, deUnaSesion)
    gateway.emitOrderNew(R.A1, { id: randomUUID() })
    gateway.emitMozoCalled(R.A1, llamado())
    gateway.emitSesionCerrada(R.A1, sesionId)
    gateway.emitSesionCobrada(R.A1, { sesionId, mesaId: randomUUID(), mesaNumero: '4' })
    gateway.emitMenuUpdated(R.A1)
    await despuesDeLoPendiente(anonimo)

    expect(recibidos).toEqual([{ evento: 'menu:updated', datos: { restauranteId: R.A1 } }])
  })

  it('7. el personal que cambia de restaurante deja de recibir los eventos del anterior', async () => {
    const owner = await conectar(T.OWNER_A)
    const recibidos = registrar(owner)
    expect(await unirse(owner, 'mozo:join', R.A1)).toEqual({ ok: true })
    expect(await unirse(owner, 'cocina:join', R.A1)).toEqual({ ok: true })

    expect(await unirse(owner, 'mozo:join', R.A2)).toEqual({ ok: true })
    const enA2 = llamado()
    gateway.emitMozoCalled(R.A1, llamado())
    gateway.emitOrderNew(R.A1, { id: randomUUID() })
    gateway.emitMozoCalled(R.A2, enA2)
    await despuesDeLoPendiente(owner)

    expect(recibidos).toEqual([{ evento: 'waiter:called', datos: enA2 }])
    // El token se verificó en el primer join; los siguientes se apoyaron en esa identidad.
    expect(verificar).toHaveBeenCalledTimes(1)
  })

  it('8. revalidación: sin la membresía, el socket recibe acceso:revocado y deja de recibir order:new', async () => {
    const mozo = await conectar(T.MOZO_REVOCADO)
    const recibidos = registrar(mozo)
    expect(await unirse(mozo, 'mozo:join', R.A1)).toEqual({ ok: true })
    expect(await unirse(mozo, 'cocina:join', R.A1)).toEqual({ ok: true })
    const antes = { id: randomUUID() }
    gateway.emitOrderNew(R.A1, antes)
    await despuesDeLoPendiente(mozo)

    await prisma.membresia.deleteMany({ where: { usuarioId: usuarioIdDe.MOZO_REVOCADO } })
    // Recorre los sockets del Namespace `/ws` de verdad (lo que inyecta @WebSocketServer() con `namespace`).
    await gateway.revalidar()
    gateway.emitOrderNew(R.A1, { id: randomUUID() })
    gateway.emitMozoCalled(R.A1, llamado())
    await despuesDeLoPendiente(mozo)

    expect(recibidos).toEqual([
      { evento: 'order:new', datos: antes },
      { evento: 'acceso:revocado', datos: { restauranteId: R.A1 } },
    ])
  })

  it('9. un mozo en el salón y en la cocina del mismo restaurante recibe order:new una sola vez', async () => {
    const mozo = await conectar(T.MOZO_A)
    const recibidos = registrar(mozo)
    expect(await unirse(mozo, 'mozo:join', R.A1)).toEqual({ ok: true })
    expect(await unirse(mozo, 'cocina:join', R.A1)).toEqual({ ok: true })

    const pedido = { id: randomUUID() }
    gateway.emitOrderNew(R.A1, pedido)
    await despuesDeLoPendiente(mozo)

    expect(recibidos).toEqual([{ evento: 'order:new', datos: pedido }])
  })

  it('10. con el token vencido: la conexión ya autenticada sigue entrando a otra sala, una nueva no', async () => {
    const mozo = await conectar(T.MOZO_VENCIDO)
    expect(await unirse(mozo, 'mozo:join', R.A1)).toEqual({ ok: true })

    vencer(T.MOZO_VENCIDO)

    expect(await unirse(mozo, 'cocina:join', R.A1)).toEqual({ ok: true })
    const nueva = await conectar(T.MOZO_VENCIDO)
    expect(await unirse(nueva, 'mozo:join', R.A1)).toEqual({ ok: false, error: 'No autorizado' })
    // Una vez por el primer join de la primera conexión y otra por la nueva, que ya lo encuentra vencido.
    expect(verificar).toHaveBeenCalledTimes(2)
    await expect(verificar.mock.results[1].value).rejects.toBeInstanceOf(errors.JWTExpired)
  })
})
