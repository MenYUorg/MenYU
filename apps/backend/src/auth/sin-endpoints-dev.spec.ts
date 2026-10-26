import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import * as request from 'supertest'
import { INestApplication } from '@nestjs/common'
import { PATH_METADATA } from '@nestjs/common/constants'
import { Test } from '@nestjs/testing'
import { AuthController } from './auth.controller'
import { SupabaseAuthGuard } from './guards/supabase-auth.guard'
import { AccesoService } from './supabase/acceso.service'

// Hubo cuatro endpoints `/auth/dev/*` sin ningún guard: creaban usuarios (incluso un ROOT con contraseña conocida y sus
// tokens) para quien los llamara. Se sacaron. Estas pruebas cuidan que no vuelvan, ni en el controller de auth ni en
// ningún otro.
describe('no hay endpoints de desarrollo', () => {
  describe('AuthController', () => {
    let app: INestApplication
    const mockAcceso = { perfil: jest.fn() }
    const permitir = { canActivate: () => true }

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [{ provide: AccesoService, useValue: mockAcceso }],
      })
        .overrideGuard(SupabaseAuthGuard).useValue(permitir)
        .compile()

      app = moduleRef.createNestApplication()
      await app.init()
    })

    afterAll(async () => {
      await app.close()
    })

    beforeEach(() => {
      jest.clearAllMocks()
      mockAcceso.perfil.mockResolvedValue({ email: 'a@b.com', esRoot: false, membresias: [] })
    })

    it.each(['seed', 'admin', 'mozo', 'root'])('POST /auth/dev/%s no existe', async (nombre) => {
      const res = await request(app.getHttpServer()).post(`/auth/dev/${nombre}`).send({})

      expect(res.status).toBe(404)
      expect(res.body.accessToken).toBeUndefined()
    })

    it('GET /auth/dev/root tampoco existe', async () => {
      const res = await request(app.getHttpServer()).get('/auth/dev/root')

      expect(res.status).toBe(404)
    })

    it('el 404 no es porque la prueba esté mal armada: una ruta de verdad (/auth/me) sí responde', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me')

      expect(res.status).toBe(200)
      expect(mockAcceso.perfil).toHaveBeenCalledTimes(1)
    })

    it('ninguna ruta del controller tiene "dev" en el camino', () => {
      const rutas = Object.getOwnPropertyNames(AuthController.prototype)
        .filter((nombre) => nombre !== 'constructor')
        .map((nombre) => String(Reflect.getMetadata(PATH_METADATA, AuthController.prototype[nombre as keyof AuthController]) ?? ''))

      expect(rutas.length).toBeGreaterThan(0)
      expect(rutas.filter((ruta) => /(^|\/)dev(\/|$)/i.test(ruta))).toEqual([])
    })

    it('el controller ya no tiene los métodos dev*', () => {
      const metodos = Object.getOwnPropertyNames(AuthController.prototype).filter((nombre) => /^dev[A-Z]/.test(nombre))

      expect(metodos).toEqual([])
    })
  })

  describe('todos los controllers', () => {
    const archivos = (carpeta: string): string[] =>
      readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
        const ruta = join(carpeta, e.name)
        if (e.isDirectory()) return archivos(ruta)
        return e.name.endsWith('.controller.ts') ? [ruta] : []
      })

    // Un decorador de ruta (`@Get`, `@Post`...) con un camino que es `dev` o empieza o termina con `dev/`.
    const RUTA_DEV = /@(Get|Post|Put|Patch|Delete|All|Controller)\(\s*['"`](?:[^'"`]*\/)?dev(?:\/[^'"`]*)?['"`]/i

    it('hay controllers para revisar', () => {
      expect(archivos(join(__dirname, '..')).length).toBeGreaterThan(10)
    })

    it('ninguno declara una ruta de desarrollo', () => {
      const conRutaDev = archivos(join(__dirname, '..')).filter((archivo) => RUTA_DEV.test(readFileSync(archivo, 'utf8')))

      expect(conRutaDev).toEqual([])
    })

    it('la búsqueda detecta una ruta dev si alguien la agregara', () => {
      expect(RUTA_DEV.test("@Post('dev/root')")).toBe(true)
      expect(RUTA_DEV.test('@Get("dev")')).toBe(true)
      expect(RUTA_DEV.test("@Post('auth/dev/admin')")).toBe(true)
      expect(RUTA_DEV.test("@Controller('dev')")).toBe(true)
      expect(RUTA_DEV.test("@Post('devices')")).toBe(false)
      expect(RUTA_DEV.test("@Post('login')")).toBe(false)
    })
  })
})
