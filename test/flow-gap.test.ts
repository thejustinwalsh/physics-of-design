import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFlowGap } from '../src/flow-gap.js';
import { analyzeComposition } from '../src/composition.js';

const control = {
  currentGap: 20,
  preferredGap: 20,
  minimumGap: 8,
  maximumGap: 20,
  step: 0.25,
  endClearance: 4,
  targets: [{ member: 'action', intervalsBefore: 1 }],
  source: 'Synthetic authored spacing fixture',
};
test('bounded gap projection repairs the measured short-window overflow without changing target size', () => {
  const observation = {
    extent: 232,
    regions: [
      { id: 'action', start: 191.765625, end: 235.765625, crossAxisFits: true },
    ],
  };
  const before = structuredClone(observation);
  const result = projectFlowGap(control, observation);
  assert.equal(result.status, 'proposed');
  assert.equal(result.suggestedGap, 12);
  assert.equal(result.requiresRendererVerification, true);
  assert.equal(result.predicted[0]!.end - result.predicted[0]!.start, 44);
  assert.ok(
    result.predicted[0]!.end <= observation.extent - control.endClearance,
  );
  assert.deepEqual(observation, before);
});
test('cross-axis, fixed-position and contradictory targets remain infeasible; missing facts remain unknown', () => {
  for (const region of [
    { id: 'action', start: 0, end: 44, crossAxisFits: false },
    { id: 'action', start: 0, end: 400, crossAxisFits: true },
  ])
    assert.equal(
      projectFlowGap(control, { extent: 200, regions: [region] }).status,
      'infeasible',
    );
  assert.equal(
    projectFlowGap(
      { ...control, targets: [{ member: 'action', intervalsBefore: 0 }] },
      {
        extent: 200,
        regions: [{ id: 'action', start: 180, end: 224, crossAxisFits: true }],
      },
    ).status,
    'infeasible',
  );
  assert.equal(
    projectFlowGap(control, {
      extent: 200,
      regions: [{ id: 'action', start: null, end: null, crossAxisFits: null }],
    }).status,
    'unavailable',
  );
  assert.throws(
    () => projectFlowGap(control, { extent: 200, regions: [] }),
    /Missing/,
  );
  assert.throws(
    () =>
      projectFlowGap(
        { ...control, minimumGap: 30 },
        { extent: 200, regions: [] },
      ),
    /minimumGap/,
  );
});
test('projection is the closest preferred feasible grid point in a deterministic finite reference search', () => {
  for (let seed = 0; seed < 100; seed++) {
    const count = seed % 4,
      start = ((seed * 7) % 60) - 20,
      end = start + 20 + (seed % 20);
    const c = {
      ...control,
      currentGap: 10,
      preferredGap: seed % 25,
      minimumGap: 0,
      maximumGap: 20,
      step: 0.5,
      targets: [{ member: 'action', intervalsBefore: count }],
    };
    const result = projectFlowGap(c, {
      extent: 60,
      regions: [{ id: 'action', start, end, crossAxisFits: true }],
    });
    const feasible = Array.from({ length: 41 }, (_, i) => i * 0.5).filter(
      (gap) =>
        start + count * (gap - c.currentGap) >= 0 &&
        end + count * (gap - c.currentGap) <= 56,
    );
    if (!feasible.length) assert.equal(result.status, 'infeasible');
    else {
      assert.equal(result.status, 'proposed');
      assert.ok(feasible.includes(result.suggestedGap!));
      assert.equal(
        (result.suggestedGap! - c.preferredGap) ** 2,
        Math.min(...feasible.map((gap) => (gap - c.preferredGap) ** 2)),
      );
    }
  }
});
test('composition applies logical RTL flow while zero-area targets cannot produce a spacing proposal', () => {
  const input = {
    viewport: { width: 100, height: 50 },
    rectangles: [{ id: 'action', box: { x: 5, y: 0, width: 20, height: 20 } }],
    context: { flow: 'row' as const, direction: 'rtl' as const },
    gapProjection: { ...control, endClearance: 10 },
  };
  assert.equal(
    analyzeComposition(input).exposure.gapProjection!.suggestedGap,
    15,
  );
  input.rectangles[0]!.box.width = 0;
  assert.equal(
    analyzeComposition(input).exposure.gapProjection!.status,
    'unavailable',
  );
});

test('decimal grid boundaries are reconstructed and checked without relaxing containment', () => {
  const gap = 3 * 0.1;
  const result = projectFlowGap(
    {
      ...control,
      currentGap: gap,
      preferredGap: gap,
      minimumGap: 0,
      maximumGap: gap,
      step: 0.1,
      endClearance: 0,
    },
    {
      extent: 1,
      regions: [{ id: 'action', start: 0, end: 1, crossAxisFits: true }],
    },
  );
  assert.equal(result.suggestedGap, gap);
  assert.deepEqual(result.predicted, [{ id: 'action', start: 0, end: 1 }]);
  const outside = projectFlowGap(
    {
      ...control,
      currentGap: gap,
      preferredGap: gap,
      minimumGap: 0,
      maximumGap: 0.3,
      step: 0.1,
      endClearance: 0,
    },
    {
      extent: 1,
      regions: [{ id: 'action', start: 0, end: 1, crossAxisFits: true }],
    },
  );
  assert.equal(
    outside.status,
    'infeasible',
    'The generated .30000000000000004 may not exceed an authored .3 bound',
  );
});

test('decimal-grid projections match exhaustive represented-coordinate feasibility', () => {
  for (const step of [0.1, 0.2, 0.3, 0.07])
    for (let seed = 0; seed < 100; seed++) {
      const c = {
        ...control,
        minimumGap: 0.1,
        maximumGap: 4,
        currentGap: 0.1 + (seed % 30) * step,
        preferredGap: (seed % 40) / 10,
        step,
        endClearance: 0.1,
        targets: [{ member: 'action', intervalsBefore: 1 + (seed % 3) }],
      };
      const start = (seed % 13) / 10,
        end = start + 1,
        extent = 1 + (seed % 20) / 10;
      const feasible = Array.from(
        { length: 60 },
        (_, i) => c.minimumGap + i * step,
      )
        .filter(
          (g) =>
            g <= c.maximumGap &&
            start + c.targets[0]!.intervalsBefore * (g - c.currentGap) >= 0 &&
            end + c.targets[0]!.intervalsBefore * (g - c.currentGap) <=
              extent - c.endClearance,
        )
        .sort(
          (a, b) =>
            Math.abs(a - c.preferredGap) - Math.abs(b - c.preferredGap) ||
            a - b,
        );
      const actual = projectFlowGap(c, {
        extent,
        regions: [{ id: 'action', start, end, crossAxisFits: true }],
      });
      assert.equal(
        actual.suggestedGap,
        feasible[0] ?? null,
        `step=${step}, seed=${seed}`,
      );
    }
});
