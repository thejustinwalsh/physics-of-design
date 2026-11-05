import { z } from 'zod';
import { hash } from './identity.js';
import { searchEnergy, type EnergyProgram, type Expression } from './energy.js';

const Id = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const Length = z.number().finite().min(0.001).max(1e6);
const Source = z.array(z.string().min(1).max(512)).min(1).max(8);
const Unit = z.enum(['css-px', 'dp', 'pt']);
const Aspect = z
  .object({
    min: z.number().finite().positive().max(1000),
    max: z.number().finite().positive().max(1000),
    source: Source,
  })
  .strict()
  .refine((r) => r.min <= r.max, 'Aspect min must not exceed max');
const RegionFields = {
  id: Id,
  minWidth: Length,
  minHeight: Length,
  source: Source,
  aspect: Aspect.optional(),
  areaWeight: z.number().finite().min(0.001).max(10000).optional(),
};
const RegionSchema = z.discriminatedUnion('basis', [
  z.object({ ...RegionFields, basis: z.literal('authored') }).strict(),
  z
    .object({
      ...RegionFields,
      basis: z.literal('measured'),
      measurement: z
        .object({
          unit: Unit,
          provider: z.enum(['browser', 'native-ios', 'native-android']),
          inputIdentity: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .superRefine((m, ctx) => {
          if ((m.provider === 'browser') !== (m.unit === 'css-px'))
            ctx.addIssue({
              code: 'custom',
              message:
                'Browser CSS pixels and native logical measurements are distinct',
            });
        }),
    })
    .strict(),
]);
const BentoBaseSchema = z
  .object({
    width: Length,
    height: Length,
    gap: z.number().finite().nonnegative().max(1000),
    unit: Unit,
    direction: z.enum(['ltr', 'rtl']).default('ltr'),
    identity: z
      .record(z.string().min(1).max(80), z.string().min(1).max(256))
      .default({}),
    regions: z.array(RegionSchema).min(1).max(8),
    adjacency: z
      .array(
        z
          .object({
            first: Id,
            second: Id,
            maxGap: z.number().finite().nonnegative().max(1e6),
            source: Source,
          })
          .strict(),
      )
      .max(16)
      .default([]),
    gapCoverage: z
      .object({
        min: z.number().finite().min(0).max(1),
        max: z.number().finite().min(0).max(1),
        source: Source,
      })
      .strict()
      .refine((r) => r.min <= r.max, 'Gap coverage min must not exceed max')
      .optional(),
    maxEvaluations: z.number().int().min(1).max(512).default(512),
    limit: z.number().int().min(1).max(24).default(6),
  })
  .strict();
function refineBento(
  r: Pick<z.infer<typeof BentoBaseSchema>, 'regions' | 'adjacency' | 'unit'>,
  ctx: z.RefinementCtx,
) {
  const ids = new Set(r.regions.map((region) => region.id));
  r.regions.forEach((region, index) => {
    if (region.basis === 'measured' && region.measurement.unit !== r.unit)
      ctx.addIssue({
        code: 'custom',
        path: ['regions', index, 'measurement', 'unit'],
        message:
          'Measured minima must use the current frame unit; remeasure rather than relabel',
      });
  });
  if (ids.size !== r.regions.length)
    ctx.addIssue({
      code: 'custom',
      path: ['regions'],
      message: 'Region IDs must be unique',
    });
  const weighted = r.regions.filter(
    (region) => region.areaWeight !== undefined,
  ).length;
  if (weighted && weighted !== r.regions.length)
    ctx.addIssue({
      code: 'custom',
      path: ['regions'],
      message: 'Supply areaWeight for every region or omit it for all',
    });
  r.adjacency.forEach((pair, index) => {
    if (
      pair.first === pair.second ||
      !ids.has(pair.first) ||
      !ids.has(pair.second)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['adjacency', index],
        message: 'Adjacency must name two distinct declared regions',
      });
  });
}
export const BentoSchema = BentoBaseSchema.superRefine(refineBento);
export const BentoOptionsSchema = BentoBaseSchema.omit({
  width: true,
  gap: true,
}).superRefine(refineBento);
export type BentoInput = z.infer<typeof BentoSchema>;
type Region = BentoInput['regions'][number];
type Topology =
  | { kind: 'region'; index: number }
  | {
      kind: 'split';
      axis: 'row' | 'column';
      first: Topology;
      second: Topology;
    };
type Box = { x: number; y: number; width: number; height: number };
export interface BentoFlexStyle {
  display: 'flex';
  direction: 'ltr' | 'rtl';
  boxSizing: 'border-box';
  flexDirection: 'row' | 'column';
  minWidth: number;
  minHeight: number;
  width?: number;
  height?: number;
  gap?: number;
  flexBasis?: 0;
  flexGrow?: number;
  flexShrink?: 1;
}
export type BentoFlexNode =
  | {
      kind: 'region';
      id: string;
      box: Box;
      style: BentoFlexStyle;
    }
  | {
      kind: 'split';
      axis: 'row' | 'column';
      box: Box;
      style: BentoFlexStyle;
      children: [BentoFlexNode, BentoFlexNode];
    };
type Policy = 'balanced' | 'minima' | 'area';

/** Round-robin root cuts; a capped run must not exhaust its first root cut
 * before it even considers the other placements. Descendants do the same. */
function* topologies(start: number, end: number): Generator<Topology> {
  if (end - start === 1) {
    yield { kind: 'region', index: start };
    return;
  }
  const iterators = Array.from({ length: end - start - 1 }, (_, i) => {
    const split = start + i + 1;
    return (function* (): Generator<Topology> {
      for (const first of topologies(start, split))
        for (const second of topologies(split, end))
          for (const axis of ['row', 'column'] as const)
            yield { kind: 'split', axis, first, second };
    })();
  });
  while (iterators.length)
    for (let i = 0; i < iterators.length;) {
      const item = iterators[i]!.next();
      if (item.done) iterators.splice(i, 1);
      else {
        yield item.value;
        i++;
      }
    }
}
/** Seed feasible stack/strip extremes before exploring mixed-axis descendants.
 * The seeds are members of the same finite family, not additional candidates. */
function* placementTopologies(count: number): Generator<Topology> {
  const spine = (start: number, axis: 'row' | 'column'): Topology =>
    start === count - 1
      ? { kind: 'region', index: start }
      : {
          kind: 'split',
          axis,
          first: { kind: 'region', index: start },
          second: spine(start + 1, axis),
        };
  const seeds =
    count === 1 ? [spine(0, 'column')] : [spine(0, 'column'), spine(0, 'row')];
  const seeded = new Set(seeds.map((tree) => JSON.stringify(tree)));
  yield* seeds;
  for (const tree of topologies(0, count))
    if (!seeded.has(JSON.stringify(tree))) yield tree;
}
function minima(
  tree: Topology,
  regions: Region[],
  gap: number,
): { width: number; height: number; count: number; weight: number } {
  if (tree.kind === 'region') {
    const r = regions[tree.index]!;
    return {
      width: r.minWidth,
      height: r.minHeight,
      count: 1,
      weight: r.areaWeight ?? 1,
    };
  }
  const a = minima(tree.first, regions, gap),
    b = minima(tree.second, regions, gap);
  return {
    width:
      tree.axis === 'row'
        ? a.width + b.width + gap
        : Math.max(a.width, b.width),
    height:
      tree.axis === 'column'
        ? a.height + b.height + gap
        : Math.max(a.height, b.height),
    count: a.count + b.count,
    weight: a.weight + b.weight,
  };
}
function place(
  tree: Topology,
  box: Box,
  r: BentoInput,
  policy: Policy,
): BentoFlexNode | null {
  const min = minima(tree, r.regions, r.gap);
  if (box.width < min.width || box.height < min.height) return null;
  const style: Omit<BentoFlexStyle, 'flexDirection'> = {
    display: 'flex',
    direction: r.direction,
    boxSizing: 'border-box',
    minWidth: min.width,
    minHeight: min.height,
  };
  if (tree.kind === 'region')
    return {
      kind: 'region',
      id: r.regions[tree.index]!.id,
      box,
      style: { ...style, flexDirection: 'column' },
    };
  const horizontal = tree.axis === 'row',
    axis = horizontal ? 'width' : 'height';
  const a = minima(tree.first, r.regions, r.gap),
    b = minima(tree.second, r.regions, r.gap);
  const available = box[axis] - r.gap;
  const fraction =
    policy === 'area'
      ? a.weight / (a.weight + b.weight)
      : policy === 'minima'
        ? a[axis] / (a[axis] + b[axis])
        : a.count / (a.count + b.count);
  const firstSpan = Math.min(
    available - b[axis],
    Math.max(a[axis], available * fraction),
  );
  const reverse = horizontal && r.direction === 'rtl';
  const firstBox = {
    ...box,
    [axis]: firstSpan,
    ...(reverse ? { x: box.x + box.width - firstSpan } : {}),
  };
  const secondBox = {
    ...box,
    [axis]: available - firstSpan,
    [horizontal ? 'x' : 'y']: reverse
      ? box.x
      : box[horizontal ? 'x' : 'y'] + firstSpan + r.gap,
  };
  const first = place(tree.first, firstBox, r, policy),
    second = place(tree.second, secondBox, r, policy);
  if (!first || !second) return null; // conservative rejection at floating-point minimum ties
  for (const child of [first, second])
    Object.assign(child.style, {
      flexBasis: 0,
      flexGrow: child.box[axis] / available,
      flexShrink: 1,
    });
  return {
    kind: 'split',
    axis: tree.axis,
    box,
    style: { ...style, flexDirection: tree.axis, gap: r.gap },
    children: [first, second],
  };
}
function leaves(tree: BentoFlexNode): { id: string; box: Box }[] {
  return tree.kind === 'region'
    ? [{ id: tree.id, box: tree.box }]
    : tree.children.flatMap(leaves);
}
const outside = (x: number, min: number, max: number) =>
  Math.max(min - x, x - max, 0);
function consequences(tree: BentoFlexNode, r: BentoInput) {
  const boxes = leaves(tree),
    area = boxes.reduce((sum, { box }) => sum + box.width * box.height, 0);
  const aspects = boxes.flatMap(({ id, box }, i) => {
    const preferred = r.regions[i]!.aspect;
    return preferred
      ? [
          {
            id,
            ratio: box.width / box.height,
            residualOctaves: outside(
              Math.log2(box.width / box.height),
              Math.log2(preferred.min),
              Math.log2(preferred.max),
            ),
            provenancePointer: `/input/regions/${i}/aspect`,
          },
        ]
      : [];
  });
  const weightSum = r.regions.reduce(
    (sum, region) => sum + (region.areaWeight ?? 0),
    0,
  );
  const allocation = weightSum
    ? boxes.map(({ id, box }, i) => ({
        id,
        actualShare: (box.width * box.height) / area,
        targetShare: r.regions[i]!.areaWeight! / weightSum,
      }))
    : [];
  const adjacency = r.adjacency.map((pair, index) => {
    const a = boxes.find((box) => box.id === pair.first)!.box,
      b = boxes.find((box) => box.id === pair.second)!.box;
    const distance = Math.hypot(
      Math.max(a.x - b.x - b.width, b.x - a.x - a.width, 0),
      Math.max(a.y - b.y - b.height, b.y - a.y - a.height, 0),
    );
    return {
      first: pair.first,
      second: pair.second,
      maxGap: pair.maxGap,
      provenancePointer: `/input/adjacency/${index}`,
      distance,
      residual:
        Math.max(0, distance - pair.maxGap) / Math.hypot(r.width, r.height),
    };
  });
  const gapFraction = Math.max(0, 1 - area / (r.width * r.height));
  const costs: Record<string, number> = {};
  if (aspects.length)
    costs.aspect = Math.max(...aspects.map((a) => a.residualOctaves));
  if (allocation.length)
    costs.allocation = Math.max(
      ...allocation.map((a) =>
        Math.abs(Math.log2(a.actualShare / a.targetShare)),
      ),
    );
  if (adjacency.length)
    costs.adjacency = Math.max(...adjacency.map((a) => a.residual));
  if (r.gapCoverage)
    costs.whitespace = outside(
      gapFraction,
      r.gapCoverage.min,
      r.gapCoverage.max,
    );
  return { boxes, aspects, allocation, adjacency, gapFraction, costs };
}
/** Balanced finite lookup stays shallow enough for the existing expression engine. */
function lookup(values: number[], start = 0, end = values.length): Expression {
  if (end - start === 1) return values[start]!;
  const mid = Math.floor((start + end) / 2);
  return {
    op: 'if',
    args: [
      { op: 'lt', args: [{ ref: 'choiceIndex' }, mid] },
      lookup(values, start, mid),
      lookup(values, mid, end),
    ],
  };
}
function domainSize(regions: number) {
  let catalan = 1;
  for (let n = 0; n < regions - 1; n++)
    catalan = (catalan * 2 * (2 * n + 1)) / (n + 2);
  return Math.round(catalan) * 2 ** (regions - 1);
}

/** Styles only: callers retain their own components, content and interactions.
 * Pixel geometry is not silently relabeled as native measurement. */
export function emitBentoStyles(tree: BentoFlexNode, unit: BentoInput['unit']) {
  const rules: Record<string, BentoFlexStyle> = {},
    styleKeys: Record<string, string> = {};
  function collect(node: BentoFlexNode, path: string) {
    const key = `frame${Object.keys(rules).length}`;
    rules[key] = node.style;
    styleKeys[path] = key;
    if (node.kind === 'split')
      node.children.forEach((child, i) => collect(child, `${path}.${i}`));
  }
  collect(tree, 'root');
  const serialized = JSON.stringify(rules, null, 2);
  return {
    styleKeys,
    unit,
    stylex: {
      source:
        unit === 'css-px'
          ? `import * as stylex from '@stylexjs/stylex';\nexport const styles = stylex.create(${serialized});\n`
          : null,
      unsupported:
        unit === 'css-px'
          ? []
          : [
              'Native logical measurements need separately verified web geometry; no automatic unit conversion.',
            ],
    },
    reactNative: {
      source:
        unit !== 'css-px'
          ? `import {StyleSheet} from 'react-native';\nexport const styles = StyleSheet.create(${serialized});\n`
          : null,
      unsupported:
        unit !== 'css-px'
          ? []
          : [
              'CSS pixel measurements need actual native Text/Yoga facts before native emission.',
            ],
    },
    rendererVerified: false,
  };
}

/** Generate region placements, then reuse the existing energy/Pareto engine.
 * This is a finite slicing-layout family with declared preferences, not a
 * component catalog, globally optimal packing or an aesthetic verifier. */
export function planBento(input: unknown) {
  const r = BentoSchema.parse(input),
    identity = hash({ engine: 'bento-flex-v1', input: r });
  const policies: Policy[] =
    r.regions.length === 1
      ? ['balanced']
      : [
          'balanced',
          r.regions[0]!.areaWeight === undefined ? 'minima' : 'area',
        ];
  const total = domainSize(r.regions.length) * policies.length;
  const pool: {
    id: string;
    tree: BentoFlexNode;
    consequences: ReturnType<typeof consequences>;
    policy: Policy;
  }[] = [];
  const seen = new Set<string>(),
    widths = new Set<number>(),
    heights = new Set<number>();
  let attempted = 0,
    rejected = 0,
    duplicates = 0;
  outer: for (const topology of placementTopologies(r.regions.length)) {
    const min = minima(topology, r.regions, r.gap);
    for (const policy of policies) {
      if (attempted === r.maxEvaluations) break outer;
      widths.add(min.width);
      heights.add(min.height);
      attempted++;
      const tree = place(
        topology,
        { x: 0, y: 0, width: r.width, height: r.height },
        r,
        policy,
      );
      if (!tree) {
        rejected++;
        continue;
      }
      Object.assign(tree.style, { width: r.width, height: r.height });
      const facts = consequences(tree, r),
        key = hash(facts.boxes);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      seen.add(key);
      pool.push({
        id: `bento-${key.slice(0, 16)}`,
        tree,
        consequences: facts,
        policy,
      });
    }
  }
  const complete = attempted === total;
  const provenance = {
    kind: 'calculated' as const,
    source:
      'Finite flex slicing of declared region minima and brief preferences; standard floating-point arithmetic, not renderer observations.',
  };
  const statistics = {
    attempted,
    rejected,
    duplicates,
    distinct: pool.length,
    enumeratedFamilySize: total,
    enumerationComplete: complete,
    selectorCalls: 0,
  };
  const common = {
    version: 1 as const,
    engine: 'bento-flex-v1' as const,
    identity,
    input: r,
    placements: pool,
    statistics,
    thresholds: {
      minimumWidths: [...widths].sort((a, b) => a - b),
      minimumHeights: [...heights].sort((a, b) => a - b),
      scope:
        'Intrinsic minima of visited topologies only; not complete preference or wrapping transition boundaries.',
    },
    obligations: [
      'current content and font measurements',
      'actual flex/Yoga boxes and content preservation',
      'phone/iPad/desktop plus changed text and enlargement',
      'focus/reading order and reduced motion during topology changes',
    ],
    scope:
      'Mathematical candidates for a bounded ordered slicing family. Preference residuals are authored fit, not beauty; no global packing, renderer or aesthetic validation.',
  };
  if (!pool.length)
    return {
      ...common,
      status: complete
        ? ('no-admissible-candidate' as const)
        : ('search-exhausted-without-witness' as const),
      candidates: [],
      program: null,
      search: null,
    };
  const n = pool.length,
    groups = Math.ceil(n / 32),
    within = Math.min(32, n);
  const program: EnergyProgram = {
    version: 1,
    id: 'bento-placement',
    brief: {
      intent:
        'Keep viable region placements under separate declared proportion, allocation, adjacency and whitespace preferences.',
      source: 'Caller supplied BentoInput',
    },
    identity: { ...r.identity, bento: identity },
    variables: [
      {
        id: 'choiceGroup',
        unit: 'index',
        values: Array.from({ length: groups }, (_, i) => i),
      },
      {
        id: 'choiceWithin',
        unit: 'index',
        values: Array.from({ length: within }, (_, i) => i),
      },
    ],
    scenarios: [{ id: 'frame', values: {} }],
    derived: [
      {
        id: 'choiceIndex',
        unit: 'index',
        expression: {
          op: 'add',
          args: [
            { op: 'mul', args: [{ ref: 'choiceGroup' }, 32] },
            { ref: 'choiceWithin' },
          ],
        },
        provenance,
      },
      // Keep semantic readouts bounded within the existing expression-tree limit.
      // Full geometry for every region remains in the placement reference.
      ...r.regions.slice(0, 2).flatMap((region, index) =>
        (['width', 'height'] as const).map((axis) => ({
          id: `${region.id}.${axis}`,
          unit: r.unit,
          expression: lookup(
            pool.map(
              (candidate) => candidate.consequences.boxes[index]!.box[axis],
            ),
          ),
          provenance: {
            ...provenance,
            source: `Calculated ${axis} for region ${region.id}; declared source /input/regions/${index}; not a renderer observation.`,
          },
        })),
      ),
    ],
    factors: [
      {
        id: 'valid-choice',
        expression: { op: 'lt', args: [{ ref: 'choiceIndex' }, n] },
        bands: [{ min: 1, max: 1 }],
        scale: 1,
        weight: 1,
        mode: 'hard',
        category: 'domain',
        provenance,
      },
      ...Object.keys(pool[0]!.consequences.costs).map((name) => ({
        id: name,
        expression: lookup(
          pool.map((candidate) => candidate.consequences.costs[name]!),
        ),
        bands: [{ min: 0, max: 0 }],
        scale: 1,
        weight: 1,
        mode: 'preference' as const,
        category: name,
        provenance,
      })),
    ],
  };
  const search = searchEnergy({
    program,
    options: {
      method: 'exhaustive',
      maxEvaluations: groups * within,
      maxExpressionOperations: 50000000,
      maxFactorObservations: 500000,
      limit: r.limit,
      retention: 'pareto-diverse',
    },
  });
  const candidates = search.candidates.map((evaluation) => {
    const placement =
      pool[
        evaluation.assignment.choiceGroup! * 32 +
          evaluation.assignment.choiceWithin!
      ]!;
    return {
      ...placement,
      evaluation,
      styles: emitBentoStyles(placement.tree, r.unit),
      wireframe:
        r.width <= 10000 && r.height <= 30000
          ? {
              version: 1 as const,
              id: `bento-${hash({ input: identity, candidate: placement.id }).slice(0, 24)}`,
              screen: { width: r.width, height: r.height, unit: r.unit },
              nodes: placement.consequences.boxes.map(({ id, box }) => ({
                id,
                label: id,
                role: 'region' as const,
                evidence: 'proposed' as const,
                box,
              })),
            }
          : null,
    };
  });
  const { program: _duplicateProgram, ...searchReceipt } = search;
  return {
    ...common,
    status: 'proposed' as const,
    candidates,
    program,
    search: searchReceipt,
  };
}
