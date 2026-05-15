# Módulo Carrito — Tests unitarios (feat/carrito)

**Sprint:** feat/carrito  
**Equipo:** De Marcos · Ojeda · Strumia Carrara  
**Fecha:** Mayo 2026

---

## Índice

1. [Qué se construyó](#1-qué-se-construyó)
2. [Stack de testing](#2-stack-de-testing)
3. [Configuración de Jest](#3-configuración-de-jest)
4. [Problemas de compatibilidad resueltos](#4-problemas-de-compatibilidad-resueltos)
5. [Patrones de test usados](#5-patrones-de-test-usados)
6. [useCarritoStore.spec.ts](#6-usecarritospects)
7. [CantidadControl.spec.tsx](#7-cantidadcontrolspectsx)
8. [MenuItemCard.spec.tsx](#8-menuitemcardspectsx)
9. [CarritoItem.spec.tsx](#9-carritoitemspectsx)
10. [Resultado final](#10-resultado-final)
11. [Cómo correr los tests](#11-cómo-correr-los-tests)

---

## 1. Qué se construyó

Infraestructura de testing completa para `apps/cliente` (no existía) y 4 archivos de tests que cubren el store y los tres componentes del módulo carrito.

| Archivo | Tests |
|---|---|
| `apps/cliente/src/stores/useCarritoStore.spec.ts` | 22 |
| `apps/cliente/src/components/CantidadControl.spec.tsx` | 6 |
| `apps/cliente/src/components/MenuItemCard.spec.tsx` | 9 |
| `apps/cliente/src/components/CarritoItem.spec.tsx` | 5 |
| **Total** | **42** |

Archivos de configuración creados:

| Archivo | Propósito |
|---|---|
| `apps/cliente/jest.config.js` | Configuración de Jest para el monorepo pnpm |
| `apps/cliente/__mocks__/empty.js` | Mock vacío para módulos problemáticos de Expo |

---

## 2. Stack de testing

Dependencias agregadas a `apps/cliente` (devDependencies):

```json
"jest-expo": "~53.0.14",
"@testing-library/react-native": "^13.3.3",
"@types/jest": "^29.5.14"
```

Scripts agregados a `package.json`:

```json
"test":       "jest",
"test:watch": "jest --watch",
"test:cov":   "jest --coverage"
```

- **`jest-expo`**: preset oficial de Expo para Jest. Maneja la transformación de archivos React Native, los mocks de módulos nativos, y la resolución de extensiones de plataforma (`.native.ts`, `.ios.ts`, etc.).
- **`@testing-library/react-native`**: librería de renderizado y queries para componentes RN. Provee `render`, `fireEvent`, `getByText`, `queryByText`.
- **`@types/jest`**: tipos de TypeScript para las APIs de Jest (`describe`, `it`, `expect`, `jest.fn()`, etc.).

No se instaló `react-test-renderer` por separado — `jest-expo` lo maneja internamente.

---

## 3. Configuración de Jest

**Archivo:** `apps/cliente/jest.config.js`

```javascript
const path = require('path')

module.exports = {
  preset: 'jest-expo',
  rootDir: '../..',
  testMatch: ['<rootDir>/apps/cliente/src/**/*.spec.{ts,tsx}'],
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        caller: { name: 'metro', bundler: 'metro', platform: 'ios' },
        configFile: path.resolve(__dirname, 'babel.config.js'),
      },
    ],
  },
  moduleNameMapper: {
    '^@menyu/types$': '<rootDir>/packages/types/src/index.ts',
    '^@menyu/types/(.*)$': '<rootDir>/packages/types/src/$1',
    '^expo/src/winter.*': path.resolve(__dirname, '__mocks__/empty.js'),
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|zustand))',
  ],
  coverageDirectory: '<rootDir>/apps/cliente/coverage',
  collectCoverageFrom: [
    'apps/cliente/src/**/*.{ts,tsx}',
    '!apps/cliente/src/**/*.d.ts',
    '!apps/cliente/src/index.ts',
  ],
}
```

Cada opción y por qué existe se explica en la sección siguiente.

---

## 4. Problemas de compatibilidad resueltos

Esta configuración fue **no trivial** por la combinación de tres factores: **pnpm monorepo + Expo 53 + Jest 30**. Los tres problemas y sus soluciones:

---

### Problema 1 — `rootDir` y el error "import outside scope"

**Síntoma:**
```
ReferenceError: You are trying to `import` a file outside of the scope of the test code.
  at expo/src/winter/runtime.native.ts
```

**Causa:** Jest 30 introdujo un chequeo de seguridad que lanza error cuando se intenta ejecutar un módulo desde fuera del `rootDir`. Por defecto, `rootDir = apps/cliente/`. En un monorepo pnpm, los paquetes reales están en `MenYu/node_modules/.pnpm/expo@53.../`, que es fuera de `apps/cliente/`. Jest bloqueaba la ejecución de esos módulos.

**Solución:**
```javascript
rootDir: '../..',
testMatch: ['<rootDir>/apps/cliente/src/**/*.spec.{ts,tsx}'],
```

Se mueve `rootDir` a la raíz del monorepo, donde efectivamente viven todos los `node_modules`. `testMatch` limita la búsqueda de tests a `apps/cliente/src/` para no encontrar los tests del backend u otras apps.

---

### Problema 2 — Flow types en `@react-native/js-polyfills` sin parser

**Síntoma:**
```
SyntaxError: Missing semicolon. (14:4)
  type ErrorHandler = (error: mixed, isFatal: boolean) => void;
```

**Causa:** El paquete `@react-native/js-polyfills` distribuye código fuente con anotaciones de tipos **Flow** (no TypeScript). Con `rootDir: '../..'`, Babel buscaba `babel.config.js` en la raíz del monorepo (`MenYu/`). Al no existir allí ningún `babel.config.js`, los archivos de `@react-native/js-polyfills` se transformaban sin configuración, y `@babel/parser` no entendía la sintaxis Flow.

**Causa raíz específica:** El helper `resolveBabelConfig` de jest-expo devuelve `null` cuando existe un `babel.config.js` en el CWD, delegando la resolución a Babel. Con `rootDir` movido a `../..`, Babel resolvía la config desde un lugar diferente al archivo de `apps/cliente/`.

**Solución:**
```javascript
transform: {
  '\\.[jt]sx?$': [
    'babel-jest',
    {
      caller: { name: 'metro', bundler: 'metro', platform: 'ios' },
      configFile: path.resolve(__dirname, 'babel.config.js'),
    },
  ],
},
```

Se pasa `configFile` explícito apuntando a `apps/cliente/babel.config.js` (donde `__dirname` siempre es la ubicación del `jest.config.js`, independientemente del `rootDir`). Esto fuerza a Babel a usar `babel-preset-expo` para TODOS los archivos transformados, incluyendo los de `node_modules/.pnpm/...`.

El `caller: { name: 'metro', platform: 'ios' }` replica lo que haría el bundler Metro, necesario para que `babel-preset-expo` aplique los plugins correctos (incluyendo la resolución de archivos `.native.ts`).

---

### Problema 3 — `expo/src/winter` y el getter lazy fuera de scope

**Síntoma:** (resuelto Problema 1 y 2, seguía apareciendo)
```
ReferenceError: You are trying to `import` a file outside of the scope of the test code.
  at Runtime._execModule
  at expo/src/winter/runtime.native.ts:28
```

**Causa:** El setup de jest-expo (`jest-expo/src/preset/setup.js`) termina con:
```javascript
require('expo/src/winter');
```

Esto carga `expo/src/winter/runtime.native.ts`, que instala un getter **lazy** para `global.__ExpoImportMetaRegistry` usando `defineLazyObjectProperty`. Cuando algo accede a ese global por primera vez, el getter ejecuta:
```javascript
require('./ImportMetaRegistry').ImportMetaRegistry
```

Esta llamada a `require()` ocurre con `isInsideTestCode === false` en jest 30 (fase de teardown o fuera del ciclo de test), lo que activa el nuevo chequeo de seguridad de Jest 30's `Runtime._execModule`.

**Solución:**
```javascript
// apps/cliente/__mocks__/empty.js
module.exports = {};
```

```javascript
moduleNameMapper: {
  '^expo/src/winter.*': path.resolve(__dirname, '__mocks__/empty.js'),
}
```

Se mocka todo el submódulo `expo/src/winter` con un módulo vacío. Esto impide que `runtime.native.ts` se cargue, lo que impide que el getter lazy para `__ExpoImportMetaRegistry` se registre, lo que impide el error. Para los tests del carrito no se necesitan los polyfills que instala ese módulo (`URL`, `URLSearchParams`, `TextDecoder`).

---

### Problema 4 — `transformIgnorePatterns` para pnpm

**Síntoma:** Jest no transformaba archivos en `node_modules` que necesitaban serlo (React Native, Expo, zustand).

**Causa:** El patrón estándar de jest-expo:
```
/node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo...)
```

Está escrito para npm/yarn donde los paquetes están directamente en `node_modules/@react-native/...`. En pnpm, los paquetes reales están en `node_modules/.pnpm/@react-native+js-polyfills@0.79.6/node_modules/@react-native/...`. La primera ocurrencia de `node_modules/` va seguida de `.pnpm/`, que no está en la lista de excepciones, por lo que el archivo se ignoraba (no se transformaba).

**Solución:**
```javascript
transformIgnorePatterns: [
  'node_modules/(?!(.*node_modules/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|zustand))',
],
```

El agregado `(.*node_modules/)?` permite que el lookahead negativo "salte" el prefijo `node_modules/.pnpm/@package@version/node_modules/` de pnpm y evalúe el nombre real del paquete en el segundo `node_modules/`.

---

## 5. Patrones de test usados

### Store — acceso directo sin React

Para el store, no se necesita React ni RNTL. Zustand expone `getState()` y `setState()` directamente sobre la función del store:

```typescript
// Reset antes de cada test
beforeEach(() => {
  useCarritoStore.setState({ items: [] })
})

// Llamar acciones
useCarritoStore.getState().agregarItem(item)

// Leer estado
const { items } = useCarritoStore.getState()
```

Esto permite testear la lógica pura del store sin montar ningún componente.

### Componentes — mock del store con selector routing

Los componentes usan `useCarritoStore` con selectores. Para testearlos, se mockea el hook completo y se hace que el mock enrute los selectores contra un estado controlado:

```typescript
jest.mock('../stores/useCarritoStore')
const mockStore = useCarritoStore as jest.MockedFunction<typeof useCarritoStore>

function setupStore(cantidad: number) {
  const state = {
    items: cantidad > 0 ? [{ ...item, cantidad }] : [],
    agregarItem: mockAgregarItem,
    quitarItem: mockQuitarItem,
    actualizarCantidad: mockActualizarCantidad,
  }
  mockStore.mockImplementation((selector: any) => selector(state))
}
```

`mockStore.mockImplementation((selector) => selector(state))` hace que cada llamada a `useCarritoStore(s => s.algo)` devuelva `state.algo`. Esto cubre todos los selectores del componente en una sola configuración.

Para `CantidadControl` (solo lee un número), se usa la variante más simple:
```typescript
mockStore.mockReturnValue(3)
```

Esto devuelve `3` independientemente del selector pasado, lo que funciona cuando solo hay una llamada que devuelve un número.

### Interacciones — fireEvent

```typescript
fireEvent.press(getByText('+'))
expect(mockActualizarCantidad).toHaveBeenCalledWith('1', 3)
```

`fireEvent.press` de RNTL simula un toque sobre el elemento con el texto indicado. Después se verifica que las funciones correctas del store fueron llamadas con los argumentos correctos.

---

## 6. useCarritoStore.spec.ts

**Archivo:** `apps/cliente/src/stores/useCarritoStore.spec.ts`  
**Tests:** 22 · Sin React · Sin mocks

Cubre toda la lógica del store en 6 bloques `describe`:

### agregarItem (4 tests)
| Test | Qué verifica |
|---|---|
| agrega ítem nuevo con cantidad 1 | El primer `agregarItem` crea la entrada con `cantidad: 1` |
| incrementa cantidad si el ítem ya existe | Llamar dos veces con el mismo id suma cantidades |
| agrega ítems distintos como entradas separadas | Dos ids distintos → dos entradas |
| no modifica el resto al agregar uno existente | Solo el ítem con el id pasado se modifica |

### quitarItem (3 tests)
| Test | Qué verifica |
|---|---|
| elimina el ítem | Después de `quitarItem('1')`, el array queda vacío |
| elimina el ítem correcto cuando hay varios | Solo se elimina el id correcto |
| no hace nada si el id no existe | No lanza, no modifica |

### actualizarCantidad (4 tests)
| Test | Qué verifica |
|---|---|
| actualiza la cantidad | La cantidad queda en el valor pasado |
| elimina si cantidad es 0 | `actualizarCantidad('1', 0)` → ítem eliminado |
| elimina si cantidad es negativa | `actualizarCantidad('1', -3)` → ítem eliminado |
| no modifica otros ítems | Solo el ítem con el id pasado se actualiza |

### vaciarCarrito (2 tests)
| Test | Qué verifica |
|---|---|
| elimina todos los ítems | Array queda en `[]` |
| no falla con carrito vacío | No lanza si ya estaba vacío |

### total (4 tests)
| Test | Qué verifica |
|---|---|
| devuelve 0 con carrito vacío | Caso base |
| calcula precio × cantidad de un ítem | `100 × 3 = 300` |
| suma todos los ítems | `100×3 + 50×1 = 350` |
| se actualiza al quitar un ítem | Total refleja el estado actual |

### cantidadTotal (3 tests)
| Test | Qué verifica |
|---|---|
| devuelve 0 con carrito vacío | Caso base |
| suma cantidades de todos los ítems | 2 del ítem 1 + 1 del ítem 2 = 3 |
| se actualiza al vaciar el carrito | Vuelve a 0 tras `vaciarCarrito()` |

---

## 7. CantidadControl.spec.tsx

**Archivo:** `apps/cliente/src/components/CantidadControl.spec.tsx`  
**Tests:** 6 · Con RNTL · Mock simple (`mockReturnValue`)

`CantidadControl` tiene una sola llamada a `useCarritoStore` que devuelve un número, por lo que el mock es directo: `mockStore.mockReturnValue(N)`.

### renderizado (3 tests)
| Test | Qué verifica |
|---|---|
| muestra la cantidad leída del store | `getByText('3')` existe cuando el mock devuelve 3 |
| muestra 0 si el store devuelve 0 | Caso borde: cantidad cero visible |
| muestra los botones "+" y "−" | Ambos botones siempre presentes |

### interacciones (3 tests)
| Test | Qué verifica |
|---|---|
| llama a onIncrement al presionar "+" | Solo `onIncrement` se invoca, no `onDecrement` |
| llama a onDecrement al presionar "−" | Solo `onDecrement` se invoca, no `onIncrement` |
| llama a onIncrement varias veces al presionar "+" varias veces | 3 presses → 3 llamadas |

---

## 8. MenuItemCard.spec.tsx

**Archivo:** `apps/cliente/src/components/MenuItemCard.spec.tsx`  
**Tests:** 9 · Con RNTL · Mock con selector routing

`MenuItemCard` llama a `useCarritoStore` cuatro veces (cantidad, agregarItem, quitarItem, actualizarCantidad). Se usa `setupStore(cantidad)` que configura un estado mock y conecta el mock con `mockImplementation((selector) => selector(state))`.

### renderizado (4 tests)
| Test | Qué verifica |
|---|---|
| muestra el nombre del ítem | `getByText('Milanesa napolitana')` |
| muestra el precio formateado | `getByText('$1200.00')` |
| muestra "Agregar" cuando cantidad es 0 | Botón "Agregar" presente, "+" ausente |
| muestra CantidadControl cuando cantidad > 0 | "+" y "−" presentes, "Agregar" ausente |

### acción agregar (1 test)
| Test | Qué verifica |
|---|---|
| llama a agregarItem con el ítem al presionar "Agregar" | `mockAgregarItem` recibe el objeto ítem completo |

### acción incrementar (1 test)
| Test | Qué verifica |
|---|---|
| llama a actualizarCantidad con cantidad + 1 | Con cantidad=2, press "+" → `actualizarCantidad('1', 3)` |

### acción decrementar (2 tests)
| Test | Qué verifica |
|---|---|
| llama a actualizarCantidad con cantidad - 1 cuando cantidad > 1 | Con cantidad=3, press "−" → `actualizarCantidad('1', 2)` |
| llama a quitarItem cuando cantidad es 1 | Con cantidad=1, press "−" → `quitarItem('1')`, no `actualizarCantidad` |

---

## 9. CarritoItem.spec.tsx

**Archivo:** `apps/cliente/src/components/CarritoItem.spec.tsx`  
**Tests:** 5 · Con RNTL · Mock con selector routing

`CarritoItem` recibe `item: ItemCarrito` (con `cantidad` incluida en los props), por lo que el item se pasa directamente. El mock de store solo necesita proveer las acciones.

### renderizado (4 tests)
| Test | Qué verifica |
|---|---|
| muestra el nombre del ítem | `getByText('Empanada')` |
| muestra el precio unitario | `getByText('$500.00 c/u')` |
| muestra el subtotal calculado | Con cantidad=3: `getByText('Subtotal: $1500.00')` |
| muestra controles y botón "Eliminar" | "+", "−" y "Eliminar" presentes |

### acción incrementar (1 test)
| Test | Qué verifica |
|---|---|
| llama a actualizarCantidad con cantidad + 1 | Con cantidad=2, press "+" → `actualizarCantidad('1', 3)` |

### acción decrementar (2 tests)
| Test | Qué verifica |
|---|---|
| llama a actualizarCantidad con cantidad - 1 cuando cantidad > 1 | Con cantidad=4, press "−" → `actualizarCantidad('1', 3)` |
| llama a quitarItem cuando cantidad es 1 | Con cantidad=1, press "−" → `quitarItem('1')` |

### acción eliminar (1 test)
| Test | Qué verifica |
|---|---|
| llama a quitarItem al presionar "Eliminar" | `mockQuitarItem('1')` llamado exactamente 1 vez |

---

## 10. Resultado final

```
Test Suites: 4 passed, 4 total
Tests:       42 passed, 42 total
Snapshots:   0 total
Time:        ~27s
```

---

## 11. Cómo correr los tests

```bash
# Desde la raíz del monorepo
pnpm --filter @menyu/cliente test

# Modo watch (re-corre al guardar)
pnpm --filter @menyu/cliente test:watch

# Con cobertura
pnpm --filter @menyu/cliente test:cov
```

El reporte de cobertura queda en `apps/cliente/coverage/`.
