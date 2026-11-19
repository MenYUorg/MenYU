/**
 * Si el nombre de un plato coincide con lo que se escribió en el buscador del menú.
 *
 * Lo escrito se parte en palabras y cada una tiene que ser el comienzo de alguna palabra del nombre, en cualquier
 * orden: "pla 1" encuentra "Plato 1" y "napo mila" encuentra "Milanesa napolitana". Una búsqueda vacía (o solo
 * espacios) deja pasar todo.
 */
export function coincideConLaBusqueda(nombre: string, buscar: string): boolean {
  const palabrasBuscadas = buscar.toLowerCase().split(/\s+/).filter(Boolean)
  if (palabrasBuscadas.length === 0) return true
  const palabrasDelNombre = nombre.toLowerCase().split(/\s+/)
  return palabrasBuscadas.every((buscada) => palabrasDelNombre.some((palabra) => palabra.startsWith(buscada)))
}
