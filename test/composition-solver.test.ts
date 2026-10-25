import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { solveComposition } from '../src/composition-solver.js';
import type { EnergyProgram, Expression } from '../src/energy.js';
import type { DesignHandoffInput } from '../src/decision-machine.js';

const ref = (name: string): Expression => ({ ref: name });
function fixture(): {
  program: EnergyProgram;
  machine: DesignHandoffInput['machine'];
} {
  return {
    program: {
      version: 1,
      id: 'solver-review',
      brief: {
        intent:
          'Prefer the declared target while preserving valid alternatives',
        source: 'test',
      },
      identity: {},
      variables: [{ id: 'x', unit: 'ratio', values: [0, 1, 2, 3, 4] }],
      scenarios: [{ id: 'base', values: {} }],
      derived: [],
      factors: [
        {
          id: 'target',
          expression: ref('x'),
          bands: [{ min: 4, max: 4 }],
          scale: 1,
          mode: 'preference',
          weight: 1,
          category: 'brief',
          provenance: { kind: 'brief', source: 'fixture' },
        },
      ],
    },
    machine: {
      id: 'solver-machine',
      initial: 'main',
      states: [
        {
          id: 'main',
          purpose: 'Fixture',
          regions: [
            { id: 'body', role: 'main', bindings: { width: ref('x') } },
          ],
          on: [],
        },
      ],
      motions: {},
      buildContract: {
        layout: 'flex',
        web: 'React + StyleX',
        native: 'React Native Text + Yoga',
        requirements: ['Fixture, not a real renderer receipt'],
      },
    },
  };
}

test('unchanged normalized search policy replays its exact composition recipe', async () => {
  const input = fixture();
  const first = await solveComposition(input);
  assert.ok('recipe' in first);
  const again = await solveComposition({
    ...input,
    recipe: first.recipe,
    options: {
      method: 'auto',
      maxEvaluations: 4096,
      beamWidth: 16,
      rounds: 12,
      limit: 6,
    },
  });
  assert.equal(again.status, 'replayed');
  assert.deepEqual(again.handoff!.assignment, first.handoff!.assignment);
  assert.equal(again.statistics.evaluated, 0);
  assert.equal(again.statistics.selectorCalls, 0);
});

test('increased search budget invalidates a recipe and finds the newly reachable target', async () => {
  const input = fixture();
  const first = await solveComposition({
    ...input,
    options: { method: 'exhaustive', maxEvaluations: 1 },
  });
  assert.ok('recipe' in first);
  assert.equal(first.handoff!.assignment.x, 0);
  const improved = await solveComposition({
    ...input,
    recipe: first.recipe,
    options: { method: 'exhaustive', maxEvaluations: 5 },
  });
  assert.equal(improved.status, 'proposed');
  assert.equal(improved.handoff!.assignment.x, 4);
  assert.equal(improved.statistics.evaluated, 5);
  assert.ok('recipe' in improved);
  assert.notEqual(improved.recipe.policyIdentity, first.recipe.policyIdentity);
});

test('machine-invalid numeric candidates are filtered before choice and valid alternatives survive', async () => {
  const input = fixture();
  input.program.variables[0]!.values = [-1, 1];
  input.program.factors[0]!.bands = [{ min: -1, max: -1 }];
  input.machine.states[0]!.regions[0]!.bindings.width = {
    op: 'sqrt',
    args: [ref('x')],
  };
  const result = await solveComposition(input);
  assert.equal(result.status, 'proposed');
  assert.deepEqual(result.handoff!.assignment, { x: 1 });
  assert.ok('candidates' in result);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.assignment),
    [{ x: 1 }],
  );
  assert.match(result.invalid[0]!.reason, /Nonfinite sqrt/);
  assert.equal(result.statistics.selectorCalls, 0);
  input.program.variables[0]!.values = [-2, -1];
  const allInvalid = await solveComposition(input);
  assert.equal(allInvalid.status, 'no-admissible-candidate');
  assert.equal(allInvalid.handoff, null);
});

test('machine bindings are checked across every declared scenario', async () => {
  const input = fixture();
  input.program.variables[0]!.values = [0, 1];
  input.program.factors[0]!.bands = [{ min: 0, max: 0 }];
  input.program.scenarios = [
    { id: 'a', values: { available: 1 } },
    { id: 'b', values: { available: -1 } },
  ];
  input.machine.states[0]!.regions[0]!.bindings.width = {
    op: 'sqrt',
    args: [{ op: 'add', args: [ref('available'), ref('x')] }],
  };
  const result = await solveComposition(input);
  assert.equal(result.status, 'proposed');
  assert.equal(result.handoff!.assignment.x, 1);
  assert.ok('invalid' in result);
  assert.ok(result.invalid.some((candidate) => candidate.assignment.x === 0));
});

test('hard failures cannot be chosen despite extreme preference weight', async () => {
  const input = fixture();
  input.program.variables[0]!.values = [0, 1];
  input.program.factors[0]!.weight = 1e6;
  input.program.factors[0]!.bands = [{ min: 0, max: 0 }];
  input.program.factors.push({
    ...input.program.factors[0]!,
    id: 'required',
    bands: [{ min: 1, max: 1 }],
    mode: 'hard',
  });
  const result = await solveComposition(input);
  assert.equal(result.handoff!.assignment.x, 1);
  assert.ok('candidates' in result);
  assert.ok(
    result.candidates.every((candidate) => candidate.hardFailures === 0),
  );
  assert.equal(
    result.handoff!.verification.status,
    'pending-renderer-verification',
  );
});

test('selector policy and actual checkpoint bytes invalidate recipes even without a model call', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'composition-policy-test-'));
  try {
    const gguf = path.join(dir, 'fixture.gguf');
    await writeFile(gguf, 'protocol fixture, not actual model weights A');
    const input = fixture();
    input.program.variables[0]!.values = [1]; // No inference; still binds policy to checkpoint bytes.
    const selector = {
      gguf,
      profile: 'qwen3.5-4b' as const,
      readout: 'single' as const,
      maxPromptTokens: 4096,
    };
    const first = await solveComposition({ ...input, selector });
    assert.ok('recipe' in first);
    const repeated = await solveComposition({
      ...input,
      selector,
      recipe: first.recipe,
    });
    assert.equal(repeated.status, 'replayed');
    await writeFile(gguf, 'protocol fixture, not actual model weights B');
    const changedFile = await solveComposition({
      ...input,
      selector,
      recipe: first.recipe,
    });
    assert.equal(changedFile.status, 'proposed');
    assert.ok('recipe' in changedFile);
    assert.notEqual(
      changedFile.recipe.policyIdentity,
      first.recipe.policyIdentity,
    );
    const changedReadout = await solveComposition({
      ...input,
      selector: { ...selector, readout: 'balanced' },
      recipe: changedFile.recipe,
    });
    assert.equal(changedReadout.status, 'proposed');
    assert.equal(changedReadout.statistics.selectorCalls, 0);
    const changedTokens = await solveComposition({
      ...input,
      selector: { ...selector, maxPromptTokens: 2048 },
      recipe: changedFile.recipe,
    });
    assert.equal(changedTokens.status, 'proposed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
