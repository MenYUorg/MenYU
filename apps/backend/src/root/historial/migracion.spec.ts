import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * La migración de la etapa 1a leída como texto (docs/plan-consola-root.md, 7.2). El CI no tiene una base de datos, así que acá solo
 * se comprueba que el SQL tenga lo que tiene que tener; que los disparadores FUNCIONEN lo prueba historial-root.base.spec.ts contra
 * un PostgreSQL de verdad (y la verificación de la etapa).
 */
const CARPETA = join(__dirname, '..', '..', '..', 'prisma')
const MIGRACIONES = join(CARPETA, 'migrations')

const nombre = readdirSync(MIGRACIONES).filter((n) => n.endsWith('_consola_root_historial'))
const sql = nombre.length === 1 ? readFileSync(join(MIGRACIONES, nombre[0], 'migration.sql'), 'utf8') : ''
// Sin los comentarios: lo que cuenta es lo que se ejecuta.
const codigo = sql.replace(/--.*$/gm, '')
const schema = readFileSync(join(CARPETA, 'schema.prisma'), 'utf8')

describe('migración de la consola de ROOT (etapa 1a)', () => {
  it('es UNA sola migración', () => {
    expect(nombre).toHaveLength(1)
    expect(sql.length).toBeGreaterThan(500)
  })

  it('agrega admin.debe_cambiar_password como booleano no nulo con default false (sin efecto en las cuentas que existen)', () => {
    expect(codigo).toMatch(/ALTER TABLE "admin" ADD COLUMN "debe_cambiar_password" BOOLEAN NOT NULL DEFAULT false/)
  })

  it('crea la tabla historial_root', () => {
    expect(codigo).toMatch(/CREATE TABLE "historial_root"/)
  })

  it('historial_root no tiene claves foráneas: guarda copias, así que retirar una cuenta o una marca no la toca', () => {
    const tabla = /CREATE TABLE "historial_root" \(([\s\S]*?)\n\);/.exec(codigo)?.[1] ?? ''

    expect(tabla.length).toBeGreaterThan(100)
    expect(tabla).not.toMatch(/REFERENCES|FOREIGN KEY/i)
    expect(codigo).not.toMatch(/ADD CONSTRAINT "historial_root[^"]*"\s+FOREIGN KEY/i)
  })

  describe('el historial es de solo agregar', () => {
    it('bloquea UPDATE y DELETE fila por fila', () => {
      expect(codigo).toMatch(/CREATE TRIGGER "historial_root_sin_update_ni_delete"\s+BEFORE UPDATE OR DELETE ON "historial_root"\s+FOR EACH ROW/)
    })

    it('bloquea TRUNCATE', () => {
      expect(codigo).toMatch(/CREATE TRIGGER "historial_root_sin_truncate"\s+BEFORE TRUNCATE ON "historial_root"\s+FOR EACH STATEMENT/)
    })

    it('la función que bloquea lanza una excepción siempre', () => {
      const funcion = /CREATE FUNCTION "historial_root_proteger"\(\)[\s\S]*?\$\$;/.exec(codigo)?.[0] ?? ''

      expect(funcion).toMatch(/RAISE EXCEPTION/)
      expect(funcion).not.toMatch(/\bIF\b/i) // sin condiciones: no hay un caso en que deje pasar
      expect(funcion).not.toMatch(/\bRETURN\b/) // nunca devuelve la fila: no hay un camino que deje seguir
    })

    it('la hora la pone la base: un disparador BEFORE INSERT pisa created_at con now()', () => {
      expect(codigo).toMatch(/CREATE TRIGGER "historial_root_hora"\s+BEFORE INSERT ON "historial_root"/)
      expect(codigo).toMatch(/NEW\."created_at" := now\(\)/)
    })

    it('TODOS los disparadores de historial_root valen también con session_replication_role = replica (ENABLE ALWAYS)', () => {
      const creados = [...codigo.matchAll(/CREATE TRIGGER "([^"]+)"[\s\S]*?ON "historial_root"/g)].map((m) => m[1]).sort()
      const siempre = [...codigo.matchAll(/ALTER TABLE "historial_root" ENABLE ALWAYS TRIGGER "([^"]+)"/g)].map((m) => m[1]).sort()

      expect(creados).toEqual(['historial_root_hora', 'historial_root_sin_truncate', 'historial_root_sin_update_ni_delete'])
      expect(siempre).toEqual(creados)
    })

    it('nada en la migración desactiva ni quita un disparador del historial', () => {
      expect(codigo).not.toMatch(/DROP TRIGGER|DISABLE TRIGGER|DROP FUNCTION/i)
    })

    it('restringe actor_tipo y entidad_tipo, y exige el id cuando lo hizo una cuenta ROOT', () => {
      expect(codigo).toMatch(/CHECK \("actor_tipo" IN \('ROOT', 'SCRIPT'\)\)/)
      expect(codigo).toMatch(/CHECK \("entidad_tipo" IN \('MARCA', 'RESTAURANTE', 'OWNER', 'ROOT'\)\)/)
      expect(codigo).toMatch(/CHECK \("actor_tipo" <> 'ROOT' OR "actor_id" IS NOT NULL\)/)
    })
  })

  describe('la última cuenta ROOT no se puede quitar', () => {
    it('hay un disparador BEFORE DELETE sobre admin, solo para las filas ROOT', () => {
      expect(codigo).toMatch(/CREATE TRIGGER "admin_ultimo_root_sin_delete"\s+BEFORE DELETE ON "admin"\s+FOR EACH ROW WHEN \(OLD\."rol" = 'ROOT'\)/)
    })

    it('y otro que impide quitarle el rol ROOT a la última', () => {
      expect(codigo).toMatch(
        /CREATE TRIGGER "admin_ultimo_root_sin_cambio_de_rol"\s+BEFORE UPDATE OF "rol" ON "admin"\s+FOR EACH ROW WHEN \(OLD\."rol" = 'ROOT' AND NEW\."rol" <> 'ROOT'\)/,
      )
    })

    it('la función cuenta las OTRAS cuentas ROOT bloqueándolas (dos bajas simultáneas no dejan la base sin ROOT)', () => {
      const funcion = /CREATE FUNCTION "admin_proteger_ultimo_root"\(\)[\s\S]*?\$\$;/.exec(codigo)?.[0] ?? ''

      expect(funcion).toMatch(/"rol" = 'ROOT' AND "id" <> OLD\."id" FOR UPDATE/)
      expect(funcion).toMatch(/IF NOT FOUND THEN\s+RAISE EXCEPTION/)
    })

    it('estos disparadores NO son ALWAYS: las limpiezas de pruebas con session_replication_role = replica siguen pudiendo borrar cuentas', () => {
      expect(codigo).not.toMatch(/ALTER TABLE "admin" ENABLE ALWAYS/)
    })
  })

  describe('schema.prisma', () => {
    const modelo = /model HistorialRoot \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? ''

    it('el modelo HistorialRoot existe, mapea a historial_root y no tiene relaciones', () => {
      expect(modelo.length).toBeGreaterThan(100)
      expect(modelo).toMatch(/@@map\("historial_root"\)/)
      expect(modelo).not.toMatch(/@relation/)
    })

    it('Admin tiene debeCambiarPassword con default false', () => {
      expect(schema).toMatch(/debeCambiarPassword Boolean @default\(false\) @map\("debe_cambiar_password"\)/)
    })
  })
})
