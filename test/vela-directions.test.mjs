import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveDesignRuntime } from '../dist/decision-runtime.js';

const read = (file) =>
  JSON.parse(
    readFileSync(new URL(`../examples/vela/${file}`, import.meta.url)),
  );
const momentum = read('design.generated.json'),
  notes = read('design.field-notes.generated.json');
test('independent directions retain identical task topology/content while binding distinct numeric programs', () => {
  assert.deepEqual(momentum.handoff.machine, notes.handoff.machine);
  assert.deepEqual(
    momentum.handoff.program.scenarios,
    notes.handoff.program.scenarios,
    'The directions share an explicitly common test matrix; these are samples, not admission limits',
  );
  assert.notEqual(
    momentum.handoff.machine.content.today.default,
    momentum.handoff.machine.content['today-expanded'].default,
  );
  assert.notEqual(momentum.handoff.identity, notes.handoff.identity);
  assert.notEqual(momentum.handoff.program.id, notes.handoff.program.id);
  for (const direction of [momentum, notes]) {
    assert.equal(direction.direction.kind, 'authored');
    assert.equal(direction.palette.summary.status, 'pass');
    assert.equal(direction.selection.modelCalled, false);
    for (const scenario of [
      { width: 320, height: 740, textScale: 2 },
      { width: 844, height: 320, textScale: 1.5 },
      { width: 834, height: 1194, textScale: 1 },
      { width: 1440, height: 1000, textScale: 1 },
    ])
      assert.equal(
        resolveDesignRuntime(direction.handoff, {
          ...scenario,
          reducedMotion: 1,
        }).admissible,
        true,
      );
  }
  assert.ok(
    notes.handoff.assignment.display < momentum.handoff.assignment.display,
  );
  assert.ok(
    notes.handoff.assignment.radius < momentum.handoff.assignment.radius,
  );
  const scenario = { width: 390, height: 844, textScale: 1, reducedMotion: 0 };
  assert.ok(
    resolveDesignRuntime(notes.handoff, scenario).values.pageDistance <
      resolveDesignRuntime(momentum.handoff, scenario).values.pageDistance,
  );
});

test('responsive equations accept positive widths/heights beyond the sampled matrix', () => {
  const widths = [
    1, 1.25, 13.3, 64, 160, 240, 280, 319, 390, 834, 1440, 1920, 2560, 3840,
    7680, 16384, 1000000,
  ];
  const heights = [1, 80, 160, 200, 319, 320, 844, 1210, 1800, 2160, 1000000];
  for (const policy of [momentum, notes])
    for (const width of widths)
      for (const height of heights)
        for (const textScale of [1, 2, 3.6]) {
          const result = resolveDesignRuntime(policy.handoff, {
            width,
            height,
            textScale,
            reducedMotion: 1,
          });
          assert.equal(
            result.admissible,
            true,
            JSON.stringify({
              width,
              height,
              textScale,
              failures: result.failures,
            }),
          );
          assert.ok(Object.values(result.values).every(Number.isFinite));
          assert.ok(result.values.titleSize >= result.values.body);
          assert.ok(result.values.timerSize >= result.values.body);
          assert.ok(
            result.values.contentWidth > 0 &&
              result.values.contentWidth <= 1120,
          );
          if (height <= 160)
            assert.equal(
              result.regions.active.screen.persistentActions,
              0,
              'Short windows must use inline scrollable actions',
            );
        }
});
