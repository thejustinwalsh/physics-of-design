import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateExpression, type Expression } from '../src/math-expression.js';
import {
  differentiateExpression,
  mapExpressionRegimes,
} from '../src/layout-calculus.js';
import {
  adjacentFloat,
  classifyEnclosureBands,
  encloseExpression,
  type ExpressionEnclosure,
} from '../src/math-enclosure.js';
import { analyzeEnergy } from '../src/energy-analysis.js';
import type { EnergyProgram } from '../src/energy.js';

const ref = (name: string): Expression => ({ ref: name });
const op = (
  name: Exclude<Expression, number | { ref: string }>['op'],
  ...args: Expression[]
): Expression => ({ op: name, args });
const bounded = (value: ExpressionEnclosure) => {
  assert.equal(value.status, 'bounded');
  if (value.status !== 'bounded') throw Error(value.reason);
  return value;
};
const near = (value: number | null | undefined, expected: number) => {
  assert.equal(typeof value, 'number');
  assert.ok(
    Math.abs(value! - expected) < 1e-10 * Math.max(1, Math.abs(expected)),
    `${value} != ${expected}`,
  );
};

test('adjacent doubles preserve signs, subnormals, carry, extrema and inverse steps', () => {
  for (const value of [
    -Number.MAX_VALUE,
    -2,
    -1,
    -Number.MIN_VALUE,
    0,
    Number.MIN_VALUE,
    1,
    2,
    Number.MAX_VALUE,
  ]) {
    const lower = adjacentFloat(value, -1),
      upper = adjacentFloat(value, 1);
    assert.ok(lower < value && upper > value);
    assert.equal(adjacentFloat(lower, 1) || 0, value || 0);
    assert.equal(adjacentFloat(upper, -1) || 0, value || 0);
  }
  assert.equal(adjacentFloat(Infinity, -1), Number.MAX_VALUE);
  assert.equal(adjacentFloat(-Infinity, 1), -Number.MAX_VALUE);
  assert.throws(() => adjacentFloat(NaN, 1));
});

// Independent exact-rational oracle for basic IEEE inputs, including values
// such as 0.1 whose represented binary value is not the decimal fraction 1/10.
type Rational = { n: bigint; d: bigint };
const rational = (value: number): Rational => {
  assert.ok(Number.isFinite(value));
  if (value === 0) return { n: 0n, d: 1n };
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0),
    exponent = Number((bits >> 52n) & 2047n),
    mantissa = bits & ((1n << 52n) - 1n);
  let n = exponent === 0 ? mantissa : (1n << 52n) + mantissa;
  const power = (exponent === 0 ? -1022 : exponent - 1023) - 52;
  if (value < 0) n = -n;
  return power < 0
    ? { n, d: 1n << BigInt(-power) }
    : { n: n << BigInt(power), d: 1n };
};
const add = (a: Rational, b: Rational): Rational => ({
  n: a.n * b.d + b.n * a.d,
  d: a.d * b.d,
});
const mul = (a: Rational, b: Rational): Rational => ({
  n: a.n * b.n,
  d: a.d * b.d,
});
const div = (a: Rational, b: Rational): Rational =>
  b.n < 0n ? { n: -a.n * b.d, d: -a.d * b.n } : { n: a.n * b.d, d: a.d * b.n };
const contains = (result: ExpressionEnclosure, exact: Rational) => {
  const { interval } = bounded(result),
    lo = rational(interval.min),
    hi = rational(interval.max);
  assert.ok(
    lo.n * exact.d <= exact.n * lo.d && hi.n * exact.d >= exact.n * hi.d,
    JSON.stringify(interval),
  );
};

test('outward enclosures contain exact rational operations, not only rounded JS samples', () => {
  const values = [
    Number.MIN_VALUE,
    -Number.MIN_VALUE,
    0.1,
    -0.3,
    1 / 3,
    2 ** -500,
    2 ** 500,
    7,
  ];
  for (const x of values)
    for (const y of values) {
      const boxes = { x: { min: x, max: x }, y: { min: y, max: y } };
      contains(
        encloseExpression(op('add', ref('x'), ref('y')), boxes),
        add(rational(x), rational(y)),
      );
      contains(
        encloseExpression(op('sub', ref('x'), ref('y')), boxes),
        add(rational(x), mul(rational(-1), rational(y))),
      );
      contains(
        encloseExpression(op('mul', ref('x'), ref('y')), boxes),
        mul(rational(x), rational(y)),
      );
      const result = encloseExpression(op('div', ref('x'), ref('y')), boxes);
      if (result.status === 'bounded')
        contains(result, div(rational(x), rational(y)));
      else assert.match(result.reason, /overflow|unbounded/);
    }
});

test('composed bounds cover independent exact geometry calculations throughout a box', () => {
  const expression = op(
    'add',
    op('mul', op('div', ref('width'), 7), ref('scale')),
    ref('gap'),
  );
  const result = bounded(
    encloseExpression(expression, {
      width: { min: 320, max: 1920 },
      scale: { min: 1, max: 1.5 },
      gap: { min: 8, max: 24 },
    }),
  );
  assert.equal(result.affineWithinBox, false);
  for (let i = 0; i <= 40; i++) {
    const width = 320 + i * 40,
      scale = 1 + (i % 5) / 8,
      gap = 8 + (i % 9) * 2;
    const exact = add(
      mul(div(rational(width), rational(7)), rational(scale)),
      rational(gap),
    );
    contains(result, exact);
  }
});

test('domain, unsupported arithmetic, overflow and cyclic references stay unresolved', () => {
  for (const expression of [
    op('div', 1, ref('x')),
    op('sqrt', ref('x')),
    op('log2', ref('x')),
    op('pow', 2, ref('x')),
    op('mul', Number.MAX_VALUE, 2),
  ])
    assert.equal(
      encloseExpression(expression, { x: { min: -1, max: 1 } }).status,
      'unknown',
    );
  assert.equal(
    encloseExpression(ref('a'), {}, { a: ref('b'), b: ref('a') }).status,
    'unknown',
  );
  assert.equal(encloseExpression(ref('toString'), {}).status, 'unknown');
  assert.equal(encloseExpression(op('sub', 1), {}).status, 'unknown');
  assert.equal(
    encloseExpression(1, { x: { min: 0, max: Infinity } }).status,
    'bounded',
  );
  assert.equal(
    encloseExpression(ref('x'), { x: { min: 0, max: Infinity } }).status,
    'unknown',
  );
  const lazy = op('if', 1, 7, op('log2', -1));
  assert.deepEqual(bounded(encloseExpression(lazy, {})).interval, {
    min: 7,
    max: 7,
  });
  assert.equal(differentiateExpression(lazy, { x: 1 }, ['x']).value, 7);
});

test('band classification supports touching wells without treating gaps or unknowns as a pass', () => {
  const enclosure = encloseExpression(ref('x'), { x: { min: 2, max: 4 } });
  assert.equal(
    classifyEnclosureBands(enclosure, [
      { min: 1, max: 3 },
      { min: 3, max: 5 },
    ]),
    'proven-mathematical',
  );
  assert.equal(
    classifyEnclosureBands(enclosure, [
      { min: 1, max: 2 },
      { min: 4, max: 5 },
    ]),
    'unresolved',
  );
  assert.equal(
    classifyEnclosureBands(enclosure, [{ min: 5, max: 6 }]),
    'violated-throughout',
  );
  assert.equal(
    classifyEnclosureBands(encloseExpression(op('sqrt', 1), {}), [
      { min: 0, max: 2 },
    ]),
    'unresolved',
  );
});

test('forward geometry derivatives match independent multivariate analytic formulas', () => {
  const expression = op(
    'add',
    op('pow', ref('x'), 3),
    op('log2', ref('y')),
    op('sqrt', ref('z')),
    op('mul', ref('x'), ref('y')),
  );
  const result = differentiateExpression(expression, { x: 2, y: 4, z: 9 }, [
    'x',
    'y',
    'z',
  ]);
  assert.equal(result.status, 'smooth');
  assert.equal(
    result.value,
    evaluateExpression(expression, { x: 2, y: 4, z: 9 }),
  );
  near(result.derivatives.x, 16);
  near(result.derivatives.y, 2 + 1 / (4 * Math.LN2));
  near(result.derivatives.z, 1 / 6);
  const quotient = differentiateExpression(
    op('div', ref('x'), ref('y')),
    { x: 6, y: 3 },
    ['x', 'y'],
  );
  near(quotient.derivatives.x, 1 / 3);
  near(quotient.derivatives.y, -2 / 3);
  const variablePower = differentiateExpression(
    op('pow', ref('x'), ref('y')),
    { x: 2, y: 3 },
    ['x', 'y'],
  );
  near(variablePower.derivatives.x, 12);
  near(variablePower.derivatives.y, 8 * Math.LN2);
});

test('strict branch ties retain exact values and withhold two-sided derivatives', () => {
  const expression = op(
    'if',
    op('lt', ref('x'), 10),
    op('mul', ref('x'), 2),
    op('div', ref('x'), 2),
  );
  assert.equal(
    differentiateExpression(expression, { x: 9 }, ['x']).derivatives.x,
    2,
  );
  assert.equal(
    differentiateExpression(expression, { x: 11 }, ['x']).derivatives.x,
    0.5,
  );
  const tie = differentiateExpression(expression, { x: 10 }, ['x']);
  assert.equal(tie.value, 5);
  assert.equal(tie.status, 'boundary');
  assert.equal(tie.derivatives.x, null);
  const inclusive = differentiateExpression(
    op('if', op('lte', ref('x'), 10), 1, 2),
    { x: 10 },
    ['x'],
  );
  assert.equal(inclusive.value, 1);
  assert.equal(inclusive.derivatives.x, null);
  for (const expression of [
    op('abs', ref('x')),
    op('ceil', ref('x')),
    op('max', ref('x'), 0),
  ])
    assert.equal(
      differentiateExpression(expression, { x: 0 }, ['x']).status,
      'boundary',
    );
  assert.equal(
    differentiateExpression(op('ceil', ref('x')), { x: 0.5 }, ['x']).derivatives
      .x,
    0,
  );
  assert.equal(
    differentiateExpression(op('pow', -2, ref('x')), { x: 2 }, ['x'])
      .derivatives.x,
    null,
  );
  assert.equal(
    differentiateExpression(op('sub', 1), { x: 1 }, ['x']).status,
    'undefined',
  );
});

test('zero inner gradients do not hide cusps, isolated branch ties or power-domain holes', () => {
  const square = op('pow', ref('x'), 2);
  for (const expression of [
    op('sqrt', square),
    op('ceil', square),
    op('lte', square, 0),
    op('pow', -2, square),
  ]) {
    const result = differentiateExpression(expression, { x: 0 }, ['x']);
    assert.equal(result.status, 'boundary');
    assert.equal(result.derivatives.x, null);
  }
  assert.equal(
    differentiateExpression(op('sqrt', 0), { x: 0 }, ['x']).derivatives.x,
    0,
  );
});

test('regime subdivision discovers a narrow failure missed by phone/tablet/desktop samples', () => {
  const expression = op(
    'if',
    op('lt', ref('width'), 521),
    1,
    op('if', op('lt', ref('width'), 522), 0, 1),
  );
  for (const width of [390, 834, 1440])
    assert.equal(evaluateExpression(expression, { width }), 1);
  const map = mapExpressionRegimes(
    expression,
    { width: 834 },
    { input: 'width', min: 320, max: 1920, precision: 0.125, maxCells: 256 },
  );
  assert.equal(map.exhausted, false);
  const failures = map.cells.filter(
    (cell) =>
      cell.status === 'stable' &&
      cell.enclosure?.status === 'bounded' &&
      cell.enclosure.interval.max === 0,
  );
  assert.ok(
    failures.some((cell) => cell.input.min <= 521.5 && cell.input.max >= 521.5),
  );
  const brackets = map.cells.filter(
    (cell) => cell.status === 'transition-bracket',
  );
  for (const threshold of [521, 522])
    assert.ok(
      brackets.some(
        (cell) => cell.input.min <= threshold && cell.input.max >= threshold,
      ),
    );
  for (const cell of map.cells) {
    const enclosure = bounded(cell.enclosure!);
    for (const width of [
      cell.input.min,
      cell.input.min / 2 + cell.input.max / 2,
      cell.input.max,
    ]) {
      const value = evaluateExpression(expression, { width });
      assert.ok(
        value >= enclosure.interval.min && value <= enclosure.interval.max,
      );
    }
  }
});

test('regime limits and invalid domains retain unresolved coverage rather than inventing guarantees', () => {
  const expression = op('if', op('lt', ref('width'), 500), 1, 2);
  const stopped = mapExpressionRegimes(
    expression,
    { width: 834 },
    { input: 'width', min: 320, max: 1920, maxCells: 1 },
  );
  assert.equal(stopped.exhausted, true);
  assert.ok(stopped.cells.every((cell) => cell.status === 'unresolved'));
  assert.equal(stopped.cells[0]!.input.min, 320);
  assert.equal(stopped.cells.at(-1)!.input.max, 1920);
  const domains = mapExpressionRegimes(
    op('div', 1, ref('x')),
    { x: 1 },
    { input: 'x', min: -2, max: 2, precision: 0.125 },
  );
  assert.ok(domains.cells.some((cell) => cell.status === 'stable'));
  assert.ok(
    domains.cells.some(
      (cell) =>
        cell.status === 'unresolved' &&
        cell.input.min <= 0 &&
        cell.input.max >= 0,
    ),
  );
  const huge = mapExpressionRegimes(
    ref('width'),
    { width: 0 },
    { input: 'width', min: -Number.MAX_VALUE, max: Number.MAX_VALUE },
  );
  assert.ok(huge.validationInputs.every(Number.isFinite));
  assert.throws(() =>
    mapExpressionRegimes(
      expression,
      { width: 834 },
      { input: 'missing', min: 1, max: 2 },
    ),
  );
});

test('energy analysis adds geometry without replacing discrete pressure or certifying scenario overrides', () => {
  const provenance = { kind: 'brief' as const, source: 'Authored test bounds' };
  const program: EnergyProgram = {
    version: 1,
    id: 'geometry',
    brief: { intent: 'Inspect pane fit', source: 'test' },
    identity: {},
    variables: [{ id: 'gap', unit: 'px', values: [8, 16] }],
    scenarios: [{ id: 'tablet', values: { width: 834 } }],
    derived: [
      {
        id: 'pane',
        unit: 'px',
        expression: op('div', op('sub', ref('width'), ref('gap')), 2),
        provenance,
      },
    ],
    factors: [
      {
        id: 'fit',
        expression: ref('pane'),
        bands: [{ min: 0, max: 1000 }],
        scale: 1,
        mode: 'hard',
        weight: 1,
        category: 'geometry',
        provenance,
      },
    ],
  };
  const input = { program, assignment: { gap: 8 } };
  assert.equal(analyzeEnergy(input).geometry, undefined);
  const request = {
    scenario: 'tablet',
    outputs: ['pane'],
    wrt: ['width', 'gap'],
    envelope: { input: 'width', min: 320, max: 1920 },
  };
  const result = analyzeEnergy({ ...input, geometry: request });
  assert.equal(result.effects.length, 1);
  const output = result.geometry!.outputs[0]!;
  near(output.sensitivity.derivatives.width, 0.5);
  near(output.sensitivity.derivatives.gap, -0.5);
  assert.equal(
    result.geometry!.hardConstraints[0]!.status,
    'proven-mathematical',
  );
  program.factors[0]!.scenarioBands = { tablet: [{ min: 1, max: 1000 }] };
  assert.equal(
    analyzeEnergy({ ...input, geometry: request }).geometry!.hardConstraints[0]!
      .status,
    'unresolved',
  );
  assert.throws(
    () =>
      analyzeEnergy({
        ...input,
        geometry: { ...request, outputs: ['missing'] },
      }),
    /Unknown derived/,
  );
  assert.throws(
    () =>
      analyzeEnergy({
        ...input,
        geometry: { ...request, outputs: ['pane', 'pane'] },
      }),
    /unique/,
  );
  assert.throws(
    () =>
      analyzeEnergy({ ...input, geometry: { ...request, wrt: ['missing'] } }),
    /Missing finite/,
  );
});
