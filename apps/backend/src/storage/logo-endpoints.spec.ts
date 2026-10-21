import { Type } from '@nestjs/common'
import { MarcaController } from '../marca/marca.controller'
import { MarcaService } from '../marca/marca.service'
import { RestauranteController } from '../restaurante/restaurante.controller'
import { RestauranteService } from '../restaurante/restaurante.service'
import { AppDeEndpoints, CUENTAS, crearAppDeEndpoints, MUNDO, SIN_USUARIO } from '../test/app-endpoints'
import { UsuarioAutenticado } from '../auth/supabase/usuario-autenticado'
import { LOGO_MAX_BYTES } from './logo-upload'

// Bytes mínimos con la firma ("magic number") de cada formato: el validador mira el contenido, no el nombre.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
  Buffer.from('JFIF'),
  Buffer.alloc(32),
])
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(32),
])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')

interface Archivo {
  contenido: Buffer
  nombre: string
  tipo: string
}

// El logo es solo del OWNER de la marca. En los restaurantes lo exige la ruta (`@RequiereRolEn` con :id); en las marcas,
// el service (marca.service.spec). Acá: la autenticación y la validación del archivo.
describe.each([
  { nombre: 'marcas', controller: MarcaController as Type<unknown>, service: MarcaService, id: MUNDO.MARCA_A, pasaLaCuenta: true },
  { nombre: 'restaurantes', controller: RestauranteController as Type<unknown>, service: RestauranteService, id: MUNDO.REST_1, pasaLaCuenta: false },
])('endpoints de logo de $nombre', ({ nombre, controller, service, id, pasaLaCuenta }) => {
  let api: AppDeEndpoints
  const mockService = { uploadLogo: jest.fn(), removeLogo: jest.fn() }
  const ruta = `/${nombre}/${id}/logo`

  beforeAll(async () => {
    api = await crearAppDeEndpoints(controller, [{ provide: service, useValue: mockService }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => {
    jest.clearAllMocks()
    mockService.uploadLogo.mockResolvedValue({ id, logoUrl: 'https://storage/logo?v=1' })
    mockService.removeLogo.mockResolvedValue({ id, logoUrl: null })
  })

  function subir(cuenta: UsuarioAutenticado | typeof SIN_USUARIO | undefined, archivo: Archivo | null) {
    let req = api.pedir('post', ruta, { cuenta })
    if (archivo) {
      req = req.attach('logo', archivo.contenido, { filename: archivo.nombre, contentType: archivo.tipo })
    }
    return req
  }

  describe('POST (subir)', () => {
    it.each([
      ['PNG', PNG, 'logo.png', 'image/png'],
      ['JPEG', JPEG, 'logo.jpg', 'image/jpeg'],
      ['WebP', WEBP, 'logo.webp', 'image/webp'],
    ])('el OWNER sube un %s válido', async (_formato, contenido, nombreArchivo, tipo) => {
      const res = await subir(CUENTAS.OWNER_A, { contenido, nombre: nombreArchivo, tipo })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ id, logoUrl: 'https://storage/logo?v=1' })
      const argumentos = mockService.uploadLogo.mock.calls[0]
      expect(argumentos[0]).toBe(id)
      expect(argumentos[1]).toEqual(expect.objectContaining({ mimetype: tipo, originalname: nombreArchivo }))
      // Solo las marcas le pasan la cuenta al service, que exige ser OWNER de la marca.
      expect(argumentos[2]).toEqual(pasaLaCuenta ? CUENTAS.OWNER_A : undefined)
    })

    it('rechaza un SVG con 400', async () => {
      const res = await subir(CUENTAS.OWNER_A, { contenido: SVG, nombre: 'logo.svg', tipo: 'image/svg+xml' })

      expect(res.status).toBe(400)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })

    it('rechaza un archivo que dice ser PNG pero tiene otro contenido', async () => {
      const res = await subir(CUENTAS.OWNER_A, {
        contenido: Buffer.from('esto no es una imagen'),
        nombre: 'logo.png',
        tipo: 'image/png',
      })

      expect(res.status).toBe(400)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })

    it('acepta un archivo de exactamente 2 MB', async () => {
      const contenido = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES - PNG.length)])

      const res = await subir(CUENTAS.OWNER_A, { contenido, nombre: 'logo.png', tipo: 'image/png' })

      expect(res.status).toBe(201)
    })

    it('rechaza un archivo de más de 2 MB con 413', async () => {
      const contenido = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES + 1 - PNG.length)])

      const res = await subir(CUENTAS.OWNER_A, { contenido, nombre: 'logo.png', tipo: 'image/png' })

      expect(res.status).toBe(413)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })

    it('rechaza con 400 si no se envía ningún archivo', async () => {
      const res = await subir(CUENTAS.OWNER_A, null)

      expect(res.status).toBe(400)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })

    it.each([
      ['sin token', undefined, 401],
      ['una cuenta de Supabase sin Usuario', SIN_USUARIO, 403],
    ] as const)('%s recibe %i', async (_caso, cuenta, estado) => {
      const res = await subir(cuenta, { contenido: PNG, nombre: 'logo.png', tipo: 'image/png' })

      expect(res.status).toBe(estado)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })
  })

  describe('DELETE (quitar)', () => {
    it('el OWNER quita el logo', async () => {
      const res = await api.pedir('delete', ruta, { cuenta: CUENTAS.OWNER_A })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id, logoUrl: null })
      expect(mockService.removeLogo).toHaveBeenCalledWith(...(pasaLaCuenta ? [id, CUENTAS.OWNER_A] : [id]))
    })

    it('sin token recibe 401', async () => {
      const res = await api.pedir('delete', ruta)

      expect(res.status).toBe(401)
      expect(mockService.removeLogo).not.toHaveBeenCalled()
    })
  })
})

describe('el logo de un restaurante: solo el OWNER de su marca, lo exige la ruta', () => {
  let api: AppDeEndpoints
  const restaurantes = { uploadLogo: jest.fn(), removeLogo: jest.fn() }

  beforeAll(async () => {
    api = await crearAppDeEndpoints(RestauranteController, [{ provide: RestauranteService, useValue: restaurantes }])
  })

  afterAll(() => api.cerrar())

  beforeEach(() => jest.clearAllMocks())

  it.each([
    ['ROOT', CUENTAS.ROOT],
    ['el GERENTE', CUENTAS.GERENTE],
    ['el OWNER de otra marca', CUENTAS.OWNER_B],
  ])('%s recibe 403 al subirlo y al quitarlo', async (_caso, cuenta) => {
    const subida = await api
      .pedir('post', `/restaurantes/${MUNDO.REST_1}/logo`, { cuenta })
      .attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' })
    const baja = await api.pedir('delete', `/restaurantes/${MUNDO.REST_1}/logo`, { cuenta })

    expect([subida.status, baja.status]).toEqual([403, 403])
    expect(restaurantes.uploadLogo).not.toHaveBeenCalled()
    expect(restaurantes.removeLogo).not.toHaveBeenCalled()
  })
})
