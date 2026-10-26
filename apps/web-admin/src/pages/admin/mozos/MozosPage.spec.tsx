import { fireEvent, render, screen, within } from '@testing-library/react'
import type { PersonalDelRestaurante } from '@menyu/types'
import { api, ApiError } from '../../../services/api'
import { perfilDePrueba, reiniciarSesionDePrueba, sesionDePrueba } from '../../../test/authClient'
import { MozosPage } from './MozosPage'

let rolActual: 'OWNER' | 'GERENTE' | null = 'OWNER'
let restauranteActual: string | null = 'rest-1'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())

vi.mock('../../../store/contextStore', () => ({
  useRolActual: () => rolActual,
  useContextStore: () => ({
    selectedRestauranteId: restauranteActual,
    restaurantes: [
      { id: 'rest-1', nombre: 'La Parrilla', marcaId: 'marca-1' },
      { id: 'rest-2', nombre: 'El Bodegón', marcaId: 'marca-1' },
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
        update: vi.fn(),
        delete: vi.fn(),
        getMesas: vi.fn(),
        assignMesa: vi.fn(),
        unassignMesa: vi.fn(),
        llamadosHoy: vi.fn(),
      },
      mesas: { list: vi.fn() },
      personal: { listar: vi.fn(), quitarAcceso: vi.fn() },
      invitaciones: { crear: vi.fn() },
    },
  }
})

const mozosApi = vi.mocked(api.mozos)
const personalApi = vi.mocked(api.personal)
const invitacionesApi = vi.mocked(api.invitaciones)

const ANA = { id: 'mozo-ana', nombre: 'Ana Pérez', email: 'ana@menyu.com', telefono: null, activo: true, esJefeSalon: true, createdAt: '2026-10-01' }
const LUIS = { id: 'mozo-luis', nombre: 'Luis', email: null, telefono: null, activo: true, esJefeSalon: false, createdAt: '2026-10-01' }
const MESA_1 = { id: 'mesa-1', numero: '1', estado: 'libre' }
const MESA_2 = { id: 'mesa-2', numero: '2', estado: 'libre' }

const PERSONAL: PersonalDelRestaurante = {
  duenos: [{ membresiaId: 'mem-owner', usuarioId: 'usuario-1', nombre: 'Dueña Delia', email: 'delia@menyu.com', rol: 'OWNER' }],
  miembros: [
    { membresiaId: 'mem-ger', usuarioId: 'u-ger', nombre: 'Gerardo Gerente', email: 'gerardo@menyu.com', rol: 'GERENTE' },
    { membresiaId: 'mem-ana', usuarioId: 'u-ana', nombre: 'Ana Pérez', email: 'ana@menyu.com', rol: 'JEFE_SALON' },
    { membresiaId: 'mem-coco', usuarioId: 'u-coco', nombre: 'Coco Cocina', email: 'coco@menyu.com', rol: 'COCINA' },
  ],
  sinCuenta: [{ mozoId: 'mozo-luis', nombre: 'Luis', email: 'luis@menyu.com', esJefeSalon: false }],
}

/** El texto de la etiqueta y su input (las etiquetas no están asociadas al campo). */
function campo(etiqueta: string, dentro: HTMLElement = document.body): HTMLInputElement {
  const label = within(dentro).getAllByText(etiqueta, { selector: 'label' })[0]
  return label.parentElement!.querySelector('input') as HTMLInputElement
}
const escribir = (input: HTMLInputElement, valor: string) => fireEvent.change(input, { target: { value: valor } })
const boton = (nombre: string | RegExp) => screen.getByRole('button', { name: nombre })
const seccion = (titulo: string) => within(screen.getByRole('region', { name: titulo }))

async function abrirPersonal() {
  render(<MozosPage />)
  await screen.findByRole('region', { name: 'Con acceso a este restaurante' })
}

async function abrirMozos() {
  render(<MozosPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Mozos' }))
  await screen.findByText('3 llamados hoy')
}

/** El modal de invitar, para distinguir sus campos y botones de los de la lista. */
function modalDeInvitar(): HTMLElement {
  return screen.getByText('Invitar a alguien').closest('div')!.parentElement!
}

beforeEach(() => {
  rolActual = 'OWNER'
  restauranteActual = 'rest-1'
  vi.clearAllMocks()
  reiniciarSesionDePrueba()
  // El perfil de la persona que usa la pantalla: es la dueña de la marca (usuarioId usuario-1).
  sesionDePrueba.perfil = perfilDePrueba({ email: 'delia@menyu.com' })
  personalApi.listar.mockResolvedValue(PERSONAL)
  mozosApi.list.mockResolvedValue([ANA, LUIS])
  vi.mocked(api.mesas.list).mockResolvedValue([
    { ...MESA_1, mozoMesas: [{ id: 'mm-1', mozoId: 'mozo-ana', mozo: { id: 'mozo-ana', nombre: 'Ana Pérez' } }] },
    { ...MESA_2, mozoMesas: undefined },
  ] as never)
  mozosApi.getMesas.mockImplementation((id: string) => Promise.resolve(id === 'mozo-ana' ? [MESA_1] : []) as never)
  mozosApi.llamadosHoy.mockImplementation((id: string) => Promise.resolve({ total: id === 'mozo-ana' ? 3 : 1 }) as never)
})

describe('MozosPage (Personal)', () => {
  it('sin restaurante elegido pide elegir uno y no consulta', () => {
    restauranteActual = null

    render(<MozosPage />)

    expect(screen.getByText('Seleccioná un restaurante para ver el personal.')).toBeInTheDocument()
    expect(personalApi.listar).not.toHaveBeenCalled()
    expect(mozosApi.list).not.toHaveBeenCalled()
  })

  describe('la lista del personal', () => {
    it('muestra los dueños de la marca, los miembros con su rol y los mozos sin cuenta', async () => {
      await abrirPersonal()

      expect(personalApi.listar).toHaveBeenCalledWith('rest-1')
      expect(seccion('Dueños de la marca').getByText('Dueña Delia')).toBeInTheDocument()
      const conAcceso = seccion('Con acceso a este restaurante')
      expect(conAcceso.getByText('Gerardo Gerente')).toBeInTheDocument()
      expect(conAcceso.getByText('Gerente')).toBeInTheDocument()
      expect(conAcceso.getByText('Jefe de salón')).toBeInTheDocument()
      expect(conAcceso.getByText('Cocina')).toBeInTheDocument()
      const sinCuenta = seccion('Mozos sin cuenta')
      expect(sinCuenta.getByText('luis@menyu.com · Sin cuenta')).toBeInTheDocument()
    })

    it('mientras carga lo dice; si la consulta falla muestra el error del servidor', async () => {
      personalApi.listar.mockRejectedValue(new ApiError(403, 'No tenés acceso a este restaurante'))

      render(<MozosPage />)
      expect(screen.getByText('Cargando...')).toBeInTheDocument()

      expect(await screen.findByText('No tenés acceso a este restaurante')).toBeInTheDocument()
    })

    it('sin nadie invitado y sin mozos sueltos, lo dice y no muestra la sección vacía', async () => {
      personalApi.listar.mockResolvedValue({ duenos: [], miembros: [], sinCuenta: [] })

      await abrirPersonal()

      expect(screen.getByText('Esta marca no tiene dueños cargados.')).toBeInTheDocument()
      expect(screen.getByText('Todavía no invitaste a nadie a este restaurante.')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Mozos sin cuenta' })).not.toBeInTheDocument()
    })

    it('marca con "Vos" a la cuenta propia', async () => {
      await abrirPersonal()

      expect(seccion('Dueños de la marca').getByText('Vos')).toBeInTheDocument()
    })
  })

  describe('quitar el acceso', () => {
    it('el OWNER puede quitarle el acceso a cualquiera del restaurante, pero no a un dueño', async () => {
      await abrirPersonal()

      expect(seccion('Con acceso a este restaurante').getAllByRole('button', { name: 'Quitar acceso' })).toHaveLength(3)
      expect(seccion('Dueños de la marca').queryByRole('button', { name: 'Quitar acceso' })).not.toBeInTheDocument()
    })

    it('el GERENTE solo puede quitar al personal de salón y cocina, no a otro gerente', async () => {
      rolActual = 'GERENTE'

      await abrirPersonal()

      const conAcceso = seccion('Con acceso a este restaurante')
      expect(conAcceso.getAllByRole('button', { name: 'Quitar acceso' })).toHaveLength(2)
      const filaDelGerente = conAcceso.getByText('Gerardo Gerente').closest('div')!.parentElement!
      expect(within(filaDelGerente).queryByRole('button', { name: 'Quitar acceso' })).not.toBeInTheDocument()
    })

    it('nadie se quita el acceso a sí mismo', async () => {
      personalApi.listar.mockResolvedValue({
        ...PERSONAL,
        miembros: [{ membresiaId: 'mem-propia', usuarioId: 'usuario-1', nombre: 'Yo Mismo', email: 'delia@menyu.com', rol: 'GERENTE' }],
      })

      await abrirPersonal()

      const conAcceso = seccion('Con acceso a este restaurante')
      expect(conAcceso.getByText('Vos')).toBeInTheDocument()
      expect(conAcceso.queryByRole('button', { name: 'Quitar acceso' })).not.toBeInTheDocument()
    })

    it('pide confirmación, lo quita y vuelve a leer la lista', async () => {
      personalApi.quitarAcceso.mockResolvedValue(undefined)
      await abrirPersonal()

      fireEvent.click(seccion('Con acceso a este restaurante').getAllByRole('button', { name: 'Quitar acceso' })[0])
      expect(screen.getByText('¿Quitarle el acceso?')).toBeInTheDocument()
      expect(screen.getByText(/Gerardo Gerente deja de entrar a este restaurante/)).toBeInTheDocument()
      personalApi.listar.mockResolvedValue({ ...PERSONAL, miembros: PERSONAL.miembros.slice(1) })
      fireEvent.click(boton('Sí, quitar acceso'))

      await vi.waitFor(() => expect(personalApi.quitarAcceso).toHaveBeenCalledWith('rest-1', 'mem-ger'))
      await vi.waitFor(() => expect(screen.queryByText('Gerardo Gerente')).not.toBeInTheDocument())
    })

    it('cancelar no quita nada', async () => {
      await abrirPersonal()

      fireEvent.click(seccion('Con acceso a este restaurante').getAllByRole('button', { name: 'Quitar acceso' })[0])
      fireEvent.click(boton('Cancelar'))

      expect(screen.queryByText('¿Quitarle el acceso?')).not.toBeInTheDocument()
      expect(personalApi.quitarAcceso).not.toHaveBeenCalled()
    })

    it('si el servidor lo rechaza, muestra su mensaje y la persona sigue en la lista', async () => {
      personalApi.quitarAcceso.mockRejectedValue(new ApiError(403, 'No podés quitarle el acceso a esta persona'))
      await abrirPersonal()

      fireEvent.click(seccion('Con acceso a este restaurante').getAllByRole('button', { name: 'Quitar acceso' })[0])
      fireEvent.click(boton('Sí, quitar acceso'))

      expect(await screen.findByText('No podés quitarle el acceso a esta persona')).toBeInTheDocument()
      expect(screen.getByText('Gerardo Gerente')).toBeInTheDocument()
    })

    it('un error que no es de la API dice que no se pudo', async () => {
      personalApi.quitarAcceso.mockRejectedValue(new Error('red'))
      await abrirPersonal()

      fireEvent.click(seccion('Con acceso a este restaurante').getAllByRole('button', { name: 'Quitar acceso' })[0])
      fireEvent.click(boton('Sí, quitar acceso'))

      expect(await screen.findByText('No se pudo quitar el acceso')).toBeInTheDocument()
    })
  })

  describe('invitar', () => {
    async function abrirModal() {
      await abrirPersonal()
      fireEvent.click(screen.getAllByRole('button', { name: /Invitar/ })[0])
      return modalDeInvitar()
    }

    it('el OWNER puede invitar a cualquier rol de su marca; el GERENTE, solo al personal de salón y cocina', async () => {
      await abrirModal()
      expect(
        [...screen.getByRole('combobox').querySelectorAll('option')].map((o) => o.textContent),
      ).toEqual(['Gerente', 'Jefe de salón', 'Mozo', 'Cocina', 'Dueño (toda la marca)'])
    })

    it('el GERENTE no ve el rol de dueño ni el de gerente', async () => {
      rolActual = 'GERENTE'

      await abrirModal()

      expect(
        [...screen.getByRole('combobox').querySelectorAll('option')].map((o) => o.textContent),
      ).toEqual(['Jefe de salón', 'Mozo', 'Cocina'])
    })

    it('sin email o nombre no invita', async () => {
      const modal = await abrirModal()

      escribir(campo('Email', modal), 'sol@menyu.com')
      fireEvent.click(boton('Enviar invitación'))

      expect(screen.getByText('Completá el email y el nombre')).toBeInTheDocument()
      expect(invitacionesApi.crear).not.toHaveBeenCalled()
    })

    it('invita al restaurante elegido y avisa que salió el mail', async () => {
      invitacionesApi.crear.mockResolvedValue({ usuarioId: 'u-sol', membresiaId: 'mem-sol', invitacionEnviada: true })
      const modal = await abrirModal()

      escribir(campo('Email', modal), 'sol@menyu.com')
      escribir(campo('Nombre', modal), 'Sol')
      fireEvent.click(boton('Enviar invitación'))

      await vi.waitFor(() => expect(invitacionesApi.crear).toHaveBeenCalledWith({
        email: 'sol@menyu.com', nombre: 'Sol', rol: 'MOZO', restauranteId: 'rest-1',
      }))
      expect(await screen.findByRole('status')).toHaveTextContent('Invitación enviada a sol@menyu.com')
      expect(screen.queryByText('Invitar a alguien')).not.toBeInTheDocument()
      // Se vuelve a leer el personal: la persona invitada aparece en la lista.
      expect(personalApi.listar).toHaveBeenCalledTimes(2)
    })

    it('invitar a un dueño va con la marca, no con el restaurante', async () => {
      invitacionesApi.crear.mockResolvedValue({ usuarioId: 'u-d', membresiaId: 'mem-d', invitacionEnviada: true })
      const modal = await abrirModal()

      escribir(campo('Email', modal), 'duena@menyu.com')
      escribir(campo('Nombre', modal), 'Otra Dueña')
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'OWNER' } })
      fireEvent.click(boton('Enviar invitación'))

      await vi.waitFor(() => expect(invitacionesApi.crear).toHaveBeenCalledWith({
        email: 'duena@menyu.com', nombre: 'Otra Dueña', rol: 'OWNER', marcaId: 'marca-1',
      }))
    })

    it('si la cuenta ya existía, avisa que no hace falta el mail', async () => {
      invitacionesApi.crear.mockResolvedValue({ usuarioId: 'u-sol', membresiaId: 'mem-sol', invitacionEnviada: false })
      const modal = await abrirModal()

      escribir(campo('Email', modal), 'sol@menyu.com')
      escribir(campo('Nombre', modal), 'Sol')
      fireEvent.click(boton('Enviar invitación'))

      expect(await screen.findByRole('status')).toHaveTextContent('ya tenía cuenta en MenYU')
    })

    it('el aviso se puede cerrar', async () => {
      invitacionesApi.crear.mockResolvedValue({ usuarioId: 'u-sol', membresiaId: 'mem-sol', invitacionEnviada: true })
      const modal = await abrirModal()
      escribir(campo('Email', modal), 'sol@menyu.com')
      escribir(campo('Nombre', modal), 'Sol')
      fireEvent.click(boton('Enviar invitación'))
      await screen.findByRole('status')

      fireEvent.click(boton('Cerrar aviso'))

      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('si el servidor rechaza la invitación, muestra su mensaje y el modal sigue abierto', async () => {
      invitacionesApi.crear.mockRejectedValue(new ApiError(409, 'Esa persona ya trabaja en este restaurante'))
      const modal = await abrirModal()

      escribir(campo('Email', modal), 'ana@menyu.com')
      escribir(campo('Nombre', modal), 'Ana')
      fireEvent.click(boton('Enviar invitación'))

      expect(await screen.findByText('Esa persona ya trabaja en este restaurante')).toBeInTheDocument()
      expect(screen.getByText('Invitar a alguien')).toBeInTheDocument()
    })

    it('un error que no es de la API dice que no se pudo', async () => {
      invitacionesApi.crear.mockRejectedValue(new Error('red'))
      const modal = await abrirModal()

      escribir(campo('Email', modal), 'sol@menyu.com')
      escribir(campo('Nombre', modal), 'Sol')
      fireEvent.click(boton('Enviar invitación'))

      expect(await screen.findByText('No se pudo invitar')).toBeInTheDocument()
    })

    it('"Cancelar" cierra el modal y la próxima vez abre vacío', async () => {
      const modal = await abrirModal()
      escribir(campo('Email', modal), 'sol@menyu.com')

      fireEvent.click(within(modal).getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText('Invitar a alguien')).not.toBeInTheDocument()

      fireEvent.click(screen.getAllByRole('button', { name: /Invitar/ })[0])
      expect(campo('Email', modalDeInvitar()).value).toBe('')
    })

    describe('desde un mozo sin cuenta', () => {
      it('abre el modal con su email, su nombre y el rol que tenía', async () => {
        await abrirPersonal()

        fireEvent.click(seccion('Mozos sin cuenta').getByRole('button', { name: 'Invitar' }))

        const modal = modalDeInvitar()
        expect(campo('Email', modal).value).toBe('luis@menyu.com')
        expect(campo('Nombre', modal).value).toBe('Luis')
        expect(screen.getByRole('combobox')).toHaveValue('MOZO')
      })

      it('un jefe de salón sin cuenta se invita como jefe de salón', async () => {
        personalApi.listar.mockResolvedValue({
          ...PERSONAL,
          sinCuenta: [{ mozoId: 'mozo-jefa', nombre: 'Jefa Jimena', email: 'jimena@menyu.com', esJefeSalon: true }],
        })
        await abrirPersonal()

        fireEvent.click(seccion('Mozos sin cuenta').getByRole('button', { name: 'Invitar' }))

        expect(screen.getByRole('combobox')).toHaveValue('JEFE_SALON')
      })

      it('sin email no se lo puede invitar', async () => {
        personalApi.listar.mockResolvedValue({
          ...PERSONAL,
          sinCuenta: [{ mozoId: 'mozo-luis', nombre: 'Luis', email: null, esJefeSalon: false }],
        })
        await abrirPersonal()

        const sinCuenta = seccion('Mozos sin cuenta')
        expect(sinCuenta.getByText('Sin email · Sin cuenta')).toBeInTheDocument()
        expect(sinCuenta.getByRole('button', { name: 'Invitar' })).toBeDisabled()
      })
    })
  })

  describe('la pestaña de mozos (perfil operativo)', () => {
    it('muestra cada mozo con sus mesas y los llamados de hoy', async () => {
      await abrirMozos()

      expect(mozosApi.list).toHaveBeenCalledWith('rest-1')
      expect(screen.getByText('3 llamados hoy')).toBeInTheDocument()
      expect(screen.getByText('1 llamado hoy')).toBeInTheDocument()
      expect(screen.getByText('Sin mesas')).toBeInTheDocument()
    })

    it('sin mozos avisa que no hay', async () => {
      mozosApi.list.mockResolvedValue([])

      render(<MozosPage />)
      fireEvent.click(await screen.findByRole('button', { name: 'Mozos' }))

      expect(await screen.findByText('No hay mozos en este restaurante todavía.')).toBeInTheDocument()
    })

    it('si la consulta de mozos falla, lo dice en lugar de quedar vacía', async () => {
      mozosApi.list.mockRejectedValue(new ApiError(500, 'Error interno'))

      render(<MozosPage />)
      fireEvent.click(await screen.findByRole('button', { name: 'Mozos' }))

      expect(await screen.findByText('Error interno')).toBeInTheDocument()
      expect(screen.queryByText('No hay mozos en este restaurante todavía.')).not.toBeInTheDocument()
    })

    it('un error que no es de la API dice que no se pudieron cargar', async () => {
      mozosApi.list.mockRejectedValue(new Error('red'))

      render(<MozosPage />)
      fireEvent.click(await screen.findByRole('button', { name: 'Mozos' }))

      expect(await screen.findByText('No se pudieron cargar los mozos')).toBeInTheDocument()
    })

    describe('detalle de un mozo', () => {
      async function abrirAna() {
        await abrirMozos()
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

      it('quitar una mesa pide confirmación; al confirmar la quita', async () => {
        mozosApi.unassignMesa.mockResolvedValue(undefined as never)
        await abrirAna()

        fireEvent.click(boton('× quitar'))
        expect(screen.getByText('¿Quitar mesa 1?')).toBeInTheDocument()
        fireEvent.click(boton('Sí, quitar'))

        expect(await screen.findByText('Sin mesas asignadas')).toBeInTheDocument()
        expect(mozosApi.unassignMesa).toHaveBeenCalledWith('mozo-ana', 'mesa-1')
      })

      it('edita el nombre y el teléfono, y avisa que el email es de la cuenta', async () => {
        mozosApi.update.mockResolvedValue({ ...ANA, nombre: 'Ana P.', telefono: '1122' })
        await abrirAna()

        fireEvent.click(boton('⚙ Editar datos del mozo'))
        expect(screen.getByText(/El email y la contraseña son de su cuenta/)).toBeInTheDocument()
        expect(screen.queryByText('Nueva contraseña')).not.toBeInTheDocument()
        escribir(campo('Nombre'), 'Ana P.')
        escribir(campo('Teléfono'), '1122')
        fireEvent.click(boton('Guardar cambios'))

        await vi.waitFor(() => expect(mozosApi.update).toHaveBeenCalledWith('mozo-ana', { nombre: 'Ana P.', telefono: '1122' }))
        expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
      })

      it('si guardar falla muestra el error', async () => {
        mozosApi.update.mockRejectedValue(new ApiError(403, 'Solo el dueño puede editarlo'))
        await abrirAna()

        fireEvent.click(boton('⚙ Editar datos del mozo'))
        fireEvent.click(boton('Guardar cambios'))

        expect(await screen.findByText('Solo el dueño puede editarlo')).toBeInTheDocument()
      })

      it('un mozo con cuenta no se elimina: manda a quitarle el acceso desde Personal', async () => {
        await abrirAna()

        fireEvent.click(boton('⚙ Editar datos del mozo'))

        expect(screen.getByText('Para que deje de trabajar acá, quitale el acceso desde Personal.')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Eliminar mozo' })).not.toBeInTheDocument()
      })

      it('un mozo sin cuenta se puede eliminar, con confirmación', async () => {
        mozosApi.delete.mockResolvedValue(undefined as never)
        await abrirMozos()
        fireEvent.click(screen.getByText('Luis'))
        await screen.findByText('Mesas asignadas')

        fireEvent.click(boton('⚙ Editar datos del mozo'))
        fireEvent.click(boton('Eliminar mozo'))
        expect(screen.getByText('¿Eliminar mozo?')).toBeInTheDocument()
        fireEvent.click(boton('Sí, eliminar'))

        await vi.waitFor(() => expect(mozosApi.delete).toHaveBeenCalledWith('mozo-luis'))
        // Vuelve a la lista (el texto de los llamados solo está ahí) y Luis ya no figura.
        expect(await screen.findByText('3 llamados hoy')).toBeInTheDocument()
        expect(screen.queryByText('Mesas asignadas')).not.toBeInTheDocument()
        expect(screen.queryByText('Luis')).not.toBeInTheDocument()
      })

      it('si eliminar falla muestra el error y sigue en el detalle', async () => {
        mozosApi.delete.mockRejectedValue(new ApiError(409, 'Ese mozo tiene una cuenta'))
        await abrirMozos()
        fireEvent.click(screen.getByText('Luis'))
        await screen.findByText('Mesas asignadas')

        fireEvent.click(boton('⚙ Editar datos del mozo'))
        fireEvent.click(boton('Eliminar mozo'))
        fireEvent.click(boton('Sí, eliminar'))

        expect(await screen.findByText('Ese mozo tiene una cuenta')).toBeInTheDocument()
        expect(screen.getByText('Mesas asignadas')).toBeInTheDocument()
      })

      it('un GERENTE ve el detalle pero no edita los datos del mozo', async () => {
        rolActual = 'GERENTE'
        await abrirAna()

        expect(screen.queryByRole('button', { name: '⚙ Editar datos del mozo' })).not.toBeInTheDocument()
      })
    })
  })
})
