import * as request from 'supertest'
import { Controller, Get, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { Rol } from '@prisma/client'
import { createLocalJWKSet, exportJWK, generateKeyPair, KeyLike, SignJWT } from 'jose'
import { PrismaModule } from '../../prisma/prisma.module'
import { PrismaService } from '../../prisma/prisma.service'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../../test/prisma-mock'
import { RequiereRol } from '../decorators/requiere-rol.decorator'
import { SupabaseAuthModule } from './supabase-auth.module'
import { JWKS_SUPABASE } from './verificador-token.service'

// Tests de la Fase 2 de docs/auth/specs/auth.md: SupabaseAuthGuard + MembresiaGuard sobre una ruta de
// prueba que solo existe acá. Los tokens se firman con un par de claves propio; su clave pública es el
// JWKS del "proyecto" (en producción, el de Supabase).

const SUPABASE_URL = 'https://proyecto-test.supabase.co'
const SUPABASE_USER_ID = '6f1c2a40-2222-4a1b-9c3d-000000000001'
const REST_ID = 'rest-1'
const USUARIO = {
  id: 'usuario-1',
  supabaseUserId: SUPABASE_USER_ID,
  email: 'ana@menyu.com',
  nombre: 'Ana',
  esRoot: false,
  activo: true,
}

@Controller('prueba')
class PruebaController {
  @Get(':restauranteId')
  @RequiereRol('OWNER', 'GERENTE')
  ver() {
    return { ok: true }
  }
}

describe('SupabaseAuthGuard + MembresiaGuard', () => {
  let app: INestApplication
  let prisma: PrismaMock
  let claveDelProyecto: KeyLike
  let claveDeOtroProyecto: KeyLike
  const supabaseUrlOriginal = process.env.SUPABASE_URL

  beforeAll(async () => {
    process.env.SUPABASE_URL = SUPABASE_URL
    const par = await generateKeyPair('ES256')
    claveDelProyecto = par.privateKey
    claveDeOtroProyecto = (await generateKeyPair('ES256')).privateKey
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(par.publicKey)), kid: 'clave-del-proyecto' }] })

    prisma = crearPrismaMock()
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, SupabaseAuthModule],
      controllers: [PruebaController],
    })
      .overrideProvider(PrismaService)
      .useValue(comoPrisma(prisma))
      .overrideProvider(JWKS_SUPABASE)
      .useValue(jwks)
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    process.env.SUPABASE_URL = supabaseUrlOriginal
  })

  beforeEach(() => jest.clearAllMocks())

  function token({
    clave = claveDelProyecto,
    kid = 'clave-del-proyecto',
    issuer = `${SUPABASE_URL}/auth/v1`,
    venceEn = Math.floor(Date.now() / 1000) + 3600,
  } = {}) {
    return new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid })
      .setSubject(SUPABASE_USER_ID)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setIssuedAt(venceEn - 3600)
      .setExpirationTime(venceEn)
      .sign(clave)
  }

  /** La base: el `Usuario` de la cuenta de Supabase (o ninguno) y sus roles en el restaurante. */
  function enLaBase(usuario: typeof USUARIO | null, roles: Rol[]) {
    prisma.usuario.findUnique.mockResolvedValue(usuario)
    prisma.restaurante.findFirst.mockResolvedValue({ marcaId: 'marca-1' })
    prisma.membresia.findMany.mockResolvedValue(roles.map((rol) => ({ rol })))
  }

  function pedir(conToken: string) {
    return request(app.getHttpServer()).get(`/prueba/${REST_ID}`).set('Authorization', `Bearer ${conToken}`)
  }

  it('token válido del OWNER de la marca del restaurante: 200 (la membresía de marca cubre la sucursal)', async () => {
    // Arrange
    enLaBase(USUARIO, ['OWNER'])

    // Act
    const res = await pedir(await token())

    // Assert
    expect(res.status).toBe(200)
    expect(prisma.usuario.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { supabaseUserId: SUPABASE_USER_ID } }),
    )
    expect(prisma.membresia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuarioId: USUARIO.id, OR: [{ restauranteId: REST_ID }, { rol: 'OWNER', marcaId: 'marca-1' }] },
      }),
    )
  })

  it('token vencido: 401', async () => {
    // Arrange
    enLaBase(USUARIO, ['OWNER'])

    // Act
    const res = await pedir(await token({ venceEn: Math.floor(Date.now() / 1000) - 60 }))

    // Assert
    expect(res.status).toBe(401)
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
  })

  it('token de otro proyecto de Supabase (otra clave y otro issuer): 401', async () => {
    // Arrange
    enLaBase(USUARIO, ['OWNER'])
    const ajeno = await token({
      clave: claveDeOtroProyecto,
      kid: 'clave-de-otro-proyecto',
      issuer: 'https://otro-proyecto.supabase.co/auth/v1',
    })

    // Act
    const res = await pedir(ajeno)

    // Assert
    expect(res.status).toBe(401)
    expect(prisma.usuario.findUnique).not.toHaveBeenCalled()
  })

  it.each([
    ['cuenta de Supabase sin Usuario en la base (registro público)', null],
    ['Usuario sin membresías', USUARIO],
  ])('usuario sin membresía: 403 (%s)', async (_caso, usuario) => {
    // Arrange
    enLaBase(usuario, [])

    // Act
    const res = await pedir(await token())

    // Assert
    expect(res.status).toBe(403)
  })

  it('rol incorrecto (MOZO del restaurante en una ruta de OWNER o GERENTE): 403', async () => {
    // Arrange
    enLaBase(USUARIO, ['MOZO'])

    // Act
    const res = await pedir(await token())

    // Assert
    expect(res.status).toBe(403)
  })
})
