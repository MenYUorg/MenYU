import {
  asignacionesAEnviar,
  asignacionesIniciales,
  asignacionesQueNoSiguen,
  textoDeAsignacionQueNoSigue,
  textoDelAviso,
} from './asignaciones'

const mesas = [{ id: 'mesa-1' }, { id: 'mesa-2' }, { id: 'mesa-3' }]
const mozos = [{ id: 'ana' }, { id: 'beto' }]

describe('asignacionesIniciales', () => {
  it('cada mesa arranca con su mozo, y las que no tienen, sin asignar', () => {
    expect(asignacionesIniciales(mesas, mozos, [
      { mesaId: 'mesa-1', mozoId: 'ana' },
      { mesaId: 'mesa-3', mozoId: 'beto' },
    ])).toEqual({ 'mesa-1': 'ana', 'mesa-2': '', 'mesa-3': 'beto' })
  })

  it('sin asignaciones, todas sin asignar', () => {
    expect(asignacionesIniciales(mesas, mozos, [])).toEqual({ 'mesa-1': '', 'mesa-2': '', 'mesa-3': '' })
  })

  it('un mozo que no se puede asignar deja la mesa sin asignar', () => {
    expect(asignacionesIniciales(mesas, mozos, [{ mesaId: 'mesa-2', mozoId: 'dado-de-baja' }]))
      .toEqual({ 'mesa-1': '', 'mesa-2': '', 'mesa-3': '' })
  })

  it('una asignación de una mesa que no está en la lista se ignora', () => {
    expect(asignacionesIniciales([{ id: 'mesa-1' }], mozos, [{ mesaId: 'mesa-9', mozoId: 'ana' }]))
      .toEqual({ 'mesa-1': '' })
  })
})

describe('asignacionesAEnviar', () => {
  it('manda solo las mesas con mozo', () => {
    expect(asignacionesAEnviar({ 'mesa-1': 'ana', 'mesa-2': '', 'mesa-3': 'ana' })).toEqual([
      { mesaId: 'mesa-1', mozoId: 'ana' },
      { mesaId: 'mesa-3', mozoId: 'ana' },
    ])
  })

  it('sin ninguna asignada es una lista vacía', () => {
    expect(asignacionesAEnviar({ 'mesa-1': '', 'mesa-2': '' })).toEqual([])
    expect(asignacionesAEnviar({})).toEqual([])
  })
})

describe('textoDelAviso', () => {
  it.each([
    ['varios-mozos', 'Mesa 4: tiene varios mozos en su plantilla; elegí uno.'],
    ['mozo-inactivo', 'Mesa 4: su mozo está dado de baja; elegí otro.'],
    ['mozo-sin-cuenta', 'Mesa 4: su mozo todavía no tiene cuenta; elegí otro.'],
  ] as const)('%s', (motivo, texto) => {
    expect(textoDelAviso({ mesaId: 'mesa-4', mesaNumero: '4', motivo })).toBe(texto)
  })
})

describe('asignacionesQueNoSiguen', () => {
  const delTurno = (mesaId: string, mozoId: string) => ({ mesaId, mesaNumero: mesaId.slice(5), mozoId, mozoNombre: mozoId })

  it('devuelve las de una mesa que ya no está o de un mozo que ya no se puede asignar', () => {
    const asignaciones = [delTurno('mesa-1', 'ana'), delTurno('mesa-2', 'baja'), delTurno('mesa-9', 'beto')]

    expect(asignacionesQueNoSiguen(asignaciones, mesas, mozos)).toEqual([delTurno('mesa-2', 'baja'), delTurno('mesa-9', 'beto')])
  })

  it('si todas siguen, ninguna', () => {
    expect(asignacionesQueNoSiguen([delTurno('mesa-1', 'ana')], mesas, mozos)).toEqual([])
  })

  it('el aviso nombra la mesa y el mozo', () => {
    expect(textoDeAsignacionQueNoSigue({ mesaId: 'mesa-4', mesaNumero: '4', mozoId: 'x', mozoNombre: 'Carla' }))
      .toBe('Mesa 4: Carla ya no se puede asignar; queda sin asignar.')
  })
})
