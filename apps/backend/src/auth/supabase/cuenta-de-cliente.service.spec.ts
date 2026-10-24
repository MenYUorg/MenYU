import { Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createLocalJWKSet, errors, exportJWK, generateKeyPair, JWTVerifyGetKey, KeyLike, SignJWT } from 'jose'
import { comoPrisma, crearPrismaMock, PrismaMock } from '../../test/prisma-mock'
import { CuentaDeClienteService, LARGO_MAXIMO_DEL_NOMBRE, NOMBRE_POR_DEFECTO } from './cuenta-de-cliente.service'
import { esTokenDeSupabase, VerificadorTokenSupabase } from './verificador-token.service'

// La cuenta de cliente de la Fase 4b (docs/auth/specs/auth.md): de un token de Supabase al `Cliente`. Los tokens se
// firman con un par de claves propio, cuya clave pública es el JWKS del "proyecto", como en supabase-auth.spec.

const SUPABASE_URL = 'https://proyecto-test.supabase.co'
const SUPABASE_USER_ID = '6f1c2a40-2222-4a1b-9c3d-000000000001'

const claveRepetida = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })

describe('CuentaDeClienteService', () => {
  let claveDelProyecto: KeyLike
  let claveDeOtroProyecto: KeyLike
  let jwks: JWTVerifyGetKey
  let prisma: PrismaMock
  let service: CuentaDeClienteService
  let advertencia: jest.SpyInstance
  const supabaseUrlOriginal = process.env.SUPABASE_URL

  beforeAll(async () => {
    const par = await generateKeyPair('ES256')
    claveDelProyecto = par.privateKey
    claveDeOtroProyecto = (await generateKeyPair('ES256')).privateKey
    jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(par.publicKey)), kid: 'clave-del-proyecto' }] })
  })

  beforeEach(() => {
    process.env.SUPABASE_URL = SUPABASE_URL
    prisma = crearPrismaMock()
    service = new CuentaDeClienteService(new VerificadorTokenSupabase(jwks), comoPrisma(prisma))
    advertencia = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    // Por defecto, una cuenta nueva: sin `Cliente` propio ni uno del login anterior con su email.
    prisma.cliente.findUnique.mockResolvedValue(null)
    prisma.cliente.findFirst.mockResolvedValue(null)
    prisma.cliente.create.mockResolvedValue({ id: 'cli-nuevo' })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env.SUPABASE_URL = supabaseUrlOriginal
  })

  function token({
    clave = claveDelProyecto,
    sub = SUPABASE_USER_ID,
    issuer = `${SUPABASE_URL}/auth/v1`,
    venceEn = Math.floor(Date.now() / 1000) + 3600,
    email = 'Ana@Ejemplo.com' as string | null,
    metadatos = { nombre: 'Ana Pérez' } as unknown,
  } = {}) {
    return new SignJWT({ role: 'authenticated', ...(email === null ? {} : { email }), user_metadata: metadatos })
      .setProtectedHeader({ alg: 'ES256', kid: 'clave-del-proyecto' })
      .setSubject(sub)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setIssuedAt(venceEn - 3600)
      .setExpirationTime(venceEn)
      .sign(clave)
  }

  describe('qué Cliente le toca a la cuenta', () => {
    it('el que ya tiene la cuenta: no vincula ni crea nada', async () => {
      prisma.cliente.findUnique.mockResolvedValue({ id: 'cli-propio' })

      const id = await service.clienteDe(await token())

      expect(id).toBe('cli-propio')
      expect(prisma.cliente.findUnique).toHaveBeenCalledWith({
        where: { supabaseUserId: SUPABASE_USER_ID },
        select: { id: true },
      })
      expect(prisma.cliente.updateMany).not.toHaveBeenCalled()
      expect(prisma.cliente.create).not.toHaveBeenCalled()
    })

    it('uno del login anterior con el mismo email (sin importar mayúsculas) y sin cuenta: lo vincula y conserva su id', async () => {
      prisma.cliente.findFirst.mockResolvedValue({ id: 'cli-legacy' })
      prisma.cliente.updateMany.mockResolvedValue({ count: 1 })

      const id = await service.clienteDe(await token())

      expect(id).toBe('cli-legacy')
      expect(prisma.cliente.findFirst).toHaveBeenCalledWith({
        where: { supabaseUserId: null, email: { equals: 'ana@ejemplo.com', mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      // Condicionado a que siga sin cuenta: si otro pedido lo vinculó antes, no se pisa.
      expect(prisma.cliente.updateMany).toHaveBeenCalledWith({
        where: { id: 'cli-legacy', supabaseUserId: null },
        data: { supabaseUserId: SUPABASE_USER_ID },
      })
      expect(prisma.cliente.create).not.toHaveBeenCalled()
    })

    it('sin ninguno: crea uno con el nombre, el email en minúscula y la cuenta', async () => {
      const id = await service.clienteDe(await token())

      expect(id).toBe('cli-nuevo')
      expect(prisma.cliente.create).toHaveBeenCalledWith({
        data: { nombre: 'Ana Pérez', email: 'ana@ejemplo.com', supabaseUserId: SUPABASE_USER_ID },
        select: { id: true },
      })
    })

    it('nunca crea un Usuario ni una Membresia: una cuenta de cliente no da acceso al personal', async () => {
      await service.clienteDe(await token())

      expect(prisma.usuario.create).not.toHaveBeenCalled()
      expect(prisma.usuario.upsert).not.toHaveBeenCalled()
      expect(prisma.membresia.create).not.toHaveBeenCalled()
    })

    it('una cuenta sin email (no hay con qué vincular): crea uno sin email', async () => {
      const id = await service.clienteDe(await token({ email: null }))

      expect(id).toBe('cli-nuevo')
      expect(prisma.cliente.findFirst).not.toHaveBeenCalled()
      expect(prisma.cliente.create).toHaveBeenCalledWith({
        data: { nombre: 'Ana Pérez', email: null, supabaseUserId: SUPABASE_USER_ID },
        select: { id: true },
      })
    })
  })

  describe('dos pedidos a la vez y emails ocupados', () => {
    it('otro pedido vinculó el del login anterior entre la búsqueda y la escritura: sigue con ese', async () => {
      prisma.cliente.findFirst.mockResolvedValue({ id: 'cli-legacy' })
      prisma.cliente.updateMany.mockResolvedValue({ count: 0 })
      prisma.cliente.create.mockRejectedValue(claveRepetida())
      prisma.cliente.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'cli-legacy' })

      const id = await service.clienteDe(await token())

      expect(id).toBe('cli-legacy')
      expect(prisma.cliente.create).toHaveBeenCalledTimes(1)
    })

    it('al vincular, la cuenta ya tenía otro Cliente (lo creó otro pedido): sigue con ese', async () => {
      prisma.cliente.findFirst.mockResolvedValue({ id: 'cli-legacy' })
      prisma.cliente.updateMany.mockRejectedValue(claveRepetida())
      prisma.cliente.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'cli-del-otro-pedido' })

      const id = await service.clienteDe(await token())

      expect(id).toBe('cli-del-otro-pedido')
      expect(prisma.cliente.create).not.toHaveBeenCalled()
    })

    it('otro pedido de la misma cuenta lo creó primero: sigue con ese, sin crear otro', async () => {
      prisma.cliente.create.mockRejectedValue(claveRepetida())
      prisma.cliente.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'cli-del-otro-pedido' })

      const id = await service.clienteDe(await token())

      expect(id).toBe('cli-del-otro-pedido')
      expect(prisma.cliente.create).toHaveBeenCalledTimes(1)
    })

    it('el email es de un Cliente que ya tiene otra cuenta: no se le quita, el nuevo queda sin email', async () => {
      prisma.cliente.create.mockRejectedValueOnce(claveRepetida()).mockResolvedValueOnce({ id: 'cli-sin-email' })

      const id = await service.clienteDe(await token())

      expect(id).toBe('cli-sin-email')
      expect(prisma.cliente.create).toHaveBeenLastCalledWith({
        data: { nombre: 'Ana Pérez', email: null, supabaseUserId: SUPABASE_USER_ID },
        select: { id: true },
      })
      expect(prisma.cliente.updateMany).not.toHaveBeenCalled()
    })

    it('un error de la base que no es de clave repetida se propaga', async () => {
      prisma.cliente.create.mockRejectedValue(new Error('se cayó la conexión'))

      await expect(service.clienteDe(await token())).rejects.toThrow('se cayó la conexión')
    })

    it('al vincular, un error que no es de clave repetida se propaga', async () => {
      prisma.cliente.findFirst.mockResolvedValue({ id: 'cli-legacy' })
      prisma.cliente.updateMany.mockRejectedValue(new Error('se cayó la conexión'))

      await expect(service.clienteDe(await token())).rejects.toThrow('se cayó la conexión')
    })
  })

  describe('el nombre', () => {
    const nombreCon = async (metadatos: unknown) => {
      await service.clienteDe(await token({ metadatos }))
      return prisma.cliente.create.mock.calls[0][0].data.nombre
    }

    it('el que eligió al registrarse en web-auth le gana al de Google', async () => {
      expect(await nombreCon({ nombre: 'Ana', full_name: 'Ana María Pérez', name: 'Ana P' })).toBe('Ana')
    })

    it('con Google: full_name y, si no, name', async () => {
      expect(await nombreCon({ full_name: 'Ana María Pérez', name: 'Ana P' })).toBe('Ana María Pérez')
      prisma.cliente.create.mockClear()
      expect(await nombreCon({ name: 'Ana P' })).toBe('Ana P')
    })

    it('sin nombre, o con uno vacío o que no es texto: "Cliente" (no la parte local del email, que vería el personal)', async () => {
      expect(await nombreCon({})).toBe(NOMBRE_POR_DEFECTO)
      prisma.cliente.create.mockClear()
      expect(await nombreCon({ nombre: '   ', full_name: 42 })).toBe(NOMBRE_POR_DEFECTO)
      prisma.cliente.create.mockClear()
      expect(await nombreCon(null)).toBe(NOMBRE_POR_DEFECTO)
    })

    it('sin caracteres de control, con los espacios emprolijados', async () => {
      expect(await nombreCon({ nombre: '  Ana\u0000 \n  María​   Pérez ' })).toBe('Ana María Pérez')
    })

    it(`se corta en ${LARGO_MAXIMO_DEL_NOMBRE} caracteres, sin partir un emoji`, async () => {
      const nombre = await nombreCon({ nombre: `${'a'.repeat(LARGO_MAXIMO_DEL_NOMBRE - 1)}😀😀` })

      expect(Array.from(nombre)).toHaveLength(LARGO_MAXIMO_DEL_NOMBRE)
      expect(nombre.endsWith('😀')).toBe(true)
    })
  })

  describe('un token que no sirve: null (quien llama sigue como invitado) y no toca la base', () => {
    afterEach(() => {
      expect(prisma.cliente.findUnique).not.toHaveBeenCalled()
      expect(prisma.cliente.create).not.toHaveBeenCalled()
    })

    it('vencido', async () => {
      expect(await service.clienteDe(await token({ venceEn: Math.floor(Date.now() / 1000) - 60 }))).toBeNull()
      expect(advertencia).not.toHaveBeenCalled()
    })

    it('firmado por otro proyecto', async () => {
      expect(await service.clienteDe(await token({ clave: claveDeOtroProyecto }))).toBeNull()
      expect(advertencia).not.toHaveBeenCalled()
    })

    it('de otro issuer', async () => {
      expect(await service.clienteDe(await token({ issuer: 'https://otro.supabase.co/auth/v1' }))).toBeNull()
    })

    it('con un sub que no es un UUID (la columna es uuid)', async () => {
      expect(await service.clienteDe(await token({ sub: 'no-es-un-uuid' }))).toBeNull()
    })

    it('sin SUPABASE_URL no se puede verificar ninguno: lo deja anotado', async () => {
      delete process.env.SUPABASE_URL

      expect(await service.clienteDe(await token())).toBeNull()
      expect(advertencia).toHaveBeenCalledWith(expect.stringContaining('SUPABASE_URL'))
    })

    it('sin el JWKS (Supabase no respondió): lo deja anotado', async () => {
      const sinJwks: JWTVerifyGetKey = () => {
        throw new errors.JWKSTimeout()
      }
      service = new CuentaDeClienteService(new VerificadorTokenSupabase(sinJwks), comoPrisma(prisma))

      expect(await service.clienteDe(await token())).toBeNull()
      expect(advertencia).toHaveBeenCalledTimes(1)
    })
  })
})

describe('esTokenDeSupabase', () => {
  const conEncabezado = (encabezado: object) =>
    `${Buffer.from(JSON.stringify(encabezado)).toString('base64url')}.e30.firma`

  it.each(['ES256', 'RS256'])('%s: los de las JWT Signing Keys de Supabase', (alg) => {
    expect(esTokenDeSupabase(conEncabezado({ alg }))).toBe(true)
  })

  it('HS256 (el JWT propio del login anterior): no', () => {
    expect(esTokenDeSupabase(conEncabezado({ alg: 'HS256' }))).toBe(false)
  })

  it.each([['sin alg', conEncabezado({})], ['un texto cualquiera', 'no-es-un-jwt'], ['vacío', '']])(
    '%s: no',
    (_caso, token) => {
      expect(esTokenDeSupabase(token)).toBe(false)
    },
  )
})
