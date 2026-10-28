import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// La carga diferida de supabase-js (CLAUDE.md): con un solo import de valor de estos paquetes, en cualquier archivo,
// Vite los devuelve al bundle principal. Los `import type` desaparecen al compilar y se permiten.
const PAQUETES_DIFERIDOS = ['@menyu/auth-client', '@supabase/supabase-js']
const IMPORT_ESTATICO =
  'web-cliente carga supabase-js en diferido: un import de valor lo devuelve al bundle principal. ' +
  'Para los tipos, `import type`; para lo demás, cargarAuthClient() de src/utils/authClientDiferido.ts.'
const IMPORT_DINAMICO =
  'El import() de este paquete va solo en src/utils/authClientDiferido.ts: usá cargarAuthClient().'

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Los imports estáticos, en todos los archivos: también en authClientDiferido.ts.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: PAQUETES_DIFERIDOS.map((name) => ({ name, message: IMPORT_ESTATICO, allowTypeImports: true })),
        },
      ],
      // La regla de arriba no mira los import(): esta los ataja, para que haya un solo punto de carga.
      'no-restricted-syntax': [
        'error',
        ...PAQUETES_DIFERIDOS.map((paquete) => ({
          selector: `ImportExpression[source.value='${paquete}']`,
          message: IMPORT_DINAMICO,
        })),
      ],
    },
  },
  {
    // El único punto de carga, declarado: solo acá se permite el import() del paquete.
    files: ['src/utils/authClientDiferido.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
)
