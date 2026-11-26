import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Prisma } from '@prisma/client'
import { exigirSuSesion, verificarSesionDeMesa } from '../auth/guards/session-auth.guard'
import { ADMINISTRACION, SALON, TODO_EL_PERSONAL } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { PrismaService } from '../prisma/prisma.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { CreatePedidoDto } from './dto/create-pedido.dto'
import { UpdateEstadoPedidoDto } from './dto/update-estado-pedido.dto'
import { EditPedidoDto } from './dto/edit-pedido.dto'
import { precioVigente } from '../items/descuento.util'
import { EDITOR_INCLUDE, EdicionConEditor, editorDe } from './editor-de-la-edicion'
import { decidirListo, nadaPendiente } from './decidir-listo'

// El pedido con lo que muestran la cocina y el salón: la mesa, el nombre de cada plato y sus modificaciones.
const PEDIDO_RICO_INCLUDE = {
  mesa: { select: { numero: true } },
  items: {
    include: {
      item: { select: { nombre: true } },
      mods: {
        include: {
          itemIngrediente: {
            include: { ingrediente: { select: { nombre: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.PedidoInclude

@Injectable()
export class PedidosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly gateway: MenyuGateway,
    private readonly acceso: AccesoService,
  ) {}

  async confirmar(authHeader: string | undefined, dto: CreatePedidoDto) {
    const payload = verificarSesionDeMesa(this.jwt, authHeader, 'Solo clientes pueden crear pedidos')
    exigirSuSesion(payload, dto.sesionId)
    if (dto.mesaId !== payload.mesaId) {
      throw new ForbiddenException('Esa mesa no es la de tu sesión')
    }

    const { restauranteId, sub: clienteId } = payload

    const pedido = await this.prisma.$transaction(async (tx) => {
      // a. Verificar sesión activa
      const sesion = await tx.sesionMesa.findUnique({ where: { id: dto.sesionId } })
      if (!sesion) {
        throw new NotFoundException('Sesión no encontrada')
      }
      if (sesion.estado !== 'activa') {
        throw new BadRequestException('La sesión no está activa')
      }

      // b. Validar ítems y calcular precios
      const itemsData: Array<{
        itemId: string
        clienteId: string
        cantidad: number
        precioUnitario: number
        comandaId: string | null
        notas: string | null
        mods: Array<{ itemIngredienteId: string; accion: string; cantidad: number }>
      }> = []

      for (const itemDto of dto.items) {
        const dbItem = await tx.itemMenu.findFirst({
          where: { id: itemDto.itemId, restauranteId },
        })
        if (!dbItem) {
          throw new NotFoundException(`Ítem ${itemDto.itemId} no encontrado en este restaurante`)
        }

        let precioUnitario = precioVigente(dbItem) // con descuento si lo tiene; los extras, a precio normal
        const modsData: Array<{ itemIngredienteId: string; accion: string; cantidad: number }> = []

        for (const mod of itemDto.mods ?? []) {
          const itemIngrediente = await tx.itemIngrediente.findUnique({
            where: { id: mod.itemIngredienteId },
          })
          if (!itemIngrediente) {
            throw new NotFoundException(`ItemIngrediente ${mod.itemIngredienteId} no encontrado`)
          }
          if (itemIngrediente.itemId !== itemDto.itemId) {
            throw new BadRequestException('Modificador no pertenece al ítem')
          }
          if (mod.accion === 'AGREGAR' && !itemIngrediente.esAgregable) {
            throw new BadRequestException(
              `El ingrediente ${mod.itemIngredienteId} no es agregable`,
            )
          }
          if (mod.accion === 'QUITAR' && !itemIngrediente.esRemovible) {
            throw new BadRequestException(
              `El ingrediente ${mod.itemIngredienteId} no es removible`,
            )
          }

          if (mod.accion === 'AGREGAR') {
            precioUnitario += Number(itemIngrediente.precioExtra) * mod.cantidad
          } else {
            precioUnitario -= Number(itemIngrediente.precioExtra) * mod.cantidad
          }

          modsData.push({
            itemIngredienteId: mod.itemIngredienteId,
            accion: mod.accion,
            cantidad: mod.cantidad,
          })
        }

        itemsData.push({
          itemId: itemDto.itemId,
          clienteId,
          cantidad: itemDto.cantidad,
          precioUnitario,
          comandaId: dbItem.comandaId,
          notas: itemDto.notas ?? null,
          mods: modsData,
        })
      }

      // c. Crear pedido con items y mods en una sola operación
      return tx.pedido.create({
        data: {
          sesionId: dto.sesionId,
          mesaId: dto.mesaId,
          estado: 'pendiente',
          items: {
            create: itemsData.map((item) => ({
              itemId: item.itemId,
              clienteId: item.clienteId,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              comandaId: item.comandaId,
              notas: item.notas,
              mods: {
                create: item.mods,
              },
            })),
          },
        },
        include: {
          mesa: { select: { numero: true } },
          items: {
            include: {
              item: { select: { nombre: true } },
              mods: {
                include: {
                  itemIngrediente: {
                    include: { ingrediente: { select: { nombre: true } } },
                  },
                },
              },
            },
          },
        },
      })
    })

    this.gateway.emitOrderNew(restauranteId, pedido)

    return pedido
  }

  async crearStaff(dto: CreatePedidoDto, usuario: UsuarioAutenticado) {
    const mesa = await this.prisma.mesa.findUnique({ where: { id: dto.mesaId } })
    if (!mesa) throw new NotFoundException('Mesa no encontrada')

    await this.acceso.exigirRol(usuario.id, mesa.restauranteId, SALON)

    const sesion = await this.prisma.sesionMesa.findUnique({ where: { id: dto.sesionId } })
    if (!sesion) throw new NotFoundException('Sesión no encontrada')
    if (sesion.mesaId !== mesa.id) throw new BadRequestException('La sesión no es de esa mesa')
    if (sesion.estado !== 'activa') throw new BadRequestException('La sesión no está activa')

    const { restauranteId } = mesa

    const pedido = await this.prisma.$transaction(async (tx) => {
      const itemsData: Array<{
        itemId: string
        clienteId: null
        cantidad: number
        precioUnitario: number
        comandaId: string | null
        notas: string | null
        mods: Array<{ itemIngredienteId: string; accion: string; cantidad: number }>
      }> = []

      for (const itemDto of dto.items) {
        const dbItem = await tx.itemMenu.findFirst({
          where: { id: itemDto.itemId, restauranteId },
        })
        if (!dbItem) throw new NotFoundException(`Ítem ${itemDto.itemId} no encontrado en este restaurante`)

        let precioUnitario = precioVigente(dbItem) // con descuento si lo tiene; los extras, a precio normal
        const modsData: Array<{ itemIngredienteId: string; accion: string; cantidad: number }> = []

        for (const mod of itemDto.mods ?? []) {
          const itemIngrediente = await tx.itemIngrediente.findUnique({
            where: { id: mod.itemIngredienteId },
          })
          if (!itemIngrediente) throw new NotFoundException(`ItemIngrediente ${mod.itemIngredienteId} no encontrado`)
          if (itemIngrediente.itemId !== itemDto.itemId) throw new BadRequestException('Modificador no pertenece al ítem')
          if (mod.accion === 'AGREGAR' && !itemIngrediente.esAgregable) {
            throw new BadRequestException(`El ingrediente ${mod.itemIngredienteId} no es agregable`)
          }
          if (mod.accion === 'QUITAR' && !itemIngrediente.esRemovible) {
            throw new BadRequestException(`El ingrediente ${mod.itemIngredienteId} no es removible`)
          }
          if (mod.accion === 'AGREGAR') {
            precioUnitario += Number(itemIngrediente.precioExtra) * mod.cantidad
          }
          modsData.push({ itemIngredienteId: mod.itemIngredienteId, accion: mod.accion, cantidad: mod.cantidad })
        }

        itemsData.push({
          itemId: itemDto.itemId,
          clienteId: null,
          cantidad: itemDto.cantidad,
          precioUnitario,
          comandaId: dbItem.comandaId,
          notas: itemDto.notas ?? null,
          mods: modsData,
        })
      }

      return tx.pedido.create({
        data: {
          sesionId: dto.sesionId,
          mesaId: dto.mesaId,
          estado: 'en_preparacion',
          items: {
            create: itemsData.map((item) => ({
              itemId: item.itemId,
              clienteId: item.clienteId,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              comandaId: item.comandaId,
              notas: item.notas,
              mods: { create: item.mods },
            })),
          },
        },
        include: {
          mesa: { select: { numero: true } },
          items: {
            include: {
              item: { select: { nombre: true } },
              mods: {
                include: {
                  itemIngrediente: {
                    include: { ingrediente: { select: { nombre: true } } },
                  },
                },
              },
            },
          },
        },
      })
    })

    this.gateway.emitOrderNew(restauranteId, pedido)
    return pedido
  }

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async listarPorEstado(restauranteId: string, estado: string) {
    const pedidos = await this.prisma.pedido.findMany({
      where: { mesa: { restauranteId }, estado },
      include: {
        mesa: { select: { numero: true } },
        sesion: { select: { pagos: { where: { estado: 'aprobado' }, select: { id: true } } } },
        items: {
          include: {
            item: { select: { nombre: true } },
            mods: {
              include: {
                itemIngrediente: {
                  include: { ingrediente: { select: { nombre: true } } },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // `pagado`: la sesión del pedido ya tiene un cobro aprobado. `sesion` es solo para
    // calcularlo y no se devuelve.
    return pedidos.map(({ sesion, ...pedido }) => ({
      ...pedido,
      pagado: pedido.items.length > 0 && sesion.pagos.length > 0,
    }))
  }

  async actualizarEstado(id: string, dto: UpdateEstadoPedidoDto, usuario: UsuarioAutenticado) {
    // a. Buscar pedido con mesa para obtener restauranteId
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: { mesa: true },
    })
    if (!pedido) throw new NotFoundException('Pedido no encontrado')
    await this.acceso.exigirRol(usuario.id, pedido.mesa.restauranteId, TODO_EL_PERSONAL)

    // b. Validar transición
    const TRANSICIONES: Record<string, string> = {
      pendiente: 'en_preparacion',
      en_preparacion: 'listo',
      listo: 'entregado',
    }
    // Con una comanda, "listo" también vale sobre un pedido que ya cerró (otra estación se adelantó): no es un error.
    const yaCerrado = pedido.estado === 'listo' || pedido.estado === 'entregado'
    const valida = dto.estado === 'listo'
      ? pedido.estado === 'en_preparacion' || (dto.comandaId !== undefined && yaCerrado)
      : TRANSICIONES[pedido.estado] === dto.estado
    if (!valida) {
      throw new BadRequestException(
        `Transición inválida: ${pedido.estado} → ${dto.estado}`,
      )
    }

    if (dto.comandaId !== undefined && dto.estado !== 'listo') {
      throw new BadRequestException('La comanda solo se indica al marcar el pedido como listo')
    }

    // c. Pasar a listo es la marca de las comandas (o de todo el pedido): tiene su propia transacción
    if (dto.estado === 'listo') return this.marcarListo(pedido.id, pedido.mesa.restauranteId, dto.comandaId ?? null)

    // d. Actualizar estado
    const actualizado = await this.prisma.pedido.update({
      where: { id },
      data: { estado: dto.estado },
      include: PEDIDO_RICO_INCLUDE,
    })

    // e. Emitir a cocina/mozo
    this.gateway.emitOrderUpdated(pedido.mesa.restauranteId, actualizado)

    return actualizado
  }

  /**
   * "Listo" de un pedido en preparación, de todo el pedido (`comandaId` null) o de una comanda: marca los ítems y,
   * según `decidirListo`, cierra el pedido. Todo en una transacción que arranca bloqueando la fila del pedido, así dos
   * estaciones que marcan a la vez se turnan (la segunda ve lo de la primera) y una anulación o una edición no se cruzan.
   *
   * Con `comandaId`, un pedido que ya está listo o entregado, o una comanda sin nada pendiente, no es un error (un
   * segundo clic, o la barra marcando justo después de que la cocina cerró): devuelve el pedido tal cual y no emite.
   */
  private async marcarListo(id: string, restauranteId: string, comandaId: string | null) {
    const comandas = await this.prisma.comanda.findMany({
      where: { restauranteId },
      select: { id: true, nombre: true, activa: true },
    })
    if (comandaId !== null && !comandas.some((c) => c.id === comandaId)) {
      throw new BadRequestException('La comanda no es de este restaurante')
    }

    const { pedido, cambio } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "pedido" WHERE id = ${id} FOR UPDATE`
      const actual = await tx.pedido.findUniqueOrThrow({
        where: { id },
        select: {
          estado: true,
          items: { select: { id: true, comandaId: true, cantidad: true, cantidadEditada: true, listoEn: true } },
        },
      })

      const yaCerrado = actual.estado === 'listo' || actual.estado === 'entregado'
      if (actual.estado !== 'en_preparacion' && !(comandaId !== null && yaCerrado)) {
        throw new BadRequestException(`Transición inválida: ${actual.estado} → listo`)
      }

      const { marcar, cerrar } = yaCerrado ? { marcar: [], cerrar: false } : decidirListo(actual.items, comandas, comandaId)
      if (marcar.length > 0) {
        await tx.pedidoItem.updateMany({ where: { id: { in: marcar } }, data: { listoEn: new Date() } })
      }
      if (cerrar) await tx.pedido.update({ where: { id }, data: { estado: 'listo' } })

      const pedido = await tx.pedido.findUniqueOrThrow({ where: { id }, include: PEDIDO_RICO_INCLUDE })
      return { pedido, cambio: marcar.length > 0 || cerrar }
    })

    if (cambio) this.gateway.emitOrderUpdated(restauranteId, pedido)
    return pedido
  }

  /**
   * La edita el GERENTE, el JEFE_SALON o el MOZO del restaurante (el OWNER no, como antes). La edición queda a nombre
   * de su cuenta (`usuarioId`) y, si la hizo como mozo, también de su `Mozo`, que sale de su cuenta y nunca del body.
   */
  async editarPedido(id: string, dto: EditPedidoDto, usuario: UsuarioAutenticado) {
    // 1. Buscar pedido
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      include: {
        mesa: { select: { restauranteId: true } },
        sesion: { select: { pagos: { where: { estado: 'aprobado' }, select: { id: true } } } },
        items: { include: { item: { select: { nombre: true } } } },
      },
    })
    if (!pedido) throw new NotFoundException('Pedido no encontrado')
    const mozoId = await this.mozoQueEdita(usuario, pedido.mesa.restauranteId)
    if (pedido.estado === 'anulado') {
      throw new BadRequestException('No se puede editar un pedido anulado')
    }

    // 2. Validar justificación
    const trimmed = dto.justificacion.trim()
    if (!trimmed) throw new BadRequestException('La justificación es requerida')
    if (trimmed.split(/\s+/).length > 50) {
      throw new BadRequestException('La justificación no puede superar 50 palabras')
    }

    // 3. Validar que todos los pedidoItemId pertenecen al pedido
    const itemMap = new Map(pedido.items.map((i) => [i.id, i]))
    for (const ed of dto.ediciones) {
      if (!itemMap.has(ed.pedidoItemId)) {
        throw new BadRequestException(`El ítem ${ed.pedidoItemId} no pertenece a este pedido`)
      }
    }

    // 4. Un pedido de una sesión con un cobro aprobado no se puede editar
    if (pedido.sesion.pagos.length > 0) {
      throw new BadRequestException(
        'La mesa ya tiene un cobro registrado y el pedido no puede editarse.',
      )
    }

    // 5. Validar cantidadNueva < cantidadActual para cada ítem editado
    for (const ed of dto.ediciones) {
      const item = itemMap.get(ed.pedidoItemId)!
      const cantidadActual = item.cantidadEditada ?? item.cantidad
      if (ed.cantidadNueva >= cantidadActual) {
        throw new BadRequestException(
          `cantidadNueva debe ser menor a la cantidad actual del ítem (${cantidadActual})`,
        )
      }
    }

    // 6. Ejecutar en transaction. Toma el mismo bloqueo que "Listo" (`marcarListo`): si una comanda marca a la vez, una de
    // las dos operaciones ve el resultado de la otra y el cierre del pedido no se pierde.
    const cerrado = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "pedido" WHERE id = ${id} FOR UPDATE`
      for (const ed of dto.ediciones) {
        await tx.pedidoItem.update({
          where: { id: ed.pedidoItemId },
          data: { cantidadEditada: ed.cantidadNueva },
        })
      }

      const todosAnulados =
        dto.ediciones.every((e) => e.cantidadNueva === 0) &&
        pedido.items.every((item) => dto.ediciones.some((e) => e.pedidoItemId === item.id))

      if (todosAnulados) {
        await tx.pedido.update({ where: { id }, data: { estado: 'anulado' } })
      }
      const sinPendientes = !todosAnulados && (await this.cerrarSiNoQuedaPendiente(tx, id))

      await tx.pedidoEdicion.create({
        data: {
          pedidoId: id,
          usuarioId: usuario.id,
          mozoId,
          justificacion: trimmed,
          itemsEliminados: {
            create: dto.ediciones.map((ed) => {
              const item = itemMap.get(ed.pedidoItemId)!
              return {
                pedidoItemId: ed.pedidoItemId,
                itemNombre: item.item.nombre,
                cantidadAntes: item.cantidadEditada ?? item.cantidad,
                cantidadDespues: ed.cantidadNueva,
                precioUnitario: item.precioUnitario,
              }
            }),
          },
        },
      })
      return sinPendientes
    })

    const resultado = await this.getPedidoConEdiciones(id)
    this.gateway.emitOrderEdited(pedido.mesa.restauranteId, resultado)
    // El cierre también llega como `order:updated`, que es lo que escuchan el salón y el comensal para el estado.
    if (cerrado) this.gateway.emitOrderUpdated(pedido.mesa.restauranteId, resultado)
    return resultado
  }

  /**
   * Un pedido en preparación al que la edición le deja todo lo vigente listo (por ejemplo, se eliminó lo único que
   * faltaba) pasa a "listo": sin esto nadie tendría un "Listo" que tocar. Dentro de la transacción de la edición, con
   * el pedido ya bloqueado. Devuelve si lo cerró.
   */
  private async cerrarSiNoQuedaPendiente(tx: Prisma.TransactionClient, id: string): Promise<boolean> {
    const actual = await tx.pedido.findUniqueOrThrow({
      where: { id },
      select: {
        estado: true,
        items: { select: { id: true, comandaId: true, cantidad: true, cantidadEditada: true, listoEn: true } },
      },
    })
    if (actual.estado !== 'en_preparacion' || !nadaPendiente(actual.items)) return false
    await tx.pedido.update({ where: { id }, data: { estado: 'listo' } })
    return true
  }

  /** Solo el OWNER, lo exige la ruta (`@RequiereRolEn`). */
  async auditoriaEdiciones(restauranteId: string, desde?: string, hasta?: string) {
    if (!restauranteId) throw new BadRequestException('restauranteId es requerido')

    const hoy = new Date().toISOString().split('T')[0]
    const desdeDate = new Date(`${desde ?? hoy}T00:00:00.000Z`)
    const hastaDate = new Date(`${hasta ?? hoy}T23:59:59.999Z`)

    // Paso 1: mesas del restaurante
    const mesas = await this.prisma.mesa.findMany({
      where: { restauranteId },
      select: { id: true },
    })
    const mesaIds = mesas.map((m) => m.id)
    if (mesaIds.length === 0) return []

    // Paso 2: pedidos en esas mesas
    const pedidos = await this.prisma.pedido.findMany({
      where: { mesaId: { in: mesaIds } },
      select: { id: true },
    })
    const pedidoIds = pedidos.map((p) => p.id)
    if (pedidoIds.length === 0) return []

    // Paso 3: ediciones de esos pedidos en el rango de fechas
    const ediciones = await this.prisma.pedidoEdicion.findMany({
      where: {
        pedidoId: { in: pedidoIds },
        creadoEn: { gte: desdeDate, lte: hastaDate },
      },
      include: {
        ...EDITOR_INCLUDE,
        pedido: {
          include: {
            mesa: { select: { numero: true } },
          },
        },
        itemsEliminados: true,
      },
      orderBy: { creadoEn: 'desc' },
    })

    return ediciones.map((e) => {
      const base = this.formatEdicion(e)
      const esAnulacion = e.itemsEliminados.length > 0 && e.itemsEliminados.every((i) => i.cantidadDespues === 0)
      return {
        ...base,
        pedidoId: e.pedido.id,
        mesaNumero: e.pedido.mesa.numero,
        pedidoEstado: e.pedido.estado,
        esAnulacion,
      }
    })
  }

  /** El historial de ediciones de un pedido: lo ven el OWNER y el GERENTE de su restaurante. */
  async getEdiciones(id: string, usuario: UsuarioAutenticado) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id },
      select: { mesa: { select: { restauranteId: true } } },
    })
    if (!pedido) throw new NotFoundException('Pedido no encontrado')
    await this.acceso.exigirRol(usuario.id, pedido.mesa.restauranteId, ADMINISTRACION)

    const ediciones = await this.prisma.pedidoEdicion.findMany({
      where: { pedidoId: id },
      include: { ...EDITOR_INCLUDE, itemsEliminados: true },
      orderBy: { creadoEn: 'desc' },
    })

    return ediciones.map((e) => this.formatEdicion(e))
  }

  private async getPedidoConEdiciones(pedidoId: string) {
    const pedido = await this.prisma.pedido.findUnique({
      where: { id: pedidoId },
      include: {
        mesa: { select: { numero: true } },
        items: {
          include: {
            item: { select: { nombre: true } },
            mods: {
              include: {
                itemIngrediente: {
                  include: { ingrediente: { select: { nombre: true } } },
                },
              },
            },
          },
        },
        ediciones: {
          include: { ...EDITOR_INCLUDE, itemsEliminados: true },
          orderBy: { creadoEn: 'desc' },
        },
      },
    })
    if (!pedido) throw new NotFoundException('Pedido no encontrado')

    return {
      ...pedido,
      ediciones: pedido.ediciones.map((e) => this.formatEdicion(e)),
    }
  }

  /**
   * El `Mozo` con el que edita un JEFE_SALON o un MOZO del restaurante (403 si su perfil no está activo), o null si
   * edita como GERENTE. 403 a cualquier otro rol, también al OWNER.
   */
  private async mozoQueEdita(usuario: UsuarioAutenticado, restauranteId: string): Promise<string | null> {
    const roles = await this.acceso.exigirRol(usuario.id, restauranteId, ['GERENTE', 'JEFE_SALON', 'MOZO'])
    if (roles.includes('GERENTE')) return null
    return (await this.acceso.exigirMozo(usuario.id, restauranteId)).id
  }

  private formatEdicion(
    e: EdicionConEditor & {
      id: string
      justificacion: string
      creadoEn: Date
      itemsEliminados: {
        id: string
        pedidoItemId: string
        itemNombre: string
        cantidadAntes: number
        cantidadDespues: number
        precioUnitario: unknown
      }[]
    },
  ) {
    return {
      id: e.id,
      justificacion: e.justificacion,
      creadoEn: e.creadoEn,
      editor: editorDe(e),
      itemsEliminados: e.itemsEliminados.map((ei) => ({
        id: ei.id,
        itemNombre: ei.itemNombre,
        cantidadAntes: ei.cantidadAntes,
        cantidadDespues: ei.cantidadDespues,
        precioUnitario: Number(ei.precioUnitario),
      })),
    }
  }
}
