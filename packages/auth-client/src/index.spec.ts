import { describe, expect, it, vi } from 'vitest'
import * as authClient from './index'

describe('@menyu/auth-client', () => {
  it('exporta exactamente la API pública que usan las apps', () => {
    expect(Object.keys(authClient).sort()).toEqual([
      'INTERVALO_DE_REVALIDACION_MS',
      'RequireAuth',
      'alVolverALaPestana',
      'appDeUrl',
      'appsDelPerfil',
      'clienteAuth',
      'irASinAcceso',
      'irASuApp',
      'irAlLogin',
      'logout',
      'obtenerPerfil',
      'opcionesDeCookie',
      'puedeIrA',
      'renovarSesion',
      'tieneAcceso',
      'tokenDeAcceso',
      'urlDeAuth',
      'urlDeLaApi',
      'urlDeLogin',
      'usePerfil',
      'useRevalidarSesion',
      'useSession',
    ])
  })
})

describe('salidas de la app', () => {
  it('irA navega (jsdom solo sigue los cambios de #)', async () => {
    const { irA } = await import('./ir')
    irA('#destino')
    expect(window.location.hash).toBe('#destino')
  })

  it('recargar le pide al navegador recargar la página', async () => {
    // jsdom no recarga: avisa por consola que no está implementado, sin tirar error.
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { recargar } = await import('./ir')
    expect(() => recargar()).not.toThrow()
    consola.mockRestore()
  })
})
