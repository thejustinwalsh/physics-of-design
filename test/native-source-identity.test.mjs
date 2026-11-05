import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { nativeSourceFiles } from '../scripts/native-source-identity.mjs';

test('native identity binds consumed client bytes and package resolution, including stale dist', () => {
  const root = mkdtempSync(join(tmpdir(), 'design-native-identity-'));
  const module = new URL(
    '../scripts/native-source-identity.mjs',
    import.meta.url,
  ).href;
  try {
    // Synthetic file bytes exercise provenance only, without native/font/render work.
    for (const file of nativeSourceFiles) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), `synthetic:${file}`);
    }
    const identity = () =>
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import {nativeSourceIdentity} from ${JSON.stringify(module)};console.log(await nativeSourceIdentity());`,
        ],
        { cwd: root, encoding: 'utf8' },
      ).trim();
    const baseline = identity();
    assert.match(baseline, /^[a-f0-9]{64}$/);
    for (const file of [
      'dist/layout-runtime.js',
      'dist/motion.js',
      'native/package-lock.json',
      'scripts/metro-toolkit-resolver.cjs',
      'package.json',
    ]) {
      assert(nativeSourceFiles.includes(file), file);
      writeFileSync(join(root, file), `changed:${file}`);
      assert.notEqual(identity(), baseline, file);
      writeFileSync(join(root, file), `synthetic:${file}`);
      assert.equal(identity(), baseline, file);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
