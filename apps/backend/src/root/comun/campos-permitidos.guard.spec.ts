import { BadRequestException, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { CamposPermitidos, CamposPermitidosGuard } from './campos-permitidos.guard'

class Falso {
  @CamposPermitidos(['nombre'], 'La dirección la decide el dueño.')
  conRestriccion() {}

  @CamposPermitidos(['nombre', 'slug'])
  sinMotivo() {}

  sinDecorador() {}
}

function contexto(metodo: keyof Falso, body: unknown): ExecutionContext {
  return {
    getHandler: () => Falso.prototype[metodo],
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext
}

describe('CamposPermitidosGuard', () => {
  const guard = new CamposPermitidosGuard(new Reflector())

  it('deja pasar un cuerpo con solo los campos admitidos (o con menos)', () => {
    expect(guard.canActivate(contexto('conRestriccion', { nombre: 'X' }))).toBe(true)
    expect(guard.canActivate(contexto('sinMotivo', { slug: 'x' }))).toBe(true)
    expect(guard.canActivate(contexto('conRestriccion', {}))).toBe(true)
  })

  it('responde 400 si llega un campo que no está admitido, y dice cuál y cuáles se admiten', () => {
    const probar = () => guard.canActivate(contexto('conRestriccion', { nombre: 'X', direccion: 'Y', logoUrl: 'Z' }))

    expect(probar).toThrow(BadRequestException)
    expect(probar).toThrow(/direccion, logoUrl/)
    expect(probar).toThrow(/admitidos son: nombre/)
  })

  it('suma el motivo cuando la ruta lo tiene', () => {
    expect(() => guard.canActivate(contexto('conRestriccion', { direccion: 'Y' }))).toThrow(/La dirección la decide el dueño\./)
    expect(() => guard.canActivate(contexto('sinMotivo', { direccion: 'Y' }))).not.toThrow(/dueño/)
  })

  it('un campo con valor undefined o null también cuenta como enviado (la clave está en el cuerpo)', () => {
    expect(() => guard.canActivate(contexto('conRestriccion', { nombre: 'X', direccion: null }))).toThrow(BadRequestException)
  })

  it('no mira las rutas sin el decorador', () => {
    expect(guard.canActivate(contexto('sinDecorador', { cualquier: 'cosa' }))).toBe(true)
  })

  it.each([undefined, null, 'texto', 42, ['nombre', 'otro']])('un cuerpo que no es un objeto (%j) no es asunto de este guard', (body) => {
    expect(guard.canActivate(contexto('conRestriccion', body))).toBe(true)
  })

  it('distingue mayúsculas: `Nombre` no es `nombre`', () => {
    expect(() => guard.canActivate(contexto('conRestriccion', { Nombre: 'X' }))).toThrow(BadRequestException)
  })
})
