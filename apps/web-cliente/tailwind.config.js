/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Los mismos colores que `src/theme.ts` (que los toma de `@menyu/ui`): acá hacen falta como valores sueltos para las
      // clases de Tailwind (`hover:!bg-coral-oscuro`, `focus:border-coral`). `src/theme.spec.ts` comprueba que coincidan.
      colors: {
        coral: '#CC4A31',
        'coral-oscuro': '#B8432C',
        navy: '#2D3561',
      },
    },
  },
  plugins: [],
}
