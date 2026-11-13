import { matchPath } from 'react-router-dom'

/**
 * El nombre de cada pantalla, para el título de la pestaña ("Carrito · Lupulus Casa Matriz"). Las rutas son las de
 * App.tsx. Las que no están (`/auth`, `/ingresar-pin` y las desconocidas) redirigen: no tienen pantalla propia.
 * Para `/menu/:itemId` el nombre es el del plato (ver `useTituloDeLaPantalla`); acá solo el de respaldo.
 */
const PANTALLAS: ReadonlyArray<{ patron: string; pantalla: string }> = [
  { patron: '/', pantalla: 'Descubrir restaurantes' },
  { patron: '/restaurante/:restauranteId', pantalla: 'Restaurante' },
  { patron: '/restaurante/:restauranteId/mesa', pantalla: 'Ingresar a una mesa' },
  { patron: '/restaurante/:restauranteId/carta', pantalla: 'Carta' },
  { patron: '/check-in', pantalla: 'Ingreso a la mesa' },
  { patron: '/elegir-nombre', pantalla: 'Tu nombre' },
  { patron: '/menu', pantalla: 'Menú' },
  { patron: '/menu/:itemId', pantalla: 'Detalle del plato' },
  { patron: '/carrito', pantalla: 'Carrito' },
  { patron: '/pedidos', pantalla: 'Mis pedidos' },
  { patron: '/pagar', pantalla: 'Pagar la cuenta' },
  { patron: '/pago/exitoso', pantalla: 'Pago exitoso' },
  { patron: '/pago/fallido', pantalla: 'Pago fallido' },
  { patron: '/pago/pendiente', pantalla: 'Pago pendiente' },
  { patron: '/etiquetar', pantalla: 'Etiquetar pedidos' },
  { patron: '/dividir/cantidad', pantalla: 'Cantidad de comensales' },
  { patron: '/dividir/mensaje', pantalla: 'Armar mensaje' },
]

/** El nombre de la pantalla de esa ruta, o `null` si la ruta no tiene una. */
export function pantallaDeRuta(pathname: string): string | null {
  const ruta = PANTALLAS.find(({ patron }) => matchPath({ path: patron, end: true }, pathname))
  return ruta?.pantalla ?? null
}

/** El título de la pestaña: "{Pantalla} · {Restaurante}", o "{Pantalla} · MenYU" si todavía no se sabe de qué restaurante es. */
export function tituloDeLaPestana(pantalla: string | null, restaurante: string | null): string {
  if (!pantalla) return 'MenYU'
  return `${pantalla} · ${restaurante ?? 'MenYU'}`
}
