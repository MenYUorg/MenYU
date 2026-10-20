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

// ── Marcas y restaurantes (etapa 1b) ─────────────────────────────────────────

/** Una marca en la lista. Solo identidad, estado y cantidades: nada del menú, las mesas, los mozos ni los logos. */
export interface RootMarcaResumen {
  id: string
  nombre: string
  /** Identificador interno (único, incluso entre las dadas de baja). */
  slug: string
  activo: boolean
  restaurantes: { activos: number; total: number }
  /** Cuántas cuentas OWNER tiene. 0 es "Sin dueño". */
  duenos: number
}

/** Un restaurante dentro de una marca. La dirección es de solo lectura para ROOT: la carga una vez al crearlo y después la cambia el dueño. */
export interface RootRestaurante {
  id: string
  nombre: string
  direccion: string | null
  activo: boolean
}

/** Un dueño dentro del detalle de una marca. */
export interface RootDuenoDeMarca {
  id: string
  email: string
  debeCambiarPassword: boolean
}

/** Donde ROOT trabaja: los datos de la marca, sus restaurantes y sus dueños. */
export interface RootMarcaDetalle {
  id: string
  nombre: string
  slug: string
  activo: boolean
  restaurantes: RootRestaurante[]
  duenos: RootDuenoDeMarca[]
}

// ── Historial (etapa 1b) ─────────────────────────────────────────────────────

/** Un renglón del detalle de una acción. `null` es "no había nada" (la pantalla muestra "—"). */
export interface RootCambio {
  campo: string
  antes: string | null
  despues: string | null
}

/** Una acción del historial. */
export interface RootHistorialItem {
  id: number
  /** Cuándo (ISO 8601, en UTC). La hora la puso la base. */
  cuando: string
  /** `ROOT`: una cuenta desde la consola. `SCRIPT`: una persona con el script de cuentas ROOT. */
  actorTipo: 'ROOT' | 'SCRIPT'
  /** Email del ROOT en ese momento; para el script, el usuario del sistema operativo de quien lo corrió. */
  actorNombre: string
  accion: string
  entidadTipo: 'MARCA' | 'RESTAURANTE' | 'OWNER' | 'ROOT'
  entidadId: string
  entidadNombre: string
  marcaId: string | null
  marcaNombre: string | null
  cambios: RootCambio[]
}

export interface RootHistorialPagina {
  /** De la más nueva a la más vieja, hasta 50. */
  items: RootHistorialItem[]
  /** Se manda como `cursor` para pedir las siguientes; `null` si no hay más. */
  siguiente: number | null
}
