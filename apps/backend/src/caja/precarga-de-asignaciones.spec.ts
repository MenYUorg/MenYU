import { MesaParaPrecarga, precargarAsignaciones } from './precarga-de-asignaciones'

const mozo = (id: string, { activo = true, usuarioId = `usuario-${id}` as string | null } = {}) => ({
  mozo: { id, activo, usuarioId },
})
const mesa = (id: string, mozos: MesaParaPrecarga['mozoMesas'], activo = true): MesaParaPrecarga => ({
  id,
  numero: id.replace('mesa-', ''),
  activo,
  mozoMesas: mozos,
})

describe('precargarAsignaciones', () => {
  it('sin mesas no hay asignaciones ni avisos', () => {
    expect(precargarAsignaciones([])).toEqual({ asignaciones: [], avisos: [] })
  })

  it('una mesa con un solo mozo activo y con cuenta se le asigna a ese mozo', () => {
    expect(precargarAsignaciones([mesa('mesa-1', [mozo('ana')])])).toEqual({
      asignaciones: [{ mesaId: 'mesa-1', mozoId: 'ana' }],
      avisos: [],
    })
  })

  it('una mesa sin mozos queda sin asignar y no avisa: la ven todos', () => {
    expect(precargarAsignaciones([mesa('mesa-1', [])])).toEqual({ asignaciones: [], avisos: [] })
  })

  it.each([
    ['con varios mozos', [mozo('ana'), mozo('beto')], 'varios-mozos'],
    ['con varios mozos aunque uno solo esté activo', [mozo('ana'), mozo('beto', { activo: false })], 'varios-mozos'],
    ['con su mozo dado de baja', [mozo('ana', { activo: false })], 'mozo-inactivo'],
    ['con su mozo sin cuenta', [mozo('ana', { usuarioId: null })], 'mozo-sin-cuenta'],
    ['con su mozo dado de baja y sin cuenta', [mozo('ana', { activo: false, usuarioId: null })], 'mozo-inactivo'],
  ])('una mesa %s queda sin asignar y avisa', (_caso, mozos, motivo) => {
    expect(precargarAsignaciones([mesa('mesa-7', mozos)])).toEqual({
      asignaciones: [],
      avisos: [{ mesaId: 'mesa-7', mesaNumero: '7', motivo }],
    })
  })

  it.each([
    ['con un mozo válido', [mozo('ana')]],
    ['con varios mozos', [mozo('ana'), mozo('beto')]],
    ['con su mozo sin cuenta', [mozo('ana', { usuarioId: null })]],
  ])('una mesa dada de baja %s no cuenta: ni se asigna ni avisa', (_caso, mozos) => {
    expect(precargarAsignaciones([mesa('mesa-1', mozos, false)])).toEqual({ asignaciones: [], avisos: [] })
  })

  it('varias mesas: cada una por su lado, en el orden en que llegan', () => {
    const resultado = precargarAsignaciones([
      mesa('mesa-1', [mozo('ana')]),
      mesa('mesa-2', []),
      mesa('mesa-3', [mozo('ana'), mozo('beto')]),
      mesa('mesa-4', [mozo('beto')]),
      mesa('mesa-5', [mozo('carla', { usuarioId: null })]),
      mesa('mesa-6', [mozo('dani')], false),
    ])

    expect(resultado).toEqual({
      asignaciones: [
        { mesaId: 'mesa-1', mozoId: 'ana' },
        { mesaId: 'mesa-4', mozoId: 'beto' },
      ],
      avisos: [
        { mesaId: 'mesa-3', mesaNumero: '3', motivo: 'varios-mozos' },
        { mesaId: 'mesa-5', mesaNumero: '5', motivo: 'mozo-sin-cuenta' },
      ],
    })
  })
})
