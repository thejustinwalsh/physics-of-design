import type { Expression } from './math-expression.js';

export interface NumericInterval {
  min: number;
  max: number;
}
export interface ExpressionBoundary {
  at: string;
  operation: 'if' | 'lt' | 'lte' | 'min' | 'max' | 'abs' | 'ceil';
}
export type ExpressionEnclosure =
  | {
      status: 'bounded';
      interval: NumericInterval;
      affineWithinBox: boolean;
      boundaries: ExpressionBoundary[];
      arithmetic: 'float64-outward-basic-v1';
      operations: number;
    }
  | {
      status: 'unknown';
      reason: string;
      at: string;
      canSubdivide: boolean;
      arithmetic: 'float64-outward-basic-v1';
      operations: number;
    };

// Adjacent representable doubles without BigInt or platform rounding-mode APIs.
// Constants/input endpoints denote their exact binary64 values; each supported
// arithmetic operation expands outwards by one representable value.
const bits = new DataView(new ArrayBuffer(8));
export function adjacentFloat(value: number, direction: -1 | 1): number {
  if (Number.isNaN(value)) throw new RangeError('Cannot step a NaN');
  if (value === 0) return direction * Number.MIN_VALUE;
  if (value === Infinity) return direction === 1 ? Infinity : Number.MAX_VALUE;
  if (value === -Infinity)
    return direction === -1 ? -Infinity : -Number.MAX_VALUE;
  bits.setFloat64(0, value, false);
  let high = bits.getUint32(0, false),
    low = bits.getUint32(4, false);
  if (value > 0 === direction > 0) {
    low = (low + 1) >>> 0;
    if (low === 0) high = (high + 1) >>> 0;
  } else {
    if (low === 0) high = (high - 1) >>> 0;
    low = (low - 1) >>> 0;
  }
  bits.setUint32(0, high, false);
  bits.setUint32(4, low, false);
  return bits.getFloat64(0, false);
}

class Unresolved extends Error {
  constructor(
    message: string,
    readonly at: string,
    readonly canSubdivide = false,
  ) {
    super(message);
  }
}
interface BoxValue {
  range: NumericInterval;
  affine: boolean;
  varying: boolean;
  boundaries: ExpressionBoundary[];
}
const point = (value: number): BoxValue => ({
  range: { min: value, max: value },
  affine: true,
  varying: false,
  boundaries: [],
});
function rounded(min: number, max: number): NumericInterval {
  return { min: adjacentFloat(min, -1), max: adjacentFloat(max, 1) };
}
function product(a: NumericInterval, b: NumericInterval): NumericInterval {
  if ((a.min === 0 && a.max === 0) || (b.min === 0 && b.max === 0))
    return { min: 0, max: 0 };
  const values = [a.min * b.min, a.min * b.max, a.max * b.min, a.max * b.max];
  return rounded(Math.min(...values), Math.max(...values));
}

/** Conservative mathematical enclosures, never renderer or aesthetic evidence.
 * log2/sqrt/general powers stay unsupported: a one-ULP expansion of an arbitrary
 * libm approximation does not establish their mathematical inclusion guarantee.
 */
export function encloseExpression(
  expression: Expression,
  variables: Readonly<Record<string, NumericInterval>>,
  definitions: Readonly<Record<string, Expression>> = {},
): ExpressionEnclosure {
  let operations = 0;
  const visiting = new Set<string>(),
    memo = new Map<string, BoxValue>();
  const inspect = (e: Expression, at: string, depth = 0): BoxValue => {
    if (++operations > 32000 || depth > 80)
      throw new Unresolved('Expression analysis limit reached', at);
    if (typeof e === 'number') {
      if (!Number.isFinite(e)) throw new Unresolved('Nonfinite constant', at);
      return point(e);
    }
    if ('ref' in e) {
      if (Object.hasOwn(variables, e.ref)) {
        const range = variables[e.ref]!;
        if (
          !Number.isFinite(range.min) ||
          !Number.isFinite(range.max) ||
          range.min > range.max
        )
          throw new Unresolved(`Invalid input interval ${e.ref}`, at);
        return {
          range,
          affine: true,
          varying: range.min !== range.max,
          boundaries: [],
        };
      }
      const known = memo.get(e.ref);
      if (known) return known;
      if (!Object.hasOwn(definitions, e.ref))
        throw new Unresolved(`Missing input or definition ${e.ref}`, at);
      if (visiting.has(e.ref))
        throw new Unresolved(`Cyclic definition ${e.ref}`, at);
      visiting.add(e.ref);
      const value = inspect(definitions[e.ref]!, `@${e.ref}`, depth + 1);
      visiting.delete(e.ref);
      memo.set(e.ref, value);
      return value;
    }
    const count = e.args.length;
    const arity = ['if'].includes(e.op)
      ? 3
      : ['sub', 'div', 'pow', 'lt', 'lte'].includes(e.op)
        ? 2
        : ['abs', 'ceil', 'log2', 'sqrt'].includes(e.op)
          ? 1
          : null;
    if (count === 0 || count > 16 || (arity !== null && count !== arity))
      throw new Unresolved(`Invalid ${e.op} arity`, at);
    const child = (i: number) => inspect(e.args[i]!, `${at}/${i}`, depth + 1);
    const event = (): ExpressionBoundary => ({
      at,
      operation: e.op as ExpressionBoundary['operation'],
    });
    if (e.op === 'if') {
      const condition = child(0),
        c = condition.range;
      if (c.min === 0 && c.max === 0) return child(2);
      if (c.min > 0 || c.max < 0) return child(1);
      let yes: BoxValue, no: BoxValue;
      try {
        yes = child(1);
        no = child(2);
      } catch (error) {
        if (!(error instanceof Unresolved)) throw error;
        throw new Unresolved(error.message, error.at, true);
      }
      return {
        range: {
          min: Math.min(yes.range.min, no.range.min),
          max: Math.max(yes.range.max, no.range.max),
        },
        affine: false,
        varying: true,
        boundaries: [
          event(),
          ...condition.boundaries,
          ...yes.boundaries,
          ...no.boundaries,
        ],
      };
    }
    const args = e.args.map((_, i) => child(i)),
      a = args[0]!,
      b = args[1],
      boundaries = args.flatMap((value) => value.boundaries);
    let range: NumericInterval,
      affine = args.every((value) => value.affine),
      varying = args.some((value) => value.varying);
    switch (e.op) {
      case 'add':
        range = args
          .slice(1)
          .reduce(
            (sum, value) =>
              rounded(sum.min + value.range.min, sum.max + value.range.max),
            a.range,
          );
        break;
      case 'sub':
        range = rounded(a.range.min - b!.range.max, a.range.max - b!.range.min);
        break;
      case 'mul':
        range = args
          .slice(1)
          .reduce((sum, value) => product(sum, value.range), a.range);
        affine &&= args.filter((value) => value.varying).length <= 1;
        break;
      case 'div': {
        if (b!.range.min <= 0 && b!.range.max >= 0)
          throw new Unresolved('Division denominator includes zero', at, true);
        const quotients = [
          a.range.min / b!.range.min,
          a.range.min / b!.range.max,
          a.range.max / b!.range.min,
          a.range.max / b!.range.max,
        ];
        range = rounded(Math.min(...quotients), Math.max(...quotients));
        affine &&= !b!.varying;
        break;
      }
      case 'min':
      case 'max': {
        const choose = e.op === 'min' ? Math.min : Math.max;
        range = {
          min: choose(...args.map((value) => value.range.min)),
          max: choose(...args.map((value) => value.range.max)),
        };
        const winner = args.find((value, i) =>
          args.every(
            (other, j) =>
              i === j ||
              (e.op === 'min'
                ? value.range.max <= other.range.min
                : value.range.min >= other.range.max),
          ),
        );
        if (winner) return winner;
        boundaries.push(event());
        affine = false;
        break;
      }
      case 'abs':
        if (a.range.min >= 0) return a;
        if (a.range.max <= 0) {
          range = { min: -a.range.max, max: -a.range.min };
          break;
        }
        range = { min: 0, max: Math.max(-a.range.min, a.range.max) };
        affine = false;
        boundaries.push(event());
        break;
      case 'ceil':
        range = { min: Math.ceil(a.range.min), max: Math.ceil(a.range.max) };
        affine = range.min === range.max;
        if (!affine) boundaries.push(event());
        varying = !affine;
        break;
      case 'lt':
      case 'lte': {
        const certainlyTrue =
          e.op === 'lt'
            ? a.range.max < b!.range.min
            : a.range.max <= b!.range.min;
        const certainlyFalse =
          e.op === 'lt'
            ? a.range.min >= b!.range.max
            : a.range.min > b!.range.max;
        if (certainlyTrue) return point(1);
        if (certainlyFalse) return point(0);
        range = { min: 0, max: 1 };
        affine = false;
        boundaries.push(event());
        break;
      }
      case 'pow': {
        if (
          b!.range.min !== b!.range.max ||
          !Number.isInteger(b!.range.min) ||
          b!.range.min < 0 ||
          b!.range.min > 32
        )
          throw new Unresolved(
            'Only fixed integer powers 0 through 32 are enclosed',
            at,
          );
        const exponent = b!.range.min;
        range = { min: 1, max: 1 };
        for (let i = 0; i < exponent; i++) range = product(range, a.range);
        affine &&= exponent <= 1 || !a.varying;
        break;
      }
      case 'sqrt':
      case 'log2':
        throw new Unresolved(
          `No certified ${e.op} enclosure is implemented`,
          at,
        );
      default:
        throw new Unresolved('Unsupported expression operation', at);
    }
    if (!Number.isFinite(range.min) || !Number.isFinite(range.max))
      throw new Unresolved('Arithmetic overflow or unbounded enclosure', at);
    return { range, affine, varying, boundaries };
  };
  try {
    const result = inspect(expression, '$');
    return {
      status: 'bounded',
      interval: result.range,
      affineWithinBox: result.affine,
      boundaries: Array.from(
        new Map(
          result.boundaries.map((boundary) => [
            `${boundary.at}:${boundary.operation}`,
            boundary,
          ]),
        ).values(),
      ),
      arithmetic: 'float64-outward-basic-v1',
      operations,
    };
  } catch (error) {
    if (!(error instanceof Unresolved)) throw error;
    return {
      status: 'unknown',
      reason: error.message,
      at: error.at,
      canSubdivide: error.canSubdivide,
      arithmetic: 'float64-outward-basic-v1',
      operations,
    };
  }
}

/** A result about the enclosed mathematical quantity, not rendered compliance. */
export function classifyEnclosureBands(
  enclosure: ExpressionEnclosure,
  bands: readonly NumericInterval[],
): 'proven-mathematical' | 'violated-throughout' | 'unresolved' {
  if (
    !bands.length ||
    bands.some(
      (b) =>
        !Number.isFinite(b.min) || !Number.isFinite(b.max) || b.min > b.max,
    )
  )
    throw new RangeError('Declare finite ordered acceptance bands');
  if (enclosure.status === 'unknown') return 'unresolved';
  const merged: NumericInterval[] = [];
  for (const band of [...bands].sort((a, b) => a.min - b.min)) {
    const last = merged.at(-1);
    if (last && band.min <= last.max) last.max = Math.max(last.max, band.max);
    else merged.push({ ...band });
  }
  const { min, max } = enclosure.interval;
  if (merged.some((b) => min >= b.min && max <= b.max))
    return 'proven-mathematical';
  return merged.every((b) => max < b.min || min > b.max)
    ? 'violated-throughout'
    : 'unresolved';
}
