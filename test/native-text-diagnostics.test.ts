import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nativeLineProbes,
  nativeTextLayoutIdentity,
  acceptNativeLineProbe,
  diagnoseNativeTextWidths,
  type NativeTextLine,
} from '../src/native-text-diagnostics.js';
// Raw RN0.88 Android receipt values, android-default-current/detail.json.
const lines: NativeTextLine[] = [
  {
    text: 'A simple structure for purposeful ',
    x: 0,
    y: 0,
    width: 280.5416564941406,
    height: 28.571428298950195,
  },
  {
    text: 'movement. You choose the activity and ',
    x: 0,
    y: 28.571428298950195,
    width: 333.05804443359375,
    height: 28.571428298950195,
  },
  {
    text: 'effort.',
    x: 0,
    y: 57.14285659790039,
    width: 51.376487731933594,
    height: 28.571428298950195,
  },
];
const text = lines.map((l) => l.text).join(''),
  width = 331.4285888671875;
const input = {
  platform: 'android',
  plain: true,
  knownStyle: true,
  text,
  styleIdentity: 'Lato19-scale1',
  measuredStyleIdentity: 'Lato19-scale1',
  width,
  lines,
};
const box = { width, height: 85.71429443359375 };

test('actual Android whitespace fixture is unknown, never silently passed or failed as glyph overflow', () => {
  const diagnostic = diagnoseNativeTextWidths({
    platform: 'android',
    box,
    lines,
  });
  assert.equal(diagnostic[1]!.status, 'unknown');
  const requests = nativeLineProbes(input);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.lineIndex, 1);
  assert.equal(requests[0]!.text, 'movement. You choose the activity and');
  assert.equal(lines[1]!.width, 333.05804443359375);
});

test('a separately observed exact native line binds the only alternate extent; no tolerance inflation', () => {
  const probe = nativeLineProbes(input)[0]!;
  // Synthetic callback vectors test acceptance semantics, not a claimed native trimmed measurement.
  const evidence = acceptNativeLineProbe(probe, [
    { ...lines[1]!, text: probe.text, width: 330 },
  ])!;
  const observed = lines.map((line, i) =>
    i === 1 ? { ...line, contentAdvanceEvidence: evidence } : line,
  );
  const identity = nativeTextLayoutIdentity(
    text,
    input.styleIdentity,
    lines,
    width,
  );
  assert.equal(
    diagnoseNativeTextWidths({
      platform: 'android',
      box,
      lines: observed,
      textLayoutIdentity: identity,
    })[1]!.status,
    'pass',
  );
  assert.equal(observed[1]!.width, lines[1]!.width);
  const overflowing = observed.map((line, i) =>
    i === 1
      ? {
          ...line,
          contentAdvanceEvidence: { ...evidence, contentAdvance: 333.058 },
        }
      : line,
  );
  assert.equal(
    diagnoseNativeTextWidths({
      platform: 'android',
      box,
      lines: overflowing,
      textLayoutIdentity: identity,
    })[1]!.status,
    'fail',
  );
  assert.equal(
    diagnoseNativeTextWidths({
      platform: 'android',
      box,
      lines: observed,
      textLayoutIdentity: 'stale',
    })[1]!.status,
    'unknown',
  );
});

test('historical1.700928dp unspaced overflow remains a failure', () => {
  const line = {
    text: 'averylongunspacedwordwithmanylettersandnobr',
    x: 0,
    y: 0,
    width: 661.5104370117188,
    height: 44.9523811340332,
  };
  assert.equal(
    diagnoseNativeTextWidths({
      platform: 'android',
      box: { width: 659.8095092773438, height: 134.85714721679688 },
      lines: [line],
    })[0]!.status,
    'fail',
  );
});

test('nested or unknown style, stale layout, non-LTR and explicit newline cannot obtain probe evidence', () => {
  for (const changed of [
    { plain: false },
    { knownStyle: false },
    { measuredStyleIdentity: 'old' },
    { platform: 'ios' },
    { text: 'changed' },
  ])
    assert.deepEqual(nativeLineProbes({ ...input, ...changed }), []);
  const shifted = lines.map((l, i) => (i === 1 ? { ...l, x: 3 } : l));
  assert.deepEqual(nativeLineProbes({ ...input, lines: shifted }), []);
  const newline = lines.map((l, i) =>
    i === 1 ? { ...l, text: l.text + '\n' } : l,
  );
  assert.deepEqual(
    nativeLineProbes({
      ...input,
      lines: newline,
      text: newline.map((l) => l.text).join(''),
    }),
    [],
  );
});

test('probe callbacks must be exact, single-line, finite and within their native measure', () => {
  const probe = nativeLineProbes(input)[0]!;
  const line = { ...lines[1]!, text: probe.text };
  assert.equal(acceptNativeLineProbe(probe, []), null);
  assert.equal(acceptNativeLineProbe(probe, [line, line]), null);
  for (const changed of [
    { text: 'other' },
    { width: Infinity },
    { width: probe.width + 1 },
    { x: 1 },
  ])
    assert.equal(acceptNativeLineProbe(probe, [{ ...line, ...changed }]), null);
});
