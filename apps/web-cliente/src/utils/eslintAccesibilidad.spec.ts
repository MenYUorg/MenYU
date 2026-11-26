import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

/**
 * El lint de accesibilidad (`eslint-plugin-jsx-a11y`, configuración `recommended`) vive en eslint.config.js y corre en el
 * CI con `--max-warnings 0`. Este spec lo corre sobre código de ejemplo, para que no se pierda sin que nadie lo note: si
 * alguien saca el plugin de la configuración, estos tests fallan en lugar de que el lint "pase" porque ya no mira nada.
 * Mismo armado que `authClientDiferido.spec.ts` (el `cwd` es la raíz de la app).
 */
const eslint = new ESLint({ cwd: resolve(dirname(fileURLToPath(import.meta.url)), '../..') })

async function reglasQueSaltan(codigo: string): Promise<(string | null)[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath: 'src/pages/Ejemplo.tsx' })
  return resultado.messages.map((mensaje) => mensaje.ruleId)
}

describe('eslint.config.js: el lint de accesibilidad (jsx-a11y)', () => {
  it('deja pasar un botón de verdad, una imagen con su texto alternativo y un campo con su etiqueta', async () => {
    const bien = [
      'export const Ejemplo = () => (',
      '  <main>',
      '    <button type="button" onClick={() => {}}>Agregar</button>',
      '    <img src="/plato.png" alt="Milanesa" />',
      '    <label htmlFor="nombre">Tu nombre</label>',
      '    <input id="nombre" />',
      '  </main>',
      ')',
    ].join('\n')

    expect(await reglasQueSaltan(bien)).toEqual([])
  }, 30_000)

  it('ataja un <div> con clic y sin teclado (lo de "Quitar" y del fondo del modal de pago de antes)', async () => {
    const reglas = await reglasQueSaltan('export const Ejemplo = () => <div onClick={() => {}}>Quitar</div>')

    expect(reglas).toContain('jsx-a11y/click-events-have-key-events')
    expect(reglas).toContain('jsx-a11y/no-static-element-interactions')
  }, 30_000)

  it('ataja una imagen sin texto alternativo', async () => {
    expect(await reglasQueSaltan('export const Ejemplo = () => <img src="/plato.png" />')).toContain('jsx-a11y/alt-text')
  }, 30_000)

  it('ataja el autoFocus (en el celular abre el teclado y el lector se saltea el título)', async () => {
    expect(await reglasQueSaltan('export const Ejemplo = () => <input id="nombre" aria-label="Nombre" autoFocus />')).toContain(
      'jsx-a11y/no-autofocus',
    )
  }, 30_000)

  it('ataja un diálogo (role="dialog") con un manejador de clic: la regla que se resolvió en PagarPage', async () => {
    const reglas = await reglasQueSaltan(
      'export const Ejemplo = () => <div role="dialog" aria-modal="true" aria-label="Aviso" onClick={() => {}}>x</div>',
    )

    expect(reglas).toContain('jsx-a11y/no-noninteractive-element-interactions')
  }, 30_000)

  it('ataja un enlace sin contenido y un aria-* que no existe', async () => {
    const reglas = await reglasQueSaltan(
      'export const Ejemplo = () => <><a href="/x"></a><button type="button" aria-labelledbyy="x">b</button></>',
    )

    expect(reglas).toContain('jsx-a11y/anchor-has-content')
    expect(reglas).toContain('jsx-a11y/aria-props')
  }, 30_000)
})
