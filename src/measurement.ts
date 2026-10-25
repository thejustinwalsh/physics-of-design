import { hash } from './identity.js';
import { chromium, type Browser } from 'playwright';
import type {
  DesignState,
  LayoutMeasurement,
  Issue,
  BlockMeasurement,
} from './state.js';
import { parseState } from './state.js';
import { inspectFont, fontDigest, fontAt } from './fonts.js';
import { resolveLayout } from './responsive.js';
import { proofHtml } from './emission.js';
import { colorIssues } from './design-color.js';

export function measurementKey(state: DesignState) {
  return hash({
    state,
    fonts: state.blocks.map((b) => fontDigest(b.font.file)),
  });
}
export function fontIssues(state: DesignState): Issue[] {
  state = resolveLayout(state).state;
  return state.blocks.flatMap((b) => {
    fontAt(b); // validates requested axes before any renderer work
    const f = inspectFont(b.font.file, b.text);
    const issues: Issue[] = [];
    if (!f.axes.wght && f.staticWeight !== null && f.staticWeight !== b.weight)
      issues.push({
        code: 'static-weight-mismatch',
        severity: 'unsupported',
        block: b.id,
        message: `Static font weight ${f.staticWeight} cannot render requested weight ${b.weight}; supply the correct face or a variable font.`,
      });
    if (f.glyphCoverage.missing.length)
      issues.push({
        code: 'glyph-coverage',
        severity: 'hard',
        block: b.id,
        message: `Primary font lacks: ${f.glyphCoverage.missing.map((c) => c.codepoint).join(', ')}. Declare and verify an explicit fallback before acceptance.`,
      });
    for (const feature of Object.keys(b.features))
      if (b.features[feature] && !f.features.includes(feature))
        issues.push({
          code: 'feature-unavailable',
          severity: 'unsupported',
          block: b.id,
          message: `Font does not advertise OpenType feature ${feature}`,
        });
    return issues;
  });
}
export function geometryIssues(blocks: BlockMeasurement[]): Issue[] {
  const issues: Issue[] = [];
  for (const b of blocks) {
    if (!b.lines.length)
      issues.push({
        code: 'missing-content',
        block: b.id,
        severity: 'hard',
        message: 'Renderer produced no text lines',
      });
    if (b.overflowX > 0.75)
      issues.push({
        code: 'horizontal-overflow',
        block: b.id,
        severity: 'hard',
        message: `Text exceeds its measure by ${b.overflowX.toFixed(2)} units`,
      });
    if (b.overflowY > 0.75)
      issues.push({
        code: 'clipping',
        block: b.id,
        severity: 'hard',
        message: `Clipped text extends ${b.overflowY.toFixed(2)} units beyond its height constraint`,
      });
  }
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]!.box,
        b = blocks[j]!.box;
      if (
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.75 &&
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.75
      )
        issues.push({
          code: 'collision',
          block: blocks[j]!.id,
          severity: 'hard',
          message: 'Text boxes overlap in both dimensions',
        });
    }
  return issues;
}
export function designWarnings(
  state: DesignState,
  measurement: Pick<LayoutMeasurement, 'blocks' | 'runtime'>,
): Issue[] {
  if (
    state.viewport.textScale > 1.01 ||
    Number(measurement.runtime.fontScale ?? 1) > 1.01
  )
    return [];
  const warnings: Issue[] = [];
  for (const [i, block] of state.blocks.entries()) {
    if (block.role !== 'title') continue;
    const ends =
      measurement.blocks[i]?.lines.slice(0, -1).map((l) => l.end) ?? [];
    const words = [
      ...new Intl.Segmenter(block.language, { granularity: 'word' }).segment(
        block.text,
      ),
    ].filter((w) => w.isWordLike);
    if (
      ends.some((end) =>
        words.some((w) => end > w.index && end < w.index + w.segment.length),
      )
    )
      warnings.push({
        code: 'heading-word-fragment',
        block: block.id,
        severity: 'note',
        message:
          'Default-scale heading wraps inside a word. Review responsive size/measure; this is a design warning, not an accessibility failure.',
      });
  }
  return warnings;
}
export interface MeasureOptions {
  probes?: boolean;
  spacing?: boolean;
}
export interface Renderer {
  measure(
    state: DesignState,
    options?: MeasureOptions,
  ): Promise<LayoutMeasurement>;
  close(): Promise<void>;
}

export class BrowserRenderer implements Renderer {
  private browser: Browser | undefined;
  async close() {
    await this.browser?.close();
    this.browser = undefined;
  }
  async measure(
    state: DesignState,
    options: MeasureOptions = {},
  ): Promise<LayoutMeasurement> {
    state = parseState(state);
    const inputHash = measurementKey(state);
    if (state.platform !== 'web')
      throw new Error(
        'BrowserRenderer only verifies web states; use the native bridge for native states',
      );
    const issues = [...fontIssues(state), ...colorIssues(state)];
    this.browser ??= await chromium.launch({
      headless: true,
      ...(process.env.DESIGN_CHROMIUM
        ? { executablePath: process.env.DESIGN_CHROMIUM }
        : {}),
    });
    const page = await this.browser.newPage({
      viewport: {
        width: Math.ceil(state.viewport.width),
        height: Math.ceil(state.viewport.height),
      },
      deviceScaleFactor: 1,
    });
    try {
      await page.setContent(await proofHtml(state), { waitUntil: 'load' });
      await page.waitForFunction(() =>
        Boolean(
          (window as unknown as { __DESIGN_READY__?: boolean })
            .__DESIGN_READY__,
        ),
      );
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      const result = await page.evaluate(
        ({ probes, spacing }) => {
          const rect = (r: DOMRect) => ({
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
          });
          const elements = [
            ...document.querySelectorAll<HTMLElement>('[data-block]'),
          ];
          function sample(el: HTMLElement) {
            const node = el.firstChild!;
            const text = node.textContent ?? '';
            const visibleRects: {
              x: number;
              y: number;
              right: number;
              bottom: number;
            }[] = [];
            const style = getComputedStyle(el),
              trailingTracking = Math.max(
                0,
                parseFloat(style.letterSpacing) || 0,
              );
            const groups = new Map<
              string,
              {
                x: number;
                y: number;
                width: number;
                height: number;
                start: number;
                end: number;
                text: string;
              }
            >();
            for (const segment of new Intl.Segmenter(el.lang || 'en', {
              granularity: 'grapheme',
            }).segment(text)) {
              const range = document.createRange();
              range.setStart(node, segment.index);
              range.setEnd(node, segment.index + segment.segment.length);
              const r = range.getBoundingClientRect();
              if (!r.height) continue;
              if (!/^\s+$/u.test(segment.segment))
                visibleRects.push({
                  x: r.x + (style.direction === 'rtl' ? trailingTracking : 0),
                  y: r.y,
                  right:
                    r.right -
                    (style.direction === 'rtl' ? 0 : trailingTracking),
                  bottom: r.bottom,
                });
              const key = (Math.round(r.y * 4) / 4).toString();
              const old = groups.get(key);
              if (old) {
                const right = Math.max(old.x + old.width, r.right);
                old.x = Math.min(old.x, r.x);
                old.width = right - old.x;
                old.height = Math.max(old.height, r.height);
                old.end = segment.index + segment.segment.length;
                old.text = text.slice(old.start, old.end);
              } else
                groups.set(key, {
                  ...rect(r),
                  start: segment.index,
                  end: segment.index + segment.segment.length,
                  text: segment.segment,
                });
            }
            const lines = [...groups.values()].sort((a, b) => a.y - b.y);
            const box = rect(el.getBoundingClientRect());
            // CSS pre-wrap intentionally hangs trailing spaces. They preserve content but are not visible overflow.
            const x = Math.min(...visibleRects.map((r) => r.x)),
              y = Math.min(...visibleRects.map((r) => r.y));
            const right = Math.max(...visibleRects.map((r) => r.right)),
              bottom = Math.max(...visibleRects.map((r) => r.bottom));
            return {
              id: el.dataset.block!,
              box,
              lines,
              inlineBounds: visibleRects.length
                ? { x, y, width: right - x, height: bottom - y }
                : null,
              inkBounds: null,
              overflowX: visibleRects.length
                ? Math.max(0, box.x - x, right - (box.x + box.width))
                : 0,
              overflowY:
                getComputedStyle(el).overflow === 'hidden' &&
                visibleRects.length
                  ? Math.max(0, bottom - (box.y + box.height))
                  : 0,
            };
          }
          const signature = (el: HTMLElement) =>
            sample(el).lines.map((l) => [l.start, l.end]);
          const blocks = elements.map((el) => {
            const b = sample(el);
            if (!probes) return b;
            const original = el.style.width;
            const width = b.box.width;
            const initial = JSON.stringify(signature(el));
            function threshold(direction: -1 | 1) {
              let same = width,
                different: number | null = null;
              const limit =
                direction === -1 ? 1 : Math.max(width * 2, width + 512);
              let step = 1;
              while (true) {
                const probe =
                  direction === -1
                    ? Math.max(limit, width - step)
                    : Math.min(limit, width + step);
                el.style.width = `${probe}px`;
                el.style.maxWidth = 'none';
                if (JSON.stringify(signature(el)) !== initial) {
                  different = probe;
                  break;
                }
                same = probe;
                if (probe === limit) break;
                step *= 2;
              }
              const searched: [number, number] = [
                Math.min(width, same, different ?? same),
                Math.max(width, same, different ?? same),
              ];
              if (different !== null) {
                let changedWidth: number = different;
                for (
                  let i = 0;
                  i < 24 && Math.abs(same - changedWidth) > 0.25;
                  i++
                ) {
                  const mid: number = (same + changedWidth) / 2;
                  el.style.width = `${mid}px`;
                  if (JSON.stringify(signature(el)) === initial) same = mid;
                  else changedWidth = mid;
                }
                different = changedWidth;
              }
              el.style.width = original;
              el.style.maxWidth = '100%';
              return {
                bracket:
                  different === null
                    ? null
                    : ([
                        Math.min(same, different),
                        Math.max(same, different),
                      ] as [number, number]),
                distance:
                  different === null
                    ? null
                    : ([
                        Math.min(
                          Math.abs(width - same),
                          Math.abs(width - different),
                        ),
                        Math.max(
                          Math.abs(width - same),
                          Math.abs(width - different),
                        ),
                      ] as [number, number]),
                searched,
                precision: 0.25,
                signature: 'line-breaks' as const,
              };
            }
            return {
              ...b,
              thresholds: { narrower: threshold(-1), wider: threshold(1) },
            };
          });
          let spaced: ReturnType<typeof sample>[] = [];
          if (spacing) {
            for (const [i, el] of elements.entries()) {
              const size = parseFloat(getComputedStyle(el).fontSize);
              el.style.lineHeight = `${Math.max(parseFloat(getComputedStyle(el).lineHeight), size * 1.5)}px`;
              el.style.letterSpacing = `${Math.max(parseFloat(getComputedStyle(el).letterSpacing) || 0, size * 0.12)}px`;
              el.style.wordSpacing = `${size * 0.16}px`;
              // Only prose paragraphs receive paragraph spacing; titles remain semantic headings.
              if (i > 0 && elements[i - 1]!.tagName === 'P')
                el.style.marginTop = `${Math.max(parseFloat(getComputedStyle(el).marginTop), size * 2)}px`;
            }
            spaced = elements.map(sample);
          }
          return {
            blocks,
            spaced,
            fonts: [...document.fonts].map((f) => ({
              family: f.family,
              status: f.status,
            })),
          };
        },
        { probes: options.probes ?? false, spacing: options.spacing ?? true },
      );
      for (const f of result.fonts)
        if (f.status !== 'loaded')
          issues.push({
            code: 'font-load',
            severity: 'hard',
            message: `${f.family} was not loaded`,
          });
      issues.push(
        ...geometryIssues(result.blocks),
        ...designWarnings(state, {
          blocks: result.blocks,
          runtime: { fontScale: 1 },
        }),
      );
      const spacingIssues = geometryIssues(result.spaced).map((i) => ({
        ...i,
        code: `text-spacing-${i.code}`,
      }));
      issues.push(...spacingIssues);
      if (measurementKey(state) !== inputHash)
        throw new Error(
          'font content changed during measurement; retry with stable files',
        );
      return {
        inputHash,
        platform: 'web',
        engine: 'chromium/react/stylex',
        runtime: { chromium: this.browser.version(), deviceScaleFactor: 1 },
        blocks: result.blocks,
        issues,
        feasible: !issues.some(
          (i) => i.severity === 'hard' || i.severity === 'unsupported',
        ),
        textSpacing: { tested: options.spacing ?? true, issues: spacingIssues },
        scope: [
          'Only this specimen and viewport were verified.',
          'Inline bounds are DOM range bounds, not glyph ink bounds.',
          'Wrapping thresholds are measured brackets, not aesthetic tension scores.',
          'Text spacing checks content geometry; full WCAG conformance, contrast and assistive technology behavior are outside this report.',
        ],
      };
    } finally {
      await page.close();
    }
  }
}
