import { Link, type LinkProps } from 'react-router-dom'

/** Link interno: azul con el subrayado coral del logo. */
export function Enlace({ className = '', ...resto }: LinkProps) {
  return (
    <Link
      className={`font-medium underline decoration-menyu-coral decoration-2 underline-offset-4 hover:decoration-menyu-navy focus:outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-menyu-coral ${className}`}
      {...resto}
    />
  )
}
