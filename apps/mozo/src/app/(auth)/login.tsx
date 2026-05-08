import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useMozoStore } from '../../store/mozoStore'

const API_URL = 'https://menyuapi-production.up.railway.app/api'
const TOKEN_KEY = 'menyu_mozo_token'

function decodeJwt(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1] ?? ''))
  } catch {
    return {}
  }
}

export default function LoginScreen() {
  const router = useRouter()
  const { setRestauranteId } = useMozoStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Completá email y contraseña')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
        const msg = typeof data['message'] === 'string' ? data['message'] : 'Credenciales inválidas'
        setError(msg)
        return
      }
      const { accessToken } = (await res.json()) as { accessToken: string; refreshToken: string }
      localStorage.setItem(TOKEN_KEY, accessToken)

      const payload = decodeJwt(accessToken)
      if (payload['tipo'] !== 'mozo') {
        setError('Esta app es solo para mozos')
        return
      }
      const restauranteId = payload['restauranteId'] as string | undefined
      if (restauranteId) setRestauranteId(restauranteId)

      router.replace('/(panel)')
    } catch {
      setError('No se pudo conectar al servidor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>MenYu</Text>
      <Text style={styles.subtitle}>Panel del mozo</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#AAAAAA"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#AAAAAA"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.btn, (loading || !email || !password) && styles.btnDisabled]}
          onPress={() => void handleLogin()}
          disabled={loading || !email.trim() || !password.trim()}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnText}>Iniciar sesión</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 8 },
  logo: { fontSize: 40, fontWeight: '800', color: '#D4621A' },
  subtitle: { fontSize: 15, color: '#888888', marginBottom: 24 },
  form: { width: '100%', maxWidth: 320, gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#F9F9F9',
  },
  error: { color: '#C62828', fontSize: 14, textAlign: 'center' },
  btn: {
    backgroundColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
})
