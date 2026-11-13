import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { reiniciarDiscoveryStore, useDiscoveryStore } from '../store/discoveryStore'
import { usePublicMenuStore } from '../store/publicMenuStore'
import { useSessionStore } from '../store/sessionStore'
import { crearMenu, crearPlato, crearRestaurante } from '../test/fixtures'
import { SeguimientoDeRuta } from './SeguimientoDeRuta'

function Pantalla({ titulo }: { titulo: string }) {
  return <main><h1>{titulo}</h1></main>
}

/** Una pantalla que pide datos antes de pintar su título, como las de verdad. */
function PantallaLenta() {
  const [listo, setListo] = useState(false)
  useEffect(() => { setListo(true) }, [])
  return listo ? <Pantalla titulo="Mis pedidos" /> : <p>Cargando…</p>
}

function IrAlMenuConOtraBusqueda() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/carrito?de=otro-lado')}>misma ruta</button>
}

function abrir(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <SeguimientoDeRuta />
      <Routes>
        <Route path="/" element={<><Pantalla titulo="Inicio" /><Link to="/carrito">ir al carrito</Link></>} />
        <Route path="/carrito" element={<><Pantalla titulo="Carrito" /><IrAlMenuConOtraBusqueda /><Link to="/pedidos">ir a mis pedidos</Link></>} />
        <Route path="/pedidos" element={<PantallaLenta />} />
        <Route path="*" element={<Pantalla titulo="Otra" />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  reiniciarDiscoveryStore()
  usePublicMenuStore.setState({ menu: null })
  useSessionStore.setState({ restauranteId: null })
  document.title = ''
})

describe('SeguimientoDeRuta: el título de la pestaña', () => {
  it('sin restaurante dice "{Pantalla} · MenYU"', () => {
    abrir('/carrito')

    expect(document.title).toBe('Carrito · MenYU')
  })

  it('en la mesa suma el restaurante de la sesión: "Carrito · La Parrilla"', () => {
    useSessionStore.setState({ restauranteId: 'rest-1' })
    usePublicMenuStore.setState({ menu: crearMenu() })

    abrir('/carrito')

    expect(document.title).toBe('Carrito · La Parrilla')
  })

  it('se corrige solo cuando llega el menú, sin cambiar de pantalla', () => {
    useSessionStore.setState({ restauranteId: 'rest-1' })
    abrir('/carrito')
    expect(document.title).toBe('Carrito · MenYU')

    act(() => { usePublicMenuStore.setState({ menu: crearMenu() }) })

    expect(document.title).toBe('Carrito · La Parrilla')
  })

  it('no confunde el menú guardado de otro restaurante', () => {
    useSessionStore.setState({ restauranteId: 'rest-2' })
    usePublicMenuStore.setState({ menu: crearMenu() })

    abrir('/carrito')

    expect(document.title).toBe('Carrito · MenYU')
  })

  it('en las pantallas del restaurante usa el de la dirección, aunque no haya sesión', () => {
    useDiscoveryStore.setState({
      detalle: { id: 'rest-1', estado: 'listo', restaurante: crearRestaurante({ id: 'rest-1', nombre: 'Lupulus Casa Matriz' }), ofertas: [] },
    })

    abrir('/restaurante/rest-1/mesa')

    expect(document.title).toBe('Ingresar a una mesa · Lupulus Casa Matriz')
  })

  it('si Discovery no trajo el detalle pero sí el listado, el nombre sale de ahí (los ids no distinguen mayúsculas)', () => {
    useDiscoveryStore.setState({ restaurantes: [crearRestaurante({ id: 'ABC-1', nombre: 'Lupulus Casa Matriz' })] })

    abrir('/restaurante/abc-1')

    expect(document.title).toBe('Restaurante · Lupulus Casa Matriz')
  })

  it('un restaurante que no aparece en ningún lado queda en "MenYU"', () => {
    abrir('/restaurante/desconocido/carta')

    expect(document.title).toBe('Carta · MenYU')
  })

  it('en el detalle de un plato, la pantalla es el nombre del plato', () => {
    useSessionStore.setState({ restauranteId: 'rest-1' })
    usePublicMenuStore.setState({
      menu: crearMenu({ categorias: [{ id: 'c1', nombre: 'Principales', orden: 1, itemsDirectos: [crearPlato({ id: 'plato-9', nombre: 'Hamburguesa doble' })] }] }),
    })

    abrir('/menu/plato-9')

    expect(document.title).toBe('Hamburguesa doble · La Parrilla')
  })

  it('si el plato no está en el menú, queda "Detalle del plato"', () => {
    abrir('/menu/no-existe')

    expect(document.title).toBe('Detalle del plato · MenYU')
  })

  it('una ruta sin pantalla propia (las que redirigen) deja solo "MenYU"', () => {
    abrir('/ingresar-pin')

    expect(document.title).toBe('MenYU')
  })

  it('cambia con la pantalla', () => {
    abrir('/carrito')
    expect(document.title).toBe('Carrito · MenYU')

    fireEvent.click(screen.getByRole('link', { name: 'ir a mis pedidos' }))

    expect(document.title).toBe('Mis pedidos · MenYU')
  })
})

describe('SeguimientoDeRuta: el foco al cambiar de pantalla', () => {
  it('en la primera carga no mueve el foco', () => {
    abrir('/carrito')

    expect(document.activeElement).toBe(document.body)
  })

  it('al navegar dentro de la app, el foco va al <h1> de la pantalla nueva', async () => {
    abrir('/')

    fireEvent.click(screen.getByRole('link', { name: 'ir al carrito' }))

    const titulo = await screen.findByRole('heading', { level: 1, name: 'Carrito' })
    expect(document.activeElement).toBe(titulo)
    expect(titulo).toHaveAttribute('tabindex', '-1')
  })

  it('si la pantalla pinta su título después de pedir datos, el foco va cuando aparece', async () => {
    abrir('/carrito')

    fireEvent.click(screen.getByRole('link', { name: 'ir a mis pedidos' }))

    const titulo = await screen.findByRole('heading', { level: 1, name: 'Mis pedidos' })
    await waitFor(() => expect(document.activeElement).toBe(titulo))
  })

  it('quedarse en la misma pantalla (cambia solo la búsqueda de la dirección) no le roba el foco a la persona', () => {
    abrir('/carrito')
    const boton = screen.getByRole('button', { name: 'misma ruta' })
    boton.focus()

    fireEvent.click(boton)

    expect(document.activeElement).toBe(boton)
  })
})
