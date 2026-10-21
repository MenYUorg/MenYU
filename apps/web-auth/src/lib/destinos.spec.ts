import type { MembresiaPerfil, PerfilUsuario, Rol } from '@menyu/types'
import { describe, expect, it } from 'vitest'
import { decidirDestino, urlsDeApps } from './destinos'

const marca = { id: 'marca-1', nombre: 'Marca', restaurantes: [{ id: 'rest-1', nombre: 'Restaurante' }] }
const restaurante = { id: 'rest-1', nombre: 'Restaurante', marcaId: 'marca-1', marca: { id: 'marca-1', nombre: 'Marca' } }

function membresia(rol: Rol): MembresiaPerfil {
  return rol === 'OWNER'
    ? { id: `m-${rol}`, rol, marca, restaurante: null }
    : { id: `m-${rol}`, rol, marca: null, restaurante }
}

function perfil(membresias: MembresiaPerfil[], esRoot = false): PerfilUsuario {
  return { id: 'u-1', email: 'a@b.com', nombre: 'A', esRoot, membresias }
}

describe('urlsDeApps', () => {
  it.each([
    ['auth.menyu-app.com', 'https:', 'https://admin.menyu-app.com', 'https://staff.menyu-app.com'],
    ['auth.staging.menyu-app.com', 'https:', 'https://admin.staging.menyu-app.com', 'https://staff.staging.menyu-app.com'],
    ['auth.menyu.local', 'http:', 'http://admin.menyu.local:5174', 'http://staff.menyu.local:5175'],
    ['localhost', 'http:', 'http://localhost:5174', 'http://localhost:5175'],
  ])('desde %s', (hostname, protocolo, admin, staff) => {
    expect(urlsDeApps(hostname, protocolo)).toEqual({ admin, staff })
  })
})

describe('decidirDestino', () => {
  const urls = urlsDeApps('auth.menyu-app.com', 'https:')

  it.each([
    ['OWNER', 'https://admin.menyu-app.com/admin?marcaId=marca-1'],
    ['GERENTE', 'https://admin.menyu-app.com/admin?restauranteId=rest-1'],
    ['JEFE_SALON', 'https://staff.menyu-app.com/mozo?restauranteId=rest-1'],
    ['MOZO', 'https://staff.menyu-app.com/mozo?restauranteId=rest-1'],
    ['COCINA', 'https://staff.menyu-app.com/cocina?restauranteId=rest-1'],
  ] as const)('%s va a su app', (rol, url) => {
    expect(decidirDestino(perfil([membresia(rol)]), null, urls)).toEqual({ tipo: 'ir', url })
  })

  it('ROOT sin membresías va a web-admin', () => {
    expect(decidirDestino(perfil([], true), null, urls)).toEqual({ tipo: 'ir', url: 'https://admin.menyu-app.com/admin' })
  })

  it('con más de un lugar muestra el selector', () => {
    const destino = decidirDestino(perfil([membresia('MOZO')], true), null, urls)
    expect(destino.tipo).toBe('elegir')
    expect(destino.tipo === 'elegir' && destino.opciones.map((o) => o.lugar)).toEqual([
      'Administración de MenYU',
      'Restaurante',
    ])
  })

  it('con un redirect válido va ahí', () => {
    const redirect = 'https://admin.menyu-app.com/admin/menu'
    expect(decidirDestino(perfil([membresia('GERENTE'), membresia('OWNER')]), redirect, urls)).toEqual({
      tipo: 'ir',
      url: redirect,
    })
  })

  it('un redirect a una app que no le toca se ignora: un MOZO va a web-staff, no vuelve a web-admin', () => {
    expect(decidirDestino(perfil([membresia('MOZO')]), 'https://admin.menyu-app.com/admin/menu', urls)).toEqual({
      tipo: 'ir',
      url: 'https://staff.menyu-app.com/mozo?restauranteId=rest-1',
    })
  })

  it('un GERENTE puede volver a web-staff por el redirect', () => {
    const redirect = 'https://staff.menyu-app.com/mozo/mesas'
    expect(decidirDestino(perfil([membresia('GERENTE')]), redirect, urls)).toEqual({ tipo: 'ir', url: redirect })
  })

  it('con un redirect que no le toca y varios lugares, muestra el selector', () => {
    const destino = decidirDestino(perfil([membresia('MOZO')], true), 'https://staff.menyu-app.com/mozo', urls)
    expect(destino).toEqual({ tipo: 'ir', url: 'https://staff.menyu-app.com/mozo' })
    expect(decidirDestino(perfil([membresia('COCINA'), membresia('MOZO')]), 'https://admin.menyu-app.com/', urls).tipo).toBe(
      'elegir',
    )
  })

  it('sin membresías ni ROOT no tiene acceso, aunque haya redirect', () => {
    expect(decidirDestino(perfil([]), 'https://admin.menyu-app.com/', urls)).toEqual({ tipo: 'sin-acceso' })
  })
})
