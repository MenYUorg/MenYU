import { cajaDelCobro, cajaRecordada, recordarCaja } from './cajaDelCobro'

const PRINCIPAL = { cajaId: 'caja-1', nombre: 'Principal' }
const BARRA = { cajaId: 'caja-2', nombre: 'Barra' }

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('cajaDelCobro', () => {
  it('sin poder leer las cajas (null): no bloquea, no hay selector ni cajaId', () => {
    expect(cajaDelCobro(null, null)).toEqual({ sinTurno: false, mostrarSelector: false, falta: false })
    expect(cajaDelCobro(null, 'caja-1')).toEqual({ sinTurno: false, mostrarSelector: false, falta: false })
  })

  it('sin turno abierto ([]): no se puede cobrar', () => {
    expect(cajaDelCobro([], null)).toEqual({ sinTurno: true, mostrarSelector: false, falta: false })
  })

  it('con una caja: sin selector ni cajaId, aunque haya una elegida', () => {
    expect(cajaDelCobro([PRINCIPAL], null)).toEqual({ sinTurno: false, mostrarSelector: false, falta: false })
    expect(cajaDelCobro([PRINCIPAL], 'caja-1')).toEqual({ sinTurno: false, mostrarSelector: false, falta: false })
  })

  it('con dos cajas y una elegida abierta: selector y su cajaId', () => {
    expect(cajaDelCobro([BARRA, PRINCIPAL], 'caja-1')).toEqual({ sinTurno: false, mostrarSelector: true, cajaId: 'caja-1', falta: false })
  })

  it('con dos cajas y ninguna elegida: falta elegir', () => {
    expect(cajaDelCobro([BARRA, PRINCIPAL], null)).toEqual({ sinTurno: false, mostrarSelector: true, falta: true })
  })

  it('con dos cajas y una elegida que ya no está abierta: falta elegir, y no se manda', () => {
    expect(cajaDelCobro([BARRA, PRINCIPAL], 'caja-cerrada')).toEqual({ sinTurno: false, mostrarSelector: true, falta: true })
  })
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
