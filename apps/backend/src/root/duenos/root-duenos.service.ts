import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { UsuarioAutenticado } from '../../auth/supabase/usuario-autenticado'
import { runSerializableTransaction } from '../../common/run-serializable-transaction'
import { PrismaService } from '../../prisma/prisma.service'
import { conConflictoDeEmail, exigirEmailLibre, generarPasswordTemporal, prepararPassword, revocarSesiones } from '../comun/cuentas'
import { CambiarEmailDto, CrearCuentaDto } from '../comun/dto/crear-cuenta.dto'
import { HistorialRootService } from '../historial/historial-root.service'
import { CAMBIO_PASSWORD } from '../historial/registrar-historial'
import { DuenoConPassword, DuenoRoot } from '../root.types'
import { ListarDuenosDto } from './dto/listar-duenos.dto'

// Lo único que ROOT ve de un dueño: nunca el hash de la contraseña ni la marca completa.
const SELECT_DUENO = {
  id: true,
  email: true,
  debeCambiarPassword: true,
  marca: { select: { id: true, nombre: true, activo: true } },
} satisfies Prisma.AdminSelect

type FilaDueno = Prisma.AdminGetPayload<{ select: typeof SELECT_DUENO }>

function aDueno(fila: FilaDueno): DuenoRoot {
  return {
    id: fila.id,
    email: fila.email,
    debeCambiarPassword: fila.debeCambiarPassword,
    marca: fila.marca ? { id: fila.marca.id, nombre: fila.marca.nombre, activo: fila.marca.activo } : null,
  }
}

const contextoDeMarca = (fila: FilaDueno) => (fila.marca ? { id: fila.marca.id, nombre: fila.marca.nombre } : null)

/** Cuentas OWNER ("dueños") que administra ROOT. Solo actúa sobre cuentas con rol OWNER: cualquier otra responde 404. */
@Injectable()
export class RootDuenosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historial: HistorialRootService,
  ) {}

  async listar({ q }: ListarDuenosDto): Promise<DuenoRoot[]> {
    const filtro: Prisma.AdminWhereInput = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { marca: { is: { nombre: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}
    const filas = await this.prisma.admin.findMany({
      where: { rol: 'OWNER', ...filtro },
      select: SELECT_DUENO,
      orderBy: { email: 'asc' },
    })
    return filas.map(aDueno)
  }

  async crear(marcaId: string, dto: CrearCuentaDto, usuario: UsuarioAutenticado): Promise<DuenoConPassword> {
    const email = dto.email
    // El hash (bcrypt, lento) se calcula antes de abrir la transacción para no tenerla abierta mientras tanto.
    const { passwordHash, passwordTemporal, generada } = await prepararPassword(dto.password, email)

    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, usuario)
      const marca = await tx.marca.findUnique({ where: { id: marcaId }, select: { id: true, nombre: true, activo: true } })
      if (!marca) throw new NotFoundException('Marca no encontrada')
      if (!marca.activo) throw new ConflictException('La marca está dada de baja: no se le pueden crear dueños')
      await exigirEmailLibre(tx, email)

      const creado = await conConflictoDeEmail(() =>
        tx.admin.create({
          data: { email, passwordHash, rol: 'OWNER', marcaId: marca.id, debeCambiarPassword: true },
          select: SELECT_DUENO,
        }),
      )

      await this.historial.registrar(tx, {
        actor,
        accion: 'DUENO_CREAR',
        entidad: { tipo: 'OWNER', id: creado.id, nombre: creado.email },
        marca: { id: marca.id, nombre: marca.nombre },
        cambios: [
          { campo: 'Email', antes: null, despues: creado.email },
          { campo: 'Marca', antes: null, despues: marca.nombre },
          generada ? CAMBIO_PASSWORD.generada : CAMBIO_PASSWORD.elegida,
        ],
      })
      return { ...aDueno(creado), passwordTemporal }
    })
  }

  async cambiarEmail(id: string, dto: CambiarEmailDto, usuario: UsuarioAutenticado): Promise<DuenoRoot> {
    const email = dto.email
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, usuario)
      const dueno = await tx.admin.findFirst({ where: { id, rol: 'OWNER' }, select: SELECT_DUENO })
      if (!dueno) throw new NotFoundException('Dueño no encontrado')
      // Mismo email: no hay nada que cambiar ni que registrar.
      if (dueno.email === email) return aDueno(dueno)
      await exigirEmailLibre(tx, email, dueno.id)

      const actualizado = await conConflictoDeEmail(() =>
        tx.admin.update({ where: { id: dueno.id }, data: { email }, select: SELECT_DUENO }),
      )

      await this.historial.registrar(tx, {
        actor,
        accion: 'DUENO_CAMBIAR_EMAIL',
        entidad: { tipo: 'OWNER', id: dueno.id, nombre: actualizado.email },
        marca: contextoDeMarca(dueno),
        cambios: [{ campo: 'Email', antes: dueno.email, despues: actualizado.email }],
      })
      return aDueno(actualizado)
    })
  }

  async restablecerPassword(id: string, usuario: UsuarioAutenticado): Promise<DuenoConPassword> {
    const { passwordHash, passwordTemporal } = await generarPasswordTemporal()
    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, usuario)
      const dueno = await tx.admin.findFirst({ where: { id, rol: 'OWNER' }, select: SELECT_DUENO })
      if (!dueno) throw new NotFoundException('Dueño no encontrado')

      const actualizado = await tx.admin.update({
        where: { id: dueno.id },
        data: { passwordHash, debeCambiarPassword: true },
        select: SELECT_DUENO,
      })
      // Sin esto, quien tenía la sesión abierta con la contraseña vieja podría renovarla durante 7 días.
      await revocarSesiones(tx, dueno.id)

      await this.historial.registrar(tx, {
        actor,
        accion: 'DUENO_RESTABLECER',
        entidad: { tipo: 'OWNER', id: dueno.id, nombre: dueno.email },
        marca: contextoDeMarca(dueno),
        cambios: [CAMBIO_PASSWORD.restablecida],
      })
      return { ...aDueno(actualizado), passwordTemporal }
    })
  }

  async eliminar(id: string, usuario: UsuarioAutenticado): Promise<void> {
    // Serializable: dos pedidos que eliminan a los dos últimos dueños de una marca a la vez no pueden pasar los dos el control.
    await runSerializableTransaction(
      this.prisma,
      async (tx) => {
        const actor = await this.historial.actorDe(tx, usuario)
        const dueno = await tx.admin.findFirst({ where: { id, rol: 'OWNER' }, select: SELECT_DUENO })
        if (!dueno) throw new NotFoundException('Dueño no encontrado')

        if (dueno.marca?.activo) {
          const otros = await tx.admin.count({ where: { rol: 'OWNER', marcaId: dueno.marca.id, id: { not: dueno.id } } })
          if (otros === 0) {
            throw new ConflictException(
              `Es el único dueño de «${dueno.marca.nombre}», una marca activa: creá otro dueño antes de eliminarlo, o dala de baja`,
            )
          }
        }

        await revocarSesiones(tx, dueno.id)
        await tx.admin.delete({ where: { id: dueno.id } })

        await this.historial.registrar(tx, {
          actor,
          accion: 'DUENO_ELIMINAR',
          entidad: { tipo: 'OWNER', id: dueno.id, nombre: dueno.email },
          marca: contextoDeMarca(dueno),
          cambios: [{ campo: 'Cuenta', antes: dueno.email, despues: 'eliminada' }],
        })
      },
      'RootDuenosService.eliminar',
    )
  }
}
