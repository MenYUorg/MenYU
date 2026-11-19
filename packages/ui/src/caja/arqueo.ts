import type { MetodoDeArqueo } from '@menyu/types'
import { formatearMonto } from './formato'

/** Los métodos del arqueo con su etiqueta, en el orden en que los devuelve el backend (METODOS_ARQUEO). */
export const METODOS_DE_ARQUEO: readonly { metodo: MetodoDeArqueo; etiqueta: string }[] = [
  { metodo: 'efectivo', etiqueta: 'Efectivo' },
  { metodo: 'debito', etiqueta: 'Débito' },
  { metodo: 'credito', etiqueta: 'Crédito' },
  { metodo: 'transferencia', etiqueta: 'Transferencia' },
]

/** La etiqueta de cada método del arqueo, para mostrar lo que devuelve el backend. */
export const ETIQUETA_DEL_METODO = Object.fromEntries(
  METODOS_DE_ARQUEO.map((m) => [m.metodo, m.etiqueta]),
) as Record<MetodoDeArqueo, string>

export type ClaseDeDiferencia = 'sin-diferencia' | 'sobra' | 'falta'

/** Declarado menos esperado, comparado en centavos: positivo sobra, negativo falta. */
export function clasificarDiferencia(diferencia: number): ClaseDeDiferencia {
  const centavos = Math.round(diferencia * 100)
  if (centavos === 0) return 'sin-diferencia'
  return centavos > 0 ? 'sobra' : 'falta'
}

/** La diferencia con palabras, no solo con color: "Sin diferencia", "Sobran $X" o "Faltan $X" (X sin signo). */
export function textoDeDiferencia(diferencia: number): string {
  const clase = clasificarDiferencia(diferencia)
  if (clase === 'sin-diferencia') return 'Sin diferencia'
  const monto = formatearMonto(Math.abs(Math.round(diferencia * 100)) / 100)
  return clase === 'sobra' ? `Sobran ${monto}` : `Faltan ${monto}`
}
