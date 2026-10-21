import menyu from '@menyu/ui/tailwind-preset'

/** @type {import('tailwindcss').Config} */
export default {
  presets: [menyu],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
