import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { CreateItemDto } from './dto/create-item.dto'
import { UpdateItemDto } from './dto/update-item.dto'
import { SetDescuentoDto } from './dto/set-descuento.dto'
import { AddIngredienteDto } from './dto/add-ingrediente.dto'
import { UpdateIngredienteItemDto } from './dto/update-ingrediente-item.dto'
import {
  assertPrecioBaseCompatible,
  derivarDescuento,
  porcentajeDesdePrecio,
  precioDesdePorcentaje,
} from './descuento.util'

const IMAGEN_BUCKET = 'menu-items'

const DETAIL_INCLUDE = {
  categoria: true,
  ingredientes: {
    include: { ingrediente: true },
    orderBy: [
      { esOriginal: 'desc' as const },
      { ingrediente: { nombre: 'asc' as const } },
    ],
  },
  clasificaciones: { include: { clasificacion: true } },
}

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly gateway: MenyuGateway,
    private readonly acceso: AccesoService,
  ) {}

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async create(dto: CreateItemDto) {
    await this.assertRelacionesDelRestaurante(dto.restauranteId, dto)
    await this.assertNombreUnico(dto.restauranteId, dto.nombre)

    const created = await this.prisma.itemMenu.create({ data: dto, include: DETAIL_INCLUDE })
    return this.serializeItem(created)
  }

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async findAll(restauranteId: string, disponible?: boolean) {
    const items = await this.prisma.itemMenu.findMany({
      where: {
        restauranteId,
        ...(disponible !== undefined ? { disponible } : {}),
      },
      orderBy: { nombre: 'asc' },
      include: DETAIL_INCLUDE,
    })
    return items.map((item) => this.serializeItem(item))
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    const item = await this.getOrThrow(id)
    await this.acceso.exigirRol(usuario.id, item.restauranteId, ADMINISTRACION)
    const found = await this.prisma.itemMenu.findUnique({ where: { id }, include: DETAIL_INCLUDE })
    return this.serializeItem(found)
  }

  async update(id: string, dto: UpdateItemDto, usuario: UsuarioAutenticado) {
    const item = await this.getOrThrow(id)
    await this.acceso.exigirRol(usuario.id, item.restauranteId, ADMINISTRACION)
    await this.assertRelacionesDelRestaurante(item.restauranteId, dto)

    if (dto.nombre && dto.nombre !== item.nombre) {
      await this.assertNombreUnico(item.restauranteId, dto.nombre, id)
    }

    // Con un descuento activo, el nuevo precio base tiene que seguir siendo mayor al precio con descuento.
    if (dto.precioBase !== undefined) {
      assertPrecioBaseCompatible(dto.precioBase, item.precioDescuento)
    }

    const { esRecomendado, ...rest } = dto
    const data = {
      ...rest,
      ...(esRecomendado !== undefined
        ? { recomendadoEn: esRecomendado ? new Date() : null }
        : {}),
    }

    const updated = await this.prisma.itemMenu.update({ where: { id }, data, include: DETAIL_INCLUDE })
    this.gateway.emitMenuUpdated(item.restauranteId)
    return this.serializeItem(updated)
  }

  async uploadImagen(id: string, file: Express.Multer.File, usuario: UsuarioAutenticado) {
    const item = await this.getOrThrow(id)
    await this.acceso.exigirRol(usuario.id, item.restauranteId, ADMINISTRACION)

    const path = `${item.restauranteId}/${id}`
    const url = await this.storage.uploadFile(IMAGEN_BUCKET, path, file.buffer, file.mimetype)

    const updated = await this.prisma.itemMenu.update({ where: { id }, data: { imagenUrl: url }, include: DETAIL_INCLUDE })
    return this.serializeItem(updated)
  }

  async removeImagen(id: string, usuario: UsuarioAutenticado) {
    const item = await this.getOrThrow(id)
    await this.acceso.exigirRol(usuario.id, item.restauranteId, ADMINISTRACION)

    if (!item.imagenUrl) throw new NotFoundException('Este ítem no tiene imagen')

    await this.storage.deleteFile(IMAGEN_BUCKET, `${item.restauranteId}/${id}`)

    const updated = await this.prisma.itemMenu.update({ where: { id }, data: { imagenUrl: null }, include: DETAIL_INCLUDE })
    return this.serializeItem(updated)
  }

  // ── Descuento ──────────────────────────────────────────────────────────

  async setDescuento(id: string, dto: SetDescuentoDto, usuario: UsuarioAutenticado) {
    const item = await this.getOrThrow(id)
    await this.acceso.exigirRol(usuario.id, item.restauranteId, ADMINISTRACION)

    const { precioDescuento, porcentaje } = dto
    if (precioDescuento != null && porcentaje != null) {
      throw new BadRequestException('Enviá el precio con descuento o el porcentaje, no los dos')
    }

    const precioBase = Number(item.precioBase)
    let nuevoPrecio: number
    if (precioDescuento != null) {
      // Solo valida: entero, mayor a 0, menor al precio base y con un porcentaje entre 1 y 99.
      porcentajeDesdePrecio(precioBase, precioDescuento)
      nuevoPrecio = precioDescuento
    } else if (porcentaje != null) {
      nuevoPrecio = precioDesdePorcentaje(precioBase, porcentaje)
    } else {
      throw new BadRequestException('Falta el precio con descuento o el porcentaje')
    }

    const updated = await this.prisma.itemMenu.update({
      where: { id },
      data: { precioDescuento: nuevoPrecio },
      include: DETAIL_INCLUDE,
    })
    this.gateway.emitMenuUpdated(item.restauranteId)
    return this.serializeItem(updated)
  }

  async removeDescuento(id: string, usuario: UsuarioAutenticado) {
    const item = await this.getOrThrow(id)
    await this.acceso.exigirRol(usuario.id, item.restauranteId, ADMINISTRACION)

    // Quitar un descuento que no existe no es un error: el ítem ya queda como se pidió.
    if (item.precioDescuento == null) {
      const actual = await this.prisma.itemMenu.findUnique({ where: { id }, include: DETAIL_INCLUDE })
      return this.serializeItem(actual)
    }

    const updated = await this.prisma.itemMenu.update({
      where: { id },
      data: { precioDescuento: null },
      include: DETAIL_INCLUDE,
    })
    this.gateway.emitMenuUpdated(item.restauranteId)
    return this.serializeItem(updated)
  }

  async remove(id: string, usuario: UsuarioAutenticado) {
    const item = await this.getOrThrow(id)
    await this.acceso.exigirRol(usuario.id, item.restauranteId, ['OWNER'])

    const totalPedidos = await this.prisma.pedidoItem.count({ where: { itemId: id } })
    if (totalPedidos > 0) {
      throw new ConflictException(
        `No se puede eliminar: el ítem aparece en ${totalPedidos} pedido(s). Marcarlo como no disponible en su lugar.`,
      )
    }

    await this.prisma.itemMenu.delete({ where: { id } })
  }

  // ── Ingredientes del ítem ──────────────────────────────────────────────

  async addIngrediente(itemId: string, dto: AddIngredienteDto, usuario: UsuarioAutenticado) {
    const item = await this.getOrThrow(itemId)
    await this.acceso.exigirRol(usuario.id, item.restauranteId, ADMINISTRACION)
    await this.assertIngredientePertenece(dto.ingredienteId, item.restauranteId)

    const yaAsociado = await this.prisma.itemIngrediente.findFirst({
      where: { itemId, ingredienteId: dto.ingredienteId },
    })
    if (yaAsociado) throw new ConflictException('Ese ingrediente ya está asociado a este ítem')

    await this.prisma.itemIngrediente.create({ data: { itemId, ...dto } })

    const updated = await this.prisma.itemMenu.findUnique({ where: { id: itemId }, include: DETAIL_INCLUDE })
    return this.serializeItem(updated)
  }

  async updateIngrediente(itemId: string, id: string, dto: UpdateIngredienteItemDto, usuario: UsuarioAutenticado) {
    const itemIngrediente = await this.getItemIngredienteOrThrow(id, itemId)
    await this.acceso.exigirRol(usuario.id, itemIngrediente.item.restauranteId, ADMINISTRACION)

    await this.prisma.itemIngrediente.update({ where: { id }, data: dto })

    const updated = await this.prisma.itemMenu.findUnique({ where: { id: itemId }, include: DETAIL_INCLUDE })
    return this.serializeItem(updated)
  }

  async removeIngrediente(itemId: string, id: string, usuario: UsuarioAutenticado) {
    const itemIngrediente = await this.getItemIngredienteOrThrow(id, itemId)
    await this.acceso.exigirRol(usuario.id, itemIngrediente.item.restauranteId, ADMINISTRACION)

    const tieneMods = await this.prisma.pedidoItemMod.count({ where: { itemIngredienteId: id } })
    if (tieneMods > 0) {
      throw new ConflictException('No se puede desasociar: el ingrediente aparece en modificaciones de pedidos históricos')
    }

    await this.prisma.itemIngrediente.delete({ where: { id } })
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  // Además de los datos del ítem devuelve precioDescuento, porcentajeDescuento y precioVigente ya calculados:
  // las apps no calculan precios ni porcentajes.
  private serializeItem(item: any) {
    const { recomendadoEn, ...rest } = item
    return {
      ...rest,
      esRecomendado: recomendadoEn !== null,
      ...derivarDescuento(item.precioBase, item.precioDescuento),
    }
  }

  private async getOrThrow(id: string) {
    const item = await this.prisma.itemMenu.findUnique({ where: { id } })
    if (!item) throw new NotFoundException('Ítem del menú no encontrado')
    return item
  }

  private async assertNombreUnico(restauranteId: string, nombre: string, excludeId?: string) {
    const existing = await this.prisma.itemMenu.findFirst({
      where: {
        restauranteId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
    if (existing) throw new ConflictException(`Ya existe un ítem con el nombre "${nombre}" en este restaurante`)
  }

  private async getItemIngredienteOrThrow(id: string, itemId: string) {
    const ii = await this.prisma.itemIngrediente.findUnique({
      where: { id },
      include: { item: true },
    })
    if (!ii || ii.itemId !== itemId) throw new NotFoundException('Asociación ingrediente-ítem no encontrada')
    return ii
  }

  /**
   * La categoría y la comanda tienen que ser del restaurante del ítem: el permiso es sobre ese restaurante, y la carta
   * pública de otro mostraría el ítem si quedara en una de sus categorías (los ids de las categorías son públicos).
   */
  private async assertRelacionesDelRestaurante(
    restauranteId: string,
    dto: { categoriaId?: string | null; comandaId?: string | null },
  ) {
    if (dto.categoriaId) {
      const categoria = await this.prisma.categoriaMenu.findUnique({ where: { id: dto.categoriaId }, select: { restauranteId: true } })
      if (categoria?.restauranteId !== restauranteId) throw new BadRequestException('La categoría no es de este restaurante')
    }
    if (dto.comandaId) {
      const comanda = await this.prisma.comanda.findUnique({ where: { id: dto.comandaId }, select: { restauranteId: true } })
      if (comanda?.restauranteId !== restauranteId) throw new BadRequestException('La comanda no es de este restaurante')
    }
  }

  private async assertIngredientePertenece(ingredienteId: string, restauranteId: string) {
    const ing = await this.prisma.ingrediente.findUnique({ where: { id: ingredienteId } })
    if (!ing) throw new NotFoundException('Ingrediente no encontrado')
    if (ing.restauranteId !== restauranteId) {
      throw new BadRequestException('El ingrediente no pertenece a este restaurante')
    }
  }
}
