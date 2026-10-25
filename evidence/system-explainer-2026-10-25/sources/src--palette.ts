import Color from 'colorjs.io';
import { z } from 'zod';
import { contrastRatio, describeColor, type ColorSystem } from './color.js';
import { hash } from './identity.js';

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const cssColor = z.string().trim().min(1).max(512);
const unit = z.number().finite().min(0).max(1);
const harmony = z.enum(['free', 'analogous', 'complementary', 'triadic']);
export const ColorConvertSchema = z
  .object({ color: cssColor, backdrop: cssColor.optional() })
  .strict();
export const PaletteRampSchema = z
  .object({
    color: cssColor,
    lightness: z.array(unit).min(1).max(32),
    chromaScale: z.number().finite().min(0).max(4).default(1),
    hue: z.number().finite().min(-36000).max(36000).nullable().optional(),
  })
  .strict();
export const PaletteSystemSchema = z
  .object({
    tokens: z.record(id, cssColor),
    roles: z
      .array(
        z
          .object({
            id,
            foreground: id,
            background: id,
            use: z.enum(['text', 'large-text', 'non-text', 'decorative']),
            source: z.array(z.string().min(1)).min(1).max(16),
            adjacentBackgrounds: z.array(id).max(8).default([]),
            backdrop: id.nullable().default(null),
            state: z.string().min(1).max(80).default('default'),
            theme: z.string().min(1).max(80).default('default'),
          })
          .strict(),
      )
      .max(128)
      .default([]),
    harmony: harmony.default('free'),
  })
  .strict()
  .superRefine((system, ctx) => {
    const names = Object.keys(system.tokens);
    if (names.length < 1 || names.length > 64)
      ctx.addIssue({
        code: 'custom',
        path: ['tokens'],
        message: 'Supply 1–64 color tokens',
      });
    if (
      new Set(system.roles.map((role) => role.id)).size !== system.roles.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['roles'],
        message: 'Role IDs must be unique',
      });
    system.roles.forEach((role, index) => {
      for (const name of [
        role.foreground,
        role.background,
        ...role.adjacentBackgrounds,
        ...(role.backdrop ? [role.backdrop] : []),
      ]) {
        if (!Object.hasOwn(system.tokens, name))
          ctx.addIssue({
            code: 'custom',
            path: ['roles', index],
            message: `Unknown token ${name}`,
          });
      }
    });
  });
export const PaletteAnalyzeSchema = z
  .object({
    system: PaletteSystemSchema,
    contrastLevel: z.enum(['AA', 'AAA']).default('AA'),
  })
  .strict();
export const PaletteCandidateSchema = z
  .object({
    system: PaletteSystemSchema,
    contrastLevel: z.enum(['AA', 'AAA']).default('AA'),
    editableTokens: z.array(id).max(64).optional(),
    lockedTokens: z.array(id).max(64).default([]),
    maxAttempts: z.number().int().min(1).max(4096).default(512),
    limit: z.number().int().min(1).max(24).default(6),
    beamWidth: z.number().int().min(1).max(16).default(4),
  })
  .strict();
export type PaletteSystem = z.infer<typeof PaletteSystemSchema>;
export type PaletteStatus = 'pass' | 'fail' | 'unknown' | 'not-applicable';
const algorithm =
  'colorjs.io@0.7.1:css-gamut-map/srgb-rgba8/encoded-srgb-source-over-interval-v2';
const wcag = 'https://www.w3.org/TR/2024/REC-WCAG22-20241212/';
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const hue = (value: number) => ((value % 360) + 360) % 360;
type RGB = [number, number, number];

function parseColor(value: string) {
  let color: Color;
  try {
    color = new Color(value);
  } catch {
    throw new Error(`Unsupported or invalid CSS color: ${value}`);
  }
  if (
    color.coords.some(
      (channel) => channel !== null && !Number.isFinite(channel),
    ) ||
    (color.alpha !== null && !Number.isFinite(color.alpha))
  )
    throw new Error('Color coordinates and alpha must be finite');
  // CSS missing components act as zero outside interpolation; no interpolation is performed here.
  color.coords = color.coords.map(
    (channel) => channel ?? 0,
  ) as typeof color.coords;
  color.alpha = color.alpha ?? 0;
  return color;
}
function hex(rgb: RGB) {
  return (
    '#' +
    rgb
      .map((channel) =>
        Math.round(clamp(channel) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
function channels(value: string): RGB {
  return [1, 3, 5].map(
    (start) => parseInt(value.slice(start, start + 2), 16) / 255,
  ) as RGB;
}
function lch(color: Color) {
  const coordinates = color.to('oklch').coords;
  const L = coordinates[0] ?? 0,
    C = coordinates[1] ?? 0;
  return {
    L,
    C: C < 1e-6 ? 0 : C,
    h: C < 1e-6 ? null : hue(coordinates[2] ?? 0),
  };
}
function deltaOK(a: Color, b: Color) {
  const first = a.to('oklab').coords,
    second = b.to('oklab').coords;
  return Math.hypot(
    ...first.map((value, index) => (value ?? 0) - (second[index] ?? 0)),
  );
}
function convert(value: string) {
  const intended = parseColor(value);
  const srgb = intended.to('srgb');
  if (
    srgb.coords.some((channel) => channel !== null && !Number.isFinite(channel))
  )
    throw new Error('Color conversion exceeds finite numeric range');
  const gamutMapped = !srgb.inGamut('srgb', { epsilon: 0 });
  srgb.toGamut({ space: 'srgb', method: 'css' });
  const fallbackHex = hex(srgb.coords.map((channel) => channel ?? 0) as RGB);
  const intendedAlpha = clamp(intended.alpha);
  const alpha = Math.round(intendedAlpha * 255) / 255;
  const rgb = channels(fallbackHex);
  const css =
    alpha === 1
      ? fallbackHex
      : `rgb(${rgb.map((channel) => Math.round(channel * 255)).join(' ')} / ${alpha})`;
  return {
    source: value,
    intended: {
      space: intended.space.id,
      coordinates: [...intended.coords],
      alpha: intendedAlpha,
      oklch: lch(intended),
    },
    emitted: {
      css,
      hex: fallbackHex,
      alpha,
      alphaQuantized: alpha !== intendedAlpha,
      gamut: 'srgb' as const,
      gamutMapped,
      deltaEOK: deltaOK(intended, new Color(fallbackHex)),
      oklab: new Color(fallbackHex)
        .to('oklab')
        .coords.map((channel) => channel ?? 0),
    },
  };
}
type Converted = ReturnType<typeof convert>;
function converter() {
  const cache = new Map<string, Converted>();
  return (value: string) => {
    let result = cache.get(value);
    if (!result) {
      result = convert(value);
      cache.set(value, result);
    }
    return result;
  };
}
function fallbackDistance(a: Converted, b: Converted) {
  return Math.hypot(
    ...a.emitted.oklab.map((value, index) => value - b.emitted.oklab[index]!),
  );
}
function over(foreground: Converted, opaqueBackground: string): string {
  const a = foreground.emitted.alpha,
    fg = channels(foreground.emitted.hex),
    bg = channels(opaqueBackground);
  return hex(
    fg.map((channel, index) => a * channel + (1 - a) * bg[index]!) as RGB,
  );
}
function luminanceInterval(value: string, uncertainty: number) {
  const bytes = [1, 3, 5].map((start) =>
    parseInt(value.slice(start, start + 2), 16),
  );
  const lower = hex(
    bytes.map(
      (channel) => Math.max(0, Math.floor(channel - uncertainty)) / 255,
    ) as RGB,
  );
  const upper = hex(
    bytes.map(
      (channel) => Math.min(255, Math.ceil(channel + uncertainty)) / 255,
    ) as RGB,
  );
  return {
    min: describeColor(lower).luminance,
    max: describeColor(upper).luminance,
  };
}
function contrastInterval(
  foreground: string,
  background: string,
  foregroundError: number,
  backgroundError: number,
) {
  if (foregroundError === 0 && backgroundError === 0) {
    const ratio = contrastRatio(foreground, background);
    return { min: ratio, max: ratio };
  }
  const fg = luminanceInterval(foreground, foregroundError),
    bg = luminanceInterval(background, backgroundError);
  return {
    min:
      fg.max < bg.min
        ? (bg.min + 0.05) / (fg.max + 0.05)
        : bg.max < fg.min
          ? (fg.min + 0.05) / (bg.max + 0.05)
          : 1,
    max: Math.max(
      (fg.max + 0.05) / (bg.min + 0.05),
      (bg.max + 0.05) / (fg.min + 0.05),
    ),
  };
}

/** Explicit sRGB fallback; an alpha channel is never silently dropped to certify contrast. */
export function convertColor(input: unknown) {
  const request = ColorConvertSchema.parse(input),
    result = convert(request.color);
  const backdrop =
    request.backdrop === undefined ? null : convert(request.backdrop);
  if (backdrop && backdrop.emitted.alpha !== 1)
    throw new Error('Conversion backdrop must be opaque');
  const composite =
    result.emitted.alpha === 1
      ? result.emitted.hex
      : backdrop
        ? over(result, backdrop.emitted.hex)
        : null;
  return {
    ...result,
    composite:
      composite === null
        ? {
            status: 'unknown' as const,
            reason: 'An opaque backdrop is required',
            hex: null,
          }
        : { status: 'resolved' as const, hex: composite },
    backdrop: backdrop?.emitted.css ?? null,
    compositeUncertaintyCodeValues:
      composite === null ? null : result.emitted.alpha === 1 ? 0 : 1,
    measurementRef: `color:${hash({ algorithm, request })}`,
    algorithm,
    scope:
      'CSS Color 4 input mapped to explicit RGBA8 sRGB fallback, including quantized alpha in emitted CSS. Composite hex is an encoded-sRGB nominal prediction; allow ±1 code value per layer. Emit the opaque composite hex for exact declared color bytes. Cross-renderer alpha and wide-gamut agreement are not certified.',
  };
}
export function paletteRamp(input: unknown) {
  const request = PaletteRampSchema.parse(input),
    base = convert(request.color);
  const original = base.intended.oklch;
  const h =
    request.hue === undefined
      ? original.h
      : request.hue === null
        ? null
        : hue(request.hue);
  const C = h === null ? 0 : original.C * request.chromaScale;
  return {
    steps: request.lightness.map((L) => {
      const color = `oklch(${L} ${C} ${h ?? 0} / ${base.intended.alpha})`;
      const converted = convert(color);
      return {
        requested: { L, C, h },
        ...converted,
        measurementRef: `color:${hash({ algorithm, request: { color } })}`,
      };
    }),
    algorithm,
    scope:
      'Editable OKLCH lightness samples with explicit chroma/hue policy; step spacing is not a legibility or aesthetic score.',
  };
}
function threshold(
  use: PaletteSystem['roles'][number]['use'],
  level: 'AA' | 'AAA',
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
export type PaletteCheck = {
  id: string;
  role: string;
  foreground: string;
  /** Surface under the foreground, including when this check compares an adjacent surface. */
  foregroundBackdrop: string;
  background: string;
  backdrop: string | null;
  state: string;
  theme: string;
  use: PaletteSystem['roles'][number]['use'];
  status: PaletteStatus;
  minimum: number | null;
  ratio: number | null;
  ratioInterval: { min: number; max: number } | null;
  compositingUncertainty: {
    foregroundCodeValues: number;
    backgroundCodeValues: number;
  };
  effectiveForeground: string | null;
  effectiveBackground: string | null;
  reason: string | null;
};
function analyze(
  system: PaletteSystem,
  level: 'AA' | 'AAA',
  cachedConvert = converter(),
) {
  const tokens = Object.fromEntries(
    Object.entries(system.tokens).map(([name, value]) => [
      name,
      cachedConvert(value),
    ]),
  );
  const checks: PaletteCheck[] = system.roles.flatMap((role) =>
    [...new Set([role.background, ...role.adjacentBackgrounds])].map(
      (background) => {
        const foregroundColor = tokens[role.foreground]!,
          backgroundColor = tokens[background]!;
        const backdrop = role.backdrop === null ? null : tokens[role.backdrop]!;
        const minimum = threshold(role.use, level);
        const resolveSurface = (surface: Converted) =>
          surface.emitted.alpha === 1
            ? surface.emitted.hex
            : backdrop?.emitted.alpha === 1
              ? over(surface, backdrop.emitted.hex)
              : null;
        const effectiveBackground = resolveSurface(backgroundColor);
        const foregroundBackdrop = resolveSurface(tokens[role.background]!);
        const effectiveForeground =
          foregroundColor.emitted.alpha === 1
            ? foregroundColor.emitted.hex
            : foregroundBackdrop === null
              ? null
              : over(foregroundColor, foregroundBackdrop);
        const ratio =
          effectiveBackground === null || effectiveForeground === null
            ? null
            : contrastRatio(effectiveForeground, effectiveBackground);
        const backgroundError = backgroundColor.emitted.alpha === 1 ? 0 : 1;
        const foregroundError =
          foregroundColor.emitted.alpha === 1
            ? 0
            : 1 +
              (1 - foregroundColor.emitted.alpha) *
                (tokens[role.background]!.emitted.alpha === 1 ? 0 : 1);
        const interval =
          effectiveForeground === null || effectiveBackground === null
            ? null
            : contrastInterval(
                effectiveForeground,
                effectiveBackground,
                foregroundError,
                backgroundError,
              );
        return {
          id: `${role.id}/${background}`,
          role: role.id,
          foreground: role.foreground,
          foregroundBackdrop: role.background,
          background,
          backdrop: role.backdrop,
          state: role.state,
          theme: role.theme,
          use: role.use,
          minimum,
          ratio,
          ratioInterval: interval,
          compositingUncertainty: {
            foregroundCodeValues: foregroundError,
            backgroundCodeValues: backgroundError,
          },
          effectiveForeground,
          effectiveBackground,
          status:
            minimum === null
              ? ('not-applicable' as const)
              : interval === null
                ? ('unknown' as const)
                : interval.min >= minimum
                  ? ('pass' as const)
                  : interval.max < minimum
                    ? ('fail' as const)
                    : ('unknown' as const),
          reason:
            minimum === null
              ? 'Caller-declared decorative use'
              : ratio === null
                ? 'A required foreground or comparison surface is translucent without a declared opaque backdrop'
                : minimum !== null &&
                    interval!.min < minimum &&
                    interval!.max >= minimum
                  ? 'Compositing interval straddles the contrast threshold; measure the actual renderer or emit and recheck opaque resolved colors.'
                  : null,
        };
      },
    ),
  );
  const count = (status: PaletteStatus) =>
    checks.filter((check) => check.status === status).length;
  const summary = {
    pass: count('pass'),
    fail: count('fail'),
    unknown: count('unknown'),
    notApplicable: count('not-applicable'),
    status: (count('fail')
      ? 'fail'
      : count('unknown')
        ? 'unknown'
        : count('pass')
          ? 'pass'
          : 'not-applicable') as PaletteStatus,
  };
  const compatible =
    checks.length <= 128 &&
    ['canvas', 'ink', 'accent'].every((name) => Object.hasOwn(tokens, name)) &&
    Object.values(tokens).every((token) => token.emitted.alpha === 1);
  const compatibleSystem: ColorSystem | null = compatible
    ? {
        tokens: Object.fromEntries(
          Object.entries(tokens).map(([name, token]) => [
            name,
            token.emitted.hex,
          ]),
        ),
        roles: system.roles.flatMap((role) =>
          [...new Set([role.background, ...role.adjacentBackgrounds])].map(
            (background, index) => ({
              id: `${role.id}-${index}`,
              foreground: role.foreground,
              background,
              use: role.use,
              source: role.source.map((source, i) =>
                i === 0
                  ? `${source}; palette-context:theme=${role.theme};state=${role.state}`
                  : source,
              ),
            }),
          ),
        ),
        harmony: system.harmony,
      }
    : null;
  return {
    system,
    tokens,
    checks,
    summary,
    compatibleSystem,
    measurementRef: `palette:${hash({ algorithm, system, contrastLevel: level })}`,
    algorithm,
    contrastLevel: level,
    standard: wcag,
    capabilities: {
      target: 'srgb-8bit',
      compositing: 'encoded-srgb-source-over',
      compositingUncertainty:
        'Conditional bound: ±1 sRGB code value at each alpha-compositing stage, propagated to foreground; pass uses interval lower bound. This rounding envelope is not a universal compositor guarantee. Threshold overlaps require actual-render verification or opaque resolved emission.',
      legacyHexSystem: compatible,
      legacyReason: compatible
        ? null
        : 'Legacy StateSchema requires canvas/ink/accent, opaque hex tokens and at most 128 expanded roles; per-backdrop alpha cannot be represented as one global hex token.',
      stateCoverage:
        'Only declared theme/state/adjacency relations are checked.',
      unverified: [
        'actual backdrop/large-text applicability',
        'color-only meaning and CVD',
        'focus area/obscuration and keyboard behavior',
        'ARIA/name/role/state semantics',
        'wide-gamut rendering',
        'aesthetic preference',
      ],
    },
  };
}
export function analyzePalette(input: unknown) {
  const request = PaletteAnalyzeSchema.parse(input);
  return analyze(request.system, request.contrastLevel);
}

type Analysis = ReturnType<typeof analyze>;
type SearchNode = {
  system: PaletteSystem;
  analysis: Analysis;
  changed: string[];
  distance: number;
};
function searchOrder(node: SearchNode) {
  return [
    node.analysis.summary.fail + node.analysis.summary.unknown,
    node.changed.length,
    node.distance,
  ];
}
function compare(a: SearchNode, b: SearchNode) {
  const x = searchOrder(a),
    y = searchOrder(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i]! - y[i]!;
  return a.analysis.measurementRef.localeCompare(b.analysis.measurementRef);
}
function related(check: PaletteCheck) {
  return [
    check.foreground,
    check.foregroundBackdrop,
    check.background,
    ...(check.backdrop ? [check.backdrop] : []),
  ];
}
function variants(
  name: string,
  node: SearchNode,
  cachedConvert: ReturnType<typeof converter>,
) {
  const original = node.analysis.tokens[name]!;
  const { C, h, L } = original.intended.oklch;
  const values = new Set<string>();
  const samples = [
    ...new Set([L, 0, 1, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]),
  ];
  for (const factor of [1, 0.5, 0])
    for (const lightness of samples) {
      values.add(
        cachedConvert(
          `oklch(${lightness} ${C * factor} ${h ?? 0} / ${original.emitted.alpha})`,
        ).emitted.css,
      );
    }
  // Exact luminance intervals provide narrow neutral alternatives that a lightness grid can miss.
  if (original.emitted.alpha === 1) {
    let intervals: [number, number][] = [[0, 1]];
    for (const check of node.analysis.checks) {
      if (check.minimum === null) continue;
      let other: string | null = null;
      if (check.foreground === name) other = check.effectiveBackground;
      else if (
        check.background === name &&
        node.analysis.tokens[check.foreground]!.emitted.alpha === 1
      )
        other = check.effectiveForeground;
      if (other === null) continue;
      const y = describeColor(other).luminance,
        r = check.minimum;
      const dark = (y + 0.05) / r - 0.05,
        light = r * (y + 0.05) - 0.05;
      const allowed: [number, number][] = [
        ...(dark >= 0 ? [[0, Math.min(1, dark)] as [number, number]] : []),
        ...(light <= 1 ? [[Math.max(0, light), 1] as [number, number]] : []),
      ];
      intervals = intervals.flatMap(([low, high]) =>
        allowed
          .map(
            ([a, b]) =>
              [Math.max(low, a), Math.min(high, b)] as [number, number],
          )
          .filter(([a, b]) => a <= b),
      );
    }
    for (const [low, high] of intervals)
      for (const luminance of [low, (low + high) / 2, high]) {
        const encoded =
          luminance <= 0.0031308
            ? 12.92 * luminance
            : 1.055 * luminance ** (1 / 2.4) - 0.055;
        for (const channel of [
          Math.floor(encoded * 255),
          Math.round(encoded * 255),
          Math.ceil(encoded * 255),
        ])
          values.add(hex([channel / 255, channel / 255, channel / 255]));
      }
  }
  return [...values]
    .map((value) => ({
      value,
      distance: fallbackDistance(original, cachedConvert(value)),
    }))
    .sort((a, b) => a.distance - b.distance || a.value.localeCompare(b.value))
    .map((item) => item.value);
}

export type PaletteObjective = {
  failedChecks: number;
  unknownChecks: number;
  changedTokens: number;
  deltaEOKSum: number;
  /** Minimum (contrast interval lower bound / required ratio) - 1, or null without a resolved required edge. */
  minimumContrastMargin: number | null;
};
function objective(node: SearchNode): PaletteObjective {
  const margins = node.analysis.checks.flatMap((check) =>
    check.ratioInterval === null || check.minimum === null
      ? []
      : [check.ratioInterval.min / check.minimum - 1],
  );
  return {
    failedChecks: node.analysis.summary.fail,
    unknownChecks: node.analysis.summary.unknown,
    changedTokens: node.changed.length,
    deltaEOKSum: node.distance,
    minimumContrastMargin: margins.length ? Math.min(...margins) : null,
  };
}

/** Bounded joint repair: internal partial states can progress, returned candidates satisfy every known required edge. */
export function paletteCandidates(input: unknown) {
  const request = PaletteCandidateSchema.parse(input),
    cachedConvert = converter(),
    base = analyze(request.system, request.contrastLevel, cachedConvert);
  for (const name of [
    ...request.lockedTokens,
    ...(request.editableTokens ?? []),
  ])
    if (!Object.hasOwn(request.system.tokens, name))
      throw new Error(`Unknown candidate token ${name}`);
  const editable = [
    ...new Set(
      request.editableTokens ?? Object.keys(request.system.tokens).sort(),
    ),
  ].filter((name) => !request.lockedTokens.includes(name));
  const invariantFailedChecks = base.checks
    .filter(
      (check) =>
        check.status === 'fail' &&
        !related(check).some((name) => editable.includes(name)),
    )
    .map((check) => check.id);
  const start: SearchNode = {
    system: request.system,
    analysis: base,
    changed: [],
    distance: 0,
  };
  let frontier = [start],
    best = start,
    attempted = 1,
    duplicates = 0;
  const emittedIdentity = (analysis: Analysis, name?: string, value?: string) =>
    hash({
      ...Object.fromEntries(
        Object.entries(analysis.tokens).map(([token, color]) => [
          token,
          color.emitted.css,
        ]),
      ),
      ...(name === undefined ? {} : { [name]: value }),
    });
  const seen = new Set([emittedIdentity(base)]);
  const accepted: SearchNode[] = [];
  const isCandidate = (node: SearchNode) =>
    node.analysis.summary.fail === 0 && node.analysis.summary.unknown === 0;
  if (isCandidate(start)) accepted.push(start);
  while (
    !invariantFailedChecks.length &&
    frontier.length &&
    attempted < request.maxAttempts &&
    accepted.length < request.limit
  ) {
    const next: SearchNode[] = [];
    outer: for (const node of frontier) {
      const pending = node.analysis.checks.find(
        (check) =>
          (check.status === 'fail' || check.status === 'unknown') &&
          related(check).some(
            (name) => editable.includes(name) && !node.changed.includes(name),
          ),
      );
      const choices = pending
        ? editable.filter((name) => related(pending).includes(name))
        : editable;
      for (const name of choices.filter((name) => !node.changed.includes(name)))
        for (const value of variants(name, node, cachedConvert)) {
          const system = {
            ...node.system,
            tokens: { ...node.system.tokens, [name]: value },
          };
          const identity = emittedIdentity(node.analysis, name, value);
          if (seen.has(identity)) {
            duplicates++;
            continue;
          }
          if (attempted >= request.maxAttempts) break outer;
          seen.add(identity);
          attempted++;
          const analysis = analyze(
            system,
            request.contrastLevel,
            cachedConvert,
          );
          const changed = [...node.changed, name];
          const distance = changed.reduce(
            (total, token) =>
              total +
              fallbackDistance(base.tokens[token]!, analysis.tokens[token]!),
            0,
          );
          const child = { system, analysis, changed, distance };
          if (compare(child, best) < 0) best = child;
          if (isCandidate(child)) accepted.push(child);
          next.push(child);
          if (accepted.length >= request.limit) break outer;
        }
    }
    frontier = next.sort(compare).slice(0, request.beamWidth);
  }
  const summarize = (node: SearchNode) => ({
    system: node.system,
    measurementRef: node.analysis.measurementRef,
    summary: node.analysis.summary,
    contrastLevel: request.contrastLevel,
    objective: objective(node),
    compatibleSystem: node.analysis.compatibleSystem,
    changes: node.changed.map((name) => ({
      token: name,
      before: request.system.tokens[name]!,
      after: node.system.tokens[name]!,
      deltaEOK: fallbackDistance(
        base.tokens[name]!,
        node.analysis.tokens[name]!,
      ),
    })),
  });
  return {
    candidates: accepted.map((node, index) => ({
      id: node.changed.length ? `palette-${index + 1}` : 'original',
      ...summarize(node),
    })),
    attempted,
    duplicates,
    maxAttempts: request.maxAttempts,
    invariantFailedChecks,
    termination: invariantFailedChecks.length
      ? 'locked-conflict'
      : accepted.length >= request.limit
        ? 'limit'
        : attempted >= request.maxAttempts
          ? 'budget'
          : 'frontier-exhausted',
    bestUnresolved: accepted.length
      ? null
      : {
          ...summarize(best),
          unresolvedChecks: best.analysis.checks.filter(
            (check) => check.status === 'fail' || check.status === 'unknown',
          ),
        },
    algorithm,
    notes: [
      'Search orders partial states by unresolved constraints, edit count and OKLab change, not beauty. It is bounded and not a global feasibility proof.',
      'The candidate domain preserves token alpha and hue while sampling OKLCH lightness/chroma and feasible neutral luminance intervals; each token is edited at most once per path.',
      'Every candidate is checked after sRGB gamut mapping, 8-bit quantization and declared compositing against all role/adjacency edges.',
      'No-role/decorative-only candidates report not-applicable, never an accessibility pass.',
      'Run palette analyze on a candidate system for full role facts under the same measurementRef.',
    ],
  };
}
