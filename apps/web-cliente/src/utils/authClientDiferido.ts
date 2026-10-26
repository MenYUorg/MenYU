import type * as AuthClient from '@menyu/auth-client'

/**
 * `@menyu/auth-client` carga supabase-js, que pesa unos 64 kB con gzip. web-cliente lo necesita solo si la persona
 * tiene cuenta, pero su primera pantalla es Discovery, el home público, que se abre en el celular de la mesa: por eso
 * el paquete se trae con un `import()` y queda en su propio chunk, fuera de la carga inicial.
 *
 * Para que Vite lo separe de verdad, **ningún archivo de esta app puede importar `@menyu/auth-client` de forma
 * estática**: alcanza uno para que vuelva al bundle principal. Los imports de tipos no cuentan (desaparecen al
 * compilar).
 *
 * Donde la sesión es imposible —sin las variables de Supabase, o en un host fuera del dominio de la cookie— no se
 * carga nunca: `comparteLaSesionDeWebAuth` lo corta antes.
 */
export function cargarAuthClient(): Promise<typeof AuthClient> {
  return import('@menyu/auth-client')
}
