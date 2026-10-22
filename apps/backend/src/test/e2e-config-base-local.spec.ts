import { spawnSync } from 'child_process'
import { join } from 'path'

// La guarda de jest.e2e.config.js: los e2e borran datos, así que solo corren contra un Postgres local o el service
// container del CI (ci.yml lo usa por localhost). Se carga el archivo real en un proceso aparte con las URLs de
// cada caso, como lo cargaría Jest.
const BACKEND = join(__dirname, '..', '..')
const CLAVE = 'clave-de-prueba'

function cargarConfig(urls: { DATABASE_URL: string; DIRECT_URL?: string }) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...urls }
  if (!urls.DIRECT_URL) delete env.DIRECT_URL
  return spawnSync(process.execPath, ['-e', "require('./jest.e2e.config.js')"], { cwd: BACKEND, env, encoding: 'utf8' })
}

describe('jest.e2e.config.js: guarda de base local', () => {
  it.each([
    ['un Postgres local (docker-compose del backend)', `postgresql://menyu:${CLAVE}@localhost:5433/menyu`],
    ['el service container del CI (por localhost)', `postgresql://test:${CLAVE}@localhost:5432/menyu_test`],
  ])('deja correr los e2e contra %s', (_caso, url) => {
    // Act
    const resultado = cargarConfig({ DATABASE_URL: url, DIRECT_URL: url })

    // Assert
    expect(resultado.stderr).toBe('')
    expect(resultado.status).toBe(0)
  })

  it.each([
    ['DATABASE_URL', { DATABASE_URL: `postgresql://postgres:${CLAVE}@db.ejemplo.supabase.co:5432/postgres` }],
    [
      'DIRECT_URL',
      {
        DATABASE_URL: `postgresql://menyu:${CLAVE}@localhost:5433/menyu`,
        DIRECT_URL: `postgresql://postgres:${CLAVE}@db.ejemplo.supabase.co:5432/postgres`,
      },
    ],
  ])('rechaza un host remoto en %s, sin excepción y sin mostrar la URL', (variable, urls) => {
    // Act
    const resultado = cargarConfig(urls)

    // Assert
    expect(resultado.status).not.toBe(0)
    expect(resultado.stderr).toContain(`${variable} apunta a "db.ejemplo.supabase.co"`)
    expect(resultado.stderr).not.toContain(CLAVE)
    expect(resultado.stderr).not.toContain('postgresql://')
    expect(resultado.stderr).not.toContain('E2E_')
  })
})
