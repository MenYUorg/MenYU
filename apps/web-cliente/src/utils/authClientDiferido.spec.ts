import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

/**
 * La carga diferida de `authClientDiferido.ts` solo se sostiene si ningún otro archivo importa el paquete: la regla
 * vive en eslint.config.js. Este spec la corre sobre código de ejemplo, para que no se pierda sin que nadie lo note.
 * El `cwd` es la raíz de la app, así encuentra la config sin importar desde dónde se corran los tests (sin
 * `new URL('../..', import.meta.url)`: Vite reescribe ese patrón como la URL de un asset).
 */
const eslint = new ESLint({ cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../..') })

async function reglasQueSaltan(codigo: string, filePath: string): Promise<(string | null)[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath })
  return resultado.messages.map((mensaje) => mensaje.ruleId)
}

describe('eslint.config.js: la carga diferida de supabase-js', () => {
  it('deja los import type y el import() de authClientDiferido.ts', async () => {
    const tipos = [
      "import type { Session } from '@supabase/supabase-js'",
      "import type { EstadoSesion } from '@menyu/auth-client'",
      'export type Tipos = Session | EstadoSesion',
    ].join('\n')
    const cargador = "export const cargar = () => import('@menyu/auth-client')"

    expect(await reglasQueSaltan(tipos, 'src/pages/Ejemplo.tsx')).toEqual([])
    expect(await reglasQueSaltan(cargador, 'src/utils/authClientDiferido.ts')).toEqual([])
  }, 30_000)

  it('ataja el import de valor de los dos paquetes, también en authClientDiferido.ts, y el import() en otro archivo', async () => {
    const estaticos = [
      "import { clienteAuth } from '@menyu/auth-client'",
      "import { createClient } from '@supabase/supabase-js'",
      'export { clienteAuth, createClient }',
    ].join('\n')
    const dinamicos = [
      "export const cargar = () => import('@menyu/auth-client')",
      "export const cargarSupabase = () => import('@supabase/supabase-js')",
    ].join('\n')

    expect(await reglasQueSaltan(estaticos, 'src/pages/Ejemplo.tsx')).toEqual([
      '@typescript-eslint/no-restricted-imports',
      '@typescript-eslint/no-restricted-imports',
    ])
    expect(await reglasQueSaltan(estaticos, 'src/utils/authClientDiferido.ts')).toEqual([
      '@typescript-eslint/no-restricted-imports',
      '@typescript-eslint/no-restricted-imports',
    ])
    expect(await reglasQueSaltan(dinamicos, 'src/hooks/useEjemplo.ts')).toEqual([
      'no-restricted-syntax',
      'no-restricted-syntax',
    ])
    // La excepción es de authClientDiferido.ts, no de su carpeta.
    expect(await reglasQueSaltan(dinamicos, 'src/utils/cuenta.ts')).toEqual([
      'no-restricted-syntax',
      'no-restricted-syntax',
    ])
  }, 30_000)
})
