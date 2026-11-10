import { Prisma } from '@prisma/client'
import { METODOS_ARQUEO, TIPOS_MOVIMIENTO_CAJA } from '../common/caja.constant'
import { METODOS_PAGO_STAFF } from '../sessions/dto/registrar-cobro.dto'

// Contrato del schema de la caja (#355) contra el schema real (`Prisma.dmmf`): nombres de tablas y columnas, tipos de
// la plata y de las fechas, los únicos y que todas las FKs sean Restrict explícito. Lo que vive solo en la migración
// (los índices parciales y los CHECK) no está en el DMMF: lo comprueba src/caja/caja-schema.e2e-spec.ts contra Postgres.

type Modelo = (typeof Prisma.dmmf.datamodel.models)[number]
type Campo = Modelo['fields'][number]

const modelos = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]))

function modelo(nombre: string): Modelo {
  const m = modelos.get(nombre)
  if (!m) throw new Error(`El modelo ${nombre} no existe en el schema`)
  return m
}

function campo(nombreModelo: string, nombreCampo: string): Campo {
  const c = modelo(nombreModelo).fields.find((f) => f.name === nombreCampo)
  if (!c) throw new Error(`${nombreModelo}.${nombreCampo} no existe en el schema`)
  return c
}

const columna = (c: Campo) => c.dbName ?? c.name

// Las columnas de cada modelo, campo → columna. La lista es exacta: una columna nueva también hace fallar el test.
const TABLAS: Record<string, { tabla: string; columnas: Record<string, string> }> = {
  Caja: {
    tabla: 'caja',
    columnas: { id: 'id', restauranteId: 'restaurante_id', nombre: 'nombre', activa: 'activa', createdAt: 'created_at' },
  },
  Turno: {
    tabla: 'turno',
    columnas: {
      id: 'id',
      restauranteId: 'restaurante_id',
      abiertoEn: 'abierto_en',
      abiertoPorUsuarioId: 'abierto_por_usuario_id',
      cerradoEn: 'cerrado_en',
      cerradoPorUsuarioId: 'cerrado_por_usuario_id',
      observaciones: 'observaciones',
    },
  },
  TurnoCaja: {
    tabla: 'turno_caja',
    columnas: {
      id: 'id',
      turnoId: 'turno_id',
      cajaId: 'caja_id',
      fondoInicial: 'fondo_inicial',
      abiertoEn: 'abierto_en',
      cerradoEn: 'cerrado_en',
    },
  },
  MovimientoCaja: {
    tabla: 'movimiento_caja',
    columnas: {
      id: 'id',
      turnoCajaId: 'turno_caja_id',
      tipo: 'tipo',
      monto: 'monto',
      motivo: 'motivo',
      usuarioId: 'usuario_id',
      createdAt: 'created_at',
    },
  },
  ArqueoMetodo: {
    tabla: 'arqueo_metodo',
    columnas: {
      id: 'id',
      turnoCajaId: 'turno_caja_id',
      metodo: 'metodo',
      esperado: 'esperado',
      declarado: 'declarado',
      diferencia: 'diferencia',
      createdAt: 'created_at',
    },
  },
  AsignacionTurno: {
    tabla: 'asignacion_turno',
    columnas: { id: 'id', turnoId: 'turno_id', mesaId: 'mesa_id', mozoId: 'mozo_id', createdAt: 'created_at' },
  },
}

const MODELOS_DE_CAJA = Object.keys(TABLAS)

const camposDeCaja = (filtro: (c: Campo) => boolean) =>
  MODELOS_DE_CAJA.flatMap((m) => modelo(m).fields.filter(filtro).map((c) => ({ ruta: `${m}.${c.name}`, c })))

describe('Schema de la caja (#355)', () => {
  it.each(MODELOS_DE_CAJA)('%s: la tabla y las columnas', (nombre) => {
    const m = modelo(nombre)
    expect(m.dbName).toBe(TABLAS[nombre].tabla)
    const columnas = Object.fromEntries(m.fields.filter((c) => c.kind === 'scalar').map((c) => [c.name, columna(c)]))
    expect(columnas).toEqual(TABLAS[nombre].columnas)
  })

  it('la plata es Decimal(10,2)', () => {
    const decimales = camposDeCaja((c) => c.type === 'Decimal')
    expect(decimales.map((d) => d.ruta)).toEqual([
      'TurnoCaja.fondoInicial',
      'MovimientoCaja.monto',
      'ArqueoMetodo.esperado',
      'ArqueoMetodo.declarado',
      'ArqueoMetodo.diferencia',
    ])
    for (const { ruta, c } of decimales) {
      expect({ ruta, nativeType: c.nativeType }).toEqual({ ruta, nativeType: ['Decimal', ['10', '2']] })
    }
  })

  it('las fechas son Timestamptz(3)', () => {
    const fechas = camposDeCaja((c) => c.type === 'DateTime')
    expect(fechas).toHaveLength(8)
    for (const { ruta, c } of fechas) {
      expect({ ruta, nativeType: c.nativeType }).toEqual({ ruta, nativeType: ['Timestamptz', ['3']] })
    }
  })

  it('los únicos', () => {
    const unicos = Object.fromEntries(MODELOS_DE_CAJA.map((m) => [m, modelo(m).uniqueFields]))
    expect(unicos).toEqual({
      Caja: [['restauranteId', 'nombre']],
      Turno: [],
      TurnoCaja: [['turnoId', 'cajaId']],
      MovimientoCaja: [],
      ArqueoMetodo: [['turnoCajaId', 'metodo']],
      AsignacionTurno: [['turnoId', 'mesaId']],
    })
  })

  it('todas las FKs de los seis modelos y la de Pago son Restrict explícito', () => {
    const fks = [
      ...camposDeCaja((c) => c.kind === 'object' && (c.relationFromFields?.length ?? 0) > 0),
      { ruta: 'Pago.turnoCaja', c: campo('Pago', 'turnoCaja') },
    ]
    expect(fks.map((f) => f.ruta)).toEqual([
      'Caja.restaurante',
      'Turno.restaurante',
      'Turno.abiertoPor',
      'Turno.cerradoPor',
      'TurnoCaja.turno',
      'TurnoCaja.caja',
      'MovimientoCaja.turnoCaja',
      'MovimientoCaja.usuario',
      'ArqueoMetodo.turnoCaja',
      'AsignacionTurno.turno',
      'AsignacionTurno.mesa',
      'AsignacionTurno.mozo',
      'Pago.turnoCaja',
    ])
    for (const { ruta, c } of fks) expect({ ruta, onDelete: c.relationOnDelete }).toEqual({ ruta, onDelete: 'Restrict' })
  })

  it('Pago: propina Decimal(10,2) con default 0 y turnoCajaId opcional', () => {
    const propina = campo('Pago', 'propina')
    expect(propina).toMatchObject({ type: 'Decimal', isRequired: true, default: 0, nativeType: ['Decimal', ['10', '2']] })
    expect(columna(propina)).toBe('propina')

    const turnoCajaId = campo('Pago', 'turnoCajaId')
    expect(turnoCajaId).toMatchObject({ type: 'String', isRequired: false })
    expect(columna(turnoCajaId)).toBe('turno_caja_id')
  })
})

describe('Constantes de la caja', () => {
  it('TIPOS_MOVIMIENTO_CAJA', () => {
    expect(TIPOS_MOVIMIENTO_CAJA).toEqual(['INGRESO', 'EGRESO'])
  })

  it('METODOS_ARQUEO no incluye mercadopago, que no pasa por la caja', () => {
    expect(METODOS_ARQUEO).not.toContain('mercadopago')
  })

  // Si se suma un método de cobro del personal, este test falla: hay que decidir si entra al arqueo (y entonces cambia
  // también el CHECK arqueo_metodo_metodo_check de la migración) o no.
  it('METODOS_ARQUEO más mercadopago son exactamente los métodos de cobro del personal', () => {
    expect(new Set([...METODOS_ARQUEO, 'mercadopago'])).toEqual(new Set(METODOS_PAGO_STAFF))
    expect(METODOS_ARQUEO).toHaveLength(new Set(METODOS_ARQUEO).size)
  })
})
