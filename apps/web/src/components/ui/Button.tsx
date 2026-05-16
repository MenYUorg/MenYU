import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: ReactNode
}

const variantCls: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 border-transparent',
  secondary: 'bg-white text-gray-700 hover:bg-gray-50 border-gray-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 border-transparent',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 border-transparent',
}

const sizeCls: Record<Size, string> = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
}

export function Button({ variant = 'primary', size = 'md', loading = false, disabled, children, className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled ?? loading}
      className={`inline-flex items-center gap-1.5 font-medium rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${variantCls[variant]} ${sizeCls[size]} ${className}`}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
