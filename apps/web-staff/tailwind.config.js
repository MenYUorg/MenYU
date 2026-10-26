/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/auth-client/src/**/*.{ts,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
}
