import * as z from 'zod';

const length = z.number().finite().nonnegative().max(1e6);
const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
export const FlowGapControlSchema = z
  .object({
    currentGap: length,
    preferredGap: length,
    minimumGap: length,
    maximumGap: length,
    step: z.number().finite().min(1e-6).max(1e6).default(0.25),
    endClearance: length.default(0),
    targets: z
      .array(
        z
          .object({
            member: id,
            intervalsBefore: z.number().int().min(0).max(128),
          })
          .strict(),
      )
      .min(1)
      .max(16),
    source: z.string().min(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.minimumGap > v.maximumGap)
      ctx.addIssue({
        code: 'custom',
        path: ['minimumGap'],
        message: 'minimumGap exceeds maximumGap',
      });
    if (new Set(v.targets.map((t) => t.member)).size !== v.targets.length)
      ctx.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'gap target members must be unique',
      });
  });
const ObservationSchema = z
  .object({
    extent: length.positive(),
    regions: z
      .array(
        z
          .object({
            id,
            start: z.number().finite().nullable(),
            end: z.number().finite().nullable(),
            crossAxisFits: z.boolean().nullable(),
          })
          .strict(),
      )
      .max(128),
  })
  .strict();

/** Nearest preferred gap on an authored grid, subject to affine flow containment.
 * Counts and no-reflow topology are caller declarations. Predictions require a
 * new renderer observation; this does not certify visibility or design quality. */
export function projectFlowGap(
  rawControl: z.input<typeof FlowGapControlSchema>,
  rawObservation: z.input<typeof ObservationSchema>,
) {
  const control = FlowGapControlSchema.parse(rawControl),
    observation = ObservationSchema.parse(rawObservation);
  if (
    new Set(observation.regions.map((r) => r.id)).size !==
    observation.regions.length
  )
    throw Error('Flow-gap observation IDs must be unique');
  const targets = control.targets.map((target) => {
    const region = observation.regions.find((r) => r.id === target.member);
    if (!region) throw Error(`Missing flow-gap observation ${target.member}`);
    if (
      region.start !== null &&
      region.end !== null &&
      region.end < region.start
    )
      throw Error(`Inverted flow-gap region ${target.member}`);
    return { ...target, ...region };
  });
  const scope =
    'One affine gap variable; translation count and unchanged wrapping are caller-authored. Predicted containment requires fresh renderer verification. Not an aesthetic score.';
  const base = { control, scope, requiresRendererVerification: true as const };
  const unavailable = targets.filter(
    (t) => t.start === null || t.end === null || t.crossAxisFits === null,
  );
  if (unavailable.length)
    return {
      ...base,
      status: 'unavailable' as const,
      suggestedGap: null,
      feasibleBand: null,
      predicted: [],
      reasons: unavailable.map((t) => `Unmeasured target ${t.member}`),
    };
  let lower = control.minimumGap,
    upper = control.maximumGap;
  const reasons: string[] = [];
  for (const t of targets) {
    if (!t.crossAxisFits)
      reasons.push(
        `Cross-axis clipping cannot be repaired by this gap: ${t.member}`,
      );
    if (!t.intervalsBefore) {
      if (t.start! < 0 || t.end! > observation.extent - control.endClearance)
        reasons.push(`Target does not move with this gap: ${t.member}`);
      continue;
    }
    lower = Math.max(lower, control.currentGap - t.start! / t.intervalsBefore);
    upper = Math.min(
      upper,
      control.currentGap +
        (observation.extent - control.endClearance - t.end!) /
          t.intervalsBefore,
    );
  }
  // Division may put an exactly generated decimal grid point on the wrong
  // side of ceil/floor. Examine adjacent indices, then check the reconstructed
  // coordinates strictly. No epsilon loosens containment or authored bounds.
  const indices = new Set<number>();
  for (const value of [
    lower,
    upper,
    control.preferredGap,
    control.minimumGap,
    control.maximumGap,
  ]) {
    const quotient = (value - control.minimumGap) / control.step;
    for (const rounded of [Math.floor(quotient), Math.ceil(quotient)])
      for (const offset of [-1, 0, 1])
        if (Number.isSafeInteger(rounded + offset) && rounded + offset >= 0)
          indices.add(rounded + offset);
  }
  const feasible = [...indices]
    .map((index) => control.minimumGap + index * control.step)
    .filter(
      (gap) =>
        Number.isFinite(gap) &&
        gap >= control.minimumGap &&
        gap <= control.maximumGap &&
        targets.every(
          (t) =>
            t.start! + t.intervalsBefore * (gap - control.currentGap) >= 0 &&
            t.end! + t.intervalsBefore * (gap - control.currentGap) <=
              observation.extent - control.endClearance,
        ),
    );
  if (reasons.length || !feasible.length)
    return {
      ...base,
      status: 'infeasible' as const,
      suggestedGap: null,
      feasibleBand: null,
      predicted: [],
      reasons: reasons.length
        ? reasons
        : ['No gap in the authored grid satisfies all target bounds'],
    };
  const gap = feasible.sort(
    (a, b) =>
      Math.abs(a - control.preferredGap) - Math.abs(b - control.preferredGap) ||
      a - b,
  )[0]!;
  return {
    ...base,
    status: 'proposed' as const,
    suggestedGap: gap,
    feasibleBand: { min: Math.min(...feasible), max: Math.max(...feasible) },
    bandScope:
      'Authored grid points between these endpoints, conditional on the affine model; not a continuous renderer guarantee',
    squaredDisplacementFromPreferred: (gap - control.preferredGap) ** 2,
    predicted: targets.map((t) => ({
      id: t.member,
      start: t.start! + t.intervalsBefore * (gap - control.currentGap),
      end: t.end! + t.intervalsBefore * (gap - control.currentGap),
    })),
    reasons: [],
  };
}
