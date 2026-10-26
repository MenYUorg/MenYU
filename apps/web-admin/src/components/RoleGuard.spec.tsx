import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import {
  membresiaDeMarca,
  membresiaDeRestaurante,
  perfilDePrueba,
  reiniciarSesionDePrueba,
  sesionDePrueba,
} from '../test/authClient'
import { useContextStore, type RolDeAdmin } from '../store/contextStore'
import { RoleGuard } from './RoleGuard'

vi.mock('@menyu/auth-client', async () => (await import('../test/authClient')).moduloSimulado())

const MARCA = { id: 'marca-1', nombre: 'Marca X', slug: 'marca-x', logoUrl: null, activo: true, createdAt: '2024-01-01' }
const RESTAURANTE = {
  id: 'rest-1',
  nombre: 'Resto A',
  marcaId: 'marca-1',
  direccion: null,
  logoUrl: null,
  modoSesion: 'abierto',
  activo: true,
  createdAt: '2024-01-01',
  nombreSeccionRecomendados: 'Recomendaciones del chef',
  marca: MARCA,
}

beforeEach(() => {
  reiniciarSesionDePrueba()
  useContextStore.setState({ restaurantes: [RESTAURANTE], selectedRestauranteId: 'rest-1' })
})

function renderGuard(roles: RolDeAdmin[]) {
  return render(
    <MemoryRouter
      initialEntries={['/admin/marca']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/admin" element={<div>Inicio del panel</div>} />
        <Route
          path="/admin/marca"
          element={
            <RoleGuard roles={roles}>
              <div>Contenido protegido</div>
            </RoleGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RoleGuard', () => {
  it('deja pasar al dueño de la marca del restaurante elegido', () => {
    sesionDePrueba.perfil = perfilDePrueba({ membresias: [membresiaDeMarca('marca-1')] })

    renderGuard(['OWNER'])

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })

  it('manda a /admin al GERENTE del restaurante si la pantalla es solo del dueño', () => {
    sesionDePrueba.perfil = perfilDePrueba({ membresias: [membresiaDeRestaurante('GERENTE', 'rest-1')] })

    renderGuard(['OWNER'])

    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
    expect(screen.getByText('Inicio del panel')).toBeInTheDocument()
  })

  it('manda a /admin a una cuenta ROOT: no tiene rol en ningún restaurante', () => {
    sesionDePrueba.perfil = perfilDePrueba({ esRoot: true })

    renderGuard(['OWNER', 'GERENTE'])

    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
    expect(screen.getByText('Inicio del panel')).toBeInTheDocument()
  })

  it('con varios roles permitidos deja pasar a cualquiera de ellos', () => {
    sesionDePrueba.perfil = perfilDePrueba({ membresias: [membresiaDeRestaurante('GERENTE', 'rest-1')] })

    renderGuard(['OWNER', 'GERENTE'])

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })

  it('el rol se mide en el restaurante elegido: dueño de una marca, gerente en otra', () => {
    const otraMarca = { ...MARCA, id: 'marca-2', nombre: 'Marca Y' }
    const restauranteB = { ...RESTAURANTE, id: 'rest-2', nombre: 'Resto B', marcaId: 'marca-2', marca: otraMarca }
    useContextStore.setState({ restaurantes: [RESTAURANTE, restauranteB], selectedRestauranteId: 'rest-2' })
    sesionDePrueba.perfil = perfilDePrueba({
      membresias: [membresiaDeMarca('marca-1'), membresiaDeRestaurante('GERENTE', 'rest-2', 'marca-2')],
    })

    renderGuard(['OWNER'])

    expect(screen.getByText('Inicio del panel')).toBeInTheDocument()
  })
})
