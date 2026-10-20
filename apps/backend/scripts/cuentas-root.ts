/**
 * Cuentas ROOT desde la línea de comandos: crear, listar, restablecer la contraseña y eliminar.
 *
 * Lo corre una persona del equipo, una vez por entorno (local, staging y producción). La contraseña se pide al correrlo, sin
 * mostrarla: no se escribe en el repo, ni en la línea de comandos, ni en el historial de la terminal. Nunca se imprime.
 *
 * Uso, desde apps/backend:
 *
 *   pnpm exec ts-node --transpile-only scripts/cuentas-root.ts <comando> [email] [opciones]
 *
 *   listar                  las cuentas ROOT que hay (solo lectura)
 *   crear <email>           crea una cuenta ROOT
 *   restablecer <email>     cambia la contraseña de una cuenta ROOT y cierra sus sesiones
 *   eliminar <email>        elimina una cuenta ROOT (nunca la última)
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
 * Opciones: --password-stdin lee la contraseña de la entrada estándar en vez de pedirla en la terminal (para automatizar).
 *
 * Las acciones de este script no pasan por la consola de ROOT: cuando exista el historial de acciones de ROOT
 * (docs/plan-consola-root.md), el script también va a registrarlas.
 */
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import * as bcrypt from 'bcryptjs'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import type { PrismaClient } from '@prisma/client'

// Se guarda antes de cargar Prisma: el cliente puede leer el .env y pisar lo que haya en la terminal.
const URL_DE_LA_TERMINAL = process.env.DATABASE_URL

const BCRYPT_ROUNDS = 12
const MIN_LARGO = 12
const CONTRASENAS_CONOCIDAS = ['root1234', 'password123', 'password1234', 'admin1234', 'qwerty123456', '123456789012', 'contrasena123']

export class ErrorDeUso extends Error {}

// ── Validaciones (puras) ────────────────────────────────────────────────

export function normalizarEmail(texto: string): string {
  const email = texto.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ErrorDeUso(`"${texto}" no parece un email válido.`)
  }
  return email
}

/** Devuelve el motivo si la contraseña no sirve para una cuenta ROOT, o null si está bien. */
export function motivoContrasenaDebil(contrasena: string, email: string): string | null {
  if (contrasena.length < MIN_LARGO) return `Tiene que tener al menos ${MIN_LARGO} caracteres.`
  if (new Set(contrasena).size < 5) return 'Repite demasiado los mismos caracteres.'
  if (CONTRASENAS_CONOCIDAS.includes(contrasena.toLowerCase())) return 'Es una contraseña conocida.'
  const usuario = email.split('@')[0]
  if (usuario.length >= 4 && contrasena.toLowerCase().includes(usuario)) return 'Contiene la parte del email antes de la arroba.'
  return null
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

/** Aplica lo que se tipeó a la contraseña en curso. Sin eco: no se muestra nada. */
export function aplicarTeclas(valor: string, texto: string): { valor: string; fin: 'enter' | 'cancelar' | null } {
  if (texto.startsWith('\u001b')) return { valor, fin: null } // flechas y otras teclas especiales
  for (const c of texto) {
    if (c === '\u0003') return { valor, fin: 'cancelar' } // Ctrl+C
    if (c === '\r' || c === '\n') return { valor, fin: 'enter' }
    if (c === '\u007f' || c === '\b') valor = valor.slice(0, -1)
    else if (c >= ' ') valor += c
  }
  return { valor, fin: null }
}

// ── Entrada: en una terminal, la contraseña se escribe sin eco; con --password-stdin, se lee de la entrada ───────

class Entrada {
  private readonly pipeada = !process.stdin.isTTY
  private readonly cola: string[] = []
  private esperando: Array<(linea: string | null) => void> = []
  private cerrada = false

  constructor(private readonly contrasenaPorStdin: boolean) {
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

  async secreto(texto: string): Promise<string> {
    if (this.pipeada) {
      if (!this.contrasenaPorStdin) {
        throw new ErrorDeUso('Para escribir la contraseña hace falta una terminal. Para automatizarlo, usá --password-stdin.')
      }
      return this.linea(texto)
    }
    const stdin = process.stdin
    process.stdout.write(texto)
    return new Promise((resolver, rechazar) => {
      let valor = ''
      const terminar = () => {
        stdin.off('data', alDato)
        stdin.setRawMode(false)
        stdin.pause()
        process.stdout.write('\n')
      }
      const alDato = (datos: Buffer | string) => {
        const r = aplicarTeclas(valor, datos.toString())
        valor = r.valor
        if (r.fin === 'cancelar') {
          terminar()
          rechazar(new ErrorDeUso('Cancelado.'))
        } else if (r.fin === 'enter') {
          terminar()
          resolver(valor)
        }
      }
      stdin.setRawMode(true)
      stdin.resume()
      stdin.on('data', alDato)
    })
  }
}

// ── Comandos ────────────────────────────────────────────────────────────

async function pedirContrasenaNueva(entrada: Entrada, email: string): Promise<string> {
  for (let intento = 0; intento < 3; intento++) {
    const una = await entrada.secreto(`Contraseña (al menos ${MIN_LARGO} caracteres): `)
    const motivo = motivoContrasenaDebil(una, email)
    if (motivo) {
      console.log(`  No sirve: ${motivo}`)
      continue
    }
    const otra = await entrada.secreto('Repetila: ')
    if (una !== otra) {
      console.log('  No coinciden.')
      continue
    }
    return una
  }
  throw new ErrorDeUso('Demasiados intentos. No se hizo ningún cambio.')
}

async function confirmarBase(entrada: Entrada, base: string): Promise<void> {
  const escrito = (await entrada.linea(`Para confirmar, escribí el nombre de la base (${base}): `)).trim()
  if (escrito !== base) throw new ErrorDeUso('No coincide con el nombre de la base. No se hizo ningún cambio.')
}

async function buscarRoot(prisma: PrismaClient, email: string) {
  const cuenta = await prisma.admin.findUnique({ where: { email }, select: { id: true, email: true, rol: true } })
  if (!cuenta) throw new ErrorDeUso(`No hay ninguna cuenta con el email ${email}.`)
  if (cuenta.rol !== 'ROOT') {
    throw new ErrorDeUso(`${email} es una cuenta ${cuenta.rol}, no ROOT: se administra desde la consola de ROOT, no con este script.`)
  }
  return cuenta
}

async function cerrarSesiones(prisma: Pick<PrismaClient, 'refreshToken'>, adminId: string): Promise<number> {
  const { count } = await prisma.refreshToken.updateMany({
    where: { userId: adminId, userTipo: 'admin', revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return count
}

async function listar(prisma: PrismaClient): Promise<void> {
  const roots = await prisma.admin.findMany({ where: { rol: 'ROOT' }, select: { id: true, email: true }, orderBy: { email: 'asc' } })
  if (!roots.length) console.log('No hay ninguna cuenta ROOT.')
  for (const r of roots) console.log(`  ${r.email}   (${r.id})`)
  console.log(`${roots.length} cuenta(s) ROOT.`)
}

async function crear(prisma: PrismaClient, entrada: Entrada, base: string, emailCrudo: string | undefined): Promise<void> {
  if (!emailCrudo) throw new ErrorDeUso('Falta el email: crear <email>')
  const email = normalizarEmail(emailCrudo)

  // El login busca primero en admin, después en mozo y después en cliente: una cuenta de admin con el mismo email taparía a las otras.
  const admin = await prisma.admin.findUnique({ where: { email }, select: { rol: true } })
  if (admin) throw new ErrorDeUso(`Ya existe una cuenta ${admin.rol} con el email ${email}.`)
  if (await prisma.mozo.findFirst({ where: { email }, select: { id: true } })) {
    throw new ErrorDeUso(`El email ${email} ya lo usa un mozo: una cuenta de admin con el mismo email taparía su inicio de sesión.`)
  }
  if (await prisma.cliente.findUnique({ where: { email }, select: { id: true } })) {
    throw new ErrorDeUso(`El email ${email} ya lo usa un cliente: una cuenta de admin con el mismo email taparía su inicio de sesión.`)
  }

  await confirmarBase(entrada, base)
  const contrasena = await pedirContrasenaNueva(entrada, email)
  const passwordHash = await bcrypt.hash(contrasena, BCRYPT_ROUNDS)
  const creada = await prisma.admin.create({ data: { email, passwordHash, rol: 'ROOT' }, select: { id: true, email: true } })
  console.log(`Listo: cuenta ROOT creada para ${creada.email} (${creada.id}).`)
  console.log('La contraseña quedó guardada solo como hash en la base: no se puede volver a ver.')
}

async function restablecer(prisma: PrismaClient, entrada: Entrada, base: string, emailCrudo: string | undefined): Promise<void> {
  if (!emailCrudo) throw new ErrorDeUso('Falta el email: restablecer <email>')
  const email = normalizarEmail(emailCrudo)
  const cuenta = await buscarRoot(prisma, email)

  await confirmarBase(entrada, base)
  const contrasena = await pedirContrasenaNueva(entrada, email)
  const passwordHash = await bcrypt.hash(contrasena, BCRYPT_ROUNDS)
  await prisma.admin.update({ where: { id: cuenta.id }, data: { passwordHash } })
  const cerradas = await cerrarSesiones(prisma, cuenta.id)
  console.log(`Listo: contraseña nueva para ${email}. Se cerraron ${cerradas} sesión(es) renovable(s).`)
  console.log('Una sesión ya iniciada puede seguir hasta que venza su token de acceso (hasta 8 horas).')
}

async function eliminar(prisma: PrismaClient, entrada: Entrada, base: string, emailCrudo: string | undefined): Promise<void> {
  if (!emailCrudo) throw new ErrorDeUso('Falta el email: eliminar <email>')
  const email = normalizarEmail(emailCrudo)
  const cuenta = await buscarRoot(prisma, email)

  const total = await prisma.admin.count({ where: { rol: 'ROOT' } })
  if (total <= 1) throw new ErrorDeUso(`${email} es la única cuenta ROOT: no se elimina. Creá otra antes.`)

  await confirmarBase(entrada, base)
  const escrito = (await entrada.linea(`Se elimina la cuenta ${email} y no se puede deshacer. Escribí el email para confirmar: `)).trim().toLowerCase()
  if (escrito !== email) throw new ErrorDeUso('No coincide con el email. No se hizo ningún cambio.')

  // El conteo y el borrado van juntos: si otra persona borró una cuenta justo ahora, no se deja la base sin ROOT.
  await prisma.$transaction(async (tx) => {
    const quedan = await tx.admin.count({ where: { rol: 'ROOT' } })
    if (quedan <= 1) throw new ErrorDeUso(`${email} pasó a ser la única cuenta ROOT: no se elimina.`)
    await tx.admin.delete({ where: { id: cuenta.id } })
    await cerrarSesiones(tx, cuenta.id)
  })
  console.log(`Listo: se eliminó la cuenta ROOT ${email}.`)
}

// ── Arranque ────────────────────────────────────────────────────────────

const AYUDA = `Uso: pnpm exec ts-node --transpile-only scripts/cuentas-root.ts <comando> [email] [opciones]
  listar | crear <email> | restablecer <email> | eliminar <email>
  Opciones: --archivo-env=<ruta>  --password-stdin
La base sale de DATABASE_URL de esta terminal (no del .env). Más detalle en el encabezado de scripts/cuentas-root.ts.`

export async function main(argv: string[]): Promise<number> {
  const opciones = argv.filter((a) => a.startsWith('--'))
  const [comando, email] = argv.filter((a) => !a.startsWith('--'))
  if (!comando || !['listar', 'crear', 'restablecer', 'eliminar'].includes(comando)) {
    console.log(AYUDA)
    return comando ? 1 : 0
  }
  const archivo = opciones.find((o) => o.startsWith('--archivo-env='))?.slice('--archivo-env='.length)
  const conocidas = ['--archivo-env=', '--password-stdin']
  const desconocida = opciones.find((o) => !conocidas.some((c) => o.startsWith(c)))
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

    const entrada = new Entrada(opciones.includes('--password-stdin'))
    if (comando === 'listar') await listar(prisma)
    else if (comando === 'crear') await crear(prisma, entrada, base, email)
    else if (comando === 'restablecer') await restablecer(prisma, entrada, base, email)
    else await eliminar(prisma, entrada, base, email)
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
