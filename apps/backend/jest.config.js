const path = require('path')

module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  coverageDirectory: '../coverage',
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.module.ts',
    '!**/main.ts',
    '!**/*.spec.ts',
    '!**/*.e2e-spec.ts',
    '!**/*.d.ts',
    '!**/*.dto.ts',
  ],
  coverageReporters: [
    'text',
    'json-summary',
    ['lcov', { projectRoot: path.resolve(__dirname, '../..') }],
  ],
}
