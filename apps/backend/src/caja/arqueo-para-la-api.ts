import { Prisma } from '@prisma/client'
import { METODOS_ARQUEO } from '../common/caja.constant'

/** Una fila del arqueo de una caja: la que calcula el cierre o la que se lee de `ArqueoMetodo`. */
export interface FilaDeArqueo {
  metodo: string
  esperado: Prisma.Decimal
  declarado: Prisma.Decimal
  diferencia: Prisma.Decimal
}

const posicion = (metodo: string) => (METODOS_ARQUEO as readonly string[]).indexOf(metodo)

/** El arqueo de una caja como lo devuelve la API: en el orden de METODOS_ARQUEO y con los montos como number. */
export function metodosDelArqueoParaLaApi(filas: FilaDeArqueo[]) {
  return [...filas]
    .sort((a, b) => posicion(a.metodo) - posicion(b.metodo))
    .map((m) => ({
      metodo: m.metodo,
      esperado: m.esperado.toNumber(),
      declarado: m.declarado.toNumber(),
      diferencia: m.diferencia.toNumber(),
    }))
}
