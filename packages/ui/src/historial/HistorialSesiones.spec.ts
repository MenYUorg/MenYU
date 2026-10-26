import { afterEach, describe, expect, it, vi } from 'vitest'
import { calcDuracion, fmtDate, fmtTime, getPeriodBounds, isToday, PERIOD_LABELS, shortId } from './HistorialSesiones'

// Fechas en hora local: los helpers trabajan con la zona del dispositivo.
const local = (mes: number, dia: number, hora = 12, minuto = 0) => new Date(2026, mes - 1, dia, hora, minuto).toISOString()

afterEach(() => { vi.useRealTimers() })

describe('getPeriodBounds', () => {
  it('cada período va de su primer día a hoy, en días locales (ayer es solo ayer)', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 18, 9, 30) })

    expect(getPeriodBounds('hoy')).toEqual({ desde: '2026-10-18', hasta: '2026-10-18' })
    expect(getPeriodBounds('ayer')).toEqual({ desde: '2026-10-17', hasta: '2026-10-17' })
    expect(getPeriodBounds('semana')).toEqual({ desde: '2026-10-12', hasta: '2026-10-18' })
    expect(getPeriodBounds('mes')).toEqual({ desde: '2026-09-19', hasta: '2026-10-18' })
  })

  it('cruza el cambio de año y rellena mes y día con cero', () => {
    vi.useFakeTimers({ now: new Date(2027, 0, 3, 23, 59) })

    expect(getPeriodBounds('semana')).toEqual({ desde: '2026-12-28', hasta: '2027-01-03' })
  })

  it('hay una etiqueta para cada período', () => {
    expect(Object.keys(PERIOD_LABELS)).toEqual(['hoy', 'ayer', 'semana', 'mes'])
  })
})

describe('calcDuracion', () => {
  it('menos de una hora en minutos; desde una hora en horas y minutos (sin "0m")', () => {
    expect(calcDuracion(local(10, 18, 12, 0), local(10, 18, 12, 45))).toBe('45 min')
    expect(calcDuracion(local(10, 18, 12, 0), local(10, 18, 13, 0))).toBe('1h')
    expect(calcDuracion(local(10, 18, 12, 0), local(10, 18, 14, 5))).toBe('2h 5m')
  })
})

describe('formatos', () => {
  // El relleno con cero y el "a. m." dependen del ICU de cada runtime: se mira solo el contenido.
  it('hora y fecha cortas en es-AR', () => {
    expect(fmtTime(local(10, 18, 9, 5))).toMatch(/^0?9:05/)
    expect(fmtDate(local(3, 7))).toMatch(/^0?7\/0?3$/)
  })

  it('isToday compara el día local', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 18, 0, 10) })

    expect(isToday(local(10, 18, 23, 50))).toBe(true)
    expect(isToday(local(10, 17, 23, 50))).toBe(false)
  })

  it('shortId son los primeros 4 caracteres en mayúscula con #', () => {
    expect(shortId('a1b2c3d4-e5f6')).toBe('#A1B2')
  })
})
