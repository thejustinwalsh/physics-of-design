import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  realpathSync,
  copyFileSync,
  rmSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {
  artifact,
  browserFixture,
  validateCapabilityResult,
  runCapability,
} from '../scripts/relay-capabilities.mjs';
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'relay-capability-test-'));
  return { root, output: path.join(root, 'output') };
}
function browserResult(output) {
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, 'fixture.html'), browserFixture);
  const png = Buffer.alloc(128);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.writeUInt32BE(390, 16);
  png.writeUInt32BE(300, 20);
  for (const engine of ['chromium', 'webkit'])
    writeFileSync(path.join(output, engine + '.png'), png);
  return {
    fixture: artifact(output, 'fixture.html'),
    engines: ['chromium', 'webkit'].map((engine) => ({
      engine,
      version: 'synthetic',
      closed: true,
      observation: {
        text: 'Measured browser capability',
        counter: '1',
        rectangle: { x: 20, y: 20, width: 350, height: 27 },
        viewport: { width: 390, height: 300 },
      },
      screenshot: artifact(output, engine + '.png'),
    })),
    cleanup: { confirmed: true },
  };
}
test('browser receipt requires both saved renders, measured text, input and disposal', () => {
  const f = fixture(),
    r = browserResult(f.output);
  validateCapabilityResult('browser', r, f.output);
  for (const mutate of [
    (r) => r.engines.pop(),
    (r) => (r.engines[0].closed = false),
    (r) => (r.engines[0].observation.counter = '0'),
    (r) => (r.engines[0].observation.rectangle.width = 0),
    (r) => (r.cleanup.confirmed = false),
    (r) => (r.engines[0].screenshot.sha256 = '0'.repeat(64)),
  ]) {
    const bad = structuredClone(r);
    mutate(bad);
    assert.throws(() => validateCapabilityResult('browser', bad, f.output));
  }
  writeFileSync(path.join(f.output, 'webkit.png'), 'not an image');
  assert.throws(() => validateCapabilityResult('browser', r, f.output));
});
test('real probe failure retains bounded summary and detailed private artifact; it cannot produce a pass', async () => {
  const f = fixture(),
    workspace = path.join(f.root, 'workspace');
  mkdirSync(path.join(workspace, 'toolkit/node_modules/playwright'), {
    recursive: true,
  });
  writeFileSync(path.join(workspace, 'BUILDER.json'), '{}');
  writeFileSync(path.join(workspace, 'SELECTOR.json'), '{}');
  writeFileSync(
    path.join(workspace, 'toolkit/node_modules/playwright/index.mjs'),
    "export const chromium={launch:async()=>{throw Error('synthetic bootstrap_check_in Permission denied')}};export const webkit=chromium;",
  );
  const receipt = await runCapability('browser', { workspace });
  assert.equal(receipt.passed, false);
  assert.match(receipt.error.message, /Permission denied/);
  const output = path.resolve(workspace, '../cache/capabilities/browser');
  assert.equal(
    JSON.parse(readFileSync(path.join(output, 'receipt.json'))).passed,
    false,
  );
  assert.match(
    readFileSync(path.join(output, 'error.txt'), 'utf8'),
    /synthetic bootstrap/,
  );
  await assert.rejects(
    runCapability('browser', { workspace }),
    /already exists/,
  );
});
test('artifact references support canonical temp aliases and reject escaping symlinks', () => {
  const f = fixture();
  mkdirSync(f.output);
  writeFileSync(path.join(f.output, 'inside'), 'ok');
  assert.equal(artifact(f.output, 'inside').bytes, 2);
  assert.equal(artifact(realpathSync(f.output), 'inside').bytes, 2);
  writeFileSync(path.join(f.root, 'outside'), 'bad');
  symlinkSync(path.join(f.root, 'outside'), path.join(f.output, 'escape'));
  assert.throws(() => artifact(f.output, 'escape'), /escaped/);
});

// Exercise the actual CLI/module-loading boundary. The selector and native
// runtime are synthetic; this cannot qualify a model or native environment.
for (const kind of ['selector', 'native'])
  test(`CLI entry completes the ${kind} import cycle and retains its result`, (t) => {
    const f = fixture(),
      workspace = path.join(realpathSync(f.root), 'workspace'),
      toolkit = path.join(workspace, 'toolkit'),
      scripts = path.join(toolkit, 'scripts');
    t.after(() => rmSync(f.root, { recursive: true, force: true }));
    mkdirSync(scripts, { recursive: true });
    mkdirSync(path.join(toolkit, 'dist'));
    writeFileSync(path.join(toolkit, 'package.json'), '{"type":"module"}');
    for (const name of [
      'relay-capabilities.mjs',
      'relay-selector-capability.mjs',
      'relay-native-capability.mjs',
    ])
      copyFileSync(
        new URL('../scripts/' + name, import.meta.url),
        path.join(scripts, name),
      );
    const selector = {
      profile: 'qwen3.5-4b',
      revision: 'synthetic-revision',
      executable: { path: '/synthetic/selector-never-executed' },
      checkpoint: { path: '/synthetic/checkpoint', sha256: '7'.repeat(64) },
    };
    const selected = {
      selected: 'a',
      provenance: {
        readoutPasses: 1,
        execution: { code: 0, cancelled: false },
        model: {
          source: 'Qwen/Qwen3.5-4B',
          revision: selector.revision,
          gguf: { sha256: selector.checkpoint.sha256 },
        },
      },
    };
    writeFileSync(path.join(workspace, 'BUILDER.json'), '{}');
    writeFileSync(
      path.join(workspace, 'SELECTOR.json'),
      JSON.stringify(selector),
    );
    writeFileSync(
      path.join(toolkit, 'dist/selector.js'),
      `export async function selectLocalOptions(){return ${JSON.stringify(selected)}}`,
    );
    // Preserve the native producer's real dynamic import back to a launcher
    // which statically imports the dispatcher. Stop before any device access.
    writeFileSync(
      path.join(scripts, 'run-relay-builders.mjs'),
      "import {capabilityKinds} from './relay-capabilities.mjs';export function snapshotApplication(){throw Error('synthetic native snapshot reached '+capabilityKinds.length)};export function snapshotPreparedApplication(){}",
    );
    const child = spawnSync(
      process.execPath,
      [path.join(scripts, 'relay-capabilities.mjs'), kind],
      {
        cwd: workspace,
        env: { ...process.env, DESIGN_SEMIF_BIN: selector.executable.path },
        encoding: 'utf8',
      },
    );
    assert.equal(child.status, kind === 'selector' ? 0 : 1, child.stderr);
    assert.doesNotMatch(child.stderr, /unsettled top-level await/);
    const output = path.join(f.root, 'cache/capabilities', kind),
      receipt = JSON.parse(readFileSync(path.join(output, 'receipt.json')));
    assert.equal(receipt.passed, kind === 'selector');
    if (kind === 'selector')
      assert.equal(receipt.result.readout.selectedId, 'a');
    else {
      assert.match(
        receipt.error.message,
        /synthetic native snapshot reached 3/,
      );
      assert.match(
        readFileSync(path.join(output, 'error.txt'), 'utf8'),
        /synthetic native snapshot/,
      );
    }
  });
