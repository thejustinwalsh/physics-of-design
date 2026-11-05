import * as z from 'zod';
import { FlowGapControlSchema, projectFlowGap } from './flow-gap.js';

const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const coordinate = z.number().finite().min(-1e6).max(1e6);
const size = z.number().finite().nonnegative().max(1e6);
export const CompositionRectSchema = z
  .object({ x: coordinate, y: coordinate, width: size, height: size })
  .strict();
export const CompositionContextSchema = z
  .object({
    direction: z.enum(['ltr', 'rtl']).default('ltr'),
    flow: z.enum(['column', 'row']).default('column'),
    alignmentTolerance: z.number().finite().nonnegative().max(1e6).default(4),
    source: z.string().min(1).default('renderer-supplied rectangles'),
  })
  .strict();
export const CompositionInputSchema = z
  .object({
    viewport: z
      .object({ width: size.positive(), height: size.positive() })
      .strict(),
    rectangles: z
      .array(
        z
          .object({
            id,
            box: CompositionRectSchema,
            priority: z.number().finite().optional(),
          })
          .strict(),
      )
      .max(128),
    groups: z
      .array(
        z
          .object({
            id,
            members: z.array(id).min(1).max(128),
            source: z.array(z.string().min(1)).min(1).max(16),
          })
          .strict(),
      )
      .max(128)
      .default([]),
    constraints: z
      .array(
        z
          .object({
            id,
            members: z.array(id).min(2).max(128),
            axis: z.enum(['left', 'right', 'top', 'bottom', 'width', 'height']),
            tolerance: size.default(1),
            source: z.string().min(1),
          })
          .strict(),
      )
      .max(128)
      .default([]),
    exposureRules: z
      .array(
        z
          .object({
            id,
            member: id,
            minimumVisibleFraction: z
              .number()
              .finite()
              .min(0)
              .max(1)
              .optional(),
            latestStartFraction: z.number().finite().optional(),
            latestEndFraction: z.number().finite().optional(),
            mode: z.enum(['constraint', 'preference']),
            source: z.string().min(1),
          })
          .strict()
          .refine(
            (rule) =>
              rule.minimumVisibleFraction !== undefined ||
              rule.latestStartFraction !== undefined ||
              rule.latestEndFraction !== undefined,
            'At least one exposure target is required',
          ),
      )
      .max(128)
      .default([]),
    gapProjection: FlowGapControlSchema.optional(),
    readingOrder: z.array(id).max(128).default([]),
    context: CompositionContextSchema.default({
      direction: 'ltr',
      flow: 'column',
      alignmentTolerance: 4,
      source: 'renderer-supplied rectangles',
    }),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.viewport.width * input.viewport.height === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['viewport'],
        message:
          'viewport area must be representable as a positive finite number',
      });
    const known = new Set(input.rectangles.map((r) => r.id));
    if (known.size !== input.rectangles.length)
      ctx.addIssue({
        code: 'custom',
        path: ['rectangles'],
        message: 'rectangle IDs must be unique',
      });
    if (new Set(input.groups.map((g) => g.id)).size !== input.groups.length)
      ctx.addIssue({
        code: 'custom',
        path: ['groups'],
        message: 'group IDs must be unique',
      });
    const check = (members: string[], path: (string | number)[]) => {
      if (new Set(members).size !== members.length)
        ctx.addIssue({
          code: 'custom',
          path,
          message: 'duplicate rectangle reference',
        });
      for (const member of members)
        if (!known.has(member))
          ctx.addIssue({
            code: 'custom',
            path,
            message: `unknown rectangle ${member}`,
          });
    };
    if (
      new Set(input.constraints.map((c) => c.id)).size !==
      input.constraints.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['constraints'],
        message: 'constraint IDs must be unique',
      });
    input.constraints.forEach((c, i) =>
      check(c.members, ['constraints', i, 'members']),
    );
    if (
      new Set(input.exposureRules.map((rule) => rule.id)).size !==
      input.exposureRules.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['exposureRules'],
        message: 'exposure rule IDs must be unique',
      });
    input.exposureRules.forEach((rule, index) =>
      check([rule.member], ['exposureRules', index, 'member']),
    );
    input.gapProjection?.targets.forEach((target, index) =>
      check([target.member], ['gapProjection', 'targets', index, 'member']),
    );
    check(input.readingOrder, ['readingOrder']);
    input.groups.forEach((g, i) => check(g.members, ['groups', i, 'members']));
  });
export type CompositionInput = z.infer<typeof CompositionInputSchema>;
export type CompositionContext = z.infer<typeof CompositionContextSchema>;
type Rect = z.infer<typeof CompositionRectSchema>;
const area = (r: Rect) => r.width * r.height;
function intersect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}
function gap(a: Rect, b: Rect) {
  const dx = Math.max(a.x - b.x - b.width, b.x - a.x - a.width, 0);
  const dy = Math.max(a.y - b.y - b.height, b.y - a.y - a.height, 0);
  return Math.hypot(dx, dy);
}
function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
/** Exact axis-aligned rectangle union integration, including first moments; duplicates do not add weight. */
function unionGeometry(rectangles: Rect[]) {
  const xs = [...new Set(rectangles.flatMap((r) => [r.x, r.x + r.width]))].sort(
    (a, b) => a - b,
  );
  let unionArea = 0,
    momentX = 0,
    momentY = 0;
  for (let i = 1; i < xs.length; i++) {
    const left = xs[i - 1]!,
      right = xs[i]!,
      mid = (left + right) / 2;
    const intervals = rectangles
      .filter((r) => r.x < mid && r.x + r.width > mid)
      .map((r) => [r.y, r.y + r.height] as const)
      .sort(([a], [b]) => a - b);
    const merged: [number, number][] = [];
    for (const [start, end] of intervals) {
      const last = merged.at(-1);
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    for (const [top, bottom] of merged) {
      const sliceArea = (right - left) * (bottom - top);
      unionArea += sliceArea;
      momentX += sliceArea * mid;
      momentY += (sliceArea * (top + bottom)) / 2;
    }
  }
  return {
    area: unionArea,
    centroid: unionArea
      ? { x: momentX / unionArea, y: momentY / unionArea }
      : null,
  };
}
export function analyzeComposition(value: unknown) {
  const input = CompositionInputSchema.parse(value);
  const constraints = input.constraints.map((c) => {
    const values = c.members.map((member) => {
      const b = input.rectangles.find((r) => r.id === member)!.box;
      switch (c.axis) {
        case 'left':
          return b.x;
        case 'right':
          return b.x + b.width;
        case 'top':
          return b.y;
        case 'bottom':
          return b.y + b.height;
        case 'width':
          return b.width;
        case 'height':
          return b.height;
      }
    });
    const deviation = Math.max(...values) - Math.min(...values);
    return {
      ...c,
      deviation,
      pass: deviation <= c.tolerance,
      scope:
        'Authored peer-alignment contract, not a universal aesthetic rule.',
    };
  });
  const bounds = { x: 0, y: 0, ...input.viewport };
  // Exposure is geometric clipping in the supplied frame, never gaze, salience
  // or hit-test visibility. Targets are caller-authored and remain separate.
  const exposure = input.rectangles.map((region) => {
    const b = region.box;
    const horizontal = input.context.flow === 'row';
    const extent = horizontal ? input.viewport.width : input.viewport.height;
    const start = horizontal
      ? input.context.direction === 'rtl'
        ? extent - b.x - b.width
        : b.x
      : b.y;
    const end = start + (horizontal ? b.width : b.height);
    const positiveArea = area(b) > 0;
    const representable =
      Number.isFinite(start / extent) && Number.isFinite(end / extent);
    const available = positiveArea && representable;
    return {
      id: region.id,
      status: available ? ('calculated' as const) : ('unavailable' as const),
      visibleFraction: available ? area(intersect(b, bounds)) / area(b) : null,
      startFraction: available ? start / extent : null,
      endFraction: available ? end / extent : null,
      reason: available
        ? null
        : !positiveArea
          ? 'Zero-area region has no defined exposure fraction'
          : 'Exposure normalization exceeds finite numeric range',
    };
  });
  const exposureRules = input.exposureRules.map((rule) => {
    const observation = exposure.find((region) => region.id === rule.member)!;
    const tests =
      observation.status === 'unavailable'
        ? []
        : [
            ...(rule.minimumVisibleFraction === undefined
              ? []
              : [
                  {
                    quantity: 'visibleFraction',
                    value: observation.visibleFraction!,
                    target: rule.minimumVisibleFraction,
                    residual: Math.max(
                      0,
                      rule.minimumVisibleFraction -
                        observation.visibleFraction!,
                    ),
                  },
                ]),
            ...(rule.latestStartFraction === undefined
              ? []
              : [
                  {
                    quantity: 'startFraction',
                    value: observation.startFraction!,
                    target: rule.latestStartFraction,
                    residual: Math.max(
                      0,
                      observation.startFraction! - rule.latestStartFraction,
                    ),
                  },
                ]),
            ...(rule.latestEndFraction === undefined
              ? []
              : [
                  {
                    quantity: 'endFraction',
                    value: observation.endFraction!,
                    target: rule.latestEndFraction,
                    residual: Math.max(
                      0,
                      observation.endFraction! - rule.latestEndFraction,
                    ),
                  },
                ]),
          ];
    return {
      ...rule,
      status: observation.status,
      tests,
      pass:
        observation.status === 'unavailable'
          ? null
          : tests.every((test) => test.residual === 0),
    };
  });
  const active = input.rectangles.filter((r) => area(r.box) > 0);
  const clipped = active
    .map((r) => ({ id: r.id, box: intersect(r.box, bounds) }))
    .filter((r) => area(r.box) > 0);
  const union = unionGeometry(clipped.map((r) => r.box));
  const viewportArea = area(bounds);
  const pairs: {
    a: string;
    b: string;
    edgeGap: number;
    overlapArea: number;
    alignment: {
      left: number;
      centerX: number;
      right: number;
      top: number;
      centerY: number;
      bottom: number;
    };
  }[] = [];
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!,
        b = active[j]!,
        x = a.box,
        y = b.box;
      pairs.push({
        a: a.id,
        b: b.id,
        edgeGap: gap(x, y),
        overlapArea: area(intersect(x, y)),
        alignment: {
          left: Math.abs(x.x - y.x),
          centerX: Math.abs(x.x + x.width / 2 - y.x - y.width / 2),
          right: Math.abs(x.x + x.width - y.x - y.width),
          top: Math.abs(x.y - y.y),
          centerY: Math.abs(x.y + x.height / 2 - y.y - y.height / 2),
          bottom: Math.abs(x.y + x.height - y.y - y.height),
        },
      });
    }
  const alignment = pairs.map((p) => ({
    a: p.a,
    b: p.b,
    distances: p.alignment,
    withinTolerance: Object.entries(p.alignment)
      .filter(([, d]) => d <= input.context.alignmentTolerance)
      .map(([axis]) => axis),
  }));
  const proximity = input.groups.map((group) => {
    const within = pairs.filter(
      (p) => group.members.includes(p.a) && group.members.includes(p.b),
    );
    const across = pairs.filter(
      (p) => group.members.includes(p.a) !== group.members.includes(p.b),
    );
    return {
      ...group,
      withinMedianGap: median(within.map((p) => p.edgeGap)),
      nearestOutsideGap: across.length
        ? Math.min(...across.map((p) => p.edgeGap))
        : null,
      withinPairs: within.length,
      outsidePairs: across.length,
      kind: 'calculation' as const,
      interpretation:
        'semantic grouping is caller supplied; near is not automatically related, and touching/overlapping boxes have zero gap',
    };
  });
  const ordered = input.readingOrder.map((name) =>
    input.rectangles.find((r) => r.id === name)!,
  );
  const orderSteps = ordered.slice(1).map((r, i) => {
    const previous = ordered[i]!;
    const dx =
      (r.box.x - previous.box.x) * (input.context.direction === 'rtl' ? -1 : 1);
    const dy = r.box.y - previous.box.y;
    const primaryDelta = input.context.flow === 'column' ? dy : dx;
    const secondaryDelta = input.context.flow === 'column' ? dx : dy;
    return {
      from: previous.id,
      to: r.id,
      primaryDelta,
      secondaryDelta,
      geometricReversal:
        primaryDelta < 0 || (primaryDelta === 0 && secondaryDelta < 0),
    };
  });
  const areas = active.map((r) => area(r.box)),
    medianArea = median(areas);
  const normalizedOffset = union.centroid
    ? {
        x: (union.centroid.x - input.viewport.width / 2) / input.viewport.width,
        y:
          (union.centroid.y - input.viewport.height / 2) /
          input.viewport.height,
      }
    : null;
  return {
    constraints,
    exposure: {
      regions: exposure,
      rules: exposureRules,
      ...(input.gapProjection
        ? {
            gapProjection: projectFlowGap(input.gapProjection, {
              extent:
                input.context.flow === 'row'
                  ? input.viewport.width
                  : input.viewport.height,
              regions: input.rectangles.map((region) => {
                const e = exposure.find((r) => r.id === region.id)!;
                const horizontal = input.context.flow === 'row';
                const extent = horizontal
                  ? input.viewport.width
                  : input.viewport.height;
                const physicalStart = horizontal ? region.box.x : region.box.y;
                const physicalEnd =
                  physicalStart +
                  (horizontal ? region.box.width : region.box.height);
                const reverse = horizontal && input.context.direction === 'rtl';
                const crossStart = horizontal ? region.box.y : region.box.x;
                const crossEnd =
                  crossStart +
                  (horizontal ? region.box.height : region.box.width);
                const crossExtent = horizontal
                  ? input.viewport.height
                  : input.viewport.width;
                return {
                  id: region.id,
                  start:
                    e.startFraction === null
                      ? null
                      : reverse
                        ? extent - physicalEnd
                        : physicalStart,
                  end:
                    e.endFraction === null
                      ? null
                      : reverse
                        ? extent - physicalStart
                        : physicalEnd,
                  crossAxisFits:
                    e.status === 'unavailable'
                      ? null
                      : crossStart >= 0 && crossEnd <= crossExtent,
                };
              }),
            }),
          }
        : {}),
      interpretation:
        'Supplied frame clipping and declared flow-axis position only; no occlusion, focus, gaze, salience or aesthetic quality is inferred. Constraint/preference labels are authored by the caller.',
    },
    viewport: input.viewport,
    context: input.context,
    rectangleCount: input.rectangles.length,
    zeroAreaRectangles: input.rectangles
      .filter((r) => area(r.box) === 0)
      .map((r) => r.id),
    outsideViewport: active
      .filter((r) => area(intersect(r.box, bounds)) < area(r.box))
      .map((r) => r.id),
    alignment: {
      tolerance: input.context.alignmentTolerance,
      kind: 'calculation' as const,
      pairs: alignment,
      preferenceSource:
        'caller tolerance; no universal alignment target is inferred',
    },
    proximity,
    hierarchy: {
      kind: 'descriptor' as const,
      areaRanking: active
        .map((r) => ({ id: r.id, area: area(r.box) }))
        .sort((a, b) => b.area - a.area),
      largestToMedianArea: medianArea ? Math.max(...areas) / medianArea : null,
      declaredPriority: input.rectangles
        .filter((r) => r.priority !== undefined)
        .map((r) => ({ id: r.id, priority: r.priority! })),
      interpretation:
        'box area and declared priority are not font weight, perceived emphasis, comprehension or task importance',
    },
    balance: {
      kind: 'descriptor' as const,
      occupiedUnionCentroid: union.centroid,
      normalizedOffset,
      interpretation:
        'geometric occupied-area center, not salience-weighted visual balance; asymmetry is not a defect',
    },
    whitespace: {
      kind: 'calculation' as const,
      occupiedUnionArea: union.area,
      viewportArea,
      unoccupiedArea: Math.max(0, viewportArea - union.area),
      unoccupiedFraction: Math.max(0, 1 - union.area / viewportArea),
      interpretation:
        'unoccupied supplied rectangle area, not glyph-ink whitespace; clipping and union prevent double counting',
    },
    overlap: {
      kind: 'calculation' as const,
      pairs: pairs
        .filter((p) => p.overlapArea > 0)
        .map(({ a, b, overlapArea }) => ({ a, b, area: overlapArea })),
      interpretation:
        'pairwise intersections; intentional layering and parent/child containment are not automatically errors',
    },
    readingOrder: {
      declared: input.readingOrder,
      steps: orderSteps,
      kind: 'descriptor' as const,
      interpretation:
        'geometric reversals relative to declared axis/direction only; not DOM, focus, screen-reader or multi-column order validation',
    },
    provenance: {
      measurements: input.context.source,
      geometry:
        'deterministic axis-aligned rectangle calculations; source measurement quality remains the caller responsibility',
      judgment:
        'none: no preference rating, universal beauty score, or optimization target',
    },
    limitations: [
      'Supply comparable semantic regions; including a full-surface container makes its area occupied by definition.',
      'Union occupancy/centroid are invariant to duplicate nested coverage; pairwise alignment/proximity and area hierarchy are not.',
      'No glyph ink, color salience, occlusion order, gaze, semantics, motion or interaction is inferred from boxes.',
      'Geometry can describe grouping and rhythm, but human task context determines whether they work.',
      'No layout is emitted; any downstream implementation must preserve the project flex/Yoga-only contract.',
    ],
  };
}
export type CompositionAnalysis = ReturnType<typeof analyzeComposition>;
