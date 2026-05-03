import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { UsersService } from '../users/users.service'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'

export type UserTipo = 'admin' | 'mozo' | 'cliente'

export interface JwtPayload {
  sub: string
  email?: string
  nombre?: string
  tipo: UserTipo
  rol?: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

const BCRYPT_ROUNDS = 10
const REFRESH_TOKEN_BYTES = 40
const REFRESH_EXPIRES_DAYS = 7

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Login ──────────────────────────────────────────────

  async login(email: string, password: string): Promise<TokenPair> {
    const resolved = await this.resolveUserByEmail(email)

    if (!resolved || !resolved.user.passwordHash) {
      throw new UnauthorizedException('Credenciales inválidas')
    }

    const valid = await bcrypt.compare(password, resolved.user.passwordHash)
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas')
    }

    const { user, tipo } = resolved
    return this.issueTokens(user.id, email, tipo, (user as any).rol, (user as any).nombre)
  }

  // ── Register (solo Cliente) ────────────────────────────

  async register(
    nombre: string,
    email: string,
    password: string,
    telefono?: string,
  ): Promise<TokenPair> {
    const existing = await this.users.findClienteByEmail(email)
    if (existing) {
      throw new ConflictException('El email ya está registrado')
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const cliente = await this.users.createCliente({ nombre, email, passwordHash, telefono })

    return this.issueTokens(cliente.id, email, 'cliente', undefined, nombre)
  }

  // ── Guest ──────────────────────────────────────────────

  async loginAsGuest(nombre?: string): Promise<TokenPair> {
    const nombreFinal = nombre ?? 'Invitado'
    const cliente = await this.users.createCliente({ nombre: nombreFinal })
    return this.issueTokens(cliente.id, undefined, 'cliente', undefined, nombreFinal)
  }

  // ── Refresh ────────────────────────────────────────────

  async refresh(rawToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawToken)

    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido o expirado')
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    })

    const user = await this.resolveUserById(stored.userId, stored.userTipo as UserTipo)
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado')
    }

    return this.issueTokens(
      stored.userId,
      (user as any).email,
      stored.userTipo as UserTipo,
      (user as any).rol,
      (user as any).nombre,
    )
  }

  // ── Logout ─────────────────────────────────────────────

  async logout(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken)
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  // ── Dev (solo para pruebas — eliminar antes de producción) ────

  async devSeed() {
    let marca = await this.prisma.marca.findFirst()
    if (!marca) {
      marca = await this.prisma.marca.create({
        data: { nombre: 'Marca Test', slug: 'marca-test' },
      })
    }

    let restaurante = await this.prisma.restaurante.findFirst()
    if (!restaurante) {
      restaurante = await this.prisma.restaurante.create({
        data: { nombre: 'Restaurante Test', marcaId: marca.id },
      })
    }

    const adminEmail = 'admin@test.com'
    let admin = await this.users.findAdminByEmail(adminEmail)
    if (!admin) {
      const passwordHash = await bcrypt.hash('password123', BCRYPT_ROUNDS)
      admin = await this.users.createAdmin({
        email: adminEmail,
        passwordHash,
        rol: 'ADMIN',
        marcaId: marca.id,
      })
    }

    const mozoEmail = 'mozo@test.com'
    let mozo = await this.users.findMozoByEmail(mozoEmail)
    if (!mozo) {
      const passwordHash = await bcrypt.hash('password123', BCRYPT_ROUNDS)
      mozo = await this.users.createMozo({
        nombre: 'Mozo Test',
        email: mozoEmail,
        passwordHash,
        restauranteId: restaurante.id,
      })
    }

    return {
      marca: { id: marca.id, nombre: marca.nombre },
      restaurante: { id: restaurante.id, nombre: restaurante.nombre },
      admin: { id: admin.id, email: admin.email, rol: admin.rol },
      mozo: { id: mozo.id, email: mozo.email, nombre: mozo.nombre },
      credenciales: { password: 'password123' },
    }
  }

  async devCreateRoot() {
    const email = 'root@menyu.com'
    const existing = await this.users.findAdminByEmail(email)
    if (existing) {
      const tokens = await this.issueTokens(existing.id, existing.email, 'admin', existing.rol)
      return { mensaje: 'ROOT ya existe, tokens renovados.', ...tokens }
    }

    const passwordHash = await bcrypt.hash('root1234', BCRYPT_ROUNDS)
    const root = await this.users.createAdmin({ email, passwordHash, rol: 'ROOT' })
    const tokens = await this.issueTokens(root.id, root.email, 'admin', 'ROOT')
    return { mensaje: 'Admin ROOT creado. Credenciales: root@menyu.com / root1234', ...tokens }
  }

  async devCreateAdmin(email: string, password: string, rol: string, marcaId: string) {
    const existing = await this.users.findAdminByEmail(email)
    if (existing) throw new ConflictException('El email ya está registrado')
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    return this.users.createAdmin({ email, passwordHash, rol, marcaId })
  }

  async devCreateMozo(nombre: string, email: string, password: string, restauranteId: string) {
    const existing = await this.users.findMozoByEmail(email)
    if (existing) throw new ConflictException('El email ya está registrado')
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    return this.users.createMozo({ nombre, email, passwordHash, restauranteId })
  }

  // ── Helpers ────────────────────────────────────────────

  private async issueTokens(
    userId: string,
    email: string | undefined,
    tipo: UserTipo,
    rol?: string,
    nombre?: string,
  ): Promise<TokenPair> {
    const payload: JwtPayload = { sub: userId, email, nombre, tipo, rol }

    const accessToken = this.jwt.sign(payload)

    const rawRefresh = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex')
    const tokenHash = this.hashToken(rawRefresh)
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + REFRESH_EXPIRES_DAYS)

    await this.prisma.refreshToken.create({
      data: { tokenHash, userId, userTipo: tipo, expiresAt },
    })

    return { accessToken, refreshToken: rawRefresh }
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex')
  }

  private async resolveUserByEmail(email: string): Promise<{ user: any; tipo: UserTipo } | null> {
    const admin = await this.users.findAdminByEmail(email)
    if (admin) return { user: admin, tipo: 'admin' }
    const mozo = await this.users.findMozoByEmail(email)
    if (mozo) return { user: mozo, tipo: 'mozo' }
    const cliente = await this.users.findClienteByEmail(email)
    if (cliente) return { user: cliente, tipo: 'cliente' }
    return null
  }

  private resolveUserById(id: string, tipo: UserTipo) {
    if (tipo === 'admin') return this.users.findAdminById(id)
    if (tipo === 'mozo') return this.users.findMozoById(id)
    return this.users.findClienteById(id)
  }
}
