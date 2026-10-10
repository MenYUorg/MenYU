import { Prisma } from '@prisma/client'
import { MARCA_DETAIL_INCLUDE } from '../marca/marca.service'
import { RESTAURANTE_DETAIL_INCLUDE } from '../restaurante/restaurante.service'

// Contrato include ↔ schema. Prisma rechaza en runtime (HTTP 500) un `include` o `select` que
// nombra una relación inexistente, y con Prisma mockeado los tests de los services no lo detectan.
// Acá se validan los includes de detalle contra el schema real (`Prisma.dmmf`).

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

  describe('includes de detalle', () => {
    it('MARCA_DETAIL_INCLUDE solo referencia relaciones y campos del schema', () => {
      expect(erroresDeInclude('Marca', MARCA_DETAIL_INCLUDE)).toEqual([])
    })

    it('RESTAURANTE_DETAIL_INCLUDE solo referencia relaciones y campos del schema', () => {
      expect(erroresDeInclude('Restaurante', RESTAURANTE_DETAIL_INCLUDE)).toEqual([])
    })
  })
})
