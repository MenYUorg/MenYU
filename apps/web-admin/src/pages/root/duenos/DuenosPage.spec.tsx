import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ApiError, api } from '../../../services/api'
import { dueno, marcaResumen, promesaManual } from '../../../test/root'
import { DuenosPage } from './DuenosPage'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())
vi.mock('../../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/api')>()
  const { apiFalsa } = await import('../../../test/root')
  return { ...original, api: apiFalsa }
})

const duenos = vi.mocked(api.root.duenos)
const marcas = vi.mocked(api.root.marcas)

const JUAN = dueno()
const LUCIA = dueno({ membresiaId: 'm-lucia', usuarioId: 'u-lucia', nombre: 'Lucía Fiore', email: 'lucia@fiorecucina.com', marca: { id: 'marca-2', nombre: 'Fiore Cucina', activo: true } })
const ADMIN_FIORE = dueno({ membresiaId: 'm-admin', usuarioId: 'u-admin', nombre: 'Administración Fiore', email: 'administracion@fiorecucina.com', marca: { id: 'marca-2', nombre: 'Fiore Cucina', activo: true } })
const MATEO = dueno({ membresiaId: 'm-mateo', usuarioId: 'u-mateo', nombre: 'Mateo Puerto', email: 'puerto@cafedelpuerto.com.ar', marca: { id: 'marca-3', nombre: 'Café del Puerto', activo: false } })

function dibujar() {
  return render(
    <MemoryRouter>
      <DuenosPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  duenos.listar.mockResolvedValue([JUAN, LUCIA, ADMIN_FIORE, MATEO])
  marcas.listar.mockResolvedValue([marcaResumen(), marcaResumen({ id: 'marca-2', nombre: 'Fiore Cucina', slug: 'fiore-cucina' })])
})

const lista = () => within(screen.getByRole('region', { name: 'Dueños' }))
/** Espera a que la lista cargada esté en pantalla y busca ese texto adentro. */
const enLista = async (texto: string) => within(await screen.findByRole('region', { name: 'Dueños' })).findByText(texto)

describe('DuenosPage: la lista', () => {
  it('muestra cada dueño con su email y su marca, y la marca se abre con un toque', async () => {
    dibujar()

    expect(await enLista('Juan')).toBeInTheDocument()
    expect(lista().getByText('juan@laparrilla.com')).toBeInTheDocument()
    expect(lista().getByRole('link', { name: 'La Parrilla' })).toHaveAttribute('href', '/root/marcas/marca-1')
    expect(lista().getAllByRole('link', { name: 'Fiore Cucina' })).toHaveLength(2)
    expect(duenos.listar).toHaveBeenCalledTimes(1)
  })

  it('una marca de baja lo dice', async () => {
    dibujar()

    await enLista('Mateo Puerto')

    expect(lista().getByText(/marca de baja/)).toBeInTheDocument()
  })

  it('una cuenta desactivada lo dice', async () => {
    duenos.listar.mockResolvedValue([JUAN, dueno({ membresiaId: 'm-2', nombre: 'Ana', email: 'ana@x.com', activo: false })])
    dibujar()

    await enLista('Ana')

    expect(lista().getAllByText('Cuenta desactivada')).toHaveLength(1)
  })

  it('mientras carga muestra esqueletos', () => {
    duenos.listar.mockReturnValue(new Promise(() => {}))
    dibujar()

    expect(screen.getByLabelText('Cargando')).toBeInTheDocument()
  })

  it('sin dueños lo dice', async () => {
    duenos.listar.mockResolvedValue([])
    dibujar()

    expect(await screen.findByText('Todavía no hay dueños')).toBeInTheDocument()
    expect(screen.getByText(/Se lo invita por mail/)).toBeInTheDocument()
  })

  it('un error del servidor ofrece reintentar', async () => {
    duenos.listar.mockRejectedValueOnce(new ApiError(500, 'Error 500'))
    dibujar()

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los datos.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await enLista('Juan')).toBeInTheDocument()
  })

  it('sin red lo dice', async () => {
    duenos.listar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    dibujar()

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
  })
})

describe('DuenosPage: la búsqueda', () => {
  async function buscar(texto: string) {
    dibujar()
    await enLista('Juan')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar dueño' }), texto)
  }

  it('encuentra por email', async () => {
    await buscar('puerto@cafe')

    expect(lista().getByText('Mateo Puerto')).toBeInTheDocument()
    expect(lista().queryByText('Juan')).not.toBeInTheDocument()
  })

  it('encuentra por nombre de la marca', async () => {
    await buscar('fiore')

    expect(lista().getByText('Lucía Fiore')).toBeInTheDocument()
    expect(lista().getByText('Administración Fiore')).toBeInTheDocument()
    expect(lista().queryByText('Juan')).not.toBeInTheDocument()
  })

  it('encuentra por nombre de la persona, sin importar mayúsculas ni acentos ("lucia" encuentra a "Lucía")', async () => {
    await buscar('LUCIA')

    expect(lista().getByText('Lucía Fiore')).toBeInTheDocument()
    expect(lista().queryByText('Administración Fiore')).not.toBeInTheDocument()
  })

  describe('cada criterio por separado (lo que se busca solo está en ese campo)', () => {
    // El acento está únicamente en el nombre de José y únicamente en la marca de Ana; lo de Beto solo está en su email.
    const JOSE = dueno({ membresiaId: 'j', nombre: 'José Ñandú', email: 'jose@ejemplo.test', marca: { id: 'm-j', nombre: 'La Parrilla', activo: true } })
    const ANA = dueno({ membresiaId: 'a', nombre: 'Ana', email: 'ana@ejemplo.test', marca: { id: 'm-a', nombre: 'Café Ñoño', activo: true } })
    const BETO = dueno({ membresiaId: 'b', nombre: 'Beto', email: 'beto@correo-unico.test', marca: { id: 'm-b', nombre: 'Otra', activo: true } })

    async function buscarEntre(texto: string) {
      duenos.listar.mockResolvedValue([JOSE, ANA, BETO])
      dibujar()
      await enLista('Beto')
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar dueño' }), texto)
    }

    it('por nombre, sin acentos: "nandu" encuentra a "José Ñandú"', async () => {
      await buscarEntre('nandu')

      expect(lista().getByText('José Ñandú')).toBeInTheDocument()
      expect(lista().queryByText('Ana')).not.toBeInTheDocument()
      expect(lista().queryByText('Beto')).not.toBeInTheDocument()
    })

    it('por marca, sin acentos: "cafe" encuentra la marca "Café Ñoño"', async () => {
      await buscarEntre('cafe')

      expect(lista().getByText('Ana')).toBeInTheDocument()
      expect(lista().queryByText('José Ñandú')).not.toBeInTheDocument()
      expect(lista().queryByText('Beto')).not.toBeInTheDocument()
    })

    it('por email: lo que solo está en el email encuentra a esa persona', async () => {
      await buscarEntre('correo-unico')

      expect(lista().getByText('Beto')).toBeInTheDocument()
      expect(lista().queryByText('Ana')).not.toBeInTheDocument()
    })

    it('sin importar las mayúsculas', async () => {
      await buscarEntre('JOSE@EJEMPLO')

      expect(lista().getByText('José Ñandú')).toBeInTheDocument()
      expect(lista().queryByText('Ana')).not.toBeInTheDocument()
    })
  })

  it('sin resultados dice qué se buscó, y al borrar vuelve la lista', async () => {
    await buscar('zzz')

    expect(screen.getByText('No encontramos dueños con «zzz»')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Dueños' })).not.toBeInTheDocument()
    await userEvent.clear(screen.getByRole('searchbox', { name: 'Buscar dueño' }))
    expect(await enLista('Juan')).toBeInTheDocument()
  })

  it('buscar no vuelve a pedir la lista: se filtra en pantalla', async () => {
    await buscar('fiore')

    expect(duenos.listar).toHaveBeenCalledTimes(1)
  })
})

describe('DuenosPage: quitar el acceso', () => {
  async function abrirQuitar(nombre: string, marca = '') {
    dibujar()
    await enLista('Juan')
    await userEvent.click(screen.getByRole('button', { name: `Acciones de ${nombre}${marca ? ` (${marca})` : ''}` }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Quitar acceso' }))
  }

  it('pide confirmar, quita con el id de la membresía, vuelve a pedir la lista y avisa', async () => {
    duenos.quitar.mockResolvedValue(undefined)
    duenos.listar.mockResolvedValueOnce([JUAN, LUCIA, ADMIN_FIORE, MATEO]).mockResolvedValueOnce([JUAN, ADMIN_FIORE, MATEO])
    await abrirQuitar('Lucía Fiore', 'Fiore Cucina')

    const dialogo = within(screen.getByRole('dialog'))
    expect(dialogo.getByText(/deja de poder administrar «Fiore Cucina»/)).toBeInTheDocument()
    await userEvent.click(dialogo.getByRole('button', { name: 'Quitar acceso' }))

    expect(duenos.quitar).toHaveBeenCalledWith('m-lucia')
    expect(await screen.findByRole('status')).toHaveTextContent('Acceso quitado')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(duenos.listar).toHaveBeenCalledTimes(2)
    expect(lista().queryByText('Lucía Fiore')).not.toBeInTheDocument()
  })

  it('el único dueño de una marca activa no se quita: explica y ofrece invitar a otro', async () => {
    await abrirQuitar('Juan', 'La Parrilla')

    expect(screen.getByRole('dialog', { name: 'No se puede quitar todavía' })).toBeInTheDocument()
    expect(screen.getByText(/único dueño/)).toBeInTheDocument()
    expect(duenos.quitar).not.toHaveBeenCalled()
  })

  it('desde ese aviso se invita a otro dueño de la misma marca, ya elegida', async () => {
    await abrirQuitar('Juan', 'La Parrilla')

    await userEvent.click(screen.getByRole('button', { name: 'Invitar a otro dueño' }))

    expect(await screen.findByRole('dialog', { name: 'Invitar dueño' })).toBeInTheDocument()
    await screen.findByRole('option', { name: 'La Parrilla' })
    expect(screen.getByLabelText('Marca *')).toHaveValue('marca-1')
  })

  it('el único dueño de una marca de baja sí se puede quitar', async () => {
    await abrirQuitar('Mateo Puerto', 'Café del Puerto')

    expect(screen.getByRole('dialog', { name: 'Quitar el acceso de Mateo Puerto' })).toBeInTheDocument()
  })

  it('con la lista filtrada sigue sabiendo que la marca tiene otro dueño (cuenta sobre la lista entera)', async () => {
    dibujar()
    await enLista('Juan')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar dueño' }), 'lucia@')
    expect(lista().queryByText('Administración Fiore')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Lucía Fiore (Fiore Cucina)' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Quitar acceso' }))

    expect(screen.getByRole('dialog', { name: 'Quitar el acceso de Lucía Fiore' })).toBeInTheDocument()
  })

  it('una persona con dos marcas, único dueño de cada una, no puede dejar a ninguna sin dueño', async () => {
    const enLaOtra = dueno({ membresiaId: 'm-juan-2', nombre: 'Juan', marca: { id: 'marca-4', nombre: 'BurgerLab', activo: true } })
    duenos.listar.mockResolvedValue([JUAN, enLaOtra])
    dibujar()
    await enLista('BurgerLab')

    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Juan (BurgerLab)' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Quitar acceso' }))

    expect(screen.getByRole('dialog', { name: 'No se puede quitar todavía' })).toBeInTheDocument()
    expect(screen.getByText(/«BurgerLab»/)).toBeInTheDocument()
  })

  it('si la API lo rechaza igual (409 por una carrera), el diálogo muestra el texto y la lista no cambia', async () => {
    duenos.quitar.mockRejectedValue(new ApiError(409, 'Es el único dueño de «Fiore Cucina», una marca activa'))
    await abrirQuitar('Lucía Fiore', 'Fiore Cucina')

    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar acceso' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Es el único dueño de «Fiore Cucina»')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(duenos.listar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('DuenosPage: invitar', () => {
  async function abrirInvitar() {
    dibujar()
    await enLista('Juan')
    await userEvent.click(screen.getByRole('button', { name: 'Invitar dueño' }))
    await screen.findByRole('option', { name: 'Fiore Cucina' })
  }

  async function completar(marca: string) {
    await userEvent.selectOptions(screen.getByLabelText('Marca *'), marca)
    await userEvent.type(screen.getByLabelText('Nombre *'), 'Nuevo Dueño')
    await userEvent.type(screen.getByLabelText('Email *'), 'nuevo@fiorecucina.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
  }

  it('abre el diálogo para elegir la marca, invita, cuenta que salió el mail y vuelve a pedir la lista', async () => {
    duenos.invitar.mockResolvedValue({ usuarioId: 'u', membresiaId: 'm', invitacionEnviada: true })
    await abrirInvitar()

    await completar('Fiore Cucina')

    expect(duenos.invitar).toHaveBeenCalledWith('marca-2', { email: 'nuevo@fiorecucina.com', nombre: 'Nuevo Dueño' })
    expect(await screen.findByRole('dialog', { name: 'Invitación enviada' })).toBeInTheDocument()
    expect(screen.getByText('nuevo@fiorecucina.com')).toBeInTheDocument()
    expect(duenos.listar).toHaveBeenCalledTimes(2)
  })

  it('si la persona ya tenía cuenta, lo cuenta', async () => {
    duenos.invitar.mockResolvedValue({ usuarioId: 'u', membresiaId: 'm', invitacionEnviada: false })
    await abrirInvitar()

    await completar('Fiore Cucina')

    expect(await screen.findByRole('dialog', { name: 'Ya tenía una cuenta' })).toBeInTheDocument()
  })

  it('"Listo" cierra el diálogo y la lista queda a la vista', async () => {
    duenos.invitar.mockResolvedValue({ usuarioId: 'u', membresiaId: 'm', invitacionEnviada: true })
    await abrirInvitar()
    await completar('Fiore Cucina')

    await userEvent.click(await screen.findByRole('button', { name: 'Listo' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(lista().getByText('Juan')).toBeInTheDocument()
  })

  it('si la invitación falla no se vuelve a pedir la lista', async () => {
    duenos.invitar.mockRejectedValue(new ApiError(409, 'La marca está dada de baja'))
    await abrirInvitar()

    await completar('Fiore Cucina')

    expect(await screen.findByRole('alert')).toHaveTextContent('La marca está dada de baja')
    expect(duenos.listar).toHaveBeenCalledTimes(1)
  })

  it('la lista que se vuelve a pedir después de invitar trae al dueño nuevo, aunque tarde en llegar', async () => {
    duenos.invitar.mockResolvedValue({ usuarioId: 'u', membresiaId: 'm', invitacionEnviada: true })
    const nueva = dueno({ membresiaId: 'm-nuevo', nombre: 'Nuevo Dueño', email: 'nuevo@fiorecucina.com', marca: { id: 'marca-2', nombre: 'Fiore Cucina', activo: true } })
    const segunda = promesaManual<ReturnType<typeof dueno>[]>()
    duenos.listar.mockResolvedValueOnce([JUAN, LUCIA]).mockReturnValueOnce(segunda.promesa)
    await abrirInvitar()

    await completar('Fiore Cucina')
    await screen.findByRole('dialog', { name: 'Invitación enviada' })
    segunda.resolver([JUAN, LUCIA, nueva])

    expect(await enLista('Nuevo Dueño')).toBeInTheDocument()
  })
})
