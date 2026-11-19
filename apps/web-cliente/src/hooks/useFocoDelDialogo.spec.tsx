import { fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState } from 'react'
import { useFocoDelDialogo } from './useFocoDelDialogo'

/** Un botón que abre un diálogo siempre montado (`abierto` cambia). */
function DialogoSiempreMontado() {
  const [abierto, setAbierto] = useState(false)
  const dialogo = useRef<HTMLDivElement>(null)
  useFocoDelDialogo(abierto, dialogo)
  return (
    <>
      <button onClick={() => setAbierto(true)}>Abrir</button>
      <div ref={dialogo} role="dialog" aria-label="Diálogo" tabIndex={-1}>
        <button onClick={() => setAbierto(false)}>Cerrar</button>
      </div>
    </>
  )
}

/** Un diálogo que se monta recién al abrirse (como el de "Armar mensaje" o la tarjeta de gracias). */
function DialogoQueSeMonta() {
  const [abierto, setAbierto] = useState(false)
  const titulo = useRef<HTMLHeadingElement>(null)
  useFocoDelDialogo(abierto, titulo)
  return (
    <>
      <button onClick={() => setAbierto(true)}>Abrir</button>
      {abierto && (
        <div role="dialog" aria-labelledby="t">
          <h2 id="t" ref={titulo} tabIndex={-1}>Título del diálogo</h2>
          <button onClick={() => setAbierto(false)}>Cerrar</button>
        </div>
      )}
    </>
  )
}

describe('useFocoDelDialogo', () => {
  it('al abrir lleva el foco al diálogo y al cerrar lo devuelve al botón que lo abrió (siempre montado)', () => {
    render(<DialogoSiempreMontado />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    abrir.focus()

    fireEvent.click(abrir)
    expect(screen.getByRole('dialog', { name: 'Diálogo' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(abrir).toHaveFocus()
  })

  it('un diálogo que se monta al abrirse recibe el foco en el elemento indicado, y al cerrarse el foco vuelve al botón', async () => {
    render(<DialogoQueSeMonta />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    abrir.focus()

    fireEvent.click(abrir)
    expect(await screen.findByRole('heading', { name: 'Título del diálogo' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(await screen.findByRole('button', { name: 'Abrir' })).toHaveFocus()
  })

  it('cerrado no toca el foco', () => {
    render(<DialogoSiempreMontado />)
    const abrir = screen.getByRole('button', { name: 'Abrir' })
    abrir.focus()

    expect(abrir).toHaveFocus()
  })
})
