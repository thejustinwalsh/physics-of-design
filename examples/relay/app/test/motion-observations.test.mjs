import test from 'node:test';
import assert from 'node:assert/strict';
import { registerMotion } from '../src/motion-observations.mjs';
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
