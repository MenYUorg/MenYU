import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'
import {
  BCRYPT_ROUNDS_ROOT,
  IdPipe,
  MENSAJE_EMAIL_EN_USO,
  comoTextoLiteral,
  conConflictoDeEmail,
  exigirEmailLibre,
  generarPasswordTemporal,
  normalizarEmail,
  prepararPassword,
  revocarSesiones,
} from './cuentas'

const errorDeClaveUnica = () => new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })

function clienteFalso() {
  return {
    admin: { findFirst: jest.fn().mockResolvedValue(null) },
    mozo: { findFirst: jest.fn().mockResolvedValue(null) },
    cliente: { findFirst: jest.fn().mockResolvedValue(null) },
    refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  }
}

describe('normalizarEmail', () => {
  it('recorta y pasa a minúsculas', () => {
    expect(normalizarEmail('  Ana.Perez@Ejemplo.COM ')).toBe('ana.perez@ejemplo.com')
  })
})

describe('comoTextoLiteral', () => {
  it.each([
    ['ana@ejemplo.com', 'ana@ejemplo.com'],
    ['juan_perez@ejemplo.com', 'juan\\_perez@ejemplo.com'],
    ['100%@ejemplo.com', '100\\%@ejemplo.com'],
    ['a\\b@ejemplo.com', 'a\\\\b@ejemplo.com'],
    ['_%\\', '\\_\\%\\\\'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(comoTextoLiteral(entrada)).toBe(esperado)
  })
})

describe('exigirEmailLibre', () => {
  it('no hace nada si nadie usa el email', async () => {
    const tx = clienteFalso()

    await expect(exigirEmailLibre(tx as never, 'ana@ejemplo.com')).resolves.toBeUndefined()
  })

  it('busca sin distinguir mayúsculas en admin, mozo y cliente', async () => {
    // Arrange
    const tx = clienteFalso()

    // Act
    await exigirEmailLibre(tx as never, 'ana@ejemplo.com')

    // Assert
    const igual = { equals: 'ana@ejemplo.com', mode: 'insensitive' }
    expect(tx.admin.findFirst).toHaveBeenCalledWith({ where: { email: igual }, select: { id: true } })
    expect(tx.mozo.findFirst).toHaveBeenCalledWith({ where: { email: igual }, select: { id: true } })
    expect(tx.cliente.findFirst).toHaveBeenCalledWith({ where: { email: igual }, select: { id: true } })
  })

  // Prisma ejecuta `equals` + `insensitive` como ILIKE, donde _ y % son comodines. Verificado contra PostgreSQL: sin escapar,
  // `a_b@x.com` encontraba a `axb@x.com`.
  it('compara el email como texto literal: los comodines de LIKE (_ % \\) se escapan', async () => {
    // Arrange
    const tx = clienteFalso()

    // Act
    await exigirEmailLibre(tx as never, 'juan_perez@ejemplo.com')
    await exigirEmailLibre(tx as never, '100%@ejemplo.com')

    // Assert
    expect(tx.admin.findFirst.mock.calls[0][0].where.email).toEqual({ equals: 'juan\\_perez@ejemplo.com', mode: 'insensitive' })
    expect(tx.mozo.findFirst.mock.calls[0][0].where.email.equals).toBe('juan\\_perez@ejemplo.com')
    expect(tx.cliente.findFirst.mock.calls[1][0].where.email.equals).toBe('100\\%@ejemplo.com')
  })

  it.each(['admin', 'mozo', 'cliente'] as const)('responde 409 si lo usa un %s, sin decir quién', async (quien) => {
    // Arrange
    const tx = clienteFalso()
    tx[quien].findFirst.mockResolvedValue({ id: 'x' })

    // Act
    const error = await exigirEmailLibre(tx as never, 'ana@ejemplo.com').catch((e) => e)

    // Assert
    expect(error).toBeInstanceOf(ConflictException)
    expect(error.message).toBe(MENSAJE_EMAIL_EN_USO)
    expect(error.message).not.toMatch(/mozo|cliente|admin/i)
  })

  it('al cambiar el email de una cuenta, esa misma cuenta no cuenta como "en uso"', async () => {
    // Arrange
    const tx = clienteFalso()

    // Act
    await exigirEmailLibre(tx as never, 'ana@ejemplo.com', 'cuenta-7')

    // Assert
    expect(tx.admin.findFirst.mock.calls[0][0].where).toEqual({
      email: { equals: 'ana@ejemplo.com', mode: 'insensitive' },
      id: { not: 'cuenta-7' },
    })
  })
})

describe('prepararPassword', () => {
  it('sin contraseña elegida, genera una de 12 caracteres, la hashea y la devuelve para mostrarla una vez', async () => {
    // Act
    const r = await prepararPassword(undefined, 'ana@ejemplo.com')

    // Assert
    expect(r.generada).toBe(true)
    expect(r.passwordTemporal).toHaveLength(12)
    expect(await bcrypt.compare(r.passwordTemporal as string, r.passwordHash)).toBe(true)
    expect(r.passwordHash).not.toContain(r.passwordTemporal as string)
    expect(bcrypt.getRounds(r.passwordHash)).toBe(BCRYPT_ROUNDS_ROOT)
  })

  it('con una contraseña elegida que sirve, la hashea y NO la devuelve', async () => {
    // Act
    const r = await prepararPassword('Caracol-Violeta-48', 'ana@ejemplo.com')

    // Assert
    expect(r.generada).toBe(false)
    expect(r.passwordTemporal).toBeNull()
    expect(await bcrypt.compare('Caracol-Violeta-48', r.passwordHash)).toBe(true)
  })

  it.each([
    ['corta', 'Corta-123', /al menos 12/],
    ['conocida', 'qwerty123456', /conocida/],
    ['con la parte del email', 'Luciana-Violeta-48', /parte del email/],
    ['de más de 72 bytes', 'Aa1!' + 'x7q9'.repeat(20), /demasiado larga/],
  ])('con una contraseña elegida %s responde 400', async (_caso, elegida, motivo) => {
    // Act
    const error = await prepararPassword(elegida, 'luciana@ejemplo.com').catch((e) => e)

    // Assert
    expect(error).toBeInstanceOf(BadRequestException)
    expect(error.message).toMatch(motivo)
  })

  it('una contraseña elegida vacía no vale como "no elegí ninguna"', async () => {
    const error = await prepararPassword('', 'ana@ejemplo.com').catch((e) => e)

    expect(error).toBeInstanceOf(BadRequestException)
  })
})

describe('generarPasswordTemporal', () => {
  it('devuelve una contraseña y su hash', async () => {
    const r = await generarPasswordTemporal()

    expect(await bcrypt.compare(r.passwordTemporal, r.passwordHash)).toBe(true)
  })
})

describe('revocarSesiones', () => {
  it('revoca solo los refresh tokens vigentes de esa cuenta de admin y devuelve cuántos', async () => {
    // Arrange
    const tx = clienteFalso()

    // Act
    const n = await revocarSesiones(tx as never, 'cuenta-7')

    // Assert
    expect(n).toBe(2)
    const { where, data } = tx.refreshToken.updateMany.mock.calls[0][0]
    expect(where).toEqual({ userId: 'cuenta-7', userTipo: 'admin', revokedAt: null })
    expect(data.revokedAt).toBeInstanceOf(Date)
  })
})

describe('conConflictoDeEmail', () => {
  it('devuelve lo que devuelve la escritura', async () => {
    await expect(conConflictoDeEmail(() => Promise.resolve('listo'))).resolves.toBe('listo')
  })

  it('traduce la violación de clave única (dos pedidos a la vez con el mismo email) en 409', async () => {
    const error = await conConflictoDeEmail(() => Promise.reject(errorDeClaveUnica())).catch((e) => e)

    expect(error).toBeInstanceOf(ConflictException)
  })

  it('deja pasar cualquier otro error', async () => {
    await expect(conConflictoDeEmail(() => Promise.reject(new Error('se cayó la base')))).rejects.toThrow('se cayó la base')
  })
})

describe('IdPipe', () => {
  const pipe = new IdPipe('Marca no encontrada')

  it.each(['m-001', 'r-001', '11111111-1111-4111-a111-111111111111', 'abc_DEF-123', 'a'.repeat(64)])('deja pasar el id %s (no se exige UUID)', (id) => {
    expect(pipe.transform(id)).toBe(id)
  })

  it.each(['', 'a b', 'a/b', '../x', 'a.b', "m'1", 'm\u0000-1', 'a'.repeat(65), 'ñandú'])('responde 404 para %j, sin llegar a la base', (id) => {
    expect(() => pipe.transform(id)).toThrow(new NotFoundException('Marca no encontrada'))
  })
})
