import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ColorSystemSchema,
  analyzeColors,
  colorCandidates,
  contrastRatio,
  describeColor,
  relativeLuminance,
} from '../src/color.js';
import { analyzeComposition } from '../src/composition.js';

const role = (
  id: string,
  foreground: string,
  background: string,
  use: 'text' | 'large-text' | 'non-text' | 'decorative' = 'text',
) => ({ id, foreground, background, use, source: ['test: declared use'] });
const system = () => ({
  tokens: { canvas: '#ffffff', ink: '#000000', accent: '#bbbbbb' },
  roles: [
    role('body', 'ink', 'canvas'),
    role('control', 'accent', 'canvas', 'non-text'),
  ],
  harmony: 'free',
});
const near = (actual: number, expected: number, tolerance = 1e-8) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected}`,
  );

test('WCAG sRGB reference colors and contrast are symmetric, unrounded and correctly classified', () => {
  near(relativeLuminance('#000'), 0);
  near(relativeLuminance('#fff'), 1);
  near(relativeLuminance('#f00'), 0.2126);
  near(relativeLuminance('#0f0'), 0.7152);
  near(relativeLuminance('#00f'), 0.0722);
  near(contrastRatio('#000', '#fff'), 21);
  assert.equal(
    contrastRatio('#123456', '#abc'),
    contrastRatio('#abc', '#123456'),
  );
  const s = system();
  s.tokens.ink = '#777777';
  const result = analyzeColors(s);
  near(result.roles[0]!.ratio, 4.478089453577214);
  assert.equal(result.roles[0]!.passes, false); // 4.48 must not round up to 4.5.
  s.tokens.ink = '#767676';
  assert.equal(analyzeColors(s).roles[0]!.passes, true);
  assert.equal(
    analyzeColors(s, { contrastLevel: 'AAA' }).roles[0]!.passes,
    false,
  );
});

test('role applicability stays explicit and decorative/no-role declarations are not certified', () => {
  const s = {
    tokens: { canvas: '#fff', ink: '#777', accent: '#777' },
    roles: [
      role('large', 'ink', 'canvas', 'large-text'),
      role('decoration', 'accent', 'canvas', 'decorative'),
    ],
  };
  assert.equal(analyzeColors(s).roles[0]!.passes, true);
  assert.equal(
    analyzeColors(s, { contrastLevel: 'AAA' }).roles[0]!.passes,
    false,
  );
  assert.equal(analyzeColors(s).roles[1]!.passes, null);
  assert.equal(analyzeColors({ tokens: s.tokens }).constrainedRoles, 0);
});

test('OKLab known red reference and neutral hue remain separate from WCAG luminance', () => {
  const red = describeColor('#ff0000');
  near(red.oklab.L, 0.6279553606145516);
  near(red.oklab.a, 0.22486306106597398);
  near(red.oklab.b, 0.1258462985307351);
  assert.notEqual(red.luminance, red.oklab.L);
  for (let n = 0; n < 256; n++) {
    const channel = n.toString(16).padStart(2, '0');
    assert.equal(describeColor('#' + channel.repeat(3)).oklch.h, null);
  }
});

test('color schemas reject alpha, unknown references, duplicate roles and missing required tokens', () => {
  assert.throws(() => describeColor('#ffffff80'));
  assert.throws(() => describeColor('oklch(50% .2 30)'));
  assert.throws(() => ColorSystemSchema.parse({ tokens: { canvas: '#fff' } }));
  assert.throws(() =>
    analyzeColors({ ...system(), roles: [role('body', 'missing', 'canvas')] }),
  );
  assert.throws(() =>
    analyzeColors({
      ...system(),
      roles: [role('same', 'ink', 'canvas'), role('same', 'ink', 'canvas')],
    }),
  );
  assert.throws(() => analyzeColors(system(), { hueReference: 'missing' }));
  assert.throws(() =>
    analyzeColors(system(), { chromaRange: { min: 0.2, max: 0.1 } }),
  );
  assert.throws(() =>
    colorCandidates(system(), { editableTokens: ['missing'] }),
  );
});

test('harmony has no result for neutral/duplicate evidence and does not affect contrast status', () => {
  const neutral = analyzeColors({ ...system(), harmony: 'complementary' });
  assert.equal(neutral.factors.harmony.meanAngularError, null);
  const aliases = analyzeColors({
    tokens: {
      canvas: '#fff',
      ink: '#000',
      accent: '#f00',
      second: '#f00',
      third: '#f00',
    },
    harmony: 'triadic',
  });
  assert.equal(aliases.factors.harmony.distinctChromaticColors, 1);
  assert.equal(aliases.factors.harmony.meanAngularError, null);
  const nearRed = analyzeColors({
    tokens: {
      canvas: '#fff',
      ink: '#000',
      accent: '#ff0000',
      second: '#ef1000',
      third: '#df2000',
    },
    harmony: 'triadic',
  });
  assert.equal(nearRed.factors.harmony.status, 'missing-triad-branch');
  assert.equal(nearRed.hardConstraintsPass, true);
});

test('bounded alternatives preserve input/locks, are deterministic, unique and filtered after hex quantization', () => {
  const s = system(),
    before = structuredClone(s);
  const a = colorCandidates(s, { limit: 12 }),
    b = colorCandidates(s, { limit: 12 });
  assert.deepEqual(s, before);
  assert.deepEqual(a, b);
  assert.ok(a.candidates.length > 1);
  assert.ok(a.attempted <= 512);
  assert.equal(
    new Set(a.candidates.map((c) => JSON.stringify(c.system.tokens))).size,
    a.candidates.length,
  );
  for (const c of a.candidates) {
    assert.equal(c.system.tokens.ink, '#000000');
    assert.equal(c.system.tokens.canvas, '#ffffff');
    assert.ok(analyzeColors(c.system).hardConstraintsPass);
    for (const r of c.analysis.roles)
      if (r.minimum !== null) assert.ok(r.ratio >= r.minimum);
  }
  assert.equal(
    colorCandidates(s, { lockedTokens: ['accent'] }).candidates.length,
    0,
  );
  const valid = system();
  valid.tokens.accent = '#005599';
  const locked = colorCandidates(valid, {
    editableTokens: ['ink', 'accent'],
    lockedTokens: ['ink', 'accent'],
  });
  assert.equal(locked.candidates.length, 1);
  assert.equal(locked.candidates[0]!.id, 'original');
});

test('empty bounded search reports exhaustion rather than global infeasibility', () => {
  const s = {
    tokens: { canvas: '#fff', ink: '#000', accent: '#008800' },
    roles: [
      role('on-light', 'accent', 'canvas'),
      role('on-dark', 'accent', 'ink'),
    ],
  };
  const result = colorCandidates(s, {
    context: { contrastLevel: 'AAA' },
    maxAttempts: 30,
  });
  assert.equal(result.candidates.length, 0);
  assert.equal(result.exhausted, true);
  assert.equal(result.attempted, 30);
  assert.ok(result.notes.some((x) => x.includes('not proof')));
});

const rectangle = (
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
) => ({ id, box: { x, y, width, height } });
test('composition union occupancy and centroid do not double-count overlaps, duplicate coverage or nested boxes', () => {
  const input = {
    viewport: { width: 100, height: 100 },
    rectangles: [
      rectangle('left', 0, 0, 60, 100),
      rectangle('right', 40, 0, 60, 100),
    ],
  };
  const a = analyzeComposition(input);
  assert.equal(a.whitespace.occupiedUnionArea, 10000);
  assert.equal(a.whitespace.unoccupiedFraction, 0);
  assert.deepEqual(a.balance.occupiedUnionCentroid, { x: 50, y: 50 });
  const b = analyzeComposition({
    ...input,
    rectangles: [...input.rectangles, rectangle('nested', 5, 5, 10, 10)],
  });
  assert.deepEqual(a.balance, b.balance);
  assert.deepEqual(a.whitespace, b.whitespace);
  assert.equal(a.overlap.pairs[0]!.area, 2000);
});

test('composition clips occupancy to viewport and handles empty/zero-area scenes honestly', () => {
  const a = analyzeComposition({
    viewport: { width: 100, height: 100 },
    rectangles: [rectangle('cut', -10, 0, 20, 20)],
  });
  assert.equal(a.whitespace.occupiedUnionArea, 200);
  assert.deepEqual(a.balance.occupiedUnionCentroid, { x: 5, y: 10 });
  assert.deepEqual(a.outsideViewport, ['cut']);
  const empty = analyzeComposition({
    viewport: { width: 100, height: 100 },
    rectangles: [rectangle('hidden', 0, 0, 0, 0)],
  });
  assert.equal(empty.whitespace.unoccupiedFraction, 1);
  assert.equal(empty.balance.occupiedUnionCentroid, null);
  assert.equal(empty.hierarchy.largestToMedianArea, null);
});

test('composition respects declared reading axis/direction, validates references and exposes group distances', () => {
  const input = {
    viewport: { width: 100, height: 100 },
    rectangles: [
      rectangle('a', 70, 0, 20, 20),
      rectangle('b', 40, 0, 20, 20),
      rectangle('c', 0, 80, 20, 20),
    ],
    readingOrder: ['a', 'b'],
    groups: [
      { id: 'pair', members: ['a', 'b'], source: ['test: semantic pair'] },
    ],
  };
  const rtl = analyzeComposition({
    ...input,
    context: { flow: 'row', direction: 'rtl' },
  });
  assert.equal(rtl.readingOrder.steps[0]!.geometricReversal, false);
  assert.equal(
    analyzeComposition({ ...input, context: { flow: 'row' } }).readingOrder
      .steps[0]!.geometricReversal,
    true,
  );
  assert.equal(rtl.proximity[0]!.withinMedianGap, 10);
  assert.ok(rtl.proximity[0]!.nearestOutsideGap! > 10);
  assert.throws(() =>
    analyzeComposition({ ...input, readingOrder: ['missing'] }),
  );
  assert.throws(() =>
    analyzeComposition({
      ...input,
      rectangles: [input.rectangles[0], input.rectangles[0]],
    }),
  );
  assert.throws(() =>
    analyzeComposition({
      ...input,
      viewport: { width: Infinity, height: 100 },
    }),
  );
  assert.throws(() =>
    analyzeComposition({
      viewport: { width: Number.MIN_VALUE, height: Number.MIN_VALUE },
      rectangles: [],
    }),
  );
});

test('candidate search reports invariant failed roles without spending an unrelated token search', () => {
  const s = system();
  s.tokens.ink = '#777777';
  const result = colorCandidates(s);
  assert.deepEqual(result.invariantFailedRoles, ['body']);
  assert.equal(result.attempted, 0);
  assert.equal(result.candidates.length, 0);
});

test('normalized composition descriptors are invariant under uniform scale', () => {
  const input = {
    viewport: { width: 100, height: 200 },
    rectangles: [
      rectangle('a', 10, 10, 20, 20),
      rectangle('b', 10, 50, 50, 100),
    ],
  };
  const scaled = {
    viewport: { width: 1000, height: 2000 },
    rectangles: input.rectangles.map((r) => ({
      id: r.id,
      box: {
        x: r.box.x * 10,
        y: r.box.y * 10,
        width: r.box.width * 10,
        height: r.box.height * 10,
      },
    })),
    context: { alignmentTolerance: 40 },
  };
  const a = analyzeComposition(input),
    b = analyzeComposition(scaled);
  near(a.whitespace.unoccupiedFraction, b.whitespace.unoccupiedFraction);
  near(a.balance.normalizedOffset!.x, b.balance.normalizedOffset!.x);
  near(a.balance.normalizedOffset!.y, b.balance.normalizedOffset!.y);
  near(a.hierarchy.largestToMedianArea!, b.hierarchy.largestToMedianArea!);
  assert.deepEqual(
    a.alignment.pairs.map((p) => p.withinTolerance),
    b.alignment.pairs.map((p) => p.withinTolerance),
  );
});
