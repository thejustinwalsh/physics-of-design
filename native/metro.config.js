const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const {
  withToolkitResolver,
} = require('../scripts/metro-toolkit-resolver.cjs');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '..')];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../node_modules'),
];
module.exports = withToolkitResolver(config, path.resolve(__dirname, '..'));
