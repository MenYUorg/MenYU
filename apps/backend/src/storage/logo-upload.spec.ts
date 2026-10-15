import { detectarFormatoLogo, LOGO_MAX_BYTES, logoFilePipe } from './logo-upload'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF')])
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
])

function archivo(buffer: Buffer, mimetype: string): Express.Multer.File {
  return { buffer, mimetype, size: buffer.length, originalname: 'logo' } as Express.Multer.File
}

describe('detectarFormatoLogo', () => {
  it('reconoce PNG, JPEG y WebP por su firma', () => {
    expect(detectarFormatoLogo(PNG)).toBe('image/png')
    expect(detectarFormatoLogo(JPEG)).toBe('image/jpeg')
    expect(detectarFormatoLogo(WEBP)).toBe('image/webp')
  })

  it.each([
    ['un SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['un PDF', Buffer.from('%PDF-1.7 contenido')],
    ['un GIF', Buffer.from('GIF89a......')],
    ['texto plano', Buffer.from('esto no es una imagen')],
    ['un archivo vacío', Buffer.alloc(0)],
    ['una firma PNG incompleta', PNG.subarray(0, 5)],
    ['un RIFF que no es WebP', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')])],
  ])('no reconoce %s', (_nombre, buffer) => {
    expect(detectarFormatoLogo(buffer)).toBeNull()
  })
})

describe('logoFilePipe', () => {
  const pipe = logoFilePipe()

  it.each([
    ['PNG', PNG, 'image/png'],
    ['JPEG', JPEG, 'image/jpeg'],
    ['WebP', WEBP, 'image/webp'],
  ])('deja pasar un %s válido', async (_formato, buffer, mimetype) => {
    const file = archivo(buffer, mimetype)

    await expect(pipe.transform(file)).resolves.toBe(file)
  })

  it('deja pasar un archivo de exactamente 2 MB', async () => {
    const buffer = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES - PNG.length)])

    await expect(pipe.transform(archivo(buffer, 'image/png'))).resolves.toBeDefined()
  })

  it('rechaza un archivo de más de 2 MB con un mensaje claro', async () => {
    const buffer = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES + 1 - PNG.length)])

    await expect(pipe.transform(archivo(buffer, 'image/png'))).rejects.toThrow(
      'El logo no puede pesar más de 2 MB',
    )
  })

  it('rechaza un SVG aunque declare ser una imagen', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')

    await expect(pipe.transform(archivo(svg, 'image/svg+xml'))).rejects.toThrow(
      'El logo tiene que ser una imagen PNG, JPG o WebP',
    )
  })

  it('rechaza un archivo que declara un tipo distinto al de su contenido', async () => {
    await expect(pipe.transform(archivo(JPEG, 'image/png'))).rejects.toThrow(
      'El logo tiene que ser una imagen PNG, JPG o WebP',
    )
  })

  it('rechaza un archivo que dice ser PNG pero no lo es', async () => {
    await expect(
      pipe.transform(archivo(Buffer.from('esto no es una imagen'), 'image/png')),
    ).rejects.toThrow('El logo tiene que ser una imagen PNG, JPG o WebP')
  })

  it('rechaza si no hay archivo', async () => {
    await expect(pipe.transform(undefined)).rejects.toThrow()
  })
})
