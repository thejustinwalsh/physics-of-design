const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../node_modules'),
];
const fs = require('fs');
const sharedRoot = path.resolve(__dirname, '../src') + path.sep;
config.resolver.resolveRequest = (context, name, platform) => {
  if (
    context.originModulePath.startsWith(sharedRoot) &&
    name.startsWith('.') &&
    name.endsWith('.js')
  ) {
    const ts = path.resolve(
      path.dirname(context.originModulePath),
      name.slice(0, -3) + '.ts',
    );
    if (fs.existsSync(ts))
      return context.resolveRequest(context, name.slice(0, -3), platform);
  }
  return context.resolveRequest(context, name, platform);
};
module.exports = config;
