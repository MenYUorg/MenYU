import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

// En nativo: SecureStore (keychain cifrado)
// En web: localStorage (sin cifrado, solo para desarrollo)
export const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key)
    }
    return SecureStore.getItemAsync(key)
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value)
      return
    }
    return SecureStore.setItemAsync(key, value)
  },

  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key)
      return
    }
    return SecureStore.deleteItemAsync(key)
  },
}
