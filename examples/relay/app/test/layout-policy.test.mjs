import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRelayFrame,
  inspectRelayFrame,
} from '../src/design/layout-policy.mjs';

test('Relay task topology is coupled to effective type scale and usable width', () => {
  const phone = resolveRelayFrame({ width: 390 }),
    ipad = resolveRelayFrame({ width: 834 }),
    desktop = resolveRelayFrame({ width: 1440 });
  assert.equal(phone.values.columns, 1);
  assert.equal(phone.values.wide, 0);
  assert.equal(ipad.values.columns, 2);
  assert.equal(ipad.values.wide, 0);
  assert.equal(desktop.values.columns, 2);
  assert.equal(desktop.values.wide, 1);
  const enlarged = resolveRelayFrame({ width: 834, textScale: 1.5 });
  assert.equal(enlarged.values.columns, 1);
  assert.ok(enlarged.values.gap > ipad.values.gap);
  assert.equal(
    resolveRelayFrame({ width: 1440, textScale: 1.5 }).values.wide,
    0,
  );
  assert.equal(resolveRelayFrame({ width: 0 }).status, 'unsupported');
});

test('Relay inspections use the same expression definitions as its actual topology consumer', () => {
  const frame = resolveRelayFrame({ width: 834 });
  const reading = inspectRelayFrame(frame, 'workWidth');
  assert.equal(reading.sensitivity.value, frame.values.workWidth);
  assert.equal(reading.sensitivity.derivatives.width, 1);
  const rail = inspectRelayFrame(frame, 'wide');
  assert.ok(
    rail.regimes.cells.some((cell) => cell.status === 'transition-bracket'),
  );
  assert.ok(rail.regimes.cells.some((cell) => cell.status === 'stable'));
  assert.equal(rail.inputKey, frame.inputKey);
  assert.throws(() => inspectRelayFrame(frame, 'invented'));
});

test('short windows reserve task height with stable compact chrome and preserve width/scale coupling', () => {
  const tall = resolveRelayFrame({ width: 1440, height: 1000 }),
    short = resolveRelayFrame({ width: 1440, height: 260 });
  assert.equal(tall.values.wide, 1);
  assert.equal(tall.values.compactChrome, 0);
  assert.equal(short.values.wide, 0);
  assert.equal(short.values.compactChrome, 1);
  assert.ok(short.values.workWidth > tall.values.workWidth);
  const enlarged = resolveRelayFrame({
    width: 834,
    height: 390,
    textScale: 1.5 * 1.3,
  });
  assert.equal(enlarged.values.compactChrome, 1);
  assert.equal(enlarged.vertical.status, 'predicted');
  assert.equal(
    enlarged.values.predictedTaskHeight,
    390 - enlarged.values.compactChromeHeight,
  );
  const impossible = resolveRelayFrame({
    width: 390,
    height: 100,
    textScale: 3,
  });
  assert.equal(impossible.values.compactChrome, 1);
  assert.equal(impossible.vertical.fits, false);
  assert.equal(
    resolveRelayFrame({ width: 390 }).vertical.status,
    'unavailable',
  );
  assert.equal(
    resolveRelayFrame({ width: 390, height: 0 }).status,
    'unsupported',
  );
  assert.equal(
    resolveRelayFrame({ width: 390, height: NaN }).status,
    'unsupported',
  );
  assert.equal(
    inspectRelayFrame(enlarged, 'predictedTaskHeight').sensitivity.derivatives
      .height,
    1,
  );
  assert.equal(
    resolveRelayFrame({ width: 1440, height: 260 }).inputKey,
    short.inputKey,
  );
});
