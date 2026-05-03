// Shim para resolver el conflicto de versiones de pretty-format en pnpm monorepo.
// El cliente HMR de Expo espera que require('pretty-format').default sea la función format.
const prettyFormat = require('pretty-format/build/index');
const format = prettyFormat.format ?? prettyFormat.default ?? prettyFormat;
module.exports = prettyFormat;
module.exports.default = typeof format === 'function' ? format : prettyFormat;
