import { useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { useUserStore } from '../../store/userStore'
import { useSessionStore } from '../../store/sessionStore'
import { useMenuStore } from '../../store/menuStore'
import { joinRestaurante } from '../../services/socket'

export default function SessionHome() {
  const { user, logout } = useUserStore()
  const { sesionId, restauranteId, clearSession, jwt } = useSessionStore()
  const { fetchMenu } = useMenuStore()
  const router = useRouter()

  useEffect(() => {
    if (restauranteId) {
      void fetchMenu(restauranteId)
      joinRestaurante(restauranteId)
    }
  }, [restauranteId])

  const handleCerrarSesion = async () => {
    if (jwt) {
      try {
        await fetch('https://menyuapi-production.up.railway.app/api/sessions/close', {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwt}` },
        })
      } catch {}
    }
    clearSession()
    logout()
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>MenYu</Text>

      {sesionId ? (
        <>
          <Text style={styles.welcome}>Mesa activa</Text>
          <Text style={styles.hint}>Sesión: {sesionId.slice(0, 8)}…</Text>

          <TouchableOpacity style={styles.btnPrimary} onPress={() => router.push('/(session)/menu')}>
            <Text style={styles.btnText}>Ver menú</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecondary} onPress={() => void handleCerrarSesion()}>
            <Text style={styles.btnSecondaryText}>Cerrar mesa</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.welcome}>
            Hola, {user?.nombre ?? user?.email ?? 'usuario'}
          </Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={() => router.push('/check-in')}>
            <Text style={styles.btnText}>Escanear mesa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={logout}>
            <Text style={styles.btnSecondaryText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 28 },
  logo: { fontSize: 36, fontWeight: '800', color: '#D4621A', marginBottom: 8 },
  welcome: { fontSize: 18, color: '#1A1A1A', fontWeight: '600' },
  hint: { fontSize: 13, color: '#888888' },
  btnPrimary: {
    marginTop: 16,
    backgroundColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  btnSecondaryText: { color: '#D4621A', fontSize: 16, fontWeight: '600' },
})
