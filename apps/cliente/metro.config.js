const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Observa todo el monorepo para que los paquetes locales (ej: @menyu/types) se recarguen
config.watchFolders = [workspaceRoot]

// Resuelve node_modules primero desde el proyecto, después desde la raíz del workspace
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Raíces de paquetes singleton que deben tener una sola instancia en todo el bundle
const reactRoot = path.resolve(workspaceRoot, 'node_modules/react')
const reactDomRoot = path.resolve(workspaceRoot, 'node_modules/react-dom')
const reactNativeRoot = path.resolve(projectRoot, 'node_modules/react-native')
const prettyFormatCjs = path.resolve(
  workspaceRoot,
  'node_modules/.pnpm/pretty-format@30.3.0/node_modules/pretty-format/build/index.js',
)

const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Fuerza una sola copia de react / react-dom / react-native para evitar el error
  // "A React Element from an older version of React was rendered"
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    const sub = moduleName === 'react' ? 'index.js' : moduleName.slice('react/'.length) + '.js'
    return { filePath: path.resolve(reactRoot, sub), type: 'sourceFile' }
  }
  if (moduleName === 'react-dom' || moduleName.startsWith('react-dom/')) {
    const sub = moduleName === 'react-dom' ? 'index.js' : moduleName.slice('react-dom/'.length) + '.js'
    return { filePath: path.resolve(reactDomRoot, sub), type: 'sourceFile' }
  }
  if (moduleName === 'react-native') {
    return { filePath: path.resolve(reactNativeRoot, 'index.js'), type: 'sourceFile' }
  }
  // pretty-format@30 .mjs se compila mal en Metro/Babel; forzamos el build CJS
  if (moduleName === 'pretty-format') {
    return { filePath: prettyFormatCjs, type: 'sourceFile' }
  }
  if (defaultResolveRequest) return defaultResolveRequest(context, moduleName, platform)
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
