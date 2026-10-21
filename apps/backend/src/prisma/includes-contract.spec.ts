import { Prisma } from '@prisma/client'
import { MARCA_CON_RESTAURANTES_SELECT, MARCA_DETALLE_SELECT } from '../marca/marca.service'
import { RESTAURANTE_CON_MARCA_SELECT, RESTAURANTE_DETALLE_SELECT } from '../restaurante/restaurante.service'

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

/** Los campos sensibles que nombra un select, en cualquier nivel: los tokens de Mercado Pago y las contraseñas. */
function camposSensibles(select: Record<string, unknown>, ruta = ''): string[] {
  return Object.entries(select).flatMap(([campo, valor]) => {
    const aca = /^mp[A-Z]|^passwordHash$/.test(campo) ? [`${ruta}${campo}`] : []
    const adentro = esArgs(valor) && esArgs(valor.select) ? camposSensibles(valor.select, `${ruta}${campo}.`) : []
    return [...aca, ...adentro]
  })
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
    ['MARCA_CON_RESTAURANTES_SELECT', 'Marca', MARCA_CON_RESTAURANTES_SELECT],
    ['MARCA_DETALLE_SELECT', 'Marca', MARCA_DETALLE_SELECT],
    ['RESTAURANTE_CON_MARCA_SELECT', 'Restaurante', RESTAURANTE_CON_MARCA_SELECT],
    ['RESTAURANTE_DETALLE_SELECT', 'Restaurante', RESTAURANTE_DETALLE_SELECT],
  ]

  describe('selects de las respuestas del personal', () => {
    it.each(SELECTS)('%s solo referencia relaciones y campos del schema', (_nombre, modelo, select) => {
      expect(erroresDeSelect(modelo, select)).toEqual([])
    })

    it.each(SELECTS)('%s no nombra columnas de Mercado Pago ni contraseñas', (_nombre, _modelo, select) => {
      expect(camposSensibles(select)).toEqual([])
    })

    it('el buscador de campos sensibles los encuentra en cualquier nivel', () => {
      const select = { id: true, mpAccessToken: true, mozos: { select: { nombre: true, passwordHash: true } } }

      expect(camposSensibles(select)).toEqual(['mpAccessToken', 'mozos.passwordHash'])
    })
  })
})
