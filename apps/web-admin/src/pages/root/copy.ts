/**
 * Textos de la consola de ROOT que dependen de lo que de verdad hace el sistema.
 */

/**
 * ¿Dar de baja una marca o un restaurante corta el acceso de su gente (dueños, gerentes, mozos y cocina)? Sí, desde la Fase 4 de
 * auth: `AccesoService` no cuenta las membresías de una marca o un restaurante dados de baja, y al reactivarlos vuelven a contar.
 * Lo público también se corta (desde el 2026-10-21): la marca o el restaurante dejan de aparecer en Discovery, su carta deja de
 * verse y sus QR y PIN no abren mesas nuevas; las mesas que ya están abiertas se dejan terminar. Un test cuida que los dos juegos
 * de textos existan.
 */
export const BAJA_CORTA_EL_LOGIN = true

// ── Historial ────────────────────────────────────────────────────────────────

/** Solo claves propias: un código del historial como `constructor` no puede traer algo de `Object.prototype`. */
function tieneClave(tabla: Record<string, string>, clave: string): boolean {
  return Object.prototype.hasOwnProperty.call(tabla, clave)
}

const ACCIONES: Record<string, string> = {
  MARCA_CREAR: 'Creó la marca',
  MARCA_EDITAR: 'Editó la marca',
  MARCA_BAJA: 'Dio de baja la marca',
  MARCA_REACTIVAR: 'Reactivó la marca',
  RESTAURANTE_CREAR: 'Creó el restaurante',
  RESTAURANTE_EDITAR: 'Editó el restaurante',
  RESTAURANTE_BAJA: 'Dio de baja el restaurante',
  RESTAURANTE_REACTIVAR: 'Reactivó el restaurante',
  DUENO_CREAR: 'Creó la cuenta de dueño',
  DUENO_CAMBIAR_EMAIL: 'Cambió el email del dueño',
  DUENO_RESTABLECER: 'Restableció la contraseña del dueño',
  DUENO_ELIMINAR: 'Eliminó la cuenta de dueño',
  DUENO_INVITAR: 'Invitó al dueño',
  DUENO_QUITAR: 'Quitó al dueño',
  ROOT_CREAR: 'Creó la cuenta ROOT',
  ROOT_RESTABLECER: 'Restableció la contraseña de ROOT',
  ROOT_ELIMINAR: 'Eliminó la cuenta ROOT',
  ROOT_INVITAR: 'Invitó a la cuenta ROOT',
  ROOT_PROMOVER: 'Hizo ROOT a la cuenta',
}

/**
 * Qué hizo, en palabras. El historial es de solo agregar y la lista de acciones puede crecer: un código que no está acá se
 * muestra TAL CUAL, nunca rompe la pantalla ni se esconde.
 */
export function etiquetaDeAccion(codigo: string): string {
  return tieneClave(ACCIONES, codigo) ? ACCIONES[codigo] : codigo
}

const TIPOS: Record<string, string> = { MARCA: 'Marca', RESTAURANTE: 'Restaurante', OWNER: 'Dueño', ROOT: 'ROOT' }

export function etiquetaDeTipo(tipo: string): string {
  return tieneClave(TIPOS, tipo) ? TIPOS[tipo] : tipo
}

export const OPCIONES_DE_TIPO: Array<{ valor: string; texto: string }> = [
  { valor: '', texto: 'Todo' },
  { valor: 'MARCA', texto: 'Marcas' },
  { valor: 'RESTAURANTE', texto: 'Restaurantes' },
  { valor: 'OWNER', texto: 'Dueños' },
  { valor: 'ROOT', texto: 'Cuentas ROOT' },
]

// ── Bajas ────────────────────────────────────────────────────────────────────

/** La viñeta sobre el inicio de sesión de la gente de la marca o del restaurante, según lo que hoy hace el sistema. */
function vinetaDelLogin(cortaElLogin: boolean, quienes: string, mientras: string): [string, string] {
  return cortaElLogin
    ? [`${quienes} no pueden iniciar sesión`, ` ${mientras}.`]
    : [`${quienes} siguen pudiendo iniciar sesión`, ': el corte del acceso llega con la migración de autenticación.']
}

/** Lo que pasa al dar de baja una marca, en viñetas (el primer fragmento de cada una va en negrita). */
export function efectosDeBajaDeMarca(restaurantesActivos: number, cortaElLogin = BAJA_CORTA_EL_LOGIN): Array<[string, string]> {
  const n = restaurantesActivos
  return [
    [
      `${n} ${n === 1 ? 'restaurante deja' : 'restaurantes dejan'} de estar disponible${n === 1 ? '' : 's'}`,
      ': no aparecen en Discovery, no se ve su carta y los QR y PIN de sus mesas no abren mesas nuevas.',
    ],
    ['Las mesas que ya están abiertas se pueden terminar', ': se sigue pidiendo la cuenta y cobrando.'],
    vinetaDelLogin(cortaElLogin, 'Sus dueños, gerentes, mozos y cocina', 'mientras esté de baja'),
    ['No se borra ningún dato', ' (menú, mesas, pedidos, pagos). Al reactivarla vuelve todo como estaba.'],
  ]
}

export function efectosDeReactivarMarca(cortaElLogin = BAJA_CORTA_EL_LOGIN): string[] {
  return [
    'Sus restaurantes activos vuelven a Discovery, a mostrar su carta y a abrir mesas.',
    cortaElLogin ? 'Sus dueños, gerentes, mozos y cocina pueden iniciar sesión de nuevo.' : 'No cambia nada más: el inicio de sesión de su gente no se había cortado.',
  ]
}

export function efectosDeBajaDeRestaurante(cortaElLogin = BAJA_CORTA_EL_LOGIN): Array<[string, string]> {
  return [
    ['Deja de estar disponible', ': no aparece en Discovery, no se ve su carta y los QR y PIN de sus mesas no abren mesas nuevas.'],
    ['Las mesas que ya están abiertas se pueden terminar', ': se sigue pidiendo la cuenta y cobrando.'],
    vinetaDelLogin(cortaElLogin, 'Sus gerentes, mozos y cocina', 'mientras esté de baja'),
    ['No se borra ningún dato.', ' Al reactivarlo vuelve todo como estaba.'],
  ]
}

export function efectosDeReactivarRestaurante(cortaElLogin = BAJA_CORTA_EL_LOGIN): string {
  return cortaElLogin
    ? 'Vuelve a Discovery, a mostrar su carta y a abrir mesas. Sus gerentes, mozos y cocina pueden iniciar sesión de nuevo.'
    : 'Vuelve a Discovery, a mostrar su carta y a abrir mesas. No cambia nada más: el inicio de sesión de su gente no se había cortado.'
}

/** El aviso de arriba del detalle de una marca dada de baja. */
export function avisoDeMarcaDeBaja(cortaElLogin = BAJA_CORTA_EL_LOGIN): Array<[string, string]> {
  return [
    [
      'Esta marca está dada de baja.',
      ` Sus restaurantes no aparecen en Discovery, no muestran su carta y no abren mesas nuevas (las que ya están abiertas se terminan). ${
        cortaElLogin ? 'Su dueño no puede iniciar sesión.' : 'Su gente todavía puede iniciar sesión.'
      } No se borró ningún dato: al reactivarla vuelve todo como estaba.`,
    ],
  ]
}
