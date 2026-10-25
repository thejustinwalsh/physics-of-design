#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { BlockSchema } from '../dist/state.js';
import {
  inspectTypography,
  inspectTypographyBrowser,
  probeTypographyAxes,
} from '../dist/typography-inspection.js';

// Build first: npm run build && node scripts/prove-typography.mjs
const fixture = BlockSchema.parse(
  JSON.parse(await readFile('examples/typography/variable-block.json', 'utf8')),
);
const engines = process.env.DESIGN_TYPOGRAPHY_ENGINES?.split(',') ?? [
  'chromium',
  'webkit',
];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const output = resolve(
  process.env.DESIGN_TYPOGRAPHY_OUTPUT ?? 'artifacts/typography',
);
await mkdir(output, { recursive: true });
const sourcePaths = [
  'src/typography-inspection.ts',
  'src/typography-browser.ts',
  'src/fonts.ts',
  'scripts/prove-typography.mjs',
  'examples/typography/variable-block.json',
];
const sourceHashes = async () =>
  Promise.all(
    sourcePaths.map(async (path) => ({
      path,
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    })),
  );
const receipt = {
  version: 1,
  generatedAt: new Date().toISOString(),
  node: process.version,
  fontkit: '2.0.4',
  playwright: '1.64.1',
  fixture,
  sources: await sourceHashes(),
  checks: [],
  engines: [],
};
const check = (engine, name, detail) => {
  receipt.checks.push({ engine, name, passed: true, detail });
};
const geometry = (report) => ({
  box: report.box,
  breaks: report.lineBreakSignature,
  ranges: report.lines.map((line) => line.rangeBounds),
  baselines: report.lines.map((line) => line.baseline),
});
function validate(report, requireEveryBaseline = false) {
  assert.equal(report.fontLoading.faceStatus, 'loaded');
  assert.equal(report.fontLoading.check, true);
  assert.equal(report.fontLoading.loadError, null);
  assert.equal(report.rasterPaintBounds, null);
  assert(report.lines.length > 0);
  if (requireEveryBaseline)
    assert(report.lines.every((line) => line.baseline !== null));
  for (const line of report.lines) {
    assert.equal(line.lineBox, null);
    if (line.baseline !== null) {
      assert(Number.isFinite(line.baseline));
      assert(
        line.attempts.some(
          (attempt) =>
            attempt.offset === line.probeOffset &&
            attempt.geometryUnchanged &&
            attempt.onThisLine,
        ),
      );
    }
  }
  assert(report.canvas.lines.every((line) => Number.isFinite(line.width)));
}
for (const engine of engines) {
  process.stdout.write(
    `${engine}: 13 axes × min/default/max plus requested state\n`,
  );
  const axes = await probeTypographyAxes(fixture, { engine, limit: 64 });
  assert.equal(axes.results.length, 40);
  assert.equal(axes.omittedCandidates, 0);
  assert.equal(Object.keys(axes.axes).length, 13);
  for (const row of axes.results) {
    assert.equal(row.renderer.fontLoading.faceStatus, 'loaded');
    assert(
      row.renderer.lines.some((line) => line.baseline !== null),
      `${row.id}: baseline unavailable`,
    );
  }
  for (const tag of ['wght', 'wdth', 'opsz']) {
    const min = axes.results.find((row) => row.id === `${tag}:min`);
    const max = axes.results.find((row) => row.id === `${tag}:max`);
    assert.notEqual(
      min.advance,
      max.advance,
      `${tag}: fontkit advance endpoints`,
    );
    assert.notDeepEqual(
      min.renderer.lines.map((line) => line.rangeBounds),
      max.renderer.lines.map((line) => line.rangeBounds),
      `${tag}: actual browser range endpoints`,
    );
  }
  assert(axes.results.some((row) => row.effect.rendererLineBreaksChanged));
  assert(axes.results.some((row) => row.effect.rendererHeightDelta !== 0));
  const lcMin = axes.results.find((row) => row.id === 'YTLC:min'),
    lcMax = axes.results.find((row) => row.id === 'YTLC:max');
  assert(lcMin.referenceGlyphs.x.height < lcMax.referenceGlyphs.x.height);
  check(engine, 'all 13 licensed variable-font axes sampled independently', {
    candidates: 40,
    fontHash: axes.fontHash,
    geometryChanges: axes.results.filter(
      (row) => row.effect.rendererGeometryChanged,
    ).length,
    breakChanges: axes.results.filter(
      (row) => row.effect.rendererLineBreaksChanged,
    ).length,
  });

  const base = await inspectTypographyBrowser(fixture, { engine });
  validate(base, true);
  for (const delta of base.baselineDeltas)
    assert(Math.abs(delta - fixture.size * fixture.leading) < 0.05);
  check(engine, 'per-line baselines have geometry-preserving DOM probes', {
    baselines: base.lines.map((line) => line.baseline),
    rejectedAttempts: base.lines
      .flatMap((line) => line.attempts)
      .filter((attempt) => !attempt.geometryUnchanged || !attempt.onThisLine)
      .length,
  });

  const single = {
    ...fixture,
    text: 'Agjp AV office',
    measure: 1200,
    leading: 1.2,
  };
  const compact = await inspectTypographyBrowser(single, { engine });
  const loose = await inspectTypographyBrowser(
    { ...single, leading: 2 },
    { engine },
  );
  validate(compact, true);
  validate(loose, true);
  const actualShift = loose.lines[0].baseline - compact.lines[0].baseline;
  assert(Math.abs(actualShift - (single.size * (2 - 1.2)) / 2) < 0.51);
  assert.equal(inspectTypography(single).metrics.baseline, null);
  check(
    engine,
    'line-height changes actual baseline while font ascent stays constant',
    {
      actualShift,
      expectedHalfLeadingShift: 12.8,
      halfLeadingRoundingTolerance: 0.51,
    },
  );

  const highWeight = await inspectTypographyBrowser(
    { ...single, weight: 900 },
    { engine },
  );
  const explicitWeight = await inspectTypographyBrowser(
    { ...single, weight: 100, font: { ...single.font, axes: { wght: 900 } } },
    { engine },
  );
  assert.deepEqual(geometry(highWeight), geometry(explicitWeight));
  const explicitOptical = {
    ...single,
    font: { ...single.font, axes: { opsz: 14 } },
  };
  const opticalOff = await inspectTypographyBrowser(explicitOptical, {
    engine,
  });
  const opticalAuto = await inspectTypographyBrowser(
    {
      ...explicitOptical,
      font: { ...explicitOptical.font, opticalSizing: 'auto' },
    },
    { engine },
  );
  assert.equal(
    opticalOff.computed.fontVariationSettings,
    opticalAuto.computed.fontVariationSettings,
  );
  assert.equal(opticalOff.computed.fontOpticalSizing, 'none');
  assert.equal(opticalAuto.computed.fontOpticalSizing, 'auto');
  const opticalGeometryEqual =
    JSON.stringify(geometry(opticalOff)) ===
    JSON.stringify(geometry(opticalAuto));
  check(
    engine,
    'CSS axis precedence is observed independently for weight and optical sizing',
    {
      weight: 900,
      explicitWeightGeometryEqual: true,
      opticalSize: 14,
      opticalGeometryEqual,
      opticalNoneWidth: opticalOff.lines[0].rangeBounds.width,
      opticalAutoWidth: opticalAuto.lines[0].rangeBounds.width,
      interpretation: opticalGeometryEqual
        ? 'No geometric difference at explicit opsz14 for this engine and text.'
        : 'Engine geometry differs when auto is enabled despite unchanged explicit opsz14; do not claim CSS/fontkit optical-axis parity.',
    },
  );

  const clipping = await inspectTypographyBrowser(
    { ...fixture, maxHeight: 40 },
    { engine },
  );
  assert(clipping.layoutOverflow.scrollOverflowY > 0);
  assert(clipping.layoutOverflow.rangeBeyondBottom > 0);
  assert.equal(clipping.layoutOverflow.overflowY, 'hidden');
  check(
    engine,
    'clipping reports scroll and Range evidence separately from paint',
    clipping.layoutOverflow,
  );

  const texts = [
    {
      name: 'combining marks and ligatures',
      block: {
        ...fixture,
        text: 'a\u0301 e\u0308 office affine A\u0308g',
        measure: 210,
      },
    },
    {
      name: 'Arabic RTL joining',
      block: {
        ...fixture,
        text: 'الطباعة العربية جميلة وواضحة وتحتاج إلى قياس دقيق',
        language: 'ar',
        direction: 'rtl',
        font: {
          ...fixture.font,
          file: 'assets/fonts/NotoSansArabic[wdth,wght].ttf',
          family: 'Noto Sans Arabic',
        },
      },
    },
    {
      name: 'mixed bidi with declared primary font gaps',
      block: {
        ...fixture,
        text: 'Hello مرحبا 123 typography العربية',
        measure: 260,
      },
    },
    {
      name: 'explicit empty line',
      block: { ...fixture, text: 'Alpha\n\nBeta\nGamma' },
    },
    {
      name: 'forced inside-word wrap',
      block: { ...fixture, text: 'antidisestablishmentarianism', measure: 90 },
    },
  ];
  const complex = [];
  for (const { name, block } of texts) {
    const report = await inspectTypographyBrowser(BlockSchema.parse(block), {
      engine,
    });
    validate(report);
    assert(
      report.lines.some((line) => line.baseline !== null),
      `${name}: all baselines unknown`,
    );
    complex.push({ name, report });
    check(engine, name, {
      groups: report.totalLines,
      baselines: report.lines.map((line) => line.baseline),
      missing: report.coverage.missing,
    });
  }
  const missing = await inspectTypographyBrowser(
    { ...fixture, text: 'A 🦄' },
    { engine },
  );
  assert(missing.coverage.missing.some((cp) => cp.codepoint === 'U+1F984'));
  assert.equal(missing.fontLoading.fallbackFaces, null);
  check(
    engine,
    'loaded primary font does not falsely certify fallback identity',
    {
      faceStatus: missing.fontLoading.faceStatus,
      missing: missing.coverage.missing,
      fallbackFaces: null,
    },
  );
  const ownership = [];
  for (const text of [
    'العربيةالعربيةالعربيةالعربية',
    'العَرَبِيَّة لَا مرحبًا بكم في العالم',
  ]) {
    const arabic = {
      ...fixture,
      text,
      language: 'ar',
      direction: 'rtl',
      font: {
        ...fixture.font,
        file: 'assets/fonts/NotoSansArabic[wdth,wght].ttf',
        family: 'Noto Sans Arabic',
      },
    };
    const reference = await inspectTypographyBrowser(
      BlockSchema.parse({ ...arabic, measure: 2000, leading: 1.5 }),
      { engine },
    );
    const tight = await inspectTypographyBrowser(
      BlockSchema.parse({ ...arabic, measure: 30, leading: 0.75 }),
      { engine },
    );
    validate(reference, true);
    validate(tight);
    const referenceOffset =
      reference.lines[0].baseline - reference.lines[0].rangeBounds.y;
    const acceptedOffsets = tight.lines
      .filter((line) => line.baseline !== null)
      .map((line) => line.baseline - line.rangeBounds.y);
    for (const offset of acceptedOffsets)
      assert(
        Math.abs(offset - referenceOffset) <= 1 / 64,
        'Overlapping Range boxes must not accept a previous-line baseline',
      );
    assert(
      tight.lines.some((line) => line.baseline === null),
      'Ambiguous joined glyph probes should remain unknown',
    );
    check(
      engine,
      'tight Arabic baseline ownership matches independently measured wide reference',
      {
        text,
        referenceOffset,
        acceptedOffsets,
        unavailable: tight.lines.filter((line) => line.baseline === null)
          .length,
      },
    );
    ownership.push({ text, reference, tight });
  }
  receipt.engines.push({
    engine,
    runtime: base.runtime,
    axes,
    base,
    compact,
    loose,
    highWeight,
    explicitWeight,
    opticalOff,
    opticalAuto,
    clipping,
    complex,
    missing,
    ownership,
  });
  await writeFile(
    `${output}/${engine}.json`,
    JSON.stringify(receipt.engines.at(-1), null, 2),
  );
  process.stdout.write(
    `${engine}: passed ${receipt.checks.filter((check) => check.engine === engine).length} checks\n`,
  );
}
assert.deepEqual(
  await sourceHashes(),
  receipt.sources,
  'Source files changed during typography proof; rerun against one source snapshot',
);
await writeFile(`${output}/proof.json`, JSON.stringify(receipt, null, 2));
await writeFile(
  `${output}/summary.json`,
  JSON.stringify(
    {
      version: 1,
      generatedAt: receipt.generatedAt,
      runtimes: receipt.engines.map((e) => e.runtime),
      sources: receipt.sources,
      checks: receipt.checks,
      limits: [
        'No raster paint bounds or native-baseline extraction.',
        'Single-font uniform horizontal runs; fallback and mixed-font physical line counts remain uncertain.',
        'Endpoint samples are independent, not coverage of every combination or intermediate axis value.',
      ],
    },
    null,
    2,
  ),
);
process.stdout.write(
  `Typography proof: ${receipt.checks.length} passed; evidence ${output}/summary.json\n`,
);
