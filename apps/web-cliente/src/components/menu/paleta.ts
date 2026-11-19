import { C } from '../../theme'

// Los colores del menú de la mesa (los de `ClienteMenuPage` de siempre). Salen de `theme.ts`, salvo `border`, que es un
// gris un poco más claro que el de Discovery: se conserva para que el menú se vea igual.
export const CM = {
  orange: C.orange,
  orangeSoft: C.orangeSoft,
  // El coral como texto sobre el rosado o sobre el gris de la página (el coral solo no llega a 4,5:1 ahí).
  orangeText: C.orangeText,
  navy: C.navy,
  text: C.text,
  textSub: C.textSub,
  textMuted: C.gray,
  border: '#ECECEE',
  bg: C.bg,
} as const
