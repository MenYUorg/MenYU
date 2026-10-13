import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RoleGuard } from './RoleGuard'

let usuario: { rol?: string } | null = null

vi.mock('@menyu/auth', () => ({
  useAuth: () => ({ user: usuario }),
}))

function renderGuard(roles: string[]) {
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
  it('deja pasar a un rol permitido', () => {
    usuario = { rol: 'OWNER' }

    renderGuard(['OWNER'])

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })

  it.each(['ROOT', 'GERENTE'])('manda a /admin al rol %s si no está permitido', (rol) => {
    usuario = { rol }

    renderGuard(['OWNER'])

    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
    expect(screen.getByText('Inicio del panel')).toBeInTheDocument()
  })

  it('manda a /admin si no hay usuario', () => {
    usuario = null

    renderGuard(['OWNER'])

    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
    expect(screen.getByText('Inicio del panel')).toBeInTheDocument()
  })

  it('manda a /admin si el usuario no tiene rol', () => {
    usuario = {}

    renderGuard(['OWNER'])

    expect(screen.getByText('Inicio del panel')).toBeInTheDocument()
  })

  it('con varios roles permitidos deja pasar a cualquiera de ellos', () => {
    usuario = { rol: 'GERENTE' }

    renderGuard(['OWNER', 'GERENTE'])

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })
})
