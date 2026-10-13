import { LOGO_ACCEPT, LOGO_MAX_BYTES, validarLogo } from './logo'

describe('validarLogo', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('acepta %s', (type) => {
    expect(validarLogo({ type, size: 1024 })).toBeNull()
  })

  it('acepta un archivo de exactamente 2 MB', () => {
    expect(validarLogo({ type: 'image/png', size: LOGO_MAX_BYTES })).toBeNull()
  })

  it('rechaza un archivo de más de 2 MB', () => {
    expect(validarLogo({ type: 'image/png', size: LOGO_MAX_BYTES + 1 })).toBe(
      'El logo no puede pesar más de 2 MB',
    )
  })

  it.each(['image/svg+xml', 'image/gif', 'application/pdf', 'text/plain', ''])(
    'rechaza el tipo "%s"',
    (type) => {
      expect(validarLogo({ type, size: 1024 })).toBe('El logo tiene que ser una imagen PNG, JPG o WebP')
    },
  )

  it('rechaza un archivo vacío', () => {
    expect(validarLogo({ type: 'image/png', size: 0 })).toBe('El archivo está vacío')
  })

  it('el tipo se revisa antes que el tamaño', () => {
    expect(validarLogo({ type: 'image/gif', size: LOGO_MAX_BYTES + 1 })).toBe(
      'El logo tiene que ser una imagen PNG, JPG o WebP',
    )
  })
})

describe('LOGO_ACCEPT', () => {
  it('lista solo los formatos permitidos', () => {
    expect(LOGO_ACCEPT).toBe('image/png,image/jpeg,image/webp')
  })
})
