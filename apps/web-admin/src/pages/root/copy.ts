/**
 * Textos de la consola de ROOT que dependen de lo que de verdad hace el sistema.
 */

/**
 * ¿Dar de baja una marca o un restaurante YA corta el ingreso, las mesas y la carta? Hoy NO: solo los saca de Discovery (el
 * resto es la etapa 3 del plan, "baja efectiva", que va en `AccesoService` de la migración a Supabase). Mientras sea `false`
 * los textos no prometen lo que todavía no pasa; al activarla, se muestran los del diseño aprobado. Un test cuida que los dos
 * juegos de textos existan.
 */
export const BAJA_CORTA_EL_ACCESO = false

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
  ROOT_CREAR: 'Creó la cuenta ROOT',
  ROOT_RESTABLECER: 'Restableció la contraseña de ROOT',
  ROOT_ELIMINAR: 'Eliminó la cuenta ROOT',
}

/**
 * Qué hizo, en palabras. El historial es de solo agregar y la lista de acciones va a crecer (con la autenticación nueva habrá
 * invitaciones): un código que no está acá se muestra TAL CUAL, nunca rompe la pantalla ni se esconde.
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

/** Lo que pasa al dar de baja una marca, en viñetas (el primer fragmento de cada una va en negrita). */
export function efectosDeBajaDeMarca(restaurantesActivos: number, cortaElAcceso = BAJA_CORTA_EL_ACCESO): Array<[string, string]> {
  const n = restaurantesActivos
  if (cortaElAcceso) {
    return [
      [
        `${n} ${n === 1 ? 'restaurante deja' : 'restaurantes dejan'} de estar disponible${n === 1 ? '' : 's'}`,
        ': no aparecen en Discovery, no se ve su carta y los QR de sus mesas no abren sesiones.',
      ],
      ['Sus dueños, gerentes, mozos y cocina no pueden iniciar sesión', ' mientras esté de baja.'],
      ['No se borra ningún dato', ' (menú, mesas, pedidos, pagos). Al reactivarla vuelve todo como estaba.'],
    ]
  }
  return [
    [
      `${n} ${n === 1 ? 'restaurante deja' : 'restaurantes dejan'} de aparecer en Discovery`,
      ', la pantalla de inicio de la app de los clientes.',
    ],
    [
      'Por ahora no se corta nada más',
      ': sus QR siguen abriendo mesas, la carta se puede abrir y su gente puede iniciar sesión. El corte completo llega más adelante.',
    ],
    ['No se borra ningún dato', ' (menú, mesas, pedidos, pagos). Al reactivarla vuelve a aparecer en Discovery.'],
  ]
}

export function efectosDeReactivarMarca(cortaElAcceso = BAJA_CORTA_EL_ACCESO): string[] {
  return cortaElAcceso
    ? ['Sus restaurantes activos vuelven a Discovery y sus QR vuelven a abrir mesas.', 'Sus dueños, gerentes, mozos y cocina pueden iniciar sesión de nuevo.']
    : ['Sus restaurantes activos vuelven a aparecer en Discovery.', 'No cambia nada más: el resto no se había cortado.']
}

export function efectosDeBajaDeRestaurante(cortaElAcceso = BAJA_CORTA_EL_ACCESO): Array<[string, string]> {
  if (cortaElAcceso) {
    return [
      ['Deja de estar disponible', ': no aparece en Discovery, no se ve su carta y los QR de sus mesas no abren sesiones.'],
      ['Sus gerentes, mozos y cocina no pueden iniciar sesión.', ''],
      ['No se borra ningún dato.', ' Al reactivarlo vuelve todo como estaba.'],
    ]
  }
  return [
    ['Deja de aparecer en Discovery', ', la pantalla de inicio de la app de los clientes.'],
    ['Por ahora no se corta nada más', ': sus QR siguen abriendo mesas y su gente puede iniciar sesión. El corte completo llega más adelante.'],
    ['No se borra ningún dato.', ' Al reactivarlo vuelve a aparecer en Discovery.'],
  ]
}

export function efectosDeReactivarRestaurante(cortaElAcceso = BAJA_CORTA_EL_ACCESO): string {
  return cortaElAcceso
    ? 'Vuelve a Discovery y sus QR vuelven a abrir mesas. Sus gerentes, mozos y cocina pueden iniciar sesión de nuevo.'
    : 'Vuelve a aparecer en Discovery. No cambia nada más: el resto no se había cortado.'
}

/** El aviso de arriba del detalle de una marca dada de baja. */
export function avisoDeMarcaDeBaja(cortaElAcceso = BAJA_CORTA_EL_ACCESO): Array<[string, string]> {
  return cortaElAcceso
    ? [['Esta marca está dada de baja.', ' Sus restaurantes no están disponibles y su dueño no puede iniciar sesión. No se borró ningún dato: al reactivarla vuelve todo como estaba.']]
    : [['Esta marca está dada de baja.', ' No aparece en Discovery. Por ahora el resto sigue funcionando. No se borró ningún dato: al reactivarla vuelve a aparecer.']]
}
