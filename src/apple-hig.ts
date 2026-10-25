import { z } from 'zod';
const dimension = z.number().finite().nonnegative().max(10000);
const box = z
  .object({
    x: z.number().finite().min(-10000).max(10000),
    y: z.number().finite().min(-10000).max(10000),
    width: dimension,
    height: dimension,
  })
  .strict();
export const appleHigSources = [
  {
    id: 'apple-accessibility',
    url: 'https://developer.apple.com/design/human-interface-guidelines/accessibility',
    checked: '2026-10-24',
    kind: 'platform-guidance',
    scope:
      'iOS/iPadOS default controls 44pt; minimum 28pt; support enlargement, contrast and accessible alternatives.',
  },
  {
    id: 'apple-layout',
    url: 'https://developer.apple.com/design/human-interface-guidelines/layout',
    checked: '2026-10-24',
    kind: 'platform-guidance',
    scope:
      'Safe areas, importance/reading order, recognizable adaptation and function continuity.',
  },
  {
    id: 'apple-typography',
    url: 'https://developer.apple.com/design/human-interface-guidelines/typography',
    checked: '2026-10-24',
    kind: 'platform-guidance',
    scope: 'Text styles, Dynamic Type and growing/reflowing content.',
  },
  {
    id: 'apple-tab-bars',
    url: 'https://developer.apple.com/design/human-interface-guidelines/tab-bars',
    checked: '2026-10-24',
    kind: 'platform-guidance',
    scope:
      'Stable top-level destinations, labels, selection; preserve availability.',
  },
  {
    id: 'apple-sidebars',
    url: 'https://developer.apple.com/design/human-interface-guidelines/sidebars',
    checked: '2026-10-24',
    kind: 'platform-guidance',
    scope: 'Hierarchical navigation and adaptation to available space.',
  },
  {
    id: 'apple-color',
    url: 'https://developer.apple.com/design/human-interface-guidelines/color',
    checked: '2026-10-24',
    kind: 'platform-guidance',
    scope:
      'Semantic colors, light/dark/increased-contrast variants, content/control distinction.',
  },
] as const;
export const AppleAuditSchema = z
  .object({
    platform: z.enum(['ios', 'ipados']),
    viewport: z
      .object({ width: dimension.positive(), height: dimension.positive() })
      .strict(),
    safeArea: z
      .object({
        top: dimension,
        bottom: dimension,
        left: dimension,
        right: dimension,
      })
      .strict(),
    targets: z
      .array(
        z
          .object({
            id: z.string().min(1),
            box,
            visibleBox: box.optional(),
            label: z.string(),
            allowsUnsafeArea: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1),
    typography: z
      .object({
        allowsFontScaling: z.boolean(),
        maxFontSizeMultiplier: z.number().finite().nonnegative().nullable(),
        testedTextScale: z.number().finite().positive(),
        contentPreserved: z.boolean(),
      })
      .strict()
      .optional(),
    navigation: z
      .object({
        destinations: z.array(z.string()).min(1),
        selected: z.string(),
        priorDestinations: z.array(z.string()).optional(),
        taskStatePreserved: z.boolean().optional(),
      })
      .strict()
      .optional(),
    evidence: z
      .object({ engine: z.string().min(1), receipt: z.string().min(1) })
      .strict(),
  })
  .strict();
export function auditAppleHig(input: unknown) {
  const data = AppleAuditSchema.parse(input);
  if (new Set(data.targets.map((t) => t.id)).size !== data.targets.length)
    throw new Error('Duplicate target identity');
  if (
    data.safeArea.left + data.safeArea.right >= data.viewport.width ||
    data.safeArea.top + data.safeArea.bottom >= data.viewport.height
  )
    throw new Error('Safe areas leave no usable viewport');
  // Native frame reconstruction uses float32 coordinates; keep this numerical allowance explicit.
  const geometryTolerance =
    8 * 2 ** -23 * Math.max(data.viewport.width, data.viewport.height);
  const checks: {
    id: string;
    subject?: string;
    status: 'pass' | 'fail' | 'unknown';
    source: string;
    measured?: number;
    threshold?: number;
    meaning: string;
  }[] = [];
  for (const target of data.targets) {
    const side = Math.min(target.box.width, target.box.height);
    checks.push({
      id: 'control-minimum',
      subject: target.id,
      status: side + geometryTolerance >= 28 ? 'pass' : 'fail',
      source: 'apple-accessibility',
      measured: side,
      threshold: 28,
      meaning: 'Current iOS/iPadOS HIG minimum; not the recommended default.',
    });
    checks.push({
      id: 'control-default',
      subject: target.id,
      status: side + geometryTolerance >= 44 ? 'pass' : 'fail',
      source: 'apple-accessibility',
      measured: side,
      threshold: 44,
      meaning:
        'HIG default adopted as Fieldwork product policy; larger text may need larger controls.',
    });
    checks.push({
      id: 'control-label',
      subject: target.id,
      status: /\S/.test(target.label) ? 'pass' : 'fail',
      source: 'apple-accessibility',
      meaning:
        'Declared accessible name is present; spoken clarity needs assistive-technology review.',
    });
    const b = target.visibleBox ?? target.box,
      s = data.safeArea;
    const inside =
      b.x + geometryTolerance >= s.left &&
      b.y + geometryTolerance >= s.top &&
      b.x + b.width <= data.viewport.width - s.right + geometryTolerance &&
      b.y + b.height <= data.viewport.height - s.bottom + geometryTolerance;
    checks.push({
      id: 'safe-area',
      subject: target.id,
      status: inside || target.allowsUnsafeArea ? 'pass' : 'fail',
      source: 'apple-layout',
      meaning: target.allowsUnsafeArea
        ? 'Explicit unsafe-area exception supplied; reviewer must justify it.'
        : 'Interactive frame fits declared safe area. Background imagery may extend beyond it.',
    });
  }
  const t = data.typography;
  checks.push({
    id: 'dynamic-type',
    status: !t
      ? 'unknown'
      : !t.allowsFontScaling ||
          !t.contentPreserved ||
          t.testedTextScale < 2 ||
          (t.maxFontSizeMultiplier !== null &&
            t.maxFontSizeMultiplier !== 0 &&
            t.maxFontSizeMultiplier < 2)
        ? 'fail'
        : t.maxFontSizeMultiplier === null
          ? 'unknown'
          : t.allowsFontScaling &&
              (t.maxFontSizeMultiplier === 0 ||
                (t.maxFontSizeMultiplier !== null &&
                  t.maxFontSizeMultiplier >= 2)) &&
              t.testedTextScale >= 2 &&
              t.contentPreserved
            ? 'pass'
            : 'fail',
    source: 'apple-typography',
    meaning:
      'Product acceptance requires uncancelled scaling, at least 200% recorded stress, and preserved content. This is not a claim of testing all Dynamic Type categories.',
  });
  const n = data.navigation;
  checks.push({
    id: 'navigation-continuity',
    status: !n
      ? 'unknown'
      : new Set(n.destinations).size !== n.destinations.length ||
          !n.destinations.includes(n.selected) ||
          n.taskStatePreserved === false ||
          (n.priorDestinations &&
            !n.priorDestinations.every((id) => n.destinations.includes(id)))
        ? 'fail'
        : !n.priorDestinations || n.taskStatePreserved === undefined
          ? 'unknown'
          : 'pass',
    source: 'apple-tab-bars',
    meaning:
      'Declared destinations, selection and task state survive adaptation; event evidence is required.',
  });
  checks.push({
    id: 'native-affordance-and-visual-order',
    status: 'unknown',
    source: 'apple-layout',
    meaning:
      'Requires rendered task, platform and assistive-technology review; geometry cannot certify familiarity or hierarchy.',
  });
  return {
    platform: data.platform,
    geometryTolerance,
    geometryToleranceBasis:
      'Eight float32 relative epsilons at viewport magnitude for native coordinate reconstruction; does not alter the authored 28/44pt guidance.',
    checks,
    failures: checks.filter((c) => c.status === 'fail'),
    unknown: checks.filter((c) => c.status === 'unknown').map((c) => c.id),
    evidence: data.evidence,
    sources: appleHigSources,
    overallConformance: null,
    scope:
      'Checks the supplied observations and product policies, not all of Apple HIG, full accessibility, or aesthetic quality.',
  };
}
