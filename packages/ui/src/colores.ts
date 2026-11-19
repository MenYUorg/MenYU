/**
 * Los colores de marca que comparten las apps (decisiones 9 y 10 de `docs/a11y/plan-cliente.md`). Se cambiaron para que
 * el texto llegue a 4,5:1 (WCAG 1.4.3):
 *
 * - `CORAL` (antes `#E8563A`, 3,6:1) da 4,6:1 con texto blanco y sobre blanco. Es el de los botones, los distintivos y los precios.
 * - `CORAL_OSCURO` es el texto coral sobre el rosado `CORAL_SUAVE` (4,5:1; el coral solo da 3,8:1) y el color de los botones
 *   coral al pasar el mouse (5,4:1 con blanco).
 * - `GRIS_TEXTO` (antes `#9CA3AF`, 2,5:1) da 4,8:1 sobre blanco: es el gris de los textos chicos, como el precio tachado.
 *
 * Los bordes, las líneas y las barras no son texto: pueden quedar con el coral que quieran, pero conviene usar el mismo
 * para no tener dos corales casi iguales en una pantalla.
 */
export const CORAL = '#CC4A31'
export const CORAL_OSCURO = '#B8432C'
export const CORAL_SUAVE = '#FDE5DF'
export const GRIS_TEXTO = '#6B7280'
