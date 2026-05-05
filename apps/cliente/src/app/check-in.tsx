import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import axios from 'axios'
import { api } from '../services/api'
import { useSessionStore, OpenSessionResult } from '../store/sessionStore'

type UiMode = 'idle' | 'loading' | 'scanning' | 'awaiting-code'

export default function CheckInScreen() {
  const params = useLocalSearchParams()
  const tableCode = params.tableCode as string | undefined
  const paramRestaurantId = params.restaurantId as string | undefined

  const router = useRouter()
  const setSession = useSessionStore((s) => s.setSession)

  const [uiMode, setUiMode] = useState<UiMode>(() => (tableCode ? 'loading' : 'idle'))
  const [pin, setPin] = useState('')
  const [restaurantId, setRestaurantId] = useState(paramRestaurantId ?? '')
  const [codigoSesion, setCodigoSesion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  // Payload pending secure-mode retry
  const pendingPayload = useRef<Record<string, string> | null>(null)
  // html5-qrcode scanner instance (web only)
  const scannerRef = useRef<any>(null)
  // Stable ref so the scanner callback never holds a stale closure
  const handleSubmitRef = useRef<(payload: Record<string, string>, code?: string) => void>(() => {})

  // ── Detect mobile web ─────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    }
  }, [])

  // ── Stop scanner on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => { void stopScanner() }
  }, [])

  // ── Mode 1: auto-submit when tableCode is in URL ───────────────────────
  useEffect(() => {
    if (tableCode) {
      handleSubmitRef.current({ tableCode })
    }
  }, [])

  // ── Core submit ───────────────────────────────────────────────────────
  const handleSubmit = async (payload: Record<string, string>, code?: string) => {
    await stopScanner()
    setUiMode('loading')
    setError(null)

    try {
      const body = code ? { ...payload, codigoSesion: code } : payload
      const { data } = await api.post<OpenSessionResult>('/sessions/open', body)
      setSession(data)
      router.replace('/(session)')
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const status = e.response?.status
        const msg: string = e.response?.data?.message ?? ''

        if (status === 403 && msg.includes('código de sesión para unirse')) {
          pendingPayload.current = payload
          setUiMode('awaiting-code')
        } else if (status === 403) {
          setError('Código de sesión incorrecto')
          setUiMode('awaiting-code')
        } else if (status === 404) {
          setError('Mesa no encontrada. Verificá el QR o el PIN.')
          setUiMode('idle')
        } else {
          setError('No se pudo conectar. Intentá de nuevo.')
          setUiMode('idle')
        }
      } else {
        setError('No se pudo conectar. Intentá de nuevo.')
        setUiMode('idle')
      }
    }
  }

  // Keep ref in sync so scanner callback always calls the latest version
  handleSubmitRef.current = handleSubmit

  // ── Helpers ───────────────────────────────────────────────────────────
  const stopScanner = async () => {
    if (scannerRef.current) {
      const s = scannerRef.current
      scannerRef.current = null
      try { await s.stop() } catch {}
      try { s.clear() } catch {}
    }
  }

  const parseQrText = (text: string): Record<string, string> => {
    try {
      const url = new URL(text)
      const extracted = url.searchParams.get('tableCode')
      if (extracted) return { tableCode: extracted }
    } catch {}
    // Fallback: treat the raw text as the tableCode
    return { tableCode: text }
  }

  // ── Mode 2: QR scanner (web mobile only) ─────────────────────────────
  const startScanner = async () => {
    if (Platform.OS !== 'web') return
    setUiMode('scanning')
    setError(null)

    // Brief yield so the qr-reader div is in the DOM before initializing
    await new Promise<void>((r) => setTimeout(r, 50))

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { Html5Qrcode } = await import('html5-qrcode' as any)
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text: string) => { handleSubmitRef.current(parseQrText(text)) },
        () => {},
      )
    } catch {
      setError('No se pudo acceder a la cámara. Usá el PIN en cambio.')
      setUiMode('idle')
    }
  }

  // ── Mode 3: PIN form submit ───────────────────────────────────────────
  const handlePinSubmit = () => {
    setError(null)
    if (pin.length !== 4) {
      setError('El PIN tiene exactamente 4 dígitos')
      return
    }
    if (!restaurantId.trim()) {
      setError('Ingresá el ID del restaurante')
      return
    }
    void handleSubmit({ restaurantId: restaurantId.trim(), pin })
  }

  // ── Secure mode: session code submit ─────────────────────────────────
  const handleCodeSubmit = () => {
    setError(null)
    if (codigoSesion.length !== 3) {
      setError('El código de sesión tiene 3 dígitos')
      return
    }
    if (pendingPayload.current) {
      void handleSubmit(pendingPayload.current, codigoSesion)
    }
  }

  const cancelCode = () => {
    setCodigoSesion('')
    pendingPayload.current = null
    setError(null)
    setUiMode('idle')
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>MenYu</Text>
          <Text style={styles.subtitle}>Ingresá a tu mesa</Text>
        </View>

        {/* QR reader div — always in DOM on web; display:none when inactive
            html5-qrcode requires the element to exist before start() is called */}
        {Platform.OS === 'web' && (
          <View
            nativeID="qr-reader"
            style={uiMode === 'scanning' ? styles.qrContainer : styles.hidden}
          />
        )}

        {/* ── Loading ── */}
        {uiMode === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#D4621A" />
            <Text style={styles.hint}>Conectando...</Text>
          </View>
        )}

        {/* ── Scanning controls ── */}
        {uiMode === 'scanning' && (
          <View style={styles.form}>
            <Text style={[styles.hint, { textAlign: 'center' }]}>
              Apuntá la cámara al código QR de la mesa
            </Text>
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={async () => { await stopScanner(); setUiMode('idle') }}
            >
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Secure mode: enter session code ── */}
        {uiMode === 'awaiting-code' && (
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Código de sesión</Text>
            <Text style={styles.hint}>
              El anfitrión de la mesa tiene el código de 3 dígitos.
            </Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              placeholder="000"
              placeholderTextColor="#AAAAAA"
              value={codigoSesion}
              onChangeText={(t) => setCodigoSesion(t.replace(/\D/g, '').slice(0, 3))}
              keyboardType="numeric"
              maxLength={3}
              textAlign="center"
              autoFocus
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <TouchableOpacity
              style={[styles.btnPrimary, codigoSesion.length !== 3 && styles.btnDisabled]}
              onPress={handleCodeSubmit}
              disabled={codigoSesion.length !== 3}
            >
              <Text style={styles.btnPrimaryText}>Confirmar código</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSecondary} onPress={cancelCode}>
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Idle: scan + PIN form ── */}
        {uiMode === 'idle' && (
          <View style={styles.form}>
            {isMobile && (
              <>
                <TouchableOpacity style={styles.btnPrimary} onPress={startScanner}>
                  <Text style={styles.btnPrimaryText}>Escanear QR</Text>
                </TouchableOpacity>
                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>o ingresá el PIN</Text>
                  <View style={styles.dividerLine} />
                </View>
              </>
            )}

            {!paramRestaurantId && (
              <TextInput
                style={styles.input}
                placeholder="ID del restaurante"
                placeholderTextColor="#AAAAAA"
                value={restaurantId}
                onChangeText={setRestaurantId}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}

            <TextInput
              style={[styles.input, styles.pinInput]}
              placeholder="PIN (4 dígitos)"
              placeholderTextColor="#AAAAAA"
              value={pin}
              onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="numeric"
              maxLength={4}
              textAlign="center"
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <TouchableOpacity
              style={[styles.btnPrimary, pin.length !== 4 && styles.btnDisabled]}
              onPress={handlePinSubmit}
              disabled={pin.length !== 4}
            >
              <Text style={styles.btnPrimaryText}>Ingresar a la mesa</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flexGrow: 1, paddingHorizontal: 28, paddingVertical: 48 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 42, fontWeight: '800', color: '#D4621A', letterSpacing: -1 },
  subtitle: { fontSize: 16, color: '#666666', marginTop: 6 },
  form: { gap: 12 },
  centered: { alignItems: 'center', gap: 16, paddingVertical: 40 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  hint: { fontSize: 14, color: '#666666' },
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
  pinInput: { fontSize: 28, letterSpacing: 10, fontWeight: '700' },
  codeInput: { fontSize: 32, letterSpacing: 16, fontWeight: '700' },
  error: { color: '#C62828', fontSize: 14, textAlign: 'center' },
  btnPrimary: {
    backgroundColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnPrimaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  btnSecondary: {
    borderWidth: 1,
    borderColor: '#D4621A',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnSecondaryText: { color: '#D4621A', fontSize: 16, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E0E0E0' },
  dividerText: { color: '#AAAAAA', fontSize: 13 },
  qrContainer: { width: '100%', minHeight: 320, borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  hidden: { display: 'none' },
})
