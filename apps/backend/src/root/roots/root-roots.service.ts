import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { JwtPayload } from '../../auth/auth.service'
import { PrismaService } from '../../prisma/prisma.service'
import { conConflictoDeEmail, exigirEmailLibre, generarPasswordTemporal, prepararPassword, revocarSesiones } from '../comun/cuentas'
import { CrearCuentaDto } from '../comun/dto/crear-cuenta.dto'
import { HistorialRootService } from '../historial/historial-root.service'
import { CAMBIO_PASSWORD } from '../historial/registrar-historial'
import { CuentaRoot, CuentaRootConPassword } from '../root.types'

const SELECT_CUENTA_ROOT = { id: true, email: true, debeCambiarPassword: true } satisfies Prisma.AdminSelect

type FilaRoot = Prisma.AdminGetPayload<{ select: typeof SELECT_CUENTA_ROOT }>

const aCuenta = (fila: FilaRoot, propiaId: string): CuentaRoot => ({
  id: fila.id,
  email: fila.email,
  debeCambiarPassword: fila.debeCambiarPassword,
  esPropia: fila.id === propiaId,
})

/**
 * Cuentas ROOT que administra ROOT: ver, crear y restablecer la contraseña de otra. NO hay forma de borrar una cuenta ROOT desde
 * la app ni la API (decisión 15): ni este servicio ni ninguna ruta tiene un `eliminar`, y un test recorre el enrutador. La única vía
 * es el script de cuentas ROOT, que nunca borra a la última; la base también lo impide con un disparador.
 */
@Injectable()
export class RootRootsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historial: HistorialRootService,
  ) {}

  async listar(user: JwtPayload): Promise<CuentaRoot[]> {
    const filas = await this.prisma.admin.findMany({ where: { rol: 'ROOT' }, select: SELECT_CUENTA_ROOT, orderBy: { email: 'asc' } })
    return filas.map((fila) => aCuenta(fila, user.sub))
  }

  async crear(dto: CrearCuentaDto, user: JwtPayload): Promise<CuentaRootConPassword> {
    const email = dto.email
    const { passwordHash, passwordTemporal, generada } = await prepararPassword(dto.password, email)

    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, user)
      await exigirEmailLibre(tx, email)

      const creada = await conConflictoDeEmail(() =>
        tx.admin.create({
          data: { email, passwordHash, rol: 'ROOT', debeCambiarPassword: true },
          select: SELECT_CUENTA_ROOT,
        }),
      )

      await this.historial.registrar(tx, {
        actor,
        accion: 'ROOT_CREAR',
        entidad: { tipo: 'ROOT', id: creada.id, nombre: creada.email },
        cambios: [{ campo: 'Email', antes: null, despues: creada.email }, generada ? CAMBIO_PASSWORD.generada : CAMBIO_PASSWORD.elegida],
      })
      return { ...aCuenta(creada, actor.id), passwordTemporal }
    })
  }

  async restablecerPassword(id: string, user: JwtPayload): Promise<CuentaRootConPassword> {
    // Para cambiar la propia contraseña está "cambiar mi contraseña" (etapa 3), que pide la actual: restablecerse a uno mismo
    // sin saberla dejaría a una sesión robada cambiar la clave sin conocerla.
    if (id === user.sub) {
      throw new BadRequestException('No podés restablecer tu propia contraseña: para cambiarla usá «cambiar mi contraseña»')
    }
    const { passwordHash, passwordTemporal } = await generarPasswordTemporal()

    return this.prisma.$transaction(async (tx) => {
      const actor = await this.historial.actorDe(tx, user)
      const cuenta = await tx.admin.findFirst({ where: { id, rol: 'ROOT' }, select: SELECT_CUENTA_ROOT })
      if (!cuenta) throw new NotFoundException('Cuenta ROOT no encontrada')

      const actualizada = await tx.admin.update({
        where: { id: cuenta.id },
        data: { passwordHash, debeCambiarPassword: true },
        select: SELECT_CUENTA_ROOT,
      })
      await revocarSesiones(tx, cuenta.id)

      await this.historial.registrar(tx, {
        actor,
        accion: 'ROOT_RESTABLECER',
        entidad: { tipo: 'ROOT', id: cuenta.id, nombre: cuenta.email },
        cambios: [CAMBIO_PASSWORD.restablecida],
      })
      return { ...aCuenta(actualizada, actor.id), passwordTemporal }
    })
  }
}
