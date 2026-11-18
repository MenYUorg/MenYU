import { cajaRecordada, recordarCaja } from './cajaRecordada'

const PRINCIPAL = { cajaId: 'caja-1', nombre: 'Principal' }
const BARRA = { cajaId: 'caja-2', nombre: 'Barra' }

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('la caja recordada', () => {
  it('se recuerda por restaurante y vale si sigue abierta', () => {
    recordarCaja('rest-1', 'caja-2')

    expect(localStorage.getItem('menyu-staff-caja-id:rest-1')).toBe('caja-2')
    expect(cajaRecordada('rest-1', [BARRA, PRINCIPAL])).toBe('caja-2')
    expect(cajaRecordada('rest-2', [BARRA, PRINCIPAL])).toBeNull()
  })

  it('si ya no está abierta, o no se saben las cajas, no vale', () => {
    recordarCaja('rest-1', 'caja-2')

    expect(cajaRecordada('rest-1', [PRINCIPAL])).toBeNull()
    expect(cajaRecordada('rest-1', [])).toBeNull()
    expect(cajaRecordada('rest-1', null)).toBeNull()
  })

  it('sin nada guardado, no hay recordada', () => {
    expect(cajaRecordada('rest-1', [BARRA, PRINCIPAL])).toBeNull()
  })

  it('si localStorage falla al leer o al guardar, no hay recordada y no rompe', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })

    expect(() => recordarCaja('rest-1', 'caja-2')).not.toThrow()
    expect(cajaRecordada('rest-1', [BARRA, PRINCIPAL])).toBeNull()
  })
})
