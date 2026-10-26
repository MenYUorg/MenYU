import { CryptoService } from './crypto.service'

// Cifra los access tokens de Mercado Pago de cada restaurante (AES-256-GCM). Se usa el crypto real.
describe('CryptoService', () => {
  const entorno = process.env
  const crear = (clave: string | undefined) => {
    process.env = { ...entorno, MP_ENCRYPTION_KEY: clave }
    return new CryptoService()
  }

  afterEach(() => {
    process.env = entorno
  })

  it('lo que cifra lo descifra igual', () => {
    // Arrange
    const crypto = crear('clave-de-test')

    // Act
    const descifrado = crypto.decrypt(crypto.encrypt('APP_USR-123-token'))

    // Assert
    expect(descifrado).toBe('APP_USR-123-token')
  })

  it('el mismo texto cifrado dos veces da resultados distintos (IV aleatorio) y no contiene el texto', () => {
    // Arrange
    const crypto = crear('clave-de-test')

    // Act
    const a = crypto.encrypt('APP_USR-123-token')
    const b = crypto.encrypt('APP_USR-123-token')

    // Assert
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[0-9a-f]+$/)
    expect(Buffer.from(a, 'hex').toString('utf8')).not.toContain('APP_USR')
  })

  it('un cifrado modificado no se descifra (GCM verifica la integridad)', () => {
    // Arrange
    const crypto = crear('clave-de-test')
    const cifrado = crypto.encrypt('APP_USR-123-token')
    const ultimo = cifrado.slice(-2) === '00' ? '01' : '00'
    const adulterado = cifrado.slice(0, -2) + ultimo

    // Act
    const descifrar = () => crypto.decrypt(adulterado)

    // Assert
    expect(descifrar).toThrow()
  })

  it('con otra clave no se puede descifrar', () => {
    // Arrange
    const cifrado = crear('clave-de-test').encrypt('APP_USR-123-token')
    const otra = crear('otra-clave')

    // Act
    const descifrar = () => otra.decrypt(cifrado)

    // Assert
    expect(descifrar).toThrow()
  })

  it('sin MP_ENCRYPTION_KEY no arranca', () => {
    // Act
    const crearSinClave = () => crear(undefined)

    // Assert
    expect(crearSinClave).toThrow('MP_ENCRYPTION_KEY no está definida')
  })
})
