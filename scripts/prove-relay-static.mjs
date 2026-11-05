import assert from 'node:assert/strict';
import {
  mkdir,
  open,
  readFile,
  writeFile,
  readdir,
  copyFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from './verification-sources.mjs';

export async function proveRelayStatic() {
  const repository = process.cwd(),
    app = path.join(repository, 'examples/relay/app'),
    output = path.join(repository, 'artifacts/relay-integration');
  await mkdir(output, { recursive: true });
  const before = snapshotVerificationSources(repository);
  const sourceIdentity = verificationSourceFields(
    before,
    before,
  ).sourceIdentity;
  const steps = [];
  const run = async (name, command, args) => {
    const log = path.join(output, `${name}.log`),
      fd = await open(log, 'w');
    let code;
    try {
      code = await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: app,
          env: {
            ...process.env,
            CI: '1',
            EXPO_NO_TELEMETRY: '1',
            EXPO_PUBLIC_DESIGN_SOURCE_HASH: sourceIdentity,
            __UNSAFE_EXPO_HOME_DIRECTORY: path.join(output, 'expo-home'),
            DOTSLASH_CACHE: path.join(output, 'dotslash'),
          },
          stdio: ['ignore', fd.fd, fd.fd],
        });
        child.once('error', reject);
        child.once('close', resolve);
      });
    } finally {
      await fd.close();
    }
    steps.push({ name, code, log: path.relative(repository, log) });
    assert.equal(code, 0, `Relay ${name} failed; see ${log}`);
  };
  const bundles = [];
  let failure = null;
  try {
    await run('tests', 'npm', ['test']);
    await run('types', 'npm', ['run', 'typecheck']);
    await run('export', process.execPath, [
      'node_modules/expo/bin/cli',
      'export',
      '--platform',
      'all',
      '--output-dir',
      path.join(output, 'static'),
    ]);
    const metadata = JSON.parse(
      await readFile(path.join(output, 'static/metadata.json'), 'utf8'),
    );
    for (const platform of ['ios', 'android']) {
      const file = metadata.fileMetadata?.[platform]?.bundle;
      assert.equal(typeof file, 'string', `No ${platform} export`);
      const bytes = await readFile(path.join(output, 'static', file));
      assert.ok(bytes.length > 0);
      bundles.push({
        platform,
        file,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    const web = await readdir(path.join(output, 'static/_expo/static/js/web'));
    assert.ok(
      web.some((file) => file.endsWith('.js')),
      'No web JavaScript export',
    );
    const entries = web.filter(
      (file) => file.startsWith('index-') && file.endsWith('.js'),
    );
    assert.equal(entries.length, 1, 'Expected one current Expo web entry');
    const webFile = path.join('_expo/static/js/web', entries[0]);
    const webBytes = await readFile(path.join(output, 'static', webFile));
    bundles.push({
      platform: 'web',
      file: webFile,
      bytes: webBytes.length,
      sha256: createHash('sha256').update(webBytes).digest('hex'),
    });
    await run('metro-runtime', process.execPath, [
      path.join(repository, 'scripts/check-metro-runtime.mjs'),
      path.join(output, 'static', webFile),
      path.join(output, 'metro-runtime-receipt.json'),
    ]);
    await readFile(path.join(output, 'static/index.html'));
    await mkdir(path.join(output, 'static/licenses'), { recursive: true });
    await copyFile(
      path.join(repository, 'assets/fonts/robotoflex-OFL.txt'),
      path.join(output, 'static/licenses/RobotoFlex-OFL.txt'),
    );
    await copyFile(
      path.join(repository, 'experiments/relay/shared/assets/LICENSE.txt'),
      path.join(output, 'static/licenses/Relay-diagrams-LICENSE.txt'),
    );
  } catch (error) {
    failure = String(error);
  }
  const after = snapshotVerificationSources(repository),
    sources = verificationSourceFields(before, after);
  const receipt = {
    version: 1,
    recordedAt: new Date().toISOString(),
    scope:
      'Isolated Relay integration: model/markup/policy tests, TypeScript, actual Expo web/iOS/Android exports and execution of emitted web toolkit factories in Node vm. No app bootstrap, browser/native rendering, geometry, native-driver, accessibility, selector, preference or hardware performance verification.',
    passed: !failure && sources.sourceStable,
    steps,
    bundles,
    failure,
    ...sources,
  };
  await writeFile(
    path.join(output, 'static-receipt.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      relayStatic: receipt.passed,
      steps: steps.map((step) => ({ name: step.name, code: step.code })),
      sourceStable: sources.sourceStable,
      failure,
    }),
  );
  assert.equal(receipt.passed, true, 'Relay static consumer proof failed');
  return receipt;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await proveRelayStatic();
