import { z } from 'zod';
import { hash, canonical } from './identity.js';

import {
  evaluateExpression,
  expressionRefs,
  type Expression,
} from './math-expression.js';
export {
  evaluateExpression,
  expressionRefs,
  type Expression,
} from './math-expression.js';
export const ExpressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.union([
    z.number().finite(),
    z.object({ ref: z.string().min(1).max(100) }).strict(),
    z
      .object({
        op: z.enum([
          'add',
          'sub',
          'mul',
          'div',
          'min',
          'max',
          'pow',
          'log2',
          'sqrt',
          'ceil',
          'abs',
          'lt',
          'lte',
          'if',
        ]),
        args: z.array(ExpressionSchema).min(1).max(16),
      })
      .strict(),
  ]),
);
const Provenance = z
  .object({
    kind: z.enum([
      'empirical',
      'standard',
      'heuristic',
      'hypothesis',
      'brief',
      'calculated',
      'predicted',
    ]),
    source: z.string().min(1).max(2000),
  })
  .strict();
const Identifier = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/);
const Band = z
  .object({ min: z.number().finite(), max: z.number().finite() })
  .strict()
  .refine((x) => x.min <= x.max, 'min must not exceed max');
export const EnergyProgramSchema = z
  .object({
    version: z.literal(1),
    id: Identifier,
    brief: z
      .object({
        intent: z.string().min(1).max(4000),
        source: z.string().min(1).max(2000),
      })
      .strict(),
    identity: z.record(z.string(), z.string().min(1)).default({}),
    variables: z
      .array(
        z
          .object({
            id: Identifier,
            unit: z.string().min(1).max(80),
            label: z.string().min(1).max(120).optional(),
            valueAliases: z
              .array(
                z
                  .object({
                    value: z.number().finite(),
                    label: z.string().min(1).max(120),
                  })
                  .strict(),
              )
              .min(1)
              .max(128)
              .optional(),
            values: z.array(z.number().finite()).min(1).max(128),
            locked: z.number().finite().optional(),
          })
          .strict()
          .superRefine((v, ctx) => {
            if (!v.valueAliases) return;
            const values = new Set(v.values);
            if (
              v.valueAliases.length !== values.size ||
              new Set(v.valueAliases.map((a) => a.value)).size !==
                values.size ||
              v.valueAliases.some((a) => !values.has(a.value))
            )
              ctx.addIssue({
                code: 'custom',
                path: ['valueAliases'],
                message:
                  'Value aliases must cover each declared domain value exactly once',
              });
            if (
              new Set(v.valueAliases.map((a) => a.label)).size !==
              v.valueAliases.length
            )
              ctx.addIssue({
                code: 'custom',
                path: ['valueAliases'],
                message: 'Value aliases must have distinct labels',
              });
          }),
      )
      .min(1)
      .max(40),
    scenarios: z
      .array(
        z
          .object({
            id: Identifier,
            values: z.record(Identifier, z.number().finite()),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    derived: z
      .array(
        z
          .object({
            id: Identifier,
            expression: ExpressionSchema,
            unit: z.string().min(1),
            provenance: Provenance,
          })
          .strict(),
      )
      .max(128)
      .default([]),
    factors: z
      .array(
        z
          .object({
            id: Identifier,
            expression: ExpressionSchema,
            bands: z.array(Band).min(1).max(16),
            scenarioBands: z
              .record(Identifier, z.array(Band).min(1).max(16))
              .optional(),
            scale: z.number().finite().positive(),
            mode: z.enum(['hard', 'preference']),
            weight: z.number().finite().nonnegative().max(1e6).default(1),
            category: z.string().min(1),
            provenance: Provenance,
          })
          .strict(),
      )
      .max(128),
  })
  .strict();
export type EnergyProgram = z.infer<typeof EnergyProgramSchema>;
export const EnergySearchOptionsSchema = z
  .object({
    maxFactorObservations: z.number().int().min(1).max(2000000).default(500000),
    maxExpressionOperations: z
      .number()
      .int()
      .min(1)
      .max(50000000)
      .default(5000000),
    method: z.enum(['auto', 'exhaustive', 'beam']).default('auto'),
    maxEvaluations: z.number().int().min(1).max(100000).default(4096),
    beamWidth: z.number().int().min(1).max(64).default(16),
    rounds: z.number().int().min(1).max(100).default(12),
    limit: z.number().int().min(1).max(24).default(6),
    // Omitted preserves the historical ranked prefix and its recipe identity.
    retention: z.enum(['ranked', 'pareto-diverse']).optional(),
    maxRetentionComparisons: z.number().int().min(1).max(10000000).optional(),
  })
  .strict();
export const EnergySearchSchema = z
  .object({
    program: EnergyProgramSchema,
    options: EnergySearchOptionsSchema.optional(),
  })
  .strict();
export type Assignment = Record<string, number>;
export interface FactorObservation {
  id: string;
  scenario: string;
  value: number;
  residual: number;
  energy: number;
  mode: 'hard' | 'preference';
  category: string;
  provenance: EnergyProgram['factors'][number]['provenance'];
}
export interface EnergyEvaluation {
  id: string;
  assignment: Assignment;
  hardFailures: number;
  hardResidual: number;
  energy: number;
  factors: FactorObservation[];
  derived: Record<string, Assignment>;
  status: 'mathematically-admissible' | 'mathematically-rejected';
}

function assertTree(input: unknown, depth = 0, count = { n: 0 }): void {
  if (depth > 40 || ++count.n > 50000)
    throw new Error('Energy program exceeds expression depth/size limit');
  if (input && typeof input === 'object')
    for (const v of Object.values(input)) assertTree(v, depth + 1, count);
}

export function validateExpression(e: Expression): void {
  if (typeof e === 'number' || 'ref' in e) return;
  const arity = ['log2', 'sqrt', 'ceil', 'abs'].includes(e.op)
    ? 1
    : ['sub', 'div', 'pow', 'lt', 'lte'].includes(e.op)
      ? 2
      : e.op === 'if'
        ? 3
        : null;
  if (arity !== null && e.args.length !== arity)
    throw new Error(`${e.op} requires ${arity} operands`);
  e.args.forEach(validateExpression);
}
export function compileEnergy(input: unknown) {
  assertTree(input);
  const p = EnergyProgramSchema.parse(input);
  // Identifier order is not a preference and never affects tie breaking.
  p.variables.sort((a, b) => a.id.localeCompare(b.id));
  p.derived.sort((a, b) => a.id.localeCompare(b.id));
  p.factors.sort((a, b) => a.id.localeCompare(b.id));
  p.scenarios.sort((a, b) => a.id.localeCompare(b.id));
  p.factors = p.factors.filter((f) => f.mode === 'hard' || f.weight !== 0);
  const ids = new Set<string>();
  for (const v of p.variables) {
    if (ids.has(v.id)) throw new Error(`Duplicate variable ${v.id}`);
    ids.add(v.id);
    v.values = [...new Set(v.values)].sort((a, b) => a - b);
    v.valueAliases?.sort((a, b) => a.value - b.value);
    if (v.locked !== undefined && !v.values.includes(v.locked))
      throw new Error(`Locked ${v.id} outside domain`);
  }
  const scenarioNames = Object.keys(p.scenarios[0]!.values).sort();
  for (const s of p.scenarios) {
    if (canonical(Object.keys(s.values).sort()) !== canonical(scenarioNames))
      throw new Error('Every scenario must declare the same input keys');
  }
  if (new Set(p.scenarios.map((s) => s.id)).size !== p.scenarios.length)
    throw new Error('Duplicate scenario id');
  for (const name of scenarioNames) {
    if (ids.has(name)) throw new Error(`Scenario shadows variable ${name}`);
    ids.add(name);
  }
  const pending = [...p.derived],
    derived: EnergyProgram['derived'] = [];
  while (pending.length) {
    const i = pending.findIndex((d) =>
      expressionRefs(d.expression).every((r) => ids.has(r)),
    );
    if (i < 0) throw new Error('Unknown or cyclic derived dependency');
    const d = pending.splice(i, 1)[0]!;
    if (ids.has(d.id)) throw new Error(`Duplicate derived ${d.id}`);
    validateExpression(d.expression);
    ids.add(d.id);
    derived.push(d);
  }
  const factorIds = new Set<string>();
  for (const f of p.factors) {
    if (factorIds.has(f.id)) throw new Error(`Duplicate factor ${f.id}`);
    factorIds.add(f.id);
    validateExpression(f.expression);
    for (const scenario of Object.keys(f.scenarioBands ?? {}))
      if (!p.scenarios.some((s) => s.id === scenario))
        throw new Error(`Unknown factor scenario ${f.id}.${scenario}`);
    for (const r of expressionRefs(f.expression))
      if (!ids.has(r)) throw new Error(`Unknown factor input ${r}`);
  }
  p.derived = derived;
  function freeze<T>(x: T): T {
    if (x && typeof x === 'object') {
      Object.values(x).forEach(freeze);
      Object.freeze(x);
    }
    return x;
  }
  freeze(p);
  const identity = hash({ engine: 'energy-v1', program: p });
  let factorEvaluations = 0;
  function evaluate(assignment: Assignment): EnergyEvaluation {
    if (Object.keys(assignment).length !== p.variables.length)
      throw new Error('Assignment must specify exactly the declared variables');
    for (const v of p.variables) {
      const x = assignment[v.id];
      if (
        x === undefined ||
        !v.values.includes(x) ||
        (v.locked !== undefined && x !== v.locked)
      )
        throw new Error(`Invalid assignment ${v.id}`);
    }
    const observations: FactorObservation[] = [],
      outputs: Record<string, Assignment> = {};
    let energy = 0,
      hardFailures = 0,
      hardResidual = 0;
    for (const s of p.scenarios) {
      const values = { ...assignment, ...s.values },
        out: Assignment = {};
      for (const d of derived) {
        out[d.id] = evaluateExpression(d.expression, values);
        values[d.id] = out[d.id]!;
      }
      outputs[s.id] = out;
      for (const f of p.factors) {
        factorEvaluations++;
        const value = evaluateExpression(f.expression, values);
        const distance = Math.min(
          ...(f.scenarioBands?.[s.id] ?? f.bands).map((b) =>
            Math.max(b.min - value, 0, value - b.max),
          ),
        );
        const residual = distance / f.scale;
        const contribution =
          f.mode === 'preference' && f.weight !== 0
            ? f.weight * residual * residual
            : 0;
        if (!Number.isFinite(residual) || !Number.isFinite(contribution))
          throw new Error(`Nonfinite factor ${f.id}`);
        if (f.mode === 'hard' && distance > 0) {
          hardFailures++;
          hardResidual += residual;
        }
        energy += contribution;
        if (!Number.isFinite(energy) || !Number.isFinite(hardResidual))
          throw new Error('Nonfinite aggregate energy');
        observations.push({
          id: f.id,
          scenario: s.id,
          value,
          residual,
          energy: contribution,
          mode: f.mode,
          category: f.category,
          provenance: { ...f.provenance },
        });
      }
    }
    return {
      id: hash({ identity, assignment }),
      assignment: { ...assignment },
      hardFailures,
      hardResidual,
      energy,
      factors: observations,
      derived: outputs,
      status:
        hardFailures === 0
          ? 'mathematically-admissible'
          : 'mathematically-rejected',
    };
  }
  return {
    program: p,
    identity,
    evaluate,
    get factorEvaluations() {
      return factorEvaluations;
    },
  };
}
function compare(a: EnergyEvaluation, b: EnergyEvaluation) {
  return (
    a.hardFailures - b.hardFailures ||
    a.hardResidual - b.hardResidual ||
    a.energy - b.energy ||
    canonical(a.assignment).localeCompare(canonical(b.assignment))
  );
}

/** A cost profile is the per-scenario preference vector, not its sum. Equal
 * vectors can still have different geometry or unmodelled visual consequences.
 */
function preferenceProfile(candidate: EnergyEvaluation) {
  return candidate.factors
    .filter((factor) => factor.mode === 'preference')
    .map((factor) => factor.energy);
}

function retainDiverse(
  admissible: EnergyEvaluation[],
  program: EnergyProgram,
  limit: number,
  maxComparisons: number,
) {
  const groups = new Map<
    string,
    { costs: number[]; members: EnergyEvaluation[] }
  >();
  for (const candidate of admissible) {
    const costs = preferenceProfile(candidate),
      key = canonical(costs);
    const group = groups.get(key);
    if (group) group.members.push(candidate);
    else groups.set(key, { costs, members: [candidate] });
  }
  const profiles = [...groups.values()];
  let comparisons = 0,
    exhausted = false;
  const consume = () => {
    if (comparisons === maxComparisons) {
      exhausted = true;
      return false;
    }
    comparisons++;
    return true;
  };
  const dominates = (a: number[], b: number[]) => {
    let strict = false;
    for (let i = 0; i < a.length; i++) {
      if (!consume()) return false;
      if (a[i]! > b[i]!) return false;
      strict ||= a[i]! < b[i]!;
    }
    return strict;
  };
  // Compress plateaus before skyline comparisons. Each scalar comparison is
  // budgeted: 100k evaluated assignments must not imply unbounded all-pairs work.
  let frontier: typeof profiles = [];
  for (const profile of profiles) {
    if (frontier.some((other) => dominates(other.costs, profile.costs))) {
      if (exhausted) break;
      continue;
    }
    if (exhausted) break;
    frontier = frontier.filter(
      (other) => !dominates(profile.costs, other.costs),
    );
    if (exhausted) break;
    frontier.push(profile);
  }
  const paretoComplete = !exhausted;
  // A partial skyline is not a Pareto proof. On exhaustion use the familiar
  // ranked prefix, and explicitly report that no frontier was established.
  let candidates = paretoComplete
    ? frontier.slice(0, limit).map((profile) => profile.members[0]!)
    : admissible.slice(0, limit);
  const paretoIds = paretoComplete
    ? new Set(frontier.flatMap((profile) => profile.members.map((a) => a.id)))
    : new Set<string>();
  // First represent different factor-cost vectors. Only spare slots represent
  // equally ranked geometry, by farthest-first normalized numeric domain distance.
  // This is coverage of authored values; it is not perceptual distance or merit.
  if (paretoComplete && candidates.length < limit) {
    const pool = frontier.flatMap((profile) => profile.members).sort(compare);
    const selected = new Set(candidates.map((a) => a.id));
    while (candidates.length < limit && candidates.length < pool.length) {
      let best: EnergyEvaluation | undefined,
        bestDistance = -1;
      for (const candidate of pool) {
        if (selected.has(candidate.id)) continue;
        let nearest = Infinity;
        for (const other of candidates) {
          let distance = 0;
          for (const variable of program.variables) {
            if (!consume()) break;
            const span = variable.values.at(-1)! - variable.values[0]!;
            if (span > 0)
              distance +=
                ((candidate.assignment[variable.id]! -
                  other.assignment[variable.id]!) /
                  span) **
                2;
          }
          if (exhausted) break;
          nearest = Math.min(nearest, distance);
        }
        if (exhausted) break;
        if (nearest > bestDistance) {
          best = candidate;
          bestDistance = nearest;
        }
      }
      if (exhausted || !best) {
        candidates.push(
          ...pool
            .filter((a) => !selected.has(a.id))
            .slice(0, limit - candidates.length),
        );
        break;
      }
      candidates.push(best);
      selected.add(best.id);
    }
  }
  const first = admissible[0];
  const preferences =
    first?.factors.flatMap((factor, index) => {
      if (factor.mode !== 'preference') return [];
      const observations = admissible.map((a) => a.factors[index]!);
      const definition = program.factors.find((f) => f.id === factor.id)!;
      let minimum = Infinity,
        maximum = -Infinity,
        minimumResidual = Infinity,
        satisfiedAssignments = 0;
      for (const observation of observations) {
        minimum = Math.min(minimum, observation.value);
        maximum = Math.max(maximum, observation.value);
        minimumResidual = Math.min(minimumResidual, observation.residual);
        if (observation.residual === 0) satisfiedAssignments++;
      }
      return [
        {
          id: factor.id,
          scenario: factor.scenario,
          targetBands:
            definition.scenarioBands?.[factor.scenario] ?? definition.bands,
          observedRange: [minimum, maximum],
          minimumResidual,
          satisfiedAssignments,
        },
      ];
    }) ?? [];
  return {
    candidates,
    pareto: candidates.filter((a) => paretoIds.has(a.id)).map((a) => a.id),
    diagnostics: {
      policy: 'pareto-diverse' as const,
      scope:
        'Evaluated mathematically admissible assignments only; numeric profiles do not establish visual equivalence or quality.',
      admissibleAssignments: admissible.length,
      preferenceProfiles: profiles.length,
      paretoProfiles: paretoComplete ? frontier.length : null,
      paretoComplete,
      diversityComplete: !exhausted,
      comparisons,
      maxComparisons,
      retainedPreferenceProfiles: new Set(
        candidates.map((a) => canonical(preferenceProfile(a))),
      ).size,
      minimumEnergyAssignments: first
        ? admissible.filter((a) => a.energy === first.energy).length
        : 0,
      jointlySatisfiedAssignments: admissible.filter((a) =>
        a.factors.every((f) => f.mode === 'hard' || f.residual === 0),
      ).length,
      preferences,
      distance:
        'Squared numeric differences divided by each authored domain span; categorical indices have no perceptual interpretation.',
      fallback: exhausted
        ? paretoComplete
          ? 'ranked remaining Pareto assignments'
          : 'ranked admissible prefix; Pareto membership unknown'
        : null,
    },
  };
}
export function searchEnergy(
  input: z.input<typeof EnergySearchSchema>,
  validation?: { validateAssignment: (assignment: Assignment) => void },
) {
  assertTree(input);
  const request = EnergySearchSchema.parse(input),
    options = EnergySearchOptionsSchema.parse(request.options ?? {}),
    compiled = compileEnergy(request.program),
    p = compiled.program;
  const start = performance.now(),
    domains = p.variables.map((v) =>
      v.locked === undefined ? v.values : [v.locked],
    );
  const cardinality = domains.reduce(
    (n, d) => Math.min(Number.MAX_SAFE_INTEGER, n * d.length),
    1,
  );
  const nodes = (e: Expression): number =>
    typeof e === 'number' || 'ref' in e
      ? 1
      : 1 + e.args.reduce<number>((n, a) => n + nodes(a), 0);
  const operationsPerState = Math.max(
    1,
    p.scenarios.length *
      (p.derived.reduce((n, d) => n + nodes(d.expression), 0) +
        p.factors.reduce((n, f) => n + nodes(f.expression), 0)),
  );
  const observationsPerState = Math.max(
    1,
    p.scenarios.length * p.factors.length,
  );
  const stateBudget = Math.min(
    options.maxEvaluations,
    Math.floor(options.maxFactorObservations / observationsPerState),
    Math.floor(options.maxExpressionOperations / operationsPerState),
  );
  const exhaustive =
    options.method === 'exhaustive' ||
    (options.method === 'auto' && cardinality <= stateBudget);
  const choiceNodes: {
    id: string;
    parent: string | null;
    choice: { variable: string; from: number; to: number } | null;
    seed: Assignment | null;
    energy: number | null;
    status: string;
  }[] = [];
  const seen = new Map<string, EnergyEvaluation>(),
    visited = new Set<string>(),
    invalid: { assignment: Assignment; reason: string }[] = [];
  let attempts = 0;
  const rounds: {
    round: number;
    evaluated: number;
    bestEnergy: number | null;
    admissible: number;
  }[] = [];
  function visit(
    a: Assignment,
    parent: EnergyEvaluation | null = null,
    choice: { variable: string; from: number; to: number } | null = null,
  ) {
    const key = canonical(a);
    if (visited.has(key)) return seen.get(key);
    if (visited.size >= stateBudget) return undefined;
    visited.add(key);
    attempts++;
    try {
      const value = compiled.evaluate(a);
      validation?.validateAssignment(a);
      seen.set(key, value);
      choiceNodes.push({
        id: value.id,
        parent: parent?.id ?? null,
        choice,
        seed: parent ? null : { ...a },
        energy: value.energy,
        status: value.status,
      });
      return value;
    } catch (error) {
      choiceNodes.push({
        id: hash({ identity: compiled.identity, assignment: a }),
        parent: parent?.id ?? null,
        choice,
        seed: parent ? null : { ...a },
        energy: null,
        status: 'undefined-mathematics',
      });
      if (invalid.length < 8)
        invalid.push({ assignment: { ...a }, reason: String(error) });
      return undefined;
    }
  }
  if (exhaustive) {
    const a: Assignment = {};
    function walk(i: number): void {
      if (visited.size >= stateBudget) return;
      if (i === p.variables.length) {
        visit(a);
        return;
      }
      for (const x of domains[i]!) {
        a[p.variables[i]!.id] = x;
        walk(i + 1);
        if (visited.size >= stateBudget) break;
      }
    }
    walk(0);
  } else {
    // Deterministic seeds span domain endpoints and a centre. Full assignments are always evaluated.
    const seeds = [0, 1, 2].map((seed) =>
      Object.fromEntries(
        p.variables.map((v, i) => [
          v.id,
          domains[i]![
            seed === 0
              ? Math.floor((domains[i]!.length - 1) / 2)
              : seed === 1
                ? 0
                : domains[i]!.length - 1
          ]!,
        ]),
      ),
    );
    seeds.forEach((a) => visit(a));
    let beam = [...seen.values()].sort(compare).slice(0, options.beamWidth);
    for (
      let round = 0;
      round < options.rounds && visited.size < stateBudget;
      round++
    ) {
      const oldSize = visited.size;
      const parents = beam.length
        ? beam.map((p) => ({ assignment: p.assignment, evaluation: p }))
        : seeds.map((a) => ({ assignment: a, evaluation: null }));
      expand: for (const parent of parents)
        for (let i = 0; i < p.variables.length; i++)
          for (const value of domains[i]!) {
            const variable = p.variables[i]!.id;
            visit(
              { ...parent.assignment, [variable]: value },
              parent.evaluation,
              { variable, from: parent.assignment[variable]!, to: value },
            );
            if (visited.size >= stateBudget) break expand;
          }
      beam = [...seen.values()].sort(compare).slice(0, options.beamWidth);
      const best = beam.find((v) => v.hardFailures === 0);
      rounds.push({
        round,
        evaluated: seen.size,
        bestEnergy: best?.energy ?? null,
        admissible: [...seen.values()].filter((v) => v.hardFailures === 0)
          .length,
      });
      if (visited.size === oldSize) break;
    }
  }
  const ranked = [...seen.values()].sort(compare),
    admissible = ranked.filter((x) => x.hardFailures === 0),
    diversity =
      options.retention === 'pareto-diverse'
        ? retainDiverse(
            admissible,
            p,
            options.limit,
            options.maxRetentionComparisons ?? 1000000,
          )
        : null,
    candidates = diversity?.candidates ?? admissible.slice(0, options.limit);
  // Strict dominance is evaluated on individual preference factors, not the weighted aggregate.
  const pareto =
    diversity?.pareto ??
    candidates
      .filter(
        (a) =>
          !admissible.some(
            (b) =>
              b !== a &&
              b.factors.every(
                (f, i) => f.mode === 'hard' || f.energy <= a.factors[i]!.energy,
              ) &&
              b.factors.some(
                (f, i) =>
                  f.mode === 'preference' && f.energy < a.factors[i]!.energy,
              ),
          ),
      )
      .map((c) => c.id);
  return {
    version: 1 as const,
    programIdentity: compiled.identity,
    program: p,
    status: candidates.length
      ? ('proposed' as const)
      : ('no-admissible-candidate' as const),
    candidates,
    pareto,
    ...(diversity ? { retention: diversity.diagnostics } : {}),
    rejected: ranked
      .filter((x) => x.hardFailures > 0)
      .slice(0, 3)
      .map((x) => ({
        id: x.id,
        assignment: x.assignment,
        failures: x.factors.filter((f) => f.mode === 'hard' && f.residual > 0),
      })),
    choiceGraph: {
      nodes: choiceNodes,
      roots: choiceNodes.filter((n) => n.parent === null).map((n) => n.id),
      semantics:
        'Every edge is an evaluated local numeric mutation; nodes are predictions/calculations, not renderer receipts.',
    },
    trace: rounds,
    invalid,
    statistics: {
      evaluated: attempts,
      factorEvaluations: compiled.factorEvaluations,
      uniqueStateBudget: options.maxEvaluations,
      effectiveStateBudget: stateBudget,
      expressionOperationUpperBound: attempts * operationsPerState,
      observationBudget: options.maxFactorObservations,
      cardinality,
      method: exhaustive ? 'exhaustive' : 'beam',
      complete: exhaustive && attempts === cardinality,
      latencyMs: performance.now() - start,
      selectorCalls: 0,
      mainAgentCalls: 0,
    },
    scope:
      'Brief-conditioned dimensionless preference energy, never an aesthetic or physical-unit score. Mathematical admissibility is not renderer verification.',
  };
}
