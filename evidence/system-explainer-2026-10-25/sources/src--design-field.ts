import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { z } from 'zod';
import type { SelectorExecutionOptions } from './selector.js';
import { hash } from './identity.js';
import { inspectDesignContext } from './design-context.js';
import { BlockSchema } from './state.js';
import { inspectFont, fontAt } from './fonts.js';
import {
  type EnergyProgram,
  type Assignment,
  type Expression,
  type searchEnergy,
} from './energy.js';
import { analyzeEnergy } from './energy-analysis.js';
import {
  DESIGN_FIELD_MOTION_ROLES,
  DESIGN_FIELD_VARIABLE_LABELS,
} from './design-field-vocabulary.js';
import {
  DecisionWorkflowSchema,
  RunDecisionWorkflowSchema,
  runDecisionWorkflow,
  type DecisionWorkflowInput,
} from './decision-workflow.js';

const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const finite = z.number().finite();
const band = z
  .tuple([finite, finite])
  .refine(([a, b]) => a <= b, 'Invalid target band');
const Font = z
  .object({
    file: z.string().min(1).max(4096),
    family: z.string().min(1).max(200),
    weight: finite.min(1).max(1000),
    axes: z.record(z.string().regex(/^[A-Za-z0-9]{4}$/), finite).default({}),
    opticalSizing: z.enum(['auto', 'none']).default('none'),
  })
  .strict();
export const DesignFieldBriefSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
    intent: z.string().min(1).max(2000),
    source: z.string().min(1).max(4096),
    sourceKind: z.enum(['human-brief', 'synthetic-Astra-interview']),
    designContext: z.string().min(1).max(4096).optional(),
    typography: z
      .object({
        titleLeading: finite.min(0.8).max(2),
        titleTrackingEm: finite.min(-0.15).max(0.2),
        bodyTrackingEm: finite.min(-0.05).max(0.15),
      })
      .strict(),
    title: z.string().min(1).max(200),
    body: z.string().min(1).max(1000),
    action: z.string().min(1).max(80),
    titleFont: Font,
    bodyFont: Font,
    image: z
      .object({
        file: z.string().min(1).max(4096),
        source: z.string().min(1).max(2000),
        focalX: finite.min(0).max(1),
        focalY: finite.min(0).max(1),
      })
      .strict(),
    targets: z
      .object({
        hierarchy: band,
        gapRatio: band,
        tension: band,
        imageShare: band,
        roughnessContrast: band,
        motionRole: band,
        imageToTextHeight: band,
        imageToTextHeightByScenario: z
          .partialRecord(
            z.enum([
              'phone',
              'phone-large',
              'ipad',
              'ipad-large',
              'desktop',
              'desktop-large',
            ]),
            band,
          )
          .optional(),
      })
      .strict(),
    weights: z
      .object({
        hierarchy: finite.min(0).max(20),
        reading: finite.min(0).max(20),
        density: finite.min(0).max(20),
        tension: finite.min(0).max(20),
        image: finite.min(0).max(20),
        material: finite.min(0).max(20),
        motion: finite.min(0).max(20),
      })
      .strict(),
  })
  .strict();
export type DesignFieldBrief = z.infer<typeof DesignFieldBriefSchema>;
export const DESIGN_FIELD_DOMAINS = {
  titleSize: [52, 64, 76, 88, 100],
  bodySize: [16, 18, 20],
  contentMax: [900, 1080, 1260],
  gap: [20, 32, 44, 56],
  leading: [1.35, 1.5, 1.65],
  imageAspect: [1.1, 1.4, 1.7, 2],
  imageShare: [0.48, 0.64, 0.8],
  roughness: [0.18, 0.35, 0.55, 0.75],
  motionRole: [0, 1, 2],
  counterRoughness: [0.55, 0.7, 0.85],
} as const;
export const DESIGN_FIELD_SCENARIOS = [
  { id: 'phone', width: 390, height: 844, textScale: 1 },
  { id: 'phone-large', width: 390, height: 844, textScale: 2 },
  { id: 'ipad', width: 834, height: 1194, textScale: 1 },
  { id: 'ipad-large', width: 834, height: 1194, textScale: 2 },
  { id: 'desktop', width: 1440, height: 1000, textScale: 1 },
  { id: 'desktop-large', width: 1440, height: 1000, textScale: 2 },
] as const;
const padding = (width: number) => (width < 600 ? 20 : 36);
const round = (n: number) => Math.round(n * 10000) / 10000;
const measurementPolicy =
  'design-field-text-v2: LTR plain text; declared leading/tracking/axes; title min(size,width*.135)*textScale; body min(contentMax*.55,available,680); natural height';
export function designFieldMeasurementRequests(
  brief: Pick<DesignFieldBrief, 'typography'>,
) {
  return DESIGN_FIELD_SCENARIOS.flatMap((s) => {
    const base = {
      scenario: s.id,
      viewportWidth: s.width,
      viewportHeight: s.height,
      textScale: s.textScale,
    };
    return [
      ...DESIGN_FIELD_DOMAINS.titleSize.flatMap((size) =>
        DESIGN_FIELD_DOMAINS.contentMax.map((column) => ({
          ...base,
          key: `t${size}c${column}`,
          kind: 'title' as const,
          size,
          column,
          leading: brief.typography.titleLeading,
          effectiveSize: Math.min(size, s.width * 0.135) * s.textScale,
          measure: Math.min(column, s.width - 2 * padding(s.width)),
        })),
      ),
      ...DESIGN_FIELD_DOMAINS.bodySize.flatMap((size) =>
        DESIGN_FIELD_DOMAINS.contentMax.flatMap((column) =>
          DESIGN_FIELD_DOMAINS.leading.map((leading) => ({
            ...base,
            key: `b${size}c${column}l${String(leading).replace('.', '_')}`,
            kind: 'body' as const,
            size,
            column,
            leading,
            effectiveSize: size * s.textScale,
            measure: Math.min(
              column * 0.55,
              s.width - 2 * padding(s.width),
              680,
            ),
          })),
        ),
      ),
    ];
  });
}
const Row = z
  .object({
    scenario: z.string(),
    key: z.string(),
    height: finite.nonnegative(),
    width: finite.positive(),
    lines: z.number().int().min(1),
    overflowX: finite.nonnegative(),
    fontLoaded: z.boolean(),
  })
  .strict();
export const DesignFieldMeasurementsSchema = z
  .object({
    version: z.literal(1),
    sourceIdentity: Digest,
    identity: Digest,
    policy: z.literal(measurementPolicy),
    provider: z.enum(['chromium', 'test-fixture']),
    runtime: z.string().min(1),
    sources: z
      .object({
        titleFont: Digest,
        bodyFont: Digest,
        image: Digest,
        briefSource: Digest,
        content: Digest,
      })
      .strict(),
    rows: z.array(Row).min(1).max(1200),
    image: z
      .object({
        width: z.number().int().positive().max(8192),
        height: z.number().int().positive().max(8192),
        meanLuminance: finite.min(0).max(1),
        luminanceStdDev: finite.min(0).max(1),
        sampleCount: z.number().int().min(1).max(4096),
      })
      .strict(),
  })
  .strict();
export type DesignFieldMeasurements = z.infer<
  typeof DesignFieldMeasurementsSchema
>;
const digest = (bytes: Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');
async function sourcesFor(brief: DesignFieldBrief) {
  const [titleFont, bodyFont, image, briefSource] = await Promise.all(
    [
      brief.titleFont.file,
      brief.bodyFont.file,
      brief.image.file,
      brief.source,
    ].map(async (file) => {
      const b = await readFile(file);
      if (b.length > 8 * 1024 * 1024)
        throw new Error('Design field source exceeds8MiB');
      return b;
    }),
  );
  return {
    bytes: { titleFont: titleFont!, bodyFont: bodyFont!, image: image! },
    sources: {
      titleFont: digest(titleFont!),
      bodyFont: digest(bodyFont!),
      image: digest(image!),
      briefSource: digest(briefSource!),
      content: hash({
        title: brief.title,
        body: brief.body,
        action: brief.action,
      }),
    },
  };
}
const sourceIdentity = (
  brief: DesignFieldBrief,
  sources: DesignFieldMeasurements['sources'],
) =>
  hash({
    content: sources.content,
    titleFont: sources.titleFont,
    bodyFont: sources.bodyFont,
    image: sources.image,
    titleFace: brief.titleFont,
    bodyFace: brief.bodyFont,
    typography: brief.typography,
    policy: measurementPolicy,
    scenarios: DESIGN_FIELD_SCENARIOS,
    domains: DESIGN_FIELD_DOMAINS,
  });
/** Real DOM measurements for every independent typography combination; no model or guessed wrapping. */
export async function collectDesignFieldMeasurements(
  input: unknown,
): Promise<DesignFieldMeasurements> {
  const brief = DesignFieldBriefSchema.parse(input),
    source = await sourcesFor(brief);
  for (const [font, text] of [
    [brief.titleFont, brief.title],
    [brief.bodyFont, brief.body],
  ] as const) {
    fontAt(
      BlockSchema.parse({
        id: 'measurement',
        role: 'title',
        text,
        font: {
          file: font.file,
          family: font.family,
          axes: font.axes,
          opticalSizing: font.opticalSizing,
        },
        size: 32,
        weight: font.weight,
        trackingEm: 0,
        leading: 1.5,
        measure: 400,
      }),
    );
    const facts = inspectFont(font.file, text);
    if (facts.glyphCoverage.missing.length)
      throw new Error(
        'Design field requires primary font coverage; fallback is not measured',
      );
  }
  const imageText = source.bytes.image.toString('utf8');
  if (
    !imageText.trimStart().startsWith('<svg') ||
    /\b(?:href|src)\s*=|<script|<foreignObject/i.test(imageText)
  )
    throw new Error(
      'Field fixture requires self-contained SVG without linked resources or scripts',
    );
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (r) => r.abort());
    await page.setContent(
      '<!doctype html><html><head></head><body></body></html>',
    );
    const payload = {
      brief,
      requests: designFieldMeasurementRequests(brief),
      titleFont: source.bytes.titleFont.toString('base64'),
      bodyFont: source.bytes.bodyFont.toString('base64'),
      image: source.bytes.image.toString('base64'),
    };
    const measured = await page.evaluate(async (p) => {
      const style = document.createElement('style');
      style.textContent = `@font-face{font-family:FieldTitle;src:url(data:font/ttf;base64,${p.titleFont});font-weight:${p.brief.titleFont.weight}}@font-face{font-family:FieldBody;src:url(data:font/ttf;base64,${p.bodyFont});font-weight:${p.brief.bodyFont.weight}}`;
      document.head.append(style);
      await Promise.all([
        document.fonts.load(`${p.brief.titleFont.weight} 32px FieldTitle`),
        document.fonts.load(`${p.brief.bodyFont.weight} 20px FieldBody`),
      ]);
      await document.fonts.ready;
      const rows = p.requests.map((r) => {
        const el = document.createElement('div'),
          title = r.kind === 'title',
          weight = title ? p.brief.titleFont.weight : p.brief.bodyFont.weight;
        el.textContent = title ? p.brief.title : p.brief.body;
        el.style.cssText = `font-family:${title ? 'FieldTitle' : 'FieldBody'};font-weight:${weight};font-size:${r.effectiveSize}px;line-height:${r.leading};letter-spacing:${title ? p.brief.typography.titleTrackingEm : p.brief.typography.bodyTrackingEm}em;font-optical-sizing:${title ? p.brief.titleFont.opticalSizing : p.brief.bodyFont.opticalSizing};font-variation-settings:${
          Object.entries(title ? p.brief.titleFont.axes : p.brief.bodyFont.axes)
            .map(([tag, value]) => `"${tag}" ${value}`)
            .join(',') || 'normal'
        };width:${r.measure}px;white-space:normal;overflow-wrap:normal;direction:ltr;box-sizing:content-box;margin:0;padding:0;border:0`;
        document.body.append(el);
        const box = el.getBoundingClientRect(),
          range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()];
        const lines = new Set(rects.map((r) => Math.round(r.top * 64))).size;
        const overflowX = Math.max(
          0,
          ...rects.flatMap((r) => [box.left - r.left, r.right - box.right]),
        );
        const row = {
          scenario: r.scenario,
          key: r.key,
          height: box.height,
          width: box.width,
          lines,
          overflowX,
          fontLoaded: document.fonts.check(
            `${weight} ${r.effectiveSize}px ${title ? 'FieldTitle' : 'FieldBody'}`,
          ),
        };
        el.remove();
        return row;
      });
      const img = new Image();
      img.src = `data:image/svg+xml;base64,${p.image}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext('2d')!;
      context.drawImage(img, 0, 0, 32, 32);
      const data = context.getImageData(0, 0, 32, 32).data;
      let sum = 0,
        sq = 0;
      for (let i = 0; i < data.length; i += 4) {
        const channels = [data[i]!, data[i + 1]!, data[i + 2]!].map((v) => {
          const s = v / 255;
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        const l =
          0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
        sum += l;
        sq += l * l;
      }
      const mean = sum / 1024;
      return {
        rows,
        image: {
          width: img.naturalWidth,
          height: img.naturalHeight,
          meanLuminance: mean,
          luminanceStdDev: Math.sqrt(Math.max(0, sq / 1024 - mean * mean)),
          sampleCount: 1024,
        },
      };
    }, payload);
    const base = {
      version: 1 as const,
      sourceIdentity: sourceIdentity(brief, source.sources),
      policy: measurementPolicy,
      provider: 'chromium' as const,
      runtime: `Chromium ${browser.version()}`,
      sources: source.sources,
      ...measured,
    };
    return DesignFieldMeasurementsSchema.parse({
      ...base,
      identity: hash(base),
    });
  } finally {
    await browser.close();
  }
}
const ref = (name: string): Expression => ({ ref: name });
const op = (
  name: 'add' | 'sub' | 'mul' | 'div' | 'min' | 'max' | 'abs' | 'lte' | 'if',
  ...args: Expression[]
): Expression => ({ op: name, args });
const sum = (terms: Expression[]): Expression =>
  terms.length <= 16
    ? op('add', ...terms)
    : sum(
        Array.from({ length: Math.ceil(terms.length / 16) }, (_, i) =>
          op('add', ...terms.slice(i * 16, i * 16 + 16)),
        ),
      );
const eq = (name: string, value: number) =>
  op('min', op('lte', ref(name), value), op('lte', value, ref(name)));
const p = (
  source: string,
  kind: 'brief' | 'calculated' | 'hypothesis' = 'brief',
) => ({ kind, source });
function validateMeasurements(brief: DesignFieldBrief, input: unknown) {
  const m = DesignFieldMeasurementsSchema.parse(input),
    { identity, ...base } = m;
  if (hash(base) !== identity)
    throw new Error('Measurement integrity mismatch');
  if (sourceIdentity(brief, m.sources) !== m.sourceIdentity)
    throw new Error(
      'Measurements do not bind current text/fonts/domains/scenarios',
    );
  if (
    m.sources.content !==
    hash({ title: brief.title, body: brief.body, action: brief.action })
  )
    throw new Error('Measurement content changed');
  const expected = designFieldMeasurementRequests(brief);
  if (m.rows.length !== expected.length)
    throw new Error('Incomplete typography measurement matrix');
  const rows = new Map(m.rows.map((r) => [`${r.scenario}:${r.key}`, r]));
  if (rows.size !== m.rows.length)
    throw new Error('Duplicate typography measurement');
  for (const req of expected) {
    const row = rows.get(`${req.scenario}:${req.key}`);
    if (!row || Math.abs(row.width - req.measure) > 0.05 || !row.fontLoaded)
      throw new Error('Missing or mismatched measured typography cell');
  }
  return m;
}
export const DesignFieldRunSchema = z
  .object({
    brief: DesignFieldBriefSchema,
    measurements: DesignFieldMeasurementsSchema,
    selector: RunDecisionWorkflowSchema.shape.selector,
    recipe: RunDecisionWorkflowSchema.shape.recipe,
    mode: z.enum(['search', 'replay']).default('search'),
  })
  .strict();
export function compileDesignField(input: {
  brief: unknown;
  measurements: unknown;
  selection?: 'mathematical' | 'local-selector';
  designContextIdentity?: string;
}) {
  const brief = DesignFieldBriefSchema.parse(input.brief),
    measurements = validateMeasurements(brief, input.measurements),
    selection = input.selection ?? 'mathematical';
  if (brief.designContext && !input.designContextIdentity)
    throw new Error(
      'Inspect the declared design context before compiling this field',
    );
  const commonIdentity = {
    designContext: input.designContextIdentity ?? 'none',
    measurement: measurements.identity,
    source: measurements.sourceIdentity,
    briefSource: measurements.sources.briefSource,
    compiler: 'design-field-v1',
  };
  const readingNames = [
    'titleSize',
    'bodySize',
    'contentMax',
    'gap',
    'leading',
  ] as const;
  const rows = designFieldMeasurementRequests(brief).filter(
    (r) => r.scenario === 'phone',
  );
  const lookup = (
    kind: 'title' | 'body',
    field: 'height' | 'lines' | 'overflowX',
  ) =>
    sum(
      rows
        .filter((r) => r.kind === kind)
        .map((r) =>
          op(
            'mul',
            eq(kind === 'title' ? 'titleSize' : 'bodySize', r.size),
            eq('contentMax', r.column),
            ...(kind === 'body' ? [eq('leading', r.leading)] : []),
            ref(`${r.key}_${field}`),
          ),
        ),
    );
  const derived = (
    id: string,
    expression: Expression,
    unit: string,
    source: string,
    kind: 'brief' | 'calculated' | 'hypothesis' = 'calculated',
  ) => ({ id, expression, unit, provenance: p(source, kind) });
  const factor = (
    id: string,
    expression: Expression,
    bounds: readonly [number, number],
    scale: number,
    weight: number,
    category: string,
    source: string,
    mode: 'hard' | 'preference' = 'preference',
  ) => ({
    id,
    expression,
    bands: [{ min: bounds[0], max: bounds[1] }],
    scale,
    weight,
    category,
    mode,
    provenance: p(source, mode === 'hard' ? 'calculated' : 'brief'),
  });
  const reading: EnergyProgram = {
    version: 1,
    id: 'field-reading',
    brief: { intent: brief.intent, source: brief.source },
    identity: commonIdentity,
    variables: readingNames.map((id) => ({
      id,
      label: DESIGN_FIELD_VARIABLE_LABELS[id],
      values: [...DESIGN_FIELD_DOMAINS[id]],
      unit: id === 'leading' ? 'ratio' : 'px',
    })),
    scenarios: DESIGN_FIELD_SCENARIOS.map((s) => ({
      id: s.id,
      values: {
        viewport: s.width,
        height: s.height,
        textScale: s.textScale,
        padding: padding(s.width),
        actionBudget: s.height * (s.textScale === 1 ? 0.98 : 1.8),
        ...Object.fromEntries(
          measurements.rows
            .filter((r) => r.scenario === s.id)
            .flatMap((r) =>
              ['height', 'lines', 'overflowX'].map((field) => [
                `${r.key}_${field}`,
                r[field as 'height' | 'lines' | 'overflowX'],
              ]),
            ),
        ),
      },
    })),
    derived: [
      derived(
        'titleHeight',
        lookup('title', 'height'),
        'px',
        'Actual DOM candidate table; same source font/content and declared scenario',
      ),
      derived(
        'bodyHeight',
        lookup('body', 'height'),
        'px',
        'Actual DOM candidate table',
      ),
      derived(
        'titleLines',
        lookup('title', 'lines'),
        'lines',
        'Actual DOM Range line groups',
      ),
      derived(
        'bodyLines',
        lookup('body', 'lines'),
        'lines',
        'Actual DOM Range line groups',
      ),
      derived(
        'overflow',
        op('max', lookup('title', 'overflowX'), lookup('body', 'overflowX')),
        'px',
        'Actual DOM Range horizontal overflow',
      ),
      derived(
        'effectiveTitle',
        op(
          'mul',
          op('min', ref('titleSize'), op('mul', ref('viewport'), 0.135)),
          ref('textScale'),
        ),
        'px',
        'Authored responsive title envelope',
      ),
      derived(
        'hierarchy',
        op(
          'div',
          ref('effectiveTitle'),
          op('mul', ref('bodySize'), ref('textScale')),
        ),
        'ratio',
        'Computed title/body ratio',
      ),
      derived(
        'gapRatio',
        op('div', ref('gap'), ref('bodySize')),
        'ratio',
        'Gap relative to body text',
      ),
      derived(
        'charactersPerLine',
        op('div', Array.from(brief.body).length, ref('bodyLines')),
        'characters/line',
        'Actual content length divided by measured line count; not a universal readability score',
      ),
      derived(
        'ctaBottom',
        op(
          'add',
          ref('padding'),
          ref('titleHeight'),
          ref('bodyHeight'),
          op('mul', ref('gap'), 2),
          44,
        ),
        'px',
        'Natural text height; task action before image',
      ),
      derived(
        'actionSlack',
        op('sub', ref('actionBudget'), ref('ctaBottom')),
        'px',
        'Authored first-action reach envelope',
      ),
    ],
    factors: [
      factor(
        'primary-font-and-wrap',
        ref('overflow'),
        [0, 0.75],
        1,
        1,
        'rendering',
        'Measured candidate text overflow tolerance; not whole composition verification',
        'hard',
      ),
      factor(
        'action-reach',
        ref('actionSlack'),
        [0, 5000],
        100,
        1,
        'task',
        'Authored action reach, enlarged text allowed additional vertical scroll',
        'hard',
      ),
      factor(
        'type-hierarchy',
        ref('hierarchy'),
        brief.targets.hierarchy,
        1,
        brief.weights.hierarchy,
        'hierarchy',
        brief.source,
      ),
      factor(
        'reading-density',
        op('mul', ref('charactersPerLine'), ref('textScale')),
        [40, 76],
        16,
        brief.weights.reading,
        'reading',
        'Authored reading preference, actual line count',
      ),
      factor(
        'spatial-rhythm',
        ref('gapRatio'),
        brief.targets.gapRatio,
        0.7,
        brief.weights.density,
        'density',
        brief.source,
      ),
      factor(
        'headline-wrap',
        op('div', ref('titleLines'), ref('textScale')),
        [1, 2.4],
        1,
        0.6,
        'hierarchy',
        'Authored headline emphasis; line breaks measured, preference subjective',
      ),
    ],
  };
  const expressionNames = [
    'imageAspect',
    'imageShare',
    'roughness',
    'counterRoughness',
    'motionRole',
  ] as const;
  const expression: EnergyProgram = {
    version: 1,
    id: 'field-expression',
    brief: { intent: brief.intent, source: brief.source },
    identity: commonIdentity,
    variables: expressionNames.map((id) => ({
      id,
      label: DESIGN_FIELD_VARIABLE_LABELS[id],
      values: [...DESIGN_FIELD_DOMAINS[id]],
      unit: id === 'motionRole' ? 'role-index' : 'ratio',
      ...(id === 'motionRole'
        ? {
            valueAliases: DESIGN_FIELD_MOTION_ROLES.map((label, value) => ({
              value,
              label,
            })),
          }
        : {}),
    })),
    scenarios: DESIGN_FIELD_SCENARIOS.map((s) => ({
      id: s.id,
      values: {
        viewport: s.width,
        height: s.height,
        textScale: s.textScale,
        padding: padding(s.width),
        titleSize: 76,
        bodySize: 18,
        contentMax: 1080,
        gap: 32,
        leading: 1.5,
        sourceAspect: measurements.image.width / measurements.image.height,
        ...Object.fromEntries(
          measurements.rows
            .filter((r) => r.scenario === s.id)
            .flatMap((r) =>
              ['height', 'lines', 'overflowX'].map((field) => [
                `${r.key}_${field}`,
                r[field as 'height' | 'lines' | 'overflowX'],
              ]),
            ),
        ),
      },
    })),
    derived: [
      derived(
        'available',
        op(
          'min',
          ref('contentMax'),
          op('sub', ref('viewport'), op('mul', ref('padding'), 2)),
        ),
        'px',
        'Responsive content cap',
      ),
      derived(
        'imageWidth',
        op('mul', ref('available'), ref('imageShare')),
        'px',
        'Asymmetric image share; text layout is independent',
      ),
      derived(
        'imageHeight',
        op('div', ref('imageWidth'), ref('imageAspect')),
        'px',
        'Cover frame',
      ),
      derived(
        'cropRetention',
        op(
          'min',
          op('div', ref('imageAspect'), ref('sourceAspect')),
          op('div', ref('sourceAspect'), ref('imageAspect')),
        ),
        'area-fraction',
        'Geometric cover retention; no subject detector',
      ),
      derived(
        'titleHeight',
        lookup('title', 'height'),
        'px',
        'Selected candidate actual browser text table',
      ),
      derived(
        'bodyHeight',
        lookup('body', 'height'),
        'px',
        'Selected candidate actual browser text table',
      ),
      derived(
        'imageToTextHeight',
        op(
          'div',
          ref('imageHeight'),
          op('add', ref('titleHeight'), ref('bodyHeight'), ref('gap')),
        ),
        'ratio',
        'Rendered image frame height divided by measured title/body stack height',
      ),
      derived(
        'tension',
        op('abs', op('sub', op('mul', 2, ref('imageShare')), 1)),
        'imbalance-fraction',
        'Geometric left/right allocation imbalance abs(2*imageShare-1); target is an authored preference',
      ),
      derived(
        'materialContrast',
        op('abs', op('sub', ref('roughness'), ref('counterRoughness'))),
        'roughness-difference',
        'Difference between two declared PBR roughness values; not perceived contrast',
      ),
    ],
    factors: [
      factor(
        'image-retention',
        ref('cropRetention'),
        [0.6, 1],
        0.1,
        1,
        'media',
        'Geometric lower crop-retention bound; focal-subject review remains pending',
        'hard',
      ),
      factor(
        'image-dominance',
        ref('imageShare'),
        brief.targets.imageShare,
        0.16,
        brief.weights.image,
        'composition',
        brief.source,
      ),
      factor(
        'deliberate-tension',
        ref('tension'),
        brief.targets.tension,
        0.1,
        brief.weights.tension,
        'tension',
        brief.source,
      ),
      factor(
        'material-counterpoint',
        ref('materialContrast'),
        brief.targets.roughnessContrast,
        0.2,
        brief.weights.material,
        'material',
        brief.source,
      ),
      factor(
        'motion-role',
        ref('motionRole'),
        brief.targets.motionRole,
        1,
        brief.weights.motion,
        'motion',
        brief.source,
      ),
      {
        ...factor(
          'image-type-counterpoint',
          ref('imageToTextHeight'),
          brief.targets.imageToTextHeight,
          0.4,
          brief.weights.image,
          'coupling',
          'Authored visual scale ratio between image frame and measured text stack',
        ),
        ...(brief.targets.imageToTextHeightByScenario
          ? {
              scenarioBands: Object.fromEntries(
                Object.entries(brief.targets.imageToTextHeightByScenario).map(
                  ([id, bounds]) => [id, [{ min: bounds[0], max: bounds[1] }]],
                ),
              ),
            }
          : {}),
      },
    ],
  };
  const stages = [
    {
      id: 'reading',
      purpose:
        'Choose actual measured typography, measure and rhythm under phone/iPad/desktop task constraints',
      dependsOn: [],
      bindings: [],
      contextKeys: ['direction'],
      program: reading,
      options: {
        method: 'exhaustive',
        maxEvaluations: 1000,
        maxExpressionOperations: 50000000,
        maxFactorObservations: 1000000,
        limit: 6,
        retention: 'pareto-diverse',
      },
      lookahead: {
        successors: ['expression'],
        maxBranches: 6,
        maxEvaluations: 3000,
        maxFactorObservations: 250000,
        maxExpressionOperations: 15000000,
        completion: 'require',
        parentTies: 'prefer-successor-targets',
      },
      selection,
      question:
        'Choose a bold readable type/space alternative for this synthetic brief. Compare the supplied successor witnesses: some equally ranked reading choices let image/finish/motion satisfy all authored targets, while others retain explicit scenario violations. Prefer a jointly satisfied continuation when these reading costs are identical, unless the stated art direction supplies a reason otherwise. Hard completion is required; preference guidance remains revisable. This is uncalibrated model judgment, not renderer or preference verification.',
      provenance: p(brief.source),
    },
    {
      id: 'expression',
      purpose:
        'Condition image, finish and motion roles on the selected type hierarchy, preserving deliberate nonzero tension',
      dependsOn: ['reading'],
      bindings: readingNames.map((variable) => ({
        input: variable,
        stage: 'reading',
        variable,
      })),
      contextKeys: ['direction'],
      program: expression,
      options: {
        method: 'exhaustive',
        maxEvaluations: 1000,
        maxExpressionOperations: 50000000,
        maxFactorObservations: 1000000,
        limit: 6,
        retention: 'pareto-diverse',
      },
      selection,
      question:
        'Choose among retained image/finish/motion alternatives, weighing their individual scenario tradeoffs against this synthetic brief. Equal cost vectors leave art direction underdetermined. A target band can remain unreachable under the chosen reading layout; do not call mathematical admissibility target satisfaction. This is uncalibrated model judgment, not a universal beauty score or appearance verification.',
      provenance: p(brief.source),
    },
  ];
  const workflow = DecisionWorkflowSchema.parse({
    version: 1,
    id: brief.id,
    context: { direction: brief.intent },
    stages,
    budgets: {
      maxEvaluations: 5000,
      maxGraphNodes: 5000,
      maxFactorObservations: 2250000,
      maxExpressionOperations: 115000000,
      maxSelectorCalls: 2,
      maxReadoutPasses: 2,
    },
  });
  return { brief, measurements, workflow };
}
export type DesignFieldLedgerEntry = {
  command: string;
  function: string;
  inputHash: string;
  resultHash: string;
  evidenceKind: string;
  runtime: string;
  elapsedMs: number;
};
/** Finite math remains the inner loop. Only the two retained frontiers may invoke the pinned local selector. */
export async function runDesignField(
  input: z.input<typeof DesignFieldRunSchema>,
  execution: SelectorExecutionOptions = {},
): Promise<DesignFieldSession> {
  execution.signal?.throwIfAborted();
  const r = DesignFieldRunSchema.parse(input),
    source = await sourcesFor(r.brief);
  if (hash(source.sources) !== hash(r.measurements.sources))
    throw new Error(
      'Current source bytes/content do not match measured field inputs; recollect before search/replay',
    );
  if (r.selector && r.measurements.provider !== 'chromium')
    throw new Error(
      'Real selector field runs require actual browser input measurements',
    );
  const ledger: DesignFieldLedgerEntry[] = [];
  let contextIdentity: string | undefined;
  if (r.brief.designContext) {
    const contextInput = { file: r.brief.designContext };
    const t = performance.now();
    const context = await inspectDesignContext(contextInput);
    if (context.status !== 'found')
      throw new Error('Declared design context is missing');
    contextIdentity = context.sha256;
    ledger.push({
      command: 'context inspect',
      function: 'inspectDesignContext',
      inputHash: hash(contextInput),
      resultHash: hash(context),
      evidenceKind: 'authored-design-contract-byte-identity',
      runtime: 'Node',
      elapsedMs: round(performance.now() - t),
    });
  }
  const c = compileDesignField({
    ...r,
    selection: r.selector ? 'local-selector' : 'mathematical',
    ...(contextIdentity ? { designContextIdentity: contextIdentity } : {}),
  });
  const request: DecisionWorkflowInput = {
    workflow: c.workflow,
    mode: r.mode,
    ...(r.selector ? { selector: r.selector } : {}),
    ...(r.recipe ? { recipe: r.recipe } : {}),
  };
  const started = performance.now(),
    result = await runDecisionWorkflow(request, undefined, execution);
  ledger.push({
    command: 'decision run',
    function: 'runDecisionWorkflow',
    inputHash: hash(request),
    resultHash: hash(result),
    evidenceKind: r.selector
      ? 'numeric-search-and-local-selector'
      : 'numeric-search',
    runtime: 'Node; design-decision-workflow-v1',
    elapsedMs: round(performance.now() - started),
  });
  const analyses: Record<string, ReturnType<typeof analyzeEnergy>> = {};
  for (const stage of c.workflow.stages) {
    const selected = result.stages[stage.id];
    if (!selected?.assignment) continue;
    const program = structuredClone(stage.program);
    for (const binding of stage.bindings)
      for (const scenario of program.scenarios)
        scenario.values[binding.input] =
          result.stages[binding.stage]!.assignment![binding.variable]!;
    const analysisInput = { program, assignment: selected.assignment };
    const t = performance.now();
    analyses[stage.id] = analyzeEnergy(analysisInput);
    for (const effect of analyses[stage.id]!.effects)
      if (effect.variable === 'motionRole') effect.negativeEnergySlope = null;
    ledger.push({
      command: 'energy analyze',
      function: 'analyzeEnergy',
      inputHash: hash(analysisInput),
      resultHash: hash(analyses[stage.id]),
      evidenceKind: 'finite-difference-mathematics',
      runtime: 'Node; energy-v1',
      elapsedMs: round(performance.now() - t),
    });
  }
  const tokens = {
    ...result.stages.reading?.assignment,
    ...result.stages.expression?.assignment,
  };
  return {
    version: 1 as const,
    identity: hash({ workflow: c.workflow, recipe: result.recipe }),
    brief: c.brief,
    measurements: c.measurements,
    workflow: result,
    programs: c.workflow.stages.map((s) => s.program),
    analyses,
    tokens,
    ledger,
    rendererVerification: 'pending' as const,
    scope:
      'Source-bound typography tables are measured. Coupled full compositions and material/motion appearance remain unrendered until finalist verification. Preference pressures are dimensionless authored tradeoffs, not physical forces or beauty.',
  };
}
export interface DesignFieldSession {
  version: 1;
  identity: string;
  brief: DesignFieldBrief;
  measurements: DesignFieldMeasurements;
  workflow: Awaited<ReturnType<typeof runDecisionWorkflow>>;
  programs: EnergyProgram[];
  analyses: Record<string, ReturnType<typeof analyzeEnergy>>;
  tokens: Assignment;
  ledger: DesignFieldLedgerEntry[];
  rendererVerification: 'pending';
  scope: string;
}
/** Compare actual factor work at finite neighbours, retaining opposed effects instead of hiding them in a total. */
export function designFieldStageView(session: DesignFieldSession, id: string) {
  const stage = session.workflow.stages[id],
    analysis = session.analyses[id];
  if (!stage || !analysis) return null;
  const base = analysis.baseline;
  const search = (
    stage.evidence as { search?: ReturnType<typeof searchEnergy> } | null
  )?.search;
  return {
    id,
    status: stage.status,
    assignment: stage.assignment,
    energy: base.energy,
    hardFailures: base.hardFailures,
    factors: base.factors,
    retention: search?.retention ?? null,
    alternatives: stage.alternatives.map((a) => ({
      id: a.id,
      assignment: a.assignment,
      energy: a.energy,
      hardFailures: a.hardFailures,
      factors: a.factors,
      rendererVerification: 'pending',
    })),
    pressures: analysis.effects,
    work: stage.alternatives.map((a) => ({
      alternative: a.id,
      totalPreferenceChange: a.energy - base.energy,
      factors: a.factors
        .map((f, i) => ({
          id: f.id,
          scenario: f.scenario,
          energyChange: f.energy - base.factors[i]!.energy,
          valueChange: f.value - base.factors[i]!.value,
        }))
        .filter((f) => Math.abs(f.energyChange) > 1e-8),
    })),
  };
}
export const DesignFieldValidateSchema = z
  .object({
    brief: DesignFieldBriefSchema,
    measurements: DesignFieldMeasurementsSchema,
    tokens: z.record(z.string(), finite),
  })
  .strict();
/** Receipt identity calculation only; a digest is not proof that rendering occurred.
 * The full normalized brief deliberately invalidates on provenance edits as well
 * as rendering edits. Measurement identity binds the compared reference table.
 */
export function designFieldValidationIdentity(
  input: z.input<typeof DesignFieldValidateSchema>,
  runtime: string,
) {
  const r = DesignFieldValidateSchema.parse(input);
  return hash({
    validator: 'design-field-finalist-v2',
    brief: r.brief,
    measurements: r.measurements.identity,
    sources: r.measurements.sources,
    tokens: r.tokens,
    scenarios: DESIGN_FIELD_SCENARIOS,
    runtime: z.string().min(1).parse(runtime),
  });
}
/** Layout-only verification of the exact generated finalist fixture; not a certificate for the surrounding gallery. */
export async function validateDesignFieldFinalist(
  input: z.input<typeof DesignFieldValidateSchema>,
) {
  const r = DesignFieldValidateSchema.parse(input),
    source = await sourcesFor(r.brief);
  validateMeasurements(r.brief, r.measurements);
  if (hash(source.sources) !== hash(r.measurements.sources))
    throw new Error('Finalist sources changed');
  for (const [key, values] of Object.entries(DESIGN_FIELD_DOMAINS))
    if (!(values as readonly number[]).includes(r.tokens[key]!))
      throw new Error(`Invalid finalist token ${key}`);
  if (Object.keys(r.tokens).length !== Object.keys(DESIGN_FIELD_DOMAINS).length)
    throw new Error('Finalist must specify exactly the field tokens');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => route.abort());
    const scenarios = [];
    for (const s of DESIGN_FIELD_SCENARIOS) {
      await page.setViewportSize({ width: s.width, height: s.height });
      await page.setContent(
        '<!doctype html><html><head></head><body></body></html>',
      );
      const receipt = await page.evaluate(
        async ({ brief, tokens: t, s, titleFont, bodyFont, image }) => {
          const pad = s.width < 600 ? 20 : 36,
            available = Math.min(t.contentMax!, s.width - pad * 2),
            style = document.createElement('style');
          style.textContent = `@font-face{font-family:FieldTitle;src:url(data:font/ttf;base64,${titleFont});font-weight:${brief.titleFont.weight}}@font-face{font-family:FieldBody;src:url(data:font/ttf;base64,${bodyFont});font-weight:${brief.bodyFont.weight}}*{box-sizing:border-box}body{margin:0;background:#f3f1e8;color:#17201b}main{width:${available}px;margin:auto;padding-top:${pad}px}h1,p{padding:0;margin:0}h1{font:${brief.titleFont.weight} ${Math.min(t.titleSize!, s.width * 0.135) * s.textScale}px/${brief.typography.titleLeading} FieldTitle;letter-spacing:${brief.typography.titleTrackingEm}em;font-optical-sizing:${brief.titleFont.opticalSizing};font-variation-settings:${
            Object.entries(brief.titleFont.axes)
              .map(([tag, value]) => `"${tag}" ${value}`)
              .join(',') || 'normal'
          }}p{font:${brief.bodyFont.weight} ${t.bodySize! * s.textScale}px/${t.leading} FieldBody;letter-spacing:${brief.typography.bodyTrackingEm}em;font-optical-sizing:${brief.bodyFont.opticalSizing};font-variation-settings:${
            Object.entries(brief.bodyFont.axes)
              .map(([tag, value]) => `"${tag}" ${value}`)
              .join(',') || 'normal'
          };width:${Math.min(t.contentMax! * 0.55, available, 680)}px;margin-top:${t.gap}px}button{display:block;margin-top:${t.gap}px;min-height:44px;padding:8px 16px;font:16px FieldBody}img{display:block;width:${available * t.imageShare!}px;aspect-ratio:${t.imageAspect};object-fit:cover;object-position:${brief.image.focalX * 100}% ${brief.image.focalY * 100}%;margin-top:${t.gap}px}`;
          document.head.append(style);
          const main = document.createElement('main');
          for (const [tag, text] of [
            ['h1', brief.title],
            ['p', brief.body],
            ['button', brief.action],
          ]) {
            const el = document.createElement(tag!);
            el.textContent = text!;
            main.append(el);
          }
          const img = new Image();
          img.src = `data:image/svg+xml;base64,${image}`;
          img.alt = 'Original still life';
          main.append(img);
          document.body.append(main);
          await Promise.all([
            document.fonts.load(`${brief.titleFont.weight} 32px FieldTitle`),
            document.fonts.load(`${brief.bodyFont.weight} 20px FieldBody`),
            img.decode(),
          ]);
          await document.fonts.ready;
          const box = (el: Element) => {
            const b = el.getBoundingClientRect();
            return {
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
              right: b.right,
              bottom: b.bottom,
            };
          };
          const title = box(main.querySelector('h1')!),
            body = box(main.querySelector('p')!),
            action = box(main.querySelector('button')!),
            media = box(img);
          return {
            scenario: s.id,
            viewport: s,
            title,
            body,
            action,
            image: media,
            overflowX: Math.max(
              0,
              document.documentElement.scrollWidth - s.width,
            ),
            imageLoaded: img.complete && img.naturalWidth > 0,
            fontLoaded:
              document.fonts.check(
                `${brief.titleFont.weight} 32px FieldTitle`,
              ) &&
              document.fonts.check(`${brief.bodyFont.weight} 20px FieldBody`),
          };
        },
        {
          brief: r.brief,
          tokens: r.tokens,
          s,
          titleFont: source.bytes.titleFont.toString('base64'),
          bodyFont: source.bytes.bodyFont.toString('base64'),
          image: source.bytes.image.toString('base64'),
        },
      );
      const titleKey = `t${r.tokens.titleSize}c${r.tokens.contentMax}`,
        bodyKey = `b${r.tokens.bodySize}c${r.tokens.contentMax}l${String(r.tokens.leading).replace('.', '_')}`,
        title = r.measurements.rows.find(
          (row) => row.scenario === s.id && row.key === titleKey,
        )!,
        body = r.measurements.rows.find(
          (row) => row.scenario === s.id && row.key === bodyKey,
        )!;
      const checks = {
        horizontalContainment: receipt.overflowX <= 0.75,
        typographyMatchesTable:
          Math.abs(receipt.title.height - title.height) <= 0.75 &&
          Math.abs(receipt.body.height - body.height) <= 0.75,
        actionReach:
          receipt.action.bottom <=
          s.height * (s.textScale === 1 ? 0.98 : 1.8) + 0.75,
        contentLoaded: receipt.imageLoaded && receipt.fontLoaded,
      };
      scenarios.push({
        ...receipt,
        checks,
        passed: Object.values(checks).every(Boolean),
      });
    }
    const runtime = `Chromium ${browser.version()}`;
    return {
      identity: designFieldValidationIdentity(r, runtime),
      runtime,
      status: scenarios.every((s) => s.passed)
        ? ('passed' as const)
        : ('failed' as const),
      scenarios,
      scope:
        'Exact field finalist typography/image/action fixture only; layout and source loading verified. Whole gallery, native, physical devices, accessibility, material appearance and motion choreography require separate evidence.',
    };
  } finally {
    await browser.close();
  }
}
