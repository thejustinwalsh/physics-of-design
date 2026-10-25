import {
  MotionAnalyzeSchema,
  sampleMotion,
  type MotionInput,
} from './motion.js';
import { z } from 'zod';

export type DrivenMotionOptions = {
  spring?: MotionInput['spring'];
  position: number;
  target?: number;
  velocity?: number;
};
export type DrivenMotionState = {
  position: number;
  velocity: number;
  target: number;
  energy: number;
  initialEnergy: number;
  targetWork: number;
  dissipated: number;
  elapsedSeconds: number;
};

function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}
function stepTime(value: number) {
  finite(value, 'dtSeconds');
  if (value < 0 || value > 30)
    throw new RangeError('dtSeconds must be in [0,30]');
}

/** Exact held-target propagation. Retarget between steps; targets may do signed work.
 * No clock, DOM, layout reads, React updates or renderer dependency. */
export function createDrivenMotion(options: DrivenMotionOptions) {
  const parsed = MotionAnalyzeSchema.parse({
    ...(options.spring === undefined ? {} : { spring: options.spring }),
    coordinate: {
      unit: 'normalized',
      from: options.position,
      to: options.target ?? options.position,
      initialVelocity: options.velocity ?? 0,
    },
  });
  const { mass: m, stiffness: k, damping: c } = parsed.spring;
  const alpha = c / (2 * m),
    omega2 = k / m,
    delta = alpha * alpha - omega2;
  let x = parsed.coordinate.from,
    v = parsed.coordinate.initialVelocity;
  let target = parsed.coordinate.to,
    targetWork = 0,
    dissipated = 0,
    elapsedSeconds = 0;
  const energy = () => (m * v * v + k * (x - target) ** 2) / 2;
  const initialEnergy = energy();
  const snapshot = (): DrivenMotionState => ({
    position: x,
    velocity: v,
    target,
    energy: energy(),
    initialEnergy,
    targetWork,
    dissipated,
    elapsedSeconds,
  });
  return {
    snapshot,
    retarget(nextTarget: number) {
      finite(nextTarget, 'target');
      if (Math.abs(nextTarget) > 1e6)
        throw new RangeError('target must be in [-1e6,1e6]');
      // An instantaneous anchor displacement changes potential, never x or v.
      targetWork += (k * ((x - nextTarget) ** 2 - (x - target) ** 2)) / 2;
      target = nextTarget;
      return snapshot();
    },
    advance(dtSeconds: number) {
      stepTime(dtSeconds);
      if (dtSeconds === 0) return snapshot();
      const before = energy(),
        y = x - target;
      // Same stable closed form as sampleMotion, compiled once rather than parsing per tick.
      let C: number, S: number;
      if (delta < 0) {
        const beta = Math.sqrt(-delta),
          angle = beta * dtSeconds;
        const envelope = Math.exp(-alpha * dtSeconds);
        C = envelope * Math.cos(angle);
        S =
          envelope *
          (Math.abs(angle) < 1e-4
            ? dtSeconds * (1 - (angle * angle) / 6 + angle ** 4 / 120)
            : Math.sin(angle) / beta);
      } else if (delta === 0) {
        C = Math.exp(-alpha * dtSeconds);
        S = dtSeconds * C;
      } else {
        const d = Math.sqrt(delta),
          slow = -omega2 / (alpha + d);
        const eSlow = Math.exp(slow * dtSeconds);
        C = (eSlow + Math.exp(-(alpha + d) * dtSeconds)) / 2;
        S = (eSlow * -Math.expm1(-2 * d * dtSeconds)) / (2 * d);
      }
      const nextX = target + y * C + (v + alpha * y) * S;
      const nextV = v * C - (alpha * v + omega2 * y) * S;
      finite(nextX, 'propagated position');
      finite(nextV, 'propagated velocity');
      x = nextX;
      v = nextV;
      // Small signed roundoff remains visible in this analytic energy balance.
      dissipated += before - energy();
      elapsedSeconds += dtSeconds;
      return snapshot();
    },
  };
}

export const MotionTimelineSchema = z
  .object({
    motion: MotionAnalyzeSchema,
    min: z.number().finite().min(-1e6).max(1e6),
    max: z.number().finite().min(-1e6).max(1e6),
    sampleCount: z.number().int().min(2).max(2048).optional(),
  })
  .strict()
  .refine((v) => v.min <= v.max, 'min must not exceed max');
export type MotionTimelineOptions = z.input<typeof MotionTimelineSchema>;

/** Offline table for bounded property/timeline channels. Projection is an explicit
 * presentation policy, not a claim that the projected samples obey spring energy. */
export function sampleMotionTimeline(options: MotionTimelineOptions) {
  options = MotionTimelineSchema.parse(options);
  const motion = MotionAnalyzeSchema.parse({
    ...options.motion,
    ...(options.sampleCount === undefined
      ? {}
      : { sampleCount: options.sampleCount }),
  });
  let projectedSamples = 0;
  const values = Array.from({ length: motion.sampleCount }, (_, i) => {
    const raw = sampleMotion(
      motion,
      (motion.durationSeconds * i) / (motion.sampleCount - 1),
    ).position;
    const value = Math.min(options.max, Math.max(options.min, raw));
    if (value !== raw) projectedSamples++;
    return value;
  });
  return {
    values,
    min: options.min,
    max: options.max,
    durationSeconds: motion.durationSeconds,
    provenance: {
      kind: 'sampled-bounded-motion' as const,
      model: 'sampleMotion analytic stationary spring',
      interpolation: 'piecewise-linear' as const,
      projection: 'clamp sampled positions to caller bounds' as const,
      projectedSamples,
      sampleCount: values.length,
      endpointPolicy:
        'retain sampled endpoint; no forced snap to target' as const,
      limitation:
        'Presentation samples only: projection/interpolation do not preserve spring energy or certify continuous source extrema.',
    },
  };
}
export type MotionTimeline = ReturnType<typeof sampleMotionTimeline>;

/** O(1) lookup; use a table produced by sampleMotionTimeline. Progress is clamped. */
export function sampleTimelineProgress(
  table: MotionTimeline,
  progress: number,
) {
  finite(progress, 'progress');
  const index = Math.min(1, Math.max(0, progress)) * (table.values.length - 1);
  const lo = Math.floor(index),
    hi = Math.min(lo + 1, table.values.length - 1);
  return (
    table.values[lo]! * (1 - (index - lo)) + table.values[hi]! * (index - lo)
  );
}

/** Increasing or decreasing authored scroll ranges; geometry is supplied by the host. */
export function scrollProgress(position: number, start: number, end: number) {
  finite(position, 'position');
  finite(start, 'start');
  finite(end, 'end');
  if (start === end)
    throw new RangeError('scroll range must have nonzero length');
  return Math.min(1, Math.max(0, (position - start) / (end - start)));
}

/** Exact first-order hold response. Rate is per second, not a per-frame lerp. */
export function dampMotionValue(
  current: number,
  target: number,
  rate: number,
  dtSeconds: number,
) {
  finite(current, 'current');
  finite(target, 'target');
  finite(rate, 'rate');
  stepTime(dtSeconds);
  if (rate < 0) throw new RangeError('rate must be nonnegative');
  const weight = -Math.expm1(-rate * dtSeconds);
  // Convex form also handles opposite, very large finite inputs without overflow.
  return current * (1 - weight) + target * weight;
}

const coordinate = z.number().finite().min(-1e6).max(1e6);
export const MotionDynamicsSchema = z
  .object({
    spring: MotionAnalyzeSchema.shape.spring,
    position: coordinate,
    target: coordinate.optional(),
    velocity: coordinate.optional(),
    steps: z
      .array(
        z
          .object({
            dtSeconds: z.number().finite().min(0).max(30),
            target: coordinate.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(2048),
  })
  .strict();
export type MotionDynamicsInput = z.input<typeof MotionDynamicsSchema>;

/** Bounded serializable trace for CLI/MCP inspection; retarget occurs before each step. */
export function analyzeMotionDynamics(input: MotionDynamicsInput) {
  const request = MotionDynamicsSchema.parse(input);
  const driver = createDrivenMotion({
    spring: request.spring,
    position: request.position,
    ...(request.target === undefined ? {} : { target: request.target }),
    ...(request.velocity === undefined ? {} : { velocity: request.velocity }),
  });
  const initial = driver.snapshot();
  const samples = request.steps.map((step) => {
    if (step.target !== undefined) driver.retarget(step.target);
    return driver.advance(step.dtSeconds);
  });
  const final = driver.snapshot();
  return {
    initial,
    final,
    samples,
    balanceResidual:
      final.energy - (initial.energy + final.targetWork - final.dissipated),
    provenance: {
      kind: 'analytic-held-target-segments' as const,
      model: 'm*x″+c*x′+k*(x-target)=0 between target changes',
      targetWork:
        'k/2*((x-newTarget)^2-(x-oldTarget)^2); x and velocity continuous',
      dissipation:
        'sum of before-minus-after segment energy; signed floating-point roundoff retained',
      assumptions:
        'No collision, clamp or external force; target is held within each step. UI energy units are abstract.',
      limitation:
        'Partition invariance holds only for the same timed target schedule; sampled scroll retarget schedules can differ with frame cadence.',
    },
  };
}
