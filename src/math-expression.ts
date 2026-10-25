export type Expression =
  | number
  | { ref: string }
  | {
      op:
        | 'add'
        | 'sub'
        | 'mul'
        | 'div'
        | 'min'
        | 'max'
        | 'pow'
        | 'log2'
        | 'sqrt'
        | 'ceil'
        | 'abs'
        | 'lt'
        | 'lte'
        | 'if';
      args: Expression[];
    };

export type NumericValues = Record<string, number>;
export function evaluateExpression(
  e: Expression,
  values: Readonly<NumericValues>,
): number {
  if (typeof e === 'number') return e;
  if ('ref' in e) {
    const v = values[e.ref];
    if (v === undefined) throw new Error(`Missing mathematical input ${e.ref}`);
    return v;
  }
  // Lazy branches allow declared topology alternatives without evaluating inactive invalid geometry.
  if (e.op === 'if')
    return evaluateExpression(
      e.args[evaluateExpression(e.args[0]!, values) !== 0 ? 1 : 2]!,
      values,
    );
  const a = e.args.map((x) => evaluateExpression(x, values));
  let out: number;
  switch (e.op) {
    case 'add':
      out = a.reduce((s, x) => s + x, 0);
      break;
    case 'mul':
      out = a.reduce((s, x) => s * x, 1);
      break;
    case 'sub':
      out = a[0]! - a[1]!;
      break;
    case 'div':
      out = a[0]! / a[1]!;
      break;
    case 'pow':
      out = a[0]! ** a[1]!;
      break;
    case 'min':
      out = Math.min(...a);
      break;
    case 'max':
      out = Math.max(...a);
      break;
    case 'log2':
      out = Math.log2(a[0]!);
      break;
    case 'sqrt':
      out = Math.sqrt(a[0]!);
      break;
    case 'ceil':
      out = Math.ceil(a[0]!);
      break;
    case 'abs':
      out = Math.abs(a[0]!);
      break;
    case 'lt':
      out = Number(a[0]! < a[1]!);
      break;
    case 'lte':
      out = Number(a[0]! <= a[1]!);
      break;
  }
  if (!Number.isFinite(out)) throw new Error(`Nonfinite ${e.op} result`);
  return out;
}

export function expressionRefs(e: Expression): string[] {
  return typeof e === 'number'
    ? []
    : 'ref' in e
      ? [e.ref]
      : e.args.flatMap(expressionRefs);
}
