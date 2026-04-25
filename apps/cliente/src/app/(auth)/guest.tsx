import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useUserStore } from '../../store/userStore'

export default function GuestScreen() {
  const router = useRouter()
  const { loginAsGuest, isLoading } = useUserStore()

  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')

  const handleGuest = async () => {
    setError('')
    try {
      await loginAsGuest(nombre.trim() || undefined)
      router.replace('/(session)')
    } catch {
      setError('No se pudo conectar. Intentá de nuevo.')
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={styles.title}>¿Cómo te llamamos?</Text>
          <Text style={styles.subtitle}>
            Podés dejar tu nombre o entrar directamente sin identificarte.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Tu nombre (opcional)"
            placeholderTextColor="#AAAAAA"
            value={nombre}
            onChangeText={setNombre}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={40}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btnPrimary, isLoading && styles.btnDisabled]}
            onPress={handleGuest}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.btnPrimaryText}>Entrar sin cuenta</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, paddingHorizontal: 28, paddingTop: 60, paddingBottom: 40 },
  back: { marginBottom: 40 },
  backText: { color: '#D4621A', fontSize: 16, fontWeight: '600' },
  content: { flex: 1, justifyContent: 'center', gap: 16 },
  title: { fontSize: 28, fontWeight: '800', color: '#1A1A1A' },
  subtitle: { fontSize: 15, color: '#666666', lineHeight: 22 },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#F9F9F9',
    marginTop: 8,
  },
  error: { color: '#C62828', fontSize: 14 },
  btnPrimary: {
    backgroundColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
})
