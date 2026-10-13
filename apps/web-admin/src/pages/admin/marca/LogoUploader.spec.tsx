import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LOGO_MAX_BYTES } from '../../../utils/logo'
import { LogoUploader } from './LogoUploader'

const LOGO = 'https://storage.test/logos/marcas/marca-1.png?v=1'
const LOGO_MARCA = 'https://storage.test/logos/marcas/marca-9.png?v=1'

function archivo(nombre = 'logo.png', tipo = 'image/png', contenido: BlobPart = 'contenido') {
  return new File([contenido], nombre, { type: tipo })
}

function renderUploader(props: Partial<ComponentProps<typeof LogoUploader>> = {}) {
  const onSubir = vi.fn().mockResolvedValue(undefined)
  const onQuitar = vi.fn().mockResolvedValue(undefined)
  render(
    <LogoUploader
      nombre="Marca Seed"
      logoUrl={null}
      textoConLogo="Logo de la marca"
      textoSinLogo="Todavía no cargaste un logo"
      avisoAlQuitar="Las sucursales sin logo propio van a quedar sin logo."
      onSubir={onSubir}
      onQuitar={onQuitar}
      {...props}
    />,
  )
  return { onSubir, onQuitar }
}

// El navegador deja elegir "todos los archivos" aunque el input pida solo imágenes: se simula eso
// para comprobar que la validación propia también frena los archivos que no corresponden.
const elegirCualquierArchivo = () => userEvent.setup({ applyAccept: false })

function inputDeArchivo() {
  return screen.getByLabelText('Archivo del logo de Marca Seed')
}

describe('LogoUploader', () => {
  describe('qué muestra', () => {
    it('sin logo: avisa que no hay y ofrece subir uno', () => {
      renderUploader()

      expect(screen.getByText('Todavía no cargaste un logo')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Subir logo de Marca Seed' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Quitar logo/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('con logo: lo muestra y ofrece cambiarlo o quitarlo', () => {
      renderUploader({ logoUrl: LOGO })

      expect(screen.getByRole('img', { name: 'Logo de Marca Seed' })).toHaveAttribute('src', LOGO)
      expect(screen.getByText('Logo de la marca')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cambiar logo de Marca Seed' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Quitar logo de Marca Seed' })).toBeInTheDocument()
    })

    it('sin logo propio muestra el heredado, lo aclara y no ofrece quitarlo', () => {
      renderUploader({
        nombre: 'Sucursal Centro',
        logoHeredadoUrl: LOGO_MARCA,
        textoHeredado: 'Usa el logo de la marca',
      })

      expect(screen.getByRole('img', { name: 'Logo de Sucursal Centro' })).toHaveAttribute('src', LOGO_MARCA)
      expect(screen.getByText('Usa el logo de la marca')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Subir logo de Sucursal Centro' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Quitar logo/ })).not.toBeInTheDocument()
    })

    it('con logo propio ignora el heredado', () => {
      renderUploader({ logoUrl: LOGO, logoHeredadoUrl: LOGO_MARCA, textoHeredado: 'Usa el logo de la marca' })

      expect(screen.getByRole('img')).toHaveAttribute('src', LOGO)
      expect(screen.queryByText('Usa el logo de la marca')).not.toBeInTheDocument()
    })

    it('si la imagen no se puede cargar, muestra el marcador en su lugar', () => {
      renderUploader({ logoUrl: LOGO })

      fireEvent.error(screen.getByRole('img'))

      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(screen.getByText('Logo de la marca')).toBeInTheDocument()
    })

    it('indica los formatos y el tamaño permitidos', () => {
      renderUploader()

      expect(screen.getByText('PNG, JPG o WebP · hasta 2 MB')).toBeInTheDocument()
      expect(inputDeArchivo()).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp')
    })

    it('el botón de subir abre el selector de archivos', async () => {
      const user = userEvent.setup()
      renderUploader()
      const abrirSelector = vi.spyOn(inputDeArchivo(), 'click')

      await user.click(screen.getByRole('button', { name: 'Subir logo de Marca Seed' }))

      expect(abrirSelector).toHaveBeenCalledTimes(1)
    })
  })

  describe('subir un logo', () => {
    it('sube el archivo elegido y confirma', async () => {
      const user = userEvent.setup()
      const { onSubir } = renderUploader()
      const elegido = archivo()

      await user.upload(inputDeArchivo(), elegido)

      expect(onSubir).toHaveBeenCalledWith(elegido)
      expect(await screen.findByRole('status')).toHaveTextContent('Logo actualizado')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it.each([
      ['PNG', 'image/png'],
      ['JPG', 'image/jpeg'],
      ['WebP', 'image/webp'],
    ])('acepta un %s', async (_nombre, tipo) => {
      const user = userEvent.setup()
      const { onSubir } = renderUploader()

      await user.upload(inputDeArchivo(), archivo('logo', tipo))

      expect(onSubir).toHaveBeenCalledTimes(1)
    })

    it('mientras sube, el botón avisa y no se puede volver a tocar', async () => {
      const user = userEvent.setup()
      let terminar: () => void = () => undefined
      const onSubir = vi.fn().mockReturnValue(new Promise<void>((resolver) => (terminar = resolver)))
      renderUploader({ onSubir })

      await user.upload(inputDeArchivo(), archivo())

      const boton = screen.getByRole('button', { name: 'Subir logo de Marca Seed' })
      expect(boton).toHaveTextContent('Subiendo…')
      expect(boton).toBeDisabled()

      terminar()
      expect(await screen.findByRole('status')).toHaveTextContent('Logo actualizado')
      expect(screen.getByRole('button', { name: 'Subir logo de Marca Seed' })).toBeEnabled()
    })

    it.each([
      ['un SVG', archivo('logo.svg', 'image/svg+xml')],
      ['un GIF', archivo('logo.gif', 'image/gif')],
      ['un PDF', archivo('logo.pdf', 'application/pdf')],
    ])('rechaza %s sin llamar al servidor', async (_nombre, elegido) => {
      const user = elegirCualquierArchivo()
      const { onSubir } = renderUploader()

      await user.upload(inputDeArchivo(), elegido)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'El logo tiene que ser una imagen PNG, JPG o WebP',
      )
      expect(onSubir).not.toHaveBeenCalled()
    })

    it('rechaza un archivo de más de 2 MB sin llamar al servidor', async () => {
      const user = userEvent.setup()
      const { onSubir } = renderUploader()

      await user.upload(inputDeArchivo(), archivo('grande.png', 'image/png', new Uint8Array(LOGO_MAX_BYTES + 1)))

      expect(await screen.findByRole('alert')).toHaveTextContent('El logo no puede pesar más de 2 MB')
      expect(onSubir).not.toHaveBeenCalled()
    })

    it('acepta un archivo de exactamente 2 MB', async () => {
      const user = userEvent.setup()
      const { onSubir } = renderUploader()

      await user.upload(inputDeArchivo(), archivo('justo.png', 'image/png', new Uint8Array(LOGO_MAX_BYTES)))

      expect(onSubir).toHaveBeenCalledTimes(1)
    })

    it('rechaza un archivo vacío', async () => {
      const user = userEvent.setup()
      const { onSubir } = renderUploader()

      await user.upload(inputDeArchivo(), archivo('vacio.png', 'image/png', ''))

      expect(await screen.findByRole('alert')).toHaveTextContent('El archivo está vacío')
      expect(onSubir).not.toHaveBeenCalled()
    })

    it('muestra el mensaje del servidor si la subida falla', async () => {
      const user = userEvent.setup()
      const onSubir = vi.fn().mockRejectedValue(new Error('No tenés acceso a esta marca'))
      renderUploader({ onSubir })

      await user.upload(inputDeArchivo(), archivo())

      expect(await screen.findByRole('alert')).toHaveTextContent('No tenés acceso a esta marca')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Subir logo de Marca Seed' })).toBeEnabled()
    })

    it('si el error no trae mensaje, muestra uno genérico', async () => {
      const user = userEvent.setup()
      const onSubir = vi.fn().mockRejectedValue('falló')
      renderUploader({ onSubir })

      await user.upload(inputDeArchivo(), archivo())

      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo subir el logo. Probá de nuevo.')
    })

    it('un intento exitoso después de un error borra el error', async () => {
      const user = userEvent.setup()
      const onSubir = vi.fn().mockRejectedValueOnce(new Error('Falló la red')).mockResolvedValueOnce(undefined)
      renderUploader({ onSubir })

      await user.upload(inputDeArchivo(), archivo())
      expect(await screen.findByRole('alert')).toHaveTextContent('Falló la red')

      await user.upload(inputDeArchivo(), archivo())

      expect(await screen.findByRole('status')).toHaveTextContent('Logo actualizado')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('permite volver a elegir el mismo archivo después de un rechazo', async () => {
      const user = elegirCualquierArchivo()
      const { onSubir } = renderUploader()
      const svg = archivo('logo.svg', 'image/svg+xml')

      await user.upload(inputDeArchivo(), svg)
      await user.upload(inputDeArchivo(), svg)

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(onSubir).not.toHaveBeenCalled()
      expect(inputDeArchivo()).toHaveValue('')
    })
  })

  describe('quitar el logo', () => {
    it('pide confirmación y explica qué pasa', async () => {
      const user = userEvent.setup()
      const { onQuitar } = renderUploader({ logoUrl: LOGO })

      await user.click(screen.getByRole('button', { name: 'Quitar logo de Marca Seed' }))

      const confirmacion = screen.getByRole('group', { name: 'Confirmar quitar el logo de Marca Seed' })
      expect(confirmacion).toHaveTextContent(
        '¿Quitar el logo de Marca Seed? Las sucursales sin logo propio van a quedar sin logo.',
      )
      expect(onQuitar).not.toHaveBeenCalled()
    })

    it('al pedir la confirmación desaparece el aviso de la acción anterior', async () => {
      const user = userEvent.setup()
      renderUploader({ logoUrl: LOGO })
      await user.upload(inputDeArchivo(), archivo())
      expect(await screen.findByRole('status')).toHaveTextContent('Logo actualizado')

      await user.click(screen.getByRole('button', { name: 'Quitar logo de Marca Seed' }))

      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('cancelar vuelve a los botones sin quitar nada', async () => {
      const user = userEvent.setup()
      const { onQuitar } = renderUploader({ logoUrl: LOGO })
      await user.click(screen.getByRole('button', { name: 'Quitar logo de Marca Seed' }))

      await user.click(screen.getByRole('button', { name: 'Cancelar' }))

      expect(onQuitar).not.toHaveBeenCalled()
      expect(screen.queryByRole('group')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Quitar logo de Marca Seed' })).toBeInTheDocument()
    })

    it('confirmar quita el logo y avisa', async () => {
      const user = userEvent.setup()
      const { onQuitar } = renderUploader({ logoUrl: LOGO })
      await user.click(screen.getByRole('button', { name: 'Quitar logo de Marca Seed' }))

      await user.click(screen.getByRole('button', { name: 'Sí, quitar' }))

      expect(onQuitar).toHaveBeenCalledTimes(1)
      expect(await screen.findByRole('status')).toHaveTextContent('Logo quitado')
      expect(screen.queryByRole('group')).not.toBeInTheDocument()
    })

    it('muestra el mensaje del servidor si no se pudo quitar', async () => {
      const user = userEvent.setup()
      const onQuitar = vi.fn().mockRejectedValue(new Error('Esta marca no tiene logo'))
      renderUploader({ logoUrl: LOGO, onQuitar })
      await user.click(screen.getByRole('button', { name: 'Quitar logo de Marca Seed' }))

      await user.click(screen.getByRole('button', { name: 'Sí, quitar' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Esta marca no tiene logo')
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })
})
