import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { UpdateRestauranteDto } from './update-restaurante.dto'

// Reglas de la dirección al editar un restaurante, con el mismo tratamiento que el ValidationPipe global
// (se transforma a la clase y se valida): sin espacios sobrantes, no vacía y de hasta 200 caracteres.

async function validar<T extends object>(clase: new () => T, datos: object) {
  const instancia = plainToInstance(clase, datos)
  const errores = await validate(instancia, { whitelist: true })
  return { instancia, camposConError: errores.map((e) => e.property) }
}

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
