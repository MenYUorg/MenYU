import { Client } from 'pg'
import { comoTextoLiteral } from '../comun/cuentas'

/**
 * Los disparadores de la migración 20261020150000, contra un PostgreSQL de verdad (docs/plan-consola-root.md, sección 10).
 *
 * Los demás tests de la consola usan mocks y no pueden probar esto. Este necesita una base con las migraciones aplicadas; si no hay
 * (el CI no tiene una), se salta solo. Para correrlo:
 *
 *   TEST_DATABASE_URL=postgresql://menyu:menyu@localhost:5433/<base con las migraciones> pnpm --filter @menyu/api test historial-root.base
 *
 * Cada test corre dentro de una transacción que se revierte al final: no deja filas. Solo acepta una base local.
 */
const URL_DE_PRUEBA = process.env.TEST_DATABASE_URL

if (URL_DE_PRUEBA && !['localhost', '127.0.0.1', '::1'].includes(new URL(URL_DE_PRUEBA).hostname)) {
  throw new Error('TEST_DATABASE_URL tiene que apuntar a una base local: este test no se corre contra staging ni producción.')
}

const describeConBase = URL_DE_PRUEBA ? describe : describe.skip

const FILA = `INSERT INTO historial_root (actor_tipo, actor_id, actor_nombre, accion, entidad_tipo, entidad_id, entidad_nombre, detalle)
  VALUES ('ROOT', 'actor-1', 'ana@ejemplo.com', 'MARCA_CREAR', 'MARCA', 'prueba-m1', 'Marca de prueba', '[]')`

describeConBase('historial de ROOT y cuentas ROOT: disparadores de la base', () => {
  let db: Client

  beforeAll(async () => {
    db = new Client({ connectionString: URL_DE_PRUEBA })
    await db.connect()
  })

  afterAll(() => db.end())

  beforeEach(() => db.query('BEGIN'))
  afterEach(() => db.query('ROLLBACK'))

  /** Corre una sentencia que TIENE que fallar y devuelve el mensaje; la transacción sigue sirviendo (punto de guardado). */
  async function falla(sql: string): Promise<string> {
    await db.query('SAVEPOINT intento')
    try {
      await db.query(sql)
    } catch (e) {
      await db.query('ROLLBACK TO SAVEPOINT intento')
      return e instanceof Error ? e.message : String(e)
    }
    throw new Error(`Tendría que haber fallado y no falló: ${sql}`)
  }

  describe('historial_root', () => {
    it('acepta un registro y la hora la pone la base, aunque el cliente mande otra', async () => {
      // Act
      await db.query(
        `INSERT INTO historial_root (created_at, actor_tipo, actor_id, actor_nombre, accion, entidad_tipo, entidad_id, entidad_nombre)
         VALUES ('2000-01-01T00:00:00Z', 'ROOT', 'actor-1', 'ana@ejemplo.com', 'MARCA_CREAR', 'MARCA', 'prueba-m1', 'Marca de prueba')`,
      )

      // Assert
      // created_at es timestamptz(3): redondea a milisegundos, mientras que now() trae microsegundos.
      const { rows } = await db.query(
        `SELECT abs(extract(epoch FROM (now() - created_at))) < 0.001 AS es_la_de_la_base, detalle FROM historial_root WHERE entidad_id = 'prueba-m1'`,
      )
      expect(rows[0].es_la_de_la_base).toBe(true)
      expect(rows[0].detalle).toEqual([])
    })

    it('UPDATE falla', async () => {
      await db.query(FILA)
      expect(await falla(`UPDATE historial_root SET accion = 'MARCA_BAJA'`)).toMatch(/solo agregar.*UPDATE/)
    })

    it('DELETE falla', async () => {
      await db.query(FILA)
      expect(await falla(`DELETE FROM historial_root`)).toMatch(/solo agregar.*DELETE/)
    })

    it('TRUNCATE falla', async () => {
      await db.query(FILA)
      expect(await falla(`TRUNCATE historial_root`)).toMatch(/solo agregar.*TRUNCATE/)
    })

    it('tampoco se puede con session_replication_role = replica (el atajo que usan las limpiezas de pruebas)', async () => {
      // Arrange
      await db.query(FILA)
      await db.query(`SET LOCAL session_replication_role = replica`)

      // Act + Assert
      expect(await falla(`UPDATE historial_root SET accion = 'MARCA_BAJA'`)).toMatch(/solo agregar/)
      expect(await falla(`DELETE FROM historial_root`)).toMatch(/solo agregar/)
      expect(await falla(`TRUNCATE historial_root`)).toMatch(/solo agregar/)
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM historial_root WHERE entidad_id = 'prueba-m1'`)
      expect(rows[0].n).toBe(1)
    })

    it('borrar la cuenta del actor, la marca o el restaurante no toca el historial (no hay claves foráneas)', async () => {
      // Arrange
      await db.query(FILA)

      // Act
      const { rows: claves } = await db.query(
        `SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'historial_root'::regclass AND contype = 'f'`,
      )

      // Assert
      expect(claves[0].n).toBe(0)
    })

    it.each([
      ['un actor_tipo que no existe', `INSERT INTO historial_root (actor_tipo, actor_nombre, accion, entidad_tipo, entidad_id, entidad_nombre) VALUES ('CLIENTE', 'x', 'MARCA_CREAR', 'MARCA', 'm', 'n')`, /actor_tipo_check/],
      ['una acción de ROOT sin decir qué cuenta la hizo', `INSERT INTO historial_root (actor_tipo, actor_nombre, accion, entidad_tipo, entidad_id, entidad_nombre) VALUES ('ROOT', 'x', 'MARCA_CREAR', 'MARCA', 'm', 'n')`, /actor_id_check/],
      ['una entidad_tipo que no existe', `INSERT INTO historial_root (actor_tipo, actor_nombre, accion, entidad_tipo, entidad_id, entidad_nombre) VALUES ('SCRIPT', 'x', 'MARCA_CREAR', 'PEDIDO', 'm', 'n')`, /entidad_tipo_check/],
    ])('rechaza %s', async (_caso, sql, mensaje) => {
      expect(await falla(sql)).toMatch(mensaje)
    })

    it('el script (SCRIPT) puede registrar sin id de cuenta', async () => {
      await db.query(
        `INSERT INTO historial_root (actor_tipo, actor_nombre, accion, entidad_tipo, entidad_id, entidad_nombre)
         VALUES ('SCRIPT', 'marga', 'ROOT_CREAR', 'ROOT', 'prueba-r1', 'ana@ejemplo.com')`,
      )
      const { rows } = await db.query(`SELECT actor_id FROM historial_root WHERE entidad_id = 'prueba-r1'`)
      expect(rows[0].actor_id).toBeNull()
    })
  })

  describe('la última cuenta ROOT', () => {
    const cuenta = (id: string, rol: string) =>
      `INSERT INTO admin (id, email, password_hash, rol) VALUES ('${id}', '${id}@prueba.test', 'x', '${rol}'::rol_admin)`

    /** Deja la transacción sin ninguna cuenta ROOT (con los disparadores apagados, como las limpiezas de pruebas) y los vuelve a encender. */
    async function sinRoots() {
      await db.query(`SET LOCAL session_replication_role = replica`)
      await db.query(`DELETE FROM admin WHERE rol = 'ROOT'`)
      await db.query(`SET LOCAL session_replication_role = origin`)
    }

    it('no se puede borrar a la única cuenta ROOT', async () => {
      await sinRoots()
      await db.query(cuenta('prueba-r1', 'ROOT'))

      expect(await falla(`DELETE FROM admin WHERE id = 'prueba-r1'`)).toMatch(/última cuenta ROOT/)
    })

    it('con dos se puede borrar una, y a la que queda ya no', async () => {
      await sinRoots()
      await db.query(cuenta('prueba-r1', 'ROOT'))
      await db.query(cuenta('prueba-r2', 'ROOT'))

      await db.query(`DELETE FROM admin WHERE id = 'prueba-r1'`)

      expect(await falla(`DELETE FROM admin WHERE id = 'prueba-r2'`)).toMatch(/última cuenta ROOT/)
    })

    it('tampoco se le puede cambiar el rol a la única cuenta ROOT', async () => {
      await sinRoots()
      await db.query(cuenta('prueba-r1', 'ROOT'))

      expect(await falla(`UPDATE admin SET rol = 'GERENTE' WHERE id = 'prueba-r1'`)).toMatch(/última cuenta ROOT/)
    })

    it('cambiarle otras cosas a la única cuenta ROOT (email, contraseña) sí se puede', async () => {
      await sinRoots()
      await db.query(cuenta('prueba-r1', 'ROOT'))

      await db.query(`UPDATE admin SET email = 'otro@prueba.test', debe_cambiar_password = true WHERE id = 'prueba-r1'`)

      const { rows } = await db.query(`SELECT email, debe_cambiar_password FROM admin WHERE id = 'prueba-r1'`)
      expect(rows[0]).toEqual({ email: 'otro@prueba.test', debe_cambiar_password: true })
    })

    it('los dueños y gerentes se borran como siempre, haya o no cuentas ROOT', async () => {
      await sinRoots()
      await db.query(cuenta('prueba-o1', 'OWNER'))
      await db.query(cuenta('prueba-g1', 'GERENTE'))

      await db.query(`DELETE FROM admin WHERE id IN ('prueba-o1', 'prueba-g1')`)

      const { rows } = await db.query(`SELECT count(*)::int AS n FROM admin WHERE id IN ('prueba-o1', 'prueba-g1')`)
      expect(rows[0].n).toBe(0)
    })

    it('las limpiezas con session_replication_role = replica siguen pudiendo borrar cuentas ROOT', async () => {
      await sinRoots()
      await db.query(cuenta('prueba-r1', 'ROOT'))
      await db.query(`SET LOCAL session_replication_role = replica`)

      await db.query(`DELETE FROM admin WHERE id = 'prueba-r1'`)

      const { rows } = await db.query(`SELECT count(*)::int AS n FROM admin WHERE rol = 'ROOT'`)
      expect(rows[0].n).toBe(0)
    })
  })

  // Prisma ejecuta `equals` + `mode: 'insensitive'` como ILIKE. Con el escape de comoTextoLiteral, _ y % se comparan como texto.
  describe('comparar emails sin distinguir mayúsculas (ILIKE) con comoTextoLiteral', () => {
    const coincide = async (guardado: string, buscado: string) => {
      const { rows } = await db.query('SELECT $1::text ILIKE $2::text AS coincide', [guardado, comoTextoLiteral(buscado)])
      return rows[0].coincide as boolean
    }

    it.each([
      ['axb@ejemplo.com', 'a_b@ejemplo.com'],
      ['abc@ejemplo.com', '%@ejemplo.com'],
      ['ab@ejemplo.com', 'a%@ejemplo.com'],
    ])('el guardado %s NO coincide con el buscado %s (los comodines no valen)', async (guardado, buscado) => {
      expect(await coincide(guardado, buscado)).toBe(false)
    })

    it.each([
      ['Juan_Perez@Ejemplo.com', 'juan_perez@ejemplo.com'],
      ['100%@ejemplo.com', '100%@ejemplo.com'],
      ['a\\b@ejemplo.com', 'a\\b@ejemplo.com'],
      ['ANA@EJEMPLO.COM', 'ana@ejemplo.com'],
    ])('el guardado %s SÍ coincide con el buscado %s (mayúsculas aparte)', async (guardado, buscado) => {
      expect(await coincide(guardado, buscado)).toBe(true)
    })

    it('sin el escape, el comodín sí coincidiría (por eso hace falta)', async () => {
      const { rows } = await db.query(`SELECT 'axb@ejemplo.com'::text ILIKE 'a_b@ejemplo.com'::text AS coincide`)

      expect(rows[0].coincide).toBe(true)
    })
  })

  describe('debe_cambiar_password', () => {
    it('las cuentas existentes y las nuevas quedan en false por defecto', async () => {
      await db.query(`INSERT INTO admin (id, email, password_hash, rol) VALUES ('prueba-o9', 'prueba-o9@prueba.test', 'x', 'OWNER')`)

      const { rows } = await db.query(`SELECT debe_cambiar_password FROM admin WHERE id = 'prueba-o9'`)

      expect(rows[0].debe_cambiar_password).toBe(false)
    })
  })
})
