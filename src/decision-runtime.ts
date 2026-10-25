/** Portable, no Node APIs: consume a build-time validated handoff in React Native or web. */
import {
  evaluateExpression,
  expressionRefs,
  type Expression,
} from './math-expression.js';
type Values = Record<string, number>;
export interface PortableDesign {
  assignment: Values;
  program: {
    scenarios: { id: string; values: Values }[];
    derived: { id: string; expression: Expression }[];
    factors: {
      id: string;
      expression: Expression;
      mode: string;
      bands: { min: number; max: number }[];
    }[];
  };
  machine: {
    states: {
      id: string;
      regions: {
        id: string;
        role: string;
        bindings: Record<string, Expression>;
      }[];
      on: { event: string; target: string; when?: Expression | undefined }[];
    }[];
    motions: Record<
      string,
      {
        stiffness: Expression;
        damping: Expression;
        mass: Expression;
        channel: string;
        reducedMotion: string;
      }
    >;
  };
}
export function resolveDesignRuntime(
  handoff: PortableDesign,
  scenario: Values,
) {
  const keys = Object.keys(handoff.program.scenarios[0]!.values);
  if (
    keys.length !== Object.keys(scenario).length ||
    keys.some((k) => !Object.hasOwn(scenario, k))
  )
    throw new Error('Runtime scenario keys differ from design program');
  if (Object.values(scenario).some((v) => !Number.isFinite(v)))
    throw new Error('Runtime scenario inputs must be finite');
  const values = { ...handoff.assignment, ...scenario };
  for (const d of handoff.program.derived)
    values[d.id] = evaluateExpression(d.expression, values);
  const resolve = (b: Record<string, Expression>) =>
    Object.fromEntries(
      Object.entries(b).map(([key, e]) => [key, evaluateExpression(e, values)]),
    );
  const failures = handoff.program.factors
    .filter(
      (f) =>
        f.mode === 'hard' &&
        !f.bands.some((b) => {
          const v = evaluateExpression(f.expression, values);
          return v >= b.min && v <= b.max;
        }),
    )
    .map((f) => f.id);
  const result = {
    values,
    admissible: failures.length === 0,
    failures,
    regions: Object.fromEntries(
      handoff.machine.states.map((s) => [
        s.id,
        Object.fromEntries(
          s.regions.map((r) => [
            r.id,
            { role: r.role, ...resolve(r.bindings) },
          ]),
        ),
      ]),
    ),
    motions: Object.fromEntries(
      Object.entries(handoff.machine.motions).map(([id, m]) => [
        id,
        {
          mass: evaluateExpression(m.mass, values),
          stiffness: evaluateExpression(m.stiffness, values),
          damping: evaluateExpression(m.damping, values),
          channel: m.channel,
          reducedMotion: m.reducedMotion,
        },
      ]),
    ),
  };
  for (const [id, m] of Object.entries(result.motions))
    if (!(m.mass > 0) || !(m.stiffness > 0) || !(m.damping >= 0))
      throw new Error(`Invalid spring parameters for ${id}`);
  for (const state of handoff.machine.states)
    for (const t of state.on)
      if (t.when !== undefined) evaluateExpression(t.when, values);
  const expressions = [
    ...handoff.program.derived.map((d) => d.expression),
    ...handoff.program.factors.map((f) => f.expression),
    ...handoff.machine.states.flatMap((s) => [
      ...s.regions.flatMap((r) => Object.values(r.bindings)),
      ...s.on.flatMap((t) => (t.when !== undefined ? [t.when] : [])),
    ]),
    ...Object.values(handoff.machine.motions).flatMap((m) => [
      m.mass,
      m.stiffness,
      m.damping,
    ]),
  ];
  const relevant = new Set(expressions.flatMap(expressionRefs));
  const outside = keys.filter(
    (k) =>
      relevant.has(k) &&
      (scenario[k]! <
        Math.min(...handoff.program.scenarios.map((s) => s.values[k]!)) ||
        scenario[k]! >
          Math.max(...handoff.program.scenarios.map((s) => s.values[k]!))),
  );
  return {
    ...result,
    admissible: result.admissible && outside.length === 0,
    applicability: outside.length
      ? 'outside-declared-envelope'
      : 'within-declared-envelope',
    outsideEnvelope: outside,
    verification: 'pending-renderer-verification' as const,
  };
}
