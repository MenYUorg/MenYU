import { api } from './api'
import { reiniciarSesionDePrueba } from '../test/authClient'

vi.mock('@menyu/auth-client', async () => (await import('../test/authClient')).moduloSimulado())

const fetchFalso = vi.fn()

beforeEach(() => {
  fetchFalso.mockReset()
  fetchFalso.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ id: 'ped-1' }) } as Response)
  vi.stubGlobal('fetch', fetchFalso)
  reiniciarSesionDePrueba()
})

afterEach(() => vi.unstubAllGlobals())

const ultimaLlamada = () => {
  const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit]
  return { url, metodo: opciones.method, cuerpo: JSON.parse(opciones.body as string) as unknown }
}

describe('api.pedidos.cambiarEstado', () => {
  it('sin comanda manda solo el estado (el "Listo" de "Todas" o el avance de siempre)', async () => {
    await api.pedidos.cambiarEstado('ped-1', 'listo')

    expect(ultimaLlamada()).toEqual({ url: '/pedidos/ped-1/estado', metodo: 'PATCH', cuerpo: { estado: 'listo' } })
  })

  it('con comanda manda también comandaId', async () => {
    await api.pedidos.cambiarEstado('ped-1', 'listo', 'c-barra')

    expect(ultimaLlamada()).toEqual({ url: '/pedidos/ped-1/estado', metodo: 'PATCH', cuerpo: { estado: 'listo', comandaId: 'c-barra' } })
  })
})
