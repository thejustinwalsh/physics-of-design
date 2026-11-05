import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupAndroidResources } from '../scripts/native-session-cleanup.mjs';

test('Android cleanup attempts app verification, every owned mapping, and restoration after independent failures', async () => {
  const calls = [];
  const errors = await cleanupAndroidResources({
    launched: true, reverseOwned: [8088, 4319], reverseBefore: ['old tcp:9000 tcp:9000'],
    run: async (args) => {
      calls.push(args.join(' '));
      if (args.includes('force-stop')) throw Error('stop failed');
      if (args.includes('tcp:8088')) throw Error('first remove failed');
      return { stdout: 'old tcp:9000 tcp:9000\n' };
    },
    queryApp: async () => { calls.push('query-app'); return { pids: [42] }; },
  });
  assert.deepEqual(calls, [
    'shell am force-stop host.exp.exponent', 'query-app',
    'reverse --remove tcp:8088', 'reverse --remove tcp:4319', 'reverse --list',
  ]);
  assert.equal(errors.length, 3);
  assert.match(errors[0], /stop-owned-app/);
  assert.match(errors[1], /verify-owned-app-absent/);
  assert.match(errors[2], /remove-owned-reverse-8088/);
});

test('Android cleanup leaves unowned app and mappings untouched and reports restoration mismatch', async () => {
  const calls = [];
  const run = async (args) => { calls.push(args); return { stdout: '' }; };
  assert.deepEqual(await cleanupAndroidResources({ launched: false, reverseOwned: [], reverseBefore: null, run,
    queryApp: () => { throw Error('must not query'); } }), []);
  assert.equal(calls.length, 0);
  const errors = await cleanupAndroidResources({ launched: false, reverseOwned: [], reverseBefore: ['existing mapping'], run });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Reverse mappings were not restored/);
  assert.deepEqual(calls, [['reverse', '--list']]);
});
