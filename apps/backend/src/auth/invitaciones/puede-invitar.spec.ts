import { Rol } from '@prisma/client'
import { puedeInvitar } from './puede-invitar'

const ROOT = { esRoot: true, rolesEnAmbito: [] as Rol[] }
const OWNER = { esRoot: false, rolesEnAmbito: ['OWNER'] as Rol[] }
const GERENTE = { esRoot: false, rolesEnAmbito: ['GERENTE'] as Rol[] }
const JEFE_SALON = { esRoot: false, rolesEnAmbito: ['JEFE_SALON'] as Rol[] }
const MOZO = { esRoot: false, rolesEnAmbito: ['MOZO'] as Rol[] }
// Un OWNER o GERENTE de otra marca o restaurante no tiene roles en el ámbito de la invitación.
const SIN_ROL_EN_EL_AMBITO = { esRoot: false, rolesEnAmbito: [] as Rol[] }

describe('puedeInvitar: quién invita a quién (spec de auth, Fase 2)', () => {
  it.each([
    ['ROOT', 'OWNER', true, ROOT],
    ['ROOT', 'GERENTE', true, ROOT],
    ['ROOT', 'MOZO', false, ROOT],
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
})
