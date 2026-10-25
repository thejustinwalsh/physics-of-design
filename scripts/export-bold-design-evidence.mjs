// Authored allowlist only. No directory walk can publish caches, prompts or credentials.
import assert from 'node:assert/strict';
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  rm,
  lstat,
  realpath,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertFullVerification,
  currentFullVerificationStages,
} from './evidence-policy.mjs';
import {
  assertVerificationSourceSnapshot,
  snapshotVerificationSources,
} from './verification-sources.mjs';
import { nativeSourceIdentity } from './native-source-identity.mjs';
import {
  validateExpoProof,
  validateTemplateProof,
} from '../experiments/expo-design-theory/scripts/proof-contract.mjs';
import { hash } from '../dist/identity.js';

const destination = 'evidence/bold-design-2026-10-25-v4';
const lane = 'artifacts/verification-design-theory-final';
const fieldDirectory = 'artifacts/design-field-streaming-selector';
const expoDirectory = 'artifacts/expo-design-theory';
const templateDirectory = 'artifacts/expo-template-smoke';
const selectorRows = [
  '1971c2672b7a0778641b80723ddaa6fa485db123c02b386f1e148b9d3ac28648',
  '252bb65206eef632e3ffc7d99ce43c1bd932d1fe157dbb5a167dba76d6245653',
];
const fieldIdentity =
  'f759714bdab90462e5d176bdfbd4231c26b6619eb22f7bd0ed9d6ee3208d274f';
const engines = ['chromium', 'webkit'];
const platforms = ['web', 'native-ios', 'native-android'];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Expansions below use authored finite names, never names supplied by a receipt.
export const currentEvidenceFiles = Object.freeze([
  `${lane}/summary.json`,
  ...currentFullVerificationStages.map((stage) => `${lane}/${stage}.log`),
  'artifacts/design-theory/proof/report.json',
  ...['interactions-verification', 'interactions-verification-webkit'].map(
    (d) => `artifacts/design-theory/${d}/report.json`,
  ),
  'artifacts/design-theory/material-integration/report.json',
  ...engines.flatMap((e) =>
    [320, 390, 834, 1440].map(
      (w) => `artifacts/design-theory/proof/${e}-${w}-viewport.png`,
    ),
  ),
  ...engines.flatMap((e) =>
    [390, 834, 1440].map(
      (w) => `artifacts/design-theory/material-integration/${e}-${w}-hero.png`,
    ),
  ),
  ...engines.map(
    (e) => `artifacts/design-theory/material-integration/${e}-fallback.png`,
  ),
  'artifacts/dom-surfaces/summary.json',
  'artifacts/dom-surfaces/proof.json',
  ...['summary', 'proof', 'context', 'execution-trail'].map(
    (n) => `artifacts/dom-surfaces-gpu/${n}.json`,
  ),
  ...engines.map((e) => `artifacts/dom-surfaces-gpu/${e}-refined.png`),
  ...[
    'first',
    'measurements',
    'gallery-session',
    'implementation-freeze',
    'validation',
    'replay',
    'partial-replay',
  ].map((n) => `${fieldDirectory}/${n}.json`),
  ...selectorRows.flatMap((id) =>
    ['output.jsonl', 'process.json', 'stdout.txt', 'stderr.txt'].map(
      (suffix) => `${fieldDirectory}/selector/${id}.${suffix}`,
    ),
  ),
  'artifacts/design-field-mathematical/gallery-session.json',
  ...[
    'report',
    'runs',
    'sensitivity',
    'validations',
    'current-measurements',
  ].map((n) => `artifacts/choice-effectiveness/${n}.json`),
  ...[
    'receipt',
    'input',
    'text-observations',
    'font-numerals',
    'compilation',
    'workflow',
    'resolved',
    'replay',
    'bindings',
  ].map((n) => `artifacts/relational-kernels/${n}.json`),
  'artifacts/context/budget.json',
  'artifacts/context/tools-compact.json',
  'artifacts/context/tools-full.json',
  ...['summary', 'proof', 'chromium', 'webkit'].map(
    (n) => `artifacts/typography/${n}.json`,
  ),
  'artifacts/validation/report.json',
  ...platforms.flatMap((p) =>
    [
      'summary.json',
      'observations.jsonl',
      'editorial-smooth.json',
      'editorial-musical.json',
      'hero-smooth.json',
      'hero-musical.json',
    ].map((n) => `artifacts/system/${p}/${n}`),
  ),
  ...[
    'proof',
    'native-proof',
    'native-ios-proof',
    'native-android-proof',
    'output-bindings',
    'context',
  ].map((n) => `${expoDirectory}/${n}.json`),
  `${expoDirectory}/round2/proof.json`,
  ...engines.flatMap((e) =>
    [390, 820, 1440].flatMap((w) =>
      ['1', '2', 'detail'].map(
        (s) => `${expoDirectory}/round2/${e}-${w}-${s}.png`,
      ),
    ),
  ),
  ...['ios', 'android'].flatMap((p) =>
    ['normal', 'enlarged', 'detail', 'reviewed-long-text'].map(
      (n) => `${expoDirectory}/native-round2/${p}-${n}.png`,
    ),
  ),
  ...Array.from(
    { length: 8 },
    (_, i) => `${expoDirectory}/native-round2/android-${i}-accessibility.xml`,
  ),
  `${templateDirectory}/proof.json`,
  ...engines.flatMap((e) =>
    [390, 820, 1440].map((w) => `${templateDirectory}/${e}-${w}.png`),
  ),
  ...['native-ios.png', 'native-android.png', 'android-accessibility.xml'].map(
    (n) => `${templateDirectory}/${n}`,
  ),
]);

export function assertCurrentVerification(summary, currentSources) {
  assert.equal(
    summary.verificationVersion,
    4,
    'Current export requires verification v4',
  );
  assert.equal(
    summary.scope,
    'full',
    'Headless evidence cannot satisfy the current full checkpoint',
  );
  assert.equal(currentFullVerificationStages.length, 34);
  assertFullVerification(summary);
  assertVerificationSourceSnapshot(summary);
  assert.deepEqual(
    currentSources,
    summary.sources,
    'Current source set/bytes/modes differ from the ordered verification lane',
  );
}
export function evidenceRelativePath(file) {
  assert.ok(file.startsWith('artifacts/') && !path.isAbsolute(file));
  assert.ok(
    !file
      .split('/')
      .some((p) =>
        [
          '',
          '.',
          '..',
          'runtime',
          'node_modules',
          '.git',
          'expo-home',
        ].includes(p),
      ),
    `Disallowed evidence path: ${file}`,
  );
  assert.ok(
    !/\.(?:gguf|safetensors|pt|pem|key)$|(?:^|\/)(?:session|processes|invocation|requests|thread-start-result)\.json|\.input\.jsonl$/.test(
      file,
    ),
    `Private/runtime payload is not portable evidence: ${file}`,
  );
  return file.slice('artifacts/'.length);
}
function passedChecks(value, label, minimum = 1) {
  assert.ok(
    Array.isArray(value.checks) && value.checks.length >= minimum,
    `${label}: missing checks`,
  );
  assert.ok(
    value.checks.every((c) => c.passed === true),
    `${label}: failed checks`,
  );
}

// Match selector.ts's nested SemifResult.model.gguf projection. The raw receipt
// retains file/size metadata; checkpoint content identity is its SHA-256.
export function functionalModelProvenance(model) {
  assert.ok(model && typeof model === 'object' && !Array.isArray(model));
  assert.ok(
    model.gguf && typeof model.gguf === 'object' && !Array.isArray(model.gguf),
  );
  assert.match(model.gguf.sha256, /^[a-f0-9]{64}$/);
  return { ...model, gguf: { sha256: model.gguf.sha256 } };
}
export function assertFunctionalModelProvenance(raw, curated) {
  assert.deepEqual(
    functionalModelProvenance(raw),
    functionalModelProvenance(curated),
  );
}

export async function exportCurrentEvidence() {
  const root = await realpath(process.cwd());
  const observed = new Map();
  async function bytes(file) {
    const absolute = path.resolve(root, file);
    assert.ok(
      absolute.startsWith(root + path.sep),
      `Path outside repository: ${file}`,
    );
    assert.ok(
      (await lstat(absolute)).isFile(),
      `Expected regular file: ${file}`,
    );
    assert.equal(
      await realpath(absolute),
      absolute,
      `Symlink evidence/source rejected: ${file}`,
    );
    const b = await readFile(absolute),
      digest = sha(b),
      previous = observed.get(absolute);
    assert.ok(
      previous === undefined || previous === digest,
      `File changed during export: ${file}`,
    );
    observed.set(absolute, digest);
    return b;
  }
  const read = async (file) => JSON.parse(await bytes(file));
  async function sources(records, canonicalStringHash = false) {
    const entries = Array.isArray(records)
      ? records.map((r) => [r.path, r.sha256])
      : Object.entries(records ?? {});
    assert.ok(entries.length > 0, 'Missing source hashes');
    for (const [file, expected] of entries) {
      assert.match(expected, /^[a-f0-9]{64}$/);
      const b = await bytes(file);
      assert.equal(
        canonicalStringHash ? hash(b.toString('utf8')) : sha(b),
        expected,
        `Stale receipt source: ${file}`,
      );
    }
  }
  // The full gate is checked before inspecting/staging any export files.
  const verification = await read(`${lane}/summary.json`);
  assertCurrentVerification(verification, snapshotVerificationSources(root));
  const gallery = await read('artifacts/design-theory/proof/report.json');
  assert.deepEqual(gallery.failures, []);
  assert.equal(gallery.observations.length, 12);
  await sources(gallery.implementation);
  for (const directory of [
    'interactions-verification',
    'interactions-verification-webkit',
  ]) {
    const receipt = await read(
      `artifacts/design-theory/${directory}/report.json`,
    );
    assert.deepEqual(receipt.errors, []);
    assert.ok(receipt.scenarios.length >= 27 && receipt.actions.length > 0);
    assert.ok(receipt.actions.every((a) => a.passed));
    await sources(receipt.sources);
  }
  const material = await read(
    'artifacts/design-theory/material-integration/report.json',
  );
  assert.deepEqual(material.errors, []);
  passedChecks(material, 'Gallery material integration', 100);
  await sources(material.sources);
  for (const [file, minimum] of [
    ['artifacts/dom-surfaces/summary.json', 12],
    ['artifacts/dom-surfaces-gpu/proof.json', 55],
    ['artifacts/typography/summary.json', 26],
  ]) {
    const receipt = await read(file);
    passedChecks(receipt, file, minimum);
    await sources(receipt.sources);
  }
  const validation = await read('artifacts/validation/report.json');
  assert.equal(validation.complete, true);
  assert.equal(validation.receipts.length, 6);
  await sources(validation.sources, true);

  const field = await read(`${fieldDirectory}/gallery-session.json`);
  assert.equal(field.identity, fieldIdentity);
  assert.equal(field.selection.mode, 'local-selector');
  assert.equal(field.statistics.neuralCalls, 2);
  assert.equal(field.statistics.completedReadoutPasses, 2);
  assert.equal(field.statistics.testSelectorCalls, 0);
  assert.equal(field.statistics.evaluated, 3132);
  assert.equal(field.statistics.searches, 7);
  assert.equal(field.validation.status, 'passed');
  assert.equal(field.replay.neuralCalls, 0);
  assert.equal(field.replay.searches, 0);
  assert.equal(field.replay.revalidated, 18);
  await sources(field.implementationSources, true);
  const freeze = await read(`${fieldDirectory}/implementation-freeze.json`);
  assert.equal(freeze.status, 'verified-unchanged');
  assert.deepEqual(freeze.implementationSources, field.implementationSources);
  assert.equal(
    sha(await bytes('examples/design-field/gallery-session.json')),
    sha(await bytes(`${fieldDirectory}/gallery-session.json`)),
    'Displayed field differs from the measured selector receipt',
  );
  const progress = [];
  for (const [index, id] of selectorRows.entries()) {
    const stage =
      field.selection.stages[index === 0 ? 'reading' : 'expression'];
    assert.equal(stage.status, 'chosen');
    const provenance = stage.selection.provenance;
    const process = await read(`${fieldDirectory}/selector/${id}.process.json`);
    assert.deepEqual(process, provenance.execution);
    assert.equal(process.code, 0);
    assert.equal(process.signal, null);
    assert.equal(process.cancelled, false);
    assert.equal(process.processError, null);
    assert.equal(process.wallTimeLimit, null);
    const rows = (await bytes(`${fieldDirectory}/selector/${id}.output.jsonl`))
      .toString('utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
    assert.equal(rows[0].prompt_sha256, provenance.promptHash);
    assertFunctionalModelProvenance(rows[0].model, provenance.model);
    const events = (await bytes(`${fieldDirectory}/selector/${id}.stderr.txt`))
      .toString('utf8')
      .split('\n')
      .filter((l) => l.startsWith('@design-selector-progress '))
      .map((l) => JSON.parse(l.slice('@design-selector-progress '.length)));
    const prefill = events.filter((e) => e.phase === 'prefill');
    assert.ok(prefill.length > 1);
    assert.ok(
      prefill.every(
        (e, i) =>
          e.rowId === id &&
          Number.isSafeInteger(e.processed) &&
          e.total === prefill[0].total &&
          e.processed >= 0 &&
          e.processed <= e.total &&
          (i === 0 || e.processed > prefill[i - 1].processed),
      ),
    );
    assert.equal(prefill.at(-1).processed, prefill.at(-1).total);
    progress.push({
      stage: index === 0 ? 'reading' : 'expression',
      processEvents: process.progressEvents,
      providerEvents: events.length,
      completedInputTokens: prefill.at(-1).processed,
      generatedTokens: 0,
    });
  }
  const mathematical = await read(
    'artifacts/design-field-mathematical/gallery-session.json',
  );
  assert.equal(mathematical.statistics.neuralCalls, 0);
  assert.equal(mathematical.validation.status, 'passed');
  await sources(mathematical.implementationSources, true);
  const choice = await read('artifacts/choice-effectiveness/report.json');
  assert.equal(choice.status, 'passed');
  assert.equal(choice.neuralCalls, 0);
  await sources(choice.implementationSources, true);
  const kernels = await read('artifacts/relational-kernels/receipt.json');
  assert.equal(kernels.sourceStable, true);
  assert.equal(kernels.bindingsVerified, true);
  assert.equal(kernels.overrideDetected, true);
  assert.equal(kernels.neuralCalls, 0);
  assert.equal(kernels.replayStatistics.neuralCalls, 0);
  assert.equal(kernels.replayStatistics.searches, 0);
  await sources(kernels.sources);

  const nativeIdentity = await nativeSourceIdentity();
  for (const platform of platforms) {
    const receipt = await read(`artifacts/system/${platform}/summary.json`);
    assert.equal(receipt.platform, platform);
    assert.deepEqual(receipt.failures, []);
    assert.equal(receipt.measurements, 240);
    if (platform !== 'web') {
      assert.equal(
        receipt.implementationIdentity,
        nativeIdentity,
        `Stale ${platform} matrix`,
      );
      assert.equal(receipt.sourceStable, true);
    }
    const observations = (
      await bytes(`artifacts/system/${platform}/observations.jsonl`)
    )
      .toString('utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    assert.equal(observations.length, receipt.measurements);
    if (platform !== 'web')
      for (const observation of observations)
        assert.equal(
          observation.measurement.runtime.implementationIdentity,
          nativeIdentity,
          `Unbound ${platform} observation ${observation.id}`,
        );
  }
  const expo = await read(`${expoDirectory}/proof.json`);
  const expoValidation = await validateExpoProof(expo, { root });
  assert.equal(
    expoValidation.valid,
    true,
    `Expo proof: ${expoValidation.failures.join('; ')}`,
  );
  await sources(expo.files);
  // Validate artifact digests, but never expand the publication allowlist from them.
  for (const file of expo.artifacts)
    assert.equal(
      sha(await bytes(file.path)),
      file.sha256,
      `Stale Expo artifact: ${file.path}`,
    );
  const nativeExpo = await read(`${expoDirectory}/native-proof.json`);
  assert.equal(nativeExpo.complete, true);
  assert.equal(nativeExpo.sourceIdentity, expo.sourceIdentity);
  assert.equal(nativeExpo.resultIdentity, expo.resultIdentity);
  const template = await read(`${templateDirectory}/proof.json`);
  const templateValidation = await validateTemplateProof(template, { root });
  assert.equal(
    templateValidation.valid,
    true,
    `Blank template proof: ${templateValidation.failures.join('; ')}`,
  );
  const context = await read('artifacts/context/budget.json');
  assert.deepEqual(
    context.profiles.map((p) => p.profile),
    ['compact', 'full'],
  );
  for (const profile of context.profiles) {
    const wire = await bytes(`artifacts/context/tools-${profile.profile}.json`);
    assert.equal(wire.length, profile.jsonBytes);
    assert.equal(JSON.parse(wire).tools.length, profile.tools);
  }
  assert.equal(context.profiles[0].tools, 3);

  assert.equal(new Set(currentEvidenceFiles).size, currentEvidenceFiles.length);
  for (const file of currentEvidenceFiles) {
    evidenceRelativePath(file);
    await bytes(file);
  }
  // No validation failure above can create a misleading partial publication.
  await assert.rejects(
    lstat(destination),
    { code: 'ENOENT' },
    'Evidence destination already exists; keep immutable snapshots separate',
  );
  const staging = `${destination}.staging-${process.pid}`;
  await mkdir(path.dirname(destination), { recursive: true });
  await mkdir(staging, { recursive: false });
  const manifest = [];
  try {
    for (const source of currentEvidenceFiles) {
      const original = await bytes(source),
        compressed = /\.jsonl?$/.test(source) && original.length > 200000;
      const relative = evidenceRelativePath(source) + (compressed ? '.gz' : '');
      const output = compressed ? gzipSync(original) : original;
      const target = path.join(staging, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, output, { flag: 'wx' });
      manifest.push({
        file: relative,
        source,
        sha256: sha(output),
        bytes: output.length,
        sourceSha256: sha(original),
        sourceBytes: original.length,
        ...(compressed
          ? {
              encoding: 'gzip',
              uncompressedSha256: sha(original),
              uncompressedBytes: original.length,
            }
          : {}),
      });
    }
    // Match exact bytes again after staging, including executed source and raw receipts.
    for (const [file, expected] of observed)
      assert.equal(
        sha(await readFile(file)),
        expected,
        `Source/evidence changed while exporting: ${file}`,
      );
    assertCurrentVerification(verification, snapshotVerificationSources(root));
    assert.equal(await nativeSourceIdentity(), nativeIdentity);
    const receipt = {
      createdAt: new Date().toISOString(),
      verificationVersion: 4,
      scope: 'full',
      stages: 34,
      sourceIdentity: verification.sourceIdentity,
      nativeImplementationIdentity: nativeIdentity,
      fieldIdentity,
      field: {
        evaluated: 3132,
        searches: 7,
        completedReadouts: 2,
        replaySearches: 0,
        replayNeuralCalls: 0,
        revalidated: 18,
        progress,
      },
      expo: expoValidation,
      blankTemplate: templateValidation,
      sourceChecks: [...observed]
        .map(([file, sha256]) => ({ path: path.relative(root, file), sha256 }))
        .sort((a, b) => a.path.localeCompare(b.path)),
      unsupported: [
        'Human preference, award-level aesthetic quality, universal beauty scoring, and general end-to-end token savings are not measured.',
        'Browser GPU/CSS material receipts do not establish native material equivalence or physical-device power/thermal/Safari-sensor behavior.',
        'Expo native receipts cover virtual devices and declared scenarios, not native release-build performance, every API, OS Dynamic Type or a complete accessibility audit.',
        'Kernel proof and blank template smoke are not completed Relay applications. The Luna/Sol/Astra builder comparison has not run.',
        'Earlier matched-workflow comparisons, failed attempts and stale tokenizer counts remain historical and are excluded from this current manifest.',
      ],
      files: manifest,
    };
    await writeFile(
      path.join(staging, 'manifest.json'),
      JSON.stringify(receipt, null, 2) + '\n',
      { flag: 'wx' },
    );
    await writeFile(
      path.join(staging, 'README.md'),
      '# Current design-field evidence\n\nThirty-four ordered full verification stages with a matching source snapshot, current browser materials/interactions, source-bound native matrices, two actual streamed local-selector readouts and zero-call replay, relational kernels, and separate Expo app/template renderer receipts. See manifest.json for exact identities, scope and exclusions.\n\nThe authored allowlist excludes models, runtime bundles, copied caches, coding prompts, selector input JSONL, session/authentication files and private host configuration. Larger JSON receipts use gzip; `gzip -dc file.json.gz` recovers the original bytes. Source checks bind local bytes and retained observations; they do not authenticate renderer execution or establish preference. Historical comparisons are kept outside this current export.\n',
      { flag: 'wx' },
    );
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return {
    destination,
    files: manifest.length,
    bytes: manifest.reduce((n, f) => n + f.bytes, 0),
    sourceIdentity: verification.sourceIdentity,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  console.log(JSON.stringify(await exportCurrentEvidence()));
