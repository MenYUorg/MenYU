// El formato que usa el asistente al escribir: negritas con `**` y viñetas con "* " o "- " al principio de la línea. Nada de
// HTML. Acá solo se parte el texto (el panel lo dibuja) y se lo pasa a texto plano (el anuncio para el lector de pantalla).

/** Un tramo de la respuesta: líneas de texto corrido o una lista con viñetas (un `<ul>` de verdad, no un "• " escrito). */
export type Bloque = { tipo: 'texto'; lineas: string[] } | { tipo: 'lista'; items: string[] }

const VINETA = /^\s*[*-]\s+/
const NEGRITA = /\*\*(.+?)\*\*/g

/** Parte la respuesta en tramos de texto y listas, en el orden en que vienen. Las líneas vacías se conservan (los párrafos). */
export function bloquesDelTexto(texto: string): Bloque[] {
  const bloques: Bloque[] = []
  for (const linea of texto.split('\n')) {
    const vineta = VINETA.exec(linea)
    const ultimo = bloques[bloques.length - 1]
    if (vineta) {
      const item = linea.slice(vineta[0].length)
      if (ultimo?.tipo === 'lista') ultimo.items.push(item)
      else bloques.push({ tipo: 'lista', items: [item] })
    } else if (ultimo?.tipo === 'texto') {
      ultimo.lineas.push(linea)
    } else {
      bloques.push({ tipo: 'texto', lineas: [linea] })
    }
  }
  return bloques
}

/** Cuántas líneas en blanco hay al final de un tramo de texto (los párrafos que lo separan de lo que sigue). */
export function lineasEnBlancoAlFinal(lineas: string[]): number {
  let n = 0
  while (n < lineas.length && lineas[lineas.length - 1 - n] === '') n++
  return n
}

/** Las partes de una línea separadas por las negritas: las de lugar impar van en negrita. */
export const partesConNegrita = (texto: string): string[] => texto.split(/\*\*(.+?)\*\*/g)

/**
 * La respuesta como la leería una persona en voz alta: sin `**` ni viñetas, y cada línea como una oración (con su punto, para
 * que el lector haga la pausa). Es lo que se anuncia cuando termina de llegar.
 */
export function textoPlano(texto: string): string {
  return texto
    .split('\n')
    .map((linea) => linea.replace(VINETA, '').replace(NEGRITA, '$1').trim())
    .filter(Boolean)
    .map((linea) => (/[.!?…:;]$/.test(linea) ? linea : `${linea}.`))
    .join(' ')
}
