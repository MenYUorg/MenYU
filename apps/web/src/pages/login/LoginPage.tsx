import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'

type Mode = 'login' | 'register' | 'guest'

export function LoginPage() {
  const { isLoggedIn, user, login, register, loginAsGuest, loading, error, clearError } = useAuthStore()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')

  if (isLoggedIn && user) {
    const destinos: Record<string, string> = {
      admin: '/admin',
      mozo: '/mozo',
      cliente: '/menu',
      cocina: '/cocina',
    }
    return <Navigate to={destinos[user.tipo] ?? '/login'} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    if (mode === 'login') await login(email, password)
    else if (mode === 'register') await register(nombre, email, password)
    else await loginAsGuest(nombre || undefined)
  }

  const switchMode = (m: Mode) => { clearError(); setMode(m) }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold text-indigo-600">MenYu</span>
          <p className="text-sm text-gray-500 mt-1">
            {mode === 'login' && 'Ingresá a tu cuenta'}
            {mode === 'register' && 'Crear cuenta de cliente'}
            {mode === 'guest' && 'Entrar sin cuenta'}
          </p>
        </div>

        <div className="flex rounded-lg border border-gray-200 mb-6 overflow-hidden">
          {(['login', 'register', 'guest'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${mode === m ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              {m === 'login' ? 'Ingresar' : m === 'register' ? 'Registrarse' : 'Invitado'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {(mode === 'register' || mode === 'guest') && (
            <Input
              label={mode === 'guest' ? 'Nombre (opcional)' : 'Nombre *'}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Tu nombre"
              required={mode === 'register'}
            />
          )}
          {mode !== 'guest' && (
            <>
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="email@ejemplo.com"
              />
              <Input
                label="Contraseña"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
              />
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="w-full justify-center mt-1">
            {mode === 'login' ? 'Ingresar' : mode === 'register' ? 'Crear cuenta' : 'Entrar como invitado'}
          </Button>
        </form>
      </div>
    </div>
  )
}
