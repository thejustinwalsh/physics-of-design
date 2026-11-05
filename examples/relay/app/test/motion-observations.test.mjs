import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerMotion,
  captureRuntimeObservations,
} from '../src/motion-observations.mjs';
import { subscribeInspection } from '../src/inspection-events.mjs';
test('explicit captures read current controller state without a React render or polling loop', () => {
  let phase = 'playing',
    invalidations = 0;
  const unsubscribe = subscribeInspection(() => invalidations++);
  const release = registerMotion('live', () => ({ phase }));
  try {
    const first = captureRuntimeObservations();
    phase = 'settled';
    const next = captureRuntimeObservations();
    assert.equal(first.motion[0].phase, 'playing');
    assert.equal(next.motion[0].phase, 'settled');
    assert.deepEqual(next.clock, { subscribers: 0, scheduled: false });
    assert.equal(invalidations, 1, 'Reads do not schedule recurring work');
    release();
    release();
    assert.equal(invalidations, 2, 'Disposal only invalidates once');
    assert.deepEqual(captureRuntimeObservations().motion, []);
  } finally {
    release();
    unsubscribe();
  }
});
test('out-of-order motion disposal releases the global reader and retained controllers', () => {
  const first = registerMotion('first', () => ({ phase: 'playing' }));
  const second = registerMotion('second', () => ({ phase: 'settled' }));
  assert.equal(globalThis.__RELAY_MOTION__().length, 2);
  second();
  assert.equal(globalThis.__RELAY_MOTION__().length, 1);
  first();
  assert.equal(globalThis.__RELAY_MOTION__, undefined);
  first();
  second();
  assert.equal(globalThis.__RELAY_MOTION__, undefined);
});
test('duplicate live motion IDs cannot overwrite the current controller evidence', () => {
  const release = registerMotion('same', () => ({ phase: 'settled' }));
  try {
    assert.throws(
      () => registerMotion('same', () => ({ phase: 'playing' })),
      /Duplicate active motion identity/,
    );
    assert.equal(globalThis.__RELAY_MOTION__()[0].phase, 'settled');
  } finally {
    release();
  }
});
