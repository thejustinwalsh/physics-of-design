import test from 'node:test';
import assert from 'node:assert/strict';
import { createRestoreGate } from '../src/restore-gate.js';

test('failed read cannot overwrite existing history; successful retry restores before saving', async () => {
  let raw = '{"entries":[17]}',
    fail = true;
  const writes: string[] = [];
  const gate = createRestoreGate({
    read: async () => {
      if (fail) throw new Error('Temporary read failure');
      return raw;
    },
    write: async (value) => {
      writes.push(value);
      raw = value;
    },
    decode: (value) =>
      value === null
        ? { entries: [] as number[] }
        : (JSON.parse(value) as { entries: number[] }),
  });
  await assert.rejects(gate.save({ entries: [] }));
  await assert.rejects(gate.restore());
  await assert.rejects(gate.save({ entries: [] }));
  assert.equal(raw, '{"entries":[17]}');
  assert.deepEqual(writes, []);
  fail = false;
  assert.deepEqual(await gate.restore(), { entries: [17] });
  await gate.save({ entries: [17, 18] });
  assert.equal(raw, '{"entries":[17,18]}');
});

test('malformed data and a pending restore stay locked; genuine absent data can initialize', async () => {
  const writes: string[] = [];
  let raw: string | null = '{malformed';
  const gate = createRestoreGate({
    read: async () => raw,
    write: async (v) => {
      writes.push(v);
    },
    decode: (v) => (v === null ? [] : (JSON.parse(v) as unknown[])),
  });
  await assert.rejects(gate.restore());
  await assert.rejects(gate.save([]));
  assert.deepEqual(writes, []);
  raw = null;
  const pending = gate.restore();
  await assert.rejects(gate.save([]));
  assert.deepEqual(await pending, []);
  await gate.save([1]);
  assert.deepEqual(writes, ['[1]']);
});

test('a superseded restore cannot unlock saving while the current read is pending', async () => {
  const resolves: ((value: string | null) => void)[] = [];
  const gate = createRestoreGate({
    read: () => new Promise<string | null>((resolve) => resolves.push(resolve)),
    write: async () => {},
    decode: (value) => value,
  });
  const first = gate.restore(),
    second = gate.restore();
  resolves[0]!('old');
  await assert.rejects(first, /superseded/);
  await assert.rejects(gate.save('replacement'));
  resolves[1]!('current');
  assert.equal(await second, 'current');
  await gate.save('replacement');
});
