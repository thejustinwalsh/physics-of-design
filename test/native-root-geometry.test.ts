import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceMeasuredNativeGeometry,
  nativeFrameRelativeToRoot,
  type NativeRootInput,
} from '../src/native-root-geometry.js';
const android = (): NativeRootInput => ({
  nominalWindow: {
    width: 411.42857142857144,
    height: 814.4761904761905,
    fontScale: 2,
    scale: 2.625,
  },
  rootFrame: {
    x: 0,
    y: -51.80952453613281,
    width: 411.42857142857144,
    height: 914.2857142857143,
  },
  insets: { top: 51.80952453613281, bottom: 48, left: 0, right: 0 },
  baseCoordinateSpace: {
    screenOffset: { x: 0, y: 51.80952453613281 },
    screen: { width: 411.42857142857144, height: 914.2857142857143 },
  },
});
test('edge-to-edge Android uses measured full-screen root rather than nominal excluded-bars height', () => {
  const input = android(),
    state = advanceMeasuredNativeGeometry(null, input),
    geometry = state.accepted!;
  assert.equal(state.status, 'current');
  assert.equal(geometry.window.height, 914.2857142857143);
  assert.equal(geometry.nominalWindow.height, 814.4761904761905);
  assert.deepEqual(geometry.coordinateSpace.screenOffset, { x: 0, y: 0 });
  assert.equal(geometry.windowSafeArea.bottom, 48);
  assert.ok(
    Math.abs(
      geometry.window.height -
        geometry.windowSafeArea.top -
        geometry.windowSafeArea.bottom -
        814.4761897495815,
    ) < 1e-6,
  );
  const raw = { x: 20, y: 780.5714, width: 371, height: 62.4762 };
  const rebased = nativeFrameRelativeToRoot(raw, geometry.rootFrame);
  assert.equal(
    rebased.y + geometry.coordinateSpace.screenOffset.y,
    raw.y + input.baseCoordinateSpace.screenOffset.y,
  );
  assert.ok(
    rebased.y + rebased.height >
      geometry.window.height - geometry.windowSafeArea.bottom,
  );
});
test('excluded-bars Android and unchanged iOS origins retain their own coordinate contract', () => {
  const input = android();
  input.rootFrame = {
    x: 0,
    y: 0,
    width: input.nominalWindow.width,
    height: input.nominalWindow.height,
  };
  const excluded = advanceMeasuredNativeGeometry(null, input).accepted!;
  assert.ok(excluded.windowSafeArea.bottom < 1e-5);
  assert.equal(excluded.windowSafeArea.top, 0);
  const ios: NativeRootInput = {
    nominalWindow: { width: 402, height: 874, scale: 3, fontScale: 3.571 },
    rootFrame: { x: 0, y: 0, width: 402, height: 874 },
    insets: { top: 62, bottom: 34, left: 0, right: 0 },
    baseCoordinateSpace: {
      screenOffset: { x: 0, y: 0 },
      screen: { width: 402, height: 874 },
    },
  };
  const i = advanceMeasuredNativeGeometry(null, ios).accepted!;
  assert.deepEqual(i.window, ios.nominalWindow);
  assert.deepEqual(i.windowSafeArea, ios.insets);
  assert.equal(
    i.window.height - i.windowSafeArea.top - i.windowSafeArea.bottom,
    778,
  );
  assert.deepEqual(
    nativeFrameRelativeToRoot(
      { x: 20, y: 500, width: 362, height: 180 },
      i.rootFrame,
    ),
    { x: 20, y: 500, width: 362, height: 180 },
  );
});
test('node and clip frames share one translation; physical positions and intersections are unchanged', () => {
  const root = { x: 10, y: -52 };
  const clip = nativeFrameRelativeToRoot(
    { x: 10, y: 450, width: 402, height: 362 },
    root,
  );
  const node = nativeFrameRelativeToRoot(
    { x: 30, y: 740, width: 362, height: 180 },
    root,
  );
  assert.equal(clip.y + clip.height, 864);
  assert.equal(Math.min(clip.y + clip.height, node.y + node.height), 864);
  assert.equal(node.x, 20);
});
test('invalid root measurement defers or holds the entire accepted coordinate tuple without aliasing', () => {
  const bad = android();
  bad.rootFrame.height = 0;
  assert.equal(advanceMeasuredNativeGeometry(null, bad).status, 'unavailable');
  const input = android(),
    accepted = advanceMeasuredNativeGeometry(null, input);
  input.rootFrame.y = 999;
  input.baseCoordinateSpace.screenOffset.y = 999;
  const held = advanceMeasuredNativeGeometry(accepted, bad);
  assert.equal(held.status, 'held');
  assert.equal(held.accepted!.rootFrame.y, -51.80952453613281);
  assert.equal(held.accepted!.coordinateSpace.screenOffset.y, 0);
  for (const value of [NaN, Infinity]) {
    const invalid = android();
    invalid.rootFrame.x = value;
    assert.equal(
      advanceMeasuredNativeGeometry(accepted, invalid).status,
      'held',
    );
  }
});

test('a root outside the physical safe rectangle cannot produce a zero-area design viewport', () => {
  const input = android();
  input.rootFrame.x = 500;
  const state = advanceMeasuredNativeGeometry(null, input);
  assert.equal(state.status, 'unavailable');
  assert.ok(
    state.lastRejection?.reasons.includes(
      'usable width must be finite and positive',
    ),
  );
});
