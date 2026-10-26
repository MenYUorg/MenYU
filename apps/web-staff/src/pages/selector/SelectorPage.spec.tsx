import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { PerfilUsuario } from '@menyu/types'
import {
  logoutSimulado,
  membresiaDeMarca,
  membresiaDeRestaurante,
  perfilDeCocina,
  perfilDeMozo,
  perfilDeOwner,
  perfilDePrueba,
  reiniciarSesionDePrueba,
  sesionDePrueba,
} from '../../test/authClient'
import { useContextoStore } from '../../store/contextoStore'
import { SelectorPage } from './SelectorPage'

vi.mock('@menyu/auth-client', async () => (await import('../../test/authClient')).moduloSimulado())
vi.mock('@menyu/ui', () => ({ LogoMenYuOscuro: () => <span>MenYU</span> }))

function Destino() {
  return <p>destino {useLocation().pathname}</p>
}

function abrir(perfil: PerfilUsuario, preferencia?: string) {
  sesionDePrueba.perfil = perfil
  useContextoStore.getState().cargarContexto(perfil, { restauranteId: preferencia ?? null })
  return render(
    <MemoryRouter initialEntries={['/selector']}>
      <Routes>
        <Route path="/selector" element={<SelectorPage />} />
        <Route path="*" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  )
}

const tarjeta = (titulo: string) => screen.getByText(titulo).closest('button') as HTMLElement

beforeEach(() => {
  reiniciarSesionDePrueba()
  localStorage.clear()
  useContextoStore.setState({ restaurantes: [], restauranteId: null, perfil: null })
})

describe('SelectorPage', () => {
  it('saluda con el nombre y las iniciales del perfil', () => {
    abrir(perfilDeOwner())

    expect(screen.getByText('Owner de Prueba')).toBeInTheDocument()
    expect(screen.getByText('OD')).toBeInTheDocument()
    expect(screen.getByText('¿A qué panel querés ingresar?')).toBeInTheDocument()
  })

  it('sin nombre usa el email', () => {
    abrir(perfilDePrueba({ nombre: '', email: 'juan.gomez@menyu.com', membresias: [membresiaDeRestaurante('MOZO', 'rest-1')] }))

    expect(screen.getByText('juan.gomez@menyu.com')).toBeInTheDocument()
    expect(screen.getByText('JG')).toBeInTheDocument()
  })

  it('el OWNER ve las dos vistas y entra a la que elige', () => {
    abrir(perfilDeOwner())

    const card = tarjeta('Panel Cocina')
    fireEvent.mouseEnter(card)
    fireEvent.mouseLeave(card)
    fireEvent.click(card)

    expect(screen.getByText('destino /cocina')).toBeInTheDocument()
  })

  it('el MOZO solo ve su panel, y la cocina no aparece', () => {
    abrir(perfilDeMozo())

    expect(screen.queryByText('Panel Cocina')).not.toBeInTheDocument()
    fireEvent.click(tarjeta('Panel Mozo'))

    expect(screen.getByText('destino /mozo')).toBeInTheDocument()
  })

  it('COCINA solo ve la cocina', () => {
    abrir(perfilDeCocina())

    expect(screen.queryByText('Panel Mozo')).not.toBeInTheDocument()
    expect(screen.getByText('Panel Cocina')).toBeInTheDocument()
  })

  it('con un solo restaurante no pregunta cuál', () => {
    abrir(perfilDeMozo())

    expect(screen.queryByLabelText('Restaurante')).not.toBeInTheDocument()
  })

  describe('con varios restaurantes', () => {
    const enVarios = () =>
      perfilDePrueba({
        membresias: [
          membresiaDeMarca('marca-1', [{ id: 'rest-1', nombre: 'Centro' }, { id: 'rest-2', nombre: 'Palermo' }], 'Marca Pruebas'),
        ],
      })

    it('pide elegir uno antes de mostrar las vistas', () => {
      abrir(enVarios())

      expect(screen.getByText('Elegí el restaurante donde vas a trabajar.')).toBeInTheDocument()
      expect(screen.queryByText('Panel Cocina')).not.toBeInTheDocument()
      expect(screen.getByRole('option', { name: 'Centro · Marca Pruebas' })).toBeInTheDocument()
    })

    it('al elegirlo aparecen las vistas de ese restaurante', () => {
      abrir(enVarios())

      fireEvent.change(screen.getByLabelText('Restaurante'), { target: { value: 'rest-2' } })

      expect(screen.getByText('Panel Cocina')).toBeInTheDocument()
      expect(screen.getByText('Panel Mozo')).toBeInTheDocument()
      expect(useContextoStore.getState().restauranteId).toBe('rest-2')
    })

    it('con la preferencia de web-auth ya viene elegido', () => {
      abrir(enVarios(), 'rest-2')

      expect((screen.getByLabelText('Restaurante') as HTMLSelectElement).value).toBe('rest-2')
      expect(screen.getByText('Panel Cocina')).toBeInTheDocument()
    })
  })

  it('"Salir" cierra la sesión', () => {
    abrir(perfilDeMozo())

    const salir = screen.getByRole('button', { name: /Salir/ })
    fireEvent.mouseEnter(salir)
    fireEvent.mouseLeave(salir)
    fireEvent.click(salir)

    expect(logoutSimulado).toHaveBeenCalledTimes(1)
  })
})
