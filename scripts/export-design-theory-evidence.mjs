// Exact authored evidence allowlist. Never recurse into models, bundles or asset caches.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { nativeSourceIdentity } from './native-source-identity.mjs';
import { hash } from '../dist/identity.js';

const directory = 'evidence/design-theory-2026-10-25';
const stages = [
  'build',
  'types',
  'native-types',
  'unit',
  'browser',
  'commands-and-app',
  'consumer',
  'fieldwork-build',
  'fieldwork-web',
  'vela-policy',
  'vela-build',
  'vela-web',
  'workflow-mathematical',
  'vela-motion',
  'gallery-build',
  'gallery-web',
  'validation-phases',
  'typography',
  'migrations',
];
const read = async (p) => JSON.parse(await readFile(p, 'utf8'));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const verification = await read(
  'artifacts/verification-design-theory/summary.json',
);
assert.equal(verification.verificationVersion, 2);
assert.equal(verification.scope, 'headless');
assert.equal(verification.complete, true);
assert.equal(verification.passed, true);
assert.deepEqual(
  verification.results.map((r) => r.name),
  stages,
);
assert.ok(verification.results.every((r) => r.code === 0));
const gallery = await read('artifacts/design-theory/proof/report.json');
assert.deepEqual(gallery.failures, []);
assert.ok(gallery.observations.length >= 10);
for (const [file, expected] of Object.entries(gallery.implementation))
  assert.equal(
    digest(await readFile(file)),
    expected,
    `Stale gallery proof: ${file}`,
  );
const review = await read(
  'artifacts/design-theory/astra-review/postfix-verified/report.json',
);
assert.deepEqual(review.failures, []);
assert.deepEqual(review.errors, []);
for (const [file, expected] of Object.entries(review.hashes))
  assert.equal(
    digest(await readFile(file)),
    expected,
    `Stale independent gallery review: ${file}`,
  );
const motion = await read('artifacts/vela/proof-motion/report.json');
assert.deepEqual(motion.errors, []);
for (const [file, expected] of Object.entries(motion.implementationProvenance))
  assert.equal(
    digest(await readFile(file)),
    expected,
    `Stale Vela motion proof: ${file}`,
  );
const workflow = await read('artifacts/workflow/proof.json');
assert.equal(workflow.realNeuralReadouts, true);
assert.equal(workflow.statistics.neuralCalls, 2);
assert.equal(workflow.statistics.testSelectorCalls, 0);
assert.equal(workflow.statistics.completedReadoutPasses, 2);
assert.equal(workflow.replay.selectorCalls, 0);
const validation = await read('artifacts/validation/report.json');
assert.equal(validation.complete, true);
assert.equal(validation.receipts.length, 6);
for (const [file, expected] of Object.entries(validation.sources))
  assert.equal(
    hash(await readFile(file, 'utf8')),
    expected,
    `Stale validation proof: ${file}`,
  );
const typography = await read('artifacts/typography/summary.json');
assert.equal(typography.checks.length, 26);
assert.ok(typography.checks.every((c) => c.passed === true));
assert.deepEqual(
  typography.runtimes.map((r) => r.engine),
  ['chromium', 'webkit'],
);
for (const source of typography.sources)
  assert.equal(
    digest(await readFile(source.path)),
    source.sha256,
    `Stale typography proof: ${source.path}`,
  );
const nativeIdentity = await nativeSourceIdentity();
assert.equal(
  nativeIdentity,
  '54a5fd6cf374ea679a96425a20c4a6b730a12bd5085a0e5e867a081976fc619c',
  'Native source changed; earlier native proof cannot be reused',
);
const files = [
  'artifacts/verification-design-theory/summary.json',
  'artifacts/verification-design-theory-attempt-1/summary.json',
  'artifacts/verification-design-theory-attempt-1/gallery-web.log',
  ...stages.map((s) => `artifacts/verification-design-theory/${s}.log`),
  'artifacts/design-theory/proof/report.json',
  'artifacts/design-theory/public/report.json',
  'artifacts/vela/proof-motion/report.json',
  'artifacts/vela/proof-web/report.json',
  'artifacts/workflow/proof.json',
  'artifacts/workflow/attempt-1-metal-unavailable.json',
  'artifacts/workflow-mathematical/proof.json',
  'artifacts/validation/plan.json',
  'artifacts/validation/check.json',
  'artifacts/validation/report.json',
  ...['phone', 'ipad-large-text', 'desktop'].flatMap((s) =>
    ['geometry', 'contrast'].map((k) => `artifacts/validation/${s}-${k}.json`),
  ),
  'artifacts/context/budget.json',
  'artifacts/review/extension-integration-probes.json',
  'artifacts/typography/summary.json',
  'artifacts/typography/proof.json',
  'artifacts/typography/chromium.json',
  'artifacts/typography/webkit.json',
  'artifacts/design-theory/astra-review/postfix-verified/report.json',
  ...[
    'report.json',
    'interactions.json',
    'hero-return.mjs',
    'hero-return.json',
    'hero-initial-320.png',
    'hero-return-320.png',
    'hero-initial-834.png',
    'edited-motion.png',
    'phone-layout-design.png',
    'phone-layout-inspect.png',
    'postfix-final/report.json',
    'postfix-final/phone-design.png',
    'postfix-verified/initial-320.png',
    'postfix-verified/initial-834.png',
    'postfix-verified/edited-materials.png',
  ].map((p) => `artifacts/design-theory/astra-review/${p}`),
  ...['chromium', 'webkit'].flatMap((e) =>
    [320, 390, 834, 1440].map(
      (w) => `artifacts/design-theory/proof/${e}-${w}-viewport.png`,
    ),
  ),
];
const manifest = [];
for (const file of files) {
  const bytes = await readFile(file);
  const relative = file.replace(/^artifacts\//, '');
  const dest = path.join(directory, relative);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(file, dest);
  manifest.push({ file: relative, sha256: digest(bytes), bytes: bytes.length });
}
await mkdir(directory, { recursive: true });
await writeFile(
  `${directory}/manifest.json`,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      verificationVersion: 2,
      scope:
        'Current headless tooling/browser extension, plus actual two-stage local selector protocol proof. Existing native app source matches its earlier receipt; no new native tilt/PBR or physical Safari certification.',
      nativeImplementationIdentity: nativeIdentity,
      files: manifest,
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  `${directory}/README.md`,
  '# Design Theory extension evidence\n\nNineteen ordered local headless verification stages, current browser/gallery/motion receipts, a real two-readout local selector and zero-readout replay, and six actual geometry/palette calls feeding validation phase guards. The manifest binds every copied file by SHA256.\n\nThe native implementation identity matches the previous milestone; native hardware tests were not rerun for these browser adapters. Playwright WebKit is not physical Safari. Synthetic review and authored profile bands do not prove human aesthetic preference, material harmony, lower token cost or neural throughput. Original procedural gallery captures are project-created. Model weights, runtime bundles, third-party images, local selectors and caches are excluded.\n',
);
console.log(
  JSON.stringify({
    directory,
    files: manifest.length,
    nativeImplementationIdentity: nativeIdentity,
  }),
);
