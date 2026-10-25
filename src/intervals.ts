import { z } from 'zod';
import { round } from './state.js';

export const PeakSchema = z
  .object({
    ratio: z.number().finite().positive(),
    weight: z.number().finite().nonnegative(),
    sigma: z.number().finite().positive(),
    label: z.string(),
  })
  .strict();
export type Peak = z.infer<typeof PeakSchema>;
export const CurveSchema = z
  .object({
    kind: z.enum(['heuristic', 'hypothesis']),
    source: z.string(),
    peaks: z.array(PeakSchema).min(1).max(32),
  })
  .strict()
  .refine(
    (c) => c.peaks.some((p) => p.weight > 0),
    'a peak must have positive weight',
  );
export type Curve = z.infer<typeof CurveSchema>;
export type Prior = 'smooth' | 'musical';
export function interval(a: number, b: number): number {
  if (![a, b].every((n) => Number.isFinite(n) && n > 0))
    throw new Error(
      'visual intervals require finite positive comparable dimensions',
    );
  return Math.log2(a) - Math.log2(b);
}
export function compatibility(ratio: number, curve: Curve): number {
  const x = interval(ratio, 1);
  const c = CurveSchema.parse(curve);
  const maxWeight = Math.max(...c.peaks.map((p) => p.weight));
  const total = c.peaks.reduce((s, p) => s + p.weight / maxWeight, 0);
  return c.peaks.reduce(
    (s, p) =>
      s +
      (p.weight / maxWeight / total) *
        Math.exp(-0.5 * ((x - Math.log2(p.ratio)) / p.sigma) ** 2),
    0,
  );
}
export function makeCurve(center: number, prior: Prior = 'smooth'): Curve {
  interval(center, 1);
  if (prior === 'smooth')
    return {
      kind: 'heuristic',
      source: 'local-policy',
      peaks: [
        {
          ratio: center,
          weight: 1,
          sigma: 0.38,
          label: 'contextual broad target',
        },
      ],
    };
  const landmarks: [string, number][] = [
    ['unison', 1],
    ['minor third', 6 / 5],
    ['major third', 5 / 4],
    ['fourth', 4 / 3],
    ['fifth', 3 / 2],
    ['octave', 2],
  ];
  const oct = Math.floor(Math.log2(center));
  const peaks = landmarks.flatMap(([label, r]) =>
    [oct - 1, oct, oct + 1].map((o) => ({
      ratio: r * 2 ** o,
      weight: Math.exp(-(interval(r * 2 ** o, center) ** 2) / 0.5),
      sigma: 0.055,
      label: `${label} × 2^${o}`,
    })),
  );
  return { kind: 'hypothesis', source: 'musical-prior', peaks };
}
export function intervalCandidates(
  base: number,
  min: number,
  max: number,
  prior: Prior,
  custom?: Curve,
) {
  if (min >= max) throw new Error('min must be less than max');
  interval(min, 1);
  interval(max, 1);
  interval(base, 1);
  const curve = custom
    ? CurveSchema.parse(custom)
    : makeCurve(2 ** ((Math.log2(min) + Math.log2(max)) / 2), prior);
  // Uniform log samples remain in both arms so off-scale alternatives are always available.
  const ratios = new Set(
    Array.from(
      { length: 17 },
      (_, i) =>
        2 ** (Math.log2(min) + ((Math.log2(max) - Math.log2(min)) * i) / 16),
    ),
  );
  for (const p of curve.peaks)
    if (p.ratio >= min && p.ratio <= max) ratios.add(p.ratio);
  return {
    base,
    curve,
    interpretation:
      'conditional compatibility under an uncalibrated prior, not probability or beauty',
    candidates: [...ratios]
      .sort((a, b) => a - b)
      .map((r) => {
        if (!Number.isFinite(base * r) || base * r === 0)
          throw new Error(
            'candidate value exceeds the finite positive numeric range',
          );
        return {
          ratio: r,
          value: round(base * r),
          interval: interval(r, 1),
          compatibility: compatibility(r, curve),
          source: curve.source,
        };
      }),
  };
}

export function rhythm(
  gaps: number[],
  binWidth = 0.25,
  observed?: { counts: Record<string, number>; source: string },
  windowSize = 5,
) {
  if (!Number.isInteger(windowSize) || windowSize < 1 || windowSize > 101)
    throw new Error('local entropy window must be an integer in [1,101]');
  if (!Number.isFinite(binWidth) || binWidth <= 0)
    throw new Error('binWidth must be finite and positive');
  if (!gaps.every((g) => Number.isFinite(g) && g >= 0))
    throw new Error('gaps must be finite and nonnegative');
  if (
    observed &&
    (!observed.source ||
      !Object.values(observed.counts).every(
        (n) => Number.isFinite(n) && n >= 0,
      ) ||
      Object.values(observed.counts).reduce((s, n) => s + n, 0) <= 0)
  )
    throw new Error('observed counts need nonnegative counts and provenance');
  const positive = gaps.filter((g) => g > 0).sort((a, b) => a - b);
  const base = positive[Math.floor(positive.length / 2)] ?? 1;
  const bins = gaps.map((g) =>
    g === 0 ? 'zero' : String(Math.round(interval(g, base) / binWidth)),
  );
  const counts: Record<string, number> = {};
  for (const b of bins) counts[b] = (counts[b] ?? 0) + 1;
  const entropy = gaps.length
    ? -Object.values(counts).reduce(
        (s, n) => s + (n / gaps.length) * Math.log2(n / gaps.length),
        0,
      )
    : 0;
  const motifs: { pattern: string[]; starts: number[] }[] = [];
  for (let n = 2; n <= Math.min(4, Math.floor(bins.length / 2)); n++) {
    const seen = new Map<string, number[]>();
    for (let i = 0; i <= bins.length - n; i++) {
      const k = JSON.stringify(bins.slice(i, i + n));
      seen.set(k, [...(seen.get(k) ?? []), i]);
    }
    for (const [k, starts] of seen)
      if (starts.length > 1)
        motifs.push({ pattern: JSON.parse(k) as string[], starts });
  }
  const total = observed
    ? Object.values(observed.counts).reduce((s, n) => s + n, 0)
    : 0;
  const surprise = observed
    ? bins.map((b) => {
        const n = observed.counts[b] ?? 0;
        return n > 0 ? Math.max(0, -Math.log2(n / total)) : null;
      })
    : null;
  return {
    normalizer: base,
    binWidth,
    bins,
    entropyBits: entropy,
    localEntropy: bins.map((_, i) => {
      const start = Math.max(0, i - Math.floor(windowSize / 2));
      const end = Math.min(bins.length, i + Math.ceil(windowSize / 2));
      const local = bins.slice(start, end),
        counts = new Map<string, number>();
      for (const bin of local) counts.set(bin, (counts.get(bin) ?? 0) + 1);
      return {
        start,
        end,
        entropyBits: Math.max(
          0,
          -[...counts.values()].reduce(
            (sum, n) => sum + (n / local.length) * Math.log2(n / local.length),
            0,
          ),
        ),
      };
    }),
    motifs,
    intervalSequence: gaps
      .slice(1)
      .map((g, i) => (g > 0 && gaps[i]! > 0 ? interval(g, gaps[i]!) : null)),
    surpriseBits: surprise,
    surpriseSource: observed?.source ?? null,
    caveat:
      'Entropy measures variation, not quality. Null surprise means no empirical distribution or an unseen bin. Preserve spatial order and semantic grouping.',
  };
}
