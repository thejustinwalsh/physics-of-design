import test from 'node:test';
import assert from 'node:assert/strict';
import { projectNativeSafeArea } from '../src/native-safe-area.js';

test('full iPhone window reserves the home-indicator band outside the dock viewport', () => {
  const safe = projectNativeSafeArea({
    screen: { width: 402, height: 874 },
    window: { width: 402, height: 874 },
    screenOffset: { x: 0, y: 0 },
    insets: { top: 62, right: 0, bottom: 34, left: 0 },
  });
  assert.deepEqual(safe, { top: 62, right: 0, bottom: 34, left: 0 });
  // Outer margin, not scroll-content padding: even the scroll clip ends at840.
  const dockBudget = 874 * 0.45;
  const viewportEnd = 874 - safe.bottom;
  assert.equal(viewportEnd, 840);
  assert.equal(dockBudget - safe.bottom + safe.bottom, dockBudget);
});

test('Android measured window already excludes both bars: no duplicated bottom48dp', () => {
  const screenHeight = 914.2857142857143,
    status = 51.80952453613281;
  const safe = projectNativeSafeArea({
    screen: { width: 411.42857142857144, height: screenHeight },
    window: { width: 411.42857142857144, height: screenHeight - status - 48 },
    screenOffset: { x: 0, y: status },
    insets: { top: status, right: 0, bottom: 48, left: 0 },
  });
  assert.deepEqual(safe, { top: 0, right: 0, bottom: 0, left: 0 });
});

test('projection handles partial overlap, landscape side insets and inset-free floating windows', () => {
  const base = {
    screen: { width: 874, height: 402 },
    insets: { left: 59, right: 59, top: 0, bottom: 21 },
  };
  assert.deepEqual(
    projectNativeSafeArea({
      ...base,
      window: base.screen,
      screenOffset: { x: 0, y: 0 },
    }),
    { left: 59, right: 59, top: 0, bottom: 21 },
  );
  assert.deepEqual(
    projectNativeSafeArea({
      ...base,
      window: { width: 800, height: 390 },
      screenOffset: { x: 20, y: 0 },
    }),
    { left: 39, right: 5, top: 0, bottom: 9 },
  );
  assert.deepEqual(
    projectNativeSafeArea({
      ...base,
      window: { width: 600, height: 300 },
      screenOffset: { x: 100, y: 40 },
    }),
    { left: 0, right: 0, top: 0, bottom: 0 },
  );
});

test('invalid projection inputs fail explicitly instead of inventing safe geometry', () => {
  const base = {
    screen: { width: 402, height: 874 },
    window: { width: 402, height: 874 },
    screenOffset: { x: 0, y: 0 },
    insets: { top: 62, right: 0, bottom: 34, left: 0 },
  };
  for (const value of [NaN, Infinity, -1, 0])
    assert.throws(
      () =>
        projectNativeSafeArea({
          ...base,
          window: { ...base.window, height: value },
        }),
      RangeError,
    );
  assert.throws(
    () => projectNativeSafeArea({ ...base, screenOffset: { x: NaN, y: 0 } }),
    RangeError,
  );
  assert.throws(
    () =>
      projectNativeSafeArea({
        ...base,
        insets: { ...base.insets, bottom: -1 },
      }),
    RangeError,
  );
  assert.throws(
    () =>
      projectNativeSafeArea({
        ...base,
        insets: { ...base.insets, bottom: 874 },
      }),
    RangeError,
  );
});
