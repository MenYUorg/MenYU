const path = require('path')

module.exports = {
  preset: 'jest-expo',
  rootDir: '../..',
  testMatch: ['<rootDir>/apps/cliente/src/**/*.spec.{ts,tsx}'],
  // Explicit configFile so Babel finds babel-preset-expo even for files deep in node_modules
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
    // expo/src/winter installs lazy globals that trigger require() outside jest 30's test scope
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
