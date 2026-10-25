import { z } from 'zod';
import {
  EnergyProgramSchema,
  compileEnergy,
  type Assignment,
} from './energy.js';
export const EnergyAnalyzeSchema = z
  .object({
    program: EnergyProgramSchema,
    assignment: z.record(z.string(), z.number().finite()),
  })
  .strict();
/** Local finite differences reveal brief-conditioned pressures, including discontinuous neighbours. */
export function analyzeEnergy(input: z.input<typeof EnergyAnalyzeSchema>) {
  const r = EnergyAnalyzeSchema.parse(input),
    c = compileEnergy(r.program),
    baseline = c.evaluate(r.assignment);
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
    scope:
      'Finite differences of this brief preference energy per variable unit. Hard failures stay separate; discontinuous topology and line wrapping prevent a global gradient/beauty interpretation.',
  };
}
