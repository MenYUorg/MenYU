/**
 * Cuentas ROOT desde la línea de comandos: listarlas y hacer ROOT a una cuenta que ya existe.
 *
 * Con Supabase Auth (docs/auth/specs/auth.md, entrega 4.4) una cuenta ROOT es un `Usuario` con `esRoot`: la base no guarda
 * contraseñas. A una persona nueva se la invita desde la consola (`POST /root/roots`), que a propósito no hace ROOT a alguien que
 * ya tiene un `Usuario` (alguien del personal o un dueño): eso lo hace este script, que corre una persona del equipo con acceso
 * a la base. El primer ROOT de cada ambiente se crea a mano (docs/auth/usuarios-prueba-staging.md): sin ninguno, nadie invita.
 *
 * Uso, desde apps/backend:
 *
 *   pnpm exec ts-node --transpile-only scripts/cuentas-root.ts <comando> [email] [opciones]
 *
 *   listar               las cuentas ROOT que hay (solo lectura)
 *   promover <email>     hace ROOT al Usuario de ese email (sus membresías no cambian: ROOT no es un bypass)
 *
 * No hay comando para quitarle el ROOT a una cuenta ni para borrarla, igual que en la consola (decisión 15 de
 * docs/plan-consola-root.md). La base además impide quedarse sin ninguna cuenta ROOT activa.
 *
 * A qué base se conecta: usa DATABASE_URL de ESTA terminal y no lee el .env a propósito, para no tocar una base sin querer.
 * Dos formas de dársela (la misma URL que tiene el backend en Railway para ese entorno):
 *
 *   PowerShell:  $env:DATABASE_URL = '<url>'
 *   Git Bash:    export DATABASE_URL='<url>'
 *   o un archivo FUERA del repo con una línea DATABASE_URL=<url>:   --archivo-env=<ruta>   (tiene prioridad sobre la variable)
 *
 * Antes de escribir nada muestra a qué base apunta (servidor y nombre, nunca la clave) y pide escribir el nombre de la base.
 *
 * Historial de ROOT (docs/plan-consola-root.md, 7.2): lo que hace este script queda registrado, igual que lo que hace una cuenta ROOT
 * en la consola. El actor es "SCRIPT" y el operador es el usuario del sistema operativo de quien lo corrió. El registro se escribe
 * en la MISMA transacción que el cambio: si no se puede registrar, el cambio no se hace. Si la base todavía no tiene la tabla del
 * historial (falta aplicar la migración consola_root_historial), el script lo avisa y la acción no queda registrada.
 */
import { readFileSync } from 'node:fs'
import { userInfo } from 'node:os'
import { createInterface } from 'node:readline'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import type { PrismaClient } from '@prisma/client'
import { CambioHistorial, registrarEnHistorial } from '../src/root/historial/registrar-historial'

// Se guarda antes de cargar Prisma: el cliente puede leer el .env y pisar lo que haya en la terminal.
const URL_DE_LA_TERMINAL = process.env.DATABASE_URL

export class ErrorDeUso extends Error {}

// ── Validaciones (puras) ────────────────────────────────────────────────

export function normalizarEmail(texto: string): string {
  const email = texto.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ErrorDeUso(`"${texto}" no parece un email válido.`)
  }
  return email
}

/** El usuario del sistema operativo de quien corre el script: queda en el historial como "operador". */
export function operadorDelSistema(): string {
  try {
    return userInfo().username || 'desconocido'
  } catch {
    return process.env.USERNAME ?? process.env.USER ?? 'desconocido'
  }
}

/** Qué se escribe en el historial y a nombre de quién. `activo: false` si la base todavía no tiene la tabla. */
export interface Registro {
  activo: boolean
  operador: string
}

const cambioDelScript = (operador: string): CambioHistorial => ({
  campo: 'Cómo',
  antes: null,
  despues: `script de línea de comandos, operador: ${operador}`,
})

/** ¿La base ya tiene la tabla del historial de ROOT? */
export async function hayHistorial(prisma: Pick<PrismaClient, '$queryRaw'>): Promise<boolean> {
  const filas = await prisma.$queryRaw<Array<{ existe: boolean }>>`SELECT to_regclass('public.historial_root') IS NOT NULL AS existe`
  return filas[0]?.existe === true
}

/** Una URL de conexión sin la clave: servidor, puerto, base y usuario. */
export function describirBase(url: string): { host: string; puerto: string; base: string; usuario: string } {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new ErrorDeUso('DATABASE_URL no es una URL válida (postgresql://usuario:clave@servidor:puerto/base).')
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new ErrorDeUso('DATABASE_URL tiene que empezar con postgresql://')
  return { host: u.hostname, puerto: u.port || '5432', base: decodeURIComponent(u.pathname.replace(/^\//, '')), usuario: decodeURIComponent(u.username) }
}

/** La línea DATABASE_URL de un archivo de variables (admite comillas y comentarios). */
export function leerUrlDeArchivo(contenido: string): string | null {
  for (const linea of contenido.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?DATABASE_URL\s*=\s*(.*)\s*$/.exec(linea)
    if (m) return m[1].replace(/^(["'])(.*)\1$/, '$2').trim() || null
  }
  return null
}

// ── Entrada: una línea de la terminal, o de la entrada estándar si viene de otro programa ───────

class Entrada {
  private readonly pipeada = !process.stdin.isTTY
  private readonly cola: string[] = []
  private esperando: Array<(linea: string | null) => void> = []
  private cerrada = false

  constructor() {
    if (this.pipeada) {
      const rl = createInterface({ input: process.stdin, terminal: false })
      rl.on('line', (linea) => {
        const espera = this.esperando.shift()
        if (espera) espera(linea)
        else this.cola.push(linea)
      })
      rl.on('close', () => {
        this.cerrada = true
        this.esperando.splice(0).forEach((espera) => espera(null))
      })
    }
  }

  async linea(texto: string): Promise<string> {
    process.stdout.write(texto)
    if (!this.pipeada) {
      const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
      return new Promise((resolver) => {
        rl.question('', (respuesta) => {
          rl.close()
          resolver(respuesta)
        })
      })
    }
    // Si la entrada ya se cerró y no queda nada, se corta con un error: esperar una línea que no va a llegar dejaría terminar
    // el proceso en silencio, con código 0, como si hubiera salido todo bien.
    const guardada = this.cola.shift()
    const siguiente =
      guardada !== undefined ? guardada : this.cerrada ? null : await new Promise<string | null>((resolver) => this.esperando.push(resolver))
    process.stdout.write('\n')
    if (siguiente === null) throw new ErrorDeUso('Se cerró la entrada antes de terminar.')
    return siguiente
  }
}

// ── Comandos ────────────────────────────────────────────────────────────

async function confirmarBase(entrada: Entrada, base: string): Promise<void> {
  const escrito = (await entrada.linea(`Para confirmar, escribí el nombre de la base (${base}): `)).trim()
  if (escrito !== base) throw new ErrorDeUso('No coincide con el nombre de la base. No se hizo ningún cambio.')
}

async function listar(prisma: PrismaClient): Promise<void> {
  const roots = await prisma.usuario.findMany({
    where: { esRoot: true },
    select: { id: true, email: true, nombre: true, activo: true },
    orderBy: { email: 'asc' },
  })
  if (!roots.length) console.log('No hay ninguna cuenta ROOT.')
  for (const r of roots) console.log(`  ${r.email}   ${r.nombre}${r.activo ? '' : '   (desactivada)'}   (${r.id})`)
  console.log(`${roots.length} cuenta(s) ROOT.`)
}

async function promover(prisma: PrismaClient, entrada: Entrada, base: string, registro: Registro, emailCrudo: string | undefined): Promise<void> {
  if (!emailCrudo) throw new ErrorDeUso('Falta el email: promover <email>')
  const email = normalizarEmail(emailCrudo)

  const usuario = await prisma.usuario.findUnique({ where: { email }, select: { id: true, email: true, activo: true, esRoot: true } })
  if (!usuario) {
    throw new ErrorDeUso(
      `No hay ninguna cuenta de MenYU con el email ${email}. A una persona nueva se la invita desde la consola de ROOT ` +
        '(Cuentas ROOT); el primer ROOT de un ambiente se crea a mano (docs/auth/usuarios-prueba-staging.md).',
    )
  }
  if (!usuario.activo) throw new ErrorDeUso(`La cuenta ${email} está desactivada: no se la hace ROOT.`)
  if (usuario.esRoot) {
    console.log(`${email} ya es ROOT: no hay nada que cambiar.`)
    return
  }

  await confirmarBase(entrada, base)
  // El cambio y su registro en el historial van en la misma transacción: no queda uno sin el otro.
  await prisma.$transaction(async (tx) => {
    // Condicionado a que todavía no sea ROOT: si otra persona la promovió recién, no se registra dos veces.
    const { count } = await tx.usuario.updateMany({ where: { id: usuario.id, esRoot: false }, data: { esRoot: true } })
    if (count === 0) throw new ErrorDeUso(`${email} pasó a ser ROOT recién: no hay nada que cambiar.`)
    if (registro.activo) {
      await registrarEnHistorial(tx, {
        actor: { tipo: 'SCRIPT', nombre: registro.operador },
        accion: 'ROOT_PROMOVER',
        entidad: { tipo: 'ROOT', id: usuario.id, nombre: usuario.email },
        cambios: [{ campo: 'ROOT', antes: 'No', despues: 'Sí' }, cambioDelScript(registro.operador)],
      })
    }
  })
  console.log(`Listo: ${email} ahora es ROOT. Entra a la consola con su cuenta de siempre (email y contraseña, o Google).`)
  avisarRegistro(registro)
}

function avisarRegistro(registro: Registro): void {
  if (registro.activo) console.log(`Quedó registrado en el historial de ROOT (actor: script, operador: ${registro.operador}).`)
}

// ── Arranque ────────────────────────────────────────────────────────────

const AYUDA = `Uso: pnpm exec ts-node --transpile-only scripts/cuentas-root.ts <comando> [email] [opciones]
  listar | promover <email>
  Opciones: --archivo-env=<ruta>
La base sale de DATABASE_URL de esta terminal (no del .env). Más detalle en el encabezado de scripts/cuentas-root.ts.`

export async function main(argv: string[]): Promise<number> {
  const opciones = argv.filter((a) => a.startsWith('--'))
  const [comando, email] = argv.filter((a) => !a.startsWith('--'))
  if (!comando || !['listar', 'promover'].includes(comando)) {
    console.log(AYUDA)
    return comando ? 1 : 0
  }
  const archivo = opciones.find((o) => o.startsWith('--archivo-env='))?.slice('--archivo-env='.length)
  const desconocida = opciones.find((o) => !o.startsWith('--archivo-env='))
  if (desconocida) {
    console.error(`Opción desconocida: ${desconocida}\n${AYUDA}`)
    return 1
  }

  let pool: Pool | undefined
  let prisma: PrismaClient | undefined
  try {
    let url = URL_DE_LA_TERMINAL
    if (archivo) {
      url = leerUrlDeArchivo(readFileSync(archivo, 'utf8')) ?? undefined
      if (!url) throw new ErrorDeUso(`No encontré una línea DATABASE_URL=... en ${archivo}.`)
    }
    if (!url) {
      throw new ErrorDeUso('Falta DATABASE_URL en esta terminal (o --archivo-env=<ruta>). El script no lee el .env a propósito, para no tocar una base sin querer.')
    }
    const { host, puerto, base, usuario } = describirBase(url)
    console.log(`Base de datos: ${host}:${puerto}/${base} (usuario ${usuario})`)

    // Con la URL ya elegida, el cliente de Prisma no tiene que leer ninguna otra (el .env incluido).
    process.env.DATABASE_URL = url
    process.env.DIRECT_URL = url
    const { PrismaClient: Cliente } = await import('@prisma/client')
    const local = ['localhost', '127.0.0.1', '::1'].includes(host)
    pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } })
    prisma = new Cliente({ adapter: new PrismaPg(pool) })

    if (comando === 'listar') {
      await listar(prisma)
      return 0
    }
    const registro: Registro = { activo: await hayHistorial(prisma), operador: operadorDelSistema() }
    if (!registro.activo) {
      console.log('AVISO: esta base todavía no tiene el historial de ROOT (falta aplicar la migración consola_root_historial).')
      console.log('       La acción se hace igual, pero NO va a quedar registrada.')
    }
    await promover(prisma, new Entrada(), base, registro, email)
    return 0
  } catch (e) {
    console.error(e instanceof ErrorDeUso ? `\n${e.message}` : `\nError inesperado: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  } finally {
    await prisma?.$disconnect()
    await pool?.end()
  }
}

if (require.main === module) {
  void main(process.argv.slice(2)).then((codigo) => process.exit(codigo))
}
