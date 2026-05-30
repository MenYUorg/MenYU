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
import { CreateItemDto } from './dto/create-item.dto'
import { UpdateItemDto } from './dto/update-item.dto'
import { AddIngredienteDto } from './dto/add-ingrediente.dto'
import { UpdateIngredienteItemDto } from './dto/update-ingrediente-item.dto'

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

    return this.prisma.itemMenu.create({ data: dto, include: DETAIL_INCLUDE })
  }

  async findAll(restauranteId: string, user: JwtPayload, disponible?: boolean) {
    await this.assertRestauranteOwnership(restauranteId, user)

    return this.prisma.itemMenu.findMany({
      where: {
        restauranteId,
        ...(disponible !== undefined ? { disponible } : {}),
      },
      orderBy: { nombre: 'asc' },
      include: DETAIL_INCLUDE,
    })
  }

  async findOne(id: string, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(item.restauranteId, user)
    return this.prisma.itemMenu.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  async update(id: string, dto: UpdateItemDto, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(item.restauranteId, user)

    if (dto.nombre && dto.nombre !== item.nombre) {
      await this.assertNombreUnico(item.restauranteId, dto.nombre, id)
    }

    const updated = await this.prisma.itemMenu.update({ where: { id }, data: dto, include: DETAIL_INCLUDE })
    this.gateway.emitMenuUpdated(item.restauranteId)
    return updated
  }

  async uploadImagen(id: string, file: Express.Multer.File, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(item.restauranteId, user)

    const path = `${item.restauranteId}/${id}`
    const url = await this.storage.uploadFile(IMAGEN_BUCKET, path, file.buffer, file.mimetype)

    return this.prisma.itemMenu.update({ where: { id }, data: { imagenUrl: url }, include: DETAIL_INCLUDE })
  }

  async removeImagen(id: string, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertRestauranteOwnership(item.restauranteId, user)

    if (!item.imagenUrl) throw new NotFoundException('Este ítem no tiene imagen')

    await this.storage.deleteFile(IMAGEN_BUCKET, `${item.restauranteId}/${id}`)

    return this.prisma.itemMenu.update({ where: { id }, data: { imagenUrl: null }, include: DETAIL_INCLUDE })
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

    return this.prisma.itemMenu.findUnique({ where: { id: itemId }, include: DETAIL_INCLUDE })
  }

  async updateIngrediente(itemId: string, id: string, dto: UpdateIngredienteItemDto, user: JwtPayload) {
    const itemIngrediente = await this.getItemIngredienteOrThrow(id, itemId)
    await this.assertRestauranteOwnership(itemIngrediente.item.restauranteId, user)

    await this.prisma.itemIngrediente.update({ where: { id }, data: dto })

    return this.prisma.itemMenu.findUnique({ where: { id: itemId }, include: DETAIL_INCLUDE })
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
