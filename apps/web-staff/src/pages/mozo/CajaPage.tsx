import { useNavigate } from 'react-router-dom'
import { usePerfil } from '@menyu/auth-client'
import { Wallet } from 'lucide-react'
import { useNombreDelRol } from '../../store/contextoStore'
import { PageHeader } from '../../components/PageHeader'

function getInitials(name?: string): string {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

/** La caja del restaurante (#359): abrir el turno, verlo y reasignar sus mesas. OWNER, GERENTE y JEFE_SALON. */
export function CajaPage() {
  const navigate = useNavigate()
  const perfil = usePerfil()
  const rolMostrado = useNombreDelRol()
  const nombreUsuario = perfil.nombre || perfil.email

  return (
    <div style={{ minHeight: '100vh', background: '#F6F7F9', display: 'flex', flexDirection: 'column' }}>
      <PageHeader
        title="Caja"
        breadcrumb="PANEL › CAJA"
        icon={<Wallet size={18} />}
        onBack={() => navigate('/mozo')}
        userName={nombreUsuario}
        userRole={rolMostrado}
        userInitials={getInitials(nombreUsuario)}
      />
    </div>
  )
}
