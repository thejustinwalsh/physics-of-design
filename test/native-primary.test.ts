import test from 'node:test';
import assert from 'node:assert/strict';
import { assertNativePrimary } from '../scripts/native-primary.mjs';

// Geometry reproduces saved iPhone/Android default completion receipts; no runtime is invoked.
function fixture(platform: 'ios' | 'android' = 'ios') {
  const android = platform === 'android';
  const box = android
    ? {
        x: 20.190475463867188,
        y: 689.1428833007812,
        width: 371.4285888671875,
        height: 51.80950927734375,
      }
    : { x: 20, y: 714.3333530426025, width: 362, height: 52 };
  return {
    incomplete: false,
    snapshot: {
      screen: 'complete',
      elapsedSeconds: 0,
      running: false,
      window: android
        ? { width: 411.42857142857144, height: 814.4761904761905 }
        : { width: 402, height: 874 },
      safeArea: android
        ? { left: 0, bottom: 48, right: 0, top: 51.80952453613281 }
        : { top: 62, right: 0, bottom: 34, left: 0 },
      coordinateSpace: {
        screenOffset: { x: 0, y: android ? 51.80952453613281 : 0 },
        screen: android
          ? { width: 411.42857142857144, height: 914.2857142857143 }
          : { width: 402, height: 874 },
      },
    },
    observations: [
      {
        id: 'header',
        kind: 'target',
        name: 'Back to Today',
        clipId: null,
        box: { x: 20, y: 73, width: 48, height: 48 },
        visibleBox: { x: 20, y: 73, width: 48, height: 48 },
      },
      {
        id: 'dock',
        kind: 'target',
        name: 'Back to Today',
        clipId: 'dock-scroll',
        box: { ...box },
        visibleBox: { ...box },
      },
      {
        id: 'dock-scroll',
        kind: 'clip',
        name: 'scroll viewport',
        clipId: null,
        box: { x: 0, y: 680, width: 402, height: 194 },
        visibleBox: { x: 0, y: 680, width: 402, height: 194 },
      },
    ],
  };
}

test('duplicate header label cannot satisfy dock primary: actual saved platform geometry', () => {
  for (const platform of ['ios', 'android'] as const) {
    const result = assertNativePrimary(fixture(platform));
    assert.equal(result.status, 'verified');
    assert.equal(result.targetId, 'dock');
  }
  const missing = fixture();
  missing.observations = missing.observations.filter((o) => o.id !== 'dock');
  assert.throws(() => assertNativePrimary(missing), /exactly one/);
});

test('missing or ambiguous measured dock ancestry cannot pass', () => {
  const missing = fixture();
  missing.observations = missing.observations.filter((o) => o.kind !== 'clip');
  assert.throws(() => assertNativePrimary(missing), /measured clip/);
  const duplicate = fixture();
  duplicate.observations.push({
    ...duplicate.observations[1]!,
    id: 'other-dock',
  });
  assert.throws(() => assertNativePrimary(duplicate), /exactly one/);
});

test('clipped, offscreen, unsafe and undersized dock actions fail despite valid header', () => {
  const clipped = fixture();
  clipped.observations[1]!.visibleBox.height -= 10;
  assert.throws(() => assertNativePrimary(clipped), /clipped/);
  const offscreen = fixture();
  offscreen.observations[1]!.box.y = 900;
  offscreen.observations[1]!.visibleBox.y = 900;
  assert.throws(() => assertNativePrimary(offscreen), /safe viewport/);
  const unsafe = fixture();
  unsafe.observations[1]!.box.y = 820;
  unsafe.observations[1]!.visibleBox.y = 820;
  assert.throws(() => assertNativePrimary(unsafe), /safe viewport/);
  const small = fixture();
  small.observations[1]!.box.height = 40;
  small.observations[1]!.visibleBox.height = 40;
  assert.throws(() => assertNativePrimary(small), /touch minimum/);
});

test('Android screen offset is applied once, with bars already excluded from window', () => {
  const android = fixture('android'),
    action = android.observations[1]!;
  action.box.y = 760;
  action.visibleBox.y = 760;
  assert.equal(assertNativePrimary(android).status, 'verified');
  action.box.y = 810;
  action.visibleBox.y = 810;
  assert.throws(() => assertNativePrimary(android), /safe viewport/);
  const top = fixture('android');
  top.observations[1]!.box.y = 0;
  top.observations[1]!.visibleBox.y = 0;
  assert.equal(assertNativePrimary(top).status, 'verified');
  top.snapshot.coordinateSpace.screenOffset.y = 0;
  assert.throws(() => assertNativePrimary(top), /safe viewport/);
});

test('unknown coordinates, nonfinite geometry and incomplete receipts fail closed', () => {
  const invalid = fixture();
  invalid.observations[1]!.box.width = NaN;
  assert.throws(() => assertNativePrimary(invalid), /Invalid/);
  const missing = fixture();
  delete (missing.snapshot as any).coordinateSpace;
  assert.throws(() => assertNativePrimary(missing), /coordinate evidence/);
  const incomplete = fixture();
  incomplete.incomplete = true;
  assert.throws(
    () => assertNativePrimary(incomplete),
    /complete native receipt/,
  );
});

test('focused labels follow current session state; nonfocused screens are explicit N/A', () => {
  const detail = fixture();
  detail.snapshot.screen = 'detail';
  detail.observations[1]!.name = 'Start session';
  assert.equal(assertNativePrimary(detail).label, 'Start session');
  detail.snapshot.screen = 'active';
  detail.snapshot.running = true;
  detail.observations[1]!.name = 'Pause session';
  assert.equal(assertNativePrimary(detail).label, 'Pause session');
  detail.snapshot.screen = 'today';
  assert.equal(assertNativePrimary(detail).status, 'not-applicable');
});
