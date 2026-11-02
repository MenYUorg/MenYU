import { saltosDeProxy } from './trust-proxy'

describe('saltosDeProxy', () => {
  it.each([
    ['en Railway, 1 (su edge): la IP es la que agrega el edge a X-Forwarded-For', { RAILWAY_ENVIRONMENT_ID: 'env-1' }, 1],
    ['fuera de Railway (local, CI), 0: X-Forwarded-For no se lee', {}, 0],
    ['TRUST_PROXY_HOPS manda sobre la detección', { RAILWAY_ENVIRONMENT_ID: 'env-1', TRUST_PROXY_HOPS: '2' }, 2],
    ['TRUST_PROXY_HOPS=0 lo apaga también en Railway', { RAILWAY_ENVIRONMENT_ID: 'env-1', TRUST_PROXY_HOPS: '0' }, 0],
    ['un TRUST_PROXY_HOPS que no es un número de saltos ("true") se ignora', { TRUST_PROXY_HOPS: 'true' }, 0],
  ])('%s', (_caso, env, saltos) => {
    expect(saltosDeProxy(env)).toBe(saltos)
  })
})
