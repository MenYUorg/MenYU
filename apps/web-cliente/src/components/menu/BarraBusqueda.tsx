import { useEffect, useRef, useState } from 'react'
import { useCerrarConEscape } from '@menyu/ui'
import { anunciar } from '../../utils/anunciador'
import { textoDePlatos } from '../../utils/textoDePlatos'
import { CM } from './paleta'

export interface ClasificacionConCantidad {
  id: string
  nombre: string
  count: number
}

interface BarraBusquedaProps {
  buscar: string
  onBuscar: (texto: string) => void
  clasificaciones: ClasificacionConCantidad[]
  dietasActivas: Set<string>
  onDietasActivas: (dietas: Set<string>) => void
  /** Cuántos platos quedan con los filtros (la búsqueda y las dietas): se anuncia al aplicar o limpiar las dietas. */
  cantidadDePlatos: number
}

// Hay un solo filtro de dietas por pantalla: los ids son fijos.
const ID_PANEL_DE_DIETAS = 'filtros-de-dieta'
const ID_TITULO_DE_DIETAS = 'filtros-de-dieta-titulo'

/**
 * El buscador de platos en píldora y el botón "Dietas" con su desplegable de clasificaciones (se aplican con "Aplicar").
 * El desplegable es un panel que el botón abre (`aria-expanded`) con una casilla por dieta, y se cierra con Esc.
 */
export function BarraBusqueda({ buscar, onBuscar, clasificaciones, dietasActivas, onDietasActivas, cantidadDePlatos }: BarraBusquedaProps) {
  const [dietOpen, setDietOpen] = useState(false)
  const [pendingDiets, setPendingDiets] = useState<Set<string>>(new Set())
  const dietRef = useRef<HTMLDivElement>(null)
  const botonDeDietasRef = useRef<HTMLButtonElement>(null)

  // Al aplicar o limpiar las dietas la lista cambia sola: se anuncia cuántos platos quedan. Se compara con las dietas de la
  // vez anterior (y no con un "primera vez") para que StrictMode no anuncie al montar.
  const dietasAnteriores = useRef(dietasActivas)
  useEffect(() => {
    if (dietasAnteriores.current === dietasActivas) return
    dietasAnteriores.current = dietasActivas
    anunciar(textoDePlatos(cantidadDePlatos))
  }, [dietasActivas, cantidadDePlatos])

  // Esc cierra el desplegable y el foco vuelve al botón (el hook escucha siempre: solo se actúa si está abierto).
  useCerrarConEscape(() => {
    if (!dietOpen) return
    setDietOpen(false)
    botonDeDietasRef.current?.focus()
  })

  // Click outside diet dropdown
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (dietRef.current && !dietRef.current.contains(e.target as Node)) {
        setDietOpen(false)
      }
    }
    if (dietOpen) document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [dietOpen])

  const openDietDropdown = () => {
    setPendingDiets(new Set(dietasActivas))
    setDietOpen(true)
  }

  const togglePending = (id: string) => {
    setPendingDiets((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  // Al aplicar o limpiar, el panel se cierra con el botón que se tocó adentro: el foco vuelve al botón "Dietas".
  const applyDiets = () => {
    onDietasActivas(new Set(pendingDiets))
    setDietOpen(false)
    botonDeDietasRef.current?.focus()
  }

  const clearDiets = () => {
    setPendingDiets(new Set())
    onDietasActivas(new Set())
    setDietOpen(false)
    botonDeDietasRef.current?.focus()
  }

  const cantidadActiva = dietasActivas.size
  const nombreDelBotonDeDietas = cantidadActiva === 0
    ? 'Filtrar por dietas'
    : `Filtrar por dietas, ${cantidadActiva} ${cantidadActiva === 1 ? 'filtro activo' : 'filtros activos'}`

  return (
    <div style={{ background: 'white', padding: '10px 14px', borderBottom: `1px solid ${CM.border}`, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Search input */}
        <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 12, fontSize: 14, color: CM.textMuted, pointerEvents: 'none' }}>🔍</span>
          <input
            value={buscar}
            onChange={(e) => onBuscar(e.target.value)}
            placeholder="Buscar platos..."
            style={{
              width: '100%', height: 40, boxSizing: 'border-box',
              paddingLeft: 34, paddingRight: buscar ? 32 : 14, borderRadius: 999,
              border: `1px solid ${CM.border}`, background: CM.bg,
              fontFamily: 'Inter,sans-serif', fontSize: 13, color: CM.text,
              outline: 'none', transition: 'border-color .15s, background .15s',
            }}
            onFocus={(e) => { e.target.style.borderColor = CM.orange; e.target.style.background = 'white' }}
            onBlur={(e) => { e.target.style.borderColor = CM.border; e.target.style.background = CM.bg }}
          />
          {buscar && (
            <button
              onClick={() => onBuscar('')}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#9CA3AF', fontSize: 16, lineHeight: 1, padding: 0,
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* Diet filter button + dropdown */}
        <div style={{ position: 'relative', flexShrink: 0 }} ref={dietRef}>
          {/* El nombre ("Filtrar por dietas, 1 filtro activo") reemplaza al texto visible, que lleva un emoji, una flecha y el número:
              contiene "Dietas", lo que se ve en el botón (WCAG 2.5.3), y dice si el panel está abierto (aria-expanded). */}
          <button
            ref={botonDeDietasRef}
            type="button"
            onClick={openDietDropdown}
            aria-label={nombreDelBotonDeDietas}
            aria-expanded={dietOpen}
            aria-controls={dietOpen ? ID_PANEL_DE_DIETAS : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              height: 40, padding: '0 12px', borderRadius: 999,
              border: `1px solid ${dietasActivas.size > 0 ? CM.orange : CM.border}`,
              background: dietasActivas.size > 0 ? CM.orange : 'white',
              color: dietasActivas.size > 0 ? 'white' : CM.navy,
              fontFamily: 'Montserrat,sans-serif', fontWeight: 600, fontSize: 12,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 14 }}>🥗</span>
            Dietas
            {dietasActivas.size > 0 ? (
              <span aria-hidden="true" style={{ background: 'white', color: CM.orange, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999 }}>
                {dietasActivas.size}
              </span>
            ) : (
              <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.55 }}>▾</span>
            )}
          </button>

          {/* Dropdown */}
          {dietOpen && (
            <div
              id={ID_PANEL_DE_DIETAS}
              role="group"
              aria-labelledby={ID_TITULO_DE_DIETAS}
              style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                width: 264, background: 'white', borderRadius: 12,
                boxShadow: '0 12px 32px rgba(45,53,97,0.18)',
                border: `1px solid ${CM.border}`, padding: 14, zIndex: 25,
              }}
            >
              <p id={ID_TITULO_DE_DIETAS} style={{ fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 11, color: CM.navy, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Filtros de dieta
              </p>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: CM.textMuted, margin: '0 0 10px' }}>
                Mostramos solo platos compatibles
              </p>

              {clasificaciones.length === 0 ? (
                <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: CM.textMuted, textAlign: 'center', padding: '8px 0' }}>
                  Sin clasificaciones disponibles
                </p>
              ) : (
                clasificaciones.map((c) => {
                  const checked = pendingDiets.has(c.id)
                  // Una casilla de verdad dentro de un <label> que ocupa toda la fila (se toca en cualquier lado): el lector dice
                  // "Vegano, 2 platos, casilla, marcada". Su nombre empieza con el texto que se ve (WCAG 2.5.3) y suma la
                  // cantidad, que a la vista es un número suelto. La casilla del navegador queda oculta (`sr-only`) y la que se
                  // ve es el recuadro de al lado, que muestra el foco con teclado (`peer-focus-visible`) y la tilde.
                  return (
                    <label
                      key={c.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8, cursor: 'pointer', transition: 'background .1s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLLabelElement).style.background = CM.bg }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLLabelElement).style.background = 'transparent' }}
                    >
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        aria-label={`${c.nombre}, ${c.count} ${c.count === 1 ? 'plato' : 'platos'}`}
                        checked={checked}
                        onChange={() => togglePending(c.id)}
                      />
                      <span
                        aria-hidden="true"
                        className="peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#2D3561]"
                        style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                          border: `1.5px solid ${checked ? CM.orange : '#D1D5DB'}`,
                          background: checked ? CM.orange : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', fontSize: 11, fontWeight: 700, transition: 'all .12s',
                        }}
                      >
                        {checked ? '✓' : ''}
                      </span>
                      <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: CM.text, flex: 1 }}>
                        {c.nombre}
                      </span>
                      <span aria-hidden="true" style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: CM.textMuted, fontWeight: 600 }}>{c.count}</span>
                    </label>
                  )
                })
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${CM.border}` }}>
                <button
                  onClick={clearDiets}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${CM.border}`, background: 'transparent', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, color: CM.textSub, cursor: 'pointer' }}
                >
                  Limpiar
                </button>
                <button
                  onClick={applyDiets}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: CM.orange, color: 'white', fontFamily: 'Montserrat,sans-serif', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                >
                  Aplicar{pendingDiets.size > 0 ? ` (${pendingDiets.size})` : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
