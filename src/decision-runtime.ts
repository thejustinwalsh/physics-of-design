/** Portable, no Node APIs: consume a build-time validated handoff in React Native or web. */
import {
  evaluateExpression,
  expressionRefs,
  type Expression,
} from './math-expression.js';
type Values = Record<string, number>;
export const DESIGN_RUNTIME_SEMANTICS = 'scenario-bands-v2' as const;
export interface DesignRuntimePolicy {
  /** Authored permission to apply the default bands at unsampled inputs. */
  unsampledScenarioBands: 'base';
}
export interface DesignRuntimeOptions {
  /** Disambiguates equal input vectors; it cannot override the supplied inputs. */
  scenarioId?: string;
}
export interface PortableDesign {
  assignment: Values;
  runtimePolicy?: DesignRuntimePolicy;
  program: {
    scenarios: { id: string; values: Values }[];
    derived: { id: string; expression: Expression }[];
    factors: {
      id: string;
      expression: Expression;
      mode: string;
      bands: { min: number; max: number }[];
      scenarioBands?:
        Record<string, { min: number; max: number }[]> | undefined;
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
  options: DesignRuntimeOptions = {},
) {
  const keys = Object.keys(handoff.program.scenarios[0]!.values);
  if (
    keys.length !== Object.keys(scenario).length ||
    keys.some((k) => !Object.hasOwn(scenario, k))
  )
    throw new Error('Runtime scenario keys differ from design program');
  if (Object.values(scenario).some((v) => !Number.isFinite(v)))
    throw new Error('Runtime scenario inputs must be finite');
  const matches = handoff.program.scenarios.filter((s) =>
    keys.every((key) => s.values[key] === scenario[key]),
  );
  const explicit = options.scenarioId;
  if (explicit !== undefined && !matches.some((s) => s.id === explicit))
    throw new Error(
      'Runtime scenarioId must name a scenario with exactly these inputs',
    );
  const selected = explicit === undefined ? matches[0]?.id : explicit;
  const effectiveBands = (
    f: PortableDesign['program']['factors'][number],
    id?: string,
  ) => (id === undefined ? undefined : f.scenarioBands?.[id]) ?? f.bands;
  const bandKey = (bands: { min: number; max: number }[]) =>
    JSON.stringify([...bands].sort((a, b) => a.min - b.min || a.max - b.max));
  const useBase =
    !matches.length && handoff.runtimePolicy?.unsampledScenarioBands === 'base';
  const unresolvedFactors = handoff.program.factors.filter((f) =>
    explicit !== undefined || useBase
      ? false
      : matches.length
        ? matches.some(
            (s) =>
              bandKey(effectiveBands(f, s.id)) !==
              bandKey(effectiveBands(f, selected)),
          )
        : Object.keys(f.scenarioBands ?? {}).length > 0,
  );
  const unresolved = new Set(unresolvedFactors.map((f) => f.id));
  // Ambiguous named scenarios fail closed, including divergent preference meaning.
  // At unsampled inputs only unresolved hard guards prevent geometry admission.
  const unresolvedApplicability =
    unresolved.size > 0 &&
    (matches.length > 1 || unresolvedFactors.some((f) => f.mode === 'hard'));
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
        !unresolved.has(f.id) &&
        !effectiveBands(f, selected).some((b) => {
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
    runtimeSemantics: DESIGN_RUNTIME_SEMANTICS,
    scenarioResolution: {
      status: unresolved.size
        ? 'unresolved'
        : explicit !== undefined
          ? 'explicit'
          : matches.length
            ? 'exact'
            : useBase
              ? 'explicit-base-policy'
              : 'continuous-base',
      scenarioId: explicit ?? (matches.length === 1 ? selected! : null),
      matchingScenarioIds: matches.map((s) => s.id),
      unresolvedFactors: [...unresolved],
    },
    admissible:
      result.admissible && outside.length === 0 && !unresolvedApplicability,
    applicability: unresolvedApplicability
      ? 'scenario-bands-unresolved'
      : outside.length
        ? 'outside-declared-envelope'
        : 'within-declared-envelope',
    outsideEnvelope: outside,
    verification: 'pending-renderer-verification' as const,
  };
}
