import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import {
  AccionRoot,
  ENTIDAD_DE_ACCION,
  EntradaHistorial,
  LARGO_MAXIMO_TEXTO,
  RegistroInvalido,
  cambioDeInvitacion,
  registrarEnHistorial,
  textoRegistrable,
} from './registrar-historial'

const ENTRADA: EntradaHistorial = {
  actor: { tipo: 'ROOT', id: 'root-1', nombre: 'ana@ejemplo.com' },
  accion: 'DUENO_INVITAR',
  entidad: { tipo: 'OWNER', id: 'owner-9', nombre: 'juan@laparrilla.com' },
  marca: { id: 'marca-1', nombre: 'La Parrilla' },
  cambios: [{ campo: 'Dueño de', antes: null, despues: 'La Parrilla' }, cambioDeInvitacion(true)],
}

function clienteFalso() {
  return { historialRoot: { create: jest.fn().mockResolvedValue({ id: 1 }) } }
}

describe('registrarEnHistorial', () => {
  it('escribe una sola fila con el actor, la acción, la entidad, la marca y el detalle', async () => {
    // Arrange
    const tx = clienteFalso()

    // Act
    await registrarEnHistorial(tx as never, ENTRADA)

    // Assert
    expect(tx.historialRoot.create).toHaveBeenCalledTimes(1)
    expect(tx.historialRoot.create.mock.calls[0][0].data).toEqual({
      actorTipo: 'ROOT',
      actorId: 'root-1',
      actorNombre: 'ana@ejemplo.com',
      accion: 'DUENO_INVITAR',
      entidadTipo: 'OWNER',
      entidadId: 'owner-9',
      entidadNombre: 'juan@laparrilla.com',
      marcaId: 'marca-1',
      marcaNombre: 'La Parrilla',
      detalle: [
        { campo: 'Dueño de', antes: null, despues: 'La Parrilla' },
        { campo: 'Invitación', antes: null, despues: 'mail enviado' },
      ],
    })
  })

  it('el script se registra sin id de cuenta y con el usuario del sistema como nombre', async () => {
    // Arrange
    const tx = clienteFalso()

    // Act
    await registrarEnHistorial(tx as never, {
      actor: { tipo: 'SCRIPT', nombre: 'marga' },
      accion: 'ROOT_PROMOVER',
      entidad: { tipo: 'ROOT', id: 'root-2', nombre: 'bruno@ejemplo.com' },
      cambios: [{ campo: 'ROOT', antes: 'No', despues: 'Sí' }],
    })

    // Assert
    expect(tx.historialRoot.create.mock.calls[0][0].data).toMatchObject({
      actorTipo: 'SCRIPT',
      actorId: null,
      actorNombre: 'marga',
      marcaId: null,
      marcaNombre: null,
    })
  })

  it('escribe con el cliente que recibe (el de la transacción) y no hace ninguna otra consulta', async () => {
    // Arrange
    const tx = { ...clienteFalso(), $executeRaw: jest.fn(), $queryRaw: jest.fn() }

    // Act
    await registrarEnHistorial(tx as never, ENTRADA)

    // Assert
    expect(tx.$executeRaw).not.toHaveBeenCalled()
    expect(tx.$queryRaw).not.toHaveBeenCalled()
  })

  it('si no se puede escribir, el error sale (así se revierte la transacción del cambio)', async () => {
    // Arrange
    const tx = clienteFalso()
    tx.historialRoot.create.mockRejectedValue(new Error('la base no responde'))

    // Act
    const registro = registrarEnHistorial(tx as never, ENTRADA)

    // Assert
    await expect(registro).rejects.toThrow('la base no responde')
  })

  describe('lo que rechaza (es un error de programación, no se escribe nada)', () => {
    const rechaza = async (entrada: EntradaHistorial, mensaje: RegExp) => {
      const tx = clienteFalso()
      await expect(registrarEnHistorial(tx as never, entrada)).rejects.toThrow(RegistroInvalido)
      await expect(registrarEnHistorial(tx as never, entrada)).rejects.toThrow(mensaje)
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    }

    it('una acción que no existe', () => rechaza({ ...ENTRADA, accion: 'DUENO_HACKEAR' as AccionRoot }, /Acción desconocida/))

    it('una acción sobre otro tipo de entidad que el suyo', () =>
      rechaza({ ...ENTRADA, entidad: { tipo: 'MARCA', id: 'm-1', nombre: 'X' } }, /es sobre OWNER, no sobre MARCA/))

    it('una acción sin cambios que contar', () => rechaza({ ...ENTRADA, cambios: [] }, /qué cambió/))

    it('un ROOT sin id de cuenta', () => rechaza({ ...ENTRADA, actor: { tipo: 'ROOT', id: '', nombre: 'ana@ejemplo.com' } }, /id de la cuenta ROOT/))

    it('un actor sin nombre', () => rechaza({ ...ENTRADA, actor: { tipo: 'SCRIPT', nombre: '  ' } }, /nombre de quien/))
  })

  // Muchos textos vienen de la base y los eligió otra persona (el nombre de la marca lo pone su dueño): rechazarlos le
  // impediría a ROOT dar de baja esa marca. Se ajustan, y un hash nunca se guarda.
  describe('lo que ajusta antes de guardar (nunca un hash; nada de más de 500 caracteres)', () => {
    // Un hash de bcrypt con la forma real ($2a$ + coste + 53 caracteres de sal y digest), escrito a mano:
    // desde la Fase 5 el backend ya no depende de bcryptjs.
    const hash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
    const guardado = async (entrada: EntradaHistorial) => {
      const tx = clienteFalso()
      await registrarEnHistorial(tx as never, entrada)
      return tx.historialRoot.create.mock.calls[0][0].data
    }

    it.each([
      ['en el valor de antes', { campo: 'Contraseña', antes: hash, despues: null }, { campo: 'Contraseña', antes: '(no se registra)', despues: null }],
      ['en el valor de después', { campo: 'Contraseña', antes: null, despues: hash }, { campo: 'Contraseña', antes: null, despues: '(no se registra)' }],
      ['dentro de un texto', { campo: 'Nota', antes: null, despues: `hash: ${hash} (listo)` }, { campo: 'Nota', antes: null, despues: 'hash: (no se registra) (listo)' }],
      ['en el nombre del campo', { campo: hash, antes: null, despues: 'x' }, { campo: '(no se registra)', antes: null, despues: 'x' }],
    ])('un hash de contraseña %s se tapa', async (_donde, cambio, esperado) => {
      const data = await guardado({ ...ENTRADA, cambios: [cambio] })

      expect(data.detalle).toEqual([esperado])
      expect(JSON.stringify(data)).not.toContain(hash)
    })

    it('una marca o una entidad con nombre de hash se registran igual, con el hash tapado', async () => {
      const data = await guardado({ ...ENTRADA, entidad: { tipo: 'OWNER', id: 'o', nombre: hash }, marca: { id: 'm', nombre: `${hash}${hash}` } })

      expect(data.entidadNombre).toBe('(no se registra)')
      expect(data.marcaNombre).toBe('(no se registra)(no se registra)')
      expect(JSON.stringify(data)).not.toMatch(/\$2[abxy]?\$/)
    })

    it('un texto de más de 500 caracteres se recorta a 500, con puntos suspensivos', async () => {
      const largo = 'x'.repeat(600)
      const data = await guardado({ ...ENTRADA, entidad: { ...ENTRADA.entidad, nombre: largo }, marca: { id: 'm', nombre: largo }, cambios: [{ campo: 'Nombre', antes: largo, despues: 'Corto' }] })

      expect(data.entidadNombre).toBe(`${'x'.repeat(499)}…`)
      expect(Array.from(data.marcaNombre as string)).toHaveLength(LARGO_MAXIMO_TEXTO)
      expect(data.detalle).toEqual([{ campo: 'Nombre', antes: `${'x'.repeat(499)}…`, despues: 'Corto' }])
    })

    it('el recorte cuenta caracteres, no mitades de un emoji', () => {
      const conEmojis = '🍕'.repeat(600)

      expect(textoRegistrable(conEmojis)).toBe(`${'🍕'.repeat(499)}…`)
    })

    it('un texto de 500 caracteres justos queda igual', () => {
      expect(textoRegistrable('x'.repeat(500))).toBe('x'.repeat(500))
    })
  })
})

describe('las acciones', () => {
  it.each(Object.entries(ENTIDAD_DE_ACCION))('%s es sobre %s y se puede registrar', async (accion, tipo) => {
    // Arrange
    const tx = clienteFalso()

    // Act
    await registrarEnHistorial(tx as never, {
      actor: { tipo: 'SCRIPT', nombre: 'marga' },
      accion: accion as AccionRoot,
      entidad: { tipo, id: 'id-1', nombre: 'nombre' },
      cambios: [{ campo: 'Estado', antes: 'a', despues: 'b' }],
    })

    // Assert
    expect(tx.historialRoot.create.mock.calls[0][0].data).toMatchObject({ accion, entidadTipo: tipo })
  })

  it('son las del plan (docs/plan-consola-root.md, 7.2) con las invitaciones de la entrega 4.4 de auth', () => {
    expect(Object.keys(ENTIDAD_DE_ACCION).sort()).toEqual(
      [
        'MARCA_CREAR', 'MARCA_EDITAR', 'MARCA_BAJA', 'MARCA_REACTIVAR',
        'RESTAURANTE_CREAR', 'RESTAURANTE_EDITAR', 'RESTAURANTE_BAJA', 'RESTAURANTE_REACTIVAR',
        'DUENO_INVITAR', 'DUENO_QUITAR', 'ROOT_INVITAR', 'ROOT_PROMOVER',
      ].sort(),
    )
  })

  // Las cuentas con contraseña se fueron con Supabase: sus filas viejas siguen en la tabla, pero ya no se pueden escribir.
  it.each(['DUENO_CREAR', 'DUENO_CAMBIAR_EMAIL', 'DUENO_RESTABLECER', 'DUENO_ELIMINAR', 'ROOT_CREAR', 'ROOT_RESTABLECER', 'ROOT_ELIMINAR'])(
    '%s ya no se registra',
    async (accion) => {
      const tx = clienteFalso()

      await expect(registrarEnHistorial(tx as never, { ...ENTRADA, accion: accion as AccionRoot })).rejects.toThrow(/Acción desconocida/)
      expect(tx.historialRoot.create).not.toHaveBeenCalled()
    },
  )

  it.each([
    [true, 'mail enviado'],
    [false, 'ya tenía cuenta: no se le mandó mail'],
  ])('la invitación con invitacionEnviada=%s dice «%s»', (enviada, texto) => {
    expect(cambioDeInvitacion(enviada)).toEqual({ campo: 'Invitación', antes: null, despues: texto })
  })
})

describe('el historial es de solo agregar: el código nunca lo modifica ni lo borra', () => {
  const RAIZ_BACKEND = join(__dirname, '..', '..', '..')

  const archivos = (carpeta: string): string[] =>
    readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
      const ruta = join(carpeta, e.name)
      if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'dist' ? [] : archivos(ruta)
      return e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [ruta] : []
    })

  // Todo el código del backend (src y scripts) menos los tests.
  const fuentes = [...archivos(join(RAIZ_BACKEND, 'src')), ...archivos(join(RAIZ_BACKEND, 'scripts'))]

  const METODOS_QUE_CAMBIAN = /historialRoot\s*\.\s*(update|updateMany|upsert|delete|deleteMany|createMany)\b/
  const SQL_QUE_CAMBIA = /(UPDATE\s+"?historial_root|DELETE\s+FROM\s+"?historial_root|TRUNCATE\s+(TABLE\s+)?"?historial_root)/i

  it('hay código para revisar', () => {
    expect(fuentes.length).toBeGreaterThan(50)
    expect(fuentes.some((f) => f.endsWith('registrar-historial.ts'))).toBe(true)
  })

  it('ningún archivo llama a update, upsert ni delete sobre historialRoot', () => {
    const culpables = fuentes.filter((f) => METODOS_QUE_CAMBIAN.test(readFileSync(f, 'utf8')))

    expect(culpables).toEqual([])
  })

  it('ningún archivo tiene SQL que modifique o borre historial_root', () => {
    const culpables = fuentes.filter((f) => SQL_QUE_CAMBIA.test(readFileSync(f, 'utf8')))

    expect(culpables).toEqual([])
  })

  it('la búsqueda detecta el problema si alguien lo agregara', () => {
    expect(METODOS_QUE_CAMBIAN.test('await tx.historialRoot.deleteMany({})')).toBe(true)
    expect(METODOS_QUE_CAMBIAN.test('this.prisma.historialRoot .update({})')).toBe(true)
    expect(METODOS_QUE_CAMBIAN.test('await tx.historialRoot.create({})')).toBe(false)
    expect(SQL_QUE_CAMBIA.test('DELETE FROM historial_root')).toBe(true)
    expect(SQL_QUE_CAMBIA.test('update "historial_root" set x = 1')).toBe(true)
    expect(SQL_QUE_CAMBIA.test('TRUNCATE TABLE historial_root')).toBe(true)
    expect(SQL_QUE_CAMBIA.test('SELECT * FROM historial_root')).toBe(false)
  })
})
