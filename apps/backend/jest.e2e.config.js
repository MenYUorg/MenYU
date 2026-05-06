// Los e2e corren contra la misma BD Supabase que desarrollo.
// .env aporta DATABASE_URL/DIRECT_URL; .env.test sobreescribe JWT_SECRET
// para que los tokens firmados en tests sean independientes de producción.
// SQLite NO es compatible: PrismaService usa @prisma/adapter-pg y el schema
// tiene @db.Decimal (PostgreSQL-only).
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') })
require('dotenv').config({
  path: require('path').resolve(__dirname, '.env.test'),
  override: true,
})

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/../test/setup-e2e.ts'],
}
