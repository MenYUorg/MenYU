import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Prisma, Rol } from '@prisma/client'
import { AuthError, User } from '@supabase/supabase-js'
import { PrismaService } from '../../prisma/prisma.service'
import { AccesoService } from '../supabase/acceso.service'
import { SupabaseAdminService } from '../supabase/supabase-admin.service'
import { UsuarioAutenticado } from '../supabase/usuario-autenticado'
import { CrearInvitacionDto } from './dto/crear-invitacion.dto'
import { puedeInvitar } from './puede-invitar'

/** Dónde va la membresía: OWNER a una marca, el resto a un restaurante (CHECK `membresia_ambito_check`). */
type Ambito = { marcaId: string; restauranteId?: undefined } | { restauranteId: string; marcaId?: undefined }

/** Misma forma que `CrearInvitacionResponse` de `@menyu/types`. */
export interface InvitacionCreada {
  usuarioId: string
  membresiaId: string
  /** False si el email ya tenía cuenta (en Supabase o como Usuario): no se le manda mail. */
  invitacionEnviada: boolean
}

interface UsuarioInvitado {
  id: string
  email: string
  nombre: string
}

/**
 * Alta de personal por invitación (docs/auth/specs/auth.md, Fase 2). Crea el `Usuario`, su `Membresia`
 * y, para MOZO y JEFE_SALON, el `Mozo` del restaurante. Todo lo que se puede validar en la base se
 * valida antes de llamar a Supabase.
 */
@Injectable()
export class InvitacionesService {
  private readonly logger = new Logger(InvitacionesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
    private readonly supabase: SupabaseAdminService,
  ) {}

  async invitar(dto: CrearInvitacionDto, invitador: UsuarioAutenticado): Promise<InvitacionCreada> {
    const ambito = ambitoDe(dto)
    // Sin esto, ROOT podría hacerse OWNER de cualquier marca invitándose a sí mismo.
    if (dto.email === invitador.email.toLowerCase()) throw new ForbiddenException('No te podés invitar a vos mismo')
    await this.exigirPermiso(ambito, dto.rol, invitador)

    // Ya es parte del personal (de otro restaurante, por ejemplo): solo se suma la membresía.
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } })
    if (existente) {
      if (!existente.activo) throw new ConflictException('El usuario está desactivado')
      const yaTiene = await this.prisma.membresia.findFirst({ where: { usuarioId: existente.id, ...ambito } })
      if (yaTiene) throw new ConflictException('El usuario ya tiene un rol ahí')

      const membresia = await this.guardar(async (tx) => this.crearMembresia(tx, existente, dto.rol, ambito))
      return { usuarioId: existente.id, membresiaId: membresia.id, invitacionEnviada: false }
    }

    const { cuenta, invitacionEnviada } = await this.cuentaDeSupabase(dto.email)
    const { usuario, membresia } = await this.guardar(async (tx) => {
      const usuario = await tx.usuario.create({
        data: { supabaseUserId: cuenta.id, email: (cuenta.email ?? dto.email).toLowerCase(), nombre: dto.nombre },
      })
      const membresia = await this.crearMembresia(tx, usuario, dto.rol, ambito)
      return { usuario, membresia }
    })
    return { usuarioId: usuario.id, membresiaId: membresia.id, invitacionEnviada }
  }

  /** 403 si no puede invitar a ese rol ahí; 404 si puede (ROOT) pero la marca o el restaurante no existe. */
  private async exigirPermiso(ambito: Ambito, rol: Rol, invitador: UsuarioAutenticado): Promise<void> {
    let rolesEnAmbito: Rol[]
    if (ambito.marcaId !== undefined) {
      rolesEnAmbito = (await this.acceso.esOwnerDeMarca(invitador.id, ambito.marcaId)) ? ['OWNER'] : []
    } else {
      rolesEnAmbito = await this.acceso.rolesEnRestaurante(invitador.id, ambito.restauranteId)
    }

    if (!puedeInvitar({ esRoot: invitador.esRoot, rolesEnAmbito }, rol)) {
      throw new ForbiddenException('No podés invitar a ese rol ahí')
    }

    if (ambito.marcaId !== undefined) {
      const marca = await this.prisma.marca.findUnique({ where: { id: ambito.marcaId }, select: { id: true } })
      if (!marca) throw new NotFoundException('Marca no encontrada')
    } else {
      const restaurante = await this.prisma.restaurante.findUnique({
        where: { id: ambito.restauranteId },
        select: { id: true },
      })
      if (!restaurante) throw new NotFoundException('Restaurante no encontrado')
    }
  }

  /**
   * La cuenta de Supabase del email. Si no existe, la crea con la invitación (manda el mail). Si existe
   * y está confirmada (un cliente registrado, por ejemplo), se usa esa. Si existe sin confirmar, quien
   * la creó puede no ser el dueño del email y conoce su contraseña: se borra y se invita de nuevo.
   *
   * La búsqueda es un link de recuperación que no se manda: no crea usuarios ni envía mails, y responde
   * 404 si no hay cuenta. `inviteUserByEmail` no sirve para eso: a una cuenta sin confirmar la reinvita
   * sin avisar y le deja la contraseña; `listUsers` no filtra por email.
   *
   * Efectos sobre una cuenta confirmada: queda un token de recuperación válido hasta que vence (por eso
   * `busqueda.data` nunca se loguea ni se devuelve), reemplaza el link de "olvidé mi contraseña" que
   * tuviera pendiente y deja un `user_recovery_requested` en el audit log de Supabase.
   *
   * Reutilizar la cuenta confirmada es seguro solo con "Confirm email" activo en el proyecto (Fase 0):
   * si no, un registro público queda confirmado al instante.
   */
  private async cuentaDeSupabase(email: string): Promise<{ cuenta: User; invitacionEnviada: boolean }> {
    const busqueda = await this.supabase.auth.generateLink({ type: 'recovery', email })
    if (busqueda.error && !esCuentaInexistente(busqueda.error)) throw this.errorDeSupabase(busqueda.error)

    const existente = busqueda.error ? null : busqueda.data.user
    if (existente?.email_confirmed_at) return { cuenta: existente, invitacionEnviada: false }

    if (existente) {
      this.logger.warn(`Se borra la cuenta sin confirmar de Supabase ${existente.id} para invitar a ese email`)
      const borrado = await this.supabase.auth.deleteUser(existente.id)
      if (borrado.error) throw this.errorDeSupabase(borrado.error)
    }

    const invitacion = await this.supabase.auth.inviteUserByEmail(email)
    if (invitacion.error) throw this.errorDeSupabase(invitacion.error)
    return { cuenta: invitacion.data.user, invitacionEnviada: true }
  }

  private async crearMembresia(tx: Prisma.TransactionClient, usuario: UsuarioInvitado, rol: Rol, ambito: Ambito) {
    const membresia = await tx.membresia.create({ data: { usuarioId: usuario.id, rol, ...ambito } })
    if ((rol === 'MOZO' || rol === 'JEFE_SALON') && ambito.restauranteId) {
      await this.vincularMozo(tx, usuario, ambito.restauranteId, rol === 'JEFE_SALON')
    }
    return membresia
  }

  /**
   * El perfil operativo de mozo (asignaciones, llamados, pagos). Si el restaurante ya tiene un `Mozo`
   * con ese email (de los creados con el login propio), se vincula; si no, se crea sin contraseña.
   */
  private async vincularMozo(
    tx: Prisma.TransactionClient,
    usuario: UsuarioInvitado,
    restauranteId: string,
    esJefeSalon: boolean,
  ): Promise<void> {
    const mozo =
      (await tx.mozo.findFirst({ where: { restauranteId, usuarioId: usuario.id } })) ??
      (await tx.mozo.findFirst({
        where: { restauranteId, usuarioId: null, email: { equals: usuario.email, mode: 'insensitive' } },
      }))

    if (mozo) {
      await tx.mozo.update({ where: { id: mozo.id }, data: { usuarioId: usuario.id, esJefeSalon, activo: true } })
    } else {
      await tx.mozo.create({
        data: { restauranteId, nombre: usuario.nombre, email: usuario.email, usuarioId: usuario.id, esJefeSalon },
      })
    }
  }

  /** Una invitación repetida al mismo tiempo choca con las claves únicas: 409, no 500. */
  private async guardar<T>(operacion: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(operacion)
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('El usuario ya existe o ya tiene un rol ahí')
      }
      throw err
    }
  }

  private errorDeSupabase(error: AuthError): BadGatewayException {
    this.logger.error(`Supabase Auth: ${error.status ?? ''} ${error.code ?? ''} ${error.message}`)
    return new BadGatewayException(`Supabase no pudo procesar la invitación: ${error.message}`)
  }
}

function ambitoDe(dto: CrearInvitacionDto): Ambito {
  if (dto.rol === 'OWNER') {
    if (!dto.marcaId || dto.restauranteId) {
      throw new BadRequestException('OWNER se invita a una marca: mandá marcaId y no restauranteId')
    }
    return { marcaId: dto.marcaId }
  }
  if (!dto.restauranteId || dto.marcaId) {
    throw new BadRequestException(`${dto.rol} se invita a un restaurante: mandá restauranteId y no marcaId`)
  }
  return { restauranteId: dto.restauranteId }
}

function esCuentaInexistente(error: AuthError): boolean {
  return error.code === 'user_not_found' || error.status === 404
}
