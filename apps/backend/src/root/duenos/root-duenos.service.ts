import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { InvitacionCreada, InvitacionesService } from '../../auth/invitaciones/invitaciones.service'
import { UsuarioAutenticado } from '../../auth/supabase/usuario-autenticado'
import { runSerializableTransaction } from '../../common/run-serializable-transaction'
import { PrismaService } from '../../prisma/prisma.service'
import { comoTextoLiteral } from '../comun/cuentas'
import { InvitarCuentaDto } from '../comun/dto/invitar-cuenta.dto'
import { HistorialRootService } from '../historial/historial-root.service'
import { DuenoRoot } from '../root.types'
import { ListarDuenosDto } from './dto/listar-duenos.dto'

// Lo único que ROOT ve de un dueño: su cuenta y su marca. Nada de los restaurantes ni del personal de la marca.
const SELECT_DUENO = {
  id: true,
  usuario: { select: { id: true, email: true, nombre: true, activo: true } },
  marca: { select: { id: true, nombre: true, activo: true } },
} satisfies Prisma.MembresiaSelect

type FilaDueno = Prisma.MembresiaGetPayload<{ select: typeof SELECT_DUENO }>

function aDueno(fila: FilaDueno): DuenoRoot {
  return {
    membresiaId: fila.id,
    usuarioId: fila.usuario.id,
    email: fila.usuario.email,
    nombre: fila.usuario.nombre,
    activo: fila.usuario.activo,
    marca: fila.marca ? { id: fila.marca.id, nombre: fila.marca.nombre, activo: fila.marca.activo } : null,
  }
}

/**
 * Los dueños que administra ROOT: cada uno es una membresía OWNER de un `Usuario` en una marca (una persona puede ser dueña de
 * más de una). ROOT los invita por mail y les quita la membresía; no les cambia el email ni la contraseña, que son de la persona.
 */
@Injectable()
export class RootDuenosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historial: HistorialRootService,
    private readonly invitaciones: InvitacionesService,
  ) {}

  async listar({ q }: ListarDuenosDto): Promise<DuenoRoot[]> {
    // `contains` es un LIKE: sin escaparlos, `_` y `%` serían comodines y `q=_` traería a todos.
    const texto = q ? { contains: comoTextoLiteral(q), mode: 'insensitive' as const } : undefined
    const filtro: Prisma.MembresiaWhereInput = texto
      ? { OR: [{ usuario: { is: { email: texto } } }, { marca: { is: { nombre: texto } } }] }
      : {}
    const filas = await this.prisma.membresia.findMany({
      where: { rol: 'OWNER', ...filtro },
      select: SELECT_DUENO,
      orderBy: [{ usuario: { email: 'asc' } }, { marca: { nombre: 'asc' } }],
    })
    return filas.map(aDueno)
  }

  /**
   * La invitación resuelve todo: que la marca exista (404) y esté activa (409), la cuenta de Supabase (o la que ya existe, sin
   * mail) y el registro `DUENO_INVITAR` en la misma transacción que la membresía.
   */
  invitar(marcaId: string, dto: InvitarCuentaDto, usuario: UsuarioAutenticado): Promise<InvitacionCreada> {
    return this.invitaciones.invitar({ email: dto.email, nombre: dto.nombre, rol: 'OWNER', marcaId }, usuario)
  }

  /**
   * Quita la membresía OWNER. El `Usuario` queda: puede ser dueño de otra marca o tener otras membresías, y sin ninguna
   * `/auth/me` le responde que no tiene acceso. No hace falta cerrar su sesión: cada pedido consulta las membresías.
   */
  async quitar(membresiaId: string, usuario: UsuarioAutenticado): Promise<void> {
    // Serializable: dos pedidos que quitan a los dos últimos dueños de una marca a la vez no pueden pasar los dos el control.
    await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        const actor = await this.historial.actorDe(tx, usuario)
        const dueno = await tx.membresia.findFirst({ where: { id: membresiaId, rol: 'OWNER' }, select: SELECT_DUENO })
        if (!dueno) throw new NotFoundException('Dueño no encontrado')

        if (dueno.marca?.activo) {
          const otros = await tx.membresia.count({ where: { rol: 'OWNER', marcaId: dueno.marca.id, id: { not: dueno.id } } })
          if (otros === 0) {
            throw new ConflictException(
              `Es el único dueño de «${dueno.marca.nombre}», una marca activa: invitá a otro dueño antes de quitarlo, o dala de baja`,
            )
          }
        }

        await tx.membresia.delete({ where: { id: dueno.id } })

        await this.historial.registrar(tx, {
          actor,
          accion: 'DUENO_QUITAR',
          entidad: { tipo: 'OWNER', id: dueno.usuario.id, nombre: dueno.usuario.email },
          marca: dueno.marca ? { id: dueno.marca.id, nombre: dueno.marca.nombre } : null,
          cambios: [{ campo: 'Dueño de', antes: dueno.marca?.nombre ?? null, despues: null }],
        })
      },
      'RootDuenosService.quitar',
    )
  }
}
