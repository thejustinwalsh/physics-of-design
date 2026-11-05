import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeComposition } from '../src/composition.js';
const base = {
  viewport: { width: 100, height: 200 },
  rectangles: [
    { id: 'action', box: { x: 10, y: 180, width: 40, height: 40 } },
    { id: 'missing', box: { x: 0, y: 0, width: 0, height: 10 } },
  ],
  exposureRules: [
    {
      id: 'initial-action',
      member: 'action',
      minimumVisibleFraction: 1,
      latestEndFraction: 0.65,
      mode: 'preference' as const,
      source: 'Authored task priority',
    },
  ],
};
test('task exposure separates clipped area, position and authored preference', () => {
  const a = analyzeComposition(base).exposure;
  assert.equal(a.regions[0]!.visibleFraction, 0.5);
  assert.equal(a.regions[0]!.startFraction, 0.9);
  assert.equal(a.regions[0]!.endFraction, 1.1);
  assert.equal(a.rules[0]!.pass, false);
  assert.equal(a.rules[0]!.tests[0]!.residual, 0.5);
  const shifted = structuredClone(base);
  shifted.rectangles[0]!.box.y = 80;
  assert.equal(analyzeComposition(shifted).exposure.rules[0]!.pass, true);
});
test('zero-area targets stay unknown; unknown references and empty policies cannot pass', () => {
  const r = analyzeComposition({
    ...base,
    exposureRules: [{ ...base.exposureRules[0]!, member: 'missing' }],
  });
  assert.equal(r.exposure.rules[0]!.pass, null);
  assert.equal(r.exposure.regions[1]!.visibleFraction, null);
  assert.throws(
    () =>
      analyzeComposition({
        ...base,
        exposureRules: [{ ...base.exposureRules[0]!, member: 'absent' }],
      }),
    /unknown rectangle/,
  );
  assert.throws(
    () =>
      analyzeComposition({
        ...base,
        exposureRules: [
          {
            id: 'empty',
            member: 'action',
            mode: 'constraint',
            source: 'Caller',
          },
        ],
      }),
    /target/,
  );
});
test('exposure is scale invariant and horizontal RTL follows declared flow', () => {
  const scaled = {
    ...base,
    viewport: { width: 200, height: 400 },
    rectangles: base.rectangles.map((r) => ({
      ...r,
      box: Object.fromEntries(
        Object.entries(r.box).map(([k, v]) => [k, v * 2]),
      ),
    })),
  };
  assert.deepEqual(
    analyzeComposition(scaled).exposure,
    analyzeComposition(base).exposure,
  );
  const row = analyzeComposition({
    viewport: { width: 100, height: 200 },
    rectangles: [
      { id: 'action', box: { x: 70, y: 10, width: 20, height: 40 } },
    ],
    context: { flow: 'row', direction: 'rtl' },
  });
  assert.equal(row.exposure.regions[0]!.startFraction, 0.1);
  assert.equal(row.exposure.regions[0]!.endFraction, 0.3);
});

test('unrepresentable normalized positions remain unknown instead of emitting infinity or passing targets', () => {
  const r = analyzeComposition({
    viewport: { width: 1e-320, height: 100 },
    context: { flow: 'row' },
    rectangles: [{ id: 'action', box: { x: 1e6, y: 0, width: 1, height: 1 } }],
    exposureRules: [
      {
        id: 'visible',
        member: 'action',
        minimumVisibleFraction: 1,
        mode: 'constraint',
        source: 'Caller',
      },
    ],
  });
  assert.equal(r.exposure.regions[0]!.status, 'unavailable');
  assert.equal(r.exposure.regions[0]!.startFraction, null);
  assert.match(r.exposure.regions[0]!.reason!, /finite numeric range/);
  assert.equal(r.exposure.rules[0]!.pass, null);
});
