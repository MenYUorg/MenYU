import { useEffect, useState } from 'react'

/** El logo liviano de MenYU (la U con el tenedor, de `public/`): lo que se muestra si el restaurante y su marca no tienen logo. */
export const LOGO_MENYU = '/logo-u.png'

/**
 * El logo del restaurante entero dentro de su cuadro (`object-fit: contain`: no se recorta ni se deforma). `logoUrl` ya
 * viene resuelto por el backend (el propio del restaurante o el de su marca); sin él, o si la imagen no carga, se muestra
 * el de MenYU. Es decorativa: el botón o el nombre que la acompañan ya dicen de qué es.
 */
export function ImagenLogo({ logoUrl }: { logoUrl: string | null }) {
  const [fallo, setFallo] = useState(false)
  // Con otro logo (se pasó a otro restaurante) se vuelve a intentar.
  useEffect(() => setFallo(false), [logoUrl])

  const mostrarMenyu = !logoUrl || fallo
  return (
    <img
      src={mostrarMenyu ? LOGO_MENYU : logoUrl}
      alt=""
      onError={mostrarMenyu ? undefined : () => setFallo(true)}
      draggable={false}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
    />
  )
}
