// Los e2e escriben y borran en la base: corren contra un Postgres local (docker-compose.yml del backend) o el
// service container del CI (ci.yml, job e2e-backend, en localhost). Si DATABASE_URL o DIRECT_URL apuntan a
// otro host (Supabase, staging, producción), la configuración corta antes de correr nada. No hay excepción.
// .env aporta DATABASE_URL/DIRECT_URL; .env.test sobreescribe JWT_SECRET
// para que los tokens firmados en tests sean independientes de producción.
// SQLite NO es compatible: PrismaService usa @prisma/adapter-pg y el schema
// tiene @db.Decimal (PostgreSQL-only).
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })
require('dotenv').config({
  path: require('path').resolve(__dirname, '.env.test'),
  override: true,
})

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function hostDe(url) {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error('Los e2e necesitan DATABASE_URL apuntando a un Postgres local.')
}
for (const nombre of ['DATABASE_URL', 'DIRECT_URL']) {
  const valor = process.env[nombre]
  if (valor === undefined) continue
  // Se dice solo el host (o "no local" si la URL no se puede leer), nunca la URL: lleva la contraseña
  const host = hostDe(valor)
  if (!HOSTS_LOCALES.has(host)) {
    throw new Error(
      `${nombre} apunta a ${host ? `"${host}"` : 'un host no local'}: los e2e borran datos y solo corren contra un ` +
        'Postgres local o el service container del CI.',
    )
  }
}

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/../test/setup-e2e.ts'],
}
