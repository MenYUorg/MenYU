/**
 * Consola de ROOT: lo que devuelve y recibe la API `/api/root/*` (docs/plan-consola-root.md, sección 7).
 *
 * Misma forma que `apps/backend/src/root/root.types.ts`: el backend no depende de `@menyu/types` y declara sus propios tipos
 * (como `PerfilUsuario` en `AccesoService`). Si una respuesta cambia, hay que cambiar las dos.
 *
 * A propósito NO incluyen `debeCambiarPassword` (la API todavía lo manda en dueños y cuentas ROOT): con la migración a Supabase
 * Auth (docs/auth/specs/auth.md) ROOT deja de manejar contraseñas y ese campo desaparece. Ninguna pantalla se ata a él.
 */

// ── Marcas y restaurantes ────────────────────────────────────────────────────

/** Una marca en la lista. Solo identidad, estado y cantidades. */
export interface RootMarcaResumen {
  id: string
  nombre: string
  /** Identificador interno (único, incluso entre las marcas dadas de baja). */
  slug: string
  activo: boolean
  restaurantes: { activos: number; total: number }
  /** Cuántas cuentas de dueño tiene. 0 es "Sin dueño". */
  duenos: number
}

/** Un restaurante dentro de una marca. La dirección es de solo lectura para ROOT. */
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

export interface RootCrearMarcaRequest {
  nombre: string
  slug: string
}

export interface RootEditarMarcaRequest {
  nombre?: string
  slug?: string
}

export interface RootCrearRestauranteRequest {
  nombre: string
  direccion: string
}

/** ROOT solo cambia el nombre de un restaurante. */
export interface RootEditarRestauranteRequest {
  nombre: string
}

// ── Historial de acciones de ROOT ────────────────────────────────────────────

/** Las acciones que la API registra hoy. El historial es de solo agregar: las filas viejas no se reescriben. */
export type RootAccionConocida =
  | 'MARCA_CREAR'
  | 'MARCA_EDITAR'
  | 'MARCA_BAJA'
  | 'MARCA_REACTIVAR'
  | 'RESTAURANTE_CREAR'
  | 'RESTAURANTE_EDITAR'
  | 'RESTAURANTE_BAJA'
  | 'RESTAURANTE_REACTIVAR'
  | 'DUENO_CREAR'
  | 'DUENO_CAMBIAR_EMAIL'
  | 'DUENO_RESTABLECER'
  | 'DUENO_ELIMINAR'
  | 'ROOT_CREAR'
  | 'ROOT_RESTABLECER'
  | 'ROOT_ELIMINAR'

/** Una acción del historial. Admite códigos que todavía no existen: la pantalla los muestra tal cual. */
export type RootAccion = RootAccionConocida | (string & {})

export type RootEntidadTipo = 'MARCA' | 'RESTAURANTE' | 'OWNER' | 'ROOT'

/** Un renglón del detalle. `null` es "no había nada" (la pantalla muestra "—"). */
export interface RootCambio {
  campo: string
  antes: string | null
  despues: string | null
}

export interface RootHistorialItem {
  id: number
  /** Cuándo (ISO 8601, en UTC). La hora la puso la base. */
  cuando: string
  /** `ROOT`: una cuenta desde la consola. `SCRIPT`: una persona con el script de cuentas ROOT. */
  actorTipo: 'ROOT' | 'SCRIPT'
  /** Email del ROOT en ese momento; para el script, el usuario del sistema operativo de quien lo corrió. */
  actorNombre: string
  accion: RootAccion
  entidadTipo: RootEntidadTipo
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

export interface RootHistorialFiltros {
  /** El email de una cuenta ROOT, o `script`. */
  actor?: string
  entidad?: RootEntidadTipo
  /** `YYYY-MM-DD`, día completo en hora de Buenos Aires. */
  desde?: string
  hasta?: string
  cursor?: number
}

// ── Cuentas ROOT (solo lo que usa el filtro "Quién" del historial) ───────────

export interface RootCuentaResumen {
  id: string
  email: string
  /** Es la cuenta de quien pregunta. */
  esPropia: boolean
}
