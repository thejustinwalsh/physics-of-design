import { z } from 'zod';
import { concentricRadius } from './composition-plan.js';
import { hash } from './identity.js';

const length = z.number().finite().min(0).max(1_000_000);
const reference = z.string().min(1).max(1024);
const source = z.array(reference).min(1).max(16);
const id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const fixedSlot = z
  .object({ id, width: length, height: length, source })
  .strict();
const measurement = z
  .object({
    width: length,
    unit: z.enum(['css-px', 'pt', 'dp']),
    textScale: z.number().finite().positive().max(10),
    measurementRef: reference,
    runtimeRef: reference,
    fontRef: reference,
    stateRef: reference,
    contentRef: reference,
    source,
    baselines: z.array(length).max(512).nullable().default(null),
  })
  .strict();
const fontMetrics = z
  .object({
    units: z.literal('font-units'),
    unitsPerEm: length.positive(),
    ascent: z.number().finite(),
    descent: z.number().finite(),
    lineGap: z.number().finite(),
    capHeight: z.number().finite().nullable(),
    xHeight: z.number().finite().nullable(),
    fontRef: reference,
    source,
  })
  .strict();

export const ComponentContractSchema = z
  .object({
    id,
    platform: z.enum(['web', 'native-ios', 'native-android']),
    unit: z.enum(['css-px', 'pt', 'dp']),
    stateRef: reference,
    contentRef: reference,
    viewport: z
      .object({
        width: length.positive(),
        height: length.positive(),
        textScale: z.number().finite().positive().max(10),
      })
      .strict(),
    source,
    availableWidth: length.positive(),
    border: length,
    padding: z.object({ inline: length, top: length, bottom: length }).strict(),
    gaps: z.object({ leading: length, trailing: length }).strict(),
    leading: fixedSlot.nullable().default(null),
    trailing: fixedSlot.nullable().default(null),
    text: z
      .object({
        id,
        fontRef: reference,
        minWidth: length,
        measuredHeight: length.nullable(),
        measurement: measurement.nullable(),
        fontMetrics: fontMetrics.nullable().default(null),
        source,
      })
      .strict(),
    stack: z
      .object({
        gap: length,
        align: z.enum(['start', 'center', 'end']),
        source,
      })
      .strict()
      .nullable()
      .default(null),
    minHitSize: length,
    clipping: z
      .enum(['unknown', 'none', 'border', 'content'])
      .default('unknown'),
    radius: z
      .object({ outerRadius: length, innerInset: length, source })
      .strict()
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((request, ctx) => {
    const requiredUnit = {
      web: 'css-px',
      'native-ios': 'pt',
      'native-android': 'dp',
    }[request.platform];
    if (request.unit !== requiredUnit)
      ctx.addIssue({
        code: 'custom',
        path: ['unit'],
        message: `Use ${requiredUnit} for ${request.platform}; conversion must be explicit before this call`,
      });
    const ids = [
      request.text.id,
      request.leading?.id,
      request.trailing?.id,
    ].filter((value) => value !== undefined);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: 'custom',
        path: ['text', 'id'],
        message: 'Slot IDs must be unique',
      });
    if (
      (request.text.measuredHeight === null) !==
      (request.text.measurement === null)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['text'],
        message:
          'Measured height and its measurement provenance must be supplied together',
      });
    const baselines = request.text.measurement?.baselines;
    if (
      baselines &&
      (baselines.some((value) => value > request.text.measuredHeight!) ||
        baselines.some(
          (value, index) => index > 0 && value < baselines[index - 1]!,
        ))
    )
      ctx.addIssue({
        code: 'custom',
        path: ['text', 'measurement', 'baselines'],
        message:
          'Baseline offsets must be ordered and lie inside the measured text height',
      });
  });
export type ComponentContractInput = z.input<typeof ComponentContractSchema>;
export type ComponentRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ComponentBound = {
  kind: 'derived' | 'unknown' | 'declared-none';
  rect: ComponentRect | null;
  source: string[];
  note: string;
};
const epsilon = 1e-8;
const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
): ComponentRect => ({ x, y, width, height });
const derived = (
  box: ComponentRect,
  source: string[],
  note: string,
): ComponentBound => ({ kind: 'derived', rect: box, source, note });
const unknown = (note: string): ComponentBound => ({
  kind: 'unknown',
  rect: null,
  source: [],
  note,
});

/** Solve allocation only. Renderer measurements remain attributable observations, not solver inventions. */
export function solveComponentContract(input: unknown) {
  const request = ComponentContractSchema.parse(input);
  const {
    border: B,
    padding,
    gaps,
    availableWidth: W,
    leading,
    trailing,
    text,
  } = request;
  const I = leading?.width ?? 0,
    A = trailing?.width ?? 0;
  const G1 = leading ? gaps.leading : 0,
    G2 = trailing ? gaps.trailing : 0;
  const innerWidth = W - 2 * B - 2 * padding.inline;
  const rowTextWidth = innerWidth - I - G1 - G2 - A;
  const requiredRowWidth =
    2 * B + 2 * padding.inline + I + G1 + text.minWidth + G2 + A;
  const rowFits = rowTextWidth >= text.minWidth;
  const topology = rowFits
    ? ('row' as const)
    : request.stack
      ? ('stack' as const)
      : null;
  const textWidth =
    topology === 'row'
      ? rowTextWidth
      : topology === 'stack'
        ? innerWidth
        : null;
  const widthFits =
    topology === 'row' ||
    (topology === 'stack' && innerWidth >= Math.max(text.minWidth, I, A));
  const evidence = text.measurement;
  const identityMatches =
    evidence !== null &&
    evidence.stateRef === request.stateRef &&
    evidence.contentRef === request.contentRef &&
    evidence.fontRef === text.fontRef &&
    evidence.unit === request.unit &&
    evidence.textScale === request.viewport.textScale &&
    (!text.fontMetrics || text.fontMetrics.fontRef === text.fontRef);
  const widthMatches =
    evidence !== null &&
    textWidth !== null &&
    Math.abs(evidence.width - textWidth) <= epsilon;
  const heightKnown = widthFits && identityMatches && widthMatches;
  const Htext = heightKnown ? text.measuredHeight! : null;
  const HI = leading?.height ?? 0,
    HA = trailing?.height ?? 0;
  const slotCount = 1 + Number(leading !== null) + Number(trailing !== null);
  const contentHeight =
    Htext === null
      ? null
      : topology === 'row'
        ? Math.max(HI, Htext, HA)
        : HI + Htext + HA + request.stack!.gap * (slotCount - 1);
  const H =
    contentHeight === null
      ? null
      : 2 * B + padding.top + contentHeight + padding.bottom;
  const status = !widthFits
    ? ('infeasible' as const)
    : H === null
      ? ('needs-measurement' as const)
      : ('solved' as const);
  const reasons = [
    ...(!widthFits
      ? [
          topology === null
            ? 'Row cannot meet text minimum width and no stacked variant is declared.'
            : 'Declared stack cannot contain the minimum text or fixed slot widths.',
        ]
      : []),
    ...(widthFits && evidence === null
      ? ['Text height needs a renderer measurement at the selected allocation.']
      : []),
    ...(widthFits && evidence !== null && !identityMatches
      ? [
          'Text measurement state/content/font/unit/text-scale identity does not match this contract.',
        ]
      : []),
    ...(widthFits && evidence !== null && !widthMatches
      ? [
          `Text height was measured at width ${evidence.width}, not selected width ${textWidth}.`,
        ]
      : []),
  ];
  const originX = B + padding.inline,
    originY = B + padding.top;
  const declarations = [
    ...(leading ? [{ ...leading, semantic: 'leading' as const }] : []),
    {
      id: text.id,
      width: textWidth,
      height: Htext,
      source: text.source,
      semantic: 'text' as const,
    },
    ...(trailing ? [{ ...trailing, semantic: 'trailing' as const }] : []),
  ];
  let nextY = originY;
  const slots = declarations.map((slot) => {
    let box: ComponentRect | null = null;
    if (H !== null && slot.width !== null && slot.height !== null) {
      if (topology === 'row') {
        const x =
          slot.semantic === 'leading'
            ? originX
            : slot.semantic === 'text'
              ? originX + I + G1
              : originX + I + G1 + textWidth! + G2;
        box = rect(
          x,
          originY + (contentHeight! - slot.height) / 2,
          slot.width,
          slot.height,
        );
      } else {
        const align = request.stack!.align;
        const x =
          originX +
          (align === 'start'
            ? 0
            : align === 'center'
              ? (innerWidth - slot.width) / 2
              : innerWidth - slot.width);
        box = rect(x, nextY, slot.width, slot.height);
        nextY += slot.height + request.stack!.gap;
      }
    }
    return {
      ...slot,
      allocation:
        box === null
          ? unknown(
              'Geometry awaits a feasible width and matching text-height evidence.',
            )
          : derived(
              box,
              slot.source,
              'Slot allocation; not painted ink or observed hit bounds.',
            ),
    };
  });
  const borderBounds =
    H === null
      ? unknown('Height is not established.')
      : derived(
          rect(0, 0, W, H),
          request.source,
          'Algebraic border box in component-local coordinates.',
        );
  const contentBounds =
    H === null
      ? unknown('Height is not established.')
      : derived(
          rect(originX, originY, innerWidth, contentHeight!),
          request.source,
          'Inner content allocation after border and padding.',
        );
  const hitBounds =
    H === null
      ? unknown('Hit proposal awaits dimensions.')
      : derived(
          rect(
            (W - Math.max(W, request.minHitSize)) / 2,
            (H - Math.max(H, request.minHitSize)) / 2,
            Math.max(W, request.minHitSize),
            Math.max(H, request.minHitSize),
          ),
          request.source,
          'Proposed centered hit expansion only; runtime hit testing, ancestor clipping and overlap remain unverified.',
        );
  const clipBounds: ComponentBound =
    request.clipping === 'none'
      ? {
          kind: 'declared-none',
          rect: null,
          source: request.source,
          note: 'No local clipping declared; ancestor clipping remains unknown.',
        }
      : request.clipping === 'unknown'
        ? unknown('No clipping contract was supplied.')
        : {
            ...(request.clipping === 'border' ? borderBounds : contentBounds),
            note: `Declared ${request.clipping}-box clipping; actual renderer and ancestor clips remain unverified.`,
          };
  const textSlot = slots.find((slot) => slot.semantic === 'text')!;
  const baselines =
    textSlot.allocation.rect && evidence?.baselines
      ? {
          kind: 'derived-from-observation' as const,
          values: evidence.baselines.map(
            (offset) => textSlot.allocation.rect!.y + offset,
          ),
          measurementRef: evidence.measurementRef,
          source: evidence.source,
        }
      : {
          kind: 'unknown' as const,
          values: null,
          measurementRef: null,
          source: [],
        };
  const uniformInset =
    request.radius === null ? null : B + request.radius.innerInset;
  const radiusFits =
    request.radius === null ||
    H === null ||
    2 * uniformInset! <= Math.min(W, H);
  const radius =
    request.radius === null || H === null || !radiusFits
      ? {
          kind: 'unknown' as const,
          value: null,
          reason:
            request.radius === null
              ? 'No concentric radius binding declared.'
              : H === null
                ? 'Radius binding awaits height.'
                : 'Declared inset leaves no nonnegative inner box.',
        }
      : {
          kind: 'derived' as const,
          value: {
            requestedOuter: request.radius.outerRadius,
            effectiveOuter: Math.min(request.radius.outerRadius, W / 2, H / 2),
            uniformInset: uniformInset!,
            innerBox: rect(
              uniformInset!,
              uniformInset!,
              W - 2 * uniformInset!,
              H - 2 * uniformInset!,
            ),
            innerRadius: concentricRadius(
              Math.min(request.radius.outerRadius, W / 2, H / 2),
              uniformInset!,
              W - 2 * uniformInset!,
              H - 2 * uniformInset!,
            ),
            equation:
              'Ri = min(max(0, min(Ro,W/2,H/2) - (B+inset)), Wi/2, Hi/2)',
            source: request.radius.source,
          },
          reason: null,
        };
  return {
    request,
    status: radiusFits ? status : ('infeasible' as const),
    topology,
    reasons: radiusFits
      ? reasons
      : [...reasons, 'Declared radius inset leaves no nonnegative inner box.'],
    contractRef: `component:${hash({ version: 1, request })}`,
    coordinates: {
      unit: request.unit,
      origin: 'component-border-top-left',
      platform: request.platform,
    },
    dimensions: { width: W, height: H },
    allocation: {
      rowTextWidth,
      requiredRowWidth,
      selectedTextWidth: textWidth,
      innerWidth,
      minimumStackWidth:
        2 * B + 2 * padding.inline + Math.max(text.minWidth, I, A),
    },
    equations: {
      width: {
        symbolic:
          topology === 'stack'
            ? 'W = 2B + 2P + F'
            : 'W = 2B + 2P + I + G1 + F + G2 + A',
        terms: {
          B,
          P: padding.inline,
          I: topology === 'stack' ? 0 : I,
          G1: topology === 'stack' ? 0 : G1,
          F: textWidth,
          G2: topology === 'stack' ? 0 : G2,
          A: topology === 'stack' ? 0 : A,
        },
        residual:
          textWidth === null
            ? null
            : W -
              (2 * B +
                2 * padding.inline +
                textWidth +
                (topology === 'row' ? I + G1 + G2 + A : 0)),
      },
      height: {
        symbolic:
          topology !== 'stack'
            ? 'H = 2B + Pt + max(HI,Htext,HA) + Pb'
            : 'H = 2B + Pt + HI + Htext + HA + stackGap*(slotCount-1) + Pb',
        terms: {
          B,
          Pt: padding.top,
          Pb: padding.bottom,
          HI,
          Htext,
          HA,
          stackGap: topology === 'stack' ? request.stack!.gap : 0,
          slotCount,
        },
        value: H,
      },
    },
    slots,
    bounds: {
      border: borderBounds,
      content: contentBounds,
      paint: unknown(
        'Paint, shadows and glyph ink require renderer observations; allocation is not ink.',
      ),
      hit: hitBounds,
      clip: clipBounds,
    },
    textEvidence: {
      kind:
        evidence && heightKnown
          ? 'caller-supplied-observation'
          : 'unknown-or-stale',
      measurement: evidence,
      fontMetrics: text.fontMetrics,
      baselines,
      ink: unknown(
        'Font global metrics and line boxes do not determine actual glyph ink.',
      ),
    },
    radius,
    constraints: {
      width: widthFits ? 'satisfied' : 'failed',
      textMeasurement: heightKnown ? 'matched' : 'unknown-or-stale',
      radius: radiusFits ? 'no-known-conflict' : 'failed',
    },
    provenance: {
      authored: request.source,
      derived: [
        'docs/adr-001.md#required-component-contract-and-inspection-layer',
      ],
      observed: heightKnown ? evidence!.source : [],
      hypotheses: [],
      unknown: [
        'actual paint/ink bounds',
        'runtime hit testing',
        'ancestor clips',
        'optical alignment',
      ],
    },
    pendingVerification: [
      'Render the selected topology at the recorded viewport/text scale/state/content/font identity.',
      'Compare actual border/content/slot rectangles and baselines with this allocation.',
      'Measure paint/ink, clipping and hit behavior; verify no content loss or target overlap.',
    ],
  };
}
export type ComponentContract = ReturnType<typeof solveComponentContract>;

function escapeXml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]!,
  );
}
function number(value: number) {
  if (!Number.isFinite(value)) throw new Error('SVG geometry must be finite');
  return String(value);
}

/** A projection of solved facts, with unknowns printed rather than fabricated. No filesystem or renderer calls. */
export function componentContractSvg(contract: ComponentContract): string {
  const { width: W, height: H } = contract.dimensions;
  const fontSize = Math.max(10, W / 60),
    margin = fontSize * 5;
  const hit = contract.bounds.hit.rect;
  const minX = Math.min(0, hit?.x ?? 0),
    minY = Math.min(0, hit?.y ?? 0);
  const maxX = Math.max(W, hit ? hit.x + hit.width : W),
    maxY = Math.max(H ?? fontSize * 5, hit ? hit.y + hit.height : 0);
  const drawingHeight = maxY - minY;
  const offsetX = margin - minX,
    offsetY = 2 * margin - minY;
  const viewWidth = maxX - minX + 2 * margin,
    viewHeight = drawingHeight + 6 * margin;
  const label = (x: number, y: number, value: string) =>
    `<text x="${number(x)}" y="${number(y)}" font-size="${number(fontSize)}">${escapeXml(value)}</text>`;
  const draw = (box: ComponentRect, stroke: string, dash = false, radius = 0) =>
    `<rect x="${number(box.x + offsetX)}" y="${number(box.y + offsetY)}" width="${number(box.width)}" height="${number(box.height)}" rx="${number(radius)}" fill="none" stroke="${stroke}"${dash ? ' stroke-dasharray="4 3"' : ''}/>`;
  const elements = [
    label(
      margin,
      margin / 2,
      `${contract.request.id}: ${contract.topology ?? 'no topology'} / ${contract.status}`,
    ),
    label(
      margin,
      margin,
      `W = ${W} ${contract.coordinates.unit}; H = ${H ?? 'unknown'}`,
    ),
  ];
  if (contract.bounds.border.rect)
    elements.push(
      draw(
        contract.bounds.border.rect,
        '#182430',
        false,
        contract.radius.value?.effectiveOuter ?? 0,
      ),
    );
  if (contract.bounds.content.rect)
    elements.push(draw(contract.bounds.content.rect, '#087e8b', true));
  if (contract.bounds.hit.rect)
    elements.push(draw(contract.bounds.hit.rect, '#b76400', true));
  if (contract.radius.value)
    elements.push(
      draw(
        contract.radius.value.innerBox,
        '#a12a68',
        true,
        contract.radius.value.innerRadius,
      ),
    );
  for (const slot of contract.slots)
    if (slot.allocation.rect) {
      elements.push(draw(slot.allocation.rect, '#3265ba'));
      elements.push(
        label(
          slot.allocation.rect.x + offsetX,
          slot.allocation.rect.y + offsetY - 3,
          `${slot.id}: ${slot.width} × ${slot.height}`,
        ),
      );
    }
  if (contract.textEvidence.baselines.values)
    for (const y of contract.textEvidence.baselines.values) {
      const slot = contract.slots.find((slot) => slot.semantic === 'text')!
        .allocation.rect!;
      elements.push(
        `<line x1="${number(slot.x + offsetX)}" x2="${number(slot.x + slot.width + offsetX)}" y1="${number(y + offsetY)}" y2="${number(y + offsetY)}" stroke="#a12a68" stroke-dasharray="2 2"/>`,
      );
    }
  elements.push(
    label(
      margin,
      drawingHeight + 3 * margin,
      contract.equations.width.symbolic,
    ),
  );
  elements.push(
    label(
      margin,
      drawingHeight + 3 * margin + 1.5 * fontSize,
      contract.equations.height.symbolic,
    ),
  );
  const terms = contract.equations.width.terms;
  elements.push(
    label(
      margin,
      drawingHeight + 4 * margin,
      `B=${terms.B}; P=${terms.P}; I=${terms.I}; G1=${terms.G1}; F=${terms.F ?? 'unknown'}; G2=${terms.G2}; A=${terms.A}`,
    ),
  );
  elements.push(
    label(
      margin,
      drawingHeight + 5 * margin,
      'Paint/ink and runtime hit/clip behavior: unverified',
    ),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${number(viewWidth)} ${number(viewHeight)}" role="img" aria-label="${escapeXml(`${contract.request.id} technical allocation drawing`)}"><title>${escapeXml(contract.contractRef)}</title><rect width="100%" height="100%" fill="white"/><g fill="#182430" font-family="monospace">${elements.join('')}</g></svg>`;
}
