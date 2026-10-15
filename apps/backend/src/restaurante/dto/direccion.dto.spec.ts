import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateRestauranteDto } from './create-restaurante.dto'
import { UpdateRestauranteDto } from './update-restaurante.dto'

// Reglas de la dirección de un restaurante, con el mismo tratamiento que el ValidationPipe global
// (se transforma a la clase y se valida): sin espacios sobrantes, no vacía y de hasta 200 caracteres.

const MARCA_ID = '11111111-1111-4111-a111-111111111111'

async function validar<T extends object>(clase: new () => T, datos: object) {
  const instancia = plainToInstance(clase, datos)
  const errores = await validate(instancia, { whitelist: true })
  return { instancia, camposConError: errores.map((e) => e.property) }
}

describe('dirección en CreateRestauranteDto', () => {
  const crear = (direccion?: unknown) =>
    validar(CreateRestauranteDto, { marcaId: MARCA_ID, nombre: 'Sucursal Centro', direccion })

  it('acepta una dirección válida y le saca los espacios de los costados', async () => {
    const { instancia, camposConError } = await crear('  Av. Corrientes 1234  ')

    expect(camposConError).toEqual([])
    expect(instancia.direccion).toBe('Av. Corrientes 1234')
  })

  it('es obligatoria', async () => {
    const { camposConError } = await crear(undefined)

    expect(camposConError).toEqual(['direccion'])
  })

  it.each([
    ['vacía', ''],
    ['solo espacios', '    '],
    ['null', null],
    ['un número', 1234],
    ['un objeto', { calle: 'Mitre' }],
  ])('rechaza una dirección %s', async (_caso, valor) => {
    const { camposConError } = await crear(valor)

    expect(camposConError).toEqual(['direccion'])
  })

  it('acepta hasta 200 caracteres y rechaza más', async () => {
    expect((await crear('x'.repeat(200))).camposConError).toEqual([])
    expect((await crear('x'.repeat(201))).camposConError).toEqual(['direccion'])
  })

  it('el largo se cuenta sin los espacios de los costados', async () => {
    const { camposConError } = await crear(`  ${'x'.repeat(200)}  `)

    expect(camposConError).toEqual([])
  })
})

describe('dirección en UpdateRestauranteDto', () => {
  const actualizar = (datos: object) => validar(UpdateRestauranteDto, datos)

  it('es opcional: se puede actualizar otro campo sin mandarla', async () => {
    const { instancia, camposConError } = await actualizar({ modoSesion: 'seguro' })

    expect(camposConError).toEqual([])
    expect(instancia.direccion).toBeUndefined()
  })

  it('acepta una dirección válida y le saca los espacios de los costados', async () => {
    const { instancia, camposConError } = await actualizar({ direccion: '  Av. Santa Fe 500  ' })

    expect(camposConError).toEqual([])
    expect(instancia.direccion).toBe('Av. Santa Fe 500')
  })

  it.each([
    ['vacía', ''],
    ['solo espacios', '    '],
    // null no es "no mandarla": dejaría a la sucursal sin dirección.
    ['null', null],
    ['un número', 1234],
  ])('rechaza una dirección %s', async (_caso, valor) => {
    const { camposConError } = await actualizar({ direccion: valor })

    expect(camposConError).toEqual(['direccion'])
  })

  it('acepta hasta 200 caracteres y rechaza más', async () => {
    expect((await actualizar({ direccion: 'x'.repeat(200) })).camposConError).toEqual([])
    expect((await actualizar({ direccion: 'x'.repeat(201) })).camposConError).toEqual(['direccion'])
  })
})
