import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { PrismaService } from '../prisma/prisma.service'
import { CAJA_SELECT } from './caja.select'
import { esUnicoViolado, traducirOperacionSimultanea } from './conflictos'
import { ActualizarCajaDto } from './dto/actualizar-caja.dto'
import { CrearCajaDto } from './dto/crear-caja.dto'

export const MENSAJE_NOMBRE_REPETIDO = 'Ya hay una caja con ese nombre en este restaurante'
export const MENSAJE_CAJA_ABIERTA = 'No se puede desactivar una caja con el turno abierto'

/**
 * Las cajas físicas de un restaurante (#357). No se borran: se desactivan. El nombre es único en el restaurante, también
 * entre las inactivas (`caja_restaurante_id_nombre_key`).
 */
@Injectable()
export class CajasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  /** Activas e inactivas, por nombre. El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  listar(restauranteId: string) {
    return this.prisma.caja.findMany({ where: { restauranteId }, orderBy: { nombre: 'asc' }, select: CAJA_SELECT })
  }

  /** El rol en el restaurante del body lo exige la ruta. */
  async crear(dto: CrearCajaDto) {
    try {
      return await this.prisma.caja.create({
        data: { restauranteId: dto.restauranteId, nombre: dto.nombre },
        select: CAJA_SELECT,
      })
    } catch (err) {
      throw traducirError(err)
    }
  }

  /**
   * Renombra, activa o desactiva (solo OWNER y GERENTE del restaurante de la caja). Activar una activa o desactivar una
   * inactiva no cambia nada. Desactivar mira la apertura dentro de una transacción serializable: si una apertura con esta
   * caja corre al mismo tiempo, una de las dos falla.
   */
  async actualizar(id: string, dto: ActualizarCajaDto, usuario: UsuarioAutenticado) {
    if (dto.nombre === undefined && dto.activa === undefined) throw new BadRequestException('No hay nada para actualizar')

    const caja = await this.prisma.caja.findUnique({ where: { id }, select: { restauranteId: true } })
    if (!caja) throw new NotFoundException('Caja no encontrada')
    await this.acceso.exigirRol(usuario.id, caja.restauranteId, ADMINISTRACION)

    try {
      return await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          if (dto.activa === false) {
            const abierta = await tx.turnoCaja.findFirst({ where: { cajaId: id, cerradoEn: null }, select: { id: true } })
            if (abierta) throw new ConflictException(MENSAJE_CAJA_ABIERTA)
          }
          return tx.caja.update({ where: { id }, data: { nombre: dto.nombre, activa: dto.activa }, select: CAJA_SELECT })
        },
        'actualizarCaja',
      )
    } catch (err) {
      throw traducirError(err)
    }
  }
}

function traducirError(err: unknown): unknown {
  if (esUnicoViolado(err, 'Caja', ['restaurante_id', 'nombre'])) return new ConflictException(MENSAJE_NOMBRE_REPETIDO)
  return traducirOperacionSimultanea(err)
}
