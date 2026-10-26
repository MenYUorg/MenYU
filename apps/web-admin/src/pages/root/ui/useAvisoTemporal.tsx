import { useEffect, useState, type ReactNode } from 'react'

/** Aviso corto que se va solo (confirma que algo se hizo). */
export function useAvisoTemporal(milisegundos = 2400): [ReactNode, (texto: string) => void] {
  const [texto, setTexto] = useState('')
  useEffect(() => {
    if (!texto) return
    const t = setTimeout(() => setTexto(''), milisegundos)
    return () => clearTimeout(t)
  }, [texto, milisegundos])
  return [
    texto ? (
      <div className="toast" role="status">
        {texto}
      </div>
    ) : null,
    setTexto,
  ]
}
