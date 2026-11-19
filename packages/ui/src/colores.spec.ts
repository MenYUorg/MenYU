import { describe, expect, it } from 'vitest'
import { CORAL, CORAL_OSCURO, CORAL_SUAVE, GRIS_TEXTO } from './colores'
import { razonDeContraste } from './contraste'

const BLANCO = '#FFFFFF'
const MINIMO_DEL_TEXTO = 4.5

describe('colores de marca: el texto llega al contraste que pide WCAG 1.4.3 (4,5:1)', () => {
  it.each([
    ['texto blanco sobre el coral (botones y distintivos)', BLANCO, CORAL],
    ['el coral como texto sobre blanco (precios)', CORAL, BLANCO],
    ['texto blanco sobre el coral oscuro (botones al pasar el mouse)', BLANCO, CORAL_OSCURO],
    ['el coral oscuro como texto sobre el rosado', CORAL_OSCURO, CORAL_SUAVE],
    ['el coral oscuro como texto sobre blanco', CORAL_OSCURO, BLANCO],
    ['el gris de los textos chicos sobre blanco', GRIS_TEXTO, BLANCO],
  ])('%s', (_que, texto, fondo) => {
    expect(razonDeContraste(texto, fondo)).toBeGreaterThanOrEqual(MINIMO_DEL_TEXTO)
  })

  it('el coral solo no alcanza sobre el rosado: por eso hay un coral oscuro para el texto sobre ese fondo', () => {
    expect(razonDeContraste(CORAL, CORAL_SUAVE)).toBeLessThan(MINIMO_DEL_TEXTO)
  })

  it('el coral oscuro es más oscuro que el coral (si no, "al pasar el mouse" no se notaría)', () => {
    expect(razonDeContraste(CORAL_OSCURO, BLANCO)).toBeGreaterThan(razonDeContraste(CORAL, BLANCO))
  })
})
