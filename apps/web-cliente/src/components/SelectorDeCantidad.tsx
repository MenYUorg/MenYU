import type { CSSProperties } from 'react'
import { C } from '../theme'
import { anunciar } from '../utils/anunciador'

interface SelectorDeCantidadProps {
  /** Lo que se está contando ("Cheddar", "Hamburguesa doble"): va en el nombre de los botones y en lo que se anuncia. */
  nombre: string
  valor: number
  /** Recibe la cantidad nueva. Lo llama solo si el botón está activo (no pasa del mínimo ni del máximo). */
  onCambiar: (nuevo: number) => void
  minimo?: number
  maximo?: number
  /** El alto de cada botón en px (el ancho es siempre 32). */
  altoDelBoton?: number
  tamanoDelSimbolo?: number
  /** Cambia o agrega estilo del número del medio (el ancho, el tamaño y el peso de la letra). */
  estiloDelNumero?: CSSProperties
  /** Estilo extra de los dos botones (por ejemplo, el borde redondeado). */
  estiloDelBoton?: CSSProperties
}

/**
 * Los botones "−" y "+" con la cantidad en el medio. Se usa para los extras de un plato, para la cantidad del plato y
 * (etapa 5) en el carrito. Cada botón dice qué cuenta ("Sumar Cheddar", "Restar Hamburguesa doble") y al cambiar
 * anuncia el valor nuevo ("Cheddar: 1"). Es un fragmento: el contenedor lo pone quien lo usa, porque cambia de un lugar a otro.
 *
 * En el mínimo o el máximo el botón no se deshabilita (`disabled` le sacaría el foco a quien lo acaba de tocar): se marca
 * `aria-disabled`, se ve atenuado y no hace nada.
 */
export function SelectorDeCantidad({
  nombre,
  valor,
  onCambiar,
  minimo = 0,
  maximo = Number.POSITIVE_INFINITY,
  altoDelBoton = 32,
  tamanoDelSimbolo = 16,
  estiloDelNumero,
  estiloDelBoton,
}: SelectorDeCantidadProps) {
  const enElMinimo = valor <= minimo
  const enElMaximo = valor >= maximo

  const cambiarA = (nuevo: number) => {
    onCambiar(nuevo)
    anunciar(`${nombre}: ${nuevo}`)
  }

  const estiloBoton = (inactivo: boolean): CSSProperties => ({
    width: 32,
    height: altoDelBoton,
    background: 'transparent',
    color: C.navy,
    fontSize: tamanoDelSimbolo,
    fontWeight: 700,
    border: 'none',
    cursor: inactivo ? 'not-allowed' : 'pointer',
    opacity: inactivo ? 0.3 : 1,
    ...estiloDelBoton,
  })

  return (
    <>
      <button
        type="button"
        aria-label={`Restar ${nombre}`}
        aria-disabled={enElMinimo}
        onClick={() => { if (!enElMinimo) cambiarA(valor - 1) }}
        style={estiloBoton(enElMinimo)}
      >
        <span aria-hidden="true">−</span>
      </button>
      <span
        style={{
          width: 28,
          textAlign: 'center',
          fontFamily: 'Montserrat,sans-serif',
          fontWeight: 700,
          fontSize: 13,
          color: C.navy,
          ...estiloDelNumero,
        }}
      >
        {valor}
      </span>
      <button
        type="button"
        aria-label={`Sumar ${nombre}`}
        aria-disabled={enElMaximo}
        onClick={() => { if (!enElMaximo) cambiarA(valor + 1) }}
        style={estiloBoton(enElMaximo)}
      >
        <span aria-hidden="true">+</span>
      </button>
    </>
  )
}
