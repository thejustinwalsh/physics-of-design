import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  withToolkitResolver,
} = require('../scripts/metro-toolkit-resolver.cjs');
const repository = path.resolve('.');
const resolve = (origin, name, previous) => {
  const calls = [];
  const config = withToolkitResolver(
    { resolver: { resolveRequest: previous } },
    repository,
  );
  const context = {
    originModulePath: path.join(repository, origin),
    resolveRequest: (_context, request, platform) => {
      calls.push({ request, platform });
      return { filePath: request };
    },
  };
  return {
    result: config.resolver.resolveRequest(context, name, 'ios'),
    calls,
  };
};
test('Expo app-first lookup cannot substitute its schema major for toolkit source or emitted code', () => {
  for (const origin of ['src/motion.ts', 'dist/motion.js']) {
    const { result } = resolve(origin, 'zod');
    assert.equal(result.filePath, require.resolve('zod'));
    const zod = require(result.filePath);
    assert.equal(
      typeof zod.object({ spring: zod.number() }).superRefine(() => {}).shape
        .spring.parse,
      'function',
    );
  }
});
test('React and Expo-owned schema imports retain the app resolver and existing custom behavior', () => {
  const previous = (_context, name, platform) => ({
    filePath: `app:${platform}:${name}`,
  });
  assert.equal(
    resolve('src/browser-inspection.ts', 'react', previous).result.filePath,
    'app:ios:react',
  );
  assert.equal(
    resolve('examples/relay/app/src/Relay.jsx', 'zod', previous).result
      .filePath,
    'app:ios:zod',
  );
  assert.equal(
    resolve('src-lookalike/motion.ts', 'zod', previous).result.filePath,
    'app:ios:zod',
  );
});
test('NodeNext sibling source compatibility does not rewrite emitted or missing paths', () => {
  assert.equal(
    resolve('src/motion-dynamics.ts', './motion.js').result.filePath,
    './motion',
  );
  assert.equal(
    resolve('dist/motion-dynamics.js', './motion.js').result.filePath,
    './motion.js',
  );
  assert.equal(
    resolve('src/motion-dynamics.ts', './missing.js').result.filePath,
    './missing.js',
  );
});
