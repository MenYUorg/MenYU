import { ChevronLeft, RefreshCw } from 'lucide-react'

interface PageHeaderProps {
  title: string
  breadcrumb?: string
  onBack?: () => void
  icon: React.ReactNode
  lastUpdated?: string
  onRefresh?: () => void
  userName?: string
  userRole?: string
  userInitials?: string
  extraActions?: React.ReactNode
}

export function PageHeader({
  title,
  breadcrumb = 'PANEL › MOZO',
  onBack,
  icon,
  lastUpdated,
  onRefresh,
  userName,
  userRole,
  userInitials,
  extraActions,
}: PageHeaderProps) {
  return (
    <header
      style={{
        background: '#2D3561',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 12,
        flexShrink: 0,
      }}
    >
      {/* Marca */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: '#E8563A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 800,
              fontSize: 17,
              color: '#ffffff',
              lineHeight: 1,
            }}
          >
            M
          </span>
        </div>
        <span
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize: 18,
            color: '#ffffff',
          }}
        >
          Men<span style={{ color: '#F2A28F' }}>Yu</span>
        </span>
      </div>

      {/* Separador */}
      <div
        style={{
          width: 1,
          height: 28,
          background: 'rgba(255,255,255,0.15)',
          margin: '0 4px',
          flexShrink: 0,
        }}
      />

      {/* Botón back */}
      {onBack && (
        <button
          onClick={onBack}
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.08)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.7)',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {/* Ícono de página */}
      <div
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(255,255,255,0.10)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#ffffff',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>

      {/* Bloque título */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: 10,
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            lineHeight: 1,
          }}
        >
          {breadcrumb}
        </span>
        <span
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize: 16,
            color: '#ffffff',
            lineHeight: 1.2,
          }}
        >
          {title}
        </span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Indicador último update */}
      {lastUpdated && (
        <div
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              lineHeight: 1,
            }}
          >
            ACTUALIZADO
          </span>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              marginTop: 2,
            }}
          >
            <div
              style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#22c55e',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontSize: 12,
                color: '#ffffff',
              }}
            >
              {lastUpdated}
            </span>
          </div>
        </div>
      )}

      {/* Acciones extra (ej: botón impresora) */}
      {extraActions}

      {/* Botón Actualizar */}
      {onRefresh && (
        <button
          onClick={onRefresh}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(255,255,255,0.12)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 10,
            padding: '8px 16px',
            cursor: 'pointer',
            color: '#ffffff',
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 700,
            fontSize: 13,
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.20)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
        >
          <RefreshCw size={14} />
          Actualizar
        </button>
      )}

      {/* Bloque usuario */}
      {userName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                fontSize: 13,
                color: '#ffffff',
                lineHeight: 1.2,
              }}
            >
              {userName}
            </div>
            {userRole && (
              <div
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 10,
                  color: 'rgba(255,255,255,0.6)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                }}
              >
                {userRole}
              </div>
            )}
          </div>
          <div
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: '#E8563A',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#ffffff',
              fontFamily: 'Montserrat, sans-serif',
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            {userInitials ?? '?'}
          </div>
        </div>
      )}
    </header>
  )
}
