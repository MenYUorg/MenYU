import type { ArqueoDeCaja, CierreDeTurno, TurnoCajaApi, TurnoDetalle } from '@menyu/types'
import type { SesionActivaItem } from '../services/api'
import {
  clasificarDiferencia,
  ETIQUETA_DEL_METODO,
  leerCierre,
  mesasAbiertasDeSesiones,
  METODOS_DE_ARQUEO,
  parsearMontoDeclarado,
  primerCampoConError,
  resultadoDesdeElCierre,
  resultadoDesdeElDetalle,
  textoDeDiferencia,
  textoDeMesaAbiertaPrevia,
  textoDeTiempoTranscurrido,
} from './cierre'

const ABIERTO = '2026-11-18T12:00:00.000Z'
const CERRADO = '2026-11-18T23:30:00.000Z'

const caja = (id: string, cajaId: string, nombre: string, fondoInicial = 0): TurnoCajaApi => ({ id, cajaId, nombre, fondoInicial, abiertoEn: ABIERTO })
const BARRA = caja('tc-barra', 'c-barra', 'Barra', 5000)
const TERRAZA = caja('tc-terraza', 'c-terraza', 'Terraza', 1000)

const todo = (efectivo: string, debito = '0', credito = '0', transferencia = '0') => ({ efectivo, debito, credito, transferencia })

describe('METODOS_DE_ARQUEO', () => {
  it('van en el orden del backend, con sus etiquetas', () => {
    expect(METODOS_DE_ARQUEO).toEqual([
      { metodo: 'efectivo', etiqueta: 'Efectivo' },
      { metodo: 'debito', etiqueta: 'Débito' },
      { metodo: 'credito', etiqueta: 'Crédito' },
      { metodo: 'transferencia', etiqueta: 'Transferencia' },
    ])
  })
})

describe('ETIQUETA_DEL_METODO', () => {
  it('da la etiqueta de cada método', () => {
    expect(ETIQUETA_DEL_METODO).toEqual({ efectivo: 'Efectivo', debito: 'Débito', credito: 'Crédito', transferencia: 'Transferencia' })
  })
})

describe('parsearMontoDeclarado', () => {
  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
  ])('%s es un error: hay que declarar todos los métodos', (_caso, texto) => {
    expect(parsearMontoDeclarado(texto)).toEqual({ ok: false, mensaje: 'Ingresá lo que contaste (0 si no hubo)' })
  })

  it.each([
    ['0', 0],
    ['0,00', 0],
    ['1500,5', 1500.5],
    ['1500.25', 1500.25],
    [' 20 ', 20],
    ['99999999,99', 99_999_999.99],
  ])('%s es válido', (texto, valor) => {
    expect(parsearMontoDeclarado(texto)).toEqual({ ok: true, valor })
  })

  it.each([
    ['negativo', '-1', 'Lo que contaste no puede ser negativo'],
    ['con 3 decimales', '1,234', 'Lo que contaste admite hasta 2 decimales'],
    ['con letras', 'mil', 'Escribí lo que contaste solo con números, con coma o punto para los decimales'],
    ['con separador de miles', '1.000,00', 'Escribí lo que contaste solo con números, con coma o punto para los decimales'],
    ['por encima del tope', '100000000', 'Lo que contaste no puede superar $99.999.999,99'],
  ])('%s es inválido, con su mensaje', (_caso, texto, mensaje) => {
    expect(parsearMontoDeclarado(texto)).toEqual({ ok: false, mensaje })
  })
})

describe('leerCierre', () => {
  it('arma una entrada por caja en el orden del turno, con el cajaId de la Caja y los 4 métodos', () => {
    const valores = { 'c-terraza': todo('300'), 'c-barra': todo('6300,5', '0', '1200', '0,5') }

    expect(leerCierre([BARRA, TERRAZA], valores, '  Faltó cambio  ')).toEqual({
      ok: true,
      body: {
        cajas: [
          { cajaId: 'c-barra', declarado: { efectivo: 6300.5, debito: 0, credito: 1200, transferencia: 0.5 } },
          { cajaId: 'c-terraza', declarado: { efectivo: 300, debito: 0, credito: 0, transferencia: 0 } },
        ],
        observaciones: 'Faltó cambio',
      },
    })
  })

  it.each([
    ['vacías', ''],
    ['en blanco', '  \n '],
  ])('con las observaciones %s no las manda', (_caso, observaciones) => {
    const leido = leerCierre([BARRA], { 'c-barra': todo('0') }, observaciones)

    expect(leido).toEqual({ ok: true, body: { cajas: [{ cajaId: 'c-barra', declarado: { efectivo: 0, debito: 0, credito: 0, transferencia: 0 } }] } })
    expect(leido.ok && 'observaciones' in leido.body).toBe(false)
  })

  it('con algún método sin completar o mal escrito devuelve el error de cada uno, por caja y método', () => {
    const valores = { 'c-barra': { efectivo: '100', debito: '', credito: '-5', transferencia: '0' } }

    expect(leerCierre([BARRA, TERRAZA], valores, '')).toEqual({
      ok: false,
      errores: {
        'c-barra': {
          debito: 'Ingresá lo que contaste (0 si no hubo)',
          credito: 'Lo que contaste no puede ser negativo',
        },
        'c-terraza': {
          efectivo: 'Ingresá lo que contaste (0 si no hubo)',
          debito: 'Ingresá lo que contaste (0 si no hubo)',
          credito: 'Ingresá lo que contaste (0 si no hubo)',
          transferencia: 'Ingresá lo que contaste (0 si no hubo)',
        },
      },
    })
  })
})

describe('primerCampoConError', () => {
  it('es el primero en el orden del formulario: las cajas del turno y, en cada una, los métodos', () => {
    const errores = { 'c-terraza': { efectivo: 'x' }, 'c-barra': { transferencia: 'x', credito: 'x' } }

    expect(primerCampoConError([BARRA, TERRAZA], errores)).toEqual({ cajaId: 'c-barra', metodo: 'credito' })
    expect(primerCampoConError([TERRAZA, BARRA], errores)).toEqual({ cajaId: 'c-terraza', metodo: 'efectivo' })
  })

  it('sin errores no hay ninguno', () => {
    expect(primerCampoConError([BARRA], {})).toBeNull()
    expect(primerCampoConError([BARRA], { 'c-barra': {} })).toBeNull()
  })
})

describe('las diferencias', () => {
  it.each([
    [0, 'sin-diferencia', 'Sin diferencia'],
    [0.004, 'sin-diferencia', 'Sin diferencia'],
    [-0.004, 'sin-diferencia', 'Sin diferencia'],
    [50.5, 'sobra', 'Sobran $50,50'],
    [0.01, 'sobra', 'Sobran $0,01'],
    [-100, 'falta', 'Faltan $100'],
    [-0.01, 'falta', 'Faltan $0,01'],
    [-1500.5, 'falta', 'Faltan $1.500,50'],
  ])('%s es %s: "%s"', (diferencia, clase, texto) => {
    expect(clasificarDiferencia(diferencia)).toBe(clase)
    expect(textoDeDiferencia(diferencia)).toBe(texto)
  })
})

describe('las mesas abiertas antes de cerrar', () => {
  const sesion = (mesaId: string, mesaNumero: string, tiempoTranscurrido: number, quierePagar = false): SesionActivaItem => ({
    id: `s-${mesaId}-${tiempoTranscurrido}`, mesaId, mesaNumero, tiempoTranscurrido, cantidadItems: 0, cantidadPersonas: 1,
    totalAcumulado: 0, quierePagar,
  })

  it('una vez por mesa, con los minutos de la más antigua y pidió pagar si alguna pidió, en orden natural', () => {
    const sesiones = [
      sesion('m10', '10', 30),
      sesion('m2', '2', 5, true),
      sesion('m10', '10', 45),
      sesion('m2', '2', 3),
      sesion('m7', '7', 12),
      sesion('m7', '7', 2, true),
    ]

    expect(mesasAbiertasDeSesiones(sesiones)).toEqual([
      { mesaId: 'm2', mesaNumero: '2', minutos: 5, quierePagar: true },
      { mesaId: 'm7', mesaNumero: '7', minutos: 12, quierePagar: true },
      { mesaId: 'm10', mesaNumero: '10', minutos: 45, quierePagar: false },
    ])
  })

  it('sin sesiones no hay mesas', () => {
    expect(mesasAbiertasDeSesiones([])).toEqual([])
  })

  it.each([
    [0, 'menos de 1 min'],
    [0.9, 'menos de 1 min'],
    [-3, 'menos de 1 min'],
    [Number.NaN, 'menos de 1 min'],
    [Number.POSITIVE_INFINITY, 'menos de 1 min'],
    [1, '1 min'],
    [12.7, '12 min'],
    [59, '59 min'],
    [60, '1 h'],
    [61, '1 h 1 min'],
    [125, '2 h 5 min'],
    [180, '3 h'],
  ])('%s minutos es "%s"', (minutos, texto) => {
    expect(textoDeTiempoTranscurrido(minutos)).toBe(texto)
  })

  it('cada mesa dice desde hace cuánto y si pidió pagar', () => {
    expect(textoDeMesaAbiertaPrevia({ mesaId: 'm7', mesaNumero: '7', minutos: 12, quierePagar: false })).toBe('Mesa 7 (hace 12 min)')
    expect(textoDeMesaAbiertaPrevia({ mesaId: 'm7', mesaNumero: '7', minutos: 12, quierePagar: true })).toBe('Mesa 7 (hace 12 min, pidió pagar)')
  })
})

describe('el resultado del cierre', () => {
  const metodos = (efectivo: [number, number]) => [
    { metodo: 'efectivo' as const, esperado: efectivo[0], declarado: efectivo[1], diferencia: efectivo[1] - efectivo[0] },
    { metodo: 'debito' as const, esperado: 0, declarado: 0, diferencia: 0 },
    { metodo: 'credito' as const, esperado: 0, declarado: 0, diferencia: 0 },
    { metodo: 'transferencia' as const, esperado: 0, declarado: 0, diferencia: 0 },
  ]
  const ARQUEOS: ArqueoDeCaja[] = [
    { cajaId: 'c-barra', cajaNombre: 'Barra', fondoInicial: 5000, metodos: metodos([6350, 6300]) },
    { cajaId: 'c-terraza', cajaNombre: 'Terraza', fondoInicial: 1000, metodos: metodos([-200, 0]) },
  ]
  const MESAS = [{ mesaId: 'm1', mesaNumero: '1', iniciadaEn: '2026-11-18T22:00:00.000Z' }]

  const RESPUESTA: CierreDeTurno = {
    turno: {
      id: 'turno-1', restauranteId: 'rest-1', abiertoEn: ABIERTO, abiertoPor: { id: 'u-1', nombre: 'Julia' }, cerradoEn: CERRADO,
      observaciones: null, cajas: [BARRA, TERRAZA], asignaciones: [],
    },
    arqueos: ARQUEOS,
    avisos: { mesasAbiertas: MESAS },
  }

  // El detalle del mismo turno: las cajas por nombre, como las ordena el backend.
  const DETALLE: TurnoDetalle = {
    id: 'turno-1', abiertoEn: ABIERTO, abiertoPor: { id: 'u-1', nombre: 'Julia' }, cerradoEn: CERRADO,
    cerradoPor: { id: 'u-1', nombre: 'Julia' }, observaciones: null, asignaciones: [],
    cajas: [
      { id: 'tc-barra', cajaId: 'c-barra', nombre: 'Barra', fondoInicial: 5000, arqueo: metodos([6350, 6300]), movimientos: [] },
      { id: 'tc-terraza', cajaId: 'c-terraza', nombre: 'Terraza', fondoInicial: 1000, arqueo: metodos([-200, 0]), movimientos: [] },
    ],
  }

  it('desde la respuesta del cierre: el turno, cuándo se cerró, los arqueos y las mesas abiertas', () => {
    expect(resultadoDesdeElCierre(RESPUESTA)).toEqual({ turnoId: 'turno-1', cerradoEn: CERRADO, arqueos: ARQUEOS, mesasAbiertas: MESAS })
  })

  it('una respuesta con el turno abierto es un error', () => {
    expect(() => resultadoDesdeElCierre({ ...RESPUESTA, turno: { ...RESPUESTA.turno, cerradoEn: null } })).toThrow(
      'La respuesta del cierre trae el turno abierto',
    )
  })

  it('desde el detalle: lo mismo que desde el cierre, en el mismo orden, sin saber de las mesas abiertas', () => {
    expect(resultadoDesdeElDetalle(DETALLE)).toEqual({ ...resultadoDesdeElCierre(RESPUESTA), mesasAbiertas: null })
  })

  it('un detalle con el turno abierto es un error', () => {
    expect(() => resultadoDesdeElDetalle({ ...DETALLE, cerradoEn: null })).toThrow('El turno sigue abierto')
  })

  it('un detalle con una caja sin arqueo es un error', () => {
    const sinArqueo = { ...DETALLE, cajas: [DETALLE.cajas[0], { ...DETALLE.cajas[1], arqueo: null }] }

    expect(() => resultadoDesdeElDetalle(sinArqueo)).toThrow('El turno no tiene el arqueo de la caja «Terraza»')
  })
})
