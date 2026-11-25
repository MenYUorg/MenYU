import { CONFIG_DE_COMANDAS, MAXIMO_NOMBRE_DE_COMANDA, MENSAJE_NOMBRE_REPETIDO, esConflictoQueReleer } from './config'

describe('esConflictoQueReleer (comandas)', () => {
  it('acepta el 409 de platos asignados, en singular y en plural', () => {
    expect(esConflictoQueReleer('La comanda tiene 1 plato asignado: cambialo de comanda antes de desactivarla')).toBe(true)
    expect(esConflictoQueReleer('La comanda tiene 3 platos asignados: cambialos de comanda antes de desactivarla')).toBe(true)
    expect(esConflictoQueReleer('La comanda tiene 12 platos asignados: cambialos de comanda antes de desactivarla')).toBe(true)
  })

  it('rechaza el de nombre repetido, el de operación simultánea y cualquier otro mensaje', () => {
    expect(esConflictoQueReleer(MENSAJE_NOMBRE_REPETIDO)).toBe(false)
    expect(esConflictoQueReleer('Otra operación modificó esto al mismo tiempo; probá de nuevo')).toBe(false)
    expect(esConflictoQueReleer('Comanda no encontrada')).toBe(false)
    expect(esConflictoQueReleer('')).toBe(false)
    expect(esConflictoQueReleer('La comanda tiene platos asignados')).toBe(false)
  })
})

describe('CONFIG_DE_COMANDAS', () => {
  it('usa las reglas y el largo máximo de las comandas', () => {
    expect(CONFIG_DE_COMANDAS.esConflictoQueReleer).toBe(esConflictoQueReleer)
    expect(CONFIG_DE_COMANDAS.maximoDelNombre).toBe(MAXIMO_NOMBRE_DE_COMANDA)
    expect(MAXIMO_NOMBRE_DE_COMANDA).toBe(40)
    expect(CONFIG_DE_COMANDAS.textoDeConfirmacion('«Barra»')).toBe(
      '¿Desactivar «Barra»? Ya no se va a poder asignar a platos nuevos. Podés volver a activarla.',
    )
  })
})
