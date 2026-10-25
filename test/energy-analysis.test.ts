import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEnergy } from '../src/energy-analysis.js';
import { searchEnergy, type EnergyProgram } from '../src/energy.js';
const program: EnergyProgram = {
  version: 1,
  id: 'pressure',
  brief: { intent: 'Prefer a specific local target', source: 'test' },
  identity: {},
  variables: [{ id: 'x', unit: 'px', values: [0, 1, 2, 3, 4] }],
  scenarios: [{ id: 'base', values: {} }],
  derived: [],
  factors: [
    {
      id: 'target',
      expression: { ref: 'x' },
      bands: [{ min: 3, max: 3 }],
      scale: 1,
      mode: 'preference',
      weight: 1,
      category: 'brief',
      provenance: { kind: 'brief', source: 'test' },
    },
  ],
};
test('finite differences expose the exact local quadratic pressure and retain units', () => {
  const a = analyzeEnergy({ program, assignment: { x: 2 } });
  assert.equal(a.effects[0]!.negativeEnergySlope, 2);
  assert.equal(a.effects[0]!.unit, 'px');
  assert.equal(a.effects[0]!.probes.length, 2);
});
test('choice graph records unique evaluated mutations and reconstructs a selected state', () => {
  const p = structuredClone(program);
  p.variables.push({ id: 'y', unit: 'px', values: [0, 1, 2, 3, 4] });
  p.factors.push({
    ...p.factors[0]!,
    id: 'other',
    expression: { ref: 'y' },
    bands: [{ min: 4, max: 4 }],
  });
  const result = searchEnergy({
    program: p,
    options: { method: 'beam', maxEvaluations: 20, rounds: 5 },
  });
  const map = new Map(result.choiceGraph.nodes.map((n) => [n.id, n]));
  assert.equal(map.size, result.statistics.evaluated);
  for (const candidate of result.candidates) {
    let node = map.get(candidate.id)!;
    const path = [];
    while (node.parent) {
      path.unshift(node.choice!);
      node = map.get(node.parent)!;
      assert.ok(node);
    }
    const values = { ...node.seed! };
    for (const choice of path) {
      assert.equal(values[choice.variable], choice.from);
      values[choice.variable] = choice.to;
    }
    assert.deepEqual(values, candidate.assignment);
  }
});
test('work and retained-observation budgets bound large scenario/factor products', () => {
  const result = searchEnergy({
    program,
    options: {
      method: 'exhaustive',
      maxEvaluations: 100000,
      maxFactorObservations: 2,
      maxExpressionOperations: 2,
    },
  });
  assert.equal(result.statistics.evaluated, 2);
  assert.equal(result.statistics.factorEvaluations, 2);
  assert.equal(result.statistics.complete, false);
});
