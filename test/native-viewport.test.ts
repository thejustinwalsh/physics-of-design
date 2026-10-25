import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceNativeViewport,
  type NativeViewport,
} from '../src/native-viewport.js';
const geometry = (): NativeViewport => ({
  window: { width: 402, height: 874, fontScale: 1, scale: 3 },
  insets: { top: 59, bottom: 34, left: 0, right: 0 },
});

test('initial zero geometry defers resolution; complete valid geometry is accepted', () => {
  const zero = geometry();
  zero.window.width = 0;
  const unavailable = advanceNativeViewport(null, zero);
  assert.equal(unavailable.accepted, null);
  assert.equal(unavailable.status, 'unavailable');
  assert.ok(
    unavailable.lastRejection!.reasons.some((r) =>
      r.startsWith('usable width'),
    ),
  );
  const current = advanceNativeViewport(unavailable, geometry());
  assert.equal(current.status, 'current');
  assert.deepEqual(current.accepted, geometry());
  assert.equal(current.rejectedCount, 1);
});

test('transient invalid readings retain the complete prior geometry, then accept a genuine reflow', () => {
  const first = geometry(),
    accepted = advanceNativeViewport(null, first);
  first.window.width = 99; // The accepted snapshot must not alias caller-owned data.
  const invalid = geometry();
  invalid.window.width = 0;
  invalid.insets.top = 0;
  const held = advanceNativeViewport(accepted, invalid);
  assert.equal(held.status, 'held');
  assert.deepEqual(held.accepted, geometry());
  const rotated = geometry();
  rotated.window.width = 874;
  rotated.window.height = 402;
  rotated.insets = { top: 0, right: 59, bottom: 21, left: 59 };
  const reflowed = advanceNativeViewport(held, rotated);
  assert.equal(reflowed.status, 'current');
  assert.deepEqual(reflowed.accepted, rotated);
  assert.equal(reflowed.rejectedCount, 1);
});

test('consumed panes, nonfinite/scaled geometry and invalid insets cannot enter the resolver', () => {
  const cases: NativeViewport[] = [];
  for (const key of ['width', 'height', 'fontScale', 'scale'] as const)
    for (const bad of [0, -1, NaN, Infinity]) {
      const x = geometry();
      x.window[key] = bad;
      cases.push(x);
    }
  for (const key of ['top', 'right', 'bottom', 'left'] as const)
    for (const bad of [-1, NaN, Infinity]) {
      const x = geometry();
      x.insets[key] = bad;
      cases.push(x);
    }
  const width = geometry();
  width.insets.left = 402;
  cases.push(width);
  const height = geometry();
  height.insets.top = 874;
  cases.push(height);
  for (const input of cases) {
    const result = advanceNativeViewport(null, input);
    assert.equal(result.accepted, null);
    assert.equal(result.status, 'unavailable');
    assert.ok(result.lastRejection!.reasons.length);
  }
});
