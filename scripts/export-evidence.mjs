// Curated authored evidence only. Never copy runtimes, models or third-party images.
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const files = new Set();
async function include(name) {
  const source = path.join('artifacts', name);
  const info = await stat(source);
  if (info.isDirectory()) {
    for (const entry of (await readdir(source)).sort())
      await include(`${name}/${entry}`);
  } else if (info.isFile()) files.add(name);
  else throw new Error(`Unexpected non-file evidence: ${source}`);
}
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
for (const project of [
  'field-notes',
  'library-after-hours',
  'night-workshop',
  'river-observatory',
]) {
  for (const condition of ['guidance-only', 'tools-smooth', 'tools-musical']) {
    const base = `evaluation-v2/${project}/${condition}`;
    const raw = await readFile(`artifacts/${base}/agent.events.jsonl`, 'utf8');
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
await writeFile(
  `${root}/index.json`,
  JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      files: index.sort((a, b) => a.path.localeCompare(b.path)),
      derived: ['evaluation-v2/usage-events.json'],
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
  `Exported ${index.length} evidence files plus derived usage events.`,
);
