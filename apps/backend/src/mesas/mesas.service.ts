import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Rol } from '@prisma/client'
import { randomInt, randomUUID } from 'crypto'
import * as QRCode from 'qrcode'
import { PrismaService } from '../prisma/prisma.service'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { CreateMesaDto } from './dto/create-mesa.dto'
import { UpdateMesaDto } from './dto/update-mesa.dto'

@Injectable()
export class MesasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  /** El rol en el restaurante (disponible) lo exige la ruta (`@RequiereRolEn`). */
  async create(dto: CreateMesaDto) {
    const existing = await this.prisma.mesa.findFirst({
      where: { restauranteId: dto.restauranteId, numero: dto.numero, activo: true },
    })
    if (existing) throw new ConflictException(`Ya existe una mesa con el número ${dto.numero}`)

    const qrToken = randomUUID()
    const pin = await this.generatePin(dto.restauranteId)
    const mesa = await this.prisma.mesa.create({
      data: { ...dto, qrToken, pin },
    })

    return { ...mesa, qrImage: await this.generateQr(qrToken, dto.restauranteId) }
  }

  /** El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  async findAll(restauranteId: string) {
    const mesas = await this.prisma.mesa.findMany({
      where: { restauranteId, activo: true },
      orderBy: { numero: 'asc' },
      include: {
        mozoMesas: { include: { mozo: { select: { id: true, nombre: true } } } },
      },
    })

    return Promise.all(
      mesas.map(async (m) => ({ ...m, qrImage: await this.generateQr(m.qrToken, m.restauranteId) })),
    )
  }

  async findOne(id: string, usuario: UsuarioAutenticado) {
    const mesa = await this.getMesaConPermiso(id, usuario)
    return { ...mesa, qrImage: await this.generateQr(mesa.qrToken, mesa.restauranteId) }
  }

  async update(id: string, dto: UpdateMesaDto, usuario: UsuarioAutenticado) {
    const mesa = await this.getMesaConPermiso(id, usuario)

    if (dto.numero && dto.numero !== mesa.numero) {
      const conflict = await this.prisma.mesa.findFirst({
        where: { restauranteId: mesa.restauranteId, numero: dto.numero, activo: true, id: { not: id } },
      })
      if (conflict) throw new ConflictException(`Ya existe una mesa con el número ${dto.numero}`)
    }

    const updated = await this.prisma.mesa.update({ where: { id }, data: dto })
    return { ...updated, qrImage: await this.generateQr(updated.qrToken, updated.restauranteId) }
  }

  async remove(id: string, usuario: UsuarioAutenticado) {
    await this.getMesaConPermiso(id, usuario, ['OWNER'])
    return this.prisma.mesa.update({ where: { id }, data: { activo: false } })
  }

  async regenerarQr(id: string, usuario: UsuarioAutenticado) {
    const mesa = await this.getMesaConPermiso(id, usuario)

    const qrToken = randomUUID()
    const updated = await this.prisma.mesa.update({ where: { id }, data: { qrToken } })
    return { ...updated, qrImage: await this.generateQr(qrToken, mesa.restauranteId) }
  }

  async cambiarPin(id: string, pin: string, usuario: UsuarioAutenticado) {
    const mesa = await this.getMesaConPermiso(id, usuario)

    const conflict = await this.prisma.mesa.findFirst({
      where: { restauranteId: mesa.restauranteId, pin, id: { not: id } },
    })
    if (conflict) throw new ConflictException(`El PIN ${pin} ya está en uso en este restaurante`)

    return this.prisma.mesa.update({ where: { id }, data: { pin } })
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  /** La mesa activa (404 si no), si el usuario tiene alguno de `roles` en su restaurante (403 si no). */
  private async getMesaConPermiso(id: string, usuario: UsuarioAutenticado, roles: readonly Rol[] = ADMINISTRACION) {
    const mesa = await this.prisma.mesa.findUnique({ where: { id } })
    if (!mesa?.activo) throw new NotFoundException('Mesa no encontrada')
    await this.acceso.exigirRol(usuario.id, mesa.restauranteId, roles)
    return mesa
  }

  private async generatePin(restauranteId: string): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const pin = String(randomInt(1, 10000)).padStart(4, '0')
      const exists = await this.prisma.mesa.findFirst({ where: { restauranteId, pin } })
      if (!exists) return pin
    }
    throw new ConflictException('No se pudo generar un PIN único para este restaurante')
  }

  private generateQr(token: string, restauranteId: string): Promise<string> {
    const base = process.env.QR_BASE_URL ?? 'https://menyu-cliente.vercel.app'
    const url = `${base}/check-in?restaurantId=${restauranteId}&tableCode=${token}`
    return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', width: 300 })
  }
}
