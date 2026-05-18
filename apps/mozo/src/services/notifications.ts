export type NotifPermission = 'granted' | 'denied' | 'default'

export async function pedirPermiso(): Promise<NotifPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied'
  }
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  return Notification.requestPermission()
}

export function mostrarNotificacion(titulo: string, cuerpo: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  new Notification(titulo, {
    body: cuerpo,
    icon: '/favicon.ico',
    tag: 'menyu-mozo',
  })
}
