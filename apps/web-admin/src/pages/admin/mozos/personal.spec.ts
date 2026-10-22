import type { Rol } from '@menyu/types'
import { ambitoDeLaInvitacion, etiquetaDeRol, puedeQuitarAcceso, rolesQuePuedeInvitar } from './personal'

const TODOS: Rol[] = ['OWNER', 'GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA']

describe('etiquetaDeRol', () => {
  it('nombra cada rol en palabras', () => {
    expect(TODOS.map(etiquetaDeRol)).toEqual(['Dueño', 'Gerente', 'Jefe de salón', 'Mozo', 'Cocina'])
  })

  it('un rol que no conoce lo muestra tal cual, sin romper', () => {
    expect(etiquetaDeRol('ALGO_NUEVO' as Rol)).toBe('ALGO_NUEVO')
    // Solo claves propias: un rol llamado `constructor` no trae nada de Object.prototype.
    expect(etiquetaDeRol('constructor' as Rol)).toBe('constructor')
  })
})

describe('rolesQuePuedeInvitar', () => {
  it('el dueño invita a cualquier rol de su marca, también a otro dueño', () => {
    expect(rolesQuePuedeInvitar('OWNER')).toEqual(['GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA', 'OWNER'])
  })

  it('el gerente solo al personal de salón y cocina', () => {
    expect(rolesQuePuedeInvitar('GERENTE')).toEqual(['JEFE_SALON', 'MOZO', 'COCINA'])
  })
})

describe('puedeQuitarAcceso', () => {
  it('el dueño puede quitarle el acceso a cualquier miembro del restaurante', () => {
    expect(TODOS.filter((rol) => puedeQuitarAcceso('OWNER', rol))).toEqual(['GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA'])
  })

  it('el gerente, solo al personal de salón y cocina', () => {
    expect(TODOS.filter((rol) => puedeQuitarAcceso('GERENTE', rol))).toEqual(['JEFE_SALON', 'MOZO', 'COCINA'])
  })

  it('a un dueño no se lo quita nadie desde Personal: su membresía es de la marca', () => {
    expect(puedeQuitarAcceso('OWNER', 'OWNER')).toBe(false)
    expect(puedeQuitarAcceso('GERENTE', 'OWNER')).toBe(false)
  })
})

describe('ambitoDeLaInvitacion', () => {
  it('un dueño se invita a la marca', () => {
    expect(ambitoDeLaInvitacion('OWNER', 'marca-1', 'rest-1')).toEqual({ marcaId: 'marca-1' })
  })

  it('los demás roles, al restaurante', () => {
    for (const rol of ['GERENTE', 'JEFE_SALON', 'MOZO', 'COCINA'] as Rol[]) {
      expect(ambitoDeLaInvitacion(rol, 'marca-1', 'rest-1')).toEqual({ restauranteId: 'rest-1' })
    }
  })

  it('sin la marca a mano no se puede invitar a un dueño', () => {
    expect(ambitoDeLaInvitacion('OWNER', null, 'rest-1')).toBeNull()
    // Los demás no la necesitan.
    expect(ambitoDeLaInvitacion('MOZO', null, 'rest-1')).toEqual({ restauranteId: 'rest-1' })
  })
})
