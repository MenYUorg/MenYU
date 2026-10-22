import type { Prisma } from '@prisma/client'

/**
 * Registro de las acciones de ROOT (docs/plan-consola-root.md, 7.2).
 *
 * Este archivo NO depende de Nest: lo usan el servicio de la consola (HistorialRootService) y el script de cuentas ROOT
 * (apps/backend/scripts/cuentas-root.ts), así los dos escriben exactamente lo mismo y con las mismas reglas.
 *
 * Reglas que se cuidan acá:
 * - El registro se escribe con el cliente de la TRANSACCIÓN del cambio (`tx`), nunca con el cliente suelto: si registrar falla,
 *   el cambio se revierte; no puede haber un cambio sin registro ni un registro de un cambio que no ocurrió.
 * - Nunca se guarda un hash de contraseña: si un texto tiene uno, se tapa (`textoRegistrable`).
 * - La tabla es de solo agregar (disparadores en la base): este archivo solo hace `create`.
 */

/** Sobre qué tipo de cosa fue la acción. Es la columna `entidad_tipo` (con un CHECK en la base). */
export type EntidadRoot = 'MARCA' | 'RESTAURANTE' | 'OWNER' | 'ROOT'

/**
 * Las acciones que se pueden registrar hoy y sobre qué tipo de entidad es cada una. `ROOT_PROMOVER` solo la hace el script (no
 * hay ruta para hacer ROOT a una cuenta que ya existe).
 *
 * Las filas anteriores a la entrega 4.4 de auth tienen además las acciones de las cuentas con contraseña (`DUENO_CREAR`,
 * `DUENO_CAMBIAR_EMAIL`, `DUENO_RESTABLECER`, `DUENO_ELIMINAR`, `ROOT_CREAR`, `ROOT_RESTABLECER` y `ROOT_ELIMINAR`): siguen en la
 * tabla y se leen igual, pero ya no se escriben.
 */
export const ENTIDAD_DE_ACCION = {
  MARCA_CREAR: 'MARCA',
  MARCA_EDITAR: 'MARCA',
  MARCA_BAJA: 'MARCA',
  MARCA_REACTIVAR: 'MARCA',
  RESTAURANTE_CREAR: 'RESTAURANTE',
  RESTAURANTE_EDITAR: 'RESTAURANTE',
  RESTAURANTE_BAJA: 'RESTAURANTE',
  RESTAURANTE_REACTIVAR: 'RESTAURANTE',
  DUENO_INVITAR: 'OWNER',
  DUENO_QUITAR: 'OWNER',
  ROOT_INVITAR: 'ROOT',
  ROOT_PROMOVER: 'ROOT',
} as const satisfies Record<string, EntidadRoot>

export type AccionRoot = keyof typeof ENTIDAD_DE_ACCION

/** Quién lo hizo: una cuenta ROOT desde la consola, o una persona del equipo con el script (se guarda su usuario del sistema). */
export type ActorHistorial = { tipo: 'ROOT'; id: string; nombre: string } | { tipo: 'SCRIPT'; nombre: string }

/** Un renglón del detalle. `null` es "no había nada" (se muestra "—"). */
export interface CambioHistorial {
  campo: string
  antes: string | null
  despues: string | null
}

export interface EntradaHistorial {
  actor: ActorHistorial
  accion: AccionRoot
  entidad: { tipo: EntidadRoot; id: string; nombre: string }
  /** La marca de contexto de un restaurante o un dueño. */
  marca?: { id: string; nombre: string } | null
  cambios: CambioHistorial[]
}

/** Lo único que necesita para escribir: el cliente de la transacción (o cualquiera que tenga `historialRoot.create`). */
export type ClienteConHistorial = Pick<Prisma.TransactionClient, 'historialRoot'>

/** Si la invitación mandó un mail o sumó a alguien que ya tenía cuenta (en Supabase o como `Usuario`). */
export function cambioDeInvitacion(invitacionEnviada: boolean): CambioHistorial {
  return { campo: 'Invitación', antes: null, despues: invitacionEnviada ? 'mail enviado' : 'ya tenía cuenta: no se le mandó mail' }
}

// Un hash de bcrypt ($2a$10$… de 60 caracteres), esté solo o dentro de un texto. Red de seguridad: ningún detalle lo lleva
// (mientras existan las tablas con `password_hash`, hasta la Fase 5 de auth).
const HASH_BCRYPT = /\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{40,}/g

export const LARGO_MAXIMO_TEXTO = 500

export const HASH_NO_SE_REGISTRA = '(no se registra)'

/**
 * Un texto tal como se guarda. Muchos vienen de la base y los eligió otra persona (el nombre que el dueño le puso a su marca, el
 * anterior en una edición): si se rechazaran, un nombre larguísimo o con forma de hash le impediría a ROOT dar de baja esa marca
 * o quitar a su dueño. Por eso un hash se tapa (nunca se guarda) y lo que pasa de 500 caracteres se recorta.
 */
export function textoRegistrable(texto: string): string {
  const sinHashes = texto.replace(HASH_BCRYPT, HASH_NO_SE_REGISTRA)
  const caracteres = Array.from(sinHashes)
  return caracteres.length > LARGO_MAXIMO_TEXTO ? `${caracteres.slice(0, LARGO_MAXIMO_TEXTO - 1).join('')}…` : sinHashes
}

const registrable = (texto: string | null): string | null => (texto === null ? null : textoRegistrable(texto))

export class RegistroInvalido extends Error {}

/** Falla (error de programación, no del usuario) si la entrada no cumple las reglas del historial. */
export function validarEntrada(entrada: EntradaHistorial): void {
  const { actor, accion, entidad, cambios } = entrada
  if (!Object.prototype.hasOwnProperty.call(ENTIDAD_DE_ACCION, accion)) throw new RegistroInvalido(`Acción desconocida: ${String(accion)}`)
  if (ENTIDAD_DE_ACCION[accion] !== entidad.tipo) {
    throw new RegistroInvalido(`La acción ${accion} es sobre ${ENTIDAD_DE_ACCION[accion]}, no sobre ${entidad.tipo}`)
  }
  if (!actor.nombre.trim()) throw new RegistroInvalido('Falta el nombre de quien hizo la acción')
  if (actor.tipo === 'ROOT' && !actor.id) throw new RegistroInvalido('Falta el id de la cuenta ROOT')
  if (!entidad.id || !entidad.nombre.trim()) throw new RegistroInvalido('Falta el id o el nombre de la entidad')
  if (!cambios.length) throw new RegistroInvalido('Una acción registrada tiene que decir qué cambió')
}

/**
 * Escribe una acción en el historial. Llamarla con el cliente de la transacción del cambio, como último paso antes de
 * confirmar: si lanza, la transacción entera se revierte.
 */
export async function registrarEnHistorial(tx: ClienteConHistorial, entrada: EntradaHistorial): Promise<void> {
  validarEntrada(entrada)
  const { actor, accion, entidad, marca, cambios } = entrada
  await tx.historialRoot.create({
    data: {
      actorTipo: actor.tipo,
      actorId: actor.tipo === 'ROOT' ? actor.id : null,
      actorNombre: textoRegistrable(actor.nombre),
      accion,
      entidadTipo: entidad.tipo,
      entidadId: entidad.id,
      entidadNombre: textoRegistrable(entidad.nombre),
      marcaId: marca?.id ?? null,
      marcaNombre: marca ? textoRegistrable(marca.nombre) : null,
      detalle: cambios.map(({ campo, antes, despues }) => ({ campo: textoRegistrable(campo), antes: registrable(antes), despues: registrable(despues) })),
    },
    select: { id: true },
  })
}
