import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { accesoDeTest, CUENTAS, MOZOS, MUNDO } from '../test/acceso-de-test'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../test/prisma-mock'
import { atribucionDelCobro } from './atribucion-del-cobro'

// La regla de quién cobra (issue #356, de la rama fix/356-mozo-id-desde-jwt), sobre la cuenta de Supabase y
// Mozo.usuarioId en lugar del JWT legacy. Las membresías y los Mozo son los de CUENTAS.
const REST = MUNDO.REST_1

describe('atribucionDelCobro', () => {
  let prisma: PrismaMock

  beforeEach(() => {
    prisma = crearPrismaMock()
  })

  const atribuir = (cuenta: (typeof CUENTAS)[keyof typeof CUENTAS], mozoIdDelBody?: string | null, restauranteId: string = REST) =>
    atribucionDelCobro(comoPrisma(prisma), accesoDeTest(), cuenta, restauranteId, mozoIdDelBody)

  it.each([
    ['el MOZO', CUENTAS.MOZO, MOZOS.DEL_MOZO.id],
    ['el JEFE_SALON', CUENTAS.JEFE_SALON, MOZOS.DEL_JEFE_SALON.id],
  ])('%s cobra con su propio Mozo, y la cuenta queda en usuarioId', async (_caso, cuenta, mozoId) => {
    await expect(atribuir(cuenta)).resolves.toEqual({ usuarioId: cuenta.id, mozoId })
  })

  it('un mozo que manda el mozoId de otro: se guarda el propio y no se consulta la base', async () => {
    await expect(atribuir(CUENTAS.MOZO, 'mozo-ajeno')).resolves.toEqual({ usuarioId: CUENTAS.MOZO.id, mozoId: MOZOS.DEL_MOZO.id })
    expect(prisma.mozo.findUnique).not.toHaveBeenCalled()
  })

  it.each([undefined, null, ''])('el GERENTE sin mozoId (%p) cobra a su nombre, sin mozo', async (mozoIdDelBody) => {
    await expect(atribuir(CUENTAS.GERENTE, mozoIdDelBody)).resolves.toEqual({ usuarioId: CUENTAS.GERENTE.id, mozoId: null })
    expect(prisma.mozo.findUnique).not.toHaveBeenCalled()
  })

  it('el OWNER de la marca le atribuye el cobro a un mozo del restaurante: se guardan los dos', async () => {
    prisma.mozo.findUnique.mockResolvedValue({ restauranteId: REST, activo: true })

    await expect(atribuir(CUENTAS.OWNER_A, 'mozo-7')).resolves.toEqual({ usuarioId: CUENTAS.OWNER_A.id, mozoId: 'mozo-7' })
    expect(prisma.mozo.findUnique).toHaveBeenCalledWith({ where: { id: 'mozo-7' }, select: { restauranteId: true, activo: true } })
  })

  it.each([
    ['no existe', null],
    ['está dado de baja (le quitaron el acceso)', { restauranteId: REST, activo: false }],
  ])('con un mozo que %s: 400', async (_caso, fila) => {
    prisma.mozo.findUnique.mockResolvedValue(fila)

    await expect(atribuir(CUENTAS.GERENTE, 'mozo-x')).rejects.toThrow(
      new BadRequestException('El mozo indicado no existe o está dado de baja'),
    )
  })

  it('con un mozo de otro restaurante: 403', async () => {
    prisma.mozo.findUnique.mockResolvedValue({ restauranteId: MUNDO.REST_2, activo: true })

    await expect(atribuir(CUENTAS.GERENTE, 'mozo-de-otro')).rejects.toThrow(
      new ForbiddenException('El mozo indicado no pertenece a este restaurante'),
    )
  })

  it.each([
    ['ROOT (no es un bypass)', CUENTAS.ROOT],
    ['la COCINA', CUENTAS.COCINA],
    ['el OWNER de otra marca', CUENTAS.OWNER_B],
  ])('%s no cobra: 403', async (_caso, cuenta) => {
    await expect(atribuir(cuenta)).rejects.toThrow(ForbiddenException)
  })

  it('un MOZO en otro restaurante: 403', async () => {
    await expect(atribuir(CUENTAS.MOZO, undefined, MUNDO.REST_2)).rejects.toThrow(ForbiddenException)
  })
})
