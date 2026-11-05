import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumberDraft } from '../src/design/number-draft.mjs';
test('number editing retains sign, decimal and exponent drafts without committing a fabricated zero', () => {
  for (const draft of ['', '-', '+', '.', '-.', '1e', '1e-'])
    assert.equal(
      parseNumberDraft(draft, { min: -10, max: 100 }).status,
      'incomplete',
    );
  assert.deepEqual(parseNumberDraft('-5', { min: -10, max: 0 }), {
    status: 'valid',
    value: -5,
  });
  assert.deepEqual(parseNumberDraft('1.', { min: 0, max: 2 }), {
    status: 'valid',
    value: 1,
  });
  assert.deepEqual(parseNumberDraft('1e2', { min: 0, max: 100 }), {
    status: 'valid',
    value: 100,
  });
});
test('numeric control validation does not admit nonfinite or out-of-domain parameters', () => {
  for (const draft of ['1e309', 'Infinity', 'NaN', '0x10', '-11', '101'])
    assert.equal(
      parseNumberDraft(draft, { min: -10, max: 100 }).status,
      'invalid',
    );
  assert.throws(
    () => parseNumberDraft('1', { min: 2, max: 1 }),
    /Invalid numeric control bounds/,
  );
});
