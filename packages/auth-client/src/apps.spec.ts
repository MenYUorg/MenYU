import { describe, expect, it } from 'vitest'
import { appDeUrl, appsDelPerfil, puedeIrA, tieneAcceso } from './apps'
import { perfil } from './test/authSimulado'

describe('appsDelPerfil', () => {
  it.each([
    ['OWNER', ['admin', 'staff']],
    ['GERENTE', ['admin', 'staff']],
    ['JEFE_SALON', ['staff']],
    ['MOZO', ['staff']],
    ['COCINA', ['staff']],
  ] as const)('%s entra a %j', (rol, apps) => {
    expect(appsDelPerfil(perfil([rol]))).toEqual(apps)
  })

  it('ROOT sin membresías entra solo a web-admin (su consola)', () => {
    expect(appsDelPerfil(perfil([], true))).toEqual(['admin'])
  })

  it('sin membresías ni ROOT no entra a ninguna: una cuenta de cliente no da acceso al personal', () => {
    expect(appsDelPerfil(perfil([]))).toEqual([])
  })

  it('un MOZO que además es ROOT entra a las dos', () => {
    expect(appsDelPerfil(perfil(['MOZO'], true))).toEqual(['admin', 'staff'])
  })

  it('tieneAcceso pregunta por una app', () => {
    expect(tieneAcceso(perfil(['MOZO']), 'staff')).toBe(true)
    expect(tieneAcceso(perfil(['MOZO']), 'admin')).toBe(false)
  })
})

describe('appDeUrl', () => {
  it.each([
    ['https://admin.menyu-app.com/admin', 'admin'],
    ['https://staff.staging.menyu-app.com/mozo', 'staff'],
    ['http://staff.menyu.local:5175/cocina', 'staff'],
    ['https://mesa.menyu-app.com/', 'cliente'],
    ['https://auth.menyu-app.com/', null],
    ['https://menyu-admin.vercel.app/', null],
    ['no es una url', null],
  ])('%s → %s', (url, app) => {
    expect(appDeUrl(url)).toBe(app)
  })
})

describe('puedeIrA', () => {
  it('un MOZO no puede ir a web-admin aunque se lo pidan', () => {
    expect(puedeIrA(perfil(['MOZO']), 'https://admin.menyu-app.com/admin')).toBe(false)
  })

  it('un GERENTE puede ir a web-staff', () => {
    expect(puedeIrA(perfil(['GERENTE']), 'https://staff.menyu-app.com/mozo')).toBe(true)
  })

  it('web-cliente no pide cuenta', () => {
    expect(puedeIrA(perfil(['COCINA']), 'https://mesa.menyu-app.com/')).toBe(true)
  })

  it('una URL que no es de una app no se acepta', () => {
    expect(puedeIrA(perfil(['OWNER']), 'https://auth.menyu-app.com/')).toBe(false)
  })
})
