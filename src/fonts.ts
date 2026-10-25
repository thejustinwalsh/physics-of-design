import * as fontkit from 'fontkit';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Font } from 'fontkit';
import type { TextBlock, Rect } from './state.js';
import { round } from './state.js';

export function loadFont(file: string): Font {
  const font = fontkit.openSync(file);
  if ('fonts' in font)
    throw new Error(
      'Font collections require a selected single-face file; extract a licensed face first',
    );
  return font;
}
export function fontDigest(file: string) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}
export function fontAt(block: TextBlock): Font {
  let font = loadFont(block.font.file);
  const axes = { ...block.font.axes };
  if (font.variationAxes.wght && axes.wght === undefined)
    axes.wght = block.weight;
  if (
    font.variationAxes.opsz &&
    block.font.opticalSizing === 'auto' &&
    axes.opsz === undefined
  )
    axes.opsz = Math.min(
      font.variationAxes.opsz.max,
      Math.max(font.variationAxes.opsz.min, block.size),
    );
  for (const [tag, value] of Object.entries(axes)) {
    const axis = font.variationAxes[tag];
    if (!axis) throw new Error(`${block.id}: font does not have axis ${tag}`);
    if (value < axis.min || value > axis.max)
      throw new Error(
        `${block.id}: ${tag}=${value} is outside [${axis.min}, ${axis.max}]`,
      );
  }
  if (Object.keys(axes).length) font = font.getVariation(axes);
  return font;
}
export function inspectFont(file: string, text = '') {
  const f = loadFont(file);
  const cps = [
    ...new Set(
      Array.from(text)
        .filter((c) => !/[\s\p{Cf}]/u.test(c))
        .map((c) => c.codePointAt(0)!),
    ),
  ];
  const missing = cps.filter((cp) => !f.hasGlyphForCodePoint(cp));
  return {
    file,
    sha256: fontDigest(file),
    postscriptName: f.postscriptName,
    family: f.familyName,
    subfamily: f.subfamilyName,
    unitsPerEm: f.unitsPerEm,
    staticWeight:
      (f as unknown as { 'OS/2'?: { usWeightClass: number } })['OS/2']
        ?.usWeightClass ?? null,
    metrics: {
      ascent: f.ascent,
      descent: f.descent,
      lineGap: f.lineGap,
      capHeight: f.capHeight,
      xHeight: f.xHeight,
    },
    axes: f.variationAxes,
    namedVariations: 'namedVariations' in f ? f.namedVariations : {},
    features: f.availableFeatures,
    glyphCoverage: {
      totalCodepoints: f.characterSet.length,
      checked: cps.length,
      missing: missing.map((cp) => ({
        codepoint: `U+${cp.toString(16).toUpperCase()}`,
        character: String.fromCodePoint(cp),
      })),
    },
    copyright: f.copyright,
    licenseNotice:
      'Embedding rights must be established from a license, not inferred from a font name or coverage. Bundled assets have OFL notices and checksums in assets/fonts/manifest.json.',
  };
}

/** Fontkit positions a single logical run. Browser/native adapters own final bidi, wrapping and fallback. */
export function shape(block: TextBlock) {
  const f = fontAt(block);
  const scale = block.size / f.unitsPerEm;
  const features = { ...block.features, kern: block.kerning !== 'none' };
  const run = f.layout(
    block.text,
    features,
    undefined,
    block.language,
    block.direction === 'auto' ? undefined : block.direction,
  );
  let x = 0,
    y = 0;
  let bounds: Rect | null = null;
  const glyphs: {
    id: number;
    codepoints: number[];
    x: number;
    y: number;
    advance: number;
    inkBounds: Rect | null;
  }[] = [];
  for (const [i, glyph] of run.glyphs.entries()) {
    const pos = run.positions[i]!;
    const box = glyph.bbox;
    const candidate = {
      x: (x + pos.xOffset + box.minX) * scale,
      y: -(y + pos.yOffset + box.maxY) * scale,
      width: (box.maxX - box.minX) * scale,
      height: (box.maxY - box.minY) * scale,
    };
    // Empty paths (spaces, format glyphs) have Fontkit bounds of ±Infinity.
    // Their advance is still real; they simply contribute no outline rectangle.
    const empty = glyph.path.commands.length === 0;
    if (!empty && !Object.values(candidate).every(Number.isFinite))
      throw new Error(`Nonfinite outline bounds for glyph ${glyph.id}`);
    const rect: Rect | null =
      empty || candidate.width <= 0 || candidate.height <= 0 ? null : candidate;
    if (rect) {
      if (!bounds) bounds = rect;
      else {
        const right = Math.max(bounds.x + bounds.width, rect.x + rect.width),
          bottom = Math.max(bounds.y + bounds.height, rect.y + rect.height);
        bounds = {
          x: Math.min(bounds.x, rect.x),
          y: Math.min(bounds.y, rect.y),
          width: 0,
          height: 0,
        };
        bounds.width = right - bounds.x;
        bounds.height = bottom - bounds.y;
      }
    }
    const result = {
      id: glyph.id,
      codepoints: glyph.codePoints,
      x: round((x + pos.xOffset) * scale),
      y: round((y + pos.yOffset) * scale),
      advance: round(pos.xAdvance * scale),
      inkBounds: rect,
    };
    x += pos.xAdvance;
    y += pos.yAdvance;
    glyphs.push(result);
  }
  const missing = Array.from(block.text).filter(
    (c) => !/[\s\p{Cf}]/u.test(c) && !f.hasGlyphForCodePoint(c.codePointAt(0)!),
  );
  const graphemes = [
    ...new Intl.Segmenter(block.language, { granularity: 'grapheme' }).segment(
      block.text,
    ),
  ].length;
  return {
    engine: 'fontkit-2.0.4',
    fontHash: fontDigest(block.font.file),
    glyphs,
    advance: round(x * scale),
    tracking: {
      em: block.trackingEm,
      estimatedAdditionalAdvance: round(
        Math.max(0, graphemes - 1) * block.trackingEm * block.size,
      ),
      scope:
        'separate from shaped advances; CSS/native tracking can suppress ligatures or behave differently at run boundaries',
    },
    inkBounds: bounds,
    missing: [...new Set(missing)],
    lineBreaks: null,
    caveats: [
      'Single-run shaping; final bidirectional segmentation, wrapping, optical sizing and fallback must be verified in the target renderer.',
      'No estimated line breaks are presented as renderer facts.',
    ],
  };
}
