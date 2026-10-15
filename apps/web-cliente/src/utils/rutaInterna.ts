/**
 * La ruta de esta misma app a la que volver después de iniciar sesión (el `?volver=` de `/auth`), o `null` si lo que
 * vino no es una ruta de la app: otro sitio (`https://…`, `//otro.com`), vacío o con caracteres raros. Sin esto, un
 * link armado a propósito mandaría a la persona a otro sitio justo después de poner su contraseña.
 */
export function rutaInterna(valor: string | null): string | null {
  // Tiene que empezar con una sola "/": "//otro.com" es una dirección de otro sitio sin protocolo.
  if (!valor || valor.length > 500 || !valor.startsWith('/') || valor.startsWith('//')) return null
  // La barra invertida la toman como "/" varios navegadores ("/\otro.com" sería "//otro.com"); los caracteres de control no van.
  for (const caracter of valor) {
    if (caracter === '\\' || caracter.charCodeAt(0) < 32 || caracter.charCodeAt(0) === 127) return null
  }
  return valor
}
