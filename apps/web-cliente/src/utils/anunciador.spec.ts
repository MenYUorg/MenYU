import { anunciar, useAnunciadorStore } from './anunciador'

beforeEach(() => {
  useAnunciadorStore.setState({ mensaje: '', numero: 0 })
})

describe('anunciar', () => {
  it('deja el mensaje y cuenta cada anuncio', () => {
    anunciar('Cheddar: 1')
    anunciar('Cheddar: 2')

    expect(useAnunciadorStore.getState()).toMatchObject({ mensaje: 'Cheddar: 2', numero: 2 })
  })

  it('cuenta también un mensaje igual al anterior: es lo que lo hace volver a leerse', () => {
    anunciar('Cheddar: 1')
    anunciar('Cheddar: 1')

    expect(useAnunciadorStore.getState().numero).toBe(2)
  })

  it('recorta los espacios del mensaje', () => {
    anunciar('  Avisamos al mozo  ')

    expect(useAnunciadorStore.getState().mensaje).toBe('Avisamos al mozo')
  })

  it('un mensaje vacío o en blanco no hace nada', () => {
    anunciar('Cheddar: 1')

    anunciar('')
    anunciar('   ')

    expect(useAnunciadorStore.getState()).toMatchObject({ mensaje: 'Cheddar: 1', numero: 1 })
  })

  it('limpiar vacía el mensaje y deja el conteo', () => {
    anunciar('Cheddar: 1')

    useAnunciadorStore.getState().limpiar()

    expect(useAnunciadorStore.getState()).toMatchObject({ mensaje: '', numero: 1 })
  })
})
