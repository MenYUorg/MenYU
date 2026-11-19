import { CORAL, CORAL_OSCURO, CORAL_SUAVE, GRIS_TEXTO } from '@menyu/ui'

/**
 * Los colores de la app del comensal. **El coral y el gris de texto salen de `@menyu/ui`** (`packages/ui/src/colores.ts`,
 * decisiones 9 y 10 de `docs/a11y/plan-cliente.md`): ninguna pantalla ni componente define el suyo ni escribe `#E8563A`
 * o `#9CA3AF` a mano (`theme.spec.ts` lo comprueba). Las clases de Tailwind usan los mismos valores desde
 * `tailwind.config.js` (`coral`, `coral-oscuro`, `navy`), y el mismo test comprueba que coincidan.
 */
export const C = {
  /** El coral de marca: botones con texto blanco, distintivos, precios y bordes (4,6:1 con blanco). */
  orange:      CORAL,
  /** El coral al pasar el mouse por un botón coral. */
  orangeHover: CORAL_OSCURO,
  /** El coral como TEXTO sobre `orangeSoft` (el coral solo da 3,8:1 ahí) o sobre el gris de la página `bg` (4,3:1). */
  orangeText: CORAL_OSCURO,
  navy:        '#2D3561',
  orangeSoft:  CORAL_SUAVE,
  bg:          '#F7F7F8',
  text:        '#1A1A2E',
  textSub:     GRIS_TEXTO,
  /** El gris de los textos chicos (precio tachado, rótulos): antes `#9CA3AF` (2,5:1), ahora el mismo que `textSub` (4,8:1). */
  gray:        GRIS_TEXTO,
  border:      '#E5E7EB',
  borderInput: '#DDDDE0',
  white:       '#FFFFFF',
  // El texto rojo de los avisos de error (antes estaba escrito suelto en cada pantalla).
  error:       '#c0392b',
} as const
