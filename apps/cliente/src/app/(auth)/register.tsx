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
  ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import axios from 'axios'
import { useUserStore } from '../../store/userStore'

export default function RegisterScreen() {
  const router = useRouter()
  const { register, isLoading } = useUserStore()

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleRegister = async () => {
    setError('')
    if (!nombre.trim() || !email.trim() || !password.trim()) {
      setError('Completá todos los campos')
      return
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    try {
      await register(nombre.trim(), email.trim(), password)
      router.replace('/(session)')
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        setError('Ese email ya está registrado')
      } else {
        setError('No se pudo crear la cuenta. Intentá de nuevo.')
      }
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Crear cuenta</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Tu nombre"
            placeholderTextColor="#AAAAAA"
            value={nombre}
            onChangeText={setNombre}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#AAAAAA"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Contraseña (mínimo 6 caracteres)"
            placeholderTextColor="#AAAAAA"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btnPrimary, isLoading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={styles.btnPrimaryText}>Crear cuenta</Text>
            }
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => router.back()}
          disabled={isLoading}
        >
          <Text style={styles.loginLinkText}>
            ¿Ya tenés cuenta? <Text style={styles.loginLinkBold}>Ingresá</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FFFFFF' },
  container: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
  },
  back: { marginBottom: 32 },
  backText: { color: '#D4621A', fontSize: 16, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', marginBottom: 28 },
  form: { gap: 12 },
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
  error: { color: '#C62828', fontSize: 14 },
  btnPrimary: {
    backgroundColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  loginLink: { alignItems: 'center', marginTop: 32 },
  loginLinkText: { color: '#666666', fontSize: 15 },
  loginLinkBold: { color: '#D4621A', fontWeight: '700' },
})
