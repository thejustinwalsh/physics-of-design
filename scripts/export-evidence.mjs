// Curated authored evidence only. Never copy runtimes, models or third-party images.
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  lstat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assertNativePrimary } from './native-primary.mjs';
import path from 'node:path';
import { nativeSourceIdentity } from './native-source-identity.mjs';

const files = new Set();
const coreOnly = process.argv.includes('--core-only');
const checkOnly = process.argv.includes('--check');
async function include(name) {
  const source = path.join('artifacts', name);
  const info = await lstat(source);
  if (info.isDirectory()) {
    for (const entry of (await readdir(source)).sort())
      await include(`${name}/${entry}`);
  } else if (info.isFile()) files.add(name);
  else throw new Error(`Unexpected non-file evidence: ${source}`);
}
if (!coreOnly) {
  for (const name of [
    'verification-full',
    'verification-final-full',
    'verification-pre-recovery',
    'fieldwork/proof-web-v3',
    'fieldwork/proof-native/iphone-v3',
    'fieldwork/proof-native/iphone-final',
    'fieldwork/proof-native/android-final',
    'fieldwork/native-session-final.log',
    'fieldwork/native-session-keyboard.log',
    'fieldwork/proof-native/ipad-v3',
    'fieldwork/proof-native/android-v5',
    'fieldwork/proof-native/ipad-accessibility-dark-v2',
    'fieldwork/flows-android',
    'fieldwork/flows-verified-final',
    'review/fieldwork-astra-closure',
    'review/fieldwork-astra-v1',
    'review/fieldwork-astra-v2',
    'review/color-equations',
    'review/selector-review-regressions.log',
    'review/astra-after/manifest.json',
    'review/astra-input/manifest.json',
    'review/astra/assessment-a.md',
    'review/astra/assessment-b.md',
    'review/astra/responsive-research.md',
    'review/astra/assessment-a-followup.md',
    'review/astra/assessment-b-followup.md',
    'review/astra/browser-measurements.json',
    'review/astra/frozen-hashes.json',
    'review/astra/after-browser-measurements.json',
    'review/astra/after-frozen-hashes.json',
    'review/astra/after-detector.json',
    'review/astra/measure-after.mjs',
    'verification',
    'verification-interrupted',
    'system/android-longword-failure.json',
    'system/android-longword-recovery.json',
    'evaluation-v2/analysis.json',
    'evaluation-v2/observations.json',
    'context/budget.json',
    'context/token-counts.json',
    'tuning/v1',
    'tuning/probe-tiny-v1/report.json',
    'tuning/probe-tiny-v1/predictions.json',
    'tuning/probe-balanced-v2/report.json',
    'tuning/probe-balanced-v2/predictions.json',
    'tuning/probe-balanced-v2/dataset.json',
    'tuning/probe-balanced-v2/train.jsonl',
    'tuning/probe-balanced-v2/held-out.jsonl',
    'selector/hero.json',
    'selector/editorial.json',
    'model-fit/4b-memory.log',
    'model-fit/tiny-memory.log',
    'model-fit/4b-output.jsonl',
    'model-fit/tiny-output.jsonl',
    'review/root-audit.json',
    'review/native-audit.json',
    'review/astra/artifact-regeneration-note.md',
    'review/inspiration/apple-visual-inspection.md',
    'review/inspiration/web-visual-inspection.md',
  ])
    await include(name);
  for (const platform of ['web', 'native-ios', 'native-android'])
    for (const name of ['summary.json', 'observations.jsonl'])
      await include(`system/${platform}/${name}`);
  for (const label of [
    'web',
    'ipad',
    'ipad-dynamic-type',
    'android-system-scale',
  ])
    await include(`responsive/${label}/summary.json`);
  for (const label of [
    'ipad-device',
    'ipad-dynamic-device',
    'android-system-device',
    'iphone-palette-device',
    'android-palette-device',
  ])
    await include(`responsive/${label}`);
}

// Current core evidence is an exact file allowlist. Never recurse through vela/:
// it also contains model inputs, failed runs, generated bundles and old captures.
async function includeCore() {
  const read = async (name) =>
    JSON.parse(await readFile(path.join('artifacts', name), 'utf8'));
  const require = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const machine = await read('vela/machine-proof.json');
  const identity = machine.handoffIdentity;
  const implementationIdentity = await nativeSourceIdentity();
  require(typeof identity === 'string' &&
    /^[a-f0-9]{64}$/.test(identity), 'Missing current machine identity');
  await include('vela/machine-proof.json');
  const web = await read('vela/proof-web/report.json');
  require(web.scenarios === 72 &&
    web.observations?.length === 72 &&
    web.failures?.length === 0 &&
    web.errors?.length === 0 &&
    web.observations.every(
      (row) => row.policyIdentity === identity,
    ), 'Current web proof is incomplete, failed, or belongs to a different machine');
  const screens = [
    'today',
    'detail',
    'active',
    'complete',
    'insights',
    'profile',
  ];
  await include('vela/proof-web/report.json');
  await include('vela/proof-web/matrix.json');
  for (const screen of screens)
    for (const width of [390, 834, 1440])
      for (const scale of [1, 2, 2.143, 3.6])
        await include(`vela/proof-web/${screen}-${width}-${scale}.png`);
  await include('vela/proof-web/menu-390-3.6.png');
  await include('vela/diagnostics/android-trailing-advance/detail.json');
  await include('vela/diagnostics/android-trailing-advance/detail.png');

  const labels = (
    process.env.EVIDENCE_VELA_NATIVE_LABELS ??
    'iphone-enlarged-current,iphone-default-current,ipad-default-current,android-default-current,android-enlarged-current'
  ).split(',');
  if (!process.env.EVIDENCE_VELA_NATIVE_LABELS) {
    try {
      await lstat('artifacts/vela/proof-native/iphone-maximum-current');
      labels.push('iphone-maximum-current');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  require(labels.length > 0 &&
    labels.length <= 8 &&
    new Set(labels).size === labels.length &&
    labels.every((label) =>
      /^(?:iphone|ipad|android)-[a-z0-9-]+$/.test(label),
    ), 'Native evidence labels must be distinct simple iPhone/iPad/Android directory names');
  for (const label of labels) {
    const base = `vela/proof-native/${label}`;
    const summary = await read(`${base}/summary.json`);
    require(summary.passed === true &&
      summary.results?.length === screens.length &&
      screens.every((screen) =>
        summary.results.some((result) => result.screen === screen),
      ), `Incomplete native summary: ${label}`);
    await include(`${base}/summary.json`);
    for (const screen of screens) {
      const proof = await read(`${base}/${screen}.json`);
      assertNativePrimary(proof.receipt);
      require(proof.receipt?.incomplete === false &&
        proof.receipt.snapshot?.designHandoffIdentity === identity &&
        proof.receipt.snapshot?.implementationIdentity ===
          implementationIdentity &&
        proof.receipt.snapshot?.screen === screen &&
        proof.receipt.snapshot?.viewportGuard?.status === 'current' &&
        proof.receipt.snapshot?.motionPhase === 'held' &&
        proof.receipt.snapshot?.resolvedAdmissible === true &&
        proof.textWidthFailures?.length === 0 &&
        proof.textWidthUnknown?.length === 0 &&
        (proof.audit?.failures?.length ?? 0) ===
          0, `Stale, incomplete or failed native receipt: ${label}/${screen}`);
      await include(`${base}/${screen}.json`);
      await include(`${base}/${screen}.png`);
    }
  }

  // An explicit successful run prevents accidental publication of diagnostic
  // failures or selection of an older run merely because it exists.
  const flowId = process.env.EVIDENCE_VELA_ANDROID_FLOW;
  require(typeof flowId === 'string' &&
    /^flows-[0-9]+$/.test(
      flowId,
    ), 'Set EVIDENCE_VELA_ANDROID_FLOW to the final successful flows-<timestamp> run');
  const base = `vela/flows-android/${flowId}`;
  require((await read(`${base}/summary.json`)).passed ===
    true, 'Android flow did not pass');
  await include(`${base}/summary.json`);
  for (const name of [
    'running',
    'paused',
    'complete',
    'insights',
    'reduced-preference',
    'reduced-page',
  ]) {
    const receipt = await read(`${base}/${name}.json`);
    require(receipt.incomplete === false &&
      receipt.snapshot?.designHandoffIdentity === identity &&
      receipt.snapshot?.implementationIdentity ===
        implementationIdentity, `Stale or incomplete Android flow receipt: ${name}`);
    await include(`${base}/${name}.json`);
    await include(`${base}/${name}.png`);
  }
  return {
    identity,
    implementationIdentity,
    nativeLabels: labels,
    androidFlow: flowId,
  };
}
const core = await includeCore();
if (checkOnly) {
  console.log(
    JSON.stringify(
      { mode: 'check-only', files: [...files].sort(), core },
      null,
      2,
    ),
  );
  process.exit(0);
}
const root = 'evidence';
const index = [];
for (const name of [...files].sort()) {
  const bytes = await readFile(path.join('artifacts', name));
  const destination = path.join(root, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join('artifacts', name), destination);
  index.push({
    path: name,
    source: `artifacts/${name}`,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
// Preserve accounting events without publishing full coding-agent transcripts.
const usage = [];
if (!coreOnly) {
  for (const project of [
    'field-notes',
    'library-after-hours',
    'night-workshop',
    'river-observatory',
  ]) {
    for (const condition of [
      'guidance-only',
      'tools-smooth',
      'tools-musical',
    ]) {
      const base = `evaluation-v2/${project}/${condition}`;
      const raw = await readFile(
        `artifacts/${base}/agent.events.jsonl`,
        'utf8',
      );
      usage.push({
        project,
        condition,
        sourceSha256: createHash('sha256').update(raw).digest('hex'),
        events: raw
          .trim()
          .split('\n')
          .map(JSON.parse)
          .filter((event) => event.type === 'turn.completed'),
      });
      for (const name of ['prompt.txt', 'state.json', 'measurements.json']) {
        const bytes = await readFile(`artifacts/${base}/${name}`);
        const target = `${base}/${name}`;
        await mkdir(path.dirname(`${root}/${target}`), { recursive: true });
        await writeFile(`${root}/${target}`, bytes);
        index.push({
          path: target,
          source: `artifacts/${target}`,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        });
      }
    }
  }
  await writeFile(
    `${root}/evaluation-v2/usage-events.json`,
    JSON.stringify(usage, null, 2) + '\n',
  );
}
await writeFile(
  `${root}/${coreOnly ? 'index-core.json' : 'index.json'}`,
  JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      core,
      files: index.sort((a, b) => a.path.localeCompare(b.path)),
      derived: coreOnly ? [] : ['evaluation-v2/usage-events.json'],
      limits: [
        'Machine-specific paths and runtime receipts are historical evidence, not portable runtime dependencies.',
        'Model readouts and Astra labels are not human aesthetic validation.',
        'External award images, model weights, runtime caches and full agent transcripts are excluded.',
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Exported ${index.length} evidence files${coreOnly ? '' : ' plus derived usage events'}.`,
);
