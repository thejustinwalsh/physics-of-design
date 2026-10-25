import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileEnergy,
  searchEnergy,
  type EnergyProgram,
  type Expression,
} from '../src/energy.js';

const ref = (name: string): Expression => ({ ref: name });
const op = (
  operation: Exclude<Expression, number | { ref: string }>['op'],
  ...args: Expression[]
): Expression => ({ op: operation, args });
const factor = (
  id: string,
  expression: Expression,
  min = 0,
  max = min,
  mode: 'hard' | 'preference' = 'preference',
  weight = 1,
): EnergyProgram['factors'][number] => ({
  id,
  expression,
  bands: [{ min, max }],
  scale: 1,
  mode,
  weight,
  category: 'test-policy',
  provenance: { kind: 'brief', source: 'declared test target' },
});
function program(): EnergyProgram {
  return {
    version: 1,
    id: 'test-design',
    brief: {
      intent: 'Preserve the declared expressive targets',
      source: 'test',
    },
    identity: { policy: 'test-v1', tools: 'math-v1' },
    variables: [{ id: 'x', unit: 'ratio', values: [0, 1, 2] }],
    scenarios: [{ id: 'base', values: {} }],
    derived: [],
    factors: [factor('x-target', ref('x'), 1)],
  };
}

test('exhaustive search agrees with an independent coupled three-variable oracle', () => {
  const p = program();
  p.variables = ['x', 'y', 'z'].map((id) => ({
    id,
    unit: 'ratio',
    values: [-1, 0, 1],
  }));
  p.factors = [
    factor('sum-limit', op('add', ref('x'), ref('y')), -100, 1, 'hard'),
    factor('ordered', op('sub', ref('x'), ref('z')), 0, 100, 'hard'),
    factor(
      'coupled',
      op('sub', op('add', ref('x'), op('mul', 2, ref('y'))), ref('z')),
      1,
    ),
    factor(
      'difference',
      op('sub', ref('x'), ref('z')),
      0,
      0,
      'preference',
      0.3,
    ),
    factor('z-target', ref('z'), -1, -1, 'preference', 0.2),
  ];
  const oracle: { x: number; y: number; z: number; energy: number }[] = [];
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1])
      for (const z of [-1, 0, 1]) {
        if (x + y > 1 || x < z) continue;
        oracle.push({
          x,
          y,
          z,
          energy:
            (x + 2 * y - z - 1) ** 2 + 0.3 * (x - z) ** 2 + 0.2 * (z + 1) ** 2,
        });
      }
  const result = searchEnergy({
    program: p,
    options: { method: 'exhaustive', maxEvaluations: 27, limit: 24 },
  });
  assert.equal(result.statistics.evaluated, 27);
  assert.equal(result.statistics.complete, true);
  assert.equal(result.candidates.length, oracle.length);
  assert.ok(
    Math.abs(
      result.candidates[0]!.energy - Math.min(...oracle.map((x) => x.energy)),
    ) < 1e-12,
  );
  for (const actual of result.candidates) {
    const expected = oracle.find(
      (x) =>
        x.x === actual.assignment.x &&
        x.y === actual.assignment.y &&
        x.z === actual.assignment.z,
    )!;
    assert.ok(expected);
    assert.ok(Math.abs(actual.energy - expected.energy) < 1e-12);
    assert.equal(actual.status, 'mathematically-admissible');
  }
});

test('coupled hard constraints outrank an arbitrarily attractive soft alternative', () => {
  const p = program();
  p.variables = ['x', 'y'].map((id) => ({ id, unit: 'ratio', values: [0, 1] }));
  p.factors = [
    factor('exclusive', op('add', ref('x'), ref('y')), 1, 1, 'hard', 0),
    factor('x-preferred', ref('x'), 1, 1, 'preference', 1e6),
    factor('y-preferred', ref('y'), 1),
  ];
  const result = searchEnergy({ program: p });
  assert.deepEqual(result.candidates[0]!.assignment, { x: 1, y: 0 });
  assert.ok(
    result.candidates.every((x) => x.assignment.x! + x.assignment.y! === 1),
  );
  assert.ok(
    result.rejected.some((x) => x.assignment.x === 1 && x.assignment.y === 1),
  );
});

test('nonzero target bands and multiple wells preserve desirable tension', () => {
  const p = program();
  p.variables[0]!.values = [-0.3, 0, 0.3];
  p.factors = [factor('expressive-offset', ref('x'), 0.2, 0.4)];
  const oneWell = searchEnergy({ program: p });
  assert.equal(oneWell.candidates[0]!.assignment.x, 0.3);
  assert.equal(oneWell.candidates[0]!.energy, 0);
  p.factors[0]!.bands.push({ min: -0.4, max: -0.2 });
  const twoWells = searchEnergy({ program: p });
  assert.deepEqual(
    twoWells.candidates
      .filter((x) => x.energy === 0)
      .map((x) => x.assignment.x)
      .sort(),
    [-0.3, 0.3],
  );
  assert.ok(twoWells.candidates.find((x) => x.assignment.x === 0)!.energy > 0);
});

test('locked variables and deduplicated domains determine the actual search cardinality', () => {
  const p = program();
  p.variables = [
    { id: 'x', unit: 'ratio', values: [0, 1, 1, 2], locked: 2 },
    { id: 'y', unit: 'ratio', values: [0, 0, 1] },
  ];
  const result = searchEnergy({ program: p, options: { maxEvaluations: 2 } });
  assert.equal(result.statistics.cardinality, 2);
  assert.equal(result.statistics.evaluated, 2);
  assert.equal(result.statistics.complete, true);
  assert.ok(result.candidates.every((x) => x.assignment.x === 2));
  assert.throws(
    () =>
      compileEnergy({ ...p, variables: [{ ...p.variables[0], locked: 3 }] }),
    /outside domain/,
  );
});

test('factor, domain, brief, scenario, and tool identity changes invalidate program identity', () => {
  const p = program();
  const baseline = compileEnergy(p).identity;
  const changes: ((q: EnergyProgram) => void)[] = [
    (q) => {
      q.factors[0]!.weight = 2;
    },
    (q) => {
      q.factors[0]!.bands[0]!.min = 0;
    },
    (q) => {
      q.variables[0]!.values.push(3);
    },
    (q) => {
      q.brief.intent = 'A changed purpose';
    },
    (q) => {
      q.identity.tools = 'math-v2';
    },
    (q) => {
      q.scenarios[0]!.values.width = 390;
    },
    (q) => {
      q.factors[0]!.provenance.source = 'revised policy';
    },
  ];
  for (const change of changes) {
    const q = structuredClone(p);
    change(q);
    assert.notEqual(compileEnergy(q).identity, baseline);
  }
});

test('canonical input order and repeated runs preserve identity and ties', () => {
  const p = program();
  p.variables.push({ id: 'y', unit: 'ratio', values: [2, 0, 1, 1] });
  p.factors.push(factor('y-target', ref('y'), 1));
  p.scenarios.push({ id: 'second', values: {} });
  const q = structuredClone(p);
  q.variables.reverse();
  q.factors.reverse();
  q.scenarios.reverse();
  q.variables.forEach((x) => x.values.reverse());
  const a = searchEnergy({ program: p });
  const b = searchEnergy({ program: q });
  assert.equal(a.programIdentity, b.programIdentity);
  assert.deepEqual(a.candidates, b.candidates);
  assert.deepEqual(searchEnergy({ program: p }).candidates, a.candidates);
});

test('unique-state budgets return incomplete proposals without claiming an optimum', () => {
  const p = program();
  for (const method of ['exhaustive', 'beam'] as const) {
    const result = searchEnergy({
      program: p,
      options: { method, maxEvaluations: 1 },
    });
    assert.equal(result.statistics.evaluated, 1);
    assert.equal(result.statistics.complete, false);
    assert.equal(result.statistics.selectorCalls, 0);
    assert.equal(result.statistics.mainAgentCalls, 0);
    assert.equal(result.status, 'proposed');
    assert.match(result.scope, /not renderer verification/);
  }
});

test('all rejected states return rejection evidence and no false feasibility certificate', () => {
  const p = program();
  p.factors = [factor('impossible', ref('x'), 10, 10, 'hard')];
  const result = searchEnergy({ program: p });
  assert.equal(result.status, 'no-admissible-candidate');
  assert.equal(result.statistics.complete, true);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.rejected.length, 3);
  assert.ok(
    result.rejected.every(
      (x) => x.failures[0]!.provenance.source === 'declared test target',
    ),
  );
});

test('all scenarios must satisfy hard constraints while lazy topology branches stay valid', () => {
  const p = program();
  p.variables[0]!.values = [0, 1];
  p.scenarios = [
    { id: 'narrow', values: { width: 300 } },
    { id: 'wide', values: { width: 900 } },
  ];
  p.derived = [
    {
      id: 'topology',
      unit: 'ratio',
      provenance: { kind: 'calculated', source: 'test topology' },
      expression: op(
        'if',
        ref('x'),
        op('div', ref('width'), 2),
        op('if', 1, ref('width'), op('div', 1, 0)),
      ),
    },
  ];
  p.factors = [factor('minimum-measure', ref('topology'), 250, 1000, 'hard')];
  const result = searchEnergy({ program: p });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]!.assignment.x, 0);
  assert.deepEqual(result.candidates[0]!.derived, {
    narrow: { topology: 300 },
    wide: { topology: 900 },
  });
  assert.equal(result.rejected[0]!.failures[0]!.scenario, 'narrow');
});

test('invalid expressions, missing dependencies, and nonfinite arithmetic fail explicitly', () => {
  const p = program();
  assert.throws(
    () => compileEnergy({ ...p, factors: [factor('missing', ref('absent'))] }),
    /Unknown factor input/,
  );
  assert.throws(
    () => compileEnergy({ ...p, factors: [factor('arity', op('div', 1))] }),
    /requires 2/,
  );
  assert.throws(() =>
    compileEnergy({ ...p, factors: [{ ...p.factors[0], scale: 0 }] }),
  );
  assert.throws(
    () =>
      compileEnergy({
        ...p,
        derived: [
          {
            id: 'cycle',
            expression: ref('cycle'),
            unit: 'ratio',
            provenance: { kind: 'calculated', source: 'test' },
          },
        ],
      }),
    /cyclic/,
  );
  for (const expression of [op('div', 1, 0), op('log2', 0), op('sqrt', -1)]) {
    assert.throws(
      () =>
        compileEnergy({ ...p, factors: [factor('bad', expression)] }).evaluate({
          x: 1,
        }),
      /Nonfinite/,
    );
  }
  assert.throws(
    () =>
      compileEnergy({ ...p, factors: [factor('overflow', 1e308)] }).evaluate({
        x: 1,
      }),
    /Nonfinite factor/,
  );
  assert.throws(
    () =>
      compileEnergy({
        ...p,
        factors: [factor('huge-a', 1e154), factor('huge-b', 1e154)],
      }).evaluate({ x: 1 }),
    /Nonfinite aggregate/,
  );
});

test('compiled identity cannot be detached from its program by mutating exposed objects', () => {
  const p = program();
  const compiled = compileEnergy(p);
  const before = compiled.evaluate({ x: 0 });
  p.factors[0]!.bands[0]!.min = 0;
  try {
    compiled.program.factors[0]!.bands[0]!.min = 0;
  } catch {
    /* frozen objects reject edits */
  }
  try {
    before.factors[0]!.provenance.source = 'altered receipt';
  } catch {
    /* frozen objects reject edits */
  }
  const after = compiled.evaluate({ x: 0 });
  assert.equal(after.energy, 1);
  assert.equal(after.factors[0]!.provenance.source, 'declared test target');
  assert.equal(compileEnergy(compiled.program).identity, compiled.identity);
});

test('hundreds of coupled states are evaluated without model or renderer calls', () => {
  const p = program();
  p.variables = Array.from({ length: 7 }, (_, i) => ({
    id: `x${i}`,
    unit: 'ratio',
    values: [0, 1, 2],
  }));
  p.factors = p.variables.map((v, i) =>
    factor(
      `coupling-${i}`,
      op('sub', ref(v.id), ref(p.variables[(i + 1) % p.variables.length]!.id)),
    ),
  );
  const result = searchEnergy({
    program: p,
    options: { method: 'exhaustive', maxEvaluations: 700 },
  });
  assert.equal(result.statistics.evaluated, 700);
  assert.equal(result.statistics.factorEvaluations, 4900);
  assert.equal(result.statistics.selectorCalls, 0);
  assert.equal(result.statistics.mainAgentCalls, 0);
  assert.equal(result.statistics.complete, false);
});

test('disabled optional factors are absent and normalized programs remain replayable', () => {
  const p = program();
  p.factors = [
    factor('optional-music', op('div', 1, 0), 0, 0, 'preference', 0),
  ];
  const result = searchEnergy({ program: p });
  assert.equal(result.candidates.length, 3);
  assert.ok(result.candidates.every((candidate) => candidate.energy === 0));
  assert.ok(
    result.candidates.every((candidate) => candidate.factors.length === 0),
  );
  assert.equal(compileEnergy(result.program).identity, result.programIdentity);
});

test('undefined candidate arithmetic retains valid alternatives and consumes bounded attempts', () => {
  const p = program();
  p.factors = [factor('reciprocal', op('div', 1, ref('x')), 1)];
  const result = searchEnergy({ program: p });
  assert.equal(result.statistics.evaluated, 3);
  assert.equal(result.statistics.complete, true);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0]!.assignment.x, 1);
  assert.equal(result.invalid.length, 1);
  assert.equal(result.invalid[0]!.assignment.x, 0);
  assert.match(result.invalid[0]!.reason, /Nonfinite div/);
});

test('beam recovers from three invalid numeric seeds without abandoning the remaining budget', () => {
  const p = program();
  p.variables[0]!.values = [0, 1, 2, 3, 4];
  p.factors = [
    factor(
      'singular-seeds',
      op(
        'div',
        1,
        op('mul', ref('x'), op('sub', ref('x'), 2), op('sub', ref('x'), 4)),
      ),
    ),
  ];
  const beam = searchEnergy({
    program: p,
    options: { method: 'beam', maxEvaluations: 100 },
  });
  const exhaustive = searchEnergy({
    program: p,
    options: { method: 'exhaustive', maxEvaluations: 100 },
  });
  assert.equal(beam.statistics.evaluated, 5);
  assert.equal(beam.invalid.length, 3);
  assert.deepEqual(
    beam.candidates.map((candidate) => candidate.assignment),
    exhaustive.candidates.map((candidate) => candidate.assignment),
  );
  assert.deepEqual(
    beam.candidates.map((candidate) => candidate.assignment.x).sort(),
    [1, 3],
  );
  assert.equal(beam.statistics.factorEvaluations, 5);
  const limited = searchEnergy({
    program: p,
    options: { method: 'beam', maxEvaluations: 4 },
  });
  assert.equal(limited.statistics.evaluated, 4);
  assert.equal(limited.candidates.length, 1);
});
