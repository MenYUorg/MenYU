import { Client } from 'pg'

/**
 * La migración 20261021141707_fase4_autoria_usuario contra un PostgreSQL de verdad (entrega 4.2 de docs/auth/specs/auth.md):
 * la autoría en `usuario` y el disparador de la última cuenta ROOT. Necesita una base con las migraciones aplicadas; si no hay
 * (el CI no tiene una), se salta solo. Para correrlo:
 *
 *   TEST_DATABASE_URL=postgresql://menyu:menyu@localhost:5433/menyu pnpm --filter @menyu/api test usuario-migracion.base
 *
 * Cada test corre dentro de una transacción que se revierte al final: no deja filas. Solo acepta una base local.
 */
const URL_DE_PRUEBA = process.env.TEST_DATABASE_URL

if (URL_DE_PRUEBA && !['localhost', '127.0.0.1', '::1'].includes(new URL(URL_DE_PRUEBA).hostname)) {
  throw new Error('TEST_DATABASE_URL tiene que apuntar a una base local: este test no se corre contra staging ni producción.')
}

const describeConBase = URL_DE_PRUEBA ? describe : describe.skip

describeConBase('usuario: autoría y la última cuenta ROOT (disparadores de la base)', () => {
  let db: Client
  let numero = 0

  beforeAll(async () => {
    db = new Client({ connectionString: URL_DE_PRUEBA })
    await db.connect()
  })

  afterAll(() => db.end())

  beforeEach(() => db.query('BEGIN'))
  afterEach(() => db.query('ROLLBACK'))

  /** Corre una sentencia que TIENE que fallar y devuelve el mensaje; la transacción sigue sirviendo (punto de guardado). */
  async function falla(sql: string, valores: unknown[] = []): Promise<string> {
    await db.query('SAVEPOINT intento')
    try {
      await db.query(sql, valores)
    } catch (e) {
      await db.query('ROLLBACK TO SAVEPOINT intento')
      return e instanceof Error ? e.message : String(e)
    }
    throw new Error(`Tendría que haber fallado y no falló: ${sql}`)
  }

  /** Crea un `usuario` y devuelve su id. */
  async function usuario(id: string, { esRoot = false, activo = true } = {}): Promise<string> {
    numero += 1
    await db.query(
      `INSERT INTO usuario (id, supabase_user_id, email, nombre, es_root, activo)
       VALUES ($1, gen_random_uuid(), $2, 'Prueba', $3, $4)`,
      [id, `${id}-${numero}@prueba.test`, esRoot, activo],
    )
    return id
  }

  /** Deja la transacción sin ninguna cuenta ROOT (con los disparadores apagados, como las limpiezas de pruebas) y los vuelve a encender. */
  async function sinRoots() {
    await db.query(`SET LOCAL session_replication_role = replica`)
    await db.query(`DELETE FROM usuario WHERE es_root`)
    await db.query(`SET LOCAL session_replication_role = origin`)
  }

  describe('la última cuenta ROOT', () => {
    it('no se puede borrar a la única cuenta ROOT activa', async () => {
      await sinRoots()
      await usuario('prueba-r1', { esRoot: true })

      expect(await falla(`DELETE FROM usuario WHERE id = 'prueba-r1'`)).toMatch(/última cuenta ROOT/)
    })

    it('con dos se puede borrar una, y a la que queda ya no', async () => {
      await sinRoots()
      await usuario('prueba-r1', { esRoot: true })
      await usuario('prueba-r2', { esRoot: true })

      await db.query(`DELETE FROM usuario WHERE id = 'prueba-r1'`)

      expect(await falla(`DELETE FROM usuario WHERE id = 'prueba-r2'`)).toMatch(/última cuenta ROOT/)
    })

    it('a la única no se le puede sacar es_root', async () => {
      await sinRoots()
      await usuario('prueba-r1', { esRoot: true })

      expect(await falla(`UPDATE usuario SET es_root = false WHERE id = 'prueba-r1'`)).toMatch(/última cuenta ROOT/)
    })

    it('a la única no se la puede desactivar (una cuenta inactiva no entra)', async () => {
      await sinRoots()
      await usuario('prueba-r1', { esRoot: true })

      expect(await falla(`UPDATE usuario SET activo = false WHERE id = 'prueba-r1'`)).toMatch(/última cuenta ROOT/)
    })

    it('una cuenta ROOT inactiva no cuenta como otra ROOT', async () => {
      await sinRoots()
      await usuario('prueba-r1', { esRoot: true })
      await usuario('prueba-r2', { esRoot: true, activo: false })

      expect(await falla(`DELETE FROM usuario WHERE id = 'prueba-r1'`)).toMatch(/última cuenta ROOT/)
    })

    it('una cuenta ROOT inactiva se puede borrar o dejar de ser ROOT aunque no haya otra', async () => {
      await sinRoots()
      await usuario('prueba-r1', { esRoot: true, activo: false })
      await usuario('prueba-r2', { esRoot: true, activo: false })

      await db.query(`UPDATE usuario SET es_root = false WHERE id = 'prueba-r1'`)
      await db.query(`DELETE FROM usuario WHERE id = 'prueba-r2'`)

      const { rows } = await db.query(`SELECT count(*)::int AS n FROM usuario WHERE es_root`)
      expect(rows[0].n).toBe(0)
    })

    it('a la única se le pueden cambiar otras cosas (nombre, email)', async () => {
      await sinRoots()
      await usuario('prueba-r1', { esRoot: true })

      await db.query(`UPDATE usuario SET nombre = 'Otro', email = 'otro@prueba.test' WHERE id = 'prueba-r1'`)

      const { rows } = await db.query(`SELECT nombre, email, es_root, activo FROM usuario WHERE id = 'prueba-r1'`)
      expect(rows[0]).toEqual({ nombre: 'Otro', email: 'otro@prueba.test', es_root: true, activo: true })
    })

    it('las cuentas que no son ROOT se borran y se desactivan como siempre, haya o no cuentas ROOT', async () => {
      await sinRoots()
      await usuario('prueba-u1')
      await usuario('prueba-u2')

      await db.query(`UPDATE usuario SET activo = false WHERE id = 'prueba-u1'`)
      await db.query(`DELETE FROM usuario WHERE id IN ('prueba-u1', 'prueba-u2')`)

      const { rows } = await db.query(`SELECT count(*)::int AS n FROM usuario WHERE id IN ('prueba-u1', 'prueba-u2')`)
      expect(rows[0].n).toBe(0)
    })

    it('las limpiezas con session_replication_role = replica siguen pudiendo borrar cuentas ROOT', async () => {
      await sinRoots()
      await usuario('prueba-r1', { esRoot: true })
      await db.query(`SET LOCAL session_replication_role = replica`)

      await db.query(`DELETE FROM usuario WHERE id = 'prueba-r1'`)

      const { rows } = await db.query(`SELECT count(*)::int AS n FROM usuario WHERE es_root`)
      expect(rows[0].n).toBe(0)
    })
  })

  describe('autoría: pago.usuario_id y pedido_edicion.usuario_id', () => {
    /** Una sesión con un pedido, para colgar el pago y la edición. */
    async function sesionConPedido(): Promise<{ sesionId: string; pedidoId: string }> {
      await db.query(`INSERT INTO marca (id, nombre, slug) VALUES ('prueba-m1', 'Marca', 'prueba-m1-' || gen_random_uuid())`)
      await db.query(`INSERT INTO restaurante (id, marca_id, nombre) VALUES ('prueba-rest1', 'prueba-m1', 'Restaurante')`)
      await db.query(
        `INSERT INTO mesa (id, restaurante_id, numero, qr_token, pin) VALUES ('prueba-mesa1', 'prueba-rest1', '1', gen_random_uuid()::text, '1234')`,
      )
      await db.query(`INSERT INTO sesion_mesa (id, mesa_id, codigo_sesion) VALUES ('prueba-s1', 'prueba-mesa1', 'ABC')`)
      await db.query(`INSERT INTO pedido (id, sesion_id, mesa_id, updated_at) VALUES ('prueba-p1', 'prueba-s1', 'prueba-mesa1', now())`)
      return { sesionId: 'prueba-s1', pedidoId: 'prueba-p1' }
    }

    it('guardan la cuenta de quien cobró o editó, y borrarla los deja en null sin borrar el pago ni la edición', async () => {
      // Arrange
      const { sesionId, pedidoId } = await sesionConPedido()
      const gerente = await usuario('prueba-g1')
      await db.query(`INSERT INTO pago (id, sesion_id, monto, metodo, usuario_id) VALUES ('prueba-pago1', $1, 100, 'efectivo', $2)`, [
        sesionId,
        gerente,
      ])
      await db.query(
        `INSERT INTO pedido_edicion (id, pedido_id, usuario_id, justificacion) VALUES ('prueba-e1', $1, $2, 'Se cayó el plato')`,
        [pedidoId, gerente],
      )

      // Act
      await db.query(`DELETE FROM usuario WHERE id = $1`, [gerente])

      // Assert
      const pago = await db.query(`SELECT usuario_id FROM pago WHERE id = 'prueba-pago1'`)
      const edicion = await db.query(`SELECT usuario_id FROM pedido_edicion WHERE id = 'prueba-e1'`)
      expect(pago.rows).toEqual([{ usuario_id: null }])
      expect(edicion.rows).toEqual([{ usuario_id: null }])
    })

    it.each([
      ['pago', `INSERT INTO pago (id, sesion_id, monto, metodo, usuario_id) VALUES ('prueba-pago2', 'prueba-s1', 100, 'efectivo', 'no-existe')`],
      ['pedido_edicion', `INSERT INTO pedido_edicion (id, pedido_id, usuario_id, justificacion) VALUES ('prueba-e2', 'prueba-p1', 'no-existe', 'x')`],
    ])('%s no acepta una cuenta que no existe', async (tabla, sql) => {
      await sesionConPedido()

      expect(await falla(sql)).toMatch(new RegExp(`${tabla}_usuario_id_fkey`))
    })
  })
})
