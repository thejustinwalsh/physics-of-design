import { spawn } from 'node:child_process';
import { mkdir, writeFile, open } from 'node:fs/promises';
const all = process.argv.includes('--all');
await mkdir('artifacts/verification', { recursive: true });
const results = [];
const steps = [
  ['build', ['npm', 'run', 'build']],
  ['types', ['npm', 'run', 'typecheck']],
  ['native-types', ['npm', 'run', 'typecheck', '--prefix', 'native']],
  ['unit', ['npm', 'test']],
  ['browser', ['npx', 'tsx', '--test', 'test/browser.integration.ts']],
  [
    'commands-and-app',
    [
      'npx',
      'tsx',
      '--test',
      'test/commands.integration.ts',
      'test/app.integration.ts',
      'test/context.integration.ts',
    ],
  ],
  ['consumer', ['node', 'scripts/consumer-check.mjs']],
  ['fieldwork-build', ['node', 'scripts/build-fieldwork.mjs']],
  ['fieldwork-web', ['node', 'scripts/prove-fieldwork-web.mjs']],
  ['vela-policy', ['npx', 'tsx', 'scripts/vela-design.ts']],
  ['vela-build', ['node', 'scripts/build-vela.mjs']],
  ['vela-web', ['node', 'scripts/prove-vela-web.mjs']],
];
if (all) {
  if (!process.env.DESIGN_NATIVE_TOKEN)
    throw new Error(
      'verify --all requires ready native harnesses and DESIGN_NATIVE_TOKEN; run npm run native:start first',
    );
  steps.push(
    ['native-ios', ['npx', 'tsx', '--test', 'test/native.integration.ts']],
    [
      'native-android',
      ['npx', 'tsx', '--test', 'test/native.integration.ts'],
      { DESIGN_NATIVE_PLATFORM: 'native-android' },
    ],
    [
      'selector',
      ['node', 'scripts/selector-smoke.mjs'],
      {
        DESIGN_SEMIF_BIN:
          process.env.DESIGN_SEMIF_BIN ?? './scripts/semif-local.sh',
      },
    ],
  );
  for (const platform of ['web', 'native-ios', 'native-android'])
    steps.push([
      `matrix-${platform}`,
      ['node', 'scripts/system-matrix.mjs', platform],
    ]);
}
for (const [name, [command, ...args], overrides] of steps) {
  const log = await open(`artifacts/verification/${name}.log`, 'w'),
    start = Date.now();
  const child = spawn(command, args, {
    env: { ...process.env, ...overrides },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (c) => {
    process.stdout.write(c);
    void log.write(c);
  });
  child.stderr.on('data', (c) => {
    process.stderr.write(c);
    void log.write(c);
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  await log.close();
  results.push({
    name,
    command: [command, ...args],
    code,
    latencyMs: Date.now() - start,
  });
  await writeFile(
    'artifacts/verification/summary.json',
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        complete: results.length === steps.length,
        expectedStages: steps.length,
        results,
        passed:
          results.length === steps.length && results.every((r) => r.code === 0),
      },
      null,
      2,
    ) + '\n',
  );
  if (name === 'build' && code !== 0) break;
}
if (results.some((r) => r.code !== 0)) process.exitCode = 1;
