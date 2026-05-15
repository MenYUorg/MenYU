import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { JwtPayload } from '../auth/auth.service'
import { CreateItemDto } from './dto/create-item.dto'
import { UpdateItemDto } from './dto/update-item.dto'
import { AddIngredienteDto } from './dto/add-ingrediente.dto'
import { UpdateIngredienteItemDto } from './dto/update-ingrediente-item.dto'

const IMAGEN_BUCKET = 'menu-items'

const LIST_INCLUDE = {
  subcategoria: { select: { id: true, nombre: true, categoriaId: true } },
} as const

const DETAIL_INCLUDE = {
  categoria: true,
  subcategoria: true,
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
  ) {}

  async create(dto: CreateItemDto, user: JwtPayload) {
    await this.assertMarcaOwnership(dto.marcaId, user)

    if (dto.subcategoriaId) {
      await this.assertSubcategoriaPerteneceMarca(dto.subcategoriaId, dto.marcaId)
    }

    await this.assertNombreUnico(dto.marcaId, dto.nombre)

    return this.prisma.itemMenu.create({ data: dto, include: DETAIL_INCLUDE })
  }

  async findAll(
    marcaId: string,
    user: JwtPayload,
    subcategoriaId?: string,
    disponible?: boolean,
  ) {
    await this.assertMarcaOwnership(marcaId, user)

    return this.prisma.itemMenu.findMany({
      where: {
        marcaId,
        ...(subcategoriaId !== undefined ? { subcategoriaId } : {}),
        ...(disponible !== undefined ? { disponible } : {}),
      },
      orderBy: { nombre: 'asc' },
      include: LIST_INCLUDE,
    })
  }

  async findOne(id: string, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertMarcaOwnership(item.marcaId, user)
    return this.prisma.itemMenu.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  async update(id: string, dto: UpdateItemDto, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertMarcaOwnership(item.marcaId, user)

    if (dto.subcategoriaId && dto.subcategoriaId !== item.subcategoriaId) {
      await this.assertSubcategoriaPerteneceMarca(dto.subcategoriaId, item.marcaId)
    }

    if (dto.nombre && dto.nombre !== item.nombre) {
      await this.assertNombreUnico(item.marcaId, dto.nombre, id)
    }

    return this.prisma.itemMenu.update({ where: { id }, data: dto, include: DETAIL_INCLUDE })
  }

  async uploadImagen(id: string, file: Express.Multer.File, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertMarcaOwnership(item.marcaId, user)

    const path = `${item.marcaId}/${id}`
    const url = await this.storage.uploadFile(IMAGEN_BUCKET, path, file.buffer, file.mimetype)

    return this.prisma.itemMenu.update({ where: { id }, data: { imagenUrl: url }, include: DETAIL_INCLUDE })
  }

  async removeImagen(id: string, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertMarcaOwnership(item.marcaId, user)

    if (!item.imagenUrl) throw new NotFoundException('Este ítem no tiene imagen')

    await this.storage.deleteFile(IMAGEN_BUCKET, `${item.marcaId}/${id}`)

    return this.prisma.itemMenu.update({ where: { id }, data: { imagenUrl: null }, include: DETAIL_INCLUDE })
  }

  async remove(id: string, user: JwtPayload) {
    const item = await this.getOrThrow(id)
    await this.assertMarcaOwnership(item.marcaId, user)

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
    await this.assertMarcaOwnership(item.marcaId, user)
    await this.assertIngredientePerteneceMarca(dto.ingredienteId, item.marcaId)

    const yaAsociado = await this.prisma.itemIngrediente.findFirst({
      where: { itemId, ingredienteId: dto.ingredienteId },
    })
    if (yaAsociado) throw new ConflictException('Ese ingrediente ya está asociado a este ítem')

    await this.prisma.itemIngrediente.create({ data: { itemId, ...dto } })

    return this.prisma.itemMenu.findUnique({ where: { id: itemId }, include: DETAIL_INCLUDE })
  }

  async updateIngrediente(itemId: string, id: string, dto: UpdateIngredienteItemDto, user: JwtPayload) {
    const itemIngrediente = await this.getItemIngredienteOrThrow(id, itemId)
    await this.assertMarcaOwnership(itemIngrediente.item.marcaId, user)

    await this.prisma.itemIngrediente.update({ where: { id }, data: dto })

    return this.prisma.itemMenu.findUnique({ where: { id: itemId }, include: DETAIL_INCLUDE })
  }

  async removeIngrediente(itemId: string, id: string, user: JwtPayload) {
    const itemIngrediente = await this.getItemIngredienteOrThrow(id, itemId)
    await this.assertMarcaOwnership(itemIngrediente.item.marcaId, user)

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

  private async assertNombreUnico(marcaId: string, nombre: string, excludeId?: string) {
    const existing = await this.prisma.itemMenu.findFirst({
      where: {
        marcaId,
        nombre: { equals: nombre, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })
    if (existing) throw new ConflictException(`Ya existe un ítem con el nombre "${nombre}" en esta marca`)
  }

  private async assertSubcategoriaPerteneceMarca(subcategoriaId: string, marcaId: string) {
    const sub = await this.prisma.subcategoriaMenu.findUnique({
      where: { id: subcategoriaId },
      include: { categoria: { include: { restaurante: true } } },
    })
    if (!sub) throw new NotFoundException('Subcategoría no encontrada')
    if (sub.categoria.restaurante.marcaId !== marcaId) {
      throw new BadRequestException('La subcategoría no pertenece a un restaurante de esta marca')
    }
  }

  private async getItemIngredienteOrThrow(id: string, itemId: string) {
    const ii = await this.prisma.itemIngrediente.findUnique({
      where: { id },
      include: { item: true },
    })
    if (!ii || ii.itemId !== itemId) throw new NotFoundException('Asociación ingrediente-ítem no encontrada')
    return ii
  }

  private async assertIngredientePerteneceMarca(ingredienteId: string, marcaId: string) {
    const ing = await this.prisma.ingrediente.findUnique({
      where: { id: ingredienteId },
      include: { restaurante: true },
    })
    if (!ing) throw new NotFoundException('Ingrediente no encontrado')
    if (ing.restaurante.marcaId !== marcaId) {
      throw new BadRequestException('El ingrediente no pertenece a un restaurante de esta marca')
    }
  }

  private async assertMarcaOwnership(marcaId: string, user: JwtPayload) {
    if (user.rol === 'ROOT') return
    const admin = await this.prisma.admin.findUnique({ where: { id: user.sub } })
    if (!admin || admin.marcaId !== marcaId) {
      throw new ForbiddenException('No tenés acceso a esta marca')
    }
  }
}
