import { Prisma } from '@prisma/client'
import { MARCA_CON_RESTAURANTES_SELECT, MARCA_DETALLE_SELECT, MARCA_SELECT } from '../marca/marca.service'
import { MOZO_SELECT } from '../mozos/mozos.service'
import { RESTAURANTE_CON_MARCA_SELECT, RESTAURANTE_DETALLE_SELECT } from '../restaurante/restaurante.service'
import { RESTAURANTE_SELECT } from '../restaurante/restaurante.select'

// Contrato include ↔ schema. Prisma rechaza en runtime (HTTP 500) un `include` o `select` que
// nombra una relación inexistente, y con Prisma mockeado los tests de los services no lo detectan.
// Acá se validan los selects de las respuestas del personal contra el schema real (`Prisma.dmmf`).

type Args = { include?: Record<string, unknown>; select?: Record<string, unknown> }

const modelos = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]))

function esArgs(valor: unknown): valor is Args {
  return typeof valor === 'object' && valor !== null
}

function erroresDeArgs(modelo: string, args: Args, ruta: string): string[] {
  const definicion = modelos.get(modelo)
  if (!definicion) return [`${ruta}: el modelo ${modelo} no existe en el schema`]

  const campos = new Map(definicion.fields.map((f) => [f.name, f]))
  const errores: string[] = []

  for (const [nombre, valor] of Object.entries(args.include ?? {})) {
    const campo = campos.get(nombre)
    if (!campo || campo.kind !== 'object') {
      errores.push(`${ruta}.include.${nombre}: no es una relación de ${modelo}`)
    } else if (esArgs(valor)) {
      errores.push(...erroresDeArgs(campo.type, valor, `${ruta}.${nombre}`))
    }
  }

  for (const [nombre, valor] of Object.entries(args.select ?? {})) {
    const campo = campos.get(nombre)
    if (!campo) {
      errores.push(`${ruta}.select.${nombre}: no es un campo de ${modelo}`)
    } else if (campo.kind === 'object' && esArgs(valor)) {
      errores.push(...erroresDeArgs(campo.type, valor, `${ruta}.${nombre}`))
    }
  }

  return errores
}

/** Valida un objeto de primer nivel, el que se pasa como `include:` a findUnique o findMany. */
function erroresDeInclude(modelo: string, include: Record<string, unknown>): string[] {
  return erroresDeArgs(modelo, { include }, modelo)
}

/** Igual, para el que se pasa como `select:`. */
function erroresDeSelect(modelo: string, select: Record<string, unknown>): string[] {
  return erroresDeArgs(modelo, { select }, modelo)
}

/** Los tokens de Mercado Pago (`mp*`) y las contraseñas. */
const SENSIBLE = /^mp[A-Z]|^passwordHash$/

/** Las columnas sensibles de un modelo: las que trae una relación seleccionada entera. */
function sensiblesDe(modelo: string): string[] {
  return (modelos.get(modelo)?.fields ?? []).filter((f) => f.kind !== 'object' && SENSIBLE.test(f.name)).map((f) => f.name)
}

/** Las relaciones de un modelo nombradas en un `select` o un `include`, con su modelo y lo que se pide de cada una. */
function relaciones(modelo: string, args: Record<string, unknown>): Array<[string, string, unknown]> {
  const campos = new Map((modelos.get(modelo)?.fields ?? []).map((f) => [f.name, f]))
  return Object.entries(args).flatMap(([campo, valor]) => {
    const definicion = campos.get(campo)
    return definicion?.kind === 'object' ? [[campo, definicion.type, valor] as [string, string, unknown]] : []
  })
}

/**
 * Lo sensible que trae una relación: con `select`, lo que ese select trae; si no (`true`, o con `where` o `include` pero
 * sin `select`), todas las columnas del modelo relacionado, más lo que traigan las relaciones que incluye.
 */
function sensiblesDeRelacion(modelo: string, valor: unknown, ruta: string): string[] {
  if (esArgs(valor) && esArgs(valor.select)) return camposSensibles(modelo, valor.select, ruta)
  const propias = sensiblesDe(modelo).map((c) => `${ruta}${c}`)
  const incluidas = esArgs(valor) && esArgs(valor.include)
    ? relaciones(modelo, valor.include).flatMap(([campo, tipo, v]) => sensiblesDeRelacion(tipo, v, `${ruta}${campo}.`))
    : []
  return [...propias, ...incluidas]
}

/** Los campos sensibles que trae un select, en cualquier nivel: los que nombra y los de las relaciones que trae enteras. */
function camposSensibles(modelo: string, select: Record<string, unknown>, ruta = ''): string[] {
  const nombrados = Object.keys(select).filter((campo) => SENSIBLE.test(campo)).map((campo) => `${ruta}${campo}`)
  const deRelaciones = relaciones(modelo, select).flatMap(([campo, tipo, valor]) => sensiblesDeRelacion(tipo, valor, `${ruta}${campo}.`))
  return [...nombrados, ...deRelaciones]
}

describe('contrato include ↔ schema de Prisma', () => {
  describe('el validador', () => {
    it('detecta una relación inexistente (el caso de itemSucursal en Restaurante)', () => {
      const errores = erroresDeInclude('Restaurante', {
        marca: true,
        itemSucursal: { include: { item: true } },
      })

      expect(errores).toEqual(['Restaurante.include.itemSucursal: no es una relación de Restaurante'])
    })

    it('detecta una relación inexistente (el caso de items en Marca)', () => {
      const errores = erroresDeInclude('Marca', { items: { where: { disponible: true } } })

      expect(errores).toEqual(['Marca.include.items: no es una relación de Marca'])
    })

    it('detecta una relación inexistente anidada', () => {
      const errores = erroresDeInclude('Marca', { restaurantes: { include: { inexistente: true } } })

      expect(errores).toEqual([
        'Marca.restaurantes.include.inexistente: no es una relación de Restaurante',
      ])
    })

    it('un campo escalar no es válido dentro de include', () => {
      const errores = erroresDeInclude('Restaurante', { nombre: true })

      expect(errores).toEqual(['Restaurante.include.nombre: no es una relación de Restaurante'])
    })

    it('detecta un campo inexistente dentro de un select anidado', () => {
      const errores = erroresDeInclude('Marca', {
        restaurantes: { select: { id: true, inexistente: true } },
      })

      expect(errores).toEqual(['Marca.restaurantes.select.inexistente: no es un campo de Restaurante'])
    })
  })

  const SELECTS: Array<[string, string, Record<string, unknown>]> = [
    ['MARCA_SELECT', 'Marca', MARCA_SELECT],
    ['MARCA_CON_RESTAURANTES_SELECT', 'Marca', MARCA_CON_RESTAURANTES_SELECT],
    ['MARCA_DETALLE_SELECT', 'Marca', MARCA_DETALLE_SELECT],
    ['RESTAURANTE_SELECT', 'Restaurante', RESTAURANTE_SELECT],
    ['RESTAURANTE_CON_MARCA_SELECT', 'Restaurante', RESTAURANTE_CON_MARCA_SELECT],
    ['RESTAURANTE_DETALLE_SELECT', 'Restaurante', RESTAURANTE_DETALLE_SELECT],
    ['MOZO_SELECT', 'Mozo', MOZO_SELECT],
  ]

  describe('selects de las respuestas del personal', () => {
    it.each(SELECTS)('%s solo referencia relaciones y campos del schema', (_nombre, modelo, select) => {
      expect(erroresDeSelect(modelo, select)).toEqual([])
    })

    it.each(SELECTS)('%s no trae columnas de Mercado Pago ni contraseñas', (_nombre, modelo, select) => {
      expect(camposSensibles(modelo, select)).toEqual([])
    })

    it('el buscador de campos sensibles los encuentra nombrados en cualquier nivel', () => {
      const select = { id: true, mpAccessToken: true, mozos: { select: { nombre: true, passwordHash: true } } }

      expect(camposSensibles('Restaurante', select)).toEqual(['mpAccessToken', 'mozos.passwordHash'])
    })

    it('y en una relación seleccionada entera (con true o con un where sin select)', () => {
      const select = { id: true, mozos: true, marca: { select: { restaurantes: { where: { activo: true } } } } }

      expect(camposSensibles('Restaurante', select)).toEqual([
        'mozos.passwordHash',
        'marca.restaurantes.mpAccessToken',
        'marca.restaurantes.mpRefreshToken',
        'marca.restaurantes.mpUserId',
        'marca.restaurantes.mpTokenExpiresAt',
      ])
    })

    it('y en las relaciones que incluye una relación sin select', () => {
      const select = { id: true, marca: { include: { restaurantes: { include: { mozos: true } } } } }

      expect(camposSensibles('Restaurante', select)).toEqual([
        'marca.restaurantes.mpAccessToken',
        'marca.restaurantes.mpRefreshToken',
        'marca.restaurantes.mpUserId',
        'marca.restaurantes.mpTokenExpiresAt',
        'marca.restaurantes.mozos.passwordHash',
      ])
    })
  })
})
