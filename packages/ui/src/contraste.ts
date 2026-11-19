/** La luminancia relativa de un color `#RRGGBB` (WCAG 2.x). */
function luminancia(hex: string): number {
  const limpio = hex.replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) throw new Error(`Color no válido: ${hex} (se espera #RRGGBB)`)
  const n = parseInt(limpio, 16)
  const canal = (valor: number) => {
    const c = valor / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(n >> 16) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
}

/**
 * La razón de contraste entre dos colores `#RRGGBB`, de 1 (iguales) a 21 (negro sobre blanco), en cualquier orden. WCAG
 * 1.4.3 pide 4,5 para el texto normal y 3 para el texto grande y los componentes; 1.4.11, 3 para los bordes de los controles.
 * Es para los tests: ninguna pantalla lo usa. axe no calcula el contraste en jsdom, así que los pares de colores del
 * tema se prueban con esta cuenta.
 */
export function razonDeContraste(colorA: string, colorB: string): number {
  const [mas, menos] = [luminancia(colorA), luminancia(colorB)].sort((a, b) => b - a)
  return (mas + 0.05) / (menos + 0.05)
}
