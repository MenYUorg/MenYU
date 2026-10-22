import {
  BAJA_CORTA_EL_LOGIN,
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
    // Las de las invitaciones (entrega 4.4 de auth).
    ['DUENO_INVITAR', 'Invitó al dueño'],
    ['DUENO_QUITAR', 'Quitó al dueño'],
    ['ROOT_INVITAR', 'Invitó a la cuenta ROOT'],
    ['ROOT_PROMOVER', 'Hizo ROOT a la cuenta'],
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
  it('la baja corta el acceso de la gente de la marca o el restaurante (AccesoService, desde la Fase 4 de auth)', () => {
    expect(BAJA_CORTA_EL_LOGIN).toBe(true)
  })

  it('con el interruptor apagado dice que lo público se corta y que el login todavía no', () => {
    const marca = textoDe(efectosDeBajaDeMarca(2, false))
    expect(marca).toContain('Discovery')
    expect(marca).toContain('no se ve su carta')
    expect(marca).toContain('no abren mesas nuevas')
    expect(marca).toContain('Las mesas que ya están abiertas se pueden terminar')
    expect(marca).toContain('siguen pudiendo iniciar sesión')
    expect(marca).not.toMatch(/no pueden iniciar sesión/)
    expect(marca).not.toContain('Por ahora no se corta nada más')
    const restaurante = textoDe(efectosDeBajaDeRestaurante(false))
    expect(restaurante).toContain('no abren mesas nuevas')
    expect(restaurante).toContain('siguen pudiendo iniciar sesión')
    expect(textoDe(avisoDeMarcaDeBaja(false))).toContain('Su gente todavía puede iniciar sesión')
    expect(efectosDeReactivarMarca(false).join(' ')).toContain('vuelven a Discovery, a mostrar su carta y a abrir mesas')
    expect(efectosDeReactivarMarca(false).join(' ')).toContain('no se había cortado')
    expect(efectosDeReactivarRestaurante(false)).toContain('no se había cortado')
  })

  it('con el interruptor encendido también promete el corte del login, como el diseño aprobado', () => {
    const marca = textoDe(efectosDeBajaDeMarca(2, true))
    expect(marca).toContain('no se ve su carta')
    expect(marca).toContain('no pueden iniciar sesión')
    expect(marca).not.toContain('siguen pudiendo')
    expect(textoDe(efectosDeBajaDeRestaurante(true))).toContain('no pueden iniciar sesión')
    expect(textoDe(avisoDeMarcaDeBaja(true))).toContain('Su dueño no puede iniciar sesión')
    expect(efectosDeReactivarMarca(true).join(' ')).toContain('pueden iniciar sesión de nuevo')
    expect(efectosDeReactivarRestaurante(true)).toContain('pueden iniciar sesión de nuevo')
  })

  it.each([false, true])('cuenta bien los restaurantes de la marca (interruptor %s)', (corta) => {
    expect(efectosDeBajaDeMarca(1, corta)[0][0]).toMatch(/^1 restaurante deja/)
    expect(efectosDeBajaDeMarca(3, corta)[0][0]).toMatch(/^3 restaurantes dejan/)
    expect(efectosDeBajaDeMarca(0, corta)[0][0]).toMatch(/^0 restaurantes dejan/)
  })

  it.each([false, true])('siempre aclara que no se borra ningún dato y qué pasa con las mesas abiertas (interruptor %s)', (corta) => {
    const mesasAbiertas = corta
      ? 'Las mesas que ya están abiertas solo pueden pagar con Mercado Pago desde el celular'
      : 'Las mesas que ya están abiertas se pueden terminar'
    expect(textoDe(efectosDeBajaDeMarca(2, corta))).toContain('No se borra ningún dato')
    expect(textoDe(efectosDeBajaDeMarca(2, corta))).toContain(mesasAbiertas)
    expect(textoDe(efectosDeBajaDeRestaurante(corta))).toContain('No se borra ningún dato')
    expect(textoDe(efectosDeBajaDeRestaurante(corta))).toContain(mesasAbiertas)
    expect(textoDe(avisoDeMarcaDeBaja(corta))).toContain('No se borró ningún dato')
  })

  // La decisión de la entrega 4.5: con el acceso cortado, el personal no puede cobrar ni cerrar una mesa abierta.
  it('con el acceso cortado, las mesas abiertas solo pagan con Mercado Pago y no prometen que el personal las termine', () => {
    for (const texto of [textoDe(efectosDeBajaDeMarca(2, true)), textoDe(efectosDeBajaDeRestaurante(true))]) {
      expect(texto).toContain('solo pueden pagar con Mercado Pago desde el celular')
      expect(texto).toContain('el personal tampoco puede cobrarlas ni cerrarlas')
      expect(texto).not.toContain('se sigue pidiendo la cuenta y cobrando')
    }
    expect(textoDe(avisoDeMarcaDeBaja(true))).toContain('solo pueden pagar con Mercado Pago desde el celular')
    expect(textoDe(avisoDeMarcaDeBaja(false))).toContain('las que ya están abiertas se terminan')
  })

  it.each([false, true])('cada viñeta tiene un encabezado distinto (se usa como clave de la lista) (interruptor %s)', (corta) => {
    for (const pares of [efectosDeBajaDeMarca(2, corta), efectosDeBajaDeRestaurante(corta)]) {
      const encabezados = pares.map(([fuerte]) => fuerte)
      expect(new Set(encabezados).size).toBe(encabezados.length)
    }
  })
})
