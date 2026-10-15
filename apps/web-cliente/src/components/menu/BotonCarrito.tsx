import { useNavigate } from 'react-router-dom'
import { useCarritoStore } from '../../store/carritoStore'
import { CM } from './paleta'

/** El botón redondo del carrito, abajo a la derecha; solo aparece si hay platos en el carrito. */
export function BotonCarrito() {
  const navigate = useNavigate()
  const cantidad = useCarritoStore((s) => s.items.length)
  if (cantidad === 0) return null

  return (
    <button
      onClick={() => navigate('/carrito')}
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 30,
        width: 54, height: 54, borderRadius: '50%',
        background: CM.orange, color: 'white', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(232,86,58,0.42)',
      }}
    >
      🛒
      <span style={{
        position: 'absolute', top: -3, right: -3,
        background: CM.navy, color: 'white',
        width: 22, height: 22, borderRadius: '50%',
        fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '2px solid white',
      }}>
        {cantidad}
      </span>
    </button>
  )
}
