import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RolAdmin } from '../auth/auth.service'

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Admin ──────────────────────────────────────────────

  findAdminByEmail(email: string) {
    return this.prisma.admin.findUnique({ where: { email } })
  }

  findAdminById(id: string) {
    return this.prisma.admin.findUnique({ where: { id } })
  }

  createAdmin(data: {
    email: string
    passwordHash: string
    rol: RolAdmin
    marcaId?: string
  }) {
    return this.prisma.admin.create({ data })
  }

  // ── Mozo ───────────────────────────────────────────────

  findMozoByEmail(email: string) {
    return this.prisma.mozo.findFirst({ where: { email } })
  }

  findMozoById(id: string) {
    return this.prisma.mozo.findUnique({ where: { id } })
  }

  createMozo(data: {
    nombre: string
    email?: string
    passwordHash: string
    telefono?: string
    esJefeSalon?: boolean
    restauranteId: string
  }) {
    return this.prisma.mozo.create({ data })
  }

  // ── Cliente ────────────────────────────────────────────

  findClienteByEmail(email: string) {
    return this.prisma.cliente.findUnique({ where: { email } })
  }

  findClienteById(id: string) {
    return this.prisma.cliente.findUnique({ where: { id } })
  }

  createCliente(data: {
    nombre: string
    email?: string
    passwordHash?: string
    telefono?: string
  }) {
    return this.prisma.cliente.create({ data })
  }
}
