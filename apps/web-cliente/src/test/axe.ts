import { configureAxe } from 'vitest-axe'

/**
 * axe para los specs de accesibilidad: `expect(await axe(container)).toHaveNoViolations()`. El matcher lo registra
 * src/test/setup.ts.
 *
 * Sin la regla `color-contrast`: jsdom no calcula estilos de verdad, así que esa regla queda "incompleta" y tira errores
 * del canvas (`HTMLCanvasElement.getContext`). El contraste se prueba aparte, con los colores de `theme.ts`
 * (docs/a11y/plan-cliente.md, etapa 6).
 */
export const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } })
