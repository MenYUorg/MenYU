import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppHeader } from '../../components/AppHeader'
import { api } from '../../services/api'
import { resolveAppUrl } from '../../utils/resolveAppUrl'
import { useSessionStore } from '../../store/sessionStore'

const C = {
  orange: '#E8563A',
  orangeHover: '#d34a30',
  navy: '#2D3561',
  textSub: '#6B7280',
  border: '#DDDDE0',
  borderFocus: '#E8563A',
  bg: '#F7F7F8',
  white: '#FFFFFF',
} as const

const TOKEN_KEY = 'menyu_access_token'
const REFRESH_KEY = 'menyu_refresh_token'

type JwtPayload = { tipo?: string; nombre?: string; sub?: string }

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const [, payload] = token.split('.')
    if (!payload) return null
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as JwtPayload
  } catch {
    return null
  }
}

function storeTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
}

// ── Login form ────────────────────────────────────────────────────────────────

function LoginForm() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const data = await api.auth.login(email, password)
      storeTokens(data.accessToken, data.refreshToken)
      const payload = decodeJwtPayload(data.accessToken)
      const tipo = payload?.tipo
      if (tipo === 'admin' || tipo === 'mozo') {
        const baseUrl = resolveAppUrl(tipo)
        const params = new URLSearchParams({
          token: data.accessToken,
          refresh: data.refreshToken,
        })
        window.location.href = `${baseUrl}?${params.toString()}`
      } else {
        const { sesionId } = useSessionStore.getState()
        navigate(sesionId ? '/menu' : '/')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciales incorrectas. Verificá e intentá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={labelStyle}>Email</label>
        <input
          type='email'
          autoComplete='email'
          placeholder='tu@email.com'
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null) }}
          required
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Contraseña</label>
        <input
          type='password'
          autoComplete='current-password'
          placeholder='Tu contraseña'
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
          required
          style={inputStyle}
        />
      </div>

      {error && <ErrorBanner message={error} />}

      <button type='submit' disabled={loading} style={submitBtnStyle(loading)}>
        {loading ? 'Ingresando...' : 'Ingresar'}
      </button>
    </form>
  )
}

// ── Register form ─────────────────────────────────────────────────────────────

function RegisterForm() {
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [telefono, setTelefono] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    setLoading(true)
    try {
      const data = await api.auth.register(nombre, email, password, telefono || undefined)
      storeTokens(data.accessToken, data.refreshToken)
      const { sesionId } = useSessionStore.getState()
      navigate(sesionId ? '/menu' : '/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la cuenta. El email puede estar en uso.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={labelStyle}>Nombre</label>
        <input
          type='text'
          autoComplete='name'
          placeholder='Tu nombre'
          value={nombre}
          onChange={(e) => { setNombre(e.target.value); setError(null) }}
          required
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Email</label>
        <input
          type='email'
          autoComplete='email'
          placeholder='tu@email.com'
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null) }}
          required
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Contraseña</label>
        <input
          type='password'
          autoComplete='new-password'
          placeholder='Mínimo 8 caracteres'
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
          required
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>Confirmá la contraseña</label>
        <input
          type='password'
          autoComplete='new-password'
          placeholder='Repetí tu contraseña'
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setError(null) }}
          required
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle}>
          Teléfono <span style={{ fontWeight: 400, color: C.textSub }}>(opcional)</span>
        </label>
        <input
          type='tel'
          autoComplete='tel'
          placeholder='+54 9 11 ...'
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          style={inputStyle}
        />
      </div>

      {error && <ErrorBanner message={error} />}

      <button type='submit' disabled={loading} style={submitBtnStyle(loading)}>
        {loading ? 'Creando cuenta...' : 'Registrarme'}
      </button>
    </form>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{
      background: '#FDE5DF',
      border: `1px solid ${C.orange}`,
      borderRadius: 10,
      padding: '10px 14px',
    }}>
      <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#c0392b', margin: 0 }}>
        {message}
      </p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'login' | 'register'

export function AuthPage() {
  const [searchParams] = useSearchParams()
  const initialTab: Tab = searchParams.get('tab') === 'register' ? 'register' : 'login'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <AppHeader hideAuthButtons />

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minHeight: '100vh',
        padding: '80px 24px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: 380, marginTop: 32 }}>
          <h1 style={{
            fontFamily: 'Montserrat, sans-serif',
            fontWeight: 800,
            fontSize: 26,
            color: C.navy,
            margin: '0 0 24px',
            letterSpacing: '-0.02em',
          }}>
            {activeTab === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </h1>

          {/* Tabs */}
          <div style={{
            display: 'flex',
            gap: 0,
            background: '#EDEDEF',
            borderRadius: 10,
            padding: 4,
            marginBottom: 28,
          }}>
            {(['login', 'register'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  border: 'none',
                  borderRadius: 8,
                  background: activeTab === tab ? C.white : 'transparent',
                  color: activeTab === tab ? C.navy : C.textSub,
                  fontFamily: 'Montserrat, sans-serif',
                  fontWeight: activeTab === tab ? 700 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'background .15s, color .15s',
                  boxShadow: activeTab === tab ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {tab === 'login' ? 'Ingresar' : 'Registrarme'}
              </button>
            ))}
          </div>

          {activeTab === 'login' ? <LoginForm /> : <RegisterForm />}
        </div>
      </div>
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'Inter, sans-serif',
  fontWeight: 600,
  fontSize: 13,
  color: '#374151',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: '#FFFFFF',
  border: '1.5px solid #DDDDE0',
  borderRadius: 10,
  fontFamily: 'Inter, sans-serif',
  fontSize: 15,
  color: '#1A1A2E',
  outline: 'none',
  boxSizing: 'border-box',
}

function submitBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    padding: '15px 0',
    background: disabled ? '#ccc' : C.orange,
    color: C.white,
    border: 'none',
    borderRadius: 14,
    fontFamily: 'Montserrat, sans-serif',
    fontWeight: 700,
    fontSize: 16,
    cursor: disabled ? 'not-allowed' : 'pointer',
    marginTop: 4,
  }
}
