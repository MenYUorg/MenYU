import { useState } from 'react'
import placeholderSrc from './assets/item-placeholder.png'

interface MenuItemImageProps {
  src?: string | null
  alt: string
  width?: number | string
  height?: number | string
  borderRadius?: number | string
  className?: string
}

export function MenuItemImage({
  src,
  alt,
  width = '100%',
  height = '100%',
  borderRadius = 0,
  className = '',
}: MenuItemImageProps) {
  const [imageError, setImageError] = useState(false)

  if (!src || imageError) {
    return (
      <div
        className={className}
        style={{
          width,
          height,
          borderRadius,
          background: '#F7F7F8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <img
          src={placeholderSrc}
          alt={alt}
          style={{ width: '55%', height: '55%', objectFit: 'contain' }}
        />
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setImageError(true)}
      className={className}
      style={{ width, height, borderRadius, objectFit: 'cover', flexShrink: 0, display: 'block' }}
    />
  )
}
