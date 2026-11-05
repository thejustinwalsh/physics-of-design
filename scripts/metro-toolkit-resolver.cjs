const path = require('node:path');
const fs = require('node:fs');

/** Keep toolkit schema semantics while an Expo app owns the React singleton.
 * Expo may install Zod 3. The toolkit declares Zod 4, whose refined object
 * schemas retain .shape. App-first nodeModulesPaths must not substitute 3.
 * Apply only to toolkit source/dist imports; leave Expo's own dependencies alone.
 */
function withToolkitResolver(config, repository) {
  const root = path.resolve(repository);
  const sourceRoot = path.join(root, 'src') + path.sep;
  const distRoot = path.join(root, 'dist') + path.sep;
  const zod = require.resolve('zod', { paths: [root] });
  const previous = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, name, platform) => {
    const origin = context.originModulePath;
    const source = origin.startsWith(sourceRoot);
    if ((source || origin.startsWith(distRoot)) && name === 'zod')
      return context.resolveRequest(context, zod, platform);
    // NodeNext source imports name emitted .js files. Native source consumers
    // resolve the existing sibling .ts; emitted dist imports stay unchanged.
    if (source && name.startsWith('.') && name.endsWith('.js')) {
      const target = path.resolve(
        path.dirname(origin),
        name.slice(0, -3) + '.ts',
      );
      if (fs.existsSync(target))
        return context.resolveRequest(context, name.slice(0, -3), platform);
    }
    return previous
      ? previous(context, name, platform)
      : context.resolveRequest(context, name, platform);
  };
  return config;
}
module.exports = { withToolkitResolver };
