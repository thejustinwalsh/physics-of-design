import test from 'node:test';
import assert from 'node:assert/strict';
import { ResultStore, summarizeResult } from '../src/mcp-context.js';

test('bounded result references preserve exact values, clone on read and reject prototype/malformed paths', () => {
  const store = new ResultStore(10000, 2);
  const first = store.put({ state: { size: 88 }, 'a/b': { '~x': 3 } })!;
  const ref = { $designRef: first, pointer: '/state' };
  const state = store.resolve(ref) as { size: number };
  state.size = 104;
  assert.deepEqual(store.resolve({ state: ref }), { state: { size: 88 } });
  assert.equal(store.resolve({ $designRef: first, pointer: '/a~1b/~0x' }), 3);
  for (const pointer of ['/constructor', '/__proto__', '/bad~2escape', 'state'])
    assert.throws(() => store.resolve({ $designRef: first, pointer }));
  assert.throws(() => store.resolve({ ...ref, extra: true }));
  store.put({ value: 2 });
  store.put({ value: 3 });
  assert.throws(() => store.resolve(ref), /evicted/);
  assert.equal(store.put('x'.repeat(10001)), null);
});

test('measurement and candidate summaries retain decisions without duplicating raw content', () => {
  const state = {
    blocks: [
      {
        id: 'title',
        text: 'large repeated content',
        font: { family: 'Lato' },
        size: 88,
      },
    ],
    gaps: [24],
  };
  const measurement = {
    feasible: true,
    issues: [],
    blocks: [
      {
        id: 'title',
        box: { x: 0, y: 0, width: 100, height: 50 },
        lines: [{ text: 'large repeated content', end: 22 }],
      },
    ],
  };
  const full = {
    candidates: [
      {
        id: 'a',
        state,
        measurement,
        responsive: [measurement],
        viable: true,
        changes: ['/gaps/0'],
      },
    ],
    viableIds: ['a'],
  };
  const store = new ResultStore();
  const ref = store.put(full)!;
  const summary = summarizeResult('system relax', full, ref);
  assert.ok(!JSON.stringify(summary).includes('large repeated content'));
  assert.deepEqual(
    store.resolve({ $designRef: ref, pointer: '/candidates/0/state' }),
    state,
  );
  assert.ok(
    JSON.stringify(
      summarizeResult('layout measure', measurement, null),
    ).includes('lineEnds'),
  );
});
