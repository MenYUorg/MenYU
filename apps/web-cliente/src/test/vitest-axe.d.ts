import type { AxeMatchers } from 'vitest-axe/matchers'

// vitest-axe 0.1.0 declara sus matchers para el espacio de nombres viejo (`Vi`): para Vitest 3 se declaran acá. La
// interfaz tiene que repetir el parámetro `T = any` de la de Vitest para que TypeScript las junte.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
