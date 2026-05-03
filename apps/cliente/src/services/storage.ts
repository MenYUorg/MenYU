// Metro elige storage.web.ts en web y storage.native.ts en iOS/Android.
// Este archivo es fallback seguro para web.
export const storage = {
  async getItem(key: string): Promise<string | null> {
    return localStorage.getItem(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value)
  },
  async deleteItem(key: string): Promise<void> {
    localStorage.removeItem(key)
  },
}
