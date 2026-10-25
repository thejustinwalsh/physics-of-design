import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const finite = z.number().finite();
export const HexColorSchema = z
  .string()
  .regex(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    'use opaque #rgb or #rrggbb sRGB; alpha and other color spaces require explicit compositing',
  )
  .transform((s) =>
    (s.length === 4
      ? '#' + [...s.slice(1)].map((x) => x + x).join('')
      : s
    ).toLowerCase(),
  );
export const ColorRoleSchema = z
  .object({
    id,
    foreground: id,
    background: id,
    use: z.enum(['text', 'large-text', 'non-text', 'decorative']),
    source: z.array(z.string().min(1)).min(1).max(16),
  })
  .strict();
export const ColorSystemSchema = z
  .object({
    tokens: z.record(id, HexColorSchema),
    roles: z.array(ColorRoleSchema).max(128).default([]),
    harmony: z
      .enum(['free', 'analogous', 'complementary', 'triadic'])
      .default('free'),
  })
  .strict()
  .superRefine((s, ctx) => {
    for (const key of ['canvas', 'ink', 'accent'])
      if (!Object.hasOwn(s.tokens, key))
        ctx.addIssue({
          code: 'custom',
          path: ['tokens', key],
          message: `required color token ${key}`,
        });
    if (Object.keys(s.tokens).length > 64)
      ctx.addIssue({
        code: 'custom',
        path: ['tokens'],
        message: 'at most 64 tokens',
      });
    if (new Set(s.roles.map((r) => r.id)).size !== s.roles.length)
      ctx.addIssue({
        code: 'custom',
        path: ['roles'],
        message: 'role IDs must be unique',
      });
    for (const [i, role] of s.roles.entries())
      for (const key of ['foreground', 'background'] as const)
        if (!Object.hasOwn(s.tokens, role[key]))
          ctx.addIssue({
            code: 'custom',
            path: ['roles', i, key],
            message: `unknown token ${role[key]}`,
          });
  });
const range = z
  .object({ min: finite.min(0).max(1), max: finite.min(0).max(1) })
  .strict()
  .refine((r) => r.max >= r.min, 'range max must be at least min');
export const ColorContextSchema = z
  .object({
    contrastLevel: z.enum(['AA', 'AAA']).default('AA'),
    chromaRange: range.nullable().default(null),
    lightnessRange: range.nullable().default(null),
    hueReference: id.nullable().default(null),
  })
  .strict();
export const ColorCandidateOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(24).default(6),
    maxAttempts: z.number().int().min(1).max(4096).default(512),
    editableTokens: z.array(id).max(64).default(['accent']),
    lockedTokens: z.array(id).max(64).default([]),
    context: ColorContextSchema.default({
      contrastLevel: 'AA',
      chromaRange: null,
      lightnessRange: null,
      hueReference: null,
    }),
  })
  .strict();
export type ColorSystem = z.infer<typeof ColorSystemSchema>;
export type ColorContext = z.infer<typeof ColorContextSchema>;
export type ColorCandidateOptions = z.infer<typeof ColorCandidateOptionsSchema>;
export type RGB = { r: number; g: number; b: number };
export type OKLab = { L: number; a: number; b: number };
export type OKLCH = { L: number; C: number; h: number | null };

const WCAG = 'https://www.w3.org/TR/2024/REC-WCAG22-20241212/';
const OKLAB = 'https://bottosson.github.io/posts/oklab/';
const CSS_COLOR = 'https://www.w3.org/TR/2026/CRD-css-color-4-20261022/';
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const wrapHue = (h: number) => ((h % 360) + 360) % 360;
const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
function rgb(hex: string): RGB {
  return {
    r: parseInt(hex.slice(1, 3), 16) / 255,
    g: parseInt(hex.slice(3, 5), 16) / 255,
    b: parseInt(hex.slice(5, 7), 16) / 255,
  };
}
const linear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const encoded = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
function luminance(c: RGB) {
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}
export function relativeLuminance(hex: string): number {
  return luminance(rgb(HexColorSchema.parse(hex)));
}
export function contrastRatio(
  foregroundHex: string,
  backgroundHex: string,
): number {
  const a = relativeLuminance(foregroundHex),
    b = relativeLuminance(backgroundHex);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function toLab(c: RGB): OKLab {
  const r = linear(c.r),
    g = linear(c.g),
    b = linear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}
function fromLch(c: OKLCH): RGB {
  const rad = ((c.h ?? 0) * Math.PI) / 180,
    a = c.C * Math.cos(rad),
    b = c.C * Math.sin(rad);
  const l = (c.L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (c.L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (c.L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}
export function describeColor(value: string) {
  const hex = HexColorSchema.parse(value),
    srgb = rgb(hex),
    oklab = toLab(srgb);
  const C = Math.hypot(oklab.a, oklab.b);
  // Numerical hue instability at neutral is not color meaning. This epsilon is not a perceptual cutoff.
  const oklch: OKLCH = {
    L: oklab.L,
    C,
    h:
      C < 1e-6 ? null : wrapHue((Math.atan2(oklab.b, oklab.a) * 180) / Math.PI),
  };
  return {
    hex,
    srgb,
    luminance: luminance(srgb),
    oklab,
    oklch,
    gamut: 'sRGB' as const,
    alpha: 1 as const,
    provenance: [WCAG, OKLAB, CSS_COLOR],
  };
}
export type ColorDescription = ReturnType<typeof describeColor>;
function threshold(
  use: z.infer<typeof ColorRoleSchema>['use'],
  level: ColorContext['contrastLevel'],
) {
  return use === 'decorative'
    ? null
    : use === 'non-text'
      ? 3
      : use === 'large-text'
        ? level === 'AAA'
          ? 4.5
          : 3
        : level === 'AAA'
          ? 7
          : 4.5;
}
function distanceToRange(
  value: number,
  r: { min: number; max: number } | null,
) {
  return r === null ? null : Math.max(r.min - value, value - r.max, 0);
}
function harmonyFactor(
  system: ColorSystem,
  colors: Record<string, ColorDescription>,
  context: ColorContext,
) {
  const reference = context.hueReference ?? 'accent';
  const distinct = [
    ...new Map(
      Object.entries(colors).map(([name, c]) => [c.hex, { name, ...c }]),
    ).values(),
  ].filter((c) => c.oklch.C >= 0.02 && c.oklch.h !== null);
  const ref = colors[reference]!;
  const base = {
    preference: system.harmony,
    reference,
    kind: 'heuristic' as const,
    source: [
      'local-policy: configurable hue-wheel convention; not preference data',
    ],
    uncertainty:
      'high; depends on area, adjacency, lightness, chroma, culture and task',
    chromaticCutoff: 0.02,
    distinctChromaticColors: distinct.length,
  };
  if (system.harmony === 'free')
    return {
      ...base,
      meanAngularError: null,
      status: 'not-requested' as const,
    };
  const required = system.harmony === 'triadic' ? 3 : 2;
  if (ref.oklch.C < 0.02 || ref.oklch.h === null || distinct.length < required)
    return {
      ...base,
      meanAngularError: null,
      status: 'insufficient-chromatic-colors' as const,
    };
  const others = distinct.filter((c) => c.hex !== ref.hex);
  const deltas = others.map((c) => wrapHue(c.oklch.h! - ref.oklch.h!));
  // Triadic requires both branches, not three aliases/near-identical colors around one hue.
  if (
    system.harmony === 'triadic' &&
    (!deltas.some((d) => d > 60 && d < 180) ||
      !deltas.some((d) => d > 180 && d < 300))
  )
    return {
      ...base,
      meanAngularError: null,
      status: 'missing-triad-branch' as const,
    };
  const errors = deltas.map((d) =>
    system.harmony === 'analogous'
      ? Math.max(0, angle(d, 0) - 30)
      : system.harmony === 'complementary'
        ? angle(d, 180)
        : Math.min(angle(d, 120), angle(d, 240)),
  );
  return {
    ...base,
    meanAngularError: errors.reduce((a, b) => a + b, 0) / errors.length,
    status: 'described' as const,
  };
}
export function analyzeColors(input: unknown, contextInput: unknown = {}) {
  const system = ColorSystemSchema.parse(input),
    context = ColorContextSchema.parse(contextInput);
  if (
    context.hueReference !== null &&
    !Object.hasOwn(system.tokens, context.hueReference)
  )
    throw new Error(`unknown hueReference token ${context.hueReference}`);
  const tokens = Object.fromEntries(
    Object.entries(system.tokens).map(([name, value]) => [
      name,
      describeColor(value),
    ]),
  );
  const roles = system.roles.map((role) => {
    const ratio = contrastRatio(
      system.tokens[role.foreground]!,
      system.tokens[role.background]!,
    );
    const minimum = threshold(role.use, context.contrastLevel);
    return {
      ...role,
      ratio,
      minimum,
      passes: minimum === null ? null : ratio >= minimum,
      kind: 'standard' as const,
      standard: WCAG,
      applicability:
        'caller-declared role; large-text size/weight, meaningful non-text cue, adjacency and rendered backdrop must be verified',
    };
  });
  return {
    system,
    context,
    tokens,
    roles,
    hardConstraintsPass: roles.every((r) => r.passes !== false),
    constrainedRoles: roles.filter((r) => r.minimum !== null).length,
    factors: {
      harmony: harmonyFactor(system, tokens, context),
      chroma: Object.fromEntries(
        Object.entries(tokens).map(([name, c]) => [
          name,
          {
            value: c.oklch.C,
            distance: distanceToRange(c.oklch.C, context.chromaRange),
          },
        ]),
      ),
      lightness: Object.fromEntries(
        Object.entries(tokens).map(([name, c]) => [
          name,
          {
            value: c.oklch.L,
            distance: distanceToRange(c.oklch.L, context.lightnessRange),
          },
        ]),
      ),
    },
    provenance: {
      contrast: { kind: 'standard', source: WCAG },
      descriptors: { kind: 'calculation', source: [OKLAB, CSS_COLOR] },
      preferences: {
        kind: 'heuristic',
        source: 'caller ranges and local hue-wheel convention',
        uncertainty: 'uncalibrated; no human preference evidence',
      },
    },
    assumptions: [
      'Opaque encoded sRGB inputs; no alpha, blending, gradients, images, HDR or Display P3.',
      'WCAG luminance is not OKLab lightness. Contrast is not a complete accessibility audit.',
      'No role declarations means no contrast obligations were checked; it is not an accessibility pass.',
      'Hue-wheel preferences are optional descriptors, not physical constraints or a beauty score.',
    ],
  };
}
export type ColorAnalysis = ReturnType<typeof analyzeColors>;

function inGamut(c: RGB) {
  return Object.values(c).every((x) => x >= -1e-7 && x <= 1 + 1e-7);
}
function gamutHex(lch: OKLCH) {
  let selected = { ...lch },
    mapped = false;
  if (!inGamut(fromLch(selected))) {
    mapped = true;
    let lo = 0,
      hi = selected.C;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(fromLch({ ...selected, C: mid }))) lo = mid;
      else hi = mid;
    }
    selected = { ...selected, C: lo };
  }
  const c = fromLch(selected);
  const hex =
    '#' +
    [c.r, c.g, c.b]
      .map((v) =>
        Math.round(clamp(encoded(clamp(v))) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
  return { hex, mapped, requested: lch, mappedChroma: selected.C };
}
export function colorCandidates(input: unknown, optionsInput: unknown = {}) {
  const system = ColorSystemSchema.parse(input),
    options = ColorCandidateOptionsSchema.parse(optionsInput);
  for (const key of [...options.editableTokens, ...options.lockedTokens])
    if (!Object.hasOwn(system.tokens, key))
      throw new Error(`unknown candidate token ${key}`);
  const editable = [...new Set(options.editableTokens)].filter(
    (key) => !options.lockedTokens.includes(key),
  );
  const base = analyzeColors(system, options.context);
  const invariantFailedRoles = base.roles
    .filter(
      (r) =>
        r.passes === false &&
        !editable.includes(r.foreground) &&
        !editable.includes(r.background),
    )
    .map((r) => r.id);
  const candidates: {
    id: string;
    system: ColorSystem;
    analysis: ColorAnalysis;
    changes: {
      token: string;
      before: string;
      after: string;
      gamutMapped: boolean;
      requested: OKLCH;
      mappedChroma: number;
    }[];
  }[] = [];
  const seen = new Set<string>();
  let attempted = 0,
    rejected = 0,
    duplicates = 0;
  const deltas = [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24, -0.4, 0.4];
  const hues = [0, 30, -30, 60, -60, 120, -120, 180];
  const chromas = [1, 0.75, 1.25, 0.5, 0];
  const gridSize = deltas.length * hues.length * chromas.length;
  const total = 1 + gridSize * editable.length;
  const budget = invariantFailedRoles.length
    ? 0
    : Math.min(total, options.maxAttempts);
  for (let n = 0; n < budget && candidates.length < options.limit; n++) {
    attempted++;
    const proposal = structuredClone(system);
    const changes: (typeof candidates)[number]['changes'] = [];
    if (n > 0) {
      const token = editable[(n - 1) % editable.length]!;
      const k = Math.floor((n - 1) / editable.length);
      const original = base.tokens[token]!.oklch;
      const L = clamp(original.L + deltas[k % deltas.length]!);
      const hDelta = hues[Math.floor(k / deltas.length) % hues.length]!;
      const C =
        original.C *
        chromas[
          Math.floor(k / (deltas.length * hues.length)) % chromas.length
        ]!;
      const requested = {
        L,
        C,
        h: original.h === null ? null : wrapHue(original.h + hDelta),
      };
      const result = gamutHex(requested);
      proposal.tokens[token] = result.hex;
      if (result.hex !== system.tokens[token])
        changes.push({
          token,
          before: system.tokens[token]!,
          after: result.hex,
          gamutMapped: result.mapped,
          requested,
          mappedChroma: result.mappedChroma,
        });
    }
    const key = JSON.stringify(
      Object.entries(proposal.tokens).sort(([a], [b]) => a.localeCompare(b)),
    );
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    const analysis = analyzeColors(proposal, options.context);
    if (!analysis.hardConstraintsPass) {
      rejected++;
      continue;
    }
    candidates.push({
      id: changes.length ? `alternative-${candidates.length + 1}` : 'original',
      system: proposal,
      analysis,
      changes,
    });
  }
  return {
    candidates,
    attempted,
    rejected,
    duplicates,
    exhausted: candidates.length < options.limit,
    invariantFailedRoles,
    provenance: {
      kind: 'heuristic',
      source: 'local-policy: bounded deterministic OKLCH perturbation grid',
      uncertainty:
        'not ranked by beauty, not exhaustive, no empirical preference calibration',
    },
    notes: [
      'Includes the unchanged original if it meets declared role constraints.',
      'Alternatives edit one unlocked token at a time; multi-token repairs and unsampled colors may be missed.',
      'An empty/exhausted search is not proof that the constraints are mathematically infeasible.',
      'invariantFailedRoles names failed pairs whose two tokens cannot change under this editable/locked set; search is skipped for that scoped reason.',
      'Out-of-sRGB proposals reduce chroma at fixed requested lightness/hue, then quantize to 8-bit sRGB and recheck contrast.',
      'This simple chroma reduction is a local search policy, not the CSS Color 4 gamut-mapping algorithm.',
      'Sampling angles/deltas describe search coverage only; they are not empirically optimal hue or lightness constants.',
    ],
  };
}
