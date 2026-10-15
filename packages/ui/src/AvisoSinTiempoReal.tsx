interface AvisoSinTiempoRealProps {
  visible: boolean
  onCerrar: () => void
}

/** Aviso no bloqueante de que la app perdió las actualizaciones en tiempo real. */
export function AvisoSinTiempoReal({ visible, onCerrar }: AvisoSinTiempoRealProps) {
  if (!visible) return null
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 16,
        transform: 'translateX(-50%)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        maxWidth: 'calc(100vw - 32px)',
        background: '#fef3c7',
        border: '1px solid #fcd34d',
        borderRadius: 10,
        padding: '10px 14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        fontFamily: 'Inter, sans-serif',
        fontSize: 13,
        color: '#92400e',
      }}
    >
      <span>Sin actualizaciones en tiempo real. Recargá la página.</span>
      <button
        onClick={onCerrar}
        aria-label="Cerrar aviso"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 16, lineHeight: 1, padding: 0 }}
      >
        ✕
      </button>
    </div>
  )
}
