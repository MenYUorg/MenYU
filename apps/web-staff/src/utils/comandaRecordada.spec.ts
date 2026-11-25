import { comandaRecordada, recordarComanda } from './comandaRecordada'

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('la comanda recordada', () => {
  it('guarda y lee la comanda elegida', () => {
    recordarComanda('rest-1', 'barra')

    expect(localStorage.getItem('menyu-staff-comanda:rest-1')).toBe('barra')
    expect(comandaRecordada('rest-1')).toBe('barra')
  })

  it('es por restaurante: dos restaurantes no se pisan', () => {
    recordarComanda('rest-1', 'barra')
    recordarComanda('rest-2', 'cocina')

    expect(comandaRecordada('rest-1')).toBe('barra')
    expect(comandaRecordada('rest-2')).toBe('cocina')
    expect(comandaRecordada('rest-3')).toBeNull()
  })

  it('con null borra la preferencia', () => {
    recordarComanda('rest-1', 'barra')
    recordarComanda('rest-1', null)

    expect(localStorage.getItem('menyu-staff-comanda:rest-1')).toBeNull()
    expect(comandaRecordada('rest-1')).toBeNull()
  })

  it('sin nada guardado, no hay recordada', () => {
    expect(comandaRecordada('rest-1')).toBeNull()
  })

  it('si localStorage falla al leer, al guardar o al borrar, no hay recordada y no rompe', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })

    expect(() => recordarComanda('rest-1', 'barra')).not.toThrow()
    expect(() => recordarComanda('rest-1', null)).not.toThrow()
    expect(comandaRecordada('rest-1')).toBeNull()
  })
})
