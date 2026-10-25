import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createRestoreGate } from '../src/restore-gate.js';
const require = createRequire(import.meta.url);
const { readStored } =
  require('../native/vela-storage.ts') as typeof import('../native/vela-storage');
const valid = (): import('../native/vela-storage').StoredVela => ({
  preferences: { motion: 'reduced', accent: 'cobalt', checkIn: null },
  entries: [
    { id: 'a', seconds: 0.125, completedAt: '2026-10-25T05:00:00.000Z' },
  ],
});

test('actual native decoder preserves strict preferences and fractional history', () => {
  const value = valid();
  assert.deepEqual(readStored(JSON.stringify(value)), value);
  assert.deepEqual(
    readStored(JSON.stringify({ ...value, entries: [] })).entries,
    [],
  );
});

test('actual native decoder rejects coercible enums, null/array records, invalid dates and nonfinite or out-of-range history', () => {
  const cases: unknown[] = [
    null,
    [],
    {},
    { ...valid(), preferences: null },
    { ...valid(), preferences: [] },
    { ...valid(), entries: null },
    { ...valid(), entries: [null] },
    { ...valid(), entries: [[]] },
  ];
  for (const key of ['motion', 'accent', 'checkIn']) {
    for (const bad of [
      [],
      ['reduced'],
      ['cobalt'],
      {},
      1,
      false,
      null,
      'unknown',
    ]) {
      if (key === 'checkIn' && bad === null) continue;
      cases.push({
        ...valid(),
        preferences: { ...valid().preferences, [key]: bad },
      });
    }
  }
  for (const bad of [null, '1', -1, 1320.001])
    cases.push({
      ...valid(),
      entries: [{ ...valid().entries[0], seconds: bad }],
    });
  for (const bad of [null, 123, '', 'not-a-date'])
    cases.push({
      ...valid(),
      entries: [{ ...valid().entries[0], completedAt: bad }],
    });
  cases.push({ ...valid(), entries: [valid().entries[0], valid().entries[0]] });
  cases.push({
    ...valid(),
    entries: Array.from({ length: 51 }, (_, i) => ({
      ...valid().entries[0],
      id: String(i),
    })),
  });
  for (const value of cases)
    assert.throws(
      () => readStored(JSON.stringify(value)),
      undefined,
      JSON.stringify(value),
    );
  assert.throws(() =>
    readStored(
      '{"preferences":{"motion":"system","accent":"lime","checkIn":null},"entries":[{"id":"x","seconds":1e400,"completedAt":"2026-10-25"}]}',
    ),
  );
});

test('coercible but malformed preferences cannot unlock writes or replace stored bytes', async () => {
  const raw = JSON.stringify({
    ...valid(),
    preferences: {
      ...valid().preferences,
      motion: ['reduced'],
      accent: ['cobalt'],
    },
  });
  let writes = 0;
  const gate = createRestoreGate({
    read: async () => raw,
    write: async () => {
      writes++;
    },
    decode: (value) => readStored(value!),
  });
  await assert.rejects(gate.restore());
  await assert.rejects(gate.save(valid()));
  assert.equal(writes, 0);
  assert.deepEqual(JSON.parse(raw).preferences.motion, ['reduced']);
});
