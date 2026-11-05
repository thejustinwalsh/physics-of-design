import { z } from 'zod';

export const CompositionPlanSchema = z
  .object({
    width: z.number().finite().min(240).max(10000),
    textScale: z.number().finite().min(0.5).max(5).default(1),
    mode: z.enum(['publication', 'app']),
    density: z.number().finite().min(0.7).max(1.4).default(1),
    expression: z.number().finite().min(0.7).max(1.4).default(1),
    readingSize: z.number().finite().min(17).max(28).default(20),
    readingLeading: z.number().finite().min(1.3).max(2).default(1.55),
  })
  .strict();

/** Shared flex geometry. Numbers are editable art-direction heuristics, not Apple constants. */
export function planComposition(input: z.input<typeof CompositionPlanSchema>) {
  const request = CompositionPlanSchema.parse(input);
  const clamp = (value: number, low: number, high: number) =>
    Math.max(low, Math.min(high, value));
  const { width, textScale, density, expression, mode } = request;
  const gutter =
    mode === 'app'
      ? clamp(width * 0.048, 20, 40)
      : clamp(20 + (width - 390) * 0.042, 20, 64);
  const gap = clamp(width * 0.027, 20, 40) * density;
  const sidebarWidth = 220;
  // Topology depends on available measures and text enlargement, not a device-name breakpoint.
  const sidebar =
    mode === 'app' && width >= sidebarWidth + 460 * textScale + 2 * gutter;
  const contentWidth = Math.min(
    mode === 'app' ? 1120 : 1440,
    width - (sidebar ? sidebarWidth : 0) - 2 * gutter,
  );
  const paired = contentWidth >= 2 * 310 * textScale + gap;
  const display =
    mode === 'app'
      ? clamp(contentWidth * 0.076, 34, 48)
      : clamp(contentWidth * 0.098, 58, 148);
  const displaySize = display * expression;
  return {
    request,
    gutter,
    gap,
    sidebarWidth,
    contentWidth,
    navigation: mode === 'app' ? (sidebar ? 'sidebar' : 'tabs') : 'inline',
    columns: paired ? 2 : 1,
    sectionGap: clamp(width * 0.065, 40, 96) * density,
    titleSize: displaySize,
    titleLeading: mode === 'app' ? 1.08 : 0.99,
    titleTrackingEm: -clamp(displaySize / 3000, 0.015, 0.045),
    bodySize: mode === 'app' ? 17 : clamp(17 + (width - 390) / 650, 17, 20),
    readingSize: request.readingSize,
    readingLeading: request.readingLeading,
    readingMeasure: Math.min(contentWidth, 640),
    imageAspect: mode === 'app' ? 1.55 : paired ? 2.2 : 1.12,
    // Reading imagery depends on its pane and text enlargement, independently of navigation chrome.
    readerImageAspect:
      clamp((contentWidth + 2 * gutter) / 340, 1.2, 2.2) *
      clamp(Math.sqrt(textScale), 1, 1.35),
    controlSize: 44,
    spaces: {
      inline: 8 * density,
      related: 16 * density,
      group: 20 * density,
      section: 24 * density,
      major: 40 * density,
    },
    storyTitleSize: 31 * expression,
    variables: [
      'width',
      'textScale',
      'density',
      'expression',
      'readingSize',
      'readingLeading',
    ],
    dependencyEffects: {
      width: [
        'gutters',
        'contentWidth',
        'navigation',
        'columns',
        'titleSize',
        'imageAspect',
        'readerImageAspect',
      ],
      textScale: ['navigation', 'columns', 'renderer wrapping'],
      density: ['gap', 'sectionGap'],
      expression: ['titleSize', 'titleTrackingEm', 'renderer wrapping'],
      readingSize: ['reading geometry', 'scroll progress'],
      readingLeading: ['reading geometry', 'scroll progress'],
    },
    provenance: {
      kind: 'heuristic',
      sources: [
        'apple-layout',
        'apple-typography',
        'impeccable-layout',
        'local-policy',
      ],
      uncertainty:
        'Uncalibrated geometry proposals; real renderer and task review remain required.',
    },
    contract:
      'Flex topology, natural text heights, no CSS Grid, no cancellation of system text enlargement.',
  };
}

const CropSchema = z
  .object({
    sourceWidth: z.number().finite().min(1e-6).max(100000),
    sourceHeight: z.number().finite().min(1e-6).max(100000),
    width: z.number().finite().min(1e-6).max(100000),
    height: z.number().finite().min(1e-6).max(100000),
    focalX: z.number().finite().min(0).max(1),
    focalY: z.number().finite().min(0).max(1),
    targetX: z.number().finite().min(0).max(1).default(0.65),
    targetY: z.number().finite().min(0).max(1).default(0.3),
  })
  .strict();
/** Exact cover geometry for an authored focal point; target placement is art direction. */
export function cropMedia(input: z.input<typeof CropSchema>) {
  const r = CropSchema.parse(input),
    scale = Math.max(r.width / r.sourceWidth, r.height / r.sourceHeight);
  const drawWidth = r.sourceWidth * scale,
    drawHeight = r.sourceHeight * scale;
  const offsetX = Math.min(
    0,
    Math.max(r.width - drawWidth, r.width * r.targetX - drawWidth * r.focalX),
  );
  const offsetY = Math.min(
    0,
    Math.max(
      r.height - drawHeight,
      r.height * r.targetY - drawHeight * r.focalY,
    ),
  );
  const xPercent =
    drawWidth > r.width ? (-offsetX / (drawWidth - r.width)) * 100 : 50;
  const yPercent =
    drawHeight > r.height ? (-offsetY / (drawHeight - r.height)) * 100 : 50;
  return {
    scale,
    drawWidth,
    drawHeight,
    offsetX,
    offsetY,
    objectPosition: `${xPercent}% ${yPercent}%`,
    focal: {
      x: drawWidth * r.focalX + offsetX,
      y: drawHeight * r.focalY + offsetY,
    },
    scope:
      'Cover geometry preserves an authored focal point when possible. It does not detect salience or prove an attractive crop.',
  };
}
export function concentricRadius(
  outerRadius: number,
  inset: number,
  innerWidth: number,
  innerHeight: number,
) {
  for (const value of [outerRadius, inset, innerWidth, innerHeight])
    if (!Number.isFinite(value) || value < 0)
      throw new Error('Finite nonnegative corner geometry is required');
  return Math.min(
    Math.max(0, outerRadius - inset),
    innerWidth / 2,
    innerHeight / 2,
  );
}
