import {
  BAJA_CORTA_EL_ACCESO,
  OPCIONES_DE_TIPO,
  avisoDeMarcaDeBaja,
  efectosDeBajaDeMarca,
  efectosDeBajaDeRestaurante,
  efectosDeReactivarMarca,
  efectosDeReactivarRestaurante,
  etiquetaDeAccion,
  etiquetaDeTipo,
} from './copy'

const textoDe = (pares: Array<[string, string]>) => pares.map(([a, b]) => a + b).join(' ')

describe('etiquetaDeAccion', () => {
  it.each([
    ['MARCA_CREAR', 'Creó la marca'],
    ['MARCA_BAJA', 'Dio de baja la marca'],
    ['RESTAURANTE_REACTIVAR', 'Reactivó el restaurante'],
    ['DUENO_ELIMINAR', 'Eliminó la cuenta de dueño'],
    ['ROOT_CREAR', 'Creó la cuenta ROOT'],
  ])('traduce %s', (codigo, texto) => {
    expect(etiquetaDeAccion(codigo)).toBe(texto)
  })

  it('muestra tal cual un código que todavía no conoce, sin romper', () => {
    expect(etiquetaDeAccion('INVITACION_ENVIAR')).toBe('INVITACION_ENVIAR')
    expect(etiquetaDeAccion('')).toBe('')
  })

  it('no confunde un código con una propiedad de Object', () => {
    expect(etiquetaDeAccion('constructor')).toBe('constructor')
    expect(etiquetaDeAccion('toString')).toBe('toString')
  })
})

describe('etiquetaDeTipo y opciones del filtro', () => {
  it('traduce los tipos y deja pasar los desconocidos', () => {
    expect(etiquetaDeTipo('OWNER')).toBe('Dueño')
    expect(etiquetaDeTipo('RESTAURANTE')).toBe('Restaurante')
    expect(etiquetaDeTipo('MEMBRESIA')).toBe('MEMBRESIA')
  })

  it('el filtro arranca en "Todo" (valor vacío) y cubre los cuatro tipos', () => {
    expect(OPCIONES_DE_TIPO[0]).toEqual({ valor: '', texto: 'Todo' })
    expect(OPCIONES_DE_TIPO.map((o) => o.valor)).toEqual(['', 'MARCA', 'RESTAURANTE', 'OWNER', 'ROOT'])
  })
})

describe('textos de la baja', () => {
  it('hoy la baja no corta el acceso (cuando eso cambie, se activa el interruptor y este test avisa)', () => {
    expect(BAJA_CORTA_EL_ACCESO).toBe(false)
  })

  it('con el interruptor apagado no promete lo que todavía no pasa', () => {
    const marca = textoDe(efectosDeBajaDeMarca(2, false))
    expect(marca).toContain('Discovery')
    expect(marca).toContain('Por ahora no se corta nada más')
    expect(marca).not.toMatch(/no pueden iniciar sesión/)
    expect(textoDe(efectosDeBajaDeRestaurante(false))).toContain('Por ahora no se corta nada más')
    expect(textoDe(avisoDeMarcaDeBaja(false))).toContain('Por ahora el resto sigue funcionando')
    expect(efectosDeReactivarMarca(false).join(' ')).toContain('No cambia nada más')
    expect(efectosDeReactivarRestaurante(false)).toContain('No cambia nada más')
  })

  it('con el interruptor encendido muestra los textos del diseño aprobado', () => {
    const marca = textoDe(efectosDeBajaDeMarca(2, true))
    expect(marca).toContain('no se ve su carta')
    expect(marca).toContain('no pueden iniciar sesión')
    expect(marca).not.toContain('Por ahora')
    expect(textoDe(efectosDeBajaDeRestaurante(true))).toContain('no pueden iniciar sesión')
    expect(textoDe(avisoDeMarcaDeBaja(true))).toContain('su dueño no puede iniciar sesión')
    expect(efectosDeReactivarMarca(true).join(' ')).toContain('pueden iniciar sesión de nuevo')
    expect(efectosDeReactivarRestaurante(true)).toContain('pueden iniciar sesión de nuevo')
  })

  it.each([false, true])('cuenta bien los restaurantes de la marca (interruptor %s)', (corta) => {
    expect(efectosDeBajaDeMarca(1, corta)[0][0]).toMatch(/^1 restaurante deja/)
    expect(efectosDeBajaDeMarca(3, corta)[0][0]).toMatch(/^3 restaurantes dejan/)
    expect(efectosDeBajaDeMarca(0, corta)[0][0]).toMatch(/^0 restaurantes dejan/)
  })

  it.each([false, true])('siempre aclara que no se borra ningún dato (interruptor %s)', (corta) => {
    expect(textoDe(efectosDeBajaDeMarca(2, corta))).toContain('No se borra ningún dato')
    expect(textoDe(efectosDeBajaDeRestaurante(corta))).toContain('No se borra ningún dato')
    expect(textoDe(avisoDeMarcaDeBaja(corta))).toContain('No se borró ningún dato')
  })
})
