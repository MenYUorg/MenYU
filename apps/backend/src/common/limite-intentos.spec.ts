import { HttpException } from '@nestjs/common'
import { LimiteIntentos } from './limite-intentos'

const MINUTO = 60_000

describe('LimiteIntentos', () => {
  let limite: LimiteIntentos

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-18T20:00:00.000Z') })
    limite = new LimiteIntentos({ maxFallos: 3, ventanaMs: 10 * MINUTO, bloqueoMs: 15 * MINUTO })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('al llegar al máximo de fallos, verificar responde 429', () => {
    // Arrange
    for (let i = 0; i < 3; i++) limite.registrarFallo('rest-1')

    // Act
    const verificar = () => limite.verificar('rest-1')

    // Assert
    expect(verificar).toThrow(HttpException)
    try {
      verificar()
    } catch (e) {
      expect((e as HttpException).getStatus()).toBe(429)
    }
  })

  it('con el último minuto de bloqueo, el mensaje va en singular', () => {
    // Arrange
    for (let i = 0; i < 3; i++) limite.registrarFallo('rest-1')
    jest.setSystemTime(Date.now() + 14.5 * MINUTO)

    // Act
    const verificar = () => limite.verificar('rest-1')

    // Assert
    expect(verificar).toThrow('Demasiados intentos fallidos. Probá de nuevo en 1 minuto.')
  })

  it('purga las claves con la ventana vencida y sin bloqueo vigente, para que el mapa no crezca sin límite', () => {
    // Arrange
    limite.registrarFallo('rest-1')
    limite.registrarFallo('rest-2')
    jest.setSystemTime(Date.now() + 10 * MINUTO)

    // Act
    limite.registrarFallo('rest-3')

    // Assert
    expect(limite.claves).toBe(1)
  })

  it('no purga una clave con el bloqueo todavía vigente', () => {
    // Arrange
    for (let i = 0; i < 3; i++) limite.registrarFallo('rest-1')
    jest.setSystemTime(Date.now() + 11 * MINUTO) // ventana vencida, bloqueo vigente (15 min)

    // Act
    limite.registrarFallo('rest-2')

    // Assert
    expect(limite.claves).toBe(2)
    expect(() => limite.verificar('rest-1')).toThrow(HttpException)
  })
})
