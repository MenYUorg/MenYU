import { validate } from 'class-validator'
import { SinCaracterNulo, esTextoSinCaracterNulo } from './sin-caracter-nulo'

class Ejemplo {
  @SinCaracterNulo({ message: 'texto tiene caracteres no válidos' })
  texto?: unknown

  constructor(texto?: unknown) {
    this.texto = texto
  }
}

const NUL = String.fromCharCode(0)

async function mensajes(texto: unknown) {
  const errores = await validate(new Ejemplo(texto))
  return errores.flatMap((e) => Object.values(e.constraints ?? {}))
}

describe('esTextoSinCaracterNulo', () => {
  it.each(['', 'La Parrilla', 'Av. Colón 1200', 'ñandú', 'con\ttab', 'con\nsalto', 'con\u0001otro-control', '😀'])(
    'acepta %j',
    (texto) => {
      expect(esTextoSinCaracterNulo(texto)).toBe(true)
    },
  )

  it.each([NUL, `${NUL}al-principio`, `en${NUL}medio`, `al-final${NUL}`, `dos${NUL}${NUL}`, 'con\u0000escapado'])(
    'rechaza %j',
    (texto) => {
      expect(esTextoSinCaracterNulo(texto)).toBe(false)
    },
  )

  it.each([undefined, null, 0, 12, true, {}, [], ['a']])('lo que no es un texto no pasa: %j', (valor) => {
    expect(esTextoSinCaracterNulo(valor)).toBe(false)
  })
})

describe('@SinCaracterNulo', () => {
  it('un texto normal pasa la validación', async () => {
    expect(await mensajes('La Parrilla')).toEqual([])
  })

  it('con el carácter nulo da el mensaje que se le indicó', async () => {
    expect(await mensajes(`La${NUL}Parrilla`)).toEqual(['texto tiene caracteres no válidos'])
  })

  it('un valor que no es un texto también se rechaza', async () => {
    expect(await mensajes(5)).toEqual(['texto tiene caracteres no válidos'])
  })

  it('sin mensaje propio avisa con uno por defecto y no queda vacío', async () => {
    class SinMensaje {
      @SinCaracterNulo()
      campo = `a${NUL}b`
    }
    const errores = await validate(new SinMensaje())

    expect(errores).toHaveLength(1)
    expect(Object.keys(errores[0].constraints ?? {})).toEqual(['sinCaracterNulo'])
  })
})
