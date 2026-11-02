/**
 * Qué platos muestra la carta pública (`GET /menu/:restauranteId`, `MenuService.getMenuPublico`): la unión de sus tres
 * secciones — los de una categoría del restaurante, los recomendados y los que tienen precio con descuento. Un plato
 * sin categoría propia, sin recomendar y sin descuento no entra en ninguna, así que el comensal no lo puede encontrar.
 *
 * Decisión de Lauti al cerrar la rama del asistente: su contexto incluye exactamente estos platos y nada más, para que
 * no ofrezca algo que no está en la carta.
 *
 * Precondición: se aplica sobre los platos que ya pasaron `{ restauranteId, disponible: true }` en la base (las dos
 * consultas lo filtran ahí). `disponible` es el único flag de estado: `ItemMenu` no tiene `activo`.
 * Equivalente en SQL, si alguna vez conviene filtrarlo en la consulta:
 *   `OR: [{ categoria: { restauranteId } }, { recomendadoEn: { not: null } }, { precioDescuento: { not: null } }]`
 *
 * Los filtros de la carta (`buscar`, `dieta`, `evitarAlergenos`) no son visibilidad: son elecciones del comensal en
 * cada pedido, y el contexto del asistente no los aplica a propósito.
 */
export type PlatoDeLaCarta = {
  recomendadoEn:   Date | null
  precioDescuento: number | null
  categoria:       { restauranteId: string } | null
}

export function enAlgunaSeccionDeLaCarta(plato: PlatoDeLaCarta, restauranteId: string): boolean {
  // La categoría puede ser de otro restaurante (la base no lo impide): en ese caso la carta no lo lista en su sección.
  return plato.categoria?.restauranteId === restauranteId || plato.recomendadoEn !== null || plato.precioDescuento !== null
}
