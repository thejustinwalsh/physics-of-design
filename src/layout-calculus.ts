import { evaluateExpression, type Expression } from './math-expression.js';
import {
  encloseExpression,
  type ExpressionEnclosure,
  type NumericInterval,
} from './math-enclosure.js';

export interface SensitivityIssue {
  at: string;
  operation: string;
  reason: string;
}
export type ExpressionSensitivity =
  | {
      status: 'smooth' | 'boundary';
      value: number;
      derivatives: Record<string, number | null>;
      issues: SensitivityIssue[];
      operations: number;
    }
  | {
      status: 'undefined';
      value: null;
      derivatives: Record<string, null>;
      issues: SensitivityIssue[];
      operations: number;
    };

/** Forward derivatives of declared geometry, independent of preference energy.
 * At a detected boundary we withhold the derivative rather than report the
 * slope of the arbitrarily selected branch as the derivative of the whole.
 */
export function differentiateExpression(
  expression: Expression,
  values: Readonly<Record<string, number>>,
  wrt: readonly string[],
  definitions: Readonly<Record<string, Expression>> = {},
): ExpressionSensitivity {
  if (!wrt.length || wrt.length > 16 || new Set(wrt).size !== wrt.length)
    throw new RangeError('Declare 1–16 unique sensitivity inputs');
  for (const key of wrt)
    if (!Object.hasOwn(values, key) || !Number.isFinite(values[key]))
      throw new RangeError(`Missing finite sensitivity input ${key}`);
  interface Dual {
    value: number;
    gradient: number[];
    varying: boolean;
    issues: SensitivityIssue[];
  }
  let operations = 0;
  const memo = new Map<string, Dual>(),
    visiting = new Set<string>();
  const zeros = () => wrt.map(() => 0);
  const walk = (e: Expression, at: string, depth = 0): Dual => {
    if (++operations > 32000 || depth > 80)
      throw new Error('Expression analysis limit reached');
    if (typeof e === 'number') {
      if (!Number.isFinite(e)) throw new Error('Nonfinite constant');
      return { value: e, gradient: zeros(), varying: false, issues: [] };
    }
    if ('ref' in e) {
      if (Object.hasOwn(values, e.ref)) {
        const value = values[e.ref]!;
        if (!Number.isFinite(value))
          throw new Error(`Nonfinite input ${e.ref}`);
        return {
          value,
          gradient: wrt.map((key) => Number(key === e.ref)),
          varying: wrt.includes(e.ref),
          issues: [],
        };
      }
      const known = memo.get(e.ref);
      if (known) return known;
      if (!Object.hasOwn(definitions, e.ref) || visiting.has(e.ref))
        throw new Error(`Missing or cyclic definition ${e.ref}`);
      visiting.add(e.ref);
      const result = walk(definitions[e.ref]!, `@${e.ref}`, depth + 1);
      visiting.delete(e.ref);
      memo.set(e.ref, result);
      return result;
    }
    const arity =
      e.op === 'if'
        ? 3
        : ['sub', 'div', 'pow', 'lt', 'lte'].includes(e.op)
          ? 2
          : ['abs', 'ceil', 'log2', 'sqrt'].includes(e.op)
            ? 1
            : null;
    if (
      !e.args.length ||
      e.args.length > 16 ||
      (arity !== null && e.args.length !== arity)
    )
      throw new Error(`Invalid ${e.op} arity`);
    const child = (i: number) => walk(e.args[i]!, `${at}/${i}`, depth + 1);
    if (e.op === 'if') {
      if (e.args.length !== 3) throw new Error('Invalid if arity');
      const condition = child(0),
        selected = child(condition.value !== 0 ? 1 : 2);
      return { ...selected, issues: [...condition.issues, ...selected.issues] };
    }
    const args = e.args.map((_, i) => child(i));
    const value = evaluateExpression(
      { op: e.op, args: args.map((a) => a.value) },
      {},
    );
    const a = args[0]!,
      b = args[1];
    let issues = args.flatMap((a) => a.issues);
    const issue = (reason: string) =>
      issues.push({ at, operation: e.op, reason });
    const gradient = wrt.map((_, index) => {
      const da = a.gradient[index]!,
        db = b?.gradient[index] ?? 0;
      switch (e.op) {
        case 'add':
          return args.reduce((sum, arg) => sum + arg.gradient[index]!, 0);
        case 'sub':
          return da - db;
        case 'mul':
          return args.reduce(
            (sum, arg, i) =>
              sum +
              arg.gradient[index]! *
                args.reduce(
                  (product, other, j) =>
                    i === j ? product : product * other.value,
                  1,
                ),
            0,
          );
        case 'div':
          return (da - value * db) / b!.value;
        case 'log2':
          return da === 0 ? 0 : da / (a.value * Math.LN2);
        case 'sqrt':
          return da === 0 ? 0 : da / (2 * value);
        case 'pow':
          if (db === 0)
            return da === 0 || b!.value === 0
              ? 0
              : b!.value * a.value ** (b!.value - 1) * da;
          return a.value > 0
            ? value * (db * Math.log(a.value) + (b!.value * da) / a.value)
            : NaN;
        case 'abs':
          return a.value === 0 ? 0 : Math.sign(a.value) * da;
        case 'ceil':
        case 'lt':
        case 'lte':
          return 0;
        case 'min':
        case 'max':
          return args.find((arg) => arg.value === value)!.gradient[index]!;
        default:
          throw new Error('Unsupported differentiation operation');
      }
    });
    const changing = (arg: Dual) => arg.varying || arg.issues.length > 0;
    if (
      (e.op === 'abs' && a.value === 0 && changing(a)) ||
      (e.op === 'ceil' && Number.isInteger(a.value) && changing(a))
    )
      issue('Derivative is not established at this boundary');
    if (e.op === 'sqrt' && a.value === 0 && changing(a))
      issue(
        'Square-root boundary can hide a cusp despite a zero inner gradient',
      );
    if (
      e.op === 'pow' &&
      ((a.value < 0 && b!.varying) ||
        (a.value === 0 &&
          ((a.varying && !Number.isInteger(b!.value)) ||
            (b!.varying && b!.value <= 0))))
    )
      issue('A nearby real power domain is not established');
    if (
      (e.op === 'lt' || e.op === 'lte') &&
      a.value === b!.value &&
      (changing(a) || changing(b!))
    )
      issue('Exact strict/inclusive comparison tie; no two-sided derivative');
    if (e.op === 'min' || e.op === 'max') {
      const selected = args.find((arg) => arg.value === value)!;
      issues = [...selected.issues];
      if (
        args.some(
          (arg) =>
            arg !== selected &&
            arg.value === value &&
            (changing(arg) || changing(selected)),
        )
      )
        issue('Competing branches meet; smoothness is not established');
    }
    if (gradient.some((d) => !Number.isFinite(d)))
      issue('Derivative is nonfinite or the nearby real domain is unavailable');
    return {
      value,
      gradient,
      varying: args.some((arg) => arg.varying),
      issues,
    };
  };
  try {
    const result = walk(expression, '$');
    const issues = Array.from(
      new Map(
        result.issues.map((issue) => [`${issue.at}:${issue.reason}`, issue]),
      ).values(),
    );
    return {
      status: issues.length ? 'boundary' : 'smooth',
      value: result.value,
      derivatives: Object.fromEntries(
        wrt.map((key, i) => [key, issues.length ? null : result.gradient[i]!]),
      ),
      issues,
      operations,
    };
  } catch (error) {
    return {
      status: 'undefined',
      value: null,
      derivatives: Object.fromEntries(wrt.map((key) => [key, null])),
      issues: [{ at: '$', operation: 'evaluation', reason: String(error) }],
      operations,
    };
  }
}

export interface RegimeCell {
  input: NumericInterval;
  status: 'stable' | 'transition-bracket' | 'unresolved';
  enclosure: ExpressionEnclosure | null;
  reason?: string;
}
export interface RegimeEnvelope extends NumericInterval {
  input: string;
  precision?: number;
  maxCells?: number;
}
export function mapExpressionRegimes(
  expression: Expression,
  values: Readonly<Record<string, number>>,
  envelope: RegimeEnvelope,
  definitions: Readonly<Record<string, Expression>> = {},
) {
  const precision = envelope.precision ?? 0.25,
    maxCells = envelope.maxCells ?? 256;
  if (
    !Object.hasOwn(values, envelope.input) ||
    !Number.isFinite(envelope.min) ||
    !Number.isFinite(envelope.max) ||
    envelope.min >= envelope.max ||
    !Number.isFinite(precision) ||
    precision <= 0 ||
    !Number.isInteger(maxCells) ||
    maxCells < 1 ||
    maxCells > 2048
  )
    throw new RangeError('Invalid declared regime envelope');
  const boxes = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      { min: value, max: value },
    ]),
  );
  const pending: NumericInterval[] = [{ min: envelope.min, max: envelope.max }],
    cells: RegimeCell[] = [];
  let evaluations = 0,
    operations = 0,
    exhausted = false;
  while (pending.length) {
    const input = pending.pop()!;
    if (evaluations >= maxCells || operations >= 1_000_000) {
      exhausted = true;
      cells.push({
        input,
        status: 'unresolved',
        enclosure: null,
        reason:
          evaluations >= maxCells
            ? 'Declared cell limit reached'
            : 'Expression work limit reached',
      });
      continue;
    }
    const enclosure = encloseExpression(
      expression,
      { ...boxes, [envelope.input]: input },
      definitions,
    );
    evaluations++;
    operations += enclosure.operations;
    const mid = input.min / 2 + input.max / 2;
    if (enclosure.status === 'bounded' && enclosure.boundaries.length === 0)
      cells.push({ input, status: 'stable', enclosure });
    else if (
      enclosure.status === 'unknown' &&
      (!enclosure.canSubdivide ||
        input.max - input.min <= precision ||
        mid === input.min ||
        mid === input.max)
    )
      cells.push({
        input,
        status: 'unresolved',
        enclosure,
        reason: enclosure.reason,
      });
    else if (
      input.max - input.min <= precision ||
      mid === input.min ||
      mid === input.max
    )
      cells.push({ input, status: 'transition-bracket', enclosure });
    else
      pending.push({ min: mid, max: input.max }, { min: input.min, max: mid });
  }
  cells.sort((a, b) => a.input.min - b.input.min);
  return {
    input: envelope.input,
    range: { min: envelope.min, max: envelope.max },
    precision,
    exhausted,
    evaluations,
    operations,
    cells,
    validationInputs: Array.from(
      new Set(
        cells.flatMap((cell) => [
          cell.input.min,
          cell.input.min / 2 + cell.input.max / 2,
          cell.input.max,
        ]),
      ),
    ).sort((a, b) => a - b),
    scope:
      'Partition of the declared mathematical expression only. Transition brackets are conservative; renderer line breaks and task accessibility require current separate observations.',
  };
}
