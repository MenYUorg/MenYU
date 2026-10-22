import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '../../../services/api'
import { cuenta } from '../../../test/root'
import { CuentasRootPage } from './CuentasRootPage'

vi.mock('@menyu/auth-client', async () => (await import('../../../test/authClient')).moduloSimulado())
vi.mock('../../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/api')>()
  const { apiFalsa } = await import('../../../test/root')
  return { ...original, api: apiFalsa }
})

const cuentas = vi.mocked(api.root.cuentas)

const ANA = cuenta({ id: 'r1', nombre: 'Ana López', email: 'ana@menyu.com', esPropia: true })
const BRUNO = cuenta({ id: 'r2', nombre: 'Bruno Gómez', email: 'bruno@menyu.com', esPropia: false })
const CARLA = cuenta({ id: 'r3', nombre: 'Carla Díaz', email: 'carla@menyu.com', esPropia: false, activo: false })

beforeEach(() => {
  vi.clearAllMocks()
  cuentas.listar.mockResolvedValue([ANA, BRUNO, CARLA])
})

const lista = () => within(screen.getByRole('region', { name: 'Cuentas ROOT' }))
/** Espera a que la lista cargada esté en pantalla y busca ese texto adentro. */
const enLista = async (texto: string) => within(await screen.findByRole('region', { name: 'Cuentas ROOT' })).findByText(texto)

describe('CuentasRootPage: la lista', () => {
  it('muestra cada cuenta con su nombre y su email', async () => {
    render(<CuentasRootPage />)

    expect(await enLista('Ana López')).toBeInTheDocument()
    expect(lista().getByText('bruno@menyu.com')).toBeInTheDocument()
    expect(lista().getByText('Carla Díaz')).toBeInTheDocument()
  })

  it('marca "Vos" en la propia, y solo en la propia', async () => {
    render(<CuentasRootPage />)
    await enLista('Ana López')

    expect(lista().getAllByText('Vos')).toHaveLength(1)
    expect(within(lista().getByText('Ana López').parentElement as HTMLElement).getByText('Vos')).toBeInTheDocument()
  })

  it('marca la cuenta desactivada', async () => {
    render(<CuentasRootPage />)
    await enLista('Ana López')

    expect(lista().getAllByText('Cuenta desactivada')).toHaveLength(1)
    expect(within(lista().getByText('Carla Díaz').parentElement as HTMLElement).getByText('Cuenta desactivada')).toBeInTheDocument()
  })

  it('no tiene acciones por cuenta: ni eliminar, ni restablecer la contraseña, ni menús', async () => {
    render(<CuentasRootPage />)
    await enLista('Ana López')

    expect(lista().queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    expect(screen.queryByText(/eliminar|restablecer|contraseña temporal/i)).not.toBeInTheDocument()
  })

  it('explica que las cuentas ROOT no se quitan desde la consola', async () => {
    render(<CuentasRootPage />)

    expect(await screen.findByText(/no se quitan desde la consola/)).toBeInTheDocument()
    expect(screen.getByText(/«Olvidé mi contraseña»/)).toBeInTheDocument()
  })

  it('mientras carga muestra esqueletos', () => {
    cuentas.listar.mockReturnValue(new Promise(() => {}))
    render(<CuentasRootPage />)

    expect(screen.getByLabelText('Cargando')).toBeInTheDocument()
  })

  it('un error del servidor ofrece reintentar', async () => {
    cuentas.listar.mockRejectedValueOnce(new ApiError(500, 'Error 500'))
    render(<CuentasRootPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los datos.')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await enLista('Ana López')).toBeInTheDocument()
  })

  it('sin red lo dice', async () => {
    cuentas.listar.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<CuentasRootPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión.')
  })
})

describe('CuentasRootPage: invitar', () => {
  async function abrirYCompletar() {
    render(<CuentasRootPage />)
    await enLista('Ana López')
    await userEvent.click(screen.getByRole('button', { name: 'Invitar cuenta ROOT' }))
    await userEvent.type(screen.getByLabelText('Nombre *'), 'Dana Ruiz')
    await userEvent.type(screen.getByLabelText('Email *'), 'dana@menyu.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }))
  }

  it('invita, cuenta que salió el mail y vuelve a pedir la lista', async () => {
    cuentas.invitar.mockResolvedValue({ usuarioId: 'u', email: 'dana@menyu.com', invitacionEnviada: true })
    cuentas.listar
      .mockResolvedValueOnce([ANA, BRUNO, CARLA])
      .mockResolvedValueOnce([ANA, BRUNO, CARLA, cuenta({ id: 'r4', nombre: 'Dana Ruiz', email: 'dana@menyu.com', esPropia: false })])

    await abrirYCompletar()

    expect(cuentas.invitar).toHaveBeenCalledWith({ email: 'dana@menyu.com', nombre: 'Dana Ruiz' })
    expect(await screen.findByRole('dialog', { name: 'Invitación enviada' })).toBeInTheDocument()
    expect(await enLista('Dana Ruiz')).toBeInTheDocument()
    expect(cuentas.listar).toHaveBeenCalledTimes(2)
  })

  it('si ya tenía una cuenta de acceso, lo cuenta hablando de la consola', async () => {
    cuentas.invitar.mockResolvedValue({ usuarioId: 'u', email: 'dana@menyu.com', invitacionEnviada: false })

    await abrirYCompletar()

    expect(await screen.findByRole('dialog', { name: 'Ya tenía una cuenta' })).toBeInTheDocument()
    expect(screen.getByText(/usar la consola de ROOT/)).toBeInTheDocument()
  })

  it('"Listo" cierra el diálogo', async () => {
    cuentas.invitar.mockResolvedValue({ usuarioId: 'u', email: 'dana@menyu.com', invitacionEnviada: true })
    await abrirYCompletar()

    await userEvent.click(await screen.findByRole('button', { name: 'Listo' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('si el email ya tiene una cuenta de MenYU (409) se avisa en el diálogo y la lista no se vuelve a pedir', async () => {
    cuentas.invitar.mockRejectedValue(new ApiError(409, 'Ese email ya tiene una cuenta en MenYU'))

    await abrirYCompletar()

    expect(await screen.findByText(/el equipo usa el script de cuentas ROOT/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Invitar cuenta ROOT' })).toBeInTheDocument()
    expect(cuentas.listar).toHaveBeenCalledTimes(1)
  })
})
