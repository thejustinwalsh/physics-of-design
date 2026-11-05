import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dumpAndroidAccessibility,
  queryAndroidProcessState,
} from '../scripts/android-accessibility.mjs';
function fixture({
  dump,
  xml = '<hierarchy rotation="0"><node text="current" /></hierarchy>',
  cleanupFail = false,
} = {}) {
  const calls = [];
  const run = async (label, args) => {
    calls.push({ label, args });
    if (label === 'remove-after' && cleanupFail)
      throw new Error('cleanup unavailable');
    if (label === 'dump')
      return (
        dump?.(args.at(-1)) ?? {
          stdout: `UI hierarchy dumped to: ${args.at(-1)}`,
          stderr: '',
        }
      );
    if (label === 'read') return { stdout: xml, stderr: '' };
    return { stdout: '', stderr: '' };
  };
  return { run, calls };
}
test('fresh Android dumps use separate nonce paths and dispose the remote file', async () => {
  const a = fixture(),
    b = fixture();
  const first = await dumpAndroidAccessibility(a),
    second = await dumpAndroidAccessibility(b);
  assert.notEqual(first.remote, second.remote);
  assert.deepEqual(
    a.calls.map((c) => c.label),
    ['remove-before', 'dump', 'read', 'remove-after'],
  );
  assert.ok(a.calls.every((c) => c.args.at(-1) === first.remote));
  assert.ok(first.xml.includes('current'));
});
for (const [name, dump] of [
  [
    'exit-zero idle error',
    () => ({ stdout: '', stderr: 'ERROR: could not get idle state.' }),
  ],
  [
    'wrong path',
    () => ({ stdout: 'UI hierarchy dumped to: /sdcard/stale.xml', stderr: '' }),
  ],
  ['missing completion', () => ({ stdout: '', stderr: '' })],
  [
    'completion with error',
    (path) => ({
      stdout: `UI hierarchy dumped to: ${path}`,
      stderr: 'ERROR: failed',
    }),
  ],
])
  test(`${name} never reads a potentially stale XML file`, async () => {
    const f = fixture({ dump });
    await assert.rejects(dumpAndroidAccessibility(f), /unavailable/);
    assert.deepEqual(
      f.calls.map((c) => c.label),
      ['remove-before', 'dump', 'remove-after'],
    );
  });
test('incomplete hierarchy and unconfirmed cleanup cannot pass', async () => {
  await assert.rejects(
    dumpAndroidAccessibility(fixture({ xml: '<hierarchy><node />' })),
    /Incomplete/,
  );
  await assert.rejects(
    dumpAndroidAccessibility(fixture({ cleanupFail: true })),
    /cleanup unavailable/,
  );
  await assert.rejects(
    dumpAndroidAccessibility(fixture({ xml: 'stale', cleanupFail: true })),
    AggregateError,
  );
});

test('cancellation during dump still uses independent cleanup and retains remote ownership', async () => {
  const controller = new AbortController(),
    calls = [],
    owned = [];
  const run = async (label, args, options) => {
    calls.push({ label, args, options });
    controller.signal.throwIfAborted();
    if (label === 'dump') {
      controller.abort();
      controller.signal.throwIfAborted();
    }
    return { stdout: '', stderr: '' };
  };
  const cleanupRun = async (label, args, options) => {
    calls.push({ label, args, options, cleanup: true });
    return { stdout: '', stderr: '' };
  };
  await assert.rejects(
    dumpAndroidAccessibility({
      run,
      cleanupRun,
      registerRemote: (path) => owned.push(path),
    }),
    (error) => error.name === 'AbortError',
  );
  assert.equal(owned.length, 1);
  assert.equal(calls.at(-1).label, 'remove-after');
  assert.equal(calls.at(-1).cleanup, true);
  assert.equal(calls.at(-1).args.at(-1), owned[0]);
  assert.equal(calls.find((c) => c.label === 'dump').options.timeout, 15000);
});

test('app absence requires a completed remote shell result, never an ADB exit status', async () => {
  const query = (result) =>
    queryAndroidProcessState({
      packageName: 'host.exp.exponent',
      run: async () => result,
    });
  assert.deepEqual(
    await query({ stdout: '\nDESIGN_PIDOF_STATUS:1\n', stderr: '' }),
    { pids: [], remoteStatus: 1 },
  );
  assert.deepEqual(
    await query({ stdout: '123 456\n\nDESIGN_PIDOF_STATUS:0\n', stderr: '' }),
    { pids: [123, 456], remoteStatus: 0 },
  );
  for (const result of [
    { code: 1, stdout: '', stderr: 'error: device offline' },
    { code: 1, stdout: '', stderr: '' },
    { stdout: '\nDESIGN_PIDOF_STATUS:127\n', stderr: '' },
    { stdout: '123\nDESIGN_PIDOF_STATUS:1\n', stderr: '' },
    { stdout: '\nDESIGN_PIDOF_STATUS:0\n', stderr: '' },
  ])
    await assert.rejects(query(result));
  await assert.rejects(
    queryAndroidProcessState({
      packageName: "host';bad",
      run: async () => {
        throw Error('must not run');
      },
    }),
    /Unsafe/,
  );
});
