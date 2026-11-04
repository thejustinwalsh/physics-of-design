import { z } from 'zod';
import {
  EnergyProgramSchema,
  compileEnergy,
  type Assignment,
} from './energy.js';
import { hash } from './identity.js';
import {
  differentiateExpression,
  mapExpressionRegimes,
} from './layout-calculus.js';
import { classifyEnclosureBands, encloseExpression } from './math-enclosure.js';
const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/);
const geometrySchema = z
  .object({
    scenario: id,
    outputs: z.array(id).min(1).max(16),
    wrt: z.array(id).min(1).max(16),
    envelope: z
      .object({
        input: id,
        min: z.number().finite(),
        max: z.number().finite(),
        precision: z.number().finite().positive().default(0.25),
        maxCells: z.number().int().min(1).max(2048).default(256),
      })
      .strict()
      .refine((e) => e.min < e.max, 'Envelope minimum must be below maximum')
      .optional(),
  })
  .strict();
export const EnergyAnalyzeSchema = z
  .object({
    program: EnergyProgramSchema,
    assignment: z.record(z.string(), z.number().finite()),
    geometry: geometrySchema.optional(),
  })
  .strict();
/** Local finite differences reveal brief-conditioned pressures, including discontinuous neighbours. */
export function analyzeEnergy(input: z.input<typeof EnergyAnalyzeSchema>) {
  const r = EnergyAnalyzeSchema.parse(input),
    c = compileEnergy(r.program),
    baseline = c.evaluate(r.assignment);
  const geometry = (() => {
    const request = r.geometry;
    if (!request) return undefined;
    const scenario = c.program.scenarios.find((s) => s.id === request.scenario);
    if (!scenario)
      throw new Error(`Unknown geometry scenario ${request.scenario}`);
    if (
      new Set(request.outputs).size !== request.outputs.length ||
      new Set(request.wrt).size !== request.wrt.length
    )
      throw new Error('Geometry outputs and sensitivity inputs must be unique');
    const values = { ...r.assignment, ...scenario.values };
    const definitions = Object.fromEntries(
      c.program.derived.map((d) => [d.id, d.expression]),
    );
    const envelope = request.envelope;
    if (envelope && !Object.hasOwn(values, envelope.input))
      throw new Error(`Unknown envelope input ${envelope.input}`);
    const boxes = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        { min: value, max: value },
      ]),
    );
    if (envelope)
      boxes[envelope.input] = { min: envelope.min, max: envelope.max };
    return {
      identity: hash({
        engine: 'layout-calculus-v1',
        programIdentity: c.identity,
        assignment: r.assignment,
        request,
      }),
      engine: 'layout-calculus-v1',
      scenario: scenario.id,
      outputs: request.outputs.map((key) => {
        const definition = c.program.derived.find((d) => d.id === key);
        if (!definition)
          throw new Error(`Unknown derived geometry output ${key}`);
        const expression = { ref: key };
        return {
          id: key,
          unit: definition.unit ?? null,
          provenance: definition.provenance,
          sensitivity: differentiateExpression(
            expression,
            values,
            request.wrt,
            definitions,
          ),
          ...(envelope
            ? {
                enclosure: encloseExpression(expression, boxes, definitions),
                regimes: mapExpressionRegimes(
                  expression,
                  values,
                  envelope,
                  definitions,
                ),
              }
            : {}),
        };
      }),
      hardConstraints: envelope
        ? c.program.factors
            .filter((f) => f.mode === 'hard')
            .map((factor) => {
              if (Object.keys(factor.scenarioBands ?? {}).length)
                return {
                  factor: factor.id,
                  status: 'unresolved' as const,
                  enclosure: null,
                  reason:
                    'Scenario-specific bands are not declared applicable throughout this envelope',
                };
              const enclosure = encloseExpression(
                factor.expression,
                boxes,
                definitions,
              );
              return {
                factor: factor.id,
                status: classifyEnclosureBands(enclosure, factor.bands),
                enclosure,
                bands: factor.bands,
                provenance: factor.provenance,
              };
            })
        : [],
      scope:
        'Sensitivities and conservative bounds of declared quantities with other inputs held fixed. Hard-constraint bounds use base bands only. These are model calculations, not current renderer observations, accessibility certification or aesthetic quality.',
    };
  })();
  const effects = c.program.variables.map((v) => {
    const values =
      v.locked !== undefined
        ? []
        : v.values.filter((x) => x !== r.assignment[v.id]);
    const below = values.filter((x) => x < r.assignment[v.id]!).at(-1),
      above = values.find((x) => x > r.assignment[v.id]!);
    const probes = [below, above]
      .filter((x): x is number => x !== undefined)
      .map((value) => {
        const a: Assignment = { ...r.assignment, [v.id]: value };
        try {
          const e = c.evaluate(a);
          return {
            value,
            energy: e.energy,
            energyChange: e.energy - baseline.energy,
            hardFailures: e.hardFailures,
            status: e.status,
            changedDerived: Object.fromEntries(
              c.program.scenarios.map((s) => [
                s.id,
                Object.keys(e.derived[s.id]!).filter(
                  (id) => e.derived[s.id]![id] !== baseline.derived[s.id]![id],
                ),
              ]),
            ),
          };
        } catch (error) {
          return {
            value,
            status: 'undefined-mathematics',
            reason: String(error),
          };
        }
      });
    const valid = probes.filter(
      (p): p is Extract<typeof p, { energy: number }> =>
        'energy' in p && p.hardFailures === 0,
    );
    const left = valid.find((p) => p.value < r.assignment[v.id]!),
      right = valid.find((p) => p.value > r.assignment[v.id]!);
    const slope =
      left && right
        ? (right.energy - left.energy) / (right.value - left.value)
        : valid.length
          ? (valid[0]!.energy - baseline.energy) /
            (valid[0]!.value - r.assignment[v.id]!)
          : null;
    return {
      variable: v.id,
      unit: v.unit,
      locked: v.locked !== undefined,
      negativeEnergySlope: slope === null ? null : -slope,
      probes,
    };
  });
  return {
    programIdentity: c.identity,
    baseline,
    effects,
    ...(geometry ? { geometry } : {}),
    scope:
      'Finite differences of this brief preference energy per variable unit. Hard failures stay separate; discontinuous topology and line wrapping prevent a global gradient/beauty interpretation.',
  };
}
