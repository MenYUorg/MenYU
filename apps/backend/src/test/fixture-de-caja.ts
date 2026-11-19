import { randomUUID } from 'crypto'
import { Rol } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/**
 * El marcador de una corrida de e2e, como en los demás: en CI lleva el id y el intento del run; en local, un sufijo
 * aleatorio. Va en el slug de las marcas y en el email de los usuarios, y la limpieza borra solo lo que lo lleva.
 */
export function marcadorDeLaCorrida(nombre: string): string {
  return process.env.GITHUB_RUN_ID
    ? `e2e-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}-${nombre}-`
    : `e2e-local-${randomUUID().slice(0, 8)}-${nombre}-`
}

/**
 * Datos de la caja (#357) contra el Postgres de los e2e: marcas, restaurantes, usuarios con su membresía, mozos, mesas,
 * la plantilla de MozoMesa y cajas. Todo cuelga de marcas con el marcador, y `limpiar` lo borra en el orden que imponen
 * las FKs Restrict de la caja.
 */
export class FixtureDeCaja {
  private mesas = 0

  constructor(
    private readonly prisma: PrismaService,
    readonly marcador: string,
  ) {}

  async marca(nombre = 'E2E Caja'): Promise<string> {
    return (await this.prisma.marca.create({ data: { nombre, slug: `${this.marcador}${randomUUID()}` } })).id
  }

  async restaurante(marcaId: string, nombre = 'E2E Caja'): Promise<string> {
    return (await this.prisma.restaurante.create({ data: { nombre, marcaId } })).id
  }

  /** Un `Usuario` con una membresía: OWNER en la marca; GERENTE, JEFE_SALON, MOZO y COCINA en el restaurante. */
  async usuario(rol: Rol, donde: { marcaId: string } | { restauranteId: string }): Promise<string> {
    const clave = `${rol.toLowerCase()}-${randomUUID().slice(0, 8)}`
    const usuario = await this.prisma.usuario.create({
      data: { supabaseUserId: randomUUID(), email: `${this.marcador}${clave}@menyu.test`, nombre: clave },
    })
    await this.prisma.membresia.create({ data: { usuarioId: usuario.id, rol, ...donde } })
    return usuario.id
  }

  /** Un `Usuario` sin membresías. */
  async usuarioSinMembresias(): Promise<string> {
    const clave = `sin-${randomUUID().slice(0, 8)}`
    const usuario = await this.prisma.usuario.create({
      data: { supabaseUserId: randomUUID(), email: `${this.marcador}${clave}@menyu.test`, nombre: clave },
    })
    return usuario.id
  }

  /** Un perfil de mozo. Con `conCuenta`, con un `Usuario` propio; sin ella, como los del login anterior. */
  async mozo(restauranteId: string, { nombre = 'Mozo', activo = true, conCuenta = true } = {}): Promise<string> {
    const usuarioId = conCuenta ? await this.usuarioSinMembresias() : null
    return (await this.prisma.mozo.create({ data: { restauranteId, nombre, activo, usuarioId } })).id
  }

  /**
   * Alguien del salón como lo deja una invitación: en la misma cuenta, el `Usuario`, su membresía en el restaurante y su
   * perfil `Mozo` (jefe de salón si el rol es JEFE_SALON).
   */
  async personalConPerfil(
    rol: Rol,
    restauranteId: string,
    { nombre = 'Mozo', activo = true }: { nombre?: string; activo?: boolean } = {},
  ): Promise<{ usuarioId: string; mozoId: string }> {
    const usuarioId = await this.usuario(rol, { restauranteId })
    const mozo = await this.prisma.mozo.create({
      data: { restauranteId, nombre, activo, usuarioId, esJefeSalon: rol === 'JEFE_SALON' },
    })
    return { usuarioId, mozoId: mozo.id }
  }

  /** Una mesa con número y PIN de un contador de la corrida: nunca chocan en el restaurante. */
  async mesa(restauranteId: string, { activo = true } = {}): Promise<{ id: string; numero: string }> {
    this.mesas += 1
    const numero = String(this.mesas)
    const mesa = await this.prisma.mesa.create({
      data: { restauranteId, numero, pin: numero.padStart(4, '0'), activo, qrToken: `${this.marcador}qr-${randomUUID()}` },
    })
    return { id: mesa.id, numero }
  }

  async mozoMesa(mesaId: string, mozoId: string): Promise<void> {
    await this.prisma.mozoMesa.create({ data: { mesaId, mozoId } })
  }

  async caja(restauranteId: string, { nombre = `Caja ${randomUUID().slice(0, 8)}`, activa = true } = {}): Promise<string> {
    return (await this.prisma.caja.create({ data: { restauranteId, nombre, activa } })).id
  }

  /** Una sesión de mesa, con un código único. */
  async sesion(mesaId: string, { estado = 'activa', iniciadaEn }: { estado?: string; iniciadaEn?: Date } = {}): Promise<string> {
    const codigoSesion = `${this.marcador}${randomUUID().slice(0, 8)}`
    return (await this.prisma.sesionMesa.create({ data: { mesaId, codigoSesion, estado, iniciadaEn } })).id
  }

  /**
   * Un turno ya cerrado, insertado directo (sin cajas), con el id y las fechas que se elijan. Lo abre y lo cierra la
   * misma cuenta: `turno_cierre_check` exige `cerradoEn` y `cerradoPorUsuarioId` juntos.
   */
  async turnoCerrado(restauranteId: string, usuarioId: string, datos: { id?: string; abiertoEn: Date; cerradoEn: Date }): Promise<string> {
    const turno = await this.prisma.turno.create({
      data: { ...datos, restauranteId, abiertoPorUsuarioId: usuarioId, cerradoPorUsuarioId: usuarioId },
    })
    return turno.id
  }

  /**
   * Un turno con sus aperturas, insertado directo: abierto o cerrado, y cada `TurnoCaja` abierta o cerrada por su cuenta.
   * Permite los dos estados que el cierre real nunca deja (turno cerrado con una caja abierta y turno abierto con una
   * caja cerrada), para probar cada filtro de cajaDelCobro por separado. Devuelve la apertura de cada caja.
   */
  async turno(
    restauranteId: string,
    usuarioId: string,
    { cerrado = false, cajas }: { cerrado?: boolean; cajas: { cajaId: string; cerrada?: boolean; fondoInicial?: number }[] },
  ): Promise<{ turnoId: string; aperturas: Record<string, string> }> {
    const cierre = new Date()
    const turno = await this.prisma.turno.create({
      data: { restauranteId, abiertoPorUsuarioId: usuarioId, ...(cerrado ? { cerradoEn: cierre, cerradoPorUsuarioId: usuarioId } : {}) },
    })
    const aperturas: Record<string, string> = {}
    for (const { cajaId, cerrada = false, fondoInicial = 0 } of cajas) {
      const apertura = await this.prisma.turnoCaja.create({
        data: { turnoId: turno.id, cajaId, fondoInicial, cerradoEn: cerrada ? cierre : null },
      })
      aperturas[cajaId] = apertura.id
    }
    return { turnoId: turno.id, aperturas }
  }

  /** Un turno abierto con esas cajas abiertas, como lo deja la apertura (sin asignaciones). */
  turnoAbierto(restauranteId: string, usuarioId: string, cajaIds: string[], { fondoInicial = 0 } = {}) {
    return this.turno(restauranteId, usuarioId, { cajas: cajaIds.map((cajaId) => ({ cajaId, fondoInicial })) })
  }

  /** Un pedido de la sesión por `total`: un plato nuevo del restaurante, una unidad a ese precio. */
  async consumo(sesionId: string, mesaId: string, restauranteId: string, total: number): Promise<void> {
    const item = await this.prisma.itemMenu.create({ data: { restauranteId, nombre: 'Plato e2e', precioBase: total } })
    await this.prisma.pedido.create({
      data: { sesionId, mesaId, items: { create: [{ itemId: item.id, cantidad: 1, precioUnitario: total }] } },
    })
  }

  /** Un pago de una sesión, en la caja que se indique (o en ninguna). */
  async pago(datos: {
    sesionId: string
    turnoCajaId: string | null
    metodo: string
    estado: string
    monto: number | string
    propina?: number | string
    mozoId?: string | null
    fechaCobro?: Date | null
    requiereRevision?: boolean
  }): Promise<string> {
    const { propina = 0, ...resto } = datos
    return (await this.prisma.pago.create({ data: { ...resto, propina } })).id
  }

  /**
   * Borra todo lo de la corrida, en el orden de las FKs Restrict: lo de la caja primero (los pagos antes que turno_caja),
   * las sesiones antes que las mesas, y después el resto.
   */
  async limpiar(): Promise<void> {
    const deLaCorrida = { restaurante: { marca: { slug: { startsWith: this.marcador } } } }
    const deSusTurnos = { turnoCaja: { turno: deLaCorrida } }
    await this.prisma.pago.deleteMany({ where: { OR: [{ sesion: { mesa: deLaCorrida } }, deSusTurnos] } })
    await this.prisma.pedidoItem.deleteMany({ where: { pedido: { mesa: deLaCorrida } } })
    await this.prisma.pedido.deleteMany({ where: { mesa: deLaCorrida } })
    await this.prisma.sesionMesa.deleteMany({ where: { mesa: deLaCorrida } })
    await this.prisma.arqueoMetodo.deleteMany({ where: deSusTurnos })
    await this.prisma.movimientoCaja.deleteMany({ where: deSusTurnos })
    await this.prisma.asignacionTurno.deleteMany({ where: { turno: deLaCorrida } })
    await this.prisma.turnoCaja.deleteMany({ where: { OR: [{ turno: deLaCorrida }, { caja: deLaCorrida }] } })
    await this.prisma.turno.deleteMany({ where: deLaCorrida })
    await this.prisma.caja.deleteMany({ where: deLaCorrida })
    await this.prisma.mozoMesa.deleteMany({ where: { mesa: deLaCorrida } })
    await this.prisma.mozo.deleteMany({ where: deLaCorrida })
    await this.prisma.mesa.deleteMany({ where: deLaCorrida })
    await this.prisma.itemMenu.deleteMany({ where: deLaCorrida })
    const deSusUsuarios = { email: { startsWith: this.marcador } }
    await this.prisma.membresia.deleteMany({ where: { usuario: deSusUsuarios } })
    await this.prisma.usuario.deleteMany({ where: deSusUsuarios })
    const marcaIds = (await this.prisma.marca.findMany({ where: { slug: { startsWith: this.marcador } }, select: { id: true } })).map(
      (m) => m.id,
    )
    await this.prisma.restaurante.deleteMany({ where: { marcaId: { in: marcaIds } } })
    await this.prisma.marca.deleteMany({ where: { id: { in: marcaIds } } })
  }
}
