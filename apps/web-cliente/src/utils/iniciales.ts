/** Las primeras letras de las dos primeras palabras: "La Parrilla del Puerto" → "LP". */
export function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => Array.from(palabra)[0]?.toUpperCase() ?? '')
    .join('')
}
