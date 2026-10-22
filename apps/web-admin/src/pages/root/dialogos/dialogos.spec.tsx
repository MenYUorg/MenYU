import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '../../../services/api'
import { marcaDetalle, promesaManual, restaurante } from '../../../test/root'
import { DialogoBajaMarca, DialogoMarca, DialogoReactivarMarca } from './marca'
import { errorDeNombre, errorDeSlug } from './validaciones'
import { DialogoBajaRestaurante, DialogoReactivarRestaurante, DialogoRestaurante } from './restaurante'
import { mensajeDeEnvio } from './envio'

vi.mock('@menyu/auth', () => ({ TOKEN_KEY: 'menyu_access_token', REFRESH_KEY: 'menyu_refresh_token', resolveLoginUrl: vi.fn() }))
vi.mock('../../../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../services/api')>()
  const { apiFalsa } = await import('../../../test/root')
  return { ...original, api: apiFalsa }
})

const marcas = vi.mocked(api.root.marcas)
const restaurantes = vi.mocked(api.root.restaurantes)

beforeEach(() => vi.clearAllMocks())

describe('validaciones de nombre e identificador', () => {
  it('el nombre no puede estar vacío ni pasar de 120 caracteres', () => {
    expect(errorDeNombre('')).toBe('Escribí el nombre.')
    expect(errorDeNombre('   ')).toBe('Escribí el nombre.')
    expect(errorDeNombre('a'.repeat(120))).toBe('')
    expect(errorDeNombre('a'.repeat(121))).toContain('120')
  })

  it('el identificador usa minúsculas, números y guiones sueltos, hasta 80 caracteres', () => {
    expect(errorDeSlug('')).toBe('Escribí el identificador.')
    expect(errorDeSlug('la-parrilla-2')).toBe('')
    expect(errorDeSlug('La-Parrilla')).toBe('') // se pasa a minúsculas antes de mandarlo
    expect(errorDeSlug('la parrilla')).toContain('minúsculas')
    expect(errorDeSlug('-la-parrilla')).toContain('minúsculas')
    expect(errorDeSlug('la--parrilla')).toContain('minúsculas')
    expect(errorDeSlug('a'.repeat(80))).toBe('')
    expect(errorDeSlug('a'.repeat(81))).toContain('80')
  })
})

describe('mensajeDeEnvio', () => {
  it('un error 4xx muestra el texto del servidor, que ya viene en español', () => {
    expect(mensajeDeEnvio(new ApiError(409, 'Ya existe una marca con ese identificador'))).toBe('Ya existe una marca con ese identificador')
  })

  it('un error 5xx no muestra el texto técnico', () => {
    expect(mensajeDeEnvio(new ApiError(500, 'Error 500'))).toBe('No pudimos completar la acción. Probá de nuevo en un momento.')
  })

  it('una falta de red se dice como tal', () => {
    expect(mensajeDeEnvio(new TypeError('Failed to fetch'))).toContain('Sin conexión')
  })
})

describe('DialogoMarca', () => {
  function abrirNueva() {
    const alGuardar = vi.fn()
    const alCerrar = vi.fn()
    render(<DialogoMarca onGuardada={alGuardar} onCerrar={alCerrar} />)
    return { alGuardar, alCerrar }
  }

  it('al crear, el identificador se arma solo con el nombre', async () => {
    abrirNueva()

    await userEvent.type(screen.getByLabelText('Nombre *'), 'Café del Puerto')

    expect(screen.getByLabelText('Identificador *')).toHaveValue('cafe-del-puerto')
  })

  it('si ROOT toca el identificador, el nombre deja de pisarlo', async () => {
    abrirNueva()
    await userEvent.type(screen.getByLabelText('Nombre *'), 'Café')
    await userEvent.clear(screen.getByLabelText('Identificador *'))
    await userEvent.type(screen.getByLabelText('Identificador *'), 'mi-cafe')

    await userEvent.type(screen.getByLabelText('Nombre *'), ' del Puerto')

    expect(screen.getByLabelText('Identificador *')).toHaveValue('mi-cafe')
  })

  it('crea la marca con el nombre y el identificador sin espacios sobrantes', async () => {
    const creada = marcaDetalle({ id: 'nueva', nombre: 'La Parrilla', slug: 'la-parrilla' })
    marcas.crear.mockResolvedValue(creada)
    const { alGuardar } = abrirNueva()

    await userEvent.type(screen.getByLabelText('Nombre *'), '  La Parrilla  ')
    await userEvent.click(screen.getByRole('button', { name: 'Crear marca' }))

    expect(marcas.crear).toHaveBeenCalledWith({ nombre: 'La Parrilla', slug: 'la-parrilla' })
    expect(alGuardar).toHaveBeenCalledWith(creada)
  })

  it('con el nombre vacío avisa y no llama a la API', async () => {
    abrirNueva()

    await userEvent.click(screen.getByRole('button', { name: 'Crear marca' }))

    expect(screen.getByText('Escribí el nombre.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre *')).toHaveAttribute('aria-invalid', 'true')
    expect(marcas.crear).not.toHaveBeenCalled()
  })

  it('con un identificador mal escrito avisa y no llama a la API', async () => {
    abrirNueva()
    await userEvent.type(screen.getByLabelText('Nombre *'), 'La Parrilla')
    await userEvent.clear(screen.getByLabelText('Identificador *'))
    await userEvent.type(screen.getByLabelText('Identificador *'), 'La Parrilla!')

    await userEvent.click(screen.getByRole('button', { name: 'Crear marca' }))

    expect(screen.getByText(/Usá minúsculas/)).toBeInTheDocument()
    expect(marcas.crear).not.toHaveBeenCalled()
  })

  it('un identificador repetido (409) se avisa debajo del campo y no cierra el diálogo', async () => {
    marcas.crear.mockRejectedValue(new ApiError(409, 'Ya existe una marca con ese identificador'))
    const { alGuardar, alCerrar } = abrirNueva()
    await userEvent.type(screen.getByLabelText('Nombre *'), 'La Parrilla')

    await userEvent.click(screen.getByRole('button', { name: 'Crear marca' }))

    expect(await screen.findByText(/Ya existe una marca con ese identificador\. Cambialo para poder crearla/)).toBeInTheDocument()
    expect(screen.getByLabelText('Identificador *')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('No pudimos completar la acción.')).not.toBeInTheDocument()
    expect(alGuardar).not.toHaveBeenCalled()
    expect(alCerrar).not.toHaveBeenCalled()
  })

  it('el aviso de identificador repetido se va al cambiar el identificador', async () => {
    marcas.crear.mockRejectedValue(new ApiError(409, 'repetido'))
    abrirNueva()
    await userEvent.type(screen.getByLabelText('Nombre *'), 'La Parrilla')
    await userEvent.click(screen.getByRole('button', { name: 'Crear marca' }))
    await screen.findByText(/Ya existe una marca/)

    await userEvent.type(screen.getByLabelText('Identificador *'), '-2')

    expect(screen.queryByText(/Ya existe una marca/)).not.toBeInTheDocument()
  })

  it('otro error del servidor se muestra arriba, en el mismo diálogo, y se puede volver a intentar', async () => {
    marcas.crear.mockRejectedValueOnce(new ApiError(500, 'Error 500')).mockResolvedValueOnce(marcaDetalle())
    const { alGuardar } = abrirNueva()
    await userEvent.type(screen.getByLabelText('Nombre *'), 'La Parrilla')

    await userEvent.click(screen.getByRole('button', { name: 'Crear marca' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar la acción.')
    expect(screen.getByLabelText('Nombre *')).toHaveValue('La Parrilla')

    await userEvent.click(screen.getByRole('button', { name: 'Crear marca' }))

    expect(alGuardar).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un doble toque no manda dos veces', async () => {
    const pendiente = promesaManual<ReturnType<typeof marcaDetalle>>()
    marcas.crear.mockReturnValue(pendiente.promesa)
    abrirNueva()
    await userEvent.type(screen.getByLabelText('Nombre *'), 'La Parrilla')

    await userEvent.click(screen.getByRole('button', { name: 'Crear marca' }))
    const guardando = screen.getByRole('button', { name: 'Guardando…' })
    await userEvent.click(guardando)
    await userEvent.type(screen.getByLabelText('Nombre *'), '{Enter}')

    expect(guardando).toBeDisabled()
    expect(marcas.crear).toHaveBeenCalledTimes(1)
  })

  describe('al editar', () => {
    const marca = { id: 'marca-1', nombre: 'La Parrilla', slug: 'la-parrilla' }

    function abrirEdicion() {
      const alGuardar = vi.fn()
      const alCerrar = vi.fn()
      render(<DialogoMarca marca={marca} onGuardada={alGuardar} onCerrar={alCerrar} />)
      return { alGuardar, alCerrar }
    }

    it('parte de los valores actuales y no toca el identificador al cambiar el nombre', async () => {
      abrirEdicion()
      expect(screen.getByLabelText('Nombre *')).toHaveValue('La Parrilla')

      await userEvent.type(screen.getByLabelText('Nombre *'), ' Norte')

      expect(screen.getByLabelText('Identificador *')).toHaveValue('la-parrilla')
    })

    it('manda solo lo que cambió', async () => {
      const editada = marcaDetalle({ nombre: 'La Parrilla Norte' })
      marcas.editar.mockResolvedValue(editada)
      const { alGuardar } = abrirEdicion()

      await userEvent.type(screen.getByLabelText('Nombre *'), ' Norte')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(marcas.editar).toHaveBeenCalledWith('marca-1', { nombre: 'La Parrilla Norte' })
      expect(alGuardar).toHaveBeenCalledWith(editada)
    })

    it('si no cambió nada, se cierra sin llamar a la API (no hay nada que registrar)', async () => {
      const { alCerrar, alGuardar } = abrirEdicion()

      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(marcas.editar).not.toHaveBeenCalled()
      expect(alGuardar).not.toHaveBeenCalled()
      expect(alCerrar).toHaveBeenCalledTimes(1)
    })

    it('un identificador repetido dice "guardar los cambios"', async () => {
      marcas.editar.mockRejectedValue(new ApiError(409, 'repetido'))
      abrirEdicion()

      await userEvent.type(screen.getByLabelText('Identificador *'), '-2')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(await screen.findByText(/Cambialo para poder guardar los cambios/)).toBeInTheDocument()
    })
  })
})

describe('DialogoBajaMarca', () => {
  const marca = marcaDetalle({ nombre: 'La Parrilla' })

  function abrir() {
    const alHacer = vi.fn()
    const alCerrar = vi.fn()
    render(<DialogoBajaMarca marca={marca} onHecho={alHacer} onCerrar={alCerrar} />)
    return { alHacer, alCerrar, boton: screen.getByRole('button', { name: 'Dar de baja' }) }
  }

  it('el botón queda deshabilitado hasta escribir el nombre de la marca', async () => {
    const { boton } = abrir()
    expect(boton).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Para confirmar, escribí el nombre de la marca'), 'La Parri')
    expect(boton).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Para confirmar, escribí el nombre de la marca'), 'lla')
    expect(boton).toBeEnabled()
  })

  it('no distingue mayúsculas ni espacios de los costados', async () => {
    const { boton } = abrir()

    await userEvent.type(screen.getByLabelText('Para confirmar, escribí el nombre de la marca'), '  la parrilla ')

    expect(boton).toBeEnabled()
  })

  it('sin la confirmación, ni siquiera Enter en el campo da de baja', async () => {
    abrir()

    await userEvent.type(screen.getByLabelText('Para confirmar, escribí el nombre de la marca'), 'otra{Enter}')

    expect(marcas.baja).not.toHaveBeenCalled()
  })

  it('da de baja y devuelve la marca ya cambiada', async () => {
    const dadaDeBaja = { ...marca, activo: false }
    marcas.baja.mockResolvedValue(dadaDeBaja)
    const { alHacer, boton } = abrir()
    await userEvent.type(screen.getByLabelText('Para confirmar, escribí el nombre de la marca'), 'La Parrilla')

    await userEvent.click(boton)

    expect(marcas.baja).toHaveBeenCalledWith('marca-1')
    expect(alHacer).toHaveBeenCalledWith(dadaDeBaja)
  })

  it('cuenta los restaurantes activos y avisa lo que se corta, también el acceso de su gente', () => {
    abrir()

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveTextContent('2 restaurantes dejan de estar disponibles')
    expect(dialogo).toHaveTextContent('no abren mesas nuevas')
    expect(dialogo).toHaveTextContent('Las mesas que ya están abiertas se pueden terminar')
    expect(dialogo).toHaveTextContent('Sus dueños, gerentes, mozos y cocina no pueden iniciar sesión mientras esté de baja')
    expect(dialogo).toHaveTextContent('No se borra ningún dato')
    expect(dialogo).toHaveTextContent('Es reversible')
  })

  it('un restaurante dado de baja no cuenta', () => {
    render(
      <DialogoBajaMarca
        marca={marcaDetalle({ restaurantes: [restaurante(), restaurante({ id: 'r2', activo: false })] })}
        onHecho={vi.fn()}
        onCerrar={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveTextContent('1 restaurante deja de estar disponible')
  })

  it('si falla, lo dice sin cerrar', async () => {
    marcas.baja.mockRejectedValue(new ApiError(500, 'Error 500'))
    const { alHacer, boton } = abrir()
    await userEvent.type(screen.getByLabelText('Para confirmar, escribí el nombre de la marca'), 'La Parrilla')

    await userEvent.click(boton)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar la acción.')
    expect(alHacer).not.toHaveBeenCalled()
  })
})

describe('DialogoReactivarMarca', () => {
  it('reactiva sin pedir confirmación escrita', async () => {
    const reactivada = marcaDetalle()
    marcas.reactivar.mockResolvedValue(reactivada)
    const alHacer = vi.fn()
    render(<DialogoReactivarMarca marca={marcaDetalle({ activo: false })} onHecho={alHacer} onCerrar={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('vuelven a Discovery, a mostrar su carta y a abrir mesas')

    await userEvent.click(screen.getByRole('button', { name: 'Reactivar' }))

    expect(marcas.reactivar).toHaveBeenCalledWith('marca-1')
    expect(alHacer).toHaveBeenCalledWith(reactivada)
  })
})

describe('DialogoRestaurante', () => {
  const marca = { id: 'marca-1', nombre: 'La Parrilla' }

  describe('al crear', () => {
    function abrir() {
      const alGuardar = vi.fn()
      render(<DialogoRestaurante marca={marca} onGuardado={alGuardar} onCerrar={vi.fn()} />)
      return { alGuardar }
    }

    it('muestra la marca (fija) y pide nombre y dirección', () => {
      abrir()

      expect(screen.getByRole('dialog', { name: 'Nuevo restaurante' })).toHaveTextContent('La Parrilla')
      expect(screen.getByLabelText('Nombre *')).toBeInTheDocument()
      expect(screen.getByLabelText('Dirección *')).toBeInTheDocument()
    })

    it('exige las dos cosas antes de llamar a la API', async () => {
      abrir()

      await userEvent.click(screen.getByRole('button', { name: 'Crear restaurante' }))

      expect(screen.getByText('Escribí el nombre.')).toBeInTheDocument()
      expect(screen.getByText('Escribí la dirección.')).toBeInTheDocument()
      expect(marcas.crearRestaurante).not.toHaveBeenCalled()
    })

    it('la dirección no puede pasar de 200 caracteres', async () => {
      abrir()
      await userEvent.type(screen.getByLabelText('Nombre *'), 'Centro')
      await userEvent.click(screen.getByLabelText('Dirección *'))
      await userEvent.paste('a'.repeat(201))

      await userEvent.click(screen.getByRole('button', { name: 'Crear restaurante' }))

      expect(screen.getByText(/hasta 200 caracteres/)).toBeInTheDocument()
      expect(marcas.crearRestaurante).not.toHaveBeenCalled()
    })

    it('crea el restaurante dentro de la marca, con los textos sin espacios sobrantes', async () => {
      marcas.crearRestaurante.mockResolvedValue(restaurante())
      const { alGuardar } = abrir()

      await userEvent.type(screen.getByLabelText('Nombre *'), ' Centro ')
      await userEvent.type(screen.getByLabelText('Dirección *'), ' Av. Siempre Viva 742 ')
      await userEvent.click(screen.getByRole('button', { name: 'Crear restaurante' }))

      expect(marcas.crearRestaurante).toHaveBeenCalledWith('marca-1', { nombre: 'Centro', direccion: 'Av. Siempre Viva 742' })
      expect(alGuardar).toHaveBeenCalledTimes(1)
    })
  })

  describe('al editar', () => {
    const existente = restaurante({ nombre: 'Centro', direccion: 'Av. Siempre Viva 742' })

    function abrir(r = existente) {
      const alGuardar = vi.fn()
      const alCerrar = vi.fn()
      render(<DialogoRestaurante marca={marca} restaurante={r} onGuardado={alGuardar} onCerrar={alCerrar} />)
      return { alGuardar, alCerrar }
    }

    it('solo se edita el nombre: la dirección se ve pero no es un campo', () => {
      abrir()

      expect(screen.getByLabelText('Nombre *')).toHaveValue('Centro')
      expect(screen.queryByLabelText(/Dirección/)).not.toBeInTheDocument()
      expect(screen.getByRole('dialog')).toHaveTextContent('Av. Siempre Viva 742')
      expect(screen.getByRole('dialog')).toHaveTextContent('los cambia el dueño de la marca')
    })

    it('un restaurante sin dirección lo dice', () => {
      abrir(restaurante({ direccion: null }))

      expect(screen.getByRole('dialog')).toHaveTextContent('Dirección no cargada')
    })

    it('manda solo el nombre', async () => {
      restaurantes.editar.mockResolvedValue(restaurante({ nombre: 'Centro Nuevo' }))
      const { alGuardar } = abrir()

      await userEvent.type(screen.getByLabelText('Nombre *'), ' Nuevo')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(restaurantes.editar).toHaveBeenCalledWith('rest-1', { nombre: 'Centro Nuevo' })
      expect(alGuardar).toHaveBeenCalledTimes(1)
    })

    it('con el mismo nombre se cierra sin llamar a la API', async () => {
      const { alCerrar } = abrir()

      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      expect(restaurantes.editar).not.toHaveBeenCalled()
      expect(alCerrar).toHaveBeenCalledTimes(1)
    })
  })
})

describe('DialogoBajaRestaurante y DialogoReactivarRestaurante', () => {
  it('dar de baja pide un solo toque y avisa lo que pasa', async () => {
    restaurantes.baja.mockResolvedValue(restaurante({ activo: false }))
    const alHacer = vi.fn()
    render(<DialogoBajaRestaurante restaurante={restaurante()} onHecho={alHacer} onCerrar={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Deja de estar disponible')
    expect(screen.getByRole('dialog')).toHaveTextContent('no abren mesas nuevas')
    expect(screen.getByRole('dialog')).toHaveTextContent('Sus gerentes, mozos y cocina no pueden iniciar sesión mientras esté de baja')

    await userEvent.click(screen.getByRole('button', { name: 'Dar de baja' }))

    expect(restaurantes.baja).toHaveBeenCalledWith('rest-1')
    expect(alHacer).toHaveBeenCalledTimes(1)
  })

  it('reactivar vuelve a aparecer', async () => {
    restaurantes.reactivar.mockResolvedValue(restaurante())
    const alHacer = vi.fn()
    render(<DialogoReactivarRestaurante restaurante={restaurante({ activo: false })} onHecho={alHacer} onCerrar={vi.fn()} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Vuelve a Discovery, a mostrar su carta y a abrir mesas')

    await userEvent.click(screen.getByRole('button', { name: 'Reactivar' }))

    expect(restaurantes.reactivar).toHaveBeenCalledWith('rest-1')
    expect(alHacer).toHaveBeenCalledTimes(1)
  })

  it('si la baja falla, lo dice y no avisa que salió bien', async () => {
    restaurantes.baja.mockRejectedValue(new TypeError('Failed to fetch'))
    const alHacer = vi.fn()
    render(<DialogoBajaRestaurante restaurante={restaurante()} onHecho={alHacer} onCerrar={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Dar de baja' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
    expect(alHacer).not.toHaveBeenCalled()
  })
})
