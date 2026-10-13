interface ToggleSwitchProps {
  value: boolean
  onChange: () => void
  title?: string
  disabled?: boolean
  /** Texto a la izquierda del interruptor. Con rótulo, todo el conjunto es el interruptor (más fácil de tocar). */
  rotulo?: string
  /** Ancho fijo del rótulo, para alinear varios interruptores en columna. */
  anchoRotulo?: number
  /** Alto mínimo del área que se puede tocar. */
  altoMinimo?: number
}

export function ToggleSwitch({
  value,
  onChange,
  title,
  disabled,
  rotulo,
  anchoRotulo,
  altoMinimo = 24,
}: ToggleSwitchProps) {
  const pista = (
    <div
      aria-hidden="true"
      style={{
        width:        44,
        height:       24,
        borderRadius: 999,
        background:   value ? '#E8563A' : '#d1d5db',
        transition:   'background 200ms',
        position:     'relative',
        flexShrink:   0,
      }}
    >
      <div
        style={{
          width:        20,
          height:       20,
          borderRadius: '50%',
          background:   'white',
          position:     'absolute',
          top:          2,
          left:         value ? 22 : 2,
          transition:   'left 200ms',
        }}
      />
    </div>
  )

  return (
    <div
      role="switch"
      aria-checked={value}
      aria-disabled={disabled}
      aria-label={rotulo ? undefined : title}
      tabIndex={disabled ? -1 : 0}
      title={disabled ? `${title ?? ''} (no disponible)`.trim() : title}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onChange()
      }}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
          e.preventDefault()
          onChange()
        }
      }}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        8,
        minHeight:  altoMinimo,
        cursor:     disabled ? 'not-allowed' : 'pointer',
        opacity:    disabled ? 0.4 : 1,
        transition: 'opacity 200ms',
        userSelect: 'none',
      }}
    >
      {rotulo && (
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize:   11,
            color:      '#9ca3af',
            width:      anchoRotulo,
            textAlign:  anchoRotulo ? 'right' : 'left',
          }}
        >
          {rotulo}
        </span>
      )}
      {pista}
    </div>
  )
}
