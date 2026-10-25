import { z } from 'zod';
import type { DesignState } from './state.js';
const finite = z.number().finite();
export const ResponsiveSchema = z
  .object({
    source: z.string().min(1),
    anchors: z
      .array(
        z
          .object({
            width: finite.positive().max(10000),
            padding: finite.nonnegative().max(500),
            gapScale: finite.nonnegative().max(4),
            contentMaxWidth: finite.positive().max(10000),
            pattern: z.enum(['stack', 'split']).default('stack'),
            blocks: z.record(
              z.string(),
              z
                .object({
                  sizeScale: finite.min(0.1).max(4).default(1),
                  leadingDelta: finite.min(-0.5).max(2).default(0),
                  trackingDelta: finite.min(-0.1).max(0.1).default(0),
                  measureScale: finite.min(0.1).max(4).default(1),
                })
                .strict(),
            ),
          })
          .strict(),
      )
      .min(2)
      .max(8),
    split: z
      .object({
        titleMinWidth: finite.positive(),
        textMinWidth: finite.positive(),
        gap: finite.nonnegative(),
      })
      .strict()
      .default({ titleMinWidth: 240, textMinWidth: 360, gap: 40 }),
  })
  .strict()
  .superRefine((r, ctx) => {
    for (let i = 1; i < r.anchors.length; i++)
      if (r.anchors[i]!.width <= r.anchors[i - 1]!.width)
        ctx.addIssue({
          code: 'custom',
          message: 'responsive anchors must have strictly increasing widths',
        });
  });

/** Pure JSON resolver shared by generated React and native output. Scales never cancel user text enlargement. */
export function resolveLayout(input: DesignState, systemFontScale = 1) {
  const state: DesignState = JSON.parse(JSON.stringify(input));
  const r = state.responsive;
  let pattern: 'stack' | 'split' = 'stack',
    maxWidth = state.viewport.width,
    splitGap = 0;
  const notes: string[] = [];
  if (r) {
    const anchors = r.anchors,
      width = state.viewport.width;
    let lower = anchors[0]!,
      upper = anchors[0]!;
    for (const anchor of anchors) {
      if (anchor.width <= width) lower = anchor;
      if (anchor.width >= width) {
        upper = anchor;
        break;
      }
      upper = anchor;
    }
    if (width <= anchors[0]!.width) lower = upper = anchors[0]!;
    const t =
      upper.width === lower.width
        ? 0
        : Math.max(
            0,
            Math.min(1, (width - lower.width) / (upper.width - lower.width)),
          );
    const mix = (a: number, b: number) => a + (b - a) * t;
    state.padding = mix(lower.padding, upper.padding);
    maxWidth = mix(lower.contentMaxWidth, upper.contentMaxWidth);
    state.gaps = state.gaps.map((g) => g * mix(lower.gapScale, upper.gapScale));
    for (const block of state.blocks) {
      const a = lower.blocks[block.id] ?? {
          sizeScale: 1,
          leadingDelta: 0,
          trackingDelta: 0,
          measureScale: 1,
        },
        b = upper.blocks[block.id] ?? {
          sizeScale: 1,
          leadingDelta: 0,
          trackingDelta: 0,
          measureScale: 1,
        };
      block.size *= mix(a.sizeScale, b.sizeScale);
      block.leading += mix(a.leadingDelta, b.leadingDelta);
      block.trackingEm += mix(a.trackingDelta, b.trackingDelta);
      block.measure *= mix(a.measureScale, b.measureScale);
    }
    pattern = lower.pattern;
    splitGap = r.split.gap;
    if (
      pattern === 'split' &&
      (state.blocks.length !== 2 ||
        Math.min(width, maxWidth) - 2 * state.padding <
          (r.split.titleMinWidth + r.split.textMinWidth) *
            Math.max(1, state.viewport.textScale * systemFontScale) +
            splitGap)
    ) {
      pattern = 'stack';
      notes.push(
        'Split falls back to stack because both text measures cannot fit at this text scale.',
      );
    }
  }
  const surfaceWidth = Math.min(state.viewport.width, maxWidth),
    available = surfaceWidth - 2 * state.padding;
  if (available <= 0)
    throw new Error('responsive padding leaves no content width');
  if (pattern === 'split') {
    const title = Math.min(
      state.blocks[0]!.measure,
      Math.max(r!.split.titleMinWidth, (available - splitGap) * 0.35),
    );
    state.blocks[0]!.measure = title;
    state.blocks[1]!.measure = Math.min(
      state.blocks[1]!.measure,
      available - splitGap - title,
    );
  } else
    for (const block of state.blocks)
      block.measure = Math.min(block.measure, available);
  state.responsive = null;
  return {
    state,
    pattern,
    surfaceWidth,
    contentMaxWidth: maxWidth,
    gap: splitGap,
    notes,
    container: {
      display: 'flex' as const,
      flexDirection:
        pattern === 'split' ? ('row' as const) : ('column' as const),
      flexWrap: pattern === 'split' ? ('wrap' as const) : ('nowrap' as const),
      flexGrow: 0,
      flexShrink: 1,
      flexBasis: 'auto' as const,
      alignItems: 'flex-start' as const,
    },
  };
}

/** Source contains the same pure resolver; platform emitters do not maintain a second responsive formula. */
export function responsiveResolverSource() {
  return resolveLayout.toString();
}

export const responsivePatterns = {
  version: 1,
  primitives: [
    'flexDirection',
    'flexWrap',
    'flexGrow',
    'flexShrink',
    'flexBasis',
    'minWidth',
    'maxWidth',
    'gap',
  ],
  patterns: [
    {
      id: 'stack',
      purpose:
        'Phone, narrow embedded windows, iPad split view, large text, or uninterrupted reading. Preserve semantic order and let height grow.',
      source: ['apple-layout', 'web-responsive', 'rn-flexbox'],
    },
    {
      id: 'capped-reading-column',
      purpose:
        'Keep a prose measure cap while outer whitespace grows on iPad and desktop. More width does not require more columns.',
      source: ['uswds', 'apple-layout'],
    },
    {
      id: 'content-fit-split',
      purpose:
        'Optional two-text-block flex row only when both minimum measures and the gap fit at the effective text scale; otherwise stack.',
      source: ['apple-layout', 'web-responsive', 'rn-flexbox'],
    },
  ],
  scenarios: [
    { id: 'phone-small', width: 320, height: 568 },
    { id: 'phone', width: 390, height: 844 },
    { id: 'ipad-split', width: 507, height: 1024 },
    { id: 'ipad-portrait', width: 834, height: 1194 },
    { id: 'ipad-landscape', width: 1194, height: 834 },
    { id: 'desktop', width: 1440, height: 900 },
    { id: 'desktop-wide', width: 1920, height: 1080 },
  ],
  interpretation:
    'Window/container sizes select behavior. Device names label test scenarios, never device detection. Pattern and numeric anchors remain editable heuristics; text enlargement is preserved.',
} as const;
