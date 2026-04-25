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

// Fuerza una sola instancia de React en todo el bundle
config.resolver.extraNodeModules = {
  react: path.resolve(workspaceRoot, 'node_modules/react'),
  'react-dom': path.resolve(workspaceRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
}

module.exports = config
