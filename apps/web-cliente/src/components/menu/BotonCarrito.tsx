import { useNavigate } from 'react-router-dom'
import { useCarritoStore } from '../../store/carritoStore'
import { CM } from './paleta'

/**
 * El botón redondo del carrito, abajo a la derecha; solo aparece si hay platos en el carrito. El número cuenta unidades
 * (3 hamburguesas son 3, no 1 línea), y el nombre lo dice: "Ver carrito, 3 ítems".
 */
export function BotonCarrito() {
  const navigate = useNavigate()
  const unidades = useCarritoStore((s) => s.items.reduce((suma, item) => suma + item.cantidad, 0))
  if (unidades === 0) return null

  return (
    <button
      type="button"
      onClick={() => navigate('/carrito')}
      aria-label={`Ver carrito, ${unidades} ${unidades === 1 ? 'ítem' : 'ítems'}`}
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 30,
        width: 54, height: 54, borderRadius: '50%',
        background: CM.orange, color: 'white', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(232,86,58,0.42)',
      }}
    >
      <span aria-hidden="true">🛒</span>
      <span aria-hidden="true" style={{
        position: 'absolute', top: -3, right: -3,
        background: CM.navy, color: 'white',
        minWidth: 22, height: 22, boxSizing: 'border-box', padding: '0 5px', borderRadius: 999,
        fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid white',
      }}>
        {unidades}
      </span>
    </button>
  )
}
