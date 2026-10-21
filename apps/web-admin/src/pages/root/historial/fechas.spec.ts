import { diaLargo, partesEnBuenosAires } from './fechas'

describe('partesEnBuenosAires', () => {
  it('pasa de UTC a hora de Buenos Aires (UTC-3)', () => {
    expect(partesEnBuenosAires('2026-10-15T15:30:00.000Z')).toEqual({ dia: '2026-10-15', hora: '12:30' })
  })

  it('una acción de madrugada en UTC todavía es del día anterior en Buenos Aires', () => {
    expect(partesEnBuenosAires('2026-10-16T02:30:00.000Z')).toEqual({ dia: '2026-10-15', hora: '23:30' })
  })

  it('el límite del día: 02:59 UTC es 23:59 del día anterior y 03:00 UTC ya es 00:00 del siguiente', () => {
    expect(partesEnBuenosAires('2026-10-16T02:59:59.000Z')).toEqual({ dia: '2026-10-15', hora: '23:59' })
    expect(partesEnBuenosAires('2026-10-16T03:00:00.000Z')).toEqual({ dia: '2026-10-16', hora: '00:00' })
  })

  it('no depende de la zona de la computadora: el cambio de año también se ve en Buenos Aires', () => {
    expect(partesEnBuenosAires('2027-01-01T01:00:00.000Z')).toEqual({ dia: '2026-12-31', hora: '22:00' })
  })

  it('una fecha inválida no rompe la pantalla', () => {
    expect(partesEnBuenosAires('no es una fecha')).toEqual({ dia: '', hora: '' })
  })
})

describe('diaLargo', () => {
  it('escribe el día con el mes en palabras y sin cero adelante', () => {
    expect(diaLargo('2026-10-16')).toBe('16 de octubre de 2026')
    expect(diaLargo('2026-01-05')).toBe('5 de enero de 2026')
    expect(diaLargo('2026-12-31')).toBe('31 de diciembre de 2026')
  })

  it('con algo que no es un día, lo devuelve tal cual', () => {
    expect(diaLargo('')).toBe('')
    expect(diaLargo('hoy')).toBe('hoy')
    expect(diaLargo('2026-13-01')).toBe('2026-13-01')
  })
})
