import * as SecureStore from 'expo-secure-store'

export const storage = {
  async getItem(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    return SecureStore.setItemAsync(key, value)
  },
  async deleteItem(key: string): Promise<void> {
    return SecureStore.deleteItemAsync(key)
  },
}
