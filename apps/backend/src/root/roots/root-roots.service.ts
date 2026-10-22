import { ConflictException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { InvitacionesService } from '../../auth/invitaciones/invitaciones.service'
import { UsuarioAutenticado } from '../../auth/supabase/usuario-autenticado'
import { PrismaService } from '../../prisma/prisma.service'
import { InvitarCuentaDto } from '../comun/dto/invitar-cuenta.dto'
import { HistorialRootService } from '../historial/historial-root.service'
import { cambioDeInvitacion } from '../historial/registrar-historial'
import { CuentaRoot, CuentaRootInvitada } from '../root.types'

export const MENSAJE_EMAIL_CON_CUENTA =
  'Ese email ya tiene una cuenta en MenYU: para hacerla ROOT está el script de cuentas ROOT (promover)'

const SELECT_CUENTA_ROOT = { id: true, email: true, nombre: true, activo: true } satisfies Prisma.UsuarioSelect

type FilaRoot = Prisma.UsuarioGetPayload<{ select: typeof SELECT_CUENTA_ROOT }>

const aCuenta = (fila: FilaRoot, propiaId: string): CuentaRoot => ({
  id: fila.id,
  email: fila.email,
  nombre: fila.nombre,
  activo: fila.activo,
  esPropia: fila.id === propiaId,
})

/**
 * Cuentas ROOT (`Usuario.esRoot`): verlas e invitar a otra por mail. NO hay forma de borrar una cuenta ROOT ni de quitarle el
 * ROOT desde la app ni la API (decisión 15 de docs/plan-consola-root.md): ni este servicio ni ninguna ruta lo hacen, y un test
 * recorre el enrutador. La base además impide dejarla sin ninguna cuenta ROOT activa (disparador `usuario_proteger_ultimo_root`).
 */
@Injectable()
export class RootRootsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historial: HistorialRootService,
    private readonly invitaciones: InvitacionesService,
  ) {}

  async listar(usuario: UsuarioAutenticado): Promise<CuentaRoot[]> {
    const filas = await this.prisma.usuario.findMany({ where: { esRoot: true }, select: SELECT_CUENTA_ROOT, orderBy: { email: 'asc' } })
    return filas.map((fila) => aCuenta(fila, usuario.id))
  }

  /**
   * Invita a una persona nueva como ROOT. Una cuenta que ya existe (del personal, un dueño u otra cuenta ROOT, también la propia)
   * no se hace ROOT desde acá: eso es `promover` del script, que corre una persona del equipo con acceso a la base.
   *
   * Como en las invitaciones del personal, la llamada a Supabase va antes y afuera de la transacción, y el `Usuario` y su registro
   * en el historial van juntos (decisión 22).
   */
  async invitar(dto: InvitarCuentaDto, usuario: UsuarioAutenticado): Promise<CuentaRootInvitada> {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email }, select: { id: true } })
    if (existente) throw new ConflictException(MENSAJE_EMAIL_CON_CUENTA)

    const { cuenta, invitacionEnviada } = await this.invitaciones.cuentaDeSupabase(dto.email)
    try {
      return await this.prisma.$transaction(async (tx) => {
        const actor = await this.historial.actorDe(tx, usuario)
        const creada = await tx.usuario.create({
          data: { supabaseUserId: cuenta.id, email: (cuenta.email ?? dto.email).toLowerCase(), nombre: dto.nombre, esRoot: true },
          select: { id: true, email: true },
        })

        await this.historial.registrar(tx, {
          actor,
          accion: 'ROOT_INVITAR',
          entidad: { tipo: 'ROOT', id: creada.id, nombre: creada.email },
          cambios: [{ campo: 'Cuenta ROOT', antes: null, despues: creada.email }, cambioDeInvitacion(invitacionEnviada)],
        })
        return { usuarioId: creada.id, email: creada.email, invitacionEnviada }
      })
    } catch (error) {
      // Dos invitaciones al mismo email a la vez, o una cuenta de Supabase que ya es de otro `Usuario`: 409, no 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(MENSAJE_EMAIL_CON_CUENTA)
      }
      throw error
    }
  }
}
