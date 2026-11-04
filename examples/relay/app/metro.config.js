const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');
const config = getDefaultConfig(__dirname);
const repository = path.resolve(__dirname, '../../..');
config.watchFolders = [repository];
config.resolver.nodeModulesPaths = [
  path.join(__dirname, 'node_modules'),
  path.join(repository, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;
const escapedRepository = repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [
  new RegExp(`${escapedRepository}/(?:artifacts|native|codemods|\\.git)/`),
];
module.exports = config;
