import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createNativeCapabilityFixture } from './fixtures/native-capability.mjs';
import {
  validateNativeCapabilityResult,
  validateNativeObservation,
  nativeButtonPoint,
  stopOwnedProcessGroups,
} from '../scripts/relay-native-capability.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'relay-native-protocol-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'),
    output = path.join(root, 'output');
  mkdirSync(path.join(workspace, 'app'), { recursive: true });
  writeFileSync(
    path.join(workspace, 'app/App.jsx'),
    '// Synthetic fixture; not run',
  );
  const metadata = {
    runtime: {
      metro: 8620,
      proxy: 8621,
      observer: 8622,
      devices: {
        ios: 'synthetic-ios',
        android: 'synthetic-android',
        tools: {
          androidAdb: '/synthetic/adb',
          iosInputRuntime: '/synthetic/idb',
          iosInputCompanionAddress: 'localhost:10882',
          expoGo: { ios: '58.0.7', android: '58.0.5' },
        },
      },
    },
  };
  return {
    workspace,
    output,
    metadata,
    result: createNativeCapabilityFixture({ workspace, output, metadata }),
  };
}
function rewrite(f, ref, mutate) {
  const json = JSON.parse(readFileSync(path.join(f.output, ref.path)));
  mutate(json);
  const bytes = Buffer.from(JSON.stringify(json));
  writeFileSync(path.join(f.output, ref.path), bytes);
  Object.assign(ref, {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  for (const existing of f.result.artifacts)
    if (existing.path === ref.path) Object.assign(existing, ref);
}
test('synthetic native fixture satisfies full source, native geometry, input, screenshot and cleanup contract', (t) => {
  const f = fixture(t);
  validateNativeCapabilityResult(f.result, f.output, f);
});
for (const [name, mutate] of [
  ['missing source after', (f) => delete f.result.sourceIdentityAfter],
  [
    'wrong assigned device',
    (f) => (f.result.platforms[0].deviceId = 'another-device'),
  ],
  ['missing cleanup process', (f) => f.result.cleanup.groups.pop()],
  ['occupied port', (f) => (f.result.cleanup.ports[0].free = false)],
  ['missing actual action check', (f) => f.result.checks.shift()],
  [
    'stale after observation',
    (f) => {
      const p = f.result.platforms[0];
      rewrite(f, p.receipt, (receipt) => {
        rewrite(f, receipt.after, (after) => (after.presses = 0));
      });
    },
  ],
  [
    'browser rectangles relabeled as native',
    (f) => {
      rewrite(f, f.result.platforms[0].receipt, (receipt) =>
        rewrite(f, receipt.after, (after) => (after.provider = 'browser')),
      );
    },
  ],
  [
    'input dispatched to another device',
    (f) => {
      rewrite(f, f.result.platforms[1].receipt, (receipt) =>
        rewrite(
          f,
          receipt.input.dispatch,
          (command) => (command.args[1] = 'another-device'),
        ),
      );
    },
  ],
  [
    'unchanged display claim with different screenshot dimensions',
    (f) =>
      rewrite(
        f,
        f.result.platforms[0].receipt,
        (receipt) => (receipt.device.screen.width = 4),
      ),
  ],
  [
    'rehashed fabricated source digest',
    (f) =>
      rewrite(f, f.result.source, (source) => {
        source.before.files[0].sha256 = '0'.repeat(64);
        source.after.files[0].sha256 = '0'.repeat(64);
      }),
  ],
])
  test(`native capability rejects ${name}`, (t) => {
    const f = fixture(t);
    mutate(f);
    assert.throws(() => validateNativeCapabilityResult(f.result, f.output, f));
  });
test('native observation rejects missing text host geometry and offscreen action', () => {
  const base = {
    phase: 'template-shell',
    platform: 'native-ios',
    provider: 'native-ios',
    sourceIdentity: 'x',
    presses: 0,
    observedAt: '2026-10-25T00:00:00Z',
    viewport: { width: 390, height: 844 },
    boxes: {},
  };
  assert.throws(
    () =>
      validateNativeObservation(base, {
        platform: 'native-ios',
        sourceIdentity: 'x',
        presses: 0,
      }),
    /actual host rectangle/,
  );
});
test('actual input target rejects duplicate or disabled native controls', () => {
  const node = {
    AXUniqueId: 'shell-button',
    AXLabel: 'Check interaction',
    enabled: true,
    frame: { x: 20, y: 60, width: 160, height: 48 },
  };
  assert.throws(
    () => nativeButtonPoint('native-ios', [node, node]),
    /exactly one/,
  );
  assert.throws(() =>
    nativeButtonPoint('native-ios', [{ ...node, enabled: false }]),
  );
  assert.throws(() =>
    nativeButtonPoint(
      'native-android',
      '<node resource-id="shell-button" bounds="[1,2][0,0]" enabled="true" clickable="true"/>',
    ),
  );
});
test('cleanup signals only owned groups, escalates remaining groups and reports unconfirmed survivors', async () => {
  const sent = [],
    alive = new Set([101, 102]);
  const result = await stopOwnedProcessGroups(
    [
      { owned: true, pid: 101, name: 'graceful' },
      { owned: true, pid: 102, name: 'stuck' },
    ],
    {
      alive: (pid) => alive.has(pid),
      wait: async () => {},
      send: (pid, signal) => {
        sent.push([pid, signal]);
        if (pid === 101) alive.delete(pid);
      },
    },
  );
  assert.deepEqual(sent, [
    [101, 'SIGTERM'],
    [102, 'SIGTERM'],
    [102, 'SIGKILL'],
  ]);
  assert.equal(result[0].absent, true);
  assert.equal(result[1].absent, false);
  await assert.rejects(
    stopOwnedProcessGroups([{ owned: false, pid: 999, name: 'unowned' }], {
      send: () => assert.fail('must not signal'),
    }),
    /unowned/,
  );
});
test('cleanup does not signal already absent groups', async () => {
  const result = await stopOwnedProcessGroups(
    [{ owned: true, pid: 101, name: 'finished' }],
    { alive: () => false, send: () => assert.fail('must not signal') },
  );
  assert.equal(result[0].absent, true);
  assert.deepEqual(result[0].signals, []);
});
test('cleanup observes transient EPERM after termination until absence is positively known', async () => {
  let observations = 0;
  const signals = [];
  const result = await stopOwnedProcessGroups(
    [{ owned: true, pid: 101, name: 'exiting' }],
    {
      alive: () => {
        observations++;
        if (observations === 1) return true;
        if (observations < 4)
          throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
        return false;
      },
      send: (_pid, signal) => signals.push(signal),
      wait: async () => {},
    },
  );
  assert.deepEqual(signals, ['SIGTERM']);
  assert.equal(result[0].absent, true);
  assert.deepEqual(result[0].observationErrors, ['EPERM', 'EPERM']);
});
test('persistent unknown process-group state never becomes confirmed cleanup', async () => {
  const result = await stopOwnedProcessGroups(
    [{ owned: true, pid: 101, name: 'unknown' }],
    {
      alive: () => {
        throw Object.assign(new Error('kill EPERM'), { code: 'EPERM' });
      },
      send: () =>
        assert.fail('Unknown process-group state must not trigger escalation'),
      wait: async () => {},
    },
  );
  assert.equal(result[0].absent, false);
  assert.match(result[0].error, /unknown/);
});
