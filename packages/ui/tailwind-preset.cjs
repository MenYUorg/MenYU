// Tokens de marca de MenYU (docs/auth/specs/auth.md, Fase 3): colores sacados del logo (public/logo.png) y la
// tipografía de las apps. Preset de Tailwind v3: `presets: [require('@menyu/ui/tailwind-preset')]`.
// Las fuentes se cargan aparte, desde Google Fonts, en el index.html de cada app.

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        menyu: {
          // Coral del wordmark. Con texto blanco no llega a 4.5:1: para fondos de marca, no para botones con texto.
          coral: '#ED6A4F',
          'coral-suave': '#FDE7E1',
          // Azul marino del tenedor: también es el color del texto.
          navy: '#242C58',
          'navy-hover': '#323B6E',
          gris: '#5D6178',
          // Borde de los campos (3:1 contra el blanco) y líneas divisorias.
          borde: '#8A8FA5',
          linea: '#E1E3EA',
          fondo: '#F5F6F9',
          error: '#B3261E',
          'error-suave': '#FCEEEC',
        },
      },
      fontFamily: {
        titulo: ['Montserrat', 'system-ui', 'sans-serif'],
        texto: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
}
