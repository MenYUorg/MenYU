import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { MenyuGateway } from '../gateway/menyu.gateway'
import { JwtPayload } from '../auth/auth.service'
import { assertOwnerOGerenteDeRestaurante } from '../common/assert-owner-access'
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
  ) {}

  async create(dto: CreateItemDto, user: JwtPayload) {
    await this.assertRestauranteOwnership(dto.restauranteId, user)
    await this.assertNombreUnico(dto.restauranteId, dto.nombre)

    const created = await this.prisma.itemMenu.create({ data: dto, include: DETAIL_INCLUDE })
    return this.serializeItem(created)
  }

  async findAll(restauranteId: string, user: JwtPayload, disponible?: boolean) {
    await this.assertRestauranteOwnership(restauranteId, user)

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

  async findOne(id: string, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(item.restauranteId, user)
    const found = await this.prisma.itemMenu.findUnique({ where: { id }, include: DETAIL_INCLUDE })
    return this.serializeItem(found)
  }

  async update(id: string, dto: UpdateItemDto, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(item.restauranteId, user)

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

  async uploadImagen(id: string, file: Express.Multer.File, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(item.restauranteId, user)

    const path = `${item.restauranteId}/${id}`
    const url = await this.storage.uploadFile(IMAGEN_BUCKET, path, file.buffer, file.mimetype)

    const updated = await this.prisma.itemMenu.update({ where: { id }, data: { imagenUrl: url }, include: DETAIL_INCLUDE })
    return this.serializeItem(updated)
  }

  async removeImagen(id: string, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(item.restauranteId, user)

    if (!item.imagenUrl) throw new NotFoundException('Este ítem no tiene imagen')

    await this.storage.deleteFile(IMAGEN_BUCKET, `${item.restauranteId}/${id}`)

    const updated = await this.prisma.itemMenu.update({ where: { id }, data: { imagenUrl: null }, include: DETAIL_INCLUDE })
    return this.serializeItem(updated)
  }

  // ── Descuento: solo el OWNER de la marca y el GERENTE asignado (ROOT no) ──────────

  async setDescuento(id: string, dto: SetDescuentoDto, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await assertOwnerOGerenteDeRestaurante(this.prisma, item.restauranteId, user)

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

  async removeDescuento(id: string, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await assertOwnerOGerenteDeRestaurante(this.prisma, item.restauranteId, user)

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

  async remove(id: string, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(item.restauranteId, user)

    const totalPedidos = await this.prisma.pedidoItem.count({ where: { itemId: id } })
    if (totalPedidos > 0) {
      throw new ConflictException(
        `No se puede eliminar: el ítem aparece en ${totalPedidos} pedido(s). Marcarlo como no disponible en su lugar.`,
      )
    }

    await this.prisma.itemMenu.delete({ where: { id } })
  }

  // ── Ingredientes del ítem ──────────────────────────────────────────────

  async addIngrediente(itemId: string, dto: AddIngredienteDto, user: JwtPayload) {
    const item = await this.getOrThrow(itemId)
    await this.assertRestauranteOwnership(item.restauranteId, user)
    await this.assertIngredientePertenece(dto.ingredienteId, item.restauranteId)

    const yaAsociado = await this.prisma.itemIngrediente.findFirst({
      where: { itemId, ingredienteId: dto.ingredienteId },
    })
    if (yaAsociado) throw new ConflictException('Ese ingrediente ya está asociado a este ítem')

    await this.prisma.itemIngrediente.create({ data: { itemId, ...dto } })

    const updated = await this.prisma.itemMenu.findUnique({ where: { id: itemId }, include: DETAIL_INCLUDE })
    return this.serializeItem(updated)
  }

  async updateIngrediente(itemId: string, id: string, dto: UpdateIngredienteItemDto, user: JwtPayload) {
    const itemIngrediente = await this.getItemIngredienteOrThrow(id, itemId)
    await this.assertRestauranteOwnership(itemIngrediente.item.restauranteId, user)

    await this.prisma.itemIngrediente.update({ where: { id }, data: dto })

    const updated = await this.prisma.itemMenu.findUnique({ where: { id: itemId }, include: DETAIL_INCLUDE })
    return this.serializeItem(updated)
  }

  async removeIngrediente(itemId: string, id: string, user: JwtPayload) {
    const itemIngrediente = await this.getItemIngredienteOrThrow(id, itemId)
    await this.assertRestauranteOwnership(itemIngrediente.item.restauranteId, user)

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

  private async assertIngredientePertenece(ingredienteId: string, restauranteId: string) {
    const ing = await this.prisma.ingrediente.findUnique({ where: { id: ingredienteId } })
    if (!ing) throw new NotFoundException('Ingrediente no encontrado')
    if (ing.restauranteId !== restauranteId) {
      throw new BadRequestException('El ingrediente no pertenece a este restaurante')
    }
  }

  private async assertRestauranteOwnership(restauranteId: string, user: JwtPayload) {
    if (user.rol === 'ROOT') return
    if (user.rol === 'OWNER') {
      const admin = await this.prisma.admin.findUnique({ where: { id: user.sub } })
      const restaurante = await this.prisma.restaurante.findUnique({ where: { id: restauranteId } })
      if (!admin || !restaurante || admin.marcaId !== restaurante.marcaId) {
        throw new ForbiddenException('No tenés acceso a este restaurante')
      }
      return
    }
    if (user.rol === 'GERENTE') {
      const asignacion = await this.prisma.adminRestaurante.findUnique({
        where: { adminId_restauranteId: { adminId: user.sub, restauranteId } },
      })
      if (!asignacion) throw new ForbiddenException('No tenés acceso a este restaurante')
      return
    }
    throw new ForbiddenException('No tenés acceso a este restaurante')
  }
}
