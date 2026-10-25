import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BlockSchema } from '../src/state.js';
import { loadFont } from '../src/fonts.js';
import {
  inspectTypography,
  typographyAxisCandidates,
  probeTypographyAxes,
} from '../src/typography-inspection.js';

const variable = BlockSchema.parse(
  JSON.parse(readFileSync('examples/typography/variable-block.json', 'utf8')),
);
const lato = BlockSchema.parse({
  ...variable,
  text: 'AVATAR office Agjp',
  font: { file: 'assets/fonts/Lato-Regular.ttf', family: 'Lato' },
});

test('font identity matches independently pinned OFL bytes and preserves metric units', () => {
  const report = inspectTypography(variable);
  assert.equal(
    report.font.sha256,
    '9b523f7d82593df0107173849ebb8c817471a1df4b4fb2c3cbf40cfd810c8281',
  );
  assert.equal(report.font.unitsPerEm, 2048);
  assert.equal(report.metrics.fontUnits.ascent, 1900);
  assert.equal(report.metrics.scaled.ascent, (1900 / 2048) * variable.size);
  assert.equal(report.metrics.baseline, null);
  assert.equal(report.axes.browserResolvedCoordinates, null);
});

test('explicit axes override weight and auto optical size; defaults are explicit', () => {
  const report = inspectTypography({
    ...variable,
    size: 200,
    weight: 300,
    font: {
      ...variable.font,
      axes: { wght: 800, opsz: 14 },
      opticalSizing: 'auto',
    },
  });
  assert.equal(report.axes.resolvedForFontkit.wght!.value, 800);
  assert.equal(report.axes.resolvedForFontkit.wght!.source, 'explicit-axis');
  assert.equal(report.axes.resolvedForFontkit.opsz!.value, 14);
  assert.equal(report.axes.resolvedForFontkit.wdth!.source, 'font-default');
  const automatic = inspectTypography({
    ...variable,
    size: 200,
    font: { ...variable.font, opticalSizing: 'auto' },
  });
  assert.equal(automatic.axes.resolvedForFontkit.opsz!.value, 144);
  assert.equal(
    automatic.axes.resolvedForFontkit.opsz!.source,
    'fontkit-size-policy',
  );
});

test('kerning toggle matches direct fontkit positions while tracking is independent', () => {
  const report = inspectTypography(lato, { detail: 'glyphs' });
  const font = loadFont(lato.font.file);
  const kerned = font.layout(lato.text, { kern: true });
  const plain = font.layout(lato.text, { kern: false });
  const expected =
    ((kerned.advanceWidth - plain.advanceWidth) * lato.size) / font.unitsPerEm;
  assert.ok(Math.abs(report.shaping.kerning.advanceDelta - expected) < 0.002);
  assert.ok(report.shaping.kerning.advanceDelta < 0);
  const tracked = inspectTypography(
    { ...lato, trackingEm: 0.1 },
    { detail: 'glyphs' },
  );
  assert.equal(tracked.shaping.advance, report.shaping.advance);
  assert.deepEqual(tracked.shaping.glyphs, report.shaping.glyphs);
  assert.ok(tracked.shaping.tracking.estimatedAdditionalAdvance > 0);
});

test('outline union agrees with independent fontkit run bounding box', () => {
  const report = inspectTypography(lato, { detail: 'glyphs', glyphLimit: 512 });
  const font = loadFont(lato.font.file),
    run = font.layout(lato.text, { kern: true }),
    box = run.bbox;
  const scale = lato.size / font.unitsPerEm;
  const bounds = report.shaping.outlineBounds!;
  assert.equal(bounds.x, box.minX * scale);
  assert.equal(bounds.y, -box.maxY * scale);
  assert.ok(Math.abs(bounds.width - (box.maxX - box.minX) * scale) < 1e-9);
  assert.ok(Math.abs(bounds.height - (box.maxY - box.minY) * scale) < 1e-9);
});

test('ligatures and combining characters are shaped glyph sequences, not codepoint counts', () => {
  const on = inspectTypography({
    ...lato,
    text: 'office',
    features: { liga: true },
  });
  const off = inspectTypography({
    ...lato,
    text: 'office',
    features: { liga: false },
  });
  assert.ok(on.shaping.glyphCount < off.shaping.glyphCount);
  const mark = inspectTypography(
    { ...lato, text: 'a\u0301', features: {} },
    { detail: 'glyphs' },
  );
  assert.ok(mark.shaping.outlineBounds!.height > 0);
  assert.equal(mark.shaping.missing.length, 0);
});

test('reference outlines expose parametric x-height changes independently of global metrics', () => {
  const min = inspectTypography({
    ...variable,
    font: { ...variable.font, axes: { YTLC: 416 } },
  });
  const max = inspectTypography({
    ...variable,
    font: { ...variable.font, axes: { YTLC: 570 } },
  });
  assert.ok(max.referenceGlyphs.x!.height! > min.referenceGlyphs.x!.height!);
  assert.equal(min.referenceGlyphs.x!.present, true);
});

test('13-axis wizard is bounded, deterministic, and includes every min/default/max independently', () => {
  const plan = typographyAxisCandidates(variable, { limit: 64 });
  assert.equal(Object.keys(plan.axes).length, 13);
  assert.equal(plan.totalCandidates, 40);
  assert.equal(plan.candidates.length, 40);
  assert.equal(plan.omittedCandidates, 0);
  for (const tag of Object.keys(plan.axes))
    for (const point of ['min', 'default', 'max']) {
      const c = plan.candidates.find(
        (candidate) => candidate.id === `${tag}:${point}`,
      )!;
      assert.equal(Object.keys(c.block.font.axes).length, 1);
    }
  const bounded = typographyAxisCandidates(variable, { limit: 4 });
  assert.equal(bounded.candidates.length, 4);
  assert.equal(bounded.omittedCandidates, 36);
  assert.deepEqual(bounded, typographyAxisCandidates(variable, { limit: 4 }));
});

test('glyph details are opt-in and truncation is explicit', () => {
  const summary = inspectTypography(lato);
  assert.deepEqual(summary.shaping.glyphs, []);
  assert.equal(summary.shaping.omittedGlyphs, summary.shaping.glyphCount);
  const detail = inspectTypography(lato, { detail: 'glyphs', glyphLimit: 2 });
  assert.equal(detail.shaping.glyphs.length, 2);
  assert.equal(detail.shaping.omittedGlyphs, detail.shaping.glyphCount - 2);
});

test('empty glyph outlines stay null while space advances stay positive', () => {
  const report = inspectTypography(
    { ...lato, text: 'A B' },
    { detail: 'glyphs' },
  );
  const space = report.shaping.glyphs.find((glyph) =>
    glyph.codepoints.includes(32),
  )!;
  assert.equal(space.inkBounds, null);
  assert.equal(space.outlineBounds, null);
  assert.ok(space.advance > 0);
  assert.ok(space.positionedAdvance.x > 0);
  const visit = (value: unknown): void => {
    if (typeof value === 'number') assert(Number.isFinite(value));
    else if (value && typeof value === 'object')
      Object.values(value).forEach(visit);
  };
  visit(report);
});

test('unsupported coverage remains explicit; no renderer or fallback evidence is manufactured', () => {
  const report = inspectTypography({ ...lato, text: 'A 🦄' });
  assert.ok(report.coverage.missing.some((cp) => cp.codepoint === 'U+1F984'));
  assert.equal(report.coverage.fallbackFaces, null);
  assert.equal(report.shaping.lineBreaks, null);
  assert.equal(report.metrics.rasterPaintBounds, null);
  assert.match(report.capabilities.native, /does not extract native baselines/);
});

test('public boundaries reject invalid axes, controls and unbounded text', () => {
  assert.throws(
    () =>
      inspectTypography({
        ...variable,
        font: { ...variable.font, axes: { wght: 1001 } },
      }),
    /outside/,
  );
  assert.throws(
    () => inspectTypography({ ...variable, text: 'A'.repeat(4097) }),
    /4096/,
  );
  assert.throws(
    () => inspectTypography(variable, { glyphLimit: Infinity }),
    /glyphLimit/,
  );
  assert.throws(
    () => typographyAxisCandidates(variable, { limit: 65 }),
    /limit/,
  );
  assert.throws(
    () => typographyAxisCandidates(variable, { tags: ['oops'] }),
    /axis/,
  );
  assert.throws(
    () => typographyAxisCandidates(variable, { tags: ['wght', 'wght'] }),
    /unique/,
  );
  assert.throws(
    () => inspectTypography({ ...variable, features: { kern: true } }),
    /kern/,
  );
});

test('effective text-scaled sizes accept the state maximum times the viewport scale', () => {
  const report = inspectTypography({ ...variable, size: 5000 });
  assert.equal(report.metrics.scale, 5000 / 2048);
  assert.throws(() => inspectTypography({ ...variable, size: 5001 }));
  assert.throws(() => BlockSchema.parse({ ...variable, size: 5000 }));
});

test('non-rendering axis probes preserve unknown renderer effects', async () => {
  const result = await probeTypographyAxes(variable, {
    tags: ['wdth'],
    limit: 4,
    render: false,
  });
  assert.equal(result.results.length, 4);
  assert.ok(result.results[1]!.advance < result.results[3]!.advance);
  for (const row of result.results) {
    assert.equal(row.renderer, null);
    assert.equal(row.effect.rendererLineBreaksChanged, null);
  }
});
