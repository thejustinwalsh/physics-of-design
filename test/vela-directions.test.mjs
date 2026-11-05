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
    'The shared viewport guard requires an explicitly common envelope',
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
