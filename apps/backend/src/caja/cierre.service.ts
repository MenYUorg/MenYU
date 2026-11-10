import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { CAJA } from '../auth/roles-del-personal'
import { AccesoService } from '../auth/supabase/acceso.service'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { METODOS_ARQUEO, MetodoArqueo } from '../common/caja.constant'
import { runSerializableTransaction } from '../common/run-serializable-transaction'
import { PrismaService } from '../prisma/prisma.service'
import { MENSAJE_TURNO_CERRADO, traducirConflictoDeCierre } from './conflictos'
import { MAX_MONTO } from './dto/abrir-turno.dto'
import { CajaDelCierreDto, CerrarTurnoDto } from './dto/cerrar-turno.dto'
import { esperadoDeCaja } from './esperado-de-caja'
import { MENSAJE_CAJA_NO_ABIERTA } from './movimientos.service'
import { TURNO_SELECT, turnoParaLaApi } from './turno.select'

type Apertura = { id: string; cajaId: string; fondoInicial: Prisma.Decimal; caja: { nombre: string } }
type ArqueoDeMetodo = { metodo: MetodoArqueo; esperado: Prisma.Decimal; declarado: Prisma.Decimal; diferencia: Prisma.Decimal }

const MAXIMO = new Prisma.Decimal(MAX_MONTO)

/**
 * Cerrar un turno (#357): cierra todas sus cajas juntas y guarda el arqueo de cada una (4 métodos: esperado, declarado y
 * diferencia), en una transacción serializable. El rol (el grupo CAJA del restaurante del turno) lo exige el service;
 * quién cierra sale de la cuenta. Las mesas abiertas se leen después del commit: son un aviso, no bloquean el cierre.
 */
@Injectable()
export class CierreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: AccesoService,
  ) {}

  async cerrar(turnoId: string, dto: CerrarTurnoDto, usuario: UsuarioAutenticado) {
    const turno = await this.prisma.turno.findUnique({ where: { id: turnoId }, select: { restauranteId: true } })
    if (!turno) throw new NotFoundException('Turno no encontrado')
    await this.acceso.exigirRol(usuario.id, turno.restauranteId, CAJA)

    let cerrado
    try {
      cerrado = await runSerializableTransaction(
        this.prisma,
        async (tx) => {
          // El turno existe (es Restrict: no se borra con cajas); se relee para ver si se cerró.
          const actual = await tx.turno.findUniqueOrThrow({ where: { id: turnoId }, select: { cerradoEn: true, observaciones: true } })
          if (actual.cerradoEn !== null) throw new ConflictException(MENSAJE_TURNO_CERRADO)

          const aperturas = await tx.turnoCaja.findMany({
            where: { turnoId },
            select: { id: true, cajaId: true, fondoInicial: true, caja: { select: { nombre: true } } },
            orderBy: { caja: { nombre: 'asc' } },
          })
          const declarados = emparejar(aperturas, dto.cajas)

          // Todo el arqueo se calcula y se valida antes de escribir nada.
          const arqueos: { apertura: Apertura; metodos: ArqueoDeMetodo[] }[] = []
          for (const apertura of aperturas) {
            const movimientos = await tx.movimientoCaja.findMany({ where: { turnoCajaId: apertura.id }, select: { tipo: true, monto: true } })
            // Sin filtrar por estado: la regla de qué pagos cuentan vive en esperadoDeCaja.
            const pagos = await tx.pago.findMany({
              where: { turnoCajaId: apertura.id },
              select: { metodo: true, estado: true, monto: true, propina: true },
            })
            const esperado = esperadoDeCaja({ fondoInicial: apertura.fondoInicial, movimientos, pagos })
            const declarado = declarados.get(apertura.cajaId) as CajaDelCierreDto['declarado']
            const metodos = METODOS_ARQUEO.map((metodo) => {
              const contado = new Prisma.Decimal(declarado[metodo])
              return { metodo, esperado: esperado[metodo], declarado: contado, diferencia: contado.minus(esperado[metodo]) }
            })
            exigirEnRango(apertura.caja.nombre, metodos)
            arqueos.push({ apertura, metodos })
          }

          await tx.arqueoMetodo.createMany({
            data: arqueos.flatMap(({ apertura, metodos }) => metodos.map((m) => ({ turnoCajaId: apertura.id, ...m }))),
          })
          const ahora = new Date()
          await tx.turnoCaja.updateMany({ where: { turnoId, cerradoEn: null }, data: { cerradoEn: ahora } })
          await tx.turno.update({
            where: { id: turnoId },
            data: {
              cerradoEn: ahora,
              cerradoPorUsuarioId: usuario.id,
              ...(dto.observaciones ? { observaciones: sumarObservaciones(actual.observaciones, dto.observaciones) } : {}),
            },
          })

          const leido = await tx.turno.findUniqueOrThrow({ where: { id: turnoId }, select: TURNO_SELECT })
          return { turno: turnoParaLaApi(leido), arqueos: arqueos.map(arqueoParaLaApi) }
        },
        'cerrarTurno',
      )
    } catch (err) {
      throw traducirConflictoDeCierre(err)
    }

    // Después del commit y por fuera de la transacción: leerlas adentro haría abortar el cierre por un cobro que cierra
    // una sesión al mismo tiempo, y son solo un aviso.
    return { ...cerrado, avisos: { mesasAbiertas: await this.mesasAbiertas(turno.restauranteId) } }
  }

  /** Las mesas con una sesión activa, una vez cada una (con su sesión más antigua), de la más antigua a la más nueva. */
  private async mesasAbiertas(restauranteId: string) {
    const sesiones = await this.prisma.sesionMesa.findMany({
      where: { mesa: { restauranteId }, estado: 'activa' },
      select: { mesaId: true, iniciadaEn: true, mesa: { select: { numero: true } } },
      orderBy: { iniciadaEn: 'asc' },
    })
    const porMesa = new Map<string, { mesaId: string; mesaNumero: string; iniciadaEn: Date }>()
    for (const s of sesiones) {
      if (!porMesa.has(s.mesaId)) porMesa.set(s.mesaId, { mesaId: s.mesaId, mesaNumero: s.mesa.numero, iniciadaEn: s.iniciadaEn })
    }
    return [...porMesa.values()]
  }
}

/** Lo declarado de cada apertura. 400 si falta una caja del turno, o si sobra una que no está abierta en él. */
function emparejar(aperturas: Apertura[], cajas: CajaDelCierreDto[]) {
  const declarados = new Map(cajas.map((c) => [c.cajaId, c.declarado]))
  const faltante = aperturas.find((a) => !declarados.has(a.cajaId))
  if (faltante) throw new BadRequestException(`Falta el arqueo de la caja «${faltante.caja.nombre}»`)
  if (declarados.size !== aperturas.length) throw new BadRequestException(MENSAJE_CAJA_NO_ABIERTA)
  return declarados
}

/** 400 si el esperado o la diferencia de algún método no entra en una columna Decimal(10,2). */
function exigirEnRango(cajaNombre: string, metodos: ArqueoDeMetodo[]) {
  const fuera = metodos.find((m) => m.esperado.abs().gt(MAXIMO) || m.diferencia.abs().gt(MAXIMO))
  if (fuera) {
    throw new BadRequestException(`El arqueo de ${fuera.metodo} de la caja «${cajaNombre}» supera el máximo que se puede registrar`)
  }
}

function sumarObservaciones(anteriores: string | null, delCierre: string): string {
  return anteriores ? `${anteriores}\nCierre: ${delCierre}` : `Cierre: ${delCierre}`
}

function arqueoParaLaApi({ apertura, metodos }: { apertura: Apertura; metodos: ArqueoDeMetodo[] }) {
  return {
    cajaId: apertura.cajaId,
    cajaNombre: apertura.caja.nombre,
    fondoInicial: apertura.fondoInicial.toNumber(),
    metodos: metodos.map((m) => ({
      metodo: m.metodo,
      esperado: m.esperado.toNumber(),
      declarado: m.declarado.toNumber(),
      diferencia: m.diferencia.toNumber(),
    })),
  }
}
