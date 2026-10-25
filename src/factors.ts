import { z } from 'zod';
import { resolveLayout } from './responsive.js';
import {
  compatibility,
  CurveSchema,
  makeCurve,
  rhythm,
  type Curve,
  type Prior,
} from './intervals.js';
import {
  effectiveWidth,
  type DesignState,
  type LayoutMeasurement,
  type EvidenceKind,
} from './state.js';
import { fontAt } from './fonts.js';
import { measurementKey } from './measurement.js';
import { renderedColorAnalysis } from './design-color.js';
import { analyzeComposition } from './composition.js';

export const PolicySchema = z
  .object({
    prior: z.enum(['smooth', 'musical']).default('smooth'),
    curves: z.record(z.string(), CurveSchema).default({}),
    targets: z
      .object({
        heroHierarchy: z.number().positive().default(3.2),
        editorialHierarchy: z.number().positive().default(2),
        proseCharacters: z.number().positive().default(62),
        subtitleCharacters: z.number().positive().default(46),
        proseLeading: z.number().positive().default(1.5),
        subtitleLeading: z.number().positive().default(1.35),
        titleLeading: z.number().positive().default(1.04),
        gapEm: z.number().positive().default(0.9),
      })
      .default({
        heroHierarchy: 3.2,
        editorialHierarchy: 2,
        proseCharacters: 62,
        subtitleCharacters: 46,
        proseLeading: 1.5,
        subtitleLeading: 1.35,
        titleLeading: 1.04,
        gapEm: 0.9,
      }),
  })
  .strict();
export type Policy = z.infer<typeof PolicySchema>;
export function policy(input: unknown = {}): Policy {
  return PolicySchema.parse(input);
}
export type FactorScore = {
  id: string;
  kind: EvidenceKind;
  source: string[];
  uncertainty: string;
  value: number;
  compatibility: number;
  curve: Curve | null;
  evidence: Record<string, unknown>;
  alternatives: number[];
};
export function trackingTarget(size: number, weight: number): number {
  // This smooth interpolation is a starting heuristic, not a fitted psychophysical law.
  return Math.max(
    -0.035,
    Math.min(
      0.025,
      0.008 - 0.012 * Math.log2(size / 16) - (0.006 * (weight - 400)) / 500,
    ),
  );
}
export function scoreRelations(
  state: DesignState,
  measurement: LayoutMeasurement,
  p: Policy = policy(),
) {
  if (measurement.inputHash !== measurementKey(state))
    throw new Error('stale measurement: state or font content changed');
  const resolved = resolveLayout(
    state,
    Number(measurement.runtime.fontScale ?? 1),
  );
  state = resolved.state;
  const scores: FactorScore[] = [];
  function add(
    id: string,
    value: number,
    center: number,
    source: string[],
    evidence: Record<string, unknown>,
    alternatives: number[],
    usePrior: Prior = 'smooth',
  ) {
    const curve = p.curves[id] ?? makeCurve(center, usePrior);
    scores.push({
      id,
      kind: curve.kind,
      source: [...source, curve.source],
      uncertainty:
        'uncalibrated numerical prior; compatibility is not probability or aesthetic validation',
      value,
      compatibility: compatibility(value, curve),
      curve,
      evidence,
      alternatives,
    });
  }
  for (const [i, b] of state.blocks.entries()) {
    const m = measurement.blocks[i];
    if (!m || m.id !== b.id)
      throw new Error(`measurement is missing ordered block ${b.id}`);
    const target = trackingTarget(b.size, b.weight);
    const trackingDistance = Math.abs(b.trackingEm - target);
    scores.push({
      id: `tracking:${b.id}`,
      kind: 'heuristic',
      source: ['uswds', 'local-policy'],
      uncertainty: 'high; no font/script-specific fitted coefficients',
      value: b.trackingEm,
      compatibility: Math.exp(-0.5 * (trackingDistance / 0.025) ** 2),
      curve: null,
      evidence: {
        target,
        weight: b.weight,
        size: b.size,
        kerning: b.kerning,
        lineCount: m.lines.length,
      },
      alternatives: [target - 0.008, target, target + 0.008],
    });
    const leadTarget =
      b.role === 'prose'
        ? p.targets.proseLeading
        : b.role === 'subtitle'
          ? p.targets.subtitleLeading
          : p.targets.titleLeading + (m.lines.length > 2 ? 0.04 : 0);
    add(
      `leading:${b.id}`,
      b.leading,
      leadTarget,
      ['leading-study', 'uswds'],
      {
        lineCount: m.lines.length,
        measure: effectiveWidth(state, b),
        fontMetrics: {
          xHeight: fontAt(b).xHeight,
          unitsPerEm: fontAt(b).unitsPerEm,
        },
      },
      [leadTarget - 0.06, leadTarget, leadTarget + 0.06],
    );
    const lines = m.lines.map((l) => l.text.trim().length);
    const average = lines.length
      ? lines.reduce((s, n) => s + n, 0) / lines.length
      : 1;
    const targetLength =
      b.role === 'prose'
        ? p.targets.proseCharacters
        : b.role === 'subtitle'
          ? p.targets.subtitleCharacters
          : state.archetype === 'hero'
            ? 24
            : 32;
    add(
      `measure:${b.id}`,
      Math.max(average, 1),
      targetLength,
      ['uswds'],
      {
        width: m.box.width,
        lineLengths: lines,
        lastLine: lines.at(-1),
        note: 'UTF-16 lengths describe this content; not a language-independent readability measure',
      },
      [b.measure * 0.9, b.measure, b.measure * 1.1],
    );
  }
  const title = state.blocks.find((b) => b.role === 'title')!;
  const prose =
    state.blocks.find((b) => b.role === 'prose') ??
    state.blocks.find((b) => b.role === 'subtitle')!;
  const hierarchy = title.size / prose.size;
  add(
    'hierarchy',
    hierarchy,
    state.archetype === 'hero'
      ? p.targets.heroHierarchy
      : p.targets.editorialHierarchy,
    ['harvard', 'gregory'],
    {
      titleSize: title.size,
      proseSize: prose.size,
      titleWeight: title.weight,
      proseWeight: prose.weight,
    },
    [hierarchy * 0.94, hierarchy, hierarchy * 1.06],
    p.prior,
  );
  for (const [i, gap] of state.gaps.entries()) {
    const next = state.blocks[i + 1]!;
    add(
      `whitespace:${i}`,
      Math.max(gap / next.size, 0.0001),
      p.targets.gapEm,
      ['local-policy'],
      {
        gap,
        nextSize: next.size,
        aboveLines: measurement.blocks[i]!.lines.length,
        geometry:
          'inline boxes; optical whitespace needs glyph ink verification',
      },
      [next.size * 0.6, next.size * 0.9, next.size * 1.2],
    );
  }
  return {
    colors: renderedColorAnalysis(state),
    composition: analyzeComposition({
      viewport: { width: state.viewport.width, height: state.viewport.height },
      rectangles: measurement.blocks.map((block) => ({
        id: block.id,
        box: block.box,
      })),
      readingOrder: state.blocks.map((block) => block.id),
      context: {
        direction: state.blocks[0]!.direction === 'rtl' ? 'rtl' : 'ltr',
        flow: resolved.pattern === 'split' ? 'row' : 'column',
        source: `${measurement.engine} measured peer text boxes`,
      },
    }),
    inputHash: measurement.inputHash,
    feasible: measurement.feasible,
    prior: p.prior,
    factors: scores,
    rhythm: rhythm(state.gaps),
    issues: measurement.issues,
    interpretation:
      'Separate conditional compatibility factors. No sum, global beauty score, calibrated preference probability or SemIf-derived validity.',
    objectives: Object.fromEntries(scores.map((f) => [f.id, f.compatibility])),
  };
}
export type Relations = ReturnType<typeof scoreRelations>;
