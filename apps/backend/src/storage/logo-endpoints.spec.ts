import * as request from 'supertest'
import { ExecutionContext, INestApplication, Type, UnauthorizedException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { MarcaController } from '../marca/marca.controller'
import { MarcaService } from '../marca/marca.service'
import { RestauranteController } from '../restaurante/restaurante.controller'
import { RestauranteService } from '../restaurante/restaurante.service'
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

const USUARIOS = {
  OWNER: { sub: 'admin-1', tipo: 'admin', rol: 'OWNER' },
  GERENTE: { sub: 'gerente-1', tipo: 'admin', rol: 'GERENTE' },
  ROOT: { sub: 'root-1', tipo: 'admin', rol: 'ROOT' },
}

// Reemplaza al guard de JWT: toma el usuario de un header de prueba. El RolesGuard y los roles de los
// endpoints son los reales, que es lo que se quiere verificar.
const autenticacionFalsa = {
  canActivate: (context: ExecutionContext) => {
    const req = context.switchToHttp().getRequest()
    const header = req.headers['x-test-user']
    if (!header) throw new UnauthorizedException()
    req.user = JSON.parse(header as string)
    return true
  },
}

interface Archivo {
  contenido: Buffer
  nombre: string
  tipo: string
}

describe.each([
  { nombre: 'marcas', controller: MarcaController as Type<unknown>, service: MarcaService },
  { nombre: 'restaurantes', controller: RestauranteController as Type<unknown>, service: RestauranteService },
])('endpoints de logo de $nombre', ({ nombre, controller, service }) => {
  let app: INestApplication
  const mockService = { uploadLogo: jest.fn(), removeLogo: jest.fn() }
  const ruta = `/${nombre}/id-1/logo`

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [controller],
      providers: [{ provide: service, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(autenticacionFalsa)
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockService.uploadLogo.mockResolvedValue({ id: 'id-1', logoUrl: 'https://storage/logo?v=1' })
    mockService.removeLogo.mockResolvedValue({ id: 'id-1', logoUrl: null })
  })

  function subir(usuario: object | null, archivo: Archivo | null) {
    let req = request(app.getHttpServer()).post(ruta)
    if (usuario) req = req.set('x-test-user', JSON.stringify(usuario))
    if (archivo) {
      req = req.attach('logo', archivo.contenido, {
        filename: archivo.nombre,
        contentType: archivo.tipo,
      })
    }
    return req
  }

  function quitar(usuario: object | null) {
    let req = request(app.getHttpServer()).delete(ruta)
    if (usuario) req = req.set('x-test-user', JSON.stringify(usuario))
    return req
  }

  describe('POST (subir)', () => {
    it.each([
      ['PNG', PNG, 'logo.png', 'image/png'],
      ['JPEG', JPEG, 'logo.jpg', 'image/jpeg'],
      ['WebP', WEBP, 'logo.webp', 'image/webp'],
    ])('el OWNER sube un %s válido', async (_formato, contenido, nombreArchivo, tipo) => {
      const res = await subir(USUARIOS.OWNER, { contenido, nombre: nombreArchivo, tipo })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ id: 'id-1', logoUrl: 'https://storage/logo?v=1' })
      expect(mockService.uploadLogo).toHaveBeenCalledWith(
        'id-1',
        expect.objectContaining({ mimetype: tipo, originalname: nombreArchivo }),
        expect.objectContaining({ rol: 'OWNER' }),
      )
    })

    it('rechaza un SVG con 400', async () => {
      const res = await subir(USUARIOS.OWNER, { contenido: SVG, nombre: 'logo.svg', tipo: 'image/svg+xml' })

      expect(res.status).toBe(400)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })

    it('rechaza un archivo que dice ser PNG pero tiene otro contenido', async () => {
      const res = await subir(USUARIOS.OWNER, {
        contenido: Buffer.from('esto no es una imagen'),
        nombre: 'logo.png',
        tipo: 'image/png',
      })

      expect(res.status).toBe(400)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })

    it('acepta un archivo de exactamente 2 MB', async () => {
      const contenido = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES - PNG.length)])

      const res = await subir(USUARIOS.OWNER, { contenido, nombre: 'logo.png', tipo: 'image/png' })

      expect(res.status).toBe(201)
    })

    it('rechaza un archivo de más de 2 MB con 413', async () => {
      const contenido = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES + 1 - PNG.length)])

      const res = await subir(USUARIOS.OWNER, { contenido, nombre: 'logo.png', tipo: 'image/png' })

      expect(res.status).toBe(413)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })

    it('rechaza con 400 si no se envía ningún archivo', async () => {
      const res = await subir(USUARIOS.OWNER, null)

      expect(res.status).toBe(400)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })

    it.each([
      ['ROOT', USUARIOS.ROOT],
      ['GERENTE', USUARIOS.GERENTE],
    ])('%s recibe 403 (solo el OWNER puede)', async (_rol, usuario) => {
      const res = await subir(usuario, { contenido: PNG, nombre: 'logo.png', tipo: 'image/png' })

      expect(res.status).toBe(403)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })

    it('sin sesión recibe 401', async () => {
      const res = await subir(null, { contenido: PNG, nombre: 'logo.png', tipo: 'image/png' })

      expect(res.status).toBe(401)
      expect(mockService.uploadLogo).not.toHaveBeenCalled()
    })
  })

  describe('DELETE (quitar)', () => {
    it('el OWNER quita el logo', async () => {
      const res = await quitar(USUARIOS.OWNER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 'id-1', logoUrl: null })
      expect(mockService.removeLogo).toHaveBeenCalledWith(
        'id-1',
        expect.objectContaining({ rol: 'OWNER' }),
      )
    })

    it.each([
      ['ROOT', USUARIOS.ROOT],
      ['GERENTE', USUARIOS.GERENTE],
    ])('%s recibe 403 (solo el OWNER puede)', async (_rol, usuario) => {
      const res = await quitar(usuario)

      expect(res.status).toBe(403)
      expect(mockService.removeLogo).not.toHaveBeenCalled()
    })

    it('sin sesión recibe 401', async () => {
      const res = await quitar(null)

      expect(res.status).toBe(401)
      expect(mockService.removeLogo).not.toHaveBeenCalled()
    })
  })
})
