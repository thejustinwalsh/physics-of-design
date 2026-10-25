import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMotion,
  summarizeMotion,
  sampleMotion,
  motionCandidates,
  emitMotion,
  MotionAnalyzeSchema,
} from '../src/motion.js';

const near = (a: number, b: number, tolerance = 1e-9) =>
  assert.ok(
    Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)),
    `${a} != ${b}`,
  );
const input = (damping = 2) => ({
  spring: { mass: 1, stiffness: 1, damping },
  coordinate: {
    unit: 'normalized' as const,
    from: 0,
    to: 1,
    initialVelocity: 0,
  },
  durationSeconds: 10,
  sampleCount: 501,
});

test('external closed forms: undamped cosine, critical polynomial/exponential, distinct overdamped roots', () => {
  for (const t of [0, 0.1, 0.7, 2, 5]) {
    const undamped = sampleMotion(input(0), t);
    near(undamped.position, 1 - Math.cos(t));
    near(undamped.velocity, Math.sin(t));
    near(undamped.acceleration, Math.cos(t));
    const critical = sampleMotion(input(2), t);
    near(critical.position, 1 - (1 + t) * Math.exp(-t));
    near(critical.velocity, t * Math.exp(-t));
    // m=1,k=2,c=3 has roots -1 and -2; x=1-2e^-t+e^-2t.
    const over = sampleMotion(
      { ...input(3), spring: { mass: 1, stiffness: 2, damping: 3 } },
      t,
    );
    near(over.position, 1 - 2 * Math.exp(-t) + Math.exp(-2 * t));
    near(over.velocity, 2 * Math.exp(-t) - 2 * Math.exp(-2 * t));
  }
});

test('initial nonzero velocity, differential equation and energy identity are satisfied independently', () => {
  for (const damping of [0, 1, 2, 3, 30]) {
    const i = {
      ...input(damping),
      coordinate: { ...input().coordinate, initialVelocity: -0.7 },
    };
    near(sampleMotion(i, 0).velocity, -0.7);
    for (const t of [0.1, 0.4, 1.5, 3]) {
      const h = 1e-5,
        p = sampleMotion(i, t),
        l = sampleMotion(i, t - h),
        r = sampleMotion(i, t + h);
      near((r.position - l.position) / (2 * h), p.velocity, 2e-7);
      near((r.velocity - l.velocity) / (2 * h), p.acceleration, 2e-7);
      near((r.energy - l.energy) / (2 * h), -damping * p.velocity ** 2, 2e-7);
      near(p.energyDerivative, -damping * p.velocity ** 2);
    }
  }
});

test('continuous extrema catch overshoot even when two endpoint samples hide it', () => {
  const a = analyzeMotion({
    ...input(0),
    durationSeconds: 2 * Math.PI,
    sampleCount: 2,
  });
  near(a.samples[0]!.position, a.samples[1]!.position);
  near(a.metrics.peakOvershootRatio!, 1);
  near(a.metrics.extrema.max, 2);
  assert.equal(a.metrics.targetCrossings, 2);
  const b = analyzeMotion({
    ...input(0),
    durationSeconds: 0.1,
    sampleCount: 2,
    bounds: { min: 0, max: 1 },
  });
  assert.ok(b.metrics.extrema.max < 1);
  assert.equal(b.constraints.passesAllTimeBounds, false);
  const damped = analyzeMotion({ ...input(1), durationSeconds: 10 });
  near(damped.metrics.peakOvershootRatio!, Math.exp(-Math.PI / Math.sqrt(3)));
});

test('critical and overdamped zero-velocity step have no overshoot; initial velocity may change that', () => {
  for (const damping of [2, 2.000000000001, 3, 100]) {
    const a = analyzeMotion(input(damping));
    assert.equal(a.metrics.peakOvershoot, 0);
    near(a.metrics.allTimeRange.min, 0);
    near(a.metrics.allTimeRange.max, 1);
  }
  assert.ok(
    analyzeMotion({
      ...input(3),
      coordinate: { ...input().coordinate, initialVelocity: 10 },
    }).metrics.peakOvershoot! > 0,
  );
});

test('critical limit remains stable from both sides and samples remain finite at admitted extremes', () => {
  const t = 0.7;
  for (const c of [2 - 1e-12, 2, 2 + 1e-12])
    near(sampleMotion(input(c), t).position, 1 - (1 + t) * Math.exp(-t), 1e-11);
  const a = analyzeMotion({
    ...input(),
    spring: { mass: 0.001, stiffness: 0.0001, damping: 100 },
    coordinate: { unit: 'px', from: -1e6, to: 1e6, initialVelocity: 1e6 },
    durationSeconds: 30,
  });
  for (const s of a.samples) assert.ok(Object.values(s).every(Number.isFinite));
});

test('static zero energy, undefined no-travel ratio and undamped held energy are explicit', () => {
  const a = analyzeMotion({
    ...input(0),
    coordinate: { unit: 'normalized', from: 5, to: 5 },
  });
  assert.equal(a.energy.initial, 0);
  assert.equal(a.energy.final, 0);
  assert.equal(a.metrics.peakOvershootRatio, null);
  assert.equal(a.metrics.settling.certifiedBySeconds, 0);
  assert.equal(a.metrics.targetCrossings, 0);
  const b = analyzeMotion(input(0));
  for (const s of b.samples) near(s.energy, 0.5);
  assert.equal(b.metrics.settling.certifiedBySeconds, null);
});

test('settling certificate bounds the entire future by monotone energy; sampled observation is separate', () => {
  const i = {
    ...input(2),
    durationSeconds: 20,
    settling: { positionTolerance: 0.01, speedTolerance: 0.01 },
  };
  const a = analyzeMotion(i);
  const t = a.metrics.settling.certifiedBySeconds!;
  assert.ok(t > 0 && t < 20);
  for (const d of [0, 0.01, 0.2, 1, 5]) {
    const p = sampleMotion(i, t + d);
    assert.ok(Math.abs(p.displacement) <= 0.01000001);
    assert.ok(Math.abs(p.velocity) <= 0.01000001);
  }
  const summary = summarizeMotion(i);
  assert.equal('samples' in summary, false);
  assert.equal('phaseCurve' in summary, false);
  near(summary.metrics.settling.certifiedBySeconds!, t);
  assert.equal(summary.metrics.settling.observedSampledSeconds, null);
});

test('invalid, unstable and huge inputs fail rather than return nonfinite/clamped results', () => {
  for (const spring of [
    { mass: 0, stiffness: 1, damping: 1 },
    { mass: 1, stiffness: -1, damping: 1 },
    { mass: 1, stiffness: 1, damping: -1 },
    { mass: 1, stiffness: Infinity, damping: 1 },
    { mass: 0.001, stiffness: 10000, damping: 1 },
  ])
    assert.equal(
      MotionAnalyzeSchema.safeParse({ ...input(), spring }).success,
      false,
    );
  for (const durationSeconds of [NaN, Infinity, 1e9, -1, 0])
    assert.throws(() => analyzeMotion({ ...input(), durationSeconds }));
  assert.throws(() => sampleMotion(input(), -1));
  assert.throws(() => sampleMotion(input(), 31));
  assert.throws(() =>
    analyzeMotion({
      ...input(),
      coordinate: { unit: 'px', from: 1e100, to: 1 },
    }),
  );
  assert.throws(() =>
    analyzeMotion({ ...input(), bounds: { min: 2, max: 1 } }),
  );
});

test('bounded deterministic search respects locks and returns separate brief targets without beauty totals', () => {
  const request = {
    motion: input(1),
    editable: ['mass', 'stiffness', 'damping'] as const,
    locked: ['mass'] as const,
    ranges: { stiffness: { min: 1, max: 30 }, damping: { min: 0.1, max: 10 } },
    limit: 6,
    maxAttempts: 48,
    targets: {
      overshootRatio: { min: 0.1, max: 0.3 },
      settlingSeconds: { min: 1, max: 8 },
    },
  };
  const mutable = {
    ...request,
    editable: [...request.editable],
    locked: [...request.locked],
  };
  const a = motionCandidates(mutable),
    b = motionCandidates(mutable);
  assert.deepEqual(a, b);
  assert.ok(a.candidates.length > 1 && a.candidates.length <= 6);
  assert.equal(a.attempted, 48);
  assert.ok(a.uniqueExamined <= 48);
  for (const c of a.candidates) {
    assert.equal(c.motion.spring.mass, 1);
    assert.ok(c.factors.overshoot);
    assert.ok(c.factors.settling);
    assert.equal('score' in c, false);
  }
  const locked = motionCandidates({
    motion: input(),
    editable: ['mass'],
    locked: ['mass'],
    maxAttempts: 128,
  });
  assert.equal(locked.uniqueExamined, 1);
  assert.equal(locked.candidates.length, 1);
  assert.throws(() => motionCandidates({ motion: input(), maxAttempts: 129 }));
  const bounded = motionCandidates({
    motion: { ...input(0), bounds: { min: 0, max: 1 } },
    editable: [],
    maxAttempts: 3,
  });
  assert.equal(bounded.candidates.length, 0);
  assert.equal(bounded.boundsRejected, 1);
});

test('web sampling, property bounds and reduced-motion substitution never silently clamp a spring', () => {
  const motion = {
    ...input(1),
    coordinate: { unit: 'px' as const, from: 0, to: 100 },
  };
  const a = emitMotion({ motion, channel: 'translateX', platform: 'web' });
  assert.equal(a.supported, true);
  if (a.plan?.kind !== 'waapi') throw new Error('WAAPI required');
  assert.equal(a.plan.keyframes.length, 501);
  assert.equal(a.plan.options.duration, 10000);
  assert.equal(a.plan.options.easing, 'linear');
  const blocked = emitMotion({
    motion: { ...motion, bounds: { min: 0, max: 100 } },
    channel: 'translateX',
    platform: 'web',
  });
  assert.equal(blocked.supported, false);
  const reduced = emitMotion({
    motion: { ...motion, bounds: { min: 0, max: 100 } },
    channel: 'translateX',
    platform: 'web',
    reducedMotion: true,
    reducedMotionPolicy: 'opacity-fade',
  });
  assert.equal(reduced.plan?.kind, 'set'); // Transform substitution is instant; no fabricated fade channel.
  const opacity = {
    ...input(1),
    coordinate: { unit: 'opacity' as const, from: 0, to: 1 },
  };
  assert.equal(
    emitMotion({ motion: opacity, channel: 'opacity', platform: 'web' })
      .supported,
    false,
  );
  const fade = emitMotion({
    motion: opacity,
    channel: 'opacity',
    platform: 'web',
    reducedMotion: true,
    reducedMotionPolicy: 'opacity-fade',
  });
  assert.equal(fade.plan?.kind, 'waapi');
  if (fade.plan?.kind === 'waapi') {
    assert.equal(fade.plan.keyframes.length, 2);
    assert.equal(fade.plan.interpolationErrorBound, 0);
  }
  assert.equal(
    emitMotion({ motion: input(), channel: 'translateX', platform: 'web' })
      .supported,
    false,
  );
});

test('RN mapping declares inspected backend limitations and disallows unsupported dynamics', () => {
  const motion = {
    ...input(1),
    coordinate: { unit: 'dp' as const, from: 0, to: 60, initialVelocity: 12 },
  };
  const a = emitMotion({
    motion,
    channel: 'translateX',
    platform: 'react-native',
  });
  if (a.plan?.kind !== 'react-native-spring')
    throw new Error('spring required');
  assert.equal(a.plan.config.velocity, 12);
  assert.equal(a.plan.config.overshootClamping, false);
  assert.equal(a.plan.config.useNativeDriver, false);
  for (const damping of [0, 3])
    assert.equal(
      emitMotion({
        motion: { ...motion, spring: { ...motion.spring, damping } },
        channel: 'translateX',
        platform: 'react-native',
      }).supported,
      false,
    );
  assert.equal(
    emitMotion({
      motion: { ...motion, coordinate: { ...motion.coordinate, unit: 'px' } },
      channel: 'translateX',
      platform: 'react-native',
    }).supported,
    false,
  );
});

test('linear web keyframe scalar error stays within the reported analytic bound', () => {
  const motion = {
    ...input(1),
    coordinate: { unit: 'px' as const, from: 12, to: 65, initialVelocity: -7 },
    durationSeconds: 3,
    sampleCount: 31,
  };
  const emitted = emitMotion({
    motion,
    channel: 'translateX',
    platform: 'web',
  });
  if (emitted.plan?.kind !== 'waapi') throw new Error('WAAPI required');
  const samples = emitted.analysis.samples;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!,
      b = samples[i]!;
    for (const fraction of [0.2, 0.5, 0.8]) {
      const exact = sampleMotion(
        motion,
        a.time + fraction * (b.time - a.time),
      ).position;
      const interpolated = a.position + fraction * (b.position - a.position);
      assert.ok(
        Math.abs(exact - interpolated) <=
          emitted.plan.interpolationErrorBound + 1e-10,
      );
    }
  }
  const short = analyzeMotion({ ...input(0), durationSeconds: 0.1 });
  assert.equal(short.metrics.peakOvershootRatio, 0);
  near(short.metrics.allTimePeakOvershootRatio!, 1);
});
