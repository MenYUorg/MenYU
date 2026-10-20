/**
 * Lo que devuelve la API de ROOT (`/root/*`). Son las únicas formas que salen: cada consulta usa un `select` explícito y los
 * tests comparan las claves contra estas listas, así que si alguien agrega un campo (un `mp_*`, un mozo, el menú…) el test falla.
 *
 * En la etapa 2 (la consola en web-admin) estos tipos pasan a `@menyu/types`.
 */

export interface MarcaDeCuenta {
  id: string
  nombre: string
  activo: boolean
}

/** Una cuenta OWNER (en la interfaz, "dueño"). */
export interface DuenoRoot {
  id: string
  email: string
  /** Tiene una contraseña temporal puesta por ROOT: tiene que cambiarla en su primer ingreso. */
  debeCambiarPassword: boolean
  marca: MarcaDeCuenta | null
}

/** Un dueño recién creado o con la contraseña restablecida. */
export interface DuenoConPassword extends DuenoRoot {
  /** La contraseña generada, SOLO en esta respuesta. `null` si ROOT eligió la contraseña al crear la cuenta. */
  passwordTemporal: string | null
}

/** Una cuenta ROOT. */
export interface CuentaRoot {
  id: string
  email: string
  debeCambiarPassword: boolean
  /** Es la cuenta de quien pregunta. */
  esPropia: boolean
}

export interface CuentaRootConPassword extends CuentaRoot {
  /** La contraseña generada, SOLO en esta respuesta. `null` si ROOT eligió la contraseña al crear la cuenta. */
  passwordTemporal: string | null
}
