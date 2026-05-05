import { Stack, useRouter, useSegments } from 'expo-router'
import { useEffect } from 'react'
import { useUserStore } from '../store/userStore'
import { useSessionStore } from '../store/sessionStore'

export default function RootLayout() {
  const { user, isHydrated: isUserHydrated, hydrate } = useUserStore()
  const { sesionId, isHydrated: isSessionHydrated, hydrate: hydrateSession } = useSessionStore()
  const router = useRouter()
  const segments = useSegments()

  useEffect(() => {
    hydrate()
    void hydrateSession()
  }, [])

  useEffect(() => {
    if (!isUserHydrated || !isSessionHydrated) return

    const inAuth = segments[0] === '(auth)'
    const inCheckIn = (segments[0] as string) === 'check-in'
    const hasAccess = !!user || !!sesionId

    if (hasAccess && inAuth) router.replace('/(session)')
    if (!hasAccess && !inAuth && !inCheckIn) router.replace('/(auth)/login')
  }, [user, sesionId, isUserHydrated, isSessionHydrated])

  if (!isUserHydrated || !isSessionHydrated) return null

  return <Stack screenOptions={{ headerShown: false }} />
}
