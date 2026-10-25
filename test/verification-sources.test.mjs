import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentFullVerificationStages } from '../scripts/evidence-policy.mjs';
import {
  assertVerificationSourceSnapshot,
  isVerificationSource,
  snapshotVerificationSources,
  verificationSourceFields,
  verificationSourceIdentity,
} from '../scripts/verification-sources.mjs';

const write = (root, file, text = 'fixture') => {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
};
function fixture() {
  const repo = mkdtempSync(
    path.join(os.tmpdir(), 'verification-sources-test-'),
  );
  execFileSync('git', ['init', '--quiet', repo]);
  write(repo, 'src/program.js', 'export const fixture = true;');
  return repo;
}

test('one exact scope includes consumed sources and excludes declared generated directories', () => {
  for (const file of [
    'src/program.ts',
    'scripts/check.mjs',
    'test/check.test.mjs',
    'codemods/tool.js',
    'native/App.tsx',
    'examples/vela/design.generated.json',
    'experiments/expo-design-theory/src/App.jsx',
    'assets/fonts/font.ttf',
    'fonts/font.ttf',
    '.agents/skills/design-theory/references/composition.md',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'AGENTS.md',
    'physics_of_design_white_paper.md',
  ])
    assert.equal(isVerificationSource(file), true, file);
  for (const file of [
    'docs/result.md',
    'README.md',
    'src/node_modules/x.js',
    'native/.expo/settings.json',
    'experiments/expo-design-theory/dist/app.js',
    'scripts/__pycache__/x.pyc',
    'native/build/object.o',
    'src/runtime/model.gguf',
    'assets/.cache/x',
    'src/file.tsbuildinfo',
    '../src/x',
    '/src/x',
    'src\\x',
    'src//x',
  ])
    assert.equal(isVerificationSource(file), false, file);
});

test('snapshot observes tracked and untracked additions, removals, bytes and executable modes while excluding docs/caches', () => {
  const repo = fixture();
  execFileSync('git', ['-C', repo, 'add', 'src/program.js']);
  const before = snapshotVerificationSources(repo);
  write(repo, 'docs/result.md', 'mutable report');
  write(repo, 'src/node_modules/generated.js', 'cache');
  execFileSync('git', [
    '-C',
    repo,
    'add',
    '-f',
    'src/node_modules/generated.js',
  ]);
  assert.deepEqual(snapshotVerificationSources(repo), before);
  write(repo, 'src/new.js', 'untracked source');
  const added = snapshotVerificationSources(repo);
  assert.equal(added.length, before.length + 1);
  assert.notEqual(
    verificationSourceIdentity(added),
    verificationSourceIdentity(before),
  );
  rmSync(path.join(repo, 'src/new.js'));
  chmodSync(path.join(repo, 'src/program.js'), 0o755);
  assert.notEqual(
    verificationSourceIdentity(snapshotVerificationSources(repo)),
    verificationSourceIdentity(before),
  );
  chmodSync(path.join(repo, 'src/program.js'), 0o644);
  write(repo, 'src/program.js', 'changed bytes');
  assert.notEqual(
    verificationSourceIdentity(snapshotVerificationSources(repo)),
    verificationSourceIdentity(before),
  );
  write(repo, 'src/remaining.js', 'keep nonempty');
  rmSync(path.join(repo, 'src/program.js'));
  assert.deepEqual(
    snapshotVerificationSources(repo).map((file) => file.path),
    ['src/remaining.js'],
  );
});

test('source symlinks and malformed or unstable source receipts are rejected', () => {
  const repo = fixture(),
    before = snapshotVerificationSources(repo);
  const valid = verificationSourceFields(before, before);
  assertVerificationSourceSnapshot(valid);
  assert.throws(
    () => assertVerificationSourceSnapshot(verificationSourceFields(before)),
    /source changed/,
  );
  write(repo, 'src/other.js', 'new');
  assert.throws(
    () =>
      assertVerificationSourceSnapshot(
        verificationSourceFields(before, snapshotVerificationSources(repo)),
      ),
    /source changed/,
  );
  assert.throws(
    () => verificationSourceIdentity([...before, ...before]),
    /unique sorted paths/,
  );
  const forged = structuredClone(valid);
  forged.sourceIdentity = '0'.repeat(64);
  assert.throws(() => assertVerificationSourceSnapshot(forged));
  symlinkSync('program.js', path.join(repo, 'src/link.js'));
  assert.throws(() => snapshotVerificationSources(repo), /regular file/);
});

test('real verification orchestration binds initial/final source sets and fails drift despite 34 synthetic successful stages', () => {
  // Only the orchestration is real. These fake stage executables do no model,
  // renderer, native or network work and never qualify a real verification.
  for (const mutate of [false, true]) {
    const repo = fixture(),
      bin = path.join(repo, 'fake-bin');
    for (const command of ['npm', 'npx', 'node']) {
      write(
        repo,
        `fake-bin/${command}`,
        '#!/bin/sh\nif [ "$1" = "run" ] && [ "$2" = "build" ] && [ "$SYNTHETIC_CHANGE_SOURCE" = "1" ]; then echo changed > src/program.js; fi\nexit 0\n',
      );
      chmodSync(path.join(bin, command), 0o755);
    }
    const run = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../scripts/verify.mjs', import.meta.url)),
        '--all',
      ],
      {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          DESIGN_VERIFICATION_DIRECTORY: path.join(
            repo,
            'artifacts/verification',
          ),
          DESIGN_NATIVE_TOKEN: 'synthetic-only',
          SYNTHETIC_CHANGE_SOURCE: mutate ? '1' : '0',
        },
      },
    );
    assert.equal(run.status, mutate ? 1 : 0, run.stderr);
    const summary = JSON.parse(
      readFileSync(path.join(repo, 'artifacts/verification/summary.json')),
    );
    assert.equal(summary.complete, true);
    assert.deepEqual(
      summary.results.map((stage) => stage.name),
      currentFullVerificationStages,
    );
    assert.ok(summary.results.every((stage) => stage.code === 0));
    assert.equal(summary.passed, !mutate);
    assert.equal(summary.sourceStable, !mutate);
    if (!mutate) assertVerificationSourceSnapshot(summary);
    else assert.notEqual(summary.sourceIdentity, summary.sourceIdentityAfter);
  }
});
