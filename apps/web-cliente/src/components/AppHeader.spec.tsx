import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { crearTokenJwt } from '../test/fixtures'
import { AppHeader } from './AppHeader'

const TOKEN_KEY = 'menyu_access_token'
const REFRESH_KEY = 'menyu_refresh_token'

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <p>ruta: {pathname}{search}</p>
}

function renderHeader(props: React.ComponentProps<typeof AppHeader> = {}, ruta = '/menu') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <AppHeader {...props} />
      <Routes>
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
}

const iniciarSesion = (payload: Record<string, unknown>) => localStorage.setItem(TOKEN_KEY, crearTokenJwt(payload))

describe('AppHeader', () => {
  beforeEach(() => localStorage.clear())

  describe('sin sesión iniciada', () => {
    it('ofrece Ingresar y Registrarme, y no saluda', () => {
      renderHeader()

      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Registrarme' })).toBeInTheDocument()
      expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
    })

    it('"Ingresar" lleva al login y "Registrarme" al registro', () => {
      renderHeader()

      fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
      expect(screen.getByText('ruta: /auth')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Registrarme' }))
      expect(screen.getByText('ruta: /auth?tab=register')).toBeInTheDocument()
    })

    it('un token roto cuenta como sin sesión', () => {
      localStorage.setItem(TOKEN_KEY, 'no-es-un-token')

      renderHeader()

      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
    })

    it('un token sin nombre cuenta como sin sesión', () => {
      iniciarSesion({ sub: 'cli-1', tipo: 'cliente' })

      renderHeader()

      expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
    })
  })

  describe('con sesión iniciada', () => {
    it('saluda por el nombre y ofrece cerrar sesión en lugar de Ingresar y Registrarme', () => {
      iniciarSesion({ nombre: 'Marina' })

      renderHeader()

      expect(screen.getByText('Hola, Marina')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ingresar' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Registrarme' })).not.toBeInTheDocument()
    })

    it('un nombre con apellido en el mismo campo se muestra entero: no se adivina cuál es el apellido', () => {
      iniciarSesion({ nombre: 'Marina González' })

      renderHeader()

      expect(screen.getByText('Hola, Marina González')).toBeInTheDocument()
    })

    it('un nombre largo se muestra entero', () => {
      iniciarSesion({ nombre: 'Marina González de la Fuente' })

      renderHeader()

      expect(screen.getByText('Hola, Marina González de la Fuente')).toBeInTheDocument()
    })

    it('los acentos y la Ñ salen bien (el nombre viaja en UTF-8 dentro del token)', () => {
      iniciarSesion({ nombre: 'Ñandú Gómez' })

      renderHeader()

      expect(screen.getByText('Hola, Ñandú Gómez')).toBeInTheDocument()
    })

    it('si el apellido viniera en otro campo, no se muestra: solo el nombre', () => {
      iniciarSesion({ nombre: 'Marina', apellido: 'González' })

      renderHeader()

      expect(screen.getByText('Hola, Marina')).toBeInTheDocument()
      expect(screen.queryByText(/González/)).not.toBeInTheDocument()
    })

    it('un nombre con dos nombres de pila se muestra con los dos', () => {
      iniciarSesion({ nombre: 'Marina Beatriz', apellido: 'González' })

      renderHeader()

      expect(screen.getByText('Hola, Marina Beatriz')).toBeInTheDocument()
    })

    it('se emprolijan los espacios de más', () => {
      iniciarSesion({ nombre: '  Marina    González ' })

      renderHeader()

      // Testing Library ya ignora los espacios de más al buscar texto: se compara el texto tal cual.
      expect(screen.getByText(/^Hola, /).textContent).toBe('Hola, Marina González')
    })

    it('el nombre nunca se corta con "..." (se parte en líneas)', () => {
      iniciarSesion({ nombre: 'Superlargonombredeusuariosinespaciosparaprobarelcorte' })

      renderHeader()

      const saludo = screen.getByText(/^Hola, Superlargo/)
      expect(saludo.style.textOverflow).toBe('')
      expect(saludo.style.whiteSpace).toBe('')
      expect(saludo.style.overflowWrap).toBe('anywhere')
    })

    it('"Cerrar sesión" borra los tokens y vuelve al inicio', () => {
      iniciarSesion({ nombre: 'Marina' })
      localStorage.setItem(REFRESH_KEY, 'refresh')

      renderHeader()
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

      expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
      expect(localStorage.getItem(REFRESH_KEY)).toBeNull()
      expect(screen.getByText('ruta: /')).toBeInTheDocument()
    })
  })

  it('con "hideAuthButtons" no muestra ni los botones ni el saludo', () => {
    iniciarSesion({ nombre: 'Marina' })

    renderHeader({ hideAuthButtons: true })

    expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ingresar' })).not.toBeInTheDocument()
  })

  it('el logo lleva al inicio', () => {
    renderHeader({}, '/auth')

    fireEvent.click(screen.getByRole('img', { name: 'MenYU' }))

    expect(screen.getByText('ruta: /')).toBeInTheDocument()
  })
})
