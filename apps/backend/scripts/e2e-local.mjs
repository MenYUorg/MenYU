// Integración del backend (los e2e) en un solo comando, igual que el job e2e-backend de ci.yml:
// levanta un Postgres 17.6 descartable en Docker, aplica las migraciones desde cero, revisa el drift contra
// schema.prisma, corre `test:e2e` y borra el contenedor, falle o no.
//
// Uso, desde la raíz:  pnpm test:integracion     (o desde apps/backend: pnpm test:e2e:local)
// Necesita Docker levantado. No toca la base de desarrollo (menyu-postgres, puerto 5433) ni ninguna remota:
// usa otro contenedor, sin volumen, en el puerto E2E_PG_PORT (5434 si no se define).
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const puerto = process.env.E2E_PG_PORT ?? '5434'
const contenedor = `menyu-e2e-${process.pid}`
const url = `postgresql://test:test@localhost:${puerto}/menyu_test`

// Las mismas variables que ci.yml (job e2e-backend): la base es local y las claves son de test
const env = {
  ...process.env,
  DATABASE_URL: url,
  DIRECT_URL: url,
  JWT_SECRET: 'e2e-test-jwt-secret-no-usar-fuera-del-ci',
  MP_ENCRYPTION_KEY: 'e2e-test-mp-key-no-usar-fuera-del-ci',
}

function correr(comando, args, opciones = {}) {
  const r = spawnSync(comando, args, { cwd: backend, env, stdio: 'inherit', shell: process.platform === 'win32', ...opciones })
  return r.status ?? 1
}

function paso(nombre, comando, args) {
  console.log(`\n▶ ${nombre}`)
  const status = correr(comando, args)
  if (status !== 0) throw new Error(`${nombre}: salió con ${status}`)
}

let codigo = 1
try {
  paso('Postgres descartable', 'docker', [
    'run', '-d', '--rm', '--name', contenedor,
    '-e', 'POSTGRES_USER=test', '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_DB=menyu_test',
    '-p', `${puerto}:5432`, 'postgres:17.6',
  ])

  console.log('\n▶ Esperando a Postgres')
  let lista = false
  for (let i = 0; i < 60 && !lista; i++) {
    lista = correr('docker', ['exec', contenedor, 'pg_isready', '-U', 'test', '-d', 'menyu_test', '-h', '127.0.0.1'], { stdio: 'ignore' }) === 0
    if (!lista) await new Promise((r) => setTimeout(r, 1000))
  }
  if (!lista) throw new Error('Postgres no respondió en 60 s')

  paso('Migraciones', 'pnpm', ['exec', 'prisma', 'migrate', 'deploy'])
  paso('Drift contra schema.prisma', 'pnpm', [
    'exec', 'prisma', 'migrate', 'diff', '--from-url', url, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code',
  ])
  paso('Tests e2e', 'pnpm', ['test:e2e'])
  codigo = 0
} catch (err) {
  console.error(`\n✖ ${err.message}`)
} finally {
  correr('docker', ['rm', '-f', contenedor], { stdio: 'ignore' })
}
process.exit(codigo)
