// Íconos de trazo de las pantallas de Discovery (los mismos del mockup aprobado).
const TRAZOS = {
  pin: (
    <>
      <path d="M12 21s-7-5.2-7-11a7 7 0 0 1 14 0c0 5.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  derecha: <path d="M9 6l6 6-6 6" />,
  izquierda: <path d="M15 6l-6 6 6 6" />,
  escanear: <path d="M23 7V1h-6M1 7V1h6M23 17v6h-6M1 17v6h6" />,
  qr: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3" />
    </>
  ),
  carta: (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
    </>
  ),
  aviso: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 7v6M12 16.5h.01" />
    </>
  ),
  local: (
    <>
      <path d="M3 9l1.2-5h15.6L21 9" />
      <path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" />
      <path d="M5 12v8h14v-8" />
    </>
  ),
  lupa: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ),
  // Los del asistente de la carta (components/asistente).
  globo: (
    <>
      <path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 20.5l1.6-5.3A8.5 8.5 0 1 1 21 11.5z" />
      <path d="M8.5 11.5h.01M12.5 11.5h.01M16.5 11.5h.01" />
    </>
  ),
  enviar: (
    <>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </>
  ),
  cerrar: <path d="M18 6L6 18M6 6l12 12" />,
  reintentar: (
    <>
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M3 3v5h5" />
    </>
  ),
} as const

export type NombreIcono = keyof typeof TRAZOS

interface IconoProps {
  nombre: NombreIcono
  tam?: number
  trazo?: string
  grosor?: number
}

export function Icono({ nombre, tam = 16, trazo = 'currentColor', grosor = 2 }: IconoProps) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke={trazo}
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      {TRAZOS[nombre]}
    </svg>
  )
}
