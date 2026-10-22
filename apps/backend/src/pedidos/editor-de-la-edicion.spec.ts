import { EdicionConEditor, editorDe } from './editor-de-la-edicion'

const NADIE: EdicionConEditor = { adminId: null, mozoId: null, usuarioId: null, admin: null, mozo: null, usuario: null }

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
    ['un admin del login propio (anterior a la Fase 4)', { ...NADIE, adminId: 'a-1', admin: { email: 'g@test' } }, { nombre: 'g@test', tipo: 'gerente' }],
    ['un mozo del login propio', { ...NADIE, mozoId: 'm-2', mozo: { nombre: 'Juan' } }, { nombre: 'Juan', tipo: 'mozo' }],
    ['sin nadie (la cuenta se borró)', NADIE, { nombre: 'Desconocido', tipo: 'mozo' }],
  ])('%s', (_caso, edicion, esperado) => {
    expect(editorDe(edicion)).toEqual(esperado)
  })
})
