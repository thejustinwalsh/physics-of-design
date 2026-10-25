import test from 'node:test';
import assert from 'node:assert/strict';
import { ColorSystemSchema, contrastRatio } from '../src/color.js';
import {
  analyzePalette,
  convertColor,
  paletteCandidates,
  paletteRamp,
} from '../src/palette.js';

const role = (
  id: string,
  foreground: string,
  use: 'text' | 'large-text' | 'non-text' | 'decorative' = 'text',
) => ({
  id,
  foreground,
  background: 'canvas',
  use,
  source: ['test:declared-role'],
});
const system = {
  tokens: { canvas: '#fff', ink: '#aaa', accent: '#bbb' },
  roles: [role('body', 'ink'), role('control', 'accent', 'non-text')],
};

test('CSS conversion agrees with published OKLab red vector and exact sRGB endpoints', () => {
  // Björn Ottosson's published linear-sRGB → OKLab matrices, evaluated at red.
  const red = convertColor({ color: 'red' });
  assert.equal(red.emitted.hex, '#ff0000');
  assert.ok(Math.abs(red.intended.oklch.L - 0.6279553606) < 1e-7);
  assert.ok(Math.abs(red.intended.oklch.C - 0.2576833077) < 1e-7);
  assert.ok(Math.abs(red.intended.oklch.h! - 29.2338852) < 1e-5);
  assert.equal(
    convertColor({ color: 'oklab(0.6279553606 0.2248630611 0.1258462985)' })
      .emitted.hex,
    '#ff0000',
  );
  assert.equal(convertColor({ color: 'oklch(0 0 0)' }).emitted.hex, '#000000');
  assert.equal(convertColor({ color: 'oklch(1 0 0)' }).emitted.hex, '#ffffff');
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
});

test('out-of-sRGB P3 input uses pinned CSS gamut mapping and rechecks emitted bytes', () => {
  const p3 = convertColor({ color: 'color(display-p3 1 0 0)' });
  assert.equal(p3.emitted.gamutMapped, true);
  // Regression for colorjs.io@0.7.1 method:css, distinct from channel clipping.
  assert.equal(p3.emitted.hex, '#ff0b0c');
  const analysis = analyzePalette({
    system: {
      tokens: { canvas: 'white', ink: 'black', accent: p3.source },
      roles: [role('p3-label', 'accent')],
    },
  });
  assert.equal(analysis.checks[0]!.ratio, contrastRatio('#ff0b0c', '#ffffff'));
  assert.equal(analysis.compatibleSystem!.tokens.accent, '#ff0b0c');
  ColorSystemSchema.parse(analysis.compatibleSystem);
});

test('ramps preserve alpha, handle powerless hue and expose explicit sRGB fallbacks', () => {
  assert.equal(convertColor({ color: '#808080' }).intended.oklch.h, null);
  const ramp = paletteRamp({
    color: 'oklch(50% 0 none / 50%)',
    lightness: [0, 0.5, 1],
  });
  assert.deepEqual(
    ramp.steps.map((step) => step.emitted.hex),
    ['#000000', '#636363', '#ffffff'],
  );
  assert.ok(
    ramp.steps.every(
      (step) =>
        step.requested.h === null &&
        step.emitted.alpha === 128 / 255 &&
        step.intended.alpha === 0.5,
    ),
  );
  const muted = paletteRamp({ color: 'red', lightness: [0.5], hue: null });
  assert.equal(muted.steps[0]!.emitted.hex, '#636363');
  assert.equal(muted.steps[0]!.requested.C, 0);
  const rotated = paletteRamp({ color: 'red', lightness: [0.5], hue: 390 });
  assert.equal(rotated.steps[0]!.requested.h, 30);
  assert.equal(
    ramp.steps[1]!.measurementRef,
    convertColor({ color: ramp.steps[1]!.source }).measurementRef,
  );
});

test('alpha source-over is explicit, quantized and cannot invent an unknown backdrop', () => {
  const source = 'rgb(255 0 0 / .5)';
  assert.equal(convertColor({ color: source }).composite.status, 'unknown');
  assert.equal(
    convertColor({ color: source, backdrop: 'white' }).composite.hex,
    '#ff7f7f',
  );
  assert.equal(
    convertColor({ color: 'rgb(0 0 0 / none)', backdrop: 'white' }).composite
      .hex,
    '#ffffff',
  );
  assert.throws(
    () => convertColor({ color: source, backdrop: 'transparent' }),
    /opaque/,
  );
  const palette = {
    tokens: {
      canvas: 'rgb(255 255 255 / .5)',
      ink: 'black',
      accent: 'blue',
      backing: 'white',
    },
    roles: [role('body', 'ink')],
  };
  const unknown = analyzePalette({ system: palette });
  assert.equal(unknown.summary.status, 'unknown');
  assert.equal(unknown.checks[0]!.ratio, null);
  assert.equal(unknown.compatibleSystem, null);
  const known = analyzePalette({
    system: {
      ...palette,
      roles: [{ ...palette.roles[0], backdrop: 'backing' }],
    },
  });
  assert.equal(known.checks[0]!.ratio, 21);
  assert.equal(known.summary.status, 'pass');
  const layered = analyzePalette({
    system: {
      tokens: {
        canvas: 'rgb(0 0 0 / .5)',
        ink: 'rgb(255 255 255 / .5)',
        accent: 'blue',
        backing: 'white',
      },
      roles: [{ ...role('body', 'ink'), backdrop: 'backing' }],
    },
  });
  assert.equal(layered.checks[0]!.effectiveBackground, '#7f7f7f');
  assert.equal(layered.checks[0]!.effectiveForeground, '#bfbfbf');
  assert.equal(layered.checks[0]!.ratio, contrastRatio('#bfbfbf', '#7f7f7f'));
  assert.ok(layered.checks[0]!.ratioInterval!.min < layered.checks[0]!.ratio!);
});

test('adjacent surfaces compare one composited foreground rather than repainting it over every neighbor', () => {
  const facts = analyzePalette({
    system: {
      tokens: { canvas: 'white', ink: 'rgb(0 0 0 / .5)', neighbor: 'black' },
      roles: [
        {
          ...role('control', 'ink', 'non-text'),
          adjacentBackgrounds: ['neighbor'],
        },
      ],
    },
  });
  assert.equal(facts.summary.status, 'pass');
  assert.deepEqual(
    facts.checks.map((check) => check.effectiveForeground),
    ['#7f7f7f', '#7f7f7f'],
  );
  assert.equal(facts.checks[1]!.foregroundBackdrop, 'canvas');
  assert.equal(facts.checks[1]!.effectiveBackground, '#000000');
  assert.equal(facts.checks[1]!.ratio, contrastRatio('#7f7f7f', '#000000'));
});

test('explicit RGBA8 fallback and compositing intervals keep near-threshold alpha unknown', () => {
  const converted = convertColor({
    color: 'rgb(0 0 0 / .5)',
    backdrop: 'white',
  });
  assert.equal(converted.intended.alpha, 0.5);
  assert.equal(converted.emitted.alpha, 128 / 255);
  assert.equal(converted.emitted.alphaQuantized, true);
  assert.equal(converted.composite.hex, '#7f7f7f');
  assert.equal(converted.compositeUncertaintyCodeValues, 1);
  const near = {
    tokens: { canvas: 'white', ink: `rgb(0 0 0 / ${137 / 255})` },
    roles: [role('body', 'ink')],
  };
  const facts = analyzePalette({ system: near });
  assert.equal(facts.checks[0]!.effectiveForeground, '#767676');
  assert.ok(facts.checks[0]!.ratio! >= 4.5);
  assert.ok(facts.checks[0]!.ratioInterval!.min < 4.5);
  assert.equal(facts.checks[0]!.status, 'unknown');
  assert.match(facts.checks[0]!.reason!, /straddles/);
  assert.equal(
    paletteCandidates({ system: near, maxAttempts: 1 }).candidates.length,
    0,
  );
  const flattened = analyzePalette({
    system: {
      ...near,
      tokens: { canvas: 'white', ink: facts.checks[0]!.effectiveForeground! },
    },
  });
  assert.equal(flattened.checks[0]!.status, 'pass');
  assert.equal(
    flattened.checks[0]!.ratioInterval!.min,
    flattened.checks[0]!.ratioInterval!.max,
  );
  const dark = analyzePalette({
    system: { ...near, tokens: { ...near.tokens, ink: 'rgb(0 0 0 / .8)' } },
  });
  assert.equal(dark.checks[0]!.status, 'pass');
  assert.ok(dark.checks[0]!.ratioInterval!.min >= 4.5);
});

test('all declared state and adjacency edges are evaluated with exact AA/AAA thresholds', () => {
  const input = {
    tokens: {
      canvas: '#fff',
      ink: '#777',
      accent: '#005599',
      surface: '#006699',
    },
    roles: [
      role('body', 'ink'),
      {
        ...role('selected-control', 'accent', 'non-text'),
        adjacentBackgrounds: ['surface', 'canvas'],
        state: 'selected',
        theme: 'light',
      },
    ],
  };
  const facts = analyzePalette({ system: input });
  assert.equal(facts.checks.length, 3);
  assert.equal(facts.checks[0]!.status, 'fail'); // 4.478..., never rounded up to 4.5.
  assert.equal(facts.checks[1]!.status, 'pass');
  assert.equal(facts.checks[2]!.status, 'fail');
  assert.equal(facts.checks[2]!.state, 'selected');
  assert.equal(facts.checks[2]!.theme, 'light');
  const large = {
    tokens: { canvas: '#fff', ink: '#888', accent: '#005599' },
    roles: [
      role('heading', 'ink', 'large-text'),
      role('icon', 'accent', 'non-text'),
    ],
  };
  assert.equal(analyzePalette({ system: large }).checks[0]!.minimum, 3);
  const aaa = analyzePalette({ system: large, contrastLevel: 'AAA' });
  assert.equal(aaa.checks[0]!.minimum, 4.5);
  assert.equal(aaa.checks[0]!.status, 'fail');
  assert.equal(aaa.checks[1]!.minimum, 3);
});

test('known failures dominate unknown; absent or decorative roles do not certify accessibility', () => {
  const mixed = {
    tokens: { canvas: 'white', ink: '#aaa', glass: 'rgb(255 255 255 / .5)' },
    roles: [
      role('failed', 'ink'),
      { ...role('unknown', 'ink'), background: 'glass' },
    ],
  };
  assert.equal(analyzePalette({ system: mixed }).summary.status, 'fail');
  assert.equal(
    analyzePalette({ system: { tokens: { canvas: 'white' } } }).summary.status,
    'not-applicable',
  );
  const decorative = analyzePalette({
    system: {
      tokens: { canvas: 'white', ink: 'white' },
      roles: [role('ornament', 'ink', 'decorative')],
    },
  });
  assert.equal(decorative.checks[0]!.minimum, null);
  assert.equal(decorative.summary.status, 'not-applicable');
});

test('joint palette search repairs independent failures, preserves locks and rechecks every candidate', () => {
  const request = {
    system,
    editableTokens: ['ink', 'accent'],
    lockedTokens: ['canvas'],
    limit: 3,
    maxAttempts: 256,
  };
  const result = paletteCandidates(request);
  assert.equal(result.candidates.length, 3);
  assert.ok(result.attempted <= 256);
  for (const candidate of result.candidates) {
    assert.equal(candidate.system.tokens.canvas, '#fff');
    assert.equal(candidate.changes.length, 2);
    assert.equal(candidate.objective.failedChecks, 0);
    assert.equal(candidate.objective.unknownChecks, 0);
    assert.equal(candidate.objective.changedTokens, 2);
    assert.ok(candidate.objective.deltaEOKSum > 0);
    assert.ok(candidate.objective.minimumContrastMargin! >= 0);
    const facts = analyzePalette({
      system: candidate.system,
      contrastLevel: candidate.contrastLevel,
    });
    assert.equal(facts.measurementRef, candidate.measurementRef);
    assert.ok(facts.checks.every((check) => check.status === 'pass'));
    ColorSystemSchema.parse(candidate.compatibleSystem);
  }
  assert.deepEqual(paletteCandidates(request), result);
});

test('bounded search reports budget and locked contradictions without claiming infeasibility', () => {
  const budget = paletteCandidates({ system, maxAttempts: 1 });
  assert.equal(budget.termination, 'budget');
  assert.equal(budget.attempted, 1);
  assert.equal(budget.candidates.length, 0);
  assert.equal(budget.bestUnresolved!.objective.failedChecks, 2);
  const locked = paletteCandidates({ system, lockedTokens: ['ink', 'canvas'] });
  assert.equal(locked.termination, 'locked-conflict');
  assert.deepEqual(locked.invariantFailedChecks, ['body/canvas']);
  const unknown = paletteCandidates({
    system: {
      tokens: { ink: 'black', canvas: 'transparent' },
      roles: [role('body', 'ink')],
    },
    editableTokens: ['ink'],
    maxAttempts: 64,
  });
  assert.equal(unknown.candidates.length, 0);
  assert.equal(unknown.bestUnresolved!.summary.status, 'unknown');
  assert.throws(
    () => paletteCandidates({ system, lockedTokens: ['missing'] }),
    /Unknown candidate token/,
  );
});

test('emitted-equivalent colors are deduplicated and empty role sets remain explicit', () => {
  const result = paletteCandidates({
    system: { tokens: { ink: '#fff' } },
    maxAttempts: 64,
    limit: 24,
  });
  const values = result.candidates.map(
    (candidate) =>
      convertColor({ color: candidate.system.tokens.ink }).emitted.css,
  );
  assert.equal(new Set(values).size, values.length);
  assert.equal(result.candidates[0]!.id, 'original');
  assert.ok(
    result.candidates.every(
      (candidate) =>
        candidate.summary.status === 'not-applicable' &&
        candidate.objective.minimumContrastMargin === null,
    ),
  );
  assert.ok(result.duplicates > 0);
});

test('legacy representation respects role/source limits and rejects alpha or excessive expanded edges', () => {
  const sources = Array.from({ length: 16 }, (_, i) => `source:${i}`);
  const compatible = analyzePalette({
    system: { ...system, roles: [{ ...role('body', 'ink'), source: sources }] },
  });
  ColorSystemSchema.parse(compatible.compatibleSystem);
  const excessive = analyzePalette({
    system: {
      tokens: { ...system.tokens, surface: 'black' },
      roles: Array.from({ length: 128 }, (_, i) => ({
        ...role(`body-${i}`, 'ink'),
        adjacentBackgrounds: ['surface'],
      })),
    },
  });
  assert.equal(excessive.checks.length, 256);
  assert.equal(excessive.compatibleSystem, null);
  assert.equal(excessive.capabilities.legacyHexSystem, false);
  assert.equal(
    analyzePalette({
      system: {
        ...system,
        tokens: { ...system.tokens, accent: 'rgb(0 0 255 / .5)' },
      },
    }).compatibleSystem,
    null,
  );
});

test('invalid input is rejected before color facts or candidates are returned', () => {
  for (const color of [
    'currentColor',
    'var(--ink)',
    'not a color',
    'oklab(1e308 1e308 1e308)',
  ])
    assert.throws(() => convertColor({ color }));
  assert.throws(() => paletteRamp({ color: 'red', lightness: [1.1] }));
  assert.throws(() =>
    analyzePalette({
      system: { tokens: { canvas: 'white' }, roles: [role('body', 'missing')] },
    }),
  );
});
