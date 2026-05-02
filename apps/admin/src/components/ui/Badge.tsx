import type { ReactNode } from 'react'

type Variant = 'success' | 'error' | 'warning' | 'info' | 'neutral'

interface BadgeProps {
  variant?: Variant
  children: ReactNode
}

const variantCls: Record<Variant, string> = {
  success: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
  neutral: 'bg-gray-100 text-gray-600',
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${variantCls[variant]}`}
    >
      {children}
    </span>
  )
}
