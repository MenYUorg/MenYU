import { bloquesDelTexto, lineasEnBlancoAlFinal, partesConNegrita, textoPlano } from './formatoDelTexto'

describe('bloquesDelTexto', () => {
  it('un texto sin viñetas es un solo tramo, con sus líneas y sus párrafos', () => {
    expect(bloquesDelTexto('Hola\n\nChau')).toEqual([{ tipo: 'texto', lineas: ['Hola', '', 'Chau'] }])
  })

  it('las líneas con "* " o "- " son una lista, y lo de antes y lo de después, tramos de texto', () => {
    expect(bloquesDelTexto('Te recomiendo:\n* Milanesa\n- Ensalada\n\nBuen provecho')).toEqual([
      { tipo: 'texto', lineas: ['Te recomiendo:'] },
      { tipo: 'lista', items: ['Milanesa', 'Ensalada'] },
      { tipo: 'texto', lineas: ['', 'Buen provecho'] },
    ])
  })

  it('dos listas separadas por texto son dos listas', () => {
    expect(bloquesDelTexto('* a\nentre medio\n* b')).toEqual([
      { tipo: 'lista', items: ['a'] },
      { tipo: 'texto', lineas: ['entre medio'] },
      { tipo: 'lista', items: ['b'] },
    ])
  })

  it('un guion o un asterisco pegado al texto no es una viñeta (un precio, una negrita)', () => {
    expect(bloquesDelTexto('-20% en postres\n**Oferta** del día')).toEqual([
      { tipo: 'texto', lineas: ['-20% en postres', '**Oferta** del día'] },
    ])
  })
})

describe('lineasEnBlancoAlFinal', () => {
  it('cuenta las líneas vacías del final: son el espacio entre un párrafo y lo que sigue', () => {
    expect(lineasEnBlancoAlFinal(['Te recomiendo:', ''])).toBe(1)
    expect(lineasEnBlancoAlFinal(['uno', '', ''])).toBe(2)
    expect(lineasEnBlancoAlFinal(['uno', '', 'dos'])).toBe(0)
    expect(lineasEnBlancoAlFinal(['', ''])).toBe(2)
    expect(lineasEnBlancoAlFinal([])).toBe(0)
  })
})

describe('partesConNegrita', () => {
  it('las partes de lugar impar son las que iban entre ** **', () => {
    expect(partesConNegrita('Una **milanesa** con **papas**')).toEqual(['Una ', 'milanesa', ' con ', 'papas', ''])
    expect(partesConNegrita('sin negritas')).toEqual(['sin negritas'])
  })
})

describe('textoPlano (lo que se anuncia al lector cuando la respuesta termina de llegar)', () => {
  it('saca las negritas y las viñetas, y deja cada línea como una oración', () => {
    expect(textoPlano('Te recomiendo:\n\n* **Milanesa** napolitana\n- Ensalada César\n\nBuen provecho')).toBe(
      'Te recomiendo: Milanesa napolitana. Ensalada César. Buen provecho.',
    )
  })

  it('no le agrega un punto a lo que ya termina en uno (ni en ? ! … : ;)', () => {
    expect(textoPlano('Sí, hay wifi.\n¿Algo más?\n¡Gracias!')).toBe('Sí, hay wifi. ¿Algo más? ¡Gracias!')
  })

  it('un texto vacío o de puras líneas vacías no dice nada', () => {
    expect(textoPlano('')).toBe('')
    expect(textoPlano('\n\n  \n')).toBe('')
  })
})
