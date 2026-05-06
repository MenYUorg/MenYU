const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Force singleton packages to their canonical location so Metro doesn't
// load multiple copies from different pnpm virtual store entries.
// Using extraNodeModules (not a custom resolveRequest) so Metro can
// correctly handle React 19 subpath exports (react-dom/client, etc.)
// via the package.json "exports" field without fabricating .js paths.
config.resolver.extraNodeModules = {
  react: path.resolve(workspaceRoot, 'node_modules/react'),
  'react-dom': path.resolve(workspaceRoot, 'node_modules/react-dom'),
  'react-native': path.resolve(projectRoot, 'node_modules/react-native'),
}

// pretty-format@30 ships .mjs that Metro/Babel can't bundle — force the CJS build.
const prettyFormatCjs = path.resolve(
  workspaceRoot,
  'node_modules/.pnpm/pretty-format@30.3.0/node_modules/pretty-format/build/index.js',
)
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'pretty-format') {
    return { filePath: prettyFormatCjs, type: 'sourceFile' }
  }
  if (defaultResolveRequest) return defaultResolveRequest(context, moduleName, platform)
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
