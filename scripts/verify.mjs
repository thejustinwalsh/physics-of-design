import { spawn } from 'node:child_process';
import { mkdir, writeFile, open } from 'node:fs/promises';
import {
  snapshotVerificationSources,
  verificationSourceFields,
} from './verification-sources.mjs';
const all = process.argv.includes('--all');
const directory =
  process.env.DESIGN_VERIFICATION_DIRECTORY ?? 'artifacts/verification';
await mkdir(directory, { recursive: true });
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
      'test/selector-transport.integration.ts',
      'test/typography-editor.integration.ts',
      'scripts/evidence-policy.test.mjs',
    ],
  ],
  ['consumer', ['node', 'scripts/consumer-check.mjs']],
  ['fieldwork-build', ['node', 'scripts/build-fieldwork.mjs']],
  ['fieldwork-web', ['node', 'scripts/prove-fieldwork-web.mjs']],
  ['vela-policy', ['npx', 'tsx', 'scripts/vela-design.ts']],
  ['vela-build', ['node', 'scripts/build-vela.mjs']],
  ['vela-web', ['node', 'scripts/prove-vela-web.mjs']],
  [
    'workflow-mathematical',
    ['node', 'scripts/prove-decision-workflow.mjs'],
    { DESIGN_WORKFLOW_OUTPUT: 'artifacts/workflow-mathematical' },
  ],
  ['vela-motion', ['node', 'scripts/prove-vela-motion.mjs']],
  ['gallery-build', ['node', 'scripts/build-design-theory.mjs']],
  ['gallery-web', ['node', 'scripts/prove-design-theory.mjs']],
  ['dom-surfaces', ['node', 'scripts/prove-dom-surfaces.mjs']],
  ['dom-surface-gpu', ['node', 'scripts/prove-dom-surface-gpu.mjs']],
  [
    'design-field',
    ['node', 'scripts/prove-design-field.mjs'],
    { DESIGN_FIELD_OUTPUT: 'artifacts/design-field-mathematical' },
  ],
  ['choice-effectiveness', ['node', 'scripts/prove-choice-effectiveness.mjs']],
  ['relational-kernels', ['node', 'examples/kernels/relay-proof.mjs']],
  ['expo-web', ['node', 'scripts/prove-expo-design-theory.mjs', '--web-only']],
  ['gallery-materials', ['node', 'scripts/prove-gallery-materials.mjs']],
  [
    'gallery-interactions',
    ['node', 'scripts/prove-gallery-interactions.mjs'],
    {
      GALLERY_CAPTURE: '0',
      GALLERY_INTERACTION_DIR:
        'artifacts/design-theory/interactions-verification',
    },
  ],
  [
    'gallery-interactions-webkit',
    ['node', 'scripts/prove-gallery-interactions.mjs'],
    {
      GALLERY_CAPTURE: '0',
      GALLERY_ENGINE: 'webkit',
      GALLERY_INTERACTION_DIR:
        'artifacts/design-theory/interactions-verification-webkit',
    },
  ],
  ['validation-phases', ['node', 'scripts/prove-validation-machine.mjs']],
  ['typography', ['node', 'scripts/prove-typography.mjs']],
  ['migrations', ['node', 'codemods/2026-10-25-nullable-glyph-ink/test.mjs']],
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
const sources = snapshotVerificationSources();
let sourceEvidence = verificationSourceFields(sources);
const saveSummary = () =>
  writeFile(
    `${directory}/summary.json`,
    JSON.stringify(
      {
        verificationVersion: 4,
        scope: all ? 'full' : 'headless',
        completedAt: new Date().toISOString(),
        complete: results.length === steps.length,
        expectedStages: steps.length,
        results,
        ...sourceEvidence,
        passed:
          results.length === steps.length &&
          results.every((r) => r.code === 0) &&
          sourceEvidence.sourceStable === true,
      },
      null,
      2,
    ) + '\n',
  );
await saveSummary();
try {
  for (const [name, [command, ...args], overrides] of steps) {
    const log = await open(`${directory}/${name}.log`, 'w'),
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
    await saveSummary();
    if (name === 'build' && code !== 0) break;
  }
} finally {
  try {
    sourceEvidence = verificationSourceFields(
      sources,
      snapshotVerificationSources(),
    );
  } catch (error) {
    sourceEvidence = verificationSourceFields(sources, null, String(error));
  }
  await saveSummary();
}
if (results.some((r) => r.code !== 0) || sourceEvidence.sourceStable !== true)
  process.exitCode = 1;
