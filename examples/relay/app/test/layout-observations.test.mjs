import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerLayout,
  captureLayoutObservations,
} from '../src/layout-observations.mjs';
import { subscribeInspection } from '../src/inspection-events.mjs';

test('layout capture reads live state, rejects duplicate ownership and disposes idempotently', () => {
  let phase = 'proposed',
    invalidations = 0;
  const unsubscribe = subscribeInspection(() => invalidations++);
  const release = registerLayout('test-flow', () => ({ phase }));
  try {
    assert.equal(captureLayoutObservations()[0].phase, 'proposed');
    phase = 'measured-fit';
    assert.equal(captureLayoutObservations()[0].phase, phase);
    assert.throws(() => registerLayout('test-flow', () => ({})), /Duplicate/);
    assert.equal(invalidations, 1);
    release();
    release();
    assert.equal(invalidations, 2);
    assert.deepEqual(captureLayoutObservations(), []);
  } finally {
    release();
    unsubscribe();
  }
});
