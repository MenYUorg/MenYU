// Las mismas reglas que valida la API (apps/backend/src/root/marcas/dto/marca-root.dto.ts): se avisa antes de mandar.
export const MAX_NOMBRE = 120
export const MAX_SLUG = 80
const FORMA_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function errorDeNombre(nombre: string): string {
  if (!nombre.trim()) return 'Escribí el nombre.'
  if (nombre.trim().length > MAX_NOMBRE) return `Tiene que tener hasta ${MAX_NOMBRE} caracteres.`
  return ''
}

export function errorDeSlug(slug: string): string {
  const s = slug.trim().toLowerCase()
  if (!s) return 'Escribí el identificador.'
  if (s.length > MAX_SLUG) return `Tiene que tener hasta ${MAX_SLUG} caracteres.`
  if (!FORMA_SLUG.test(s)) return 'Usá minúsculas, números y guiones sueltos (por ejemplo la-parrilla-de-juan).'
  return ''
}
