/**
 * Cuántos platos quedan cuando un filtro cambia la lista, en el texto corto que se anuncia ("12 platos", "1 plato" o
 * "Ningún plato coincide"). Lo usan el filtro de dietas y, en la etapa 4, el buscador.
 */
export function textoDePlatos(cantidad: number): string {
  if (cantidad <= 0) return 'Ningún plato coincide'
  return cantidad === 1 ? '1 plato' : `${cantidad} platos`
}
