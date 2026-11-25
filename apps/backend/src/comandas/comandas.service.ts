import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ADMINISTRACION } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { esUnicoViolado, traducirOperacionSimultanea } from '../caja/conflictos'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { PrismaService } from '../prisma/prisma.service'
import { COMANDA_SELECT } from './comanda.select'
import { ActualizarComandaDto } from './dto/actualizar-comanda.dto'
import { CrearComandaDto } from './dto/crear-comanda.dto'

export const MENSAJE_NOMBRE_REPETIDO = 'Ya hay una comanda con ese nombre en este restaurante'
export const mensajeConPlatosAsignados = (cantidad: number) =>
  cantidad === 1
    ? 'La comanda tiene 1 plato asignado: cambialo de comanda antes de desactivarla'
    : `La comanda tiene ${cantidad} platos asignados: cambialos de comanda antes de desactivarla`

/**
 * Las comandas de un restaurante (#344). No se borran: se desactivan. El nombre es único en el restaurante, también entre
 * las inactivas (`comanda_restaurante_id_nombre_key`).
 */
@Injectable()
export class ComandasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  /** Activas e inactivas, por nombre. El rol en el restaurante lo exige la ruta (`@RequiereRolEn`). */
  listar(restauranteId: string) {
    return this.prisma.comanda.findMany({ where: { restauranteId }, orderBy: { nombre: 'asc' }, select: COMANDA_SELECT })
  }

  /** El rol en el restaurante del body lo exige la ruta. */
  async crear(dto: CrearComandaDto) {
    try {
      return await this.prisma.comanda.create({
        data: { restauranteId: dto.restauranteId, nombre: dto.nombre },
        select: COMANDA_SELECT,
      })
    } catch (err) {
      throw traducirError(err)
    }
  }

  /**
   * Renombra, activa o desactiva (solo OWNER y GERENTE del restaurante de la comanda). Reactivar siempre se puede.
   * Desactivar cuenta los platos asignados dentro de una transacción serializable: si una asignación corre al mismo
   * tiempo, una de las dos falla.
   */
  async actualizar(id: string, dto: ActualizarComandaDto, usuario: UsuarioAutenticado) {
    if (dto.nombre === undefined && dto.activa === undefined) throw new BadRequestException('No hay nada para actualizar')

    const comanda = await this.prisma.comanda.findUnique({ where: { id }, select: { restauranteId: true } })
    if (!comanda) throw new NotFoundException('Comanda no encontrada')
    await this.acceso.exigirRol(usuario.id, comanda.restauranteId, ADMINISTRACION)

    try {
      return await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          if (dto.activa === false) {
            const platos = await tx.itemMenu.count({ where: { comandaId: id } })
            if (platos > 0) throw new ConflictException(mensajeConPlatosAsignados(platos))
          }
          return tx.comanda.update({ where: { id }, data: { nombre: dto.nombre, activa: dto.activa }, select: COMANDA_SELECT })
        },
        'actualizarComanda',
      )
    } catch (err) {
      throw traducirError(err)
    }
  }
}

function traducirError(err: unknown): unknown {
  if (esUnicoViolado(err, 'Comanda', ['restaurante_id', 'nombre'])) return new ConflictException(MENSAJE_NOMBRE_REPETIDO)
  return traducirOperacionSimultanea(err)
}
