import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { z } from 'zod';
import { chromium, webkit, type Browser } from 'playwright';
import { BlockSchema, type TextBlock } from './state.js';
import { fontAt, inspectFont, shape } from './fonts.js';
import { hash } from './identity.js';
import type { collectTypographyElement } from './typography-browser.js';

export interface TypographyInspectionOptions {
  detail?: 'summary' | 'glyphs';
  glyphLimit?: number;
}
export interface TypographyBrowserOptions {
  engine?: 'chromium' | 'webkit';
  executablePath?: string;
  lineLimit?: number;
}
export interface TypographyAxisOptions {
  tags?: string[];
  limit?: number;
}
const bounded = (value: number, min: number, max: number, name: string) => {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer in [${min}, ${max}]`);
  return value;
};
let collectorBundle: Promise<string> | undefined;
function browserCollectorSource() {
  collectorBundle ??= (async () => {
    const compiled = fileURLToPath(
      new URL('./typography-browser.js', import.meta.url),
    );
    const entry = existsSync(compiled)
      ? compiled
      : fileURLToPath(new URL('./typography-browser.ts', import.meta.url));
    const result = await build({
      entryPoints: [entry],
      bundle: true,
      format: 'iife',
      globalName: 'DTTypography',
      platform: 'browser',
      target: 'es2022',
      write: false,
    });
    return result.outputFiles[0]!.text;
  })();
  return collectorBundle;
}
// State authors remain capped at 1000; a validated viewport scale can produce 5000 CSS px.
const EffectiveBlockSchema = BlockSchema.extend({
  size: z.number().finite().positive().max(5000),
});
function input(block: TextBlock) {
  const parsed = EffectiveBlockSchema.parse(block);
  if (parsed.text.length > 4096)
    throw new Error(
      'Typography inspection accepts at most 4096 UTF-16 text units; inspect a representative excerpt',
    );
  return parsed;
}

/** Outline/shaper facts in font units and CSS-equivalent pixels, never browser layout facts. */
export function inspectTypography(
  block: TextBlock,
  options: TypographyInspectionOptions = {},
) {
  block = input(block);
  const limit = bounded(options.glyphLimit ?? 128, 0, 512, 'glyphLimit');
  if (
    options.detail !== undefined &&
    options.detail !== 'summary' &&
    options.detail !== 'glyphs'
  )
    throw new Error('detail must be summary or glyphs');
  const info = inspectFont(block.font.file, block.text),
    font = fontAt(block);
  const shaped = shape(block),
    unkerned = shape({ ...block, kerning: 'none' });
  const requested = { ...block.font.axes };
  const resolved = Object.fromEntries(
    Object.entries(info.axes).map(([tag, axis]) => {
      const value =
        requested[tag] ??
        (tag === 'wght'
          ? block.weight
          : tag === 'opsz' && block.font.opticalSizing === 'auto'
            ? Math.min(axis!.max, Math.max(axis!.min, block.size))
            : axis!.default);
      return [
        tag,
        {
          name: axis!.name,
          min: axis!.min,
          default: axis!.default,
          max: axis!.max,
          value,
          source:
            requested[tag] !== undefined
              ? 'explicit-axis'
              : tag === 'wght'
                ? 'weight'
                : tag === 'opsz' && block.font.opticalSizing === 'auto'
                  ? 'fontkit-size-policy'
                  : 'font-default',
        },
      ];
    }),
  );
  const units = {
    ascent: font.ascent,
    descent: font.descent,
    lineGap: font.lineGap,
    capHeight: font.capHeight,
    xHeight: font.xHeight,
  };
  const sameGlyphSequence =
    shaped.glyphs.length === unkerned.glyphs.length &&
    shaped.glyphs.every((g, i) => g.id === unkerned.glyphs[i]!.id);
  const run = font.layout(
    block.text,
    { ...block.features, kern: block.kerning !== 'none' },
    undefined,
    block.language,
    block.direction === 'auto' ? undefined : block.direction,
  );
  const scale = block.size / font.unitsPerEm;
  const referenceGlyphs = Object.fromEntries(
    ['H', 'x', 'p', 'g'].map((text) => {
      const reference = shape({ ...block, text });
      const bounds = reference.missing.length ? null : reference.inkBounds;
      return [
        text,
        {
          present: !reference.missing.length,
          outlineBounds: bounds,
          height: bounds?.height ?? null,
          source:
            'single reference character outline, not universal cap/x/descent metrics',
        },
      ];
    }),
  );
  const glyphs =
    options.detail === 'glyphs'
      ? shaped.glyphs.slice(0, limit).map((g, i) => ({
          ...g,
          outlineBounds: g.inkBounds,
          nominalAdvance: run.glyphs[i]!.advanceWidth * scale,
          positionedAdvance: {
            x: run.positions[i]!.xAdvance * scale,
            y: run.positions[i]!.yAdvance * scale,
          },
          offset: {
            x: run.positions[i]!.xOffset * scale,
            y: run.positions[i]!.yOffset * scale,
          },
          kerningAdvanceDelta: sameGlyphSequence
            ? g.advance - unkerned.glyphs[i]!.advance
            : null,
        }))
      : [];
  const names = Object.entries(info.namedVariations ?? {});
  return {
    version: 1,
    inputHash: hash({ block, fontHash: info.sha256 }),
    engine: shaped.engine,
    font: {
      file: info.file,
      sha256: info.sha256,
      family: info.family,
      postscriptName: info.postscriptName,
      unitsPerEm: info.unitsPerEm,
      staticWeight: info.staticWeight,
      availableFeatures: info.features,
      namedVariations: Object.fromEntries(names.slice(0, 32)),
      omittedNamedVariations: Math.max(0, names.length - 32),
    },
    axes: {
      requested,
      resolvedForFontkit: resolved,
      requestedWeight: block.weight,
      opticalSizing: block.font.opticalSizing,
      browserResolvedCoordinates: null,
      limit:
        'fontkit auto opsz uses CSS numeric size clamped to the font axis. Browser optical-size mapping and axis application require renderer probes; computed CSS does not expose selected font coordinates.',
    },
    metrics: {
      source:
        'fontkit hhea/OS/2 global table metrics; MVAR deltas are not applied by fontkit 2.0.4',
      fontUnits: units,
      scaled: Object.fromEntries(
        Object.entries(units).map(([key, value]) => [key, value * scale]),
      ),
      scale,
      variationResolved: false,
      baseline: null,
      rasterPaintBounds: null,
    },
    referenceGlyphs,
    shaping: {
      unit: 'css-equivalent-px',
      coordinateSpace:
        'outline bounds: baseline origin, x right and y down; glyph x/y and offsets: fontkit x right and y up',
      script: run.script,
      language: run.language,
      direction: run.direction,
      advance: shaped.advance,
      outlineBounds: shaped.inkBounds,
      kerning: {
        mode: block.kerning,
        withoutKerningAdvance: unkerned.advance,
        advanceDelta: shaped.advance - unkerned.advance,
        sameGlyphSequence,
        attribution:
          'kern-on/off shaping difference; may use GPOS or legacy kern. Other positioning is not mislabeled kerning.',
      },
      tracking: shaped.tracking,
      glyphCount: shaped.glyphs.length,
      glyphs,
      omittedGlyphs: shaped.glyphs.length - glyphs.length,
      lineBreaks: null,
      missing: shaped.missing,
    },
    coverage: {
      ...info.glyphCoverage,
      source: 'primary font cmap lookup',
      fallbackFaces: null,
      limitation:
        'Code-point coverage alone does not prove grapheme, variation-selector or script shaping support. Actual fallback identity is unknown.',
    },
    capabilities: {
      web: 'Use inspectTypographyBrowser for actual DOM and Canvas facts.',
      native:
        'Existing Text.onTextLayout/Yoga receipts preserve line rectangles and text; this inspector does not extract native baselines, glyph outlines or variable-axis application. Native adapter rejects axes/optical sizing until validated.',
    },
    limits: [
      'Single fontkit logical run; target renderer owns bidi segmentation, line breaking and fallback.',
      'Outline bounds exclude rasterization, antialiasing, color layers, shadows and text decoration.',
      'Tracking is separate from shaping; the estimate does not predict browser ligature suppression or boundary spacing.',
    ],
  };
}

/** Independent finite probes, not an interpolated model or an optimum. */
export function typographyAxisCandidates(
  block: TextBlock,
  options: TypographyAxisOptions = {},
) {
  block = input(block);
  const limit = bounded(options.limit ?? 12, 1, 64, 'limit');
  const inspection = inspectTypography(block),
    axes = inspection.axes.resolvedForFontkit;
  const tags = options.tags ?? Object.keys(axes).sort();
  if (new Set(tags).size !== tags.length)
    throw new Error('Axis tags must be unique');
  for (const tag of tags)
    if (!axes[tag]) throw new Error(`Font does not have axis ${tag}`);
  const all = [
    {
      id: 'requested',
      axis: null as string | null,
      value: null as number | null,
      point: 'requested',
      block,
    },
  ];
  for (const tag of tags)
    for (const point of ['min', 'default', 'max'] as const) {
      const value = axes[tag]![point];
      all.push({
        id: `${tag}:${point}`,
        axis: tag,
        value,
        point,
        block: {
          ...block,
          font: { ...block.font, axes: { ...block.font.axes, [tag]: value } },
        },
      });
    }
  return {
    fontHash: inspection.font.sha256,
    axes,
    totalCandidates: all.length,
    omittedCandidates: Math.max(0, all.length - limit),
    candidates: all.slice(0, limit),
    method:
      'Requested state plus one-axis-at-a-time min/default/max; other declarations held constant. Axis effects can be discontinuous and text-dependent. No aesthetic ranking.',
  };
}

async function launch(options: TypographyBrowserOptions) {
  if (
    options.engine !== undefined &&
    options.engine !== 'chromium' &&
    options.engine !== 'webkit'
  )
    throw new Error('engine must be chromium or webkit');
  const engine = options.engine ?? 'chromium';
  const localWebkit = 'artifacts/runtime/playwright/webkit-2370/pw_run.sh';
  const executablePath =
    options.executablePath ??
    (engine === 'webkit'
      ? (process.env.DESIGN_WEBKIT_EXECUTABLE ??
        (existsSync(localWebkit) ? localWebkit : undefined))
      : process.env.DESIGN_CHROMIUM);
  return {
    engine,
    browser: await (engine === 'webkit' ? webkit : chromium).launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    }),
  };
}

async function inspectWithBrowser(
  browser: Browser,
  engine: string,
  block: TextBlock,
  options: TypographyBrowserOptions,
) {
  const lineLimit = bounded(options.lineLimit ?? 64, 1, 256, 'lineLimit');
  const info = inspectFont(block.font.file, block.text);
  const page = await browser.newPage({
    viewport: { width: Math.ceil(block.measure + 32), height: 900 },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(
      '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
    );
    // Bundle repository-owned browser code; serializing functions can leak tsx helpers.
    await page.addScriptTag({
      content: await browserCollectorSource(),
    });
    const facts = await page.evaluate(
      async ({ block, base64, family, weightRange, lineLimit }) => {
        const face = new FontFace(
          family,
          `url(data:font/ttf;base64,${base64})`,
          { weight: weightRange, style: 'normal' },
        );
        document.fonts.add(face);
        let loadError: string | null = null;
        try {
          await face.load();
          await document.fonts.ready;
        } catch (error) {
          loadError = String(error);
        }
        const el = document.createElement('div');
        el.lang = block.language;
        el.dir = block.direction;
        el.textContent = block.text;
        Object.assign(el.style, {
          fontFamily: `"${family}", sans-serif`,
          fontSize: `${block.size}px`,
          fontWeight: String(block.weight),
          fontSynthesis: 'none',
          fontKerning: block.kerning === 'none' ? 'none' : 'normal',
          fontOpticalSizing: block.font.opticalSizing,
          fontVariationSettings:
            Object.entries(block.font.axes)
              .map(([tag, value]) => `"${tag}" ${value}`)
              .join(', ') || 'normal',
          fontFeatureSettings:
            Object.entries(block.features)
              .map(([tag, value]) => `"${tag}" ${value ? 1 : 0}`)
              .join(', ') || 'normal',
          letterSpacing: `${block.trackingEm * block.size}px`,
          lineHeight: String(block.leading),
          width: `${block.measure}px`,
          textAlign: block.align,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          margin: '0',
          padding: '0',
          border: '0',
          ...(block.maxHeight !== null
            ? { maxHeight: `${block.maxHeight}px`, overflow: 'hidden' }
            : {}),
        });
        document.body.append(el);
        const collect = (
          window as unknown as {
            DTTypography: {
              collectTypographyElement: typeof collectTypographyElement;
            };
          }
        ).DTTypography.collectTypographyElement;
        const result = collect(el, lineLimit);
        return {
          ...result,
          fontLoading: {
            family,
            faceStatus: face.status,
            documentStatus: document.fonts.status,
            loadError,
            check: document.fonts.check(
              `${block.weight} ${block.size}px "${family}"`,
              block.text,
            ),
            loadedFaces: [...document.fonts].map((f) => ({
              family: f.family,
              status: f.status,
              weight: f.weight,
            })),
            fallbackFaces: null,
            note: 'FontFace loaded/check confirms availability, not which face supplied each glyph. Missing cmap codepoints and fallback identity remain separate facts.',
          },
          userAgent: navigator.userAgent,
        };
      },
      {
        block,
        base64: readFileSync(block.font.file).toString('base64'),
        family: `DT_${info.sha256.slice(0, 16)}`,
        weightRange: info.axes.wght
          ? `${info.axes.wght.min} ${info.axes.wght.max}`
          : String(info.staticWeight ?? block.weight),
        lineLimit,
      },
    );
    return {
      version: 1,
      inputHash: hash({ block, fontHash: info.sha256 }),
      fontHash: info.sha256,
      runtime: { engine, version: browser.version(), playwright: '1.64.1' },
      ...facts,
      coverage: info.glyphCoverage,
    };
  } finally {
    await page.close();
  }
}

export async function inspectTypographyBrowser(
  block: TextBlock,
  options: TypographyBrowserOptions = {},
) {
  block = input(block);
  fontAt(block);
  const { browser, engine } = await launch(options);
  try {
    return await inspectWithBrowser(browser, engine, block, options);
  } finally {
    await browser.close();
  }
}

export async function probeTypographyAxes(
  block: TextBlock,
  options: TypographyAxisOptions &
    TypographyBrowserOptions & { render?: boolean } = {},
) {
  const plan = typographyAxisCandidates(block, options);
  const launched = options.render === false ? null : await launch(options);
  try {
    const results = [];
    for (const candidate of plan.candidates) {
      const inspection = inspectTypography(candidate.block);
      const browser = launched
        ? await inspectWithBrowser(
            launched.browser,
            launched.engine,
            candidate.block,
            options,
          )
        : null;
      results.push({
        id: candidate.id,
        axis: candidate.axis,
        point: candidate.point,
        value: candidate.value,
        inputHash: inspection.inputHash,
        resolvedForFontkit: inspection.axes.resolvedForFontkit,
        advance: inspection.shaping.advance,
        outlineBounds: inspection.shaping.outlineBounds,
        referenceGlyphs: inspection.referenceGlyphs,
        renderer: browser
          ? {
              runtime: browser.runtime,
              fontLoading: browser.fontLoading,
              box: browser.box,
              lineBreakSignature: browser.lineBreakSignature,
              totalLines: browser.totalLines,
              lines: browser.lines.map((line) => ({
                start: line.start,
                end: line.end,
                rangeBounds: line.rangeBounds,
                baseline: line.baseline,
              })),
              baselineDeltas: browser.baselineDeltas,
              omittedLines: browser.omittedLines,
            }
          : null,
      });
    }
    const base = results[0]!;
    return {
      fontHash: plan.fontHash,
      axes: plan.axes,
      totalCandidates: plan.totalCandidates,
      omittedCandidates: plan.omittedCandidates,
      method: plan.method,
      results: results.map((result) => ({
        ...result,
        effect: {
          advanceDelta: result.advance - base.advance,
          outlineChanged:
            hash(result.outlineBounds) !== hash(base.outlineBounds),
          rendererLineBreaksChanged:
            result.renderer && base.renderer
              ? hash(result.renderer.lineBreakSignature) !==
                hash(base.renderer.lineBreakSignature)
              : null,
          rendererHeightDelta:
            result.renderer && base.renderer
              ? result.renderer.box.height - base.renderer.box.height
              : null,
          rendererGeometryChanged:
            result.renderer && base.renderer
              ? hash(result.renderer.lines) !== hash(base.renderer.lines)
              : null,
        },
      })),
      limits: [
        'Sampled endpoints are not an interpolation model or a claim that every axis affects this text.',
        'DOM geometry may be unchanged while outlines/paint change; no raster paint bounds are extracted.',
        'Browser computed style does not reveal resolved variation coordinates; endpoint geometry supplies empirical evidence only.',
      ],
    };
  } finally {
    await launched?.browser.close();
  }
}
