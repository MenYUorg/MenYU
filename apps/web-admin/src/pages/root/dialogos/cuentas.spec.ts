import { emailParaInvitar, errorDeEmail, errorDeNombreDePersona } from './cuentas'

describe('validaciones de nombre y email para invitar', () => {
  it('el nombre no puede estar vacío ni pasar de 100 caracteres', () => {
    expect(errorDeNombreDePersona('')).toBe('Escribí el nombre.')
    expect(errorDeNombreDePersona('   ')).toBe('Escribí el nombre.')
    expect(errorDeNombreDePersona('a'.repeat(100))).toBe('')
    expect(errorDeNombreDePersona('  Juan Pérez  ')).toBe('')
    expect(errorDeNombreDePersona('a'.repeat(101))).toContain('100')
  })

  it('el email no puede estar vacío ni pasar de 254 caracteres', () => {
    expect(errorDeEmail('')).toBe('Escribí el email.')
    expect(errorDeEmail('   ')).toBe('Escribí el email.')
    expect(errorDeEmail(`${'a'.repeat(240)}@dominio.com`)).toBe('')
    expect(errorDeEmail(`${'a'.repeat(250)}@dominio.com`)).toContain('254')
  })

  it('el email tiene que ser como nombre@dominio.com', () => {
    expect(errorDeEmail('juan@laparrilla.com')).toBe('')
    expect(errorDeEmail('  juan.perez+menyu@laparrilla.com.ar  ')).toBe('')
    for (const mal of ['juan', 'juan@', '@laparrilla.com', 'juan@laparrilla', 'juan perez@laparrilla.com', 'a@b@c.com']) {
      expect(errorDeEmail(mal), mal).toContain('Revisá el email')
    }
  })

  it('el email se manda sin espacios y en minúsculas, como lo guarda la API', () => {
    expect(emailParaInvitar('  Juan.Perez@LaParrilla.COM ')).toBe('juan.perez@laparrilla.com')
  })
})
