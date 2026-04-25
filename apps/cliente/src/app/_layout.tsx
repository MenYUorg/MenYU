import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { useUserStore } from '../store/userStore'

export default function RootLayout() {
  const { user, isHydrated, hydrate } = useUserStore()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    hydrate()
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    const inAuth = segments[0] === '(auth)'
    if (user && inAuth) router.replace('/(session)')
    if (!user && !inAuth) router.replace('/(auth)/login')
  }, [user, isHydrated])

  if (!isHydrated) return null

  return <Stack screenOptions={{ headerShown: false }} />
}
