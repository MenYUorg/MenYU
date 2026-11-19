import { describe, expect, it } from 'vitest'
import { clasificarDiferencia, ETIQUETA_DEL_METODO, METODOS_DE_ARQUEO, textoDeDiferencia } from './arqueo'

describe('METODOS_DE_ARQUEO', () => {
  it('van en el orden del backend, con sus etiquetas', () => {
    expect(METODOS_DE_ARQUEO).toEqual([
      { metodo: 'efectivo', etiqueta: 'Efectivo' },
      { metodo: 'debito', etiqueta: 'Débito' },
      { metodo: 'credito', etiqueta: 'Crédito' },
      { metodo: 'transferencia', etiqueta: 'Transferencia' },
    ])
  })
})

describe('ETIQUETA_DEL_METODO', () => {
  it('da la etiqueta de cada método', () => {
    expect(ETIQUETA_DEL_METODO).toEqual({ efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia' })
  })
})

describe('las diferencias', () => {
  it.each([
    [0, 'sin-diferencia', 'Sin diferencia'],
    [0.004, 'sin-diferencia', 'Sin diferencia'],
    [-0.004, 'sin-diferencia', 'Sin diferencia'],
    [50.5, 'sobra', 'Sobran $50,50'],
    [0.01, 'sobra', 'Sobran $0,01'],
    [-100, 'falta', 'Faltan $100'],
    [-0.01, 'falta', 'Faltan $0,01'],
    [-1500.5, 'falta', 'Faltan $1.500,50'],
  ])('%s es %s', (diferencia, clase, texto) => {
    expect(clasificarDiferencia(diferencia)).toBe(clase)
    expect(textoDeDiferencia(diferencia)).toBe(texto)
  })
})
