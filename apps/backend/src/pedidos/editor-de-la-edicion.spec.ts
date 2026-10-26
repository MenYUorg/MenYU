import { EdicionConEditor, editorDe } from './editor-de-la-edicion'

const NADIE: EdicionConEditor = { mozoId: null, usuarioId: null, mozo: null, usuario: null }

describe('editorDe: quién editó un pedido', () => {
  it.each([
    [
      'un GERENTE con su cuenta (sin Mozo)',
      { ...NADIE, usuarioId: 'u-1', usuario: { nombre: 'Gabi' } },
      { nombre: 'Gabi', tipo: 'gerente' },
    ],
    [
      'un MOZO con su cuenta: se ve el nombre de su Mozo',
      { ...NADIE, usuarioId: 'u-2', usuario: { nombre: 'Ana López' }, mozoId: 'm-1', mozo: { nombre: 'Ana' } },
      { nombre: 'Ana', tipo: 'mozo' },
    ],
    ['un mozo del login anterior, sin cuenta', { ...NADIE, mozoId: 'm-2', mozo: { nombre: 'Juan' } }, { nombre: 'Juan', tipo: 'mozo' }],
    // Las ediciones de un `Admin` del login propio que nunca tuvo cuenta: la Fase 5 borró la columna sin a quién
    // apuntar, así que quedan igual que las de un mozo que ya no está.
    ['sin nadie (la cuenta se borró, o era un admin del login anterior)', NADIE, { nombre: 'Desconocido', tipo: 'mozo' }],
  ])('%s', (_caso, edicion, esperado) => {
    expect(editorDe(edicion)).toEqual(esperado)
  })
})
