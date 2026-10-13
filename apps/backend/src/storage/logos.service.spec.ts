import { Test } from '@nestjs/testing'
import { LogosService } from './logos.service'
import { StorageService } from './storage.service'

const mockStorage = {
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
}

const ARCHIVO = { buffer: Buffer.from('logo'), mimetype: 'image/png' } as Express.Multer.File
const URL_PUBLICA = 'https://proyecto.supabase.co/storage/v1/object/public/logos/marcas/marca-1'

describe('LogosService', () => {
  let service: LogosService
  const bucketOriginal = process.env.SUPABASE_LOGOS_BUCKET

  beforeEach(async () => {
    delete process.env.SUPABASE_LOGOS_BUCKET
    const module = await Test.createTestingModule({
      providers: [LogosService, { provide: StorageService, useValue: mockStorage }],
    }).compile()

    service = module.get(LogosService)
    jest.clearAllMocks()
    mockStorage.uploadFile.mockResolvedValue(URL_PUBLICA)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    if (bucketOriginal === undefined) delete process.env.SUPABASE_LOGOS_BUCKET
    else process.env.SUPABASE_LOGOS_BUCKET = bucketOriginal
  })

  describe('subir', () => {
    it('sube al bucket "logos" dentro de la carpeta indicada', async () => {
      await service.subir('marcas', 'marca-1', ARCHIVO)

      expect(mockStorage.uploadFile).toHaveBeenCalledWith(
        'logos',
        'marcas/marca-1',
        ARCHIVO.buffer,
        'image/png',
      )
    })

    it('usa la carpeta de restaurantes para el logo de una sucursal', async () => {
      await service.subir('restaurantes', 'rest-1', ARCHIVO)

      expect(mockStorage.uploadFile).toHaveBeenCalledWith(
        'logos',
        'restaurantes/rest-1',
        ARCHIVO.buffer,
        'image/png',
      )
    })

    it('devuelve la URL pública con una versión para romper el caché', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(1700000000000)

      const url = await service.subir('marcas', 'marca-1', ARCHIVO)

      expect(url).toBe(`${URL_PUBLICA}?v=1700000000000`)
    })

    it('cada subida genera una URL distinta aunque el archivo se pise en el mismo path', async () => {
      const ahora = jest.spyOn(Date, 'now')
      ahora.mockReturnValueOnce(1700000000000).mockReturnValueOnce(1700000005000)

      const primera = await service.subir('marcas', 'marca-1', ARCHIVO)
      const segunda = await service.subir('marcas', 'marca-1', ARCHIVO)

      expect(primera).not.toBe(segunda)
    })

    it('usa el bucket de SUPABASE_LOGOS_BUCKET si está definido', async () => {
      process.env.SUPABASE_LOGOS_BUCKET = 'logos-dev'

      await service.subir('marcas', 'marca-1', ARCHIVO)

      expect(mockStorage.uploadFile).toHaveBeenCalledWith(
        'logos-dev',
        'marcas/marca-1',
        ARCHIVO.buffer,
        'image/png',
      )
    })

    it('propaga el error del storage', async () => {
      mockStorage.uploadFile.mockRejectedValue(new Error('storage caído'))

      await expect(service.subir('marcas', 'marca-1', ARCHIVO)).rejects.toThrow('storage caído')
    })
  })

  describe('eliminar', () => {
    it('borra el archivo de la carpeta indicada', async () => {
      await service.eliminar('restaurantes', 'rest-1')

      expect(mockStorage.deleteFile).toHaveBeenCalledWith('logos', 'restaurantes/rest-1')
    })

    it('usa el bucket de SUPABASE_LOGOS_BUCKET si está definido', async () => {
      process.env.SUPABASE_LOGOS_BUCKET = 'logos-dev'

      await service.eliminar('marcas', 'marca-1')

      expect(mockStorage.deleteFile).toHaveBeenCalledWith('logos-dev', 'marcas/marca-1')
    })
  })
})
