/** Las dos letras de una marca o un restaurante ("La Parrilla de Juan" → "LP"). */
export function siglasDe(nombre: string): string {
  const partes = nombre.split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase()
}

export function plural(n: number, singular: string, pluralizado: string): string {
  return `${n} ${n === 1 ? singular : pluralizado}`
}

/** Para buscar sin importar mayúsculas ni acentos. */
export function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** El identificador que se propone al escribir el nombre de una marca ("Café del Puerto" → "cafe-del-puerto"). */
export function slugDe(nombre: string): string {
  return sinAcentos(nombre)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
