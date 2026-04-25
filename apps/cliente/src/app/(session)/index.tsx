import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useUserStore } from '../../store/userStore'

export default function SessionHome() {
  const { user, logout } = useUserStore()

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>MenYu</Text>
      <Text style={styles.welcome}>
        Hola, {user?.nombre ?? user?.email ?? 'usuario'}
      </Text>
      <Text style={styles.tipo}>Tipo: {user?.tipo}</Text>

      <TouchableOpacity style={styles.btn} onPress={logout}>
        <Text style={styles.btnText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 28 },
  logo: { fontSize: 36, fontWeight: '800', color: '#D4621A' },
  welcome: { fontSize: 18, color: '#1A1A1A' },
  tipo: { fontSize: 14, color: '#666666' },
  btn: {
    marginTop: 24,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
