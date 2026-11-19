import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CORAL, CORAL_OSCURO, CORAL_SUAVE, GRIS_TEXTO, razonDeContraste } from '@menyu/ui'
import { CM } from './components/menu/paleta'
import { C } from './theme'

const aca = dirname(fileURLToPath(import.meta.url))

const TEXTO_NORMAL = 4.5

describe('theme.ts: el coral y el gris de texto son los de @menyu/ui, un solo valor para todos', () => {
  it('el coral, su versión oscura, el rosado y el gris salen de @menyu/ui', () => {
    expect(C.orange).toBe(CORAL)
    expect(C.orangeHover).toBe(CORAL_OSCURO)
    expect(C.orangeText).toBe(CORAL_OSCURO)
    expect(CM.orangeText).toBe(C.orangeText)
    expect(C.orangeSoft).toBe(CORAL_SUAVE)
    expect(C.gray).toBe(GRIS_TEXTO)
    expect(C.textSub).toBe(GRIS_TEXTO)
  })

  it('la paleta del menú no define colores propios para el coral ni el gris: los toma del tema', () => {
    expect(CM.orange).toBe(C.orange)
    expect(CM.orangeSoft).toBe(C.orangeSoft)
    expect(CM.textMuted).toBe(C.gray)
    expect(CM.textSub).toBe(C.textSub)
  })

  it('las clases de Tailwind (coral, coral-oscuro, navy) tienen los mismos valores que el tema', () => {
    const config = readFileSync(resolve(aca, '../tailwind.config.js'), 'utf8')
    const valor = (nombre: string) => config.match(new RegExp(`['"]?${nombre}['"]?\\s*:\\s*'(#[0-9A-Fa-f]{6})'`))?.[1]

    expect(valor('coral')).toBe(C.orange)
    expect(valor('coral-oscuro')).toBe(C.orangeHover)
    expect(valor('navy')).toBe(C.navy)
  })
})

describe('theme.ts: los pares de colores que se usan para texto llegan a 4,5:1 (WCAG 1.4.3)', () => {
  // [qué es, color del texto, color del fondo]
  it.each([
    ['texto blanco sobre un botón coral ("Agregar al pedido", "Confirmar pedido", "Mesa 5")', C.white, C.orange],
    ['texto blanco sobre un botón coral al pasar el mouse', C.white, C.orangeHover],
    ['precio coral sobre blanco', C.orange, C.white],
    ['texto coral oscuro sobre el rosado ("1 oferta", "+$150", iniciales, estado del pedido, "Mis pedidos" del menú lateral)', C.orangeText, C.orangeSoft],
    ['texto coral oscuro sobre el gris de la página ("Limpiar filtros", "Reintentar")', C.orangeText, C.bg],
    ['gris de textos chicos sobre blanco (hora, resumen, precio tachado)', C.gray, C.white],
    ['gris de textos chicos sobre el fondo gris de la página', C.gray, C.bg],
    ['texto secundario sobre blanco', C.textSub, C.white],
    ['texto principal sobre blanco', C.text, C.white],
    ['texto principal sobre el rosado', C.text, C.orangeSoft],
    ['texto navy sobre blanco', C.navy, C.white],
    ['texto navy sobre el rosado', C.navy, C.orangeSoft],
    ['texto blanco sobre navy (encabezados)', C.white, C.navy],
    ['aviso de error sobre blanco', C.error, C.white],
    ['aviso de error sobre el rosado', C.error, C.orangeSoft],
  ])('%s', (_que, texto, fondo) => {
    expect(razonDeContraste(texto, fondo)).toBeGreaterThanOrEqual(TEXTO_NORMAL)
  })

  it('lo que NO llega, y por eso hay un color aparte para cada caso: el coral como texto sobre el rosado y el gris sobre el rosado', () => {
    expect(razonDeContraste(C.orange, C.orangeSoft)).toBeLessThan(TEXTO_NORMAL)
    expect(razonDeContraste(C.gray, C.orangeSoft)).toBeLessThan(TEXTO_NORMAL)
  })

  it('el coral de siempre ya no está en uso: era 3,6:1 y no llegaba', () => {
    expect(razonDeContraste('#E8563A', C.white)).toBeLessThan(TEXTO_NORMAL)
    expect(razonDeContraste(C.orange, C.white)).toBeGreaterThanOrEqual(TEXTO_NORMAL)
  })
})

/** Todos los archivos de código de `src` (sin los specs). */
function archivosDeCodigo(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre)
    if (statSync(ruta).isDirectory()) return archivosDeCodigo(ruta)
    return /\.(ts|tsx|css)$/.test(nombre) && !/\.spec\.tsx?$/.test(nombre) ? [ruta] : []
  })
}

describe('ningún archivo de src escribe a mano los colores que se cambiaron', () => {
  const PROHIBIDOS: Array<[string, RegExp]> = [
    ['el coral de antes (#E8563A)', /#E8563A/i],
    ['el hover de antes (#d34a30)', /#d34a30/i],
    ['el gris claro de antes (#9CA3AF)', /#9CA3AF/i],
    ['el coral de antes en un rgba(232, 86, 58, …)', /rgba?\(\s*232\s*,\s*86\s*,\s*58/i],
    ['el naranja de Tailwind (orange-500, que no es el de la marca)', /\b(bg|text|border|ring)-orange-\d{2,3}\b/],
    ['el gris claro de Tailwind (gray-400 y gray-300 como texto)', /\btext-gray-[34]00\b/],
  ]
  // `theme.ts` los nombra en sus comentarios: es el único que puede.
  const archivos = archivosDeCodigo(aca).filter((ruta) => !ruta.endsWith(`${'/'}theme.ts`) && !ruta.endsWith('\\theme.ts'))

  it('hay archivos que revisar', () => {
    expect(archivos.length).toBeGreaterThan(50)
  })

  it.each(PROHIBIDOS)('%s', (_que, patron) => {
    const encontrados = archivos.filter((ruta) => patron.test(readFileSync(ruta, 'utf8')))

    expect(encontrados.map((ruta) => ruta.slice(aca.length + 1))).toEqual([])
  })
})
