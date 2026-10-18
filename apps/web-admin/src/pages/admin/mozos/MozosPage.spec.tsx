import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { api, ApiError } from '../../../services/api'
import { MozosPage } from './MozosPage'

let rolActual = 'OWNER'
let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth', () => ({
  useAuth: () => ({ user: { rol: rolActual, email: 'owner@menyu.com' } }),
}))

vi.mock('../../../store/contextStore', () => ({
  useContextStore: () => ({
    selectedRestauranteId: restauranteActual,
    restaurantes: [
      { id: 'rest-1', nombre: 'La Parrilla' },
      { id: 'rest-2', nombre: 'El Bodegón' },
    ],
  }),
}))

vi.mock('../../../services/api', async () => {
  const real = await vi.importActual<typeof import('../../../services/api')>('../../../services/api')
  return {
    ApiError: real.ApiError,
    api: {
      mozos: {
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        getMesas: vi.fn(),
        assignMesa: vi.fn(),
        unassignMesa: vi.fn(),
        llamadosHoy: vi.fn(),
      },
      mesas: { list: vi.fn() },
      admins: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      adminRestaurante: { asignar: vi.fn(), desasignar: vi.fn(), porAdmin: vi.fn() },
    },
  }
})

const mozosApi = vi.mocked(api.mozos)
const adminsApi = vi.mocked(api.admins)
const relApi = vi.mocked(api.adminRestaurante)

const ANA = { id: 'mozo-ana', nombre: 'Ana Pérez', email: 'ana@menyu.com', telefono: null, activo: true, esJefeSalon: true, createdAt: '2026-10-01' }
const LUIS = { id: 'mozo-luis', nombre: 'Luis', email: null, telefono: null, activo: true, esJefeSalon: false, createdAt: '2026-10-01' }
const MESA_1 = { id: 'mesa-1', numero: '1', estado: 'libre' }
const MESA_2 = { id: 'mesa-2', numero: '2', estado: 'libre' }
const GERENTE = { id: 'ger-1', email: 'gerente@menyu.com', rol: 'GERENTE', marcaId: 'marca-1' }

/** El texto de la etiqueta y su input (las etiquetas no están asociadas al campo). */
function campo(etiqueta: string, dentro: HTMLElement = document.body): HTMLInputElement {
  const label = within(dentro).getAllByText(etiqueta, { selector: 'label' })[0]
  return label.parentElement!.querySelector('input') as HTMLInputElement
}
const escribir = (input: HTMLInputElement, valor: string) => fireEvent.change(input, { target: { value: valor } })
const boton = (nombre: string | RegExp) => screen.getByRole('button', { name: nombre })

async function abrirPagina() {
  render(<MozosPage />)
  await screen.findByText('Ana Pérez')
}

beforeEach(() => {
  rolActual = 'OWNER'
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
  mozosApi.list.mockResolvedValue([ANA, LUIS])
  vi.mocked(api.mesas.list).mockResolvedValue([
    { ...MESA_1, mozoMesas: [{ id: 'mm-1', mozoId: 'mozo-ana', mozo: { id: 'mozo-ana', nombre: 'Ana Pérez' } }] },
    { ...MESA_2, mozoMesas: undefined },
  ] as never)
  mozosApi.getMesas.mockImplementation((id: string) => Promise.resolve(id === 'mozo-ana' ? [MESA_1] : []) as never)
  mozosApi.llamadosHoy.mockImplementation((id: string) => Promise.resolve({ total: id === 'mozo-ana' ? 3 : 1 }) as never)
  adminsApi.list.mockResolvedValue([GERENTE, { id: 'own-1', email: 'owner@menyu.com', rol: 'OWNER', marcaId: 'marca-1' }] as never)
  relApi.porAdmin.mockResolvedValue([{ restauranteId: 'rest-1', restaurante: { nombre: 'La Parrilla' } }] as never)
})

describe('MozosPage', () => {
  it('sin restaurante elegido pide elegir uno', () => {
    restauranteActual = null

    render(<MozosPage />)

    expect(screen.getByText('Seleccioná un restaurante para ver los mozos.')).toBeInTheDocument()
    expect(mozosApi.list).not.toHaveBeenCalled()
  })

  describe('lista de mozos', () => {
    it('muestra cada mozo con su email, sus mesas y los llamados de hoy', async () => {
      await abrirPagina()

      expect(mozosApi.list).toHaveBeenCalledWith('rest-1')
      expect(screen.getByText('ana@menyu.com')).toBeInTheDocument()
      expect(screen.getAllByText('Jefe de salón')).toHaveLength(1)
      expect(screen.getByText('3 llamados hoy')).toBeInTheDocument()
      expect(screen.getByText('1 llamado hoy')).toBeInTheDocument()
      expect(screen.getByText('Sin mesas')).toBeInTheDocument()
    })

    it('mientras carga lo dice, y sin mozos avisa que no hay', async () => {
      mozosApi.list.mockResolvedValue([])

      render(<MozosPage />)

      expect(screen.getByText('Cargando...')).toBeInTheDocument()
      expect(await screen.findByText('No hay mozos en este restaurante todavía.')).toBeInTheDocument()
    })

    it('un GERENTE ve la lista pero no puede agregar mozos ni ver gerentes', async () => {
      rolActual = 'GERENTE'

      await abrirPagina()

      expect(screen.queryByRole('button', { name: '+ Agregar mozo' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Gerentes' })).not.toBeInTheDocument()
    })
  })

  describe('detalle de un mozo', () => {
    async function abrirAna() {
      await abrirPagina()
      fireEvent.click(screen.getByText('Ana Pérez'))
      await screen.findByText('Mesas asignadas')
    }

    it('muestra sus mesas y las disponibles; "Mozos" vuelve a la lista', async () => {
      await abrirAna()

      expect(screen.getByText('Asignadas a Ana Pérez')).toBeInTheDocument()
      expect(screen.getByText('Sin mozo asignado')).toBeInTheDocument()

      fireEvent.click(boton('Mozos'))
      expect(screen.queryByText('Mesas asignadas')).not.toBeInTheDocument()
    })

    it('asigna una mesa disponible y, con todas asignadas, lo dice', async () => {
      mozosApi.assignMesa.mockResolvedValue(undefined as never)
      await abrirAna()

      fireEvent.click(screen.getByText('Sin mozo asignado'))

      expect(await screen.findByText('Todas las mesas están asignadas.')).toBeInTheDocument()
      expect(mozosApi.assignMesa).toHaveBeenCalledWith('mozo-ana', 'mesa-2')
    })

    it('si asignar falla no cambia nada', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      mozosApi.assignMesa.mockRejectedValue(new ApiError(409, 'Ya asignada'))
      await abrirAna()

      fireEvent.click(screen.getByText('Sin mozo asignado'))

      await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Ya asignada'))
      expect(screen.getByText('Sin mozo asignado')).toBeInTheDocument()
      error.mockRestore()
    })

    it('quitar una mesa pide confirmación; al confirmar la quita', async () => {
      mozosApi.unassignMesa.mockResolvedValue(undefined as never)
      await abrirAna()

      fireEvent.click(boton('× quitar'))
      expect(screen.getByText('¿Quitar mesa 1?')).toBeInTheDocument()
      expect(screen.getByText('Se quitará la asignación de esta mesa para Ana Pérez.')).toBeInTheDocument()
      fireEvent.click(boton('Sí, quitar'))

      expect(await screen.findByText('Sin mesas asignadas')).toBeInTheDocument()
      expect(mozosApi.unassignMesa).toHaveBeenCalledWith('mozo-ana', 'mesa-1')
    })

    it('cancelar la confirmación no quita la mesa', async () => {
      await abrirAna()

      fireEvent.click(boton('× quitar'))
      fireEvent.click(boton('Cancelar'))

      expect(screen.queryByText('¿Quitar mesa 1?')).not.toBeInTheDocument()
      expect(mozosApi.unassignMesa).not.toHaveBeenCalled()
    })

    it('si quitar falla, la mesa sigue', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      mozosApi.unassignMesa.mockRejectedValue(new Error('caído'))
      await abrirAna()

      fireEvent.click(boton('× quitar'))
      fireEvent.click(boton('Sí, quitar'))

      await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Error al quitar mesa'))
      expect(screen.queryByText('Sin mesas asignadas')).not.toBeInTheDocument()
      error.mockRestore()
    })

    it('edita los datos: guarda nombre, email y contraseña nueva', async () => {
      mozosApi.update.mockResolvedValue({ ...ANA, nombre: 'Ana P.' })
      await abrirAna()

      fireEvent.click(boton('⚙ Editar datos del mozo'))
      expect(campo('Nombre').value).toBe('Ana Pérez')
      escribir(campo('Nombre'), 'Ana P.')
      escribir(campo('Nueva contraseña'), 'secreta1')
      fireEvent.click(boton('Guardar cambios'))

      expect(await screen.findAllByText('Ana P.')).not.toHaveLength(0)
      expect(mozosApi.update).toHaveBeenCalledWith('mozo-ana', { nombre: 'Ana P.', email: 'ana@menyu.com', password: 'secreta1' })
      expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    })

    it('si guardar falla muestra el error; "Cancelar" vuelve a los datos originales', async () => {
      mozosApi.update.mockRejectedValue(new ApiError(409, 'Ese email ya existe'))
      await abrirAna()

      fireEvent.click(boton('⚙ Editar datos del mozo'))
      escribir(campo('Email'), '')
      fireEvent.click(boton('Guardar cambios'))
      expect(await screen.findByText('Ese email ya existe')).toBeInTheDocument()
      expect(mozosApi.update).toHaveBeenCalledWith('mozo-ana', { nombre: 'Ana Pérez', email: undefined, password: undefined })

      fireEvent.click(boton('Cancelar'))
      fireEvent.click(boton('⚙ Editar datos del mozo'))
      expect(campo('Email').value).toBe('ana@menyu.com')
      expect(screen.queryByText('Ese email ya existe')).not.toBeInTheDocument()
    })

    it('un error que no es de la API dice "Error al guardar"', async () => {
      mozosApi.update.mockRejectedValue(new Error('red'))
      await abrirAna()

      fireEvent.click(boton('⚙ Editar datos del mozo'))
      fireEvent.click(boton('Guardar cambios'))

      expect(await screen.findByText('Error al guardar')).toBeInTheDocument()
    })

    it('eliminar pide confirmación y, al confirmar, vuelve a la lista sin el mozo', async () => {
      mozosApi.delete.mockResolvedValue(undefined as never)
      await abrirAna()

      fireEvent.click(boton('⚙ Editar datos del mozo'))
      fireEvent.click(boton('Eliminar mozo'))
      expect(screen.getByText('¿Eliminar mozo?')).toBeInTheDocument()
      fireEvent.click(boton('Sí, eliminar'))

      expect(await screen.findByText('Luis')).toBeInTheDocument()
      expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument()
      expect(mozosApi.delete).toHaveBeenCalledWith('mozo-ana')
    })

    it('si eliminar falla muestra el error y sigue en el detalle', async () => {
      mozosApi.delete.mockRejectedValue(new ApiError(409, 'Tiene mesas abiertas'))
      await abrirAna()

      fireEvent.click(boton('⚙ Editar datos del mozo'))
      fireEvent.click(boton('Eliminar mozo'))
      fireEvent.click(boton('Sí, eliminar'))

      expect(await screen.findByText('Tiene mesas abiertas')).toBeInTheDocument()
      expect(screen.getByText('Mesas asignadas')).toBeInTheDocument()
    })

    it('un GERENTE ve el detalle pero no puede editar', async () => {
      rolActual = 'GERENTE'
      await abrirAna()

      expect(screen.queryByRole('button', { name: '⚙ Editar datos del mozo' })).not.toBeInTheDocument()
    })
  })

  describe('agregar un mozo', () => {
    async function abrirModal() {
      await abrirPagina()
      fireEvent.click(boton('+ Agregar mozo'))
      return screen.getByText('Nuevo mozo').closest('div')!.parentElement!
    }

    it('sin completar los campos no lo crea', async () => {
      await abrirModal()

      fireEvent.click(boton('Crear mozo'))

      expect(screen.getByText('Completá todos los campos requeridos')).toBeInTheDocument()
      expect(mozosApi.create).not.toHaveBeenCalled()
    })

    it('con los datos lo crea, cierra el modal y lo suma a la lista', async () => {
      mozosApi.create.mockResolvedValue({ ...LUIS, id: 'mozo-sol', nombre: 'Sol' })
      const modal = await abrirModal()

      escribir(campo('Nombre', modal), 'Sol')
      escribir(campo('Email', modal), 'sol@menyu.com')
      escribir(campo('Contraseña', modal), 'secreta1')
      fireEvent.click(boton('Crear mozo'))

      expect(await screen.findByText('Sol')).toBeInTheDocument()
      expect(mozosApi.create).toHaveBeenCalledWith({ restauranteId: 'rest-1', nombre: 'Sol', email: 'sol@menyu.com', password: 'secreta1', esJefeSalon: false })
      expect(screen.queryByText('Nuevo mozo')).not.toBeInTheDocument()
    })

    it('si falla muestra el error del servidor', async () => {
      mozosApi.create.mockRejectedValue(new ApiError(409, 'Ese email ya existe'))
      const modal = await abrirModal()

      escribir(campo('Nombre', modal), 'Sol')
      escribir(campo('Email', modal), 'sol@menyu.com')
      escribir(campo('Contraseña', modal), 'secreta1')
      fireEvent.click(boton('Crear mozo'))

      expect(await screen.findByText('Ese email ya existe')).toBeInTheDocument()
    })

    it('"Cancelar" cierra el modal y borra lo escrito', async () => {
      const modal = await abrirModal()
      escribir(campo('Nombre', modal), 'Sol')

      fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }))
      fireEvent.click(boton('+ Agregar mozo'))

      expect(campo('Nombre', screen.getByText('Nuevo mozo').closest('div')!.parentElement!).value).toBe('')
    })
  })

  describe('gerentes (solo OWNER)', () => {
    async function abrirGerentes() {
      await abrirPagina()
      fireEvent.click(boton('Gerentes'))
      await screen.findByText('gerente@menyu.com')
    }

    it('lista solo los GERENTE con sus restaurantes', async () => {
      await abrirGerentes()

      expect(screen.getByText('La Parrilla')).toBeInTheDocument()
      expect(screen.queryByText('owner@menyu.com')).not.toBeInTheDocument()
      expect(relApi.porAdmin).toHaveBeenCalledWith('ger-1')
    })

    it('sin gerentes avisa, y si falla la consulta de un gerente se muestra sin restaurantes', async () => {
      adminsApi.list.mockResolvedValueOnce([]).mockResolvedValueOnce([GERENTE] as never)
      relApi.porAdmin.mockRejectedValue(new Error('caído'))
      await abrirPagina()

      fireEvent.click(boton('Gerentes'))
      expect(await screen.findByText('No hay gerentes creados todavía.')).toBeInTheDocument()

      fireEvent.click(boton('Mozos'))
      fireEvent.click(boton('Gerentes'))
      expect(await screen.findByText('Sin restaurantes asignados')).toBeInTheDocument()
    })

    it('en el detalle asigna un restaurante disponible y quita uno con confirmación', async () => {
      relApi.asignar.mockResolvedValue(undefined as never)
      relApi.desasignar.mockResolvedValue(undefined as never)
      await abrirGerentes()

      fireEvent.click(screen.getByText('gerente@menyu.com'))
      expect(await screen.findByText('Acceso a restaurantes')).toBeInTheDocument()

      fireEvent.click(screen.getByText('El Bodegón'))
      expect(await screen.findByText('Sin restaurantes disponibles')).toBeInTheDocument()
      expect(relApi.asignar).toHaveBeenCalledWith('ger-1', 'rest-2')

      fireEvent.click(screen.getAllByRole('button', { name: '× quitar' })[0])
      expect(screen.getByText('¿Quitar acceso a La Parrilla?')).toBeInTheDocument()
      expect(screen.getByText('gerente@menyu.com ya no podrá administrar este restaurante.')).toBeInTheDocument()
      fireEvent.click(boton('Sí, quitar'))

      await vi.waitFor(() => expect(relApi.desasignar).toHaveBeenCalledWith('ger-1', 'rest-1'))
      // La Parrilla vuelve a estar disponible para asignar.
      await vi.waitFor(() => expect(screen.queryByText('Sin restaurantes disponibles')).not.toBeInTheDocument())
      expect(screen.getByText('La Parrilla')).toBeInTheDocument()
    })

    it('si asignar o quitar fallan, no cambia el acceso', async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      relApi.asignar.mockRejectedValue(new ApiError(403, 'No'))
      relApi.desasignar.mockRejectedValue(new Error('caído'))
      await abrirGerentes()
      fireEvent.click(screen.getByText('gerente@menyu.com'))
      await screen.findByText('Acceso a restaurantes')

      fireEvent.click(screen.getByText('El Bodegón'))
      await vi.waitFor(() => expect(error).toHaveBeenCalledWith('No'))
      fireEvent.click(boton('× quitar'))
      fireEvent.click(boton('Sí, quitar'))
      await vi.waitFor(() => expect(error).toHaveBeenCalledWith('Error al quitar restaurante'))

      expect(screen.getByText('El Bodegón')).toBeInTheDocument()
      error.mockRestore()
    })

    it('edita el email, muestra un error al guardar y elimina con confirmación', async () => {
      adminsApi.update.mockResolvedValueOnce({ ...GERENTE, email: 'nuevo@menyu.com' } as never).mockRejectedValueOnce(new Error('red'))
      adminsApi.delete.mockResolvedValue(undefined as never)
      await abrirGerentes()
      fireEvent.click(screen.getByText('gerente@menyu.com'))
      await screen.findByText('Acceso a restaurantes')

      fireEvent.click(boton('⚙ Editar datos del gerente'))
      escribir(campo('Email'), 'nuevo@menyu.com')
      escribir(campo('Nueva contraseña'), 'secreta1')
      fireEvent.click(boton('Guardar cambios'))
      expect(await screen.findAllByText('nuevo@menyu.com')).not.toHaveLength(0)
      expect(adminsApi.update).toHaveBeenCalledWith('ger-1', { email: 'nuevo@menyu.com', password: 'secreta1' })

      fireEvent.click(boton('⚙ Editar datos del gerente'))
      fireEvent.click(boton('Guardar cambios'))
      expect(await screen.findByText('Error al guardar')).toBeInTheDocument()
      fireEvent.click(boton('Cancelar'))

      fireEvent.click(boton('⚙ Editar datos del gerente'))
      fireEvent.click(boton('Eliminar gerente'))
      expect(screen.getByText('¿Eliminar gerente?')).toBeInTheDocument()
      fireEvent.click(boton('Sí, eliminar'))

      expect(await screen.findByText('No hay gerentes creados todavía.')).toBeInTheDocument()
      expect(adminsApi.delete).toHaveBeenCalledWith('ger-1')
    })

    it('si eliminar falla muestra el error; "Gerentes" vuelve a la lista', async () => {
      adminsApi.delete.mockRejectedValue(new ApiError(409, 'Tiene restaurantes'))
      await abrirGerentes()
      fireEvent.click(screen.getByText('gerente@menyu.com'))
      await screen.findByText('Acceso a restaurantes')

      fireEvent.click(boton('⚙ Editar datos del gerente'))
      fireEvent.click(boton('Eliminar gerente'))
      fireEvent.click(boton('Sí, eliminar'))
      expect(await screen.findByText('Tiene restaurantes')).toBeInTheDocument()

      fireEvent.click(boton('Gerentes'))
      expect(screen.queryByText('Acceso a restaurantes')).not.toBeInTheDocument()
    })

    describe('crear gerente', () => {
      async function abrirModal() {
        await abrirGerentes()
        fireEvent.click(boton('+ Crear gerente'))
        return screen.getByText('Nuevo gerente').closest('div')!.parentElement!
      }

      it('sin los datos no lo crea; con un error del servidor lo muestra', async () => {
        adminsApi.create.mockRejectedValue(new ApiError(409, 'Ese email ya existe'))
        const modal = await abrirModal()

        fireEvent.click(boton('Crear gerente'))
        expect(screen.getByText('Completá todos los campos requeridos')).toBeInTheDocument()

        escribir(campo('Nombre', modal), 'Gero')
        escribir(campo('Email', modal), 'gero@menyu.com')
        escribir(campo('Contraseña', modal), 'secreta1')
        fireEvent.click(boton('Crear gerente'))
        expect(await screen.findByText('Ese email ya existe')).toBeInTheDocument()
      })

      it('creado, avisa y a los 1,5 s cierra el modal', async () => {
        adminsApi.create.mockResolvedValue({} as never)
        const modal = await abrirModal()
        vi.useFakeTimers()

        escribir(campo('Nombre', modal), 'Gero')
        escribir(campo('Email', modal), 'gero@menyu.com')
        escribir(campo('Contraseña', modal), 'secreta1')
        await act(async () => { fireEvent.click(boton('Crear gerente')) })
        expect(screen.getByText('Gerente creado correctamente')).toBeInTheDocument()
        expect(adminsApi.create).toHaveBeenCalledWith({ nombre: 'Gero', email: 'gero@menyu.com', password: 'secreta1', restauranteId: 'rest-1' })

        await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
        expect(screen.queryByText('Nuevo gerente')).not.toBeInTheDocument()
        vi.useRealTimers()
      })

      it('"Cancelar" cierra el modal', async () => {
        const modal = await abrirModal()

        fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }))

        expect(screen.queryByText('Nuevo gerente')).not.toBeInTheDocument()
      })
    })
  })
})
