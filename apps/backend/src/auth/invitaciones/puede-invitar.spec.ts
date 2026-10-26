import { ROLES_QUE_PUEDE_INVITAR, type RolQueInvita } from '@menyu/types'
import { Rol } from '@prisma/client'
import { puedeInvitar } from './puede-invitar'

const ROOT = { esRoot: true, rolesEnAmbito: [] as Rol[] }
const OWNER = { esRoot: false, rolesEnAmbito: ['OWNER'] as Rol[] }
const GERENTE = { esRoot: false, rolesEnAmbito: ['GERENTE'] as Rol[] }
const JEFE_SALON = { esRoot: false, rolesEnAmbito: ['JEFE_SALON'] as Rol[] }
const MOZO = { esRoot: false, rolesEnAmbito: ['MOZO'] as Rol[] }
// Un OWNER o GERENTE de otra marca o restaurante no tiene roles en el ámbito de la invitación.
const SIN_ROL_EN_EL_AMBITO = { esRoot: false, rolesEnAmbito: [] as Rol[] }

describe('puedeInvitar: quién invita a quién (spec de auth, Fase 2 y 4.4)', () => {
  it.each([
    ['ROOT', 'OWNER', true, ROOT],
    // El GERENTE lo invita el OWNER de la marca (plan de la consola de ROOT, decisión 21).
    ['ROOT', 'GERENTE', false, ROOT],
    ['ROOT', 'MOZO', false, ROOT],
    ['ROOT', 'COCINA', false, ROOT],
    ['OWNER', 'OWNER', true, OWNER],
    ['OWNER', 'COCINA', true, OWNER],
    ['GERENTE', 'GERENTE', false, GERENTE],
    ['GERENTE', 'MOZO', true, GERENTE],
    ['JEFE_SALON', 'MOZO', false, JEFE_SALON],
    ['MOZO', 'MOZO', false, MOZO],
    ['sin rol en el ámbito', 'MOZO', false, SIN_ROL_EN_EL_AMBITO],
  ] as const)('%s invita a %s → %s', (_quien, rolInvitado, esperado, invitador) => {
    // Act + Assert
    expect(puedeInvitar(invitador, rolInvitado)).toBe(esperado)
  })

  /**
   * web-admin ofrece los roles de `ROLES_QUE_PUEDE_INVITAR` (`@menyu/types`) y el backend decide con `puedeInvitar`.
   * Eran dos copias a mano y nada las ataba: si una cambiaba, Personal ofrecía algo que terminaba en 403 (o escondía
   * algo permitido). El backend no importa el paquete en producción —sus tipos salen de Prisma—, así que el vínculo es
   * este test, que recorre la tabla entera.
   */
  describe('dice lo mismo que la tabla que ofrece web-admin (@menyu/types)', () => {
    // Del enum de Prisma, no escritos a mano: un rol nuevo en la base rompe este test hasta que se decida a quién invita.
    const TODOS = Object.values(Rol)
    const invitadorCon = (quien: RolQueInvita) =>
      quien === 'ROOT' ? { esRoot: true, rolesEnAmbito: [] as Rol[] } : { esRoot: false, rolesEnAmbito: [quien] }

    const casos = (Object.keys(ROLES_QUE_PUEDE_INVITAR) as RolQueInvita[]).flatMap((quien) =>
      TODOS.map((rolInvitado) => [quien, rolInvitado] as const),
    )

    it.each(casos)('%s → %s', (quien, rolInvitado) => {
      const loOfrece = ROLES_QUE_PUEDE_INVITAR[quien].includes(rolInvitado)

      expect(puedeInvitar(invitadorCon(quien), rolInvitado)).toBe(loOfrece)
    })

    it('la tabla cubre todos los roles, y ROOT (si se agrega uno, hay que decidir a quién invita)', () => {
      expect(Object.keys(ROLES_QUE_PUEDE_INVITAR).sort()).toEqual([...TODOS, 'ROOT'].sort())
    })
  })
})
