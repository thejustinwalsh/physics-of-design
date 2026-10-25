import { z } from 'zod';

const finite = z.number().finite();
const coordinateValue = finite.min(-1e6).max(1e6);
export const MotionSpringSchema = z
  .object({
    mass: finite.min(0.001).max(1000).default(1),
    stiffness: finite.min(0.0001).max(10000).default(100),
    damping: finite.min(0).max(10000).default(20),
  })
  .strict();
const interval = z
  .object({ min: coordinateValue, max: coordinateValue })
  .strict()
  .refine((v) => v.min <= v.max, 'min must not exceed max');
export const MotionAnalyzeSchema = z
  .object({
    spring: MotionSpringSchema.default({
      mass: 1,
      stiffness: 100,
      damping: 20,
    }),
    coordinate: z
      .object({
        unit: z.enum(['normalized', 'px', 'dp', 'deg', 'scale', 'opacity']),
        from: coordinateValue,
        to: coordinateValue,
        initialVelocity: coordinateValue.default(0),
      })
      .strict(),
    durationSeconds: finite.min(0.001).max(30).default(2),
    sampleCount: z.number().int().min(2).max(2048).default(121),
    settling: z
      .object({
        positionTolerance: finite.min(1e-9).max(1e6).default(0.001),
        speedTolerance: finite.min(1e-9).max(1e6).default(0.001),
      })
      .strict()
      .default({ positionTolerance: 0.001, speedTolerance: 0.001 }),
    bounds: interval.nullable().default(null),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      Math.sqrt(v.spring.stiffness / v.spring.mass) > 1000 ||
      v.spring.damping / (2 * v.spring.mass) > 1e5
    )
      ctx.addIssue({
        code: 'custom',
        path: ['spring'],
        message:
          'analytic operational envelope: omega0 <= 1000/s and damping/(2*mass) <= 100000/s',
      });
  });
export type MotionInput = z.input<typeof MotionAnalyzeSchema>;
export type Motion = z.infer<typeof MotionAnalyzeSchema>;
export type MotionSample = {
  time: number;
  position: number;
  displacement: number;
  velocity: number;
  acceleration: number;
  kinetic: number;
  potential: number;
  energy: number;
  energyDerivative: number;
};
const SOURCES = {
  model:
    'm*x\u2033 + c*x\u2032 + k*(x-target) = 0; stationary target, no forcing',
  reducedMotion:
    'https://www.w3.org/TR/2026/WD-mediaqueries-5-20260219/#prefers-reduced-motion',
  native:
    'native/node_modules/react-native/Libraries/Animated/animations/SpringAnimation.js (inspected React Native 0.88.0)',
};

function system(motion: Motion) {
  const { mass: m, stiffness: k, damping: c } = motion.spring;
  const alpha = c / (2 * m),
    omega2 = k / m,
    delta = alpha * alpha - omega2;
  const y0 = motion.coordinate.from - motion.coordinate.to,
    v0 = motion.coordinate.initialVelocity;
  const q = alpha * v0 + omega2 * y0;
  const regime =
    delta < 0
      ? c === 0
        ? 'undamped'
        : 'underdamped'
      : delta === 0
        ? 'critical'
        : 'overdamped';
  function at(time: number): MotionSample {
    let C: number, S: number;
    if (delta < 0) {
      const beta = Math.sqrt(-delta),
        angle = beta * time,
        envelope = Math.exp(-alpha * time);
      C = envelope * Math.cos(angle);
      // sinc avoids cancellation/zero division as the underdamped limit approaches critical.
      S =
        envelope *
        (Math.abs(angle) < 1e-4
          ? time * (1 - (angle * angle) / 6 + angle ** 4 / 120)
          : Math.sin(angle) / beta);
    } else if (delta === 0) {
      C = Math.exp(-alpha * time);
      S = time * C;
    } else {
      const d = Math.sqrt(delta),
        slow = -omega2 / (alpha + d),
        fast = -(alpha + d);
      const eSlow = Math.exp(slow * time),
        eFast = Math.exp(fast * time);
      C = (eSlow + eFast) / 2;
      // No cosh overflow; expm1 is stable when the two roots almost coincide.
      S = (eSlow * -Math.expm1(-2 * d * time)) / (2 * d);
    }
    const displacement = time === 0 ? y0 : y0 * C + (v0 + alpha * y0) * S;
    const velocity = time === 0 ? v0 : v0 * C - q * S;
    const acceleration = -(c * velocity + k * displacement) / m;
    const kinetic = 0.5 * m * velocity * velocity,
      potential = 0.5 * k * displacement * displacement;
    const point = {
      time,
      position: motion.coordinate.to + displacement,
      displacement,
      velocity,
      acceleration,
      kinetic,
      potential,
      energy: kinetic + potential,
      energyDerivative: -c * velocity * velocity,
    };
    if (Object.values(point).some((n) => !Number.isFinite(n)))
      throw new RangeError('non-finite analytic motion result');
    return point;
  }
  function roots(
    a: number,
    b: number,
  ): { first: number | null; period: number | null } {
    // a*C + b*S = 0; zero-time roots are excluded, including a static trajectory.
    if (a === 0 && b === 0) return { first: null, period: null };
    if (delta < 0) {
      const beta = Math.sqrt(-delta),
        period = Math.PI / beta;
      let angle = Math.atan2(-a, b / beta) % Math.PI;
      if (angle <= 0) angle += Math.PI;
      return { first: angle / beta, period };
    }
    if (delta === 0) {
      const t = -a / b;
      return { first: Number.isFinite(t) && t > 0 ? t : null, period: null };
    }
    const d = Math.sqrt(delta),
      ratio = (-a * d) / b;
    const t = Math.abs(ratio) < 1 ? Math.atanh(ratio) / d : NaN;
    return { first: Number.isFinite(t) && t > 0 ? t : null, period: null };
  }
  return {
    at,
    regime,
    alpha,
    omega0: Math.sqrt(omega2),
    dampingRatio: alpha / Math.sqrt(omega2),
    extrema: roots(v0, -q),
    crossings: roots(y0, v0 + alpha * y0),
  };
}

/** Analytic stationary-target solution, also useful for scrubbing an original proof. */
export function sampleMotion(
  input: MotionInput,
  timeSeconds: number,
): MotionSample {
  const motion = MotionAnalyzeSchema.parse(input);
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || timeSeconds > 30)
    throw new RangeError('sample time must be in [0,30] seconds');
  return system(motion).at(timeSeconds);
}
function effectiveBounds(m: Motion) {
  let lo = m.bounds?.min ?? -Infinity,
    hi = m.bounds?.max ?? Infinity;
  if (m.coordinate.unit === 'opacity') {
    lo = Math.max(0, lo);
    hi = Math.min(1, hi);
  }
  return {
    min: Number.isFinite(lo) ? lo : null,
    max: Number.isFinite(hi) ? hi : null,
  };
}
function inBounds(value: number, bounds: ReturnType<typeof effectiveBounds>) {
  return (
    (bounds.min === null || value >= bounds.min) &&
    (bounds.max === null || value <= bounds.max)
  );
}

function computeMotion(input: MotionInput, includeSamples: boolean) {
  const motion = MotionAnalyzeSchema.parse(input),
    s = system(motion),
    duration = motion.durationSeconds;
  const count = includeSamples ? motion.sampleCount : 2;
  const samples = Array.from({ length: count }, (_, i) =>
    s.at((duration * i) / (count - 1)),
  );
  // Damped extrema alternate and decay; the first two contain all future amplitude extrema.
  const eventTimes =
    s.extrema.first === null
      ? []
      : [
          s.extrema.first,
          ...(s.extrema.period === null
            ? []
            : [s.extrema.first + s.extrema.period]),
        ];
  const horizonPoints = [
    samples[0]!,
    samples.at(-1)!,
    ...eventTimes.filter((t) => t <= duration).map(s.at),
  ];
  const globalPoints = [
    samples[0]!,
    { position: motion.coordinate.to },
    ...eventTimes.map(s.at),
  ];
  const extrema = {
    min: Math.min(...horizonPoints.map((p) => p.position)),
    max: Math.max(...horizonPoints.map((p) => p.position)),
  };
  const allTimeRange = {
    min: Math.min(...globalPoints.map((p) => p.position)),
    max: Math.max(...globalPoints.map((p) => p.position)),
  };
  const span = motion.coordinate.to - motion.coordinate.from;
  const overshoot =
    span > 0
      ? Math.max(0, extrema.max - motion.coordinate.to)
      : span < 0
        ? Math.max(0, motion.coordinate.to - extrema.min)
        : null;
  const allTimeOvershoot =
    span > 0
      ? Math.max(0, allTimeRange.max - motion.coordinate.to)
      : span < 0
        ? Math.max(0, motion.coordinate.to - allTimeRange.min)
        : null;
  const bounds = effectiveBounds(motion);
  const { positionTolerance: px, speedTolerance: pv } = motion.settling;
  const threshold = Math.min(
    0.5 * motion.spring.stiffness * px * px,
    0.5 * motion.spring.mass * pv * pv,
  );
  let certified: number | null = null;
  if (samples[0]!.energy <= threshold) certified = 0;
  else if (samples.at(-1)!.energy <= threshold) {
    let lo = 0,
      hi = duration;
    for (let i = 0; i < 64; i++) {
      const mid = (lo + hi) / 2;
      if (s.at(mid).energy <= threshold) hi = mid;
      else lo = mid;
    }
    certified = hi;
  }
  const lastOutside = samples.findLastIndex(
    (p) => Math.abs(p.displacement) > px || Math.abs(p.velocity) > pv,
  );
  const sampled =
    !includeSamples || lastOutside === samples.length - 1
      ? null
      : samples[lastOutside + 1]!.time;
  const crossings =
    s.crossings.first === null || s.crossings.first > duration
      ? 0
      : 1 +
        (s.crossings.period === null
          ? 0
          : Math.floor((duration - s.crossings.first) / s.crossings.period));
  return {
    motion,
    regime: s.regime,
    omega0: s.omega0,
    dampingRatio: s.dampingRatio,
    samples,
    phaseCurve: samples.map((p) => ({
      displacement: p.displacement,
      velocity: p.velocity,
    })),
    metrics: {
      peakOvershoot: overshoot,
      overshootHorizonSeconds: duration,
      allTimePeakOvershoot: allTimeOvershoot,
      allTimePeakOvershootRatio:
        span === 0 ? null : allTimeOvershoot! / Math.abs(span),
      peakOvershootRatio: span === 0 ? null : overshoot! / Math.abs(span),
      extrema,
      allTimeRange,
      targetCrossings: crossings,
      oscillationPeriodSeconds:
        s.crossings.period === null ? null : 2 * s.crossings.period,
      settling: {
        certifiedBySeconds: certified,
        observedSampledSeconds: sampled,
        horizonSeconds: duration,
        method:
          'Certificate: E <= min(k*positionTolerance^2,m*speedTolerance^2)/2 implies both bounds for all future times. Conservative, not earliest settling. Sampled observation only covers this horizon.',
      },
    },
    constraints: {
      bounds,
      passesAllTimeBounds:
        inBounds(allTimeRange.min, bounds) &&
        inBounds(allTimeRange.max, bounds),
      accessibility:
        'not evaluated by spring physics; reduced-motion substitution is an emission policy',
      content:
        'not evaluated: readability, flashing, occlusion, semantic timing and task success need renderer/context evidence',
    },
    units: {
      time: 'seconds',
      position: motion.coordinate.unit,
      velocity: `${motion.coordinate.unit}/second`,
      acceleration: `${motion.coordinate.unit}/second^2`,
      mass: 'abstract inertia M',
      stiffness: 'M/second^2',
      damping: 'M/second',
      energy: `M*${motion.coordinate.unit}^2/second^2; UI model energy, not physical joules`,
    },
    energy: {
      initial: samples[0]!.energy,
      final: samples.at(-1)!.energy,
      law: 'E = (m*v^2+k*(x-target)^2)/2; dE/dt = -c*v^2. Constant for c=0; nonincreasing for stationary unforced target.',
      passiveAssumptions: [
        'stationary target',
        'no clamp, collision, forcing or target change',
        'positive mass/stiffness and nonnegative damping',
      ],
    },
    provenance: {
      kind: 'analytic-model',
      sources: SOURCES,
      uncertainty:
        'Floating-point analytic samples; browser/native interpolation, thresholds and interruption differ. Neither energy nor damping ratio measures design quality.',
    },
  };
}

export function analyzeMotion(input: MotionInput) {
  return computeMotion(input, true);
}

/** Fast analytic descriptors/certificate, without uniform sample arrays; not an observed settling estimate. */
export function summarizeMotion(input: MotionInput) {
  const {
    samples: _samples,
    phaseCurve: _phase,
    ...summary
  } = computeMotion(input, false);
  return { ...summary, sampling: 'omitted; observedSampledSeconds is null' };
}

const key = z.enum(['mass', 'stiffness', 'damping']);
const positiveRange = z
  .object({
    min: finite.min(0.0001).max(10000),
    max: finite.min(0.0001).max(10000),
  })
  .strict()
  .refine((v) => v.max >= v.min, 'ordered range');
const dampingRange = z
  .object({ min: finite.min(0).max(10000), max: finite.min(0).max(10000) })
  .strict()
  .refine((v) => v.max >= v.min, 'ordered range');
const targetRange = z
  .object({ min: finite.min(0).max(1e6), max: finite.min(0).max(1e6) })
  .strict()
  .refine((v) => v.max >= v.min, 'ordered target range');
export const MotionCandidatesSchema = z
  .object({
    motion: MotionAnalyzeSchema,
    editable: z.array(key).max(3).default(['stiffness', 'damping']),
    locked: z.array(key).max(3).default([]),
    ranges: z
      .object({
        mass: positiveRange.optional(),
        stiffness: positiveRange.optional(),
        damping: dampingRange.optional(),
      })
      .strict()
      .default({}),
    limit: z.number().int().min(1).max(24).default(6),
    maxAttempts: z.number().int().min(1).max(128).default(32),
    targets: z
      .object({
        overshootRatio: targetRange.optional(),
        settlingSeconds: targetRange.optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export type MotionCandidatesInput = z.input<typeof MotionCandidatesSchema>;
function radicalInverse(index: number, base: number) {
  let value = 0,
    scale = 1 / base;
  while (index > 0) {
    value += (index % base) * scale;
    index = Math.floor(index / base);
    scale /= base;
  }
  return value;
}
function deviation(
  value: number | null,
  range: { min: number; max: number } | undefined,
) {
  if (!range) return null;
  return {
    value,
    requested: range,
    distance:
      value === null ? null : Math.max(range.min - value, 0, value - range.max),
    meets: value !== null && value >= range.min && value <= range.max,
  };
}
export function motionCandidates(input: MotionCandidatesInput) {
  const request = MotionCandidatesSchema.parse(input);
  const seen = new Set<string>();
  const alternatives: Array<{
    id: string;
    motion: Motion;
    metrics: ReturnType<typeof analyzeMotion>['metrics'];
    factors: {
      overshoot: ReturnType<typeof deviation>;
      settling: ReturnType<typeof deviation>;
    };
    meetsTargets: boolean;
  }> = [];
  let boundsRejected = 0,
    invalidRejected = 0;
  const keys = ['mass', 'stiffness', 'damping'] as const;
  for (let attempt = 0; attempt < request.maxAttempts; attempt++) {
    const spring = { ...request.motion.spring };
    if (attempt > 0)
      keys.forEach((name, i) => {
        if (!request.editable.includes(name) || request.locked.includes(name))
          return;
        const seed = spring[name];
        const range = request.ranges[name] ?? {
          min: seed * 0.5,
          max: seed === 0 ? 20 : seed * 2,
        };
        const u = radicalInverse(attempt, [2, 3, 5][i]!);
        spring[name] =
          range.min > 0
            ? Math.exp(
                Math.log(range.min) + u * Math.log(range.max / range.min),
              )
            : range.min + u * (range.max - range.min);
      });
    const fingerprint = JSON.stringify(spring);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const parsed = MotionAnalyzeSchema.safeParse({ ...request.motion, spring });
    if (!parsed.success) {
      invalidRejected++;
      continue;
    }
    const result = summarizeMotion(parsed.data);
    if (!result.constraints.passesAllTimeBounds) {
      boundsRejected++;
      continue;
    }
    const factors = {
      overshoot: deviation(
        result.metrics.allTimePeakOvershootRatio,
        request.targets.overshootRatio,
      ),
      settling: deviation(
        result.metrics.settling.certifiedBySeconds,
        request.targets.settlingSeconds,
      ),
    };
    alternatives.push({
      id: `motion-${attempt}`,
      motion: result.motion,
      metrics: result.metrics,
      factors,
      meetsTargets: Object.values(factors).every((f) => f === null || f.meets),
    });
  }
  const vector = (a: (typeof alternatives)[number]) =>
    Object.values(a.factors).map((f) =>
      f === null ? 0 : (f.distance ?? Infinity),
    );
  const dominates = (
    a: (typeof alternatives)[number],
    b: (typeof alternatives)[number],
  ) => {
    const av = vector(a),
      bv = vector(b);
    return av.every((v, i) => v <= bv[i]!) && av.some((v, i) => v < bv[i]!);
  };
  const remaining = [...alternatives],
    selected: typeof alternatives = [];
  // Pareto layers preserve separate criteria; stable generation order resolves a full layer.
  while (remaining.length && selected.length < request.limit) {
    const layer = remaining.filter(
      (a) => !remaining.some((b) => dominates(b, a)),
    );
    selected.push(...layer.slice(0, request.limit - selected.length));
    for (const item of layer) remaining.splice(remaining.indexOf(item), 1);
  }
  return {
    candidates: selected,
    attempted: request.maxAttempts,
    uniqueExamined: seen.size,
    boundsRejected,
    invalidRejected,
    feasibleCount: alternatives.length,
    selection:
      'Pareto layers of separate brief deviations, then stable generation order; bounded search, no optimum or beauty score',
    targets: request.targets,
    locks: request.locked,
    limitations: [
      'Locked parameters override editable parameters.',
      'Seed is included even outside proposal ranges; ranges govern generated edits.',
      'Settling target uses a conservative energy certificate, not earliest settling or subjective responsiveness.',
      'Null metric means undefined ratio or not certified within horizon; not an invented zero.',
      'Nonzero overshoot can be a desired target.',
    ],
  };
}

export const MotionEmitSchema = z
  .object({
    motion: MotionAnalyzeSchema,
    channel: z.enum(['translateX', 'translateY', 'scale', 'rotate', 'opacity']),
    platform: z.enum(['web', 'react-native']),
    reducedMotion: z.boolean().default(false),
    reducedMotionPolicy: z.enum(['instant', 'opacity-fade']).default('instant'),
    fadeDurationSeconds: finite.min(0.001).max(1).default(0.12),
  })
  .strict();
export type MotionEmitInput = z.input<typeof MotionEmitSchema>;
export function emitMotion(input: MotionEmitInput) {
  const request = MotionEmitSchema.parse(input),
    analysis = analyzeMotion(request.motion);
  const { motion, channel, platform } = request;
  const unit = motion.coordinate.unit;
  const compatible =
    channel === 'opacity'
      ? unit === 'opacity'
      : channel === 'scale'
        ? unit === 'scale'
        : channel === 'rotate'
          ? unit === 'deg'
          : unit === (platform === 'web' ? 'px' : 'dp');
  const fail = (reason: string) => ({
    supported: false as const,
    reason,
    analysis,
    plan: null,
  });
  if (!compatible)
    return fail(
      'channel/unit mismatch; normalized coordinates require an explicit property-space conversion',
    );
  const bounds = analysis.constraints.bounds;
  if (!inBounds(motion.coordinate.to, bounds))
    return fail('target violates explicit/property bounds');
  const reducedFade =
    request.reducedMotion &&
    request.reducedMotionPolicy === 'opacity-fade' &&
    channel === 'opacity';
  const instantaneous = request.reducedMotion && !reducedFade;
  if (!instantaneous && !inBounds(motion.coordinate.from, bounds))
    return fail('start violates explicit/property bounds');
  if (!request.reducedMotion && !analysis.constraints.passesAllTimeBounds)
    return fail(
      'unclamped spring violates explicit/property bounds; change spring/target or use an explicit reduced-motion substitute',
    );
  const property = (value: number) =>
    channel === 'opacity'
      ? { opacity: value }
      : {
          transform:
            channel === 'rotate'
              ? `rotate(${value}deg)`
              : channel === 'scale'
                ? `scale(${value})`
                : `${channel}(${value}px)`,
        };
  const notes = [
    'No overshoot clamp is applied.',
    'Reduced-motion is a caller-resolved preference; listen for preference changes and regenerate/cancel active motion.',
    'Model energy does not apply to instant/fade substitution, interpolation, rest snapping or target changes.',
  ];
  if (instantaneous)
    return {
      supported: true as const,
      analysis,
      plan: {
        kind: 'set' as const,
        channel,
        value: motion.coordinate.to,
        platform,
        durationSeconds: 0,
        reducedMotion: true,
        notes,
      },
    };
  if (platform === 'web') {
    const points = reducedFade
      ? [
          { time: 0, position: motion.coordinate.from },
          { time: request.fadeDurationSeconds, position: motion.coordinate.to },
        ]
      : analysis.samples;
    const duration = reducedFade
      ? request.fadeDurationSeconds
      : motion.durationSeconds;
    return {
      supported: true as const,
      analysis,
      plan: {
        kind: 'waapi' as const,
        keyframes: points.map((p) => ({
          offset: p.time / duration,
          ...property(p.position),
        })),
        options: {
          duration: duration * 1000,
          easing: 'linear',
          fill: 'forwards' as const,
          iterations: 1,
        },
        channel,
        reducedMotion: request.reducedMotion,
        endpointPolicy: reducedFade
          ? 'explicit linear fade'
          : 'hold exact sample at horizon; no hidden snap to target',
        interpolationErrorBound: reducedFade
          ? 0
          : (Math.sqrt((2 * analysis.energy.initial) / motion.spring.mass) *
              (motion.spring.damping / motion.spring.mass) *
              (duration / (motion.sampleCount - 1)) ** 2) /
              8 +
            (reducedFade
              ? 0
              : (Math.sqrt(
                  (2 * analysis.energy.initial) / motion.spring.stiffness,
                ) *
                  (motion.spring.stiffness / motion.spring.mass) *
                  (duration / (motion.sampleCount - 1)) ** 2) /
                8),
        notes: [
          ...notes,
          'Linear sampled approximation of the analytic scalar; composing transforms, callback timing, dropped frames and rendering require platform verification.',
        ],
      },
    };
  }
  if (reducedFade)
    return {
      supported: true as const,
      analysis,
      plan: {
        kind: 'react-native-timing' as const,
        initialValue: motion.coordinate.from,
        channel,
        config: {
          toValue: motion.coordinate.to,
          duration: request.fadeDurationSeconds * 1000,
          easing: 'Easing.linear',
          useNativeDriver: false,
        },
        notes,
        reducedMotion: true,
      },
    };
  if (motion.spring.damping === 0)
    return fail(
      'React Native 0.88.0 SpringAnimation requires positive damping; zero-damping model is not silently changed',
    );
  if (analysis.regime === 'overdamped')
    return fail(
      'inspected RN 0.88.0 JS SpringAnimation uses critical formula for zeta>=1; overdamped analytic parity unsupported',
    );
  return {
    supported: true as const,
    analysis,
    plan: {
      kind: 'react-native-spring' as const,
      initialValue: motion.coordinate.from,
      channel,
      config: {
        ...motion.spring,
        toValue: motion.coordinate.to,
        velocity: motion.coordinate.initialVelocity,
        overshootClamping: false,
        restDisplacementThreshold: motion.settling.positionTolerance,
        restSpeedThreshold: motion.settling.speedTolerance,
        useNativeDriver: false,
      },
      binding:
        channel === 'rotate'
          ? 'Interpolate scalar degrees to deg strings without changing the scalar trajectory.'
          : `Bind scalar Animated.Value to ${channel}.`,
      notes: [
        ...notes,
        'JS driver selected to match inspected implementation; native backend parity is unverified.',
        'RN caps per-frame elapsed time, stops and snaps at rest thresholds, and inherits velocity on interruption. Start a fresh value/animation for this mapping.',
        'RN spring duration is threshold-driven and does not equal the analysis horizon.',
      ],
      reducedMotion: false,
    },
  };
}
